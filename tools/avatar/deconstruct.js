#!/usr/bin/env node
/**
 * Deconstruct a Citizen bust into candidate parts (docs/avatar-plan.md slice 1).
 *
 * The busts under game-client/public/assets/resources/npc-*.svg are traced art: hundreds of
 * ungrouped <path> elements, no layers. This script groups the paths by fill colour (and,
 * with --split, by region above / below a y line), writes each group as its own SVG into
 * public/assets/avatar/_lab/<name>/, and renders a labelled contact sheet so the groups can
 * be reviewed in the Avatar Lab or by eye. The assembly into rig parts is tools/avatar/assemble.js.
 *
 *   node tools/avatar/deconstruct.js npc-helena [--min-paths 2] [--merge 24] [--split 150]
 *
 *   --merge N   merge fills whose RGB distance is under N into one group (traced art has
 *               dozens of near-identical shades)
 *   --split Y   also write each group split at viewBox y = Y (head vs shoulders)
 *   --min-paths N  skip groups with fewer paths (noise)
 *
 * Output per group: NN-<hex>.svg (original viewBox, original path order), plus
 * groups.json (hex, paths, bbox, centroid, area) and sheet.png.
 */
const fs = require('fs');
const path = require('path');
const sharp = require(path.join(__dirname, '..', '..', 'game-client', 'node_modules', 'sharp'));

const ROOT = path.resolve(__dirname, '..', '..');
const RES = path.join(ROOT, 'game-client', 'public', 'assets', 'resources');
const LAB = path.join(ROOT, 'game-client', 'public', 'assets', 'avatar', '_lab');

function parseArgs(argv) {
  const out = { minPaths: 1, merge: 0, split: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--min-paths') out.minPaths = Number(argv[++i]);
    else if (a === '--merge') out.merge = Number(argv[++i]);
    else if (a === '--split') out.split = Number(argv[++i]);
    else if (a === '--zoom') out.zoom = argv[++i].split(',').map(Number);
    else if (!a.startsWith('--')) out.name = a.replace(/\.svg$/, '');
  }
  return out;
}

// ---------------------------------------------------------------- svg parsing (flat traced files)
function parseTransform(str) {
  // returns [a, b, c, d, e, f]; supports matrix(), scale(), translate() in sequence
  let m = [1, 0, 0, 1, 0, 0];
  const mul = (p, q) => [p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1], p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3], p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5]];
  if (!str) return m;
  const re = /(matrix|scale|translate)\s*\(([^)]*)\)/g;
  let x;
  while ((x = re.exec(str))) {
    const n = x[2].split(/[\s,]+/).filter(Boolean).map(Number);
    if (x[1] === 'matrix' && n.length === 6) m = mul(m, n);
    else if (x[1] === 'scale') m = mul(m, [n[0], 0, 0, n.length > 1 ? n[1] : n[0], 0, 0]);
    else if (x[1] === 'translate') m = mul(m, [1, 0, 0, 1, n[0], n[1] || 0]);
  }
  return m;
}
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** Bounding box of a path's points (control points included: good enough for grouping). */
function pathBounds(d, m) {
  const tokens = d.match(/[MmZzLlHhVvCcSsQqTtAa]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  let cmd = null; let cx = 0; let cy = 0; let sx = 0; let sy = 0;
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  const seen = (x, y) => { const [px, py] = apply(m, x, y); if (px < minX) minX = px; if (px > maxX) maxX = px; if (py < minY) minY = py; if (py > maxY) maxY = py; };
  let i = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const t = tokens[i];
    if (/[A-Za-z]/.test(t)) { cmd = t; i++; if (cmd === 'Z' || cmd === 'z') { cx = sx; cy = sy; } continue; }
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case 'M': { const x = num(); const y = num(); cx = rel ? cx + x : x; cy = rel ? cy + y : y; sx = cx; sy = cy; seen(cx, cy); cmd = rel ? 'l' : 'L'; break; }
      case 'L': { const x = num(); const y = num(); cx = rel ? cx + x : x; cy = rel ? cy + y : y; seen(cx, cy); break; }
      case 'H': { const x = num(); cx = rel ? cx + x : x; seen(cx, cy); break; }
      case 'V': { const y = num(); cy = rel ? cy + y : y; seen(cx, cy); break; }
      case 'C': { const pts = [num(), num(), num(), num(), num(), num()]; for (let k = 0; k < 6; k += 2) seen(rel ? cx + pts[k] : pts[k], rel ? cy + pts[k + 1] : pts[k + 1]); cx = rel ? cx + pts[4] : pts[4]; cy = rel ? cy + pts[5] : pts[5]; break; }
      case 'S': case 'Q': { const pts = [num(), num(), num(), num()]; for (let k = 0; k < 4; k += 2) seen(rel ? cx + pts[k] : pts[k], rel ? cy + pts[k + 1] : pts[k + 1]); cx = rel ? cx + pts[2] : pts[2]; cy = rel ? cy + pts[3] : pts[3]; break; }
      case 'T': { const x = num(); const y = num(); cx = rel ? cx + x : x; cy = rel ? cy + y : y; seen(cx, cy); break; }
      case 'A': { num(); num(); num(); num(); num(); const x = num(); const y = num(); cx = rel ? cx + x : x; cy = rel ? cy + y : y; seen(cx, cy); break; }
      default: i++; break;
    }
  }
  if (minX === Infinity) return null;
  return { minX, minY, maxX, maxY };
}

