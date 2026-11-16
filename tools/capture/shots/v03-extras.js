// V3 Story, the cutaways between the characters (docs/social-video-plan.md):
//
//   node capture.js shot v03-extras@scout      enter the dungeon under valley 1011132, print who is where, leave
//   node capture.js shot v03-extras@dungeon    the run down its east corridor
//   node capture.js shot v03-extras@quests     the Quest panel, opened for a moment
//
// The dungeon is d001_Large (tuning/dungeonEntrances.json: 1011132, where the entrance can be walked to; Belmont's is across water). The player arrives in
// its north-west corner; the corridor that reads as one in a tall frame is on the east side: three
// tiles wide between walls, running south from row 24 (x 60..62). The take walks there off camera
// (Space swings at whatever comes into reach), then runs it at the closest zoom, where the grid's
// edge (x 63: nothing is drawn past it) stays out of the picture.
// What a take changes for real: health, enemies killed on the way (xp, drops), the dungeon copy.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sleep, zoomToScale, whereAmI, hidePanels, closePanel, park, health, healUp, npcs, myTile, arrive, clickTile, teleport, lookAt, walkTarget, tapReach, pinNpc } from './lib.js';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../ads/vvgame/video/raw/_prep');
const CLOSER = 75 / 45, CLOSE = 1, FARISH = 25 / 45, FAR = 14 / 45;
const GRID = Number(process.env.DUNGEON_GRID || 1011132);   // a valley whose Dungeon Entrance (d001_Large) can be walked to
const pc = (page) => page.evaluate(() => window.__pcDebug?.() || null);
const hostile = async (page) => { const me = await myTile(page); return (await npcs(page, "n.action === 'attack'")).map((n) => ({ ...n, d: Math.max(Math.abs(n.x - me.x), Math.abs(n.y - me.y)) })).sort((a, b) => a.d - b.d); };

async function start(page) {
  await page.waitForSelector('.homestead canvas', { timeout: 60000 });
  await sleep(6000);
  await page.evaluate(() => document.querySelector('.modal-overlay .close-btn, .modal-overlay .modal-close')?.click());
  await sleep(500);
  await healUp(page, 0.95);
}

/** Walk up to the Dungeon Entrance on this grid and go in. */
async function enterDungeon(page) {
  await zoomToScale(page, FARISH);
  const e = await page.evaluate(() => { const r = (window.__boardResources() || []).find((x) => x && x.type === 'Dungeon Entrance'); return r && { x: r.x, y: r.y, w: r.sizeX || r.size || 1, h: r.sizeY || r.size || 1 }; });
  if (!e) throw new Error('no Dungeon Entrance here');
  console.log('entrance', JSON.stringify(e), 'me', JSON.stringify(await myTile(page)));
  const from = (await whereAmI(page)).gridCoord;
  const inside = async () => { const w = await whereAmI(page); return w.gtype === 'dungeon' || w.gridCoord !== from; };
  for (const [ox, oy] of [[0, 1], [1, 1], [-1, 0], [e.w, 0], [-1, 1], [e.w, 1]]) if (await waypoint(page, e.x + ox, e.y + oy)) { await trek(page, e.x + ox, e.y + oy, 60000); break; }
  console.log('  near the entrance:', JSON.stringify(await myTile(page)));
  for (let i = 0; i < 6 && !(await inside()); i++) {
    let me = await myTile(page);
    if (Math.max(Math.abs(me.x - e.x), Math.abs(me.y - e.y)) > 2) {          // the tile under its door first
      const spot = [[e.x, e.y + 1], [e.x + 1, e.y + 1], [e.x - 1, e.y], [e.x + e.w, e.y]][i % 4];
      await lookAt(page, spot[0], spot[1], 250);
      await clickTile(page, spot[0], spot[1]);
      await sleep(2500);
      await arrive(page, spot[0], spot[1], 9000);
      me = await myTile(page);
    }
    await sleep(500);
    await clickTile(page, e.x, e.y, -6);
    for (let k = 0; k < 32 && !(await inside()); k++) await sleep(250);
    console.log('  try', i, 'me', JSON.stringify(me), JSON.stringify(await whereAmI(page)), await page.evaluate(() => document.querySelector('.status-bar, .status-message')?.innerText || ''));
  }
  if (!(await inside())) throw new Error('did not get into the dungeon');
  await sleep(4500);
  await closePanel(page);
}

/** The next tile to tap on the way to (x, y): `hop` steps along the shortest route over open ground
 *  (doors count as open), or null when there is none. A tap far away finds no route in the game. */
