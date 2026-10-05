/**
 * Layouts tab: the grid layout editor (parity with game-editor/src/GridEditor.jsx).
 *
 * Selection panel: directory, file list, new layout. Editing space: toolbar (file, grid type,
 * undo/redo, save), canvas, and a tools column (brush, selected tile, templates, tile
 * distribution + generation, enemies, resources). Route: #layouts/<dir>/<name>[?type=valley2]
 */
import { el, clear, clone, debounce } from '../core/dom.js';
import { local } from '../core/api.js';
import { loadResources } from '../core/resources.js';
import { setDirty } from '../core/dirty.js';
import { History } from '../core/history.js';
import { modal, confirm, prompt, toast, setStatus } from '../core/ui.js';
import { tileColors } from '/game-client/tileColors.js';
import * as M from '../layouts/GridModel.js';
import { GridCanvas } from '../layouts/GridCanvas.js';

const DIRS = ['valleyFixedCoord', 'town', 'dungeon', 'homestead', 'miniTemplates'];
const GRID_TYPES = ['valley0', 'valley1', 'valley2', 'valley3', 'town', 'homestead', 'dungeon'];
const SHORTCUT_HELP = 'Click: select. Click again: cycle tile. Letter keys paint the tile with the brush (g d s w p l n o x y z c v u). Delete: remove resource, else clear tile. Arrows move. ⌘C/⌘V copy/paste resource. ⌘Z / ⇧⌘Z undo/redo. ⌘S save.';

const T = {
  idx: null, canvas: null, history: new History(50),
  dir: 'valleyFixedCoord', name: null, gridType: 'valley1',
  state: null, loaded: null,         // state = { grid, tileDistribution, resourceDistribution, enemiesDistribution }; loaded = snapshot at load
  selected: null, copied: null,
  tileSize: 14, brush: { size: 1, shape: 'square', scatter: 20 }, clump: { ...M.DEFAULT_CLUMP },
  deleteTypes: Object.fromEntries(M.TILE_KEYS.map((k) => [k, true])),
  templates: [], miniTemplates: [], dirs: {},
  els: {},
};

// ----------------------------------------------------------------------------- state helpers
function commit(next, { rerenderTools = false } = {}) {
  T.history.push(T.state);
  T.state = { ...T.state, ...next };
  afterChange(rerenderTools);
}
function afterChange(rerenderTools) {
  T.canvas?.setState({ grid: T.state.grid, selected: T.selected });
  const dirty = JSON.stringify(M.toLayout(T.state, T.idx)) !== JSON.stringify(T.loaded);
  setDirty('layout', `${T.dir}/${T.name}`, dirty);
  T.els.dirtyBadge && (T.els.dirtyBadge.textContent = dirty ? 'unsaved' : 'saved');
  T.els.btnUndo && (T.els.btnUndo.disabled = !T.history.canUndo);
  T.els.btnRedo && (T.els.btnRedo.disabled = !T.history.canRedo);
  T.els.btnSave && (T.els.btnSave.disabled = !dirty);
  if (rerenderTools) renderTools();
  renderSelectedTile();
}
function undo() { const s = T.history.undo(T.state); if (s) { T.state = s; afterChange(true); } }
function redo() { const s = T.history.redo(T.state); if (s) { T.state = s; afterChange(true); } }
function select(row, col) { T.selected = { row, col }; T.canvas.setState({ selected: T.selected }); renderSelectedTile(); }

