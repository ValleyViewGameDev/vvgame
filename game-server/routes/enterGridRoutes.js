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
  findTownCoord, resolveCellGrid, resolveDungeonCopy, dungeonTemplateForEntrance,
  applyDungeonCatchUp, buildGridPayload, setPlayerLocation, sendPlayerHome, spawnNextTo, FTUE_KEY,
} = require('../utils/gridResolver');

const fail = (res, status, reason, extra = {}) => res.status(status).json({ error: reason, reason, ...extra });

router.post('/enter-grid', async (req, res) => {
  const { playerId, target } = req.body || {};
  if (!playerId || !target || typeof target !== 'object' || !target.type) return fail(res, 400, 'bad-target');

  try {
    const player = await Player.findById(playerId);
    if (!player) return fail(res, 404, 'no-player');
    const frontier = await Frontier.findById(player.frontierId || player.location?.f);
    if (!frontier) return fail(res, 404, 'no-frontier');

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
        const existing = loc.g ? await Grid.findById(loc.g) : null;
        const ownsIt = existing && (
          (existing.gridType === 'homestead' && player.gridId && existing._id.toString() === player.gridId.toString()) ||
          (existing.ownerId && existing.ownerId.toString() === player._id.toString())
        );
        if (ownsIt) {
          grid = existing.gridType === 'dungeon' ? await applyDungeonCatchUp(existing, frontier) : existing;
          settlementId = loc.s ?? grid.settlementId; gridCoord = grid.gridCoord ?? loc.gridCoord ?? null;
          if (grid.gridType === 'homestead') ownerUsername = player.username;
          if (grid.gridType !== 'dungeon' && gridCoord != null) {
            const r = await resolveCellGrid(player, frontier, gridCoord); // applies season catch-up
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
    await player.save();

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
