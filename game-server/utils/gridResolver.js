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
async function resolveCellGrid(player, frontier, gridCoord, hints = {}) {
  // hints: { found } a findCell result the caller already has; { existing } a Grid document the
  // caller already read (used instead of a second read when it is this very grid). Every DB
  // round trip here is ~35 ms, and enter-grid pays them in sequence (2026-10-07).
  const found = hints.found || await findCell(frontier, gridCoord);
  if (!found) throw Object.assign(new Error('no such cell'), { status: 404, reason: 'no-cell' });
  const { settlement, cell } = found;
  const existing = hints.existing || null;

  if (cell.gridType === 'homestead') {
    if (!cell.gridId || !player.gridId || cell.gridId.toString() !== player.gridId.toString()) {
      throw Object.assign(new Error('not your homestead'), { status: 403, reason: 'not-your-homestead' });
    }
    const grid = (existing && String(existing._id) === String(cell.gridId)) ? existing : await Grid.findById(cell.gridId);
    if (!grid) throw Object.assign(new Error('homestead missing'), { status: 404, reason: 'no-homestead' });
    return { grid, settlement, cell };
  }

  if (cell.gridType === 'reserved') throw Object.assign(new Error('reserved cell'), { status: 404, reason: 'no-cell' });

  const isMyCopy = existing && existing.ownerId && String(existing.ownerId) === String(player._id)
    && Number(existing.gridCoord) === Number(gridCoord);
  let grid = isMyCopy ? existing : await Grid.findOne({ ownerId: player._id, gridCoord: Number(gridCoord) });
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

const masterByType = new Map(require('../tuning/resources.json').map((r) => [r.type, r]));

/**
 * Open-tile test for a grid: inside it, a passable tile type (resources.json tile rows; water
 * is not), and no impassable resource on it, including the footprint of a multi-tile one
 * (anchor x..x+size-1, y-size+1..y, as AppInit.enrichGridResources lays out the shadows).
 */
function openTileTest(grid) {
  const tiles = gridTileManager.getTiles(grid) || [];
  const rows = tiles.length;
  const cols = rows ? tiles[0].length : 0;
  const blocked = new Set();
  for (const r of gridResourceManager.getResources(grid)) {
    const def = masterByType.get(r.type);
    const passable = r.passable !== undefined ? r.passable : def?.passable;
    if (passable !== false) continue;
    for (const [x, y] of footprint(r)) blocked.add(`${x},${y}`);
  }
  return (x, y) => {
    if (x < 0 || y < 0 || y >= rows || x >= cols) return false;
    return !!masterByType.get(tiles[y]?.[x])?.passable && !blocked.has(`${x},${y}`);
  };
}

function footprint(r) {
  const def = masterByType.get(r.type);
  const size = Number(def?.size) > 1 ? Number(def.size) : 1;
  const cells = [];
  for (let dx = 0; dx < size; dx++) {
    for (let dy = 0; dy < size; dy++) cells.push([r.x + dx, r.y - dy]);
  }
  return cells;
}

/** The open tile nearest to `pos` (pos itself when open), searched in rings out to maxRadius. */
function nearestOpenTile(grid, pos, maxRadius = 8, open = openTileTest(grid)) {
  if (!pos) return pos;
  const x0 = Math.round(pos.x);
  const y0 = Math.round(pos.y);
  if (open(x0, y0)) return { x: x0, y: y0 };
  for (let radius = 1; radius <= maxRadius; radius++) {
    let best = null;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius || !open(x0 + dx, y0 + dy)) continue;
        const d = dx * dx + dy * dy;
        if (!best || d < best.d) best = { x: x0 + dx, y: y0 + dy, d };
      }
    }
    if (best) return { x: best.x, y: best.y };
  }
  return { x: x0, y: y0 };
}

/**
 * Position next to a named resource on a grid, or the fallback, never on a blocked tile (BL-6:
 * the towns put a Stone Wall right under the Dungeon Entrance). When the preferred spot is
 * blocked, the player goes to the open tile TOUCHING the resource that is closest to it, so
 * they stay on the resource's side of any wall; only when nothing touching it is open does the
 * plain ring search run.
 */
function spawnNextTo(grid, type, offset, fallback) {
  const r = findResource(grid, type);
  const open = openTileTest(grid);
  if (!r) return nearestOpenTile(grid, fallback, 8, open);
  const pos = { x: r.x + (offset?.x || 0), y: r.y + (offset?.y || 0) };
  if (open(pos.x, pos.y)) return pos;
  const cells = footprint(r);
  const inside = new Set(cells.map(([x, y]) => `${x},${y}`));
  let best = null;
  for (const [cx, cy] of cells) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (inside.has(`${x},${y}`) || !open(x, y)) continue;
        const d = (x - pos.x) ** 2 + (y - pos.y) ** 2;
        if (!best || d < best.d) best = { x, y, d };
      }
    }
  }
  return best ? { x: best.x, y: best.y } : nearestOpenTile(grid, pos, 8, open);
}

/** Same shape as GET /load-grid plus the NPC/PC maps, trimmed to this player's PC record. */
function buildGridPayload(grid, playerId, { ownerUsername = null } = {}) {
  // Compact: type, x, y and per-instance state only. The client merges the master row itself
  // (AppInit.enrichGridResources) from the resources.json it already holds; sending the row
  // with every instance made a town bundle ~590 KB instead of ~40 KB (2026-10-07).
  const resources = gridResourceManager.getResources(grid);
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
  applySeasonCatchUp, applyDungeonCatchUp, buildGridPayload, setPlayerLocation, sendPlayerHome, spawnNextTo, nearestOpenTile,
  FTUE_TEMPLATE, FTUE_KEY,
};
