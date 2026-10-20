#!/usr/bin/env node
/**
 * Measure figures on parchment panels so proportion is checked by numbers, not by eye
 * (docs/art-pipeline-plan.md §7a: turnarounds drifted from the approved fronts).
 *
 *   node tools/art/measure.js <front.png> <sheet.png> [...]
 *
 * For each file: the figures found (columns of non-parchment pixels separated by gaps),
 * each with its bounding box and height / width ratio. For a turnaround the three ratios
 * should match the front's; a lower ratio means the figure was squashed.
 */
const path = require('path');
const { sharp } = require('./lib/common');

const DIFF = 150; // sum of |rgb - parchment| above which a pixel is figure, not paper or soft shadow

async function figures(file) {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const bg = [data[0], data[1], data[2]];
  const isFig = (x, y) => { const i = (y * W + x) * C; return Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) > DIFF; };
  const colCount = new Array(W).fill(0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isFig(x, y)) colCount[x]++;
  // runs of occupied columns (ignoring specks), separated by gaps of >= 24 px
  const runs = []; let start = null, gap = 0;
  for (let x = 0; x <= W; x++) {
    const on = x < W && colCount[x] > 2;
    if (on) { if (start === null) start = x; gap = 0; }
    else if (start !== null && ++gap >= 24) { runs.push([start, x - gap]); start = null; gap = 0; }
  }
  if (start !== null) runs.push([start, W - 1]);
  return runs.filter(([a, b]) => b - a > 40).map(([x0, x1]) => {
    let top = H, bottom = 0;
    for (let y = 0; y < H; y++) { let n = 0; for (let x = x0; x <= x1; x++) if (isFig(x, y)) n++; if (n > 2) { if (y < top) top = y; if (y > bottom) bottom = y; } }
    const w = x1 - x0 + 1, h = bottom - top + 1;
    return { x: x0, y: top, w, h, ratio: +(h / w).toFixed(2) };
  });
}

(async () => {
  for (const f of process.argv.slice(2)) {
    const figs = await figures(f);
    console.log(path.basename(f) + ':', figs.map((g) => `h ${g.h} w ${g.w} h/w ${g.ratio}`).join('  |  '));
  }
})().catch((e) => { console.error(e); process.exit(1); });
