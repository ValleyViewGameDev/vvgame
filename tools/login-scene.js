#!/usr/bin/env node
/**
 * Generates game-server/layouts/gridLayouts/homestead/start-screen.json, the living grid behind
 * the Begin screen (docs/login-scene-plan.md). Deterministic (fixed seed): re-running gives the
 * same file. Hand-tune the result in the VVGame Editor's Layouts tab (homestead > start-screen)
 * afterwards; re-running this script overwrites those edits.
 *
 *   node tools/login-scene.js
 *
 * Framing (the camera is fixed at the top-left corner):
 *   phone   (scene zoomed out)  ~12 x 22 tiles: the cottage, the Lumberjack's trees, daisies, a coyote
 *   desktop (1440 x 900)        ~32 x 18 tiles: the whole cast, the pond, the mushrooms on moss
 *   beyond 32 x 32                            : forest only, so a very wide screen still looks finished
 * The Begin modal covers the middle of the screen, so nothing important sits at x 13-19, y 5-13.
 */
const fs = require('fs');
const path = require('path');

const SIZE = 64;
const OUT = path.join(__dirname, '../game-server/layouts/gridLayouts/homestead/start-screen.json');

// Layout keys (game-server/tuning/resources.json `layoutkey`)
const T = { grass: 'GR', water: 'WA', dirt: 'DI', moss: 'ZZ' };
const R = { oak: 'OT', pine: 'PT', daisy: 'f1', mushroom: 'Mu', cottage: 'FH', coyote: 'nC', bear: 'nB', lumberjack: 'lj' };

// mulberry32: a tiny seeded RNG
let seed = 20261108;
const rand = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const tiles = Array.from({ length: SIZE }, () => Array(SIZE).fill(T.grass));
const res = Array.from({ length: SIZE }, () => Array(SIZE).fill('**'));
const blocked = Array.from({ length: SIZE }, () => Array(SIZE).fill(false)); // no tree here
const inRect = (x, y, [x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const block = (x0, y0, x1, y1) => {
  for (let y = Math.max(0, y0); y <= Math.min(SIZE - 1, y1); y++)
    for (let x = Math.max(0, x0); x <= Math.min(SIZE - 1, x1); x++) blocked[y][x] = true;
};

// --- The pond: an irregular blob right of the modal, top of the screen -------------------------
const pond = { cx: 23.6, cy: 4.4, rx: 3.4, ry: 2.4 };
for (let y = 0; y < 12; y++) for (let x = 18; x < 32; x++) {
  const d = ((x - pond.cx) / pond.rx) ** 2 + ((y - pond.cy) / pond.ry) ** 2;
  const wobble = Math.sin(x * 1.7 + y * 0.9) * 0.18;
  if (d < 1 + wobble) { tiles[y][x] = T.water; blocked[y][x] = true; }
}
block(19, 1, 29, 8); // a grassy shore around it

// --- The cottage (Farm House, 3 x 3, anchored at its bottom-left tile) --------------------------
const cottage = { x: 3, y: 5 };
res[cottage.y][cottage.x] = R.cottage;
block(2, 1, 7, 7); // its yard

// --- A dirt path from the cottage door, winding east under the modal to the screen edge ---------
const pathCells = [];
const pathY = (x) => Math.round(12 + Math.sin(x / 4.2) * 1.6 + (x > 32 ? (x - 32) / 6 : 0));
for (let y = 6; y <= pathY(4); y++) pathCells.push([4, y]);
for (let x = 4, prev = pathY(4); x < SIZE; x++) {
  const y = pathY(x);
  for (let yy = Math.min(prev, y); yy <= Math.max(prev, y); yy++) pathCells.push([x, yy]); // no diagonal gaps
  if (x % 3 === 0) pathCells.push([x, y + 1]); // a little wider here and there
  prev = y;
}
for (const [x, y] of pathCells) if (y >= 0 && y < SIZE) { tiles[y][x] = T.dirt; blocked[y][x] = true; }

// --- The moss patch, mushrooms on it (lower left: below the modal on a phone) -------------------
const moss = [6, 15, 10, 18];
for (let y = moss[1]; y <= moss[3]; y++) for (let x = moss[0]; x <= moss[2]; x++) {
  const corner = (x === moss[0] || x === moss[2]) && (y === moss[1] || y === moss[3]);
  if (!corner) { tiles[y][x] = T.moss; blocked[y][x] = true; }
}
for (const [x, y] of [[7, 16], [9, 16], [8, 17], [7, 18], [9, 18]]) res[y][x] = R.mushroom;
block(5, 14, 11, 19);

// --- Daisies: a few by the cottage, a few by the pond --------------------------------------------
for (const [x, y] of [[7, 2], [8, 3], [6, 3], [20, 7], [19, 3], [27, 7]]) { res[y][x] = R.daisy; blocked[y][x] = true; }

// --- Clearings the animals roam (their leash areas in the client's scene driver) ---------------
const ZONES = {
  coyoteA: [11, 0, 19, 4],   // top middle, above the modal
  coyoteB: [0, 9, 11, 13],   // left, between the cottage and the moss
  bearA: [21, 9, 30, 13],    // right, below the pond (across the path)
  bearB: [12, 12, 20, 15],   // bottom middle, below the modal
};
// a few scattered trees inside the clearings, so they read as glades, not bare lawns
for (const [x0, y0, x1, y1] of Object.values(ZONES)) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
  if (!blocked[y][x] && tiles[y][x] === T.grass && res[y][x] === '**' && rand() < 0.25) res[y][x] = rand() < 0.42 ? R.pine : R.oak;
}
for (const z of Object.values(ZONES)) block(z[0], z[1], z[2], z[3]);
res[2][15] = R.coyote;
res[11][7] = R.coyote;
res[10][26] = R.bear;
res[14][15] = R.bear;

// --- The Lumberjack, by the cottage ---------------------------------------------------------------
res[7][6] = R.lumberjack;

// --- Forest: everywhere not blocked. Denser near the action so the Lumberjack has work ----------
for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
  if (blocked[y][x] || res[y][x] !== '**') continue;
  const inView = x < 32 && y < 32;
  const density = inView ? 0.68 : 0.58; // owner 2026-11-08: more trees
  if (rand() < density) res[y][x] = rand() < 0.42 ? R.pine : R.oak;
}
// The Lumberjack's woodlot: a stand of trees just right of the cottage yard, in view on a phone
for (let y = 1; y <= 8; y++) for (let x = 9; x <= 11; x++) {
  if (tiles[y][x] === T.grass && res[y][x] === '**' && !inRect(x, y, ZONES.coyoteA)) res[y][x] = rand() < 0.3 ? R.pine : R.oak;
}
// A few trees in the cottage's yard so it is not bare
for (const [x, y] of [[0, 0], [1, 1], [0, 2], [0, 4], [1, 6], [0, 7], [1, 8], [7, 6], [8, 0], [2, 8]]) if (res[y][x] === '**' && tiles[y][x] === T.grass) res[y][x] = R.oak;

const layout = {
  tiles,
  resources: res,
  tileDistribution: { g: 100 },
  resourceDistribution: {},
  sceneZones: ZONES, // read by the client's scene driver (LoginScene/sceneDriver.js)
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(layout, null, 2));
const count = (code) => res.flat().filter((c) => c === code).length;
console.log(`wrote ${path.relative(process.cwd(), OUT)}: oaks ${count(R.oak)}, pines ${count(R.pine)}, daisies ${count(R.daisy)}, mushrooms ${count(R.mushroom)}, coyotes ${count(R.coyote)}, bears ${count(R.bear)}`);
