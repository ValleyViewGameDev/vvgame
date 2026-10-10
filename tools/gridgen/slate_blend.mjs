// Slate blending (owner, 2026-10-09; docs/making-original-grids.md): in the south-east, where a large
// slate region meets grass or dirt along a straight line (a grid edge, a grid-sized step), the edge
// becomes organic. Water, lava, sand, paving, cobbles and snow are never changed and never count as
// slate or land, so the owner's hard canals between slate and lava stay exactly as they are; nor is
// any tile holding an NPC, a building or anything but a tree, rock or doober.
//
// Method:
//  1. class every tile: slate (1) / land (0) by a 7x7 majority (grass is flecked with slate and slate
//     with grass, so single tiles say nothing), or -1 for anything that is neither (water, lava...).
//  2. a class boundary tile is STRAIGHT when, within +-WIN tiles along its axis, at least STRAIGHT of
//     them sit on the same boundary line. Straight boundary tiles are grouped into lines.
//  3. near a line (BAND tiles, tapering over TAPER beyond its ends) the class field is domain-warped
//     by world-space noise up to PUSH tiles: a tile takes the class found at its warped position.
//     Land becoming slate gets slate (and a few Rocks); slate becoming land gets grass or dirt (and a
//     few trees), keeping a few slate flecks like the grass around it.
// The class field and the lines are found once on the un-blended world (--find) and stored in data/
// (slate_class.bin.gz, slate_seams.json), so a rebuild of Claude's grids re-applies exactly the same
// blend while the owner's grids keep theirs.
//   node tools/gridgen/slate_blend.mjs --find [--owner]   class, find, record, blend
//   node tools/gridgen/slate_blend.mjs [--owner]          re-apply the recorded blend
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXED = path.join(HERE, '..', '..', 'game-server', 'layouts', 'gridLayouts', 'valleyFixedCoord');
const SEAMS = path.join(HERE, 'data', 'slate_seams.json');
const CLASS = path.join(HERE, 'data', 'slate_class.bin.gz');
const N = 64, BAND = 30, PUSH = 22, TAPER = 14, RAD = 3, WIN = 10, STRAIGHT = 15, MIN_RUN = 24;
const REGION = { r0: 30, r1: 55, c0: 30, c1: 55 };   // the south-east of the frontier
const LAND = new Set(['GR', 'DI']);                  // the only land tiles ever changed
const CLASS_LAND = new Set(['GR', 'DI', 'ZZ', 'CY']);
const coordOf = (fr, fc) => 1010000 + Math.floor(fr / 8) * 1000 + Math.floor(fc / 8) * 100 + (fr % 8) * 10 + (fc % 8);
// the class field covers the region plus one grid all round
const F = { X0: (REGION.c0 - 1) * N, Y0: (REGION.r0 - 1) * N, W: (REGION.c1 - REGION.c0 + 3) * N, H: (REGION.r1 - REGION.r0 + 3) * N };

