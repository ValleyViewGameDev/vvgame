#!/usr/bin/env node
/**
 * progression.js - where the early/mid game pinches (docs/tuning.md §4i). Three views:
 *
 *   demand   what each skill / station up to a level costs in RAW goods, potions broken down
 *            through the Apothecary's trades (Potion A = 6 Rosemary + 2 Daisy + 24 Milk, ...),
 *            cumulative along the level path
 *   supply   the wild-crop, Rocks (Stone) and Clay Pit spots laid out in the valley templates on
 *            the N nearest valley grids to a homestead (or on the grids a real player has
 *            visited, --player): the first sweep, then what they give back per day, since every
 *            wild crop replants itself on the spot when picked and regrows in its plot's growtime
 *            (ResourceClicking.handleReplant; a player only gets it by walking back there)
 *   quests   the quests by level and giver, to see where the player is guided and where not
 *   pacing   (--pacing, alone) MEASURED: when real players reached each level (analytics_level,
 *            backlog OB-7) against the phase targets in docs/early-game.md §1: players reaching
 *            it, then median (p25-p75) hours since first seen, and median active days by then
 *
 *   node tools/progression.js [--to 16] [--anchor 1010134] [--player Mobile] [--grids 10,20,40,80,160]
 *   node tools/progression.js --pacing [--to 20] [--since 2026-10-25]
 *
 * --player reads that player's homestead and gridsVisited from the database (read-only); --pacing
 * reads the analytics collections (read-only), developer accounts left out.
 */
const fs = require('fs');
const path = require('path');
const G = path.join(__dirname, '..', 'game-server');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const TO = Number(opt('to', 16));
const GRIDS = String(opt('grids', '10,20,40,80,160')).split(',').map(Number);

