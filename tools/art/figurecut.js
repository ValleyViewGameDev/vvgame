#!/usr/bin/env node
/**
 * Cut a CHARACTER panel (guides/figure-cut.png: a 1 x 1 tile box with a half-tile headroom box
 * above it, on magenta) into the game's figure frame (docs/avatar-plan.md v2 §3): key the
 * magenta out, fit the art's own box to the figure frame (one tile wide, one and a half tall:
 * feet on the tile's bottom edge, hair at the headroom's top; the model ignores the guide's box
 * for scale) and write a 512 px square with that frame centred, artSpan 1.5.
 *
 *   node tools/art/figurecut.js --job characters-r1 --candidate painterly-kent-1 --out <png>
 * Prints the art's box in frame units (width and height in tiles, feet offset) so a figure that
 * overflows the box or stands short is caught before anyone looks.
 */
const fs = require('fs');
const path = require('path');
const { CANDIDATES, sharp } = require('./lib/common');
const { keyMagenta } = require('./lib/key');

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const job = opt('job', 'characters-r1'), candidate = opt('candidate'), out = opt('out');
if (!candidate || !out) { console.error('need --candidate and --out'); process.exit(1); }

/** Keep the figure (the largest opaque component) and anything at least 2 % of its size. */
async function dropSpecks(buf) {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, N = W * H;
  const label = new Int32Array(N).fill(-1);
  const sizes = [];
  const stack = [];
  for (let p = 0; p < N; p++) {
    if (label[p] >= 0 || data[p * 4 + 3] < 24) continue;
    const id = sizes.length; sizes.push(0); label[p] = id; stack.push(p);
    while (stack.length) {
      const q = stack.pop(); sizes[id]++;
      const x = q % W, y = (q - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (label[n] < 0 && data[n * 4 + 3] >= 24) { label[n] = id; stack.push(n); }
      }
    }
  }
  const biggest = Math.max(0, ...sizes);
  let dropped = 0;
  for (let p = 0; p < N; p++) if (label[p] >= 0 && sizes[label[p]] < biggest * 0.02) { data[p * 4 + 3] = 0; dropped++; }
  if (dropped) console.log(`  dropped ${dropped} px of specks in ${sizes.filter((z) => z < biggest * 0.02).length} pieces`);
  return sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
}

(async () => {
  const approved = path.join(CANDIDATES, job, 'approved', `openai--${candidate}.png`);
  const src = fs.existsSync(approved) ? approved : path.join(CANDIDATES, job, 'exploration', 'openai', `${candidate}.png`);
  const panel = await sharp(src).png().toBuffer();
  const meta = await sharp(panel).metadata();
  // islands: the pocket of flat magenta between an arm and the body is background too (the
  // border flood cannot reach it); then every speck not part of the figure (the guide's dashed
  // headroom line, which the model redraws) is dropped: only components of at least 2 % of the
  // largest one's area survive
  const keyed = await dropSpecks(await keyMagenta(panel, { hue: true, flood: true, islands: true }));
  const { data, info } = await sharp(keyed).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const A = (x, y) => data[(y * W + x) * 4 + 3];
  // the guide's geometry: three cells, the box is the centre cell, the headroom the half cell above it
  const t = W / 3, boxL = t, boxR = 2 * t, boxB = 2 * t, frameT = t / 2;
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (A(x, y) >= 60) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) { console.error('nothing opaque'); process.exit(1); }
  const artW = x1 - x0 + 1, artH = y1 - y0 + 1;
  console.log(`${candidate}: art ${(artW / t).toFixed(2)} tiles wide x ${(artH / t).toFixed(2)} tall in the panel (box: x ${((x0 - boxL) / t).toFixed(2)}..${((x1 - boxL) / t).toFixed(2)}, bottom ${((y1 - (boxB - 1)) / t).toFixed(2)} from the tile bottom)`);
  // The model does not keep to the guide's box (the first panels drew the figure 2.5 tiles tall),
  // so the frame is fitted to the ART: its height is the whole frame (one and a half tiles: feet on
  // the tile's bottom edge, hair at the headroom's top), unless that would make it wider than a
  // tile, in which case its width is the tile and it stands shorter. The square is 512 px, the
  // frame 341 x 512 centred in it, artSpan 1.5.
  const FRAME_W = 512 / 1.5, FRAME_H = 512;
  let scale = FRAME_H / artH;
  if (artW * scale > FRAME_W) { scale = FRAME_W / artW; console.log(`  wider than tall allows: fitted by width, stands ${(artH * scale / FRAME_H * 1.5).toFixed(2)} tiles tall`); }
  const scaled = await sharp(keyed).extract({ left: x0, top: y0, width: artW, height: artH }).resize({ width: Math.max(1, Math.round(artW * scale)), height: Math.max(1, Math.round(artH * scale)) }).png().toBuffer();
  const sm = await sharp(scaled).metadata();
  console.log(`  frame: ${(sm.width / FRAME_W).toFixed(2)} tiles wide, feet on the tile bottom, head ${(sm.height / FRAME_W).toFixed(2)} tiles up`);
  await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: scaled, left: Math.round((512 - sm.width) / 2), top: 512 - sm.height }]).png().toFile(out);
  console.log('wrote', out, 'ARTSPAN 1.5');
})().catch((e) => { console.error(e); process.exit(1); });
