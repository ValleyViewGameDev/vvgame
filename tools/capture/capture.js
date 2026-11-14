#!/usr/bin/env node
// Scripted gameplay capture for ad videos (docs/social-video-plan.md).
//
//   node capture.js login                 open the capture browser so you can sign in once
//   node capture.js shot <name> [--headed] play shots/<name>.js and record it
//
// The capture browser is the installed Google Chrome driven by playwright-core, with its own
// profile in tools/capture/.profile (so the sign-in survives between runs and your everyday
// Chrome is untouched). A shot is a module in shots/: { device?, setup(page), run(page, t) }.
// setup() runs before recording starts (go somewhere, wait for the board); run() is the take.
//
// Recording is the tab recording itself (getDisplayMedia + MediaRecorder inside the page):
// everything the tab draws, DOM panels and modals included, plus its sound, in real time.
// Chunks are handed to Node as they arrive and written to ads/video/raw/<name>/<name>.webm;
// `edit.js` turns that into the finished MP4.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const PROFILE = path.join(HERE, '.profile');
const GAME_URL = process.env.CAPTURE_URL || 'http://localhost:3000';
// The page is PHONE-sized in CSS pixels and drawn at a high pixel density, so the game serves
// its real mobile layout (panels, type and buttons at the size a phone shows them) and the
// recording is sharp: 432 x 768 (a large phone) at 2x. Chrome's tab recording never exceeds 2x,
// so the take is 864 x 1536 and edit.js scales it to 1080 x 1920. A page of 1080 x 1920 CSS
// pixels gets the desktop layout, where a 280 px panel is a sliver of the frame; 360 x 640 at 3x
// recorded corrupt frames. A shot may set its own `device`.
const DEFAULT_DEVICE = { viewport: { width: 432, height: 768 }, scale: 2, mobile: true };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openBrowser({ headless, viewport, scale = 1, mobile = false }) {
  return chromium.launchPersistentContext(PROFILE, {
    channel: 'chrome',
    headless,
    viewport,
    ...(viewport ? { deviceScaleFactor: scale, isMobile: mobile, hasTouch: mobile } : {}),
    ignoreDefaultArgs: ['--mute-audio'],
    args: [
      '--auto-accept-this-tab-capture',          // getDisplayMedia({preferCurrentTab}) without a picker
      '--autoplay-policy=no-user-gesture-required',
      '--hide-scrollbars',
      '--enable-gpu',
      '--use-angle=metal',
    ],
  });
}

async function login() {
  const ctx = await openBrowser({ headless: false, viewport: null });
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto(GAME_URL);
  console.log('Sign in to the game in the window that opened, then close the window.');
  // On a Mac closing the window leaves Chrome running (and the profile locked): quit it ourselves.
  await new Promise((resolve) => {
    ctx.on('close', resolve);
    ctx.on('page', (p) => p.on('close', () => { if (!ctx.pages().length) resolve(); }));
    page.on('close', () => { if (!ctx.pages().length) resolve(); });
  });
  await ctx.close().catch(() => {});
}

// In-page recorder. Started from a key press so the browser sees a user gesture.
function installRecorder() {
  window.__rec = { state: 'idle', error: null };
  window.__recStart = async (opts) => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: opts.fps, width: opts.width, height: opts.height },
        audio: true,
        preferCurrentTab: true,
      });
      // The stream can start at 1x and step up to 2x a moment later; a size change after the
      // recorder has started corrupts the file. Watch the stream in a <video> until it is full size.
      const probe = document.createElement('video');
      probe.muted = true; probe.srcObject = stream;
      await probe.play().catch(() => {});
      const want = Math.min(opts.width, opts.cssWidth * 2) * 0.95;
      for (let i = 0; i < 40 && probe.videoWidth < want; i++) await new Promise((r) => setTimeout(r, 100));
      const startWidth = probe.videoWidth;
      probe.srcObject = null;
      const mime = [opts.mime, 'video/mp4;codecs=avc1.640033,mp4a.40.2', 'video/webm;codecs=h264,opus', 'video/webm;codecs=vp9,opus', 'video/webm']
        .find((m) => m && MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: opts.bitrate });
      let pending = Promise.resolve();
      rec.ondataavailable = (e) => {
        if (!e.data || !e.data.size) return;
        pending = pending.then(async () => {
          const buf = new Uint8Array(await e.data.arrayBuffer());
          let s = '';
          for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
          await window.__recChunk(btoa(s));
        });
      };
      window.__recStop = () => new Promise((resolve) => {
        rec.onstop = () => pending.then(() => { stream.getTracks().forEach((t) => t.stop()); resolve(); });
        rec.stop();
      });
      rec.start(500);
      // The page's own frame rate while recording, so a slow take is visible in the log.
      const f = { n: 0, t0: performance.now(), worst: 0, last: performance.now() };
      const tick = (now) => { f.n++; f.worst = Math.max(f.worst, now - f.last); f.last = now; if (window.__rec.state === 'recording') requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      window.__recFps = () => ({ fps: Math.round(f.n / ((performance.now() - f.t0) / 1000)), worstFrameMs: Math.round(f.worst) });
      const vt = stream.getVideoTracks()[0].getSettings();
      window.__rec = { state: 'recording', mime, width: startWidth, fps: vt.frameRate, audio: stream.getAudioTracks().length };
    } catch (err) {
      window.__rec = { state: 'error', error: String(err && err.message || err) };
    }
  };
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F9' && window.__recOpts) { e.preventDefault(); e.stopImmediatePropagation(); window.__recStart(window.__recOpts); }
  }, true);
}

