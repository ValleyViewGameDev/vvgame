// Slate regions (owner, 2026-10-10; docs/making-original-grids.md): large natural slate areas laid
// over Claude's grids, like the slate fields round the Inferno: solid slate with organic edges, a
// speckled transition into the grass, a few dirt patches near the rim and grass islands inside.
// Each region in data/slate_regions.json is a corridor (a centreline of [frontierRow, frontierCol]
// points with a half width that swells in the middle) plus optional blobs ({ at, radius } in grid
// units), all warped by world-space noise.
//
// Only Claude's grids are written. Where a region reaches an owner grid whose tile across the edge
// is not slate, the slate recedes from that edge (8-30 tiles, varying along it), so it never stops in a straight line
// at a grid seam; where the owner's side is slate, it runs on into it. Water, lava, sand, roads,
// cobbles and snow never change; only tiles holding nothing or a tree, rock or doober do.
//
// Deterministic and idempotent; phase1_build.mjs applies it after every rebuild. CLI (to re-apply
// without a rebuild): node tools/gridgen/slate_regions.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXED = path.join(HERE, '..', '..', 'game-server', 'layouts', 'gridLayouts', 'valleyFixedCoord');
const N = 64, BAND = 5;
const coordOf = (fr, fc) => 1010000 + Math.floor(fr / 8) * 1000 + Math.floor(fc / 8) * 100 + (fr % 8) * 10 + (fc % 8);
const OPEN = new Set(['GR', 'DI', 'SL', 'ZZ']);

function hash2(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function noise(x, y, cell, s) {
  const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash2(ix, iy, s) * (1 - sx) + hash2(ix + 1, iy, s) * sx, b = hash2(ix, iy + 1, s) * (1 - sx) + hash2(ix + 1, iy + 1, s) * sx;
  return a * (1 - sy) + b * sy;
}
// the region's own resource mix, as measured on the slate and grass of the south-east (2026-10-09)
const GRASS_MIX = [['OT', 0.31], ['PT', 0.19], ['h2', 0.005], ['f1', 0.003], ['dt', 0.002]];
const DIRT_MIX = [['OT', 0.35], ['PT', 0.13], ['h2', 0.005]];
const SLATE_MIX = [['RO', 0.054], ['st', 0.016]];
const pick = (mix, r) => { for (const [k, p] of mix) { if (r < p) return k; r -= p; } return '**'; };

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
  return [Math.hypot(px - ax - t * dx, py - ay - t * dy), t];
}

/** Signed depth (tiles) of world tile (X, Y) inside region rg: > 0 inside. */
function depth(rg, X, Y, s) {
  const P = rg.points.map(([r, c]) => [c * N, r * N]);
  const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const total = cum[cum.length - 1];
  let best = -Infinity;
  for (let i = 1; i < P.length; i++) {
    const [d, t] = segDist(X + 0.5, Y + 0.5, ...P[i - 1], ...P[i]);
    const u = (cum[i - 1] + t * (cum[i] - cum[i - 1])) / total;
    const hw = N * (rg.halfWidth[0] + (rg.halfWidth[1] - rg.halfWidth[0]) * Math.sin(Math.PI * u));
    best = Math.max(best, hw - d);
  }
  for (const b of rg.blobs || []) best = Math.max(best, b.radius * N - Math.hypot(X + 0.5 - b.at[1] * N, Y + 0.5 - b.at[0] * N));
  // organic: big lobes, then smaller bays and points
  return best + 46 * (noise(X, Y, 52, s) - 0.5) * 2 + 16 * (noise(X, Y, 19, s + 2) - 0.5) * 2 + 5 * (noise(X, Y, 6, s + 4) - 0.5) * 2;
}

/**
 * Apply every region. load(fr, fc) -> layout (mutated); isGen(coord) -> Claude's grid?
 * Returns Map(coord -> tiles changed) (Claude's grids only).
 */
