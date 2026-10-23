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
 *   avatar/      every file named in game-server/tuning/avatarParts.json   slot = 256 px
 *   tiles/       every .png in public/assets/tiles (tools/art/tiles.js cuts them from the
 *                approved ground panels; docs/art/slice-b/tiles.md)                slot = 144 px (frame 128, extruded 8 px into the gutter)
 *   edges/       every .png in public/assets/edges (tools/art/edges.js, the grass edge lip)  slot = 144 px
 *   walls/       every .png in public/assets/walls (tools/art/walls.js, wall and fence pieces)  slot = 144 px
 *   emoji/       every `symbol` in resources.json that has no `filename`, plus the PC state
 *                icons, rendered from Twemoji's SVGs (node_modules/@twemoji/svg, graphics
 *                CC-BY 4.0, see public/assets/atlas/README.txt) so every platform shows the
 *                same art and the world layer never needs a PIXI.Text. Frame name =
 *                src/Utils/emojiKey.js. slot = 128 px for size-1 symbols, 256 up to size 3,
 *                512 up to size 8, 768 beyond (the 20-tile mountain).
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
const { emojiKey, looksLikeEmoji } = require('../src/Utils/emojiKey.js'); // ESM; Node >= 22.12

const TWEMOJI_DIR = path.join(__dirname, '..', 'node_modules', '@twemoji', 'svg');
// Icons PixiRendererPCs draws for player state (getDisplayIcon) that have no SVG of their own
const PC_STATE_EMOJI = ['💀', '🤢', '🏕️', '🛶', '🧑'];

const CLIENT_ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(CLIENT_ROOT, 'public', 'assets');
const OUT_DIR = path.join(PUBLIC, 'atlas');
const RESOURCES_JSON = path.resolve(CLIENT_ROOT, '..', 'game-server', 'tuning', 'resources.json');
const PLAYER_ICONS_JSON = path.join(CLIENT_ROOT, 'src', 'Authentication', 'PlayerIcons.json');
const AVATAR_PARTS_JSON = path.resolve(CLIENT_ROOT, '..', 'game-server', 'tuning', 'avatarParts.json');

const SHEET_SIZE = 2048;
const PADDING = 2;                 // transparent gutter inside each slot (stops linear-filter bleed)
const BASE_CELL = 256;             // one tile's worth of art, enough for DPR 2 at the "closer" zoom (75 px)
const OVERLAY_CELL = 128;
const TILE_PX = 128;               // a ground tile's art: 2x a desktop tile, 1.4x a 2x-phone tile; the renderer copies the frame 1:1
const TILE_PAD = 8;                // ground frames are extruded this far into their gutter (lossy WebP blends a frame edge with transparency for several px)
const TILE_CELL = TILE_PX + 2 * TILE_PAD;
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
    const size = Math.max(1, Math.min(5, Number(r.size) || 1));
    const cell = slotForSize(size);
    // the row's file plus its cosmetic variants (`artVariants`: "file=weight;file=weight", Utils/artVariants.js)
    const files = [r.filename, ...String(r.artVariants || '').split(';').map((p) => p.split('=')[0].trim())].filter(Boolean);
    for (const file of files) {
      const prev = seen.get(file);
      // The same file can back several resource types; keep the largest cell it needs
      if (!prev || prev.cell < cell) seen.set(file, { cell });
    }
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

const emojiSlotForSize = (size) => (size > 8 ? 768 : size > 3 ? 512 : size > 1 ? 256 : 128);

/** Every emoji the world layer can draw, each at the largest slot any resource using it needs. */
function listEmojiSources() {
  const raw = readJson(RESOURCES_JSON);
  const list = Array.isArray(raw) ? raw : (raw.resources || Object.values(raw));
  const wanted = new Map(); // symbol -> max size
  for (const r of list) {
    if (r.filename || !looksLikeEmoji(r.symbol)) continue;
    const size = Math.max(1, Number(r.size) || 1);
    wanted.set(r.symbol, Math.max(wanted.get(r.symbol) || 1, size));
  }
  for (const e of PC_STATE_EMOJI) if (!wanted.has(e)) wanted.set(e, 1);

  const items = [];
  const missing = [];
  for (const [symbol, size] of wanted) {
    const key = emojiKey(symbol);
    if (!key) continue;
    let src = path.join(TWEMOJI_DIR, `${key}.svg`);
    if (!fs.existsSync(src)) {
      // Twemoji sometimes keeps or drops FE0F differently from the input; try both spellings
      const alt = key.includes('fe0f') ? key.replace(/-fe0f/g, '') : null;
      const altSrc = alt ? path.join(TWEMOJI_DIR, `${alt}.svg`) : null;
      if (altSrc && fs.existsSync(altSrc)) src = altSrc;
      else { missing.push(`${symbol} (${key})`); continue; }
    }
    items.push({ key: `emoji/${key}`, src, cell: emojiSlotForSize(size) });
  }
  if (missing.length) {
    console.warn(`Twemoji has no SVG for ${missing.length} symbol(s); the renderer will keep drawing these as text:\n  ${missing.join('\n  ')}`);
  }
  return items;
}

