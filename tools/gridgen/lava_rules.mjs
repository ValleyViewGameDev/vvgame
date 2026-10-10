// Lava rules (owner, 2026-10-10; docs/making-original-grids.md): lava always meets the land through
// a rim of stone (slate). Two edits in the Inferno, south-east of the frontier:
//  1. ISLANDS: land wholly enclosed by lava that touches 1014571, 1015511 or 1015427 is dirt and
//     stone, no grass: grass, moss and clay become dirt; a stone rim at least RIM tiles wide lines
//     the lava.
//  2. RIVER: from 1015435 to 1015530 the lava runs right down to the river's north bank: land between
//     the lava field and the first water below it becomes lava, the last RIM tiles before the water
//     stone, and the new lava gets the stone rim wherever it meets land.
// Only tiles holding nothing or a tree, rock or doober change (an NPC or building blocks the tile and
// is reported); water, roads, cobbles, snow and sand never change.
//
// Deterministic and idempotent: phase1_build.mjs re-applies it to Claude's grids after every rebuild
// (the owner's grids keep what was written once):
//   node tools/gridgen/lava_rules.mjs [--owner]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXED = path.join(HERE, '..', '..', 'game-server', 'layouts', 'gridLayouts', 'valleyFixedCoord');
const N = 64, RIM = 2;
const coordOf = (fr, fc) => 1010000 + Math.floor(fr / 8) * 1000 + Math.floor(fc / 8) * 100 + (fr % 8) * 10 + (fc % 8);
const cellOf = (c) => [Math.floor((c % 10000) / 1000) * 8 + Math.floor((c % 100) / 10), Math.floor((c % 1000) / 100) * 8 + (c % 10)];
const ISLAND_GRIDS = [1014571, 1015511, 1015427];
const AREA = { r0: 36, r1: 46, c0: 35, c1: 44 };   // the lava field round them (frontier rows/cols)
// the river stretch: 1015435 (row 43, col 37) to 1015530 (row 43, col 40); the lava field's south
// edge is near world row 2746, the north bank below it
const RIVER = { x0: 37 * N, x1: 41 * N, top: 2740, bottom: 44 * N };
const LANDISH = new Set(['GR', 'DI', 'ZZ', 'CY', 'SL']);   // ground that may become lava / stone / dirt

