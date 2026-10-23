#!/usr/bin/env node
/**
 * Draw the guide images the generator sends with every request (docs/art-pipeline-plan.md §5):
 *
 *   guides/head.png            the avatar rig at 1024 px: female head contour, neck, bust, eye
 *                              line and hair band, filled pale so the model draws INSIDE it
 *   guides/tile.png            a 3 x 3 patch of the board grid with the centre tile highlighted:
 *                              a one-tile resource must sit inside that square
 *   guides/control-gertrude.png  today's Gertrude drawing, rasterised, for the redraw control
 *
 * Everything comes from tools/avatar/recipes/_body.json; run again after editing it.
 */
const fs = require('fs');
const path = require('path');
const { ROOT, GUIDES, sharp, readJSON, ensureDir, svgToPng } = require('./lib/common');

const body = readJSON(path.join(ROOT, 'tools', 'avatar', 'recipes', '_body.json'));
const PX = 1024;

async function headGuide() {
  const s = PX / body.frame; // rig units -> px
  const n = body.neck;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PX}" height="${PX}" viewBox="0 0 ${body.frame} ${body.frame}">
  <rect width="${body.frame}" height="${body.frame}" fill="#f6f1e6"/>
  <g stroke="#7a6a5a" stroke-width="${1.2 / s * 2}" fill="#f1dcc8">
    <path d="${body.bust}"/>
    <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}"/>
    <path d="${body.female.headRig}"/>
  </g>
  <g stroke="#b08a7a" stroke-width="${0.8 / s * 2}" stroke-dasharray="2 2" fill="none">
    <line x1="56" y1="${body.hairTop}" x2="200" y2="${body.hairTop}"/>
    <line x1="72" y1="${body.eyeLine}" x2="184" y2="${body.eyeLine}"/>
    <line x1="108" y1="${body.mouth}" x2="148" y2="${body.mouth}"/>
  </g>
  <circle cx="${body.eyesX[0]}" cy="${body.eyeLine}" r="2.4" fill="#b08a7a"/>
  <circle cx="${body.eyesX[1]}" cy="${body.eyeLine}" r="2.4" fill="#b08a7a"/>
</svg>`;
  return sharp(Buffer.from(svg), { density: 72 * s }).resize(PX, PX).png().toBuffer();
}

async function tileGuide() {
  const t = Math.floor(PX / 3);
  const cells = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const centre = r === 1 && c === 1;
    cells.push(`<rect x="${c * t}" y="${r * t}" width="${t}" height="${t}" fill="${centre ? '#f3e7b0' : '#8fb86a'}" stroke="#5b7a46" stroke-width="2"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PX}" height="${PX}"><rect width="${PX}" height="${PX}" fill="#8fb86a"/>${cells.join('')}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * The figure guide: the same 3 x 3 patch, the centre tile pale (the footprint: one tile
 * wide, feet on its bottom edge) and the lower half of the tile above it tinted (the
 * headroom: a character may rise half a tile above its own tile, no more).
 */
