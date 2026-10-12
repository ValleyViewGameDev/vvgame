#!/usr/bin/env node
/**
 * Assemble rig parts from deconstructed busts (docs/avatar-plan.md slice 1).
 *
 * A recipe picks colour groups out of one source (the groups.json that
 * tools/avatar/deconstruct.js wrote), filters their paths by region, recolours them and
 * writes one part SVG in the 256 px rig frame. Recipes live in tools/avatar/recipes/*.json:
 *
 *   {
 *     "out": "skin/skin-02.svg",            // under public/assets/avatar/
 *     "source": "npc-juliet",
 *     "fit": { "scale": 1.28, "dx": 0, "dy": 0 },   // source viewBox units -> rig px
 *     "include": [
 *       { "groups": [0], "recolor": "white" },
 *       { "groups": [45], "region": { "yMin": 130 }, "recolor": "grey", "grey": 0.88 },
 *       { "groups": [42], "region": { "yMin": 105 }, "recolor": "keep" }
 *     ]
 *   }
 *
 * groups: ids from groups.json, or "all" (with an optional `exclude` list).
 * mirror: an x (source units) to flip the include about, drawn flipped (an eye for the other side).
 * clip: { xMin, xMax, yMin, yMax } or clipEllipse: { cx, cy, rx, ry } (source units) cuts the
 * include's paths, for one traced shape that holds two parts (Kent's hair and beard).
 * region: xMin / xMax / yMin / yMax in SOURCE units, tested on each path's bbox centre.
 * recolor: "keep" (original fill, gradients included) | "white" | "black" |
 *          "grey" (flat, `grey` 0..1) | "lum" (grey = the fill's luminance relative to
 *          `ref`, so a tintable part keeps its shading: ref -> white, darker -> grey).
 * Paths keep their source order inside each include; includes are drawn in recipe order.
 * under / extra: raw SVG elements in RIG coordinates drawn before / after the source paths
 * (eye whites under traced outlines, a blink's lids).
 *
 *   node tools/avatar/assemble.js tools/avatar/recipes/skin-juliet.json [...more]
 *   node tools/avatar/assemble.js --all
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const LAB = path.join(ROOT, 'game-client', 'public', 'assets', 'avatar', '_lab');
const OUT_BASE = path.join(ROOT, 'game-client', 'public', 'assets', 'avatar');
const RECIPES = path.join(__dirname, 'recipes');

const hexToRgb = (hex) => { const n = parseInt(hex.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lum = (hex) => { const [r, g, b] = hexToRgb(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const greyHex = (v) => { const c = Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'); return `#${c}${c}${c}`; };

/** Re-parse the candidate group files (the raw path elements, in order). */
function loadGroup(sourceDir, file) {
  const text = fs.readFileSync(path.join(sourceDir, file), 'utf8');
  const defs = (text.match(/<defs>[\s\S]*?<\/defs>/g) || []).join('\n');
  const paths = [];
  const re = /<path\b([^>]*?)\/?>/g;
  let x;
  while ((x = re.exec(text))) paths.push({ raw: x[0], attrs: x[1] });
  return { defs, paths };
}