async function loadLayout(dir, name) {
  const layout = await local.layout(dir, name);
  T.dir = dir; T.name = name;
  T.state = M.fromLayout(layout, T.idx);
  for (const e of T.idx.enemies) if (T.state.enemiesDistribution[e.type] === undefined) T.state.enemiesDistribution[e.type] = 0;
  T.loaded = M.toLayout(T.state, T.idx);
  T.history.clear();
  T.selected = null;
  if (dir === 'town' || dir === 'homestead' || dir === 'dungeon') T.gridType = dir;
  setStatus(`${dir}/${name}`);
}
function newLayout(dir, name) {
  T.dir = dir; T.name = name;
  T.state = { grid: M.emptyGrid(), tileDistribution: { ...M.DEFAULT_TILE_DISTRIBUTION }, resourceDistribution: {}, enemiesDistribution: Object.fromEntries(T.idx.enemies.map((e) => [e.type, 0])) };
  T.loaded = null;
  T.history.clear();
  T.selected = null;
}
async function save() {
  if (!T.name) return;
  const layout = M.toLayout(T.state, T.idx);
  try {
    const res = await local.saveLayout(T.dir, T.name, layout);
    T.loaded = layout;
    afterChange(false);
    const w = res.written[0];
    toast(w.changed ? `Saved ${w.path}` : `${w.path} unchanged`);
    if (!T.dirs[T.dir]?.includes(T.name)) { T.dirs = (await local.layouts()).dirs; renderSelection(); }
  } catch (err) {
    const problems = err.body?.problems;
    modal({ title: 'Save rejected', body: el('div', {}, [el('p', {}, err.message), problems ? el('pre', { class: 'mono' }, problems.join('\n')) : null]) });
  }
}