async function figureGuide() {
  const t = Math.floor(PX / 3);
  const cells = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const centre = r === 1 && c === 1;
    cells.push(`<rect x="${c * t}" y="${r * t}" width="${t}" height="${t}" fill="${centre ? '#f3e7b0' : '#8fb86a'}" stroke="#5b7a46" stroke-width="2"/>`);
  }
  const headroom = `<rect x="${t}" y="${t / 2}" width="${t}" height="${t / 2}" fill="#f8f1cf" stroke="none"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PX}" height="${PX}"><rect width="${PX}" height="${PX}" fill="#8fb86a"/>${cells.join('')}${headroom}<rect x="${t}" y="${t / 2}" width="${t}" height="${t * 1.5}" fill="none" stroke="#5b7a46" stroke-width="2" stroke-dasharray="8 6"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * The scene guide: a 4 x 4 patch with a 2 x 2 building footprint (the Farm House is
 * `size: 2` in resources.json) and, beside it, one figure footprint with its headroom band.
 */
async function sceneGuide() {
  const t = PX / 4;
  const cells = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    const house = c >= 1 && c <= 2 && r >= 1 && r <= 2;
    const figure = c === 3 && r === 2;
    cells.push(`<rect x="${c * t}" y="${r * t}" width="${t}" height="${t}" fill="${house ? '#e8d6a8' : figure ? '#f3e7b0' : '#8fb86a'}" stroke="#5b7a46" stroke-width="2"/>`);
  }
  const headroom = `<rect x="${3 * t}" y="${1.5 * t}" width="${t}" height="${t / 2}" fill="#f8f1cf"/><rect x="${3 * t}" y="${1.5 * t}" width="${t}" height="${1.5 * t}" fill="none" stroke="#5b7a46" stroke-width="2" stroke-dasharray="8 6"/>`;
  const houseBox = `<rect x="${t}" y="${t}" width="${2 * t}" height="${2 * t}" fill="none" stroke="#5b7a46" stroke-width="3"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PX}" height="${PX}"><rect width="${PX}" height="${PX}" fill="#8fb86a"/>${cells.join('')}${headroom}${houseBox}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** A building footprint of n x n tiles centred on a (n + 2) square patch of grass: the bible panel for a building alone. */
async function buildingGuide(n) {
  const cells = n + 2, t = PX / cells;
  const rects = [];
  for (let r = 0; r < cells; r++) for (let c = 0; c < cells; c++) {
    const inside = r >= 1 && r <= n && c >= 1 && c <= n;
    rects.push(`<rect x="${c * t}" y="${r * t}" width="${t}" height="${t}" fill="${inside ? '#e8d6a8' : '#8fb86a'}" stroke="#5b7a46" stroke-width="2"/>`);
  }
  const box = `<rect x="${t}" y="${t}" width="${n * t}" height="${n * t}" fill="none" stroke="#5b7a46" stroke-width="3"/>`;
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${PX}" height="${PX}"><rect width="${PX}" height="${PX}" fill="#8fb86a"/>${rects.join('')}${box}</svg>`)).png().toBuffer();
}

/**
 * The cut-out guide for a building: the same (n + 2) patch, but pure magenta (#ff00ff) with the
 * thin grid and the n x n box outlined, no tan fill. The model redraws an approved building on
 * it and tools/art/cutout.js keys the magenta out for the game's sprite.
 */
async function buildingCutGuide(n) {
  const cells = n + 2, t = PX / cells;
  const rects = [];
  for (let r = 0; r < cells; r++) for (let c = 0; c < cells; c++) rects.push(`<rect x="${c * t}" y="${r * t}" width="${t}" height="${t}" fill="#ff00ff" stroke="#c000c0" stroke-width="2"/>`);
  const box = `<rect x="${t}" y="${t}" width="${n * t}" height="${n * t}" fill="none" stroke="#5b4a6a" stroke-width="3"/>`;
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${PX}" height="${PX}"><rect width="${PX}" height="${PX}" fill="#ff00ff"/>${rects.join('')}${box}</svg>`)).png().toBuffer();
}

/**
 * The tree guide (slice B, buildings lane): the 3 x 3 patch with the centre tile pale (the
 * footprint: one tile wide, trunk base on its bottom edge) and the WHOLE tile above it tinted
 * (the headroom: a tree may rise one full tile above its own tile, so it stands two tiles
 * tall, taller than a character's one and a half). The dashed box is the 1 x 2 envelope.
 */