function hash2(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function noise(x, y, cell, s) {
  const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash2(ix, iy, s) * (1 - sx) + hash2(ix + 1, iy, s) * sx, b = hash2(ix, iy + 1, s) * (1 - sx) + hash2(ix + 1, iy + 1, s) * sx;
  return a * (1 - sy) + b * sy;
}
const DIRT_MIX = [['OT', 0.35], ['PT', 0.13], ['h2', 0.005]];
const SLATE_MIX = [['RO', 0.054], ['st', 0.016]];
const pick = (mix, r) => { for (const [k, p] of mix) { if (r < p) return k; r -= p; } return '**'; };

/**
 * Apply both rules to the world. load(fr, fc) -> layout (mutated in place); returns
 * { changed: Map(coord -> tiles changed), blocked: [...] }.
 */
export function applyLavaRules(load, resourcesByKey) {
  const X0 = AREA.c0 * N, Y0 = AREA.r0 * N, W = (AREA.c1 - AREA.c0 + 1) * N, H = (AREA.r1 - AREA.r0 + 1) * N;
  const cell = (X, Y) => { if (X < X0 || Y < Y0 || X >= X0 + W || Y >= Y0 + H) return null; const L = load(Math.floor(Y / N), Math.floor(X / N)); return L ? { L, x: X % N, y: Y % N } : null; };
  const tile = (X, Y) => { const c = cell(X, Y); return c ? c.L.tiles[c.y][c.x] : null; };
  const clearable = (k) => k === '**' || ['source', 'doober'].includes(resourcesByKey.get(k)?.category);
  const valid = (k, t) => k !== '**' && !!resourcesByKey.get(k)?.[`validon${({ SL: 's', GR: 'g', DI: 'd' })[t]}`];
  const changed = new Map(), blocked = [];
  const westEdge = (Y) => RIVER.x0 + Math.round(16 * (noise(0, Y, 9, 409) - 0.5));   // ragged, not a grid line
  const moved = [];
  // an NPC on ground that becomes lava walks to the nearest free land tile of its own grid, away
  // from the lava (anything else that cannot be cleared keeps its tile)
  const relocate = (c, X, Y, k) => {
    if (resourcesByKey.get(k)?.category !== 'npc') return false;
    for (let r = 1; r < N; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = c.x + dx, y = c.y + dy; if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const t = c.L.tiles[y][x];
      if (!['GR', 'DI'].includes(t) || c.L.resources[y][x] !== '**' || nearTile(X + dx, Y + dy, RIM + 2, (u) => u === 'LV') || newLavaPlanned(X + dx, Y + dy)) continue;
      c.L.resources[y][x] = k; c.L.resources[c.y][c.x] = '**';
      moved.push(`${coordOf(Math.floor(Y / N), Math.floor(X / N))} ${resourcesByKey.get(k).type} (${c.x},${c.y}) -> (${x},${y})`);
      return true;
    }
    return false;
  };
  const set = (X, Y, t, mix) => {
    const c = cell(X, Y); if (!c) return false;
    const old = c.L.tiles[c.y][c.x];
    let k = c.L.resources[c.y][c.x];
    if (!clearable(k) && relocate(c, X, Y, k)) k = '**';
    if (!clearable(k)) { blocked.push(`${coordOf(Math.floor(Y / N), Math.floor(X / N))} (${c.x},${c.y}) ${resourcesByKey.get(k)?.type || k}`); return false; }
    const nk = t === 'LV' ? '**' : valid(k, t) ? k : pick(mix, hash2(X, Y, 401));
    if (old === t && nk === k) return true;
    c.L.tiles[c.y][c.x] = t; c.L.resources[c.y][c.x] = nk;
    const g = coordOf(Math.floor(Y / N), Math.floor(X / N)); changed.set(g, (changed.get(g) || 0) + 1);
    return true;
  };
  const newLavaPlanned = (X, Y) => {
    if (X < RIVER.x0 - 8 || X >= RIVER.x1 || Y < RIVER.top || Y >= RIVER.bottom || X < westEdge(Y)) return false;
    for (let y = Y; y < RIVER.bottom; y++) if (tile(X, y) === 'WA') return true;
    return false;
  };
  const nearTile = (X, Y, r, test) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if ((dx || dy) && test(tile(X + dx, Y + dy), X + dx, Y + dy)) return true; return false; };

  // 2. RIVER: per column, land from the (ragged) top down to the first water becomes lava
  const newLava = new Set();
  for (let X = RIVER.x0 - 8; X < RIVER.x1; X++) {
    let bank = null;
    for (let Y = RIVER.top; Y < RIVER.bottom; Y++) if (tile(X, Y) === 'WA') { bank = Y; break; }
    if (bank === null) continue;
    const top = RIVER.top + Math.round(8 * noise(X, 0, 11, 407));   // ragged where it cuts under land
    for (let Y = top; Y < bank; Y++) if (X >= westEdge(Y) && LANDISH.has(tile(X, Y)) && set(X, Y, 'LV')) newLava.add(Y * 100000 + X);
  }
  // the west end of the new lava may run past the river stretch's first column: fine, it's ragged
  // stone between new lava and water (a narrow shore), then the stone rim where new lava meets land
  for (const key of newLava) {
    const X = key % 100000, Y = Math.floor(key / 100000);
    if (nearTile(X, Y, RIM, (t) => t === 'WA')) set(X, Y, 'SL', SLATE_MIX);
  }
  // the rim spreads RIM steps from the new lava through land only (never across a river strand)
  let front = [...newLava].filter((key) => tile(key % 100000, Math.floor(key / 100000)) === 'LV');
  const reached = new Set(front);
  for (let step = 0; step < RIM; step++) {
    const next = [];
    for (const key of front) {
      const X = key % 100000, Y = Math.floor(key / 100000);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const k2 = (Y + dy) * 100000 + X + dx, t = tile(X + dx, Y + dy);
        if (reached.has(k2) || !t || t === 'LV' || !LANDISH.has(t)) continue;
        reached.add(k2); next.push(k2);
        if (t !== 'SL') set(X + dx, Y + dy, 'SL', SLATE_MIX);
      }
    }
    front = next;
  }

  // 1. ISLANDS: components of non-lava, non-water ground that never reach the edge of the area
  const seen = new Uint8Array(W * H);
  const targets = new Set(ISLAND_GRIDS.map(String));
  for (let y0 = 0; y0 < H; y0++) for (let x0 = 0; x0 < W; x0++) {
    if (seen[y0 * W + x0]) continue;
    const t0 = tile(X0 + x0, Y0 + y0); if (!t0 || t0 === 'LV' || t0 === 'WA') continue;
    const comp = [], stack = [y0 * W + x0]; seen[y0 * W + x0] = 1; let open = false, hits = false;
    while (stack.length) {
      const i = stack.pop(), x = i % W, y = Math.floor(i / W); comp.push(i);
      if (targets.has(String(coordOf(Math.floor((Y0 + y) / N), Math.floor((X0 + x) / N))))) hits = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) { open = true; continue; }
        const j = ny * W + nx; if (seen[j]) continue;
        const t = tile(X0 + nx, Y0 + ny); if (!t) { open = true; continue; }
        if (t === 'LV' || t === 'WA') continue;
        seen[j] = 1; stack.push(j);
      }
    }
    if (open || !hits) continue;
    for (const i of comp) {
      const X = X0 + i % W, Y = Y0 + Math.floor(i / W), t = tile(X, Y);
      if (!LANDISH.has(t)) continue;
      if (nearTile(X, Y, RIM, (u) => u === 'LV')) { if (t !== 'SL') set(X, Y, 'SL', SLATE_MIX); }
      else if (t !== 'SL' && t !== 'DI') set(X, Y, 'DI', DIRT_MIX);
    }
  }
  return { changed, blocked: [...new Set(blocked)], moved };
}