function hash2(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function noise(x, y, cell, s) {
  const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash2(ix, iy, s) * (1 - sx) + hash2(ix + 1, iy, s) * sx, b = hash2(ix, iy + 1, s) * (1 - sx) + hash2(ix + 1, iy + 1, s) * sx;
  return a * (1 - sy) + b * sy;
}
const fbm = (x, y, s) => 0.55 * noise(x, y, 19, s) + 0.3 * noise(x, y, 8, s + 2) + 0.15 * noise(x, y, 3, s + 4);   // [0,1]
// new ground gets the resource mix this region's ground already has (measured 2026-10-09 on the
// un-blended south-east): grass and dirt about half trees, slate a few Rocks and Stone
const GRASS_MIX = [['OT', 0.31], ['PT', 0.19], ['h2', 0.005], ['f1', 0.003], ['dt', 0.002]];
const DIRT_MIX = [['OT', 0.35], ['PT', 0.13], ['h2', 0.005]];
const SLATE_MIX = [['RO', 0.054], ['st', 0.016]];
const pick = (mix, r) => { for (const [k, p] of mix) { if (r < p) return k; r -= p; } return '**'; };
const warp = (x, y, s) => Math.max(-1, Math.min(1, (fbm(x, y, s) - 0.5) * 4));

/** load(fr, fc) for the template files on disk, cached */
export function fileLoader(dir = FIXED) {
  const cache = new Map();
  return (fr, fc) => { const c = coordOf(fr, fc); if (!cache.has(c)) { const f = path.join(dir, `${c}.json`); cache.set(c, fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null); } return cache.get(c); };
}

/** Class field over F: Int8Array, 1 slate / 0 land / -1 neither. */
export function classify(load) {
  const { X0, Y0, W, H } = F, raw = new Uint8Array(W * H);   // 1 slate, 2 land, 0 other
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const X = X0 + x, Y = Y0 + y, L = load(Math.floor(Y / N), Math.floor(X / N)), t = L ? L.tiles[Y % N][X % N] : null;
    raw[y * W + x] = t === 'SL' ? 1 : CLASS_LAND.has(t) ? 2 : 0;
  }
  const S = new Int32Array((W + 1) * (H + 1)), D = new Int32Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y + 1) * (W + 1) + x + 1, r = raw[y * W + x];
    S[i] = S[i - 1] + S[i - W - 1] - S[i - W - 2] + (r === 1 ? 1 : 0);
    D[i] = D[i - 1] + D[i - W - 1] - D[i - W - 2] + (r === 2 ? 1 : 0);
  }
  const box = (A, x, y) => { const x0 = Math.max(0, x - RAD), y0 = Math.max(0, y - RAD), x1 = Math.min(W, x + RAD + 1), y1 = Math.min(H, y + RAD + 1); return A[y1 * (W + 1) + x1] - A[y0 * (W + 1) + x1] - A[y1 * (W + 1) + x0] + A[y0 * (W + 1) + x0]; };
  const cls = new Int8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) cls[y * W + x] = raw[y * W + x] === 0 ? -1 : (box(S, x, y) > box(D, x, y) ? 1 : 0);
  return cls;
}
const at = (cls, X, Y) => { const x = X - F.X0, y = Y - F.Y0; return x < 0 || y < 0 || x >= F.W || y >= F.H ? -1 : cls[y * F.W + x]; };

/**
 * Straight slate/land boundaries in the region, as lines in world tiles: { axis, line (boundary
 * between line-1 and line), slate: +1 if slate is on the high side, from, to (along) }.
 */
