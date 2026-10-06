// Shared i18n write-path (ported from House): EN strings are the source of truth; a changed EN
// value is mirrored into every other language file that still carried the OLD English (an
// untranslated copy) and the key is appended to tools/i18n_pending.json as the translation
// worklist for the languages that have a real translation (ES/FR/DE today). Writers: the
// in-game Edit Mode string editor (routes/dev.js); the editor's sheet tabs may join later.
//
// The strings files are one key per line, 4-space indent (see any stringsXX.json), so this
// module rewrites the single line rather than re-serialising the file: diffs stay one line.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const STRINGS_DIR = path.join(ROOT, 'game-client', 'src', 'UI', 'Strings');
const EN_PATH = path.join(STRINGS_DIR, 'stringsEN.json');
const I18N_PENDING_PATH = path.join(ROOT, 'tools', 'i18n_pending.json');
const KEY_RE = /^\d{1,7}(_touch)?$/;

function loadJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function otherLanguageFiles() {
  if (!fs.existsSync(STRINGS_DIR)) return [];
  return fs.readdirSync(STRINGS_DIR).map((f) => {
    const m = /^strings([A-Z]{2})\.json$/.exec(f);
    return m && m[1] !== 'EN' ? { lang: m[1], path: path.join(STRINGS_DIR, f) } : null;
  }).filter(Boolean);
}

// Replace the value of ONE key in a strings file, textually, keeping the file's layout.
// Appends the key before the closing brace when the file lacks it. Returns true when written.
function writeKeyLine(filePath, key, value) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lineRe = new RegExp(`^(\\s*${JSON.stringify(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*)"(?:[^"\\\\]|\\\\.)*"(,?)\\s*$`, 'm');
  const encoded = JSON.stringify(value);
  let out;
  const m = lineRe.exec(raw);
  if (m) out = raw.slice(0, m.index) + m[1] + encoded + m[2] + raw.slice(m.index + m[0].length);
  else {
    const indent = (raw.match(/\n(\s*)"[^"]+":\s/) || [, '    '])[1];
    const body = raw.replace(/\s*}\s*$/, '');
    out = `${body},\n${indent}${JSON.stringify(key)}: ${encoded}\n}\n`;
  }
  JSON.parse(out); // never write a file that does not parse
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, out, 'utf8');
  fs.renameSync(tmp, filePath);
  return true;
}

function loadI18nPending() {
  if (!fs.existsSync(I18N_PENDING_PATH)) return { entries: [] };
  try { return loadJSON(I18N_PENDING_PATH); } catch (_) { return { entries: [] }; }
}
function saveI18nPending(record) { fs.writeFileSync(I18N_PENDING_PATH, JSON.stringify(record, null, 2) + '\n', 'utf8'); }

function extractTokens(s) { return (String(s ?? '').match(/\{[^}]+\}|\[[^\]]+\]/g) || []).sort(); }
function sameTokens(a, b) { const ta = extractTokens(a); const tb = extractTokens(b); return ta.length === tb.length && ta.every((t, i) => t === tb[i]); }

// Update ONE key: EN written, untranslated mirrors refreshed, translated languages logged.
// Throws Error with .code: NOT_FOUND | STALE | TOKEN_MISMATCH | NO_CHANGE | BAD_KEY.
function updateEnString(key, newValue, expectedOld) {
  if (!KEY_RE.test(String(key))) { const e = new Error(`Unsafe key: ${key}`); e.code = 'BAD_KEY'; throw e; }
  const en = loadJSON(EN_PATH);
  if (!(key in en)) { const e = new Error(`Key not found in stringsEN.json: ${key}`); e.code = 'NOT_FOUND'; throw e; }
  const current = en[key];
  if (typeof expectedOld === 'string' && current !== expectedOld) {
    const e = new Error('This string changed on disk since you opened it. Reload and retry.'); e.code = 'STALE'; e.current = current; throw e;
  }
  if (!sameTokens(current, newValue)) {
    const e = new Error(`Placeholder mismatch. Expected ${JSON.stringify(extractTokens(current))}, got ${JSON.stringify(extractTokens(newValue))}. Edit the wording, not the variables.`);
    e.code = 'TOKEN_MISMATCH'; throw e;
  }
  if (current === newValue) { const e = new Error('No change.'); e.code = 'NO_CHANGE'; throw e; }

  writeKeyLine(EN_PATH, key, newValue);
  const mirrored = []; const pendingLangs = [];
  for (const { lang, path: langPath } of otherLanguageFiles()) {
    const langJson = loadJSON(langPath);
    if (!(key in langJson) || langJson[key] === current) { writeKeyLine(langPath, key, newValue); mirrored.push(lang); }
    else pendingLangs.push(lang); // a real translation: leave it, flag it
  }
  const pending = loadI18nPending();
  const ts = new Date().toISOString();
  if (pendingLangs.length) {
    const existing = pending.entries.find((e) => e.key === key);
    if (existing) { existing.en_new = newValue; existing.ts = ts; existing.langs = [...new Set([...(existing.langs || []), ...pendingLangs])]; }
    else pending.entries.push({ key, en_old: current, en_new: newValue, langs: pendingLangs, ts });
    saveI18nPending(pending);
  }
  return { mirrored, pending: pendingLangs, pending_total: pending.entries.length };
}

module.exports = { EN_PATH, STRINGS_DIR, I18N_PENDING_PATH, otherLanguageFiles, writeKeyLine, loadI18nPending, saveI18nPending, extractTokens, sameTokens, updateEnString };
