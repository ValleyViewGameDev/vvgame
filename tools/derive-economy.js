#!/usr/bin/env node
/**
 * Recomputes the ECONOMY sheet's derived columns (tuning/resources.json `effort`, `gemcost` and
 * `offeredAt`, the last from game-server/utils/offerRules.mjs)
 * after a hand edit or an import outside the editor. The editor does the same on every ECONOMY save.
 *
 *   node tools/derive-economy.js          -> prints what would change
 *   node tools/derive-economy.js --write  -> writes resources.json (keeps a .bak)
 *
 * The math lives in tools/editor/sheets/economy.js; see docs/tuning.md, "Effort and ask sizing"
 * and "Gem prices".
 */
const fs = require('fs');
const path = require('path');
const { deriveResources, computeEffort } = require('./editor/sheets/economy.js'); // ESM via require (Node >= 22.12)
const offerRules = require('../game-server/utils/offerRules.mjs');
const { hopeArtifacts } = require('../game-server/utils/hopeArtifacts.js');

const file = path.join(__dirname, '../game-server/tuning/resources.json');
const write = process.argv.includes('--write');
const before = fs.readFileSync(file, 'utf8');
const rows = JSON.parse(before);
const old = new Map(rows.map((r) => [r.type, { effort: r.effort, gemcost: r.gemcost, offeredAt: r.offeredAt }]));
const ctx = offerRules.offerContext({ seasons: require('../game-server/tuning/seasons.json'), hopeArtifacts: hopeArtifacts() });
const changed = deriveResources(rows, { offeredAt: (r) => offerRules.offeredAtText(r, ctx) });
for (const key of ['effort', 'gemcost', 'offeredAt']) {
  for (const r of rows) {
    const was = old.get(r.type)[key];
    if (was !== r[key]) console.log(`${key.padEnd(8)} ${r.type.padEnd(26)} ${String(was ?? '-').padStart(9)} -> ${r[key] ?? '-'}`);
  }
}
console.log(`${changed} row(s) ${write ? 'updated' : 'would change (--write to save)'}; ${computeEffort(rows).size} goods have an effort.`);
if (write && changed) {
  fs.writeFileSync(file + '.bak', before);
  fs.writeFileSync(file, JSON.stringify(rows, null, 2) + '\n');
}
