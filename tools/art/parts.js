#!/usr/bin/env node
/**
 * parts.js - the avatar PARTS pipeline's deterministic half (docs/avatar-plan.md v2 §6, promoted
 * from the Phase 3 probe scripts, 2026-11-09). Every command reads PNGs with alpha (keyed figure
 * squares from figurecut.js, or keyed head crops) and writes PNGs with alpha.
 *
 *   key      --in <magenta panel> --out <png> [--green]          key the magenta (and green) out
 *   align    --worn <png> --base <png> --out <png> [--overflow 160]  scale + translate the redraw so its
 *                                                                pupils land on the base's (the model
 *                                                                redraws a base up to 10 % off)
 *   diff     --worn <png> --base <png> --out <png> [--tol 48] [--rad 3] [--grey] [--min 0.01] [--open 1] [--defringe] [--fill] [--faceclear female|male]
 *                                                                (--open: erode+dilate the alpha, kills a redraw's outline
 *                                                                slivers; --defringe: drops skin-coloured pixels on the
 *                                                                layer's edge, the peach fringe where the hairline moved;
 *                                                                --fill: enclosed holes are filled from the redraw)
 *                                                                the part = what the worn redraw has
 *                                                                that the base has not (hair, beard, hat)
 *   fitbody  --worn <aligned outfit, with overflow> --base <base figure> --body female|male --out <png>
 *                                                                resample the body below the collar so its feet land on
 *                                                                the base body's feet line (an outfit never changes height)
 *   split    --in <aligned outfit png> --body female|male --out <base>   outfit -> <base>.cloth.png +
 *                                                                <base>.skin.png (skin keyed inside the
 *                                                                rig's hand / foot boxes, its own colour)
 *   lids     --worn <closed-eyes png> --body female|male --out <png>     the blink layer: the eye boxes
 *   blink    --in <face or figure png> --out <png> [--name <figure>] [--scale 1.1] [--layer]  the same image with the eyes closed (--layer: only the changed pixels): each eye an
 *                                                                ellipse in the face's own cheek skin plus a lid arc
 *   iris     --in <face png> --out <png>                          the eye colour layer: the ring around each
 *                                                                pupil, neutralised to grey for the eyeColor tint
 *   tint     --in <png> --hex #rrggbb --out <png>                 multiply preview
 *   compose  --out <png> <layer.png>[@#hex] ...                   stack layers (optional tint each)
 *   headcrop --in <figure png> --body female|male --out <png>     the face part: the square above the collar
 *
 * Coordinates: a figure square is 512 px at artSpan 1.5 (frame x = (px - 85.33) * 0.75, y = px * 0.75);
 * a head crop is the figure's upper tile (px 85..427 x 0..342) scaled to 1024 (or 512). The rig
 * is tools/avatar/figure-rig.json.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('../../game-client/node_modules/sharp');

const rig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'avatar', 'figure-rig.json'), 'utf8'));
const SQ = 512, TILE = SQ / 1.5, FX = (SQ - TILE) / 2, S = TILE / 256; // px per frame unit in a figure square

const argv = process.argv.slice(2);
const cmd = argv[0];
const args = {}; const rest = [];
for (let i = 1; i < argv.length; i++) { const a = argv[i]; if (a.startsWith('--')) { const v = argv[i + 1]; if (v && !v.startsWith('--')) { args[a.slice(2)] = v; i++; } else args[a.slice(2)] = true; } else rest.push(a); }

async function load(file) { const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { d: data, W: info.width, H: info.height }; }
async function save(img, file) { await sharp(img.d, { raw: { width: img.W, height: img.H, channels: 4 } }).png().toFile(file); }
const blank = (W, H) => ({ d: Buffer.alloc(W * H * 4), W, H });
function hsv(r, g, b) { const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, dl = mx - mn; let h = 0; if (dl) { if (mx === r / 255) h = ((g - b) / 255 / dl) % 6; else if (mx === g / 255) h = (b - r) / 255 / dl + 2; else h = (r - g) / 255 / dl + 4; h *= 60; if (h < 0) h += 360; } return [h, mx ? dl / mx : 0, mx]; }

/** key pure magenta (and optionally pure green) by hue, border-connected plus flat pockets */
function keyOut(img, green) {
  const { d, W, H } = img;
  for (let p = 0; p < W * H; p++) {
    const i = p * 4, r = d[i], g = d[i + 1], b = d[i + 2]; const mx = Math.max(r, g, b, 1);
    const sat = (mx - Math.min(r, g, b)) / mx;
    const dm = Math.sqrt((1 - r / mx) ** 2 + (g / mx) ** 2 + (1 - b / mx) ** 2);
    const dg = Math.sqrt((r / mx) ** 2 + (1 - g / mx) ** 2 + (b / mx) ** 2);
    if ((dm < 0.35 && sat > 0.5) || (green && dg < 0.35 && sat > 0.5)) d[i + 3] = 0;
  }
  return img;
}

