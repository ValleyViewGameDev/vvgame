/**
 * Story state that changes a player's own world (docs/story.md §0, the tale).
 *
 * The Queen of stone. Gertrude, Leontes' queen, stands as a statue in her castle in the Town
 * (resource "Gertrude's Statue" in the town layouts) until the player wakes her at the end of
 * the early game: Helena's quest "Rosemary, for Remembrance", then Feste's "If Music Be the Food
 * of Love", then Feste walks to the statue and sings (game-client GameFeatures/Story/). The
 * waking sets player.storyFlags.gertrudeAwake (POST /api/story/wake-gertrude).
 *
 * Towns are one copy per player, so the statue or the Queen is a fact about THAT copy, and
 * copies get rebuilt from the layout (a reset) or were made before the statue existed.
 * applyGertrudeState() puts a town copy right on every enter-grid, both ways:
 *   awake      the statue goes, Gertrude stands on its tile (unless she is already there)
 *   not awake  any Gertrude NPC (a copy from before 2026-10-24) turns back into the statue on
 *              her home tile
 */
const { ObjectId } = require('mongodb');
const gridResourceManager = require('./GridResourceManager');
const masterResources = require('../tuning/resources.json');

const STATUE = "Gertrude's Statue";
const QUEEN = 'Gertrude';
const FESTE_QUEST = 'If Music Be the Food of Love';

const isGertrudeAwake = (player) => !!player?.storyFlags?.gertrudeAwake;
const hasCompleted = (player, title) => (player?.completedQuests || []).some((q) => q?.questId === title);

/** A fresh Gertrude NPC record at (x, y), shaped like createGridLogic's layout NPCs. */
function queenRecord(x, y, id = new ObjectId().toString()) {
  const def = masterResources.find((r) => r.type === QUEEN && r.category === 'npc') || {};
  return {
    id, type: QUEEN, position: { x, y }, state: def.defaultState || 'idle',
    hp: def.maxhp || 10, maxhp: def.maxhp || 10, homeX: x, homeY: y, lastUpdated: new Date(),
  };
}

const npcMap = (grid) => (grid.NPCsInGrid instanceof Map ? grid.NPCsInGrid : new Map(Object.entries(grid.NPCsInGrid || {})));

/** Swap the statue for the Queen on this grid (no save). Returns the Queen's record, or null when there is no statue. */
function wakeOnGrid(grid, npcId) {
  const statue = gridResourceManager.getResources(grid).find((r) => r.type === STATUE);
  if (!statue) return null;
  gridResourceManager.updateResource(grid, { x: statue.x, y: statue.y, type: null });
  const npcs = npcMap(grid);
  let queen = [...npcs.values()].find((n) => n?.type === QUEEN);
  if (!queen) {
    const id = typeof npcId === 'string' && /^[0-9a-f]{24}$/.test(npcId) && !npcs.has(npcId) ? npcId : undefined;
    queen = queenRecord(statue.x, statue.y, id);
    npcs.set(queen.id, queen);
  }
  grid.NPCsInGrid = npcs;
  grid.markModified?.('NPCsInGrid');
  grid.NPCsInGridLastUpdated = new Date();
  return queen;
}

/** Put the player's own town copy in line with their story; saves when it changed. */
async function applyGertrudeState(grid, player) {
  if (!grid || grid.gridType !== 'town' || !grid.ownerId || String(grid.ownerId) !== String(player._id)) return false;
  if (isGertrudeAwake(player)) {
    if (!wakeOnGrid(grid)) return false;
  } else {
    const npcs = npcMap(grid);
    const queens = [...npcs.entries()].filter(([, n]) => n?.type === QUEEN);
    if (!queens.length) return false;
    const hasStatue = gridResourceManager.getResources(grid).some((r) => r.type === STATUE);
    const q = queens[0][1];
    const x = Number.isInteger(q.homeX) ? q.homeX : Math.floor(q.position?.x ?? 0);
    const y = Number.isInteger(q.homeY) ? q.homeY : Math.floor(q.position?.y ?? 0);
    queens.forEach(([id]) => npcs.delete(id));
    if (!hasStatue) gridResourceManager.updateResource(grid, { x, y, type: STATUE });
    grid.NPCsInGrid = npcs;
    grid.markModified?.('NPCsInGrid');
    grid.NPCsInGridLastUpdated = new Date();
  }
  await grid.save();
  return true;
}

