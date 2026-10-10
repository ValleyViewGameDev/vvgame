/**
 * World tab: the frontier, in two sub-views.
 *
 * Grid view (parity with game-editor/src/FrontierView.jsx): a 64x64 canvas of the frontier's
 * grids (8x8 settlements of 8x8 grids) and an inspector column with the selected grid's
 * actions: open or create its layout in Layouts, create or reset the grid in the live game,
 * assign its region; multi-select (shift+click to toggle, drag for a rectangle) for bulk
 * region / create / reset. Every live write goes through a confirm naming the target.
 * Tile view (world/tileView.js): the same frontier drawn tile by tile from the TEMPLATE
 * layouts on disk, nothing from any player's copy (the old Atlas tab, minus the database); it
 * has the same single and bulk region assignment, through saveRegion / bulkSaveRegion here.
 *
 * Selection panel: frontier picker, then the sub-view's own controls.
 * Route: #world/<grid|tiles>/<frontierId>[/<gridCoord>]  (older #world/<frontierId>[/<coord>]
 * and #atlas/<frontierId> links still resolve)
 */
import { el, clear } from '../core/dom.js';
import { game, local } from '../core/api.js';
import { loadResources } from '../core/resources.js';
import { modal, confirm, toast, setStatus } from '../core/ui.js';
import { loadWorld, gridMapOf, coordParts, frontierPrefix, isValleyType, townLayoutName, BOARD, GRIDS_PER_SETTLEMENT } from '../core/world.js';
import { tileView } from '../world/tileView.js';

const FILL = { none: '#f4f5f1', valley: '#d0f0c0', homestead: '#e4d5b7', town: '#e4d5b7', reserved: '#dcdcdc', db: '#cdcd21', region: 'rgba(255, 0, 0, 0.3)' };

const W = {
  ctx: null, els: {}, active: false,
  view: 'grid',           // 'grid' | 'tiles'
  world: null, frontierId: null, frontier: null, gridMap: new Map(), cells: [], prefix: null,
  layoutCoords: new Set(), regions: [], res: null,
  selected: null,         // gridCoord last clicked (single inspector)
  selectedCells: [],      // gridCoords in the multi-selection
  hover: null, drag: null,
  filters: { savedLayouts: true, databaseGrids: true, regions: true },
  regionPick: '',         // region dropdown value (single + bulk)
  cellSize: 16,
  loadError: null,
};

// ----------------------------------------------------------------------------- data
async function loadAll(force = false) {
  W.loadError = null;
  try {
    const [world, layouts, res] = await Promise.all([loadWorld(force), local.layouts(), loadResources()]);
    W.world = world;
    W.layoutCoords = new Set((layouts.dirs.valleyFixedCoord || []).map(Number).filter(Boolean));
    W.regions = res.regions; W.res = res;
  } catch (err) { W.loadError = err; W.world = W.world || { frontiers: [], settlements: [] }; }
  if (!W.frontierId || !W.world.frontiers.some((f) => String(f._id) === W.frontierId)) W.frontierId = W.world.frontiers[0] ? String(W.world.frontiers[0]._id) : null;
  indexFrontier();
}

function indexFrontier() {
  W.frontier = W.world.frontiers.find((f) => String(f._id) === W.frontierId) || null;
  W.gridMap = gridMapOf(W.world, W.frontierId);
  W.prefix = frontierPrefix(W.gridMap);
  W.cells = Array.from({ length: BOARD }, () => Array(BOARD).fill(null));
  for (const g of W.gridMap.values()) { const p = coordParts(g.gridCoord); if (p) W.cells[p.row][p.col] = g; }
  W.selectedCells = W.selectedCells.filter((c) => W.gridMap.has(c));
  if (W.selected && !W.gridMap.has(W.selected)) W.selected = null;
  syncRegionPick();
}

async function refresh() {
  setStatus('Refreshing world data…');
  await loadAll(true);
  renderSelection(); renderEditor();
  setStatus(W.loadError ? `Refresh failed: ${W.loadError.message}` : `World data refreshed ${W.world.loadedAt.toLocaleTimeString()}`);
}