/** connected components of a predicate; returns blobs sorted by size */
function blobs(img, pred) {
  const { W, H } = img; const lab = new Int32Array(W * H).fill(-1); const out = []; const st = [];
  for (let p = 0; p < W * H; p++) {
    if (lab[p] >= 0 || !pred(p)) continue;
    const id = out.length; const b = { n: 0, x0: W, x1: 0, y0: H, y1: 0, sx: 0, sy: 0, px: [] }; out.push(b); lab[p] = id; st.push(p);
    while (st.length) {
      const q = st.pop(); const x = q % W, y = (q - x) / W; b.n++; b.sx += x; b.sy += y; b.px.push(q);
      if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const n = ny * W + nx; if (lab[n] < 0 && pred(n)) { lab[n] = id; st.push(n); } }
    }
  }
  for (const b of out) { b.cx = b.sx / b.n; b.cy = b.sy / b.n; }
  return out.sort((a, b) => b.n - a.n);
}

/**
 * The two pupils. A dark blob alone is not an eye (buttons, crown gems, a belt buckle, a brow are
 * dark blobs too): an eye is a dark blob sitting in WHITE, so each candidate in the upper half is
 * scored by the white-of-the-eye pixels around it, and the best pair on one row with a plausible
 * gap wins. Returns [{x, y, r}, {x, y, r}] left to right, or null (closed eyes, a mask).
 */
function findEyes(img) {
  const { d, W, H } = img; const ymax = Math.floor(H * 0.5);
  const dark = (p) => { const i = p * 4; if (p >= ymax * W || d[i + 3] < 200) return false; return hsv(d[i], d[i + 1], d[i + 2])[2] < 0.30; };
  const isWhite = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return false; const i = (y * W + x) * 4; if (d[i + 3] < 200) return false; const [, sat, v] = hsv(d[i], d[i + 1], d[i + 2]); return v > 0.8 && sat < 0.25; };
  const cands = blobs(img, dark).filter((b) => { const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1; return b.n >= 12 && w / h >= 0.5 && w / h <= 2 && w < W * 0.12; }).slice(0, 60);
  for (const b of cands) {
    const r = Math.sqrt(b.n / Math.PI), R = Math.ceil(r * 2.2); let white = 0;
    for (let y = Math.round(b.cy) - R; y <= b.cy + R; y++) for (let x = Math.round(b.cx) - R; x <= b.cx + R; x++) if (Math.hypot(x - b.cx, y - b.cy) <= R && isWhite(x, y)) white++;
    b.white = white; b.r = r;
  }
  const eyesLike = cands.filter((b) => b.white >= Math.max(6, b.n * 0.2));
  let best = null;
  for (let i = 0; i < eyesLike.length; i++) for (let j = i + 1; j < eyesLike.length; j++) {
    const a = eyesLike[i], b = eyesLike[j]; const dx = Math.abs(a.cx - b.cx), dy = Math.abs(a.cy - b.cy);
    const ha = a.y1 - a.y0 + 1, hb = b.y1 - b.y0 + 1;
    if (dy < Math.max(ha, hb) * 0.8 && dx > W * 0.05 && dx < W * 0.35 && Math.abs(a.n - b.n) < Math.max(a.n, b.n) * 0.7) {
      const sc = (a.white + b.white) * 2 + a.n + b.n - (a.cy + b.cy) * 0.5; // eyes are white-rimmed and near the top
      if (!best || sc > best.sc) best = { sc, a, b };
    }
  }
  if (!best) return null;
  const [l, r] = [best.a, best.b].sort((p, q) => p.cx - q.cx);
  return [{ x: l.cx, y: l.cy, r: l.r }, { x: r.cx, y: r.cy, r: r.r }];
}

/** scale + translate `worn` so its eyes coincide with `base`'s; returns { img, info } */
async function alignByEyes(wornFile, baseFile, overflow = 0) {
  const worn = await load(wornFile), base = await load(baseFile);
  const we = findEyes(worn), be = findEyes(base);
  if (!we || !be) return { img: worn, info: { ok: false, wornEyes: !!we, baseEyes: !!be } };
  const s = (be[1].x - be[0].x) / (we[1].x - we[0].x);
  const wcx = (we[0].x + we[1].x) / 2, wcy = (we[0].y + we[1].y) / 2, bcx = (be[0].x + be[1].x) / 2, bcy = (be[0].y + be[1].y) / 2;
  const nw = Math.max(1, Math.round(worn.W * s)), nh = Math.max(1, Math.round(worn.H * s));
  const left = Math.round(bcx - wcx * s), top = Math.round(bcy - wcy * s);
  // only the part of the scaled redraw that lands inside the base's canvas (a scale above 1 overflows it)
  const sx0 = Math.max(0, -left), sy0 = Math.max(0, -top);
  const outH = base.H + overflow; // `overflow`: extra rows kept below the base's canvas (fitbody reads them)
  const cw = Math.min(nw - sx0, base.W - Math.max(0, left)), ch = Math.min(nh - sy0, outH - Math.max(0, top));
  const scaled = await sharp(worn.d, { raw: { width: worn.W, height: worn.H, channels: 4 } }).resize(nw, nh).extract({ left: sx0, top: sy0, width: Math.max(1, cw), height: Math.max(1, ch) }).png().toBuffer();
  const outBuf = await sharp({ create: { width: base.W, height: outH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: scaled, left: Math.max(0, left), top: Math.max(0, top) }]).raw().toBuffer();
  return { img: { d: outBuf, W: base.W, H: outH }, info: { ok: true, scale: +s.toFixed(4), dx: left, dy: top } };
}

