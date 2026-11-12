import { calculateDistance } from '../../Utils/worldHelpers';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import playersInGridManager from '../../GridState/PlayersInGrid';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import { getMasterResources } from '../../Utils/TuningManager';
import { isMultiTileNpc, npcCells, npcCentre } from '../../Utils/npcFootprint';
import { npcFitsAt } from './npcGround';

/**
 * Where a MULTI-TILE enemy can be born: the anchor nearest the spawner (its body's middle, within
 * ROOM_RADIUS) where its whole body fits (its ground, no impassable resource, no other NPC, not
 * the player), or null when there is no room yet. A 1 x 1 enemy is born on the spawner's own
 * tile, as always.
 *
 * The body must also be on the SPAWNER'S SIDE of any wall (owner 2026-11-12: a Demon was born
 * through a dungeon wall): every tile it covers has to be reachable from the spawner by steps
 * N/E/S/W over open ground (sideReach; no diagonal squeeze through two wall corners). Only when
 * the layout itself leaves no such room (even with every NPC and the player gone) does it fall
 * back to the nearest fit anywhere, so a spawner never stops for good.
 */
const ROOM_RADIUS = 4;

/** The tiles reachable from (sx, sy) by N/E/S/W steps over ground this enemy may stand on, within ROOM_RADIUS + its size. */
function sideReach(def, sx, sy, tiles, resources) {
  const one = { ...def, size: 1, sizeX: 1, sizeY: 1 };
  const limit = ROOM_RADIUS + Math.max(Number(def.sizeX) || Number(def.size) || 1, Number(def.sizeY) || Number(def.size) || 1);
  const seen = new Set([`${sx},${sy}`]);
  const queue = [[sx, sy]];
  while (queue.length) {
    const [x, y] = queue.shift();
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx; const ny = y + dy; const k = `${nx},${ny}`;
      if (seen.has(k) || Math.abs(nx - sx) > limit || Math.abs(ny - sy) > limit) continue;
      if (!npcFitsAt(one, nx, ny, tiles, resources, null, null)) continue;
      seen.add(k); queue.push([nx, ny]);
    }
  }
  return seen;
}

export function roomFor(def, at, npcs, pcs) {
  const tiles = GlobalGridStateTilesAndResources.getTiles();
  const resources = GlobalGridStateTilesAndResources.getResources() || [];
  const me = pcs[0]?.position || null;
  const spots = [];
  for (let dy = -ROOM_RADIUS; dy <= ROOM_RADIUS; dy++) for (let dx = -ROOM_RADIUS; dx <= ROOM_RADIUS; dx++) {
    const c = npcCentre(def, { x: at.x + dx, y: at.y + dy });
    spots.push({ x: at.x + dx, y: at.y + dy, d: (c.x - at.x) ** 2 + (c.y - at.y) ** 2 });
  }
  spots.sort((a, b) => a.d - b.d);
  const side = sideReach(def, at.x, at.y, tiles, resources);
  const onSide = (t) => npcCells(def, t).every((c) => side.has(`${c.x},${c.y}`));
  const sideSpots = spots.filter(onSide);
  const free = sideSpots.find((t) => npcFitsAt(def, t.x, t.y, tiles, resources, npcs, me));
  if (free) return free;
  // the spawner's side has room, just not now (an NPC or the player in the way): wait a cycle
  if (sideSpots.some((t) => npcFitsAt(def, t.x, t.y, tiles, resources, null, null))) return null;
  return spots.find((t) => npcFitsAt(def, t.x, t.y, tiles, resources, npcs, me)) || null;
}

async function handleSpawnBehavior(gridId) {
    const NPCsInGrid = NPCsInGridManager.getNPCsInGrid(gridId);
    if (!NPCsInGrid) {
        console.warn(`GridState unavailable for gridId ${gridId}.`);
        return;
    }

    const npcsObject = NPCsInGridManager.getNPCsInGrid(gridId); // this *is* the npcs object
    const npcs = Object.values(npcsObject || {});
    
    const playersInGrid = playersInGridManager.getPlayersInGrid(gridId);
    const pcs = Object.values(playersInGrid || {});

    //console.log(`[Spawner] Handling spawn behavior for ${this.type} at (${this.position.x}, ${this.position.y}). State: ${this.state}`);

    // 🔴 Track position changes
    const oldPosition = { x: this.position.x, y: this.position.y };

    switch (this.state) {
        case 'idle': {
            const pcsInRange = pcs.some(pc => calculateDistance(pc.position, this.position) < this.range);
            if (pcsInRange) {
                console.log(`[Spawner] ${this.type} detected PCs nearby. Transitioning to spawn state.`);
                this.state = 'spawn';
                await NPCsInGridManager.updateNPC(gridId, this.id, {
                    state: this.state,
                    position: this.position,
                    nextspawn: this.nextspawn
                });
            }
            break;
        }

        case 'spawn': {
            const existingNPCs = npcs.filter(npc => npc.type === this.requires);
            if (existingNPCs.length >= this.qtycollected) {
                console.log(`[Spawner] Max ${this.requires} reached (${this.qtycollected}). Returning to idle.`);
                this.state = 'idle';
                await NPCsInGridManager.updateNPC(gridId, this.id, {
                    state: this.state,
                    position: this.position,
                    nextspawn: this.nextspawn
                });
                return;
            }

            if (!this.nextspawn || Date.now() >= this.nextspawn) {
                console.log(`[Spawner] Spawning new ${this.requires} at (${this.position.x}, ${this.position.y}).`);
                // 🛑 ENSURE THE SPAWNER AND NPC HAVE SEPARATE POSITION OBJECTS 🛑
                let npcPosition = { x: this.position.x, y: this.position.y }; // NEW OBJECT, NOT A REFERENCE
                // a multi-tile enemy needs room for its whole body: the nearest spot that has it, or wait a cycle
                const def = (getMasterResources() || []).find((r) => r.type === this.requires && r.category === 'npc');
                if (def && isMultiTileNpc(def)) {
                    const spot = roomFor(def, npcPosition, npcs, pcs);
                    npcPosition = spot ? { x: spot.x, y: spot.y } : null;
                }

                if (npcPosition) await NPCsInGridManager.spawnNPC(gridId, { type: this.requires }, npcPosition);

                this.nextspawn = Date.now() + this.speed * 1000;
                await NPCsInGridManager.updateNPC(gridId, this.id, {
                    state: this.state,
                    position: this.position,
                    nextspawn: this.nextspawn
                });
            } else {
                console.log(`[Spawner] Waiting for next spawn cycle.`);
            }

            const pcsStillInRange = pcs.some(pc => calculateDistance(pc.position, this.position) < this.range);
            if (!pcsStillInRange) {
                console.log(`[Spawner] No PCs nearby. Returning to idle.`);
                this.state = 'idle';
                await NPCsInGridManager.updateNPC(gridId, this.id, {
                    state: this.state,
                    position: this.position,
                    nextspawn: this.nextspawn
                });
            }
            break;
        }

        default:
            console.warn(`Unhandled state for NPC ${this.id}: ${this.state}`);
            break;
    }

    // 🔴 Detect movement
    if (this.position.x !== oldPosition.x || this.position.y !== oldPosition.y) {
        console.error(`[Spawner] ERROR: Spawner ${this.id} moved from (${oldPosition.x}, ${oldPosition.y}) to (${this.position.x}, ${this.position.y})!`);
    }
}

// Attach behavior to the NPC class
export function attachSpawnBehavior(NPC) {
    NPC.prototype.handleSpawnBehavior = handleSpawnBehavior;
}

