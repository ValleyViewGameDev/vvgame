// Ground regions (owner, 2026-10-10; docs/making-original-grids.md): large natural areas of one
// ground (dirt, slate) laid over the frontier, with organic edges, a speckled transition into what is
// around them and islands of another ground inside. Regions are listed in data/ground_regions.json
// and applied in order, so a later region (the slate at the King's Circle gap) lies over an earlier
// one (the dirt between the rivers) and blends into it.
//
// A region is a corridor (centreline of [frontierRow, frontierCol] points, half width in grids that
// swells in the middle) plus blobs ({ at, radius }), its edge warped by noise (wobble scales it).
//   ground       'DI' | 'SL' | 'SA' | 'LV' (lava: crisp edge with a ragged slate rim, no speckle)
//   band         width of the speckled transition (tiles each side, default 5)
//   seed         [row, col]: only land joined to this point without crossing water is painted
//   islands      { ground, cell, above, soft?, gamma?, speck?, fleck? }: soft patches of another ground deep inside
//   patches      { ground, cell, above, soft?, speck?, fleck? }: soft patches near the rim (dirt on slate)
//   npcs         [{ key, rate }]: creatures scattered over the region's own ground deep inside
//   ownerGrids   owner grids the owner asked to be painted too (open ground only)
//   clearOutside owner grids whose straight blocks of slate / dirt outside every region go back to grass
//
// Each tile's ground is decided over all regions first, then written once (idempotent). Claude's
// grids are always written; owner grids only when listed and with --owner. Next to any other owner
// grid whose edge does not already show the region's ground, the region keeps 8-30 tiles off the
// seam (varying with 2D noise and measured to the nearest point of any neighbouring owner grid, diagonal
// ones included, so the edge is one curve across grid lines, never a straight line). Water, lava, sand, roads, cobbles and snow never
// change, nor any tile holding an NPC, a building or anything but a tree, rock or doober.
//   node tools/gridgen/ground_regions.mjs [--owner]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXED = path.join(HERE, '..', '..', 'game-server', 'layouts', 'gridLayouts', 'valleyFixedCoord');
const N = 64, BAND = 5;
const coordOf = (fr, fc) => 1010000 + Math.floor(fr / 8) * 1000 + Math.floor(fc / 8) * 100 + (fr % 8) * 10 + (fc % 8);
const OPEN = new Set(['GR', 'DI', 'SL', 'ZZ', 'SA']);
const TREES = new Set(['OT', 'PT', 'dt']);

