// Preparation, not a shot for a video: plant Wheat on every empty tile of the crop field so the
// farming take has a ripe field a minute later. Slow clicks; plays the account.
import { sleep, resources, tiles, zoomToScale, lookAt, hidePanels, closePanel, openNav } from './lib.js';

export default {
  folder: '_prep',
  async setup(page) {
    await page.waitForSelector('.homestead canvas', { timeout: 60000 });
    await sleep(6000);
    await zoomToScale(page, 1);
    await lookAt(page, 28, 21);
  },
  async run(page) {
    const taken = new Set((await resources(page, 'r.x >= 25 && r.x <= 30 && r.y >= 16 && r.y <= 26')).map((r) => `${r.x},${r.y}`));
    const empty = [];
    for (let x = 25; x <= 30; x++) for (let y = 16; y <= 26; y++) if (!taken.has(`${x},${y}`)) empty.push({ x, y });
    console.log('empty tiles:', empty.length);
    if (empty.length) {
      await openNav(page, 'FarmingPanel');
      await sleep(1000);
      await page.locator('.panel-container').getByText('Wheat Plot', { exact: true }).click();
      await hidePanels(page, true);
      await sleep(400);
      for (const p of await tiles(page, empty)) { await page.mouse.click(p.x, p.y); await sleep(280); }
      await sleep(1500);
      await page.keyboard.press('Escape');
      await closePanel(page);
      await hidePanels(page, false);
    }
    await sleep(8000);
    console.log('field now:', JSON.stringify((await resources(page, 'r.x >= 25 && r.x <= 30 && r.y >= 16 && r.y <= 26')).reduce((m, r) => { m[r.type] = (m[r.type] || 0) + 1; return m; }, {})));
  },
};
