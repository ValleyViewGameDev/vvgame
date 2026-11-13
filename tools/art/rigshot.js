#!/usr/bin/env node
/**
 * rigshot: render a rigged figure with the game's REAL arm code, without the game (docs/arm-rig-plan.md §6).
 *
 * The cut (ArmRig.cutRig), the skinned arm (ArmRig), the body (BreathSprite) and the clips (armClips.js)
 * are the client's own files, copied into a scratch folder with their imports pointed at a browser
 * build of Pixi, and run in headless Chrome. So what this draws is what the board draws: use it to
 * check a rig's outlines, the body's underpaint and every beat of a clip before anyone opens the game.
 *
 *   node tools/art/rigshot.js --art <png> --rig <key in rigs.json> --out <png>
 *        [--view cut]                      the drawing with the rig drawn over it, the body alone, each limb alone
 *        [--clip swipe --times 0,130,260,400,520,780]   one frame per time (ms) of the clip
 *        [--lead R] [--lean 1] [--mirror] [--px 384] [--top 0.3] [--pad 0.3] [--cols 6] [--walk] [--bg 76aa16] [--rigs <other rigs.json>]
 *
 * --lean 1 plays the clip's body lean toward the image's right (-1: left). --mirror flips the sprite, as
 * the board does for a figure facing the other way. --walk steps the legs under the clip.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'game-client', 'src', 'Render', 'PixiRenderer');
const PIXI_MJS = path.join(ROOT, 'game-client', 'node_modules', 'pixi.js-legacy', 'dist', 'pixi-legacy.min.mjs');
const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : null)).filter(Boolean));
if (!args.art || !args.rig || !args.out) { console.error('need --art <png> --rig <rigs.json key> --out <png>'); process.exit(1); }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rigshot-'));
const rigsFile = args.rigs ? path.resolve(args.rigs) : path.join(SRC, 'rigs.json');
// the client's modules, with their two non-browser imports rewritten
for (const f of ['ArmRig.js', 'armClips.js', 'BreathSprite.js', 'breathing.js', 'walking.js']) {
  let s = fs.readFileSync(path.join(SRC, f), 'utf8');
  s = s.replace(/from 'pixi\.js-legacy'/g, "from './pixi.mjs'");
  s = s.replace(/import RIGS from '\.\/rigs\.json';/, `const RIGS = ${fs.readFileSync(rigsFile, 'utf8')};`);
  s = s.replace(/from '(\.\/[A-Za-z]+)'/g, "from '$1.js'");
  fs.writeFileSync(path.join(dir, f), s);
}
fs.copyFileSync(PIXI_MJS, path.join(dir, 'pixi.mjs'));
fs.copyFileSync(path.resolve(args.art), path.join(dir, 'art.png'));

const params = {
  rig: args.rig, view: args.view || (args.clip || args.walk || args.times ? 'clip' : 'cut'), clip: args.clip || null,
  times: String(args.times || '0').split(',').map(Number), lead: args.lead || 'R', lean: Number(args.lean || 0),
  mirror: !!args.mirror, px: Number(args.px || 384), walk: !!args.walk, bg: args.bg || '76aa16', top: Number(args.top || 0.3), pad: Number(args.pad || 0.3), cols: Number(args.cols || 0),
};
fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><meta charset="utf-8"><body style="margin:0"><script type="module" src="./harness.js"></script>`);
fs.writeFileSync(path.join(dir, 'harness.js'), `
import * as PIXI from './pixi.mjs';
import BreathSprite from './BreathSprite.js';
import { rigFor, cutRig, syncArmRig } from './ArmRig.js';
const P = ${JSON.stringify(params)};
const fail = (m) => fetch('/fail', { method: 'POST', body: String(m && m.stack || m) });
window.addEventListener('error', (e) => fail(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => fail(e.reason));
let fake = 100000; performance.now = () => fake;
const S = P.px, PAD = Math.round(S * P.pad), TOP = Math.round(S * P.top), CW = S + PAD * 2, CH = S + TOP; // room round the square: a raised arm leaves it
const app = new PIXI.Application({ width: CW, height: CH, backgroundColor: parseInt(P.bg, 16), preserveDrawingBuffer: true, antialias: true, autoStart: false });
const tex = await PIXI.Assets.load('./art.png');
const rig = rigFor(P.rig);
if (!rig) throw new Error('no rig named ' + P.rig);
const cut = cutRig(app.renderer, tex, rig);
const frames = [];
const snap = (label) => { const c = document.createElement('canvas'); c.width = CW; c.height = CH; const x = c.getContext('2d'); x.drawImage(app.view, 0, 0); x.fillStyle = '#fff'; x.font = '13px sans-serif'; x.fillText(label, 6, 16); frames.push(c); };
const show = (obj, label, twice) => { app.stage.removeChildren(); app.stage.addChild(obj); app.renderer.render(app.stage); if (twice) app.renderer.render(app.stage); snap(label); };
const place = (o) => { o.anchor.set(0.5, 1); o.width = S; o.height = S; o.position.set(CW / 2, CH - 4); return o; };
if (P.view === 'cut') {
  // the drawing with the rig over it
  const base = place(new PIXI.Sprite(tex)), g = new PIXI.Graphics(), box = new PIXI.Container();
  box.addChild(base, g);
  const X = (u) => CW / 2 - S / 2 + u * S, Y = (v) => CH - 4 - S + v * S;
  const poly = (pts, colour) => { if (!pts) return; g.lineStyle(1.5, colour, 1); pts.forEach(([u, v], i) => (i ? g.lineTo(X(u), Y(v)) : g.moveTo(X(u), Y(v)))); g.lineTo(X(pts[0][0]), Y(pts[0][1])); };
  for (const arm of Object.values(rig.arms || {})) {
    poly(arm.upper || arm.outline, 0x00e5ff); poly(arm.fore, 0xffe100); poly(arm.under, 0xff3df2);
    g.lineStyle(1, 0xffffff, 0.9);
    if (arm.elbow && arm.cap) g.drawCircle(X(arm.elbow[0]), Y(arm.elbow[1]), arm.cap * S);
    if (arm.shoulderCap) g.drawCircle(X(arm.shoulder[0]), Y(arm.shoulder[1]), arm.shoulderCap * S);
    g.lineStyle(0);
    for (const [j, colour] of [[arm.shoulder, 0xff0000], [arm.elbow, 0xff8800], [arm.grip, 0x00ff00], [arm.tip, 0x0044ff]]) if (j) { g.beginFill(colour); g.drawCircle(X(j[0]), Y(j[1]), 4); g.endFill(); }
  }
  show(box, 'rig over the drawing (upper cyan, fore yellow, under pink; shoulder red, elbow orange, grip green, tip blue)');
  show(place(new PIXI.Sprite(cut.body)), 'the body alone: arms cut away, torso painted in');
  for (const [name, part] of Object.entries(cut.arms)) show(place(new PIXI.Sprite(part.tex)), 'limb ' + name + ' alone');
} else {
  const sprite = place(new BreathSprite(cut.body));
  if (P.mirror) sprite.scale.x = -Math.abs(sprite.scale.x);
  app.stage.addChild(sprite);
  syncArmRig(sprite, rig, cut, { attackClip: P.clip });
  app.renderer.render(app.stage); app.renderer.render(app.stage);
  if (P.walk) { sprite.walking = true; sprite.walkSideways = true; sprite.walkCycleMs = 900; }
  const t0 = fake;
  if (P.clip) sprite.armRig.playClip(P.clip, P.lead, P.lean);
  for (const t of P.times) {
    fake = t0 + t;
    app.renderer.render(app.stage); app.renderer.render(app.stage); // twice: an attached part reads the body's last drawn frame
    snap((P.clip || 'rest') + ' ' + t + ' ms' + (P.mirror ? ' (mirrored)' : ''));
  }
}
const cols = Math.min(frames.length, P.cols || (P.view === 'cut' ? 4 : 6)), rows = Math.ceil(frames.length / cols);
const sheet = document.createElement('canvas'); sheet.width = cols * CW; sheet.height = rows * CH;
const sx = sheet.getContext('2d');
frames.forEach((f, i) => sx.drawImage(f, (i % cols) * CW, Math.floor(i / cols) * CH));
sheet.toBlob((b) => fetch('/save', { method: 'POST', body: b }), 'image/png');
`);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png' };
let chrome = null;
const finish = (code, msg) => { if (msg) console.log(msg); try { chrome && chrome.kill(); } catch (e) { /* gone */ } server.close(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* leave it */ } process.exit(code); };
const server = http.createServer((req, res) => {
  if (req.method === 'POST') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      res.end('ok');
      const body = Buffer.concat(chunks);
      if (req.url === '/save') { fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true }); fs.writeFileSync(path.resolve(args.out), body); finish(0, `wrote ${args.out}`); }
      else finish(2, `the page failed: ${body.toString().slice(0, 1200)}`);
    });
    return;
  }
  const file = path.join(dir, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(dir) || !fs.existsSync(file)) { res.statusCode = 404; res.end('not found'); return; }
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});
server.listen(0, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}/`;
  chrome = spawn(CHROME, ['--headless=new', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${path.join(dir, 'profile')}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars', url], { stdio: 'ignore' });
  chrome.on('error', (e) => finish(2, `cannot start Chrome (${CHROME}): ${e.message}`));
  setTimeout(() => finish(2, 'timed out after 60 s'), 60000);
});
