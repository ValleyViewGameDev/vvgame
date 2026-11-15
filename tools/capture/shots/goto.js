// Preparation, not a shot for a video: developer-teleport the player to PLACE (a Quick Travel
// label such as 'Belmont', default 'Titania', a quiet grid with healers) and report where they
// are. Run it after a take that ends somewhere dangerous, or before one that must start elsewhere.
// VERBOSE=1 prints the page's warnings, errors and status messages (why a teleport did nothing).
import { sleep, teleport, whereAmI, npcs } from './lib.js';

export default {
  folder: '_prep',
  async setup(page) {
    if (process.env.VERBOSE) page.on('console', (m) => { if (['warning', 'error'].includes(m.type()) || /teleport|❌/i.test(m.text())) console.log('  page:', m.text().slice(0, 300)); });
    await page.waitForSelector('.homestead canvas', { timeout: 60000 });
    await sleep(6000);
  },
  async run(page) {
    const place = process.env.PLACE || 'Titania';
    console.log('from', JSON.stringify(await whereAmI(page)));
    console.log('now', JSON.stringify(await teleport(page, /^\d+$/.test(place) ? Number(place) : place)));
    console.log('tile', JSON.stringify(await page.evaluate(() => window.__pixiCamera.debug().playerTile)), 'status', await page.evaluate(() => document.querySelector('.status-bar-wrapper')?.innerText || ''));
    const who = {}; (await npcs(page, 'true')).forEach((n) => { who[n.type] = (who[n.type] || 0) + 1; });
    console.log('with', JSON.stringify(who));
  },
};