async function treeGuide() {
  const t = Math.floor(PX / 3);
  const cells = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const centre = r === 1 && c === 1;
    cells.push(`<rect x="${c * t}" y="${r * t}" width="${t}" height="${t}" fill="${centre ? '#f3e7b0' : '#8fb86a'}" stroke="#5b7a46" stroke-width="2"/>`);
  }
  const headroom = `<rect x="${t}" y="0" width="${t}" height="${t}" fill="#f8f1cf" stroke="#5b7a46" stroke-width="2"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PX}" height="${PX}"><rect width="${PX}" height="${PX}" fill="#8fb86a"/>${cells.join('')}${headroom}<rect x="${t}" y="2" width="${t}" height="${t * 2 - 2}" fill="none" stroke="#5b7a46" stroke-width="2" stroke-dasharray="8 6"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** An existing NPC drawing on the parchment, for the redraw controls and the character sources. */
async function control(file) {
  const png = await svgToPng(path.join(ROOT, 'game-client', 'public', 'assets', 'resources', file), 768);
  return sharp({ create: { width: PX, height: PX, channels: 4, background: '#f6f1e6' } }).composite([{ input: png, left: (PX - 768) / 2, top: (PX - 768) / 2 }]).png().toBuffer();
}

/**
 * Ground-tile guides (slice B, the TILES lane; docs/art/slice-b/tiles.md). Each is a 4 x 4
 * patch of tiles at 256 px per tile, so every cut tile lands on the atlas's 256 px slot.
 *   patch4.png   all sixteen cells the same pale fill: "fill every square with ONE ground type"
 *   edge4.png    the left two columns green, the right two tan: a straight grass-to-dirt edge
 */
async function patch4Guide() {
  const t = PX / 4;
  const cells = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    cells.push(`<rect x="${c * t}" y="${r * t}" width="${t}" height="${t}" fill="#f3e7b0" stroke="#5b7a46" stroke-width="2"/>`);
  }
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${PX}" height="${PX}"><rect width="${PX}" height="${PX}" fill="#f3e7b0"/>${cells.join('')}</svg>`)).png().toBuffer();
}

/**
 * Round 2 (tiles.md "Round 2"): the same 4 x 4 patch pre-filled with the TARGET colour of a
 * tile type (today's tileColors.js value), so the model paints its texture over the colour
 * the game already uses instead of inventing one (round 1's pale guide gave sand for dirt).
 *   patch4-<type>.png   dirt #c98f59, slate #97968b, cobble #acaa89, pavement #f5bf89, sand #e0ca24
 */
const PATCH4_COLOURS = { dirt: '#c98f59', slate: '#97968b', cobble: '#acaa89', pavement: '#f5bf89', sand: '#e0ca24', grass: '#82bb4d' };
async function patch4ColourGuide(fill) {
  const t = PX / 4;
  const cells = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    cells.push(`<rect x="${c * t}" y="${r * t}" width="${t}" height="${t}" fill="${fill}" stroke="#4a4036" stroke-width="2"/>`);
  }
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${PX}" height="${PX}"><rect width="${PX}" height="${PX}" fill="${fill}"/>${cells.join('')}</svg>`)).png().toBuffer();
}

async function edge4Guide() {
  const t = PX / 4;
  const cells = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    cells.push(`<rect x="${c * t}" y="${r * t}" width="${t}" height="${t}" fill="${c < 2 ? '#8fb86a' : '#d9b276'}" stroke="#5b7a46" stroke-width="2"/>`);
  }
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${PX}" height="${PX}"><rect width="${PX}" height="${PX}" fill="#8fb86a"/>${cells.join('')}</svg>`)).png().toBuffer();
}

/**
 * Edge-lip guides (docs/art/slice-b/tiles.md, the drawn lip): a 4 x 4 patch where one 2 x 2
 * quadrant is grass and the rest is pure magenta (#ff00ff, a mask colour the generator must
 * leave untouched), or the inverse. The grass is asked to overhang the boundary; keying the
 * magenta out leaves the lip with alpha. `pos` names the grass quadrant (tl, tr, bl, br);
 * `inverse` puts the magenta in that quadrant and grass everywhere else.
 */
async function lipGuide(pos, inverse) {
  const t = PX / 4;
  const inQuad = (r, c) => ({ tl: r < 2 && c < 2, tr: r < 2 && c >= 2, bl: r >= 2 && c < 2, br: r >= 2 && c >= 2 })[pos];
  const cells = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    const grass = inverse ? !inQuad(r, c) : inQuad(r, c);
    cells.push(`<rect x="${c * t}" y="${r * t}" width="${t}" height="${t}" fill="${grass ? '#78ac14' : '#ff00ff'}" stroke="#5b4a6a" stroke-width="2"/>`);
  }
  // the boundary itself, thick, so the model keeps it exactly on the grid
  const q = { tl: [[2, 0], [2, 2], [0, 2]], tr: [[2, 0], [2, 2], [4, 2]], bl: [[0, 2], [2, 2], [2, 4]], br: [[4, 2], [2, 2], [2, 4]] }[pos];
  const line = `<polyline points="${q.map(([x, y]) => `${x * t},${y * t}`).join(' ')}" fill="none" stroke="#2a1f33" stroke-width="6"/>`;
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${PX}" height="${PX}">${cells.join('')}${line}</svg>`)).png().toBuffer();
}

