#!/usr/bin/env node
/**
 * The art palette: extracted from the style bible, not invented (docs/art-pipeline-plan.md
 * §6b step 2; the write-up is docs/art/slice-b/palette.md).
 *
 *   node tools/art/palette.js extract [--style elsinore] [--colours 52] [--sample 2]
 *       Quantizes the bible panels into 40-60 colours, names them by material group and
 *       writes styles/<style>/palette.json (rows {id, name, hex, group, share}; share is the
 *       percentage of counted bible pixels, board and character lanes weighted equally).
 *   node tools/art/palette.js card [--style elsinore]
 *       Draws styles/<style>/palette-card.png, the labelled swatch card sent with every
 *       generation request ("use only these colours"), from palette.json.
 *   node tools/art/palette.js score <png> [...] [--style elsinore] [--threshold 10] [--no-key]
 *       Prints the share of opaque, non-background pixels within SCORE_THRESHOLD (CIE76
 *       delta E in Lab, default 10) of any palette entry. check.js imports scoreImage().
 *
 * Background handling: a board panel's grass and grid lines and a character panel's parchment
 * are not subject pixels. The panel's border decides which kind of background it has (green
 * = grass, else parchment); the background is then everything reachable from the border
 * through pixels close to the border's tones (a flood fill, so a parchment vignette is
 * followed and an outlined subject is never entered), plus the grid lines, found as whole
 * dark columns and rows. The grass entries come from the board backgrounds in their own
 * pass. Lossless masters (_candidates/<job>/approved/<provider>--<name>.png) are preferred
 * over the bible's WebP copies when they exist.
 *
 * Everything is deterministic (seeded k-means++), so a re-run on the same panels gives the
 * same palette. Reuses game-client's sharp through lib/common.js; no other dependencies.
 */
const fs = require('fs');
const path = require('path');
const { ART, CANDIDATES, sharp, readJSON } = require('./lib/common');

// ----------------------------------------------------------------------------- tunables
const SCORE_THRESHOLD = 10;   // CIE76 delta E: within this of a palette entry counts as "on palette"
                              // (2.3 is a just-noticeable difference; 10 is "the same flat fill
                              // under the model's own soft shading"; anti-aliased edges exceed it)
const OUTLINE_L = 20;         // Lab L* below which a pixel is outline, not a material
const MERGE_DE = 6;           // clusters closer than this are the same colour
const MIN_SHARE = 0.03;       // percent; clusters below this are noise (specks, edge blends)
const TARGET = { min: 40, max: 60, want: 52 };
const PARCHMENT_DE = 16;      // flood-fill tolerance from the border's parchment tones (grain, vignette, soft shadow)
const GRASS_DE = 9;           // flood-fill tolerance from the border's grass tones (tufts and blades)
const GRASS_K = 4;            // greens taken from the background grass
const OUTLINE_SPLIT_DE = 8;   // the darks (L* < OUTLINE_L) become two outline entries only when this far apart
const BIN_BITS = 5;           // colour histogram bins per channel (32 levels)
const CHARACTER_RE = /figure|front|turnaround|character|npc/i; // bible file names in the character lane

const GROUP_ORDER = ['outline', 'grass', 'foliage', 'earth', 'wood', 'thatch', 'stone', 'metal', 'skin', 'hair',
  'cloth-red', 'cloth-green', 'cloth-blue', 'cloth-purple', 'cloth-cream', 'cloth-brown', 'accent'];
const TONE_WORDS = { 1: [''], 2: ['light', 'dark'], 3: ['light', 'mid', 'dark'], 4: ['light', 'mid', 'dark', 'deep'], 5: ['lightest', 'light', 'mid', 'dark', 'deep'] };

// ----------------------------------------------------------------------------- colour maths
const GAMMA = new Float64Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; GAMMA[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const fLab = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

/** sRGB (0-255) to CIE Lab, D65. */
function rgbToLab(r, g, b) {
  const R = GAMMA[r], G = GAMMA[g], B = GAMMA[b];
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const fx = fLab(x), fy = fLab(y), fz = fLab(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function labToRgb(L, a, bb) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - bb / 200;
  const inv = (t) => (t * t * t > 0.008856 ? t * t * t : (t - 16 / 116) / 7.787);
  const x = inv(fx) * 0.95047, y = inv(fy), z = inv(fz) * 1.08883;
  const lin = [x * 3.2406 + y * -1.5372 + z * -0.4986, x * -0.9689 + y * 1.8758 + z * 0.0415, x * 0.0557 + y * -0.204 + z * 1.057];
  return lin.map((c) => { const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(v * 255))); });
}

