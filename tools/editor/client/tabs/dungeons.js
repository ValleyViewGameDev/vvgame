/**
 * Dungeons tab: wire dungeon ENTRANCES to dungeon TEMPLATES (owner 2026-11-11).
 *
 * The workflow is: in the Layouts tab, make dungeon templates (dungeon directory, + New) and
 * place Dungeon Entrances on town / fixed-coordinate valley layouts; then come here and pick, for
 * each entrance, the dungeon it leads to.
 *
 * Entrances are read from the layout FILES on this machine (/api/local/dungeon-entrances: how
 * many DIn each layout holds), matched to the selected frontier's town and valley cells (a town
 * cell uses town<N|E|S|W> by its settlement's position, else townN). Wiring is read from and
 * written to the frontier's registry on the game server (Frontier.dungeons) through
 * POST /api/set-dungeon-entrance, which keeps every cell on at most one dungeon and creates a
 * template's registry entry the first time it is used.
 *
 * Flags: a cell holding 2+ entrances (illegal), an entrance leading nowhere, a cell wired to
 * two dungeons, a wired cell whose layout has no entrance, a template file that is missing.
 * Route: #dungeons/<frontierId>
 */
import { el, clear } from '../core/dom.js';
import { local, game } from '../core/api.js';
import { modal, confirm, toast, setStatus } from '../core/ui.js';

const D = {
  ctx: null, els: {}, active: false,
  frontiers: [], settlements: [], templates: [], townLayouts: [],
  counts: { town: {}, valleyFixedCoord: {} },
  frontierId: null,
  frontier: null,
  busyCoord: null,
};

// ----------------------------------------------------------------------------- helpers
const idOf = (v) => String(v?._id || v || '');
const stripJson = (s) => String(s || '').replace(/\.json$/, '');

/** "1011156 (S1,1 G5,6)": the settlement row/col and grid row/col packed into the gridCoord. */
function cellLabel(coord) {
  const ssgg = Number(coord) % 10000;
  return `S${Math.floor(ssgg / 1000)},${Math.floor(ssgg / 100) % 10} G${Math.floor(ssgg / 10) % 10},${ssgg % 10}`;
}

function showError(title, err) {
  modal({ title, body: el('div', {}, [el('p', {}, err?.message || String(err))]) });
}

/** The selected frontier's town and valley cells that hold at least one Dungeon Entrance. */
function entranceCells() {
  const positions = new Map(); // settlementId -> N/E/S/W from the frontier's settlement grid
  for (const entry of (D.frontier?.settlements || []).flat()) {
    if (!entry?.settlementId) continue;
    const m = String(entry.settlementType || '').match(/homesteadSet([NSEW]+)$/);
    positions.set(idOf(entry.settlementId), m ? m[1] : '');
  }
  const cells = [];
  for (const s of D.settlements) {
    if (idOf(s.frontierId) !== String(D.frontierId)) continue;
    for (const cell of (Array.isArray(s.grids) ? s.grids.flat() : [])) {
      if (!cell || cell.gridCoord == null) continue;
      const coord = Number(cell.gridCoord);
      let dir; let file;
      if (cell.gridType === 'town') {
        const pos = positions.get(idOf(s)) || '';
        dir = 'town'; file = pos && D.townLayouts.includes(`town${pos}`) ? `town${pos}` : 'townN';
      } else if (/^valley/.test(cell.gridType || '')) {
        dir = 'valleyFixedCoord'; file = String(coord);
      } else continue;
      const count = D.counts[dir]?.[file] || 0;
      cells.push({ coord, gridType: cell.gridType, settlement: s.displayName || s.name || '', dir, file, count });
    }
  }
  return cells;
}

/** gridCoord -> template names it is wired to, from the frontier registry. */
function wiring() {
  const out = new Map();
  for (const entry of Object.values(D.frontier?.dungeons || {})) {
    const tpl = stripJson(entry.templateUsed);
    for (const c of (entry.entranceGrids || []).map(Number)) {
      if (!Number.isFinite(c)) continue;
      out.set(c, [...new Set([...(out.get(c) || []), tpl])]);
    }
  }
  return out;
}

