/**
 * World tab: the frontier drawn tile by tile from the TEMPLATE layouts on disk (world/tileView.js;
 * nothing from any player's copy). Tile view owns the picking (click, shift+click, shift+drag),
 * Find grid, the region pick and the panel; this file loads the world from the game server and
 * does the live writes it asks for: region (single / bulk), create and reset (template + every
 * player's copy). Every live write goes through a confirm naming the target.
 * (The old Grid view, a 64x64 colour-coded canvas, was removed 2026-10-13.)
 *
 * Selection panel: frontier picker, Refresh, then Tile view's own controls.
 * Route: #world/tiles/<frontierId>[/<gridCoord>]  (#world/grid/..., #world/<frontierId>[/<coord>]
 * and #atlas/<frontierId> links still resolve, to Tile view)
 */
import { el, clear } from '../core/dom.js';
import { game, local } from '../core/api.js';
import { loadResources } from '../core/resources.js';
import { modal, confirm, toast, setStatus } from '../core/ui.js';
import { loadWorld, gridMapOf, frontierPrefix, isValleyType } from '../core/world.js';
import { tileView } from '../world/tileView.js';

const W = {
  ctx: null, els: {}, active: false,
  world: null, frontierId: null, frontier: null, gridMap: new Map(), prefix: null,
  layoutCoords: new Set(), regions: [], res: null,
  pickCoord: null,        // gridCoord from the route, picked when Tile view mounts
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
}

async function refresh() {
  setStatus('Refreshing world data…');
  await loadAll(true);
  W.pickCoord = null;
  renderSelection(); renderEditor();
  setStatus(W.loadError ? `Refresh failed: ${W.loadError.message}` : `World data refreshed ${W.world.loadedAt.toLocaleTimeString()}`);
}

const canCreate = (g) => g && isValleyType(g.gridType) && !g.gridId;
const canReset = (g) => g && !!g.gridId;

// ----------------------------------------------------------------------------- live writes
function failModal(title, err) {
  const body = err?.body;
  modal({ title, body: el('div', {}, [el('p', {}, err?.message || String(err)), body ? el('pre', { class: 'mono', style: { whiteSpace: 'pre-wrap' } }, typeof body === 'string' ? body : JSON.stringify(body, null, 2)) : null]) });
}
const describe = (g) => el('div', { class: 'mono' }, [`gridCoord ${g.gridCoord}`, el('br'), `type ${g.gridType}`, el('br'), `settlement ${g.settlementName}`, el('br'), g.gridId ? `gridId ${g.gridId}` : 'not in the database yet']);
const serverNote = () => el('p', { class: 'note' }, `Target: ${document.querySelector('#target')?.textContent || 'game server'}`);
const createPayload = (g) => ({ gridCoord: g.gridCoord, gridType: g.gridType, settlementId: g.settlementId, frontierId: g.frontierId });
const resetPayload = (g) => ({ gridCoord: g.gridCoord, gridId: g.gridId, gridType: g.gridType, settlementId: g.settlementId, frontierId: g.frontierId });
// Players play on their OWN copy of a town/valley cell, so Reset rebuilds the template AND every
// player's copy from the layout (/api/reset-grid-all-copies). A homestead is one owned grid.
const resetPath = (g) => (g.gridType === 'homestead' ? '/api/reset-grid' : '/api/reset-grid-all-copies');
const resetSummary = (r) => (r && Number.isFinite(r.copies) ? `template + ${r.copiesReset} of ${r.copies} player copies${r.failed?.length ? ` (${r.failed.length} failed)` : ''}` : (r?.message || 'ok'));

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
  const allCopies = resetPath(g) !== '/api/reset-grid';
  const ok = await confirm(el('div', {}, [el('p', {}, allCopies
    ? 'Reset this grid in the live game for EVERY player? The template and each player\'s own copy of this cell are regenerated from the layout; anything players placed or changed on it is lost.'
    : 'Reset this grid in the live game? All of its tiles and resources are regenerated from the layout; player-placed content on it is lost.'), describe(g), serverNote()]), { title: 'Reset grid (live game)', okLabel: 'Reset grid', danger: true });
  if (!ok) return;
  try {
    const r = await game.post(resetPath(g), resetPayload(g));
    toast(`Grid ${g.gridCoord} reset: ${resetSummary(r)}`);
    await refresh();
  } catch (err) { failModal(`Reset grid ${g.gridCoord} failed`, err); }
}

// the Tile view (world/tileView.js) owns the selection and the region pick; these do the writes
async function saveRegion(g, region = null) {
  if (!g?.gridId) return toast('Create the grid in the live game before assigning a region.', 'warn');
  const ok = await confirm(el('div', {}, [el('p', {}, `Set region to "${region || 'none'}" on this grid in the live game?`), describe(g), serverNote()]), { title: 'Update grid region', okLabel: 'Save region' });
  if (!ok) return;
  try {
    const r = await game.post('/api/update-grid-region', { gridId: g.gridId, region });
    toast(`Region of ${g.gridCoord} is now "${r?.region || 'none'}"`);
    await refresh();
  } catch (err) { failModal(`Update region of ${g.gridCoord} failed`, err); }
}

