// River and lake banks (World epic W-11, owner 2026-10-12; docs/making-original-grids.md): every
// river and lake on the frontier gets an organic bank 1-3 tiles deep, mostly dirt (the 1-tile dirt
// bank at 1014243 is the model), its width varying slowly across the frontier, its outer edge ragged
// and now and then broken. Near slate-heavy ground the bank is slate, mixing in organically from the
// dirt.
//
// Left alone:
//  - shores that already have a bank: most of the land touching the water there is not grass (the
//    owner's own banks, sand regions, slate and mountain banks, the lava canals);
//  - the big lava section (anything within 48 tiles of lava; its banks are done);
//  - towns and anything man-made: within 6 tiles of a road, cobble, paving or snow tile or of a
//    building, station, farm plot, shop or decoration;
//  - tiles under a mountain; and any tile whose resource is not allowed on the new ground (the tile
//    and its resource stay).
// Only grass (and moss) becomes bank.
//
// The bank is found once on the world as it is (--find) and recorded in data/banks.bin.gz (world
// tile index + ground), so phase1_build.mjs re-applies exactly the same bank to Claude's grids after
// every rebuild while the owner's grids keep what was written once.
//   node tools/gridgen/banks.mjs --find [--owner]   find, record, apply
//   node tools/gridgen/banks.mjs [--owner]          re-apply the recorded bank
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXED = path.join(HERE, '..', '..', 'game-server', 'layouts', 'gridLayouts', 'valleyFixedCoord');
const RECORD = path.join(HERE, 'data', 'banks.bin.gz');
const N = 64, W = 64 * N;   // the frontier is 64 x 64 grids
const MAXD = 4, PREMADE = 0.55, LAVA_R = 48, MANMADE_R = 6;
const NATURAL = new Set(['GR', 'DI', 'SL', 'ZZ', 'CY', 'SA', 'WA', 'LV']);
const MANMADE_CATS = new Set(['deco', 'crafting', 'station', 'shop', 'training', 'stall', 'trainingAndShop', 'farmhouse', 'farmplot']);
const MOUNTAIN = { m1: 3, m2: 4 };
const GROUND = ['DI', 'SL'];
const coordOf = (fr, fc) => 1010000 + Math.floor(fr / 8) * 1000 + Math.floor(fc / 8) * 100 + (fr % 8) * 10 + (fc % 8);
const cellOf = (c) => [Math.floor((c % 10000) / 1000) * 8 + Math.floor((c % 100) / 10), Math.floor((c % 1000) / 100) * 8 + (c % 10)];

function hash2(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function noise(x, y, cell, s) {
  const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash2(ix, iy, s) * (1 - sx) + hash2(ix + 1, iy, s) * sx, b = hash2(ix, iy + 1, s) * (1 - sx) + hash2(ix + 1, iy + 1, s) * sx;
  return a * (1 - sy) + b * sy;
}
const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Every grid file on disk: Map(coord -> layout). */
export function loadWorld(dir = FIXED) {
  const grids = new Map();
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(/^(\d{7})\.json$/); if (!m) continue;
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    const L = JSON.parse(text); L.__pretty = text.startsWith('{\n');
    grids.set(Number(m[1]), L);
  }
  return grids;
}

