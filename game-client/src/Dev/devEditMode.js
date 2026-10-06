// devEditMode: a developer-only, desktop-only "Edit Mode" ported from House. ⌘+Ctrl+E toggles
// it; while ON every game click is suppressed and clicking visible TEXT bumps that text's
// font-size by one step (Shift = shrink), written back to the real .css file on disk through
// POST /api/dev/edit-css (local dev only; CRA's HMR then reloads the stylesheet). Holding S
// turns the click into "edit this string" (Dev/devStringEditor.js).
//
// Which rule governs the text: the browser knows the cascade, so we read the CSSOM, walk up
// from the clicked element to the first ancestor with an explicit font-size rule and pick the
// winner by specificity + source order. CRA injects each .css file as a <style> element with
// no href, so the rule's file is taken from the sourcemap comment webpack leaves in that
// element (webpack://./src/...); when that is missing the server searches src/**/*.css for
// the selector and refuses to guess between files.
//
// Gating: initDevEditMode() is called by App.js only once the player is a developer
// (tuning/developerUsernames.json); the shortcut also requires a fine pointer.
import axios from 'axios';
import API_BASE from '../config';
import { openStringEditorFor, closeStringPanel } from './devStringEditor';
import './devEditMode.css';

const STEP = { px: 1, rem: 0.0625, em: 0.05 };
let editModeOn = false;
let initialized = false;
let stringKeyHeld = false;
let ctx = { playerId: null, language: 'en' }; // refreshed by App.js (setDevEditContext)
const html = () => document.documentElement;

export function isDesktopForEdit() {
  try { return window.matchMedia('(pointer: fine)').matches && window.matchMedia('(hover: hover)').matches; }
  catch (_) { return false; }
}
export function isEditModeOn() { return editModeOn; }
export function setDevEditContext(next) { ctx = { ...ctx, ...next }; }

export function toggleEditMode() {
  editModeOn = !editModeOn;
  html().classList.toggle('dev-edit-mode', editModeOn);
  if (!editModeOn) { html().classList.remove('dev-edit-minus'); setStringMode(false); closeStringPanel(); }
  showEditIndicator(editModeOn);
  return editModeOn;
}
function setStringMode(on) { stringKeyHeld = on; html().classList.toggle('dev-edit-string', !!on); }

export function initDevEditMode(context) {
  if (context) setDevEditContext(context);
  if (initialized) return;
  initialized = true;
  document.addEventListener('click', onEditClick, true);
  document.addEventListener('pointerdown', swallowIfEditing, true);
  document.addEventListener('mousedown', swallowIfEditing, true);
  window.addEventListener('keydown', (e) => {
    if (e.metaKey && e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'e' || e.key === 'E')) {
      if (!isDesktopForEdit()) return;
      e.preventDefault();
      toggleEditMode();
    }
  }, true);
  window.addEventListener('keydown', (e) => { if (editModeOn && e.key === 'Shift') html().classList.add('dev-edit-minus'); });
  window.addEventListener('keyup', (e) => { if (e.key === 'Shift') html().classList.remove('dev-edit-minus'); });
  window.addEventListener('keydown', (e) => {
    if (!editModeOn || e.repeat) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 's' || e.key === 'S') setStringMode(true);
  });
  window.addEventListener('keyup', (e) => { if (e.key === 's' || e.key === 'S') setStringMode(false); });
  window.addEventListener('blur', () => { html().classList.remove('dev-edit-minus'); setStringMode(false); });
}

function isEditExempt(target) {
  const el = target?.nodeType === Node.TEXT_NODE ? target.parentElement : target;
  return !!el?.closest?.('[data-edit-exempt]');
}
function swallowIfEditing(e) {
  if (!editModeOn || isEditExempt(e.target)) return;
  e.preventDefault();
  e.stopImmediatePropagation();
}

