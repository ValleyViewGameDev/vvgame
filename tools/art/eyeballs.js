#!/usr/bin/env node
/**
 * eyeballs.js - the EYEBALL layer and the IRIS layer of an avatar face (docs/avatar-plan.md,
 * "The eyes keep their own colour", 2026-11-10).
 *
 * The face part is multiplied by the skin tone, and the eyes are painted into the face, so a dark
 * tone turned the whites of the eyes and the pupils' highlights brown. This lifts each eyeball
 * (the white, the iris, the pupil and its highlight) out of the face into its own layer, drawn
 * UNTINTED straight over the face (the face row's `file2` in tuning/avatarParts.json). The iris
 * layer (tinted by eyeColor) and the blink lids still draw over it.
 *
 *   node tools/art/eyeballs.js --face <face png> --at <any layer with pixels on both irises> --out <eyeballs png> [--irisout <iris png>]
 *
 * `--at` only says roughly WHERE the two eyes are (the centre of its pixels on each side of the
 * gap between them); the result is the same from the old iris layer or the new one. Per eye:
 *   - the PUPIL: the black at that spot; its centre (re-centred until it stops moving) is the
 *     eye's centre;
 *   - the WHITE of the eye: pale pixels (low saturation, bright), which no skin is, joined to the
 *     white beside the iris (a highlight on the nose or cheek is not);
 *   - the IRIS RADIUS: how far the picture stays neither white nor skin beside the pupil, on the
 *     pupil's row and the two under it (under, because the highlight sits on the pupil's upper
 *     edge). Both eyes take the larger: the far eye of a turned face is clipped by its outline;
 *   - the EYEBALL: on every row that has white in it, everything from the leftmost to the
 *     rightmost of the white and the iris's chord. That takes the iris, the pupil and the
 *     highlight between the whites, leaves out the lash line above and the lid below (rows with
 *     no white), and never has to tell a brown iris from skin except at an iris the lid clips;
 *   - the anti-aliased rim against the lashes and lids stays in the face (tinted): untinted it
 *     would be a pale ring around the eye under a dark tone.
 * `--irisout` writes the iris layer from the eyeball: every eyeball pixel inside the iris circle
 * that is not the white, the highlight or the black of the pupil, neutralised to grey exactly as
 * parts.js iris does (value over the brightest, gamma 0.6). The first iris layers came from rings
 * grown around the pupil and stopped short, so the lower third of each iris kept the painted
 * blue or brown under any chosen eye colour; that only showed once the eyeball stopped taking
 * the skin tone. A figure square is 512 px; nothing here depends on the rig.
 */
const sharp = require('../../game-client/node_modules/sharp');

const argv = process.argv.slice(2); const args = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) { args[argv[i].slice(2)] = argv[i + 1]; i++; }
if (!args.face || !args.at || !args.out) { console.error('usage: eyeballs.js --face <png> --at <png> --out <png> [--irisout <png>]'); process.exit(1); }

const load = async (f) => { const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { d: data, W: info.width, H: info.height }; };
const WIN_X = 26, WIN_Y = 18;       // px around an eye's centre that may hold its white
const NEAR = 14;                    // the white that starts an eye lies this close to its centre
const MAX_R = 14;                   // an iris is never wider than this (512 px figure square)
const MAX_SAT = 0.3, MIN_VAL = 0.7; // the white of the eye (skin never drops under saturation 0.35)

