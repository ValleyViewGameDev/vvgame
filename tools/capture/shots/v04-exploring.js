// V4 Exploring (docs/social-video-plan.md §5): a run of very different places, one take per
// place, and the player is moving in every one of them.
//
//   node capture.js shot v04-exploring@<stop>     -> ads/video/raw/v04-exploring/<stop>.rec
//
// Every take heals first if needed (Titania's fairies), reaches its place with the developer
// teleport (Debug panel, kept invisible), plays its beat, and parks back at Titania's Bower at
// once: the hostile places cost health, and a later page load there is long enough to be killed.
// What a take changes for real: health, a few Feverfew, and in the fight the kills (xp, drops).
// Never add 'Oracle' here: arriving beside her opens her nine-page dialogue on a real account.
// Fights and conversations keep the player on the SAME ROW as the other character (owner rule).
import { sleep, zoomToScale, whereAmI, hidePanels, closePanel, park, health, healUp, npcs, myTile, walkTarget, tapReach, arrive, clickTile, teleport } from './lib.js';

const CLOSE = 1, FARISH = 25 / 45, FAR = 14 / 45;
const zoom = (page) => page.evaluate(() => window.__pixiCamera.getZoom());
// The LIVE health (the server's copy trails by seconds, which is how a fight was lost): true when
// the player is below `fraction` of full and the take must leave at once.
const hurt = async (page, fraction = 0.6) => { const pc = await page.evaluate(() => window.__pcDebug?.()); return !!pc && pc.hp < pc.maxhp * fraction; };

