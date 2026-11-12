import { calculateDistance } from '../../Utils/worldHelpers';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import playersInGridManager from '../../GridState/PlayersInGrid';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import { getMasterResources } from '../../Utils/TuningManager';
import { isMultiTileNpc } from '../../Utils/npcFootprint';
import { npcFitsAt } from './npcGround';

/**
 * Where a MULTI-TILE enemy can be born: the nearest anchor to the spawner (within 3 tiles) where
 * its whole body fits (its ground, no impassable resource, no other NPC, not the player), or null
 * when there is no room yet. A 1 x 1 enemy is born on the spawner's own tile, as always.
 */
function roomFor(def, at, npcs, pcs) {
  const tiles = GlobalGridStateTilesAndResources.getTiles();
  const resources = GlobalGridStateTilesAndResources.getResources() || [];
  const me = pcs[0]?.position || null;
  const spots = [];
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) spots.push({ x: at.x + dx, y: at.y + dy, d: dx * dx + dy * dy });
  spots.sort((a, b) => a.d - b.d);
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

