#!/usr/bin/env node
/**
 * Cut the approved 4 x 4 ground panels into the game's base tiles
 * (docs/art/slice-b/tiles.md, the hybrid: raster base from the atlas, procedural corners).
 *
 *   node tools/art/tiles.js            cut every type in TYPES below
 *   node tools/art/tiles.js --types g,d
 *
 * For each type: the 1024 px panel is sixteen 256 px cells on the guide's grid; each cell is
 * cropped INSET by the drawn grid line (so the line never reaches the board) and resampled
 * to TILE_PX, written to game-client/public/assets/tiles/<type>-<i>.png. Pavement keeps its
 * seams: its slab joints lie exactly on the grid lines, so it is cut with no inset.
 * The manifest tiles.json records sources, counts and each type's mean colour, which
 * tileColors.js adopts so the flat colour (minimap, gridlines, fallbacks) matches the art.
 */
const fs = require('fs');
const path = require('path');
const { ROOT, CANDIDATES, sharp, ensureDir } = require('./lib/common');

const OUT = path.join(ROOT, 'game-client', 'public', 'assets', 'tiles');
const TILE_PX = 128;          // atlas slot for a tile (build-atlas.js TILE_CELL); 2x a 64 px desktop tile, 1.4x a 90 px phone tile
const CELL = 256;             // one guide cell in the 1024 px panel
const INSET = 6;              // the drawn grid line is 2 to 4 px wide; drop it and its anti-aliasing

// type letter (tileColors.js) -> approved panel, inset rule
const TYPES = {
  g: { src: 'slice-b-tiles/approved/openai--flatter-grass-7-2.png', inset: INSET, name: 'grass' }, // grass-2-1 redrawn in four one-change passes (owner, 2026-10-22): defined tufts + brighter specks; wider/sparser tufts; bigger, sparser flowers; tufts a shade darker + flowers toned to pale yellow-green
  d: { src: 'slice-b-tiles/approved/openai--flatter-dirt-2-1.png', inset: INSET, name: 'dirt' },
  n: { src: 'slice-b-tiles/approved/openai--flatter-sand-1.png', inset: INSET, name: 'sand' },
  s: { src: 'whimsical-tiles/approved/openai--painterly-slate-1.png', inset: INSET, name: 'slate' },
  x: { src: 'whimsical-tiles/approved/openai--painterly-cobble-4-2.png', inset: 4, name: 'cobblestone' }, // joints on the grid lines; a 4 px inset thins the boundary joint to the inner joints' width
  p: { src: 'whimsical-tiles/approved/openai--painterly-pavement-2-2.png', inset: 0, trim: 0, name: 'pavement' },
};

const args = process.argv.slice(2);
const only = args.includes('--types') ? args[args.indexOf('--types') + 1].split(',') : Object.keys(TYPES);

const hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

async function cutType(type, spec) {
  const src = path.join(CANDIDATES, spec.src);
  if (!fs.existsSync(src)) throw new Error(`missing approved panel for ${type}: ${spec.src}`);
  const img = sharp(src);
  const meta = await img.metadata();
  if (meta.width !== 1024 || meta.height !== 1024) throw new Error(`${spec.src} is ${meta.width}x${meta.height}, expected 1024`);
  const files = [];
  let sum = [0, 0, 0];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    const i = r * 4 + c;
    const left = c * CELL + spec.inset, top = r * CELL + spec.inset, w = CELL - 2 * spec.inset;
    const file = `${type}-${i}.png`;
    // resample to TILE_PX + 2 and drop the 1 px border: lanczos darkens the outermost row and
    // column by a couple of units, which read as a faint grid on the board
    // (pavement keeps its edge row: the joints on the cell boundary ARE its edge pixels, and
    // trimming them left every slab's outline stopping short of the tile edge on the board)
    const trim = spec.trim ?? 1;
    const buf = await sharp(src).extract({ left, top, width: w, height: w }).resize(TILE_PX + 2 * trim, TILE_PX + 2 * trim, { kernel: 'lanczos3' })
      .extract({ left: trim, top: trim, width: TILE_PX, height: TILE_PX }).png({ compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(path.join(OUT, file), buf);
    const { channels } = await sharp(buf).stats().then((s) => ({ channels: s.channels }));
    sum = sum.map((v, k) => v + channels[k].mean);
    files.push(file);
  }
  const mean = hex(sum[0] / 16, sum[1] / 16, sum[2] / 16);
  return { name: spec.name, source: spec.src, inset: spec.inset, count: files.length, px: TILE_PX, mean };
}

(async () => {
  ensureDir(OUT);
  const manifestPath = path.join(OUT, 'tiles.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { note: 'Cut by tools/art/tiles.js from the approved ground panels; one entry per tile type letter (UI/Styles/tileColors.js). The renderer uses tiles/<type>-<i>.png from the atlas when present and the procedural canvas otherwise.', types: {} };
  for (const type of only) {
    const spec = TYPES[type];
    if (!spec) { console.error(`no source for type "${type}"`); process.exit(1); }
    manifest.types[type] = await cutType(type, spec);
    console.log(`${type} ${spec.name}: 16 tiles, mean ${manifest.types[type].mean}`);
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`wrote ${path.relative(ROOT, OUT)}/ (${Object.keys(manifest.types).length} types). Next: npm run build:atlas in game-client, and update tileColors.js means if they moved.`);
})().catch((e) => { console.error(e.message); process.exit(1); });