/** The island lip guides: a grass 2 x 2 in the centre of the 4 x 4 over magenta (every edge and convex corner in one panel), and the inverse (every concave corner). */
async function lipIslandGuide(inverse) {
  const t = PX / 4;
  const cells = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    const inIsland = r >= 1 && r <= 2 && c >= 1 && c <= 2;
    const grass = inverse ? !inIsland : inIsland;
    cells.push(`<rect x="${c * t}" y="${r * t}" width="${t}" height="${t}" fill="${grass ? '#78ac14' : '#ff00ff'}" stroke="#5b4a6a" stroke-width="2"/>`);
  }
  const line = `<rect x="${t}" y="${t}" width="${2 * t}" height="${2 * t}" fill="none" stroke="#2a1f33" stroke-width="6"/>`;
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${PX}" height="${PX}">${cells.join('')}${line}</svg>`)).png().toBuffer();
}

/**
 * The wall-junction guide: a 4 x 4 patch of pure magenta with the thin grid, and a dark
 * asterisk on cell (1,1) marking a centre post with eight spokes to the neighbouring cell
 * centres. The model draws a wall junction over it; tools/art/walls.js keys the magenta out
 * and cuts the post and the eight spokes from the centre cell.
 */
async function wallGuide(kind = 'all') {
  // the post at the panel's centre, spokes 1.75 cells long: a tile-long RUN can then be cut one
  // cell out along a spoke with no post and no end cap in it (tools/art/walls.js)
  const t = PX / 4, cx = 2 * t, cy = 2 * t, len = 1.75 * t;
  const cells = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) cells.push(`<rect x="${c * t}" y="${r * t}" width="${t}" height="${t}" fill="#ff00ff" stroke="#5b4a6a" stroke-width="2"/>`);
  // 'plus' = the four straight spokes, 'cross' = the four diagonals: spokes that do not overlap
  // each other near the post, so the cutter can separate them cleanly
  const all = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
  const dirs = kind === 'plus' ? all.filter(([x, y]) => x === 0 || y === 0) : kind === 'cross' ? all.filter(([x, y]) => x !== 0 && y !== 0) : all;
  const spokes = dirs.map(([dx, dy]) => `<line x1="${cx}" y1="${cy}" x2="${cx + dx * len}" y2="${cy + dy * len}" stroke="#2a1f33" stroke-width="10" stroke-linecap="round"/>`).join('');
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${PX}" height="${PX}">${cells.join('')}${spokes}<circle cx="${cx}" cy="${cy}" r="18" fill="#2a1f33"/></svg>`)).png().toBuffer();
}