/** keep worn pixels with no near-match within rad px in base; optionally only neutral (grey) ones; drop specks */
function diffLayer(worn, base, { tol = 48, rad = 3, grey = false, min = 0.01, open = 0, defringe = false, fill = false, faceclear = null } = {}) {
  const { W, H } = worn; const out = blank(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x, i = p * 4; if (worn.d[i + 3] < 40) continue;
    let match = false;
    for (let dy = -rad; dy <= rad && !match; dy++) for (let dx = -rad; dx <= rad; dx++) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = (ny * W + nx) * 4; if (base.d[j + 3] < 40) continue;
      if (Math.abs(worn.d[i] - base.d[j]) + Math.abs(worn.d[i + 1] - base.d[j + 1]) + Math.abs(worn.d[i + 2] - base.d[j + 2]) < tol) { match = true; break; }
    }
    if (match) continue;
    // `grey` (a tintable part drawn in neutral grey): drop what is SKIN-coloured instead (the base's
    // peach bleeding through the redraw); a silvery hair with a cool tint is still hair
    if (grey) { const [h, s, v] = hsv(worn.d[i], worn.d[i + 1], worn.d[i + 2]); if (h >= 8 && h <= 45 && s > 0.2 && v > 0.35) continue; }
    out.d.set(worn.d.subarray(i, i + 4), i);
  }
  const opened = openAlpha(out, open);
  const clean = dropSpecks(defringe ? defringeSkin(opened) : opened, min);
  const filled = fill ? fillHoles(clean, worn) : clean;
  return faceclear ? clearFace(filled, faceclear) : filled; // last: the hole fill would put the forehead back
}

/**
 * `faceclear` (a full-colour part drawn on a head crop: a hat). The forehead the redraw shaded under
 * a brim differs from the base, so the diff keeps it; untinted, it would stay light on a dark face.
 * Inside the rig's head column (headX, from the hairline, 34 units above the brow, to the chin): BRIGHT peach always goes (value >= 0.85, saturation <= 0.72: lit skin, never straw shadow
 * or a leather band), and when the hat itself is not an orange-brown thing (its dominant hue is
 * more than 20 degrees from skin's 25: a green cap, a blue hood) every skin-hued pixel goes.
 */
function clearFace(img, body) {
  const { d, W, H } = img; const b = rig[body], k = W / 256;
  // from the hairline (a hat sits low on the forehead) to the chin; the colour rules below protect the hat
  const x0 = b.headX[0] * k, x1 = b.headX[1] * k, y0 = (b.brow - 34) * k, y1 = b.chin * k; // the whole head column
  const inBox = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const hues = [];
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) { const i = (y * W + x) * 4; if (d[i + 3] < 200 || inBox(x, y)) continue; const [h, sat, v] = hsv(d[i], d[i + 1], d[i + 2]); if (sat > 0.25 && v > 0.2) hues.push(h); }
  hues.sort((p, q) => p - q); const dom = hues.length ? hues[hues.length >> 1] : 25;
  const hatIsSkinHued = Math.abs(dom - 25) <= 20;
  let n = 0;
  for (let y = Math.floor(y0); y <= y1 && y < H; y++) for (let x = Math.floor(x0); x <= x1 && x < W; x++) {
    const i = (y * W + x) * 4; if (d[i + 3] < 24) continue;
    const [h, sat, v] = hsv(d[i], d[i + 1], d[i + 2]); if (h < 8 || h > 34) continue;
    if ((v >= 0.85 && sat <= 0.72) || !hatIsSkinHued) { d[i + 3] = 0; n++; }
  }
  console.log(`  face clear: hat hue ${Math.round(dom)}, ${n} px of skin dropped`);
  return img;
}

/** morphological opening of the alpha: erode by r then dilate by r (thin slivers vanish, masses stay) */
function openAlpha(img, r) {
  if (!r) return img;
  const { W, H } = img; const a = new Uint8Array(W * H); for (let p = 0; p < W * H; p++) a[p] = img.d[p * 4 + 3] >= 24 ? 1 : 0;
  const pass = (src, keepIf) => { const out = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let all = 1, any = 0; for (let dy = -r; dy <= r && (all || !any); dy++) for (let dx = -r; dx <= r; dx++) { const nx = x + dx, ny = y + dy; const v = nx < 0 || ny < 0 || nx >= W || ny >= H ? 0 : src[ny * W + nx]; if (!v) all = 0; else any = 1; } out[y * W + x] = keepIf === 'all' ? all : any; } return out; };
  const er = pass(a, 'all'); const di = pass(er, 'any');
  for (let p = 0; p < W * H; p++) if (!di[p]) img.d[p * 4 + 3] = 0;
  return img;
}

/** drop skin-coloured pixels on the layer's own edge: the peach fringe a redraw leaves where its hairline or jaw moved a pixel or two */
function defringeSkin(img, r = 2) {
  const { d, W, H } = img; const kill = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4; if (d[i + 3] < 24) continue;
    const [h, sat, v] = hsv(d[i], d[i + 1], d[i + 2]); if (!(h >= 8 && h <= 45 && sat > 0.2 && v > 0.35)) continue;
    let edge = false;
    for (let dy = -r; dy <= r && !edge; dy++) for (let dx = -r; dx <= r; dx++) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H || d[(ny * W + nx) * 4 + 3] < 24) { edge = true; break; } }
    if (edge) kill.push(i);
  }
  for (const i of kill) d[i + 3] = 0;
  return img;
}

