/**
 * Dungeons tab: dungeon TEMPLATE instances and their frontier registry entry
 * (parity with game-editor/src/Dungeons.jsx).
 *
 * Selection panel: frontier picker, create-from-template, list of dungeon template grids.
 * Editing space: toolbar (reload, save, reset, delete) and the registry editor for the
 * selected dungeon: template used, entrance cells (gridCoords of town/valley cells whose
 * Dungeon Entrance leads here) with validation against the live grid.
 * Route: #dungeons/<frontierId>[/<dungeonGridId>]
 *
 * Every live write (create, save config, reset, delete) is behind confirm() and reports the
 * server's response in a toast (success) or a modal (failure). Nothing is written on mount.
 */
import { el, clear } from '../core/dom.js';
import { local, game } from '../core/api.js';
import { modal, confirm, toast, setStatus } from '../core/ui.js';

const ENTRANCE_RESOURCE = 'Dungeon Entrance';

const D = {
  ctx: null, els: {}, active: false,
  loaded: false,                 // frontiers + settlements + templates fetched once
  frontiers: [], settlements: [], templates: [],
  frontierId: null,              // selected frontier (_id)
  frontier: null,                // GET /api/get-frontier/:id (holds .dungeons registry)
  grids: [],                     // GET /api/grids?gridType=dungeon&isTemplate=true
  selectedId: null,              // selected dungeon grid _id
  edits: {},                     // dungeonId -> { templateUsed, entranceGridCoords, hasChanges }
  createTemplate: '',
  addCoord: '',
  busy: false,
};

// ----------------------------------------------------------------------------- helpers
const idOf = (v) => String(v?._id || v || '');
const isGridCoord = (v) => Number.isFinite(Number(v)) && String(v).trim() !== '';
const fmtDate = (d) => (d ? new Date(d).toLocaleString() : 'n/a');
const shortId = (id) => (id ? `${String(id).slice(0, 6)}…${String(id).slice(-4)}` : '');

/** Decode the SSGG part of a TTFFSSGG gridCoord into settlement row/col + grid row/col. */
function formatGridCoord(coord) {
  if (!isGridCoord(coord)) return `${coord} (legacy grid id)`;
  const ssgg = Number(coord) % 10000;
  const sRow = Math.floor(ssgg / 1000), sCol = Math.floor(ssgg / 100) % 10, gRow = Math.floor(ssgg / 10) % 10, gCol = ssgg % 10;
  return `${coord} (S${sRow},${sCol} G${gRow},${gCol})`;
}

function frontierName(id) { return D.frontiers.find((f) => idOf(f) === String(id))?.name || (id ? shortId(id) : 'unassigned'); }

/** Town/valley cells of the selected frontier that have a template grid (never homesteads). */
function entranceCells() {
  const cells = [];
  for (const s of D.settlements) {
    if (idOf(s.frontierId) !== String(D.frontierId)) continue;
    const grids = Array.isArray(s.grids) ? s.grids.flat() : [];
    for (const cell of grids) {
      if (!cell?.gridId || !isGridCoord(cell.gridCoord) || cell.gridType === 'homestead') continue;
      cells.push({ gridCoord: Number(cell.gridCoord), gridId: idOf(cell.gridId), gridType: cell.gridType, settlement: s.displayName || s.name });
    }
  }
  return cells.sort((a, b) => a.gridCoord - b.gridCoord);
}

function registryEntry(id) { return D.frontier?.dungeons?.[id] || null; }
function gridById(id) { return D.grids.find((g) => idOf(g) === String(id)) || null; }

/** Current (edited or stored) config for a dungeon. */
function configFor(id) {
  const e = D.edits[id];
  const reg = registryEntry(id);
  const grid = gridById(id);
  return {
    templateUsed: e?.templateUsed ?? reg?.templateUsed ?? grid?.templateUsed ?? '',
    entranceGridCoords: e?.entranceGridCoords ?? (reg?.entranceGrids || []).map((v) => (isGridCoord(v) ? Number(v) : v)),
    hasChanges: !!e?.hasChanges,
  };
}
function setEdit(id, patch) {
  const cur = configFor(id);
  D.edits[id] = { ...cur, ...patch, hasChanges: true };
  renderSelection();
  renderEditor();
}

