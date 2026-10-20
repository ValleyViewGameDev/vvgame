#!/usr/bin/env node
/**
 * Mark candidates as approved (docs/art-pipeline-plan.md §5). A job's folder is:
 *
 *   tools/art/_candidates/<job>/exploration/<provider>/<variant>-<subject>-<n>.png (+ .json)
 *   tools/art/_candidates/<job>/approved/<provider>--<variant>-<subject>-<n>.png (+ .json)
 *
 * generate.js writes to exploration/; this moves the named ones into approved/ (and back
 * with --undo). The approved set is what a style's bible is built from.
 *
 *   node tools/art/approve.js --job slice-a openai/flatter-farmhouse-1 openai/baseline-figure-front-1
 *   node tools/art/approve.js --job slice-a --undo openai/flatter-farmhouse-1
 *   node tools/art/approve.js --job slice-a --list
 */
const fs = require('fs');
const path = require('path');
const { CANDIDATES, ensureDir } = require('./lib/common');

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : null; };
const job = opt('job') || 'slice-a';
const names = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--job');
const root = path.join(CANDIDATES, job);
const approved = path.join(root, 'approved');
ensureDir(approved);

if (opt('list')) {
  console.log(fs.readdirSync(approved).filter((f) => f.endsWith('.png')).map((f) => '  ' + f).join('\n') || '  (none)');
  process.exit(0);
}
for (const name of names) {
  const [provider, base] = name.split('/');
  if (!provider || !base) { console.error(`expected <provider>/<file>, got "${name}"`); process.exit(1); }
  const from = opt('undo') ? approved : path.join(root, 'exploration', provider);
  const to = opt('undo') ? path.join(root, 'exploration', provider) : approved;
  ensureDir(to);
  for (const ext of ['.png', '.json']) {
    const src = path.join(from, opt('undo') ? `${provider}--${base}${ext}` : `${base}${ext}`);
    const dst = path.join(to, opt('undo') ? `${base}${ext}` : `${provider}--${base}${ext}`);
    if (!fs.existsSync(src)) { console.error(`missing ${path.relative(root, src)}`); process.exit(1); }
    fs.renameSync(src, dst);
  }
  console.log(`${opt('undo') ? 'un-approved' : 'approved'} ${name}`);
}
