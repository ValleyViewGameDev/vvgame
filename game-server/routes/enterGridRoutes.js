/**
 * POST /api/enter-grid  (docs/phase-2-contract.md)
 * The single grid-change resolver: turns a target into the player's Grid, writes player.location,
 * and returns the full grid bundle so the client makes exactly one call per grid change.
 */
const express = require('express');
const router = express.Router();
const Grid = require('../models/grid');
const Player = require('../models/player');
const Frontier = require('../models/frontier');
const Settlement = require('../models/settlement');
const {
  findCell, findTownCoord, resolveCellGrid, resolveDungeonCopy, dungeonTemplateForEntrance,
  applyDungeonCatchUp, buildGridPayload, setPlayerLocation, sendPlayerHome, spawnNextTo, FTUE_KEY,
} = require('../utils/gridResolver');

const { recordActivity, recordGridEntered } = require('../utils/analytics');

const fail = (res, status, reason, extra = {}) => res.status(status).json({ error: reason, reason, ...extra });

/**
 * Player + Frontier in one round trip when the client sends its frontierId (it always knows it);
 * the player's own frontier is re-read only when the hint is missing or wrong.
 */
async function loadPlayerAndFrontier(playerId, frontierHint) {
  const [player, hinted] = await Promise.all([
    Player.findById(playerId),
    frontierHint ? Frontier.findById(frontierHint).catch(() => null) : null,
  ]);
  if (!player) return { player: null, frontier: null };
  const wanted = String(player.frontierId || player.location?.f || '');
  const frontier = (hinted && String(hinted._id) === wanted) ? hinted : await Frontier.findById(wanted || null);
  return { player, frontier };
}

// The previous grid's leave-side state (docs/phase-3-contract.md §4.2) arrives in two parts:

/** The player's own leave-side state: synchronous, on the in-memory Player (saved with the entry). */
function applyLeaveState(player, leave) {
  if (!leave || typeof leave !== 'object') return;
  const { state } = leave;
  if (state && typeof state === 'object') {
    if (Number.isInteger(state.x) && Number.isInteger(state.y) && state.x >= 0 && state.x < 64 && state.y >= 0 && state.y < 64) {
      player.location = { ...(player.location?.toObject ? player.location.toObject() : (player.location || {})), x: state.x, y: state.y };
    }
    if (Number.isFinite(state.maxhp) && state.maxhp > 0) player.maxhp = state.maxhp;
    if (Number.isFinite(state.hp)) player.hp = Math.max(0, player.maxhp != null ? Math.min(state.hp, player.maxhp) : state.hp);
  }
}

/** The from-grid's NPC positions: its own documents, so it runs alongside the target resolve. */
async function applyLeaveNpcs(player, leave) {
  if (!leave || typeof leave !== 'object') return;
  const { fromGridId, npcPositions } = leave;
  if (fromGridId && npcPositions && typeof npcPositions === 'object') {
    const grid = await Grid.findById(fromGridId, 'ownerId gridType NPCsInGrid');
    const mine = grid && (!grid.ownerId || grid.ownerId.toString() === player._id.toString());
    if (mine) {
      const known = grid.NPCsInGrid instanceof Map ? grid.NPCsInGrid : new Map(Object.entries(grid.NPCsInGrid || {}));
      const set = {};
      for (const [npcId, pos] of Object.entries(npcPositions)) {
        // Only move NPCs that exist: a $set on an unknown key would create a junk entry.
        if (!known.has(npcId) || !Number.isInteger(pos?.x) || !Number.isInteger(pos?.y)) continue;
        set[`NPCsInGrid.${npcId}.position`] = { x: pos.x, y: pos.y };
      }
      if (Object.keys(set).length) { set.NPCsInGridLastUpdated = new Date(); await Grid.updateOne({ _id: grid._id }, { $set: set }); }
    }
  }
}

