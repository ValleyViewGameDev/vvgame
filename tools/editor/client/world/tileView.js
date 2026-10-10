/**
 * World tab, "Tile view": the whole frontier drawn tile by tile (2 px per tile) from the
 * TEMPLATE layouts on disk, so the geographies can be checked for continuity without reading
 * any player's copy of a grid. Nothing here touches the game server: valley grids come from
 * layouts/gridLayouts/valleyFixedCoord/<coord>.json (grids without a file are random at
 * creation and drawn hatched), towns from town/town<POS>.json and homesteads from
 * homestead/homestead.json. Drag to pan, wheel to zoom around the cursor, click to pick.
 * Regions as in the Grid view: shift+click toggles a grid in the selection, shift+drag selects a
 * rectangle, and the panel sets the region of the picked grid or of every selected grid (live
 * writes through world.js saveRegion / bulkSaveRegion, each behind its confirm).
 *
 * Used by tabs/world.js; it owns no route of its own.
 */
import { el, clear } from '../core/dom.js';
import { local } from '../core/api.js';
import { modal, toast, setStatus } from '../core/ui.js';
import { coordParts, coordFrom, isValleyType, townLayoutName, BOARD, GRIDS_PER_SETTLEMENT } from '../core/world.js';
import { tileColors, LAYOUT_KEY_TO_TILE_TYPE } from '/game-client/tileColors.js';

const TILES = 64, PX_PER_TILE = 2, GRID_PX = TILES * PX_PER_TILE, WORLD_PX = BOARD * GRID_PX; // 128 px per grid, 8192 px per frontier
const BATCH = 16;

const T = {
  shared: null, els: {}, ro: null,
  files: new Map(),      // "dir/name" -> { tiles, resources } (towns and homesteads are shared by many cells)
  grids: new Map(),      // gridCoord -> { gridCoord, gridType, source, image }
  loadedFor: null, loading: null, lastErrors: [],
  pan: { x: 0, y: 0 }, zoom: 1, drag: null, hover: null, picked: null,
  sel: [],               // gridCoords in the multi-selection (picked is the last one clicked)
  rect: null,            // shift+drag: { start, end } grid positions
  regionPick: '',        // region dropdown value (single + bulk)
  show: { resources: false, random: true, bounds: true, regions: true },
};

// ----------------------------------------------------------------------------- data
/** Which template file draws a cell, or null for a random valley grid. */
function sourceFor(cell) {
  const S = T.shared;
  if (isValleyType(cell.gridType)) return S.layoutCoords.has(cell.gridCoord) ? { dir: 'valleyFixedCoord', name: String(cell.gridCoord) } : null;
  if (cell.gridType === 'town') { const name = townLayoutName(S.frontier, cell.settlementId); return name ? { dir: 'town', name } : null; }
  if (cell.gridType === 'homestead') return { dir: 'homestead', name: 'homestead' };
  return null;
}

function tileColor(key) {
  if (!key || key === '**') return null;
  if (key.length === 1) return tileColors[key] || null;
  const t = T.shared.res?.byLayoutKey.get(key);
  const letter = (t && t.category === 'tile') ? t.type : LAYOUT_KEY_TO_TILE_TYPE[key];
  return letter ? tileColors[letter] || null : null;
}

/** Pre-render one layout into a 128x128 canvas so draw() is a drawImage per grid. */
function rasterize(layout) {
  const c = document.createElement('canvas'); c.width = c.height = GRID_PX;
  const x = c.getContext('2d');
  (layout.tiles || []).forEach((row, ty) => { if (!Array.isArray(row)) return; row.forEach((key, tx) => { const col = tileColor(key); if (col) { x.fillStyle = col; x.fillRect(tx * PX_PER_TILE, ty * PX_PER_TILE, PX_PER_TILE, PX_PER_TILE); } }); });
  if (T.show.resources && Array.isArray(layout.resources)) {
    x.fillStyle = '#ffffff';
    layout.resources.forEach((row, ty) => { if (Array.isArray(row)) row.forEach((key, tx) => { if (key && key !== '**') x.fillRect(tx * PX_PER_TILE + 0.5, ty * PX_PER_TILE + 0.5, 1, 1); }); });
  }
  return c;
}
function rerasterizeAll() {
  const images = new Map();
  for (const e of T.grids.values()) { const k = `${e.source.dir}/${e.source.name}`; if (!images.has(k)) images.set(k, rasterize(T.files.get(k))); e.image = images.get(k); }
  draw();
}

