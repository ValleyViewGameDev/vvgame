/**
 * The debug panel's "Teleport to Another Grid" (developers only, requireDeveloper).
 *
 *   GET  /api/dev-teleport/snug-places  -> { places: [{ label, gridCoord }], snugCoords: [gridCoord] }
 *        Every place Snug stands, picked the way Travel with Snug picks them (snugTravelRoutes.js):
 *        the home Town, then one grid per Region (the first visited Snug grid, else the first by
 *        gridCoord), by name. No visited or greeted check: a developer may go anywhere.
 *        snugCoords = every template layout with a Snug, so the client can keep its other
 *        shortcuts (debugTravelShortcuts.json) to the grids without one.
 *   POST /api/dev-teleport { gridCoord, npc? } -> { success, gridCoord, x, y, arrival }
 *        Where to arrive in the player's copy of that grid: next to Snug when the grid has one
 *        (arrival 'snug'), else next to the NPC of type `npc` (the shortcut's name, 'npc'), else
 *        the open tile nearest 31,31 ('centre'). The client then enters the grid with
 *        changePlayerLocation({ type: 'coord', gridCoord, x, y }), as Snug travel does.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const Player = require('../models/player');
const Frontier = require('../models/frontier');
const Settlement = require('../models/settlement');
const { requireDeveloper } = require('../utils/developerHelpers');
const { isGridVisited } = require('../utils/gridsVisitedUtils');
const { findTownCoord, resolveCellGrid, nearestOpenTile } = require('../utils/gridResolver');
const snug = require('./snugTravelRoutes');
const resources = require('../tuning/resources.json');

const FIXED = path.join(__dirname, '..', 'layouts', 'gridLayouts', 'valleyFixedCoord');
const CENTRE = { x: 31, y: 31 };

/** Every gridCoord whose template layout has a Snug (snugInLayout caches each file by mtime). */
function snugCoords() {
  let files = [];
  try { files = fs.readdirSync(FIXED).filter((f) => /^\d+\.json$/.test(f)); } catch { return []; }
  return files.map((f) => Number(f.slice(0, -5))).filter((c) => snug.snugInLayout(c));
}

/** The NPC's tile in a template layout (by its layoutkey), or null. */
function npcInLayout(gridCoord, type) {
  const key = resources.find((r) => r.type === type && r.category === 'npc')?.layoutkey;
  if (!key) return null;
  try {
    const rows = JSON.parse(fs.readFileSync(path.join(FIXED, `${gridCoord}.json`), 'utf8')).resources || [];
    for (let y = 0; y < rows.length; y++) {
      const x = (rows[y] || []).indexOf(key);
      if (x >= 0) return { x, y };
    }
  } catch { /* no layout */ }
  return null;
}

async function loadPlayer(req) {
  const player = await Player.findOne({ playerId: req.get('x-player-id') });
  if (!player) throw Object.assign(new Error('Player not found'), { status: 404 });
  const frontier = await Frontier.findById(player.location?.f || player.frontierId);
  if (!frontier) throw Object.assign(new Error('Frontier not found'), { status: 404 });
  return { player, frontier };
}

router.get('/dev-teleport/snug-places', requireDeveloper, async (req, res) => {
  try {
    const { player, frontier } = await loadPlayer(req);
    const withSnug = new Set(snugCoords());   // every template with a Snug, and below, the places listed
    const byRegion = new Map();
    for (const c of await snug.frontierRegions(frontier)) {
      if (!snug.snugSpotFor(player, c.gridCoord)) continue;
      if (!byRegion.has(c.region)) byRegion.set(c.region, []);
      byRegion.get(c.region).push(c);
    }
    const places = [...byRegion].map(([region, list]) => {
      list.sort((a, b) => a.gridCoord - b.gridCoord);
      const target = list.find((c) => isGridVisited(player.gridsVisited, c.gridCoord)) || list[0];
      return { label: region, gridCoord: target.gridCoord };
    }).sort((a, b) => a.label.localeCompare(b.label));
    for (const p of places) withSnug.add(p.gridCoord);   // the Oracle's clearing once Hope is returned
    const settlement = player.settlementId ? await Settlement.findById(player.settlementId, 'grids').lean() : null;
    const townCoord = await findTownCoord(settlement);
    if (townCoord != null) {
      places.unshift({ label: 'Town', gridCoord: townCoord });
      withSnug.add(townCoord);
    }
    res.json({ success: true, places, snugCoords: [...withSnug] });
  } catch (error) {
    console.error('❌ GET /dev-teleport/snug-places failed:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.post('/dev-teleport', requireDeveloper, async (req, res) => {
  const gridCoord = Number(req.body?.gridCoord);
  const npc = typeof req.body?.npc === 'string' ? req.body.npc : null;
  if (!Number.isFinite(gridCoord)) return res.status(400).json({ error: 'gridCoord is required' });
  try {
    const { player, frontier } = await loadPlayer(req);
    const { grid } = await resolveCellGrid(player, frontier, gridCoord);   // created now on a first visit
    const isTown = grid.gridType === 'town';
    const snugSpot = isTown ? snug.TOWN_SNUG : snug.snugSpotFor(player, gridCoord);
    let spot = null, arrival = 'centre';
    if (snugSpot) { spot = snug.tileNextToSnug(grid, snugSpot); arrival = 'snug'; }
    if (!spot && npc) { spot = snug.tileNextToNpc(grid, npc, npcInLayout(gridCoord, npc)); arrival = 'npc'; }
    if (!spot) { spot = nearestOpenTile(grid, CENTRE, 32); arrival = 'centre'; }
    res.json({ success: true, gridCoord, x: spot.x, y: spot.y, arrival });
  } catch (error) {
    console.error('❌ POST /dev-teleport failed:', error);
    res.status(error.status || 500).json({ error: error.reason || error.message });
  }
});

module.exports = router;
