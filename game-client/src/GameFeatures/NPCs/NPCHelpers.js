import API_BASE from "../../config";
import axios from "axios";    
import { checkInventoryCapacity } from "../../Utils/InventoryManagement";
import FloatingTextManager from "../../UI/FloatingText";
import NPCsInGridManager from "../../GridState/GridStateNPCs";
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
  console.log(`[🐮↖️ handleNPCClick] NPC ${npc.id} clicked with state=${npc.state}`);

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

/// THIS CODE NEEDS MODERNIZING:

      if (currentPlayer.location.gtype === 'town') {
        console.log(`🏠 Moving NPC ${npc.id} from town to home grid ${currentPlayer.gridId} at (1,7).`);

        // ✅ Remove NPC from current grid
        await NPCsInGridManager.removeNPC(currentPlayer.location.g, npc.id);

        const relocatedNPC = {
          ...npc,
          position: { x: 1, y: 7 },
          state: 'idle',
          lastUpdated: Date.now(),
        };

        // You may want to rehydrate this as a true `NPC` instance,
        // but since `addNPC` accepts plain objects with valid structure, this works:
        await NPCsInGridManager.addNPC(currentPlayer.gridId, relocatedNPC);
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
      const updatedInventory = [...currentPlayer.inventory].filter(item => 
        item && typeof item === 'object' && item.type && item.quantity
      );
      const resourceIndex = updatedInventory.findIndex((item) => item.type === npc.output);

      if (resourceIndex >= 0) {
        updatedInventory[resourceIndex].quantity += quantityToCollect;
      } else {
        updatedInventory.push({ 
          type: npc.output, 
          quantity: quantityToCollect 
        });
      }

      // Validate inventory before sending to server
      const validInventory = updatedInventory.every(item => 
        item && 
        typeof item === 'object' && 
        typeof item.type === 'string' && 
        typeof item.quantity === 'number'
      );

      if (!validInventory) {
        console.error('Invalid inventory state:', updatedInventory);
        return { type: 'error', message: 'Invalid inventory state' };
      }

      try {
        const response = await axios.post(`${API_BASE}/api/update-inventory`, {
          playerId: currentPlayer.playerId,
          inventory: updatedInventory,
        });

        if (response.data.success) {
          FloatingTextManager.addFloatingText(`+${quantityToCollect} ${npc.output}`, col, row, TILE_SIZE);
          setInventory(updatedInventory);
          localStorage.setItem('inventory', JSON.stringify(updatedInventory));          
          console.log('currentPlayer before update:', currentPlayer);
          const existingNPC = NPCsInGridManager.getNPCsInGrid(currentPlayer.location.g)?.[npc.id];
          console.log('Existing NPC:', existingNPC);
          console.log('NPC ID:', npc.id);
          if (existingNPC) {
            await NPCsInGridManager.updateNPC(currentPlayer.location.g, npc.id, {
              ...existingNPC,
              state: 'emptystall',
              hp: 0,
            });
          }
          return { type: 'success', message: `Collected ${quantityToCollect} ${npc.output}.` };
        } else {
          throw new Error(response.data.message || 'Failed to update inventory');
        }
      } catch (error) {
        console.error('Error updating inventory or grid state on server:', error);
        return { type: 'error', message: 'Failed to update inventory or stall.' };
      }
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
