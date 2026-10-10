// Ground regions (owner, 2026-10-10; docs/making-original-grids.md): large natural areas of one
// ground (dirt, slate) laid over the frontier, with organic edges, a speckled transition into what is
// around them and islands of another ground inside. Regions are listed in data/ground_regions.json
// and applied in order, so a later region (the slate at the King's Circle gap) lies over an earlier
// one (the dirt between the rivers) and blends into it.
//
// A region is a corridor (centreline of [frontierRow, frontierCol] points, half width in grids that
// swells in the middle) plus blobs ({ at, radius }), its edge warped by noise (wobble scales it).
//   ground       'DI' | 'SL'
//   islands      { ground, cell, above, soft?, gamma?, speck?, fleck? }: soft patches of another ground deep inside
//   patches      { ground, cell, above, soft?, speck?, fleck? }: soft patches near the rim (dirt on slate)
//   npcs         [{ key, rate }]: creatures scattered over the region's own ground deep inside
//   ownerGrids   owner grids the owner asked to be painted too (open ground only)
//   clearOutside owner grids whose straight blocks of slate / dirt outside every region go back to grass
//
// Each tile's ground is decided over all regions first, then written once (idempotent). Claude's
// grids are always written; owner grids only when listed and with --owner. Next to any other owner
// grid whose edge does not already show the region's ground, the region keeps 8-30 tiles off the
// seam (varying along it, never a straight line). Water, lava, sand, roads, cobbles and snow never
// change, nor any tile holding an NPC, a building or anything but a tree, rock or doober.
//   node tools/gridgen/ground_regions.mjs [--owner]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXED = path.join(HERE, '..', '..', 'game-server', 'layouts', 'gridLayouts', 'valleyFixedCoord');
const N = 64, BAND = 5;
const coordOf = (fr, fc) => 1010000 + Math.floor(fr / 8) * 1000 + Math.floor(fc / 8) * 100 + (fr % 8) * 10 + (fc % 8);
const OPEN = new Set(['GR', 'DI', 'SL', 'ZZ']);
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
  const valid = (k, t) => k !== '**' && !!resourcesByKey.get(k)?.[`validon${({ SL: 's', GR: 'g', DI: 'd' })[t]}`];
  const grids = new Set();
  for (const r of R) for (let fr = r.box[0]; fr <= r.box[1]; fr++) for (let fc = r.box[2]; fc <= r.box[3]; fc++) grids.add(fr * 100 + fc);
  const changed = new Map();
  for (const g of grids) {
    const fr = Math.floor(g / 100), fc = g % 100, c = coordOf(fr, fc);
    if (!writable(c)) continue;
    const L = load(fr, fc); if (!L) continue;
    const clearOut = owner && R.some((r) => r.clear.has(c));
    // neighbours outside the painting: the region keeps off them unless they show its ground already
    const sides = [[0, -1], [0, 1], [-1, 0], [1, 0]].map(([dr, dc]) => ({ dr, dc, B: inRegionSet(coordOf(fr + dr, fc + dc)) ? null : load(fr + dr, fc + dc) }));
    let n = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const X = fc * N + x, Y = fr * N + y, t = L.tiles[y][x], k = L.resources[y][x];
      if (!OPEN.has(t) || !clearable(k)) continue;
      let want = null, from = null, inside = false, deep = false;
      for (const r of R) {
        let v = depth(r, X, Y);
        if (v < -BAND - 1) continue;
        for (const { dr, dc, B } of sides) {
          if (!B) continue;
          const d = dc === -1 ? x : dc === 1 ? N - 1 - x : dr === -1 ? y : N - 1 - y;
          const fade = 8 + 22 * noise(dc !== 0 ? Y : X, dr * 7 + dc * 13, 17, r.s + 21);
          if (d >= fade) continue;
          let same = false;
          for (let e = 0; e < 16 && !same; e++) { const [bx, by] = dc === -1 ? [N - 1 - e, y] : dc === 1 ? [e, y] : dr === -1 ? [x, N - 1 - e] : [x, e]; same = B.tiles[by][bx] === r.ground; }
          if (!same) v = Math.min(v, (d - fade) * 3);
        }
        if (v > BAND) {
          inside = true; from = r; deep = true;
          if (r.islands && v > 14 && soft(r.islands, X, Y, r.s + 9)) want = r.islands.ground;
          else if (r.patches && v < 26 && soft(r.patches, X, Y, r.s + 11)) want = r.patches.ground;
          else want = r.ground;
        } else if (v > -BAND) {
          inside = true; deep = false;
          const p = (v + BAND) / (2 * BAND);
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
