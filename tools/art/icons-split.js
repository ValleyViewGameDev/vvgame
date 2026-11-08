#!/usr/bin/env node
/**
 * The icon-sheet splitter for a sheet whose icons do NOT sit in the guide's cells (the model drew
 * them four across in one band, nearly touching): keys the magenta, finds the columns of fully
 * transparent pixels between the icons and cuts each icon by its own box, so one icon's eave
 * never lands in its neighbour's cut. Names come left to right.
 *
 *   node tools/art/icons-split.js --job icons-r10 --candidate system-town-1 --names a,b,c,d [--px 256] [--prefix icon-] [--out dir]
 */
const fs = require('fs');
const path = require('path');
const { ROOT, CANDIDATES, sharp, ensureDir } = require('./lib/common');
const { keyMagenta } = require('./lib/key');

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const job = opt('job'), candidate = opt('candidate'), names = (opt('names', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const px = Number(opt('px', 256)), prefix = opt('prefix', 'icon-'), minGap = Number(opt('gap', 6));
const out = path.resolve(ROOT, opt('out', 'game-client/public/assets/icons'));
if (!job || !candidate || !names.length) { console.error('need --job, --candidate, --names'); process.exit(1); }

(async () => {
  const approved = path.join(CANDIDATES, job, 'approved', `openai--${candidate}.png`);
  const src = fs.existsSync(approved) ? approved : path.join(CANDIDATES, job, 'exploration', 'openai', `${candidate}.png`);
  const keyed = await keyMagenta(await sharp(src).png().toBuffer(), { hue: true, flood: true, islands: true });
  const { data, info } = await sharp(keyed).raw().toBuffer({ resolveWithObject: true });
  const A = (x, y) => data[(y * info.width + x) * 4 + 3];
  const colHas = new Array(info.width).fill(false);
  for (let x = 0; x < info.width; x++) for (let y = 0; y < info.height; y++) if (A(x, y) > 40) { colHas[x] = true; break; }
  // runs of columns holding art, separated by at least minGap empty columns
  const runs = []; let start = -1, gap = 0;
  for (let x = 0; x <= info.width; x++) {
    const has = x < info.width && colHas[x];
    if (has) { if (start < 0) start = x; gap = 0; }
    else if (start >= 0) { gap++; if (gap >= minGap || x === info.width) { runs.push([start, x - gap]); start = -1; gap = 0; } }
  }
  if (runs.length !== names.length) console.log(`found ${runs.length} icons for ${names.length} names: ${JSON.stringify(runs)}`);
  ensureDir(out);
  for (let i = 0; i < Math.min(runs.length, names.length); i++) {
    const [x0, x1] = runs[i];
    let y0 = info.height, y1 = 0;
    for (let y = 0; y < info.height; y++) for (let x = x0; x <= x1; x++) if (A(x, y) > 40) { if (y < y0) y0 = y; if (y > y1) y1 = y; break; }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, side = Math.max(bw, bh);
    const left = Math.round((x0 + x1) / 2 - side / 2), top = Math.round((y0 + y1) / 2 - side / 2);
    const L = Math.max(0, left), T = Math.max(0, top), W = Math.min(side, info.width - L), H = Math.min(side, info.height - T);
    let cut = sharp(keyed).extract({ left: L, top: T, width: W, height: H });
    if (W < side || H < side) cut = cut.extend({ left: L - left, top: T - top, right: side - W - (L - left), bottom: side - H - (T - top), background: { r: 0, g: 0, b: 0, alpha: 0 } });
    const png = await cut.resize(px, px, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer();
    const file = `${prefix}${names[i]}`;
    fs.writeFileSync(path.join(out, `${file}.png`), png);
    fs.writeFileSync(path.join(out, `${file}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${px} ${px}" width="${px}" height="${px}"><image width="${px}" height="${px}" xlink:href="data:image/png;base64,${png.toString('base64')}"/></svg>\n`);
    console.log(`${file}: x ${x0}..${x1} art ${bw} x ${bh} px -> ${px} px`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
