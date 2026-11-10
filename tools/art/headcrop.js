#!/usr/bin/env node
/**
 * Cut a HEAD portrait out of a figure square (docs/avatar-plan.md v2 §7e): the 512 px figure
 * (tools/art/figurecut.js, artSpan 1.5 frame) is cropped to a square around the head and
 * shoulders, so panels, quest cards and the story modal show the new face at thumbnail size
 * instead of the whole figure (which reads as a sliver at 24 px) or the old bust.
 *
 *   node tools/art/headcrop.js --in game-client/public/assets/resources/npc-figure-kent.png --out game-client/public/assets/resources/npc-head-kent
 *   node tools/art/headcrop.js --all      every resources/npc-figure-*.png -> npc-head-*.png + .svg
 *
 * The crop: rows 0 .. collar (frame y 130 of 384 -> px 173 of 512) plus a margin for the
 * shoulders, a square of side S = 236 px centred on the head's opaque centre (measured over the
 * top 170 rows, so the faint turn and a hat do not pull it off the face), then resized to 256.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('../../game-client/node_modules/sharp');

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : null)).filter(Boolean));
const RES = path.resolve(__dirname, '..', '..', 'game-client', 'public', 'assets', 'resources');
const SIDE = 236, HEAD_ROWS = 170;

async function crop(src, outBase) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  let sx = 0, n = 0, top = -1;
  for (let y = 0; y < Math.min(H, HEAD_ROWS); y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 60) { sx += x; n++; if (top < 0) top = y; }
  if (!n) throw new Error(`nothing opaque in ${src}`);
  const cx = Math.round(sx / n);
  const left = Math.max(0, Math.min(W - SIDE, cx - SIDE / 2));
  const topRow = Math.max(0, Math.min(H - SIDE, top - 6)); // a little air above the hair or hat
  const png = await sharp(src).extract({ left, top: topRow, width: SIDE, height: SIDE }).resize(256, 256).png().toBuffer();
  fs.writeFileSync(outBase + '.png', png);
  fs.writeFileSync(outBase + '.svg', `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="256" height="256" viewBox="0 0 256 256"><image width="256" height="256" xlink:href="data:image/png;base64,${png.toString('base64')}"/></svg>\n`);
  console.log(`${path.basename(outBase)}: head centre x ${cx}, top ${top}, crop ${left},${topRow}`);
}

(async () => {
  if (args.all) {
    for (const f of fs.readdirSync(RES).filter((x) => /^npc-figure-.*\.png$/.test(x))) {
      await crop(path.join(RES, f), path.join(RES, f.replace('npc-figure-', 'npc-head-').replace('.png', '')));
    }
  } else if (args.in && args.out) await crop(args.in, args.out);
  else { console.error('need --all or --in <png> --out <base>'); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