async function loadTemplates(force = false) {
  const S = T.shared;
  if (!S.frontierId) return;
  if (T.loading) T.loading.cancelled = true;
  if (!force && T.loadedFor === S.frontierId && T.grids.size) return;
  const cells = [...S.gridMap.values()];
  const wanted = new Map(); // "dir/name" -> source
  for (const c of cells) { const src = sourceFor(c); if (src) wanted.set(`${src.dir}/${src.name}`, src); }
  const me = { done: 0, total: wanted.size, cancelled: false, errors: [] };
  T.loading = me; T.grids = new Map(); T.loadedFor = S.frontierId; T.picked = null;
  if (force) T.files = new Map();
  renderPanel(); draw();
  const keys = [...wanted.keys()].filter((k) => !T.files.has(k));
  me.total = keys.length;
  for (let i = 0; i < keys.length && !me.cancelled; i += BATCH) {
    await Promise.all(keys.slice(i, i + BATCH).map(async (k) => {
      const src = wanted.get(k);
      try { T.files.set(k, await local.layout(src.dir, src.name)); }
      catch (err) { me.errors.push(`${k}.json: ${err.message}`); }
      me.done++;
      if (T.els.progress) T.els.progress.textContent = `${me.done} / ${me.total} files`;
    }));
    placeAll(cells);
    draw();
  }
  placeAll(cells);
  if (T.loading === me) T.loading = null;
  T.lastErrors = me.errors;
  if (me.cancelled) toast('Tile view load cancelled', 'warn');
  else if (me.errors.length) toast(`Tile view loaded with ${me.errors.length} missing files`, 'warn');
  else setStatus(`Tile view: ${T.grids.size} grids from ${T.files.size} template files`);
  renderPanel(); draw();
}

/** Map every cell to its rasterised template (one image per file). */
function placeAll(cells) {
  const images = new Map();
  for (const c of cells) {
    const src = sourceFor(c); if (!src) continue;
    const k = `${src.dir}/${src.name}`;
    const layout = T.files.get(k); if (!layout) continue;
    if (!images.has(k)) images.set(k, T.grids.get(c.gridCoord)?.image && T.grids.get(c.gridCoord)?.source?.dir === src.dir ? T.grids.get(c.gridCoord).image : rasterize(layout));
    T.grids.set(c.gridCoord, { gridCoord: c.gridCoord, gridType: c.gridType, source: src, image: images.get(k) });
  }
}

// ----------------------------------------------------------------------------- view
function fit() {
  const wrap = T.els.wrap; if (!wrap) return;
  T.zoom = Math.max(0.05, Math.min(wrap.clientWidth, wrap.clientHeight) / WORLD_PX);
  T.pan = { x: (wrap.clientWidth - WORLD_PX * T.zoom) / 2, y: (wrap.clientHeight - WORLD_PX * T.zoom) / 2 };
  draw(); renderZoom();
}
function resetView() { T.zoom = 1; T.pan = { x: 0, y: 0 }; draw(); renderZoom(); }
function renderZoom() { if (T.els.zoomInfo) T.els.zoomInfo.textContent = `${Math.round(T.zoom * 100)}%`; }