/**
 * Fill the HOLES of a layer from the worn redraw: transparent regions fully enclosed by the layer
 * (never touching the image border) and smaller than maxFrac of the layer's area. The diff drops
 * a part's pixels wherever they happen to match the base within tolerance (straw against skin, a
 * hair highlight against the scalp), which leaves see-through patches; the face opening under
 * hair or a brim is open to the border (or large) and stays open.
 */
function fillHoles(img, worn, maxFrac = 0.12) {
  const { W, H } = img; let area = 0; for (let p = 0; p < W * H; p++) if (img.d[p * 4 + 3] >= 24) area++;
  const holes = blobs(img, (p) => img.d[p * 4 + 3] < 24);
  let filled = 0;
  for (const b of holes) {
    if (b.x0 === 0 || b.y0 === 0 || b.x1 === W - 1 || b.y1 === H - 1) continue; // open to the border: background
    if (b.n > area * maxFrac) continue;                                          // a real opening (the face)
    for (const p of b.px) { const i = p * 4; if (worn.d[i + 3] >= 40) { img.d.set(worn.d.subarray(i, i + 4), i); filled++; } }
  }
  if (filled) console.log(`  filled ${filled} px of holes`);
  return img;
}

function dropSpecks(img, minFrac) {
  const bl = blobs(img, (p) => img.d[p * 4 + 3] >= 24); const big = bl.length ? bl[0].n : 0;
  for (const b of bl) if (b.n < big * minFrac) for (const p of b.px) img.d[p * 4 + 3] = 0;
  return img;
}

/**
 * Fit a worn outfit's BODY to the base body (owner 2026-11-10: an outfit must not change the
 * figure's height). After the head is aligned, the redraw's body may still be longer or shorter
 * than the base's (the first tunic ran 11 % long). Rows above the collar are copied; rows from the
 * collar to the redraw's lowest opaque row are resampled vertically onto collar .. the base's
 * lowest opaque row, so the feet land on the base's feet line. Widths are untouched: shoulders
 * and hands keep matching the head and the rig's boxes. Returns the image on the base's canvas.
 */
function fitBody(worn, base, body) {
  const collar = Math.round(rig[body].collar * S);
  const lowest = (img) => { for (let y = img.H - 1; y >= 0; y--) for (let x = 0; x < img.W; x++) if (img.d[(y * img.W + x) * 4 + 3] > 60) return y; return 0; };
  const wb = lowest(worn), bb = lowest(base);
  const out = blank(base.W, base.H);
  const k = (wb - collar) / (bb - collar); // source rows per output row below the collar
  for (let y = 0; y < base.H; y++) {
    const sy = y <= collar ? y : collar + (y - collar) * k;
    const y0 = Math.floor(sy), y1 = Math.min(worn.H - 1, y0 + 1), f = sy - y0;
    if (y0 >= worn.H) continue;
    for (let x = 0; x < base.W; x++) {
      const a = (y0 * worn.W + x) * 4, b2 = (y1 * worn.W + x) * 4, o = (y * base.W + x) * 4;
      const a0 = worn.d[a + 3], a1 = worn.d[b2 + 3]; const al = a0 * (1 - f) + a1 * f; if (al < 1) continue;
      // premultiplied blend of the two source rows
      for (let c = 0; c < 3; c++) out.d[o + c] = Math.round((worn.d[a + c] * a0 * (1 - f) + worn.d[b2 + c] * a1 * f) / al);
      out.d[o + 3] = Math.round(al);
    }
  }
  return { img: out, info: { collar, wornBottom: wb, baseBottom: bb, stretch: +(1 / k).toFixed(4) } };
}

const isSkin = (r, g, b) => { const [h, s, v] = hsv(r, g, b); return h >= 8 && h <= 42 && s >= 0.12 && s <= 0.62 && v >= 0.55; };

/** outfit -> cloth + skin (skin inside the rig's hand / foot boxes, neutralised toward white for multiply) */
function splitOutfit(img, body) {
  const b = rig[body]; const collar = Math.round(b.collar * S);
  const boxes = [b.handL, b.handR].concat(body === 'female' ? [b.footL, b.footR] : []);
  const inBox = (x, y) => { const fx = (x - FX) / S, fy = y / S; return boxes.some((bx) => bx && fx >= bx.x[0] - 6 && fx <= bx.x[1] + 6 && fy >= bx.y[0] - 6 && fy <= bx.y[1] + 6); };
  const cloth = blank(img.W, img.H), skin = blank(img.W, img.H); let n = 0;
  for (let y = collar; y < img.H; y++) for (let x = 0; x < img.W; x++) {
    const i = (y * img.W + x) * 4; if (img.d[i + 3] < 8) continue;
    // the skin layer keeps the base's own peach (NOT neutralised): the face part is that same
    // peach, so one skinTone multiplier lands both on the same colour; the lightest tone is #ffffff
    if (isSkin(img.d[i], img.d[i + 1], img.d[i + 2]) && inBox(x, y)) { skin.d.set(img.d.subarray(i, i + 4), i); n++; }
    else cloth.d.set(img.d.subarray(i, i + 4), i);
  }
  return { cloth, skin, n };
}

