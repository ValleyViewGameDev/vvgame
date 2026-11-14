#!/usr/bin/env node
// Automatic edit for a captured shot (docs/social-video-plan.md §7).
//
//   node edit.js <name>      reads edits/<name>.json, writes ads/video/final/<output>
//
// An edit names its source recording (ads/video/raw/<source>/<source>.rec + .marks.json, made
// by capture.js), the marks to cut from and to, captions placed between marks, and an end
// card. Captions and the end card are drawn by Chrome (so they use the game's own web fonts
// and CSS) as transparent 1080x1920 PNGs and laid over the video by ffmpeg, which also sets
// a constant 30 fps and encodes H.264 + AAC.
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const W = 1080, H = 1920, FPS = 30;
// Text stays inside the box every platform leaves clear (plan §3): 250 top, 450 bottom.
const CAPTION_BOTTOM = 470;

const FONTS = '<link href="https://fonts.googleapis.com/css2?family=Berkshire+Swash&family=Lora:wght@500;700&display=swap" rel="stylesheet">';
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const captionHtml = (text) => `<!doctype html><html><head>${FONTS}<style>
  html,body{margin:0;width:${W}px;height:${H}px;background:transparent}
  .c{position:absolute;left:70px;right:140px;bottom:${CAPTION_BOTTOM}px;text-align:center;
     font:400 84px/1.1 'Berkshire Swash',serif;color:#fff;
     -webkit-text-stroke:10px #1d2b06;paint-order:stroke fill;
     text-shadow:0 6px 14px rgba(0,0,0,.55)}
</style></head><body><div class="c">${esc(text)}</div></body></html>`;

const endCardHtml = (card, logo) => `<!doctype html><html><head>${FONTS}<style>
  html,body{margin:0;width:${W}px;height:${H}px;background:#77ac0d}
  .w{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:56px;
     background:radial-gradient(ellipse at 50% 42%,#93c626 0%,#77ac0d 55%,#5d8a08 100%)}
  img{width:760px;padding:44px 56px;border-radius:36px;background:#fffbb3;box-shadow:0 14px 30px rgba(0,0,0,.35)} /* the logo is green: it needs the cream panel under it */
  .l{font:400 76px/1.1 'Berkshire Swash',serif;color:#fffbb3;text-shadow:0 4px 8px rgba(0,0,0,.4)}
  .u{font:700 52px/1 'Lora',serif;color:#fff;letter-spacing:.01em;text-shadow:0 3px 6px rgba(0,0,0,.4)}
</style></head><body><div class="w"><img src="${logo}"><div class="l">${esc(card.line)}</div><div class="u">${esc(card.url)}</div></div></body></html>`;

async function renderPngs(jobs) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  for (const j of jobs) {
    await page.setContent(j.html, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: j.file, omitBackground: j.transparent });
  }
  await browser.close();
}

const name = process.argv[2];
if (!name) { console.log('usage: node edit.js <name>'); process.exit(1); }
const edit = JSON.parse(fs.readFileSync(path.join(HERE, 'edits', `${name}.json`), 'utf8'));
// A segment may name its own `source` take; the edit's `source` is the default.
const takes = {};
// A take is named `<folder>` (file of the same name) or `<folder>/<name>`.
const takePath = (src, ext) => { const [dir, name = dir] = src.split('/'); return path.join(REPO, 'ads/video/raw', dir, `${name}.${ext}`); };
const take = (src) => (takes[src] ||= { rec: takePath(src, 'rec'), marks: JSON.parse(fs.readFileSync(takePath(src, 'marks.json'), 'utf8')).marks, input: Object.keys(takes).length });
const at = (label, src = edit.source) => { const m = take(src).marks.find((x) => x.label === label); if (!m) throw new Error(`no mark "${label}" in ${src}`); return m.t; };