const dE = (p, q) => Math.sqrt((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2);
const hexOf = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
const hexToRgb = (hex) => { const h = hex.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
/** Lab to L, chroma, hue (degrees, 0-360; in Lab red is ~40, orange ~65, yellow ~90, green ~125, blue ~265, purple ~330). */
function lch([L, a, b]) { const C = Math.hypot(a, b); let h = (Math.atan2(b, a) * 180) / Math.PI; if (h < 0) h += 360; return { L, C, h }; }

// ----------------------------------------------------------------------------- panels
function styleDir(style) { return path.join(ART, 'styles', style); }

/** A bible panel's lossless master if one exists (approved/<provider>--<name>.png), else the WebP. */
function masterFor(bibleFile) {
  const name = path.basename(bibleFile).replace(/\.(webp|png|jpg)$/i, '');
  if (!fs.existsSync(CANDIDATES)) return bibleFile;
  for (const job of fs.readdirSync(CANDIDATES)) {
    const dir = path.join(CANDIDATES, job, 'approved');
    if (!fs.existsSync(dir)) continue;
    const hit = fs.readdirSync(dir).find((f) => f.endsWith(`--${name}.png`));
    if (hit) return path.join(dir, hit);
  }
  return bibleFile;
}

async function loadRGBA(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, W: info.width, H: info.height };
}

/** The background's tones from a 24 px ring along the border, and whether it is grass or parchment. */
function borderModel(img) {
  const { data, W, H } = img;
  const R = 24, px = [];
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
    if (x >= R && x < W - R && y >= R && y < H - R) continue;
    const i = (y * W + x) * 4; if (data[i + 3] < 128) continue;
    px.push([data[i], data[i + 1], data[i + 2]]);
  }
  if (!px.length) return { kind: 'transparent', tones: [], rgb: [0, 0, 0] };
  const med = (k) => px.map((p) => p[k]).sort((a, b) => a - b)[px.length >> 1];
  const rgb = [med(0), med(1), med(2)];
  const lab = rgbToLab(...rgb);
  const kind = lab[1] < -15 && lab[2] > 20 ? 'grass' : 'parchment';   // green = negative a*
  const tones = kmeans(histogram(px.map((p) => ({ rgb: p, w: 1 }))), 4, 20).map((c) => c.lab);
  return { kind, rgb, tones, tolerance: kind === 'grass' ? GRASS_DE : PARCHMENT_DE };
}

/** Columns and rows that are grid lines: whole dark lines across a board panel's background. */
function gridLines(img, model) {
  const { data, W, H } = img;
  const baseL = model.tones.reduce((s, t) => s + t[0], 0) / model.tones.length;
  const dark = (x, y) => { const i = (y * W + x) * 4; return rgbToLab(data[i], data[i + 1], data[i + 2])[0] < baseL - 7; };
  const find = (n, m, at) => {
    const out = new Set();
    for (let a = 0; a < n; a++) {
      let hits = 0, seen = 0;
      // count only the outer fifth on both ends, where no subject sits
      for (let b = 0; b < m; b += 2) { if (b > m * 0.2 && b < m * 0.8) continue; seen++; if (dark(...at(a, b))) hits++; }
      if (hits / seen > 0.6) out.add(a);
    }
    const widened = new Set();
    for (const a of out) for (let d = -3; d <= 3; d++) widened.add(a + d);
    return widened;
  };
  return { cols: find(W, H, (x, y) => [x, y]), rows: find(H, W, (y, x) => [x, y]) };
}

/**
 * Per-pixel class: 0 subject, 1 background, 2 grid line, 3 transparent. The background is
 * what a flood fill from the border reaches through pixels within the model's tolerance of
 * one of its tones (grid lines are passable), so a vignette is followed and anything inside
 * a dark outline is never entered.
 */
