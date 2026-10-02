/**
 * Per-player world resolver (docs/phase-2-contract.md).
 *
 * The shared world is Frontier -> Settlement -> cells {gridCoord, gridType, gridId}. Homesteads are
 * one shared Grid per cell (ownerId = owner). Towns, valleys and dungeons are one Grid COPY per
 * player, created from the layout templates on first visit and caught up lazily (season trees/snow,
 * dungeon resets). This module turns "player + where" into "the Grid document to load".
 */
const Grid = require('../models/grid');
const Player = require('../models/player');
const Frontier = require('../models/frontier');
const Settlement = require('../models/settlement');
const gridResourceManager = require('./GridResourceManager');
const gridTileManager = require('./GridTileManager');
const { performGridCreation } = require('./createGridLogic');
const { plantNewTrees } = require('./plantNewTreesLogic');
const { applySeasonTiles } = require('./seasonTiles');
const { createDungeonGrid, resetDungeonGrid, FTUE_TEMPLATE, FTUE_KEY } = require('./dungeonUtils');
const { markGridVisited } = require('./gridsVisitedUtils');
const masterResources = require('../tuning/resources.json');

// ---------- coordinates ----------

/** TTFFSSGG (leading zero lost as a Number) -> settlement row/col + grid row/col. */
function parseGridCoord(gridCoord) {
  const ssgg = Number(gridCoord) % 10000;
  return {
    sRow: Math.floor(ssgg / 1000),
    sCol: Math.floor(ssgg / 100) % 10,
    gRow: Math.floor(ssgg / 10) % 10,
    gCol: ssgg % 10,
  };
}

/** The settlement document and cell for a gridCoord in a frontier. */
async function findCell(frontier, gridCoord) {
  const { sRow, sCol, gRow, gCol } = parseGridCoord(gridCoord);
  const entry = frontier.settlements?.[sRow]?.[sCol];
  if (!entry?.settlementId) return null;
  const settlement = await Settlement.findById(entry.settlementId);
  const cell = settlement?.grids?.[gRow]?.[gCol];
  if (!cell || Number(cell.gridCoord) !== Number(gridCoord)) return null;
  return { settlement, cell };
}

async function findTownCoord(settlement) {
  const cell = settlement?.grids?.flat().find((c) => c.gridType === 'town');
  return cell ? Number(cell.gridCoord) : null;
}

// ---------- lazy catch-up ----------

/** Bring a per-player town/valley copy up to the current season. Saves only if something changed. */
async function applySeasonCatchUp(grid, frontier) {
  const current = frontier?.seasons?.seasonNumber;
  if (current == null || grid.seasonNumber === current) return grid;
  const seasonType = frontier.seasons?.seasonType;
  let fresh = grid;
  if (/^valley/.test(grid.gridType)) {
    // Same semantics as the old season-end sweep: drop Wood doobers, top trees back up.
    await plantNewTrees(grid._id.toString(), grid.gridCoord);
    fresh = await Grid.findById(grid._id);
  }
  applySeasonTiles(fresh, seasonType);
  fresh.seasonNumber = current;
  await fresh.save({ validateBeforeSave: false });
  return fresh;
}

/** Reset a per-player dungeon copy when the frontier's dungeon clock has rolled over since its last reset. */
async function applyDungeonCatchUp(grid, frontier) {
  if (grid.templateKey === FTUE_KEY) return grid; // the tutorial cave never resets
  const epochStart = frontier?.dungeon?.startTime ? new Date(frontier.dungeon.startTime) : null;
  if (!epochStart || (grid.resetEpoch && new Date(grid.resetEpoch) >= epochStart)) return grid;
  const templateFilename = (grid.templateKey || '').replace(/^dungeon:/, '');
  return resetDungeonGrid(grid, templateFilename);
}

// ---------- resolution ----------

/**
 * The Grid the player should load for a world cell. Throws {status, reason} on refusal.
 * Homestead cells resolve to the shared owned grid (own only); town/valley cells to the player's copy.
 */
async function resolveCellGrid(player, frontier, gridCoord) {
  const found = await findCell(frontier, gridCoord);
  if (!found) throw Object.assign(new Error('no such cell'), { status: 404, reason: 'no-cell' });
  const { settlement, cell } = found;

  if (cell.gridType === 'homestead') {
    if (!cell.gridId || !player.gridId || cell.gridId.toString() !== player.gridId.toString()) {
      throw Object.assign(new Error('not your homestead'), { status: 403, reason: 'not-your-homestead' });
    }
    const grid = await Grid.findById(cell.gridId);
    if (!grid) throw Object.assign(new Error('homestead missing'), { status: 404, reason: 'no-homestead' });
    return { grid, settlement, cell };
  }

  if (cell.gridType === 'reserved') throw Object.assign(new Error('reserved cell'), { status: 404, reason: 'no-cell' });

  let grid = await Grid.findOne({ ownerId: player._id, gridCoord: Number(gridCoord) });
  if (!grid) {
    const created = await performGridCreation({
      gridCoord: Number(gridCoord), gridType: cell.gridType, settlementId: settlement._id, frontierId: frontier._id,
      ownerId: player._id, perPlayer: true, seasonNumber: frontier.seasons?.seasonNumber ?? null,
    });
    grid = await Grid.findById(created.gridId);
  } else {
    grid = await applySeasonCatchUp(grid, frontier);
  }
  return { grid, settlement, cell };
}

