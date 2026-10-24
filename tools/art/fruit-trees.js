/**
 * Fruit trees without the model (owner, 2026-10-25): the fruited state of every orchard tree is
 * the EMPTY fruit-tree sprite with painted fruit composited onto its canopy, so all seven share
 * one canopy exactly and only the fruit changes. Each fruit is a small shaded sphere (or a pear /
 * cherry-pair / olive variant) with a highlight from the upper left, a darker rim, and a soft
 * shadow on the leaves beneath, scattered over the canopy's upper two thirds by a fixed seed so
 * the layout is stable between runs.
 *
 *   node tools/art/fruit-trees.js [--base public/assets/resources/fruit-tree.png] [--only apple,pear]
 *
 * Writes game-client/public/assets/resources/tree-<fruit>.png + .svg.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('../../game-client/node_modules/sharp');
const ROOT = path.resolve(__dirname, '..', '..');
const RES = path.join(ROOT, 'game-client', 'public', 'assets', 'resources');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
// the seven orchard fruits sit on the PLAIN base (no blossom); the blossom file is the empty state (owner, 2026-10-25)
const base = path.resolve(ROOT, opt('base', 'game-client/public/assets/resources/fruit-tree-plain.png'));
const only = opt('only', '') ? opt('only').split(',') : null;

// colour = [fill, light, dark]; r = radius as a fraction of the tree width; n = count; kind = sphere | pear | cherry | olive
const FRUITS = {
  apple:  { colour: ['#d8342c', '#ff8a7a', '#8a1a12'], r: 0.052, n: 9, kind: 'sphere' },
  orange: { colour: ['#f28c1e', '#ffc877', '#b05a08'], r: 0.056, n: 8, kind: 'sphere' },
  lemon:  { colour: ['#f2d426', '#fff5a8', '#b89b0a'], r: 0.048, n: 9, kind: 'lemon' },
  peach:  { colour: ['#f7a26b', '#ffd9b8', '#c9603a'], r: 0.054, n: 8, kind: 'sphere' },
  pear:   { colour: ['#b9c93a', '#eef7a6', '#6f8a14'], r: 0.05, n: 8, kind: 'pear' },
  cherry: { colour: ['#b8122a', '#ff6a7e', '#5d0613'], r: 0.03, n: 7, kind: 'cherry' },
  olive:  { colour: ['#4f5a28', '#9aa860', '#232b0c'], r: 0.034, n: 11, kind: 'olive' },
  // the palm and the mulberry have their own bases (--base); their fruit sits where their canopies are
  coconut:  { colour: ['#8a5a2b', '#c9955a', '#4a2c10'], r: 0.06, n: 4, kind: 'coconut', base: 'palm-tree.png', zone: 'crownCentre' },
  mulberry: { colour: ['#5a1a4a', '#b05a9a', '#2a0820'], r: 0.026, n: 16, kind: 'olive', base: 'mulberry-tree.png', file: 'tree-mulberry' },
};

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function fruitSvg(kind, c, r) {
  const [fill, light, dark] = c;
  const grad = `<radialGradient id="g" cx="0.35" cy="0.3" r="0.75"><stop offset="0" stop-color="${light}"/><stop offset="0.45" stop-color="${fill}"/><stop offset="1" stop-color="${dark}"/></radialGradient>`;
  if (kind === 'pear') return `${grad}<path fill="url(#g)" d="M0 ${-r * 1.5} C ${r * 0.5} ${-r * 1.5} ${r * 0.6} ${-r * 0.4} ${r} ${r * 0.2} C ${r * 1.1} ${r * 0.8} ${r * 0.6} ${r * 1.1} 0 ${r * 1.1} C ${-r * 0.6} ${r * 1.1} ${-r * 1.1} ${r * 0.8} ${-r} ${r * 0.2} C ${-r * 0.6} ${-r * 0.4} ${-r * 0.5} ${-r * 1.5} 0 ${-r * 1.5} Z"/><path stroke="#5a3a14" stroke-width="${r * 0.18}" fill="none" d="M0 ${-r * 1.45} q ${r * 0.2} ${-r * 0.5} ${r * 0.35} ${-r * 0.7}"/>`;
  if (kind === 'cherry') return `${grad}<path stroke="#4a6a18" stroke-width="${r * 0.22}" fill="none" d="M${-r * 0.9} 0 q ${r * 0.4} ${-r * 2.2} ${r * 1.3} ${-r * 2.4} M${r * 0.9} 0 q ${-r * 0.2} ${-r * 2} ${-r * 0.5} ${-r * 2.4}"/><circle fill="url(#g)" cx="${-r * 0.9}" cy="0" r="${r}"/><circle fill="url(#g)" cx="${r * 0.9}" cy="${r * 0.15}" r="${r}"/>`;
  if (kind === 'lemon') return `${grad}<ellipse fill="url(#g)" cx="0" cy="0" rx="${r * 0.85}" ry="${r * 1.1}"/><circle fill="${dark}" cx="0" cy="${r * 1.05}" r="${r * 0.14}"/>`;
  if (kind === 'coconut') return `${grad}<circle fill="url(#g)" cx="0" cy="0" r="${r}"/><circle fill="${dark}" opacity="0.5" cx="${-r * 0.25}" cy="${r * 0.1}" r="${r * 0.12}"/><circle fill="${dark}" opacity="0.5" cx="${r * 0.15}" cy="${r * 0.2}" r="${r * 0.12}"/><circle fill="${dark}" opacity="0.5" cx="${-r * 0.05}" cy="${-r * 0.2}" r="${r * 0.12}"/>`;
  if (kind === 'olive') return `${grad}<ellipse fill="url(#g)" cx="0" cy="0" rx="${r * 0.8}" ry="${r * 1.05}" transform="rotate(-20)"/>`;
  return `${grad}<circle fill="url(#g)" cx="0" cy="0" r="${r}"/><circle fill="${light}" opacity="0.7" cx="${-r * 0.32}" cy="${-r * 0.38}" r="${r * 0.22}"/>`;
}

async function main() {
  const fruits = only ? Object.entries(FRUITS).filter(([k]) => only.includes(k)) : Object.entries(FRUITS);
  for (const [name, f] of fruits) await one(name, f, f.base ? path.join(RES, f.base) : base);
}

async function one(name, f, base) {
  const img = sharp(base).ensureAlpha();
  const { width: W, height: H } = await img.metadata();
  const { data } = await img.raw().toBuffer({ resolveWithObject: true });
  // the canopy: opaque pixels in the upper 70 % of the opaque bbox, and only green-ish ones (not the trunk)
  let top = H, bot = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 128) { top = Math.min(top, y); bot = Math.max(bot, y); }
  const canopyBottom = top + (bot - top) * 0.68;
  const inCanopy = (x, y) => {
    if (y < top + (bot - top) * 0.08 || y > canopyBottom) return false;
    const i = (Math.round(y) * W + Math.round(x)) * 4; if (data[i + 3] < 200) return false;
    const r = data[i], g = data[i + 1], b = data[i + 2]; return g > r * 0.9 && g > b;  // leaf, not trunk
  };
  {
    const rand = rng(name.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
    const R = f.r * W; const pts = [];
    let tries = 0;
    while (pts.length < f.n && tries++ < 4000) {
      let x, y;
      if (f.zone === 'crownCentre') { x = W * (0.38 + rand() * 0.24); y = top + (bot - top) * (0.3 + rand() * 0.16); if (data[(Math.round(y) * W + Math.round(x)) * 4 + 3] < 200) continue; }
      else { x = W * (0.12 + rand() * 0.76); y = top + (canopyBottom - top) * (0.12 + rand() * 0.85); if (!inCanopy(x, y)) continue; }
      if (pts.some((p) => Math.hypot(p.x - x, p.y - y) < R * (f.zone === 'crownCentre' ? 1.6 : 3.2))) continue;
      pts.push({ x, y });
    }
    const layers = pts.map(({ x, y }) => `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><ellipse fill="#000" opacity="0.28" cx="${R * 0.25}" cy="${R * 0.75}" rx="${R * 1.15}" ry="${R * 0.75}"/>${fruitSvg(f.kind, f.colour, R)}</g>`).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${layers}</svg>`;
    const overlay = await sharp(Buffer.from(svg)).png().toBuffer();
    const out = await sharp(base).composite([{ input: overlay }]).png().toBuffer();
    const file = path.join(RES, f.file || `tree-${name}`);
    fs.writeFileSync(file + '.png', out);
    const b64 = out.toString('base64');
    fs.writeFileSync(file + '.svg', `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><image width="${W}" height="${H}" xlink:href="data:image/png;base64,${b64}"/></svg>`);
    console.log(`${f.file || 'tree-' + name}: ${pts.length} fruit`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