// the same bbox logic as deconstruct.js, kept local so a recipe can filter by region
function parseTransform(str) {
  let m = [1, 0, 0, 1, 0, 0];
  const mul = (p, q) => [p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1], p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3], p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5]];
  if (!str) return m;
  const re = /(matrix|scale|translate)\s*\(([^)]*)\)/g; let x;
  while ((x = re.exec(str))) {
    const n = x[2].split(/[\s,]+/).filter(Boolean).map(Number);
    if (x[1] === 'matrix' && n.length === 6) m = mul(m, n);
    else if (x[1] === 'scale') m = mul(m, [n[0], 0, 0, n.length > 1 ? n[1] : n[0], 0, 0]);
    else if (x[1] === 'translate') m = mul(m, [1, 0, 0, 1, n[0], n[1] || 0]);
  }
  return m;
}
function bboxOf(attrs) {
  const d = (attrs.match(/\bd="([^"]*)"/) || [])[1] || '';
  const m = parseTransform((attrs.match(/\btransform="([^"]*)"/) || [])[1] || '');
  const nums = d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  // crude: every number pair as a point (relative commands make this approximate, the
  // traced files use absolute commands)
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = m[0] * Number(nums[i]) + m[2] * Number(nums[i + 1]) + m[4];
    const y = m[1] * Number(nums[i]) + m[3] * Number(nums[i + 1]) + m[5];
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return minX === Infinity ? null : { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, minX, minY, maxX, maxY };
}

function inRegion(b, r) {
  if (!r) return true;
  if (!b) return false;
  if (r.xMin != null && b.cx < r.xMin) return false;
  if (r.xMax != null && b.cx > r.xMax) return false;
  if (r.yMin != null && b.cy < r.yMin) return false;
  if (r.yMax != null && b.cy > r.yMax) return false;
  return true;
}

function recolorAttrs(attrs, mode, inc, gradientColor) {
  const fill = (attrs.match(/\bfill="([^"]*)"/) || [])[1] || '#000000';
  let next = null;
  if (mode === 'keep') return attrs;
  if (mode === 'white') next = '#ffffff';
  else if (mode === 'black') next = '#111111';
  else if (mode === 'grey') next = greyHex(255 * (inc.grey ?? 0.8));
  else if (mode === 'lum') {
    const hex = fill.startsWith('url(') ? (gradientColor[(fill.match(/#(.+)\)/) || [])[1]] || inc.ref) : fill;
    const ref = inc.ref || '#ffffff';
    const ratio = Math.min(1, lum(hex) / Math.max(1, lum(ref)));
    const floor = inc.floor ?? 0.35; // keep shading readable after a dark tint
    next = greyHex(255 * (floor + (1 - floor) * ratio));
    if (inc.keepDark && lum(hex) < (inc.keepDark)) next = '#111111'; // line work stays black
  }
  return attrs.replace(/\bfill="[^"]*"/, `fill="${next}"`);
}

function gradientColors(defs) {
  const out = {};
  const re = /<(?:linear|radial)Gradient\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/(?:linear|radial)Gradient>/g; let g;
  while ((g = re.exec(defs))) { const stop = g[2].match(/stop-color="([^"]+)"/); out[g[1]] = stop ? stop[1] : null; }
  return out;
}

function assemble(recipe, recipeFile) {
  const sourceDir = path.join(LAB, recipe.source);
  const groups = JSON.parse(fs.readFileSync(path.join(sourceDir, 'groups.json'), 'utf8')).groups;
  const fit = { scale: 1.28, dx: 0, dy: 0, ...(recipe.fit || {}) };
  let defs = '';
  const body = [];
  let kept = 0;
  let clipN = 0;
  for (const inc of recipe.include) {
    // clip: { xMin, xMax, yMin, yMax } in source units cuts a path that spans two parts (one
    // traced shape holding hair AND beard) instead of filtering whole paths by region
    let clipId = null;
    if (inc.clip || inc.clipEllipse) {
      clipId = `clip${clipN++}`;
      let shape;
      if (inc.clipEllipse) { const e = inc.clipEllipse; shape = `<ellipse cx="${e.cx}" cy="${e.cy}" rx="${e.rx}" ry="${e.ry}"/>`; }
      else { const c = { xMin: -1000, xMax: 1000, yMin: -1000, yMax: 1000, ...inc.clip }; shape = `<rect x="${c.xMin}" y="${c.yMin}" width="${c.xMax - c.xMin}" height="${c.yMax - c.yMin}"/>`; }
      defs += `<defs><clipPath id="${clipId}">${shape}</clipPath></defs>`;
      body.push(`<g clip-path="url(#${clipId})">`);
    }
    // mirror: draw the include flipped about the source's x = mirror (one good eye makes two)
    if (inc.mirror != null) body.push(`<g transform="matrix(-1 0 0 1 ${2 * inc.mirror} 0)">`);
    const ids = inc.groups === 'all' ? groups.map((r) => Number(r.id)).filter((id) => !(inc.exclude || []).includes(id)) : inc.groups;
    for (const gid of ids) {
      const g = groups.find((r) => Number(r.id) === Number(gid));
      if (!g) { console.warn(`  ${recipeFile}: group ${gid} not in ${recipe.source}`); continue; }
      const { defs: d, paths } = loadGroup(sourceDir, g.file);
      if (d && !defs) defs = d;
      const gc = gradientColors(d);
      for (const p of paths) {
        if (!inRegion(bboxOf(p.attrs), inc.region)) continue;
        const attrs = recolorAttrs(p.attrs, inc.recolor || 'keep', inc, gc);
        body.push(`<path${attrs}/>`);
        kept++;
      }
    }
    if (inc.mirror != null) body.push('</g>');
    if (clipId) body.push('</g>');
  }
  const usesGradient = body.some((b) => /url\(#(?!clip)/.test(b)) || clipN > 0;
  const svg = `<?xml version="1.0" encoding="utf-8"?>
<!-- assembled by tools/avatar/assemble.js from ${recipe.source} (${path.basename(recipeFile)}); edit the recipe, not this file -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="256" height="256" viewBox="0 0 256 256">
${usesGradient ? defs : ''}
${(recipe.under || []).join('\n')}
<g transform="translate(${fit.dx} ${fit.dy}) scale(${fit.scale})">
${body.join('\n')}
</g>
${(recipe.extra || []).join('\n')}
</svg>
`;
  const out = path.join(OUT_BASE, recipe.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, svg);
  console.log(`${path.basename(recipeFile)} -> ${recipe.out} (${kept} paths${usesGradient ? ', gradients kept' : ''})`);
}

function main() {
  let files = process.argv.slice(2);
  if (files.includes('--all')) files = fs.readdirSync(RECIPES).filter((f) => f.endsWith('.json')).map((f) => path.join(RECIPES, f));
  if (!files.length) { console.error('usage: node tools/avatar/assemble.js recipe.json [...] | --all'); process.exit(1); }
  for (const f of files) assemble(JSON.parse(fs.readFileSync(f, 'utf8')), f);
}
main();