/** the blink layer: everything inside the (widened) eye boxes of a closed-eyes head crop */
function lidsLayer(img, body, crop = 2) {
  const b = rig[body]; const out = blank(img.W, img.H);
  const ew = b.eyeBox.w * 1.3, eh = b.eyeBox.h * 1.6;
  for (let y = 0; y < img.H; y++) for (let x = 0; x < img.W; x++) {
    const fx = x / crop, fy = y / crop; // head crop at 512: 1 frame unit = 2 px (the crop is the upper tile at 1.5x)
    if (b.eyesX.some((cx) => fx >= cx - ew / 2 && fx <= cx + ew / 2) && fy >= b.eyeLine - eh / 2 && fy <= b.eyeLine + eh / 2) { const i = (y * img.W + x) * 4; if (img.d[i + 3] > 40) out.d.set(img.d.subarray(i, i + 4), i); }
  }
  return out;
}

/**
 * The IRIS layer of a face (the eye colour, docs/avatar-plan.md v2): the eyes are painted into the
 * face, so the coloured ring around each pupil is lifted into its own layer, neutralised to grey
 * (its shading kept, the brightest iris pixel near white) for the eyeColor multiply; it draws over
 * the face. The pupils are found by findEyes (the rig's eye boxes sit a few units off on a base
 * body); the iris radius is the last ring around the pupil that is mostly iris-like: not
 * pupil-dark, not the white of the eye or the highlight, not skin.
 */
function irisLayer(img) {
  const { d, W, H } = img; const eyes = findEyes(img); if (!eyes) return null;
  const out = blank(W, H);
  const irisLike = (i) => {
    if (d[i + 3] < 200) return false;
    const [h, sat, v] = hsv(d[i], d[i + 1], d[i + 2]);
    if (v < 0.16 || (v < 0.30 && sat < 0.30)) return false; // the black pupil, the lash line (a dark blue or brown iris edge is darker than 0.30 but saturated)
    if (v > 0.85 && sat < 0.25) return false;         // the white of the eye, the highlight
    if (h >= 5 && h <= 50 && v >= 0.72) return false; // skin (a brown iris is darker than skin)
    return true;
  };
  const report = [];
  const radii = [];
  for (const e of eyes) {
    // the iris radius: grow rings from the pupil's edge while most of the ring is iris-like
    // (findEyes' dark blob can already include a dark iris edge, so the scan starts at the centre:
    // the largest ring, out to 2.4 blob radii, that is at least 45 % iris-like)
    let R = e.r;
    for (let r = 1; r <= e.r * 2.4; r += 0.5) {
      let n = 0, hit = 0;
      for (let a = 0; a < 48; a++) { const x = Math.round(e.x + Math.cos(a / 48 * 2 * Math.PI) * r), y = Math.round(e.y + Math.sin(a / 48 * 2 * Math.PI) * r); if (x < 0 || y < 0 || x >= W || y >= H) continue; n++; if (irisLike((y * W + x) * 4)) hit++; }
      if (n && hit / n >= 0.45) R = Math.max(R, r);
    }
    radii.push(R);
  }
  // both eyes are the same size: the far eye of a turned face is clipped by its outline and its
  // rings read short, so the larger radius serves both (never more than 1.6 pupil-blob radii)
  const Rmax = Math.max(...radii);
  for (const e of eyes) {
    const R = Math.min(Rmax, e.r * 1.6);
    const px = []; let vmax = 0;
    for (let y = Math.floor(e.y - R - 1); y <= e.y + R + 1; y++) for (let x = Math.floor(e.x - R - 1); x <= e.x + R + 1; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H || Math.hypot(x - e.x, y - e.y) > R + 0.5) continue;
      const i = (y * W + x) * 4; if (!irisLike(i)) continue;
      const v = hsv(d[i], d[i + 1], d[i + 2])[2]; px.push([i, v]); if (v > vmax) vmax = v;
    }
    // gamma 0.6 lifts the midtones: a painted iris is mostly mid-dark, and a plain multiply made every colour murky
    for (const [i, v] of px) { const g = Math.round(Math.pow(Math.min(1, v / (vmax || 1)), 0.6) * 250); out.d[i] = g; out.d[i + 1] = g; out.d[i + 2] = g; out.d[i + 3] = 255; }
    report.push({ x: Math.round(e.x), y: Math.round(e.y), pupil: +e.r.toFixed(1), iris: +R.toFixed(1), px: px.length });
  }
  console.log(JSON.stringify(report));
  return out;
}

/**
 * The BLINK frame of a face or a whole figure, made from the drawing itself (owner 2026-11-10: the
 * closed eye must match the skin tone). For each eye (findEyes): the skin colour is sampled from
 * the cheek just below it and the lid just above it; the eye (everything around the pupil that is
 * not that skin: the white, the iris, the pupil, the lash line) is flood-filled from the pupil
 * inside a box a little larger than the eye, repainted in the sampled skin (a vertical blend of the
 * lid and cheek samples, so the patch follows the face's own shading), and a closed-lid arc is
 * drawn across it in the eye's own lash colour. Because the lid IS the face's skin, it takes any
 * skin tint exactly as the face does, and it works on every figure without a second drawing.
 * Returns the whole image with the eyes closed, or null when no eyes are found (a mask, a hood).
 */
