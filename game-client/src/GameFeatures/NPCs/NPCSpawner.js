import { calculateDistance } from './NPCHelpers';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import playersInGridManager from '../../GridState/PlayersInGrid';

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
                await NPCsInGridManager.saveGridStateNPCs(gridId);
            }
            break;
        }

        case 'spawn': {
            const existingNPCs = npcs.filter(npc => npc.type === this.requires);
            if (existingNPCs.length >= this.qtycollected) {
                console.log(`[Spawner] Max ${this.requires} reached (${this.qtycollected}). Returning to idle.`);
                this.state = 'idle';
                await NPCsInGridManager.saveGridStateNPCs(gridId);
                return;
            }

            if (!this.nextspawn || Date.now() >= this.nextspawn) {
                console.log(`[Spawner] Spawning new ${this.requires} at (${this.position.x}, ${this.position.y}).`);
                // 🛑 ENSURE THE SPAWNER AND NPC HAVE SEPARATE POSITION OBJECTS 🛑
                const npcPosition = { x: this.position.x, y: this.position.y }; // NEW OBJECT, NOT A REFERENCE

                await NPCsInGridManager.spawnNPC(gridId, { type: this.requires }, npcPosition);

                this.nextspawn = Date.now() + this.speed * 1000;
                await NPCsInGridManager.saveGridStateNPCs(gridId);
            } else {
                console.log(`[Spawner] Waiting for next spawn cycle.`);
            }

            const pcsStillInRange = pcs.some(pc => calculateDistance(pc.position, this.position) < this.range);
            if (!pcsStillInRange) {
                console.log(`[Spawner] No PCs nearby. Returning to idle.`);
                this.state = 'idle';
                await NPCsInGridManager.saveGridStateNPCs(gridId);
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

