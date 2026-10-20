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

/** An existing NPC drawing on the parchment, for the redraw controls and the character sources. */
async function control(file) {
  const png = await svgToPng(path.join(ROOT, 'game-client', 'public', 'assets', 'resources', file), 768);
  return sharp({ create: { width: PX, height: PX, channels: 4, background: '#f6f1e6' } }).composite([{ input: png, left: (PX - 768) / 2, top: (PX - 768) / 2 }]).png().toBuffer();
}

async function main() {
  ensureDir(GUIDES);
  fs.writeFileSync(path.join(GUIDES, 'head.png'), await headGuide());
  fs.writeFileSync(path.join(GUIDES, 'tile.png'), await tileGuide());
  fs.writeFileSync(path.join(GUIDES, 'figure.png'), await figureGuide());
  fs.writeFileSync(path.join(GUIDES, 'scene.png'), await sceneGuide());
  fs.writeFileSync(path.join(GUIDES, 'control-hotspur.png'), await control('npc-hotspur.svg'));
  const gertrude = await svgToPng(path.join(ROOT, 'game-client', 'public', 'assets', 'resources', 'npc-gertrude.svg'), 768);
  // on the same parchment as the head guide so the model reads it as a drawing, not a sticker
  fs.writeFileSync(path.join(GUIDES, 'control-gertrude.png'), await sharp({ create: { width: PX, height: PX, channels: 4, background: '#f6f1e6' } }).composite([{ input: gertrude, left: (PX - 768) / 2, top: (PX - 768) / 2 }]).png().toBuffer());
  console.log('wrote', path.relative(ROOT, GUIDES) + '/{head,tile,control-gertrude}.png');
}

main().catch((e) => { console.error(e); process.exit(1); });