const gridOf = (coord) => W.gridMap.get(Number(coord));
const hasLayout = (coord) => W.layoutCoords.has(Number(coord));
const canCreate = (g) => g && isValleyType(g.gridType) && !g.gridId;
const canReset = (g) => g && !!g.gridId;
const selectedGrids = () => W.selectedCells.map(gridOf).filter(Boolean);

function syncRegionPick() {
  if (W.selectedCells.length <= 1) W.regionPick = gridOf(W.selected)?.region || '';
}

// ----------------------------------------------------------------------------- selection model
function selectSingle(coord) { W.selected = coord; W.selectedCells = [coord]; syncRegionPick(); }
function toggleCell(coord) {
  W.selectedCells = W.selectedCells.includes(coord) ? W.selectedCells.filter((c) => c !== coord) : [...W.selectedCells, coord];
  W.selected = coord;
  syncRegionPick();
}
function selectRect(a, b) {
  const out = [];
  for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r++) {
    for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c++) { const g = W.cells[r][c]; if (g) out.push(g.gridCoord); }
  }
  W.selectedCells = out;
}
function clearSelection() { W.selectedCells = []; W.selected = null; W.regionPick = ''; draw(); renderInspector(); }
function afterSelect() { draw(); renderInspector(); }

// ----------------------------------------------------------------------------- navigation to Layouts
function layoutTarget(g) {
  if (!g) return null;
  if (isValleyType(g.gridType)) {
    const exists = hasLayout(g.gridCoord);
    return { label: exists ? 'Open layout in Layouts' : 'Create new layout in Layouts', route: `layouts/valleyFixedCoord/${g.gridCoord}?type=${encodeURIComponent(g.gridType)}${exists ? '' : '&new=1'}`, exists };
  }
  if (g.gridType === 'homestead') return { label: 'Open homestead layout', route: 'layouts/homestead/homestead?type=homestead', exists: true };
  if (g.gridType === 'town') {
    const name = townLayoutName(W.frontier, g.settlementId);
    return name ? { label: `Open town layout (${name})`, route: `layouts/town/${name}?type=town`, exists: true } : { label: 'Browse town layouts', route: 'layouts/town', exists: false };
  }
  return null;
}

// ----------------------------------------------------------------------------- live writes
function failModal(title, err) {
  const body = err?.body;
  modal({ title, body: el('div', {}, [el('p', {}, err?.message || String(err)), body ? el('pre', { class: 'mono', style: { whiteSpace: 'pre-wrap' } }, typeof body === 'string' ? body : JSON.stringify(body, null, 2)) : null]) });
}
const describe = (g) => el('div', { class: 'mono' }, [`gridCoord ${g.gridCoord}`, el('br'), `type ${g.gridType}`, el('br'), `settlement ${g.settlementName}`, el('br'), g.gridId ? `gridId ${g.gridId}` : 'not in the database yet']);
const serverNote = () => el('p', { class: 'note' }, `Target: ${document.querySelector('#target')?.textContent || 'game server'}`);
const createPayload = (g) => ({ gridCoord: g.gridCoord, gridType: g.gridType, settlementId: g.settlementId, frontierId: g.frontierId });
const resetPayload = (g) => ({ gridCoord: g.gridCoord, gridId: g.gridId, gridType: g.gridType, settlementId: g.settlementId, frontierId: g.frontierId });

async function createGridLive(g) {
  if (!canCreate(g)) return toast(g?.gridId ? 'This grid already exists in the database; reset it instead.' : 'Only valley grids are created from here (towns and homesteads are made by the game).', 'warn');
  const ok = await confirm(el('div', {}, [el('p', {}, 'Create this grid in the live game? This writes a real Grid document to the game database.'), describe(g), serverNote()]), { title: 'Create grid (live game)', okLabel: 'Create grid' });
  if (!ok) return;
  try {
    const r = await game.post('/api/create-grid', createPayload(g));
    toast(`Grid ${g.gridCoord} created: ${r?.message || 'ok'}${r?.gridId ? ` (${r.gridId})` : ''}`);
    await refresh();
  } catch (err) { failModal(`Create grid ${g.gridCoord} failed`, err); }
}