const R = require(path.join(G, 'tuning/resources.json'));
const T = require(path.join(G, 'tuning/traders.json'));
const Q = require(path.join(G, 'tuning/quests/questsEN.json'));
const byType = new Map(R.map((r) => [r.type, r]));
const byKey = new Map(R.filter((r) => r.layoutkey).map((r) => [r.layoutkey, r]));
const ing = (r) => [1, 2, 3, 4, 5, 6, 7].map((i) => [r[`ingredient${i}`], Number(r[`ingredient${i}qty`]) || 1]).filter(([t]) => t);
const fmt = (m) => Object.entries(m).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${Math.round(n)}`).join(', ');

// ---------------------------------------------------------------- demand
// goods broken down: the potions through the Apothecary, everything else stays a raw good
const POTION_RECIPE = {};
for (const t of T.filter((x) => x.trader === 'Apothecary' && /^Potion/.test(x.gives))) {
  POTION_RECIPE[t.gives] = [1, 2, 3, 4, 5].map((i) => [t[`requires${i}`], Number(t[`requires${i}qty`]) || 1]).filter(([x]) => x);
}
function expand(type, qty, out) {
  if (POTION_RECIPE[type]) { for (const [t, q] of POTION_RECIPE[type]) expand(t, q * qty, out); return out; }
  out[type] = (out[type] || 0) + qty;
  return out;
}
const unlocks = R.filter((r) => (r.category === 'skill' || (r.category === 'crafting' && /Build/.test(r.source || ''))) && Number.isFinite(r.level) && r.level <= TO)
  .sort((a, b) => a.level - b.level || a.type.localeCompare(b.type));
const WILD = ['Rosemary', 'Daisy', 'Tulip', 'Mushroom', 'Garlic', 'Feverfew', 'Sunflower'];
const WATCH = [...WILD, 'Milk', 'Stone', 'Clay', 'Wood', 'Money'];

const PACING_ONLY = args.includes('--pacing');
if (!PACING_ONLY) console.log(`\n=== DEMAND: skills and stations up to L${TO}, raw goods (potions broken down) ===`);
const cum = {};
let lastLevel = 0;
for (const u of PACING_ONLY ? [] : unlocks) {
  const raw = {};
  const potions = {};
  for (const [t, q] of ing(u)) { if (POTION_RECIPE[t]) potions[t] = (potions[t] || 0) + q; expand(t, q, raw); }
  for (const [t, q] of Object.entries(raw)) cum[t] = (cum[t] || 0) + q;
  if (u.level !== lastLevel) lastLevel = u.level;
  const wildNeeds = WILD.filter((w) => raw[w]).map((w) => `${w} ${raw[w]}`).join(', ');
  console.log(`L${String(u.level).padStart(2)} ${u.type.padEnd(16)} ${u.category === 'skill' ? 'skill  ' : 'station'} @${(u.source || '').padEnd(18)} ${Object.keys(potions).length ? '[' + fmt(potions) + '] ' : ''}${wildNeeds ? '-> ' + wildNeeds : ''}${raw.Clay ? ' Clay ' + raw.Clay : ''}${raw.Stone ? ' Stone ' + raw.Stone : ''}`);
}
if (!PACING_ONLY) console.log(`\nCumulative if a player takes EVERY unlock up to L${TO}: ${WATCH.filter((w) => cum[w]).map((w) => `${w} ${Math.round(cum[w])}`).join(', ')}`);

// ---------------------------------------------------------------- supply
const cells = JSON.parse(fs.readFileSync(path.join(__dirname, 'gridgen/data/live-cells-2026-10-09.json'), 'utf8')).cells;
const rc = (c) => { const s = String(c); return [Number(s[3]) * 8 + Number(s[5]), Number(s[4]) * 8 + Number(s[6])]; };
const SUPPLY = ['Rosemary', 'Daisy', 'Tulip', 'Mushroom', 'Garlic', 'Feverfew', 'Sunflower', 'Rocks', 'Clay Pit'];
const yieldCache = new Map();
function yieldOf(coord) {
  if (yieldCache.has(coord)) return yieldCache.get(coord);
  const f = path.join(G, 'layouts/gridLayouts/valleyFixedCoord', `${coord}.json`);
  const out = {};
  if (fs.existsSync(f)) {
    const L = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const row of L.resources || []) for (const k of row) { const r = byKey.get(k); if (r && SUPPLY.includes(r.type)) out[r.type] = (out[r.type] || 0) + 1; }
    for (const [t, n] of Object.entries(L.resourceDistribution || {})) if (SUPPLY.includes(t)) out[t] = (out[t] || 0) + n;
  }
  yieldCache.set(coord, out);
  return out;
}
const goods = (y) => ({ ...y, Stone: (y.Rocks || 0) * (byType.get('Stone')?.qtycollected || 1), Clay: (y['Clay Pit'] || 0) * (byType.get('Clay')?.qtycollected || 1) });
const SHOW = ['Rosemary', 'Daisy', 'Tulip', 'Mushroom', 'Garlic', 'Feverfew', 'Stone', 'Clay'];
// days for a picked spot to grow back (its plot's growtime); not repeatable = once only
const regrowDays = (t) => {
  const r = byType.get(t); if (!r?.repeatable) return null;
  const p = R.find((x) => x.category === 'farmplot' && x.output === t);
  return p?.growtime ? p.growtime / 86400 : null;
};
const perDay = (sum) => SHOW.map((t) => { const d = regrowDays(t); return d ? (sum[t] || 0) / d : 0; });

// ---------------------------------------------------------------- pacing (measured)
// The phase targets (docs/early-game.md §1), shown beside the level that ends each phase
const TARGET = { 3: 'session 1, 10-15 min', 6: 'D1 (sessions 2-3)', 10: 'D2-D5', 15: 'about D10', 20: 'weeks 2-3', 30: 'weeks 2-8' };
const quant = (xs, q) => { if (!xs.length) return null; const a = [...xs].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(q * a.length))]; };
const hrs = (h) => (h == null ? '-' : h < 1 ? `${Math.round(h * 60)}m` : h < 48 ? `${h.toFixed(1)}h` : `${(h / 24).toFixed(1)}d`);

async function pacing() {
  require(path.join(G, 'node_modules/dotenv')).config({ path: path.join(G, '.env') });
  const { MongoClient } = require(path.join(G, 'node_modules/mongodb'));
  const c = new MongoClient(process.env.MONGODB_URI); await c.connect();
  try {
    const db = c.db();
    const devs = new Set(require(path.join(G, 'tuning/developerUsernames.json')).map((u) => String(u).toLowerCase()));
    const since = opt('since', null);
    const levels = await db.collection('analytics_level').find(since ? { day: { $gte: since } } : {}).toArray();
    const ids = [...new Set(levels.map((l) => l.playerId))];
    const aplayers = await db.collection('analytics_player').find({ _id: { $in: ids } }).toArray();
    const { ObjectId } = require(path.join(G, 'node_modules/mongodb'));
    const players = await db.collection('players').find({ _id: { $in: ids.filter((i) => /^[0-9a-f]{24}$/i.test(i)).map((i) => new ObjectId(i)) } },
      { projection: { username: 1, created: 1 } }).toArray();
    const start = new Map(); const name = new Map();
    for (const p of players) { name.set(String(p._id), p.username); if (p.created) start.set(String(p._id), new Date(p.created)); }
    for (const a of aplayers) { if (a.username) name.set(String(a._id), a.username); if (a.firstSeenAt) start.set(String(a._id), new Date(a.firstSeenAt)); }
    const keep = (pid) => start.has(pid) && !devs.has(String(name.get(pid) || '').toLowerCase());
    const days = new Map();
    for (const row of await db.collection('analytics_activity').find({ playerId: { $in: ids } }, { projection: { playerId: 1, day: 1 } }).toArray()) {
      if (!days.has(row.playerId)) days.set(row.playerId, []);
      days.get(row.playerId).push(row.day);
    }
    const cohort = new Set(levels.map((l) => l.playerId).filter(keep));
    console.log(`\n=== PACING (measured): ${cohort.size} players with level records${since ? ` since ${since}` : ''}, developers left out ===`);
    console.log('Lvl | reached | hours since first seen: median (p25-p75) | active days by then: median | target');
    for (let L = 2; L <= TO; L++) {
      const rows = levels.filter((l) => l.level === L && cohort.has(l.playerId));
      const h = rows.map((l) => (new Date(l.ts) - start.get(l.playerId)) / 3600e3).filter((x) => x >= 0);
      const d = rows.map((l) => (days.get(l.playerId) || []).filter((day) => day <= l.day).length);
      console.log(`L${String(L).padStart(2)} | ${String(rows.length).padStart(7)} | ${hrs(quant(h, 0.5)).padStart(6)} (${hrs(quant(h, 0.25))}-${hrs(quant(h, 0.75))}) | ${String(quant(d, 0.5) ?? '-').padStart(3)} | ${TARGET[L] || ''}`);
    }
    console.log('Forward-only: levels reached before analytics_level existed (2026-10-24 build) have no row, so');
    console.log('read a level\'s numbers only from players who joined after it (use --since).');
  } finally { await c.close(); }
}

async function main() {
  if (PACING_ONLY) return pacing();
  let anchor = Number(opt('anchor', 0)) || null;
  let visited = null;
  const who = opt('player', null);
  if (who) {
    require(path.join(G, 'node_modules/dotenv')).config({ path: path.join(G, '.env') });
    const { MongoClient } = require(path.join(G, 'node_modules/mongodb'));
    const c = new MongoClient(process.env.MONGODB_URI); await c.connect();
    const p = await c.db().collection('players').findOne({ username: who }, { projection: { homesteadGridCoord: 1, gridsVisited: 1, xp: 1 } });
    await c.close();
    if (!p) throw new Error('no player ' + who);
    anchor = anchor || p.homesteadGridCoord;
    const buf = Buffer.from(p.gridsVisited?.buffer || p.gridsVisited || []);
    visited = [];
    for (let i = 0; i < 4096; i++) if (buf[i >> 3] & (1 << (i & 7))) visited.push(i);
  }
  anchor = anchor || 1010134;
  const [ar, ac] = rc(anchor);
  const valleys = Object.entries(cells).filter(([, t]) => /^valley/.test(t)).map(([k, t]) => {
    const [r, c] = rc(k); return { coord: Number(k), type: t, d: Math.max(Math.abs(r - ar), Math.abs(c - ac)) };
  }).sort((a, b) => a.d - b.d || a.coord - b.coord);

  console.log(`\n=== SUPPLY: spots on the N nearest valley grids to homestead ${anchor}: first sweep, then per day if every spot is revisited as it regrows ===`);
  console.log('regrow days: ' + SHOW.map((t) => `${t} ${regrowDays(t) ?? 'once'}`).join(', '));
  console.log('N grids | reach (grids away) | rings | ' + SHOW.join(' | '));
  for (const n of GRIDS) {
    const pick = valleys.slice(0, n); const sum = {}; const rings = {};
    for (const v of pick) { rings[v.type] = (rings[v.type] || 0) + 1; for (const [t, q] of Object.entries(goods(yieldOf(v.coord)))) sum[t] = (sum[t] || 0) + q; }
    console.log(`${String(n).padStart(4)}    | ${String(pick[pick.length - 1]?.d).padStart(2)} | ${Object.entries(rings).map(([t, q]) => t.replace('valley', 'v') + ':' + q).join(' ')} | ${SHOW.map((t) => Math.round(sum[t] || 0)).join(' | ')}`);
    console.log(`        |    per day after: ${perDay(sum).map((v) => v.toFixed(1)).join(' | ')}`);
  }
  if (visited) {
    // gridsVisited bit i = frontier cell (row i>>6, col i&63)
    const coordOf = (i) => { const fr = i >> 6, fc = i & 63; return 1010000 + Math.floor(fr / 8) * 1000 + Math.floor(fc / 8) * 100 + (fr % 8) * 10 + (fc % 8); };
    const sum = {}; const rings = {};
    for (const i of visited) { const c = coordOf(i); const t = cells[c]; if (!/^valley/.test(t || '')) continue; rings[t] = (rings[t] || 0) + 1; for (const [k, q] of Object.entries(goods(yieldOf(c)))) sum[k] = (sum[k] || 0) + q; }
    const pd = perDay(sum);
    console.log(`${who}'s ${visited.length} visited cells (${Object.entries(rings).map(([t, q]) => t + ' ' + q).join(', ')}): spots ${SHOW.map((t) => `${t} ${Math.round(sum[t] || 0)}`).join(', ')}; per day regrown ${SHOW.map((t, i) => `${t} ${pd[i].toFixed(1)}`).join(', ')}`);
    // one ring-2 grid, for comparison: what a mid-valley trip finds
    const ringAvg = (ring) => { const vs = Object.entries(cells).filter(([, t]) => t === ring).map(([k]) => goods(yieldOf(Number(k)))); const s2 = {}; for (const y of vs) for (const [k, q] of Object.entries(y)) s2[k] = (s2[k] || 0) + q / vs.length; return s2; };
    for (const ring of ['valley1', 'valley2', 'valley3']) { const a = ringAvg(ring); console.log(`average ${ring} grid: ${SHOW.map((t) => `${t} ${(a[t] || 0).toFixed(1)}`).join(', ')}`); }
  }

  // ---------------------------------------------------------------- quests
  console.log(`\n=== QUESTS by level (L1-${TO}) ===`);
  for (let L = 1; L <= TO; L++) {
    const qs = Q.filter((q) => (q.level || 1) === L);
    console.log(`L${String(L).padStart(2)} (${qs.length}) ${qs.map((q) => `${q.giver}: ${q.goal1action} ${q.goal1qty || ''} ${q.goal1item}${q.goal2item ? ' + ' + q.goal2item : ''} -> ${q.reward || ''}${q.rewardqty ? ' x' + q.rewardqty : ''}`).join(' | ')}`);
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