async function onEditClick(e) {
  if (!editModeOn) return;
  if (isEditExempt(e.target)) return;
  e.preventDefault();
  e.stopImmediatePropagation();

  if (stringKeyHeld) {
    setStringMode(false);
    const stringEl = findTextTargetAtPoint(e.clientX, e.clientY, e.target);
    const opened = stringEl && openStringEditorFor(stringEl, { playerId: ctx.playerId, language: ctx.language, onSaved: (key, value, el) => {
      if (el && !/\{[^}]+\}|\[[^\]]+\]/.test(value) && el.children.length === 0) el.textContent = value;
      flash('✓');
    } });
    if (!opened) deny('no editable string under the cursor (S-click)');
    return;
  }

  const textEl = findTextTarget(e.target);
  if (!textEl) { deny('no text under the cursor'); return; }
  const resolved = resolveFontSizeRule(textEl);
  if (!resolved) { deny('no font-size rule governs this text'); return; }
  const dir = e.shiftKey ? -1 : 1;
  const { next: newValue, reason } = stepFontSize(resolved.oldValue, dir);
  if (!newValue) {
    if (reason === 'floor') { flash('⤓'); console.debug(`[edit-css] at minimum: ${resolved.selectorText} = ${resolved.oldValue}`); }
    else deny(`value not a plain px/rem/em: ${resolved.selectorText} = ${resolved.oldValue}`);
    return;
  }
  if (resolved.selectorText.includes(',')) {
    const n = resolved.selectorText.split(',').length;
    if (!window.confirm(`This rule styles ${n} selectors:\n\n${resolved.selectorText}\n\nChanging font-size will affect ALL of them. Continue?`)) return;
  }
  if (!ctx.playerId) { deny('no player id yet'); return; }
  try {
    await axios.post(`${API_BASE}/api/dev/edit-css`, {
      playerId: ctx.playerId, file: resolved.file, selectorText: resolved.selectorText, oldValue: resolved.oldValue,
      newValue, mediaConditionText: resolved.mediaConditionText, occurrence: resolved.occurrence,
    });
    flash(dir > 0 ? '＋' : '－'); // CRA's HMR reloads the stylesheet on its own
  } catch (err) {
    console.warn('[edit-css] save failed:', err?.response?.data || err?.message || err);
    flash('❌');
  }
}

