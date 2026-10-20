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
 *   node tools/art/edges.js [--job tiles-edges] [--from exploration|approved]
 */
const fs = require('fs');
const path = require('path');
const { ROOT, CANDIDATES, sharp, ensureDir } = require('./lib/common');

const OUT = path.join(ROOT, 'game-client', 'public', 'assets', 'edges');
const PX = 128, CELL = 256;
const args = process.argv.slice(2);
const job = args.includes('--job') ? args[args.indexOf('--job') + 1] : 'tiles-edges';
const from = args.includes('--from') ? args[args.indexOf('--from') + 1] : 'exploration';

/** Where each piece lives: panel, cell (row, col). Quadrant layouts: grass in `pos` (or everywhere but `pos` for -inv). */
const PIECES = {
  // grass quadrant top-left: cells right of it see grass to the W, below it see grass to the N, the diagonal cell sees NW
  'edge-w': ['lip-tl', 0, 2], 'edge-n': ['lip-tl', 2, 0], 'convex-nw': ['lip-tl', 2, 2],
  'edge-e': ['lip-tr', 0, 1], 'convex-ne': ['lip-tr', 2, 1],
  'edge-s': ['lip-bl', 1, 0], 'convex-sw': ['lip-bl', 1, 2],
  'convex-se': ['lip-br', 1, 1],
  // magenta quadrant: the cell at the quadrant's inner corner has grass on two sides
  'concave-se': ['lip-tl-inv', 1, 1], 'concave-sw': ['lip-tr-inv', 1, 2], 'concave-ne': ['lip-bl-inv', 2, 1], 'concave-nw': ['lip-br-inv', 2, 2],
};

/** Key pure magenta to alpha. Distance in RGB from #ff00ff; soft ramp so the lip's edge keeps its anti-aliasing; despill the green channel of edge pixels. */
async function keyMagenta(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  const NEAR = 60, FAR = 170; // distance below NEAR = fully magenta (alpha 0); above FAR = fully opaque
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const d = Math.sqrt((255 - r) ** 2 + g ** 2 + (255 - b) ** 2);
    let a = d <= NEAR ? 0 : d >= FAR ? 255 : Math.round(((d - NEAR) / (FAR - NEAR)) * 255);
    // the drawn tile-edge lines are greyish (low saturation); grass and its magenta-tinted
    // shadow are saturated, so a low-saturation pixel is a line, not lip
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (a > 0 && mx > 0 && (mx - mn) / mx < 0.35) a = 0;
    out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = a;
    if (a > 0 && a < 255) {
      // un-mix the magenta from a partially covered pixel so the edge does not glow pink
      const k = a / 255;
      out[i] = Math.max(0, Math.min(255, Math.round((r - 255 * (1 - k)) / k)));
      out[i + 1] = Math.max(0, Math.min(255, Math.round(g / k)));
      out[i + 2] = Math.max(0, Math.min(255, Math.round((b - 255 * (1 - k)) / k)));
    }
    // the lip's shadow was painted over magenta and reads purple after the key: pull any pixel
    // that is not green-dominant down to a dark green of the same depth
    if (out[i + 3] > 0 && out[i + 1] < Math.max(out[i], out[i + 2])) {
      const dark = Math.min(out[i], out[i + 2], Math.round(out[i + 1] * 0.7));
      out[i] = dark; out[i + 2] = dark;
    }
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

(async () => {
  ensureDir(OUT);
  const dir = path.join(CANDIDATES, job, from === 'approved' ? 'approved' : path.join('exploration', 'openai'));
  const manifest = { note: 'Cut by tools/art/edges.js from the grass-lip mask panels; full-cell overlays with alpha, drawn over a lower tile by its grass-neighbour mask (PixiRendererTileTextures).', type: 'g', px: PX, pieces: {} };
  let coverage = {};
  for (const [piece, [panel, r, c]] of Object.entries(PIECES)) {
    const file = fs.readdirSync(dir).find((f) => f.includes(`-${panel}-1.png`) || f === `openai--flatter-${panel}-1.png`);
    if (!file) { console.error(`missing panel ${panel} in ${dir}`); process.exit(1); }
    const cell = await sharp(path.join(dir, file)).extract({ left: c * CELL, top: r * CELL, width: CELL, height: CELL }).png().toBuffer();
    const keyed = await keyMagenta(cell);
    const small = await sharp(keyed).resize(PX + 2, PX + 2, { kernel: 'lanczos3' }).extract({ left: 1, top: 1, width: PX, height: PX }).png({ compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(path.join(OUT, `g-${piece}.png`), small);
    const st = await sharp(small).stats();
    coverage[piece] = +(st.channels[3].mean / 255).toFixed(3);
    manifest.pieces[piece] = { file: `g-${piece}.png`, panel, cell: [r, c], coverage: coverage[piece] };
  }
  fs.writeFileSync(path.join(OUT, 'edges.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log('coverage (share of the cell the lip covers):', coverage);
  console.log(`wrote ${path.relative(ROOT, OUT)}/ (${Object.keys(PIECES).length} pieces). Next: npm run build:atlas in game-client.`);
})().catch((e) => { console.error(e.message); process.exit(1); });
