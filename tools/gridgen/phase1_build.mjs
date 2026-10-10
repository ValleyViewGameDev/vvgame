// Phase 1 base build (docs/making-original-grids.md §1, §9): a template for every valley grid
// that has none: geography from docs/SoE - GRID DESIGN.xlsx (rivers, lakes, oasis sand, lava,
// slate plains, the Halloween dead zone) + the editor's real Quick Generate for the basics.
// No roads, towns or scenarios. Existing templates are never touched; new water meets their edges.
//
//   node tools/gridgen/phase1_build.mjs <outDir> [--write]   (--write: also into valleyFixedCoord, new files only)
//
// Seeded throughout: the same inputs regenerate the same files.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as M from '../editor/client/layouts/GridModel.js';
import crypto from 'crypto';
import { rangeMasks, packMountains } from './mountains.mjs';
import { fixSeams } from './seam_fix.mjs';
import { blendGrid, loadRecorded } from './slate_blend.mjs';
import { applyLavaRules } from './lava_rules.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GS = path.join(HERE, '..', '..', 'game-server');
const FIXED = path.join(GS, 'layouts', 'gridLayouts', 'valleyFixedCoord');
const OUT = process.argv[2] || path.join(HERE, 'out');
const WRITE = process.argv.includes('--write');
fs.mkdirSync(OUT, { recursive: true });

const resources = JSON.parse(fs.readFileSync(path.join(GS, 'tuning', 'resources.json'), 'utf8'));
const ROWS = JSON.parse(fs.readFileSync(path.join(GS, 'layouts', 'gridLayouts', 'randomValleyGridLayouts.json'), 'utf8'));
const LIVE = JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'live-cells-2026-10-09.json'), 'utf8')).cells;
const LABELS = JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'overview-labels.json'), 'utf8')).labels;
const idx = M.buildIndex(resources);
const N = 64;

// ------------------------------------------------------------------------------ cells
const coordOf = (fr, fc) => 1010000 + Math.floor(fr / 8) * 1000 + Math.floor(fc / 8) * 100 + (fr % 8) * 10 + (fc % 8);
const typeAt = (fr, fc) => (fr < 0 || fc < 0 || fr > 63 || fc > 63) ? null : LIVE[coordOf(fr, fc)] || null;
const isValley = (fr, fc) => (typeAt(fr, fc) || '').startsWith('valley');
const existing = new Set(fs.readdirSync(FIXED).filter((f) => /^\d+\.json$/.test(f)).map((f) => Number(f.slice(0, -5))));
// Grids Claude generated may be regenerated (never the owner's): the phase-1 cells (manifest) are
// rebuilt here; the six pass-1 Haunted River grids (PILOT) carry their sets and are rebuilt by the
// haunted_river_02 scripts, which take their river water from data/pilot-water.json written here.
const MANIFEST_PATH = path.join(HERE, 'data', 'phase1-manifest.json');
// A file counts as Claude's only while it is byte-identical to what was written (manifest sha1);
// the moment the owner saves it in the editor it is his, and is never regenerated again.
const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
const PREV = fs.existsSync(MANIFEST_PATH) ? JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) : {};
const OWNED = new Set(Object.entries(PREV).filter(([c, v]) => {
  const f = path.join(FIXED, `${c}.json`);
  if (!fs.existsSync(f) || v.ownerEdited) return false;
  return !v.sha1 || sha1(fs.readFileSync(f)) === v.sha1;
}).map(([c]) => Number(c)));
const OWNER_EDITED = Object.entries(PREV).filter(([c]) => !OWNED.has(Number(c)) && fs.existsSync(path.join(FIXED, `${c}.json`))).map(([c]) => Number(c));
const PILOT = new Set([1015166, 1015167, 1015260, 1015176, 1015177, 1015270]);
const hasTemplate = (fr, fc) => { const c = coordOf(fr, fc); return existing.has(c) && !OWNED.has(c) && !PILOT.has(c); };   // the owner's work
const isPilot = (fr, fc) => PILOT.has(coordOf(fr, fc));
const isNew = (fr, fc) => isValley(fr, fc) && !hasTemplate(fr, fc) && !isPilot(fr, fc);
const tplCache = new Map();
const tpl = (fr, fc) => { const c = coordOf(fr, fc); if (!tplCache.has(c)) tplCache.set(c, JSON.parse(fs.readFileSync(path.join(FIXED, `${c}.json`), 'utf8'))); return tplCache.get(c); };

function feature(fr, fc) {
  const raw = LABELS[`${fr},${fc}`]; if (!raw) return null;
  const b = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (b.startsWith('hauntedriver')) return 'river:haunted';
  if (b.startsWith('kingscircle')) return 'river:kings';
  if (b.startsWith('deepwoodriver')) return 'river:deepwood';
  if (b.startsWith('valleycreek')) return 'river:creek';
  if (b.startsWith('sunflowerlake') || b.startsWith('lakeedge') || b.startsWith('demonhornlake') || b.startsWith('hellsmouth')) return 'lake';
  if (b.startsWith('oasis')) return 'sand';
  if (b.startsWith('lava')) return 'lava';
  if (b.startsWith('stone')) return 'stone';
  if (b.startsWith('deadzone')) return 'deadzone';
  if (b.startsWith('ghosts') || b.startsWith('graveyard')) return 'graveyard';
  return null;   // emoji anchors (scenarios) and sunflower fields: later phases
}
const anchorNo = (fr, fc) => Number((LABELS[`${fr},${fc}`] || '').match(/(\d+)\s*$/)?.[1] || 0);
const ALL = []; for (let fr = 0; fr < 64; fr++) for (let fc = 0; fc < 64; fc++) ALL.push([fr, fc]);
const NEW = ALL.filter(([fr, fc]) => isNew(fr, fc));

