// Helpers shared by shot scripts. Everything goes through the game's own dev hooks
// (window.__pixiCamera, __npcsDebug, __boardResources), so shots name tiles and things,
// never screen pixels.
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Screen position of the middle of a tile on the current board. */
export const tile = (page, x, y) => page.evaluate(([tx, ty]) => {
  const h = document.querySelector('.homestead').getBoundingClientRect();
  const p = window.__pixiCamera.worldToScreen((tx + 0.5) * 45, (ty + 0.5) * 45);
  return { x: h.left + p.x, y: h.top + p.y };
}, [x, y]);

export const clickTile = async (page, x, y, dy = 0) => { const p = await tile(page, x, y); await page.mouse.click(p.x, p.y + dy); };

/** Board resources matching a predicate source string, e.g. "r.type === 'Wheat'". */
export const resources = (page, test) => page.evaluate((t) => {
  const f = new Function('r', `return ${t}`); // eslint-disable-line no-new-func
  return window.__boardResources().filter((r) => r && f(r)).map((r) => ({ type: r.type, x: r.x, y: r.y }));
}, test);

export const npcs = async (page, test) => {
  // the hook is re-published by the renderer and can be missing for a moment after a zoom change
  await page.waitForFunction(() => typeof window.__npcsDebug === 'function' && window.__npcsDebug(), null, { timeout: 15000 });
  return page.evaluate((t) => {
    const f = new Function('n', `return ${t}`); // eslint-disable-line no-new-func
    return Object.values(window.__npcsDebug() || {}).filter((n) => n && n.position && f(n)).map((n) => ({ type: n.type, x: n.position.x, y: n.position.y, state: n.state }));
  }, test);
};

/** Known zoom: all the way out, then `stepsIn` presses in (4 = close, 5 = closer, 3 = farish). */
export async function zoomTo(page, stepsIn) {
  for (let i = 0; i < 6; i++) { await page.keyboard.press('-'); await sleep(450); }
  for (let i = 0; i < stepsIn; i++) { await page.keyboard.press('='); await sleep(450); }
  await sleep(1200);
}

/** Hide (or show) the open panel without closing it: a placement cursor stays armed. */
export const hidePanels = (page, on) => page.evaluate((v) => {
  let s = document.getElementById('capture-hide-panels');
  if (!s) { s = document.createElement('style'); s.id = 'capture-hide-panels'; document.head.appendChild(s); }
  s.textContent = v ? '.panel-container{opacity:0!important;pointer-events:none!important}' : '';
}, on);

export const closePanel = (page) => page.evaluate(() => document.querySelector('.panel-container .close-btn')?.click());
export const openNav = (page, name) => page.evaluate((n) => document.querySelector(`[data-nav="${n}"]`)?.click(), name);

/** Zoom by the camera's own scale, not by counting presses (presses can be dropped):
 *  closer 1.667, close 1, farish 0.556, far 0.311. A zoom change re-centres on the player. */
export async function zoomToScale(page, target) {
  for (let i = 0; i < 10; i++) {
    const z = await page.evaluate(() => window.__pixiCamera.getZoom());
    if (Math.abs(z - target) < 0.03) break;
    await page.keyboard.press(z < target ? '=' : '-');
    await sleep(750);
  }
  await sleep(600);
  return page.evaluate(() => window.__pixiCamera.getZoom());
}

/** Look at a tile instead of the player (the player must stand still: a step eases back). */
export async function lookAt(page, x, y, ms = 0) {
  await page.evaluate(([tx, ty, t]) => window.__pixiCamera.panToTile(tx, ty, t), [x, y, ms]);
  await sleep(ms + 250);
}

/** Screen positions for many tiles in one round trip (the camera must not move afterwards). */
export const tiles = (page, list) => page.evaluate((ts) => {
  const h = document.querySelector('.homestead').getBoundingClientRect();
  return ts.map((t) => { const p = window.__pixiCamera.worldToScreen((t.x + 0.5) * 45, (t.y + 0.5) * 45); return { x: h.left + p.x, y: h.top + p.y }; });
}, list);

