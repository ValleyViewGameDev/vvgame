// Mountain ranges (phase 2, docs/making-original-grids.md): impassable bands of 'Mountain' (3x3)
// and 'Mountain Large' (4x4) along a centreline from data/mountains.json.
//
// Footprints: the anchor is the bottom-left tile and the mountain covers x..x+size-1, y-size+1..y
// (client AppInit.js shadow tiles, all impassable). Players may step diagonally between two
// blockers, so a range is sealed only if every tile of its band is covered: large mountains fill
// the core, small ones the fringe, then a seal pass covers any tile left (footprints may overlap;
// an anchor never sits inside another footprint). Every footprint stays inside its own grid, so
// each side of a grid edge seals itself. Mountains never stand on water.
const N = 64;

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return [0, 1].map((i) => 0.5 * ((2 * p1[i]) + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3));
}
function centreline(points) {      // [row, col] grid units -> dense [X, Y] tiles
  const P = points.map(([r, c]) => [c * N, r * N]), Q = [P[0], ...P, P[P.length - 1]], out = [];
  for (let i = 1; i < Q.length - 2; i++) {
    const seg = Math.max(4, Math.ceil(Math.hypot(Q[i + 1][0] - Q[i][0], Q[i + 1][1] - Q[i][1]) * 1.5));
    for (let k = 0; k < seg; k++) out.push(catmull(Q[i - 1], Q[i], Q[i + 1], Q[i + 2], k / seg));
  }
  out.push(P[P.length - 1]);
  return out;
}

/**
 * Per-cell masks for every range: Map(coord -> { mask: Uint8Array(4096), range }) with
 * 3 = core (large mountains), 2 = band (must be covered), 1 = fringe (ground tile only).
 * noise(x, y, cell, seed) in [0,1]; coordOf(fr, fc).
 */
export function rangeMasks(ranges, noise, coordOf) {
  const masks = new Map();
  const put = (X, Y, v, rg) => {
    if (X < 0 || Y < 0) return;
    const fr = Math.floor(Y / N), fc = Math.floor(X / N), c = coordOf(fr, fc);
    if (!masks.has(c)) masks.set(c, { mask: new Uint8Array(N * N), range: rg });
    const m = masks.get(c).mask, i = (Y - fr * N) * N + (X - fc * N);
    if (v > m[i]) m[i] = v;
  };
  ranges.forEach((rg, ri) => {
    const pts = centreline(rg.points);
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const L = cum[cum.length - 1], [wMin, wMax] = rg.halfWidthTiles, fringe = rg.fringeTiles ?? 4;
    for (let i = 0; i < pts.length; i++) {
      const t = cum[i] / L;
      // widest in the middle, tapering to the tips; ragged with noise
      const taper = Math.min(1, t / (rg.taperStart ?? 0.25), (1 - t) / (rg.taperEnd ?? 0.25));
      const w = (wMin + (wMax - wMin) * Math.max(0, taper)) * (0.8 + 0.4 * noise(cum[i], ri * 50, 40, 131));
      const R = w + fringe + 2, [X0, Y0] = pts[i];
      for (let Y = Math.floor(Y0 - R); Y <= Y0 + R; Y++) for (let X = Math.floor(X0 - R); X <= X0 + R; X++) {
        const d = Math.hypot(X + 0.5 - X0, Y + 0.5 - Y0) + (noise(X, Y, 6, 133 + ri) - 0.5) * 4;
        if (d <= w - 4) put(X, Y, 3, rg);
        else if (d <= w) put(X, Y, 2, rg);
        else if (d <= w + fringe * (0.5 + noise(X, Y, 5, 137))) put(X, Y, 1, rg);
      }
    }
  });
  return masks;
}

/**
 * Lay mountains on one grid. g: 64x64 of { type (layout key), resource (type name or '') }.
 * keep(x, y): true for tiles whose resource must not be cleared (an owner's buildings / NPCs);
 * such tiles are never covered. preCovered(x, y): tiles already blocked (an owner's mountains).
 */
