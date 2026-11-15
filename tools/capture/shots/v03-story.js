// V3 Story (docs/social-video-plan.md §5): the tale told by four of its characters, one take each.
//
//   node capture.js shot v03-story@<who>      leontes | gertrude | titania | prospero
//
// In each take the player arrives, walks up to the character, stops on the tile beside them ON
// THEIR ROW (owner rule), and talks (a friendly relationship action; its panel is kept invisible)
// while the camera comes in. The character's own first speech is the caption (edits/v03-story.json).
// Movement only ever goes forward (owner rule): arrive at A, walk to B beside the character. A
// character the teleport lands next to is walked AWAY from before the camera matters, so the walk
// back is still one A-to-B line and nothing is walked twice on screen.
// What a take changes for real: the relationship with that character (a friendly Talk), health.
// The weapon only shows on a grid with an enemy on it (PixiRenderer `enemyOnGrid`).
import { sleep, zoomToScale, whereAmI, hidePanels, closePanel, park, health, healUp, npcs, myTile, walkTarget, tapReach, arrive, clickTile, teleport, standBeside, equipWeapon } from './lib.js';

const CLOSE = 1, FARISH = 25 / 45;
const FRIENDLY = ['Talk', 'Compliment', 'Joke'];          // never Taunt, Insult, Kiss or gifts

const CAST = {
  // He stands four rows from the bottom edge of his grid, and nothing is drawn past an edge: his
  // take is staged at the closest zoom, walking in along his row from a few tiles off (the edit
  // crops the last of the edge away).
  leontes: { who: 'Leontes', place: 'Leontes', near: true },
  gertrude: { who: 'Gertrude', place: 'Town' },
  titania: { who: 'Titania', place: 'Titania', from: 'Belmont' },
  // his Peak has enemies on it, so the weapon is in the hand there: the Knife, not the bow (owner 2026-11-14);
  // what was equipped is put back after the take
  prospero: { who: 'Prospero', place: 'Prospero', weapon: 'Knife' },
};