// ===== Targeting =====
function hasOwnText(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
  for (const node of el.childNodes) if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0) return true;
  return false;
}
function findTextTargetAtPoint(x, y, fallbackTarget) {
  const direct = findTextTarget(fallbackTarget);
  if (direct) return direct;
  let hit = null;
  for (const el of document.body.querySelectorAll('*')) {
    if (isEditExempt(el) || !hasOwnText(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
    const cs = window.getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
    hit = el;
  }
  return hit;
}
function findTextTarget(target) {
  let el = target;
  if (el && el.nodeType === Node.TEXT_NODE) el = el.parentElement;
  if (!el) return null;
  if (hasOwnText(el)) return el;
  for (const child of el.querySelectorAll('*')) if (hasOwnText(child)) return child;
  return null;
}

// ===== Rule resolution =====
function resolveFontSizeRule(textEl) {
  let el = textEl;
  while (el && el.nodeType === Node.ELEMENT_NODE) {
    const winner = winningFontSizeRule(el);
    if (winner) return winner;
    el = el.parentElement;
  }
  return null;
}
function winningFontSizeRule(el) {
  const candidates = [];
  const sheets = document.styleSheets;
  for (let si = 0; si < sheets.length; si++) {
    let rules;
    try { rules = sheets[si].cssRules; } catch (_) { continue; }
    if (!rules) continue;
    collectFromRules(rules, el, si, candidates, null);
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    for (let k = 0; k < 3; k++) if (a.spec[k] !== b.spec[k]) return a.spec[k] - b.spec[k];
    if (a.sheetIndex !== b.sheetIndex) return a.sheetIndex - b.sheetIndex;
    return a.ruleIndex - b.ruleIndex;
  });
  const win = candidates[candidates.length - 1];
  const sameSelector = candidates.filter((c) => c.selectorText === win.selectorText && c.file === win.file);
  return { file: win.file, selectorText: win.selectorText, oldValue: win.fontSize, mediaConditionText: win.mediaConditionText, occurrence: Math.max(0, sameSelector.indexOf(win)) };
}
function collectFromRules(rules, el, sheetIndex, out, mediaConditionText) {
  for (let ri = 0; ri < rules.length; ri++) {
    const rule = rules[ri];
    if (rule.cssRules && (rule.type === 4 || rule.type === 12)) {
      const cond = rule.conditionText || (rule.media && rule.media.mediaText) || '';
      let applies = true;
      if (rule.type === 4 && cond) { try { applies = window.matchMedia(cond).matches; } catch (_) { applies = true; } }
      if (applies) collectFromRules(rule.cssRules, el, sheetIndex, out, cond || mediaConditionText);
      continue;
    }
    if (rule.type !== 1 || !rule.style || !rule.style.fontSize || !rule.selectorText) continue;
    const clauses = rule.selectorText.split(',').map((s) => s.trim()).filter(Boolean);
    let matchedClause = null;
    for (const clause of clauses) { try { if (el.matches(clause)) { matchedClause = clause; break; } } catch (_) { /* unsupported selector */ } }
    if (!matchedClause) continue;
    out.push({ file: sheetFile(rule.parentStyleSheet), selectorText: rule.selectorText.trim(), fontSize: rule.style.fontSize, spec: specificity(matchedClause), sheetIndex, ruleIndex: ri, mediaConditionText });
  }
}
// The source file behind a CSSOM sheet. CRA dev: a <style> element whose text ends with a
// base64 sourcemap naming "webpack://./src/UI/Panels/Panel.css"; a <link> keeps its href.
const fileCache = new WeakMap();
function sheetFile(sheet) {
  if (!sheet) return '';
  if (fileCache.has(sheet)) return fileCache.get(sheet);
  let file = '';
  try {
    const node = sheet.ownerNode;
    if (sheet.href) file = new URL(sheet.href).pathname.replace(/^\//, '').split('?')[0];
    else if (node && node.tagName === 'STYLE') {
      const m = node.textContent.match(/sourceMappingURL=data:application\/json;(?:charset=utf-8;)?base64,([A-Za-z0-9+/=]+)/);
      if (m) {
        const map = JSON.parse(atob(m[1]));
        const src = (map.sources || []).find((s) => /\.css$/.test(s)) || '';
        file = src.replace(/^webpack:\/\/\.?\/?/, '').replace(/^\.\//, '');
      }
    }
  } catch (_) { file = ''; }
  fileCache.set(sheet, file);
  return file;
}
function specificity(selector) {
  const ids = (selector.match(/#[\w-]+/g) || []).length;
  const classes = (selector.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+(?:\([^)]*\))?/g) || []).length;
  const stripped = selector.replace(/#[\w-]+/g, ' ').replace(/\.[\w-]+/g, ' ').replace(/\[[^\]]+\]/g, ' ').replace(/::?[\w-]+(?:\([^)]*\))?/g, ' ');
  const types = (stripped.match(/\b[a-zA-Z][\w-]*\b/g) || []).length;
  return [ids, classes, types];
}

// ===== Stepping: px (1px, floor 12px per docs/ui-conventions.md §9), rem, em =====
function stepFontSize(value, dir) {
  const m = String(value).trim().match(/^(-?\d*\.?\d+)(px|rem|em)$/);
  if (!m) return { next: null, reason: 'unparseable' };
  const cur = parseFloat(m[1]); const unit = m[2];
  if (Number.isNaN(cur)) return { next: null, reason: 'unparseable' };
  const next = parseFloat((cur + dir * STEP[unit]).toFixed(4));
  const floor = unit === 'px' ? (cur >= 12 ? 12 : 8) : unit === 'rem' ? (cur >= 0.75 ? 0.75 : 0.5) : 0.5;
  if (dir < 0 && next < floor - 1e-9) return { next: null, reason: 'floor' };
  return { next: `${next}${unit}` };
}

// ===== Flash + indicator =====
let flashEl = null; let flashTimer = null;
function flash(glyph) {
  if (!flashEl) {
    flashEl = document.createElement('div');
    flashEl.className = 'dev-edit-flash';
    flashEl.style.cssText = 'position:fixed;top:0.5rem;left:50%;transform:translateX(-50%);z-index:9999;font-size:1.4rem;background:rgba(20,13,6,0.85);color:#fff;padding:0.2rem 0.6rem;border-radius:8px;pointer-events:none;transition:opacity 150ms';
    document.body.appendChild(flashEl);
  }
  flashEl.textContent = glyph;
  flashEl.style.opacity = '1';
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { if (flashEl) flashEl.style.opacity = '0'; }, 500);
}
function deny(why) { flash('🚫'); console.debug(`[edit-css] no edit: ${why}`); }
let indicatorEl = null;
function showEditIndicator(on) {
  if (on && !indicatorEl) {
    indicatorEl = document.createElement('div');
    indicatorEl.className = 'dev-edit-indicator';
    indicatorEl.setAttribute('data-edit-exempt', '');
    indicatorEl.textContent = '✎ EDIT MODE · ⌘+Ctrl+E to exit · Shift = shrink · hold S = edit text';
    indicatorEl.style.cssText = 'position:fixed;bottom:0.5rem;right:0.5rem;z-index:9999;font-size:0.75rem;font-weight:700;letter-spacing:0.03em;background:rgba(120,20,20,0.9);color:#fff;padding:0.25rem 0.6rem;border-radius:8px;pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,0.4)';
    document.body.appendChild(indicatorEl);
  } else if (!on && indicatorEl) { indicatorEl.remove(); indicatorEl = null; }
}