/** Find the bank on the world: [{ i: world tile index, g: 0 dirt / 1 slate }]. */
export function findBank(grids, resourcesByKey) {
  const code = { WA: 1, GR: 2, ZZ: 3, DI: 4, SL: 5, LV: 6, SA: 7, CY: 8 };
  const T = new Uint8Array(W * W);   // 0 = no grid / other
  const manmade = new Uint8Array(W * W), mountain = new Uint8Array(W * W);
  for (const [c, L] of grids) {
    const [fr, fc] = cellOf(c);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = (fr * N + y) * W + fc * N + x, t = L.tiles[y][x], k = L.resources[y][x];
      T[i] = code[t] || 0;
      if (!NATURAL.has(t) || MANMADE_CATS.has(resourcesByKey.get(k)?.category)) manmade[i] = 1;
      const s = MOUNTAIN[k];
      if (s) for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) if (y - dy >= 0 && x + dx < N) mountain[(fr * N + y - dy) * W + fc * N + x + dx] = 1;
    }
  }
  // distance (Chebyshev, up to MAXD) from water over land
  const dist = new Uint8Array(W * W).fill(255);
  let front = [];
  for (let i = 0; i < W * W; i++) if (T[i] === 1) { dist[i] = 0; front.push(i); }
  for (let d = 1; d <= MAXD; d++) {
    const next = [];
    for (const i of front) {
      const x = i % W, y = (i - x) / W;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= W) continue;
        const j = ny * W + nx; if (dist[j] !== 255 || T[j] === 0 || T[j] === 1) continue;
        dist[j] = d; next.push(j);
      }
    }
    front = next;
  }
  // banks already there: shore tiles (touching water) that are mostly not grass within 5 tiles
  const isShore = (i) => dist[i] === 1;
  const notGrass = (i) => T[i] !== 2 && T[i] !== 3;
  const premade = new Uint8Array(W * W);
  for (let i = 0; i < W * W; i++) {
    if (!isShore(i)) continue;
    const x = i % W, y = (i - x) / W; let n = 0, ng = 0;
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= W) continue;
      const j = ny * W + nx; if (!isShore(j)) continue; n++; if (notGrass(j)) ng++;
    }
    if (n && ng / n > PREMADE) premade[i] = 1;
  }
  // zones to skip, by 8x8 blocks for the wide ones (lava) and tiles for the near ones
  const B = W / 8, blockHas = (arr) => { const b = new Uint8Array(B * B); for (let i = 0; i < W * W; i++) if (arr(i)) { const x = i % W, y = (i - x) / W; b[(y >> 3) * B + (x >> 3)] = 1; } return b; };
  const lavaB = blockHas((i) => T[i] === 6), slB = new Uint16Array(B * B), landB = new Uint16Array(B * B);
  for (let i = 0; i < W * W; i++) { const x = i % W, y = (i - x) / W, b = (y >> 3) * B + (x >> 3); if (T[i] === 5) slB[b]++; if (T[i] >= 2) landB[b]++; }
  const near = (bArr, x, y, r) => { const bx = x >> 3, by = y >> 3, rb = Math.ceil(r / 8); for (let dy = -rb; dy <= rb; dy++) for (let dx = -rb; dx <= rb; dx++) { const nx = bx + dx, ny = by + dy; if (nx >= 0 && ny >= 0 && nx < B && ny < B && bArr[ny * B + nx]) return true; } return false; };
  const slateShare = (x, y) => { const bx = x >> 3, by = y >> 3; let s = 0, l = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const nx = bx + dx, ny = by + dy; if (nx >= 0 && ny >= 0 && nx < B && ny < B) { s += slB[ny * B + nx]; l += landB[ny * B + nx]; } } return l ? s / l : 0; };
  const within = (arr, x, y, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < W && arr[ny * W + nx]) return true; } return false; };

  const out = [], why = { premade: 0, lava: 0, manmade: 0, mountain: 0 };
  for (let i = 0; i < W * W; i++) {
    const d = dist[i]; if (d === 255 || d === 0) continue;
    if (T[i] !== 2 && T[i] !== 3) continue;   // only grass and moss become bank
    const x = i % W, y = (i - x) / W;
    // how deep the bank reaches here: 1-3 tiles, varying slowly across the frontier, ragged locally,
    // now and then broken (the 1014243 bank has the odd gap too)
    const base = 1 + 2 * smooth(0.3, 0.75, noise(x, y, 380, 701));
    const reach = base + (noise(x, y, 6, 703) - 0.5) * 1.6 + (hash2(x, y, 705) - 0.5) * 0.6;
    if (d > reach) continue;
    if (d === 1 && hash2(x, y, 707) < 0.04) continue;
    if (mountain[i]) { why.mountain++; continue; }
    if (near(lavaB, x, y, LAVA_R)) { why.lava++; continue; }
    if (within(manmade, x, y, MANMADE_R)) { why.manmade++; continue; }
    if (within(premade, x, y, 6)) { why.premade++; continue; }
    // slate near slate-heavy ground, mixing in from the dirt
    const g = hash2(x, y, 709) < smooth(0.18, 0.4, slateShare(x, y)) ? 1 : 0;
    out.push({ i, g });
  }
  return { bank: out, why };
}

