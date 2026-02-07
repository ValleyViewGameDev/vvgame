import API_BASE from "../../config.js";
import axios from "axios";
import FloatingTextManager from "../../UI/FloatingText.js";
import NPCsInGridManager from "../../GridState/GridStateNPCs.js";
import { handleAttackOnNPC } from "../Combat/Combat.js";
import { gainIngredients, hasRoomFor, calculateSkillMultiplier, applySkillMultiplier } from "../../Utils/InventoryManagement.js";
import { trackQuestProgress } from '../Quests/QuestGoalTracker.js';
import AnimalPanel from '../FarmAnimals/FarmAnimals.js';
import { calculateDistance } from '../../Utils/worldHelpers.js';
import { getLocalizedString } from '../../Utils/stringLookup.js';
import { formatSingleCollection } from '../../UI/StatusBar/CollectionFormatters.js';
import { createCollectEffect } from '../../VFX/VFX.js';
import soundManager from '../../Sound/SoundManager';

// Generate unique transaction ID
function generateTransactionId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Protected farm animal collection function - uses optimistic UI for responsiveness
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
  strings = {},
  globalTuning = null,
  inventory = null,
  backpack = null
) {
  console.log(`🔒 [PROTECTED FARM ANIMAL] Starting optimistic collection for NPC ${npc.id}`);

  // Prevent double-clicks on the same animal
  const collectId = `farm-animal-collect-${npc.id}-${currentGridId}`;
  if (window._processingAnimalCollects && window._processingAnimalCollects.has(collectId)) {
    console.log("Already processing this animal collection, ignoring duplicate click");
    return { type: 'error', message: 'Collection already in progress' };
  }
  if (!window._processingAnimalCollects) {
    window._processingAnimalCollects = new Set();
  }
  window._processingAnimalCollects.add(collectId);

  // Generate transaction ID and key
  const transactionId = generateTransactionId();
  const transactionKey = `farm-animal-collect-${npc.id}-${currentGridId}`;

  // ===== CALCULATE EXPECTED VALUES UPFRONT =====
  // Get the animal's output item from masterResources
  const animalResource = masterResources.find(r => r.type === npc.type);
  const expectedItem = animalResource?.output || npc.type;
  const expectedResource = masterResources.find(r => r.type === expectedItem);
  const expectedSymbol = expectedResource?.symbol || '🎁';

  // Calculate expected quantity with skill multiplier
  const skillInfo = calculateSkillMultiplier(expectedItem, currentPlayer.skills || [], masterSkills);
  const baseQuantity = animalResource?.outputqty || 1;
  const expectedQuantity = applySkillMultiplier(baseQuantity, skillInfo.multiplier);

  // Save original NPC state for potential rollback
  const originalNPCState = { ...npc };

  // ===== OPTIMISTIC UI: Show feedback immediately =====
  // 1. Play sound immediately
  soundManager.playSFX('collect_item');

  // 2. Visual feedback - poof effect and floating text
  createCollectEffect(col, row, TILE_SIZE);
  FloatingTextManager.addFloatingText(`+${expectedQuantity} ${expectedSymbol} ${getLocalizedString(expectedItem, strings)}`, col, row, TILE_SIZE);

  // 3. Optimistically update NPC state to 'grazing' (collected, starting new cycle)
  await NPCsInGridManager.updateNPC(currentGridId, npc.id, {
    state: 'grazing',
    grazeEnd: null
  });

  // 4. Show optimistic status message
  const statusMessage = formatSingleCollection('animal', expectedItem, expectedQuantity,
    skillInfo.hasSkills ? skillInfo : null, strings, getLocalizedString);
  updateStatus(statusMessage);

  // ===== SERVER VALIDATION =====
  try {
    console.log(`🐮 Sending collection request - ID: ${npc.id}, Expected: ${expectedQuantity} ${expectedItem}`);

    const response = await axios.post(`${API_BASE}/api/farm-animal/collect`, {
      playerId: currentPlayer.playerId,
      gridId: currentGridId,
      npcId: npc.id,
      npcPosition: { x: col, y: row },
      transactionId,
      transactionKey
    });

    if (response.data.success) {
      const { collectedQuantity, collectedItem, updatedNPC } = response.data;

      // Add to inventory using gainIngredients (respects Gold Pass capacity)
      const gained = await gainIngredients({
        playerId: currentPlayer.playerId,
        currentPlayer,
        resource: collectedItem,
        quantity: collectedQuantity,
        inventory: inventory || currentPlayer.inventory,
        backpack: backpack || currentPlayer.backpack,
        setInventory,
        setBackpack,
        setCurrentPlayer,
        updateStatus,
        masterResources,
        globalTuning,
      });

      // Check if gainIngredients succeeded
      if (gained !== true && (!gained || gained.success === false)) {
        console.error('❌ Failed to add animal product to inventory - warehouse may be full');
        // Show "You're full" floating text (the item was still collected server-side)
        FloatingTextManager.addFloatingText(strings["41"] || "You're full", col, row, TILE_SIZE);
      }

      // Update NPC with authoritative server state
      if (updatedNPC) {
        await NPCsInGridManager.updateNPC(currentGridId, npc.id, updatedNPC);
      }

      // Track quest progress
      await trackQuestProgress(currentPlayer, 'Collect', collectedItem, collectedQuantity, setCurrentPlayer);

      console.log(`✅ Farm animal collection confirmed: ${collectedQuantity} ${collectedItem}`);

      // Clear the processing flag
      if (window._processingAnimalCollects) {
        window._processingAnimalCollects.delete(collectId);
      }

      return {
        type: 'success',
        message: `Collected ${collectedQuantity} ${collectedItem}.`,
        collectedItem,
        collectedQuantity
      };
    } else {
      // Server returned success: false - rollback
      console.error('❌ Server rejected collection - rolling back');
      await NPCsInGridManager.updateNPC(currentGridId, npc.id, originalNPCState);
      updateStatus('❌ Failed to collect from animal');

      if (window._processingAnimalCollects) {
        window._processingAnimalCollects.delete(collectId);
      }
      return { type: 'error', message: 'Server rejected collection' };
    }
  } catch (error) {
    console.error('Error in protected farm animal collection:', error);

    // ===== ROLLBACK on error =====
    await NPCsInGridManager.updateNPC(currentGridId, npc.id, originalNPCState);

    if (error.response?.status === 429) {
      updateStatus(471);
      if (window._processingAnimalCollects) {
        window._processingAnimalCollects.delete(collectId);
      }
      return { type: 'error', message: 'Collection already in progress' };
    } else if (error.response?.status === 400) {
      const errorMessage = error.response?.data?.error || 'Animal not ready for collection';
      const errorDetails = error.response?.data;
      console.error(`❌ 400 Error details:`, errorDetails);

      // Handle warehouse full error
      if (errorMessage === 'Warehouse full' || errorMessage.includes('Warehouse full')) {
        console.error(`❌ Cannot collect: Warehouse is full`);
        FloatingTextManager.addFloatingText(strings["41"] || "You're full", col, row, TILE_SIZE);
        if (window._processingAnimalCollects) {
          window._processingAnimalCollects.delete(collectId);
        }
        return { type: 'error', message: 'Warehouse is full' };
      }

      // If server says NPC is in different state, sync with server state
      if (errorMessage.includes('state:')) {
        const serverStateMatch = errorMessage.match(/\(state:\s*(\w+)\)/);
        if (serverStateMatch) {
          const serverState = serverStateMatch[1];
          console.error(`❌ Server reports NPC ${npc.id} in state '${serverState}' but client had '${npc.state}'`);

          // Update local state to match server
          await NPCsInGridManager.updateNPC(currentGridId, npc.id, {
            state: serverState,
            grazeEnd: null
          });

          updateStatus(strings["815"] || "This animal was already collected");
        }
      } else {
        updateStatus(`❌ ${errorMessage}`);
      }

      if (window._processingAnimalCollects) {
        window._processingAnimalCollects.delete(collectId);
      }
      return { type: 'error', message: errorMessage };
    } else {
      updateStatus('❌ Failed to collect from animal');
      if (window._processingAnimalCollects) {
        window._processingAnimalCollects.delete(collectId);
      }
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
  strings = {},
  masterTrophies = null,
  globalTuning = null
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
            strings,
            masterTrophies,
            globalTuning
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
        strings,
        globalTuning
      );
    }

    case 'attack': 
    case 'spawn':
      handleAttackOnNPC(npc,currentPlayer,setCurrentPlayer,TILE_SIZE,setResources,masterResources,masterTrophies);
      
    break;
  

    default:
      console.log(`Unhandled NPC action: ${npc.action}`);
      break;
  }
}