export function findLines(cls) {
  const R = REGION, lines = [];
  for (const axis of ['vertical', 'horizontal']) {
    const [o0, o1, a0, a1] = axis === 'vertical' ? [R.c0 * N, (R.c1 + 1) * N, R.r0 * N, (R.r1 + 1) * N] : [R.r0 * N, (R.r1 + 1) * N, R.c0 * N, (R.c1 + 1) * N];
    const len = a1 - a0;
    for (const side of [1, -1]) {
      // B[o][a]: a slate/land boundary of this orientation between o-1 and o at position a
      const B = new Map();
      const row = (o) => {
        if (B.has(o)) return B.get(o);
        const b = new Uint8Array(len);
        for (let a = a0; a < a1; a++) {
          const [lo, hi] = axis === 'vertical' ? [at(cls, o - 1, a), at(cls, o, a)] : [at(cls, a, o - 1), at(cls, a, o)];
          b[a - a0] = side === 1 ? (hi === 1 && lo === 0) : (lo === 1 && hi === 0);
        }
        B.set(o, b); return b;
      };
      for (let o = o0 + 1; o < o1; o++) {
        // the majority class jitters a tile either way along a straight raw edge, so the line is
        // counted within +-2 of o
        const rows = [-2, -1, 0, 1, 2].map((d) => row(o + d)), pre = new Int32Array(len + 1), any = new Uint8Array(len);
        for (let i = 0; i < len; i++) { any[i] = rows.some((r) => r[i]) ? 1 : 0; pre[i + 1] = pre[i] + any[i]; }
        let s = null, last = null;
        for (let i = 0; i <= len; i++) {
          const straight = i < len && any[i] && rows[2][i] !== undefined && pre[Math.min(len, i + WIN + 1)] - pre[Math.max(0, i - WIN)] >= STRAIGHT;
          if (straight) { if (s === null) s = i; last = i; }
          else if (s !== null && (i - last > 4 || i === len)) { if (last - s + 1 >= MIN_RUN) lines.push({ axis, line: o, slate: side, from: a0 + s, to: a0 + last }); s = null; }
        }
        B.delete(o - 3);
      }
    }
  }
  // one edge jitters over neighbouring lines: merge fragments (same axis and side, within 4 tiles
  // across, gaps up to 8 along) into one line at the length-weighted mean
  const merged = [];
  for (const ln of lines.sort((p, q) => p.axis.localeCompare(q.axis) || p.slate - q.slate || p.from - q.from)) {
    const m = merged.find((g) => g.axis === ln.axis && g.slate === ln.slate && Math.abs(g.line - ln.line) <= 4 && ln.from <= g.to + 8 && ln.to >= g.from - 8);
    if (!m) { merged.push({ ...ln, wsum: (ln.to - ln.from + 1) * ln.line, n: ln.to - ln.from + 1 }); continue; }
    const k = ln.to - ln.from + 1;
    m.wsum += k * ln.line; m.n += k; m.from = Math.min(m.from, ln.from); m.to = Math.max(m.to, ln.to);
  }
  return merged.map(({ wsum, n, ...g }) => ({ ...g, line: Math.round(wsum / n) }));
}

/** Apply the blend to grid `coord` (L = its layout, mutated). Returns tiles changed. */
export function blendGrid(coord, L, lines, resourcesByKey, cls) {
  let changed = 0;
  const fr = Math.floor((coord % 10000) / 1000) * 8 + Math.floor((coord % 100) / 10), fc = Math.floor((coord % 1000) / 100) * 8 + (coord % 10);
  const gx0 = fc * N, gy0 = fr * N;
  const clearable = (k) => k === '**' || ['source', 'doober'].includes(resourcesByKey.get(k)?.category);
  const valid = (k, tile) => k === '**' || !!resourcesByKey.get(k)?.[`validon${({ SL: 's', GR: 'g', DI: 'd' })[tile]}`];
  const near = lines.filter((ln) => {
    const [o0, o1, a0, a1] = ln.axis === 'vertical' ? [gx0, gx0 + N, gy0, gy0 + N] : [gy0, gy0 + N, gx0, gx0 + N];
    return ln.line > o0 - BAND - 2 && ln.line < o1 + BAND + 2 && ln.to > a0 - TAPER && ln.from < a1 + TAPER;
  });
  if (!near.length) return 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const X = gx0 + x, Y = gy0 + y;
    // strength: from the nearest line, full within BAND/2, fading to 0 at BAND and TAPER past its ends
    let w = 0;
    for (const ln of near) {
      const along = ln.axis === 'vertical' ? Y : X, across = ln.axis === 'vertical' ? X : Y;
      const out = along < ln.from ? ln.from - along : along > ln.to ? along - ln.to : 0;
      const d = Math.abs(across + 0.5 - ln.line);
      const wl = Math.min(1, Math.max(0, 1 - out / TAPER)) * Math.min(1, Math.max(0, 2 * (1 - d / BAND)));
      if (wl > w) w = wl;
    }
    if (w <= 0) continue;
    const cur = at(cls, X, Y); if (cur < 0) continue;
    const want = at(cls, Math.round(X + PUSH * w * warp(X, Y, 301)), Math.round(Y + PUSH * w * warp(X, Y, 311)));
    if (want < 0 || want === cur) continue;   // never pull slate across water or lava
    const t = L.tiles[y][x], k = L.resources[y][x];
    if (!clearable(k)) continue;
    const r = hash2(X, Y, 223);
    if (want === 1 && LAND.has(t)) { L.tiles[y][x] = 'SL'; L.resources[y][x] = k !== '**' && valid(k, 'SL') ? k : pick(SLATE_MIX, hash2(X, Y, 227)); changed++; }
    else if (want === 0 && t === 'SL' && hash2(X, Y, 231) > 0.06) {   // a few slate flecks stay, like the grass around
      const nt = r < 0.22 ? 'DI' : 'GR';
      L.tiles[y][x] = nt; L.resources[y][x] = k !== '**' && valid(k, nt) ? k : pick(nt === 'DI' ? DIRT_MIX : GRASS_MIX, hash2(X, Y, 227)); changed++;
    }
  }
  return changed;
}

