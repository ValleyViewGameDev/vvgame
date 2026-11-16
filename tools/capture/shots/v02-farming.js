// V2 Farming (docs/social-video-plan.md §5), one take on the player's own homestead, close in:
// click-harvest the mixed crop field, replant every tile with the crop it had, watch the Wheat
// grow (1 minute), collect from the ready animals, sell to Kent, pull back. The edit speeds
// these up and orders them.
// This PLAYS the account: it harvests, plants and sells for real. The field keeps its layout
// (each tile is replanted with its own crop) but only the Wheat is ripe again within the take.
import { sleep, clickTile, resources, npcs, zoomToScale, lookAt, tiles, hidePanels, closePanel, openNav, park } from './lib.js';

// The fenced field north of the farmhouse (owner's layout, 2026-11-14): columns of Wheat,
// Carrot, Corn, Pepper, Onion and Sugarcane at x 24-32, y 16-26. Nine columns fill a phone
// frame at the normal zoom (about 10 x 17 tiles).
const BOX = { x0: 24, x1: 32, y0: 16, y1: 26 };
const FIELD = { x: 28, y: 21 };
const STAND = { x: 27, y: 28 };      // on the path just south of the field
const PLOT = { Wheat: 'Wheat Plot', Carrot: 'Carrot Plot', Corn: 'Corn Plot', Pepper: 'Pepper Plot', Onion: 'Onion Plot', Sugarcane: 'Sugarcane Plot' };
const IN_BOX = `r.x >= ${BOX.x0} && r.x <= ${BOX.x1} && r.y >= ${BOX.y0} && r.y <= ${BOX.y1}`;
const CLICK_MS = 240; // the server saves the whole grid per action, one at a time: faster clicks pile up and later ones are refused or lost
const DRAIN_MS = 6000; // let the server finish one pass before the next touches the same tiles

// The Farming panel's entry for a plot: click it (works while the panel is invisible), or ask
// whether it can be planted now.
const plotEntry = (page, name, click) => page.evaluate(([n, doClick]) => {
  const panel = [...document.querySelectorAll('.panel-container[data-panel-name="FarmingPanel"]')].pop();
  const entry = panel && panel.querySelector(`[data-resource-type="${n}"] button.resource-button`);
  if (!entry) return null;
  const blocked = entry.disabled || /Off season/i.test(entry.innerText);
  if (doClick && !blocked) entry.click();
  return !blocked;
}, [name, click]);

// The field's columns, west to east (x 24..32): what an EMPTY tile is planted with. A take that
// could not replant (2026-11-15: the panel closes on a pick now, so only the first crop went in)
// leaves bare tiles; the next take fills them, so the field always ends whole.
const COLUMN = ['Wheat', 'Wheat', 'Carrot', 'Carrot', 'Corn', 'Pepper', 'Onion', 'Sugarcane', 'Sugarcane'];
const MIN_RIPE = Number(process.env.MIN_RIPE || 40);

let crops = [];   // [{ type, x, y }] to harvest and replant, set in setup
let bare = [];    // [{ type, x, y }] empty tiles of the field, planted with their column's crop