// ------------------------------------------------------------------------------ seeded random + noise
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash2(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function noise(x, y, cell, s) {   // smooth value noise in [0,1], world tile coordinates
  const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash2(ix, iy, s) * (1 - sx) + hash2(ix + 1, iy, s) * sx, b = hash2(ix, iy + 1, s) * (1 - sx) + hash2(ix + 1, iy + 1, s) * sx;
  return a * (1 - sy) + b * sy;
}
const fbm = (x, y, s) => 0.6 * noise(x, y, 23, s) + 0.3 * noise(x, y, 9, s + 7) + 0.1 * noise(x, y, 4, s + 13);

// ------------------------------------------------------------------------------ per-cell water mask
const water = new Map();   // coord -> Uint8Array(4096) for NEW cells and the PILOT cells
for (const [fr, fc] of ALL) if (isNew(fr, fc) || isPilot(fr, fc)) water.set(coordOf(fr, fc), new Uint8Array(N * N));
function setWater(X, Y, v = 1) {   // world tile coords
  if (X < 0 || Y < 0) return;
  const fr = Math.floor(Y / N), fc = Math.floor(X / N);
  const m = water.get(coordOf(fr, fc)); if (!m || !(isNew(fr, fc) || isPilot(fr, fc))) return;
  m[(Y - fr * N) * N + (X - fc * N)] = v;
}

// Edge runs of water on existing templates facing NEW valley cells (the pins rivers must meet)
const DIRS = { N: [-1, 0], S: [1, 0], W: [0, -1], E: [0, 1] };
function edgeLine(t, side) {
  const T = t.tiles, out = [];
  for (let i = 0; i < N; i++) {
    const [r, c] = side === 'N' ? [0, i] : side === 'S' ? [N - 1, i] : side === 'W' ? [i, 0] : [i, N - 1];
    out.push(T[r][c] === 'WA');
  }
  return out;
}
function runs(bools) { const out = []; let s = null; bools.concat([false]).forEach((v, i) => { if (v && s === null) s = i; if (!v && s !== null) { out.push([s, i - 1]); s = null; } }); return out; }
const pins = [];   // {fr, fc (template cell), side, a, b, X, Y (world, on the shared edge), w, toFr, toFc}
for (const [fr, fc] of ALL) {
  if (!isValley(fr, fc) || !hasTemplate(fr, fc)) continue;
  for (const [side, [dr, dc]] of Object.entries(DIRS)) {
    if (!isNew(fr + dr, fc + dc)) continue;
    for (const [a, b] of runs(edgeLine(tpl(fr, fc), side))) {
      if (b - a + 1 < 3) continue;
      const m = (a + b) / 2 + 0.5;
      const X = side === 'W' ? fc * N : side === 'E' ? (fc + 1) * N : fc * N + m;
      const Y = side === 'N' ? fr * N : side === 'S' ? (fr + 1) * N : fr * N + m;
      pins.push({ fr, fc, side, a, b, X, Y, w: b - a + 1, toFr: fr + dr, toFc: fc + dc, used: false });
    }
  }
}

// ------------------------------------------------------------------------------ rivers (data/rivers.json)
// Only rivers through grids Claude generated are drawn; the owner's templates already hold Valley
// Creek, Deep Woods River and King's Circle River, closed at their edges.
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return [0, 1].map((i) => 0.5 * ((2 * p1[i]) + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3));
}
const toXY = ([r, c]) => [c * N, r * N];
function splinePath(points) {            // points in tiles; dense, ~1 tile apart
  const P = [points[0], ...points, points[points.length - 1]], out = [];
  for (let i = 1; i < P.length - 2; i++) {
    const seg = Math.max(4, Math.ceil(Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]) * 1.5));
    for (let k = 0; k < seg; k++) out.push(catmull(P[i - 1], P[i], P[i + 1], P[i + 2], k / seg));
  }
  out.push(points[points.length - 1]);
  return out;
}
// Kinoshita curve (the shape real meanders take): heading theta(s) = t0 sin(ks) + skew t0 cos(3ks).
// Integrated, then rotated and scaled so it runs exactly from A to B.
function meanderPath(A, B, lambda, thetaDeg, skew) {
  const t0 = thetaDeg * Math.PI / 180, k = 2 * Math.PI / lambda;
  const raw = [[0, 0]]; let x = 0, y = 0;
  // chord per wavelength ~ lambda * J0(t0); choose a whole number of half-waves
  const J0 = (t) => { let s = 0, term = 1; for (let m = 0; m < 20; m++) { if (m) term *= -(t * t / 4) / (m * m); s += term; } return s; };
  const chordPerWave = Math.max(0.15, Math.abs(J0(t0))) * lambda;
  const D = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const halfWaves = Math.max(2, Math.round((2 * D) / chordPerWave));
  const L = (halfWaves * lambda) / 2;
  let ph = 0;
  for (let s = 0; s < L; s += 0.5) {
    // irregular: the sweep and the pace of the bends drift, so no two lobes are alike
    const amp = t0 * (0.72 + 0.56 * noise(s + A[0], A[1], lambda * 0.6, 91));
    ph += 0.5 * k * (0.8 + 0.4 * noise(s + A[1], A[0], lambda * 0.5, 93));
    const th = amp * Math.sin(ph) + skew * amp * Math.cos(3 * ph);
    x += 0.5 * Math.cos(th); y += 0.5 * Math.sin(th); raw.push([x, y]);
  }
  const [ex, ey] = raw[raw.length - 1];
  const ang = Math.atan2(B[1] - A[1], B[0] - A[0]) - Math.atan2(ey, ex), sc = D / Math.hypot(ex, ey);
  const ca = Math.cos(ang) * sc, sa = Math.sin(ang) * sc;
  return raw.map(([u, v]) => [A[0] + u * ca - v * sa, A[1] + u * sa + v * ca]);
}
let riverTiles = null;                       // buckets of main-channel tiles, for oxbow clearance
const bucketKey = (x, y) => `${Math.floor(x / 16)},${Math.floor(y / 16)}`;
function stampDisc(X, Y, half, record = false) {
  let n = 0;
  for (let yy = Math.floor(Y - half); yy <= Math.ceil(Y + half); yy++)
    for (let xx = Math.floor(X - half); xx <= Math.ceil(X + half); xx++)
      if ((xx + 0.5 - X) ** 2 + (yy + 0.5 - Y) ** 2 <= half * half) {
        setWater(xx, yy); n++;
        if (record) { const k = bucketKey(xx, yy); if (!riverTiles.has(k)) riverTiles.set(k, []); riverTiles.get(k).push([xx, yy]); }
      }
  return n;
}
function riverWithin(x, y, r) {             // is any main-channel tile within r tiles?
  const r2 = r * r;
  for (let by = Math.floor((y - r) / 16); by <= Math.floor((y + r) / 16); by++)
    for (let bx = Math.floor((x - r) / 16); bx <= Math.floor((x + r) / 16); bx++)
      for (const [tx, ty] of riverTiles.get(`${bx},${by}`) || []) if ((tx - x) ** 2 + (ty - y) ** 2 < r2) return true;
  return false;
}
const RIVERS = JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'rivers.json'), 'utf8')).rivers;
const riverStats = [];
for (const rv of RIVERS) {
  // assemble one dense centreline from the segments
  const pts = []; let narrowFrom = null, narrowTo = null; riverTiles = new Map();
  const segRange = [];   // [startIndex, endIndex] of each segment in pts
  for (const sg of rv.segments) {
    const start = pts.length ? pts[pts.length - 1] : null;
    let seg;
    if (sg.type === 'spline') {
      seg = splinePath((start ? [start] : []).concat(sg.points.map(toXY)));
      if (sg.wobbleTiles) {   // a slow sideways drift so long reaches are not ruler-straight (zero at both ends)
        const c = [0]; for (let i = 1; i < seg.length; i++) c.push(c[i - 1] + Math.hypot(seg[i][0] - seg[i - 1][0], seg[i][1] - seg[i - 1][1]));
        const Ls = c[c.length - 1];
        seg = seg.map((p, i) => {
          const a = seg[Math.max(0, i - 3)], b = seg[Math.min(seg.length - 1, i + 3)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
          const off = sg.wobbleTiles * Math.sin(Math.PI * c[i] / Ls) * (noise(c[i], 11, 70, 97) - 0.5) * 2;
          return [p[0] - (dy / l) * off, p[1] + (dx / l) * off];
        });
      }
    }
    else seg = meanderPath(start, toXY(sg.to), sg.wavelengthTiles, sg.thetaDeg, sg.skew || 0);
    if (sg.narrowTo) { narrowFrom = pts.length; narrowTo = sg.narrowTo; }
    const from = pts.length;
    pts.push(...(start ? seg.slice(1) : seg));
    segRange.push([from, pts.length - 1]);
  }
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const [wLo, wHi] = rv.widthTiles;
  let drawn = 0;
  for (let i = 0; i < pts.length; i++) {
    let w = wLo + (wHi - wLo) * noise(cum[i], 0, 60, 77);
    if (narrowFrom !== null && i >= narrowFrom) { const t = (i - narrowFrom) / Math.max(1, pts.length - 1 - narrowFrom); w = w * (1 - t) + narrowTo * t; }
    const half = (w / 2) * (0.92 + 0.16 * noise(cum[i], 7, 9, 5));     // ragged banks
    drawn += stampDisc(pts[i][0], pts[i][1], half, true);
  }
  for (const ox of rv.oxbows || []) {        // cut-off crescents beside a meander, placed automatically:
    // the candidate nearest the river whose whole crescent keeps >= minGap tiles of land from it
    const [i0, i1] = segRange[ox.segment];
    const rr = (ox.radiusTiles || 26) * 1.0, arcAt = (cx, cy, a) => [cx + rr * Math.cos(a * Math.PI / 180), cy + rr * Math.sin(a * Math.PI / 180)];
    let best = null;
    const need = (ox.minGap || 10) + ox.widthTiles / 2;
    for (let i = i0; i <= i1; i += 10) for (const off of [-1, 1]) for (let dist = rr + 14; dist <= rr + 60; dist += 6) {
      const a = pts[Math.max(i0, i - 3)], b = pts[Math.min(i1, i + 3)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      const cx = pts[i][0] - (dy / l) * off * dist, cy = pts[i][1] + (dx / l) * off * dist;
      // open side of the crescent faces the river
      const face = Math.atan2(pts[i][1] - cy, pts[i][0] - cx) * 180 / Math.PI;
      const from = face + 70, to = face + 290;
      let clear = true;
      for (let ang = from; ang <= to && clear; ang += 8) { const [x, y] = arcAt(cx, cy, ang); if (riverWithin(x, y, need)) clear = false; }
      if (!clear) continue;
      // nearest clear spot to the channel wins (it reads as the river's own cut-off loop)
      const gap = dist;
      if (!best || gap < best.gap) best = { cx, cy, from, to, gap };
    }
    if (!best) { riverStats.push(`  oxbow on segment ${ox.segment}: no room`); continue; }
    const cx = best.cx, cy = best.cy; ox.fromDeg = best.from; ox.toDeg = best.to;
    riverStats.push(`  oxbow on segment ${ox.segment} at row ${(cy / N).toFixed(2)}, col ${(cx / N).toFixed(2)}`);
    for (let a = ox.fromDeg; a <= ox.toDeg; a += 0.5) {
      const r = rr * (0.92 + 0.16 * noise(a, 3, 20, 81));
      stampDisc(cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180), (ox.widthTiles / 2) * Math.sin(Math.PI * (a - ox.fromDeg) / (ox.toDeg - ox.fromDeg)) ** 0.35);
    }
  }
  if (rv.terminal) {                         // the little water system it ends in (cf. 1012304)
    const T = rv.terminal, [cx, cy] = toXY(T.center), [rx, ry] = T.pond;
    for (let yy = Math.floor(cy - ry - 8); yy <= cy + ry + 8; yy++) for (let xx = Math.floor(cx - rx - 8); xx <= cx + rx + 8; xx++) {
      const e = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 + 0.55 * (noise(xx, yy, 6, 83) - 0.5);
      const isle = T.style === 'rivulets' ? 9 : ((xx - cx - 2) / (rx * 0.32)) ** 2 + ((yy - cy + 1) / (ry * 0.3)) ** 2;
      if (e <= 1 && isle > 1) setWater(xx, yy);
    }
    for (const [deg, len] of T.creeks) {
      const a = deg * Math.PI / 180, A = [cx + rx * 0.8 * Math.cos(a), cy + ry * 0.8 * Math.sin(a)], B = [A[0] + len * Math.cos(a), A[1] + len * Math.sin(a)];
      const creek = T.style === 'rivulets' ? meanderPath(A, B, 16, 60, 0.2) : meanderPath(A, B, 34, 55, 0.1);
      for (const [x, y] of creek) stampDisc(x, y, T.creekWidth / 2);
      if (T.branch) {   // rivulets fork again half-way, like the owner's 1011203
        const m = creek[Math.floor(creek.length * (0.45 + 0.2 * noise(deg, len, 5, 121)))];
        for (const side of [-1, 1]) {
          if (noise(deg * 3 + side, 7, 3, 123) < 0.35) continue;
          const b = a + side * (0.55 + 0.3 * noise(deg, side, 4, 125)), l2 = len * (0.45 + 0.3 * noise(side, deg, 4, 127));
          for (const [x, y] of meanderPath(m, [m[0] + l2 * Math.cos(b), m[1] + l2 * Math.sin(b)], 14, 60, 0.2)) stampDisc(x, y, T.creekWidth / 2);
        }
      }
    }
  }
  riverStats.push(`${rv.name}: ${Math.round(cum[cum.length - 1])} tiles long, ${drawn} stamps`);
}
// the pilot grids take their river from here
{
  const out = {};
  for (const c of PILOT) out[c] = Buffer.from(water.get(c)).toString('base64');
  fs.writeFileSync(path.join(HERE, 'data', 'pilot-water.json'), JSON.stringify({ note: 'Haunted River water for the six pass-1 grids, 4096 bytes per grid (row-major), from phase1_build.mjs', water: out }));
}

// ------------------------------------------------------------------------------ lakes and biome fields
// A smooth field per feature: each cell gets a value (1 = a NEW cell of the feature, the fraction
// of that tile type in an EXISTING template, 0 otherwise), interpolated between cell centres and
// roughened with noise; the 0.5 contour is the organic edge. Existing work therefore pulls the
// new shapes towards what is really there.
const fracCache = new Map();
function templateFraction(fr, fc, key) {
  const k = `${coordOf(fr, fc)}:${key}`;
  if (!fracCache.has(k)) { let n = 0; for (const row of tpl(fr, fc).tiles) for (const t of row) if (t === key) n++; fracCache.set(k, n / (N * N)); }
  return fracCache.get(k);
}
const FEATURE_TILE = { lake: 'WA', lava: 'LV', stone: 'SL', sand: 'SA' };
function cellValue(fr, fc, f, members) {
  if (!isValley(fr, fc)) return 0;
  if (hasTemplate(fr, fc)) return Math.min(1, templateFraction(fr, fc, FEATURE_TILE[f]) * 1.6);
  return members.has(coordOf(fr, fc)) ? 1 : 0;
}
function field(X, Y, f, members, seed) {
  const gx = X / N - 0.5, gy = Y / N - 0.5, c0 = Math.floor(gx), r0 = Math.floor(gy), tx = gx - c0, ty = gy - r0;
  const v = (r, c) => cellValue(r, c, f, members);
  const s = (t) => t * t * (3 - 2 * t);
  const a = v(r0, c0) * (1 - s(tx)) + v(r0, c0 + 1) * s(tx), b = v(r0 + 1, c0) * (1 - s(tx)) + v(r0 + 1, c0 + 1) * s(tx);
  return a * (1 - s(ty)) + b * s(ty) + 0.42 * (fbm(X, Y, seed) - 0.5) * 2;
}
// members per feature: NEW cells carrying it. A new LAKE that only touches the owner's lake
// along a shore he closed (no water across any shared edge) is not built: his shore wins.
const members = { lake: new Set(), lava: new Set(), stone: new Set(), sand: new Set() };
const SHAPES = JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'rivers.json'), 'utf8')).shapes || [];
const replacedBy = (fr, fc) => SHAPES.find((sh) => sh.replacesLabel && (LABELS[`${fr},${fc}`] || '').toLowerCase().replace(/[^a-z]/g, '').startsWith(sh.replacesLabel));
for (const [fr, fc] of NEW) { const f = feature(fr, fc); if (members[f] && !(f === 'lake' && replacedBy(fr, fc))) members[f].add(coordOf(fr, fc)); }
{
  const seen = new Set(); let dropped = 0;
  for (const c0 of [...members.lake]) {
    if (seen.has(c0)) continue;
    const comp = [], stack = [c0]; seen.add(c0);
    while (stack.length) {
      const c = stack.pop(); comp.push(c);
      const fr = Math.floor((c % 10000) / 1000) * 8 + Math.floor((c % 100) / 10), fc = Math.floor((c % 1000) / 100) * 8 + (c % 10);
      for (const [dr, dc] of Object.values(DIRS)) { const n = coordOf(fr + dr, fc + dc); if (members.lake.has(n) && !seen.has(n)) { seen.add(n); stack.push(n); } }
    }
    const compSet = new Set(comp);
    let touchesTemplateLake = false, waterAcross = false;
    for (const c of comp) {
      const fr = Math.floor((c % 10000) / 1000) * 8 + Math.floor((c % 100) / 10), fc = Math.floor((c % 1000) / 100) * 8 + (c % 10);
      for (const [side, [dr, dc]] of Object.entries(DIRS)) {
        const nr = fr + dr, nc = fc + dc;
        if (!isValley(nr, nc) || !hasTemplate(nr, nc) || feature(nr, nc) !== 'lake') continue;
        touchesTemplateLake = true;
        const opp = { N: 'S', S: 'N', W: 'E', E: 'W' }[side];
        if (runs(edgeLine(tpl(nr, nc), opp)).some(([a, b]) => b - a >= 2)) waterAcross = true;
      }
    }
    if (touchesTemplateLake && !waterAcross) { comp.forEach((c) => members.lake.delete(c)); dropped += comp.length; }
  }
  riverStats.push(`lakes: ${members.lake.size} new lake cells built, ${dropped} dropped behind the owner's closed shores`);
}
const nearLake = (fr, fc) => { for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (members.lake.has(coordOf(fr + dr, fc + dc)) && isNew(fr + dr, fc + dc)) return true; return false; };
for (const [fr, fc] of NEW) {
  if (!nearLake(fr, fc)) continue;   // the field spills into neighbouring cells: shores are not cell edges
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const X = fc * N + x, Y = fr * N + y;
    let v = field(X, Y, 'lake', members.lake, 41);
    // near an existing template, lean towards its edge: its water pulls water on (14 tiles), its
    // land pushes the shore away (24 tiles, ragged), so no shoreline runs straight along a cell edge
    for (const [side, [dr, dc]] of Object.entries(DIRS)) {
      const nr = fr + dr, nc = fc + dc;
      if (!isValley(nr, nc) || !hasTemplate(nr, nc)) continue;
      const d = side === 'N' ? y : side === 'S' ? N - 1 - y : side === 'W' ? x : N - 1 - x;
      if (d >= 24) continue;
      const i = side === 'N' || side === 'S' ? x : y;
      const line = edgeLine(tpl(nr, nc), { N: 'S', S: 'N', W: 'E', E: 'W' }[side]);
      v += line[i] ? 0.55 * Math.max(0, 1 - d / 14) : -1.0 * (1 - d / 24) * (0.7 + 0.6 * noise(X, Y, 7, 71));
    }
    if (v > 0.5) setWater(X, Y);
  }
}

