// Preparation, not a shot for a video: heal the player to full at Titania's Bower, where the
// fairies heal 75 health for one Feverfew each. Spends Feverfew for real.
import { sleep, clickTile, npcs, zoomToScale, lookAt, teleport, whereAmI, health, closePanel } from './lib.js';

export default {
  folder: '_prep',
  async setup(page) {
    await page.waitForSelector('.homestead canvas', { timeout: 60000 });
    await sleep(6000);
  },
  async run(page) {
    console.log('before', JSON.stringify(await health(page)));
    if ((await whereAmI(page)).region !== "Titania's Bower") await teleport(page, 'Titania');
    await zoomToScale(page, 1);
    const me = await page.evaluate(() => window.__pixiCamera.debug().playerTile);
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
    console.log('after', JSON.stringify(await health(page)));
  },
};
