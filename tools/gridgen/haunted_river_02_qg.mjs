// Haunted River, pass 1 (redo, 2026-10-09), step 2 of 2. docs/making-original-grids.md
//
// For each <coord>.geo.json from haunted_river_02_geo.py:
//   1. the base (water + pavement only) goes through the editor's REAL quickGenerate()
//      (tools/editor/client/layouts/GridModel.js): a randomValleyGridLayouts.json row for the
//      grid's valley type sets the deposit clumps, the tile mix, the resource quantities and
//      the enemies, exactly as the Layouts tab's ⚡ Quick Generate button does;
//   2. enemy policy: the brief keeps enemies to the set grids, so template enemies are dropped
//      elsewhere; in a set grid they are moved into the set's area (same counts);
//   3. the hand-made overlays (town, Scriptorium, landing, meadow, hollow) are applied;
//   4. a few template resources are moved INTO the sets (counts unchanged), haunted flavour on
//      the riverbanks (some trees near water become Dead Trees), then every placement is checked
//      against validon and invalid ones dropped.
// Seeded (Math.random replaced per grid), so a run regenerates the same files.
//
//   node tools/gridgen/haunted_river_02_qg.mjs <dir with .geo.json> [outDir]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as M from '../editor/client/layouts/GridModel.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GS = path.join(HERE, '..', '..', 'game-server');
const IN = process.argv[2] || path.join(HERE, 'out');
const OUT = process.argv[3] || IN;
const resources = JSON.parse(fs.readFileSync(path.join(GS, 'tuning', 'resources.json'), 'utf8'));
const ROWS = JSON.parse(fs.readFileSync(path.join(GS, 'layouts', 'gridLayouts', 'randomValleyGridLayouts.json'), 'utf8'));
const idx = M.buildIndex(resources);

// Rows: random among the grid's valley type (what the button does), except where a set wants
// the matching themed row: the bee meadow takes the Honey-rich row, the spider hollow the spider row.
const ROW_CHOICE = { C: 'valley2Layout2', F: 'valley2LayoutSpider2' };
const ENEMY_GRIDS = { F: 'hollow' };      // keep template enemies here, moved into this area
const RELOCATE = { C: [['Honey', 99, 'meadow'], ['Daisy', 15, 'meadow']], F: [['Thread', 99, 'hollow']] };
const RIVER_GRIDS = new Set(['A', 'D', 'E']);

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const letterOf = (key) => idx.tileByLayoutKey.get(key)?.type;
const validOn = (type, key) => !!idx.byType.get(type)?.[`validon${letterOf(key)}`];
const isEnemy = (type) => idx.enemies.some((e) => e.type === type);