// Teleport with the Debug panel open but invisible, closing it the moment the grid changes.
async function go(page, place, onArrive = () => {}) {
  const before = (await whereAmI(page)).gridCoord;
  await sleep(700);
  await hidePanels(page, true);
  await page.evaluate(() => document.querySelector('button[aria-label="Debug"]')?.click());
  const select = page.locator('.panel-container select').filter({ hasText: 'Quick Travel' }).last();
  await select.waitFor({ state: 'attached', timeout: 15000 });
  if (typeof place === 'number') await select.locator('xpath=following-sibling::input[1]').fill(String(place), { force: true });
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

// One leg on foot (or afloat): tap the farthest open tile that stays in the picture.
async function leg(page, opts = {}) {
  const reach = await tapReach(page);
  const t = await walkTarget(page, { ...reach, ...opts });
  if (!t) { console.log('  no tile to walk to'); return null; }
  await clickTile(page, t.x, t.y);
  return t;
}

// The usual beat: walk, change zoom on the way, walk on (legs until about three seconds are up).
async function stroll(page, { mark }, s) {
  mark('go');
  const t0 = Date.now(); const legs = [];
  for (let i = 0; i < 6 && Date.now() - t0 < 2800; i++) {
    if (await hurt(page)) { console.log('  health low, leaving'); break; }
    const t = await leg(page, { toward: s.toward });
    if (!t) break;
    legs.push(t.steps);
    if (i === 0) { await sleep(350); await page.keyboard.press(s.start === CLOSE ? '-' : '='); mark('zoom'); }
    await arrive(page, t.x, t.y, 2500);
  }
  await sleep(400);
  console.log('  legs', legs.join(' + '), 'tiles, zoom', (await zoom(page)).toFixed(2));
}

// Sunflower Lake's desert: a long run through the spiders, out through every zoom level and back.
// He runs the moment he lands (the spiders close in and box in a player who stands), in legs
// that go round them, turning as he goes.
async function desertRun(page, { mark }) {
  // Nothing is drawn past the edge of a grid, so the wider the zoom, the nearer the middle he stays.
  const MID = { x0: 14, x1: 50, y0: 20, y1: 44 }, CORE = { x0: 18, x1: 46, y0: 29, y1: 35 };
  const turns = [[1, 0.4, MID], ['-'], [-1, 0.3, MID], [-0.3, -1, CORE], ['-'], [1, 0, CORE], [-1, 0, CORE], ['='], [1, -1, MID], ['='], [1, 1, MID], [0, 1, MID]];
  mark('go');
  let tiles = 0;
  for (const t of turns) {
    if (typeof t[0] === 'string') { await page.keyboard.press(t[0]); mark(`zoom${t[0] === '-' ? 'out' : 'in'}`); await sleep(150); continue; }
    const to = await leg(page, { toward: { x: t[0], y: t[1] }, inside: t[2], min: 4 });
    if (!to) continue;
    tiles += to.steps;
    await arrive(page, to.x, to.y, 1400);
  }
  console.log('  ran', tiles, 'tiles to', JSON.stringify(await myTile(page)), 'live', JSON.stringify(await page.evaluate(() => window.__pcDebug?.())));
}

// After the run, off camera: lead the spiders away from the middle, where the next take arrives.
async function leadAway(page) {
  for (let i = 0; i < 4; i++) { const to = await leg(page, { toward: { x: 1, y: 1 } }); if (to) await arrive(page, to.x, to.y, 1400); }
}

// The player's own menu (a tap on the avatar), kept invisible: press one of its buttons.
async function ownMenu(page, label) {
  await hidePanels(page, true);
  const me = await myTile(page);
  await clickTile(page, me.x, me.y, -12);
  const button = page.locator('.panel-container button').filter({ hasText: label }).last();
  await button.waitFor({ state: 'attached', timeout: 8000 });
  await sleep(900);                                      // the panel counts the boats in the backpack a moment after it opens
  await button.evaluate((b) => b.click());
  await sleep(900);
  await closePanel(page);
  await sleep(700);
  await hidePanels(page, false);
}

// Strathmoore: into the boat on the lake below the town (off camera), round to the river mouth,
// then north up the river along the town wall.
async function boatRide(page, { mark }) {
  const afloat = () => page.evaluate(() => !!window.__pcDebug?.()?.isinboat);
  if (!(await afloat())) await ownMenu(page, 'Get in Boat');
  if (!(await afloat())) throw new Error('not in the boat');
  await zoomToScale(page, FARISH);                         // a tap only reaches a tile that is in the picture
  // Tile coordinates of this grid's water (layout 1012154). The whole ride is on camera at the
  // wide zoom (a tap only reaches a tile in the picture, and the town shows): across the lake under
  // the town's south wall, round the river mouth, north along the east wall, then in close. It
  // stops at row 17: further north the picture would run past the top edge of the grid.
  await clickTile(page, 16, 31);
  if (!(await arrive(page, 16, 31, 4000))) throw new Error(`the boat did not reach the water: it is at ${JSON.stringify(await myTile(page))}`);
  await zoomToScale(page, FARISH);
  await sleep(500);
  mark('go');
  for (const [x, y] of [[23, 33], [31, 33], [34, 29], [30, 25], [28, 17]]) {
    let there = false;
    for (let i = 0; i < 3 && !there; i++) { await clickTile(page, x, y); there = await arrive(page, x, y, 4000); }
    if (!there) throw new Error(`the boat did not reach ${x},${y}: it is at ${JSON.stringify(await myTile(page))}`);
    if (y === 25) { await page.keyboard.press('='); mark('in'); }   // in close for the last stretch by the wall
  }
  await sleep(600);
  console.log('  sailed to', JSON.stringify(await myTile(page)));
}

// Golgotha: fight the ghosts. The player always stands on the ghost's own row, beside it, before
// a blow (owner rule: same row as the other character). Ends after `kills` or `ms`, or early when
// health runs low.
async function fight(page, { mark }, { type = 'Ghost', kills = 2, ms = 14000 } = {}) {
  const count = async () => (await npcs(page, `n.type === '${type}'`)).length;
  const start = await count(); const until = Date.now() + ms;
  let zoomed = false, swings = 0, lastTap = 0;
  const range = (await page.evaluate(() => window.__pcDebug?.()?.attackrange)) || 1;
  const reach = Math.max(1, range - 1);                    // one short of a long weapon's reach: the foe drifts
  const stand = Math.min(3, reach);                        // a bow shoots along the row from three tiles off; a sword stands beside it
  mark('go');
  while (Date.now() < until && start - (await count()) < kills) {
    if (await hurt(page)) { console.log('  health low, leaving', JSON.stringify(await page.evaluate(() => window.__pcDebug?.()))); break; }
    const me = await myTile(page);
    const [foe] = (await npcs(page, `n.type === '${type}'`)).map((n) => ({ x: Math.floor(n.x), y: Math.floor(n.y) })).sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y));
    if (!foe) break;
    const gap = Math.abs(me.x - foe.x); const tap = await tapReach(page, 0.5);
    if (me.y === foe.y && gap >= 1 && gap <= reach) {
      if (!zoomed) { zoomed = true; await page.keyboard.press('='); mark('in'); await sleep(350); }
      await page.keyboard.press('Space'); swings++;
      if (swings === 1) mark('swing');
      await sleep(220);
    } else if (Math.abs(me.x - foe.x) > tap.dx - 1 || Math.abs(me.y - foe.y) > tap.dy - 1) {
      const to = await leg(page, { toward: { x: foe.x - me.x, y: foe.y - me.y } });   // too far to tap: close the distance first
      if (to) await arrive(page, to.x, to.y, 1500); else await sleep(300);
    } else if (Date.now() - lastTap > 500) {
      const side = me.x <= foe.x ? -1 : 1;                 // the near side of it, on its row
      await clickTile(page, foe.x + side * stand, foe.y); lastTap = Date.now();
      await sleep(120);
    } else await sleep(80);
  }
  mark('won');
  await sleep(900);
  console.log('  swings', swings, 'kills', start - (await count()));
}

