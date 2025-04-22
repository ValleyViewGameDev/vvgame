import API_BASE from './config.js'; 
import axios from 'axios';
import { updateInventory, fetchInventoryAndBackpack } from './Utils/InventoryManagement';
import { refreshPlayerAfterInventoryUpdate } from './Utils/InventoryManagement';
import { updateGridResource } from './Utils/GridManagement';
import { loadMasterResources, loadMasterSkills } from './Utils/TuningManager'; // Centralized tuning manager
import FloatingTextManager from './UI/FloatingText';
import { lockResource, unlockResource } from './Utils/ResourceLockManager';
import { handleTransitSignpost } from './GameFeatures/Transit/Transit';
import { trackQuestProgress } from './GameFeatures/Quests/QuestGoalTracker';
import { checkInventoryCapacity } from './Utils/InventoryManagement';
import { handleSpawnerDamage } from './GameFeatures/NPCs/NPCSpawner';
import { createCollectEffect, createSourceConversionEffect, calculateTileCenter } from './VFX/VFX';

// Create a utility function at the top
const getTileCenter = (col, row, TILE_SIZE) => {
    const centerX = (col * TILE_SIZE) + (TILE_SIZE / 2);
    const centerY = (row * TILE_SIZE) + (TILE_SIZE / 2);
    return { x: centerX, y: centerY };
};

 // Handles resource click actions based on category. //
 export async function handleResourceClick(
  resource,
  row,
  col,
  resources,
  setResources,
  setInventory,
  setBackpack,
  inventory,
  backpack,
  addFloatingText,
  gridId,
  TILE_SIZE,
  tileTypes,
  currentPlayer,
  setCurrentPlayer,
  fetchGrid,
  setGridId,
  setGrid,
  setTileTypes,
  setGridState,
  updateStatus,
  masterResources,
  masterSkills,

) {
  console.log(`Resource Clicked:  (${row}, ${col}):`, {
    resource,
    tileType: tileTypes[row]?.[col],
  });
  console.log('Inventory when handleResourceClick is called:', inventory);

  if (!resource || !resource.category) {
    console.error(`Invalid resource at (${col}, ${row}):`, resource);
    return;
  }
  lockResource(col, row); // Optimistically lock the resource

  try {
    // Load master resources and skills (cached internally)
    if (!masterResources || masterResources.length === 0) { 
      masterResources = await loadMasterResources();  // Direct assignment without `const`
    }
    if (!masterSkills || masterSkills.length === 0) { 
      masterSkills = await loadMasterSkills(); 
    }
    const skills = currentPlayer.skills;

    // Fetch inventory and backpack if either is empty
    if ((!Array.isArray(inventory)) || (!Array.isArray(backpack))) {
      console.warn('Inventory or backpack is not initialized; fetching from server.');
      const { inventory: fetchedInventory, backpack: fetchedBackpack } = await fetchInventoryAndBackpack(currentPlayer.playerId);
      setInventory(fetchedInventory); // Update state with fetched inventory
      setBackpack(fetchedBackpack); // Update state with fetched backpack
      console.log('Fetched inventory:', fetchedInventory);
      console.log('Fetched backpack:', fetchedBackpack);
    }

    switch (resource.category) {

      case 'doober':
        await handleDooberClick(
          resource,
          row,
          col,
          resources,
          setResources,
          setInventory,
          setBackpack,
          inventory,
          backpack,
          skills,
          gridId,
          addFloatingText,
          TILE_SIZE,
          currentPlayer,
          setCurrentPlayer,
          updateStatus,
          masterResources,
          masterSkills // Pass tuning data
        );
        break;

      case 'source':
        await handleSourceConversion(
          resource,
          row,
          col,
          resources,
          setResources,
          setInventory,
          gridId,
          addFloatingText,
          TILE_SIZE,
          currentPlayer,
          setCurrentPlayer,
          masterResources,
          masterSkills // Pass tuning data
        );
        break;

      case 'seed':
        console.log('Seed clicked; do nothing');
        break;

      case 'travel':
        console.log('Travel sign clicked');
        try {
          await handleTransitSignpost(
            currentPlayer,
            resource.type,
            setCurrentPlayer,
            fetchGrid,
            setGridId,                // ✅ Ensure this is passed
            setGrid,                  // ✅ Pass setGrid function
            setResources,             // ✅ Pass setResources function
            setTileTypes,             // ✅ Pass setTileTypes function
            setGridState,
            updateStatus,
            TILE_SIZE,
            skills
          );
        } catch (error) {
          console.error("Error handling travel signpost:", error.message || error);
        }
        break;
        
      default:
        console.warn(`Unhandled resource category: ${resource.category}`);
    }
  } catch (error) {
    console.error('Error handling resource click:', error);
    unlockResource(col, row); // Unlock the resource on error
  } finally {
    unlockResource(col, row);
  }
}