async function go(page, place, onArrive = () => {}) {
  const before = (await whereAmI(page)).gridCoord;
  await sleep(700);
  await hidePanels(page, true);
  await page.evaluate(() => document.querySelector('button[aria-label="Debug"]')?.click());
  const select = page.locator('.panel-container select').filter({ hasText: 'Quick Travel' }).last();
  await select.waitFor({ state: 'attached', timeout: 15000 });
  await select.selectOption({ label: place }, { force: true });
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

export default (id) => {
  const c = CAST[id];
  if (!c) throw new Error(`who? one of: ${Object.keys(CAST).join(', ')}`);
  return {
    folder: 'v03-story',
    async setup(page) {
      await page.waitForSelector('.homestead canvas', { timeout: 60000 });
      await sleep(6000);
      await page.evaluate(() => document.querySelector('.modal-overlay .close-btn, .modal-overlay .modal-close')?.click());
      await sleep(500);
      await healUp(page);
      const from = c.from || 'Titania';
      if (!(from === 'Titania' && (await whereAmI(page)).region === "Titania's Bower")) await teleport(page, from);
      if (c.weapon) c.weaponBefore = await equipWeapon(page, c.weapon);
      await park(page);
      await zoomToScale(page, FARISH);
      console.log(id, 'from', JSON.stringify(await whereAmI(page)), 'health', JSON.stringify(await health(page)));
    },
    async run(page, { mark }) {
      if (!(await go(page, c.place, (ok) => { if (ok) mark('arrive'); }))) throw new Error(`did not arrive: ${c.place}`);
      await sleep(2400);
      try {
        await closePanel(page);
        const [n] = await npcs(page, `n.type === ${JSON.stringify(c.who)}`);
        if (!n) throw new Error(`${c.who} is not here`);
        let me = await myTile(page);
        // Landed beside them: step well away first, so the approach is a real walk.
        if (Math.hypot(n.x - me.x, n.y - me.y) < 7) {
          const reach = await tapReach(page);
          let away = null;                                 // as far as the ground allows
          for (const min of [7, 5, 3]) { away = await walkTarget(page, { ...reach, toward: { x: me.x - n.x || 1, y: (me.y - n.y) * 0.5 }, min }); if (away) break; }
          if (away) { for (let i = 0; i < 3; i++) { await clickTile(page, away.x, away.y); if (await arrive(page, away.x, away.y, 3000)) break; } await sleep(700); }
          else console.log('  no room to step away');
          me = await myTile(page);
        }
        if (c.near) {
          // off camera: reach his row, back off along it, come in to the closest zoom
          const first = await standBeside(page, c.who, { ms: 25000 });
          if (!first) throw new Error(`could not reach ${c.who}`);
          // an open tile further out on his row (a tap on a fountain there would open its panel)
          const back = await walkTarget(page, { dx: 6, dy: 0, toward: { x: first.side, y: 0 }, inside: { x0: 0, x1: 63, y0: first.y, y1: first.y }, min: 3 });
          if (back) { await clickTile(page, back.x, back.y); await arrive(page, back.x, back.y, 2500); }
          await zoomToScale(page, 75 / 45);
          await sleep(600);
          me = await myTile(page);
        }
        console.log('  walking from', JSON.stringify(me), 'to', c.who, 'at', Math.floor(n.x), Math.floor(n.y));
        mark('walk');
        // Stand beside them on their row and open their panel (invisible). They may wander between
        // the two, and beside them a tap can land on the player instead (the panel's title says
        // whose it is): check the row again once the panel is open, and start over if it is off.
        await hidePanels(page, true, { away: true });
        let ready = false;
        for (let round = 0; round < 4 && !ready; round++) {
          const at = await standBeside(page, c.who, { ms: 45000 });
          if (!at) throw new Error(`could not stand beside ${c.who}`);
          if (round === 0) mark('beside');
          for (const dy of [-20, 0, 8, -30]) {
            const [m] = await npcs(page, `n.type === ${JSON.stringify(c.who)}`);
            await clickTile(page, m.x, m.y, dy);
            await page.waitForSelector('.panel-container', { timeout: 6000 }).catch(() => {});
            await sleep(400);
            const title = await page.evaluate(() => document.querySelector('.panel-container .panel-title')?.innerText.trim());
            if (title === c.who) { ready = true; break; }
            await closePanel(page);
            await sleep(900);
          }
          const me2 = await myTile(page); const [w2] = await npcs(page, `n.type === ${JSON.stringify(c.who)}`);
          if (ready && !(me2.y === Math.floor(w2.y) && Math.abs(me2.x - Math.floor(w2.x)) === 1)) { ready = false; await closePanel(page); await sleep(900); }
        }
        if (!ready) throw new Error(`${c.who}: no panel on the same row`);
        await sleep(1200);
        const actions = await page.evaluate(() => [...document.querySelectorAll('.panel-container .btn-basic')].map((b) => b.innerText.trim()));
        const action = FRIENDLY.find((a) => actions.includes(a));
        console.log('  ', c.who, 'offers:', actions.filter((a) => a.length < 14).join(', '), '-> picked', action);
        await park(page);
        if (action) await page.locator('.panel-container .btn-basic').getByText(action, { exact: true }).first().evaluate((b) => b.click());
        mark('talk');
        await sleep(500);
        if (!c.near) await page.keyboard.press('=');       // in to the two of them
        await sleep(2600);
        if (!c.near) await page.keyboard.press('=');
        mark('closer');
        await sleep(3400);
        const end = await myTile(page); const [w] = await npcs(page, `n.type === ${JSON.stringify(c.who)}`);
        console.log('  rows: player', end.y, c.who, Math.floor(w.y), end.y === Math.floor(w.y) ? '(same row)' : '(NOT the same row)');
      } finally {
        mark('end');
        await closePanel(page);
        await sleep(600);
        await hidePanels(page, false);
        await zoomToScale(page, FARISH);
        if (c.place !== 'Titania') await go(page, 'Titania');
        await sleep(2500);
        if (c.weapon && c.weaponBefore !== c.weapon) await equipWeapon(page, c.weaponBefore).catch((e) => console.log('  could not put the weapon back:', e.message));
        console.log('parked at', JSON.stringify(await whereAmI(page)), 'health after the take:', JSON.stringify(await health(page)));
      }
    },
  };
};
