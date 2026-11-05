import API_BASE from "../../config.js";
import axios from "axios";
import FloatingTextManager from "../../UI/FloatingText.js";
import NPCsInGridManager from "../../GridState/GridStateNPCs.js";
import { handleAttackOnNPC } from "../Combat/Combat.js";
import { hasRoomFor, isCurrency, calculateSkillMultiplier, applySkillMultiplier } from "../../Utils/InventoryManagement.js";
import { applyPlayerDelta, postAction, predictGain } from "../../Utils/playerDelta.js";
import { canCollect, reportRefusal } from "../../Utils/noRoom.js";
import AnimalPanel from '../FarmAnimals/FarmAnimals.js';
import { calculateDistance } from '../../Utils/worldHelpers.js';
import { getLocalizedString } from '../../Utils/stringLookup.js';
import { formatSingleCollection } from '../../UI/StatusBar/CollectionFormatters.js';
import { createCollectEffect } from '../../VFX/VFX.js';
import soundManager from '../../Sound/SoundManager';
import { isViewOnly } from '../../Utils/viewOnly';

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
  backpack = null,
  openPanel = null
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


  // ===== CALCULATE EXPECTED VALUES UPFRONT =====
  // Get the animal's output item from masterResources
  const animalResource = masterResources.find(r => r.type === npc.type);

  // DEBUG: Log NPC type lookup for Brown Cow investigation
  console.log(`🐄 Farm animal collection - npc.type: "${npc.type}", animalResource found: ${!!animalResource}, qtycollected: ${animalResource?.qtycollected}`);

  const expectedItem = animalResource?.output || npc.type;
  const expectedResource = masterResources.find(r => r.type === expectedItem);
  const expectedSymbol = expectedResource?.symbol || '🎁';

  // Calculate expected quantity with skill multiplier
  const skillInfo = calculateSkillMultiplier(expectedItem, currentPlayer.skills || [], masterSkills);
  const baseQuantity = animalResource?.qtycollected || 1;  // Fixed: was outputqty, should be qtycollected
  const expectedQuantity = applySkillMultiplier(baseQuantity, skillInfo.multiplier);

  // ===== ROOM FIRST, exactly as a doober (ResourceClicking.js) =====
  // The server empties the stall on collect and the client adds the product afterwards, so with no
  // room the product was lost. Now nothing is sent: the animal keeps its ✅ and its product.
  if (!canCollect({
    resource: expectedItem, quantity: expectedQuantity, currentPlayer, inventory, backpack, masterResources, globalTuning,
    at: { col, row, TILE_SIZE }, strings, updateStatus, openPanel,
  })) {
    window._processingAnimalCollects.delete(collectId);
    return { type: 'error', message: 'No room' };
  }

  // ===== OPTIMISTIC UI: Show visual feedback immediately =====
  // 1. Play sound immediately
  soundManager.playSFX('collect_item');

  // 2. Visual feedback - poof effect and floating text
  createCollectEffect(col, row, TILE_SIZE);
  FloatingTextManager.addFloatingText(`+${expectedQuantity} ${expectedSymbol} ${getLocalizedString(expectedItem, strings)}`, col, row, TILE_SIZE);

  // 3. The ✅ goes NOW: a client-only collectPending mark hides it (markLocal never saves).
  //    The NPC's real state stays 'processing' until the server confirms, because the server
  //    validates the collection against its stored 'processing' state. Every refusal below
  //    clears the mark, so the ✅ comes back.
  NPCsInGridManager.markLocal(currentGridId, npc.id, { collectPending: true });
  const restoreCheckmark = () => NPCsInGridManager.markLocal(currentGridId, npc.id, { collectPending: false });

  // 4. Show optimistic status message
  const statusMessage = formatSingleCollection('animal', expectedItem, expectedQuantity,
    skillInfo.hasSkills ? skillInfo : null, strings, getLocalizedString);
  updateStatus(statusMessage);

  // ===== SERVER =====
  // ONE request (game-server routes/actionRoutes.js /action/animal-collect): the server checks the
  // animal is ready and that the product fits, empties the stall, grants the product and advances
  // Collect quests, then answers with the player delta.
  const done = () => { if (window._processingAnimalCollects) window._processingAnimalCollects.delete(collectId); };
  predictGain({ type: expectedItem, qty: expectedQuantity, isCurrencyItem: isCurrency(expectedItem),
    atHome: currentPlayer?.location?.gtype === 'homestead', setCurrentPlayer, setInventory, setBackpack });
  const answer = await postAction('/api/action/animal-collect', { playerId: currentPlayer.playerId, gridId: currentGridId, npcId: npc.id });
  applyPlayerDelta(answer.data, { setCurrentPlayer, setInventory, setBackpack });
  done();
  if (answer.ok) {
    const { collected, updatedNPC } = answer.data;
    await NPCsInGridManager.updateNPC(currentGridId, npc.id, { ...(updatedNPC || { state: 'emptystall', grazeEnd: null }), collectPending: false });
    return { type: 'success', message: `Collected ${collected.qty} ${collected.type}.`, collectedItem: collected.type, collectedQuantity: collected.qty, stored: true };
  }
  restoreCheckmark();
  if (answer.status === 0) { updateStatus('❌ Failed to collect from animal'); return { type: 'error', message: 'network' }; }
  if (reportRefusal(answer.reason, { at: { col, row, TILE_SIZE }, strings, updateStatus, openPanel })) {
    return { type: 'error', message: 'No room' };
  }
  if (answer.reason === 'not-ready') {
    // our copy said it was ready and the server's did not: it was collected already
    await NPCsInGridManager.updateNPC(currentGridId, npc.id, { state: 'emptystall', grazeEnd: null });
    updateStatus(473); // "This animal was already collected."
    return { type: 'error', message: 'already collected' };
  }
  updateStatus('❌ Failed to collect from animal');
  return { type: 'error', message: answer.reason || 'refused' };
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
  globalTuning = null,
  holdings = null // { inventory, backpack }: fresher than currentPlayer's, from a caller collecting in a loop
) {
  if (!npc) {
    console.warn("handleNPCClick was called with an undefined NPC.");
    return;
  }
  if (isViewOnly()) return; // a read-only snapshot (Utils/viewOnly.js)
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
            globalTuning,
            holdings
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
        globalTuning,
        holdings?.inventory || null,
        holdings?.backpack || null,
        openPanel
      );
    }

    case 'attack': 
    case 'spawn':
      handleAttackOnNPC(npc, currentPlayer, setCurrentPlayer, TILE_SIZE, setResources, masterResources, masterTrophies, globalTuning);
      
    break;
  

    default:
      console.log(`Unhandled NPC action: ${npc.action}`);
      break;
  }
}
