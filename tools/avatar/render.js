#!/usr/bin/env node
/**
 * Render an avatar spec to a PNG without the game (docs/avatar-plan.md §2.4): the same
 * layer resolution as the client (game-client/src/Avatar/avatarLook.js, required as ESM),
 * rasterised with sharp (game-client/node_modules). For checking parts as they are drawn.
 *
 *   node tools/avatar/render.js [--spec '{"skin":"skin-01",...}'] [--equip hand-sword-01]
 *                               [--armor top-01] [--gtype valley] [--blink] [--size 256]
 *                               [--out /path/file.png] [--sheet]
 *
 * --sheet renders a contact sheet: the default spec in every skin tone, every hair colour,
 * every eye colour, with and without the beard / hat, open and blink.
 */
const fs = require('fs');
const path = require('path');
const sharp = require(path.join(__dirname, '..', '..', 'game-client', 'node_modules', 'sharp'));
const look = require(path.join(__dirname, '..', '..', 'game-client', 'src', 'Avatar', 'avatarLook.js'));

const ROOT = path.resolve(__dirname, '..', '..');
const ASSETS = path.join(ROOT, 'game-client', 'public', 'assets', 'avatar');
const TUNING = path.join(ROOT, 'game-server', 'tuning');
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

function parseArgs(argv) {
  const out = { size: 256, blink: false, sheet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--spec') out.spec = JSON.parse(next());
    else if (a === '--equip') out.weaponHand = next();
    else if (a === '--armor') out.armorTop = next();
    else if (a === '--gtype') out.gtype = next();
    else if (a === '--size') out.size = Number(next());
    else if (a === '--out') out.out = next();
    else if (a === '--blink') out.blink = true;
    else if (a === '--sheet') out.sheet = true;
  }
  return out;
}

const hexToRgb = (hex) => { const n = parseInt(hex.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

/** Rasterise one part at `size` and multiply a tint in (alpha untouched). */
async function layerBuffer(src, tint, size) {
  const file = path.join(ASSETS, src);
  if (!fs.existsSync(file)) { console.warn(`  missing part: ${src}`); return null; }
  const base = sharp(file, { density: Math.ceil((72 * size) / 256) }).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha();
  if (!tint) return base.png().toBuffer();
  const { data, info } = await base.raw().toBuffer({ resolveWithObject: true });
  const [tr, tg, tb] = hexToRgb(tint);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = (data[i] * tr) / 255; data[i + 1] = (data[i + 1] * tg) / 255; data[i + 2] = (data[i + 2] * tb) / 255;
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

/** Compose a layer list into a PNG buffer. */
async function renderLayers(layers, size) {
  const buffers = (await Promise.all(layers.map((l) => layerBuffer(l.src, l.tint, size)))).filter(Boolean);
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(buffers.map((input) => ({ input, left: 0, top: 0 }))).png().toBuffer();
}

/** Tile PNG buffers of one size into a sheet with `cols` columns. */
async function contactSheet(buffers, size, cols) {
  const rows = Math.ceil(buffers.length / cols);
  return sharp({ create: { width: cols * size, height: rows * size, channels: 4, background: { r: 245, g: 245, b: 240, alpha: 1 } } })
    .composite(buffers.map((input, i) => ({ input, left: (i % cols) * size, top: Math.floor(i / cols) * size }))).png().toBuffer();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const data = { catalogue: readJson(path.join(TUNING, 'avatarParts.json')), palettes: readJson(path.join(TUNING, 'avatarPalettes.json')) };
  const base = look.defaultSpec(data.catalogue, data.palettes);
  const size = args.size;
  const out = args.out || path.join(ROOT, 'game-client', 'public', 'assets', 'avatar', '_lab', args.sheet ? 'sheet.png' : 'render.png');

  if (args.sheet) {
    const specs = [];
    for (const t of look.palette(data.palettes, 'skinTone')) specs.push({ ...base, skinTone: t.id });
    for (const h of look.palette(data.palettes, 'hairColor')) specs.push({ ...base, hairColor: h.id });
    for (const e of look.palette(data.palettes, 'eyeColor')) specs.push({ ...base, eyeColor: e.id });
    for (const p of look.partsInSlot(data.catalogue, 'facialHair')) specs.push({ ...base, facialHair: p.id });
    for (const p of look.partsInSlot(data.catalogue, 'hat')) specs.push({ ...base, hat: p.id });
    for (const p of look.partsInSlot(data.catalogue, 'hair')) specs.push({ ...base, hair: p.id });
    const buffers = [];
    for (const spec of specs) {
      const l = look.lookFor(spec, data, { weaponHand: args.weaponHand, armorTop: args.armorTop, gtype: args.gtype || 'valley' });
      buffers.push(await renderLayers(l.layers, size));
      if (l.blinkLayers) buffers.push(await renderLayers(l.blinkLayers, size));
    }
    fs.writeFileSync(out, await contactSheet(buffers, size, 8));
    console.log(`sheet: ${specs.length} looks (open + blink) -> ${out}`);
    return;
  }

  const spec = { ...base, ...(args.spec || {}) };
  const problems = look.validateSpec(spec, data.catalogue, data.palettes, { allowNpc: true, owned: data.catalogue.map((r) => r.id).concat(data.palettes.map((r) => r.id)) });
  if (problems.length) console.warn('spec problems:', problems);
  const l = look.lookFor(spec, data, { weaponHand: args.weaponHand, armorTop: args.armorTop, gtype: args.gtype || 'valley' });
  const layers = args.blink && l.blinkLayers ? l.blinkLayers : l.layers;
  console.log('layers:', layers.map((x) => `${x.src}${x.tint ? '@' + x.tint : ''}`).join(', '));
  fs.writeFileSync(out, await renderLayers(layers, size));
  console.log(`-> ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
