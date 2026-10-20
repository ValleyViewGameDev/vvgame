#!/usr/bin/env node
/**
 * Cut a wall or fence junction panel (tools/art/jobs/walls.json) into the autotile pieces
 * the renderer composes formations from (PixiRendererWalls.js):
 *
 *   <set>-post.png            the centre post
 *   <set>-n/e/s/w.png         a straight run from the centre to that edge of the tile
 *   <set>-ne/se/sw/nw.png     a diagonal run from the centre to that corner of the tile
 *
 * Two panels per set: a PLUS (post + the four straight spokes) and a CROSS (post + the four
 * diagonals). Spokes 90 degrees apart only overlap at the post, so each spoke cuts clean as a
 * quarter wedge (+-45 degrees) of its panel's one-tile window around the post; the post is a
 * disc from the plus panel. (An eight-spoke panel cannot be cut: within ~85 px of the post
 * every spoke overlaps its neighbours, and any partition hands slivers of one spoke to the
 * next.) Output: game-client/public/assets/walls/, 128 px, plus walls.json.
 *
 *   node tools/art/walls.js --set stone --plus painterly-stone-wall-plus-1 --cross painterly-stone-wall-cross-1 [--from exploration|approved]
 */
const fs = require('fs');
const path = require('path');
const { ROOT, CANDIDATES, sharp, ensureDir } = require('./lib/common');
const { keyMagenta } = require('./lib/key');

const OUT = path.join(ROOT, 'game-client', 'public', 'assets', 'walls');
const PX = 128, CELL = 256;
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const set = opt('set', 'stone'), plusPanel = opt('plus', `painterly-${set === 'stone' ? 'stone-wall' : 'wood-fence'}-plus-1`), crossPanel = opt('cross', `painterly-${set === 'stone' ? 'stone-wall' : 'wood-fence'}-cross-1`), from = opt('from', 'exploration');

const DIRS = { n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0], nw: [-1, -1] };
// The post mask, per set: an ellipse that covers the drawn post, its top (which sits ABOVE the
// wall's line, the post being taller) and its face below, but not the spokes' bases beyond the
// post's rim. Otherwise each spoke's quarter wedge carries a quarter of the post's rim and a
// lone straight run shows notches where the missing wedges were. --post "dy,rx,ry".
const POST = (opt('post', set === 'fence' ? '-20,32,72' : '-15,56,78')).split(',').map(Number);

/**
 * Where the post is: the centroid of the art gives a first guess (pulled down by the front
 * faces), then the N spoke's column gives x and the E spoke's TOP SURFACE gives y: at a
 * column well to the right of the centre, the opaque run's top edge plus a third of its
 * height is the wall's line (the rest is the face hanging below it).
 */
async function postCentre(keyed) {
  const { data, info } = await sharp(keyed).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, A = (x, y) => data[(y * W + x) * 4 + 3];
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (A(x, y) > 200) { sx += x; sy += y; n++; }
  const gx = Math.round(sx / n), gy = Math.round(sy / n);
  const xs = [];
  for (let y = gy - 230; y < gy - 170; y++) for (let x = gx - 120; x < gx + 120; x++) if (A(x, y) > 200) xs.push(x);
  xs.sort((a, b) => a - b);
  const cx = xs.length ? xs[xs.length >> 1] : gx;
  const tops = [], bottoms = [];
  for (let x = cx + 170; x < cx + 230; x++) {
    let top = -1, bottom = -1;
    for (let y = gy - 150; y < gy + 150; y++) if (A(x, y) > 200) { if (top < 0) top = y; bottom = y; }
    if (top >= 0) { tops.push(top); bottoms.push(bottom); }
  }
  const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
  const cy = tops.length ? Math.round(med(tops) + (med(bottoms) - med(tops)) * 0.33) : gy;
  return { x: cx, y: cy };
}

/** The cross panel has no straight spokes to measure; its post is the centroid of the dense middle (iterated inside a small radius). */
async function crossCentre(keyed) {
  const { data, info } = await sharp(keyed).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, A = (x, y) => data[(y * W + x) * 4 + 3];
  let cx = 0, cy = 0, n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (A(x, y) > 200) { cx += x; cy += y; n++; }
  cx /= n; cy /= n;
  for (let k = 0; k < 4; k++) {
    let sx = 0, sy = 0, m = 0;
    for (let y = Math.max(0, cy - 70) | 0; y < Math.min(H, cy + 70); y++) for (let x = Math.max(0, cx - 70) | 0; x < Math.min(W, cx + 70); x++) if (A(x, y) > 200 && (x - cx) ** 2 + (y - cy) ** 2 < 4900) { sx += x; sy += y; m++; }
    cx = sx / m; cy = sy / m;
  }
  return { x: Math.round(cx), y: Math.round(cy) };
}

