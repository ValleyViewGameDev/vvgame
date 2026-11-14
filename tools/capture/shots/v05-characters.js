// V5 Characters (docs/social-video-plan.md §5), in the Town: walk up to three of the cast, open
// each one's panel, pick a friendly action, then watch the conversation close up with the panel
// out of the way. Friendly actions only (no Taunt, Insult, Kiss or gifts): this PLAYS the
// account and its relationships are real.
import { sleep, clickTile, npcs, zoomToScale, lookAt, hidePanels, closePanel, park } from './lib.js';

const VISITS = [
  { id: 'falstaff', who: 'Falstaff', action: 'Hug' },
  { id: 'juliet', who: 'Juliet', action: 'Compliment', fallback: 'Talk' },
  { id: 'elbow', who: 'Constable Elbow', action: 'Joke' },
];

export default {
  async setup(page) {
    await page.waitForSelector('.homestead canvas', { timeout: 60000 });
    await sleep(6000);
    const gtype = await page.evaluate(() => JSON.parse(localStorage.getItem('player') || '{}').location?.gtype);
    if (gtype !== 'town') throw new Error(`the player is on a ${gtype} grid: walk to the Town first`);
    await zoomToScale(page, 1);
    await park(page);
  },
  async run(page, { mark }) {
    mark('start');
    for (const v of VISITS) {
      const [n] = await npcs(page, `n.type === '${v.who}'`);
      if (!n) { console.log('not here:', v.who); continue; }
      mark(`${v.id}_go`);
      await lookAt(page, n.x, n.y, 700);
      // Tap the character. Out of range, the player walks up and the panel opens on arrival.
      // Standing right beside them, a tap can land on the player instead (their own menu): the
      // panel's title says whose it is, so close a wrong one and tap a little lower.
      let opened = false;
      for (const dy of [-20, 0, 8]) {
        const [m] = await npcs(page, `n.type === '${v.who}'`);
        await clickTile(page, m.x, m.y, dy);
        await page.waitForSelector('.panel-container', { timeout: 90000 });
        await sleep(300);
        const title = await page.evaluate(() => document.querySelector('.panel-container .panel-title')?.innerText.trim());
        if (title === v.who) { opened = true; break; }
        console.log('wrong panel:', title);
        await closePanel(page);
        await sleep(900);
        await lookAt(page, n.x, n.y, 300);
      }
      if (!opened) continue;
      mark(`${v.id}_panel`);
      await park(page);
      await sleep(2200);
      const actions = await page.evaluate(() => [...document.querySelectorAll('.panel-container .btn-basic')].map((b) => b.innerText.trim()));
      const action = actions.includes(v.action) ? v.action : v.fallback && actions.includes(v.fallback) ? v.fallback : null;
      console.log(v.who, 'offers:', actions.filter((a) => !/Clues|Sell/.test(a)).join(', '), '-> picked', action);
      if (!action) { await closePanel(page); await sleep(600); continue; }
      await page.locator('.panel-container').getByText(action, { exact: true }).click();
      mark(`${v.id}_act`);
      await sleep(350);
      await hidePanels(page, true);
      await page.keyboard.press('=');                 // push in on the two of them
      await sleep(6000);
      mark(`${v.id}_done`);
      await page.keyboard.press('-');
      await sleep(900);
      await hidePanels(page, false);
      await closePanel(page);
      await sleep(700);
    }
    // Pull back over the Town (the zoom changes on camera in every video).
    mark('pull');
    await page.keyboard.press('-');
    await sleep(1500);
    await page.keyboard.press('-');
    await sleep(2600);
    mark('end');
  },
};
