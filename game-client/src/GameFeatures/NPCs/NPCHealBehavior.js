import axios from 'axios';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import { calculateDistance } from '../../Utils/worldHelpers';

async function handleHealBehavior(gridId) {
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

    //console.log(`handleHealerBehavior: gridId: ${gridId}; NPC ${this.id} is in state: ${this.state}`);

    if (!tiles || !resources) {
        console.error(`Tiles or resources are missing for NPC ${this.id}.`);
        return;
    }

    switch (this.state) {
        case 'idle': {
            
            await this.handleIdleState(tiles, resources, npcs, 5, async () => {
                //console.log(`NPC ${this.id} transitioning to roam state.`);
                this.state = 'roam'; // Transition to the roam state
                await updateThisNPC();
            });

            break;
          }

          case 'roam': {

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
export function attachHealBehavior(NPC) {
    NPC.prototype.handleHealBehavior = handleHealBehavior;
}