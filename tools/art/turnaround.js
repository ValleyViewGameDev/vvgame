#!/usr/bin/env node
/**
 * Compose a turnaround sheet from single-view panels drawn in the same frame: the approved
 * front (untouched), a side view and a back view, side by side at full resolution. Prints
 * each view's figure box so a view whose head or feet sit at a different height than the
 * front's is caught before anyone approves it.
 *
 *   node tools/art/turnaround.js --front <png> --side <png> --back <png> --out <png>
 */
const fs = require('fs');
const path = require('path');
const { sharp } = require('./lib/common');

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]] : null)).filter(Boolean));
for (const k of ['front', 'side', 'back', 'out']) if (!args[k]) { console.error(`--${k} is required`); process.exit(1); }

async function box(file) {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const band = []; for (let y = 0; y < 24; y++) for (let x = 0; x < W; x += 4) { const i = (y * W + x) * C; band.push([data[i], data[i + 1], data[i + 2]]); }
  const med = (k) => band.map((p) => p[k]).sort((a, b) => a - b)[band.length >> 1];
  const bg = [med(0), med(1), med(2)];
  let top = H, bottom = 0;
  for (let y = 0; y < H; y++) { let n = 0; for (let x = 0; x < W; x++) { const i = (y * W + x) * C; if (Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) > 220) n++; } if (n > 2) { if (y < top) top = y; if (y > bottom) bottom = y; } }
  return { top, bottom, h: bottom - top + 1, W, H, bg: { r: bg[0], g: bg[1], b: bg[2] } };
}

(async () => {
  const views = ['front', 'side', 'back'];
  const boxes = {};
  for (const v of views) boxes[v] = await box(args[v]);
  const ref = boxes.front;
  for (const v of views) {
    const b = boxes[v];
    const flag = v !== 'front' && (Math.abs(b.top - ref.top) > ref.h * 0.03 || Math.abs(b.bottom - ref.bottom) > ref.h * 0.03) ? '   <-- off the front by more than 3%' : '';
    console.log(`${v.padEnd(5)} head y ${b.top}  feet y ${b.bottom}  height ${b.h}${flag}`);
  }
  const W = ref.W, H = ref.H;
  const layers = [];
  for (let i = 0; i < views.length; i++) {
    const v = views[i];
    // placement, not proportion: slide a view vertically so its feet sit on the front's feet line
    const dy = boxes[v].bottom - ref.bottom;
    let img = sharp(args[v]).resize(W, H);
    if (dy > 0) img = img.extract({ left: 0, top: dy, width: W, height: H - dy }).extend({ bottom: dy, background: boxes[v].bg });
    else if (dy < 0) img = img.extract({ left: 0, top: 0, width: W, height: H + dy }).extend({ top: -dy, background: boxes[v].bg });
    if (dy) console.log(`${v}: slid ${dy > 0 ? 'up' : 'down'} ${Math.abs(dy)} px to the front's feet line`);
    layers.push({ input: await img.png().toBuffer(), left: i * W, top: 0 });
  }
  await sharp({ create: { width: W * 3, height: H, channels: 3, background: '#e9dcc0' } }).composite(layers).png().toFile(args.out);
  console.log('wrote', path.relative(process.cwd(), args.out));
})().catch((e) => { console.error(e); process.exit(1); });