/**
 * The two EYES of a whole figure, for the blink (small eyes: a pupil of a dozen pixels, a white of
 * six). An eye is the one place on a face where near-white and near-black sit together, so the
 * candidates are the connected blobs of "extreme" pixels (the white of the eye and its highlight,
 * or the pupil and lash line) in the upper half that hold BOTH kinds, are eye-sized and compact;
 * the pair on one row, of similar size, nearest the head's centre line wins.
 * Returns [{x, y, r}, {x, y, r}] left to right (r = half the eye's larger side), or null.
 */
function findEyeRegions(img) {
  const { d, W, H } = img; const ymax = Math.floor(H * 0.5);
  const kind = new Uint8Array(W * H); // 1 = white, 2 = dark
  for (let p = 0; p < W * ymax; p++) {
    const i = p * 4; if (d[i + 3] < 200) continue;
    const [, sat, v] = hsv(d[i], d[i + 1], d[i + 2]);
    if (v > 0.72 && sat < 0.2) kind[p] = 1; else if (v < 0.3) kind[p] = 2;
  }
  const bl = blobs(img, (p) => kind[p] > 0);
  // the head's centre line: the opaque centre of the top third (a hat or a turn barely moves it)
  let sx = 0, n = 0; for (let y = 0; y < H / 3; y += 2) for (let x = 0; x < W; x += 2) if (d[(y * W + x) * 4 + 3] > 60) { sx += x; n++; }
  const headX = n ? sx / n : W / 2;
  const cands = [];
  for (const b of bl) {
    const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1;
    if (b.n < 14 || b.n > 1800 || w > W * 0.14 || h > W * 0.12 || w / h < 0.55 || w / h > 3.2) continue;
    let white = 0, dark = 0; for (const p of b.px) { if (kind[p] === 1) white++; else dark++; }
    if (white < 3 || dark < 5) continue;
    cands.push({ ...b, w, h, white, dark });
  }
  let best = null;
  for (let i = 0; i < cands.length; i++) for (let j = i + 1; j < cands.length; j++) {
    const a = cands[i], b = cands[j]; const dx = Math.abs(a.cx - b.cx), dy = Math.abs(a.cy - b.cy);
    if (dy > Math.max(a.h, b.h) * 0.6 || dx < W * 0.05 || dx > W * 0.3) continue;
    if (Math.min(a.n, b.n) < Math.max(a.n, b.n) * 0.25) continue;
    const mid = (a.cx + b.cx) / 2;
    const sc = (a.white + b.white) * 3 + (a.dark + b.dark) - Math.abs(mid - headX) * 4 - (a.cy + b.cy) * 0.2;
    if (!best || sc > best.sc) best = { sc, a, b };
  }
  if (!best) return null;
  const [l, r] = [best.a, best.b].sort((p, q) => p.cx - q.cx);
  const rr = (e) => Math.max(e.w, e.h) / 2;
  return [{ x: (l.x0 + l.x1) / 2, y: (l.y0 + l.y1) / 2, r: rr(l) }, { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2, r: rr(r) }];
}

/** fallback finder: two compact dark blobs (pupils) on one row, symmetric about the head's centre line */
function findPupilPair(img) {
  const { d, W, H } = img; const ymax = Math.floor(H * 0.5);
  const dark = (p) => { const i = p * 4; if (p >= ymax * W || d[i + 3] < 200) return false; return hsv(d[i], d[i + 1], d[i + 2])[2] < 0.3; };
  let sx = 0, n = 0; for (let y = 0; y < H / 3; y += 2) for (let x = 0; x < W; x += 2) if (d[(y * W + x) * 4 + 3] > 60) { sx += x; n++; }
  const headX = n ? sx / n : W / 2;
  const cands = blobs(img, dark).filter((b) => { const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1; return b.n >= 6 && b.n <= 260 && w / h >= 0.6 && w / h <= 1.7; }).slice(0, 80);
  let best = null;
  for (let i = 0; i < cands.length; i++) for (let j = i + 1; j < cands.length; j++) {
    const a = cands[i], b = cands[j]; const dx = Math.abs(a.cx - b.cx), dy = Math.abs(a.cy - b.cy);
    if (dy > 4 || dx < W * 0.06 || dx > W * 0.2) continue;
    if (Math.min(a.n, b.n) < Math.max(a.n, b.n) * 0.4) continue;
    const mid = (a.cx + b.cx) / 2; if (Math.abs(mid - headX) > W * 0.07) continue;
    const sc = a.n + b.n - Math.abs(mid - headX) * 3 - dy * 10;
    if (!best || sc > best.sc) best = { sc, a, b };
  }
  if (!best) return null;
  const [l, r] = [best.a, best.b].sort((p, q) => p.cx - q.cx);
  return [{ x: l.cx, y: l.cy }, { x: r.cx, y: r.cy }];
}

/**
 * The BLINK frame of a face or a whole figure, made from the drawing itself (owner 2026-11-10: the
 * closed eye must match the skin tone). The two eye centres come from findEyeRegions, else
 * findPupilPair, unless tools/art/blink-eyes.json places them by hand (`override`: a few figures). Each eye is then an ELLIPSE sized from the distance between the eyes (these
 * faces share one proportion: half-width 0.36 of the gap, half-height 0.30), painted in the skin
 * sampled from the cheek just below it, feathered at the rim so there is no seam, with a closed-lid
 * arc across it in the eye's own lash colour. Because the lid IS the face's skin, a tinted face
 * layer tints it exactly as it tints the face, and a whole figure needs no second drawing.
 * Returns the image with the eyes closed, or null when no eyes are found.
 */
