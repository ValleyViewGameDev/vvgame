#!/usr/bin/env node
/**
 * The figure rig's drawing tools (docs/avatar-plan.md v2 §3; the rig is figure-rig.json):
 *
 *   --overlay --in <dir> [--out <dir>] [--body female|male|auto]
 *       draws the rig's lines and boxes over every figure square in <dir> (512 px, artSpan 1.5,
 *       tools/art/figurecut.js output), one PNG each, so a new figure (a named NPC, a base body)
 *       can be checked against the landmarks by eye. `auto` picks the body from the file name
 *       (woman, gertrude, female -> female; else male).
 *   --grid --in <dir> [--out <dir>]
 *       the read-out sheet: the square with a grid every 16 frame units, a 2x head crop and a
 *       2x feet crop, labelled in frame units, which is how the rig was measured.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('../../game-client/node_modules/sharp');

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : null)).filter(Boolean));
const rig = JSON.parse(fs.readFileSync(path.join(__dirname, 'figure-rig.json'), 'utf8'));
const SQ = 512, TILE = SQ / 1.5, FX = (SQ - TILE) / 2, S = TILE / 256; // px per frame unit
const px = (fx) => FX + fx * S, py = (fy) => fy * S;

function overlaySvg(body) {
  const b = rig[body];
  const line = (y, c, l) => `<line x1="${px(0)}" y1="${py(y)}" x2="${px(256)}" y2="${py(y)}" stroke="${c}" stroke-width="1.2"/><text x="${px(2)}" y="${py(y) - 2}" font-size="10" fill="${c}">${l}</text>`;
  const box = (r, c, l) => r ? `<rect x="${px(r.x[0])}" y="${py(r.y[0])}" width="${(r.x[1] - r.x[0]) * S}" height="${(r.y[1] - r.y[0]) * S}" fill="none" stroke="${c}" stroke-width="1.2"/><text x="${px(r.x[0]) + 2}" y="${py(r.y[0]) + 10}" font-size="9" fill="${c}">${l}</text>` : '';
  const parts = [
    `<rect x="${px(0)}" y="0" width="${TILE}" height="${SQ}" fill="none" stroke="#fff" stroke-dasharray="4 4"/>`,
    `<rect x="${px(0)}" y="${py(rig.frame.tileTop)}" width="${TILE}" height="${TILE}" fill="none" stroke="#fff"/>`,
    line(b.hairTop, '#00e5ff', 'hair top'), line(b.brow, '#ffd500', 'brow'), line(b.eyeLine, '#ff3d00', 'eyes'), line(b.mouth, '#ffd500', 'mouth'), line(b.chin, '#ffd500', 'chin'),
    line(b.shoulderLine, '#00e5ff', 'shoulders'), line(b.hem, '#e040fb', 'hem'), line(rig.feetLine, '#ff3d00', 'feet'),
    box(b.neck, '#76ff03', 'neck'), box(b.torso, '#00e5ff', 'torso'), box(b.handL, '#76ff03', 'hand'), box(b.handR, '#76ff03', 'hand'), box(b.footL, '#ff9100', 'foot'), box(b.footR, '#ff9100', 'foot'), box(b.legL, '#ff9100', 'leg'), box(b.legR, '#ff9100', 'leg'),
    `<rect x="${px(b.faceX[0])}" y="${py(b.brow - 10)}" width="${(b.faceX[1] - b.faceX[0]) * S}" height="${(b.chin - b.brow + 10) * S}" fill="none" stroke="#ffd500" stroke-dasharray="3 3"/>`,
    ...b.eyesX.map((x) => `<rect x="${px(x - b.eyeBox.w / 2)}" y="${py(b.eyeLine - b.eyeBox.h / 2)}" width="${b.eyeBox.w * S}" height="${b.eyeBox.h * S}" fill="none" stroke="#ff3d00"/>`),
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SQ}" height="${SQ}">${parts.join('')}</svg>`;
}

function gridSvg(w, h, scale, ox, oy, step) {
  const out = [];
  for (let fx = -64; fx <= 320; fx += step) { const x = (px(fx) - ox) * scale; if (x < 0 || x >= w) continue; out.push(`<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="${fx % 64 ? '#ffffff70' : '#ffff00cc'}" stroke-width="1"/><text x="${x + 2}" y="10" font-size="9" fill="#ff0">${fx}</text>`); }
  for (let fy = 0; fy <= 384; fy += step) { const y = (py(fy) - oy) * scale; if (y < 0 || y >= h) continue; out.push(`<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="${fy % 64 ? '#ffffff70' : '#ffff00cc'}" stroke-width="1"/><text x="2" y="${y + 10}" font-size="9" fill="#ff0">${fy}</text>`); }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${out.join('')}</svg>`;
}

(async () => {
  const inDir = args.in; if (!inDir) { console.error('need --in'); process.exit(1); }
  const outDir = args.out || path.join(inDir, args.overlay ? 'overlay' : 'grid');
  fs.mkdirSync(outDir, { recursive: true });
  const green = { r: 90, g: 138, b: 58, alpha: 1 };
  for (const f of fs.readdirSync(inDir).filter((x) => x.endsWith('.png'))) {
    const src = path.join(inDir, f);
    const flat = await sharp({ create: { width: SQ, height: SQ, channels: 4, background: green } }).composite([{ input: await sharp(src).resize(SQ, SQ).png().toBuffer() }]).png().toBuffer();
    if (args.overlay) {
      const body = (args.body && args.body !== 'auto') ? args.body : (/woman|gertrude|female/i.test(f) ? 'female' : 'male');
      await sharp(flat).composite([{ input: Buffer.from(overlaySvg(body)) }]).png().toFile(path.join(outDir, f.replace('.png', `-${body}-overlay.png`)));
    } else {
      const full = await sharp(flat).composite([{ input: Buffer.from(gridSvg(SQ, SQ, 1, 0, 0, 16)) }]).png().toBuffer();
      const head = await sharp(flat).extract({ left: 96, top: 0, width: 320, height: 230 }).resize(640, 460).composite([{ input: Buffer.from(gridSvg(640, 460, 2, 96, 0, 8)) }]).png().toBuffer();
      const feet = await sharp(flat).extract({ left: 96, top: 300, width: 320, height: 212 }).resize(640, 424).composite([{ input: Buffer.from(gridSvg(640, 424, 2, 96, 300, 8)) }]).png().toBuffer();
      await sharp({ create: { width: 512 + 650, height: 894, channels: 3, background: '#333' } }).composite([{ input: full, left: 0, top: 0 }, { input: head, left: 522, top: 0 }, { input: feet, left: 522, top: 470 }]).jpeg({ quality: 90 }).toFile(path.join(outDir, f.replace('.png', '-grid.jpg')));
    }
    console.log('wrote', f);
  }
})().catch((e) => { console.error(e); process.exit(1); });