export function applySlateRegions(load, resourcesByKey, isGen, regions) {
  const clearable = (k) => k === '**' || ['source', 'doober'].includes(resourcesByKey.get(k)?.category);
  const valid = (k, t) => k !== '**' && !!resourcesByKey.get(k)?.[`validon${({ SL: 's', GR: 'g', DI: 'd' })[t]}`];
  const changed = new Map();
  regions.forEach((rg, ri) => {
    const s = 601 + ri * 20;
    const rows = rg.points.map((p) => p[0]).concat((rg.blobs || []).map((b) => b.at[0])), cols = rg.points.map((p) => p[1]).concat((rg.blobs || []).map((b) => b.at[1]));
    const pad = Math.max(rg.halfWidth[0], rg.halfWidth[1], ...(rg.blobs || []).map((b) => b.radius)) + 1.5;
    for (let fr = Math.floor(Math.min(...rows) - pad); fr <= Math.ceil(Math.max(...rows) + pad); fr++) for (let fc = Math.floor(Math.min(...cols) - pad); fc <= Math.ceil(Math.max(...cols) + pad); fc++) {
      const c = coordOf(fr, fc); if (!isGen(c)) continue;
      const L = load(fr, fc); if (!L) continue;
      // owner neighbours whose edge tile is not slate push the slate back from that edge
      const sides = [[0, -1], [0, 1], [-1, 0], [1, 0]].map(([dr, dc]) => ({ dr, dc, B: isGen(coordOf(fr + dr, fc + dc)) ? null : load(fr + dr, fc + dc) }));
      let n = 0;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const X = fc * N + x, Y = fr * N + y;
        let v = depth(rg, X, Y, s);
        if (v < -BAND - 1) continue;
        for (const { dr, dc, B } of sides) {
          if (!B) continue;
          const d = dc === -1 ? x : dc === 1 ? N - 1 - x : dr === -1 ? y : N - 1 - y;
          // how far the slate keeps off this edge varies along it (never a line parallel to the seam)
          const along = dc !== 0 ? Y : X, fade = 8 + 22 * noise(along, dr * 7 + dc * 13, 17, s + 21);
          if (d >= fade) continue;
          // the owner's side counts as slate if it has slate within 8 tiles of the edge here
          let slate = false;
          for (let e = 0; e < 8 && !slate; e++) { const [bx, by] = dc === -1 ? [N - 1 - e, y] : dc === 1 ? [e, y] : dr === -1 ? [x, N - 1 - e] : [x, e]; slate = B.tiles[by][bx] === 'SL'; }
          if (!slate) v = Math.min(v, (d - fade) * 3);   // edge sits `fade` tiles off the seam
        }
        const t = L.tiles[y][x], k = L.resources[y][x];
        if (!OPEN.has(t) || !clearable(k)) continue;
        // inside: slate, with grass islands deep in and dirt patches near the rim; a speckled band
        let want;
        const r = hash2(X, Y, s + 7);
        if (v > BAND) {
          if (v > 22 && noise(X, Y, 15, s + 9) > 0.7) want = 'GR';
          else if (v < 26 && noise(X, Y, 11, s + 11) > 0.76) want = 'DI';
          else want = 'SL';
        } else if (v > -BAND) {
          const p = (v + BAND) / (2 * BAND);   // 0 at the grass edge of the band, 1 at the slate edge
          want = r < p * p * (3 - 2 * p) ? 'SL' : (hash2(X, Y, s + 13) < 0.25 ? 'DI' : 'GR');
        } else continue;
        if (want === 'GR' && t === 'ZZ') continue;   // moss counts as grass
        if (want === t) continue;
        const mix = want === 'SL' ? SLATE_MIX : want === 'DI' ? DIRT_MIX : GRASS_MIX;
        L.tiles[y][x] = want; L.resources[y][x] = valid(k, want) ? k : pick(mix, hash2(X, Y, s + 17)); n++;
      }
      if (n) changed.set(c, (changed.get(c) || 0) + n);
    }
  });
  return changed;
}

export const loadRegions = () => {
  const f = path.join(HERE, 'data', 'slate_regions.json');
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
    cache.set(c, L); return L;
  };
  const changed = applySlateRegions(load, byKey, isGen, loadRegions());
  const crypto = await import('crypto');
  for (const c of changed.keys()) {
    const f = path.join(FIXED, `${c}.json`); fs.writeFileSync(f, JSON.stringify(cache.get(c)));
    man[c].sha1 = crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
  }
  fs.writeFileSync(path.join(HERE, 'data', 'phase1-manifest.json'), JSON.stringify(man, null, 1));
  console.log(`slate regions: ${[...changed.values()].reduce((a, b) => a + b, 0)} tiles in ${changed.size} grids`);
}