(async () => {
  const face = await load(args.face), at = await load(args.at); const { d, W, H } = face;
  const marked = (p) => at.d[p * 4 + 3] > 40;
  const hsv = (i) => { const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]), dl = mx - mn; let h = 0; if (dl) { if (mx === d[i]) h = ((d[i + 1] - d[i + 2]) / dl) % 6; else if (mx === d[i + 1]) h = (d[i + 2] - d[i]) / dl + 2; else h = (d[i] - d[i + 1]) / dl + 4; h *= 60; if (h < 0) h += 360; } return [h, mx ? dl / mx : 0, mx / 255]; };
  const opaque = (x, y) => x >= 0 && y >= 0 && x < W && y < H && d[(y * W + x) * 4 + 3] >= 200;
  const isWhite = (x, y) => { if (!opaque(x, y)) return false; const [, s, v] = hsv((y * W + x) * 4); return v >= MIN_VAL && s <= MAX_SAT; };
  const isBlack = (x, y) => opaque(x, y) && hsv((y * W + x) * 4)[2] < 0.2;
  const isSkin = (x, y) => { if (!opaque(x, y)) return true; const [h, , v] = hsv((y * W + x) * 4); return h >= 5 && h <= 50 && v >= 0.72; }; // a brown iris is darker than skin

  // roughly where: the marked pixels, split at the widest unmarked run of columns between them
  let x0 = W, x1 = -1; const cols = new Uint8Array(W);
  for (let p = 0; p < W * H; p++) if (marked(p)) { const x = p % W; cols[x] = 1; x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  if (x1 < 0) { console.error('--at has no pixels'); process.exit(2); }
  let gapA = -1, gapB = -1; for (let x = x0, s = -1; x <= x1 + 1; x++) { if (x <= x1 && !cols[x]) { if (s < 0) s = x; } else if (s >= 0) { if (x - s > gapB - gapA) { gapA = s; gapB = x; } s = -1; } }
  const mid = gapA >= 0 ? (gapA + gapB) >> 1 : (x0 + x1) >> 1;

  const eyes = [];
  for (const [ex0, ex1] of [[x0, mid], [mid + 1, x1]]) {
    let mx = 0, my = 0, mn = 0; for (let p = 0; p < W * H; p++) if (marked(p) && p % W >= ex0 && p % W <= ex1) { mx += p % W; my += (p / W) | 0; mn++; }
    mx /= mn; my /= mn;
    // the pupil: the centre of the black within 6 px, re-centred on itself until it stops moving,
    // so the answer does not depend on where exactly --at put the spot
    let cx = mx, cy = my;
    for (let pass = 0; pass < 12; pass++) {
      let sx = 0, sy = 0, sn = 0;
      for (let y = Math.round(cy) - 6; y <= Math.round(cy) + 6; y++) for (let x = Math.round(cx) - 6; x <= Math.round(cx) + 6; x++) if (Math.hypot(x - cx, y - cy) <= 6 && isBlack(x, y)) { sx += x; sy += y; sn++; }
      if (!sn) { console.error(`no pupil near ${mx.toFixed(0)},${my.toFixed(0)}`); process.exit(2); }
      const nx = sx / sn, ny = sy / sn; const moved = Math.hypot(nx - cx, ny - cy); cx = nx; cy = ny; if (moved < 0.01) break;
    }
    const wx0 = Math.max(0, Math.round(cx) - WIN_X), wx1 = Math.min(W - 1, Math.round(cx) + WIN_X), wy0 = Math.max(0, Math.round(cy) - WIN_Y), wy1 = Math.min(H - 1, Math.round(cy) + WIN_Y);
    // the white joined to this eye: from the white close to the centre, through white only
    const white = new Uint8Array(W * H); const ws = [];
    for (let y = wy0; y <= wy1; y++) for (let x = wx0; x <= wx1; x++) if (Math.hypot(x - cx, y - cy) <= NEAR && isWhite(x, y)) { white[y * W + x] = 1; ws.push(y * W + x); }
    while (ws.length) { const p = ws.pop(); const x = p % W, y = (p / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < wx0 || nx > wx1 || ny < wy0 || ny > wy1) continue; const q = ny * W + nx; if (!white[q] && isWhite(nx, ny)) { white[q] = 1; ws.push(q); } } }
    // the iris radius beside the pupil
    let r = 0;
    for (let y = Math.round(cy); y <= Math.round(cy) + 2; y++) {
      let l = Math.round(cx), rt = Math.round(cx);
      while (cx - (l - 1) <= MAX_R && !isWhite(l - 1, y) && !isSkin(l - 1, y)) l--;
      while (rt + 1 - cx <= MAX_R && !isWhite(rt + 1, y) && !isSkin(rt + 1, y)) rt++;
      r = Math.max(r, cx - l + 0.5, rt - cx + 0.5);
    }
    eyes.push({ cx, cy, r, white, win: [wx0, wx1, wy0, wy1] });
  }
  const R = Math.max(...eyes.map((e) => e.r)); // both irises are the same size

  const out = Buffer.alloc(W * H * 4); const result = { eyes: [], iris: [] };
  for (const e of eyes) {
    const [wx0, wx1, wy0, wy1] = e.win; e.ball = new Uint8Array(W * H); let n = 0, rows = 0;
    for (let y = wy0; y <= wy1; y++) {
      let a = -1, b = -1;
      for (let x = wx0; x <= wx1; x++) if (e.white[y * W + x]) { if (a < 0) a = x; b = x; }
      if (a < 0) continue; rows++;
      // the iris's chord on this row, walked out from the centre column while it is neither skin nor past the circle
      const half = Math.sqrt(Math.max(0, (R + 1.2) ** 2 - (y - e.cy) ** 2));
      if (half > 0 && !isSkin(Math.round(e.cx), y)) {
        let l = Math.round(e.cx), rt = Math.round(e.cx);
        while (e.cx - (l - 1) <= half && !isSkin(l - 1, y)) l--;
        while (rt + 1 - e.cx <= half && !isSkin(rt + 1, y)) rt++;
        a = Math.min(a, l); b = Math.max(b, rt);
      }
      for (let x = a; x <= b; x++) { const i = (y * W + x) * 4; if (d[i + 3] < 200) continue; d.copy(out, i, i, i + 4); e.ball[y * W + x] = 1; n++; }
    }
    result.eyes.push({ x: +e.cx.toFixed(1), y: +e.cy.toFixed(1), rows, px: n });
  }
  await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toFile(args.out);
  if (args.irisout) {
    const io = Buffer.alloc(W * H * 4);
    for (const e of eyes) {
      const px = []; let vmax = 0;
      for (let y = e.win[2]; y <= e.win[3]; y++) for (let x = e.win[0]; x <= e.win[1]; x++) {
        if (!e.ball[y * W + x] || Math.hypot(x - e.cx, y - e.cy) > R + 1.2) continue; // a pixel over the measured edge: the painted iris has a soft rim
        const i = (y * W + x) * 4; const [, sat, v] = hsv(i);
        if (v < 0.16 || (v < 0.30 && sat < 0.30)) continue; // the black pupil (a dark iris edge is saturated)
        if (isWhite(x, y)) continue;                        // the white of the eye (lit or shaded), the highlight
        px.push([i, v]); if (v > vmax) vmax = v;
      }
      for (const [i, v] of px) { const g = Math.round(Math.pow(Math.min(1, v / (vmax || 1)), 0.6) * 250); io[i] = g; io[i + 1] = g; io[i + 2] = g; io[i + 3] = 255; }
      result.iris.push({ r: +R.toFixed(1), px: px.length });
    }
    await sharp(io, { raw: { width: W, height: H, channels: 4 } }).png().toFile(args.irisout);
  }
  console.log(JSON.stringify(result));
})();
