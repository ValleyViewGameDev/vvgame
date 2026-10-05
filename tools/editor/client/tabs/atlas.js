/**
 * Atlas tab: a minimap of one frontier (parity with game-editor/src/AtlasView.jsx). Every grid
 * is drawn at 2 px per tile: created grids from the live game (GET /api/load-grid/:gridId,
 * ten at a time), and valleyFixedCoord layout files for the grids the database does not have
 * yet (red outline). Drag to pan, wheel to zoom around the cursor, optional resource dots.
 * Click a grid to pick it and jump to it in World or Layouts. Reads only; nothing here writes.
 * Route: #atlas[/<frontierId>]
 */
import { el, clear } from '../core/dom.js';
import { game, local } from '../core/api.js';
import { loadResources } from '../core/resources.js';
import { modal, toast, setStatus } from '../core/ui.js';
import { loadWorld, gridMapOf, coordParts, coordFrom, frontierPrefix, isValleyType, BOARD, GRIDS_PER_SETTLEMENT } from '../core/world.js';
import { tileColors, LAYOUT_KEY_TO_TILE_TYPE } from '/game-client/tileColors.js';

const TILES = 64, PX_PER_TILE = 2, GRID_PX = TILES * PX_PER_TILE, WORLD_PX = BOARD * GRID_PX; // 128 px per grid, 8192 px per frontier
const BATCH = 10;

const A = {
  ctx: null, els: {}, active: false, ro: null,
  world: null, frontierId: null, frontier: null, gridMap: new Map(), prefix: null, res: null, layoutCoords: new Set(),
  grids: new Map(), loadedFor: null,  // gridCoord -> { gridCoord, gridType, gridId, tiles, resources, fromDatabase, fromTemplate, image }
  loading: null,                      // { done, total, phase, cancelled, errors[] }
  pan: { x: 0, y: 0 }, zoom: 1, drag: null, hover: null, picked: null,
  show: { resources: false, outlines: true, bounds: true },
  loadError: null,
};

// ----------------------------------------------------------------------------- data
async function loadBase(force = false) {
  A.loadError = null;
  try {
    const [world, layouts, res] = await Promise.all([loadWorld(force), local.layouts(), loadResources()]);
    A.world = world; A.res = res;
    A.layoutCoords = new Set((layouts.dirs.valleyFixedCoord || []).map(Number).filter(Boolean));
  } catch (err) { A.loadError = err; A.world = A.world || { frontiers: [], settlements: [] }; }
  if (!A.frontierId || !A.world.frontiers.some((f) => String(f._id) === A.frontierId)) A.frontierId = A.world.frontiers[0] ? String(A.world.frontiers[0]._id) : null;
  A.frontier = A.world.frontiers.find((f) => String(f._id) === A.frontierId) || null;
  A.gridMap = gridMapOf(A.world, A.frontierId);
  A.prefix = frontierPrefix(A.gridMap);
}

function tileColor(key, fromDatabase) {
  if (!key || key === '**') return null;
  if (fromDatabase || key.length === 1) return tileColors[key] || null;
  const t = A.res?.byLayoutKey.get(key);
  const letter = (t && t.category === 'tile') ? t.type : LAYOUT_KEY_TO_TILE_TYPE[key];
  return letter ? tileColors[letter] || null : null;
}

