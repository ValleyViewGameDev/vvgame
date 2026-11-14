// V1 Zoom (docs/social-video-plan.md §5), phone layout: closest zoom on the player by the
// farmhouse, out through every board level to the whole homestead, then back in. Key presses
// only; nothing in the game is changed. It stops at `far`: the settlement map is mostly
// "Unoccupied" cells and shows other players' names and net worth, and the kingdom level does
// not exist on phones.
import { sleep, zoomToScale, park } from './lib.js';

export default {
  async setup(page) {
    await page.waitForSelector('.homestead canvas', { timeout: 60000 });
    await sleep(6000);
    if (await page.locator('.modal-overlay--scene').count()) throw new Error('not signed in: run `node capture.js login` first');
    await park(page);
    console.log('zoom:', await zoomToScale(page, 75 / 45));
    await sleep(1500);
  },
  async run(page, { mark }) {
    const out = async (label, hold) => { await page.keyboard.press('-'); mark(label); await sleep(hold); };
    mark('closer'); await sleep(1900);
    await out('close', 950);
    await out('farish', 950);
    await out('far', 2800);
    mark('back');
    for (let i = 0; i < 3; i++) { await page.keyboard.press('='); await sleep(500); } // faster presses are dropped
    await sleep(1500);
    mark('end');
  },
};
