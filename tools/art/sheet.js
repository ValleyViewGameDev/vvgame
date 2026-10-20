#!/usr/bin/env node
/**
 * The contact sheet for a job (docs/art-pipeline-plan.md §4): one row per (variant, subject),
 * one column per model; each cell shows the 512 px panel and, under it, the same image at
 * 90 px and 45 px (a 2x phone tile and a desktop tile), because the 45 px strip decides.
 *
 *   node tools/art/sheet.js --job slice-a   ->  tools/art/_candidates/slice-a/sheet.png
 */
const fs = require('fs');
const path = require('path');
const { ART, CANDIDATES, sharp, readJSON } = require('./lib/common');

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : null)).filter(Boolean));
const PANEL = 512, PAD = 16, LABEL = 28, THUMBS = 110, CELL_W = PANEL + PAD, CELL_H = PANEL + THUMBS + LABEL + PAD;

const label = (text, w, h, size = 16) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="6" y="${h - 8}" font-family="Helvetica, Arial, sans-serif" font-size="${size}" fill="#333">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`);

async function main() {
  const jobName = args.job || 'slice-a';
  const job = readJSON(path.join(ART, 'jobs', `${jobName}.json`));
  const dir = path.join(CANDIDATES, jobName);
  const models = Object.keys(job.models).filter((m) => fs.existsSync(path.join(dir, m)));
  const files = models.flatMap((m) => fs.readdirSync(path.join(dir, m)).filter((f) => f.endsWith('.png')).map((f) => ({ model: m, file: f, key: f.replace(/-\d+\.png$/, '') })));
  const rows = [...new Set(files.map((f) => f.key))].sort();
  if (!rows.length) { console.log('no candidates yet'); return; }
  const W = 160 + models.length * CELL_W, H = LABEL + rows.length * CELL_H;
  const layers = [{ input: label(`${jobName}: ${models.join(' | ')}`, W, LABEL, 18), left: 0, top: 0 }];
  for (let r = 0; r < rows.length; r++) {
    const top = LABEL + r * CELL_H;
    layers.push({ input: label(rows[r], 160, LABEL, 15), left: 0, top: top + 4 });
    for (let c = 0; c < models.length; c++) {
      const f = files.find((x) => x.model === models[c] && x.key === rows[r]);
      const left = 160 + c * CELL_W;
      if (!f) { layers.push({ input: label('(missing)', CELL_W, LABEL), left, top: top + 4 }); continue; }
      const src = path.join(dir, f.model, f.file);
      const side = JSON.parse(fs.readFileSync(src.replace(/\.png$/, '.json'), 'utf8'));
      layers.push({ input: await sharp(src).resize(PANEL, PANEL, { fit: 'contain', background: '#eee' }).png().toBuffer(), left, top: top + LABEL });
      layers.push({ input: await sharp(src).resize(90, 90).png().toBuffer(), left, top: top + LABEL + PANEL + 10 });
      layers.push({ input: await sharp(src).resize(45, 45).png().toBuffer(), left: left + 100, top: top + LABEL + PANEL + 10 });
      layers.push({ input: label(`${side.model}  ${(side.ms / 1000).toFixed(0)}s`, PANEL - 160, LABEL, 13), left: left + 160, top: top + LABEL + PANEL + 10 });
    }
  }
  const out = path.join(dir, 'sheet.png');
  await sharp({ create: { width: W, height: H, channels: 4, background: '#f6f3ec' } }).composite(layers).png().toFile(out);
  console.log('wrote', path.relative(process.cwd(), out), `${W}x${H}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
