#!/usr/bin/env node
/**
 * build-atlas.js: pre-rasterise the game's SVG art into sprite sheets.
 *
 * Why: the client used to fetch every SVG (48 MB of path data, factory.svg alone is
 * 2.7 MB), parse it with DOMParser and rasterise it on the main thread, one texture per
 * file. See docs/audits/client-review-2026-10-03.md §2.3 and §2.5 A. This script does
 * that work once, at build time, and writes a few 2048 px sheets plus Pixi spritesheet
 * JSON. The runtime (src/Render/PixiRenderer/AtlasTextures.js) looks frames up by
 * `<namespace>/<filename>` and still falls back to the live SVG when a frame is missing,
 * so new art works before the atlas is rebuilt.
 *
 * Sources
 *   resources/   every `filename` in game-server/tuning/resources.json
 *                slot = 256 px for size 1, 512 px for size 2-3, 768 px for size 4-5
 *                (a size-5 building is 375 CSS px at the closest zoom, 750 px on a 2x screen)
 *   playerIcons/ every `filename` in src/Authentication/PlayerIcons.json   slot = 256 px
 *   overlays/    every .svg in public/assets/overlays                      slot = 128 px
 * The 2 px transparent gutter lives INSIDE each slot (frame = slot - 4), so slots tile the
 * 2048 px sheet exactly and a shelf of 768s still has room for a 512 at its end.
 *
 * Output (committed; Render's `npm run build` does not run this)
 *   public/assets/atlas/world-N.png, world-N.webp   the sheets
 *   public/assets/atlas/world-N.json                Pixi spritesheet JSON per sheet
 *   public/assets/atlas/world.json                  manifest: sheets, frame -> sheet index, source hash
 *
 * Usage
 *   node scripts/build-atlas.js            build (skips when nothing changed)
 *   node scripts/build-atlas.js --force    rebuild
 *   node scripts/build-atlas.js --check    exit 1 if any referenced SVG has no frame or is newer than the atlas
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const CLIENT_ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(CLIENT_ROOT, 'public', 'assets');
const OUT_DIR = path.join(PUBLIC, 'atlas');
const RESOURCES_JSON = path.resolve(CLIENT_ROOT, '..', 'game-server', 'tuning', 'resources.json');
const PLAYER_ICONS_JSON = path.join(CLIENT_ROOT, 'src', 'Authentication', 'PlayerIcons.json');

const SHEET_SIZE = 2048;
const PADDING = 2;                 // transparent gutter inside each slot (stops linear-filter bleed)
const BASE_CELL = 256;             // one tile's worth of art, enough for DPR 2 at the "closer" zoom (75 px)
const OVERLAY_CELL = 128;
const slotForSize = (size) => (size >= 4 ? 768 : size >= 2 ? 512 : BASE_CELL);
const WEBP_QUALITY = 90;

const args = new Set(process.argv.slice(2));
const FORCE = args.has('--force');
const CHECK = args.has('--check');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function listResourceSources() {
  const raw = readJson(RESOURCES_JSON);
  const list = Array.isArray(raw) ? raw : (raw.resources || Object.values(raw));
  const seen = new Map();
  for (const r of list) {
    if (!r.filename) continue;
    const size = Math.max(1, Math.min(5, Number(r.size) || 1));
    const cell = slotForSize(size);
    const prev = seen.get(r.filename);
    // The same file can back several resource types; keep the largest cell it needs
    if (!prev || prev.cell < cell) seen.set(r.filename, { cell });
  }
  return [...seen.entries()].map(([file, { cell }]) => ({
    key: `resources/${file}`,
    src: path.join(PUBLIC, 'resources', file),
    cell,
  }));
}

function listPlayerIconSources() {
  const data = readJson(PLAYER_ICONS_JSON);
  const files = new Set();
  for (const tier of Object.values(data)) {
    for (const icon of tier || []) if (icon.filename) files.add(icon.filename);
  }
  return [...files].map((file) => ({
    key: `playerIcons/${file}`,
    src: path.join(PUBLIC, 'playerIcons', file),
    cell: BASE_CELL,
  }));
}

function listOverlaySources() {
  const dir = path.join(PUBLIC, 'overlays');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).map((file) => ({
    key: `overlays/${file}`,
    src: path.join(dir, file),
    cell: OVERLAY_CELL,
  }));
}

/** Intrinsic SVG size so we can pick a density that renders at >= the target cell. */
function svgIntrinsicSize(svgText) {
  const vb = svgText.match(/viewBox\s*=\s*["']\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)/i);
  if (vb) return { w: parseFloat(vb[3]), h: parseFloat(vb[4]) };
  const w = svgText.match(/<svg[^>]*\swidth\s*=\s*["']([\d.]+)/i);
  const h = svgText.match(/<svg[^>]*\sheight\s*=\s*["']([\d.]+)/i);
  if (w && h) return { w: parseFloat(w[1]), h: parseFloat(h[1]) };
  return { w: 100, h: 100 };
}

/** Rasterise one SVG into a transparent px x px PNG buffer (aspect preserved, centred). */
async function rasterise(src, px) {
  const svgText = fs.readFileSync(src, 'utf8');
  const { w, h } = svgIntrinsicSize(svgText);
  const longest = Math.max(w, h, 1);
  // librsvg renders at 72 dpi by default; scale so the longest side lands on the frame
  const density = Math.min(2400, Math.max(72, Math.ceil((72 * px) / longest)));
  return sharp(Buffer.from(svgText), { density })
    .resize(px, px, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

/**
 * Shelf packer over slots. Items are sorted by slot size descending; a shelf's height is
 * its first (largest) slot and smaller slots fill the remaining width. Frame = slot inset
 * by PADDING on every side.
 */
function pack(items) {
  const sorted = [...items].sort((a, b) => b.cell - a.cell || a.key.localeCompare(b.key));
  const sheets = [];
  let sheet = null;
  const newSheet = () => {
    sheet = { index: sheets.length, x: 0, y: 0, shelfH: 0, frames: [] };
    sheets.push(sheet);
  };
  newSheet();
  for (const item of sorted) {
    if (sheet.x + item.cell > SHEET_SIZE) {
      sheet.x = 0;
      sheet.y += sheet.shelfH;
      sheet.shelfH = 0;
    }
    if (sheet.y + item.cell > SHEET_SIZE) {
      newSheet();
    }
    sheet.frames.push({
      ...item,
      x: sheet.x + PADDING,
      y: sheet.y + PADDING,
      px: item.cell - 2 * PADDING,
    });
    sheet.x += item.cell;
    sheet.shelfH = Math.max(sheet.shelfH, item.cell);
  }
  return sheets;
}

function sourceHash(items) {
  const h = crypto.createHash('sha1');
  for (const item of [...items].sort((a, b) => a.key.localeCompare(b.key))) {
    const stat = fs.statSync(item.src);
    h.update(`${item.key}:${item.cell}:${stat.size}:${Math.floor(stat.mtimeMs)}\n`);
  }
  h.update(`v2:${SHEET_SIZE}:${PADDING}:${BASE_CELL}:${OVERLAY_CELL}`);
  return h.digest('hex');
}

async function main() {
  const items = [...listResourceSources(), ...listPlayerIconSources(), ...listOverlaySources()];
  const missing = items.filter((i) => !fs.existsSync(i.src));
  if (missing.length) {
    console.error(`Referenced SVGs not on disk:\n  ${missing.map((m) => m.key).join('\n  ')}`);
    process.exit(1);
  }

  const hash = sourceHash(items);
  const manifestPath = path.join(OUT_DIR, 'world.json');
  const existing = fs.existsSync(manifestPath) ? readJson(manifestPath) : null;

  if (CHECK) {
    if (!existing) { console.error('No atlas built. Run: npm run build:atlas'); process.exit(1); }
    const stale = existing.sourceHash !== hash;
    const absent = items.filter((i) => !(i.key in existing.frames));
    if (absent.length) console.error(`Frames missing from atlas:\n  ${absent.map((a) => a.key).join('\n  ')}`);
    if (stale) console.error('Atlas is older than its SVG sources. Run: npm run build:atlas');
    process.exit(stale || absent.length ? 1 : 0);
  }

  if (!FORCE && existing && existing.sourceHash === hash) {
    console.log(`Atlas up to date (${existing.sheets.length} sheets, ${Object.keys(existing.frames).length} frames).`);
    return;
  }

  console.log(`Rasterising ${items.length} SVGs...`);
  const t0 = Date.now();
  const sheets = pack(items);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const f of fs.readdirSync(OUT_DIR)) if (/^world-\d+\.(png|webp|json)$/.test(f)) fs.unlinkSync(path.join(OUT_DIR, f));

  const manifest = { version: 1, sourceHash: hash, sheetSize: SHEET_SIZE, sheets: [], frames: {} };

  for (const sheet of sheets) {
    const composites = [];
    for (const frame of sheet.frames) {
      const buf = await rasterise(frame.src, frame.px);
      composites.push({ input: buf, left: frame.x, top: frame.y });
      manifest.frames[frame.key] = sheet.index;
    }
    const base = sharp({
      create: { width: SHEET_SIZE, height: SHEET_SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).composite(composites);
    const pngName = `world-${sheet.index}.png`;
    const webpName = `world-${sheet.index}.webp`;
    const jsonName = `world-${sheet.index}.json`;
    const png = await base.clone().png({ compressionLevel: 9, palette: false }).toBuffer();
    fs.writeFileSync(path.join(OUT_DIR, pngName), png);
    const webp = await sharp(png).webp({ quality: WEBP_QUALITY, alphaQuality: 100, effort: 6 }).toBuffer();
    fs.writeFileSync(path.join(OUT_DIR, webpName), webp);

    // Pixi 7 spritesheet JSON (TexturePacker "hash" format)
    const frames = {};
    for (const frame of sheet.frames) {
      frames[frame.key] = {
        frame: { x: frame.x, y: frame.y, w: frame.px, h: frame.px },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: frame.px, h: frame.px },
        sourceSize: { w: frame.px, h: frame.px },
      };
    }
    const sheetJson = {
      frames,
      meta: { app: 'vvgame build-atlas', version: '1', image: pngName, format: 'RGBA8888', size: { w: SHEET_SIZE, h: SHEET_SIZE }, scale: '1' },
    };
    fs.writeFileSync(path.join(OUT_DIR, jsonName), JSON.stringify(sheetJson));
    manifest.sheets.push({ json: jsonName, png: pngName, webp: webpName, frames: sheet.frames.length });
    console.log(`  ${pngName}: ${sheet.frames.length} frames, png ${(png.length / 1024).toFixed(0)} KB, webp ${(webp.length / 1024).toFixed(0)} KB`);
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${sheets.length} sheets, ${items.length} frames -> ${path.relative(CLIENT_ROOT, OUT_DIR)}/`);
}

main().catch((err) => { console.error(err); process.exit(1); });
