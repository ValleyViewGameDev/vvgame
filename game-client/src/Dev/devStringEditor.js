// devStringEditor: the STRING half of dev Edit Mode (ported from House; the CSS half and
// the mode toggle live in devEditMode.js). While Edit Mode is on, holding "S" swaps the
// cursor to a pencil; clicking text opens this panel for the string behind it.
//
// Flow: click -> resolve which stringsEN.json KEY produced the clicked text -> panel shows
// the RAW template -> Save -> POST /api/dev/edit-string (writes EN, mirrors the value into
// the language files that still carried the old English, logs the key in
// tools/i18n_pending.json for ES/FR/DE re-translation). Nothing persists until Save.
//
// Key resolution: a data-string-id stamp on (or above) the element wins; otherwise a reverse
// lookup of the element's OWN text against the EN catalog (exact, with unresolved
// placeholders stripped, or as a template where {token} / [token] match anything), with a
// picker when several keys render the same text. Variables are protected: the panel edits
// the raw template and the server refuses a save whose token set changes.
import axios from 'axios';
import API_BASE from '../config';
import stringsEN from '../UI/Strings/stringsEN.json';

const catalog = () => stringsEN; // the live EN object the StringsProvider proxies (setLocal patches it)
const TOKEN_RE = /\{[^}]+\}|\[[^\]]+\]/g;

function norm(s) { return String(s ?? '').replace(/\s+/g, ' ').trim(); }
function literalOf(tpl) { return norm(String(tpl).replace(TOKEN_RE, ' ')); }
function hasLiteralAnchor(tpl) { return /[\p{L}\p{N}]{2,}/u.test(literalOf(tpl)); }
function templateToRegex(tpl) {
  const escaped = String(tpl).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const withWildcards = escaped.replace(/\\\{[^}]*?\\\}|\\\[[^\]]*?\\\]/g, '[\\s\\S]+?');
  return new RegExp(`^${withWildcards}$`);
}
function strippedForm(tpl) {
  return norm(String(tpl).replace(TOKEN_RE, '').replace(/\s{2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1'));
}
function renderedForms(tpl) {
  const base = norm(tpl);
  const forms = new Set([base]);
  if (TOKEN_RE.test(tpl)) forms.add(strippedForm(tpl));
  TOKEN_RE.lastIndex = 0;
  return forms;
}
const MIN_LITERAL_SHARE = 0.5;

function keysForText(text) {
  const needle = norm(text);
  if (!needle) return [];
  const cat = catalog();
  const exact = [];
  const viaTemplate = [];
  for (const key of Object.keys(cat)) {
    const tpl = cat[key];
    if (typeof tpl !== 'string') continue;
    if (renderedForms(tpl).has(needle)) { exact.push(key); continue; }
    const hasTokens = /\{[^}]+\}|\[[^\]]+\]/.test(tpl);
    if (!hasTokens || !hasLiteralAnchor(tpl)) continue;
    const lit = literalOf(tpl).length;
    if (lit / needle.length < MIN_LITERAL_SHARE) continue;
    try { if (templateToRegex(norm(tpl)).test(needle)) viaTemplate.push({ key, lit }); } catch (_) { /* skip */ }
  }
  viaTemplate.sort((a, b) => b.lit - a.lit);
  // Prefer the base key over its _touch sibling when both render the same text
  const all = [...exact, ...viaTemplate.map((c) => c.key)];
  return all.sort((a, b) => (a.endsWith('_touch') ? 1 : 0) - (b.endsWith('_touch') ? 1 : 0));
}

function ownText(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return '';
  let s = '';
  for (const node of el.childNodes) if (node.nodeType === Node.TEXT_NODE) s += node.textContent;
  return s;
}

export function resolveKeys(el) {
  const stamped = el?.closest?.('[data-string-id]');
  if (stamped) {
    const id = stamped.getAttribute('data-string-id');
    if (id && id in catalog()) return { keys: [id], source: 'stamp', el: stamped };
  }
  let node = el;
  for (let depth = 0; node && depth < 4; depth++, node = node.parentElement) {
    const own = keysForText(ownText(node));
    const keys = own.length ? own : keysForText(node.textContent || '');
    if (keys.length) return { keys, source: 'lookup', el: node };
  }
  return { keys: [], source: 'lookup', el };
}

export function setLocal(key, value) { if (typeof key === 'string' && typeof value === 'string') stringsEN[key] = value; }

// ===== Panel =====
let panelEl = null;
function closePanel() { panelEl?.remove(); panelEl = null; }

function openPanel(key, playerId, { onSaved } = {}) {
  closePanel();
  const original = String(catalog()[key] ?? '');
  const panel = document.createElement('div');
  panel.className = 'dev-string-panel';
  panel.setAttribute('data-edit-exempt', '');
  panel.innerHTML = `
    <div class="dsp-head"><span class="dsp-title">Edit string</span><button type="button" class="dsp-x" title="Cancel (Esc)">×</button></div>
    <code class="dsp-key"></code>
    <textarea class="dsp-input" spellcheck="true" rows="4"></textarea>
    <div class="dsp-tokens"></div>
    <p class="dsp-msg"></p>
    <div class="dsp-actions"><button type="button" class="dsp-cancel">Cancel</button><button type="button" class="dsp-save">Save</button></div>`;
  document.body.appendChild(panel);
  panelEl = panel;
  const $ = (sel) => panel.querySelector(sel);
  $('.dsp-key').textContent = `stringsEN.json  "${key}"`;
  const input = $('.dsp-input');
  input.value = original;
  const tokens = original.match(TOKEN_RE) || [];
  $('.dsp-tokens').textContent = tokens.length ? `Variables (must stay): ${tokens.join(' ')}` : 'No variables in this string.';
  const msg = $('.dsp-msg');
  const setMsg = (text, kind) => { msg.textContent = text || ''; msg.className = `dsp-msg${kind ? ` dsp-${kind}` : ''}`; };
  const tokenSet = (s) => (s.match(TOKEN_RE) || []).slice().sort().join('|');
  const baseTokens = tokenSet(original);
  const validate = () => {
    if (tokenSet(input.value) !== baseTokens) { setMsg('Variables changed. Edit the wording, not the {tokens}.', 'err'); return false; }
    setMsg(''); return true;
  };
  input.addEventListener('input', validate);
  const save = async () => {
    if (!validate()) return;
    const newValue = input.value;
    if (newValue === original) { closePanel(); return; }
    $('.dsp-save').disabled = true;
    setMsg('Saving…');
    try {
      const res = await axios.post(`${API_BASE}/api/dev/edit-string`, { playerId, key, newValue, oldValue: original });
      setLocal(key, newValue);
      const warn = res.data?.warnings || [];
      onSaved?.(key, newValue);
      if (warn.length) { setMsg(`Saved. ${warn.join(' ')}`, 'warn'); $('.dsp-save').disabled = false; setTimeout(closePanel, 2600); }
      else closePanel();
    } catch (err) {
      setMsg(err?.response?.data?.error || err?.message || 'Save failed.', 'err');
      $('.dsp-save').disabled = false;
    }
  };
  $('.dsp-save').addEventListener('click', save);
  $('.dsp-cancel').addEventListener('click', closePanel);
  $('.dsp-x').addEventListener('click', closePanel);
  panel.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); closePanel(); }
    else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
  });
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

