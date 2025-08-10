import API_BASE from "../../config";
import axios from "axios";    
import FloatingTextManager from "../../UI/FloatingText";
import NPCsInGridManager from "../../GridState/GridStateNPCs";
import { handleAttackOnNPC } from "../Combat/Combat";
import { gainIngredients } from "../../Utils/InventoryManagement";
import { trackQuestProgress } from '../../GameFeatures/Quests/QuestGoalTracker';
import AnimalPanel from '../FarmAnimals/FarmAnimals.js';

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
  setResources,
  currentPlayer,
  setCurrentPlayer,
  TILE_SIZE,
  masterResources,
  masterSkills,
  currentGridId,
  updateStatus
) {
  console.log(`🔒 [PROTECTED FARM ANIMAL] Starting protected collection for NPC ${npc.id}`);
  
  // Generate transaction ID and key
  const transactionId = generateTransactionId();
  const transactionKey = `farm-animal-collect-${npc.id}-${currentGridId}`;
  
  try {
    const response = await axios.post(`${API_BASE}/api/farm-animal/collect`, {
      playerId: currentPlayer.playerId,
      gridId: currentGridId,
      npcId: npc.id,
      npcPosition: { x: col, y: row },
      transactionId,
      transactionKey
    });

    if (response.data.success) {
      const { collectedQuantity, collectedItem, skillsApplied, inventory, updatedNPC } = response.data;
      
      // Update inventory from server response
      if (inventory) {
        setInventory(inventory);
        setCurrentPlayer(prev => ({ ...prev, inventory }));
      }

      // Update NPC state
      if (updatedNPC) {
        await NPCsInGridManager.updateNPC(currentGridId, npc.id, updatedNPC);
      }

      // Visual feedback
      FloatingTextManager.addFloatingText(`+${collectedQuantity} ${collectedItem}`, col, row, TILE_SIZE);
      
      const statusMessage = skillsApplied.length === 0
        ? `Gained ${collectedQuantity} ${collectedItem}.`
        : `Gained ${collectedQuantity} ${collectedItem} (${skillsApplied.join(', ')} skill applied).`;
      updateStatus(statusMessage);

      // ✅ Track quest progress for NPC graze collection
      await trackQuestProgress(currentPlayer, 'Collect', collectedItem, collectedQuantity, setCurrentPlayer);

      console.log(`Farm animal collection completed: ${collectedQuantity} ${collectedItem}`);
      return { type: 'success', message: `Collected ${collectedQuantity} ${collectedItem}.` };
    }
  } catch (error) {
    console.error('Error in protected farm animal collection:', error);
    
    if (error.response?.status === 429) {
      updateStatus('⚠️ Collection already in progress');
      return { type: 'error', message: 'Collection already in progress' };
    } else if (error.response?.status === 400) {
      updateStatus('❌ Animal not ready for collection');
      return { type: 'error', message: 'Animal not ready for collection' };
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
  setCurrentPlayer,
  TILE_SIZE,
  masterResources,
  masterSkills,
  currentGridId,
  setModalContent,
  setIsModalOpen,
  updateStatus,
  setUILocked,
  openPanel,
  setActiveStation,
) {
  if (!npc) {
    console.warn("handleNPCClick was called with an undefined NPC.");
    return;
  }
  console.log(`[🐮↖️ handleNPCClick] NPC ${npc.id} clicked with state=${npc.state}`);

  switch (npc.action) {

    case 'quest': 
    case 'heal':
    case 'farmhand':
      {
        //handled directly in RenderDynamic  
        break;
      }
 
    case 'graze': {

      console.log(`Handling grazing logic for NPC ${npc.id}.`);

      // ✅ Special case: If in town, relocate NPC to home grid

      if (currentPlayer.location.gtype === 'town') {
        return new Promise((resolve) => {
          const handleYes = async () => {
            await NPCsInGridManager.removeNPC(currentGridId, npc.id);
            const relocatedNPC = {
              ...npc,
              position: { x: 1, y: 7 },
              state: 'idle',
              lastUpdated: Date.now(),
            };
            await NPCsInGridManager.addNPC(currentPlayer.gridId, relocatedNPC);
            setIsModalOpen(false);
            resolve({ type: 'success', message: `NPC moved to your homestead.` });
          };
          const handleNo = () => {
            setIsModalOpen(false);
            resolve({ type: 'info', message: 'Cancelled.' });
          };
          setModalContent({
            title: "Send this animal to your homestead?",
            size: "small",
            onClose: handleNo,
            children: (
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '10px' }}>
                <button onClick={handleYes}>Yes</button>
                <button onClick={handleNo}>No</button>
              </div>
            ),
          });
          setIsModalOpen(true);
        });
      }

      if (npc.state !== 'processing') {
        console.log(`NPC clicked but not in processing state: ${npc.state}`);

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
        setResources,
        currentPlayer,
        setCurrentPlayer,
        TILE_SIZE,
        masterResources,
        masterSkills,
        currentGridId,
        updateStatus
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