// ---------------------------------------------------------------- Viola and Sebastian
// The twins (Twelfth Night). Sebastian stands on the sandy island in Sunflower Lake (valley
// 1011670, where the Brass Bell used to lie); Viola lives in her own lake (1012435) until the
// player greets Sebastian: then she rises out of the water beside the island and the reunion plays
// (game-client GameFeatures/Story/violaReunion.js, POST /api/story/reunite-viola). From then on
// she lives in the water beside him: player.storyFlags.violaReunited = { x, y } (her tile there).
const ISLAND_COORD = 1011670;
const VIOLA_HOME_COORD = 1012435;
const SEBASTIAN = 'Sebastian';
const VIOLA = 'Viola';
const SEBASTIAN_TILE = { x: 23, y: 20 };

function npcRecord(type, x, y, id = new ObjectId().toString()) {
  const def = masterResources.find((r) => r.type === type && r.category === 'npc') || {};
  return { id, type, position: { x, y }, state: def.defaultState || 'idle', hp: def.maxhp || 10, maxhp: def.maxhp || 10, homeX: x, homeY: y, lastUpdated: new Date() };
}
const typeIn = (npcs, type) => [...npcs.entries()].filter(([, n]) => n?.type === type);

/** The island copy: Sebastian on his tile (the old Brass Bell goes), and Viola beside him once reunited. */
function applyIslandState(grid, player) {
  const npcs = npcMap(grid);
  let changed = false;
  if (!typeIn(npcs, SEBASTIAN).length) {
    const bell = gridResourceManager.getResources(grid).find((r) => r.type === 'Brass Bell' && r.x === SEBASTIAN_TILE.x && r.y === SEBASTIAN_TILE.y);
    if (bell) gridResourceManager.updateResource(grid, { x: bell.x, y: bell.y, type: null });
    const s = npcRecord(SEBASTIAN, SEBASTIAN_TILE.x, SEBASTIAN_TILE.y);
    npcs.set(s.id, s); changed = true;
  }
  const at = player?.storyFlags?.violaReunited;
  if (at && !typeIn(npcs, VIOLA).length && Number.isInteger(at.x) && Number.isInteger(at.y)) {
    const v = npcRecord(VIOLA, at.x, at.y, typeof at.id === 'string' ? at.id : undefined);
    npcs.set(v.id, v); changed = true;
  }
  if (changed) { grid.NPCsInGrid = npcs; grid.markModified?.('NPCsInGrid'); grid.NPCsInGridLastUpdated = new Date(); }
  return changed;
}

/** Viola's old lake: once she has gone to her brother, she is not there any more. */
function applyViolaHomeState(grid, player) {
  if (!player?.storyFlags?.violaReunited) return false;
  const npcs = npcMap(grid);
  const violas = typeIn(npcs, VIOLA);
  if (!violas.length) return false;
  violas.forEach(([id]) => npcs.delete(id));
  grid.NPCsInGrid = npcs; grid.markModified?.('NPCsInGrid'); grid.NPCsInGridLastUpdated = new Date();
  return true;
}

/** Every story fix for the player's own copy of this grid; saves when anything changed. */
async function applyStoryState(grid, player) {
  if (!grid || !grid.ownerId || String(grid.ownerId) !== String(player._id)) return false;
  if (grid.gridType === 'town') return applyGertrudeState(grid, player);
  const coord = Number(grid.gridCoord);
  const changed = coord === ISLAND_COORD ? applyIslandState(grid, player)
    : coord === VIOLA_HOME_COORD ? applyViolaHomeState(grid, player) : false;
  if (changed) await grid.save();
  return changed;
}

module.exports = {
  STATUE, QUEEN, FESTE_QUEST, isGertrudeAwake, hasCompleted, wakeOnGrid, applyGertrudeState,
  ISLAND_COORD, VIOLA_HOME_COORD, SEBASTIAN, VIOLA, npcRecord, npcMap, applyViolaHomeState, applyStoryState,
};
