/**
 * Sheet: a spreadsheet-style editor over one definition (sheets/definitions.js).
 *
 *   const sheet = new Sheet({ def, rows, refs, mountEl, onDirty })
 *   sheet.render(); sheet.getData(); sheet.setFilter(...)
 *
 * Model: `orig` is the on-disk snapshot (rows keyed by an internal __id); `rows` is the live
 * copy. Every mutation goes through history (undo/redo), re-validates and re-renders the
 * affected row. Cells edit in place (click, Enter, Tab, arrows); booleans toggle; enums are
 * selects; json/any open a modal. Immutable columns lock once a row exists in `orig`.
 * Empty cells mean "key absent": committing an empty value deletes the key, so the saved
 * JSON stays as sparse as the Google Sheet export it replaces.
 */
import { el, clear, clone } from '../core/dom.js';
import { History } from '../core/history.js';
import { modal, toast, diffElement } from '../core/ui.js';
import { columnsFor, validateRows, errorSignatures, fromRows } from '/sheets/definitions.js';

let nextId = 1;
const withIds = (rows) => rows.map((r) => (r.__id ? r : { __id: nextId++, ...r }));

export class Sheet {
  constructor({ def, rows, refs, mountEl, onDirty, onSave }) {
    this.def = def;
    this.refs = refs || {};
    this.mountEl = mountEl;
    this.onDirty = onDirty || (() => {});
    this.onSave = onSave || (async () => {});
    this.history = new History(80);
    this.orig = new Map();
    this.rows = [];
    this.filter = '';
    this.chip = null;        // value of categoryKey to show, or null for all
    this.preset = null;      // column keys to show, or null for all
    this.sort = null;        // { key, dir }
    this.sel = null;         // { id, key }
    this.problems = { errors: [], warnings: [] };
    this.load(rows);
  }

  // ---------------------------------------------------------------- state
  load(rows) {
    this.rows = withIds(clone(rows));
    this.orig = new Map(this.rows.map((r) => [r.__id, clone(r)]));
    this.baseline = errorSignatures(this.def, this.rows, this.refs);
    this.history.clear();
    this.validate();
  }
  get columns() { return columnsFor(this.def, this.rows); }
  getData() { return fromRows(this.def, this.rows); }
  isRowDirty(row) {
    const o = this.orig.get(row.__id);
    if (!o) return true;
    return JSON.stringify(stripId(o)) !== JSON.stringify(stripId(row));
  }
  isDirty() { return this.rows.length !== this.orig.size || this.rows.some((r) => this.isRowDirty(r)); }
  rowExistsOnDisk(row) { return this.orig.has(row.__id); }
  validate() {
    const refs = this.refs;
    this.problems = validateRows(this.def, this.rows, refs, this.baseline);
    this.cellProblems = new Map();
    for (const kind of ['errors', 'warnings']) {
      for (const p of this.problems[kind]) {
        const row = this.rows[p.row];
        if (!row) continue;
        const k = `${row.__id}:${p.col}`;
        if (!this.cellProblems.has(k) || kind === 'errors') this.cellProblems.set(k, { kind: kind === 'errors' ? 'error' : 'warn', message: p.message });
      }
    }
  }
  mutate(fn, { rerenderAll = false } = {}) {
    this.history.push(this.rows);
    fn(this.rows);
    this.afterChange(rerenderAll);
  }
  afterChange(rerenderAll) {
    this.validate();
    if (rerenderAll) this.renderTable(); else this.refreshRows();
    this.renderProblems();
    this.onDirty(this.isDirty());
    this.updateToolbar();
  }
  undo() { const s = this.history.undo(this.rows); if (s) { this.rows = s; this.afterChange(true); } }
  redo() { const s = this.history.redo(this.rows); if (s) { this.rows = s; this.afterChange(true); } }
  revertAll() { this.rows = [...this.orig.values()].map(clone); this.history.clear(); this.afterChange(true); }