const STOPS = {
  belmont: { place: 'Belmont', start: FARISH },
  sunflower: { place: 1012525, start: CLOSE, act: desertRun, wait: 250, leave: leadAway },       // region Sunflower Lake: all sand, 22 spiders (1012521 has 30, but they now sit on its arrival tile)
  titania: { place: 'Titania', from: 'Belmont', start: FARISH },
  strathmoore: { place: 'Strathmoore', start: CLOSE, act: boatRide, leave: (page) => ownMenu(page, 'Get Out of Boat') },
  prospero: { place: 'Prospero', start: CLOSE },
  yorick: { place: "Yorick's Hollow", start: FARISH },
  acheron: { place: 'Acheron', start: CLOSE, toward: { x: -1, y: 0.15 } },  // west from Snug to the moat, where the lava field fills the picture
  golgotha: { place: 1014266, start: FARISH, act: fight },             // region Golgotha, two ghosts and their spawners; the Vampire's grid (1014265) has 18 ghosts and 5 zombies at the arrival tile and killed the player in nine seconds
};

export default (id) => {
  const s = STOPS[id];
  if (!s) throw new Error(`stop? one of: ${Object.keys(STOPS).join(', ')}`);
  return {
    folder: 'v04-exploring',
    async setup(page) {
      await page.waitForSelector('.homestead canvas', { timeout: 60000 });
      await sleep(6000);
      // a story modal left open by an arrival: close it, do not page through it
      await page.evaluate(() => document.querySelector('.modal-overlay .close-btn, .modal-overlay .modal-close')?.click());
      await sleep(500);
      await healUp(page);
      const from = s.from || 'Titania';
      const here = await whereAmI(page);
      if (!(from === 'Titania' ? here.region === "Titania's Bower" : false)) await teleport(page, from);
      await park(page);
      await zoomToScale(page, s.start);
      console.log(id, 'from', JSON.stringify(await whereAmI(page)), 'health', JSON.stringify(await health(page)));
    },
    async run(page, ctx) {
      const { mark } = ctx;
      const moved = await go(page, s.place, (ok) => { if (ok) mark('arrive'); });
      if (!moved) throw new Error(`did not arrive: ${s.place}`);
      await sleep(s.wait ?? 2600);                         // fade in, region banner
      try {
        if (s.act) await s.act(page, ctx, s); else await stroll(page, ctx, s);
      } finally {
        mark('end');
        if (s.leave) await s.leave(page).catch((e) => console.log('  leave:', e.message));
        if (s.place !== 'Titania') await go(page, 'Titania');
        await sleep(2500);
        console.log('parked at', JSON.stringify(await whereAmI(page)), 'health after the take:', JSON.stringify(await health(page)));
      }
    },
  };
};
