// Slate blending (owner, 2026-10-09; docs/making-original-grids.md): where a slate-heavy grid meets
// grass or dirt across a grid edge in a straight line, the edge becomes an organic transition: a
// ragged band about BAND tiles each side of the seam, decided by world-space noise, where slate
// pushes into the grass (with a few Rocks) and grass (with a few trees) pushes into the slate. It
// fades out at the ends of each straight run. Water, lava, sand, paving, cobbles and snow are never
// changed (the owner's water canals between slate and lava stay hard), nor any tile holding an NPC,
// a building or anything but a tree, rock or doober.
//
// The seams to blend are recorded in data/slate_seams.json (found once with --find), so a rebuild of
// Claude's grids re-applies exactly the same blend while the owner's side keeps his.
//   node tools/gridgen/slate_blend.mjs --find [--owner]   find hard seams in the south-east, record, blend
//   node tools/gridgen/slate_blend.mjs [--owner]          re-apply recorded seams
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXED = path.join(HERE, '..', '..', 'game-server', 'layouts', 'gridLayouts', 'valleyFixedCoord');
const SEAMS = path.join(HERE, 'data', 'slate_seams.json');
const N = 64, BAND = 14, PUSH = 10, MIN_RUN = 8, TAPER = 8;
const REGION = { r0: 30, r1: 55, c0: 30, c1: 55 };   // the south-east of the frontier
const LAND = new Set(['GR', 'DI']);
const coordOf = (fr, fc) => 1010000 + Math.floor(fr / 8) * 1000 + Math.floor(fc / 8) * 100 + (fr % 8) * 10 + (fc % 8);

