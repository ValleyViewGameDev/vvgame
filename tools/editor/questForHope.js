/**
 * QUEST FOR HOPE (editor tab, read-only): how a player gets each of the seven artifacts the
 * Oracle trades for Hope, derived from the files every time it is asked, so it never goes stale:
 *
 *   artifacts      the Oracle's trade in traders.json (requires1..7)
 *   ways to get    quests that reward it (questsEN.json), trades that give it (traders.json),
 *                  a shop that exchanges an ingredient for it (resources.json source + ingredients),
 *                  enemies that drop it (npc output), grids it lies on, scroll reveals
 *   gates          the quest / item level, relationship requirements (quest `rel` / `relscore`,
 *                  trade `rel` / `relscore`), and the doors between a grid's way in and the NPC or
 *                  shop (flood fill over the layout: tiles and impassable resources block, doors are
 *                  crossed one key at a time)
 *
 * Prerequisite items that are themselves rare (keys, secrets, `special` / noBank items, the
 * artifacts) are explained recursively; ordinary goods are just named with their quantity.
 * Where dungeons are entered from is live data (the frontier's dungeon registry): the client tab
 * adds it from the game server.
 */
const fs = require('fs');
const path = require('path');

const HINT_STRING = {
  "Prospero's Orb": 200811, "King's Crown": 200812, 'Trident': 200813, 'Brass Bell': 200814,
  'Phoenix Feather': 200815, "Vampire's Blood": 200816, 'Scroll': 200817,
};
const SIZE = 64;
const MAX_DEPTH = 4;

function readJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

