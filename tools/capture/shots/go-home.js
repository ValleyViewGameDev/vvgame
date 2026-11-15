// Preparation, not a shot for a video: from the Town, walk to the Home signpost and take it, so
// the player stands on their own homestead. (The developer teleport does not go there.)
import { sleep, resources, clickTile, lookAt, zoomToScale, whereAmI } from './lib.js';

export default {
  folder: '_prep',
  async setup(page) {
    await page.waitForSelector('.homestead canvas', { timeout: 60000 });
    await sleep(6000);
    await zoomToScale(page, 1);
  },
  async run(page) {
    const at = await whereAmI(page);
    console.log('from', JSON.stringify(at));
    if (at.gtype === 'homestead') return;
    if (at.gtype !== 'town') throw new Error('walk home from the Town: teleport or walk there first');
    const signs = await resources(page, "/Signpost/.test(r.type)");
    console.log('signposts:', JSON.stringify(signs));
    const home = signs.find((s) => /Home/.test(s.type));
    if (!home) throw new Error('no Home signpost on this grid');
    for (let attempt = 0; attempt < 3 && (await whereAmI(page)).gtype !== 'homestead'; attempt++) {
      await lookAt(page, home.x, home.y, 300);
      await clickTile(page, home.x, home.y);
      for (let i = 0; i < 60 && (await whereAmI(page)).gtype !== 'homestead'; i++) await sleep(1000);
    }
    await sleep(5000);
    console.log('now', JSON.stringify(await whereAmI(page)));
  },
};