  // ---------------------------------------------------------------- views
  visibleRows() {
    let rows = this.rows;
    if (this.chip !== null && this.def.categoryKey) rows = rows.filter((r) => r[this.def.categoryKey] === this.chip);
    if (this.filter) {
      const f = this.filter.toLowerCase();
      rows = rows.filter((r) => Object.entries(r).some(([k, v]) => !k.startsWith('__') && String(v ?? '').toLowerCase().includes(f)) || String(r.__key ?? '').toLowerCase().includes(f));
    }
    if (this.sort) {
      const { key, dir } = this.sort;
      rows = [...rows].sort((a, b) => {
        const va = a[key], vb = b[key];
        if (va === undefined && vb === undefined) return 0;
        if (va === undefined) return 1;
        if (vb === undefined) return -1;
        const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
        return dir === 'desc' ? -c : c;
      });
    }
    return rows;
  }
  visibleColumns() {
    const cols = this.columns;
    if (!this.preset) return cols;
    const keep = new Set(this.preset);
    return cols.filter((c) => keep.has(c.key) || (this.def.identity || []).includes(c.key));
  }
  /** Column presets: per category (keys that rows of that category use) when presetsFromData. */
  presets() {
    const out = { all: null };
    if (this.def.presetsFromData && this.def.categoryKey) {
      const byCat = new Map();
      for (const r of this.rows) {
        const cat = r[this.def.categoryKey];
        if (!byCat.has(cat)) byCat.set(cat, new Set());
        for (const k of Object.keys(r)) if (!k.startsWith('__')) byCat.get(cat).add(k);
      }
      for (const [cat, keys] of byCat) out[cat] = this.columns.map((c) => c.key).filter((k) => keys.has(k));
    }
    return out;
  }
  categories() {
    if (!this.def.categoryKey) return [];
    const counts = new Map();
    for (const r of this.rows) { const c = r[this.def.categoryKey]; counts.set(c, (counts.get(c) || 0) + 1); }
    return [...counts.entries()].map(([value, count]) => ({ value, count }));
  }

  // ---------------------------------------------------------------- rendering
  render() {
    clear(this.mountEl);
    this.toolbarEl = el('div', { class: 'toolbar' });
    this.wrapEl = el('div', { class: 'sheet-wrap' });
    this.problemsEl = el('div', { class: 'problems' });
    this.mountEl.append(this.toolbarEl, this.wrapEl, this.problemsEl);
    this.renderToolbar();
    this.renderTable();
    this.renderProblems();
    this.wrapEl.addEventListener('keydown', (e) => this.onKey(e));
    this.wrapEl.addEventListener('paste', (e) => this.onPaste(e));
    this.wrapEl.tabIndex = 0;
  }

  renderToolbar() {
    const t = clear(this.toolbarEl);
    const mk = (label, onclick, attrs = {}) => el('button', { onclick, ...attrs }, label);
    this.btnUndo = mk('↶ Undo', () => this.undo(), { title: 'Ctrl/Cmd+Z' });
    this.btnRedo = mk('↷ Redo', () => this.redo(), { title: 'Ctrl/Cmd+Shift+Z' });
    this.btnSave = mk('Save', () => this.save(), { class: 'primary', title: 'Validate and write the file' });
    this.dirtyBadge = el('span', { class: 'badge' }, '');
    const search = el('input', { placeholder: 'Search…', value: this.filter, oninput: (e) => { this.filter = e.target.value; this.renderTable(); } });
    t.append(
      mk('+ Row', () => this.addRow()),
      mk('Duplicate', () => this.duplicateRow(), { title: 'Copy the selected row (identity cleared)' }),
      mk('Delete', () => this.deleteRow(), { class: 'danger' }),
      this.btnUndo, this.btnRedo,
      el('span', { class: 'spacer' }),
      search,
      mk('Import CSV/TSV', () => this.importCSV()),
      mk('Export CSV', () => this.exportCSV()),
      mk('Diff', () => this.showDiff()),
      mk('Revert', () => this.revertAll()),
      this.btnSave,
      this.dirtyBadge,
    );
    this.updateToolbar();
  }
  updateToolbar() {
    if (!this.btnUndo) return;
    this.btnUndo.disabled = !this.history.canUndo;
    this.btnRedo.disabled = !this.history.canRedo;
    const dirty = this.isDirty();
    this.btnSave.disabled = !dirty;
    const e = this.problems.errors.length, w = this.problems.warnings.length;
    this.dirtyBadge.textContent = dirty ? `${this.rows.filter((r) => this.isRowDirty(r)).length} changed` : 'saved';
    this.dirtyBadge.className = 'badge' + (e ? ' error' : w ? ' warn' : '');
    if (e) this.dirtyBadge.textContent += ` · ${e} error${e > 1 ? 's' : ''}`;
    else if (w) this.dirtyBadge.textContent += ` · ${w} warning${w > 1 ? 's' : ''}`;
  }

