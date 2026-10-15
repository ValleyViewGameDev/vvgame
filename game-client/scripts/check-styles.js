#!/usr/bin/env node
/**
 * Style check (docs/ui-conventions.md §9-§10, §5): every component stylesheet takes its fonts,
 * type sizes, colors, radii and button shadows from the tokens in src/UI/Styles/theme.css.
 *
 *   node scripts/check-styles.js            report per file + totals
 *   node scripts/check-styles.js --strict   exit 1 if anything is reported (for CI / pre-commit)
 *   node scripts/check-styles.js --list     every flagged line
 *
 * A line that genuinely needs a literal (an emoji drawn as an icon, an art gradient, a VFX
 * color, a size that follows a tile) carries a reason on the same line: style-ok: <reason>
 * inside a CSS comment, and is not counted.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const SKIP = new Set([path.join(SRC, 'UI', 'Styles', 'theme.css')]);
const strict = process.argv.includes('--strict');
const list = process.argv.includes('--list');

const RULES = [
  { key: 'family', label: 'font-family not a --font-* token',
    test: (l) => /font-family\s*:/.test(l) && !/font-family\s*:\s*(var\(--(font|btn-font)-|inherit)/.test(l) },
  { key: 'size', label: 'font-size not a --text-* / --font-* token',
    test: (l) => /font-size\s*:\s*[0-9.]+(px|em|rem|%)/.test(l) },
  { key: 'floor', label: 'font-size under the 12px floor',
    test: (l) => { const m = l.match(/font-size\s*:\s*([0-9.]+)px/); return !!m && parseFloat(m[1]) < 12; } },
  { key: 'color', label: 'text color literal (use a --color-text-* token)',
    test: (l) => /(^|[\s;{])color\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\(|[a-z]+\s*[;!}])/.test(l) && !/color\s*:\s*(inherit|transparent|currentColor)/i.test(l) },
  { key: 'bg', label: 'background color literal (use a --color-* / --brand-* token)',
    test: (l) => /background(-color)?\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\()/.test(l) },
  { key: 'italic', label: 'italic outside the text classes (.text-hint / .text-empty / .text-quote)',
    test: (l) => /font-style\s*:\s*italic/.test(l) },
  { key: 'radius', label: 'border-radius literal (use a --radius-* / --btn-radius token)',
    test: (l) => /border-radius\s*:\s*[0-9]+px/.test(l) },
];

const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (f.name.endsWith('.css') && !SKIP.has(p)) files.push(p);
  }
})(SRC);

const totals = Object.fromEntries(RULES.map((r) => [r.key, 0]));
const perFile = [];
for (const file of files.sort()) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const counts = Object.fromEntries(RULES.map((r) => [r.key, 0]));
  let inComment = false;
  lines.forEach((raw, i) => {
    // drop comments (a style-ok reason lives in one, so check for it first)
    if (/style-ok\s*:/.test(raw)) return;
    let line = raw;
    if (inComment) { const end = line.indexOf('*/'); if (end < 0) return; line = line.slice(end + 2); inComment = false; }
    line = line.replace(/\/\*.*?\*\//g, '');
    const open = line.indexOf('/*'); if (open >= 0) { line = line.slice(0, open); inComment = true; }
    for (const r of RULES) {
      if (r.test(line)) {
        counts[r.key]++; totals[r.key]++;
        if (list) console.log(`${path.relative(SRC, file)}:${i + 1}  [${r.key}]  ${raw.trim()}`);
      }
    }
  });
  const n = Object.values(counts).reduce((a, b) => a + b, 0);
  if (n) perFile.push([path.relative(SRC, file), n, counts]);
}

if (!list) {
  perFile.sort((a, b) => b[1] - a[1]).forEach(([f, n, c]) => {
    const detail = Object.entries(c).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ');
    console.log(`${String(n).padStart(4)}  ${f}  (${detail})`);
  });
}
console.log('\nTotals:', RULES.map((r) => `${r.key} ${totals[r.key]}`).join(' · '));
const all = Object.values(totals).reduce((a, b) => a + b, 0);
if (strict && all) process.exit(1);