function openPicker(keys, onPick) {
  closePanel();
  const panel = document.createElement('div');
  panel.className = 'dev-string-panel';
  panel.setAttribute('data-edit-exempt', '');
  panel.innerHTML = `
    <div class="dsp-head"><span class="dsp-title">Which string?</span><button type="button" class="dsp-x" title="Cancel (Esc)">×</button></div>
    <p class="dsp-msg">${keys.length} keys render this text. Pick one.</p>
    <div class="dsp-list"></div>`;
  document.body.appendChild(panel);
  panelEl = panel;
  const list = panel.querySelector('.dsp-list');
  for (const k of keys.slice(0, 40)) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'dsp-pick';
    const code = document.createElement('code'); code.textContent = k;
    const span = document.createElement('span'); span.textContent = String(catalog()[k] || '').slice(0, 80);
    row.append(code, span);
    row.addEventListener('click', () => onPick(k));
    list.appendChild(row);
  }
  panel.querySelector('.dsp-x').addEventListener('click', closePanel);
  panel.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); closePanel(); } });
}

// Entry point from devEditMode's click handler. Returns true when a panel opened.
export function openStringEditorFor(textEl, { playerId, language, onSaved } = {}) {
  if (!textEl) return false;
  if (String(language || 'en').toLowerCase() !== 'en') {
    window.alert('Switch the game to English to edit strings: stringsEN.json is the source of truth.');
    return false;
  }
  const { keys } = resolveKeys(textEl);
  if (!keys.length) return false;
  const done = (k, v) => onSaved?.(k, v, textEl);
  if (keys.length === 1) openPanel(keys[0], playerId, { onSaved: done });
  else openPicker(keys, (k) => openPanel(k, playerId, { onSaved: done }));
  return true;
}
export function isStringPanelOpen() { return !!panelEl; }
export { closePanel as closeStringPanel };