export const waypoint = (page, x, y, hop = 5, banned = []) => page.evaluate(([tx, ty, n, ban]) => {
  const tiles = window.__boardTiles();
  const me = window.__pixiCamera.debug().playerTile; const sx = Math.floor(me.x), sy = Math.floor(me.y);
  const key = (a, b) => b * 64 + a, blocked = new Set();
  for (const r of window.__boardResources() || []) {
    if (!r || r.passable === true || r.action === 'door' || /Door/.test(r.type)) continue;
    const w = r.sizeX || r.size || 1, h = r.sizeY || r.size || 1;
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) blocked.add(key(r.x + i, r.y - j));
  }
  for (const [a, b] of ban) blocked.add(key(a, b));        // tiles the game would not step onto (found by trying)
  const open = (a, b) => a >= 0 && b >= 0 && b < tiles.length && a < tiles[0].length && !'wl'.includes(tiles[b][a]) && !blocked.has(key(a, b));
  const prev = new Map([[key(sx, sy), null]]); const queue = [[sx, sy]];
  while (queue.length) {
    const [a, b] = queue.shift();
    if (a === tx && b === ty) { const path = []; let k = key(a, b); while (k !== null) { path.unshift([k % 64, Math.floor(k / 64)]); k = prev.get(k); } const w = path[Math.min(n, path.length - 1)]; return { x: w[0], y: w[1], left: path.length - 1, next: path[1] || null }; }
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { const c = a + ox, d = b + oy; if (open(c, d) && !prev.has(key(c, d))) { prev.set(key(c, d), key(a, b)); queue.push([c, d]); } }
  }
  return null;
}, [x, y, hop, banned]);

/** Walk to (x, y) in short taps, fighting what comes into reach; false when health runs low,
 *  there is no way, or time is up. */
async function trek(page, x, y, ms = 40000) {
  const until = Date.now() + ms; const banned = [];
  while (Date.now() < until) {
    const me = await myTile(page);
    if (me.x === x && me.y === y) return true;
    const p = await pc(page);
    if (p && p.hp < p.maxhp * 0.55) { console.log('  health low on the way:', p.hp); return false; }
    const [near] = await hostile(page);
    if (near && near.type === 'Spider' && near.d <= (p?.attackrange || 1)) { await page.keyboard.press('Space'); await sleep(260); continue; } // only what can keep up; the slow ones are outrun
    const w = await waypoint(page, x, y, 5, banned);
    if (!w) { console.log('  no way to', x, y, 'from', JSON.stringify(me)); return false; }
    await closePanel(page);                                // a tap that landed on someone opens their panel, which stops the walk
    await clickTile(page, w.x, w.y);
    if (!(await arrive(page, w.x, w.y, 1500))) {
      const now = await myTile(page);                      // did not move at all: the game will not take the route's first step, so go round it
      if (now.x === me.x && now.y === me.y && w.next) { banned.push(w.next); console.log('  the game will not step to', w.next.join(','), 'from', me.x, me.y); }
    }
  }
  return false;
}

const leave = async (page) => {
  await closePanel(page);
  await hidePanels(page, false);
  await teleport(page, 'Titania');                         // out first: enemies keep hitting while the camera zooms
  await zoomToScale(page, FARISH);
  console.log('parked at', JSON.stringify(await whereAmI(page)), 'health after the take:', JSON.stringify(await health(page)));
};

