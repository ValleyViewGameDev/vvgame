#!/usr/bin/env node
// What is on the signed-in player's current board: `node survey.js [out.json]`.
// Prints the player tile, a count of resources by type, the NPCs, and saves a far-zoom
// screenshot beside the JSON. Used to plan a shot script; changes nothing in the game.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || path.join(HERE, 'survey.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ctx = await chromium.launchPersistentContext(path.join(HERE, '.profile'), { channel: 'chrome', headless: true, viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
try {
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto(process.env.CAPTURE_URL || 'http://localhost:3000');
  await page.waitForSelector('.homestead canvas', { timeout: 60000 });
  await sleep(7000);
  const data = await page.evaluate(() => {
    const res = (window.__boardResources?.() || []).filter(Boolean);
    const npcs = Object.values(window.__npcsDebug?.() || {}).map((n) => ({ type: n.type, x: n.position?.x, y: n.position?.y, state: n.state, action: n.action }));
    return {
      player: window.__pixiCamera?.debug?.()?.playerTile,
      stored: (() => { try { const p = JSON.parse(localStorage.getItem('player') || 'null'); return p && { username: p.username, location: p.location }; } catch (_) { return null; } })(),
      resources: res.map((r) => ({ type: r.type, x: r.x, y: r.y, category: r.category, growEnd: r.growEnd, craftEnd: r.craftEnd, craftedItem: r.craftedItem, output: r.output })),
      npcs,
    };
  });
  fs.writeFileSync(out, JSON.stringify(data));
  document: for (let i = 0; i < 3; i++) { await page.keyboard.press('-'); await sleep(400); }
  await page.evaluate(() => document.documentElement.classList.add('dev-capture-mode'));
  await sleep(1500);
  await page.screenshot({ path: out.replace(/\.json$/, '.png') });
  const counts = {};
  data.resources.forEach((r) => { counts[`${r.category}:${r.type}`] = (counts[`${r.category}:${r.type}`] || 0) + 1; });
  console.log(JSON.stringify({ player: data.player, stored: data.stored, npcs: data.npcs, counts }, null, 1));
} finally { await ctx.close(); }
