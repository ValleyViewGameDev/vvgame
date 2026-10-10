// One-off, owner-approved extension of an OWNER template with a mountain range (phase 2).
// The owner asked (2026-10-09) to extend the range at 1013320 (Prospero's home) into a C; the C
// can only be sealed if the margin between his ring and the grid edges is filled. This adds
// mountains there and nothing else: his own mountains count as already blocking, and only trees
// under new footprints are cleared; NPCs, buildings,
// walls, doobers, his own mountains and everything else of his are never touched. Output keeps the editor's formatting.
//
//   node tools/gridgen/phase2_owner_patch.mjs <gridCoord> [outFile] [--again]   (default: rewrite in place)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as M from '../editor/client/layouts/GridModel.js';
import { rangeMasks, packMountains, MOUNTAIN_SIZE } from './mountains.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GS = path.join(HERE, '..', '..', 'game-server');
const coord = Number(process.argv.slice(2).find((a) => !a.startsWith('--')));
const file = path.join(GS, 'layouts', 'gridLayouts', 'valleyFixedCoord', `${coord}.json`);
const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));   // flags (--again) are not paths
const out = positional[1] || file;
const resources = JSON.parse(fs.readFileSync(path.join(GS, 'tuning', 'resources.json'), 'utf8'));
const idx = M.buildIndex(resources);
const ranges = JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'mountains.json'), 'utf8')).ranges;

// same noise and coordinates as phase1_build.mjs, so the bands line up across the grid edges
function hash2(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function noise(x, y, cell, s) {
  const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash2(ix, iy, s) * (1 - sx) + hash2(ix + 1, iy, s) * sx, b = hash2(ix, iy + 1, s) * (1 - sx) + hash2(ix + 1, iy + 1, s) * sx;
  return a * (1 - sy) + b * sy;
}
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const coordOf = (fr, fc) => 1010000 + Math.floor(fr / 8) * 1000 + Math.floor(fc / 8) * 100 + (fr % 8) * 10 + (fc % 8);

const masks = rangeMasks(ranges, noise, coordOf);
if (!masks.has(coord)) { console.log(`no range crosses ${coord}`); process.exit(0); }
const patched = JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'mountains.json'), 'utf8')).ownerPatched?.grids || [];
if (patched.includes(coord) && !process.argv.includes('--again')) { console.log(`${coord} is already in mountains.json ownerPatched; pass --again only if a NEW range crosses it`); process.exit(1); }
const layout = JSON.parse(fs.readFileSync(file, 'utf8'));
const state = M.fromLayout(layout, idx);
const g = state.grid;

const covered = new Uint8Array(64 * 64);
g.forEach((row, y) => row.forEach((c, x) => {
  const s = MOUNTAIN_SIZE[c.resource];
  if (s) for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) if (y - dy >= 0 && x + dx < 64) covered[(y - dy) * 64 + x + dx] = 1;
}));
const TREES = new Set(['Oak Tree', 'Pine Tree', 'Dead Tree']);   // the only things of his a new footprint may clear
// only plain country takes new mountains: never his snow clearing, cobbles, paving, sand or water
const OPEN_GROUND = new Set(['GR', 'DI', 'SL', 'ZZ', 'CY']);
const keep = (x, y) => { const t = g[y][x].resource; return !OPEN_GROUND.has(g[y][x].type) || (!!t && !TREES.has(t)); };   // his mountains, doobers, NPCs, buildings stay
const before = JSON.stringify(g.map((r) => r.map((c) => c.resource)));
const r = packMountains(g, masks.get(coord).mask, mulberry32(coord * 13), { ground: masks.get(coord).range.ground || 'DI', fillToWaterTiles: masks.get(coord).range.fillToWaterTiles || 0, keep, preCovered: (x, y) => covered[y * 64 + x] === 1 });

// keep the owner's distributions exactly; only tiles and resources change
const next = M.toLayout(state, idx);
const result = { ...layout, tiles: next.tiles, resources: next.resources };
fs.writeFileSync(out, JSON.stringify(result, null, 2));
const after = JSON.stringify(g.map((row) => row.map((c) => c.resource)));
let changedCells = 0; const b = JSON.parse(before), a = JSON.parse(after);
for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (b[y][x] !== a[y][x]) changedCells++;
console.log(`${coord}: added ${r.large} large + ${r.small} small mountains, ${changedCells} resource cells changed, ${r.open} band tiles left open -> ${out}`);