function gridAt(e) {
  const rect = T.els.canvas.getBoundingClientRect();
  const wx = (e.clientX - rect.left - T.pan.x) / T.zoom, wy = (e.clientY - rect.top - T.pan.y) / T.zoom;
  const col = Math.floor(wx / GRID_PX), row = Math.floor(wy / GRID_PX);
  if (row < 0 || col < 0 || row >= BOARD || col >= BOARD || !T.shared.prefix) return null;
  const coord = coordFrom(T.shared.prefix, row, col);
  return { row, col, coord, cell: T.shared.gridMap.get(coord) || null, entry: T.grids.get(coord) || null };
}

// ----------------------------------------------------------------------------- selection (regions)
const cellOf = (coord) => T.shared.gridMap.get(Number(coord)) || null;
const selectedCells = () => T.sel.map(cellOf).filter(Boolean);
function syncRegionPick() { if (T.sel.length <= 1) T.regionPick = (T.picked && cellOf(T.picked.coord)?.region) || ''; }
const pickOf = (coord) => { const p = coordParts(coord); return p ? { row: p.row, col: p.col, coord, cell: cellOf(coord), entry: T.grids.get(coord) || null } : null; };
function toggle(g) {
  if (!g.cell) return;
  const removing = T.sel.includes(g.coord);
  T.sel = removing ? T.sel.filter((c) => c !== g.coord) : [...T.sel, g.coord];
  // picked follows the selection: a grid toggled off is no longer the one the panel shows
  T.picked = removing ? (T.sel.length ? pickOf(T.sel[T.sel.length - 1]) : null) : g;
  syncRegionPick();
}
function selectRect(a, b) {
  const out = [];
  for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r++) for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c++) {
    const coord = coordFrom(T.shared.prefix, r, c); if (cellOf(coord)) out.push(coord);
  }
  T.sel = out; T.picked = b; syncRegionPick();
}
function clearSelection() { T.sel = []; T.picked = null; T.regionPick = ''; renderPanel(); draw(); }

function bindCanvas(cv) {
  cv.addEventListener('mousedown', (e) => {
    if (e.shiftKey) { const g = gridAt(e); if (g) T.rect = { start: g, end: g }; return; }
    T.drag = { x: e.clientX - T.pan.x, y: e.clientY - T.pan.y, moved: false }; cv.style.cursor = 'grabbing';
  });
  cv.addEventListener('mousemove', (e) => {
    if (T.rect) { const g = gridAt(e); if (g && (g.row !== T.rect.end.row || g.col !== T.rect.end.col)) { T.rect.end = g; draw(); } }
    if (T.drag) {
      const nx = e.clientX - T.drag.x, ny = e.clientY - T.drag.y;
      if (nx !== T.pan.x || ny !== T.pan.y) T.drag.moved = true;
      T.pan = { x: nx, y: ny }; draw(); return;
    }
    const g = gridAt(e);
    if ((g?.coord ?? null) !== (T.hover?.coord ?? null)) { T.hover = g; renderHover(); draw(); }
  });
  const end = (e) => {
    if (T.rect) {
      const { start, end: last } = T.rect; T.rect = null;
      if (start.row === last.row && start.col === last.col) toggle(start);   // shift+click
      else selectRect(start, last);
      renderPanel(); draw();
    }
    if (T.drag && !T.drag.moved && e) { const g = gridAt(e); T.picked = g; T.sel = g?.cell ? [g.coord] : []; syncRegionPick(); renderPanel(); draw(); }
    T.drag = null; cv.style.cursor = 'grab';
  };
  cv.addEventListener('mouseup', end);
  cv.addEventListener('mouseleave', () => { end(null); T.hover = null; renderHover(); draw(); });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = cv.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const next = Math.max(0.05, Math.min(8, T.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
    T.pan = { x: cx - (cx - T.pan.x) * (next / T.zoom), y: cy - (cy - T.pan.y) * (next / T.zoom) };
    T.zoom = next; draw(); renderZoom();
  }, { passive: false });
}