/** Every <path> (fill, transform, d, the raw element) in document order, plus the viewBox. */
function parseSvg(text) {
  const vb = text.match(/viewBox\s*=\s*"([^"]+)"/);
  const viewBox = vb ? vb[1] : '0 0 200 200';
  // gradients: the big areas (face, hair mass) are `fill="url(#gradient_N)"`; keep every
  // <defs> block so a candidate file still resolves them, and label a gradient group by
  // its first stop colour
  const defs = (text.match(/<defs>[\s\S]*?<\/defs>/g) || []).join('\n');
  const gradientColor = {};
  const gre = /<(?:linear|radial)Gradient\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/(?:linear|radial)Gradient>/g;
  let g;
  while ((g = gre.exec(text))) {
    const stop = g[2].match(/stop-color="([^"]+)"/);
    gradientColor[g[1]] = stop ? stop[1].toUpperCase() : null;
  }
  const paths = [];
  const re = /<path\b([^>]*?)\/?>/g;
  let x;
  while ((x = re.exec(text))) {
    const attrs = x[1];
    const fill = (attrs.match(/\bfill="([^"]*)"/) || [])[1] || '#000000';
    const transform = (attrs.match(/\btransform="([^"]*)"/) || [])[1] || '';
    const d = (attrs.match(/\bd="([^"]*)"/) || [])[1] || '';
    if (!d) continue;
    paths.push({ fill: fill.startsWith('url(') ? fill : fill.toUpperCase(), transform, d, raw: x[0], bounds: pathBounds(d, parseTransform(transform)) });
  }
  return { viewBox, paths, defs, gradientColor };
}

const hexToRgb = (hex) => { const n = parseInt(hex.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Group paths by fill; merge near shades (greedy, by frequency). */
function groupByFill(paths, mergeDistance) {
  const counts = new Map();
  for (const p of paths) counts.set(p.fill, (counts.get(p.fill) || 0) + 1);
  const fills = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f);
  const leader = new Map(); // fill -> group fill
  const leaders = [];
  for (const f of fills) {
    if (!/^#[0-9A-F]{6}$/.test(f)) { leader.set(f, f); leaders.push(f); continue; }
    const rgb = hexToRgb(f);
    const near = mergeDistance > 0 ? leaders.find((l) => /^#[0-9A-F]{6}$/.test(l) && dist(rgb, hexToRgb(l)) < mergeDistance) : null;
    if (near) leader.set(f, near); else { leader.set(f, f); leaders.push(f); }
  }
  const groups = new Map();
  paths.forEach((p, order) => {
    const g = leader.get(p.fill);
    if (!groups.has(g)) groups.set(g, { fill: g, fills: new Set(), paths: [] });
    const grp = groups.get(g);
    grp.fills.add(p.fill);
    grp.paths.push({ ...p, order });
  });
  return [...groups.values()];
}

function groupStats(g) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity; let area = 0; let cx = 0; let cy = 0; let n = 0;
  for (const p of g.paths) {
    if (!p.bounds) continue;
    const b = p.bounds;
    minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY); maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
    const a = Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxY - b.minY);
    area += a; cx += ((b.minX + b.maxX) / 2) * a; cy += ((b.minY + b.maxY) / 2) * a; n++;
  }
  const r = (v) => Math.round(v * 10) / 10;
  return { paths: g.paths.length, bbox: n ? [r(minX), r(minY), r(maxX), r(maxY)] : null, centroid: area ? [r(cx / area), r(cy / area)] : null, area: r(area) };
}

function svgFor(viewBox, paths, defs = '') {
  return `<?xml version="1.0" encoding="utf-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${viewBox}">\n${defs}\n${paths.map((p) => p.raw).join('\n')}\n</svg>\n`;
}

