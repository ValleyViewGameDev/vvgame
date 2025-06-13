import API_BASE from './config.js'; 
import axios from 'axios';
import { fetchInventoryAndBackpack, refreshPlayerAfterInventoryUpdate } from './Utils/InventoryManagement';
import { gainIngredients, spendIngredients } from './Utils/InventoryManagement';
import { updateGridResource } from './Utils/GridManagement';
import { loadMasterResources, loadMasterSkills } from './Utils/TuningManager'; // Centralized tuning manager
import FloatingTextManager from './UI/FloatingText';
import { lockResource, unlockResource } from './Utils/ResourceLockManager';
import { handleTransitSignpost } from './GameFeatures/Transit/Transit';
import { trackQuestProgress } from './GameFeatures/Quests/QuestGoalTracker';
import { createCollectEffect, createSourceConversionEffect, calculateTileCenter } from './VFX/VFX';
import strings from './UI/strings.json';
import InventoryPanel from './GameFeatures/Inventory/InventoryPanel.js';
 
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
  setGridId,
  setGrid,
  setTileTypes,
  updateStatus,
  masterResources,
  masterSkills,
  setModalContent,
  setIsModalOpen,
  closeAllPanels,
) {
  console.log(`Resource Clicked:  (${row}, ${col}):`, { resource, tileType: tileTypes[row]?.[col] });
  if (!resource || !resource.category) { console.error(`Invalid resource at (${col}, ${row}):`, resource); return; }
  
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
          currentPlayer?.inventory || [],
          currentPlayer?.backpack || [],
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
          inventory,
          setInventory,
          backpack,
          setBackpack,  
          gridId,
          addFloatingText,
          TILE_SIZE,
          currentPlayer,
          setCurrentPlayer,
          masterResources,
          masterSkills, 
          setModalContent,
          setIsModalOpen,
          updateStatus
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
            setGridId, 
            setGrid,
            setTileTypes, 
            setResources,
            updateStatus,
            TILE_SIZE,
            skills,
            closeAllPanels
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
  console.log('handleDooberClick: Current backpack:', backpack);
  const gtype = currentPlayer.location.gtype;
  const baseQtyCollected = resource.qtycollected || 1;

  if (!Array.isArray(inventory) || !Array.isArray(backpack)) {
    console.warn("Inventory or backpack missing; aborting doober click.");
    return;
  }

  console.log('MasterSkills:', masterSkills);
  // Extract player skills and upgrades from inventory
  const playerBuffs = skills
    .filter((item) => {
      const resourceDetails = masterResources.find((res) => res.type === item.type);
      const isSkill = resourceDetails?.category === 'skill' || resourceDetails?.category === 'upgrade';
      const appliesToResource = (masterSkills?.[item.type]?.[resource.type] || 1) > 1;
      return isSkill && appliesToResource;
    })
    .map((buffItem) => buffItem.type);

  //console.log('Player Buffs (Skills and Upgrades):', playerBuffs);

  // Calculate skill multiplier
  const skillMultiplier = playerBuffs.reduce((multiplier, buff) => {
    const buffValue = masterSkills?.[buff]?.[resource.type] || 1;
    //console.log(`Buff "${buff}" applies to "${resource.type}" with multiplier x${buffValue}`);
    return multiplier * buffValue;
  }, 1);
  const qtyCollected = baseQtyCollected * skillMultiplier;
  console.log('[DEBUG] qtyCollected after multiplier:', qtyCollected);

  // Perform server validation
  try {
    // Use gainIngredients to handle inventory/backpack update, sync, and capacity check
    console.log("Calling gainIngredients with: ",resource.type);
    
    const gainSuccess = await gainIngredients({
      playerId: currentPlayer.playerId,
      currentPlayer,
      resource: resource.type,
      quantity: qtyCollected,
      inventory,
      backpack,
      setInventory,
      setBackpack,
      setCurrentPlayer,
      updateStatus,
      masterResources,
    });

    if (!gainSuccess) {
      console.warn("❌ Failed to gain doober ingredient. Rolling back.");
      // Restore the doober visually
      setResources((prevResources) => [...prevResources, resource]);
      return;
    }

    // Track quest progress for "Collect" actions
    // trackQuestProgress expects: (player, action, item, quantity, setCurrentPlayer)
    await trackQuestProgress(currentPlayer, 'Collect', resource.type, qtyCollected, setCurrentPlayer);

    const gridUpdateResponse = await updateGridResource(
      gridId,
      { type: null, x: col, y: row }, // Collecting doober removes it
      true
    );
    if (!gridUpdateResponse?.success) {
      console.warn('⚠️ Grid update failed even though inventory succeeded.');
      return;
    }

    FloatingTextManager.addFloatingText(`+${qtyCollected} ${resource.type}`, col, row, TILE_SIZE );
    if (skillMultiplier != 1) {
      const skillAppliedText =
        `(${playerBuffs.join(', ')} skill applied)`;
      FloatingTextManager.addFloatingText(`${skillAppliedText}`, col, row-1.5, TILE_SIZE );
    }

    setResources((prevResources) =>
      prevResources.filter((res) => !(res.x === col && res.y === row))
    );
    createCollectEffect(col, row, TILE_SIZE);

    // Update currentPlayer state locally
    await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);
    console.log('[DEBUG] Player state refreshed after inventory update.');
  } catch (error) {
    console.error('Error during doober collection:', error);
    // Rollback local resource state on server failure
    setResources((prevResources) => [...prevResources, resource]);
  } finally {
    unlockResource(col, row); // Always unlock the resource
  }
}