export default {
  async setup(page) {
    await page.waitForSelector('.homestead canvas', { timeout: 60000 });
    await sleep(6000);
    if (await page.locator('.modal-overlay--scene').count()) throw new Error('not signed in: run `node capture.js login` first');
    await zoomToScale(page, 1);
    // Stand by the field: a tap far out of range walks instead of harvesting.
    const me = () => page.evaluate(() => window.__pixiCamera.debug().playerTile);
    for (let attempt = 0; attempt < 3; attempt++) {
      const p = await me();
      if (Math.hypot(p.x - STAND.x - 0.5, p.y - STAND.y - 0.5) < 2) break;
      await lookAt(page, STAND.x, STAND.y, 300);
      await clickTile(page, STAND.x, STAND.y);
      for (let i = 0; i < 40; i++) { await sleep(500); const q = await me(); if (Math.hypot(q.x - STAND.x - 0.5, q.y - STAND.y - 0.5) < 2) break; }
    }
    // Only crops whose plot can be planted again now are harvested, so the layout survives.
    await openNav(page, 'FarmingPanel');
    await sleep(1200);
    const plantable = {};
    for (const [crop, plot] of Object.entries(PLOT)) plantable[crop] = !!(await plotEntry(page, plot, false));
    await closePanel(page);
    await sleep(900);
    crops = (await resources(page, `${IN_BOX} && ${JSON.stringify(Object.keys(PLOT))}.includes(r.type)`))
      .filter((r) => plantable[r.type]).sort((a, b) => a.x - b.x || a.y - b.y);
    console.log('plantable:', JSON.stringify(plantable), '| ripe crops to harvest:', crops.length);
    const taken = new Set((await resources(page, IN_BOX)).map((r) => `${r.x},${r.y}`));
    bare = [];
    for (let x = BOX.x0; x <= BOX.x1; x++) for (let y = BOX.y0; y <= BOX.y1; y++) if (!taken.has(`${x},${y}`)) bare.push({ type: COLUMN[x - BOX.x0], x, y });
    console.log('bare tiles to fill:', bare.length);
    if (crops.length < MIN_RIPE) throw new Error(`only ${crops.length} ripe crops in the field: wait for it to grow`);
    await zoomToScale(page, 25 / 45);
    await park(page);
    await sleep(1000);
  },
  async run(page, { mark }) {
    // Open wide on the homestead, push in to the normal zoom, then settle on the field (rule:
    // the zoom changes on camera in every video).
    mark('intro');
    await sleep(1100);
    await page.keyboard.press('=');
    await sleep(1100);
    await lookAt(page, FIELD.x, FIELD.y, 800);
    await sleep(300);

    // 1. Click-harvest the field, column by column.
    const spots = await tiles(page, crops);
    mark('harvest');
    for (const p of spots) { await page.mouse.click(p.x, p.y); await sleep(CLICK_MS); }
    mark('harvest_end');
    await park(page);
    await sleep(DRAIN_MS);

    // 2. Replant every tile with the crop it had. The panel stays open but invisible; each
    //    plot is picked through it, then its tiles are tapped.
    // A pick closes the panel on a phone (placement mode), so it is opened again for each crop;
    // opening it returns the view to the player, so the field is looked at again each time.
    const todo = [...crops, ...bare];
    let planted = 0;
    await hidePanels(page, true);
    mark('plant');
    for (const type of [...new Set(todo.map((c) => c.type))]) {
      await page.keyboard.press('Escape');
      await sleep(200);
      if (!(await page.locator('.panel-container[data-panel-name="FarmingPanel"]').count())) { await openNav(page, 'FarmingPanel'); await sleep(900); }
      if (!(await plotEntry(page, PLOT[type], true))) { console.log('could not pick', PLOT[type]); continue; }
      await sleep(300);
      await lookAt(page, FIELD.x, FIELD.y);
      await sleep(350);
      const mine = todo.filter((c) => c.type === type);
      const pts = await tiles(page, mine);
      for (const p of pts) { await page.mouse.click(p.x, p.y); planted++; await sleep(CLICK_MS); }
    }
    mark('plant_end');
    await park(page);
    await sleep(DRAIN_MS);
    await page.keyboard.press('Escape');
    await closePanel(page);
    await hidePanels(page, false);
    await lookAt(page, FIELD.x, FIELD.y);
    await sleep(600);
    const now = (await resources(page, IN_BOX)).reduce((m, r) => { m[r.type] = (m[r.type] || 0) + 1; return m; }, {});
    console.log('tapped to plant:', planted, '| field now:', JSON.stringify(now));
    mark('grow');
    await sleep(64000);
    mark('grown');
    await sleep(2200);
    mark('grown_end');

    // 3. Animals that are ready: look at the pasture.
    const ready = (await npcs(page, "n.action === 'graze' && n.state === 'processing'")).slice(0, 6);
    console.log('ready animals:', ready.length);
    if (ready.length) {
      mark('animals_pan');
      const cx = Math.round(ready.reduce((s, a) => s + a.x, 0) / ready.length), cy = Math.round(ready.reduce((s, a) => s + a.y, 0) / ready.length);
      await lookAt(page, cx, cy, 800);
      await sleep(400);
      mark('animals');
      for (const a of ready) {
        const [here] = await npcs(page, `n.type === '${a.type}' && Math.abs(n.position.x - ${a.x}) <= 2 && Math.abs(n.position.y - ${a.y}) <= 2 && n.state === 'processing'`);
        if (here) await clickTile(page, here.x, here.y, -8);
        await sleep(550);
      }
      await sleep(1200);
      mark('animals_end');
    }

    // 4. Kent buys.
    const [kent] = await npcs(page, "n.type === 'Kent'");
    mark('kent_pan');
    await lookAt(page, kent.x - 2, kent.y + 2, 800); // Kent right of centre: the panel takes the left 58 %
    await sleep(400);
    const [kentNow] = await npcs(page, "n.type === 'Kent'");
    await clickTile(page, kentNow.x, kentNow.y, -20);
    await page.waitForSelector('.panel-container', { timeout: 60000 });
    await sleep(2500);
    mark('kent');
    await sleep(1000);
    let sold = 0;
    for (let i = 0; i < 2; i++) {
      const offer = page.locator('.kent-offer-button.kent-ready').first();
      if (!(await offer.count())) break;
      await offer.click();
      sold++;
      await park(page);
      await sleep(1500);
    }
    console.log('offers sold:', sold);
    mark('kent_end');
    await sleep(700);
    mark('kent_out');
    await closePanel(page);
    await sleep(900);

    // 5. Pull back two zoom levels, which also returns the view to the player.
    mark('pull');
    await page.keyboard.press('-');
    await sleep(1700);
    await page.keyboard.press('-');
    await sleep(2800);
    mark('end');
  },
};
