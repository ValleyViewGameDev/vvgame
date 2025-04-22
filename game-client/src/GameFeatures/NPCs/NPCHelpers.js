import API_BASE from "../../config";
import axios from "axios";    
import { checkInventoryCapacity } from "../../Utils/InventoryManagement";
import FloatingTextManager from "../../UI/FloatingText";
import { usePanelContext } from "../../UI/PanelContext";
import Panel from "../../UI/Panel";
import QuestGiverPanel from './NPCsQuest';
import gridStateManager from "../../GridState/GridState";
import { handleAttackOnNPC } from "../Combat/Combat";


export function loadNPCDefinitions(resources) {
    const npcDefinitions = {};
    resources.forEach((resource) => {
      if (resource.category === 'npc') {
        npcDefinitions[resource.type] = resource;
      }
    });
    return npcDefinitions;
}
  
export function extractXY(location) {
  if (!location || location.x === undefined || location.y === undefined) {
    console.error("Invalid location object", location);
    return null;
  }
  return { x: location.x, y: location.y };
}

export function calculateDistance(pos1, pos2) {
    return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y);
}
  
export async function handleNPCClick(
  npc,
  row,
  col,
  setInventory,
  setResources,
  currentPlayer,
  TILE_SIZE,
  masterResources
) {
  if (!npc) {
    console.warn("handleNPCClick was called with an undefined NPC.");
    return;
  }
  console.log('handleNPCClick: npc =', npc);
  
  switch (npc.action) {

    case 'quest': 
    case 'heal':
      {
        //handled directly in RenderDynamic  
        break;
      }
 
    case 'graze': {
      console.log(`Handling grazing logic for NPC ${npc.id}.`);

      // ✅ Special case: If in town, relocate NPC to home grid
      if (currentPlayer.location.gtype === 'town') {
        console.log(`🏠 Moving NPC ${npc.id} from town to home grid ${currentPlayer.gridId} at (1,7).`);

        // ✅ Remove NPC from current grid
        const currentGrid = gridStateManager.getGridState(currentPlayer.location.g);
        if (currentGrid?.npcs?.[npc.id]) {
          delete currentGrid.npcs[npc.id];
          gridStateManager.saveGridState(currentPlayer.location.g);
          console.log(`✅ NPC ${npc.id} removed from town grid.`);
        }

        // ✅ Add NPC to home grid at (1,7)
        const homeGrid = gridStateManager.getGridState(currentPlayer.gridId);
        homeGrid.npcs[npc.id] = { 
          ...npc, 
          position: { x: 1, y: 7 },
          state: 'idle'
        };
        gridStateManager.saveGridState(currentPlayer.gridId);

        console.log(`✅ NPC ${npc.id} successfully placed in home grid.`);
        return { type: 'success', message: `NPC moved to your homestead.` };
      }
      
      
      if (npc.state !== 'processing') {
        console.log(`NPC clicked but not in processing state: ${npc.state}`);
        return { type: 'info', message: 'NPC is not ready for collection.' };
      }

      const baseQuantity = npc.qtycollected || 1;
      console.log('Base quantity to collect:', baseQuantity);

      const skillModifier = 1;
      const quantityToCollect = baseQuantity * skillModifier;

      const hasCapacity = checkInventoryCapacity(
        currentPlayer,
        currentPlayer.inventory,
        currentPlayer.backpack,
        npc.output,
        quantityToCollect
      );

      if (!hasCapacity) {
        console.warn('Not enough inventory space to collect resource.');
        FloatingTextManager.addFloatingText(20, col, row, TILE_SIZE);

        return { type: 'error', message: 'Not enough inventory space.' };
      }

      // Update the player's inventory
      const updatedInventory = [...currentPlayer.inventory];
      const resourceIndex = updatedInventory.findIndex((item) => item.type === npc.output);

      if (resourceIndex >= 0) {
        updatedInventory[resourceIndex].quantity += quantityToCollect;
      } else {
        updatedInventory.push({ type: npc.output, quantity: quantityToCollect });
      }
      setInventory(updatedInventory);
      localStorage.setItem('inventory', JSON.stringify(updatedInventory));

      // Display floating text
      FloatingTextManager.addFloatingText(`+${quantityToCollect} ${npc.output}`, col, row, TILE_SIZE);

      try {
        await axios.post(`${API_BASE}/api/update-inventory`, {
          playerId: currentPlayer.playerId,
          inventory: updatedInventory,
        });

        npc.state = 'emptystall';
        npc.hp = 0; // Reset hunger
        console.log(`NPC ${npc.id} collected and transitioned to roam.`);
        return { type: 'success', message: `Collected ${quantityToCollect} ${npc.output}.` };
      } 
        catch (error) {
        console.error('Error updating inventory or grid state on server:', error);
        return { type: 'error', message: 'Failed to update inventory or stall.' };
      }
      break;
    }

    case 'attack': 
    case 'spawn':
      handleAttackOnNPC(npc,currentPlayer,TILE_SIZE,setResources,masterResources);
      
    break;
  

    default:
      console.log(`Unhandled NPC action: ${npc.action}`);
      break;
  }
}
  