/** Pre-render one grid into a 128x128 offscreen canvas so draw() is a drawImage per grid. */
function rasterize(entry) {
  const c = document.createElement('canvas'); c.width = c.height = GRID_PX;
  const x = c.getContext('2d');
  (entry.tiles || []).forEach((row, ty) => { if (!Array.isArray(row)) return; row.forEach((key, tx) => { const col = tileColor(key, entry.fromDatabase); if (col) { x.fillStyle = col; x.fillRect(tx * PX_PER_TILE, ty * PX_PER_TILE, PX_PER_TILE, PX_PER_TILE); } }); });
  if (A.show.resources && Array.isArray(entry.resources)) {
    x.fillStyle = '#ffffff';
    const dot = (tx, ty) => x.fillRect(tx * PX_PER_TILE + PX_PER_TILE * 0.25, ty * PX_PER_TILE + PX_PER_TILE * 0.25, PX_PER_TILE * 0.5, PX_PER_TILE * 0.5);
    if (entry.resources.length && entry.resources[0] && entry.resources[0].x !== undefined) entry.resources.forEach((r) => dot(r.x, r.y)); // database: [{type, x, y}]
    else entry.resources.forEach((row, ty) => { if (Array.isArray(row)) row.forEach((key, tx) => { if (key && key !== '**') dot(tx, ty); }); }); // layout file: 64x64 keys
  }
  entry.image = c;
  return entry;
}
function rerasterizeAll() { for (const e of A.grids.values()) rasterize(e); draw(); }

async function loadGrids(force = false) {
  if (!A.frontierId || !A.res) return;
  if (A.loading) A.loading.cancelled = true;
  if (!force && A.loadedFor === A.frontierId && A.grids.size) return;
  const withId = [...A.gridMap.values()].filter((g) => g.gridId);
  const templates = A.prefix ? [...A.layoutCoords].filter((c) => coordParts(c)?.prefix === A.prefix && !withId.some((g) => g.gridCoord === c)) : [];
  const me = { done: 0, total: withId.length + templates.length, phase: 'database', cancelled: false, errors: [] };
  A.loading = me; A.grids = new Map(); A.loadedFor = A.frontierId; A.picked = null;
  renderPanel(); draw();
  const tick = () => { me.done++; if (A.els.progress) A.els.progress.textContent = progressText(me); };
  for (let i = 0; i < withId.length && !me.cancelled; i += BATCH) {
    await Promise.all(withId.slice(i, i + BATCH).map(async (g) => {
      try {
        const data = await game.get(`/api/load-grid/${g.gridId}`);
        if (data?.tiles) A.grids.set(g.gridCoord, rasterize({ gridCoord: g.gridCoord, gridType: g.gridType, gridId: g.gridId, tiles: data.tiles, resources: data.resources || [], fromDatabase: true, fromTemplate: false }));
        else me.errors.push(`${g.gridCoord}: no tiles in response`);
      } catch (err) { me.errors.push(`${g.gridCoord} (${g.gridId}): ${err.message}`); }
      tick();
    }));
    draw();
  }
  me.phase = 'layout files';
  for (let i = 0; i < templates.length && !me.cancelled; i += BATCH * 2) {
    await Promise.all(templates.slice(i, i + BATCH * 2).map(async (coord) => {
      try {
        const layout = await local.layout('valleyFixedCoord', String(coord));
        A.grids.set(coord, rasterize({ gridCoord: coord, gridType: A.gridMap.get(coord)?.gridType || 'valley', gridId: null, tiles: layout.tiles, resources: layout.resources || [], fromDatabase: false, fromTemplate: true }));
      } catch (err) { me.errors.push(`${coord}.json: ${err.message}`); }
      tick();
    }));
    draw();
  }
  if (A.loading === me) A.loading = null;
  if (me.cancelled) toast('Atlas load cancelled', 'warn');
  else if (me.errors.length) toast(`Atlas loaded with ${me.errors.length} errors (see panel)`, 'warn');
  else setStatus(`Atlas: ${A.grids.size} grids loaded`);
  A.lastErrors = me.errors;
  renderPanel(); draw();
}
const progressText = (l) => `${l.done} / ${l.total} (${l.phase})`;

// ----------------------------------------------------------------------------- view
function fit() {
  const wrap = A.els.wrap; if (!wrap) return;
  A.zoom = Math.max(0.05, Math.min(wrap.clientWidth, wrap.clientHeight) / WORLD_PX);
  A.pan = { x: (wrap.clientWidth - WORLD_PX * A.zoom) / 2, y: (wrap.clientHeight - WORLD_PX * A.zoom) / 2 };
  draw(); renderZoom();
}
function resetView() { A.zoom = 1; A.pan = { x: 0, y: 0 }; draw(); renderZoom(); }
function renderZoom() { if (A.els.zoomInfo) A.els.zoomInfo.textContent = `${Math.round(A.zoom * 100)}%`; }