function hash2(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function noise(x, y, cell, s) {
  const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash2(ix, iy, s) * (1 - sx) + hash2(ix + 1, iy, s) * sx, b = hash2(ix, iy + 1, s) * (1 - sx) + hash2(ix + 1, iy + 1, s) * sx;
  return a * (1 - sy) + b * sy;
}
// resource mixes as measured on the south-east's ground (2026-10-09); new slate also gets a few
// dead trees, and dead trees already on slate are thinned to the same rate (some grids' Quick
// Generate base strews up to 17% on slate, others none: one texture per field, not per grid)
const MIX = {
  GR: [['OT', 0.31], ['PT', 0.19], ['h2', 0.005], ['f1', 0.003], ['dt', 0.002]],
  DI: [['OT', 0.35], ['PT', 0.13], ['h2', 0.005]],
  SL: [['RO', 0.054], ['st', 0.016], ['dt', 0.012]],
  SA: [['LT', 0.02], ['RO', 0.006], ['st', 0.003]],
  LV: [],   // lava carries nothing   // the owner's sand is near bare; a beach gets a few palms
};
// islands and patches are soft, not cut out: ragged edges (a finer noise on top), a smooth ramp of
// probability across the edge (soft, in noise units), the surrounding ground speckled through them
// (speck) and a few flecks of them out in the surrounding ground (fleck); never a manicured lawn
function soft(spec, X, Y, seed) {
  const n = 0.75 * noise(X, Y, spec.cell, seed) + 0.25 * noise(X, Y, spec.cell / 3.5, seed + 1);
  const w = spec.soft ?? 0.07, t = (n - (spec.above - w)) / (2 * w);
  const p = t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(t * t * (3 - 2 * t), spec.gamma ?? 1);   // gamma > 1: the fringe stays mostly the surrounding ground
  return hash2(X, Y, seed + 3) < p * (1 - (spec.speck ?? 0.18)) + (1 - p) * (spec.fleck ?? 0);
}
const pick = (mix, r) => { for (const [k, p] of mix) { if (r < p) return k; r -= p; } return '**'; };

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
  return [Math.hypot(px - ax - t * dx, py - ay - t * dy), t];
}
function prepare(rg, ri) {
  const P = rg.points.map(([r, c]) => [c * N, r * N]);
  const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const rows = rg.points.map((p) => p[0]).concat((rg.blobs || []).map((b) => b.at[0])), cols = rg.points.map((p) => p[1]).concat((rg.blobs || []).map((b) => b.at[1]));
  const pad = Math.max(...rg.halfWidth, ...(rg.blobs || []).map((b) => b.radius)) + 1.5;
  return { ...rg, s: 601 + ri * 20, P, cum, total: cum[cum.length - 1] || 1, wobble: rg.wobble ?? 1,
    box: [Math.floor(Math.min(...rows) - pad), Math.ceil(Math.max(...rows) + pad), Math.floor(Math.min(...cols) - pad), Math.ceil(Math.max(...cols) + pad)],
    owners: new Set((rg.ownerGrids || []).map(Number)), clear: new Set((rg.clearOutside || []).map(Number)) };
}
/** Signed depth (tiles) of world tile (X, Y) inside region R: > 0 inside. */
function depth(R, X, Y) {
  let best = -Infinity;
  for (let i = 1; i < R.P.length; i++) {
    const [d, t] = segDist(X + 0.5, Y + 0.5, ...R.P[i - 1], ...R.P[i]);
    const u = (R.cum[i - 1] + t * (R.cum[i] - R.cum[i - 1])) / R.total;
    best = Math.max(best, N * (R.halfWidth[0] + (R.halfWidth[1] - R.halfWidth[0]) * Math.sin(Math.PI * u)) - d);
  }
  for (const b of R.blobs || []) best = Math.max(best, b.radius * N - Math.hypot(X + 0.5 - b.at[1] * N, Y + 0.5 - b.at[0] * N));
  const s = R.s, w = R.wobble;
  return best + w * (46 * (noise(X, Y, 52, s) - 0.5) * 2 + 16 * (noise(X, Y, 19, s + 2) - 0.5) * 2) + 5 * (noise(X, Y, 6, s + 4) - 0.5) * 2;
}

/**
 * Apply all regions. load(fr, fc) -> layout (mutated); canWrite(coord) -> may this grid be written;
 * isGen(coord) -> Claude's grid. Returns Map(coord -> tiles changed) for the grids written.
 */