/** One row per entrance cell plus one per wired cell that no longer has an entrance. */
function buildRows() {
  const wired = wiring();
  const rows = entranceCells().filter((c) => c.count > 0).map((c) => ({ ...c, templates: wired.get(c.coord) || [] }));
  const known = new Set(rows.map((r) => r.coord));
  const allCells = new Map(entranceCells().map((c) => [c.coord, c]));
  for (const [coord, templates] of wired) {
    if (known.has(coord)) continue;
    const c = allCells.get(coord);
    rows.push({ coord, gridType: c?.gridType || '?', settlement: c?.settlement || '', dir: c?.dir, file: c?.file, count: 0, templates, stale: true });
  }
  for (const r of rows) {
    if (r.count > 1) r.status = { level: 'error', text: `${r.count} entrances in this cell: only one is allowed. Remove the extras in Layouts.` };
    else if (r.stale) r.status = { level: 'error', text: c0(r) };
    else if (r.templates.length > 1) r.status = { level: 'error', text: `Wired to ${r.templates.length} dungeons (${r.templates.join(', ')}). Pick one to fix it.` };
    else if (!r.templates.length) r.status = { level: 'warn', text: 'No dungeon assigned: the entrance leads nowhere.' };
    else if (!D.templates.includes(r.templates[0])) r.status = { level: 'error', text: `Template ${r.templates[0]} has no layout file.` };
    else r.status = { level: 'ok', text: 'OK' };
  }
  const order = { error: 0, warn: 1, ok: 2 };
  return rows.sort((a, b) => order[a.status.level] - order[b.status.level] || a.coord - b.coord);
}
function c0(r) {
  return r.dir ? 'Wired, but this cell\'s layout has no Dungeon Entrance. Unlink it, or place one in Layouts.' : 'Wired, but this is not a town or valley cell in this frontier. Unlink it.';
}

// ----------------------------------------------------------------------------- data
async function load() {
  setStatus('Loading dungeons…');
  try { // this machine's layout files first, so the templates list even when the game server is down
    const [layouts, counts] = await Promise.all([
      local.layouts(),
      // an editor server started before this endpoint existed answers 404: say so, keep going
      local.dungeonEntrances().catch((err) => { toast(`Entrances could not be read (${err.message}). Restart the editor server.`, 'error'); return null; }),
    ]);
    D.templates = (layouts.dirs.dungeon || []).filter((t) => t !== 'opening');
    D.townLayouts = layouts.dirs.town || [];
    D.counts = counts || { town: {}, valleyFixedCoord: {} };
    const [frontiers, settlements] = await Promise.all([game.get('/api/frontiers'), game.get('/api/settlements')]);
    D.frontiers = frontiers || [];
    D.settlements = settlements || [];
    if (!D.frontierId || !D.frontiers.some((f) => idOf(f) === D.frontierId)) D.frontierId = D.frontiers.length ? idOf(D.frontiers[0]) : null;
    D.frontier = D.frontierId ? await game.get(`/api/get-frontier/${D.frontierId}`) : null;
    setStatus('');
  } catch (err) {
    setStatus('');
    toast(`Load failed: ${err.message}`, 'error');
  }
  render();
}

/** Wire (template) or unwire (null) one entrance cell, after a confirm. */
async function setEntrance(coord, template) {
  const fname = D.frontiers.find((f) => idOf(f) === D.frontierId)?.name || 'this frontier';
  const msg = template
    ? `Wire the entrance at ${coord} (${cellLabel(coord)}) to the ${template} dungeon in ${fname}?`
    : `Unlink the entrance at ${coord} (${cellLabel(coord)}) in ${fname}? It will lead nowhere.`;
  if (!(await confirm(msg, { title: template ? 'Wire entrance' : 'Unlink entrance', okLabel: template ? 'Wire' : 'Unlink', danger: !template }))) { render(); return; }
  D.busyCoord = coord; render();
  try {
    await game.post('/api/set-dungeon-entrance', { frontierId: D.frontierId, gridCoord: coord, template });
    D.frontier = await game.get(`/api/get-frontier/${D.frontierId}`);
    toast(template ? `${coord} now leads to ${template}` : `${coord} unlinked`);
  } catch (err) { showError('Could not save', err); }
  D.busyCoord = null; render();
}

// ----------------------------------------------------------------------------- render
function render() {
  if (!D.active) return;
  const rows = buildRows();
  renderSelection(rows);
  renderEditor(rows);
}

function renderSelection(rows) {
  const s = clear(D.els.selection);
  s.appendChild(el('h2', {}, 'Dungeons'));
  const frontierSel = el('select', { onchange: (e) => { D.frontierId = e.target.value; D.ctx.navigate(`dungeons/${D.frontierId}`); } },
    D.frontiers.length ? D.frontiers.map((f) => el('option', { value: idOf(f), selected: idOf(f) === String(D.frontierId) }, f.name)) : [el('option', { value: '' }, 'no frontiers')]);
  s.appendChild(el('div', { class: 'row' }, [el('label', {}, 'Frontier'), frontierSel]));

  s.appendChild(el('h3', {}, 'How it works'));
  s.appendChild(el('ol', { class: 'note', style: { paddingLeft: '18px' } }, [
    el('li', {}, 'Layouts tab, dungeon directory, + New: make a dungeon template.'),
    el('li', {}, 'Layouts tab: place one Dungeon Entrance on a town or valley layout.'),
    el('li', {}, 'Here: pick the dungeon each entrance leads to. It saves at once.'),
  ]));

  const n = (lvl) => rows.filter((r) => r.status.level === lvl).length;
  s.appendChild(el('h3', {}, 'Summary'));
  s.appendChild(el('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap' } }, [
    el('span', { class: 'badge' }, `${rows.filter((r) => !r.stale).length} entrances`),
    el('span', { class: 'badge' }, `${n('ok')} wired`),
    n('warn') ? el('span', { class: 'badge warn' }, `${n('warn')} unassigned`) : null,
    n('error') ? el('span', { class: 'badge error' }, `${n('error')} errors`) : null,
  ]));

  s.appendChild(el('h3', {}, `Dungeon templates (${D.templates.length})`));
  const used = new Map();
  for (const r of rows) for (const t of r.templates) used.set(t, (used.get(t) || 0) + 1);
  const list = el('ul', { class: 'list' }, D.templates.map((t) => el('li', { title: 'Open in the Layouts tab', onclick: () => D.ctx.navigate(`layouts/dungeon/${encodeURIComponent(t)}`) }, [
    el('span', {}, t),
    used.get(t) ? el('span', { class: 'badge' }, `${used.get(t)} entrance${used.get(t) > 1 ? 's' : ''}`) : el('span', { class: 'muted' }, 'unused'),
  ])));
  s.appendChild(list);
  s.appendChild(el('div', { class: 'note' }, 'The FTUE opening cave is wired by the game itself and is not listed.'));
}