  renderTable() {
    const cols = this.visibleColumns();
    const rows = this.visibleRows();
    const thead = el('thead', {}, el('tr', {}, [
      el('th', { class: 'rownum' }, '#'),
      ...cols.map((c) => el('th', {
        class: this.sort?.key === c.key ? `sorted ${this.sort.dir}` : '',
        title: `${c.key} (${c.type}${c.immutable ? ', immutable' : ''}${c.ref ? `, ref ${c.ref}` : ''})`,
        onclick: () => this.toggleSort(c.key),
      }, c.label || c.key)),
    ]));
    this.tbody = el('tbody');
    this.rowEls = new Map();
    for (const r of rows) this.tbody.appendChild(this.rowElement(r, cols));
    const table = el('table', { class: 'sheet' }, [thead, this.tbody]);
    clear(this.wrapEl).appendChild(table);
    this.cols = cols;
    this.updateToolbar();
  }
  rowElement(row, cols) {
    const tr = el('tr', { dataset: { id: row.__id } });
    tr.appendChild(el('td', { class: 'rownum' }, String(this.rows.indexOf(row) + 1)));
    for (const c of cols) tr.appendChild(this.cellElement(row, c));
    tr.className = this.rowExistsOnDisk(row) ? (this.isRowDirty(row) ? 'dirty' : '') : 'new';
    this.rowEls.set(row.__id, tr);
    return tr;
  }
  cellElement(row, col) {
    const v = row[col.key];
    const locked = col.immutable && this.rowExistsOnDisk(row) && this.orig.get(row.__id)[col.key] !== undefined;
    const td = el('td', { class: [col.type === 'boolean' && 'bool', col.type === 'number' && 'num', locked && 'immutable'].filter(Boolean).join(' '), dataset: { key: col.key } });
    const prob = this.cellProblems.get(`${row.__id}:${col.key}`);
    if (prob) { td.classList.add(prob.kind); td.title = prob.message; }
    const o = this.orig.get(row.__id);
    if (o && JSON.stringify(o[col.key]) !== JSON.stringify(v)) td.classList.add('dirty');
    if (this.sel && this.sel.id === row.__id && this.sel.key === col.key) td.classList.add('sel');
    const cell = el('span', { class: 'cell' }, formatCell(v, col));
    td.appendChild(cell);
    td.addEventListener('mousedown', (e) => { if (e.detail === 1) this.select(row.__id, col.key); });
    td.addEventListener('dblclick', () => this.edit(row.__id, col.key));
    return td;
  }
  refreshRows() {
    // re-render rows whose element exists; newly added rows get appended
    const cols = this.cols || this.visibleColumns();
    const visible = new Set(this.visibleRows().map((r) => r.__id));
    for (const r of this.rows) {
      const old = this.rowEls.get(r.__id);
      if (!visible.has(r.__id)) { if (old) { old.remove(); this.rowEls.delete(r.__id); } continue; }
      const fresh = this.rowElement(r, cols);
      if (old) old.replaceWith(fresh); else this.tbody.appendChild(fresh);
    }
    for (const [id, trEl] of [...this.rowEls]) if (!this.rows.some((r) => r.__id === id)) { trEl.remove(); this.rowEls.delete(id); }
  }
  renderProblems() {
    const p = clear(this.problemsEl);
    const items = [...this.problems.errors.map((x) => ({ ...x, kind: 'error' })), ...this.problems.warnings.map((x) => ({ ...x, kind: 'warn' }))];
    if (!items.length) { p.appendChild(el('span', { class: 'muted' }, 'No problems.')); return; }
    for (const it of items.slice(0, 200)) {
      const row = this.rows[it.row];
      p.appendChild(el('div', { class: it.kind, onclick: () => { if (row) { this.select(row.__id, it.col); this.rowEls.get(row.__id)?.scrollIntoView({ block: 'center' }); } } }, `row ${it.row + 1}: ${it.message}`));
    }
    if (items.length > 200) p.appendChild(el('div', { class: 'muted' }, `… ${items.length - 200} more`));
  }