function classify(img, model, lines) {
  const { data, W, H } = img;
  const cls = new Uint8Array(W * H);
  const near = new Uint8Array(W * H); // 1 = colour-close to the background
  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    if (data[i + 3] < 128) { cls[p] = 3; continue; }
    const x = p % W, y = (p / W) | 0;
    if (lines.rows.has(y) || lines.cols.has(x)) { cls[p] = 2; near[p] = 1; continue; }
    const lab = rgbToLab(data[i], data[i + 1], data[i + 2]);
    for (const t of model.tones) if (dE(lab, t) <= model.tolerance) { near[p] = 1; break; }
  }
  const stack = [], seen = new Uint8Array(W * H);
  const push = (p) => { if (near[p] && !seen[p]) { seen[p] = 1; if (cls[p] === 0) cls[p] = 1; stack.push(p); } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (stack.length) {
    const p = stack.pop(), x = p % W;
    if (x > 0) push(p - 1);
    if (x < W - 1) push(p + 1);
    if (p >= W) push(p - W);
    if (p + W < W * H) push(p + W);
  }
  return cls;
}

// ----------------------------------------------------------------------------- histogram + k-means
/** Weighted colour histogram over BIN_BITS per channel. samples: [{rgb, w, y?, panel?}]. */
function histogram(samples, nPanels = 0) {
  const shift = 8 - BIN_BITS, bins = new Map();
  for (const s of samples) {
    const key = ((s.rgb[0] >> shift) << (2 * BIN_BITS)) | ((s.rgb[1] >> shift) << BIN_BITS) | (s.rgb[2] >> shift);
    let b = bins.get(key);
    if (!b) { b = { w: 0, r: 0, g: 0, b: 0, y: 0, panels: nPanels ? new Float64Array(nPanels) : null }; bins.set(key, b); }
    b.w += s.w; b.r += s.rgb[0] * s.w; b.g += s.rgb[1] * s.w; b.b += s.rgb[2] * s.w; b.y += (s.y || 0) * s.w;
    if (b.panels) b.panels[s.panel] += s.w;
  }
  return [...bins.values()].map((b) => ({ w: b.w, lab: rgbToLab(Math.round(b.r / b.w), Math.round(b.g / b.w), Math.round(b.b / b.w)), y: b.y / b.w, panels: b.panels }));
}

function mulberry32(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Weighted k-means in Lab over histogram bins, k-means++ seeded. Returns clusters {lab, w, y, panels}. */
function kmeans(bins, k, iters = 40) {
  if (!bins.length) return [];
  k = Math.min(k, bins.length);
  const rand = mulberry32(1234 + k);
  const centres = [bins[Math.floor(rand() * bins.length)].lab.slice()];
  const d2 = new Float64Array(bins.length).fill(Infinity);
  while (centres.length < k) {
    const c = centres[centres.length - 1];
    let total = 0;
    for (let i = 0; i < bins.length; i++) { const d = dE(bins[i].lab, c) ** 2 * bins[i].w; if (d < d2[i]) d2[i] = d; total += d2[i]; }
    let r = rand() * total, pick = bins.length - 1;
    for (let i = 0; i < bins.length; i++) { r -= d2[i]; if (r <= 0) { pick = i; break; } }
    centres.push(bins[pick].lab.slice());
  }
  const assign = new Int32Array(bins.length).fill(-1);
  for (let it = 0; it < iters; it++) {
    let moved = 0;
    for (let i = 0; i < bins.length; i++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < centres.length; c++) { const d = dE(bins[i].lab, centres[c]); if (d < bd) { bd = d; best = c; } }
      if (assign[i] !== best) { assign[i] = best; moved++; }
    }
    const acc = centres.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < bins.length; i++) { const a = acc[assign[i]], b = bins[i]; a[0] += b.lab[0] * b.w; a[1] += b.lab[1] * b.w; a[2] += b.lab[2] * b.w; a[3] += b.w; }
    for (let c = 0; c < centres.length; c++) if (acc[c][3] > 0) centres[c] = [acc[c][0] / acc[c][3], acc[c][1] / acc[c][3], acc[c][2] / acc[c][3]];
    if (!moved) break;
  }
  const nPanels = bins[0].panels ? bins[0].panels.length : 0;
  const out = centres.map(() => ({ w: 0, lab: [0, 0, 0], y: 0, panels: nPanels ? new Float64Array(nPanels) : null }));
  for (let i = 0; i < bins.length; i++) {
    const o = out[assign[i]], b = bins[i];
    o.w += b.w; o.lab[0] += b.lab[0] * b.w; o.lab[1] += b.lab[1] * b.w; o.lab[2] += b.lab[2] * b.w; o.y += b.y * b.w;
    if (o.panels) for (let p = 0; p < nPanels; p++) o.panels[p] += b.panels[p];
  }
  return out.filter((o) => o.w > 0).map((o) => ({ ...o, lab: o.lab.map((v) => v / o.w), y: o.y / o.w }));
}

