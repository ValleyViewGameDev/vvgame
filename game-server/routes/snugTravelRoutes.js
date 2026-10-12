/**
 * Travel with Snug (owner, 2026-10-12): Snug, the NPC (resources.json 'Snug', layout key n13), takes
 * a player who has greeted him to any Region they have visited that also has a Snug, or to their
 * home Town, for Money that grows with the distance.
 *
 *   GET  /api/snug-travel/:playerId          -> { destinations: [{ key, kind, region, gridCoord, cost }] }
 *   POST /api/snug-travel { playerId, key, transactionId }
 *        -> { success, gridCoord, x, y, cost, inventory, backpack }; the client then enters the grid
 *           (changePlayerLocation with { type: 'coord', gridCoord, x, y }).
 *
 * - A Region is visited when the player has visited at least one of its grids (Player.gridsVisited,
 *   so every existing player already qualifies for what they have seen). Regions live on the template
 *   grid of each Settlement cell (Grid.region, set from the editor).
 * - Where Snug stands comes from the template layouts (layouts/gridLayouts/valleyFixedCoord/<coord>.json,
 *   key n13), the source every player's copy of a grid is made from. A Region with several Snugs
 *   uses the first visited one (else the first by gridCoord).
 * - Town is always offered (every town layout has Snug); Home is not part of this.
 * - The place the player is in now is not offered.
 * - Cost: globalTuning.json snugTravel (100 to 2000 by straight-line distance in grids).
 * - Arrival: a free tile next to Snug in the player's copy of the grid (his home or current
 *   position), else next to where the template puts him.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const Player = require('../models/player');
const Frontier = require('../models/frontier');
const Settlement = require('../models/settlement');
const Grid = require('../models/grid');
const { isGridVisited } = require('../utils/gridsVisitedUtils');
const { findTownCoord, resolveCellGrid, openTileTest } = require('../utils/gridResolver');
const { heldQuantity, takeFromHoldings } = require('../utils/playerHoldings');
const tuning = require('../tuning/globalTuning.json').snugTravel || { minCost: 100, maxCost: 2000, fullCostDistance: 56, roundTo: 10 };

const SNUG = 'Snug', SNUG_KEY = 'n13', TX_KEY = 'snug-travel';
const FIXED = path.join(__dirname, '..', 'layouts', 'gridLayouts', 'valleyFixedCoord');
const TOWN_SNUG = { x: 27, y: 51 };   // where every town layout puts him (fallback only)

// ---------- where things are ----------

/** Frontier row/col of a gridCoord (8x8 settlements of 8x8 grids). */
function frontierPos(gridCoord) {
  const ssgg = Number(gridCoord) % 10000;
  return { row: Math.floor(ssgg / 1000) * 8 + Math.floor(ssgg / 10) % 10, col: (Math.floor(ssgg / 100) % 10) * 8 + ssgg % 10 };
}

function costBetween(fromCoord, toCoord) {
  if (fromCoord == null) return tuning.maxCost;
  const a = frontierPos(fromCoord), b = frontierPos(toCoord);
  const d = Math.hypot(a.row - b.row, a.col - b.col);
  const raw = tuning.minCost + (tuning.maxCost - tuning.minCost) * Math.min(1, d / tuning.fullCostDistance);
  const step = tuning.roundTo || 1;
  return Math.max(tuning.minCost, Math.min(tuning.maxCost, Math.round(raw / step) * step));
}

// Snug's tile in a template layout, cached by file modification time
const layoutCache = new Map();   // gridCoord -> { mtimeMs, snug: {x, y} | null }
function snugInLayout(gridCoord) {
  const f = path.join(FIXED, `${gridCoord}.json`);
  let stat;
  try { stat = fs.statSync(f); } catch { return null; }
  const hit = layoutCache.get(gridCoord);
  if (hit && hit.mtimeMs === stat.mtimeMs) return hit.snug;
  let snug = null;
  try {
    const rows = JSON.parse(fs.readFileSync(f, 'utf8')).resources || [];
    for (let y = 0; y < rows.length && !snug; y++) {
      const x = (rows[y] || []).indexOf(SNUG_KEY);
      if (x >= 0) snug = { x, y };
    }
  } catch { snug = null; }
  layoutCache.set(gridCoord, { mtimeMs: stat.mtimeMs, snug });
  return snug;
}

// Region of every cell of a frontier (from the cell's template grid), cached briefly
const regionCache = new Map();   // frontierId -> { at, cells: [{ gridCoord, region }] }
async function frontierRegions(frontier) {
  const key = String(frontier._id), hit = regionCache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.cells;
  const ids = (frontier.settlements || []).flat().map((e) => e && e.settlementId).filter(Boolean);
  const settlements = await Settlement.find({ _id: { $in: ids } }, 'grids').lean();
  const cells = settlements.flatMap((s) => (s.grids || []).flat()).filter((c) => c && c.gridId && c.gridCoord != null);
  const regions = await Grid.find({ _id: { $in: cells.map((c) => c.gridId) }, region: { $ne: null } }, { region: 1 }).lean();
  const byId = new Map(regions.map((g) => [String(g._id), g.region]));
  const out = cells.map((c) => ({ gridCoord: Number(c.gridCoord), region: byId.get(String(c.gridId)) || null })).filter((c) => c.region);
  regionCache.set(key, { at: Date.now(), cells: out });
  return out;
}

const hasGreetedSnug = (player) => (player.relationships || []).some((r) => r.name === SNUG && r.met === true);
const here = (player) => player.location?.gridCoord ?? player.homesteadGridCoord ?? null;

