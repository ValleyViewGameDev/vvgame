// Developer-only routes behind the in-game Edit Mode (game-client/src/Dev/). Both write into
// the sibling game-client/ checkout, so they are LOCAL DEV ONLY: refused in production, and
// every call must come from a developer account (tuning/developerUsernames.json).
const express = require('express');
const fs = require('fs');
const path = require('path');
const { isDeveloperPlayerId } = require('../utils/serviceMode');
const { updateEnString } = require('../utils/i18nPending');

const router = express.Router();
const CLIENT_SRC = path.resolve(__dirname, '..', '..', 'game-client', 'src');

async function requireLocalDeveloper(req, res) {
  if (process.env.NODE_ENV === 'production') { res.status(403).json({ error: 'Edit Mode writes are disabled in production.' }); return false; }
  const callerId = req.body?.playerId || req.get('x-player-id');
  if (!(await isDeveloperPlayerId(callerId))) { res.status(403).json({ error: 'Developers only.' }); return false; }
  return true;
}

function listCssFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) listCssFiles(p, out);
    else if (entry.isFile() && p.endsWith('.css')) out.push(p);
  }
  return out;
}
function matchingBrace(css, bodyStart) {
  let depth = 1;
  for (let i = bodyStart; i < css.length; i++) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') { depth -= 1; if (depth === 0) return i; }
  }
  return -1;
}
function findAtMediaBlock(css, conditionText) {
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const wanted = norm(conditionText);
  const re = /@media([^{]*)\{/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    if (norm(m[1]) !== wanted) continue;
    const bodyStart = re.lastIndex;
    const bodyEnd = matchingBrace(css, bodyStart);
    if (bodyEnd === -1) return null;
    return { bodyStart, bodyEnd };
  }
  return null;
}
function findRuleBlocks(css, start, end, selectorText) {
  const norm = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\s+/g, ' ').trim();
  const wanted = norm(selectorText);
  const blocks = [];
  let i = start; let preludeStart = start;
  while (i < end) {
    const ch = css[i];
    if (ch === '{') {
      const prelude = norm(css.slice(preludeStart, i));
      const bodyStart = i + 1;
      const bodyEnd = matchingBrace(css, bodyStart);
      if (bodyEnd === -1) break;
      if (!prelude.startsWith('@') && prelude === wanted) blocks.push({ bodyStart, bodyEnd });
      i = bodyEnd + 1; preludeStart = i; continue;
    }
    if (ch === '}') { i += 1; preludeStart = i; continue; }
    i += 1;
  }
  return blocks;
}

// Find the rule in ONE css file; returns { css, block, decl } or null.
function locateRule(css, { selectorText, oldValue, mediaConditionText, occurrence }) {
  let searchStart = 0; let searchEnd = css.length;
  if (mediaConditionText) {
    const mb = findAtMediaBlock(css, mediaConditionText);
    if (!mb) return null;
    searchStart = mb.bodyStart; searchEnd = mb.bodyEnd;
  }
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const matches = findRuleBlocks(css, searchStart, searchEnd, selectorText).filter((b) => /\bfont-size\s*:/.test(css.slice(b.bodyStart, b.bodyEnd)));
  if (!matches.length) return null;
  let chosen = matches.filter((b) => { const m = css.slice(b.bodyStart, b.bodyEnd).match(/\bfont-size\s*:\s*([^;}]+)/); return m && norm(m[1]) === norm(oldValue); });
  if (!chosen.length) return null; // the value must match: the client's oldValue is what it saw in the cascade
  const block = chosen[Math.min(occurrence || 0, chosen.length - 1)];
  const body = css.slice(block.bodyStart, block.bodyEnd);
  const decl = body.match(/(\bfont-size\s*:\s*)([^;}]+)(;?)/);
  return decl ? { block, decl, body } : null;
}