/** Merge clusters closer than `de` (weighted), nearest pair first. */
function mergeClose(clusters, de) {
  const cs = clusters.map((c) => ({ ...c, lab: c.lab.slice(), panels: c.panels ? Float64Array.from(c.panels) : null }));
  for (;;) {
    let bi = -1, bj = -1, bd = de;
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) { const d = dE(cs[i].lab, cs[j].lab); if (d < bd) { bd = d; bi = i; bj = j; } }
    if (bi < 0) return cs;
    const a = cs[bi], b = cs[bj], w = a.w + b.w;
    a.lab = a.lab.map((v, k) => (v * a.w + b.lab[k] * b.w) / w); a.y = (a.y * a.w + b.y * b.w) / w;
    if (a.panels) for (let p = 0; p < a.panels.length; p++) a.panels[p] += b.panels[p];
    a.w = w; cs.splice(bj, 1);
  }
}

// ----------------------------------------------------------------------------- extract
async function extract(opts) {
  const style = opts.style || 'elsinore';
  const dir = styleDir(style);
  const bible = path.join(dir, 'bible');
  const files = fs.readdirSync(bible).filter((f) => /\.(webp|png)$/i.test(f)).sort();
  if (!files.length) throw new Error(`no panels in ${bible}`);
  const step = Number(opts.sample || 2);

  // pass 1: load, model the background, classify every pixel, collect subject / grass / outline samples
  const panels = [];
  for (const f of files) {
    const src = masterFor(path.join(bible, f));
    const img = await loadRGBA(src);
    const model = borderModel(img);
    const lines = model.kind === 'grass' ? gridLines(img, model) : { cols: new Set(), rows: new Set() };
    const name = f.replace(/\.(webp|png)$/i, '');
    panels.push({ name, src: path.relative(ART, src), img, model, lines, cls: classify(img, model, lines), lane: CHARACTER_RE.test(name) ? 'character' : 'board' });
  }
  const laneCount = { board: panels.filter((p) => p.lane === 'board').length, character: panels.filter((p) => p.lane === 'character').length };
  const subject = [], grass = [], outline = [];
  let totalW = 0;
  panels.forEach((p, pi) => {
    const { data, W, H } = p.img, laneW = 1 / Math.max(1, laneCount[p.lane]);
    const perPixel = laneW / ((W / step) * (H / step)); // every panel in a lane weighs the same, whatever its size
    const n = { subject: 0, background: 0, gridLine: 0, outline: 0 };
    for (let y = 0; y < H; y += step) {
      for (let x = 0; x < W; x += step) {
        const q = y * W + x, i = q * 4, c = p.cls[q];
        if (c === 3) continue;
        if (c === 2) { n.gridLine++; continue; }
        const rgb = [data[i], data[i + 1], data[i + 2]];
        if (c === 1) {
          n.background++;
          if (p.model.kind === 'grass') { grass.push({ rgb, w: perPixel }); totalW += perPixel; }
          continue;
        }
        const lab = rgbToLab(...rgb);
        if (lab[0] < OUTLINE_L) { outline.push({ rgb, w: perPixel }); totalW += perPixel; n.outline++; continue; }
        subject.push({ rgb, w: perPixel, y: y / H, panel: pi });
        totalW += perPixel; n.subject++;
      }
    }
    p.counts = n;
    console.log(`  ${p.name.padEnd(36)} ${p.lane.padEnd(9)} ${p.model.kind.padEnd(9)} bg ${hexOf(p.model.rgb)}  subject ${n.subject}  bg ${n.background}  grid ${n.gridLine}  outline ${n.outline}${p.src.includes('_candidates') ? '  (master)' : ''}`);
  });

  // pass 2: quantize. grass from the background, the rest from the subject pixels; the outline is
  // one colour, or two when the darks split cleanly (a warm line colour and a neutral black).
  const grassClusters = mergeClose(kmeans(histogram(grass), GRASS_K), MERGE_DE).map((c) => ({ ...c, group: 'grass' }));
  const outlineClusters = mergeClose(kmeans(histogram(outline), 2), OUTLINE_SPLIT_DE).filter((c) => (100 * c.w) / totalW >= 0.2).map((c) => ({ ...c, group: 'outline' }));
  const bins = histogram(subject, panels.length);
  let k = Number(opts.colours || TARGET.want) - grassClusters.length - outlineClusters.length, merge = MERGE_DE, clusters;
  for (let attempt = 0; attempt < 8; attempt++) {
    clusters = mergeClose(kmeans(bins, k), merge).filter((c) => (100 * c.w) / totalW >= MIN_SHARE);
    const count = clusters.length + grassClusters.length + outlineClusters.length;
    if (count >= TARGET.min && count <= TARGET.max) break;
    if (count < TARGET.min) k += TARGET.min - count + 2; else merge += 1;
  }

  // pass 3: name by material
  const named = [...outlineClusters, ...grassClusters, ...clusters.map((c) => ({ ...c, group: groupOf(c, panels) }))];
  const rows = [];
  for (const group of GROUP_ORDER) {
    const members = named.filter((c) => c.group === group).sort((a, b) => b.lab[0] - a.lab[0]);
    const words = TONE_WORDS[members.length] || null;
    members.forEach((c, i) => {
      const tone = words ? words[i] : String(i + 1);
      rows.push({ id: members.length === 1 ? group : `${group}-${i + 1}`, name: `${group.replace('-', ' ')}${tone ? ' ' + tone : ''}`, hex: hexOf(labToRgb(...c.lab)), group, share: Math.round((10000 * c.w) / totalW) / 100, _from: c.panels ? topPanels(c.panels, panels) : (group === 'grass' ? 'board backgrounds' : 'darks on all panels') });
    });
  }
  const out = path.join(dir, 'palette.json');
  fs.writeFileSync(out, JSON.stringify(rows.map(({ _from, ...r }) => r), null, 2) + '\n');
  console.log(`\n${rows.length} colours -> ${path.relative(process.cwd(), out)} (lanes: ${laneCount.board} board, ${laneCount.character} character; each lane weighs half)`);
  const counts = {};
  for (const r of rows) counts[r.group] = (counts[r.group] || 0) + 1;
  console.log('groups: ' + Object.entries(counts).map(([g, n]) => `${g} ${n}`).join(', '));
  console.log('\n' + rows.map((r) => `  ${r.id.padEnd(16)} ${r.hex}  ${String(r.share).padStart(6)}%  ${r._from}`).join('\n'));
  return rows;
}