function showError(title, err) {
  const body = err?.body && typeof err.body === 'object' ? JSON.stringify(err.body, null, 2) : (err?.body || '');
  modal({ title, body: el('div', {}, [el('p', {}, err?.message || String(err)), body ? el('pre', { class: 'mono' }, body) : null]) });
}

// ----------------------------------------------------------------------------- data
async function loadWorld() {
  const [frontiers, settlements, layouts] = await Promise.all([game.get('/api/frontiers'), game.get('/api/settlements'), local.layouts()]);
  D.frontiers = frontiers || [];
  D.settlements = settlements || [];
  D.templates = layouts.dirs.dungeon || [];
  if (!D.createTemplate && D.templates.length) D.createTemplate = D.templates[0];
  if (!D.frontierId && D.frontiers.length) D.frontierId = idOf(D.frontiers[0]);
  D.loaded = true;
}
async function loadGrids() {
  const grids = await game.get('/api/grids?gridType=dungeon&isTemplate=true');
  D.grids = (grids || []).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}
async function loadFrontier() {
  D.frontier = D.frontierId ? await game.get(`/api/get-frontier/${D.frontierId}`) : null;
}
async function reload({ keepEdits = true } = {}) {
  setStatus('Loading dungeons…');
  try {
    await Promise.all([loadGrids(), loadFrontier()]);
    if (!keepEdits) D.edits = {};
    setStatus(`${D.grids.length} dungeon template grids`);
  } catch (err) {
    setStatus('');
    toast(`Load failed: ${err.message}`, 'error');
  }
  renderSelection();
  renderEditor();
}

// ----------------------------------------------------------------------------- live writes (all behind confirm)
async function createDungeon() {
  const tpl = D.createTemplate;
  if (!tpl) return toast('Pick a template first', 'warn');
  if (!D.frontierId) return toast('Pick a frontier first', 'warn');
  const ok = await confirm(`Create a new dungeon template grid from "${tpl}" in frontier "${frontierName(D.frontierId)}"? This writes a Grid document and a registry entry on the frontier.`, { title: 'Create dungeon', okLabel: 'Create' });
  if (!ok) return;
  D.busy = true; renderSelection();
  try {
    const res = await game.post('/api/create-dungeon', { templateFilename: tpl, settlementId: D.frontierId, frontierId: D.frontierId });
    toast(`Created dungeon ${idOf(res?.grid)} (${res?.grid?.templateUsed || tpl})`);
    D.selectedId = idOf(res?.grid) || D.selectedId;
    await reload();
    D.ctx.navigate(`dungeons/${D.frontierId}/${D.selectedId}`);
  } catch (err) { showError('Create dungeon failed', err); }
  D.busy = false; renderSelection();
}

async function saveConfig(id) {
  const cfg = configFor(id);
  if (!cfg.hasChanges) return;
  const coords = cfg.entranceGridCoords.filter(isGridCoord).map(Number);
  const dropped = cfg.entranceGridCoords.length - coords.length;
  const ok = await confirm(el('div', {}, [
    el('p', {}, `Save registry config for dungeon ${id} on frontier "${frontierName(D.frontierId)}"?`),
    el('div', { class: 'mono' }, `templateUsed: ${cfg.templateUsed || '(empty)'}`),
    el('div', { class: 'mono' }, `entranceGrids: ${coords.length ? coords.join(', ') : '(none)'}`),
    dropped ? el('div', { class: 'note' }, `${dropped} legacy non-numeric entrance id(s) will be dropped.`) : null,
  ]), { title: 'Save dungeon config', okLabel: 'Save' });
  if (!ok) return;
  D.busy = true; renderEditor();
  try {
    const res = await game.post('/api/update-dungeon-config', { frontierId: D.frontierId, dungeonGridId: id, templateUsed: cfg.templateUsed, entranceGridCoords: coords });
    delete D.edits[id];
    toast(`Saved: template ${res?.dungeon?.templateUsed || cfg.templateUsed}, ${(res?.dungeon?.entranceGrids || coords).length} entrance cell(s)`);
    await reload();
  } catch (err) { showError('Save dungeon config failed', err); }
  D.busy = false; renderEditor();
}