function draw() {
  const cv = T.els.canvas, wrap = T.els.wrap; if (!cv || !wrap) return;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, wrap.clientWidth), h = Math.max(1, wrap.clientHeight);
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = `${w}px`; cv.style.height = `${h}px`; }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
  ctx.setTransform(dpr * T.zoom, 0, 0, dpr * T.zoom, dpr * T.pan.x, dpr * T.pan.y);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#f4f5f1'; ctx.fillRect(0, 0, WORLD_PX, WORLD_PX);
  for (const e of T.grids.values()) {
    const p = coordParts(e.gridCoord); if (!p || !e.image) continue;
    ctx.drawImage(e.image, p.col * GRID_PX, p.row * GRID_PX);
  }
  if (T.show.random) {
    // valley grids with no layout file: generated at creation, so nothing to draw; hatch them
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1 / T.zoom;
    for (const c of T.shared.gridMap.values()) {
      if (!isValleyType(c.gridType) || T.grids.has(c.gridCoord)) continue;
      const p = coordParts(c.gridCoord); if (!p) continue;
      const x = p.col * GRID_PX, y = p.row * GRID_PX;
      ctx.beginPath(); ctx.moveTo(x, y + GRID_PX); ctx.lineTo(x + GRID_PX, y); ctx.moveTo(x, y); ctx.lineTo(x + GRID_PX, y + GRID_PX); ctx.stroke();
      ctx.strokeRect(x, y, GRID_PX, GRID_PX);
    }
  }
  if (T.show.bounds) {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'; ctx.lineWidth = 1.5 / T.zoom; ctx.beginPath();
    for (let i = 0; i <= BOARD; i += GRIDS_PER_SETTLEMENT) { ctx.moveTo(i * GRID_PX, 0); ctx.lineTo(i * GRID_PX, WORLD_PX); ctx.moveTo(0, i * GRID_PX); ctx.lineTo(WORLD_PX, i * GRID_PX); }
    ctx.stroke();
  }
  if (T.show.regions) {
    ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
    for (const c of T.shared.gridMap.values()) { if (!c.region) continue; const p = coordParts(c.gridCoord); if (p) ctx.fillRect(p.col * GRID_PX, p.row * GRID_PX, GRID_PX, GRID_PX); }
  }
  const outline = (g, color, w = 3) => { if (!g) return; ctx.strokeStyle = color; ctx.lineWidth = w / T.zoom; ctx.strokeRect(g.col * GRID_PX, g.row * GRID_PX, GRID_PX, GRID_PX); };
  outline(T.hover, '#3f8a2f');
  for (const coord of T.sel) { const p = coordParts(coord); if (p) outline(p, '#c0392b', 2); }
  outline(T.picked, '#c0392b');
  if (T.rect) {
    const { start: a, end: b } = T.rect;
    ctx.fillStyle = 'rgba(192, 57, 43, 0.15)'; ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2 / T.zoom;
    const x = Math.min(a.col, b.col) * GRID_PX, y = Math.min(a.row, b.row) * GRID_PX, w = (Math.abs(a.col - b.col) + 1) * GRID_PX, h = (Math.abs(a.row - b.row) + 1) * GRID_PX;
    ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
  }
}

// ----------------------------------------------------------------------------- panels
function renderHover() {
  if (!T.els.hoverInfo) return;
  const g = T.hover;
  T.els.hoverInfo.textContent = g ? `${g.coord}${g.cell ? ` ${g.cell.gridType} · ${g.cell.settlementName}` : ''}${g.entry ? ` · ${g.entry.source.dir}/${g.entry.source.name}` : (g.cell && isValleyType(g.cell.gridType) ? ' · random' : '')}` : '';
}

