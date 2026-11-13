#!/usr/bin/env node
/**
 * weaponfit: cut a generated weapon (upright on magenta, tools/art/jobs/weapons-*.json) to the
 * weapon footprint the avatar's hand expects (game-client heldWeapon.js, docs/equipment-plan.md).
 *
 * Every held weapon is drawn at ONE scale (heldWeapon.PX_PER_TILE canvas px to a board tile), upright,
 * point or head up, with the middle of where the hand holds it at the category's grip point. So this
 * keys the magenta out, scales the drawing to the length it should have on the board, and places it
 * with its shaft on the grip's column and the hold point on the grip's row.
 *
 *   node tools/art/weaponfit.js --in <candidate png> --out <game-client/public/assets/avatar/hand/x.png>
 *        --canvas 128x512      the category's canvas (heldWeapon.WEAPON_CLASSES `size`)
 *        --grip 64,448         where the hand holds it, canvas px (the category's `grip`)
 *        --length 440          the weapon's whole length on the canvas, px (426.67 px = one tile)
 *        --hold 0.14           where along the weapon the hand holds it: 0 its butt, 1 its point
 */
const fs = require('fs');
const path = require('path');
const { sharp } = require('./lib/common');
const { keyMagenta } = require('./lib/key');

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : null)).filter(Boolean));
for (const k of ['in', 'out', 'canvas', 'grip', 'length', 'hold']) if (args[k] === undefined) { console.error(`need --${k}`); process.exit(1); }
const [CW, CH] = String(args.canvas).split('x').map(Number);
const [GX, GY] = String(args.grip).split(',').map(Number);
const LENGTH = Number(args.length), HOLD = Number(args.hold);

(async () => {
  // steel is grey: never drop low-saturation pixels; only the magenta that touches the border is background
  const keyed = await keyMagenta(fs.readFileSync(path.resolve(args.in)), { dropGrey: false, flood: true });
  const { data, info } = await sharp(keyed).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, solid = (x, y) => data[(y * W + x) * 4 + 3] > 40;
  let top = H, bottom = -1, left = W, right = -1;
  const rows = [];
  for (let y = 0; y < H; y++) {
    let a = -1, b = -1;
    for (let x = 0; x < W; x++) if (solid(x, y)) { if (a < 0) a = x; b = x; }
    if (a < 0) continue;
    rows.push({ y, a, b });
    top = Math.min(top, y); bottom = Math.max(bottom, y); left = Math.min(left, a); right = Math.max(right, b);
  }
  if (bottom < 0) throw new Error('nothing but magenta in the drawing');
  // the shaft's column: the middle of the NARROWEST rows (the haft or the blade, never a head or a guard)
  const widths = rows.map((r) => r.b - r.a).sort((p, q) => p - q), narrow = widths[Math.floor(widths.length * 0.25)];
  const mids = rows.filter((r) => r.b - r.a <= narrow * 1.3).map((r) => (r.a + r.b) / 2).sort((p, q) => p - q);
  const shaft = mids[Math.floor(mids.length / 2)];
  const scale = LENGTH / (bottom - top + 1);
  const w = Math.max(1, Math.round((right - left + 1) * scale)), h = Math.round(LENGTH);
  const art = await sharp(keyed).extract({ left, top, width: right - left + 1, height: bottom - top + 1 }).resize(w, h, { kernel: 'lanczos3' }).png().toBuffer();
  const x = Math.round(GX - (shaft - left) * scale), y = Math.round(GY + HOLD * LENGTH - h); // its butt sits HOLD of its length below the grip
  if (x < 0 || y < 0 || x + w > CW || y + h > CH) throw new Error(`the weapon (${w} x ${h} at ${x}, ${y}) does not fit the ${CW} x ${CH} canvas: change --canvas, --grip, --length or --hold`);
  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  await sharp({ create: { width: CW, height: CH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: art, left: x, top: y }]).png().toFile(path.resolve(args.out));
  console.log(`wrote ${args.out}: ${w} x ${h} px drawn at (${x}, ${y}) on ${CW} x ${CH}; shaft on x ${GX}, hold point on y ${GY}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