/** The player's copy of a dungeon template (created on first entry, reset lazily). */
async function resolveDungeonCopy(player, frontier, templateFilename, { isFTUE = false } = {}) {
  const templateKey = isFTUE ? FTUE_KEY : `dungeon:${templateFilename}`;
  let grid = await Grid.findOne({ ownerId: player._id, templateKey });
  if (!grid) {
    grid = await createDungeonGrid(templateFilename, {
      frontierId: frontier._id, settlementId: player.settlementId || frontier._id, ownerId: player._id, templateKey,
    });
  } else {
    grid = await applyDungeonCatchUp(grid, frontier);
  }
  return grid;
}

/** Registry lookup: which dungeon template is reachable from the entrance at gridCoord. */
function dungeonTemplateForEntrance(frontier, gridCoord) {
  if (!frontier?.dungeons) return null;
  const coord = Number(gridCoord);
  for (const [templateGridId, entry] of frontier.dungeons.entries()) {
    const entrances = (entry.entranceGrids || []).map(Number);
    if (entrances.includes(coord)) return { templateGridId, templateUsed: entry.templateUsed };
  }
  return null;
}

// ---------- spawns and payloads ----------

function findResource(grid, type) {
  return gridResourceManager.getResources(grid).find((r) => r.type === type) || null;
}

/** Position next to a named resource on a grid, or the fallback. */
function spawnNextTo(grid, type, offset, fallback) {
  const r = findResource(grid, type);
  return r ? { x: r.x + (offset?.x || 0), y: r.y + (offset?.y || 0) } : fallback;
}

/** Same shape as GET /load-grid plus the NPC/PC maps, trimmed to this player's PC record. */
function buildGridPayload(grid, playerId, { ownerUsername = null } = {}) {
  const raw = gridResourceManager.getResources(grid);
  const resources = raw.map((r) => {
    const t = masterResources.find((m) => m.type === r.type);
    return t ? { ...t, ...r } : { ...r };
  });
  const npcs = grid.NPCsInGrid instanceof Map ? Object.fromEntries(grid.NPCsInGrid) : (grid.NPCsInGrid || {});
  const pcs = grid.playersInGrid instanceof Map ? Object.fromEntries(grid.playersInGrid) : (grid.playersInGrid || {});
  const mine = playerId && pcs[playerId] ? { [playerId]: pcs[playerId] } : {};
  return {
    _id: grid._id, gridType: grid.gridType, gridCoord: grid.gridCoord ?? null, templateKey: grid.templateKey ?? null,
    ownerId: grid.ownerId ?? null, region: grid.region ?? null, settlementId: grid.settlementId, frontierId: grid.frontierId,
    isFTUECave: grid.templateKey === FTUE_KEY, ownerUsername,
    tiles: gridTileManager.getTiles(grid),
    resources,
    NPCsInGrid: npcs,
    NPCsInGridLastUpdated: grid.NPCsInGridLastUpdated,
    playersInGrid: mine,
  };
}

/** Write the player's location for a resolved grid. x/y only when known. */
function setPlayerLocation(player, grid, settlementId, gridCoord, xy) {
  player.location = {
    ...(player.location?.toObject ? player.location.toObject() : (player.location || {})),
    g: grid._id, s: settlementId ?? null, f: grid.frontierId, gridCoord: gridCoord ?? null,
    gtype: grid.gridType, region: grid.region ?? null,
    ...(xy ? { x: xy.x, y: xy.y } : {}),
  };
  if (gridCoord != null) {
    player.gridsVisited = markGridVisited(player.gridsVisited, Number(gridCoord));
    player.markModified('gridsVisited');
  }
}

/**
 * Send a player to their homestead (season end, admin "send home", dungeon/FTUE exits, boot fallback).
 * Spawns one tile right of Signpost Town, restores HP. Returns {grid, spawn} or null if they have no homestead.
 */
async function sendPlayerHome(player, { save = true } = {}) {
  if (!player.gridId) return null;
  const grid = await Grid.findById(player.gridId);
  if (!grid) return null;
  const spawn = spawnNextTo(grid, 'Signpost Town', { x: 1, y: 0 }, { x: 30, y: 33 });
  setPlayerLocation(player, grid, player.settlementId, player.homesteadGridCoord ?? grid.gridCoord, spawn);
  player.sourceGridBeforeDungeon = null;
  player.maxhp = player.maxhp ?? player.baseMaxhp ?? null;
  if (player.maxhp != null) player.hp = player.maxhp; // going home restores health
  player.iscamping = false;
  player.isinboat = false;
  if (save) await player.save();
  return { grid, spawn };
}

module.exports = {
  parseGridCoord, findCell, findTownCoord, resolveCellGrid, resolveDungeonCopy, dungeonTemplateForEntrance,
  applySeasonCatchUp, applyDungeonCatchUp, buildGridPayload, setPlayerLocation, sendPlayerHome, spawnNextTo,
  FTUE_TEMPLATE, FTUE_KEY,
};