/** The tile-view part of the selection panel (below the frontier picker that world.js draws). */
function renderPanel() {
  const s = T.els.panel; if (!s) return;
  clear(s);
  s.appendChild(el('h3', {}, 'Tile view'));
  T.els.zoomInfo = el('span', { class: 'mono' }, '');
  s.appendChild(el('div', { class: 'row' }, ['Zoom ', T.els.zoomInfo, el('span', { class: 'spacer' }), el('button', { onclick: fit }, 'Fit'), el('button', { onclick: resetView }, '100%')]));
  renderZoom();
  const S = T.shared;
  const randomCount = [...S.gridMap.values()].filter((c) => isValleyType(c.gridType) && !S.layoutCoords.has(c.gridCoord)).length;
  s.appendChild(el('div', { class: 'note mono' }, `${T.grids.size} grids drawn from ${T.files.size} template files · ${randomCount} valley grids random (no file)`));
  if (T.loading) {
    T.els.progress = el('div', { class: 'badge warn' }, `${T.loading.done} / ${T.loading.total} files`);
    s.appendChild(el('div', { class: 'row' }, [T.els.progress, el('button', { onclick: () => { T.loading.cancelled = true; } }, 'Cancel')]));
  } else {
    T.els.progress = null;
    s.appendChild(el('div', { class: 'row' }, [
      el('button', { onclick: () => loadTemplates(true), title: 'Re-read every template file from disk (after editing layouts)' }, '🔄 Reload templates'),
      T.lastErrors?.length ? el('button', { onclick: () => modal({ title: `Missing or unreadable files (${T.lastErrors.length})`, body: el('pre', { class: 'mono', style: { whiteSpace: 'pre-wrap' } }, T.lastErrors.join('\n')) }) }, `${T.lastErrors.length} errors`) : null,
    ]));
  }
  const check = (key, label, onchange) => el('label', { class: 'row', style: { cursor: 'pointer' } }, [el('input', { type: 'checkbox', checked: T.show[key], onchange: (e) => { T.show[key] = e.target.checked; onchange(); } }), label]);
  s.append(
    check('resources', 'Show resources (white dots)', rerasterizeAll),
    check('random', 'Hatch random valley grids (no layout file)', draw),
    check('bounds', 'Show settlement bounds', draw),
    check('regions', 'Show regions (red tint)', draw),
  );
  s.appendChild(el('div', { class: 'note' }, 'Templates only: what a grid looks like when it is created for a player, never any player\'s current copy. Drag to pan, scroll to zoom, click a grid to pick it; shift+click toggles a grid, shift+drag selects a rectangle.'));

  const regionSelect = () => el('select', { onchange: (e) => { T.regionPick = e.target.value; renderPanel(); } }, [
    el('option', { value: '', selected: !T.regionPick }, '(none)'),
    ...(S.regions || []).map((r) => el('option', { value: r.type, selected: T.regionPick === r.type }, `${r.symbol || ''} ${r.type}`)),
  ]);
  if (T.sel.length > 1) {
    const grids = selectedCells(), inDb = grids.filter((g) => g.gridId);
    s.appendChild(el('h3', {}, `${grids.length} grids selected`));
    s.appendChild(el('div', { class: 'note mono' }, `${inDb.length} in database · ${grids.filter((g) => g.region).length} with a region`));
    s.appendChild(el('div', { class: 'row' }, [el('button', { onclick: clearSelection }, 'Clear selection')]));
    s.appendChild(el('h3', {}, 'Region for all'));
    s.appendChild(el('div', { class: 'row' }, [regionSelect(), el('button', { class: 'primary', disabled: !inDb.length, onclick: () => S.bulkSaveRegion(grids, T.regionPick || null) }, `Save region (${inDb.length} in db)`)]));
    if (inDb.length < grids.length) s.appendChild(el('div', { class: 'note' }, `${grids.length - inDb.length} selected grids are not in the database and are skipped.`));
    return;
  }

  s.appendChild(el('h3', {}, 'Picked grid'));
  const p = T.picked;
  if (!p) { s.appendChild(el('div', { class: 'note' }, 'Click a grid on the map.')); return; }
  const cell = cellOf(p.coord);
  s.appendChild(el('div', { class: 'mono' }, String(p.coord)));
  s.appendChild(el('div', { class: 'note' }, cell ? `${cell.gridType} · ${cell.settlementName}${cell.region ? ` · region ${cell.region}` : ''}` : 'Not a grid of this frontier.'));
  s.appendChild(el('div', { class: 'note mono' }, p.entry ? `${p.entry.source.dir}/${p.entry.source.name}.json` : (cell && isValleyType(cell.gridType) ? 'no layout file: random at creation' : 'no template')));
  const openRoute = p.entry ? `layouts/${p.entry.source.dir}/${encodeURIComponent(p.entry.source.name)}?type=${encodeURIComponent(cell?.gridType || 'valley1')}`
    : (cell && isValleyType(cell.gridType) ? `layouts/valleyFixedCoord/${p.coord}?type=${encodeURIComponent(cell.gridType)}&new=1` : null);
  s.appendChild(el('div', { class: 'row' }, [
    cell ? el('button', { onclick: () => S.ctx.navigate(`world/grid/${S.frontierId}/${p.coord}`) }, 'Open in Grid view') : null,
    openRoute ? el('button', { class: 'primary', onclick: () => S.ctx.navigate(openRoute) }, p.entry ? 'Open layout' : 'Create layout') : null,
  ]));
  if (!cell) return;
  s.appendChild(el('h3', {}, 'Region'));
  s.appendChild(el('div', { class: 'note' }, `Current: ${cell.region || '(none)'}`));
  s.appendChild(cell.gridId
    ? el('div', { class: 'row' }, [regionSelect(), el('button', { class: 'primary', disabled: (T.regionPick || '') === (cell.region || ''), onclick: () => S.saveRegion(cell, T.regionPick || null) }, 'Save region')])
    : el('div', { class: 'note' }, 'Create the grid in the live game before assigning a region.'));
}