// Segments: pieces of the take, in output order, each optionally sped up. An edit without
// `segments` is one segment from `from` to `to`.
const segs = (edit.segments || [{ from: edit.from, to: edit.to }]).map((g) => {
  const src = g.source || edit.source;
  const a = at(g.from, src) + (g.fromOffset || 0), b = at(g.to, src) + (g.toOffset || 0), speed = g.speed || 1;
  return { ...g, src, input: take(src).input, a, b, speed, len: (b - a) / speed };
});
let cursor = 0;
segs.forEach((g) => { g.start = cursor; cursor += g.len; });
const body = cursor;
// A caption sits on one segment (`segment` index, optional `start` / `end` seconds within it;
// `toSegment` carries it across to a later one),
// or between two marks of a single-segment edit (`from` / `to`).
const capTimes = (c) => {
  if (c.segment !== undefined) { const g = segs[c.segment], h = segs[c.toSegment !== undefined ? c.toSegment : c.segment]; return [g.start + (c.start || 0), c.end !== undefined ? g.start + c.end : h.start + h.len - 0.3]; } // ends early: joined segments drift a few frames from the sum
  return [(at(c.from) - segs[0].a) / segs[0].speed, (at(c.to) - segs[0].a) / segs[0].speed];
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soe-edit-'));
const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(REPO, 'ads/brand/SoELogo.png')).toString('base64');
const caps = (edit.captions || []).map((c, i) => { const [a, b] = capTimes(c); return { ...c, file: path.join(tmp, `cap${i}.png`), a, b }; });
const card = edit.endCard ? { ...edit.endCard, file: path.join(tmp, 'end.png') } : null;
await renderPngs([
  ...caps.map((c) => ({ html: captionHtml(c.text), file: c.file, transparent: true })),
  ...(card ? [{ html: endCardHtml(card, logo), file: card.file, transparent: false }] : []),
]);

// ffmpeg graph: cut and retime each segment, join them, captions over the result, end card after.
// The recording carries no usable sound (headless), so the output is silent until music is added.
const nTakes = Object.keys(takes).length;
const args = ['-y', '-v', 'error'];
Object.values(takes).forEach((t) => args.push('-i', t.rec));
caps.forEach((c) => args.push('-loop', '1', '-t', body.toFixed(3), '-i', c.file));
if (card) args.push('-loop', '1', '-t', String(card.seconds), '-i', card.file);
const f = [];
Object.values(takes).forEach((t) => { const mine = segs.map((g, i) => (g.input === t.input ? `[s${i}]` : '')).filter(Boolean); f.push(`[${t.input}:v]split=${mine.length}${mine.join('')}`); });
segs.forEach((g, i) => f.push(`[s${i}]trim=start=${g.a.toFixed(3)}:end=${g.b.toFixed(3)},setpts=(PTS-STARTPTS)/${g.speed},fps=${FPS},scale=${Math.round(W * (g.scale || 1) / 2) * 2}:${Math.round(H * (g.scale || 1) / 2) * 2}:flags=lanczos,crop=${W}:${H},format=yuv420p,setsar=1[g${i}]`)); // `scale` > 1 crops in on the middle (a square board in a tall frame)
f.push(`${segs.map((_, i) => `[g${i}]`).join('')}concat=n=${segs.length}:v=1:a=0[v0]`);
let last = 'v0';
caps.forEach((c, i) => {
  f.push(`[${i + nTakes}:v]format=rgba,fade=t=in:st=${c.a.toFixed(3)}:d=0.2:alpha=1,fade=t=out:st=${(c.b - 0.2).toFixed(3)}:d=0.2:alpha=1[c${i}]`);
  f.push(`[${last}][c${i}]overlay=0:0:enable='between(t,${c.a.toFixed(3)},${c.b.toFixed(3)})'[v${i + 1}]`);
  last = `v${i + 1}`;
});
let total = body;
if (card) {
  f.push(`[${caps.length + nTakes}:v]fps=${FPS},scale=${W}:${H},format=yuv420p,setsar=1[end]`);
  f.push(`[${last}]setsar=1[bodyv]`, `[bodyv][end]concat=n=2:v=1:a=0[vout]`);
  total += card.seconds;
} else f.push(`[${last}]null[vout]`);

const outFile = path.join(REPO, 'ads/video/final', edit.output);
args.push('-filter_complex', f.join(';'), '-map', '[vout]', '-an');
args.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', '-t', total.toFixed(3), outFile);
execFileSync('ffmpeg', args, { stdio: 'inherit' });
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`wrote ${path.relative(REPO, outFile)} (${(fs.statSync(outFile).size / 1e6).toFixed(1)} MB, ${total.toFixed(1)} s)`);
segs.forEach((g, i) => console.log(`  segment ${i}: ${g.from} -> ${g.to}  x${g.speed}  ${g.start.toFixed(1)}s to ${(g.start + g.len).toFixed(1)}s`));