async function resetGridLive(g) {
  if (!canReset(g)) return toast('This grid has not been created in the live game yet.', 'warn');
  const ok = await confirm(el('div', {}, [el('p', {}, 'Reset this grid in the live game? All of its tiles and resources are regenerated from the layout; player-placed content on it is lost.'), describe(g), serverNote()]), { title: 'Reset grid (live game)', okLabel: 'Reset grid', danger: true });
  if (!ok) return;
  try {
    const r = await game.post('/api/reset-grid', resetPayload(g));
    toast(`Grid ${g.gridCoord} reset: ${r?.message || 'ok'}`);
    await refresh();
  } catch (err) { failModal(`Reset grid ${g.gridCoord} failed`, err); }
}

// shared with the Tile view (world/tileView.js), which has its own selection and region pick
async function saveRegion(g, region = W.regionPick || null) {
  if (!g?.gridId) return toast('Create the grid in the live game before assigning a region.', 'warn');
  const ok = await confirm(el('div', {}, [el('p', {}, `Set region to "${region || 'none'}" on this grid in the live game?`), describe(g), serverNote()]), { title: 'Update grid region', okLabel: 'Save region' });
  if (!ok) return;
  try {
    const r = await game.post('/api/update-grid-region', { gridId: g.gridId, region });
    toast(`Region of ${g.gridCoord} is now "${r?.region || 'none'}"`);
    await refresh();
  } catch (err) { failModal(`Update region of ${g.gridCoord} failed`, err); }
}

async function bulkSaveRegion(selection = selectedGrids(), region = W.regionPick || null) {
  const grids = selection.filter((g) => g.gridId);
  if (!grids.length) return toast('None of the selected grids exist in the live game yet.', 'warn');
  const ok = await confirm(el('div', {}, [el('p', {}, `Set region to "${region || 'none'}" on ${grids.length} grids in the live game?`), el('div', { class: 'mono', style: { maxHeight: '160px', overflow: 'auto' } }, grids.map((g) => g.gridCoord).join(', ')), serverNote()]), { title: 'Bulk update grid regions', okLabel: `Save region (${grids.length})` });
  if (!ok) return;
  try {
    const r = await game.post('/api/bulk-update-grid-regions', { gridIds: grids.map((g) => g.gridId), region });
    toast(`Region "${r?.region || 'none'}" set on ${r?.modifiedCount ?? '?'} grids`);
    await refresh();
  } catch (err) { failModal('Bulk region update failed', err); }
}

/** Sequential live writes with a progress modal, then a summary modal listing failures. */
async function bulkWrite({ title, grids, verb, path, payload, danger }) {
  const ok = await confirm(el('div', {}, [el('p', {}, `${verb} ${grids.length} grids in the live game? Each one is a separate ${path} call.`), el('div', { class: 'mono', style: { maxHeight: '160px', overflow: 'auto' } }, grids.map((g) => g.gridCoord).join(', ')), serverNote()]), { title, okLabel: `${verb} ${grids.length} grids`, danger });
  if (!ok) return;
  const progress = el('div', {}, `0 / ${grids.length}`);
  const m = modal({ title, body: el('div', {}, [progress, el('div', { class: 'note' }, 'Running; do not close the page.')]), buttons: [] });
  const failures = [];
  let done = 0;
  for (const g of grids) {
    try { await game.post(path, payload(g)); }
    catch (err) { failures.push(`${g.gridCoord}: ${err.message}${err.body?.error ? ` (${err.body.error})` : ''}`); }
    progress.textContent = `${++done} / ${grids.length}${failures.length ? `, ${failures.length} failed` : ''}`;
  }
  m.close();
  const okCount = grids.length - failures.length;
  toast(`${verb}: ${okCount} of ${grids.length} grids succeeded`, failures.length ? 'warn' : 'info');
  if (failures.length) modal({ title: `${title}: ${failures.length} failed`, body: el('pre', { class: 'mono', style: { whiteSpace: 'pre-wrap' } }, failures.join('\n')) });
  await refresh();
}
const bulkCreate = () => bulkWrite({ title: 'Bulk create grids (live game)', grids: selectedGrids().filter(canCreate), verb: 'Create', path: '/api/create-grid', payload: createPayload, danger: false });
const bulkReset = () => bulkWrite({ title: 'Bulk reset grids (live game)', grids: selectedGrids().filter(canReset), verb: 'Reset', path: '/api/reset-grid', payload: resetPayload, danger: true });

