import API_BASE from "../../config.js";
import axios from "axios";    
import FloatingTextManager from "../../UI/FloatingText.js";
import NPCsInGridManager from "../../GridState/GridStateNPCs.js";
import { handleAttackOnNPC } from "../Combat/Combat.js";
import { gainIngredients } from "../../Utils/InventoryManagement.js";
import { trackQuestProgress } from '../Quests/QuestGoalTracker.js';
import AnimalPanel from '../FarmAnimals/FarmAnimals.js';
import { calculateDistance } from '../../Utils/worldHelpers.js';
import { getLocalizedString } from '../../Utils/stringLookup.js';
import { formatSingleCollection } from '../../UI/StatusBar/CollectionFormatters.js';
import { calculateSkillMultiplier } from '../../Utils/InventoryManagement.js';

// Generate unique transaction ID
function generateTransactionId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Protected farm animal collection function
async function handleProtectedFarmAnimalCollection(
  npc,
  row,
  col,
  setInventory,
  setBackpack,
  setResources,
  currentPlayer,
  setCurrentPlayer,
  TILE_SIZE,
  masterResources,
  masterSkills,
  currentGridId,
  updateStatus,
  strings = {}
) {
  console.log(`🔒 [PROTECTED FARM ANIMAL] Starting protected collection for NPC ${npc.id}`);
  
  // Generate transaction ID and key
  const transactionId = generateTransactionId();
  const transactionKey = `farm-animal-collect-${npc.id}-${currentGridId}`;
  
  try {
    console.log(`🐮 Attempting to collect animal - ID: ${npc.id}, State: ${npc.state}, GrazeEnd: ${npc.grazeEnd}, Current Time: ${Date.now()}`);
    
    // Double-check the NPC state from the grid manager before making the request
    const currentNPCState = NPCsInGridManager.getNPCsInGrid(currentGridId)?.[npc.id];
    if (currentNPCState && currentNPCState.state !== 'processing') {
      console.warn(`⚠️ NPC ${npc.id} state changed to ${currentNPCState.state} before collection attempt`);
      updateStatus(`❌ Animal not ready - state: ${currentNPCState.state}`);
      return { type: 'error', message: `Animal not in processing state (${currentNPCState.state})` };
    }
    
    const response = await axios.post(`${API_BASE}/api/farm-animal/collect`, {
      playerId: currentPlayer.playerId,
      gridId: currentGridId,
      npcId: npc.id,
      npcPosition: { x: col, y: row },
      transactionId,
      transactionKey
    });

    if (response.data.success) {
      const { collectedQuantity, collectedItem, skillsApplied, updatedNPC } = response.data;
      
      // Don't use server inventory - use gainIngredients to properly handle capacity
      // This ensures Gold Pass warehouse bonus is respected
      
      // Add to inventory using gainIngredients (respects Gold Pass capacity)
      const gained = await gainIngredients({
        playerId: currentPlayer.playerId,
        currentPlayer,
        resource: collectedItem,
        quantity: collectedQuantity,
        inventory: currentPlayer.inventory,
        backpack: currentPlayer.backpack,
        setInventory,
        setBackpack,
        setCurrentPlayer,
        updateStatus,
        masterResources,
      });
      
      if (!gained) {
        console.error('❌ Failed to add animal product to inventory - warehouse may be full');
        // Note: gainIngredients will have already shown the appropriate status message
        return { type: 'error', message: 'Warehouse full' };
      }

      // Update NPC state
      if (updatedNPC) {
        await NPCsInGridManager.updateNPC(currentGridId, npc.id, updatedNPC);
        
        // Check if there are other animals at the same position that might need state updates
        const npcsInGrid = NPCsInGridManager.getNPCsInGrid(currentGridId);
        const animalsAtSamePosition = Object.values(npcsInGrid || {}).filter(otherNpc => 
          otherNpc.id !== npc.id &&
          Math.floor(otherNpc.position?.x) === col &&
          Math.floor(otherNpc.position?.y) === row &&
          otherNpc.action === 'graze'
        );
        
        if (animalsAtSamePosition.length > 0) {
          console.log(`🐮 Found ${animalsAtSamePosition.length} other animals at same stall position after collection`);
          console.log(`🐮 Other animals at position:`, animalsAtSamePosition.map(a => ({
            id: a.id,
            state: a.state,
            grazeEnd: a.grazeEnd,
            targetStall: a.targetStall
          })));
          
          // For animals in processing state at the same stall, they can remain in processing
          // The server should handle their collection independently
          // Only log the situation for debugging
          for (const otherAnimal of animalsAtSamePosition) {
            if (otherAnimal.state === 'processing') {
              console.log(`🐮 Animal ${otherAnimal.id} remains in processing state at same stall - ready for collection`);
            } else if (otherAnimal.state === 'stall') {
              console.log(`🐮 Animal ${otherAnimal.id} is still moving to stall`);
            } else {
              console.log(`🐮⚠️ Animal ${otherAnimal.id} in unexpected state '${otherAnimal.state}' at stall position`);
            }
          }
        }
      }

      // Visual feedback
      FloatingTextManager.addFloatingText(`+${collectedQuantity} ${getLocalizedString(collectedItem, strings)}`, col, row, TILE_SIZE);
      
      // Calculate skill info for formatting
      const skillInfo = calculateSkillMultiplier(collectedItem, currentPlayer.skills || [], masterSkills);
      
      // Format status message using shared formatter
      const statusMessage = formatSingleCollection('animal', collectedItem, collectedQuantity, 
        skillInfo.hasSkills ? skillInfo : null, strings, getLocalizedString);
      
      // Update status with the formatted message
      updateStatus(statusMessage);

      // ✅ Track quest progress for NPC graze collection
      await trackQuestProgress(currentPlayer, 'Collect', collectedItem, collectedQuantity, setCurrentPlayer);

      console.log(`Farm animal collection completed: ${collectedQuantity} ${collectedItem}`);
      return { 
        type: 'success', 
        message: `Collected ${collectedQuantity} ${collectedItem}.`,
        collectedItem,
        collectedQuantity,
        skillsApplied
      };
    }
  } catch (error) {
    console.error('Error in protected farm animal collection:', error);
    
    if (error.response?.status === 429) {
      updateStatus(471);
      return { type: 'error', message: 'Collection already in progress' };
    } else if (error.response?.status === 400) {
      const errorMessage = error.response?.data?.error || 'Animal not ready for collection';
      const errorDetails = error.response?.data;
      console.error(`❌ 400 Error details:`, errorDetails);
      
      // Handle warehouse full error
      if (errorMessage === 'Warehouse full') {
        console.error(`❌ Cannot collect: Warehouse is full (${errorDetails.currentUsage}/${errorDetails.capacity})`);
        updateStatus(20); // Warehouse full status message
        return { type: 'error', message: 'Warehouse is full' };
      }
      
      console.error(`❌ Animal state mismatch - Client state: ${npc.state}, Server error: ${errorMessage}`);
      console.error(`❌ Animal details - ID: ${npc.id}, GrazeEnd: ${npc.grazeEnd}, Current Time: ${Date.now()}`);
      
      // If server says NPC is in different state, sync with server state
      if (errorMessage.includes('state:')) {
        const serverStateMatch = errorMessage.match(/\(state:\s*(\w+)\)/);
        if (serverStateMatch) {
          const serverState = serverStateMatch[1];
          console.error(`❌ Server reports NPC ${npc.id} in state '${serverState}' but client has '${npc.state}'`);
          
          // Force refresh the NPC from server
          console.log(`🔄 Attempting to resync NPC ${npc.id} state with server...`);
          
          // Update local state to match server
          await NPCsInGridManager.updateNPC(currentGridId, npc.id, {
            state: serverState
          });
          
          // Check if there's another animal at this position that might be in processing state
          const npcsInGrid = NPCsInGridManager.getNPCsInGrid(currentGridId);
          const otherProcessingAnimal = Object.values(npcsInGrid || {}).find(otherNpc => 
            otherNpc.id !== npc.id &&
            Math.floor(otherNpc.position?.x) === col &&
            Math.floor(otherNpc.position?.y) === row &&
            otherNpc.action === 'graze' &&
            otherNpc.state === 'processing'
          );
          
          if (otherProcessingAnimal) {
            console.log(`🐮 Found another processing animal at same position after sync. Trying to collect from NPC ${otherProcessingAnimal.id}`);
            updateStatus(`Trying another animal at this stall...`);
            
            // Try to collect from the other animal
            return await handleProtectedFarmAnimalCollection(
              otherProcessingAnimal,
              row,
              col,
              setInventory,
              setBackpack,
              setResources,
              currentPlayer,
              setCurrentPlayer,
              TILE_SIZE,
              masterResources,
              masterSkills,
              currentGridId,
              updateStatus,
              strings
            );
          }
          
          updateStatus(`❌ Animal not ready - server state: ${serverState}`);
        }
      } else {
        updateStatus(`❌ ${errorMessage}`);
      }
      return { type: 'error', message: errorMessage };
    } else {
      updateStatus('❌ Failed to collect from animal');
      return { type: 'error', message: 'Failed to collect from animal' };
    }
  }
}

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