// ----------------------------------------------------------------------------- keyboard
function onKey(e) {
  const a = document.activeElement;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT')) return;
  if (!T.state || !T.active) return;
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.toLowerCase();
  if (mod && key === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
  if (mod && key === 's') { e.preventDefault(); save(); return; }
  if (!T.selected) return;
  const { row, col } = T.selected;
  if (mod && key === 'c') { e.preventDefault(); const r = T.state.grid[row][col].resource; if (r) { T.copied = r; toast(`Copied ${r}`); } return; }
  if (mod && key === 'v') { e.preventDefault(); if (T.copied) commit({ grid: M.setResource(T.state.grid, row, col, T.copied) }); return; }
  if (mod) return;
  if (key.startsWith('arrow')) {
    e.preventDefault();
    const d = { arrowup: [-1, 0], arrowdown: [1, 0], arrowleft: [0, -1], arrowright: [0, 1] }[key];
    select(Math.max(0, Math.min(M.GRID_SIZE - 1, row + d[0])), Math.max(0, Math.min(M.GRID_SIZE - 1, col + d[1])));
    return;
  }
  const cells = () => M.brushTiles(row, col, T.brush.size, T.brush.shape, T.brush.scatter);
  if (key === 'backspace' || key === 'delete') { e.preventDefault(); commit({ grid: M.eraseCells(T.state.grid, cells()) }); return; }
  const tile = T.idx.tileByType.get(key);
  if (tile) { e.preventDefault(); commit({ grid: M.paintType(T.state.grid, cells(), tile.layoutkey) }); }
}

// ----------------------------------------------------------------------------- selection panel
function renderSelection() {
  const s = clear(T.els.selection);
  s.appendChild(el('h2', {}, 'Layouts'));
  const dirSel = el('select', { onchange: (e) => { T.dirView = e.target.value; renderSelection(); } }, DIRS.map((d) => el('option', { value: d, selected: (T.dirView || T.dir) === d }, `${d} (${(T.dirs[d] || []).length})`)));
  const filter = el('input', { placeholder: 'Filter…', value: T.filter || '', oninput: (e) => { T.filter = e.target.value; drawList(); } });
  s.appendChild(el('div', { class: 'row' }, [dirSel]));
  s.appendChild(el('div', { class: 'row', style: { margin: '6px 0' } }, [filter, el('button', { onclick: createNew, title: 'Start an empty layout in this directory' }, '+ New')]));
  const list = el('ul', { class: 'list' });
  const drawList = () => {
    clear(list);
    const dir = T.dirView || T.dir;
    const names = (T.dirs[dir] || []).filter((n) => !T.filter || n.toLowerCase().includes(T.filter.toLowerCase()));
    for (const n of names) list.appendChild(el('li', { class: T.dir === dir && T.name === n ? 'active' : '', onclick: () => T.ctx.navigate(`layouts/${dir}/${encodeURIComponent(n)}`) }, n));
    if (!names.length) list.appendChild(el('li', { class: 'muted' }, 'no layouts'));
  };
  drawList();
  s.appendChild(list);
  s.appendChild(el('h3', {}, 'Keys'));
  s.appendChild(el('div', { class: 'note' }, SHORTCUT_HELP));
}
async function createNew() {
  const dir = T.dirView || T.dir;
  const name = await prompt(`New layout file in ${dir}/ (no extension). Valley grids are named by their coordinate.`, { title: 'New layout' });
  if (!name) return;
  if (!/^[A-Za-z0-9_.-]{1,80}$/.test(name)) return toast('Use letters, digits, _ . - only', 'error');
  if ((T.dirs[dir] || []).includes(name)) return toast('That layout already exists', 'error');
  newLayout(dir, name);
  T.ctx.navigate(`layouts/${dir}/${encodeURIComponent(name)}?new=1`);
}

// ----------------------------------------------------------------------------- editor space
function renderEditor() {
  const root = clear(T.els.editor);
  if (!T.state) { root.appendChild(el('div', { class: 'stub' }, 'Choose a layout on the left, or create one.')); return; }
  const tb = el('div', { class: 'toolbar' });
  T.els.btnUndo = el('button', { onclick: undo, title: '⌘Z' }, '↶ Undo');
  T.els.btnRedo = el('button', { onclick: redo, title: '⇧⌘Z' }, '↷ Redo');
  T.els.btnSave = el('button', { class: 'primary', onclick: save, title: '⌘S' }, 'Save');
  T.els.dirtyBadge = el('span', { class: 'badge' }, '');
  const typeSel = el('select', { title: 'Grid type (which randomValleyGridLayouts rows feed the templates)', onchange: (e) => { T.gridType = e.target.value; renderTools(); } }, GRID_TYPES.map((t) => el('option', { value: t, selected: T.gridType === t }, t)));
  const sizeSlider = el('input', { type: 'range', min: 6, max: 40, value: T.tileSize, title: 'Tile size', oninput: (e) => { T.tileSize = Number(e.target.value); T.canvas.setState({ tileSize: T.tileSize }); } });
  tb.append(
    el('strong', { class: 'mono' }, `${T.dir}/${T.name}.json`),
    el('span', { class: 'muted' }, 'type'), typeSel,
    T.els.btnUndo, T.els.btnRedo,
    el('button', { class: 'danger', onclick: async () => { if (await confirm('Delete this layout file? (kept as .bak)', { danger: true, okLabel: 'Delete' })) { await local.deleteLayout(T.dir, T.name); T.dirs = (await local.layouts()).dirs; T.state = null; T.name = null; setDirty('layout', '', false); T.ctx.navigate('layouts'); } } }, 'Delete file'),
    el('span', { class: 'spacer' }),
    el('span', { class: 'muted' }, 'zoom'), sizeSlider,
    T.els.btnSave, T.els.dirtyBadge,
  );
  const canvasWrap = el('div', { class: 'grid-canvas-wrap' });
  const tools = el('div', { class: 'grid-tools' });
  T.els.tools = tools;
  root.append(tb, el('div', { class: 'grid-body' }, [canvasWrap, tools]));
  T.canvas = new GridCanvas(canvasWrap, {
    idx: T.idx, tileColors,
    onCellClick: (row, col) => {
      if (T.selected && T.selected.row === row && T.selected.col === col) commit({ grid: M.cycleType(T.state.grid, row, col, T.idx) });
      else select(row, col);
    },
  });
  T.canvas.setState({ grid: T.state.grid, selected: T.selected, tileSize: T.tileSize, brush: T.brush });
  renderTools();
  afterChange(false);
}

function section(title, children) { return el('div', { class: 'tool-section' }, [el('h3', {}, title), ...children]); }

function renderTools() {
  const t = clear(T.els.tools);
  const st = T.state;
  const idx = T.idx;

  // brush
  const scatterRow = el('div', { class: 'row', style: { display: T.brush.shape === 'scatter' ? '' : 'none' } }, [
    el('label', {}, 'scatter %'), el('input', { type: 'range', min: 1, max: 100, value: T.brush.scatter, oninput: (e) => { T.brush.scatter = Number(e.target.value); scatterVal.textContent = `${T.brush.scatter}%`; } }),
  ]);
  const scatterVal = el('span', { class: 'mono' }, `${T.brush.scatter}%`);
  scatterRow.appendChild(scatterVal);
  const brushVal = el('span', { class: 'mono' }, String(T.brush.size));
  t.appendChild(section('Brush', [
    el('div', { class: 'row' }, [el('label', {}, 'size'), el('input', { type: 'range', min: 1, max: 13, value: T.brush.size, oninput: (e) => { T.brush.size = Number(e.target.value); brushVal.textContent = String(T.brush.size); T.canvas.setState({ brush: T.brush }); } }), brushVal]),
    el('div', { class: 'row' }, ['square', 'circle', 'scatter'].map((sh) => el('label', {}, [el('input', { type: 'radio', name: 'brushShape', value: sh, checked: T.brush.shape === sh, onchange: () => { T.brush.shape = sh; scatterRow.style.display = sh === 'scatter' ? '' : 'none'; T.canvas.setState({ brush: T.brush }); } }), ` ${sh}`]))),
    scatterRow,
  ]));

  // selected tile
  T.els.selectedBox = el('div');
  t.appendChild(section('Selected tile', [T.els.selectedBox]));
  renderSelectedTile();

  // templates + quick generate
  t.appendChild(section('Templates', [
    el('div', { class: 'row' }, [
      el('button', { class: 'primary', onclick: quickGen, title: 'Random template row for this grid type: drop tiles (keep water + pavement) and resources, regenerate tiles, resources and enemies' }, '⚡ Quick Generate'),
      el('button', { onclick: pickTemplate }, `Sliders from ${T.gridType} template…`),
    ]),
    el('div', { class: 'note' }, `${T.templates.filter((r) => r.valleyType === T.gridType).length} rows for ${T.gridType} in randomValleyGridLayouts.json`),
  ]));

  // tiles
  const sliderEls = {};
  const sliders = M.TILE_KEYS.map((k) => {
    const val = el('span', { class: 'mono', style: { minWidth: '36px', textAlign: 'right' } }, `${st.tileDistribution[k] ?? 0}%`);
    const input = el('input', { type: 'range', min: 0, max: 100, value: st.tileDistribution[k] ?? 0, style: { accentColor: tileColors[k] }, oninput: (e) => {
      T.state.tileDistribution = M.adjustTileDistribution(T.state.tileDistribution, k, Number(e.target.value));
      for (const [kk, v] of Object.entries(T.state.tileDistribution)) { const row = sliderEls[kk]; if (row) { row.input.value = v; row.val.textContent = `${v}%`; } }
      afterChange(false);
    } });
    const tile = idx.tileByType.get(k);
    sliderEls[k] = { input, val };
    return el('div', { class: 'row slider-row' }, [el('span', { class: 'swatch', style: { background: tileColors[k] }, title: tile?.layoutkey || k }, k), input, val]);
  });
  t.appendChild(section('Tiles', [
    el('div', { class: 'row' }, [
      el('button', { onclick: () => commit({ grid: M.generateTilesBlanksOnly(st.grid, st.tileDistribution, idx, T.clump) }) }, 'Generate (blanks only)'),
      el('button', { onclick: () => commit({ grid: M.generateTilesOverwriteAll(st.grid, st.tileDistribution, idx, T.clump) }) }, 'Generate (overwrite all)'),
    ]),
    ...sliders,
    el('div', { class: 'row', style: { marginTop: '6px' } }, [
      el('span', { class: 'muted' }, 'clumps'),
      ...[['clumpSize', 'size'], ['clumpVariation', 'var'], ['minClumpSize', 'min'], ['clumpTightness', 'tight']].map(([k, label]) => el('label', { class: 'mini' }, [label, el('input', { type: 'number', step: k === 'clumpTightness' ? 0.1 : 1, min: k === 'clumpVariation' ? 0 : 0.1, value: T.clump[k], style: { width: '48px' }, onchange: (e) => { T.clump[k] = Number(e.target.value) || T.clump[k]; } })])),
    ]),
    el('div', { class: 'row', style: { marginTop: '6px' } }, [
      el('button', { class: 'danger', onclick: () => commit({ grid: M.clearTileTypes(st.grid, M.TILE_KEYS.filter((k) => T.deleteTypes[k]), idx) }) }, 'Delete checked tile types'),
      el('button', { class: 'danger', onclick: async () => { if (await confirm('Clear every tile and resource?', { danger: true, okLabel: 'Clear grid' })) { T.selected = null; commit({ grid: M.clearAll() }); } } }, 'Clear grid'),
    ]),
    el('div', { class: 'chips' }, M.TILE_KEYS.map((k) => el('label', { class: 'chip', style: { borderColor: tileColors[k] } }, [el('input', { type: 'checkbox', checked: T.deleteTypes[k], onchange: (e) => { T.deleteTypes[k] = e.target.checked; } }), ` ${k}`]))),
  ]));

  // enemies
  t.appendChild(section('Enemies', [
    el('div', { class: 'row' }, [
      el('button', { onclick: () => { const r = M.generateEnemies(st.grid, st.enemiesDistribution, idx); if (!r.requested) return toast('Set enemy quantities first', 'warn'); commit({ grid: r.grid }); if (r.placed < r.requested) toast(`Placed ${r.placed} of ${r.requested} enemies (tile validity / space)`, 'warn'); } }, 'Populate random enemies'),
      el('button', { class: 'danger', onclick: async () => { if (await confirm('Remove all enemies from the grid?', { danger: true, okLabel: 'Remove' })) commit({ grid: M.clearEnemies(st.grid, idx) }); } }, 'Clear all enemies'),
    ]),
    ...idx.enemies.map((e) => qtyRow(e, st.enemiesDistribution)),
  ]));

  // resources
  const resRows = idx.placeable.map((r) => qtyRow(r, st.resourceDistribution));
  t.appendChild(section('Resources', [
    el('div', { class: 'row' }, [
      el('button', { onclick: () => { const r = M.generateResources(st.grid, st.resourceDistribution, idx, true); commit({ grid: r.grid }); if (r.unplaced) toast(`${r.unplaced} resources could not be placed (tile validity)`, 'warn'); } }, 'Regenerate (clear + repopulate)'),
      el('button', { onclick: () => { const r = M.generateResources(st.grid, st.resourceDistribution, idx, false); commit({ grid: r.grid }); if (r.unplaced) toast(`${r.unplaced} resources could not be placed (tile validity)`, 'warn'); } }, 'Add (keep existing)'),
    ]),
    el('div', { class: 'row' }, [
      el('button', { class: 'danger', onclick: () => commit({ grid: M.clearResources(st.grid) }) }, 'Delete all resources'),
      el('button', { class: 'danger', onclick: () => commit({ grid: M.clearResourcesOfTypes(st.grid, ['Tulip', 'Mushroom']) }) }, 'Delete Tulips + Mushrooms'),
    ]),
    el('input', { placeholder: 'filter resources…', oninput: debounce((e) => { const f = e.target.value.toLowerCase(); for (const r of resRows) r.style.display = !f || r.dataset.type.toLowerCase().includes(f) ? '' : 'none'; }, 80) }),
    ...resRows,
  ]));
}

function qtyRow(res, dist) {
  const input = el('input', { type: 'number', min: 0, value: dist[res.type] || '', style: { width: '56px' }, onchange: (e) => { dist[res.type] = e.target.value === '' ? 0 : parseInt(e.target.value, 10) || 0; afterChange(false); } });
  return el('div', { class: 'row qty-row', dataset: { type: res.type } }, [input, el('span', {}, `${res.symbol || ''} ${res.type}`)]);
}

function renderSelectedTile() {
  const box = T.els.selectedBox;
  if (!box) return;
  clear(box);
  if (!T.selected) { box.appendChild(el('div', { class: 'note' }, 'Click a cell to select it.')); return; }
  const { row, col } = T.selected;
  const cell = T.state.grid[row][col];
  const tile = T.idx.tileByLayoutKey.get(cell.type);
  box.appendChild(el('div', { class: 'mono' }, `row ${row}, col ${col}: ${tile ? `${tile.layoutkey} (${tile.type})` : 'none'}; ${cell.resource || 'no resource'}`));
  const mkSelect = (label, items, icon) => {
    const sel = el('select', { onchange: (e) => { commit({ grid: M.setResource(T.state.grid, row, col, e.target.value) }); } }, [el('option', { value: '' }, 'None'), ...items.map((r) => el('option', { value: r.type, selected: cell.resource === r.type }, `${icon ? icon : r.symbol || ''} ${r.type}`))]);
    return el('div', { class: 'row' }, [el('label', { style: { minWidth: '70px' } }, label), sel]);
  };
  box.appendChild(mkSelect('Resource', T.idx.placeable));
  box.appendChild(mkSelect('NPC', T.idx.npcs));
  const tmpl = el('select', { onchange: async (e) => {
    const name = e.target.value; if (!name) return;
    const template = await local.layout('miniTemplates', name);
    commit({ grid: M.placeTemplate(T.state.grid, row, col, template, T.idx) });
    e.target.value = '';
  } }, [el('option', { value: '' }, 'Place mini template…'), ...T.miniTemplates.map((n) => el('option', { value: n }, `🏰 ${n}`))]);
  box.appendChild(el('div', { class: 'row' }, [el('label', { style: { minWidth: '70px' } }, 'Template'), tmpl]));
}

async function quickGen() {
  const rows = T.templates.filter((r) => r.valleyType === T.gridType);
  if (!rows.length) return toast(`No randomValleyGridLayouts rows for ${T.gridType}`, 'warn');
  const { state, template } = M.quickGenerate(T.state, rows, T.idx, T.clump);
  commit(state, { rerenderTools: true });
  toast(`Quick Generate from "${template.layout}"`);
}
function pickTemplate() {
  const rows = T.templates.filter((r) => r.valleyType === T.gridType);
  if (!rows.length) return toast(`No randomValleyGridLayouts rows for ${T.gridType}`, 'warn');
  const apply = (rowData, close) => {
    const d = M.distributionsFromTemplateRow(rowData, T.idx);
    if (!Object.keys(d).length) return toast('That row has no distribution data', 'warn');
    commit(d, { rerenderTools: true });
    toast(`Sliders set from "${rowData.layout}"`);
    close();
  };
  modal({
    title: `Select template (${T.gridType})`,
    body: el('div', { class: 'row', style: { flexDirection: 'column', alignItems: 'stretch' } }, [
      el('button', { class: 'primary', onclick: () => apply(rows[Math.floor(Math.random() * rows.length)], m.close) }, '🎲 Random'),
      ...rows.map((r) => el('button', { title: r.description || '', onclick: () => apply(r, m.close) }, `${r.layout}${r.description ? ` · ${r.description}` : ''}`)),
    ]),
    buttons: [{ label: 'Cancel' }],
  });
  var m = { close: () => document.querySelector('#modal-root .overlay')?.remove() };
}

// ----------------------------------------------------------------------------- tab
export function layoutsTab() {
  return {
    id: 'layouts', label: 'Layouts', icon: '🗺', group: 'world',
    async mount(selectionEl, editorEl, ctx, route) {
      T.ctx = ctx; T.els.selection = selectionEl; T.els.editor = editorEl; T.active = true;
      if (!T.idx) {
        const [res, layouts, valley] = await Promise.all([loadResources(), local.layouts(), local.randomValley()]);
        T.idx = M.buildIndex(res.list);
        T.dirs = layouts.dirs;
        T.miniTemplates = layouts.dirs.miniTemplates || [];
        T.templates = valley;
        window.addEventListener('keydown', onKey);
      }
      const [, dir, rawName] = route.split('/');
      const [name, query] = (rawName || '').split('?');
      const params = new URLSearchParams(query || '');
      if (params.get('type')) T.gridType = params.get('type');
      if (dir && name && DIRS.includes(dir) && !(T.dir === dir && T.name === decodeURIComponent(name) && T.state)) {
        try { await loadLayout(dir, decodeURIComponent(name)); }
        catch (err) { if (params.get('new')) newLayout(dir, decodeURIComponent(name)); else toast(`Could not load ${dir}/${name}: ${err.message}`, 'error'); }
      }
      T.dirView = dir && DIRS.includes(dir) ? dir : T.dirView;
      renderSelection();
      renderEditor();
    },
    unmount() { T.active = false; },
  };
}