// POST /api/dev/edit-css { playerId, file?, selectorText, oldValue, newValue, mediaConditionText?, occurrence? }
router.post('/dev/edit-css', async (req, res) => {
  if (!(await requireLocalDeveloper(req, res))) return;
  const { file, selectorText, oldValue, newValue } = req.body || {};
  const mediaConditionText = req.body?.mediaConditionText || null;
  const occurrence = Number.isInteger(req.body?.occurrence) ? req.body.occurrence : 0;
  if (!selectorText || !oldValue || !newValue) return res.status(400).json({ error: 'selectorText, oldValue, newValue are required.' });
  if (!/^-?\d*\.?\d+(rem|px|em)$/.test(String(newValue).trim())) return res.status(400).json({ error: `Refusing to write unsafe font-size value: ${newValue}` });
  try {
    let candidates;
    if (file) {
      const target = path.resolve(CLIENT_SRC, String(file).replace(/^src\//, ''));
      if (!target.startsWith(CLIENT_SRC + path.sep) || path.extname(target) !== '.css') return res.status(400).json({ error: 'Only .css files under game-client/src are editable.' });
      if (!fs.existsSync(target)) return res.status(404).json({ error: `Stylesheet not found on this server: ${file}` });
      candidates = [target];
    } else {
      candidates = listCssFiles(CLIENT_SRC);
    }
    const hits = [];
    for (const target of candidates) {
      const css = fs.readFileSync(target, 'utf8');
      const found = locateRule(css, { selectorText, oldValue, mediaConditionText, occurrence });
      if (found) hits.push({ target, css, ...found });
    }
    if (!hits.length) return res.status(404).json({ error: `No "${selectorText}" rule with font-size ${oldValue} found${mediaConditionText ? ` inside @media ${mediaConditionText}` : ''}.` });
    if (hits.length > 1) return res.status(409).json({ error: `Ambiguous: ${hits.length} files hold that rule`, files: hits.map((h) => path.relative(CLIENT_SRC, h.target)) });
    const { target, css, block, decl, body } = hits[0];
    if (/!important/i.test(decl[2])) return res.status(422).json({ error: 'Refusing to edit a font-size with !important.' });
    const newBody = body.replace(/(\bfont-size\s*:\s*)([^;}]+)(;?)/, `$1${newValue}$3`);
    const newCss = css.slice(0, block.bodyStart) + newBody + css.slice(block.bodyEnd);
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, newCss, 'utf8');
    fs.renameSync(tmp, target);
    const rel = path.relative(CLIENT_SRC, target);
    console.log(`[dev] /edit-css ${rel} { ${selectorText} } font-size ${decl[2].trim()} → ${newValue}`);
    res.json({ ok: true, file: rel, newValue });
  } catch (err) {
    console.error('[dev] /edit-css error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/dev/edit-string { playerId, key, newValue, oldValue? }
router.post('/dev/edit-string', async (req, res) => {
  if (!(await requireLocalDeveloper(req, res))) return;
  const { key, newValue, oldValue } = req.body || {};
  if (typeof key !== 'string' || !key.trim()) return res.status(400).json({ error: 'key is required.' });
  if (typeof newValue !== 'string') return res.status(400).json({ error: 'newValue must be a string.' });
  const value = newValue.replace(/\r\n/g, '\n');
  if (value.length > 2000) return res.status(400).json({ error: 'Value too long (max 2000 chars).' });
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)) return res.status(400).json({ error: 'Value contains control characters.' });
  try {
    const summary = updateEnString(key, value, typeof oldValue === 'string' ? oldValue : undefined);
    const warnings = [];
    if (value.includes('—')) warnings.push('Contains an em-dash, which player-facing copy avoids (CLAUDE.md).');
    if (/click|keyboard|arrow keys|A-W-S-D/i.test(value) && !String(key).endsWith('_touch')) warnings.push(`Mentions clicking or keys: check the ${key}_touch sibling too.`);
    console.log(`[dev] /edit-string ${key}: mirrored ${summary.mirrored.join(',') || '-'}; pending ${summary.pending.join(',') || '-'}`);
    res.json({ success: true, key, newValue: value, i18n: summary, warnings });
  } catch (err) {
    const map = { NOT_FOUND: 404, STALE: 409, TOKEN_MISMATCH: 400, BAD_KEY: 400 };
    if (err.code === 'NO_CHANGE') return res.json({ success: true, unchanged: true, key });
    if (!map[err.code]) console.error('[dev/edit-string] error:', err);
    res.status(map[err.code] || 500).json({ error: err.message, code: err.code || 'ERROR', current: err.current });
  }
});

module.exports = router;