for (const f of fs.readdirSync(IN).filter((n) => n.endsWith('.geo.json')).sort()) {
  const geo = JSON.parse(fs.readFileSync(path.join(IN, f), 'utf8'));
  const { name, gridCoord, valleyType } = geo;
  Math.random = mulberry32(gridCoord);
  const rand = Math.random;
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  // 1. Quick Generate on water + pavement
  const start = M.fromLayout({ tiles: geo.base, resources: geo.base.map((r) => r.map(() => '**')) }, idx);
  let rows = ROWS.filter((r) => r.valleyType === valleyType);
  if (ROW_CHOICE[name]) rows = rows.filter((r) => r.layout === ROW_CHOICE[name]);
  const { state, template } = M.quickGenerate(start, rows, idx);
  const g = state.grid;
  const qgCounts = {};
  g.flat().forEach((c) => { if (c.resource) qgCounts[c.resource] = (qgCounts[c.resource] || 0) + 1; });

  // 2. enemies
  const area = (k) => (geo.areas[k] || []).map(([r, c]) => ({ r, c }));
  const enemies = [];
  g.forEach((row, r) => row.forEach((cell, c) => { if (cell.resource && isEnemy(cell.resource)) { enemies.push(cell.resource); cell.resource = ''; } }));
  const keptEnemies = ENEMY_GRIDS[name] ? enemies : [];

  // 3. overlays (sets): force tiles, place or clear resources
  for (const o of geo.overlay) {
    const cell = g[o.r][o.c];
    if (o.tile) cell.type = o.tile;
    if (o.res !== null && o.res !== undefined) cell.resource = o.res;
  }
  const overlaid = new Set(geo.overlay.map((o) => `${o.r},${o.c}`));

  // template enemies of a set grid go into the set's area
  if (keptEnemies.length) {
    const spots = area(ENEMY_GRIDS[name]).filter(({ r, c }) => !g[r][c].resource);
    for (const t of keptEnemies) {
      const ok = spots.filter(({ r, c }) => !g[r][c].resource && validOn(t, g[r][c].type));
      if (!ok.length) { console.log(`  ! ${name}: no room for ${t}`); continue; }
      const s = pick(ok); g[s.r][s.c].resource = t;
    }
  }

  // 4a. move template resources into the sets (counts unchanged)
  for (const [type, n, areaName] of RELOCATE[name] || []) {
    const outside = [];
    g.forEach((row, r) => row.forEach((cell, c) => { if (cell.resource === type && !overlaid.has(`${r},${c}`)) outside.push({ r, c }); }));
    let moved = 0;
    for (const from of outside.sort(() => rand() - 0.5).slice(0, n)) {
      const ok = area(areaName).filter(({ r, c }) => !g[r][c].resource && validOn(type, g[r][c].type));
      if (!ok.length) break;
      const to = pick(ok); g[from.r][from.c].resource = ''; g[to.r][to.c].resource = type; moved++;
    }
    console.log(`  ${name}: moved ${moved} ${type} into the ${areaName}`);
  }

  // 4b. haunted banks: some trees within 3 tiles of water become Dead Trees
  if (RIVER_GRIDS.has(name)) {
    const nearWater = (r, c) => { for (let dr = -3; dr <= 3; dr++) for (let dc = -3; dc <= 3; dc++) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < 64 && cc >= 0 && cc < 64 && g[rr][cc].type === 'WA') return true; } return false; };
    let n = 0;
    g.forEach((row, r) => row.forEach((cell, c) => {
      if ((cell.resource === 'Oak Tree' || cell.resource === 'Pine Tree') && !overlaid.has(`${r},${c}`) && nearWater(r, c) && rand() < 0.35) { cell.resource = 'Dead Tree'; n++; }
    }));
    console.log(`  ${name}: ${n} riverbank trees are dead`);
  }

  // 4c. validate every placement
  let dropped = 0;
  g.forEach((row) => row.forEach((cell) => {
    if (cell.resource && idx.byType.get(cell.resource)?.category !== 'editor' && !validOn(cell.resource, cell.type)) { cell.resource = ''; dropped++; }
  }));

  const layout = M.toLayout(state, idx);
  const finalCounts = {};
  g.flat().forEach((c) => { if (c.resource) finalCounts[c.resource] = (finalCounts[c.resource] || 0) + 1; });
  layout.resourceDistribution = Object.fromEntries(Object.entries(finalCounts).filter(([t]) => !isEnemy(t)));
  const en = Object.fromEntries(Object.entries(finalCounts).filter(([t]) => isEnemy(t)));
  if (Object.keys(en).length) layout.enemiesDistribution = en; else delete layout.enemiesDistribution;
  fs.writeFileSync(path.join(OUT, `${gridCoord}.json`), JSON.stringify(layout));
  const tiles = {}; g.flat().forEach((c) => { tiles[c.type] = (tiles[c.type] || 0) + 1; });
  console.log(`${name} ${gridCoord} ${valleyType}: row "${template.layout}"; template enemies ${enemies.length} (${keptEnemies.length} kept); invalid dropped ${dropped}`);
  console.log('   tiles', JSON.stringify(tiles));
  console.log('   final', JSON.stringify(finalCounts));
}
