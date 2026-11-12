/**
 * What ground an NPC may stand on (moved out of AllNPCsShared.js so the Spawner can ask it for
 * the enemy it is about to make, 2026-11-11).
 */
import { getMasterResources, getGlobalTuning } from '../../Utils/TuningManager';
import { npcCells, npcOnTile } from '../../Utils/npcFootprint';

// Ground a player can walk on: the tile rows marked passable in resources.json (water is not).
// Built once, after the master resources load.
let footTiles = null;
function playerCanWalkOn(tileType) {
  if (!footTiles) {
    const rows = getMasterResources();
    if (!rows?.length) return false;
    footTiles = new Set(rows.filter((r) => r.category === 'tile' && r.passable).map((r) => r.type));
  }
  return footTiles.has(tileType);
}

/**
 * May this NPC stand on a tile of this type? Its own validon<tile> flag says yes; and an Enemy
 * (action 'attack') also goes wherever a player on foot can, so no tile is a safe spot to fight
 * from (BL-4: roads were). Ground that hurts (globalTuning.tileHazards: lava) stays its own call:
 * only an enemy flagged for it goes there (Demon, Dragon, Phoenix, Ghost). The validon flags
 * still decide where an enemy is PLACED (grid creation, the editor); this is only where it walks.
 * `npc` may be a live NPC or its resources.json row.
 */
export function npcCanStandOn(npc, tileType) {
  if (npc[`validon${tileType}`] === true) return true;
  if (npc.action !== 'attack') return false;
  const hazards = getGlobalTuning()?.tileHazards || { l: true };
  if (hazards[tileType]) return false;
  return playerCanWalkOn(tileType);
}

/**
 * Does the whole body fit with its anchor at (x, y)? Every tile it would cover must be on the
 * grid, ground it may stand on, free of an impassable resource, of the player and of every other
 * NPC's body. `npc` may be a resources.json row (the Spawner, before the enemy exists).
 */
export function npcFitsAt(npc, x, y, tiles, resources, npcs, playerTile = null) {
  if (!tiles?.length) return false;
  for (const c of npcCells(npc, { x, y })) {
    if (c.x < 0 || c.y < 0 || c.y >= tiles.length || c.x >= tiles[0].length) return false;
    if (!npcCanStandOn(npc, tiles[c.y][c.x])) return false;
    const res = (resources || []).find((r) => r && r.x === c.x && r.y === c.y);
    if (res && !res.passable && !(npc.passDoors && res.action === 'door')) return false;
    if (playerTile && Math.round(playerTile.x) === c.x && Math.round(playerTile.y) === c.y) return false;
    if (npcs && npcOnTile(npcs, c.x, c.y, npc.id ?? null)) return false;
  }
  return true;
}