async function resetDungeon(id) {
  const ok = await confirm(`Reset dungeon grid ${id}? All resources and NPCs are regenerated from the template recorded for it (templateKey, else the frontier registry). Players inside lose their progress in this instance.`, { title: 'Reset dungeon', okLabel: 'Reset', danger: true });
  if (!ok) return;
  D.busy = true; renderEditor();
  try {
    const res = await game.post('/api/reset-dungeon', { gridId: id });
    toast(res?.message || 'Dungeon reset');
    await reload();
  } catch (err) { showError('Reset dungeon failed', err); }
  D.busy = false; renderEditor();
}

async function deleteDungeon(id) {
  const ok = await confirm(`Delete dungeon grid ${id} and remove it from the frontier registry? This cannot be undone.`, { title: 'Delete dungeon', okLabel: 'Delete', danger: true });
  if (!ok) return;
  D.busy = true; renderEditor();
  try {
    const res = await game.delete(`/api/delete-dungeon/${id}`);
    toast(res?.message || 'Dungeon deleted');
    delete D.edits[id];
    if (D.selectedId === id) D.selectedId = null;
    await reload();
    D.ctx.navigate(`dungeons/${D.frontierId}`);
  } catch (err) { showError('Delete dungeon failed', err); }
  D.busy = false; renderEditor();
}

/** Validate the chosen cell against its live template grid (read only), then add it to the edit. */
async function addEntrance(id, coordRaw) {
  if (!isGridCoord(coordRaw)) return;
  const gridCoord = Number(coordRaw);
  const cell = entranceCells().find((c) => c.gridCoord === gridCoord);
  if (!cell) return toast(`gridCoord ${gridCoord} is not a created town/valley cell in this frontier`, 'warn');
  if (configFor(id).entranceGridCoords.includes(gridCoord)) return toast('This cell is already linked to this dungeon', 'warn');
  try {
    const res = await game.get(`/api/grid-has-resource?gridId=${encodeURIComponent(cell.gridId)}&resourceType=${encodeURIComponent(ENTRANCE_RESOURCE)}`);
    if (!res?.hasResource) return toast(`Cell ${formatGridCoord(gridCoord)} has no ${ENTRANCE_RESOURCE} resource${res?.error ? ` (${res.error})` : ''}`, 'warn');
  } catch (err) { return showError('Entrance validation failed', err); }
  D.addCoord = '';
  setEdit(id, { entranceGridCoords: [...configFor(id).entranceGridCoords, gridCoord] });
}
function removeEntrance(id, gridCoord) {
  setEdit(id, { entranceGridCoords: configFor(id).entranceGridCoords.filter((c) => c !== gridCoord) });
}

// ----------------------------------------------------------------------------- selection panel
function renderSelection() {
  const s = clear(D.els.selection);
  s.appendChild(el('h2', {}, 'Dungeons'));

  const frontierSel = el('select', { title: 'Frontier whose registry and entrance cells are edited', onchange: (e) => { D.frontierId = e.target.value; D.selectedId = null; D.ctx.navigate(`dungeons/${D.frontierId}`); } },
    D.frontiers.length ? D.frontiers.map((f) => el('option', { value: idOf(f), selected: idOf(f) === String(D.frontierId) }, f.name)) : [el('option', { value: '' }, 'no frontiers')]);
  s.appendChild(el('div', { class: 'row' }, [el('label', {}, 'Frontier'), frontierSel]));

  s.appendChild(el('h3', {}, 'Create from template'));
  const tplSel = el('select', { onchange: (e) => { D.createTemplate = e.target.value; } }, [
    el('option', { value: '' }, 'Select template…'),
    ...D.templates.map((t) => el('option', { value: t, selected: D.createTemplate === t }, t)),
  ]);
  s.appendChild(el('div', { class: 'row' }, [tplSel, el('button', { class: 'primary', disabled: D.busy || !D.createTemplate || !D.frontierId, onclick: createDungeon }, D.busy ? 'Working…' : '+ Create')]));
  s.appendChild(el('div', { class: 'note' }, 'Templates are the files in game-server/layouts/gridLayouts/dungeon/. Design new ones in the Layouts tab (dungeon directory).'));

  const mine = D.grids.filter((g) => idOf(g.frontierId) === String(D.frontierId));
  const others = D.grids.filter((g) => idOf(g.frontierId) !== String(D.frontierId));
  s.appendChild(el('h3', {}, `Template grids (${mine.length})`));
  const list = el('ul', { class: 'list' });
  const item = (g, foreign) => {
    const id = idOf(g);
    const cfg = configFor(id);
    return el('li', { class: [D.selectedId === id && 'active', foreign && 'muted'].filter(Boolean).join(' '), title: id, onclick: () => D.ctx.navigate(`dungeons/${D.frontierId}/${id}`) }, [
      el('span', {}, [el('span', { class: 'mono' }, shortId(id)), ' ', cfg.templateUsed || el('em', {}, 'no template')]),
      cfg.hasChanges ? el('span', { class: 'badge warn' }, 'unsaved') : null,
    ]);
  };
  for (const g of mine) list.appendChild(item(g, false));
  if (!mine.length) list.appendChild(el('li', { class: 'muted' }, 'no dungeon grids in this frontier'));
  s.appendChild(list);
  if (others.length) {
    s.appendChild(el('h3', {}, `Other or unassigned frontier (${others.length})`));
    const list2 = el('ul', { class: 'list' });
    for (const g of others) list2.appendChild(item(g, true));
    s.appendChild(list2);
  }
}

