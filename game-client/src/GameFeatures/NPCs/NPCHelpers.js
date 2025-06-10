import API_BASE from "../../config";
import axios from "axios";    
import FloatingTextManager from "../../UI/FloatingText";
import NPCsInGridManager from "../../GridState/GridStateNPCs";
import { handleAttackOnNPC } from "../Combat/Combat";
import { gainIngredients } from "../../Utils/InventoryManagement";

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
  masterResources,
  masterSkills,
  currentGridId,
  setModalContent,
  setIsModalOpen,
  updateStatus,
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
      
      // ✅ Otherwise, handle Animals in stalls in "procesing" state

      if (npc.state !== 'processing') {
        console.log(`NPC clicked but not in processing state: ${npc.state}`);
        return { type: 'info', message: 'NPC is not ready for collection.' };
      }

      const baseQuantity = npc.qtycollected || 1;
      console.log('Base quantity to collect:', baseQuantity);

      // Extract player skills and upgrades from inventory
      const playerBuffs = currentPlayer?.skills
        .filter((item) => {
          const res = masterResources.find((r) => r.type === item.type);
          const isSkill = res?.category === 'skill' || res?.category === 'upgrade';
          const applies = (masterSkills?.[item.type]?.[npc.output] || 1) > 1;
          return isSkill && applies;
        })
        .map((item) => item.type);

      const skillModifier = playerBuffs.reduce((mult, buff) => {
        const boost = masterSkills?.[buff]?.[npc.output] || 1;
        return mult * boost;
      }, 1);

      const quantityToCollect = baseQuantity * skillModifier;
      console.log('[DEBUG] quantityToCollect after multiplier:', quantityToCollect);

      // Update the player's inventory
      
      const gainSuccess = await gainIngredients({
        playerId: currentPlayer.playerId,
        currentPlayer,
        resource: npc.output,
        quantity: quantityToCollect,
        inventory: currentPlayer.inventory,
        backpack: currentPlayer.backpack,
        setInventory,
        setBackpack: () => {}, // no change to backpack in graze flow
        setCurrentPlayer: () => {}, // optional: skip player refresh
        updateStatus: () => {},     // optional: or pass a real one if available
        masterResources,
      });

      if (!gainSuccess) {
        FloatingTextManager.addFloatingText(`❌ No space`, col, row, TILE_SIZE);
        return { type: 'error', message: 'Failed to collect item (no space?)' };
      }
      FloatingTextManager.addFloatingText(`+${quantityToCollect} ${npc.output}`, col, row, TILE_SIZE);
      const statusMessage =
        skillModifier === 1
          ? `✅ Gained ${quantityToCollect} ${npc.output}.`
          : `✅ Gained ${quantityToCollect} ${npc.output} (${playerBuffs.join(', ')} skill applied).`;
      updateStatus(statusMessage);

      try {
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
