#!/usr/bin/env node
/**
 * Turn a magenta cut-out panel (jobs/buildings-bible-cut.json and the like) into the game's
 * sprite: key the magenta out (lib/key.js), fit a square to the art (the art's BASE width is the
 * n-tile footprint, the whole silhouette fits the square, the base sits at its bottom-centre),
 * resize, and write
 * game-client/public/assets/resources/<file>.png plus <file>.svg (the same PNG wrapped in an
 * SVG, so every place that loads the resource's SVG, the panels and the atlas, gets it).
 *
 *   node tools/art/cutout.js --job buildings-bible-cut --subject bank --file bank --n 3 [--px 512] [--candidate painterly-bank-1]
 *   It prints `ARTSPAN <file> <tiles>`: the value for the resource row's artSpan column.
 */
const fs = require('fs');
const path = require('path');
const { ROOT, CANDIDATES, sharp } = require('./lib/common');
const { keyMagenta } = require('./lib/key');

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const job = opt('job', 'buildings-bible-cut'), subject = opt('subject'), file = opt('file', subject);
const n = Number(opt('n', 3)), px = Number(opt('px', 512));
const candidate = opt('candidate', `painterly-${subject}-1`);
if (!subject) { console.error('need --subject'); process.exit(1); }

(async () => {
  const src = path.join(CANDIDATES, job, 'exploration', 'openai', `${candidate}.png`);
  const panel = await sharp(src).png().toBuffer();
  const meta = await sharp(panel).metadata();
  const keyed = await keyMagenta(panel, { hue: true });
  // The model does not keep to the guide's box vertically (it sets the building's base near the
  // panel's bottom), so the sprite is fitted to the ART's own bounding box: the art's width is
  // the footprint (n tiles), the square's side is the longer of width and height, the art sits
  // at the square's bottom-centre, and the span in tiles follows (artSpan = n * side / width).
  const { data, info } = await sharp(keyed).raw().toBuffer({ resolveWithObject: true });
  const A = (x, y) => data[(y * info.width + x) * 4 + 3];
  let x0 = info.width, x1 = -1, y0 = info.height, y1 = -1;
  for (let y = 0; y < info.height; y++) {
    let count = 0;
    for (let x = 0; x < info.width; x++) if (A(x, y) > 60) { count++; if (x < x0) x0 = x; if (x > x1) x1 = x; }
    if (count > 3) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) throw new Error('nothing left after keying');
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  // The FOOTPRINT is the art's BASE, not its silhouette: a turret or eaves wider than the walls
  // must not shrink the building, the walls must fill the footprint end to end (owner). The
  // base width is the widest opaque run among the bottom 12 % of the art's rows.
  let bx0 = info.width, bx1 = -1;
  for (let y = Math.round(y1 - bh * 0.12); y <= y1; y++) for (let x = x0; x <= x1; x++) if (A(x, y) > 60) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; }
  const baseW = bx1 - bx0 + 1, baseCx = (bx0 + bx1) / 2;
  // the square holds the whole silhouette and is centred on the base; its side in tiles is artSpan
  const side = Math.round(Math.max(bh, 2 * Math.max(baseCx - x0, x1 - baseCx)) * 1.02);
  const left = Math.round(baseCx - side / 2), top = Math.round(y1 + 1 - side);
  const artSpan = Math.round((n * side / baseW) * 100) / 100;
  const L = Math.max(0, left), T = Math.max(0, top);
  const W = Math.min(side, info.width - L), H = Math.min(side, info.height - T);
  let cut = sharp(keyed).extract({ left: L, top: T, width: W, height: H });
  if (W < side || H < side) cut = cut.extend({ left: L - left, top: T - top, right: side - W - (L - left), bottom: side - H - (T - top), background: { r: 0, g: 0, b: 0, alpha: 0 } });
  const out = await cut.resize(px, px, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer();
  const dir = path.join(ROOT, 'game-client', 'public', 'assets', 'resources');
  fs.writeFileSync(path.join(dir, `${file}.png`), out);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${px} ${px}" width="${px}" height="${px}"><image width="${px}" height="${px}" xlink:href="data:image/png;base64,${out.toString('base64')}"/></svg>\n`;
  fs.writeFileSync(path.join(dir, `${file}.svg`), svg);
  console.log(`${subject}: wrote resources/${file}.png + .svg (${px} px); art ${bw} x ${bh} px, base ${baseW} px wide in the panel, footprint ${n}, artSpan ${artSpan}`);
  console.log(`ARTSPAN ${file} ${artSpan}`);
})().catch((e) => { console.error(e); process.exit(1); });
