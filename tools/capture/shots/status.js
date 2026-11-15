// Preparation, not a shot for a video: print where the signed-in player is, their health and
// combat numbers, and the things in their holdings a shot may need (Boat, Tent, Feverfew).
import { sleep, whereAmI, health } from './lib.js';

export default {
  folder: '_prep',
  async setup(page) {
    await page.waitForSelector('.homestead canvas', { timeout: 60000 });
    await sleep(6000);
  },
  async run(page) {
    const p = await page.evaluate(() => JSON.parse(localStorage.getItem('player') || '{}'));
    const have = (t) => [...(p.inventory || []), ...(p.backpack || [])].filter((i) => i.type === t).reduce((n, i) => n + (i.quantity || 0), 0);
    console.log('at', JSON.stringify(await whereAmI(page)), 'tile', JSON.stringify(await page.evaluate(() => window.__pixiCamera.debug().playerTile)));
    console.log('health', JSON.stringify(await health(page)), 'boat', !!p.isinboat, 'camping', !!p.iscamping);
    console.log('combat', JSON.stringify(Object.fromEntries(Object.entries(p).filter(([k]) => /^(damage|attackrange|attackbonus|armorclass|speed|level|xp)$/.test(k)))));
    console.log('powers', JSON.stringify(p.powers || []));
    console.log('backpack', JSON.stringify((p.backpack || []).filter((i) => ['Boat', 'Tent'].includes(i.type))), 'warehouse', JSON.stringify((p.inventory || []).filter((i) => ['Boat', 'Tent'].includes(i.type))));
    console.log('holdings', JSON.stringify(Object.fromEntries(['Boat', 'Tent', 'Feverfew', 'Hope', 'Gem'].map((t) => [t, have(t)]))));
  },
};