/** Every avatar part file (docs/avatar-plan.md §2.3): `avatar/<folder>/<file>`, one bust-sized slot each. */
function listAvatarSources() {
  if (!fs.existsSync(AVATAR_PARTS_JSON)) return [];
  const rows = readJson(AVATAR_PARTS_JSON);
  const folderFor = (slot, which) => (slot === 'hair' ? (which === 'backFile' ? 'hairBack' : 'hairFront') : slot);
  const seen = new Map();
  for (const r of rows) {
    if (!r || !r.slot) continue;
    for (const which of ['file', 'fileMale', 'file2', 'backFile', 'underHat', 'blinkFile']) {
      if (!r[which]) continue;
      const rel = `${folderFor(r.slot, which)}/${r[which]}`;
      if (!seen.has(rel)) seen.set(rel, { key: `avatar/${rel}`, src: path.join(PUBLIC, 'avatar', rel), cell: BASE_CELL });
    }
  }
  return [...seen.values()];
}

/** The cut ground tiles (PNG, already raster): `tiles/<type>-<i>.png`. */
function listTileSources() {
  const dir = path.join(PUBLIC, 'tiles');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.png')).map((file) => ({
    key: `tiles/${file}`,
    src: path.join(dir, file),
    cell: TILE_CELL,
    pad: TILE_PAD,
  }));
}

/** The grass edge-lip pieces (PNG with alpha): `edges/<type>-<piece>.png` (tools/art/edges.js). */
function listEdgeSources() {
  const dir = path.join(PUBLIC, 'edges');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.png')).map((file) => ({
    key: `edges/${file}`,
    src: path.join(dir, file),
    cell: TILE_CELL,
    pad: TILE_PAD,
  }));
}

/** The wall and fence autotile pieces (PNG with alpha): `walls/<set>-<piece>.png` (tools/art/walls.js). */
function listWallSources() {
  const dir = path.join(PUBLIC, 'walls');
  if (!fs.existsSync(dir)) return [];
  // a set's pieces may be 192 px (a 1.5-tile wall); the cell follows the file's own size
  return fs.readdirSync(dir).filter((f) => f.endsWith('.png')).map((file) => {
    const src = path.join(dir, file);
    const buf = fs.readFileSync(src);
    const px = buf.length > 24 && buf.toString('ascii', 12, 16) === 'IHDR' ? buf.readUInt32BE(16) : TILE_PX;
    return { key: `walls/${file}`, src, cell: px + 2 * TILE_PAD, pad: TILE_PAD };
  });
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

/** Rasterise one SVG (or resample one PNG) into a transparent px x px PNG buffer (aspect preserved, centred). */
async function rasterise(src, px) {
  if (src.endsWith('.png')) {
    return sharp(src).resize(px, px, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  }
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
    const pad = item.pad ?? PADDING;
    sheet.frames.push({
      ...item,
      pad,
      x: sheet.x + pad,
      y: sheet.y + pad,
      px: item.cell - 2 * pad,
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
  h.update(`v8:${SHEET_SIZE}:${PADDING}:${BASE_CELL}:${OVERLAY_CELL}:${TILE_CELL}:${TILE_PAD}`);
  return h.digest('hex');
}

async function main() {
  const items = [...listResourceSources(), ...listPlayerIconSources(), ...listAvatarSources(), ...listOverlaySources(), ...listTileSources(), ...listEdgeSources(), ...listWallSources(), ...listEmojiSources()];
  const missing = items.filter((i) => !fs.existsSync(i.src));
  if (missing.length) {
    console.error(`Referenced art not on disk:\n  ${missing.map((m) => m.key).join('\n  ')}`);
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

  console.log(`Rasterising ${items.length} sources...`);
  const t0 = Date.now();
  const sheets = pack(items);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const f of fs.readdirSync(OUT_DIR)) if (/^world-\d+\.(png|webp|json)$/.test(f)) fs.unlinkSync(path.join(OUT_DIR, f));

  const manifest = { version: 1, sourceHash: hash, sheetSize: SHEET_SIZE, sheets: [], frames: {} };

  for (const sheet of sheets) {
    const composites = [];
    for (const frame of sheet.frames) {
      const buf = await rasterise(frame.src, frame.px);
      if (frame.key.startsWith('tiles/') || frame.key.startsWith('edges/') || frame.key.startsWith('walls/')) {
        // Ground art fills its frame edge to edge, and the lossy WebP sheet blends every frame
        // edge with the transparent gutter around it (a 10% brighter rim on each tile, a grid on
        // the board). Extrude the edge pixels into the gutter so there is no boundary to blend.
        const pad = frame.pad;
        const extruded = await sharp(buf).extend({ top: pad, bottom: pad, left: pad, right: pad, extendWith: 'copy' }).png().toBuffer();
        composites.push({ input: extruded, left: frame.x - pad, top: frame.y - pad });
      } else {
        composites.push({ input: buf, left: frame.x, top: frame.y });
      }
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