function topPanels(weights, panels) {
  const total = weights.reduce((s, w) => s + w, 0);
  return [...weights].map((w, i) => ({ w, i })).sort((a, b) => b.w - a.w).slice(0, 2).filter((p) => p.w / total > 0.12).map((p) => `${panels[p.i].name.replace(/-\d+$/, '')} ${Math.round((100 * p.w) / total)}%`).join(', ');
}

/**
 * Material by Lab hue, chroma and luminance, and where the pixels came from: the lane (a
 * grey on a character is metal, on the board it is stone), the panel (yellow on the
 * farmhouse is thatch, on a flower it is an accent) and the height on a character panel
 * (brown in the top part is hair, lower down it is a belt or a boot).
 */
function groupOf(c, panels) {
  const { L, C, h } = lch(c.lab);
  const total = c.panels.reduce((s, w) => s + w, 0);
  let charW = 0; c.panels.forEach((w, i) => { if (panels[i].lane === 'character') charW += w; });
  const fromChar = charW / total > 0.5;
  const top = panels[[...c.panels].map((w, i) => ({ w, i })).sort((a, b) => b.w - a.w)[0].i].name;
  const isHead = c.y < 0.42;
  const animal = /animal/.test(top), farmhouse = /farmhouse/.test(top), flowers = /flowers/.test(top);
  if (C < 14 && L >= 80) return 'cloth-cream';                       // white wool, cow white, ivory, petals
  if (C < 20 && L >= 88) return 'cloth-cream';
  if (C < 10) return charW / total > 0.7 ? 'metal' : 'stone';        // the greys: shared with the board = stone
  if (h >= 340 || h < 55) {                                          // reds and pinks
    if (L < 55 && C >= 30) return fromChar ? 'cloth-red' : 'accent';
    if (L >= 55) return fromChar ? (isHead ? 'skin' : 'cloth-cream') : (animal ? 'skin' : 'accent');
    return fromChar ? 'cloth-brown' : 'earth';
  }
  if (h < 100) {                                                     // oranges, browns, yellows
    if (L >= 60 && C >= 38 && h >= 62) {                             // the oranges, yellows and golds
      if (fromChar) return isHead ? 'hair' : 'metal';
      if (h < 72) return 'wood';
      if (farmhouse) return 'thatch';
      return flowers || animal ? 'accent' : 'wood';
    }
    if (L >= 60) {                                                   // beiges, tans, light skin
      if (fromChar) return isHead ? 'skin' : 'cloth-cream';
      if (animal) return C < 30 ? 'cloth-cream' : 'skin';
      return C < 18 ? 'stone' : 'wood';
    }
    if (fromChar) return isHead ? 'hair' : 'cloth-brown';            // the browns
    if (animal) return 'accent';
    return C >= 22 ? 'wood' : 'earth';
  }
  if (h < 200) return fromChar ? 'cloth-green' : 'foliage';
  if (h < 310) return fromChar ? 'cloth-blue' : (C < 14 ? 'stone' : 'accent');
  return fromChar ? 'cloth-purple' : 'accent';
}

