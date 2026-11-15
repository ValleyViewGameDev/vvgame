// Preparation, not a shot for a video: visit each of PLACES (comma-separated Quick Travel labels
// or grid coordinates) with the developer teleport, print the region, the arrival tile and who
// is there, save a screenshot (SCOUT_DIR, default the raw _prep folder), then park at Titania.
// Hostile places cost a little health: a visit lasts about six seconds.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sleep, teleport, whereAmI, npcs, zoomToScale, health } from './lib.js';

const OUT = process.env.SCOUT_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../ads/vvgame/video/raw/_prep');

export default {
  folder: '_prep',
  async setup(page) {
    await page.waitForSelector('.homestead canvas', { timeout: 60000 });
    await sleep(6000);
    await zoomToScale(page, 25 / 45);
  },
  async run(page) {
    for (const raw of (process.env.PLACES || '').split(',').map((s) => s.trim()).filter(Boolean)) {
      const place = /^\d+$/.test(raw) ? Number(raw) : raw;
      const at = await teleport(page, place);
      const me = await page.evaluate(() => window.__pixiCamera.debug().playerTile);
      const who = {}; (await npcs(page, 'true')).forEach((n) => { who[n.type] = (who[n.type] || 0) + 1; });
      const near = (await npcs(page, "n.action === 'attack'")).filter((n) => Math.hypot(n.x - me.x, n.y - me.y) < 12).map((n) => `${n.type}@${Math.round(n.x)},${Math.round(n.y)}`);
      const pc = await page.evaluate(() => window.__pcDebug?.() || null);
      console.log(raw, JSON.stringify(at), 'tile', JSON.stringify(me), 'who', JSON.stringify(who), 'near', near.join(' '), 'pc', JSON.stringify(pc));
      await page.screenshot({ path: path.join(OUT, `scout-${String(raw).replace(/\W+/g, '_')}.png`) });
    }
    await teleport(page, 'Titania');
    console.log('parked', JSON.stringify(await whereAmI(page)), 'health', JSON.stringify(await health(page)));
  },
};
