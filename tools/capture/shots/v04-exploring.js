// V4 Exploring (docs/social-video-plan.md §5): a run of very different places. Each one is
// reached with the developer teleport (Debug panel, kept invisible), arrives with the game's own
// fade-in and region banner, then changes zoom on camera. Looks only: nothing is picked up,
// fought or talked to, though enemies near the arrival tile may attack the player.
// Never add 'Oracle' here: arriving beside her opens her nine-page dialogue on a real account.
import { sleep, zoomToScale, whereAmI, hidePanels, closePanel, park, health, requireHealth } from './lib.js';

const CLOSE = 1, FARISH = 25 / 45;
// start = the zoom on arrival; the other one is zoomed to on camera. (The developer teleport
// does not take the homestead's own coordinate, so the run starts away from home.)
const STOPS = [
  { id: 'belmont', place: 'Belmont', start: FARISH },
  { id: 'sunflower', place: 'Sunflower Peninsula', start: CLOSE },
  { id: 'titania', place: 'Titania', start: FARISH },
  { id: 'prospero', place: "Prospero", start: CLOSE },
  { id: 'yorick', place: "Yorick's Hollow", start: FARISH },
  { id: 'golgotha', place: 'Vampire', start: CLOSE },
];

// Teleport with the Debug panel open but invisible, closing it the moment the grid changes.
async function go(page, place, onArrive) {
  const before = (await whereAmI(page)).gridCoord;
  await sleep(700);
  await hidePanels(page, true);
  await page.evaluate(() => document.querySelector('button[aria-label="Debug"]')?.click());
  const select = page.locator('.panel-container select').filter({ hasText: 'Quick Travel' }).last();
  await select.waitFor({ state: 'attached', timeout: 15000 });
  if (typeof place === 'number') await page.locator('.panel-container input[placeholder="Enter GridCoord"]').last().fill(String(place), { force: true });
  else await select.selectOption({ label: place }, { force: true });
  await sleep(300);
  await page.evaluate(() => [...document.querySelectorAll('.panel-container button')].filter((b) => b.innerText.trim() === 'Teleport').pop()?.click());
  let moved = false;
  for (let i = 0; i < 80; i++) { await sleep(250); if ((await whereAmI(page)).gridCoord !== before) { moved = true; break; } }
  onArrive(moved);
  await closePanel(page);
  await sleep(700);
  await hidePanels(page, false);
  return moved;
}

export default {
  async setup(page) {
    await page.waitForSelector('.homestead canvas', { timeout: 60000 });
    await sleep(6000);
    // a story modal left open by an arrival (the Oracle's): close it, do not page through it
    await page.evaluate(() => document.querySelector('.modal-overlay .close-btn, .modal-overlay .modal-close')?.click());
    await sleep(500);
    await park(page);
    await zoomToScale(page, STOPS[0].start);
    console.log('starting from', JSON.stringify(await whereAmI(page)), 'health', JSON.stringify(await requireHealth(page)));
  },
  async run(page, { mark }) {
    for (const s of STOPS) {
      await zoomToScale(page, s.start);                    // off camera, before every stop
      const here = await whereAmI(page);
      const already = typeof s.place === 'number' && here.gridCoord === s.place;
      if (already) mark(`${s.id}_arrive`);
      else {
        const moved = await go(page, s.place, (ok) => { if (ok) mark(`${s.id}_arrive`); });
        if (!moved) { console.log('did not arrive:', s.place); continue; }
      }
      await sleep(already ? 1200 : 3000);                  // fade in, region banner
      mark(`${s.id}_zoom`);
      await page.keyboard.press(s.start === CLOSE ? '-' : '=');
      await sleep(2300);
      mark(`${s.id}_end`);
      const z = await page.evaluate(() => window.__pixiCamera.getZoom());
      console.log(s.id, JSON.stringify(await whereAmI(page)), 'zoom', s.start.toFixed(2), '->', z.toFixed(2));
    }
    mark('end');
    // Leave at once, in this same session: the last stops are full of enemies, the take costs
    // about half the player's health, and a later page load there (even to teleport away) is
    // long enough to be killed. Titania's Bower is quiet and its fairies heal.
    await go(page, 'Titania', () => {});
    await sleep(2500);
    console.log('parked at', JSON.stringify(await whereAmI(page)), 'health after the take:', JSON.stringify(await health(page)));
  },
};