// ----------------------------------------------------------------------------- card
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

async function card(opts) {
  const style = opts.style || 'elsinore';
  const dir = styleDir(style);
  const rows = readJSON(path.join(dir, 'palette.json'));
  const outline = (rows.find((r) => r.group === 'outline') || {}).hex || '#2a2118';
  const W = 1024, PAD = 24, COLS = 6, GAP = 12, SW = Math.floor((W - PAD * 2 - (COLS - 1) * GAP) / COLS), SH = 72, LABEL = 46, HEAD = 34;
  const groups = GROUP_ORDER.filter((g) => rows.some((r) => r.group === g));
  let y = PAD, svg = '';
  svg += `<text x="${PAD}" y="${y + 22}" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="bold" fill="#1d1a16">${esc(style)} palette</text>`;
  svg += `<text x="${W - PAD}" y="${y + 22}" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="13" fill="#6b645a">${rows.length} colours extracted from the bible panels; share = % of bible pixels</text>`;
  y += 44;
  for (const g of groups) {
    const members = rows.filter((r) => r.group === g);
    svg += `<text x="${PAD}" y="${y + 20}" font-family="Helvetica, Arial, sans-serif" font-size="16" font-weight="bold" fill="#1d1a16">${esc(g.replace('-', ' '))} <tspan font-weight="normal" font-size="13" fill="#6b645a">${members.length}</tspan></text>`;
    y += HEAD;
    members.forEach((r, i) => {
      const cx = PAD + (i % COLS) * (SW + GAP), cy = y + Math.floor(i / COLS) * (SH + LABEL + GAP);
      svg += `<rect x="${cx}" y="${cy}" width="${SW}" height="${SH}" rx="6" fill="${r.hex}" stroke="${outline}" stroke-width="2"/>`;
      svg += `<text x="${cx + 6}" y="${cy + SH + 18}" font-family="Menlo, Courier, monospace" font-size="14" font-weight="bold" fill="#1d1a16">${esc(r.hex)}</text>`;
      svg += `<text x="${cx + SW - 6}" y="${cy + SH + 18}" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#6b645a">${r.share}%</text>`;
      svg += `<text x="${cx + 6}" y="${cy + SH + 36}" font-family="Helvetica, Arial, sans-serif" font-size="13" fill="#3a3530">${esc(r.name)}</text>`;
    });
    y += Math.ceil(members.length / COLS) * (SH + LABEL + GAP) + 8;
  }
  const H = y + PAD;
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#f4f1ea"/>${svg}</svg>`;
  const out = path.join(dir, 'palette-card.png');
  await sharp(Buffer.from(doc)).png().toFile(out);
  console.log(`${path.relative(process.cwd(), out)} ${W}x${H}, ${rows.length} swatches in ${groups.length} groups`);
}