// Re-export calculateDistance from worldHelpers to maintain backward compatibility
export { calculateDistance } from '../../Utils/worldHelpers.js';
  
export async function handleNPCClick(
  npc,
  row,
  col,
  setInventory,
  setBackpack,
  setResources,
  currentPlayer,
  setCurrentPlayer,
  TILE_SIZE,
  masterResources,
  masterSkills,
  currentGridId,
  setModalContent,
  setIsModalOpen,
  updateStatus,
  openPanel,
  setActiveStation,
  strings = {}
) {
  if (!npc) {
    console.warn("handleNPCClick was called with an undefined NPC.");
    return;
  }
  console.log(`[🐮↖️ handleNPCClick] NPC ${npc.id} clicked with state=${npc.state}`);

  switch (npc.action) {

    case 'quest': 
    case 'heal':
    case 'worker':
      {
        //handled directly in RenderDynamic  
        break;
      }
 
    case 'graze': {

      console.log(`Handling grazing logic for NPC ${npc.id}.`);

      if (npc.state !== 'processing') {
        console.log(`🐮 NPC ${npc.id} clicked but not in processing state: ${npc.state}`);
        
        // Get fresh state data to check for other animals
        const npcsInGrid = NPCsInGridManager.getNPCsInGrid(currentGridId);
        
        // Log all animals at this position for debugging
        const allAnimalsAtPosition = Object.values(npcsInGrid || {}).filter(otherNpc =>
          Math.floor(otherNpc.position?.x) === col &&
          Math.floor(otherNpc.position?.y) === row &&
          otherNpc.action === 'graze'
        );
        
        if (allAnimalsAtPosition.length > 1) {
          console.log(`🐮 Found ${allAnimalsAtPosition.length} animals at position (${col}, ${row}):`, 
            allAnimalsAtPosition.map(a => ({
              id: a.id,
              state: a.state,
              grazeEnd: a.grazeEnd
            }))
          );
        }
        
        // Find an animal in processing state at this position
        const processingAnimalAtSamePosition = allAnimalsAtPosition.find(otherNpc => 
          otherNpc.id !== npc.id &&
          otherNpc.state === 'processing'
        );
        
        if (processingAnimalAtSamePosition) {
          console.log(`🐮 Found another animal in processing state at same position. Switching to collect from NPC ${processingAnimalAtSamePosition.id} (state: ${processingAnimalAtSamePosition.state}) instead of ${npc.id} (state: ${npc.state})`);
          // Recursively call handleNPCClick with the processing animal
          return await handleNPCClick(
            processingAnimalAtSamePosition,
            row,
            col,
            setInventory,
            setResources,
            currentPlayer,
            setCurrentPlayer,
            TILE_SIZE,
            masterResources,
            masterSkills,
            currentGridId,
            setModalContent,
            setIsModalOpen,
            updateStatus,
            openPanel,
            setActiveStation,
            strings
          );
        }

        // Set the active station before opening the panel
        setActiveStation({
          type: npc.type,
          position: { x: col, y: row },
          gridId: currentGridId,
          npcId: npc.id, // Include the NPC ID for reliable identification
        });
        openPanel('AnimalPanel');

        return { type: 'info', message: 'NPC is not ready for collection.' };
      }

      // ✅ Otherwise, handle Animals in stalls in "procesing" state

      // ✅ Use protected transaction system instead of UI lock hack
      return await handleProtectedFarmAnimalCollection(
        npc,
        row,
        col,
        setInventory,
        setBackpack,
        setResources,
        currentPlayer,
        setCurrentPlayer,
        TILE_SIZE,
        masterResources,
        masterSkills,
        currentGridId,
        updateStatus,
        strings
      );
    }

    case 'attack': 
    case 'spawn':
      handleAttackOnNPC(npc,currentPlayer,setCurrentPlayer,TILE_SIZE,setResources,masterResources);
      
    break;
  

    default:
      console.log(`Unhandled NPC action: ${npc.action}`);
      break;
  }
}