/** Compact per-cell map of the frontier for client-side travel validation (§4.1). */
router.get('/world-map/:frontierId', async (req, res) => {
  try {
    const frontier = await Frontier.findById(req.params.frontierId).lean();
    if (!frontier) return fail(res, 404, 'no-frontier');
    const playerId = req.query.playerId ? String(req.query.playerId) : null;
    const player = playerId ? await Player.findById(playerId, 'gridId').lean() : null;
    const myHomestead = player?.gridId ? String(player.gridId) : null;
    const ids = frontier.settlements.flat().map((e) => e?.settlementId).filter(Boolean);
    const docs = await Settlement.find({ _id: { $in: ids } }, 'grids').lean();
    const byId = new Map(docs.map((d) => [String(d._id), d]));
    const settlements = frontier.settlements.map((row) => row.map((entry) => {
      const doc = entry?.settlementId ? byId.get(String(entry.settlementId)) : null;
      // Only homestead settlements carry a meaningful `available`; valley sets are never "available" but are always open.
      const isHomesteadSet = /^homestead/.test(entry?.settlementType || '');
      const open = !!doc && !(isHomesteadSet && entry.available === false);
      let cells = 'R'.repeat(64);
      if (doc && open) {
        cells = doc.grids.flat().map((c) => {
          if (!c) return 'R';
          if (c.gridType === 'homestead') return c.gridId ? (String(c.gridId) === myHomestead ? 'M' : 'H') : 'R';
          if (c.gridType === 'town') return 'T';
          if (/^valley/.test(c.gridType || '')) return 'V';
          return 'R';
        }).join('');
      }
      return { settlementId: entry?.settlementId ?? null, type: entry?.settlementType ?? null, open, cells };
    }));
    res.json({ frontierId: frontier._id, settlements });
  } catch (err) {
    console.error('world-map failed:', err);
    res.status(500).json({ error: 'world-map failed' });
  }
});

/** Resolve (and create if needed) the player's copy of a cell without moving the player (§4.3). */
router.post('/grid-prefetch', async (req, res) => {
  const { playerId, gridCoord } = req.body || {};
  if (!playerId || !Number.isFinite(Number(gridCoord))) return fail(res, 400, 'bad-target');
  try {
    const { player, frontier } = await loadPlayerAndFrontier(playerId, req.body.frontierId);
    if (!player) return fail(res, 404, 'no-player');
    if (!frontier) return fail(res, 404, 'no-frontier');
    const r = await resolveCellGrid(player, frontier, Number(gridCoord));
    const ownerUsername = r.grid.gridType === 'homestead' ? player.username : null;
    return res.json({ grid: buildGridPayload(r.grid, playerId, { ownerUsername }), ownerUsername });
  } catch (err) {
    if (err.status) return fail(res, err.status, err.reason || err.message);
    console.error('grid-prefetch failed:', err);
    return res.status(500).json({ error: 'grid-prefetch failed' });
  }
});

