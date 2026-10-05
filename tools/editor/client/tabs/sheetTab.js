/**
 * Sheet tabs. `sheetTab(defId)` makes a first-class tab (ECONOMY, QUESTS, TRADERS) whose
 * selection panel holds the category chips, column presets and the file note. `sheetsTab()`
 * is the generic tab listing every other definition in its selection panel.
 */
import { el, clear } from '../core/dom.js';
import { local } from '../core/api.js';
import { loadResources } from '../core/resources.js';
import { setDirty } from '../core/dirty.js';
import { toast, confirm } from '../core/ui.js';
import { Sheet } from '../sheet/Sheet.js';
import { DEFINITIONS, byId, toRows, buildRefs } from '/sheets/definitions.js';

const openSheets = new Map(); // defId -> Sheet (kept alive across tab switches so edits survive)

async function refsFor(def) {
  const res = await loadResources();
  let quests = [];
  if (def.id !== 'quests') { try { quests = (await local.tuning('quests')).data; } catch (e) { /* optional */ } }
  return buildRefs({ resources: res.list, quests });
}

async function openSheet(def, selectionEl, editorEl) {
  clear(selectionEl); clear(editorEl);
  selectionEl.appendChild(el('div', { class: 'note' }, 'Loading…'));
  let sheet = openSheets.get(def.id);
  if (!sheet) {
    const [{ data }, refs] = await Promise.all([local.tuning(def.id), refsFor(def)]);
    sheet = new Sheet({
      def, rows: toRows(def, data), refs,
      mountEl: editorEl,
      onDirty: (d) => setDirty(`sheet:${def.id}`, def.label, d),
      onSave: (payload) => local.saveTuning(def.id, payload),
    });
    openSheets.set(def.id, sheet);
  }
  sheet.mountEl = editorEl;
  sheet.render();
  renderSelection(def, sheet, selectionEl);
}

function renderSelection(def, sheet, selectionEl) {
  const s = clear(selectionEl);
  s.appendChild(el('h2', {}, def.label));
  s.appendChild(el('div', { class: 'note mono' }, def.file));
  s.appendChild(el('div', { class: 'note' }, def.description));
  if (def.restartNeeded) s.appendChild(el('div', { class: 'note' }, '⚠ The game server caches this file: restart it after saving.'));

  if (def.categoryKey) {
    s.appendChild(el('h3', {}, def.categoryKey));
    const chips = el('div', { class: 'chips' });
    const draw = () => {
      clear(chips);
      chips.appendChild(el('span', { class: `chip ${sheet.chip === null ? 'on' : ''}`, onclick: () => { sheet.setChip(null); draw(); } }, `all (${sheet.rows.length})`));
      for (const { value, count } of sheet.categories()) {
        chips.appendChild(el('span', { class: `chip ${sheet.chip === value ? 'on' : ''}`, onclick: () => { sheet.setChip(value); if (def.presetsFromData) { sheet.setPreset(sheet.presets()[value] || null); presetSel.value = value; } draw(); } }, `${value ?? '∅'} (${count})`));
      }
    };
    s.appendChild(chips);
    draw();
  }

  s.appendChild(el('h3', {}, 'Columns'));
  const presets = sheet.presets();
  const presetSel = el('select', { onchange: (e) => sheet.setPreset(e.target.value === 'all' ? null : presets[e.target.value]) },
    Object.keys(presets).map((k) => el('option', { value: k }, k === 'all' ? 'All columns' : `${k} columns`)));
  s.appendChild(presetSel);
  if (!def.presetsFromData) presetSel.disabled = true;

  s.appendChild(el('h3', {}, 'Keys'));
  s.appendChild(el('div', { class: 'note' }, [
    el('div', {}, ['Click a cell, then type or press ', el('kbd', {}, 'Enter'), ' to edit; ', el('kbd', {}, 'Tab'), ' / arrows move; ', el('kbd', {}, 'Delete'), ' clears (removes the key).']),
    el('div', {}, [el('kbd', {}, '⌘Z'), ' undo, ', el('kbd', {}, '⇧⌘Z'), ' redo, ', el('kbd', {}, '⌘S'), ' save.']),
    el('div', {}, 'Paste a block copied from the Google Sheet onto the selected cell to fill from there.'),
  ]));
  s.appendChild(el('div', { class: 'row', style: { marginTop: '10px' } }, [
    el('button', { onclick: async () => { if (await confirm('Reload from disk and discard unsaved edits?', { danger: true, okLabel: 'Reload' })) { openSheets.delete(def.id); const tabCtx = currentCtx; tabCtx.navigate(location.hash.slice(1)); } } }, 'Reload from disk'),
  ]));
}

let currentCtx = null;

export function sheetTab(defId, icon) {
  const def = byId(defId);
  return {
    id: def.id, label: def.label, icon, group: def.group,
    async mount(selectionEl, editorEl, ctx) {
      currentCtx = ctx;
      try { await openSheet(def, selectionEl, editorEl); }
      catch (err) { clear(editorEl).appendChild(el('div', { class: 'stub' }, `Could not load ${def.file}: ${err.message}`)); toast(err.message, 'error'); }
    },
    unmount() {},
  };
}

export function sheetsTab() {
  return {
    id: 'sheets', label: 'Sheets', icon: '▦', group: 'sheets',
    async mount(selectionEl, editorEl, ctx, route) {
      currentCtx = ctx;
      const others = DEFINITIONS.filter((d) => d.group === 'sheets');
      const list = el('ul', { class: 'list' });
      const current = route?.split('/')[1] || null;
      clear(selectionEl).append(el('h2', {}, 'Tuning files'), el('div', { class: 'note' }, 'Every other JSON export the game reads. Pick one to edit it as a sheet.'), list);
      for (const d of others) {
        list.appendChild(el('li', { class: current === d.id ? 'active' : '', onclick: () => ctx.navigate(`sheets/${d.id}`) }, [el('span', {}, d.label), el('span', { class: 'muted mono' }, d.file.split('/').pop())]));
      }
      if (current && byId(current)) {
        const def = byId(current);
        const sub = el('div', { style: { display: 'flex', flexDirection: 'column', height: '100%' } });
        clear(editorEl).appendChild(sub);
        const detail = el('div');
        selectionEl.appendChild(el('hr'));
        selectionEl.appendChild(detail);
        try { await openSheet(def, detail, sub); }
        catch (err) { clear(sub).appendChild(el('div', { class: 'stub' }, `Could not load ${def.file}: ${err.message}`)); }
      } else {
        clear(editorEl).appendChild(el('div', { class: 'stub' }, 'Choose a file on the left.'));
      }
    },
    unmount() {},
  };
}