// ----------------------------------------------------------------------------- selection panel
function renderSelection() {
  const s = clear(W.els.selection);
  s.appendChild(el('h2', {}, 'World'));
  const frontiers = W.world?.frontiers || [];
  s.appendChild(el('div', { class: 'row' }, [
    el('select', { style: { flex: 1 }, onchange: (e) => { W.selected = null; W.selectedCells = []; W.ctx.navigate(`world/${W.view}/${e.target.value}`); } },
      frontiers.length ? frontiers.map((f) => el('option', { value: String(f._id), selected: String(f._id) === W.frontierId }, `${f.name}${f.tier != null ? ` (tier ${f.tier})` : ''}`)) : [el('option', { value: '' }, 'no frontiers')]),
  ]));
  s.appendChild(el('div', { class: 'row', style: { margin: '6px 0' } }, [el('button', { onclick: refresh, title: 'Re-fetch frontiers, settlements and the layout list' }, '🔄 Refresh data')]));

  if (W.view === 'tiles') { W.els.tilePanel = el('div'); s.appendChild(W.els.tilePanel); return; }
  W.els.tilePanel = null;

  s.appendChild(el('h3', {}, 'Find grid'));
  const find = el('input', { placeholder: 'gridCoord, e.g. 1011100', class: 'mono', style: { width: '100%' }, onkeydown: (e) => {
    if (e.key !== 'Enter') return;
    const coord = Number(e.target.value.trim());
    if (!W.gridMap.has(coord)) return toast(`${e.target.value} is not a grid of this frontier`, 'warn');
    selectSingle(coord); afterSelect(); scrollTo(coord);
  } });
  s.appendChild(find);

  s.appendChild(el('h3', {}, 'Filters'));
  const check = (key, label) => el('label', { class: 'row', style: { cursor: 'pointer' } }, [el('input', { type: 'checkbox', checked: W.filters[key], onchange: (e) => { W.filters[key] = e.target.checked; draw(); } }), label]);
  s.append(check('savedLayouts', 'Show saved layouts (✅)'), check('databaseGrids', 'Show database grids (yellow)'), check('regions', 'Show regions (red tint)'));

  s.appendChild(el('h3', {}, 'Legend'));
  const sw = (color, label) => el('div', { class: 'row' }, [el('span', { class: 'world-swatch', style: { background: color } }), label]);
  s.append(sw(FILL.valley, 'valley grid'), sw(FILL.homestead, 'homestead / town (🚂)'), sw(FILL.reserved, 'reserved'), sw(FILL.db, 'created in the database'), sw('rgba(255,0,0,0.3)', 'has a region'), el('div', { class: 'note' }, 'Thick lines bound settlements. Click selects; shift+click toggles; drag selects a rectangle.'));
}

function setView(view) {
  if (view === W.view) return;
  W.ctx.navigate(`world/${view}/${W.frontierId}${view === 'grid' && W.selected ? `/${W.selected}` : ''}`);
}

function scrollTo(coord) {
  const p = coordParts(coord); const wrap = W.els.wrap;
  if (!p || !wrap) return;
  wrap.scrollTo({ left: p.col * W.cellSize - wrap.clientWidth / 2, top: p.row * W.cellSize - wrap.clientHeight / 2, behavior: 'smooth' });
}