function hash2(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function noise(x, y, cell, s) {
  const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash2(ix, iy, s) * (1 - sx) + hash2(ix + 1, iy, s) * sx, b = hash2(ix, iy + 1, s) * (1 - sx) + hash2(ix + 1, iy + 1, s) * sx;
  return a * (1 - sy) + b * sy;
}
const fbm = (x, y) => 0.55 * noise(x, y, 17, 211) + 0.3 * noise(x, y, 7, 213) + 0.15 * noise(x, y, 3, 217);   // [0,1]

/** Find hard slate seams in the region from the CURRENT files (run once, before any blending). */
export function findSeams(load) {
  const seams = [];
  for (let fr = REGION.r0; fr <= REGION.r1; fr++) for (let fc = REGION.c0; fc <= REGION.c1; fc++) {
    const A = load(fr, fc); if (!A) continue;
    for (const [dr, dc] of [[0, 1], [1, 0]]) {
      const B = load(fr + dr, fc + dc); if (!B) continue;
      const pos = [];   // +1: slate on A's side, -1: slate on B's side, 0: not hard
      for (let i = 0; i < N; i++) {
        const a = dc ? A.tiles[i][N - 1] : A.tiles[N - 1][i], b = dc ? B.tiles[i][0] : B.tiles[0][i];
        pos.push(a === 'SL' && LAND.has(b) ? 1 : b === 'SL' && LAND.has(a) ? -1 : 0);
      }
      for (const side of [1, -1]) {
        // runs of hard positions with this orientation, small gaps (< 6) bridged
        const runs = []; let s = null, gap = 0;
        for (let i = 0; i <= N; i++) {
          const hit = i < N && pos[i] === side;
          if (hit) { if (s === null) s = i; gap = 0; }
          else if (s !== null) { gap++; if (gap >= 6 || i === N) { const e = i - gap; if (e - s + 1 >= MIN_RUN) runs.push([s, e]); s = null; gap = 0; } }
        }
        if (runs.length) seams.push({ a: coordOf(fr, fc), b: coordOf(fr + dr, fc + dc), axis: dc ? 'vertical' : 'horizontal', slateSide: side === 1 ? 'a' : 'b', runs });
      }
    }
  }
  return seams;
}

/** Apply every recorded seam to grid `coord` (L = its layout, mutated). Returns tiles changed. */
export function blendGrid(coord, L, seams, resourcesByKey) {
  let changed = 0;
  const frOf = (c) => Math.floor((c % 10000) / 1000) * 8 + Math.floor((c % 100) / 10), fcOf = (c) => Math.floor((c % 1000) / 100) * 8 + (c % 10);
  const fr = frOf(coord), fc = fcOf(coord);
  const clearable = (k) => k === '**' || ['source', 'doober'].includes(resourcesByKey.get(k)?.category);
  const valid = (k, tile) => k === '**' || !!resourcesByKey.get(k)?.[`validon${({ SL: 's', GR: 'g', DI: 'd' })[tile]}`];
  for (const sm of seams) {
    if (sm.a !== coord && sm.b !== coord) continue;
    const onA = sm.a === coord, vertical = sm.axis === 'vertical';
    // seam line in world tiles: x = (fc_a + 1) * N for vertical, y = (fr_a + 1) * N for horizontal
    const seamLine = vertical ? (fcOf(sm.a) + 1) * N : (frOf(sm.a) + 1) * N;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const X = fc * N + x, Y = fr * N + y;
      const along = vertical ? y : x;                                     // position along the seam
      // strength: 1 inside a run, fading to 0 TAPER tiles beyond its ends
      let w = 0;
      for (const [s, e] of sm.runs) { const out = along < s ? s - along : along > e ? along - e : 0; w = Math.max(w, 1 - out / TAPER); }
      if (w <= 0) continue;
      const dA = vertical ? seamLine - 0.5 - X : seamLine - 0.5 - Y;      // > 0 on A's side
      const dSlate = sm.slateSide === 'a' ? dA : -dA;                     // > 0 on the slate side
      if (Math.abs(dSlate) > BAND * w + 1) continue;
      const v = dSlate + PUSH * w * (fbm(X, Y) - 0.5) * 2.2;              // > 0: slate, < 0: land
      const cell = { t: L.tiles[y][x], k: L.resources[y][x] };
      if (!clearable(cell.k)) continue;
      const r = hash2(X, Y, 223);
      if (v > 0 && LAND.has(cell.t)) {
        L.tiles[y][x] = 'SL';
        L.resources[y][x] = valid(cell.k, 'SL') ? cell.k : (r < 0.12 ? 'RO' : '**');
        changed++;
      } else if (v < 0 && cell.t === 'SL') {
        const t = r < 0.22 ? 'DI' : 'GR';
        L.tiles[y][x] = t;
        L.resources[y][x] = valid(cell.k, t) ? cell.k : (hash2(X, Y, 227) < 0.3 ? (hash2(X, Y, 229) < 0.8 ? 'OT' : 'PT') : '**');
        changed++;
      }
    }
  }
  return changed;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const man = JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'phase1-manifest.json'), 'utf8'));
  const res = JSON.parse(fs.readFileSync(path.join(HERE, '..', '..', 'game-server', 'tuning', 'resources.json'), 'utf8'));
  const byKey = new Map(res.filter((x) => x.layoutkey).map((x) => [x.layoutkey, x]));
  const isGen = (c) => !!man[c] && !man[c].ownerEdited;
  const owner = process.argv.includes('--owner');
  const cache = new Map();
  const load = (fr, fc) => {
    const c = coordOf(fr, fc); if (cache.has(c)) return cache.get(c);
    const f = path.join(FIXED, `${c}.json`); if (!fs.existsSync(f)) { cache.set(c, null); return null; }
    const text = fs.readFileSync(f, 'utf8'); const L = JSON.parse(text); L.__pretty = text.startsWith('{\n'); cache.set(c, L); return L;
  };
  let seams;
  if (process.argv.includes('--find')) {
    seams = findSeams(load);
    fs.writeFileSync(SEAMS, JSON.stringify({ note: 'Hard slate seams in the south-east blended by slate_blend.mjs (found 2026-10-09). Re-applied to Claude\'s grids on every rebuild; owner grids keep the blend written once.', seams }, null, 1));
  } else seams = JSON.parse(fs.readFileSync(SEAMS, 'utf8')).seams;
  const grids = new Set(seams.flatMap((s) => [s.a, s.b]));
  let total = 0; const touched = [];
  for (const c of grids) {
    if (!isGen(String(c)) && !owner) continue;
    const fr = Math.floor((c % 10000) / 1000) * 8 + Math.floor((c % 100) / 10), fc = Math.floor((c % 1000) / 100) * 8 + (c % 10);
    const L = load(fr, fc); if (!L) continue;
    const n = blendGrid(c, L, seams, byKey);
    if (n) {
      total += n; touched.push(c);
      const pretty = L.__pretty; delete L.__pretty;
      fs.writeFileSync(path.join(FIXED, `${c}.json`), pretty ? JSON.stringify(L, null, 2) : JSON.stringify(L));
      if (isGen(String(c))) man[c].sha1 = (await import('crypto')).createHash('sha1').update(fs.readFileSync(path.join(FIXED, `${c}.json`))).digest('hex');
    }
  }
  fs.writeFileSync(path.join(HERE, 'data', 'phase1-manifest.json'), JSON.stringify(man, null, 1));
  console.log(`slate seams: ${seams.length}; tiles changed: ${total} in ${touched.length} grids (${touched.filter((c) => !isGen(String(c))).length} owner)`);
}