  // ---------------------------------------------------------------- selection + editing
  select(id, key) {
    if (this.sel) this.rowEls.get(this.sel.id)?.querySelector(`td[data-key="${CSS.escape(this.sel.key)}"]`)?.classList.remove('sel');
    this.sel = { id, key };
    this.rowEls.get(id)?.querySelector(`td[data-key="${CSS.escape(key)}"]`)?.classList.add('sel');
    this.wrapEl.focus({ preventScroll: true });
  }
  colIndex(key) { return this.cols.findIndex((c) => c.key === key); }
  moveSelection(dRow, dCol) {
    if (!this.sel) return;
    const rows = this.visibleRows();
    const ri = rows.findIndex((r) => r.__id === this.sel.id);
    const ci = this.colIndex(this.sel.key);
    const nr = Math.max(0, Math.min(rows.length - 1, ri + dRow));
    const nc = Math.max(0, Math.min(this.cols.length - 1, ci + dCol));
    this.select(rows[nr].__id, this.cols[nc].key);
    this.rowEls.get(rows[nr].__id)?.querySelector(`td[data-key="${CSS.escape(this.cols[nc].key)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  onKey(e) {
    if (this.editing) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); this.save(); return; }
    if (!this.sel) return;
    switch (e.key) {
      case 'ArrowUp': e.preventDefault(); this.moveSelection(-1, 0); break;
      case 'ArrowDown': e.preventDefault(); this.moveSelection(1, 0); break;
      case 'ArrowLeft': e.preventDefault(); this.moveSelection(0, -1); break;
      case 'ArrowRight': case 'Tab': e.preventDefault(); this.moveSelection(0, e.shiftKey ? -1 : 1); break;
      case 'Enter': case 'F2': e.preventDefault(); this.edit(this.sel.id, this.sel.key); break;
      case 'Delete': case 'Backspace': e.preventDefault(); this.setCell(this.sel.id, this.sel.key, undefined); break;
      case ' ': {
        const col = this.cols.find((c) => c.key === this.sel.key);
        if (col?.type === 'boolean') { e.preventDefault(); const row = this.rowById(this.sel.id); this.setCell(this.sel.id, col.key, !row[col.key]); }
        break;
      }
      default:
        if (e.key.length === 1 && !mod) { this.edit(this.sel.id, this.sel.key, e.key); e.preventDefault(); }
    }
  }
  rowById(id) { return this.rows.find((r) => r.__id === id); }
  edit(id, key, seed) {
    const row = this.rowById(id);
    const col = this.cols.find((c) => c.key === key);
    if (!row || !col) return;
    if (col.immutable && this.rowExistsOnDisk(row) && this.orig.get(id)[key] !== undefined) {
      toast(`${key} is a persisted identifier: duplicate the row instead of renaming`, 'warn');
      return;
    }
    if (col.type === 'boolean') { this.setCell(id, key, !row[key]); return; }
    if (col.type === 'json' || col.type === 'any') { this.editJSON(row, col); return; }
    const td = this.rowEls.get(id)?.querySelector(`td[data-key="${CSS.escape(key)}"]`);
    if (!td) return;
    this.editing = true;
    const current = row[key];
    let input;
    if (col.type === 'enum') {
      input = el('select', { class: 'edit' }, [el('option', { value: '' }, ''), ...col.enum.map((v) => el('option', { value: v, selected: v === current }, v))]);
    } else {
      input = el('input', { class: 'edit', value: seed !== undefined ? seed : (current === undefined ? '' : String(current)), type: 'text' });
      if (col.ref && this.refs[col.ref]) {
        const listId = `dl-${col.ref}`;
        if (!document.getElementById(listId)) document.body.appendChild(el('datalist', { id: listId }, [...this.refs[col.ref]].sort().map((v) => el('option', { value: v }))));
        input.setAttribute('list', listId);
      }
    }
    const finish = (commit, move) => {
      if (!this.editing) return;
      this.editing = false;
      if (commit) {
        const raw = input.value;
        let val;
        if (raw === '') val = undefined;
        else if (col.type === 'number') { const n = Number(raw); val = Number.isNaN(n) ? raw : n; }
        else val = raw;
        this.setCell(id, key, val);
      } else this.refreshRows();
      this.select(id, key);
      if (move) this.moveSelection(move[0], move[1]);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true, [1, 0]); }
      else if (e.key === 'Tab') { e.preventDefault(); finish(true, [0, e.shiftKey ? -1 : 1]); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
    clear(td).appendChild(input);
    input.focus();
    if (input.select && seed === undefined) input.select();
    else if (input.setSelectionRange) input.setSelectionRange(input.value.length, input.value.length);
  }
  editJSON(row, col) {
    const ta = el('textarea', { value: row[col.key] === undefined ? '' : JSON.stringify(row[col.key], null, 2) });
    modal({
      title: `${col.key} (${col.type === 'any' ? 'JSON literal' : 'JSON'})`,
      width: '640px',
      body: el('div', {}, [el('div', { class: 'note' }, 'Empty removes the key. Strings must be quoted.'), ta]),
      buttons: [
        { label: 'Cancel' },
        { label: 'Apply', primary: true, onClick: (close) => {
          const raw = ta.value.trim();
          let val;
          if (raw === '') val = undefined;
          else { try { val = JSON.parse(raw); } catch (e) { toast(`Not valid JSON: ${e.message}`, 'error'); return; } }
          this.setCell(row.__id, col.key, val); close();
        } },
      ],
    });
  }
  setCell(id, key, value) {
    const row = this.rowById(id);
    if (!row) return;
    if (JSON.stringify(row[key]) === JSON.stringify(value)) { this.refreshRows(); return; }
    this.mutate((rows) => {
      const r = rows.find((x) => x.__id === id);
      if (value === undefined) delete r[key]; else r[key] = value;
    });
  }

  // ---------------------------------------------------------------- row ops
  addRow() {
    const template = {};
    if (this.chip !== null && this.def.categoryKey) template[this.def.categoryKey] = this.chip;
    this.mutate((rows) => { rows.push({ __id: nextId++, ...template }); }, { rerenderAll: true });
    const last = this.rows[this.rows.length - 1];
    this.select(last.__id, this.cols[0].key);
    this.rowEls.get(last.__id)?.scrollIntoView({ block: 'center' });
  }
  duplicateRow() {
    if (!this.sel) return toast('Select a row first', 'warn');
    const src = this.rowById(this.sel.id);
    const copy = { ...clone(src), __id: nextId++ };
    for (const k of this.def.identity || []) delete copy[k];
    if (this.def.identity?.length === 1 && this.def.columns.find((c) => c.key === this.def.identity[0])?.type === 'string') copy[this.def.identity[0]] = `${src[this.def.identity[0]]} copy`;
    this.mutate((rows) => { rows.splice(rows.findIndex((r) => r.__id === src.__id) + 1, 0, copy); }, { rerenderAll: true });
    this.select(copy.__id, this.cols[0].key);
  }
  deleteRow() {
    if (!this.sel) return toast('Select a row first', 'warn');
    const id = this.sel.id;
    this.sel = null;
    this.mutate((rows) => { const i = rows.findIndex((r) => r.__id === id); if (i >= 0) rows.splice(i, 1); }, { rerenderAll: true });
  }
  toggleSort(key) {
    if (!this.sort || this.sort.key !== key) this.sort = { key, dir: 'asc' };
    else if (this.sort.dir === 'asc') this.sort = { key, dir: 'desc' };
    else this.sort = null;
    this.renderTable();
  }
  setChip(value) { this.chip = value; this.renderTable(); }
  setPreset(keys) { this.preset = keys; this.renderTable(); }

  // ---------------------------------------------------------------- paste / csv
  onPaste(e) {
    if (this.editing || !this.sel) return;
    const text = e.clipboardData?.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    const grid = parseDelimited(text, text.includes('\t') ? '\t' : ',');
    const rows = this.visibleRows();
    const r0 = rows.findIndex((r) => r.__id === this.sel.id);
    const c0 = this.colIndex(this.sel.key);
    this.mutate((live) => {
      grid.forEach((line, dr) => {
        const target = rows[r0 + dr];
        if (!target) return;
        const liveRow = live.find((x) => x.__id === target.__id);
        line.forEach((cellText, dc) => {
          const col = this.cols[c0 + dc];
          if (!col) return;
          if (col.immutable && this.rowExistsOnDisk(liveRow) && this.orig.get(liveRow.__id)[col.key] !== undefined) return;
          const v = coerce(cellText, col);
          if (v === undefined) delete liveRow[col.key]; else liveRow[col.key] = v;
        });
      });
    }, { rerenderAll: true });
    toast(`Pasted ${grid.length} row(s)`);
  }
  importCSV() {
    const input = el('input', { type: 'file', accept: '.csv,.tsv,.txt' });
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      const text = await file.text();
      const delim = text.split('\n')[0].includes('\t') ? '\t' : ',';
      const grid = parseDelimited(text, delim);
      if (grid.length < 2) return toast('Nothing to import', 'warn');
      const header = grid[0].map((h) => h.trim());
      const colByKey = Object.fromEntries(this.columns.map((c) => [c.key.toLowerCase(), c]));
      const mapped = header.map((h) => colByKey[h.toLowerCase()] || { key: h, type: 'any', dynamic: true });
      const unknown = mapped.filter((c) => c.dynamic).map((c) => c.key);
      const identity = this.def.identity || [];
      const mode = await new Promise((resolve) => modal({
        title: `Import ${file.name}`,
        body: el('div', {}, [
          el('p', {}, `${grid.length - 1} data rows, ${header.length} columns.`),
          unknown.length ? el('p', { class: 'warn' }, `Columns not in the definition (kept as-is): ${unknown.join(', ')}`) : null,
          el('p', { class: 'note' }, identity.length ? `Rows are matched on ${identity.join(' + ')}: matching rows are updated, new ones appended.` : 'Rows are appended.'),
        ]),
        buttons: [
          { label: 'Cancel', onClick: (c) => { c(); resolve(null); } },
          { label: 'Replace all rows', danger: true, onClick: (c) => { c(); resolve('replace'); } },
          { label: 'Merge', primary: true, onClick: (c) => { c(); resolve('merge'); } },
        ],
      }));
      if (!mode) return;
      const incoming = grid.slice(1).filter((line) => line.some((x) => x.trim() !== '')).map((line) => {
        const row = {};
        mapped.forEach((col, i) => { const v = coerce(line[i] ?? '', col); if (v !== undefined) row[col.key] = v; });
        return row;
      });
      this.mutate((live) => {
        if (mode === 'replace') { live.length = 0; incoming.forEach((r) => live.push({ __id: nextId++, ...r })); return; }
        for (const r of incoming) {
          const match = identity.length ? live.find((x) => identity.every((k) => String(x[k]) === String(r[k]))) : null;
          if (match) Object.assign(match, r); else live.push({ __id: nextId++, ...r });
        }
      }, { rerenderAll: true });
      toast(`Imported ${incoming.length} rows (${mode})`);
    });
    input.click();
  }
  exportCSV() {
    const cols = this.columns;
    const esc = (v) => { const s = v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [cols.map((c) => esc(c.key)).join(',')];
    for (const r of this.rows) lines.push(cols.map((c) => esc(r[c.key])).join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `${this.def.id}.csv` });
    document.body.appendChild(a); a.click(); a.remove();
  }
  showDiff() {
    const before = JSON.stringify(fromRows(this.def, [...this.orig.values()]), null, 2);
    const after = JSON.stringify(this.getData(), null, 2);
    modal({ title: `Diff: ${this.def.file}`, width: '900px', body: diffElement(before, after) });
  }
  async save() {
    if (this.problems.errors.length) { toast(`Fix ${this.problems.errors.length} error(s) before saving`, 'error'); return; }
    try {
      const result = await this.onSave(this.getData());
      this.orig = new Map(this.rows.map((r) => [r.__id, clone(r)]));
      this.history.clear();
      this.afterChange(true);
      const w = result?.written?.[0];
      toast(w ? (w.changed ? `Saved ${w.path} (${w.bytes} bytes)${result.restartNeeded ? '. Restart the game server to pick it up.' : ''}` : `${w.path} unchanged`) : 'Saved');
    } catch (err) {
      const errs = err.body?.errors;
      if (errs?.length) { this.problems.errors = errs; this.renderProblems(); }
      toast(`Save failed: ${err.message}`, 'error', 6000);
    }
  }
}

// ---------------------------------------------------------------- helpers
function stripId(r) { const { __id, ...rest } = r; return rest; }

function formatCell(v, col) {
  if (v === undefined) return '';
  if (col.type === 'boolean' || typeof v === 'boolean') return v ? '✓' : '✗';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Text -> typed cell value for a column; '' -> undefined (absent). */
function coerce(text, col) {
  const s = String(text ?? '').trim();
  if (s === '') return undefined;
  switch (col.type) {
    case 'number': { const n = Number(s); return Number.isNaN(n) ? s : n; }
    case 'boolean': return /^(true|yes|1|x|✓)$/i.test(s) ? true : /^(false|no|0|✗)$/i.test(s) ? false : s;
    case 'json': case 'any': { try { return JSON.parse(s); } catch (e) { return s; } }
    default: return s;
  }
}

/** Minimal CSV/TSV parser with quoted fields. */
function parseDelimited(text, delim) {
  const rows = []; let row = []; let field = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}