// ----------------------------------------------------------------------------- editor space
function renderEditor() {
  const root = clear(W.els.editor);
  if (W.loadError) {
    const b = W.loadError.body;
    root.appendChild(el('div', { class: 'stub' }, [el('p', {}, `Could not load the world from the game server: ${W.loadError.message}`), b?.maintenance ? el('p', {}, `The game server is in maintenance mode${b.message ? `: ${b.message}` : ''}. Its /api routes answer 503 unless the request carries a developer player id.`) : null, el('button', { onclick: refresh }, 'Retry')]));
    return;
  }
  if (!W.frontierId) { root.appendChild(el('div', { class: 'stub' }, 'The game server returned no frontiers.')); return; }
  root.appendChild(el('div', { class: 'subtabs' }, [
    el('button', { class: W.view === 'grid' ? 'on' : '', onclick: () => setView('grid') }, 'Grid view'),
    el('button', { class: W.view === 'tiles' ? 'on' : '', onclick: () => setView('tiles') }, 'Tile view'),
  ]));
  if (W.view === 'tiles') {
    tileView.mount(root, W.els.tilePanel, { ctx: W.ctx, frontierId: W.frontierId, frontier: W.frontier, gridMap: W.gridMap, prefix: W.prefix, layoutCoords: W.layoutCoords, res: W.res, regions: W.regions, saveRegion, bulkSaveRegion });
    return;
  }
  const grids = [...W.gridMap.values()];
  const counts = `${grids.length} grids · ${grids.filter((g) => g.gridId).length} in database · ${grids.filter((g) => hasLayout(g.gridCoord)).length} with layouts · ${grids.filter((g) => g.region).length} with regions`;
  W.els.hoverInfo = el('span', { class: 'muted mono' }, '');
  const sizeSlider = el('input', { type: 'range', min: 8, max: 28, value: W.cellSize, title: 'Cell size', oninput: (e) => { W.cellSize = Number(e.target.value); draw(); } });
  const tb = el('div', { class: 'toolbar' }, [
    el('strong', {}, W.frontier?.name || W.frontierId), el('span', { class: 'badge' }, counts),
    el('span', { class: 'spacer' }), W.els.hoverInfo,
    el('span', { class: 'muted' }, 'zoom'), sizeSlider,
  ]);
  W.els.wrap = el('div', { class: 'world-canvas-wrap' });
  W.els.canvas = el('canvas', { class: 'world-canvas' });
  W.els.wrap.appendChild(W.els.canvas);
  W.els.inspector = el('div', { class: 'world-inspector' });
  root.append(tb, el('div', { class: 'world-body' }, [W.els.wrap, W.els.inspector]));
  bindCanvas(W.els.canvas);
  draw();
  renderInspector();
}

function cellAt(e) {
  const rect = W.els.canvas.getBoundingClientRect();
  const col = Math.floor((e.clientX - rect.left) / W.cellSize), row = Math.floor((e.clientY - rect.top) / W.cellSize);
  if (row < 0 || col < 0 || row >= BOARD || col >= BOARD) return null;
  return { row, col, grid: W.cells[row][col] };
}

function bindCanvas(cv) {
  cv.addEventListener('mousedown', (e) => {
    const c = cellAt(e); if (!c?.grid) return;
    if (e.shiftKey) toggleCell(c.grid.gridCoord);
    else { W.drag = { start: c }; selectSingle(c.grid.gridCoord); }
    afterSelect();
  });
  cv.addEventListener('mousemove', (e) => {
    const c = cellAt(e);
    const g = c?.grid || null;
    if (g !== W.hover) {
      W.hover = g;
      W.els.hoverInfo.textContent = g ? `${g.gridCoord} ${g.gridType} · ${g.settlementName}${g.gridId ? ' · db' : ''}${g.region ? ` · ${g.region}` : ''}` : '';
      if (!W.drag) draw();
    }
    if (W.drag && c) { selectRect(W.drag.start, c); afterSelect(); }
  });
  const endDrag = () => { if (W.drag) { W.drag = null; afterSelect(); } };
  cv.addEventListener('mouseup', endDrag);
  cv.addEventListener('mouseleave', () => { W.hover = null; W.els.hoverInfo.textContent = ''; endDrag(); draw(); });
}