// ------------------------------------------------------------------------------ drawn lake shapes (data/rivers.json 'shapes')
// A lake with a meaning (Hell's Mouth = a devil's grin) is drawn as water between two lips, not
// grown from cells; noise keeps the banks organic. Only grids Claude generated receive water.
function lipAt(points, col) {          // smooth (cosine) interpolation of [col, row] points at col
  if (col <= points[0][0]) return points[0][1];
  for (let i = 0; i < points.length - 1; i++) {
    const [c0, r0] = points[i], [c1, r1] = points[i + 1];
    if (col <= c1) { const t = (col - c0) / (c1 - c0), e = (1 - Math.cos(Math.PI * t)) / 2; return r0 + (r1 - r0) * e; }
  }
  return points[points.length - 1][1];
}
// 'parts' shapes: water = union of ellipses / tapered strokes / polygons, minus 'islands' (same
// kinds, land). Ellipse banks are roughened by noise; strokes taper and wobble like a channel.
function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function rasterPart(pt, mark, nz) {      // pt coords: [row, col] in grids; mark(X, Y)
  if (pt.type === 'ellipse') {
    const cy = pt.center[0] * N, cx = pt.center[1] * N, ry = pt.radii[0] * N, rx = pt.radii[1] * N, rot = (pt.rotDeg || 0) * Math.PI / 180;
    const R = Math.max(rx, ry) + nz + 2;
    for (let Y = Math.floor(cy - R); Y <= cy + R; Y++) for (let X = Math.floor(cx - R); X <= cx + R; X++) {
      const dx = X - cx, dy = Y - cy, u = dx * Math.cos(rot) + dy * Math.sin(rot), v = -dx * Math.sin(rot) + dy * Math.cos(rot);
      const e = Math.sqrt((u / rx) ** 2 + (v / ry) ** 2), rEff = Math.min(rx, ry);
      if (e * rEff <= rEff + (noise(X, Y, 8, 111) - 0.5) * 2 * nz) mark(X, Y);
    }
  } else if (pt.type === 'stroke') {
    const P = splinePath(pt.points.map(([r, c]) => [c * N, r * N]));
    const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const L = cum[cum.length - 1];
    P.forEach(([X, Y], i) => {
      const t = cum[i] / L, w = pt.widthFrom + (pt.widthTo - pt.widthFrom) * t;
      const half = (w / 2) * (0.85 + 0.3 * noise(cum[i], 3, 9, 113));
      for (let yy = Math.floor(Y - half); yy <= Math.ceil(Y + half); yy++) for (let xx = Math.floor(X - half); xx <= Math.ceil(X + half); xx++)
        if ((xx + 0.5 - X) ** 2 + (yy + 0.5 - Y) ** 2 <= half * half) mark(xx, yy);
    });
  } else if (pt.type === 'polygon') {
    const poly = pt.points.map(([r, c]) => [c * N, r * N]);
    const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
    for (let Y = Math.floor(Math.min(...ys)) - 2; Y <= Math.max(...ys) + 2; Y++) for (let X = Math.floor(Math.min(...xs)) - 2; X <= Math.max(...xs) + 2; X++) {
      const j = (noise(X, Y, 4, 117) - 0.5) * 2 * (pt.jitter ?? 1.5);
      if (pointInPoly(X + j, Y - j, poly)) mark(X, Y);
    }
  }
}
for (const sh of SHAPES.filter((x) => x.parts)) {
  const wet = new Set(), key = (X, Y) => `${X},${Y}`;
  for (const pt of sh.parts) rasterPart(pt, (X, Y) => wet.add(key(X, Y)), sh.edgeNoiseTiles || 3);
  for (const pt of sh.islands || []) rasterPart(pt, (X, Y) => wet.delete(key(X, Y)), 1.5);
  for (const k of wet) { const [X, Y] = k.split(',').map(Number); setWater(X, Y); }
  // islands are land even where a river channel was drawn through them earlier
  for (const pt of sh.islands || []) rasterPart(pt, (X, Y) => setWater(X, Y, 0), 1.5);
  riverStats.push(`${sh.name}: ${wet.size} water tiles drawn`);
}
for (const sh of SHAPES.filter((x) => !x.parts)) {
  let n = 0;
  const c0 = Math.floor(sh.upper[0][0] * N), c1 = Math.ceil(sh.upper[sh.upper.length - 1][0] * N);
  for (let X = c0; X <= c1; X++) {
    const col = X / N;
    const up = lipAt(sh.upper, col) * N, lo = lipAt(sh.lower, col) * N;
    for (let Y = Math.floor(Math.min(up, lo)) - 6; Y <= Math.ceil(Math.max(up, lo)) + 6; Y++) {
      const nU = (noise(X, Y, 7, 101) - 0.5) * 2 * sh.edgeNoiseTiles, nL = (noise(X, Y, 7, 103) - 0.5) * 2 * sh.edgeNoiseTiles;
      if (!(Y > up + nU && Y < lo + nL)) continue;
      // fangs: land teeth hanging from the upper lip
      let fang = false;
      for (const [fcol, bw, depth] of sh.fangs || []) {
        const dx = Math.abs(X - fcol * N), into = Y - up;
        if (into >= 0 && into < depth && dx < (bw / 2) * (1 - into / depth) + (noise(X, Y, 3, 107) - 0.5) * 2) fang = true;
      }
      if (!fang) { setWater(X, Y); n++; }
    }
  }
  riverStats.push(`${sh.name}: ${n} water tiles drawn`);
}

