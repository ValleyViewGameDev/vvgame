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

const DIFF = 220; // sum of |rgb - parchment| above which a pixel is figure, not paper grain or soft shadow

async function figures(file) {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  // the paper colour: the median of a 24 px band along the top edge (grainy parchments vary per pixel)
  const band = [];
  for (let y = 0; y < 24; y++) for (let x = 0; x < W; x += 4) { const i = (y * W + x) * C; band.push([data[i], data[i + 1], data[i + 2]]); }
  const med = (k) => band.map((p) => p[k]).sort((a, b) => a - b)[band.length >> 1];
  const bg = [med(0), med(1), med(2)];
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
    // the head band: the widest row between 18% and 38% of the figure's height (hair and face,
    // below a crown or horns), as a share of the height. A bigger share = a bigger head on a
    // shorter body, the "squashed" drift the turnarounds showed.
    let headW = 0;
    for (let y = top + Math.round(h * 0.18); y <= top + Math.round(h * 0.38); y++) {
      let a = -1, b = -1; for (let x = x0; x <= x1; x++) if (isFig(x, y)) { if (a < 0) a = x; b = x; }
      if (b - a + 1 > headW) headW = b - a + 1;
    }
    return { x: x0, y: top, w, h, ratio: +(h / w).toFixed(2), head: +(headW / h).toFixed(3) };
  });
}

(async () => {
  for (const f of process.argv.slice(2)) {
    const figs = await figures(f);
    console.log(path.basename(f) + ':', figs.map((g) => `h ${g.h} w ${g.w} h/w ${g.ratio} head/h ${g.head}`).join('  |  '));
  }
})().catch((e) => { console.error(e); process.exit(1); });