router.post('/enter-grid', async (req, res) => {
  const { playerId, target } = req.body || {};
  if (!playerId || !target || typeof target !== 'object' || !target.type) return fail(res, 400, 'bad-target');

  try {
    const { player, frontier } = await loadPlayerAndFrontier(playerId, req.body.frontierId);
    if (!player) return fail(res, 404, 'no-player');
    if (!frontier) return fail(res, 404, 'no-frontier');

    // §4.2: leave-side state rides along so a crossing is one round trip. The player's own
    // state lands now; the from-grid's NPC write runs alongside the target resolve below.
    applyLeaveState(player, req.body.leave);
    const leaveNpcs = applyLeaveNpcs(player, req.body.leave);

    const xy = Number.isFinite(target.x) && Number.isFinite(target.y) ? { x: target.x, y: target.y } : null;
    let grid, settlementId = null, gridCoord = null, spawn = null, ownerUsername = null;

    const enterCell = async (coord) => {
      const r = await resolveCellGrid(player, frontier, coord);
      grid = r.grid; settlementId = r.settlement._id; gridCoord = Number(coord);
      if (grid.gridType === 'homestead') ownerUsername = player.username;
      setPlayerLocation(player, grid, settlementId, gridCoord, xy);
    };

    switch (target.type) {
      case 'coord': {
        if (!Number.isFinite(Number(target.gridCoord))) return fail(res, 400, 'bad-target');
        await enterCell(Number(target.gridCoord));
        break;
      }
      case 'home': {
        const home = await sendPlayerHome(player, { save: false });
        if (!home) return fail(res, 404, 'no-homestead');
        grid = home.grid; settlementId = player.settlementId; gridCoord = player.homesteadGridCoord ?? grid.gridCoord;
        ownerUsername = player.username;
        if (xy) setPlayerLocation(player, grid, settlementId, gridCoord, xy); else spawn = home.spawn;
        break;
      }
      case 'town': {
        if (!player.settlementId) return fail(res, 404, 'no-homestead');
        const settlement = await Settlement.findById(player.settlementId);
        const coord = await findTownCoord(settlement);
        if (coord == null) return fail(res, 404, 'no-cell');
        await enterCell(coord);
        break;
      }
      case 'enter-dungeon': {
        if (!target.fromGridId) return fail(res, 400, 'bad-target');
        const from = await Grid.findById(target.fromGridId, 'gridCoord ownerId gridType');
        if (!from || from.gridCoord == null) return fail(res, 404, 'no-dungeon-here');
        const reg = dungeonTemplateForEntrance(frontier, from.gridCoord);
        if (!reg) return fail(res, 404, 'no-dungeon-here');
        grid = await resolveDungeonCopy(player, frontier, reg.templateUsed);
        spawn = spawnNextTo(grid, 'Dungeon Exit', { x: 0, y: 0 }, { x: 32, y: 32 });
        player.sourceGridBeforeDungeon = from._id.toString();
        setPlayerLocation(player, grid, player.settlementId, null, spawn);
        break;
      }
      case 'exit-dungeon': {
        const current = player.location?.g ? await Grid.findById(player.location.g, 'templateKey gridType') : null;
        if (current?.templateKey === FTUE_KEY || !player.sourceGridBeforeDungeon) {
          const home = await sendPlayerHome(player, { save: false });
          if (!home) return fail(res, 404, 'no-homestead');
          grid = home.grid; settlementId = player.settlementId; gridCoord = player.homesteadGridCoord ?? grid.gridCoord;
          ownerUsername = player.username; spawn = home.spawn;
        } else {
          const source = await Grid.findById(player.sourceGridBeforeDungeon);
          if (!source) return fail(res, 404, 'no-source-grid');
          if (source.ownerId && source.ownerId.toString() !== player._id.toString()) return fail(res, 403, 'not-your-grid');
          grid = source; settlementId = source.settlementId; gridCoord = source.gridCoord;
          spawn = spawnNextTo(grid, 'Dungeon Entrance', { x: 0, y: 1 }, { x: 32, y: 32 });
          setPlayerLocation(player, grid, settlementId, gridCoord, spawn);
          player.sourceGridBeforeDungeon = null;
        }
        break;
      }
      case 'current': {
        const loc = player.location || {};
        // The current grid and its world cell are independent reads: one round trip, not two
        const [existing, found] = await Promise.all([
          loc.g ? Grid.findById(loc.g) : null,
          loc.gridCoord != null ? findCell(frontier, loc.gridCoord).catch(() => null) : null,
        ]);
        const ownsIt = existing && (
          (existing.gridType === 'homestead' && player.gridId && existing._id.toString() === player.gridId.toString()) ||
          (existing.ownerId && existing.ownerId.toString() === player._id.toString())
        );
        if (ownsIt) {
          grid = existing.gridType === 'dungeon' ? await applyDungeonCatchUp(existing, frontier) : existing;
          settlementId = loc.s ?? grid.settlementId; gridCoord = grid.gridCoord ?? loc.gridCoord ?? null;
          if (grid.gridType === 'homestead') ownerUsername = player.username;
          if (grid.gridType !== 'dungeon' && gridCoord != null) {
            // applies season catch-up; reuses `existing` when it is this very grid (no second read)
            const r = await resolveCellGrid(player, frontier, gridCoord, { found: Number(found?.cell?.gridCoord) === Number(gridCoord) ? found : null, existing: grid });
            grid = r.grid; settlementId = r.settlement._id;
          }
          setPlayerLocation(player, grid, settlementId, gridCoord, xy || (Number.isFinite(loc.x) ? { x: loc.x, y: loc.y } : null));
        } else if (loc.gridCoord != null) {
          try { await enterCell(Number(loc.gridCoord)); }
          catch (e) { if (e.status !== 403 && e.status !== 404) throw e; const home = await sendPlayerHome(player, { save: false }); if (!home) return fail(res, 404, 'no-homestead'); grid = home.grid; settlementId = player.settlementId; gridCoord = player.homesteadGridCoord; ownerUsername = player.username; spawn = home.spawn; }
        } else {
          const home = await sendPlayerHome(player, { save: false });
          if (!home) return fail(res, 404, 'no-homestead');
          grid = home.grid; settlementId = player.settlementId; gridCoord = player.homesteadGridCoord; ownerUsername = player.username; spawn = home.spawn;
        }
        break;
      }
      default:
        return fail(res, 400, 'bad-target');
    }

    player.lastActive = new Date();
    await leaveNpcs; // the leave is part of this round trip (§4.2)
    await player.save();
    // Analytics (fire-and-forget): day heartbeat + the grids_entered counter.
    recordActivity(player._id).catch(() => {});
    recordGridEntered(player._id).catch(() => {});

    return res.json({
      grid: buildGridPayload(grid, playerId, { ownerUsername }),
      location: player.location,
      spawn,
      ownerUsername,
    });
  } catch (err) {
    if (err.status) return fail(res, err.status, err.reason || err.message);
    console.error('❌ enter-grid failed:', err);
    return res.status(500).json({ error: 'enter-grid failed', detail: err.message });
  }
});

module.exports = router;
