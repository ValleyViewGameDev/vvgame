import axios from 'axios';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import gridStateManager from '../../GridState/GridStateNPCs';
import { calculateDistance } from './NPCHelpers';
 
async function handleQuestGiverBehavior(gridId) {
    const tiles = GlobalGridStateTilesAndResources.getTiles();
    const resources = GlobalGridStateTilesAndResources.getResources();
    const npcs = Object.values(gridStateManager.getGridState(gridId)?.npcs || {}); 

    gridId = gridId || this.gridId; // Fallback to npc.gridId if not provided

    //console.log(`handleQuestGiverBehavior: gridId: ${gridId}; NPC ${this.id} is in state: ${this.state}`);

    if (!tiles || !resources) {
        console.error(`Tiles or resources are missing for NPC ${this.id}.`);
        return;
    }

    switch (this.state) {
        case 'idle': {
            const pcsInRange = Object.values(gridStateManager.getGridState(gridId)?.pcs || {}).some(pc => 
                calculateDistance(pc.position, this.position) <= this.range && pc.hp>0
            );
            if (pcsInRange) { break; }
            
            await this.handleIdleState(tiles, resources, npcs, 5, () => {
                //console.log(`NPC ${this.id} transitioning to roam state.`);
                this.state = 'roam'; // Transition to the roam state
                gridStateManager.saveGridStateNPCs(gridId); // Save after transition
            });

            break;
          }

          case 'roam': {
            const pcsInRange = Object.values(gridStateManager.getGridState(gridId)?.pcs || {}).some(pc => 
                calculateDistance(pc.position, this.position) <= this.range
            );
            if (pcsInRange) { this.state = 'idle'; break; }
            
            await this.handleRoamState(tiles, resources, npcs, () => {
                //console.log(`NPC ${this.id} transitioning back to idle.`);
                this.state = 'idle'; // Transition to the idle state
            });
            break;
          }

        default:
            console.warn(`NPC ${this.id} is in an unhandled state: ${this.state}`);
            break;
    }
}

// Attach the quest-giver behavior to the NPC class
export function attachQuestBehavior(NPC) {
    NPC.prototype.handleQuestGiverBehavior = handleQuestGiverBehavior;
}