function draw() {
  const cv = W.els.canvas; if (!cv) return;
  const cs = W.cellSize, px = BOARD * cs, dpr = window.devicePixelRatio || 1;
  if (cv.width !== px * dpr) { cv.width = cv.height = px * dpr; cv.style.width = cv.style.height = `${px}px`; }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, px, px);
  ctx.font = `${Math.floor(cs * 0.7)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const sel = new Set(W.selectedCells);
  for (let r = 0; r < BOARD; r++) {
    for (let c = 0; c < BOARD; c++) {
      const g = W.cells[r][c], x = c * cs, y = r * cs;
      let fill = FILL.none;
      if (g) fill = isValleyType(g.gridType) ? FILL.valley : (FILL[g.gridType] || FILL.reserved);
      if (g && W.filters.databaseGrids && g.gridId) fill = FILL.db;
      ctx.fillStyle = fill; ctx.fillRect(x, y, cs, cs);
      if (g && W.filters.regions && g.region) { ctx.fillStyle = FILL.region; ctx.fillRect(x, y, cs, cs); }
      if (g && cs >= 10) {
        const glyph = g.gridType === 'town' ? '🚂' : (W.filters.savedLayouts && isValleyType(g.gridType) && hasLayout(g.gridCoord) ? '✅' : '');
        if (glyph) { ctx.fillStyle = '#000'; ctx.fillText(glyph, x + cs / 2, y + cs / 2 + 1); }
      }
    }
  }
  ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1; ctx.beginPath();
  for (let i = 0; i <= BOARD; i++) { ctx.moveTo(i * cs + 0.5, 0); ctx.lineTo(i * cs + 0.5, px); ctx.moveTo(0, i * cs + 0.5); ctx.lineTo(px, i * cs + 0.5); }
  ctx.stroke();
  ctx.strokeStyle = '#555'; ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i <= BOARD; i += GRIDS_PER_SETTLEMENT) { ctx.moveTo(i * cs, 0); ctx.lineTo(i * cs, px); ctx.moveTo(0, i * cs); ctx.lineTo(px, i * cs); }
  ctx.stroke();
  if (W.hover && !sel.has(W.hover.gridCoord)) { const p = coordParts(W.hover.gridCoord); ctx.strokeStyle = '#3f8a2f'; ctx.lineWidth = 2; ctx.strokeRect(p.col * cs + 1, p.row * cs + 1, cs - 2, cs - 2); }
  ctx.strokeStyle = 'red'; ctx.lineWidth = 2;
  for (const coord of sel) { const p = coordParts(coord); if (p) ctx.strokeRect(p.col * cs + 1, p.row * cs + 1, cs - 2, cs - 2); }
}

// ----------------------------------------------------------------------------- inspector
function regionSelect() {
  return el('select', { onchange: (e) => { W.regionPick = e.target.value; renderInspector(); } }, [
    el('option', { value: '', selected: !W.regionPick }, '(none)'),
    ...W.regions.map((r) => el('option', { value: r.type, selected: W.regionPick === r.type }, `${r.symbol || ''} ${r.type}`)),
  ]);
}

function renderInspector() {
  const box = W.els.inspector; if (!box) return;
  clear(box);
  const section = (title, children) => box.appendChild(el('div', { class: 'tool-section' }, [el('h3', {}, title), ...children]));
  if (W.selectedCells.length > 1) {
    const grids = selectedGrids();
    const creatable = grids.filter(canCreate), resettable = grids.filter(canReset);
    section(`${grids.length} grids selected`, [
      el('div', { class: 'note' }, 'Shift+click toggles a grid; drag selects a rectangle.'),
      el('div', { class: 'note mono' }, `${grids.filter((g) => isValleyType(g.gridType)).length} valley · ${resettable.length} in database · ${grids.filter((g) => hasLayout(g.gridCoord)).length} with layouts`),
      el('button', { onclick: clearSelection }, 'Clear selection'),
    ]);
    section('Region for all', [
      el('div', { class: 'row' }, [regionSelect(), el('button', { class: 'primary', disabled: !resettable.length, onclick: () => bulkSaveRegion() }, `Save region (${resettable.length} in db)`)]),
      resettable.length < grids.length ? el('div', { class: 'note' }, `${grids.length - resettable.length} selected grids are not in the database and are skipped.`) : null,
    ]);
    section('Live game', [
      el('div', { class: 'row' }, [el('button', { class: 'primary', disabled: !creatable.length, onclick: bulkCreate }, `Create ${creatable.length} grids`)]),
      el('div', { class: 'note' }, 'Valley grids without a database entry.'),
      el('div', { class: 'row' }, [el('button', { class: 'danger', disabled: !resettable.length, onclick: bulkReset }, `Reset ${resettable.length} grids`)]),
      el('div', { class: 'note' }, 'Grids that exist in the database.'),
    ]);
    return;
  }
  const g = gridOf(W.selected);
  if (!g) { box.appendChild(el('div', { class: 'note' }, 'Click a grid on the map to inspect it.')); return; }
  section(`Grid ${g.gridCoord}`, [
    el('div', { class: 'row' }, [el('span', { class: 'badge' }, g.gridType), g.available === false ? el('span', { class: 'badge warn' }, 'unavailable') : null]),
    el('div', { class: 'note' }, `Settlement: ${g.settlementName}`),
    el('div', { class: 'note mono' }, g.gridId ? `gridId ${g.gridId}` : 'not created in the database'),
    el('div', { class: 'note' }, `Layout file: ${isValleyType(g.gridType) ? (hasLayout(g.gridCoord) ? `valleyFixedCoord/${g.gridCoord}.json` : 'none (random generation)') : (layoutTarget(g)?.route.split('?')[0].replace(/^layouts\//, '') || 'n/a')}`),
  ]);
  const lt = layoutTarget(g);
  section('Layout', [lt ? el('button', { onclick: () => W.ctx.navigate(lt.route) }, lt.label) : el('div', { class: 'note' }, 'No layout for this grid type.')]);
  section('Live game', [
    el('div', { class: 'row' }, [
      canCreate(g) ? el('button', { class: 'primary', onclick: () => createGridLive(g) }, 'Create grid') : null,
      canReset(g) ? el('button', { class: 'danger', onclick: () => resetGridLive(g) }, 'Reset grid') : null,
    ]),
    el('div', { class: 'note' }, canCreate(g) ? 'Creates the Grid document from its layout (or random generation).' : canReset(g) ? 'Regenerates tiles and resources from the layout.' : 'Towns and homesteads are created by the game itself.'),
  ]);
  const dirty = (W.regionPick || '') !== (g.region || '');
  section('Region', [
    el('div', { class: 'note' }, `Current: ${g.region || '(none)'}`),
    g.gridId
      ? el('div', { class: 'row' }, [regionSelect(), el('button', { class: 'primary', disabled: !dirty, onclick: () => saveRegion(g) }, 'Save region')])
      : el('div', { class: 'note' }, 'Create the grid in the live game before assigning a region.'),
  ]);
}

