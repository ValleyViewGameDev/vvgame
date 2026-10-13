#!/usr/bin/env node
/**
 * Recomputes the ECONOMY sheet's derived columns (tuning/resources.json `effort`) after a hand
 * edit or an import outside the editor. The editor does the same on every ECONOMY save.
 *
 *   node tools/derive-economy.js          -> prints what would change
 *   node tools/derive-economy.js --write  -> writes resources.json (keeps a .bak)
 *
 * The math lives in tools/editor/sheets/economy.js; see docs/tuning.md, "Effort and ask sizing".
 */
const fs = require('fs');
const path = require('path');
const { deriveResources, computeEffort } = require('./editor/sheets/economy.js'); // ESM via require (Node >= 22.12)

const file = path.join(__dirname, '../game-server/tuning/resources.json');
const write = process.argv.includes('--write');
const before = fs.readFileSync(file, 'utf8');
const rows = JSON.parse(before);
const old = new Map(rows.map((r) => [r.type, r.effort]));
const changed = deriveResources(rows);
for (const r of rows) if (old.get(r.type) !== r.effort) console.log(`${r.type.padEnd(26)} ${String(old.get(r.type) ?? '-').padStart(9)} -> ${r.effort ?? '-'}`);
console.log(`${changed} row(s) ${write ? 'updated' : 'would change (--write to save)'}; ${computeEffort(rows).size} goods have an effort.`);
if (write && changed) {
  fs.writeFileSync(file + '.bak', before);
  fs.writeFileSync(file, JSON.stringify(rows, null, 2) + '\n');
}
