import axios from 'axios';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import NPCsInGridManager from '../../GridState/GridStateNPCs';

const updateThisNPC = async (npcInstance, gridId) => {
  await NPCsInGridManager.updateNPC(gridId, npcInstance.id, {
    state: npcInstance.state,
    position: npcInstance.position,
  });
};

async function handleFarmerBehavior(gridId) {
    const tiles = GlobalGridStateTilesAndResources.getTiles();
    const resources = GlobalGridStateTilesAndResources.getResources();
    const npcs = Object.values(NPCsInGridManager.getNPCsInGrid(gridId) || {});

    gridId = gridId || this.gridId; // Fallback to npc.gridId if not provided

    if (!tiles || !resources) {
        console.error(`Tiles or resources are missing for NPC ${this.id}.`);
        return;
    }

    switch (this.state) {
        case 'idle': {
          break;
        }

        default: {
            console.warn(`NPC ${this.id} is in an unhandled state: ${this.state}`);
            break;
        }
    }
}

// Attach the quest-giver behavior to the NPC class
export function attachFarmerBehavior(NPC) {
    NPC.prototype.handleFarmerBehavior = handleFarmerBehavior;
}