function worldAt(e) {
  const rect = A.els.canvas.getBoundingClientRect();
  return { x: (e.clientX - rect.left - A.pan.x) / A.zoom, y: (e.clientY - rect.top - A.pan.y) / A.zoom };
}
function gridAt(e) {
  const w = worldAt(e);
  const col = Math.floor(w.x / GRID_PX), row = Math.floor(w.y / GRID_PX);
  if (row < 0 || col < 0 || row >= BOARD || col >= BOARD || !A.prefix) return null;
  const coord = coordFrom(A.prefix, row, col);
  return { row, col, coord, cell: A.gridMap.get(coord) || null, entry: A.grids.get(coord) || null };
}

function bindCanvas(cv) {
  cv.addEventListener('mousedown', (e) => { A.drag = { x: e.clientX - A.pan.x, y: e.clientY - A.pan.y, moved: false }; cv.style.cursor = 'grabbing'; });
  cv.addEventListener('mousemove', (e) => {
    if (A.drag) {
      const nx = e.clientX - A.drag.x, ny = e.clientY - A.drag.y;
      if (Math.abs(nx - A.pan.x) + Math.abs(ny - A.pan.y) > 0) A.drag.moved = true;
      A.pan = { x: nx, y: ny }; draw(); return;
    }
    const g = gridAt(e);
    const key = g ? g.coord : null;
    if (key !== (A.hover?.coord ?? null)) { A.hover = g; renderHover(); draw(); }
  });
  const end = (e) => {
    if (A.drag && !A.drag.moved && e) { A.picked = gridAt(e); renderPanel(); draw(); }
    A.drag = null; cv.style.cursor = 'grab';
  };
  cv.addEventListener('mouseup', end);
  cv.addEventListener('mouseleave', () => { end(null); A.hover = null; renderHover(); draw(); });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = cv.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const next = Math.max(0.05, Math.min(8, A.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
    A.pan = { x: cx - (cx - A.pan.x) * (next / A.zoom), y: cy - (cy - A.pan.y) * (next / A.zoom) };
    A.zoom = next; draw(); renderZoom();
  }, { passive: false });
}

function draw() {
  const cv = A.els.canvas, wrap = A.els.wrap; if (!cv || !wrap) return;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, wrap.clientWidth), h = Math.max(1, wrap.clientHeight);
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = `${w}px`; cv.style.height = `${h}px`; }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
  ctx.setTransform(dpr * A.zoom, 0, 0, dpr * A.zoom, dpr * A.pan.x, dpr * A.pan.y);
  ctx.imageSmoothingEnabled = false;
  // frontier footprint
  ctx.fillStyle = '#f4f5f1'; ctx.fillRect(0, 0, WORLD_PX, WORLD_PX);
  for (const e of A.grids.values()) {
    const p = coordParts(e.gridCoord); if (!p || !e.image) continue;
    ctx.drawImage(e.image, p.col * GRID_PX, p.row * GRID_PX);
    if (e.fromTemplate && A.show.outlines) { ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)'; ctx.lineWidth = 2 / A.zoom; ctx.strokeRect(p.col * GRID_PX, p.row * GRID_PX, GRID_PX, GRID_PX); }
  }
  if (A.show.bounds) {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'; ctx.lineWidth = 1.5 / A.zoom; ctx.beginPath();
    for (let i = 0; i <= BOARD; i += GRIDS_PER_SETTLEMENT) { ctx.moveTo(i * GRID_PX, 0); ctx.lineTo(i * GRID_PX, WORLD_PX); ctx.moveTo(0, i * GRID_PX); ctx.lineTo(WORLD_PX, i * GRID_PX); }
    ctx.stroke();
  }
  const outline = (g, color) => { if (!g) return; ctx.strokeStyle = color; ctx.lineWidth = 3 / A.zoom; ctx.strokeRect(g.col * GRID_PX, g.row * GRID_PX, GRID_PX, GRID_PX); };
  outline(A.hover, '#3f8a2f');
  outline(A.picked, '#c0392b');
}