async function main() {
  fs.writeFileSync(path.join(GUIDES, 'wall.png'), await wallGuide());
  fs.writeFileSync(path.join(GUIDES, 'wall-plus.png'), await wallGuide('plus'));
  fs.writeFileSync(path.join(GUIDES, 'lip-island.png'), await lipIslandGuide(false));
  fs.writeFileSync(path.join(GUIDES, 'lip-island-inv.png'), await lipIslandGuide(true));
  for (const pos of ['tl', 'tr', 'bl', 'br']) {
    fs.writeFileSync(path.join(GUIDES, `lip-${pos}.png`), await lipGuide(pos, false));
    fs.writeFileSync(path.join(GUIDES, `lip-${pos}-inv.png`), await lipGuide(pos, true));
  }
  ensureDir(GUIDES);
  fs.writeFileSync(path.join(GUIDES, 'head.png'), await headGuide());
  fs.writeFileSync(path.join(GUIDES, 'tile.png'), await tileGuide());
  fs.writeFileSync(path.join(GUIDES, 'figure.png'), await figureGuide());
  fs.writeFileSync(path.join(GUIDES, 'scene.png'), await sceneGuide());
  fs.writeFileSync(path.join(GUIDES, 'building2.png'), await buildingGuide(2));
  fs.writeFileSync(path.join(GUIDES, 'building3.png'), await buildingGuide(3));
  fs.writeFileSync(path.join(GUIDES, 'building3-cut.png'), await buildingCutGuide(3));
  fs.writeFileSync(path.join(GUIDES, 'building4.png'), await buildingGuide(4));
  fs.writeFileSync(path.join(GUIDES, 'building4-cut.png'), await buildingCutGuide(4));
  fs.writeFileSync(path.join(GUIDES, 'building1-cut.png'), await buildingCutGuide(1));
  fs.writeFileSync(path.join(GUIDES, 'building5.png'), await buildingGuide(5));
  fs.writeFileSync(path.join(GUIDES, 'building2-cut.png'), await buildingCutGuide(2));
  fs.writeFileSync(path.join(GUIDES, 'building5-cut.png'), await buildingCutGuide(5));
  fs.writeFileSync(path.join(GUIDES, 'patch4.png'), await patch4Guide());
  fs.writeFileSync(path.join(GUIDES, 'edge4.png'), await edge4Guide());
  for (const [type, hex] of Object.entries(PATCH4_COLOURS)) fs.writeFileSync(path.join(GUIDES, `patch4-${type}.png`), await patch4ColourGuide(hex));
  fs.writeFileSync(path.join(GUIDES, 'control-hotspur.png'), await control('npc-hotspur.svg'));
  fs.writeFileSync(path.join(GUIDES, 'control-pig.png'), await control('npc-pig.svg'));
  // slice B, buildings lane: the tree envelope and the "redraw this, keep its identity" controls
  fs.writeFileSync(path.join(GUIDES, 'tree.png'), await treeGuide());
  for (const [name, file] of [['dairy', 'dairy.svg'], ['mill', 'mill.svg'], ['warriors-den', 'warriors-den.svg'], ['oak-tree', 'oak-tree.svg'], ['pine-tree', 'pine-tree.svg']]) {
    fs.writeFileSync(path.join(GUIDES, `control-${name}.png`), await control(file));
  }
  // buildings lane, round 2: the 3 x 3 explorations (General Store, School, Bank; the Inn has no old drawing) and the Dead Tree
  for (const [name, file] of [['general-store', 'general-store.svg'], ['school', 'school.svg'], ['bank', 'bank.svg'], ['dead-tree', 'dead-tree.svg']]) {
    fs.writeFileSync(path.join(GUIDES, `control-${name}.png`), await control(file));
  }
  // buildings lane, round 3: the family test (Tudor: Academy, Laboratory, Courthouse; Castle: Armory; Cottage: Adventure Camp; Fantastical: Guild)
  for (const [name, file] of [['academy', 'academy.svg'], ['laboratory', 'laboratory.svg'], ['courthouse', 'town-hall.svg'], ['armory', 'armory.svg'], ['adventure-camp', 'adventure-camp.svg'], ['guild', 'guild.svg']]) {
    fs.writeFileSync(path.join(GUIDES, `control-${name}.png`), await control(file));
  }
  const gertrude = await svgToPng(path.join(ROOT, 'game-client', 'public', 'assets', 'resources', 'npc-gertrude.svg'), 768);
  // on the same parchment as the head guide so the model reads it as a drawing, not a sticker
  fs.writeFileSync(path.join(GUIDES, 'control-gertrude.png'), await sharp({ create: { width: PX, height: PX, channels: 4, background: '#f6f1e6' } }).composite([{ input: gertrude, left: (PX - 768) / 2, top: (PX - 768) / 2 }]).png().toBuffer());
  console.log('wrote', path.relative(ROOT, GUIDES) + '/{head,tile,figure,scene,building2,building3,tree,patch4,edge4,control-*}.png');
}

main().catch((e) => { console.error(e); process.exit(1); });