const SHOTS = {
  scout: {
    async setup(page) { await start(page); await teleport(page, GRID); },
    async run(page) {
      try {
        await enterDungeon(page);
        await zoomToScale(page, FAR);
        const all = await npcs(page, 'true');
        console.log('in', JSON.stringify(await whereAmI(page)), 'tile', JSON.stringify(await myTile(page)), 'pc', JSON.stringify(await pc(page)));
        console.log('who', all.map((n) => `${n.type}@${Math.floor(n.x)},${Math.floor(n.y)}`).join(' '));
        const col = await page.evaluate(() => { const t = window.__boardTiles(); console.log(1); const res = (window.__boardResources() || []).filter((r) => r && r.x >= 57); return { kinds: [...new Set(t.flat())].join(''), tiles: [2, 30, 45].map((y) => t[y].slice(56, 64).join('')), res: res.map((r) => `${r.type}@${r.x},${r.y}`).join(' ') }; });
        console.log('east side', JSON.stringify(col));
        await page.screenshot({ path: path.join(OUT, 'dungeon-far.png') });
        await zoomToScale(page, CLOSE);
        await page.screenshot({ path: path.join(OUT, 'dungeon-close.png') });
        await sleep(3000);
        console.log('after 10 s: pc', JSON.stringify(await pc(page)), 'near', (await hostile(page)).slice(0, 6).map((n) => `${n.type}@${Math.floor(n.x)},${Math.floor(n.y)}`).join(' '));
      } finally { await leave(page); }
    },
  },
  dungeon: {
    async setup(page) { await start(page); await teleport(page, GRID); },
    async run(page, { mark }) {
      try {
        await enterDungeon(page);
        await zoomToScale(page, FAR);                       // long taps: the whole route is in the picture
        const WAY = (process.env.WAY || '12,2 30,2 50,2 57,2 61,5 60,12 60,22 60,25').split(' ').map((s) => s.split(',').map(Number));
        for (const [x, y] of WAY) { const ok = await trek(page, x, y); console.log('  to', x, y, ok ? 'ok' : 'NOT reached', JSON.stringify(await myTile(page))); if (!ok) throw new Error('the way to the corridor is not open'); }
        // clear what followed, then the run: straight down the corridor at the closest zoom
        for (let i = 0; i < 40; i++) { const [n] = (await hostile(page)).filter((h) => h.type === 'Spider'); if (!n || n.d > 6) break; if (n.d <= ((await pc(page))?.attackrange || 1)) await page.keyboard.press('Space'); await sleep(260); }
        await zoomToScale(page, CLOSER);
        await park(page);
        await sleep(800);
        console.log('  run from', JSON.stringify(await myTile(page)), 'pc', JSON.stringify(await pc(page)));
        mark('run');
        for (const y of [29, 33, 35]) { await clickTile(page, 60, y); await arrive(page, 60, y, 2500); }
        mark('door');
        await zoomToScale(page, CLOSE);
        await trek(page, 61, 38, 8000);
        await zoomToScale(page, CLOSER);
        await sleep(500);
        mark('run2');
        for (const y of [42, 46, 50, 54]) { await clickTile(page, 61, y); await arrive(page, 61, y, 2500); }
        mark('end');
        await sleep(600);
        console.log('  ended at', JSON.stringify(await myTile(page)), 'pc', JSON.stringify(await pc(page)));
      } finally { await leave(page); }
    },
  },
  // The Town Cellar (d002_TownCellar, under the player's own Town): narrow passages, spiders only.
  // From the stairs the open part is a short dog-leg: east, north up a one-tile passage, west.
  cellar: {
    async setup(page) { await start(page); await teleport(page, 'Town'); },
    async run(page, { mark }) {
      try {
        await enterDungeon(page);
        const me = await myTile(page);
        console.log('in', JSON.stringify(await whereAmI(page)), 'tile', JSON.stringify(me), 'pc', JSON.stringify(await pc(page)));
        console.log('who', (await npcs(page, 'true')).map((n) => `${n.type}@${Math.floor(n.x)},${Math.floor(n.y)}`).join(' '));
        await zoomToScale(page, CLOSER);
        await park(page);
        await page.screenshot({ path: path.join(OUT, 'cellar.png') });
        await sleep(600);
        mark('run');
        for (const [x, y] of (process.env.WAY || '34,30 34,26 32,26').split(' ').map((v) => v.split(',').map(Number))) {
          for (let i = 0; i < 6; i++) { const w = await waypoint(page, x, y, 4); if (!w || w.left === 0) break; await clickTile(page, w.x, w.y); await arrive(page, w.x, w.y, 1500); }
          console.log('  at', JSON.stringify(await myTile(page)));
        }
        mark('end');
        await sleep(800);
        console.log('  pc', JSON.stringify(await pc(page)));
      } finally { await leave(page); }
    },
  },
  quests: {
    async setup(page) { await start(page); if ((await whereAmI(page)).region !== "Titania's Bower") await teleport(page, 'Titania'); await pinNpc(page, 'Titania', 36, 31); await zoomToScale(page, CLOSE); await park(page); },   // she is held on her mark, as in the Story take
    async run(page, { mark }) {
      await sleep(1500);
      mark('open');
      await page.evaluate(() => document.querySelector('[data-nav="QuestPanel"]')?.click());
      await sleep(4000);
      await page.screenshot({ path: path.join(OUT, 'quests.png') });
      mark('close');
      await closePanel(page);
      await sleep(1500);
      mark('end');
    },
  },
};

export default (id) => {
  const s = SHOTS[id];
  if (!s) throw new Error(`which? one of: ${Object.keys(SHOTS).join(', ')}`);
  return { folder: 'v03-story', ...s };
};