export function applyGroundRegions(load, resourcesByKey, { isGen, owner = false }, regions) {
  const R = regions.map(prepare);
  const allOwners = new Set(R.flatMap((r) => [...r.owners]));
  const writable = (c) => isGen(c) || (owner && allOwners.has(c));
  const inRegionSet = (c) => isGen(c) || allOwners.has(c);   // grids that are part of the painting
  const clearable = (k) => k === '**' || ['source', 'doober'].includes(resourcesByKey.get(k)?.category);
  const valid = (k, t) => k !== '**' && !!resourcesByKey.get(k)?.[`validon${({ SL: 's', GR: 'g', DI: 'd', SA: 'n', LV: 'l' })[t]}`];
  // regions with a seed only reach the land joined to it without crossing water (a beach on one
  // bank of a river never jumps to the other)
  for (const r of R) {
    if (!r.seed) continue;
    const tileAt = (X, Y) => { const L = load(Math.floor(Y / N), Math.floor(X / N)); return L ? L.tiles[Y % N][X % N] : null; };
    const X0 = r.box[2] * N, X1 = (r.box[3] + 1) * N, Y0 = r.box[0] * N, Y1 = (r.box[1] + 1) * N;
    const inArea = (X, Y) => X >= X0 && X < X1 && Y >= Y0 && Y < Y1 && depth(r, X, Y) > -(r.band ?? BAND) - 1;
    const start = Math.round(r.seed[0] * N) * 100000 + Math.round(r.seed[1] * N);
    const reach = new Set([start]), stack = [start];
    while (stack.length) {
      const k = stack.pop(), X = k % 100000, Y = Math.floor(k / 100000);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nX = X + dx, nY = Y + dy, nk = nY * 100000 + nX;
        if (reach.has(nk) || !inArea(nX, nY)) continue;
        const t = tileAt(nX, nY); if (!t || t === 'WA' || t === 'LV') continue;
        reach.add(nk); stack.push(nk);
      }
    }
    r.reach = reach;
  }
  const grids = new Set();
  for (const r of R) for (let fr = r.box[0]; fr <= r.box[1]; fr++) for (let fc = r.box[2]; fc <= r.box[3]; fc++) grids.add(fr * 100 + fc);
  const changed = new Map();
  for (const g of grids) {
    const fr = Math.floor(g / 100), fc = g % 100, c = coordOf(fr, fc);
    if (!writable(c)) continue;
    const L = load(fr, fc); if (!L) continue;
    const clearOut = owner && R.some((r) => r.clear.has(c));
    // neighbours outside the painting: the region keeps off them unless they show its ground already
    // owner grids outside the painting, among the 8 neighbours (diagonals too, so the edge kept off
    // them is one continuous curve across grid lines, not a per-grid rectangle)
    const blockers = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const c2 = coordOf(fr + dr, fc + dc); if (inRegionSet(c2)) continue;
      const B = load(fr + dr, fc + dc); if (!B) continue;
      blockers.push({ B, x0: (fc + dc) * N, y0: (fr + dr) * N });
    }
    let n = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const X = fc * N + x, Y = fr * N + y, t = L.tiles[y][x], k = L.resources[y][x];
      if ((!OPEN.has(t) && !(t === 'CY' && R.some((r) => r.ground === 'LV'))) || !clearable(k)) continue;
      let want = null, from = null, inside = false, deep = false;
      for (const r of R) {
        let v = depth(r, X, Y);
        if (t === 'CY' && r.ground !== 'LV') continue;   // clay deposits: only lava swallows them
        const band = r.band ?? BAND;
        if (v < -band - 1) continue;
        if (r.reach && !r.reach.has(Y * 100000 + X)) continue;   // the far side of a river
        for (const { B, x0, y0 } of blockers) {
          // distance from this tile to the owner grid, and whether his side already shows our ground there
          const nx = Math.max(x0, Math.min(X, x0 + N - 1)), ny = Math.max(y0, Math.min(Y, y0 + N - 1));
          const d = Math.hypot(X - nx, Y - ny);
          const fade = 6 + 16 * noise(X, Y, 23, r.s + 21) + 10 * noise(X, Y, 8, r.s + 22);   // two octaves: never a ruled line
          if (d >= fade) continue;
          const sx = Math.sign(nx - X), sy = Math.sign(ny - Y);
          let same = false;
          for (let e = 0; e < 16 && !same; e++) {
            const bx = nx + sx * e - x0, by = ny + sy * e - y0;
            if (bx < 0 || by < 0 || bx >= N || by >= N) break;
            same = B.tiles[by][bx] === r.ground || (r.ground === 'LV' && B.tiles[by][bx] === 'SL');   // lava's own slate rim counts
          }
          if (!same) v = Math.min(v, (d - fade) * 1.5);   // gentle, so the speckled band survives
          else if (r.ground === 'LV' && depth(r, X, Y) > -40) v = Math.max(v, (12 - d) * 2);   // lava next to his lava always joins it
        }
        if (r.ground === 'LV') {
          // lava has a crisp edge and a ragged slate rim (2-4 tiles), never a speckle
          const rim = 2 + 2 * noise(X, Y, 5, r.s + 13);
          if (v > 0) { inside = true; from = r; deep = true; want = 'LV'; }
          else if (v > -rim && t !== 'CY') { inside = true; from = r; deep = false; want = 'SL'; }
          continue;
        }
        if (v > band) {
          inside = true; from = r; deep = true;
          if (r.islands && v > 14 && soft(r.islands, X, Y, r.s + 9)) want = r.islands.ground;
          else if (r.patches && v < 26 && soft(r.patches, X, Y, r.s + 11)) want = r.patches.ground;
          else want = r.ground;
        } else if (v > -band) {
          inside = true; deep = false;
          const p = (v + band) / (2 * band);
          if (hash2(X, Y, r.s + 7) < p * p * (3 - 2 * p)) { want = r.ground; from = r; }   // else: what lies under it stays
        }
      }
      if (!inside && clearOut && (t === 'SL' || t === 'DI')) want = 'GR';   // the owner's straight blocks
      if (!want || (want === 'GR' && t === 'ZZ')) continue;
      const s = from ? from.s : 999;
      // deep inside, trees and bare ground are redrawn from the region's own mix: one texture across
      // the field, whatever density each grid's base had (doobers valid on the ground stay)
      if (deep && (k === '**' || TREES.has(k) || !valid(k, want))) {
        let nk = pick(MIX[want], hash2(X, Y, s + 23));
        // the region's own creatures, scattered over its ground (e.g. coyotes on the dirt)
        if (from && want === from.ground) for (const npc of from.npcs || []) if (hash2(X, Y, s + 29 + npc.key.charCodeAt(1)) < npc.rate) nk = npc.key;
        if (want !== t || nk !== k) { L.tiles[y][x] = want; L.resources[y][x] = nk; n++; }
        continue;
      }
      const keepDt = hash2(X, Y, s + 19) >= 0.92 || pick(MIX.SL, hash2(X, Y, s + 17)) === 'dt';
      if (want === t) {
        if (t === 'SL' && k === 'dt' && !keepDt) { L.resources[y][x] = pick(MIX.SL.slice(0, 2), hash2(X, Y, s + 17)); n++; }
        continue;
      }
      let nk = valid(k, want) ? k : pick(MIX[want], hash2(X, Y, s + 17));
      if (want === 'SL' && nk === 'dt' && !keepDt) nk = pick(MIX.SL.slice(0, 2), hash2(X, Y, s + 17));
      L.tiles[y][x] = want; L.resources[y][x] = nk; n++;
    }
    if (n) changed.set(c, n);
  }
  return changed;
}