function blinkFrame(img, override = null) {
  const { d, W, H } = img;
  const eyes = override ? override.eyes.map(([x, y]) => ({ x, y })) : (findEyeRegions(img) || findPupilPair(img) || findEyes(img));
  if (!eyes || !eyes.length) return null;
  const out = { d: Buffer.from(d), W, H };
  const at = (x, y) => (y * W + x) * 4;
  const median = (arr) => { const s2 = arr.slice().sort((p, q) => p - q); return s2[s2.length >> 1]; };
  const gap = eyes.length > 1 ? eyes[1].x - eyes[0].x : (override && override.gap) || 48;
  const k = (override && override.scale) || blinkFrame.scale || 1;
  // a little larger than the eye itself (0.36 / 0.30 of the gap): the first size left a rim of white or iris under the lid
  const rx = Math.max(6, Math.min(34, gap * 0.36 * k)), ry = Math.max(5, Math.min(28, gap * 0.30 * k));
  const report = [];
  for (const e of eyes) {
    // the skin, in two steps. The cheek just under the eye gives this face's skin colour (nothing but
    // skin is ever there: no hat brim, no brow, no hair). Then the RING around the eye (1.1 to 1.6
    // ellipse radii, all the way round) gives the local shade: only its pixels close to the cheek
    // colour count, so a shaded socket is matched but a hat, a brow or a grey beard is not.
    const med3 = (r, g, b) => (r.length ? [median(r), median(g), median(b)] : null);
    let cr = [], cg = [], cb = [];
    for (let y = Math.round(e.y + ry * 1.25); y <= e.y + ry * 2.1; y++) for (let x = Math.round(e.x - rx * 0.7); x <= e.x + rx * 0.7; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue; const i = at(x, y); if (d[i + 3] < 200) continue;
      const v = Math.max(d[i], d[i + 1], d[i + 2]) / 255; if (v < 0.3) continue;
      cr.push(d[i]); cg.push(d[i + 1]); cb.push(d[i + 2]);
    }
    const cheek = cr.length >= 8 ? med3(cr, cg, cb) : null;
    if (!cheek) continue;
    cr = []; cg = []; cb = [];
    for (let y = Math.floor(e.y - ry * 1.6); y <= e.y + ry * 1.6; y++) for (let x = Math.floor(e.x - rx * 1.6); x <= e.x + rx * 1.6; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const q = Math.sqrt(((x - e.x) / rx) ** 2 + ((y - e.y) / ry) ** 2); if (q < 1.1 || q > 1.6) continue;
      const i = at(x, y); if (d[i + 3] < 200) continue;
      if (Math.abs(d[i] - cheek[0]) + Math.abs(d[i + 1] - cheek[1]) + Math.abs(d[i + 2] - cheek[2]) > 90) continue;
      cr.push(d[i]); cg.push(d[i + 1]); cb.push(d[i + 2]);
    }
    const skin = cr.length >= 12 ? med3(cr, cg, cb) : cheek;
    // the lash colour: the darkest pixels inside the eye
    const lr = [], lg = [], lb = [];
    for (let y = Math.round(e.y - ry); y <= e.y + ry; y++) for (let x = Math.round(e.x - rx); x <= e.x + rx; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue; const i = at(x, y); if (d[i + 3] < 200) continue;
      const v = Math.max(d[i], d[i + 1], d[i + 2]) / 255; if (v < 0.36 && v > 0.06) { lr.push(d[i]); lg.push(d[i + 1]); lb.push(d[i + 2]); }
    }
    const lash = lr.length > 6 ? [median(lr), median(lg), median(lb)] : [70, 44, 34];
    // paint the ellipse in skin, feathered over the outer two pixels
    for (let y = Math.floor(e.y - ry - 1); y <= e.y + ry + 1; y++) for (let x = Math.floor(e.x - rx - 1); x <= e.x + rx + 1; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue; const i = at(x, y); if (d[i + 3] < 200) continue;
      const q = Math.sqrt(((x - e.x) / rx) ** 2 + ((y - e.y) / ry) ** 2); if (q > 1) continue;
      const a = Math.min(1, (1 - q) * Math.min(rx, ry) / 2);
      for (let c = 0; c < 3; c++) out.d[i + c] = Math.round(d[i + c] * (1 - a) + skin[c] * a);
    }
    // the closed lid: an arc from corner to corner, sagging in the middle, thinner toward the corners
    const half = rx * 0.82, yLine = e.y + ry * 0.12, sag = ry * 0.38, th = Math.max(1.4, ry * 0.17);
    for (let y = Math.floor(yLine - th - 1); y <= yLine + sag + th + 1; y++) for (let x = Math.floor(e.x - half - 1); x <= e.x + half + 1; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const u = (x - e.x) / half; if (Math.abs(u) > 1) continue;
      const yc = yLine + sag * (1 - u * u), taper = 0.5 + 0.5 * (1 - u * u);
      const a = Math.max(0, Math.min(1, th * taper / 2 + 0.5 - Math.abs(y - yc)));
      if (a <= 0) continue;
      const i = at(x, y); if (out.d[i + 3] < 200) continue;
      for (let c = 0; c < 3; c++) out.d[i + c] = Math.round(out.d[i + c] * (1 - a) + lash[c] * a);
    }
    report.push({ x: Math.round(e.x), y: Math.round(e.y) });
  }
  console.log(JSON.stringify({ eyes: report, rx: +rx.toFixed(1), ry: +ry.toFixed(1), by: override ? 'override' : 'found' }));
  return report.length === eyes.length ? out : null;
}