function compute(gameServerDir, clientDir) {
  const tuning = (f) => readJSON(path.join(gameServerDir, 'tuning', f));
  const resources = tuning('resources.json');
  const traders = tuning('traders.json');
  const quests = tuning('quests/questsEN.json');
  let interactions = [];
  try { interactions = tuning('interactions.json'); } catch (e) { /* optional */ }
  let stringsEN = {};
  try { stringsEN = readJSON(path.join(clientDir, 'src', 'UI', 'Strings', 'stringsEN.json')); } catch (e) { /* optional */ }

  const byType = new Map(resources.map((r) => [r.type, r]));
  const byKey = new Map(resources.filter((r) => r.layoutkey).map((r) => [r.layoutkey, r]));
  const questThreshold = interactions.find((i) => /^quest$/i.test(i.interaction))?.relscoremin || 0;

  // ---- layouts: where each layout key sits, and which doors lie between the way in and it
  const layoutsDir = path.join(gameServerDir, 'layouts', 'gridLayouts');
  const layoutFiles = [];
  for (const dir of ['town', 'valleyFixedCoord', 'dungeon', 'homestead', 'miniTemplates']) {
    const full = path.join(layoutsDir, dir);
    if (!fs.existsSync(full)) continue;
    for (const f of fs.readdirSync(full)) if (f.endsWith('.json')) layoutFiles.push({ dir, name: f.replace(/\.json$/, ''), file: path.join(full, f) });
  }
  const placements = new Map(); // layoutkey -> [{ grid, cells: [[x,y]], layoutIndex }]
  const layouts = [];
  for (const lf of layoutFiles) {
    let L;
    try { L = readJSON(lf.file); } catch (e) { continue; }
    if (!Array.isArray(L.resources)) continue;
    const idx = layouts.push({ ...lf, L, regions: null }) - 1;
    L.resources.forEach((row, y) => row.forEach((k, x) => {
      if (!k || k === '**') return;
      if (!placements.has(k)) placements.set(k, []);
      const list = placements.get(k);
      let entry = list.find((p) => p.layoutIndex === idx);
      if (!entry) list.push(entry = { grid: `${lf.dir}/${lf.name}`, dir: lf.dir, name: lf.name, layoutIndex: idx, cells: [] });
      entry.cells.push([x, y]);
    }));
  }

  // Doors to cross, in order, to reach the thing at (x, y) from the grid's way in (its edges, or a
  // dungeon's exit): a 0-1 search where a door step costs 1 and open ground 0, so the path found
  // crosses the fewest doors. Trees, rocks and other clearable sources do not block (the player
  // clears them); walls, buildings, water and mountains do. Returns [door types] ([] = no door) or
  // false when nothing reaches it.
  function doorsTo(layoutIndex, tx, ty) {
    const lay = layouts[layoutIndex];
    if (!lay.blocked) {
      const { L } = lay;
      const blocked = new Uint8Array(SIZE * SIZE); // 1 = wall, 2 = door
      const doorAt = new Map();
      const tileOpen = (k) => { const t = byKey.get(k); return !t || t.category !== 'tile' || t.passable !== false; };
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (!tileOpen(L.tiles?.[y]?.[x])) blocked[y * SIZE + x] = 1;
      L.resources.forEach((row, y) => row.forEach((k, x) => {
        const r = k && k !== '**' ? byKey.get(k) : null;
        if (!r || r.category === 'npc' || r.category === 'source' || r.category === 'doober' || r.passable !== false) return;
        const s = Math.max(1, Number(r.size) || 1);
        for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
          const xx = x + dx, yy = y - dy;
          if (xx < 0 || yy < 0 || xx >= SIZE || yy >= SIZE) continue;
          const i = yy * SIZE + xx;
          if (r.action === 'door') { blocked[i] = 2; doorAt.set(i, r.type); } else if (blocked[i] !== 2) blocked[i] = 1;
        }
      }));
      const starts = [];
      if (lay.dir === 'dungeon') {
        const exit = placements.get('DOut')?.find((p) => p.layoutIndex === layoutIndex);
        for (const [x, y] of exit?.cells || []) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]]) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < SIZE && yy < SIZE) starts.push(yy * SIZE + xx);
        }
      }
      if (!starts.length) for (let i = 0; i < SIZE; i++) starts.push(i, (SIZE - 1) * SIZE + i, i * SIZE, i * SIZE + SIZE - 1);
      lay.blocked = blocked; lay.doorAt = doorAt; lay.starts = [...new Set(starts)].filter((i) => blocked[i] !== 1);
    }
    const { blocked, doorAt } = lay;
    // the target's own footprint (a shop or NPC on an impassable cell) counts as reached when touched
    const r = byKey.get(lay.L.resources[ty][tx]);
    const s = Math.max(1, Number(r?.size) || 1);
    const goal = new Set();
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) goal.add((ty - dy) * SIZE + tx + dx);
    const near = (i) => { const x = i % SIZE, y = (i / SIZE) | 0; for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) if (goal.has((y + dy) * SIZE + x + dx) && x + dx >= 0 && x + dx < SIZE) return true; return false; };
    const cost = new Int16Array(SIZE * SIZE).fill(32767);
    const prev = new Int32Array(SIZE * SIZE).fill(-1);
    const dq = [];
    for (const i of lay.starts) { const c = blocked[i] === 2 ? 1 : 0; if (c < cost[i]) { cost[i] = c; c ? dq.push(i) : dq.unshift(i); } }
    while (dq.length) {
      const i = dq.shift();
      if (near(i)) {
        const doors = [];
        for (let j = i; j !== -1; j = prev[j]) if (blocked[j] === 2) doors.unshift(doorAt.get(j));
        return doors.filter((d, k) => d !== doors[k - 1]);
      }
      const x = i % SIZE, y = (i / SIZE) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= SIZE || yy >= SIZE) continue;
        const j = yy * SIZE + xx;
        if (blocked[j] === 1 && !goal.has(j)) continue;
        const c = cost[i] + (blocked[j] === 2 ? 1 : 0);
        if (c >= cost[j]) continue;
        cost[j] = c; prev[j] = i;
        if (c > cost[i]) dq.push(j); else dq.unshift(j);
      }
    }
    return false;
  }

  function where(type) {
    const k = byType.get(type)?.layoutkey;
    if (!k) return [];
    return (placements.get(k) || []).map((p) => {
      const [x, y] = p.cells[0];
      const doors = doorsTo(p.layoutIndex, x, y);
      return {
        grid: p.grid, dir: p.dir, name: p.name, count: p.cells.length,
        doors: (doors || []).map((d) => ({ door: d, key: byType.get(d)?.requires || null })),
        unreachable: doors === false,
      };
    });
  }

  // Prerequisites worth explaining in turn: keys, secrets and other one-off specials (not
  // ordinary goods, gems or money, which the player farms, buys or crafts)
  const isRare = (type) => byType.get(type)?.category === 'special' && !['Gem', 'Money'].includes(type);
  const goalsOf = (q) => [1, 2, 3].map((i) => q[`goal${i}item`] && { action: q[`goal${i}action`] || '', item: q[`goal${i}item`], qty: q[`goal${i}qty`] || 1 }).filter(Boolean);
  const needsOf = (t) => [1, 2, 3, 4, 5, 6, 7].map((i) => t[`requires${i}`] && { item: t[`requires${i}`], qty: t[`requires${i}qty`] || 1 }).filter(Boolean);
  const relGate = (o, who) => {
    const parts = [];
    if (o.rel) parts.push(`${o.rel} with ${who}`);
    if (o.relscore) parts.push(`relationship ${o.relscore}+`);
    return parts.length ? parts.join(', ') : null;
  };

  // A person / shop / enemy and where to find them
  function find(type) {
    const r = byType.get(type);
    return { type, symbol: r?.symbol || '', level: r?.level ?? null, places: where(type) };
  }

  function explain(item, depth, seen) {
    if (depth > MAX_DEPTH || seen.has(item)) return [];
    const next = new Set(seen).add(item);
    const r = byType.get(item);
    const ways = [];
    const sub = (it) => (isRare(it) ? { item: it, ways: explain(it, depth + 1, next) } : null);

    for (const q of quests.filter((x) => x.reward === item)) {
      const goals = goalsOf(q);
      const kills = goals.filter((g) => /kill/i.test(g.action) && byType.get(g.item)?.category === 'npc');
      ways.push({
        kind: 'quest',
        title: q.title, giver: find(q.giver), rewardQty: q.rewardqty || 1,
        gates: [q.level && `level ${q.level}+`, relGate(q, q.giver), questThreshold && !q.rel && !q.relscore ? null : null].filter(Boolean),
        goals: goals.map((g) => ({ ...g, self: g.item === item })),
        enemies: kills.map((g) => find(g.item)),
        prereqs: goals.filter((g) => g.item !== item).map((g) => sub(g.item)).filter(Boolean),
      });
    }
    for (const t of traders.filter((x) => x.gives === item)) {
      const needs = needsOf(t);
      ways.push({
        kind: 'trade', trader: find(t.trader), qty: t.givesqty || 1,
        gates: [byType.get(t.trader)?.level && `level ${byType.get(t.trader).level}+`, relGate(t, t.trader)].filter(Boolean),
        needs, prereqs: needs.map((n) => sub(n.item)).filter(Boolean),
      });
    }
    const ings = r ? [1, 2, 3, 4].map((i) => r[`ingredient${i}`] && { item: r[`ingredient${i}`], qty: r[`ingredient${i}qty`] || 1 }).filter(Boolean) : [];
    const src = r?.source && byType.get(r.source);
    if (src && ['shop', 'crafting', 'station', 'trainingAndShop'].includes(src.category)) {
      ways.push({ kind: 'shop', shop: find(r.source), needs: ings, gates: [r.level > 1 && `level ${r.level}+`].filter(Boolean), prereqs: ings.map((n) => sub(n.item)).filter(Boolean) });
    }
    for (const n of resources.filter((x) => x.category === 'npc' && x.output === item)) {
      ways.push({ kind: 'drop', enemy: find(n.type), action: n.action, requires: n.requires || null });
    }
    if (r?.layoutkey && r.category === 'doober') {
      const lying = where(item);
      if (lying.length) ways.push({ kind: 'lying', places: lying });
    }
    if (r?.scrollchance) ways.push({ kind: 'scroll', chance: r.scrollchance, qty: r.scrollqty || 1 });
    if (r?.source === 'pets') ways.push({ kind: 'pets' });
    return ways;
  }

  const oracle = traders.find((t) => t.trader === 'Oracle');
  const artifacts = oracle ? needsOf(oracle).map((n) => n.item) : [];
  return {
    oracle: oracle ? { trader: find('Oracle'), gives: oracle.gives, xp: oracle.xp, gates: [relGate(oracle, 'the Oracle')].filter(Boolean) } : null,
    keys: resources.filter((x) => x.action === 'door').map((d) => ({
      door: d.type, symbol: d.symbol || '', key: d.requires || null, keySymbol: byType.get(d.requires)?.symbol || '',
      ways: d.requires ? explain(d.requires, 0, new Set()) : [],
    })),
    items: artifacts.map((name) => {
      const r = byType.get(name);
      return { name, symbol: r?.symbol || '', hint: stringsEN[HINT_STRING[name]] || null, ways: explain(name, 0, new Set()) };
    }),
  };
}

module.exports = { compute };