function renderEditor(rows) {
  const root = clear(D.els.editor);
  root.appendChild(el('div', { class: 'toolbar' }, [
    el('strong', {}, 'Dungeon entrances'),
    el('span', { class: 'spacer' }),
    el('button', { onclick: () => load(), title: 'Re-read the layouts and the frontier registry' }, '↻ Reload'),
  ]));
  const body = el('div', { class: 'tab-body' });
  root.appendChild(body);
  if (!D.frontier) { body.appendChild(el('div', { class: 'stub' }, 'No frontier loaded.')); return; }
  if (!rows.length) { body.appendChild(el('div', { class: 'stub' }, 'No Dungeon Entrances on this frontier\'s town or valley layouts yet. Place one in the Layouts tab.')); return; }

  const tag = { ok: null, warn: 'warn', error: 'error' };
  const table = el('table', { class: 'plain' }, [
    el('thead', {}, el('tr', {}, ['Cell', 'Where', 'Layout', 'Leads to', 'Status'].map((h) => el('th', {}, h)))),
    el('tbody', {}, rows.map((r) => {
      const busy = D.busyCoord === r.coord;
      const current = r.templates.length === 1 ? r.templates[0] : '';
      const sel = el('select', {
        disabled: busy || !!D.busyCoord || r.count > 1,
        onchange: (e) => setEntrance(r.coord, e.target.value || null),
      }, [
        el('option', { value: '', selected: !current }, r.templates.length > 1 ? 'Choose one…' : '(none)'),
        ...D.templates.map((t) => el('option', { value: t, selected: t === current }, t)),
        current && !D.templates.includes(current) ? el('option', { value: current, selected: true }, `${current} (missing)`) : null,
      ]);
      const layoutLink = r.dir
        ? el('a', { href: '#', onclick: (e) => { e.preventDefault(); D.ctx.navigate(`layouts/${r.dir}/${encodeURIComponent(r.file)}`); } }, `${r.dir}/${r.file}`)
        : el('span', { class: 'muted' }, 'n/a');
      return el('tr', {}, [
        el('td', { class: 'mono' }, [String(r.coord), el('div', { class: 'muted' }, cellLabel(r.coord))]),
        el('td', {}, [r.gridType === 'town' ? 'Town' : 'Valley', r.settlement ? el('div', { class: 'muted' }, r.settlement) : null]),
        el('td', {}, layoutLink),
        el('td', {}, [busy ? 'Saving…' : sel, r.stale && r.templates.length ? el('button', { style: { marginLeft: '6px' }, disabled: !!D.busyCoord, onclick: () => setEntrance(r.coord, null) }, 'Unlink') : null]),
        el('td', {}, tag[r.status.level] ? el('span', { class: `badge ${tag[r.status.level]}` }, r.status.text) : el('span', { class: 'muted' }, r.status.text)),
      ]);
    })),
  ]);
  body.appendChild(table);
  if (rows.some((r) => r.gridType === 'town')) {
    body.appendChild(el('div', { class: 'note' }, 'Each settlement has its own Town cell, so a town entrance is wired once per settlement, even when they share one town layout.'));
  }
  body.appendChild(el('div', { class: 'note' }, 'Entrances are read from the layout files on this machine. The game server only accepts a wiring once that layout and the dungeon template are pushed. Players who already have a copy of a cell see a new entrance after that copy is reset.'));
}

// ----------------------------------------------------------------------------- tab
export function dungeonsTab() {
  return {
    id: 'dungeons', label: 'Dungeons', icon: '🏰', group: 'admin',
    async mount(selectionEl, editorEl, ctx, route) {
      D.ctx = ctx; D.els.selection = selectionEl; D.els.editor = editorEl; D.active = true;
      clear(editorEl).appendChild(el('div', { class: 'stub' }, 'Loading dungeons…'));
      const [, frontierId] = route.split('/');
      if (frontierId) D.frontierId = frontierId;
      await load();
    },
    unmount() { D.active = false; },
  };
}