// Helper: Handles use of required key/item for a resource
// Returns a Promise<boolean>: true if item used, false otherwise
let pendingKeyResolve = null; // Module-level temporary resolve callback

export async function handleUseKey(resource,col,row,TILE_SIZE,currentPlayer,setCurrentPlayer,inventory,setInventory,backpack,setBackpack,addFloatingText,strings,setModalContent,setIsModalOpen,updateStatus) {
  console.log('handleUseKey: resource:', resource);
  if (!resource.requires) return true;
  if (pendingKeyResolve) {return false;}   // Only allow one modal pending at a time

  const requiredType = resource.requires;
  const requiredItem = currentPlayer.inventory.find((item) => item.type === requiredType);

  if (!requiredItem || requiredItem.quantity <= 0) { updateStatus(`${strings["35"]}${requiredType}`); return false; }

  return new Promise((resolve) => {
    pendingKeyResolve = resolve;

    const handleYes = async () => {
      const spent = await spendIngredients({
        playerId: currentPlayer.playerId,
        currentPlayer,
        resource: requiredType,
        quantity: 1,
        inventory,
        backpack,
        setInventory,
        setBackpack,
        setCurrentPlayer,
        updateStatus,
      });

      if (!spent) {
        console.warn('❌ Failed to spend key item.');
        return;
      }

      updateStatus(`${strings["36"]}${requiredType}`);

      setIsModalOpen(false);
      if (pendingKeyResolve) {
        pendingKeyResolve(true);
        pendingKeyResolve = null;
      }
    };
    const handleNo = () => {
      setIsModalOpen(false);
      if (pendingKeyResolve) {
        pendingKeyResolve(false);
        pendingKeyResolve = null;
      }
    };

    const totalOwned =
      (currentPlayer.inventory.find(item => item.type === requiredType)?.quantity || 0) +
      (currentPlayer.backpack?.find(item => item.type === requiredType)?.quantity || 0);
      
    setModalContent({
      title: `${strings["5045"]} ${requiredType}?`,
      message: `${strings["5046"]} ${requiredType}?`,
      message2: `${strings["5047"]} ${totalOwned}.`,
      size: 'small',
      onClose: handleNo,  // 🔁 Close button acts like "No"
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

// HANDLE SOURCE CONVERSIONS //
//
export async function handleSourceConversion(
  resource,
  row,
  col,
  resources,
  setResources,
  inventory,
  setInventory,
  backpack,
  setBackpack,
  gridId,
  addFloatingText,
  TILE_SIZE,
  currentPlayer,
  setCurrentPlayer,
  masterResources,
  masterSkills,
  setModalContent,
  setIsModalOpen,
  updateStatus
) {
  if (resource.action !== 'convertTo') return;

  // Get target resource first
  const targetResource = masterResources.find((res) => res.type === resource.output);
  if (!targetResource) { console.warn(`⚠️ No matching resource found for output: ${resource.output}`); return; }

  // Get required skill
  const requiredSkill = resource.requires;
  // Required Skill Missing
  if (requiredSkill) {
    const hasSkill = currentPlayer.skills?.some(skill => skill.type === requiredSkill);
    if (!hasSkill) {
      addFloatingText(`${requiredSkill} Required`, col, row, TILE_SIZE);
      return;
    }
  }
  // ✅ Determine if 'requires' is a skill or upgrade — if not, treat it as a consumable
  const requiresType = resource.requires;
  const isSkillOrUpgrade = masterResources.some(
    res => res.type === requiresType && (res.category === "skill" || res.category === "upgrade")
  );
  // 🔑 Handle Key Requirement
  if (requiresType && !isSkillOrUpgrade) {
    const usedKey = await handleUseKey(resource,col,row,TILE_SIZE,currentPlayer,setCurrentPlayer,inventory,setInventory,backpack,setBackpack,addFloatingText,strings,setModalContent,setIsModalOpen,updateStatus,);
    if (!usedKey) return;
  }
  // Build the new resource object to replace the one we just clicked
  const x = col;
  const y = row;
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

    setResources((prevResources) => {
    const filtered = prevResources.filter(r => !(r.x === col && r.y === row));
    return [...filtered, enrichedNewResource];
  });

  // Perform server update
    try {
    const gridUpdateResponse = await updateGridResource(
      gridId, 
      { type: targetResource.type, x: col, y: row }, 
      true
    );
    if (gridUpdateResponse?.success) {
      // VFX
      createSourceConversionEffect(col, row, TILE_SIZE, requiredSkill);
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