// ------------------------------------------------------------------------------ meet the existing edges
let coves = 0, bandFixes = 0;
for (const [fr, fc] of NEW) {
  const m = water.get(coordOf(fr, fc));
  for (const [side, [dr, dc]] of Object.entries(DIRS)) {
    const nr = fr + dr, nc = fc + dc;
    if (!isValley(nr, nc) || !hasTemplate(nr, nc)) continue;
    const opp = { N: 'S', S: 'N', W: 'E', E: 'W' }[side];
    const line = edgeLine(tpl(nr, nc), opp);
    const at = (i, d) => side === 'N' ? [d, i] : side === 'S' ? [N - 1 - d, i] : side === 'W' ? [i, d] : [i, N - 1 - d];
    // a run the new water does not continue gets a natural end (a cove), not a cliff
    for (const [a, b] of runs(line)) {
      let cont = 0; for (let i = a; i <= b; i++) { const [r, c] = at(i, 5); if (m[r * N + c]) cont++; }
      if (cont / (b - a + 1) >= 0.5) continue;
      const mid = (a + b) / 2, rad = (b - a + 1) / 2 + 1, depth = rad + 2 + (b - a) * 0.3;
      for (let d = 0; d < Math.min(N, depth + 2); d++) for (let i = Math.max(0, Math.floor(mid - rad - 1)); i <= Math.min(N - 1, Math.ceil(mid + rad + 1)); i++) {
        if (((i - mid) / rad) ** 2 + (d / depth) ** 2 <= 1) { const [r, c] = at(i, d); m[r * N + c] = 1; }
      }
      coves++;
    }
    // the 3 tiles next to the edge copy the neighbour exactly
    for (let i = 0; i < N; i++) for (let d = 0; d < 3; d++) {
      const [r, c] = at(i, d); const v = line[i] ? 1 : 0;
      if (m[r * N + c] !== v) { m[r * N + c] = v; bandFixes++; }
    }
  }
}

