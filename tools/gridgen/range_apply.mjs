// Apply a data/mountains.json range to EXISTING generated templates (Claude's own phase-1 grids,
// tools/gridgen/data/phase1-manifest.json). Unlike phase2_owner_patch.mjs (owner templates: only
// trees may be cleared), the band here may also clear rocks, flowers and other loose 'source' /
// 'doober' resources so the range seals; creatures (npc) standing in the band move to the nearest
// free tile outside it. Buildings, walls, decorations, existing mountains, and paving, sand,
// snow and water tiles are never touched. A range's `gaps` (passes) stay open.
//
//   node tools/gridgen/range_apply.mjs <gridCoord>... [--out <dir>]   (default: rewrite in place)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as M from '../editor/client/layouts/GridModel.js';
import { rangeMasks, packMountains, MOUNTAIN_SIZE } from './mountains.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GS = path.join(HERE, '..', '..', 'game-server');
const DIR = path.join(GS, 'layouts', 'gridLayouts', 'valleyFixedCoord');
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outDir = outIdx >= 0 ? args[outIdx + 1] : null;
const coords = args.filter((a, i) => /^\d+$/.test(a) && !(outIdx >= 0 && i === outIdx + 1)).map(Number);
const resources = JSON.parse(fs.readFileSync(path.join(GS, 'tuning', 'resources.json'), 'utf8'));
const byType = new Map(resources.map((r) => [r.type, r]));
const idx = M.buildIndex(resources);
const ranges = JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'mountains.json'), 'utf8')).ranges;

// same noise and coordinates as phase1_build.mjs / phase2_owner_patch.mjs, so bands line up across grid edges
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

const OPEN_GROUND = new Set(['GR', 'DI', 'SL', 'ZZ', 'CY']);
const CLEARABLE = new Set(['source', 'doober']);   // trees, rocks, flowers, loose items

for (const coord of coords) {
  if (!masks.has(coord)) { console.log(`${coord}: no range crosses it`); continue; }
  const file = path.join(DIR, `${coord}.json`);
  const raw = fs.readFileSync(file, 'utf8');
  const layout = JSON.parse(raw);
  const state = M.fromLayout(layout, idx);
  const g = state.grid;
  const { mask, range } = masks.get(coord);

  // existing mountains already block
  const covered = new Uint8Array(64 * 64);
  g.forEach((row, y) => row.forEach((c, x) => {
    const s = MOUNTAIN_SIZE[c.resource];
    if (s) for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) if (y - dy >= 0 && x + dx < 64) covered[(y - dy) * 64 + x + dx] = 1;
  }));

  // creatures off the band (and its fringe) first, to the nearest free open tile outside it
  let moved = 0;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const t = g[y][x].resource; if (!t || byType.get(t)?.category !== 'npc' || mask[y * 64 + x] < 1) continue;
    let best = null;
    for (let d = 1; d < 20 && !best; d++) for (let yy = y - d; yy <= y + d && !best; yy++) for (let xx = x - d; xx <= x + d && !best; xx++) {
      if (xx < 0 || yy < 0 || xx > 63 || yy > 63 || mask[yy * 64 + xx] >= 1 || g[yy][xx].resource || !OPEN_GROUND.has(g[yy][xx].type) || covered[yy * 64 + xx]) continue;
      best = [xx, yy];
    }
    if (best) { g[best[1]][best[0]].resource = t; g[y][x].resource = ''; moved++; }
  }

  const keep = (x, y) => {
    if (!OPEN_GROUND.has(g[y][x].type)) return true;                 // paving, sand, snow, water...
    const t = g[y][x].resource; if (!t) return false;
    return !CLEARABLE.has(byType.get(t)?.category);                    // buildings, walls, deco, npcs stay
  };
  const r = packMountains(g, mask, mulberry32(coord * 13), { ground: range.ground || 'DI', fillToWaterTiles: range.fillToWaterTiles || 0, keep, preCovered: (x, y) => covered[y * 64 + x] === 1 });

  // the band's dirt fringe may leave a loose resource on ground it is not valid on (Rocks only on
  // slate, Tulip / Mushroom only on moss): clear those, as the band itself would
  const letterOf = (key) => idx.tileByLayoutKey.get(key)?.type;
  let invalid = 0;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const t = g[y][x].resource, def = t && byType.get(t);
    if (def && CLEARABLE.has(def.category) && mask[y * 64 + x] >= 1 && !def[`validon${letterOf(g[y][x].type)}`]) { g[y][x].resource = ''; invalid++; }
  }

  const next = M.toLayout(state, idx);
  const result = { ...layout, tiles: next.tiles, resources: next.resources };
  const compact = raw === JSON.stringify(JSON.parse(raw));
  const out = compact ? JSON.stringify(result) : JSON.stringify(result, null, 2) + (raw.endsWith('\n') ? '\n' : '');
  fs.writeFileSync(outDir ? path.join(outDir, `${coord}.json`) : file, out);
  console.log(`${coord}: ${r.large} large + ${r.small} small mountains, ${moved} creatures moved off the band, ${invalid} loose resources cleared off the new ground, ${r.open} band tiles left open`);
}