// ----------------------------------------------------------------------------- API for world.js
export const tileView = {
  /** Draw into the editor space and the given panel slot. `shared` = world.js state (ctx, frontierId, frontier, gridMap, prefix, layoutCoords, res). */
  mount(editorEl, panelEl, shared) {
    const switching = T.shared?.frontierId !== shared.frontierId;
    T.shared = shared; T.els.panel = panelEl;
    if (switching) { T.sel = []; T.picked = null; T.regionPick = ''; }
    else T.sel = T.sel.filter((c) => shared.gridMap.has(Number(c)));
    T.els.hoverInfo = el('span', { class: 'muted mono' }, '');
    const tb = el('div', { class: 'toolbar' }, [
      el('strong', {}, shared.frontier?.name || shared.frontierId), el('span', { class: 'badge' }, `prefix ${shared.prefix || '?'} · ${shared.gridMap.size} grids · 2 px per tile · templates only`),
      el('span', { class: 'spacer' }), T.els.hoverInfo,
      el('button', { onclick: fit }, 'Fit'), el('button', { onclick: resetView }, '100%'),
    ]);
    T.els.wrap = el('div', { class: 'atlas-wrap' });
    T.els.canvas = el('canvas', { class: 'atlas-canvas' });
    T.els.wrap.appendChild(T.els.canvas);
    editorEl.append(tb, T.els.wrap);
    bindCanvas(T.els.canvas);
    T.ro?.disconnect();
    T.ro = new ResizeObserver(() => draw());
    T.ro.observe(T.els.wrap);
    renderPanel();
    if (switching || !T.grids.size) fit(); else draw();
    loadTemplates(); // cached per frontier; file reads only
  },
  /** After a layout save elsewhere: forget the file so the next mount re-reads it. */
  invalidate(dir, name) { T.files.delete(`${dir}/${name}`); T.loadedFor = null; },
  unmount() { T.drag = null; T.hover = null; T.ro?.disconnect(); T.ro = null; T.els.panel = null; },
};
