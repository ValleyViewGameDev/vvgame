#!/usr/bin/env node
/**
 * The icon-sheet splitter (UI icons, 2026-11-01). A sheet drawn on guides/icon-grid-4x3.png holds
 * one icon per cell; this cuts the cells, keys the magenta (hue, border flood plus islands), trims
 * each icon to its own box, pads it square, and writes <out>/<name>.png + .svg (the same base64
 * wrapper the world sprites use). Names come in grid order.
 *
 *   node tools/art/icons.js --job icons-r1 --candidate painted-nav-1 --names farming,tools,... \
 *     [--cols 4 --rows 3] [--px 256] [--prefix icon-] [--out game-client/public/assets/icons]
 */
const fs = require('fs');
const path = require('path');
const { ROOT, CANDIDATES, sharp, ensureDir } = require('./lib/common');
const { keyMagenta } = require('./lib/key');

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const job = opt('job'), candidate = opt('candidate'), names = (opt('names', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const cols = Number(opt('cols', 4)), rows = Number(opt('rows', 3)), px = Number(opt('px', 256)), prefix = opt('prefix', 'icon-');
const out = path.resolve(ROOT, opt('out', 'game-client/public/assets/icons'));
if (!job || !candidate || !names.length) { console.error('need --job, --candidate, --names'); process.exit(1); }

(async () => {
  const approved = path.join(CANDIDATES, job, 'approved', `openai--${candidate}.png`);
  const src = fs.existsSync(approved) ? approved : path.join(CANDIDATES, job, 'exploration', 'openai', `${candidate}.png`);
  const keyed = await keyMagenta(await sharp(src).png().toBuffer(), { hue: true, flood: true, islands: true });
  const { data, info } = await sharp(keyed).raw().toBuffer({ resolveWithObject: true });
  const A = (x, y) => data[(y * info.width + x) * 4 + 3];
  const cw = info.width / cols, ch = info.height / rows;
  ensureDir(out);
  for (let i = 0; i < names.length && i < cols * rows; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    // trim to the opaque pixels inside the cell (a 4 px inset drops the grid line)
    const X0 = Math.round(c * cw) + 4, Y0 = Math.round(r * ch) + 4, X1 = Math.round((c + 1) * cw) - 4, Y1 = Math.round((r + 1) * ch) - 4;
    let x0 = X1, x1 = X0, y0 = Y1, y1 = Y0;
    for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) if (A(x, y) > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < x0) { console.log(`${names[i]}: EMPTY cell`); continue; }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, side = Math.max(bw, bh);
    const left = Math.round((x0 + x1) / 2 - side / 2), top = Math.round((y0 + y1) / 2 - side / 2);
    const L = Math.max(0, left), T = Math.max(0, top), W = Math.min(side, info.width - L), H = Math.min(side, info.height - T);
    let cut = sharp(keyed).extract({ left: L, top: T, width: W, height: H });
    if (W < side || H < side) cut = cut.extend({ left: L - left, top: T - top, right: side - W - (L - left), bottom: side - H - (T - top), background: { r: 0, g: 0, b: 0, alpha: 0 } });
    const png = await cut.resize(px, px, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer();
    const file = `${prefix}${names[i]}`;
    fs.writeFileSync(path.join(out, `${file}.png`), png);
    fs.writeFileSync(path.join(out, `${file}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${px} ${px}" width="${px}" height="${px}"><image width="${px}" height="${px}" xlink:href="data:image/png;base64,${png.toString('base64')}"/></svg>\n`);
    console.log(`${file}: cell ${c},${r} art ${bw} x ${bh} px -> ${px} px`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