export const loadRegions = () => {
  const f = path.join(HERE, 'data', 'ground_regions.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).regions : [];
};

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const man = JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'phase1-manifest.json'), 'utf8'));
  const res = JSON.parse(fs.readFileSync(path.join(HERE, '..', '..', 'game-server', 'tuning', 'resources.json'), 'utf8'));
  const byKey = new Map(res.filter((x) => x.layoutkey).map((x) => [x.layoutkey, x]));
  const isGen = (c) => !!man[c] && !man[c].ownerEdited;
  const cache = new Map();
  const load = (fr, fc) => {
    const c = coordOf(fr, fc); if (cache.has(c)) return cache.get(c);
    const f = path.join(FIXED, `${c}.json`), L = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
    if (L) L.__pretty = fs.readFileSync(f, 'utf8').startsWith('{\n');
    cache.set(c, L); return L;
  };
  const changed = applyGroundRegions(load, byKey, { isGen, owner: process.argv.includes('--owner') }, loadRegions());
  const crypto = await import('crypto');
  const out = [];
  for (const [c, n] of changed) {
    const L = cache.get(c), pretty = L.__pretty; delete L.__pretty;
    const f = path.join(FIXED, `${c}.json`); fs.writeFileSync(f, pretty ? JSON.stringify(L, null, 2) : JSON.stringify(L));
    if (isGen(c)) man[c].sha1 = crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
    out.push(`${c}${isGen(c) ? '' : '*'}:${n}`);
  }
  fs.writeFileSync(path.join(HERE, 'data', 'phase1-manifest.json'), JSON.stringify(man, null, 1));
  console.log(`ground regions: ${out.length} grids written (* = owner): ${out.join(' ')}`);
}