function tintImg(img, hex) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16); const out = { d: Buffer.from(img.d), W: img.W, H: img.H };
  for (let p = 0; p < img.W * img.H; p++) { const i = p * 4; if (!out.d[i + 3]) continue; out.d[i] = (out.d[i] * r) >> 8; out.d[i + 1] = (out.d[i + 1] * g) >> 8; out.d[i + 2] = (out.d[i + 2] * b) >> 8; }
  return out;
}

(async () => {
  switch (cmd) {
    case 'key': { const img = keyOut(await load(args.in), !!args.green); await save(img, args.out); break; }
    case 'align': { const { img, info } = await alignByEyes(args.worn, args.base, +(args.overflow || 0)); console.log(JSON.stringify(info)); if (!info.ok) process.exitCode = 2; await save(img, args.out); break; }
    case 'diff': { const worn = await load(args.worn), base = await load(args.base); const out = diffLayer(worn, base, { tol: +(args.tol || 48), rad: +(args.rad || 3), grey: !!args.grey, min: +(args.min || 0.01), open: +(args.open || 0), defringe: !!args.defringe, fill: !!args.fill, faceclear: args.faceclear || null }); await save(out, args.out); break; }
    case 'fitbody': { const worn = await load(args.worn), base = await load(args.base); const { img, info } = fitBody(worn, base, args.body || 'female'); console.log(JSON.stringify(info)); await save(img, args.out); break; }
    case 'split': { const img = await load(args.in); const { cloth, skin, n } = splitOutfit(img, args.body || 'female'); await save(cloth, args.out + '.cloth.png'); await save(skin, args.out + '.skin.png'); console.log(`skin px ${n}`); if (n < 50) console.log('  WARNING: almost no skin found inside the rig boxes (misaligned, or long sleeves and hidden hands)'); break; }
    case 'lids': { const img = await load(args.worn); const out = lidsLayer(img, args.body || 'female', +(args.crop || 2)); await save(out, args.out); break; }
    case 'blink': { // --name <figure>: its hand-placed eye centres from tools/art/blink-eyes.json, when it has an entry
      const table = JSON.parse(fs.readFileSync(path.join(__dirname, 'blink-eyes.json'), 'utf8'));
      const ov = args.name && table[args.name] && table[args.name].eyes ? table[args.name] : null;
      if (args.scale) blinkFrame.scale = +args.scale; // --scale 1.12: a larger lid for eyes found automatically (a stray lash dot outside the ellipse)
      const src = await load(args.in);
      const out = blinkFrame(src, ov); if (!out) { console.error('no eyes found: no blink frame'); process.exit(2); }
      if (args.layer) { // the lids LAYER of a face part: only what changed, the rest transparent
        for (let p = 0; p < out.W * out.H; p++) { const i = p * 4; if (out.d[i] === src.d[i] && out.d[i + 1] === src.d[i + 1] && out.d[i + 2] === src.d[i + 2]) out.d[i + 3] = 0; }
      }
      await save(out, args.out); break; }
    case 'iris': { const out = irisLayer(await load(args.in)); if (!out) { console.error('no eyes found'); process.exit(2); } await save(out, args.out); break; }
    case 'tint': { const img = await load(args.in); await save(tintImg(img, args.hex), args.out); break; }
    case 'compose': {
      const layers = []; for (const spec of rest) { const [file, hex] = spec.split('@'); const img = await load(file); layers.push(hex ? tintImg(img, hex) : img); }
      const W = layers[0].W, H = layers[0].H; const out = blank(W, H);
      for (const L of layers) for (let p = 0; p < W * H; p++) { const i = p * 4, a = L.d[i + 3] / 255; if (!a) continue; const oa = out.d[i + 3] / 255; const na = a + oa * (1 - a); for (let c = 0; c < 3; c++) out.d[i + c] = Math.round((L.d[i + c] * a + out.d[i + c] * oa * (1 - a)) / (na || 1)); out.d[i + 3] = Math.round(na * 255); }
      await save(out, args.out); break;
    }
    case 'headcrop': { // the face part: the figure above the collar, as the head crop frame (the upper tile at 1024)
      const b = rig[args.body || 'female']; const collar = Math.round(b.collar * S);
      await sharp(args.in).extract({ left: Math.round(FX), top: 0, width: Math.round(TILE), height: Math.round(TILE) }).composite([{ input: Buffer.from(`<svg width="${Math.round(TILE)}" height="${Math.round(TILE)}"><rect x="0" y="${collar}" width="${Math.round(TILE)}" height="${Math.round(TILE) - collar}" fill="black"/></svg>`), blend: 'dest-out' }]).resize(+(args.px || 1024), +(args.px || 1024)).png().toFile(args.out);
      break;
    }
    default: console.error('commands: key align diff fitbody split lids blink iris tint compose headcrop'); process.exit(1);
  }
})().catch((e) => { console.error(e); process.exit(1); });
