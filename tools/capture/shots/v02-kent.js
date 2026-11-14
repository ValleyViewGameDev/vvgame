// V2 Farming, the Kent beat by itself (a retake that leaves the long farming take alone):
// pan to Kent, open his panel, sell up to two ready offers. Sells for real.
import { sleep, clickTile, npcs, zoomToScale, lookAt, closePanel, park } from './lib.js';

export default {
  folder: 'v02-farming',
  async setup(page) {
    await page.waitForSelector('.homestead canvas', { timeout: 60000 });
    await sleep(6000);
    await zoomToScale(page, 1);
    await lookAt(page, 27, 21);
    await park(page);
  },
  async run(page, { mark }) {
    const [kent] = await npcs(page, "n.type === 'Kent'");
    mark('kent_pan');
    await lookAt(page, kent.x - 2, kent.y + 2, 800); // Kent right of centre: the panel takes the left 58 %
    await sleep(400);
    const [kentNow] = await npcs(page, "n.type === 'Kent'");
    await clickTile(page, kentNow.x, kentNow.y, -20);
    await sleep(2800);
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
    console.log('offers sold:', sold, 'debug link shown:', await page.evaluate(() => [...document.querySelectorAll('[data-dev-ui]')].some((e) => e.offsetParent !== null)));
    mark('kent_end');
    await sleep(700);
    mark('kent_out');
    await closePanel(page);
  },
};
