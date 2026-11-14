// V5 Characters, the closing pull-back by itself: out two zoom levels from the player, then a
// glide to the middle of the Town so the whole of it fills the frame. Changes nothing.
import { sleep, zoomToScale, lookAt, park } from './lib.js';

export default {
  folder: 'v05-characters',
  async setup(page) {
    await page.waitForSelector('.homestead canvas', { timeout: 60000 });
    await sleep(6000);
    await zoomToScale(page, 1);
    await park(page);
  },
  async run(page, { mark }) {
    await sleep(500);
    mark('pull');
    await page.keyboard.press('-');
    await sleep(1200);
    await page.keyboard.press('-');
    await sleep(900);
    await lookAt(page, 32, 30, 1400);
    await sleep(1500);
    mark('end');
  },
};
