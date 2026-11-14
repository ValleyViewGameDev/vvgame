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