async function bulkSaveRegion(selection, region = null) {
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
async function bulkWrite({ title, grids, verb, path, payload, danger, note }) {
  const pathOf = typeof path === 'function' ? path : () => path;
  const ok = await confirm(el('div', {}, [el('p', {}, `${verb} ${grids.length} grids in the live game? ${note || `Each one is a separate ${path} call.`}`), el('div', { class: 'mono', style: { maxHeight: '160px', overflow: 'auto' } }, grids.map((g) => g.gridCoord).join(', ')), serverNote()]), { title, okLabel: `${verb} ${grids.length} grids`, danger });
  if (!ok) return;
  const progress = el('div', {}, `0 / ${grids.length}`);
  const m = modal({ title, body: el('div', {}, [progress, el('div', { class: 'note' }, 'Running; do not close the page.')]), buttons: [] });
  const failures = [];
  let done = 0;
  for (const g of grids) {
    try { await game.post(pathOf(g), payload(g)); }
    catch (err) { failures.push(`${g.gridCoord}: ${err.message}${err.body?.error ? ` (${err.body.error})` : ''}`); }
    progress.textContent = `${++done} / ${grids.length}${failures.length ? `, ${failures.length} failed` : ''}`;
  }
  m.close();
  const okCount = grids.length - failures.length;
  toast(`${verb}: ${okCount} of ${grids.length} grids succeeded`, failures.length ? 'warn' : 'info');
  if (failures.length) modal({ title: `${title}: ${failures.length} failed`, body: el('pre', { class: 'mono', style: { whiteSpace: 'pre-wrap' } }, failures.join('\n')) });
  await refresh();
}
const BULK_RESET_NOTE = 'Each grid\'s template AND every player\'s copy of it are regenerated from the layout; anything players placed or changed on them is lost.';

// ----------------------------------------------------------------------------- selection panel
function renderSelection() {
  const s = clear(W.els.selection);
  s.appendChild(el('h2', {}, 'World'));
  const frontiers = W.world?.frontiers || [];
  s.appendChild(el('div', { class: 'row' }, [
    el('select', { style: { flex: 1 }, onchange: (e) => W.ctx.navigate(`world/tiles/${e.target.value}`) },
      frontiers.length ? frontiers.map((f) => el('option', { value: String(f._id), selected: String(f._id) === W.frontierId }, `${f.name}${f.tier != null ? ` (tier ${f.tier})` : ''}`)) : [el('option', { value: '' }, 'no frontiers')]),
  ]));
  s.appendChild(el('div', { class: 'row', style: { margin: '6px 0' } }, [el('button', { onclick: refresh, title: 'Re-fetch frontiers, settlements and the layout list' }, '🔄 Refresh data')]));
  W.els.tilePanel = el('div');
  s.appendChild(W.els.tilePanel);
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
  tileView.mount(root, W.els.tilePanel, {
    ctx: W.ctx, frontierId: W.frontierId, frontier: W.frontier, gridMap: W.gridMap, prefix: W.prefix, layoutCoords: W.layoutCoords, res: W.res, regions: W.regions,
    pickCoord: W.pickCoord, saveRegion, bulkSaveRegion, canCreate, canReset, createGridLive, resetGridLive,
    bulkCreate: (grids) => bulkWrite({ title: 'Bulk create grids (live game)', grids: grids.filter(canCreate), verb: 'Create', path: '/api/create-grid', payload: createPayload, danger: false }),
    bulkReset: (grids) => bulkWrite({ title: 'Bulk reset grids (live game)', grids: grids.filter(canReset), verb: 'Reset', path: resetPath, payload: resetPayload, danger: true, note: BULK_RESET_NOTE }),
  });
}

// ----------------------------------------------------------------------------- tab
export function worldTab() {
  return {
    id: 'world', label: 'World', icon: '🌍', group: 'world',
    async mount(selectionEl, editorEl, ctx, route) {
      W.ctx = ctx; W.els.selection = selectionEl; W.els.editor = editorEl; W.active = true;
      const parts = route.split('/');
      let rawFrontier, rawCoord;
      if (parts[0] === 'atlas') [, rawFrontier] = parts;                                          // old Atlas links
      else if (parts[1] === 'grid' || parts[1] === 'tiles') [, , rawFrontier, rawCoord] = parts;   // the old Grid view lands here too
      else [, rawFrontier, rawCoord] = parts;                                                      // old #world/<frontier>/<coord>
      const frontierId = rawFrontier ? decodeURIComponent(rawFrontier.split('?')[0]) : null;
      if (frontierId && frontierId !== W.frontierId) W.frontierId = frontierId;
      if (!W.world) {
        clear(selectionEl).appendChild(el('h2', {}, 'World'));
        clear(editorEl).appendChild(el('div', { class: 'stub' }, 'Loading frontiers and settlements from the game server…'));
        await loadAll();
      } else {
        try { W.layoutCoords = new Set(((await local.layouts()).dirs.valleyFixedCoord || []).map(Number).filter(Boolean)); } catch (e) { /* keep the last list */ }
        indexFrontier();
      }
      const coord = Number((rawCoord || '').split('?')[0]);
      W.pickCoord = coord && W.gridMap.has(coord) ? coord : null;
      renderSelection();
      renderEditor();
      setStatus(W.frontier ? `World: ${W.frontier.name}` : '');
    },
    unmount() { W.active = false; tileView.unmount(); },
  };
}