// ----------------------------------------------------------------------------- score
/**
 * Palette compliance of one image: the share of opaque, non-background pixels within
 * `threshold` (CIE76 delta E) of any palette entry. Transparent pixels never count; when the
 * image is fully opaque (or `key` is true) the background is keyed the way extract() does
 * it (border tones + flood fill + grid lines). `key: false` counts every opaque pixel.
 * Returns { counted, within, mean, buckets: {6, 10, 14}, offPalette: [{hex, share}] }.
 */
async function scoreImage(file, palette, { threshold = SCORE_THRESHOLD, key = 'auto', step = 2 } = {}) {
  const img = await loadRGBA(file);
  const { data, W, H } = img;
  const labs = palette.map((r) => rgbToLab(...hexToRgb(r.hex)));
  let anyTransparent = false;
  for (let i = 3; i < data.length; i += 4 * 97) if (data[i] < 128) { anyTransparent = true; break; }
  const useKey = key === true || (key === 'auto' && !anyTransparent);
  let cls = null, kind = 'alpha';
  if (useKey) {
    const model = borderModel(img);
    const lines = model.kind === 'grass' ? gridLines(img, model) : { cols: new Set(), rows: new Set() };
    cls = classify(img, model, lines); kind = model.kind;
  }
  let counted = 0, within = 0, sum = 0; const buckets = { 6: 0, 10: 0, 14: 0 }; const off = new Map();
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      const q = y * W + x, i = q * 4;
      if (data[i + 3] < 128) continue;
      if (cls && cls[q] !== 0) continue;
      const lab = rgbToLab(data[i], data[i + 1], data[i + 2]);
      let best = Infinity;
      for (const p of labs) { const d = dE(lab, p); if (d < best) best = d; }
      counted++; sum += best;
      if (best <= threshold) within++;
      for (const b of [6, 10, 14]) if (best <= b) buckets[b]++;
      if (best > threshold) { const k = hexOf([data[i] & 0xf0, data[i + 1] & 0xf0, data[i + 2] & 0xf0]); off.set(k, (off.get(k) || 0) + 1); }
    }
  }
  const pct = (n) => Math.round((1000 * n) / Math.max(1, counted)) / 10;
  const offPalette = [...off.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([hex, n]) => ({ hex, share: pct(n) }));
  return { file, counted, keyed: kind, within: pct(within), mean: Math.round((sum / Math.max(1, counted)) * 10) / 10, buckets: { 6: pct(buckets[6]), 10: pct(buckets[10]), 14: pct(buckets[14]) }, offPalette, threshold };
}

function loadPalette(style = 'elsinore') { return readJSON(path.join(styleDir(style), 'palette.json')); }

// ----------------------------------------------------------------------------- cli
async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const opts = {}; const files = [];
  for (let i = 1; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { const k = argv[i].slice(2); if (argv[i + 1] && !argv[i + 1].startsWith('--')) { opts[k] = argv[++i]; } else opts[k] = true; }
    else files.push(argv[i]);
  }
  if (cmd === 'extract') return extract(opts);
  if (cmd === 'card') return card(opts);
  if (cmd === 'score') {
    if (!files.length) throw new Error('score needs at least one png');
    const palette = loadPalette(opts.style);
    const threshold = Number(opts.threshold || SCORE_THRESHOLD);
    for (const f of files) {
      const r = await scoreImage(f, palette, { threshold, key: opts['no-key'] ? false : 'auto' });
      console.log(`${path.basename(f).padEnd(40)} on-palette ${String(r.within).padStart(5)}%  (dE<=6 ${r.buckets[6]}%, <=10 ${r.buckets[10]}%, <=14 ${r.buckets[14]}%)  mean dE ${r.mean}  pixels ${r.counted}  bg ${r.keyed}${r.offPalette.length ? '  off: ' + r.offPalette.map((o) => `${o.hex} ${o.share}%`).join(' ') : ''}`);
    }
    return;
  }
  console.log('usage: node tools/art/palette.js extract|card|score <png...> [--style elsinore] [--threshold 10] [--no-key]');
}

if (require.main === module) main().catch((err) => { console.error(err.message); process.exit(1); });

module.exports = { scoreImage, loadPalette, rgbToLab, labToRgb, deltaE: dE, SCORE_THRESHOLD, GROUP_ORDER };