/** An SVG mask (white = keep, transparent elsewhere) for one piece in the 256 px cell: the post disc, or a quarter wedge around a spoke's direction. */
function maskSvg(piece) {
  const c = CELL / 2, R = CELL;
  let shape;
  if (piece === 'post') shape = `<ellipse cx="${c}" cy="${c + POST[0]}" rx="${POST[1]}" ry="${POST[2]}"/>`;
  else {
    const [dx, dy] = DIRS[piece];
    const ang = Math.atan2(dy, dx) * 180 / Math.PI;
    shape = `<g transform="translate(${c} ${c}) rotate(${ang})"><polygon points="0,0 ${R},${-R} ${R},${R}"/></g>`;
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${CELL}"><g fill="#fff">${shape}</g></svg>`);
}

(async () => {
  ensureDir(OUT);
  const dir = path.join(CANDIDATES, 'walls', from === 'approved' ? 'approved' : path.join('exploration', 'openai'));
  const windowOf = async (panel, diagonal) => {
    const file = fs.readdirSync(dir).find((f) => f.endsWith(`${panel}.png`) || f === `${panel}.png`);
    if (!file) throw new Error(`no panel ${panel} in ${dir}`);
    const keyed = await keyMagenta(await sharp(path.join(dir, file)).png().toBuffer(), { hue: true });
    const ctr = diagonal ? await crossCentre(keyed) : await postCentre(keyed);
    console.log(`${panel}: post at (${ctr.x}, ${ctr.y})`);
    return sharp(keyed).extract({ left: ctr.x - CELL / 2, top: ctr.y - CELL / 2, width: CELL, height: CELL }).png().toBuffer();
  };
  const plus = await windowOf(plusPanel, false);
  const cross = await windowOf(crossPanel, true);
  const cellFor = (piece) => (piece === 'post' || piece.length === 1 ? plus : cross);
  const manifest = { note: 'Cut by tools/art/walls.js from a junction panel; the renderer composes a wall tile from the post plus one spoke per connected neighbour (PixiRendererWalls.js).', sets: JSON.parse(fs.existsSync(path.join(OUT, 'walls.json')) ? fs.readFileSync(path.join(OUT, 'walls.json'), 'utf8') : '{"sets":{}}').sets };
  manifest.sets[set] = { plus: plusPanel, cross: crossPanel, px: PX, pieces: [] };
  for (const piece of ['post', ...Object.keys(DIRS)]) {
    const mask = await sharp(maskSvg(piece)).png().toBuffer();
    const cut = await sharp(cellFor(piece)).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
    const small = await sharp(cut).resize(PX + 2, PX + 2, { kernel: 'lanczos3' }).extract({ left: 1, top: 1, width: PX, height: PX }).png({ compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(path.join(OUT, `${set}-${piece}.png`), small);
    manifest.sets[set].pieces.push(piece);
  }
  fs.writeFileSync(path.join(OUT, 'walls.json'), JSON.stringify(manifest, null, 2) + '\n');
  // a proof sheet: a few formations composed from the pieces
  const piece = (p) => sharp(path.join(OUT, `${set}-${p}.png`)).resize(CELL, CELL).png().toBuffer();
  const compose = async (list) => { const layers = []; for (const p of list) layers.push({ input: await piece(p) }); return sharp({ create: { width: CELL, height: CELL, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(layers).png().toBuffer(); };
  const forms = [['post'], ['post', 'e', 'w'], ['post', 'n', 's'], ['post', 'n', 'e'], ['post', 'e', 's', 'w'], ['post', 'n', 'e', 's', 'w'], ['post', 'ne', 'sw'], ['post', 'w', 'se'], ['post', 's', 'ne']];
  const layers = []; let x = 8;
  for (const f of forms) { layers.push({ input: await compose(f), left: x, top: 8 }); x += CELL + 8; }
  await sharp({ create: { width: x + 8, height: CELL + 16, channels: 4, background: '#78ac14' } }).composite(layers).png().toFile(path.join(CANDIDATES, 'walls', `${set}-formations.png`));
  console.log(`wrote ${path.relative(ROOT, OUT)}/${set}-*.png and _candidates/walls/${set}-formations.png. Next: npm run build:atlas in game-client.`);
})().catch((e) => { console.error(e); process.exit(1); });
