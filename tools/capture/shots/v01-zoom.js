// V1 Zoom (docs/social-video-plan.md §5), phone layout: closest zoom on the player at home, out
// through every board level to the whole homestead and on to the Settlement view (owner
// 2026-11-14: all the way out), then back in. Key presses only once he is home; getting there
// (the Town's Home signpost) happens before the recording. The kingdom level does not exist on phones.
import { sleep, zoomToScale, park, closePanel, whereAmI, teleport, resources, clickTile, lookAt, equipWeapon, equippedWeapon, arrive, myTile } from './lib.js';
import { waypoint } from './v03-extras.js';

async function goHome(page) {
  if ((await whereAmI(page)).gtype === 'homestead') return;
  if ((await whereAmI(page)).gtype !== 'town') await teleport(page, 'Town');
  await zoomToScale(page, 1);
  const home = (await resources(page, '/Signpost/.test(r.type)')).find((s) => /Home/.test(s.type));
  if (!home) throw new Error('no Home signpost in the Town');
  for (let attempt = 0; attempt < 3 && (await whereAmI(page)).gtype !== 'homestead'; attempt++) {
    await lookAt(page, home.x, home.y, 300);
    await clickTile(page, home.x, home.y);
    for (let i = 0; i < 60 && (await whereAmI(page)).gtype !== 'homestead'; i++) await sleep(1000);
  }
  await sleep(5000);
  if ((await whereAmI(page)).gtype !== 'homestead') throw new Error('did not get home');
}

export default {
  async setup(page) {
    await page.waitForSelector('.homestead canvas', { timeout: 60000 });
    await sleep(6000);
    if (await page.locator('.modal-overlay--scene').count()) throw new Error('not signed in: run `node capture.js login` first');
    if (process.env.WEAPON && (await equippedWeapon(page)) !== process.env.WEAPON) await equipWeapon(page, process.env.WEAPON); // put back what a story take changed
    await goHome(page);
    // a tap on the way home can leave a window open (the Backpack one, over the Inventory panel)
    for (let i = 0; i < 3; i++) { await page.evaluate(() => document.querySelectorAll('.modal-overlay .close-btn, .modal-overlay .modal-close, .modal-overlay [aria-label="Close"]').forEach((b) => b.click())); await sleep(500); await closePanel(page); await sleep(700); }
    console.log('open windows:', await page.evaluate(() => document.querySelectorAll('.modal-overlay, .panel-container').length));
    // to the middle of the homestead (the Home signpost leaves him at its west edge, and nothing is
    // drawn past an edge): the open tile nearest the centre that can be walked to
    const [cx, cy] = (process.env.SPOT || '32,33').split(',').map(Number);
    await zoomToScale(page, 1);
    let spot = null;
    for (let r = 0; r < 8 && !spot; r++) for (let dx = -r; dx <= r && !spot; dx++) for (let dy = -r; dy <= r && !spot; dy++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r && await waypoint(page, cx + dx, cy + dy)) spot = { x: cx + dx, y: cy + dy };
    for (let i = 0; spot && i < 40; i++) { const w = await waypoint(page, spot.x, spot.y, 3); if (!w || w.left === 0) break; await clickTile(page, w.x, w.y); await arrive(page, w.x, w.y, 1500); }
    await sleep(600);
    await closePanel(page);
    await park(page);
    console.log('home', JSON.stringify(await whereAmI(page)), 'tile', JSON.stringify(await page.evaluate(() => window.__pixiCamera.debug().playerTile)), 'zoom:', await zoomToScale(page, 75 / 45));
    await sleep(1500);
  },
  async run(page, { mark }) {
    const out = async (label, hold) => { await page.keyboard.press('-'); mark(label); await sleep(hold); };
    mark('closer'); await sleep(1900);
    await out('close', 950);
    await out('farish', 950);
    await out('far', 1700);
    await out('settlement', 3600);
    mark('back');
    for (let i = 0; i < 4; i++) { await page.keyboard.press('='); await sleep(i ? 600 : 1500); } // faster presses are dropped; the first leaves the Settlement view
    await sleep(1500);
    mark('end');
    console.log('zoom at the end:', await page.evaluate(() => window.__pixiCamera.getZoom()));
  },
};
