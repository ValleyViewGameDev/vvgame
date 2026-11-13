#!/usr/bin/env node
/**
 * brows.js - the EYEBROW layer of an avatar face (owner 2026-11-13: the eyebrows follow Hair Color).
 *
 * The brows were painted into the face part, which is multiplied by the skin tone, so a blonde or
 * black head of hair kept the painted brown brows. This lifts the two brows out of the face into
 * their own grey layer (the face row's `file3` in tuning/avatarParts.json, `tint3: hairColor`) and
 * paints skin back where they were, so a light hair colour shows no dark ghost under them.
 *
 *   node tools/art/brows.js --face <face png> --eyeballs <eyeballs png> --out <brows png> [--faceout <png>]
 *
 * The face part is drawn near-white (it takes its colour from the tint); the brows are the two
 * largest masses of darker pixels above the eyes (`--eyeballs` says where the eyes start; the band
 * ends a few rows above them, so the lash line is never taken). Per pixel of a brow and its
 * anti-aliased edge (grown a couple of pixels into the skin):
 *   - alpha: how far the pixel is from the skin's own value toward the brow's (the core is opaque);
 *   - the grey: the painted value, edges at the brow's value, lifted so the brow's median sits at
 *     BROW_MEDIAN: multiplied by a hair colour a brow is a little darker than the hair parts
 *     (whose median is ~0.85), as brows are;
 *   - the face: each brow pixel is filled by interpolating down its column between the skin
 *     above and below the brow.
 * `--faceout` defaults to overwriting `--face`. A figure square is 512 px; nothing depends on the rig.
 */
const sharp = require('../../game-client/node_modules/sharp');

const argv = process.argv.slice(2); const args = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) { args[argv[i].slice(2)] = argv[i + 1]; i++; }
if (!args.face || !args.eyeballs || !args.out) { console.error('usage: brows.js --face <png> --eyeballs <png> --out <png> [--faceout <png>]'); process.exit(1); }

const DARK = 200;        // a pixel darker than this (max channel) in the band may be brow
const EDGE = 246;        // ... and one darker than this next to a brow is its anti-aliased edge
const CORE = 170;        // a pixel this dark or darker is wholly brow (alpha 1)
const GAP = 4;           // the band ends this many rows above the eyeballs' top
const BROW_MEDIAN = 185; // the brow's median grey after the lift

const load = async (f) => { const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { d: data, W: info.width, H: info.height }; };

(async () => {
  const face = await load(args.face); const eyes = await load(args.eyeballs);
  const { d, W, H } = face;
  let eyeTop = H;
  for (let p = 0; p < W * H; p++) if (eyes.d[p * 4 + 3] > 40) { eyeTop = Math.floor(p / W); break; }
  const bandEnd = eyeTop - GAP;
  const val = (p) => Math.max(d[p * 4], d[p * 4 + 1], d[p * 4 + 2]);
  const opaque = (p) => d[p * 4 + 3] >= 200;

  // the masses of dark pixels in the band (8-connected); the brows are the two largest
  const comp = new Int32Array(W * H).fill(-1); const sizes = [];
  for (let y = 0; y < bandEnd; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x;
    if (comp[p] >= 0 || !opaque(p) || val(p) >= DARK) continue;
    const id = sizes.length; let n = 0; const stack = [p]; comp[p] = id;
    while (stack.length) {
      const q = stack.pop(); n++; const qx = q % W, qy = Math.floor(q / W);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = qx + dx, ny = qy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= bandEnd) continue;
        const r = ny * W + nx; if (comp[r] >= 0 || !opaque(r) || val(r) >= DARK) continue;
        comp[r] = id; stack.push(r);
      }
    }
    sizes.push(n);
  }
  const keep = sizes.map((n, i) => [n, i]).sort((a, b) => b[0] - a[0]).slice(0, 2).filter(([n]) => n >= 30).map(([, i]) => i);
  if (keep.length < 2) { console.error(`found ${keep.length} brow(s) above row ${bandEnd}`); process.exit(2); }
  const mask = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) if (keep.includes(comp[p])) mask[p] = 1;
  for (let pass = 0; pass < 2; pass++) { // grow into the anti-aliased edge
    const add = [];
    for (let y = 1; y < bandEnd; y++) for (let x = 1; x < W - 1; x++) {
      const p = y * W + x; if (mask[p] || !opaque(p) || val(p) >= EDGE) continue;
      if (mask[p - 1] || mask[p + 1] || mask[p - W] || mask[p + W] || mask[p - W - 1] || mask[p - W + 1] || mask[p + W - 1] || mask[p + W + 1]) add.push(p);
    }
    for (const p of add) mask[p] = 1;
  }

  // the skin's own value: the median of the band's opaque non-brow pixels between the brows' columns
  let bx0 = W, bx1 = 0, by0 = H, by1 = 0;
  for (let p = 0; p < W * H; p++) if (mask[p]) { const x = p % W, y = Math.floor(p / W); bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); }
  const skinVals = [];
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) { const p = y * W + x; if (!mask[p] && opaque(p)) skinVals.push(val(p)); }
  skinVals.sort((a, b) => a - b);
  const S = skinVals[Math.floor(skinVals.length / 2)] || 252;

  // the brow layer
  const greys = [];
  for (let p = 0; p < W * H; p++) if (mask[p] && val(p) <= CORE) greys.push(val(p));
  greys.sort((a, b) => a - b);
  const lift = BROW_MEDIAN / (greys[Math.floor(greys.length / 2)] || CORE);
  const out = Buffer.alloc(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    if (!mask[p]) continue;
    const v = val(p);
    const a = Math.max(0, Math.min(1, (S - v) / (S - CORE)));
    const g = Math.min(255, Math.round(Math.min(v, CORE) * lift));
    out[p * 4] = out[p * 4 + 1] = out[p * 4 + 2] = g;
    out[p * 4 + 3] = Math.round(a * d[p * 4 + 3]);
  }

  // the face without its brows: each brow pixel interpolated down its column between the skin around it
  const f = Buffer.from(d);
  for (let x = bx0; x <= bx1; x++) {
    let y = by0;
    while (y <= by1) {
      if (!mask[y * W + x]) { y++; continue; }
      let y1 = y; while (y1 + 1 < H && mask[(y1 + 1) * W + x]) y1++;
      const above = (y - 1) * W + x, below = (y1 + 1) * W + x;
      for (let yy = y; yy <= y1; yy++) {
        const t = (yy - y + 1) / (y1 - y + 2); const p = yy * W + x;
        for (let c = 0; c < 3; c++) f[p * 4 + c] = Math.round(d[above * 4 + c] * (1 - t) + d[below * 4 + c] * t);
      }
      y = y1 + 1;
    }
  }

  const write = (buf, file) => sharp(buf, { raw: { width: W, height: H, channels: 4 } }).png().toFile(file);
  await write(out, args.out);
  await write(f, args.faceout || args.face);
  console.log(`brows: ${greys.length} core px, skin ${S}, lift ${lift.toFixed(2)}, band to row ${bandEnd} -> ${args.out}`);
})();