// ----------------------------------------------------------------------------- panels
function renderHover() {
  if (!A.els.hoverInfo) return;
  const g = A.hover;
  A.els.hoverInfo.textContent = g ? `${g.coord}${g.cell ? ` ${g.cell.gridType} · ${g.cell.settlementName}` : ''}${g.entry ? (g.entry.fromDatabase ? ' · db' : ' · layout file') : ''}` : '';
}

function renderPanel() {
  const s = clear(A.els.selection);
  s.appendChild(el('h2', {}, 'Atlas'));
  const frontiers = A.world?.frontiers || [];
  s.appendChild(el('div', { class: 'row' }, [el('select', { style: { flex: 1 }, onchange: (e) => A.ctx.navigate(`atlas/${e.target.value}`) },
    frontiers.length ? frontiers.map((f) => el('option', { value: String(f._id), selected: String(f._id) === A.frontierId }, `${f.name}${f.tier != null ? ` (tier ${f.tier})` : ''}`)) : [el('option', { value: '' }, 'no frontiers')])]));

  s.appendChild(el('h3', {}, 'View'));
  A.els.zoomInfo = el('span', { class: 'mono' }, '');
  s.appendChild(el('div', { class: 'row' }, ['Zoom ', A.els.zoomInfo]));
  renderZoom();
  const db = [...A.grids.values()].filter((e) => e.fromDatabase).length, tpl = A.grids.size - db;
  s.appendChild(el('div', { class: 'note mono' }, `Loaded ${A.grids.size} grids (${db} database, ${tpl} layout files) of ${A.gridMap.size} in the frontier`));
  if (A.loading) {
    A.els.progress = el('div', { class: 'badge warn' }, progressText(A.loading));
    s.appendChild(el('div', { class: 'row' }, [A.els.progress, el('button', { onclick: () => { A.loading.cancelled = true; } }, 'Cancel')]));
  } else {
    A.els.progress = null;
    s.appendChild(el('div', { class: 'row' }, [
      el('button', { onclick: () => loadGrids(true), title: 'Re-fetch every grid of this frontier from the game server' }, '🔄 Reload grids'),
      A.lastErrors?.length ? el('button', { onclick: () => modal({ title: `Atlas load errors (${A.lastErrors.length})`, body: el('pre', { class: 'mono', style: { whiteSpace: 'pre-wrap' } }, A.lastErrors.join('\n')) }) }, `${A.lastErrors.length} errors`) : null,
    ]));
  }
  const check = (key, label, onchange) => el('label', { class: 'row', style: { cursor: 'pointer' } }, [el('input', { type: 'checkbox', checked: A.show[key], onchange: (e) => { A.show[key] = e.target.checked; onchange(); } }), label]);
  s.append(
    check('resources', 'Show resources (white dots)', rerasterizeAll),
    check('outlines', 'Outline layout-file grids (red)', draw),
    check('bounds', 'Show settlement bounds', draw),
    el('div', { class: 'row', style: { marginTop: '6px' } }, [el('button', { onclick: fit }, 'Fit'), el('button', { onclick: resetView }, '100%')]),
  );

  s.appendChild(el('h3', {}, 'Controls'));
  s.appendChild(el('div', { class: 'note' }, 'Drag to pan. Scroll to zoom around the cursor. Click a grid to pick it. Red outline = layout file only (not yet in the database).'));

  s.appendChild(el('h3', {}, 'Picked grid'));
  const p = A.picked;
  if (!p) { s.appendChild(el('div', { class: 'note' }, 'Click a grid on the map.')); return; }
  const cell = p.cell;
  s.appendChild(el('div', { class: 'mono' }, String(p.coord)));
  s.appendChild(el('div', { class: 'note' }, cell ? `${cell.gridType} · ${cell.settlementName}${cell.gridId ? ' · in database' : ''}${cell.region ? ` · region ${cell.region}` : ''}` : 'Not a grid of this frontier.'));
  s.appendChild(el('div', { class: 'note' }, p.entry ? (p.entry.fromDatabase ? 'Drawn from the live game.' : 'Drawn from its valleyFixedCoord layout file.') : 'Nothing loaded for this grid.'));
  s.appendChild(el('div', { class: 'row' }, [
    cell ? el('button', { onclick: () => A.ctx.navigate(`world/${A.frontierId}/${p.coord}`) }, 'Open in World') : null,
    cell && isValleyType(cell.gridType) && A.layoutCoords.has(p.coord) ? el('button', { onclick: () => A.ctx.navigate(`layouts/valleyFixedCoord/${p.coord}?type=${encodeURIComponent(cell.gridType)}`) }, 'Open layout') : null,
  ]));
}