// ----------------------------------------------------------------------------- tab
export function worldTab() {
  return {
    id: 'world', label: 'World', icon: '🌍', group: 'world',
    async mount(selectionEl, editorEl, ctx, route) {
      W.ctx = ctx; W.els.selection = selectionEl; W.els.editor = editorEl; W.active = true;
      const parts = route.split('/');
      let view = 'grid', rawFrontier, rawCoord;
      if (parts[0] === 'atlas') { view = 'tiles'; [, rawFrontier] = parts; }           // old Atlas links
      else if (parts[1] === 'grid' || parts[1] === 'tiles') { [, view, rawFrontier, rawCoord] = parts; }
      else { [, rawFrontier, rawCoord] = parts; }                                     // old #world/<frontier>/<coord>
      if (view !== W.view) tileView.unmount();
      W.view = view;
      const frontierId = rawFrontier ? decodeURIComponent(rawFrontier.split('?')[0]) : null;
      if (frontierId && frontierId !== W.frontierId) { W.frontierId = frontierId; W.selected = null; W.selectedCells = []; }
      if (!W.world) {
        clear(selectionEl).appendChild(el('h2', {}, 'World'));
        clear(editorEl).appendChild(el('div', { class: 'stub' }, 'Loading frontiers and settlements from the game server…'));
        await loadAll();
      } else {
        try { W.layoutCoords = new Set(((await local.layouts()).dirs.valleyFixedCoord || []).map(Number).filter(Boolean)); } catch (e) { /* keep the last list */ }
        indexFrontier();
      }
      const coord = Number((rawCoord || '').split('?')[0]);
      if (coord && W.gridMap.has(coord)) selectSingle(coord);
      renderSelection();
      renderEditor();
      if (W.view === 'grid' && coord && W.gridMap.has(coord)) scrollTo(coord);
      setStatus(W.frontier ? `World: ${W.frontier.name}` : '');
    },
    unmount() { W.active = false; W.drag = null; W.hover = null; tileView.unmount(); },
  };
}