async function shot(name, { headed }) {
  const mod = await import(pathToFileURL(path.join(HERE, 'shots', `${name}.js`)).href);
  const def = mod.default;
  const device = def.device || DEFAULT_DEVICE;
  const { viewport } = device;
  const out1080 = { width: Math.round(viewport.width * device.scale), height: Math.round(viewport.height * device.scale) };
  const outDir = path.join(REPO, 'ads/video/raw', def.folder || name);
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${name}.rec`); // container is whatever the recorder chose; edit.js probes it
  const partFile = `${outFile}.part`;                // a failed take never replaces the last good one
  const out = fs.createWriteStream(partFile);

  const ctx = await openBrowser({ headless: !headed, ...device });
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.exposeFunction('__recChunk', (b64) => { out.write(Buffer.from(b64, 'base64')); });
  await page.addInitScript(installRecorder);
  // The dev client reloads the page whenever a source file is saved (webpack's /ws socket),
  // which would end a take half way. The capture browser never opens that socket.
  await page.addInitScript(() => {
    const Real = window.WebSocket;
    window.WebSocket = function (url, protocols) {
      if (/\/ws(\?|$)/.test(String(url))) return { readyState: 0, close() {}, send() {}, addEventListener() {}, removeEventListener() {} };
      return protocols === undefined ? new Real(url) : new Real(url, protocols);
    };
    window.WebSocket.prototype = Real.prototype;
    Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  });
  page.on('pageerror', (e) => console.log('[page error]', e.message));

  let t0 = 0;
  const marks = [];
  try { // always close the browser: a leftover one keeps the profile locked
    const helpers = { sleep, GAME_URL, captureMode: (on) => page.evaluate((v) => document.documentElement.classList.toggle('dev-capture-mode', v), on) };
    await page.goto(def.url ? def.url(GAME_URL) : GAME_URL);
    if (def.setup) await def.setup(page, helpers);
    await helpers.captureMode(true);
    await sleep(500);

    await page.evaluate((o) => { window.__recOpts = o; }, { fps: 60, width: out1080.width, height: out1080.height, cssWidth: viewport.width, bitrate: 30_000_000, mime: process.env.CAPTURE_MIME || null });
    await page.keyboard.press('F9');
    await page.waitForFunction(() => window.__rec && window.__rec.state !== 'idle', null, { timeout: 15000 });
    const info = await page.evaluate(() => window.__rec);
    if (info.state !== 'recording') throw new Error(`recording did not start: ${info.error}`);
    console.log('recording', info);

    t0 = Date.now();
    const mark = (label) => { marks.push({ label, t: (Date.now() - t0) / 1000 }); };
    await def.run(page, { ...helpers, mark });
    console.log('page', await page.evaluate(() => (window.__recFps ? window.__recFps() : 'the page reloaded during the take')));
    await page.evaluate(() => window.__recStop());
    await new Promise((r) => out.end(r));
  } catch (err) {
    await ctx.close();
    out.destroy();
    fs.rmSync(partFile, { force: true });
    throw err;
  }
  await ctx.close();
  // A take that is not at least 2x the page, or that does not decode cleanly, is not kept.
  const probeOut = (args) => spawnSync('ffprobe', ['-v', 'error', ...args, partFile], { encoding: 'utf8' });
  const gotWidth = Number(probeOut(['-select_streams', 'v:0', '-show_entries', 'stream=width', '-of', 'csv=p=0']).stdout.trim());
  // (timestamp warnings from the null muxer are normal; broken picture data is not)
  const decodeErrors = /error while decoding/.test(spawnSync('ffmpeg', ['-v', 'error', '-i', partFile, '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stderr);
  if (gotWidth < Math.min(out1080.width, viewport.width * 2) * 0.95 || decodeErrors) {
    fs.rmSync(partFile, { force: true });
    throw new Error(`bad take (width ${gotWidth}${decodeErrors ? ', decode errors' : ''}): record it again`);
  }
  fs.renameSync(partFile, outFile);
  fs.writeFileSync(path.join(outDir, `${name}.marks.json`), JSON.stringify({ name, seconds: (Date.now() - t0) / 1000, marks }, null, 2));

  console.log(`wrote ${path.relative(REPO, outFile)} (${(fs.statSync(outFile).size / 1e6).toFixed(1)} MB)`);
}

const [cmd, name, ...rest] = process.argv.slice(2);
if (cmd === 'login') await login();
else if (cmd === 'shot' && name) await shot(name, { headed: rest.includes('--headed') });
else { console.log('usage: node capture.js login | shot <name> [--headed]'); process.exit(1); }