// HANDLE DOOBER CLICKS //
//
async function handleDooberClick(
  resource,
  row,
  col,
  resources,
  setResources,
  setInventory,
  setBackpack,
  inventory = [],
  backpack = [],
  skills = [],
  gridId,
  addFloatingText,
  TILE_SIZE,
  currentPlayer,
  setCurrentPlayer,
  updateStatus,
  masterResources,
  masterSkills
) {
  console.log('handleDooberClick: Current Player:', currentPlayer);

  const gtype = currentPlayer.location.gtype;
  const baseQtyCollected = resource.qtycollected || 1;

  // Ensure inventory is an array
  if (!Array.isArray(skills)) {
    console.warn('Skills is not an array; defaulting to empty array.');
    skills = [];
  }

  // Extract player skills and upgrades from inventory
  const playerBuffs = skills
    .filter((item) => {
      const resourceDetails = masterResources.find((res) => res.type === item.type);
      return resourceDetails?.category === 'skill' || resourceDetails?.category === 'upgrade';
    })
    .map((buffItem) => buffItem.type);

  console.log('Player Buffs (Skills and Upgrades):', playerBuffs);

  // Calculate skill multiplier
  const skillMultiplier = playerBuffs.reduce((multiplier, buff) => {
    const buffValue = masterSkills?.[buff]?.[resource.type] || 1;
    console.log(`Buff "${buff}" applies to "${resource.type}" with multiplier x${buffValue}`);
    return multiplier * buffValue;
  }, 1);

  const qtyCollected = baseQtyCollected * skillMultiplier;
  console.log('Final Quantity Collected:', qtyCollected);

  // Special case: Money always goes to inventory and does not count against capacity
  const isMoney = resource.type === 'Money';
  const isBackpack = !isMoney && ["town", "valley0", "valley1", "valley2", "valley3"].includes(gtype);

  // Check for Backpack skill if in town or valley
  if (isBackpack) {
    const hasBackpackSkill = skills.some((item) => item.type === 'Backpack' && item.quantity > 0);
    if (!hasBackpackSkill) {
      console.warn('Cannot collect resources: Missing Backpack skill.');
      addFloatingText(`Backpack Required!`, col * TILE_SIZE, row * TILE_SIZE);
      updateStatus(19); // Status update for missing Backpack skill
      return;
    }
  }

  let targetInventory = isMoney ? inventory : isBackpack ? backpack : inventory;
  const setTargetInventory = isMoney ? setInventory : isBackpack ? setBackpack : setInventory;

  // If targetInventory is empty, fetch it from the server
  if (!Array.isArray(targetInventory) || targetInventory.length === 0) {
    console.warn(`${isBackpack ? "Backpack" : "Inventory"} is empty; fetching from server.`);
    const { inventory: fetchedInventory, backpack: fetchedBackpack } = await fetchInventoryAndBackpack(currentPlayer.playerId);
    targetInventory = isBackpack ? fetchedBackpack : fetchedInventory;
    setInventory(fetchedInventory);
    setBackpack(fetchedBackpack);
  }

  const maxCapacity = isMoney ? Infinity : isBackpack ? currentPlayer.backpackCapacity : currentPlayer.warehouseCapacity;

  // Calculate current capacity (excluding Money)
  const currentCapacity = targetInventory
    .filter((item) => item.type !== 'Money')
    .reduce((sum, item) => sum + item.quantity, 0);

  // Check capacity limits (excluding Money)
  if (!isMoney) {
    const hasCapacity = checkInventoryCapacity(
      currentPlayer,
      inventory,
      backpack,
      resource.type,
      qtyCollected
    );
  
    //NEED TO FIX THIS! :
    if (!hasCapacity) {
      const statusUpdate = isBackpack ? 21 : 20; // Backpack or warehouse full
      console.warn(`Cannot collect doober: Exceeds capacity in ${isBackpack ? "backpack" : "warehouse"}.`);
      addFloatingText(`No more capacity`, col * TILE_SIZE, row * TILE_SIZE); // Visual feedback
      updateStatus(statusUpdate);
      return;
    }
  }

  // Add VFX right before removing the doober
  createCollectEffect(col, row, TILE_SIZE);

  // Use exact same position calculation as VFX.js
  FloatingTextManager.addFloatingText(
    `+${qtyCollected} ${resource.type}`, 
    col, 
    row,
    TILE_SIZE
  );


  // Optimistically remove the doober locally
  setResources((prevResources) =>
    prevResources.filter((res) => !(res.x === col && res.y === row))
  );
  // Optimistically update target inventory locally
  const updatedInventory = [...targetInventory];
  const index = updatedInventory.findIndex((item) => item.type === resource.type);

  if (index >= 0) {
    updatedInventory[index].quantity += qtyCollected;
  } else {
    updatedInventory.push({ type: resource.type, quantity: qtyCollected });
  }

  setTargetInventory(updatedInventory);
  console.log('TargetInventory set to updatedInventory.');

  // Perform server validation
  try {
    const gridUpdateResponse = await updateGridResource(
      gridId,
      { type: null, x: col, y: row }, // Collecting doober removes it
      setResources,
      true
    );
 
    if (gridUpdateResponse?.success) {
      console.log('Doober collected successfully.');

      // Update the server inventory or backpack
      await axios.post(`${API_BASE}/api/update-inventory`, {
        playerId: currentPlayer.playerId,
        [isBackpack ? "backpack" : "inventory"]: updatedInventory,
      });
      console.log(`Server ${isBackpack ? "backpack" : "inventory"} updated successfully.`);

      // Track quest progress for "Collect" actions
      // trackQuestProgress expects: (player, action, item, quantity, setCurrentPlayer)
      await trackQuestProgress(currentPlayer, 'Collect', resource.type, qtyCollected, setCurrentPlayer);

      // Update currentPlayer state locally
      await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);
    } else {
      throw new Error('Failed to update grid resource.');
    }
  } catch (error) {
    console.error('Error during doober collection:', error);

    // Rollback local resource state on server failure
    setResources((prevResources) => [...prevResources, resource]);

    setTargetInventory((prevInventory) => {
      const revertedInventory = [...prevInventory];
      const index = revertedInventory.findIndex((item) => item.type === resource.type);

      if (index >= 0) {
        revertedInventory[index].quantity -= qtyCollected;
        if (revertedInventory[index].quantity <= 0) {
          revertedInventory.splice(index, 1); // Remove item if quantity is zero
        }
      }
      return revertedInventory;
    });
  } finally {
    unlockResource(col, row); // Always unlock the resource
  }
}