/** Park the pointer in the bottom-right corner, out of the way of hover effects. */
export const park = (page) => { const v = page.viewportSize(); return page.mouse.move(v.width - 6, v.height - 6); };

/** Where the stored player is: { gtype, gridCoord, region }. */
export const whereAmI = (page) => page.evaluate(() => { const l = JSON.parse(localStorage.getItem('player') || '{}').location || {}; return { gtype: l.gtype, gridCoord: l.gridCoord, region: l.region }; });

/** Developer teleport through the Debug panel's Quick Travel list (`place` = an option's label,
 *  e.g. 'Belmont') or its grid coordinate box (`place` = a number). Waits for the new board. */
export async function teleport(page, place) {
  const before = (await whereAmI(page)).gridCoord;
  await sleep(700); // a panel that just closed leaves a ghost copy for its exit animation
  await page.evaluate(() => document.querySelector('button[aria-label="Debug"]')?.click());
  const select = page.locator('.panel-container select').filter({ hasText: 'Quick Travel' }).last();
  await select.waitFor({ timeout: 15000 });
  if (typeof place === 'number') await select.locator('xpath=following-sibling::input[1]').fill(String(place)); // the panel has a second "Enter GridCoord" box further down
  else await select.selectOption({ label: place });
  await sleep(300);
  await page.locator('.panel-container').getByRole('button', { name: 'Teleport', exact: true }).last().click();
  for (let i = 0; i < 60; i++) { await sleep(500); if ((await whereAmI(page)).gridCoord !== before) break; }
  await sleep(4500); // fade in, atlas, NPCs
  await closePanel(page);
  await sleep(500);
  return whereAmI(page);
}

/** The player's health as the server has it: { hp, maxhp }. */
export async function health(page) {
  const id = await page.evaluate(() => JSON.parse(localStorage.getItem('player') || '{}').playerId);
  const server = process.env.CAPTURE_SERVER || 'http://localhost:3001';
  const data = await (await fetch(`${server}/api/player/${id}`)).json();
  const p = data.player || data;
  return { hp: p.hp, maxhp: p.maxhp };
}

/** Refuse to start a take that goes among enemies when the player is not nearly at full health
 *  (a take in hostile places costs health, and a player who falls must pay gems or lose the backpack). */
export async function requireHealth(page, fraction = 0.8) {
  const h = await health(page);
  if (!(h.hp >= h.maxhp * fraction)) throw new Error(`health ${h.hp} / ${h.maxhp}: heal first (node capture.js shot heal)`);
  return h;
}

/** The player's tile as whole numbers. */
export const myTile = (page) => page.evaluate(() => { const t = window.__pixiCamera.debug().playerTile; return { x: Math.floor(t.x), y: Math.floor(t.y) }; });

/** A tile to tap so the player walks (or, afloat, sails: `water`) a good way and stays on screen:
 *  the farthest tile reachable over open ground within `dx` / `dy` tiles of the player, with a
 *  fairly direct route to it, nothing standing on it, and no enemy beside it. `toward` ({x, y},
 *  a direction) prefers that way; `inside` ({x0, x1, y0, y1}) keeps the target in a box of tiles. Returns { x, y, steps } or null. */
