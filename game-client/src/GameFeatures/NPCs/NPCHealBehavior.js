import axios from 'axios';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import playersInGridManager from '../../GridState/PlayersInGrid';
import { calculateDistance } from '../../Utils/worldHelpers';

async function handleHealBehavior(gridId) {
    const tiles = GlobalGridStateTilesAndResources.getTiles();
    const resources = GlobalGridStateTilesAndResources.getResources();
    const npcs = Object.values(NPCsInGridManager.getNPCsInGrid(gridId) || {}); 

    gridId = gridId || this.gridId; // Fallback to npc.gridId if not provided

    //console.log(`handleHealerBehavior: gridId: ${gridId}; NPC ${this.id} is in state: ${this.state}`);

    if (!tiles || !resources) {
        console.error(`Tiles or resources are missing for NPC ${this.id}.`);
        return;
    }

    // Force state to roam if it's not already (one-time update)
    if (this.state !== 'roam') {
        this.state = 'roam';
        await NPCsInGridManager.updateNPC(gridId, this.id, {
            state: this.state,
            position: this.position,
        });
    }

    // Check if this NPC is within any PC's range
    const pcsInRange = Object.values(playersInGridManager.getPlayersInGrid(gridId) || {}).some(pc => 
        calculateDistance(pc.position, this.position) <= (pc.range || 3) && pc.hp > 0
    );
    
    if (pcsInRange) {
        // If players are in range, don't move (but stay in roam state)
        // This creates the effect of the NPC stopping when players approach
        return;
    }

    // Always handle roam state - no more switching
    await this.handleRoamState(tiles, resources, npcs, () => {
        // Don't change state - stay in roam
        // This callback is called after roam completes, but we just continue roaming
    });
}

// Attach the quest-giver behavior to the NPC class
export function attachHealBehavior(NPC) {
    NPC.prototype.handleHealBehavior = handleHealBehavior;
}