// ------------------------------------------------------------------------------ Quick Generate rows (§8c)
const rowsOf = (vt) => ROWS.filter((r) => r.valleyType === vt);
const UNDEAD = new Set(['valley2LayoutGraveyard', 'valley2LayoutZombie1', 'valley2LayoutZombie2']);
const DEADZONE_ROWS = new Set([...UNDEAD, 'valley2LayoutSpider1', 'valley2LayoutSpider2']);
function candidates(fr, fc) {
  const vt = typeAt(fr, fc), f = feature(fr, fc);
  if (f === 'graveyard') return rowsOf(vt).filter((r) => r.layout === 'valley2LayoutGraveyard').concat(vt !== 'valley2' ? rowsOf(vt) : []);
  if (f === 'deadzone' && vt === 'valley2') return rowsOf(vt).filter((r) => DEADZONE_ROWS.has(r.layout));
  if (vt === 'valley2') return rowsOf(vt).filter((r) => !UNDEAD.has(r.layout));
  return rowsOf(vt);
}
const assigned = new Map(), usage = new Map();
const order = NEW.slice(); { const r = mulberry32(20261009); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; } }
const pickR = mulberry32(99);
// rows already chosen in an earlier run stay (stable files); only cells without one are assigned
for (const [fr, fc] of order) { const prev = PREV[coordOf(fr, fc)]?.row; if (prev) { assigned.set(coordOf(fr, fc), prev); usage.set(prev, (usage.get(prev) || 0) + 1); } }
for (const [fr, fc] of order) {
  if (assigned.has(coordOf(fr, fc))) continue;
  const c = candidates(fr, fc);
  const near = (dirs) => new Set(dirs.map(([dr, dc]) => assigned.get(coordOf(fr + dr, fc + dc))).filter(Boolean));
  const n4 = near([[-1, 0], [1, 0], [0, -1], [0, 1]]), n8 = near([[-1, -1], [-1, 1], [1, -1], [1, 1]]);
  let pool = c.filter((r) => !n4.has(r.layout) && !n8.has(r.layout));
  if (!pool.length) pool = c.filter((r) => !n4.has(r.layout));
  if (!pool.length) pool = c;
  const minUse = Math.min(...pool.map((r) => usage.get(r.layout) || 0));
  const best = pool.filter((r) => (usage.get(r.layout) || 0) <= minUse + 1);
  const row = best[Math.floor(pickR() * best.length)];
  assigned.set(coordOf(fr, fc), row.layout); usage.set(row.layout, (usage.get(row.layout) || 0) + 1);
}