/** Every destination the player may pick now. */
async function destinationsFor(player, frontier) {
  const cells = await frontierRegions(frontier);
  const byRegion = new Map();
  for (const c of cells) {
    if (!byRegion.has(c.region)) byRegion.set(c.region, []);
    byRegion.get(c.region).push(c);
  }
  const from = here(player);
  const currentRegion = player.location?.region || null;
  const out = [];
  for (const [region, list] of byRegion) {
    if (region === currentRegion) continue;
    if (!list.some((c) => isGridVisited(player.gridsVisited, c.gridCoord))) continue;   // never been to this Region
    const withSnug = list.filter((c) => snugInLayout(c.gridCoord)).sort((a, b) => a.gridCoord - b.gridCoord);
    if (!withSnug.length) continue;
    const target = withSnug.find((c) => isGridVisited(player.gridsVisited, c.gridCoord)) || withSnug[0];
    out.push({ key: `region:${region}`, kind: 'region', region, gridCoord: target.gridCoord, cost: costBetween(from, target.gridCoord) });
  }
  out.sort((a, b) => a.cost - b.cost || a.region.localeCompare(b.region));
  // the home Town, always, unless the player is in it
  const settlement = player.settlementId ? await Settlement.findById(player.settlementId, 'grids').lean() : null;
  const townCoord = await findTownCoord(settlement);
  if (townCoord != null && Number(from) !== townCoord) {
    out.unshift({ key: 'town', kind: 'town', region: null, gridCoord: townCoord, cost: costBetween(from, townCoord) });
  }
  return out;
}

/** A free tile next to Snug on the player's copy of the grid (ring 1 first, then wider). */
function tileNextToSnug(grid, templateSpot) {
  const npcs = grid.NPCsInGrid instanceof Map ? [...grid.NPCsInGrid.values()] : Object.values(grid.NPCsInGrid || {});
  const snug = npcs.find((n) => n && n.type === SNUG);
  const at = snug ? { x: Math.round(snug.homeX ?? snug.position?.x), y: Math.round(snug.homeY ?? snug.position?.y) } : templateSpot;
  if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return null;
  const open = openTileTest(grid);
  for (let r = 1; r <= 6; r++) {
    let best = null;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !open(at.x + dx, at.y + dy)) continue;
      const d = dx * dx + dy * dy + (dy === 1 && dx === 0 ? -0.5 : 0);   // just in front of him when free
      if (!best || d < best.d) best = { x: at.x + dx, y: at.y + dy, d };
    }
    if (best) return { x: best.x, y: best.y };
  }
  return null;
}

// ---------- routes ----------

router.get('/snug-travel/:playerId', async (req, res) => {
  try {
    const player = await Player.findOne({ playerId: req.params.playerId }).select('relationships gridsVisited location homesteadGridCoord settlementId frontierId');
    if (!player) return res.status(404).json({ error: 'Player not found' });
    if (!hasGreetedSnug(player)) return res.status(403).json({ error: 'not-greeted' });
    const frontier = await Frontier.findById(player.location?.f || player.frontierId).select('settlements').lean();
    if (!frontier) return res.status(404).json({ error: 'Frontier not found' });
    res.json({ success: true, destinations: await destinationsFor(player, frontier) });
  } catch (error) {
    console.error('❌ GET /snug-travel failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/snug-travel', async (req, res) => {
  const { playerId, key, transactionId } = req.body || {};
  if (!playerId || !key || !transactionId) return res.status(400).json({ error: 'playerId, key and transactionId are required' });
  try {
    const player = await Player.findOne({ playerId });
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const last = player.lastTransactionIds?.get(TX_KEY);
    if (last && typeof last === 'object' && last.id === transactionId) return res.json({ success: true, ...last.result, inventory: player.inventory, backpack: player.backpack });
    if (!hasGreetedSnug(player)) return res.status(403).json({ error: 'not-greeted' });

    const frontier = await Frontier.findById(player.location?.f || player.frontierId);
    if (!frontier) return res.status(404).json({ error: 'Frontier not found' });
    const dest = (await destinationsFor(player, frontier)).find((d) => d.key === key);
    if (!dest) return res.status(409).json({ error: 'not-a-destination' });
    if (heldQuantity(player.inventory, player.backpack, 'Money') < dest.cost) return res.status(402).json({ error: 'not-enough-money', cost: dest.cost });

    // the player's copy of the grid (created now if this is the first visit to that very grid)
    const { grid } = await resolveCellGrid(player, frontier, dest.gridCoord);
    const spot = tileNextToSnug(grid, dest.kind === 'town' ? TOWN_SNUG : snugInLayout(dest.gridCoord));
    if (!spot) return res.status(409).json({ error: 'no-room-next-to-snug' });

    if (!takeFromHoldings(player.inventory, player.backpack, 'Money', dest.cost)) return res.status(402).json({ error: 'not-enough-money', cost: dest.cost });
    player.markModified('inventory'); player.markModified('backpack');
    const result = { gridCoord: dest.gridCoord, x: spot.x, y: spot.y, cost: dest.cost, kind: dest.kind, region: dest.region };
    player.lastTransactionIds.set(TX_KEY, { id: transactionId, timestamp: Date.now(), result });
    await player.save();
    res.json({ success: true, ...result, inventory: player.inventory, backpack: player.backpack });
  } catch (error) {
    console.error('❌ POST /snug-travel failed:', error);
    res.status(error.status || 500).json({ error: error.reason || 'Internal server error' });
  }
});

module.exports = router;
module.exports.costBetween = costBetween;
module.exports.snugInLayout = snugInLayout;
module.exports.destinationsFor = destinationsFor;   // for checks
module.exports.tileNextToSnug = tileNextToSnug;