export const walkTarget = (page, { dx = 4, dy = 7, water = false, toward = null, min = 3, inside = null } = {}) => page.evaluate(([mx, my, wet, dir, least, box]) => {
  const tiles = window.__boardTiles();
  const me = window.__pixiCamera.debug().playerTile; const sx = Math.floor(me.x), sy = Math.floor(me.y);
  const H = tiles.length, W = tiles[0].length, key = (x, y) => y * 64 + x;
  const blocked = new Set(), enemy = [];
  for (const r of window.__boardResources() || []) {
    if (!r) continue;
    const w = r.sizeX || r.size || 1, h = r.sizeY || r.size || 1;
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) blocked.add(key(r.x + i, r.y - j));
  }
  for (const n of Object.values(window.__npcsDebug?.() || {})) {
    if (!n?.position) continue;
    blocked.add(key(Math.floor(n.position.x), Math.floor(n.position.y)));
    if (n.action === 'attack') enemy.push(n.position);
  }
  const open = (x, y) => x >= 1 && y >= 1 && x < W - 1 && y < H - 1 && (wet ? tiles[y][x] === 'w' : tiles[y][x] !== 'w') && !blocked.has(key(x, y));
  const dist = new Map([[key(sx, sy), 0]]); const queue = [[sx, sy]];
  let best = null, bestScore = -Infinity;
  while (queue.length) {
    const [x, y] = queue.shift(); const d = dist.get(key(x, y));
    const cheb = Math.max(Math.abs(x - sx), Math.abs(y - sy));
    if (cheb >= least && d <= cheb * 2 + 3 && (!box || (x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1)) && !enemy.some((e) => Math.hypot(e.x - x, e.y - y) < 2.5)) {
      const score = cheb + (dir ? ((x - sx) * dir.x + (y - sy) * dir.y) / Math.hypot(dir.x, dir.y) : 0) - (d - cheb) * 0.3;
      if (score > bestScore) { bestScore = score; best = { x, y, steps: d }; }
    }
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const nx = x + ox, ny = y + oy;
      if ((!ox && !oy) || Math.abs(nx - sx) > mx || Math.abs(ny - sy) > my || !open(nx, ny) || dist.has(key(nx, ny))) continue;
      dist.set(key(nx, ny), d + 1); queue.push([nx, ny]);
    }
  }
  return best;
}, [dx, dy, water, toward, min, inside]);

/** How many tiles fit between the player and the edge of the picture at the current zoom,
 *  less a margin: the reach of a tap, as { dx, dy }. */
export const tapReach = async (page, margin = 1.5) => {
  const z = await page.evaluate(() => window.__pixiCamera.getZoom());
  const v = page.viewportSize();
  return { dx: Math.floor(v.width / 2 / (45 * z) - margin), dy: Math.floor(v.height / 2 / (45 * z) - margin) };
};

/** Wait until the player stands on (x, y), or has stopped moving, or `ms` has passed. */
export async function arrive(page, x, y, ms = 4000) {
  const until = Date.now() + ms; let last = null, still = 0;
  while (Date.now() < until) {
    const t = await myTile(page);
    if (t.x === x && t.y === y) return true;
    if (last && last.x === t.x && last.y === t.y) { if (++still > 8) return false; } else still = 0;
    last = t;
    await sleep(80);
  }
  return false;
}

/** Heal to full at Titania's Bower (a Fairy heals 75 for one Feverfew), when below `fraction`
 *  of full health. Spends Feverfew for real. Leaves the player at Titania's Bower. */
export async function healUp(page, fraction = 0.85) {
  const before = await health(page);
  if (before.hp >= before.maxhp * fraction) return before;
  if ((await whereAmI(page)).region !== "Titania's Bower") await teleport(page, 'Titania');
  await zoomToScale(page, 1);
  const me = await myTile(page);
  const [fairy] = (await npcs(page, "n.type === 'Fairy'")).sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y));
  await lookAt(page, fairy.x, fairy.y, 300);
  await clickTile(page, fairy.x, fairy.y, -10);
  await page.waitForSelector('.panel-container', { timeout: 60000 });
  await sleep(1200);
  const heal = page.locator('.panel-container button').filter({ hasText: 'Heals:' }).first();
  for (let i = 0; i < 16; i++) {
    const [hp, max] = await page.evaluate(() => (document.querySelector('.panel-container').innerText.match(/(\d+)\s*\/\s*(\d+)/) || []).slice(1).map(Number));
    if (!(hp < max)) break;
    await heal.click();
    await sleep(900);
  }
  await sleep(2500);
  await closePanel(page);
  await sleep(1500);
  const after = await health(page);
  console.log('healed', JSON.stringify(before), '->', JSON.stringify(after));
  return after;
}