// ------------------------------------------------------------------------------ mountain ranges (phase 2, data/mountains.json)
const MOUNTAINS = JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'mountains.json'), 'utf8')).ranges;
const MTN = rangeMasks(MOUNTAINS, noise, coordOf);
const mtnStats = [];

// ------------------------------------------------------------------------------ build each grid
const letterOf = (key) => idx.tileByLayoutKey.get(key)?.type;
const validOn = (type, key) => !!idx.byType.get(type)?.[`validon${letterOf(key)}`];
const isEnemy = (type) => idx.enemies.some((e) => e.type === type);
const manifest = {};
let written = 0, skipped = 0, droppedTotal = 0;
for (const [fr, fc] of NEW) {
  const coord = coordOf(fr, fc), vt = typeAt(fr, fc), f = feature(fr, fc);
  const m = water.get(coord);
  const base = Array.from({ length: N }, (_, r) => Array.from({ length: N }, (_, c) => (m[r * N + c] ? 'WA' : '**')));
  Math.random = mulberry32(coord);
  const rand = Math.random;
  const row = ROWS.find((r) => r.layout === assigned.get(coord));
  const start = M.fromLayout({ tiles: base, resources: base.map((r) => r.map(() => '**')) }, idx);
  const { state } = M.quickGenerate(start, [row], idx);
  const g = state.grid;

  // biome overlays: lava fields with slate rims, slate plains, oasis sand (the same smooth fields,
  // so they run on across cell edges; any cell near a feature cell can carry its fringe)
  for (const bf of ['lava', 'stone', 'sand']) {
    let near = false;
    for (let dr = -1; dr <= 1 && !near; dr++) for (let dc = -1; dc <= 1; dc++) if (feature(fr + dr, fc + dc) === bf) near = true;
    if (!near) continue;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const cell = g[y][x]; if (cell.type === 'WA') continue;
      const v = field(fc * N + x, fr * N + y, bf, members[bf], { lava: 53, stone: 59, sand: 67 }[bf]);
      if (bf === 'lava') {
        if (v > 0.5) { cell.type = 'LV'; cell.resource = ''; }
        else if (v > 0.4) { cell.type = 'SL'; cell.resource = rand() < 0.12 ? 'Rocks' : ''; }
      } else if (bf === 'stone') {
        if (v > 0.5 && fbm(fc * N + x, fr * N + y, 61) > 0.3) { cell.type = 'SL'; cell.resource = rand() < 0.10 ? 'Rocks' : rand() < 0.025 ? 'Stone' : ''; }
      } else if (v > 0.5) { cell.type = 'SA'; cell.resource = rand() < 0.035 ? 'Palm Tree' : ''; }
    }
  }
  // the 2 tiles next to an existing template copy its lava / sand / slate edge (no hard seams)
  for (const [side, [dr, dc]] of Object.entries(DIRS)) {
    const nr = fr + dr, nc = fc + dc;
    if (!isValley(nr, nc) || !hasTemplate(nr, nc)) continue;
    const opp = { N: 'S', S: 'N', W: 'E', E: 'W' }[side], T = tpl(nr, nc).tiles;
    for (let i = 0; i < N; i++) {
      const [er, ec] = opp === 'N' ? [0, i] : opp === 'S' ? [N - 1, i] : opp === 'W' ? [i, 0] : [i, N - 1];
      const nk = T[er][ec];
      for (let d = 0; d < 2; d++) {
        const [r, c] = side === 'N' ? [d, i] : side === 'S' ? [N - 1 - d, i] : side === 'W' ? [i, d] : [i, N - 1 - d];
        const cell = g[r][c]; if (cell.type === 'WA' || nk === 'WA') continue;
        if (['LV', 'SA'].includes(nk) && cell.type !== nk) { cell.type = nk; cell.resource = ''; }
        else if (['LV', 'SA'].includes(cell.type) && !['LV', 'SA'].includes(nk)) { cell.type = nk === 'SL' ? 'SL' : 'GR'; cell.resource = ''; }
      }
    }
  }
  if (MTN.has(coord)) {   // mountain ranges go over everything Quick Generate placed
    const { mask, range } = MTN.get(coord);
    const r = packMountains(g, mask, mulberry32(coord * 13), { ground: range.ground || 'DI', fillToWaterTiles: range.fillToWaterTiles || 0, keep: (x, y) => { const t = g[y][x].resource; return !!t && idx.byType.get(t)?.category === 'npc' && !isEnemy(t); } });
    mtnStats.push(`${coord}: ${r.large} large, ${r.small} small${r.open ? `, ${r.open} band tiles OPEN` : ''}`);
  }
  if (f === 'deadzone' || f === 'graveyard') {   // Halloween: a third of the trees are dead
    g.forEach((r) => r.forEach((cell) => { if ((cell.resource === 'Oak Tree' || cell.resource === 'Pine Tree') && rand() < 0.33) cell.resource = 'Dead Tree'; }));
  }
  let dropped = 0;
  g.forEach((r) => r.forEach((cell) => { if (cell.resource && idx.byType.get(cell.resource)?.category !== 'editor' && !validOn(cell.resource, cell.type)) { cell.resource = ''; dropped++; } }));
  droppedTotal += dropped;

  const layout = M.toLayout(state, idx);
  const counts = {}; g.flat().forEach((c) => { if (c.resource) counts[c.resource] = (counts[c.resource] || 0) + 1; });
  layout.resourceDistribution = Object.fromEntries(Object.entries(counts).filter(([t]) => !isEnemy(t)));
  const en = Object.fromEntries(Object.entries(counts).filter(([t]) => isEnemy(t)));
  if (Object.keys(en).length) layout.enemiesDistribution = en; else delete layout.enemiesDistribution;
  const json = JSON.stringify(layout);
  fs.writeFileSync(path.join(OUT, `${coord}.json`), json);
  if (WRITE) {
    const target = path.join(FIXED, `${coord}.json`);
    if (OWNED.has(coord)) { fs.writeFileSync(target, json); written++; }          // Claude's own phase-1 file
    else if (fs.existsSync(target)) skipped++;                                       // never anyone else's
    else { fs.writeFileSync(target, json, { flag: 'wx' }); written++; }
  }
  manifest[coord] = { frontier: [fr, fc], valleyType: vt, feature: f, row: row.layout, water: m.reduce((s, v) => s + v, 0), enemies: en, sha1: sha1(Buffer.from(json)) };
}
// mountain seams between generated grids (seam_fix.mjs); their fingerprints follow the fix
if (WRITE) {
  const sf = fixSeams({ isGenerated: (c) => !!manifest[c] && !manifest[c].ownerEdited, allowOwner: false, resourcesByKey: new Map(resources.filter((x) => x.layoutkey).map((x) => [x.layoutkey, x])) });
  for (const c of sf.written) if (manifest[c]) manifest[c].sha1 = sha1(fs.readFileSync(path.join(FIXED, `${c}.json`)));
  console.log(`seam mountains placed in generated grids: ${sf.placed} (${sf.written.length} grids)`);
}
// straight slate boundaries recorded by slate_blend.mjs: re-apply the same organic blend to Claude's grids
const SLATE = WRITE ? loadRecorded() : null;
if (SLATE) {
  const byKey = new Map(resources.filter((x) => x.layoutkey).map((x) => [x.layoutkey, x]));
  let n = 0;
  for (const c of Object.keys(manifest).map(Number)) {   // blendGrid itself skips grids no line reaches
    if (!manifest[c] || manifest[c].ownerEdited) continue;
    const f = path.join(FIXED, `${c}.json`), L = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (blendGrid(c, L, SLATE.lines, byKey, SLATE.cls)) { fs.writeFileSync(f, JSON.stringify(L)); manifest[c].sha1 = sha1(fs.readFileSync(f)); n++; }
  }
  console.log(`slate seams blended in ${n} generated grids`);
}
// lava rules (lava_rules.mjs): lava islands are dirt and stone; the lava runs down to the river
if (WRITE) {
  const byKey = new Map(resources.filter((x) => x.layoutkey).map((x) => [x.layoutkey, x]));
  const cache = new Map();
  const load = (fr, fc) => {
    const c = 1010000 + Math.floor(fr / 8) * 1000 + Math.floor(fc / 8) * 100 + (fr % 8) * 10 + (fc % 8);
    if (!cache.has(c)) { const f = path.join(FIXED, `${c}.json`); cache.set(c, fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null); }
    return cache.get(c);
  };
  const { changed } = applyLavaRules(load, byKey);
  let n = 0;
  for (const c of changed.keys()) {
    if (!manifest[c] || manifest[c].ownerEdited) continue;   // the owner's grids keep what was written once
    const f = path.join(FIXED, `${c}.json`); fs.writeFileSync(f, JSON.stringify(cache.get(c))); manifest[c].sha1 = sha1(fs.readFileSync(f)); n++;
  }
  console.log(`lava rules applied in ${n} generated grids`);
}
for (const c of OWNER_EDITED) manifest[c] = { ...PREV[c], ownerEdited: true };   // keep the record, never touch the file
fs.writeFileSync(path.join(OUT, 'phase1-manifest.json'), JSON.stringify(manifest, null, 1));
if (OWNER_EDITED.length) console.log(`owner-edited (left alone): ${OWNER_EDITED.join(', ')}`);
console.log(`new cells ${NEW.length}; template water edges facing new cells ${pins.length}; coves ${coves}; edge-band fixes ${bandFixes}; invalid dropped ${droppedTotal}`);
riverStats.forEach((s) => console.log('  ' + s));
if (mtnStats.length) { console.log(`mountains in ${mtnStats.length} grids`); mtnStats.filter((x) => x.includes('OPEN')).forEach((x) => console.log('  ' + x)); }
console.log('row usage', JSON.stringify(Object.fromEntries([...usage.entries()].sort())));
if (WRITE) console.log(`written ${written}, skipped (already existed) ${skipped}`);