/** The recorded blend (null if none): { lines, cls } */
export function loadRecorded() {
  if (!fs.existsSync(SEAMS) || !fs.existsSync(CLASS)) return null;
  const buf = zlib.gunzipSync(fs.readFileSync(CLASS));
  return { lines: JSON.parse(fs.readFileSync(SEAMS, 'utf8')).lines, cls: new Int8Array(buf.buffer, buf.byteOffset, buf.length) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const man = JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'phase1-manifest.json'), 'utf8'));
  const res = JSON.parse(fs.readFileSync(path.join(HERE, '..', '..', 'game-server', 'tuning', 'resources.json'), 'utf8'));
  const byKey = new Map(res.filter((x) => x.layoutkey).map((x) => [x.layoutkey, x]));
  const isGen = (c) => !!man[c] && !man[c].ownerEdited;
  const owner = process.argv.includes('--owner');
  const load = fileLoader();
  let lines, cls;
  if (process.argv.includes('--find')) {
    cls = classify(load);
    lines = findLines(cls);
    fs.writeFileSync(CLASS, zlib.gzipSync(Buffer.from(cls.buffer)));
    fs.writeFileSync(SEAMS, JSON.stringify({ note: 'Straight slate/land boundaries in the south-east (found 2026-10-09 on the un-blended world, with the class field in slate_class.bin.gz), blended by slate_blend.mjs. Re-applied to Claude\'s grids on every rebuild; owner grids keep the blend written once.', lines }, null, 1));
  } else ({ lines, cls } = loadRecorded());
  let total = 0; const touched = [];
  for (let fr = REGION.r0 - 1; fr <= REGION.r1 + 1; fr++) for (let fc = REGION.c0 - 1; fc <= REGION.c1 + 1; fc++) {
    const c = coordOf(fr, fc);
    if (!isGen(String(c)) && !owner) continue;
    const L = load(fr, fc); if (!L) continue;
    const n = blendGrid(c, L, lines, byKey, cls);
    if (n) {
      total += n; touched.push(c);
      const f = path.join(FIXED, `${c}.json`), pretty = fs.readFileSync(f, 'utf8').startsWith('{\n');
      fs.writeFileSync(f, pretty ? JSON.stringify(L, null, 2) : JSON.stringify(L));
      if (isGen(String(c))) man[c].sha1 = (await import('crypto')).createHash('sha1').update(fs.readFileSync(f)).digest('hex');
    }
  }
  fs.writeFileSync(path.join(HERE, 'data', 'phase1-manifest.json'), JSON.stringify(man, null, 1));
  console.log(`slate lines: ${lines.length} (${lines.reduce((a, l) => a + l.to - l.from + 1, 0)} tiles long); tiles changed: ${total} in ${touched.length} grids (${touched.filter((c) => !isGen(String(c))).length} owner)`);
}