export function packMountains(g, mask0, rand, { ground = 'DI', keep = () => false, preCovered = () => false, fillToWaterTiles = 0 } = {}) {
  // a bank range runs right down to the water: land within fillToWaterTiles of both the band and
  // the water joins the band (no walkable strip between the mountains and the river)
  const mask = Uint8Array.from(mask0);
  if (fillToWaterTiles > 0) {
    const F = fillToWaterTiles, near = (x, y, test) => { for (let dy = -F; dy <= F; dy++) for (let dx = -F; dx <= F; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < N && Y < N && test(X, Y)) return true; } return false; };
    const add = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (mask0[y * N + x] >= 2 || g[y][x].type === 'WA') continue;
      if (near(x, y, (X, Y) => mask0[Y * N + X] >= 2) && near(x, y, (X, Y) => g[Y][X].type === 'WA')) add.push(y * N + x);
    }
    for (const i of add) mask[i] = 2;
  }
  const cov = new Uint8Array(N * N), anchor = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (preCovered(x, y)) cov[y * N + x] = 1;
  const usable = (x, y) => x >= 0 && y >= 0 && x < N && y < N && g[y][x].type !== 'WA' && !keep(x, y);
  const fits = (x, y, s, minMask) => {
    if (x + s - 1 >= N || y - s + 1 < 0) return false;
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
      const X = x + dx, Y = y - dy;
      if (!usable(X, Y) || mask[Y * N + X] < minMask || anchor[Y * N + X]) return false;
    }
    return true;
  };
  // clears only tiles no mountain covered yet, so overlapping footprints never erase an anchor
  const place = (x, y, s) => {
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
      const X = x + dx, Y = y - dy;
      if ((dx || dy) && !cov[Y * N + X]) g[Y][X].resource = '';
      cov[Y * N + X] = 1;
      g[Y][X].type = ground;
    }
    g[y][x].resource = s === 4 ? 'Mountain Large' : 'Mountain';
    anchor[y * N + x] = 1;
  };
  // a cover-only footprint (seal, seams): needs its own anchor tile free, uncovered tiles usable
  const coverFits = (x, y, s) => {
    if (x < 0 || x + s - 1 >= N || y >= N || y - s + 1 < 0 || anchor[y * N + x] || !usable(x, y)) return false;
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) { const X = x + dx, Y = y - dy; if (!cov[Y * N + X] && !usable(X, Y)) return false; if (g[Y][X].type === 'WA') return false; }
    return true;
  };
  const tiles = []; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (mask[y * N + x] >= 2) tiles.push([x, y]);
  for (let i = tiles.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [tiles[i], tiles[j]] = [tiles[j], tiles[i]]; }
  const newCover = (x, y, s) => { let n = 0; for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) if (!cov[(y - dy) * N + x + dx]) n++; return n; };
  let large = 0, small = 0;
  // 0. seams: wherever the band reaches a grid edge, line that edge with mountains flush against
  // it first (a footprint can only grow right and up from its anchor, so the edge row/column is
  // otherwise the hardest to reach and was left open). Each side of a seam closes itself.
  const edgeRuns = (get) => { const out = []; let a = null; for (let i = 0; i <= N; i++) { const v = i < N && get(i); if (v && a === null) a = i; if (!v && a !== null) { out.push([a, i - 1]); a = null; } } return out; };
  const tryPlace = (x, y) => { if (coverFits(x, y, 3)) { place(x, y, 3); small++; } };
  const inBand = (x, y) => mask[y * N + x] >= 2 && g[y][x].type !== 'WA';
  for (const [a, b] of edgeRuns((y) => inBand(0, y))) { for (let y = a + 2; y <= b + 2 && y < N; y += 3) tryPlace(0, Math.min(y, N - 1)); tryPlace(0, Math.min(Math.max(b, 2), N - 1)); }
  for (const [a, b] of edgeRuns((y) => inBand(N - 1, y))) { for (let y = a + 2; y <= b + 2 && y < N; y += 3) tryPlace(N - 3, Math.min(y, N - 1)); tryPlace(N - 3, Math.min(Math.max(b, 2), N - 1)); }
  for (const [a, b] of edgeRuns((x) => inBand(x, 0))) { for (let x = a; x <= b; x += 3) tryPlace(Math.min(x, N - 3), 2); tryPlace(Math.min(Math.max(b - 2, 0), N - 3), 2); }
  for (const [a, b] of edgeRuns((x) => inBand(x, N - 1))) { for (let x = a; x <= b; x += 3) tryPlace(Math.min(x, N - 3), N - 1); tryPlace(Math.min(Math.max(b - 2, 0), N - 3), N - 1); }
  // 1. large mountains in the core (a few skipped, so the core is not a grid)
  for (const [x, y] of tiles) if (!cov[y * N + x] && fits(x, y, 4, 3) && newCover(x, y, 4) >= 12 && rand() > 0.12) { place(x, y, 4); large++; }
  // 2. small mountains through the band
  for (const [x, y] of tiles) if (!cov[y * N + x] && fits(x, y, 3, 2) && newCover(x, y, 3) >= 5) { place(x, y, 3); small++; }
  // 3. seal: every band tile covered (overlapping footprints allowed, anchors on free tiles)
  let open = 0;
  for (const [x, y] of tiles) {
    if (cov[y * N + x] || !usable(x, y)) continue;
    let best = null;
    for (let dy = 0; dy <= 2; dy++) for (let dx = 0; dx <= 2; dx++) {
      const ax = x - dx, ay = y + dy;
      // the anchor may sit inside another footprint and footprints may overlap anchors (place() keeps them)
      if (!coverFits(ax, ay, 3)) continue;
      const n = newCover(ax, ay, 3);
      if (!best || n > best.n) best = { ax, ay, n };
    }
    if (best) { place(best.ax, best.ay, 3); small++; } else open++;
  }
  // 4. the ground round the mountains: dirt (or slate) in a ragged fringe; solid on every band tile
  // and within 4 tiles of a grid edge, so the ground runs on unbroken into the neighbouring grid
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const m = mask[y * N + x];
    if (!m || g[y][x].type === 'WA' || keep(x, y)) continue;
    const nearEdge = Math.min(x, y, N - 1 - x, N - 1 - y) < 4;
    if (m >= 2 || nearEdge || rand() < 0.65) g[y][x].type = ground;
  }
  return { large, small, open };
}

export const MOUNTAIN_SIZE = { Mountain: 3, 'Mountain Large': 4 };
