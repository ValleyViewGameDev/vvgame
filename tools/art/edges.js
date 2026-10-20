#!/usr/bin/env node
/**
 * Cut the grass edge-lip pieces from the eight mask panels (tools/art/jobs/tiles-edges.json;
 * docs/art/slice-b/tiles.md, edging). Each panel is a 4 x 4 patch with grass in one 2 x 2
 * quadrant over pure magenta (or the inverse); the grass overhangs the boundary. Keying the
 * magenta out leaves the lip with alpha, and one cell per piece is cut:
 *
 *   edge-n / e / s / w       a cell whose ONE grass neighbour is on that side
 *   concave-ne / se / sw / nw  a cell with grass on BOTH sides of that corner (the lip wraps
 *                            around the cell's corner)
 *   convex-ne / se / sw / nw   a cell whose only grass neighbour is on that diagonal (the
 *                            grass corner pokes in)
 *
 * Output: game-client/public/assets/edges/g-<piece>.png at 128 px, 1 px edge trimmed like the
 * base tiles, plus edges.json. The renderer composes them over the base tile by the cell's
 * grass-neighbour mask (PixiRendererTileTextures).
 *
 *   node tools/art/edges.js [--job tiles-edges] [--from exploration|approved] [--n 1]
 */
const fs = require('fs');
const path = require('path');
const { ROOT, CANDIDATES, sharp, ensureDir } = require('./lib/common');
const { keyMagenta } = require('./lib/key');

const OUT = path.join(ROOT, 'game-client', 'public', 'assets', 'edges');
const PX = 128, CELL = 256;
const args = process.argv.slice(2);
const job = args.includes('--job') ? args[args.indexOf('--job') + 1] : 'tiles-edges';
const from = args.includes('--from') ? args[args.indexOf('--from') + 1] : 'exploration';

const N = args.includes('--n') ? args[args.indexOf('--n') + 1] : '1';

/** How far the lip reaches into the cell (grass to the north): the last row with any opaque pixel, in panel px. */
async function lipDepth(keyed) {
  const { data, info } = await sharp(keyed).raw().toBuffer({ resolveWithObject: true });
  // the last row where the lip still covers a tenth of the width (stray keyed speckles lower down do not count)
  let last = 0;
  for (let y = 0; y < info.height; y++) {
    let n = 0;
    for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 128) n++;
    if (n > info.width * 0.1) last = y;
  }
  return last;
}