// ----------------------------------------------------------------------------- editor space
function renderEditor() {
  const root = clear(D.els.editor);
  const id = D.selectedId;
  const grid = id ? gridById(id) : null;
  if (!grid) {
    root.appendChild(el('div', { class: 'toolbar' }, [el('strong', {}, 'Dungeons'), el('span', { class: 'spacer' }), el('button', { onclick: () => reload() }, '↻ Reload')]));
    root.appendChild(el('div', { class: 'stub' }, D.grids.length ? 'Choose a dungeon template grid on the left, or create one.' : 'No dungeon template grids yet. Create one from a template on the left.'));
    return;
  }
  const cfg = configFor(id);
  const reg = registryEntry(id);
  const foreign = idOf(grid.frontierId) !== String(D.frontierId);

  const tb = el('div', { class: 'toolbar' }, [
    el('strong', { class: 'mono', title: id }, id),
    el('span', { class: 'badge' }, `created ${fmtDate(grid.createdAt)}`),
    cfg.hasChanges ? el('span', { class: 'badge warn' }, 'unsaved') : el('span', { class: 'badge' }, 'saved'),
    el('span', { class: 'spacer' }),
    el('button', { onclick: () => reload(), disabled: D.busy }, '↻ Reload'),
    el('button', { class: 'primary', disabled: D.busy || !cfg.hasChanges, onclick: () => saveConfig(id), title: 'POST /api/update-dungeon-config' }, 'Save config'),
    el('button', { disabled: D.busy, onclick: () => resetDungeon(id), title: 'POST /api/reset-dungeon: regenerate resources and NPCs from the template' }, '🔄 Reset grid'),
    el('button', { class: 'danger', disabled: D.busy, onclick: () => deleteDungeon(id), title: 'DELETE /api/delete-dungeon/:gridId' }, '🗑 Delete'),
  ]);
  const body = el('div', { class: 'tab-body' });
  root.append(tb, body);

  if (foreign) body.appendChild(el('div', { class: 'note warn-note' }, `This grid belongs to frontier "${frontierName(grid.frontierId)}" but the registry you are editing is frontier "${frontierName(D.frontierId)}". Switch the frontier picker to edit its own registry entry.`));
  if (!reg) body.appendChild(el('div', { class: 'note warn-note' }, `No registry entry for this grid in frontier "${frontierName(D.frontierId)}" (frontier.dungeons). Saving creates one with the fields below.`));

  // registry (read only)
  body.appendChild(el('h3', {}, 'Registry (frontier.dungeons)'));
  body.appendChild(el('div', { class: 'kv mono' }, [
    el('span', {}, 'frontier'), el('span', {}, frontierName(grid.frontierId)),
    el('span', {}, 'settlementId'), el('span', {}, idOf(grid.settlementId) || 'n/a'),
    el('span', {}, 'createdAt'), el('span', {}, fmtDate(reg?.createdAt || grid.createdAt)),
    el('span', {}, 'lastReset'), el('span', {}, fmtDate(reg?.lastReset)),
    el('span', {}, 'needsReset'), el('span', {}, reg ? String(!!reg.needsReset) : 'n/a'),
    el('span', {}, 'sourceValleyGrid'), el('span', {}, reg?.sourceValleyGrid || 'null'),
  ]));

  // template
  body.appendChild(el('h3', {}, 'Template used'));
  const tplSel = el('select', { disabled: D.busy, onchange: (e) => setEdit(id, { templateUsed: e.target.value }) }, [
    el('option', { value: '' }, 'Select…'),
    ...D.templates.map((t) => el('option', { value: t, selected: cfg.templateUsed === t }, t)),
    cfg.templateUsed && !D.templates.includes(cfg.templateUsed) ? el('option', { value: cfg.templateUsed, selected: true }, `${cfg.templateUsed} (file missing)`) : null,
  ]);
  body.appendChild(el('div', { class: 'row' }, [tplSel, el('span', { class: 'note' }, 'Used by Reset when the grid has no templateKey, and by per-player copies.')]));

  // entrances
  body.appendChild(el('h3', {}, `Entrance cells (${cfg.entranceGridCoords.length})`));
  body.appendChild(el('div', { class: 'note' }, 'Town/valley cells whose Dungeon Entrance resource leads into this dungeon, keyed by gridCoord. Adding a cell checks the live template grid for the resource; Save re-validates on the server.'));
  const chips = el('div', { class: 'chips' }, cfg.entranceGridCoords.length ? cfg.entranceGridCoords.map((c) => el('span', { class: 'chip' }, [
    formatGridCoord(c), ' ',
    el('button', { class: 'chip-x', title: `Remove ${c}`, disabled: D.busy, onclick: () => removeEntrance(id, c) }, '×'),
  ])) : [el('span', { class: 'muted' }, 'None')]);
  body.appendChild(chips);
  const addable = entranceCells().filter((c) => !cfg.entranceGridCoords.includes(c.gridCoord));
  const addSel = el('select', { disabled: D.busy, onchange: (e) => { D.addCoord = e.target.value; addBtn.disabled = !D.addCoord; } }, [
    el('option', { value: '' }, addable.length ? 'Select cell…' : 'No created town/valley cells in this frontier'),
    ...addable.map((c) => el('option', { value: c.gridCoord, selected: String(D.addCoord) === String(c.gridCoord) }, `${formatGridCoord(c.gridCoord)} ${c.gridType} · ${c.settlement}`)),
  ]);
  const addBtn = el('button', { disabled: D.busy || !D.addCoord, onclick: () => addEntrance(id, D.addCoord) }, 'Add cell');
  body.appendChild(el('div', { class: 'row', style: { marginTop: '6px' } }, [addSel, addBtn]));
}

// ----------------------------------------------------------------------------- tab
export function dungeonsTab() {
  return {
    id: 'dungeons', label: 'Dungeons', icon: '🏰', group: 'admin',
    async mount(selectionEl, editorEl, ctx, route) {
      D.ctx = ctx; D.els.selection = selectionEl; D.els.editor = editorEl; D.active = true;
      clear(editorEl).appendChild(el('div', { class: 'stub' }, 'Loading dungeons…'));
      const [, frontierId, dungeonId] = route.split('/');
      try {
        if (!D.loaded) await loadWorld();
      } catch (err) {
        clear(editorEl).appendChild(el('div', { class: 'stub' }, `Dungeons failed to load: ${err.message}`));
        return;
      }
      const wanted = frontierId && D.frontiers.some((f) => idOf(f) === frontierId) ? frontierId : D.frontierId;
      const frontierChanged = wanted !== D.frontierId || !D.frontier;
      D.frontierId = wanted;
      D.selectedId = dungeonId || D.selectedId;
      if (frontierChanged || !D.grids.length) await reload();
      else { renderSelection(); renderEditor(); }
    },
    unmount() { D.active = false; },
  };
}