/** Apply the bank to one grid's layout (mutated). Returns tiles changed. */
export function applyBank(coord, L, bankByGrid, resourcesByKey) {
  const list = bankByGrid.get(coord); if (!list) return 0;
  const [fr, fc] = cellOf(coord);
  let n = 0;
  for (const { i, g } of list) {
    const x = (i % W) - fc * N, y = Math.floor(i / W) - fr * N, t = L.tiles[y][x], k = L.resources[y][x], nt = GROUND[g];
    if (t !== 'GR' && t !== 'ZZ') continue;
    if (k !== '**' && !resourcesByKey.get(k)?.[`validon${nt === 'DI' ? 'd' : 's'}`]) continue;   // the resource stays, so the tile does
    L.tiles[y][x] = nt; n++;
  }
  return n;
}

export function saveRecord(bank) {
  const buf = Buffer.alloc(bank.length * 5);
  bank.forEach(({ i, g }, k) => { buf.writeUInt32LE(i, k * 5); buf.writeUInt8(g, k * 5 + 4); });
  fs.writeFileSync(RECORD, zlib.gzipSync(buf));
}
/** The recorded bank grouped by grid: Map(coord -> [{ i, g }]), or null. */
export function loadRecord() {
  if (!fs.existsSync(RECORD)) return null;
  const buf = zlib.gunzipSync(fs.readFileSync(RECORD)), byGrid = new Map();
  for (let k = 0; k < buf.length; k += 5) {
    const i = buf.readUInt32LE(k), g = buf.readUInt8(k + 4), x = i % W, y = Math.floor(i / W);
    const c = coordOf(y >> 6, x >> 6);
    if (!byGrid.has(c)) byGrid.set(c, []);
    byGrid.get(c).push({ i, g });
  }
  return byGrid;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const man = JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'phase1-manifest.json'), 'utf8'));
  const res = JSON.parse(fs.readFileSync(path.join(HERE, '..', '..', 'game-server', 'tuning', 'resources.json'), 'utf8'));
  const byKey = new Map(res.filter((x) => x.layoutkey).map((x) => [x.layoutkey, x]));
  const isGen = (c) => !!man[c] && !man[c].ownerEdited;
  const owner = process.argv.includes('--owner');
  const grids = loadWorld();
  if (process.argv.includes('--find')) {
    const { bank, why } = findBank(grids, byKey);
    saveRecord(bank);
    console.log(`bank found: ${bank.length} tiles (${bank.filter((b) => b.g === 1).length} slate); left alone: ${JSON.stringify(why)}`);
  }
  const byGrid = loadRecord();
  const crypto = await import('crypto');
  let tg = 0, to = 0, ng = 0, no = 0;
  for (const [c, L] of grids) {
    if (!isGen(String(c)) && !owner) continue;
    const n = applyBank(c, L, byGrid, byKey); if (!n) continue;
    const pretty = L.__pretty; delete L.__pretty;
    const f = path.join(FIXED, `${c}.json`); fs.writeFileSync(f, pretty ? JSON.stringify(L, null, 2) : JSON.stringify(L));
    if (isGen(String(c))) { man[c].sha1 = crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex'); tg += n; ng++; } else { to += n; no++; }
  }
  fs.writeFileSync(path.join(HERE, 'data', 'phase1-manifest.json'), JSON.stringify(man, null, 1));
  console.log(`bank applied: ${tg} tiles in ${ng} of Claude's grids, ${to} tiles in ${no} owner grids`);
}