(async () => {
  ensureDir(OUT);
  const dir = path.join(CANDIDATES, job, from === 'approved' ? 'approved' : path.join('exploration', 'openai'));
  const panelCell = async (panel, r, c) => {
    const file = fs.readdirSync(dir).find((f) => f.endsWith(`-${panel}.png`));
    if (!file) throw new Error(`missing panel ${panel} in ${dir}`);
    const cell = await sharp(path.join(dir, file)).extract({ left: c * CELL, top: r * CELL, width: CELL, height: CELL }).png().toBuffer();
    return keyMagenta(cell);
  };
  // SYNTHESIS (the default): the model never draws the four sides at one depth (light from the
  // upper left makes the lip that hangs DOWN the fullest), so one drawn side is the master and
  // the rest are turned from it: the edge with the grass to the north (its lip hangs down into
  // the cell) rotated for the other three sides, the matching convex nub rotated likewise, and
  // each concave corner as the union of its two edges (both lips meet squarely in the corner).
  // The master edge: the cell under the middle of the island's bottom side. Its LEFT end sits
  // at the island's corner, where the drawn lip starts to round off, so the piece is made
  // uniform by mirroring its untapered right half onto the left. A tapered end is what left a
  // notch of the lower tile at every outer grass corner.
  const edgeRaw = await panelCell(`lip-island-${N}`, 3, 1);
  const rightHalf = await sharp(edgeRaw).extract({ left: CELL / 2, top: 0, width: CELL / 2, height: CELL }).png().toBuffer();
  const leftHalf = await sharp(rightHalf).flop().png().toBuffer();
  const edgeN = await sharp({ create: { width: CELL, height: CELL, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: leftHalf, left: 0, top: 0 }, { input: rightHalf, left: CELL / 2, top: 0 }]).png().toBuffer();
  const rot = (buf, deg) => sharp(buf).rotate(deg, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  // the concave corner: where the two lips meet, their scallop valleys leave a sliver of the
  // lower tile showing at the very corner; a quarter-disc of grass (radius = the lip's depth)
  // under the two lips fills it and reads as the rounded inner corner
  // measured on the downscaled piece (the 256 px key keeps faint speckle and the cell's bottom
  // grid line at half alpha; the resample drops them), then scaled back to panel px
  const edgeNSmall = await sharp(edgeN).resize(PX + 2, PX + 2, { kernel: 'lanczos3' }).extract({ left: 1, top: 1, width: PX, height: PX }).png().toBuffer();
  const depth = Math.round((await lipDepth(edgeNSmall)) * (CELL / PX));
  console.log('lip depth:', depth, 'panel px');
  const grassTile = path.join(ROOT, 'game-client', 'public', 'assets', 'tiles', 'g-0.png');
  const cornerFill = async (cx, cy) => {
    const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${CELL}"><circle cx="${cx}" cy="${cy}" r="${depth}" fill="#fff"/></svg>`);
    const grass = await sharp(grassTile).resize(CELL, CELL).png().toBuffer();
    const disc = await sharp(grass).composite([{ input: await sharp(mask).png().toBuffer(), blend: 'dest-in' }]).png().toBuffer();
    const shadow = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${CELL}"><circle cx="${cx}" cy="${cy}" r="${depth}" fill="none" stroke="rgba(30,45,10,0.6)" stroke-width="3"/></svg>`);
    return sharp(disc).composite([{ input: await sharp(shadow).png().toBuffer() }]).png().toBuffer();
  };
  const union = async (a, b, cx, cy) => sharp(await cornerFill(cx, cy)).composite([{ input: a }, { input: b }]).png().toBuffer();
  // the convex nub (grass only on the diagonal): the drawn island corners gave nothing usable,
  // so it is the same quarter-disc at the cell's corner, rounding the grass region's outer corner
  const nubNW = await cornerFill(0, 0);
  const edges = { n: edgeN, e: await rot(edgeN, 90), s: await rot(edgeN, 180), w: await rot(edgeN, 270) };
  const pieces = {
    'edge-n': edges.n, 'edge-e': edges.e, 'edge-s': edges.s, 'edge-w': edges.w,
    'convex-nw': nubNW, 'convex-ne': await rot(nubNW, 90), 'convex-se': await rot(nubNW, 180), 'convex-sw': await rot(nubNW, 270),
    'concave-nw': await union(edges.n, edges.w, 0, 0), 'concave-ne': await union(edges.n, edges.e, CELL, 0),
    'concave-se': await union(edges.s, edges.e, CELL, CELL), 'concave-sw': await union(edges.s, edges.w, 0, CELL),
  };
  const manifest = { note: 'Cut by tools/art/edges.js: one drawn edge (grass to the north) and one nub from the island panel, turned for the other sides, concave corners as unions; full-cell overlays with alpha, drawn over a lower tile by its grass-neighbour mask (PixiRendererTileTextures).', type: 'g', px: PX, source: `lip-island-${N}`, pieces: {} };
  const coverage = {};
  for (const [piece, keyed] of Object.entries(pieces)) {
    const small = await sharp(keyed).resize(PX + 2, PX + 2, { kernel: 'lanczos3' }).extract({ left: 1, top: 1, width: PX, height: PX }).png({ compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(path.join(OUT, `g-${piece}.png`), small);
    const st = await sharp(small).stats();
    coverage[piece] = +(st.channels[3].mean / 255).toFixed(3);
    manifest.pieces[piece] = { file: `g-${piece}.png`, coverage: coverage[piece] };
  }
  fs.writeFileSync(path.join(OUT, 'edges.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log('coverage (share of the cell the lip covers):', coverage);
  console.log(`wrote ${path.relative(ROOT, OUT)}/ (${Object.keys(pieces).length} pieces). Next: npm run build:atlas in game-client.`);
})().catch((e) => { console.error(e.message); process.exit(1); });