// HANDLE SOURCE CONVERSIONS //
//
export async function handleSourceConversion(
  resource,
  row,
  col,
  resources,
  setResources,
  setInventory,
  gridId,
  addFloatingText,
  TILE_SIZE,
  currentPlayer,
  setCurrentPlayer,
  masterResources,
  masterSkills
) {
  if (resource.action !== 'convertTo') return;

  // Get target resource first
  const targetResource = masterResources.find((res) => res.type === resource.output);
  if (!targetResource) { 
    console.warn(`⚠️ No matching resource found for output: ${resource.output}`); 
    return; 
  }

  // Get required skill
  const requiredSkill = masterResources.find((res) =>
    res.output === resource.type
  )?.type;

  // CASE 1: Required Skill Missing
  if (requiredSkill && !currentPlayer.skills.some((skill) => skill.type === requiredSkill)) {
    addFloatingText(
      `${requiredSkill} Required`,
      col,  // Pass tile coordinates
      row,  // Not pixel coordinates
      TILE_SIZE
    );
    return;
  }

  // CASE 2: VFX
  createSourceConversionEffect(col, row, TILE_SIZE, requiredSkill);

  // CASE 3: Success Text
  FloatingTextManager.addFloatingText(
    `Converted to ${targetResource.type}`, 
    col,  // Pass tile coordinates
    row,  // Not pixel coordinates
    TILE_SIZE
  );

  // Define isValley as any gtype that is NOT "town" or "homestead"
  const isValley = !['town', 'homestead'].includes(currentPlayer?.location?.gtype);
  
  const x = col;
  const y = row;
  
  // Build the new resource object to replace the one we just clicked
  const enrichedNewResource = {
    ...targetResource,
    x,
    y,
    symbol: targetResource.symbol,
    qtycollected: targetResource.qtycollected || 1,
    category: targetResource.category || 'doober',
    growEnd: targetResource.growEnd || null,
  };
  console.log('Enriched newResource for local state: ', enrichedNewResource);

  // Optimistically update local client state
    setResources((prevResources) =>
      prevResources.map((res) =>
        res.x === x && res.y === y ? enrichedNewResource : res
      )
    );


  // Perform server update
    try {
    const gridUpdateResponse = await updateGridResource(
      gridId, 
      { type: targetResource.type, x: col, y: row }, 
      setResources, 
      true
    );

    if (gridUpdateResponse?.success) {
      console.log('✅ Source conversion completed successfully on the server.');
    } else {
      throw new Error('Server failed to confirm the source conversion.');
    }
  } catch (error) {
    console.error('❌ Error during source conversion:', error);
    console.warn('Server update failed. The client may become out of sync.');
  } finally {
    await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);
    unlockResource(x, y);
  }
}