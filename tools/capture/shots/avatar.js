// The avatar editor, as an opening for other videos (owner 2026-11-15):
//
//   node capture.js shot avatar
//
// The player's own profile is opened (a tap on the avatar; the panel is kept invisible), then Edit
// Avatar. Off camera the look is set to the Woman with long wavy blonde hair in the first dress.
// On camera: the Clothes tab, one outfit after another, ending on the black queen's coat; the Face
// tab; then the editor closed WITHOUT saving and opened again, which shows the saved look (the
// man, in what he wears now) on the same Face tab. The edit cuts from `face` to `saved`, which
// reads as the tap on the man's sign.
// NOTHING is saved: Save / Buy is never pressed, so no look changes and no gems are spent.
import { sleep, zoomToScale, hidePanels, closePanel, park, myTile, clickTile } from './lib.js';

const TAB = { skin: 0, hair: 1, facialHair: 2, eyes: 3, hat: 4, top: 5 };
const BLONDE = 'rgb(232, 200, 114)';
// the Clothes tab for the Woman, in catalogue order: shift, peasant, gown, ranger, adventurer, court, queen
const OUTFITS = [2, 3, 4, 5, 6];

const tab = (page, key) => page.evaluate((i) => document.querySelectorAll('.avatar-modal .avatar-tabs .tab-button')[i]?.click(), TAB[key]);
const part = (page, i) => page.evaluate((n) => document.querySelectorAll('.avatar-modal .avatar-part-grid .avatar-part')[n]?.click(), i);
const partCount = (page) => page.evaluate(() => document.querySelectorAll('.avatar-modal .avatar-part-grid .avatar-part').length);
const closeEditor = (page) => page.evaluate(() => { const m = document.querySelector('.avatar-modal'); (m?.querySelector('[class*="close"]') || m?.querySelector('button'))?.click(); });

async function openEditor(page) {
  for (let round = 0; round < 4; round++) {
    if (!(await page.locator('.panel-container .player-panel-avatar').count())) {
      const me = await myTile(page);
      for (const dy of [-20, -5, -35]) {
        await clickTile(page, me.x, me.y, dy);
        await sleep(900);
        if (await page.locator('.panel-container .player-panel-avatar').count()) break;
        await closePanel(page);
        await sleep(500);
      }
    }
    await page.evaluate(() => document.querySelector('.panel-container .player-panel-avatar')?.click());
    try { await page.waitForSelector('.avatar-modal .avatar-part-grid', { timeout: 8000 }); return; } catch { /* again */ }
  }
  throw new Error('the avatar editor did not open');
}

export default {
  folder: 'avatar',
  async setup(page) {
    await page.waitForSelector('.homestead canvas', { timeout: 60000 });
    await sleep(6000);
    await page.evaluate(() => document.querySelector('.modal-overlay .close-btn, .modal-overlay .modal-close')?.click());
    await sleep(500);
    await zoomToScale(page, 1);
    await hidePanels(page, true, { away: true });
    await openEditor(page);
    await sleep(1500);
    // the Woman
    await page.evaluate(() => [...document.querySelectorAll('.avatar-modal .avatar-part')].find((b) => b.innerText.includes('♀'))?.click());
    await sleep(600);
    // long wavy hair (None, Bun, Long wavy, Short spiky), blonde
    await tab(page, 'hair'); await sleep(700);
    await part(page, 2); await sleep(400);
    await page.evaluate((c) => [...document.querySelectorAll('.avatar-modal .avatar-swatch')].find((b) => getComputedStyle(b).backgroundColor === c)?.click(), BLONDE);
    await sleep(400);
    // no hat, the first dress
    await tab(page, 'hat'); await sleep(600);
    await part(page, 0); await sleep(400);
    await tab(page, 'top'); await sleep(700);
    console.log('outfits on the Clothes tab:', await partCount(page));
    await part(page, 1);
    await sleep(2500);                     // the thumbnails finish drawing
    await park(page);
  },
  async run(page, { mark }) {
    try {
      mark('outfits');
      await sleep(1100);
      for (const i of OUTFITS) { await part(page, i); mark(`outfit${i}`); await sleep(i === 6 ? 1500 : 950); }
      await tab(page, 'skin');
      mark('face');
      await sleep(1400);
      mark('male');
      // not saved: close, open again = the saved look, on the Face tab
      await closeEditor(page);
      await sleep(900);
      await openEditor(page);
      await sleep(2500);
      mark('saved');
      await sleep(2600);
      mark('end');
    } finally {
      await closeEditor(page);
      await sleep(600);
      await closePanel(page);
      await sleep(400);
      await hidePanels(page, false);
    }
  },
};