function renderEditor() {
  const root = clear(A.els.editor);
  if (A.loadError) {
    const b = A.loadError.body;
    root.appendChild(el('div', { class: 'stub' }, [el('p', {}, `Could not load the world from the game server: ${A.loadError.message}`), b?.maintenance ? el('p', {}, `The game server is in maintenance mode${b.message ? `: ${b.message}` : ''}.`) : null, el('button', { onclick: async () => { await loadBase(true); renderPanel(); renderEditor(); loadGrids(); } }, 'Retry')]));
    return;
  }
  if (!A.frontierId) { root.appendChild(el('div', { class: 'stub' }, 'The game server returned no frontiers.')); return; }
  A.els.hoverInfo = el('span', { class: 'muted mono' }, '');
  const tb = el('div', { class: 'toolbar' }, [
    el('strong', {}, A.frontier?.name || A.frontierId), el('span', { class: 'badge' }, `prefix ${A.prefix || '?'} · ${A.gridMap.size} grids · 2 px per tile`),
    el('span', { class: 'spacer' }), A.els.hoverInfo,
    el('button', { onclick: fit }, 'Fit'), el('button', { onclick: resetView }, '100%'),
  ]);
  A.els.wrap = el('div', { class: 'atlas-wrap' });
  A.els.canvas = el('canvas', { class: 'atlas-canvas' });
  A.els.wrap.appendChild(A.els.canvas);
  root.append(tb, A.els.wrap);
  bindCanvas(A.els.canvas);
  A.ro?.disconnect();
  A.ro = new ResizeObserver(() => draw());
  A.ro.observe(A.els.wrap);
  draw();
}

// ----------------------------------------------------------------------------- tab
export function atlasTab() {
  return {
    id: 'atlas', label: 'Atlas', icon: '🧭', group: 'world',
    async mount(selectionEl, editorEl, ctx, route) {
      A.ctx = ctx; A.els.selection = selectionEl; A.els.editor = editorEl; A.active = true;
      const [, rawFrontier] = route.split('/');
      const frontierId = rawFrontier ? decodeURIComponent(rawFrontier.split('?')[0]) : null;
      const switching = frontierId && frontierId !== A.frontierId;
      if (switching) A.frontierId = frontierId;
      const firstLoad = !A.world;
      if (firstLoad) {
        clear(selectionEl).appendChild(el('h2', {}, 'Atlas'));
        clear(editorEl).appendChild(el('div', { class: 'stub' }, 'Loading frontiers and settlements from the game server…'));
      }
      await loadBase(false);
      renderPanel();
      renderEditor();
      if (firstLoad || switching || !A.grids.size) fit();
      setStatus(A.frontier ? `Atlas: ${A.frontier.name}` : '');
      loadGrids(); // reads only; cached per frontier, so a tab switch does not refetch
    },
    unmount() { A.active = false; A.drag = null; A.hover = null; A.ro?.disconnect(); A.ro = null; },
  };
}
