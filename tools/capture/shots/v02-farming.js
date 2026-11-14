// V2 Farming (docs/social-video-plan.md §5), one take on the player's own homestead, close in:
// click-harvest the ripe Wheat, replant it, watch it grow (1 minute), collect from the ready
// animals, sell to Kent, pull back. The edit speeds these up and orders them.
// This PLAYS the account: it harvests, plants and sells for real.
import { sleep, clickTile, resources, npcs, zoomToScale, lookAt, tiles, hidePanels, closePanel, openNav, park } from './lib.js';

const FIELD = { x: 27, y: 21 };      // middle of the six Wheat columns (x 25-30, y 16-26) in the fenced field
const CLICK_MS = 240; // the server saves the whole grid per action, one at a time: faster clicks pile up and later ones are refused or lost
const DRAIN_MS = 6000; // let the server finish one pass before the next touches the same tiles

export default {
  async setup(page) {
    await page.waitForSelector('.homestead canvas', { timeout: 60000 });
    await sleep(6000);
    if (await page.locator('.modal-overlay--scene').count()) throw new Error('not signed in: run `node capture.js login` first');
    const ripe = await resources(page, "r.type === 'Wheat' && r.x >= 25 && r.x <= 30 && r.y >= 16 && r.y <= 26");
    if (ripe.length < 20) throw new Error(`only ${ripe.length} ripe Wheat in the field: wait for it to grow`);
    console.log('ripe wheat:', ripe.length, 'zoom:', await zoomToScale(page, 25 / 45));
    await park(page);
    await sleep(1000);
  },
  async run(page, { mark }) {
    // 1. Click-harvest the Wheat, column by column.
    const ripe = (await resources(page, "r.type === 'Wheat' && r.x >= 25 && r.x <= 30 && r.y >= 16 && r.y <= 26"))
      .sort((a, b) => a.x - b.x || a.y - b.y);
    // Open wide on the homestead, push in to the normal zoom, then settle on the field (rule:
    // the zoom changes on camera in every video). On a phone-sized page the normal zoom shows
    // about 10 x 17 tiles, so the six Wheat columns fill the frame.
    mark('intro');
    await sleep(900);
    await page.keyboard.press('=');
    await sleep(1100);
    await lookAt(page, FIELD.x, FIELD.y, 800);
    await sleep(300);
    const spots = await tiles(page, ripe);
    mark('harvest');
    for (const p of spots) { await page.mouse.click(p.x, p.y); await sleep(CLICK_MS); }
    mark('harvest_end');
    await park(page);
    await sleep(DRAIN_MS);

    // 2. Replant the same tiles. The panel is hidden once the plot is picked.
    await openNav(page, 'FarmingPanel');
    await sleep(1000);
    await page.locator('.panel-container').getByText('Wheat Plot', { exact: true }).click();
    await hidePanels(page, true);
    await lookAt(page, FIELD.x, FIELD.y); // opening a panel returns the view to the player
    await sleep(400);
    const plots = await tiles(page, ripe);
    mark('plant');
    for (const p of plots) { await page.mouse.click(p.x, p.y); await sleep(CLICK_MS); }
    mark('plant_end');
    await park(page);
    await sleep(DRAIN_MS);
    await page.keyboard.press('Escape');
    await closePanel(page);
    await hidePanels(page, false);
    await lookAt(page, FIELD.x, FIELD.y);
    await sleep(600);
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
        const [now] = await npcs(page, `n.type === '${a.type}' && Math.abs(n.position.x - ${a.x}) <= 2 && Math.abs(n.position.y - ${a.y}) <= 2 && n.state === 'processing'`);
        if (now) await clickTile(page, now.x, now.y, -8);
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
    await sleep(2500);
    await page.evaluate(() => document.querySelectorAll('.panel-container div').forEach((d) => { if (!d.children.length && /Debug Refresh/.test(d.textContent)) d.style.display = 'none'; }));
    await sleep(300);
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