async function contactSheet(items, cell, cols, out) {
  const rows = Math.ceil(items.length / cols);
  const comps = [];
  for (let i = 0; i < items.length; i++) {
    const left = (i % cols) * cell; const top = Math.floor(i / cols) * cell;
    const png = await sharp(Buffer.from(items[i].svg), { density: 144 }).resize(cell - 8, cell - 28, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    comps.push({ input: png, left: left + 4, top: top + 4 });
    const label = `<svg xmlns="http://www.w3.org/2000/svg" width="${cell}" height="22"><rect width="${cell}" height="22" fill="${items[i].fill.startsWith('#') ? items[i].fill : '#888'}"/><text x="4" y="15" font-family="monospace" font-size="11" fill="#fff" stroke="#000" stroke-width="2" paint-order="stroke">${items[i].label}</text></svg>`;
    comps.push({ input: Buffer.from(label), left, top: top + cell - 22 });
  }
  await sharp({ create: { width: cols * cell, height: rows * cell, channels: 4, background: { r: 235, g: 235, b: 230, alpha: 1 } } }).composite(comps).png().toFile(out);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.name) { console.error('usage: node tools/avatar/deconstruct.js npc-helena [--merge 24] [--split 150] [--min-paths 2]'); process.exit(1); }
  const src = path.join(RES, `${args.name}.svg`);
  const text = fs.readFileSync(src, 'utf8');
  const { viewBox, paths, defs, gradientColor } = parseSvg(text);
  const labelHex = (fill) => { const m = fill.match(/^url\(#(.+)\)$/); return m ? (gradientColor[m[1]] || '#888888') : fill; };
  const outDir = path.join(LAB, args.name);
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(outDir)) if (/^\d\d-/.test(f) || f === 'groups.json' || f === 'sheet.png' || f === 'source.svg') fs.unlinkSync(path.join(outDir, f));
  fs.copyFileSync(src, path.join(outDir, 'source.svg'));

  // a gradient fill is one big path (a face, a hair mass): never drop it as noise
  const groups = groupByFill(paths, args.merge).filter((g) => g.paths.length >= args.minPaths || g.fill.startsWith('url(') || groupStats(g).area > 400);
  const report = [];
  const sheetItems = [];
  groups.forEach((g, i) => {
    const id = String(i).padStart(2, '0');
    const isGradient = g.fill.startsWith('url(');
    const hex = (isGradient ? `grad-${labelHex(g.fill).replace('#', '')}` : g.fill.replace('#', ''));
    const stats = groupStats(g);
    const file = `${id}-${hex}.svg`;
    fs.writeFileSync(path.join(outDir, file), svgFor(viewBox, g.paths, defs));
    report.push({ id, file, fill: g.fill, color: labelHex(g.fill), gradient: isGradient, merged: [...g.fills], ...stats });
    sheetItems.push({ svg: svgFor(viewBox, g.paths, defs), fill: labelHex(g.fill), label: `${id} ${hex} ×${g.paths.length}` });
    if (args.split != null && stats.bbox && stats.bbox[1] < args.split && stats.bbox[3] > args.split) {
      const above = g.paths.filter((p) => p.bounds && (p.bounds.minY + p.bounds.maxY) / 2 < args.split);
      const below = g.paths.filter((p) => !(p.bounds && (p.bounds.minY + p.bounds.maxY) / 2 < args.split));
      if (above.length && below.length) {
        fs.writeFileSync(path.join(outDir, `${id}-${hex}-above.svg`), svgFor(viewBox, above, defs));
        fs.writeFileSync(path.join(outDir, `${id}-${hex}-below.svg`), svgFor(viewBox, below, defs));
      }
    }
  });
  fs.writeFileSync(path.join(outDir, 'groups.json'), JSON.stringify({ source: `${args.name}.svg`, viewBox, totalPaths: paths.length, merge: args.merge, groups: report }, null, 2));
  await contactSheet(sheetItems, 160, 6, path.join(outDir, 'sheet.png'));
  if (args.zoom) {
    const [zx, zy, zw, zh] = args.zoom;
    const zoomed = sheetItems.map((it) => ({ ...it, svg: it.svg.replace(/viewBox="[^"]+"/, `viewBox="${zx} ${zy} ${zw} ${zh}"`) }));
    await contactSheet(zoomed, 200, 6, path.join(outDir, 'sheet-zoom.png'));
    console.log(`  zoom sheet (${args.zoom.join(',')}) -> sheet-zoom.png`);
  }
  console.log(`${args.name}: ${paths.length} paths -> ${groups.length} colour groups in ${path.relative(ROOT, outDir)}`);
  for (const r of report) console.log(`  ${r.id} ${r.fill} ×${String(r.paths).padStart(4)}  bbox ${r.bbox?.join(',')}  centroid ${r.centroid?.join(',')}  area ${r.area}${r.merged.length > 1 ? `  (merged ${r.merged.length} shades)` : ''}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