export const LAVA_AREA = AREA;

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const man = JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'phase1-manifest.json'), 'utf8'));
  const res = JSON.parse(fs.readFileSync(path.join(HERE, '..', '..', 'game-server', 'tuning', 'resources.json'), 'utf8'));
  const byKey = new Map(res.filter((x) => x.layoutkey).map((x) => [x.layoutkey, x]));
  const isGen = (c) => !!man[c] && !man[c].ownerEdited;
  const owner = process.argv.includes('--owner');
  const cache = new Map();
  const load = (fr, fc) => {
    const c = coordOf(fr, fc); if (cache.has(c)) return cache.get(c);
    const f = path.join(FIXED, `${c}.json`), L = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
    // grids that may not be written are still read (as neighbours) but edits to them are dropped
    cache.set(c, L); return L;
  };
  const { changed, blocked, moved } = applyLavaRules(load, byKey);
  const crypto = await import('crypto');
  const written = [];
  for (const [c, n] of changed) {
    if (!isGen(String(c)) && !owner) continue;
    const f = path.join(FIXED, `${c}.json`), pretty = fs.readFileSync(f, 'utf8').startsWith('{\n');
    fs.writeFileSync(f, pretty ? JSON.stringify(cache.get(c), null, 2) : JSON.stringify(cache.get(c)));
    if (isGen(String(c))) man[c].sha1 = crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
    written.push(`${c}${isGen(String(c)) ? '' : '*'}:${n}`);
  }
  fs.writeFileSync(path.join(HERE, 'data', 'phase1-manifest.json'), JSON.stringify(man, null, 1));
  console.log(`lava rules: ${written.length} grids written (* = owner): ${written.join(' ')}`);
  if (moved.length) console.log(`NPCs moved off the new lava (${moved.length}): ${moved.join('; ')}`);
  if (blocked.length) console.log(`blocked (kept as they are, ${blocked.length}): ${blocked.slice(0, 20).join('; ')}`);
}
