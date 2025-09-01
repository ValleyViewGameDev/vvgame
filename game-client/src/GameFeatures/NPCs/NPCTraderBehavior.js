import axios from 'axios';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import { calculateDistance } from './NPCUtils';

async function handleTraderBehavior(gridId) { 
    const updateThisNPC = async () => {
        await NPCsInGridManager.updateNPC(gridId, this.id, {
            state: this.state,
            position: this.position,
        });
    };

    const tiles = GlobalGridStateTilesAndResources.getTiles();
    const resources = GlobalGridStateTilesAndResources.getResources();
    const npcs = Object.values(NPCsInGridManager.getNPCsInGrid(gridId) || {}); 

    gridId = gridId || this.gridId; // Fallback to npc.gridId if not provided

    //console.log(`handleTraderBehavior: gridId: ${gridId}; NPC ${this.id} is in state: ${this.state}`);

    if (!tiles || !resources) {
        console.error(`Tiles or resources are missing for NPC ${this.id}.`);
        return;
    }

    switch (this.state) {
        case 'idle': {
            // Traders stay in place, they don't roam
            // Just stay idle and wait for players to interact
            break;
        }

        default:
            console.warn(`NPC ${this.id} is in an unhandled state: ${this.state}`);
            break;
    }
}

// Attach the trader behavior to the NPC class
export function attachTraderBehavior(NPC) {
    NPC.prototype.handleTraderBehavior = handleTraderBehavior;
}