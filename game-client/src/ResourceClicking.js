import API_BASE from './config.js'; 
import axios from 'axios';
import { fetchInventoryAndBackpack, refreshPlayerAfterInventoryUpdate } from './Utils/InventoryManagement';
import { gainIngredients, spendIngredients, calculateSkillMultiplier, hasRoomFor, isCurrency } from './Utils/InventoryManagement';
import { updateGridResource } from './Utils/GridManagement';
import { loadMasterResources, loadMasterSkills } from './Utils/TuningManager'; // Centralized tuning manager
import FloatingTextManager from './UI/FloatingText';
import { lockResource, unlockResource } from './Utils/ResourceLockManager';
import { trackQuestProgress } from './GameFeatures/Quests/QuestGoalTracker';
import { showNotification } from './UI/Notifications/Notifications';
import { createCollectEffect, createSourceConversionEffect, createPlantGrowEffect, calculateTileCenter } from './VFX/VFX';
import soundManager from './Sound/SoundManager';
import { earnTrophy } from './GameFeatures/Trophies/TrophyUtils';
import { useStrings } from './UI/StringsContext';
import { getLocalizedString } from './Utils/stringLookup';
import { formatSingleCollection } from './UI/StatusBar/CollectionFormatters';
import GlobalGridStateTilesAndResources from './GridState/GlobalGridStateTilesAndResources';
import { checkAndDropWarehouseIngredient } from './Utils/WarehouseMaterials';
import { selectWeightedRandomItem, getDropQuantity } from './Economy/DropRates';
import playersInGridManager from './GridState/PlayersInGrid';
import { getDerivedRange } from './Utils/worldHelpers';
import { enrichResourceFromMaster, isACrop } from './Utils/ResourceHelpers';

// FTUE Cave dungeon grid ID (must match auth.js and Dungeon.js)
const FTUE_CAVE_GRID_ID = '695bd5b76545a9be8a36ee22';

 
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
  strings,
  bulkOperationContext,
  openPanel,
  masterTrophies = null,
  globalTuning = null,
  transitionFadeControl = null,
  timers = null
) {
  console.log(`Resource Clicked:  (${row}, ${col}):`, { resource, tileType: tileTypes[row]?.[col] });
  if (!resource || !resource.category) { console.error(`Invalid resource at (${col}, ${row}):`, resource); return; }
  
  // Check range before doing anything else (skip on own homestead)
  const isOnOwnHomestead = currentPlayer?.gridId === currentPlayer?.location?.g;
  const playerPos = playersInGridManager.getPlayerPosition(gridId, String(currentPlayer._id));
  const resourcePos = { x: col, y: row };

  if (!isOnOwnHomestead && playerPos && typeof playerPos.x === 'number' && typeof playerPos.y === 'number') {
    const distance = Math.sqrt(Math.pow(playerPos.x - resourcePos.x, 2) + Math.pow(playerPos.y - resourcePos.y, 2));
    const playerRange = getDerivedRange(currentPlayer, masterResources);

    if (distance > playerRange) {
      // Show "Out of range" message
      FloatingTextManager.addFloatingText(24, col, row, TILE_SIZE);
      console.log('Resource out of range');
      return;
    }

    // Wall blocking check removed - App.js handles this before calling handleResourceClick
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
    }

    switch (resource.category) {

      case 'doober':
      case 'special':
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
          masterSkills, // Pass tuning data
          strings,
          openPanel,
          globalTuning,
          masterTrophies
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
          updateStatus,
          strings
        );
        break;

      case 'seed':
        console.log('Seed clicked; do nothing');
        break;

      case 'deco':
        console.log('Deco clicked; placeholder for future functionality');
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
export async function handleDooberClick(
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
  masterSkills,
  strings = {},
  openPanel = null,
  globalTuning = null,
  masterTrophies = null
) {
  console.log('handleDooberClick: Current Player:', currentPlayer);
  console.log('handleDooberClick: Current backpack:', backpack);
  const gtype = currentPlayer.location.gtype;
  const baseQtyCollected = resource.qtycollected || 1;

  if (!Array.isArray(inventory) || !Array.isArray(backpack)) {
    console.warn("Inventory or backpack missing; aborting doober click.");
    return;
  }

  // Create a unique ID for this doober to prevent double-processing
  const dooberId = `${resource.type}-${col}-${row}`;
  
  // Check if we're already processing this doober (prevent double-clicks)
  if (window._processingDoobers && window._processingDoobers.has(dooberId)) {
    console.log("Already processing this doober, ignoring duplicate click");
    return;
  }
  
  // Mark this doober as being processed
  if (!window._processingDoobers) {
    window._processingDoobers = new Set();
  }
  window._processingDoobers.add(dooberId);

  // Check for Pickaxe/Better Pickaxe requirement on doobers (unique to mining doobers)
  const requiresPickaxe = resource.requires === 'Pickaxe' || resource.requires === 'Better Pickaxe';
  if (requiresPickaxe) {
    const hasRequiredPickaxe = currentPlayer?.skills?.some(
      (skill) => skill.type === resource.requires && skill.quantity > 0
    );
    if (!hasRequiredPickaxe) {
      addFloatingText(`${resource.requires} Required`, col, row, TILE_SIZE);
      // Show notification about missing pickaxe
      showNotification('FTUE', {
        title: strings[7049],
        message: strings[7058], // Pickaxe required message
        icon: '💪',
        username: currentPlayer?.username
      });
      // Clear processing flag
      if (window._processingDoobers) {
        window._processingDoobers.delete(dooberId);
      }
      return;
    }
  }

  console.log('MasterSkills:', masterSkills);
  // Extract player skills from inventory
  const playerBuffs = skills
    .filter((item) => {
      const resourceDetails = masterResources.find((res) => res.type === item.type);
      const isSkill = resourceDetails?.category === 'skill';
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
  
  // Check for missing backpack FIRST before any optimistic updates
  const isHomestead = currentPlayer?.location?.gtype === 'homestead';
  const isCurrencyItem = isCurrency(resource.type);
  const storingInBackpack = !isCurrencyItem && !isHomestead;
  
  if (storingInBackpack) {
    const hasBackpackSkill = currentPlayer?.skills?.some((item) => item.type === 'Backpack' && item.quantity > 0);
    if (!hasBackpackSkill) {
      // Missing backpack - show status message and floating text
      updateStatus(19); // Missing backpack message
      FloatingTextManager.addFloatingText(strings["44"] || "No backpack", col, row, TILE_SIZE);
      // Clear processing flag
      if (window._processingDoobers) {
        window._processingDoobers.delete(dooberId);
      }
      return;
    }
  }
  
  // Pre-check capacity before optimistic update
  const hasRoom = hasRoomFor({
    resource: resource.type,
    quantity: qtyCollected,
    currentPlayer,
    inventory,
    backpack,
    masterResources,
    globalTuning
  });
  
  if (!hasRoom) {
    // At this point we know they have a backpack if needed, so this is a real capacity issue
    console.warn("Pre-check: No room for resource. Showing error immediately.");
    FloatingTextManager.addFloatingText(strings["41"] || "Not enough room", col, row, TILE_SIZE);
    if (openPanel) {
      openPanel('InventoryPanel');
    }
    // Clear processing flag
    if (window._processingDoobers) {
      window._processingDoobers.delete(dooberId);
    }
    return;
  }
  
  // Check if this is a repeatable tree resource that should be instantly replaced
  let optimisticTreeFarmplot = null;
  if (resource.repeatable === true) {
    const farmplotResource = masterResources.find(
      (res) => res.category === 'farmplot' && res.output === resource.type
    );
    if (farmplotResource && farmplotResource.source === 'tree') {
      // Pre-calculate the farmplot for optimistic placement
      const growEndTime = Date.now() + (farmplotResource.growtime || 0) * 1000;
      optimisticTreeFarmplot = enrichResourceFromMaster(
        {
          type: farmplotResource.type,
          x: col,
          y: row,
          growEnd: growEndTime,
        },
        masterResources
      );
      console.log(`🌳 Optimistic tree replacement: ${resource.type} -> ${farmplotResource.type}`);
    }
  }

  // Optimistically update resources - remove doober and add tree farmplot if applicable
  setResources((prevResources) => {
    const filtered = prevResources.filter((res) => !(res.x === col && res.y === row));
    if (optimisticTreeFarmplot) {
      return [...filtered, optimisticTreeFarmplot];
    }
    return filtered;
  });

  // Show VFX and floating text immediately for responsiveness
  createCollectEffect(col, row, TILE_SIZE);
  FloatingTextManager.addFloatingText(`+${qtyCollected} ${resource.symbol} ${getLocalizedString(resource.type, strings)}`, col, row, TILE_SIZE);

  // Play collection SFX based on resource type
  if (requiresPickaxe) {
    soundManager.playSFX('stoneCut');
  } else if (isCurrencyItem) {
    soundManager.playSFX('collect_money');
  } else if (isACrop(resource.type, masterResources)) {
    soundManager.playSFX('collect_crop');
  } else {
    soundManager.playSFX('collect_item');
  }

  // Perform server validation
  try {
    // Use gainIngredients to handle inventory/backpack update, sync, and capacity check
    console.log("Calling gainIngredients with: ",resource.type);
    
    const gainResult = await gainIngredients({
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
      globalTuning,
    });

    // Handle the result based on error type
    if (gainResult === true) {
      // Success - continue with normal flow
    } else if (gainResult && gainResult.success === false) {
      // Check if we should rollback based on error type
      if (gainResult.isCapacityError) {
        // Real conflict - rollback the doober (and remove optimistic tree farmplot if any)
        console.warn("❌ Capacity limit reached. Rolling back doober.");
        setResources((prevResources) => {
          // Remove any optimistically placed tree farmplot at this position
          const filtered = optimisticTreeFarmplot
            ? prevResources.filter((res) => !(res.x === col && res.y === row && res.type === optimisticTreeFarmplot.type))
            : prevResources;
          return [...filtered, resource];
        });
        
        // Check if the error is specifically about missing backpack
        if (gainResult.isMissingBackpack) {
          // Don't show floating text - status message (19) already set by gainIngredients
          // Don't open inventory panel for missing backpack
        } else {
          // Show floating text for actual capacity error
          FloatingTextManager.addFloatingText(strings["41"] || "Not enough room", col, row, TILE_SIZE);
          // Auto-open inventory panel when truly at capacity
          console.log("Opening inventory panel. openPanel function:", openPanel);
          if (openPanel) {
            openPanel('InventoryPanel');
          } else {
            console.warn("openPanel function not available!");
          }
        }
        // Clear processing flag
        if (window._processingDoobers) {
          window._processingDoobers.delete(dooberId);
        }
        return;
      } else if (gainResult.isNetworkError) {
        // Network/server error - don't rollback, the server might have queued it
        console.warn("⚠️ Network error during collection, but server may have queued the operation. Not rolling back.");
        // Still show success effects since server likely processed it
      } else {
        // Other client-side errors - rollback (and remove optimistic tree farmplot if any)
        console.warn("❌ Client error during collection. Rolling back.");
        setResources((prevResources) => {
          const filtered = optimisticTreeFarmplot
            ? prevResources.filter((res) => !(res.x === col && res.y === row && res.type === optimisticTreeFarmplot.type))
            : prevResources;
          return [...filtered, resource];
        });
        // Clear processing flag
        if (window._processingDoobers) {
          window._processingDoobers.delete(dooberId);
        }
        return;
      }
    }
    
    // Calculate skill info for formatting
    const skillInfo = calculateSkillMultiplier(resource.type, skills || [], masterSkills);
    
    // Format and show status message using shared formatter
    const statusMessage = formatSingleCollection('harvest', resource.type, qtyCollected, 
      skillInfo.hasSkills ? skillInfo : null, strings, getLocalizedString);
    updateStatus(statusMessage);

    const gridUpdateResponse = await updateGridResource(
      gridId,
      { type: null, x: col, y: row }, // Collecting doober removes it
      true
    );
    if (!gridUpdateResponse?.success) {
      console.warn('⚠️ Grid update failed even though inventory succeeded.');
      return;
    }

    // Track quest progress for "Collect" actions
    // trackQuestProgress expects: (player, action, item, quantity, setCurrentPlayer)
    await trackQuestProgress(currentPlayer, 'Collect', resource.type, qtyCollected, setCurrentPlayer);

    // Check for warehouse ingredient drops when collecting crops
    await checkAndDropWarehouseIngredient(
      resource.type,
      col,
      row,
      TILE_SIZE,
      {
        currentPlayer,
        inventory,
        backpack,
        setInventory,
        setBackpack,
        setCurrentPlayer,
        updateStatus,
        masterResources,
        globalTuning,
        strings,
        FloatingTextManager,
        gainIngredients,
        trackQuestProgress,
        getLocalizedString,
        selectWeightedRandomItem,
      }
    );

    // Award trophies for specific collected items
    if (masterTrophies && currentPlayer?.playerId) {
      try {
        if (resource.type === "King's Crown") {
          console.log(`🏆 Awarding King's Crown trophy for collecting ${qtyCollected} crown(s)`);
          
          // Award the Count-type trophy for each crown collected
          for (let i = 0; i < qtyCollected; i++) {
            await earnTrophy(currentPlayer.playerId, "King's Crown", 1, currentPlayer, masterTrophies, setCurrentPlayer);
          }
          
          console.log(`✅ Successfully awarded ${qtyCollected} King's Crown trophy instance(s)`);
        } else if (resource.type === "Trident") {
          console.log(`🏆 Awarding Trident trophy for collecting ${qtyCollected} trident(s)`);
          
          // Award the Count-type trophy for each trident collected
          for (let i = 0; i < qtyCollected; i++) {
            await earnTrophy(currentPlayer.playerId, "Trident", 1, currentPlayer, masterTrophies, setCurrentPlayer);
          }
          
          console.log(`✅ Successfully awarded ${qtyCollected} Trident trophy instance(s)`);
        }
      } catch (error) {
        console.error('❌ Error awarding collection trophy:', error);
        // Don't fail the collection if trophy awarding fails
      }
    }

    // Update currentPlayer state locally
    await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);
    console.log('[DEBUG] Player state refreshed after inventory update.');

    // Handle replanting if resource is repeatable
    if (resource.repeatable === true) {
      await handleReplant(
        resource,
        row,
        col,
        setResources,
        gridId,
        masterResources,
        TILE_SIZE
      );
    }
  } catch (error) {
    console.error('Error during doober collection:', error);
    // Rollback local resource state on server failure (and remove optimistic tree farmplot if any)
    setResources((prevResources) => {
      const filtered = optimisticTreeFarmplot
        ? prevResources.filter((res) => !(res.x === col && res.y === row && res.type === optimisticTreeFarmplot.type))
        : prevResources;
      return [...filtered, resource];
    });
  } finally {
    unlockResource(col, row); // Always unlock the resource
    // Clear the processing flag for this doober
    if (window._processingDoobers) {
      window._processingDoobers.delete(dooberId);
    }
  }
}

// HANDLE REPLANT - Called when a repeatable doober is collected
// Finds the farmplot that outputs this resource and plants it in the same location
// Mirrors handleFarmPlotPlacement logic from Farming.js
async function handleReplant(
  collectedResource,
  row,
  col,
  setResources,
  gridId,
  masterResources,
  TILE_SIZE
) {
  console.log(`🌱 handleReplant: Looking for farmplot that outputs ${collectedResource.type}`);

  // Find the farmplot resource that outputs this collected resource
  const farmplotResource = masterResources.find(
    (res) => res.category === 'farmplot' && res.output === collectedResource.type
  );

  if (!farmplotResource) {
    console.warn(`⚠️ handleReplant: No farmplot found that outputs ${collectedResource.type}`);
    return;
  }

  console.log(`🌱 handleReplant: Found farmplot ${farmplotResource.type}, planting at (${col}, ${row})`);

  // Calculate growEnd based on farmplot's growtime (growtime is in seconds, convert to ms)
  // This matches Farming.js line 67: Date.now() + (selectedItem.growtime || 0) * 1000
  const growEndTime = Date.now() + (farmplotResource.growtime || 0) * 1000;
  console.log(`⏱️ handleReplant: growtime = ${farmplotResource.growtime}, growEndTime = ${growEndTime}, secondsFromNow = ${(growEndTime - Date.now()) / 1000}`);

  // Use enrichResourceFromMaster like Farming.js does for proper enrichment
  const enrichedNewResource = enrichResourceFromMaster(
    {
      type: farmplotResource.type,
      x: col,
      y: row,
      growEnd: growEndTime,
    },
    masterResources
  );

  console.log('🌱 handleReplant: Enriched farmplot resource:', enrichedNewResource);

  // For trees, local state was already updated optimistically in handleDooberClick
  // For non-trees, update local state now
  const isTree = farmplotResource.source === 'tree';

  // Start grow animation BEFORE updating state so canvas skips rendering this resource
  // This prevents the resource from appearing before the animation plays
  if (!isTree && enrichedNewResource.symbol && TILE_SIZE) {
    createPlantGrowEffect(col, row, TILE_SIZE, enrichedNewResource.symbol, null, enrichedNewResource.filename);
  }

  if (!isTree) {
    const currentResources = GlobalGridStateTilesAndResources.getResources();
    const finalResources = [...currentResources, enrichedNewResource];
    GlobalGridStateTilesAndResources.setResources(finalResources);
    setResources(finalResources);
  } else {
    // For trees, just sync with GlobalGridState (React state already updated)
    const currentResources = GlobalGridStateTilesAndResources.getResources();
    // Check if it's not already there before adding
    const alreadyExists = currentResources.some(res => res.x === col && res.y === row && res.type === farmplotResource.type);
    if (!alreadyExists) {
      GlobalGridStateTilesAndResources.setResources([...currentResources, enrichedNewResource]);
    }
  }

  // Perform server update to add the farmplot
  try {
    const gridUpdateResponse = await updateGridResource(
      gridId,
      {
        type: farmplotResource.type,
        x: col,
        y: row,
        growEnd: growEndTime
      },
      true
    );

    if (gridUpdateResponse?.success) {
      console.log(`✅ handleReplant: Successfully planted ${farmplotResource.type} at (${col}, ${row})`);
      // Grow animation already started before state update (see above)

      // Add to FarmState so the timer tracks this farmplot for conversion
      const farmState = (await import('./FarmState')).default;
      farmState.addSeed({
        type: farmplotResource.type,
        x: col,
        y: row,
        growEnd: growEndTime,
        output: farmplotResource.output, // Required for crop conversion
      });
      console.log(`🌱 handleReplant: Added ${farmplotResource.type} to FarmState for timer tracking`);
    } else {
      throw new Error('Server failed to confirm the replant.');
    }
  } catch (error) {
    console.error('❌ handleReplant: Error during replanting:', error);
    // Rollback local state on failure
    const rolledBackResources = GlobalGridStateTilesAndResources.getResources().filter(
      (res) => !(res.x === col && res.y === row && res.type === farmplotResource.type)
    );
    GlobalGridStateTilesAndResources.setResources(rolledBackResources);
    setResources(rolledBackResources);
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
  updateStatus,
  strings
) {
  if (resource.action !== 'convertTo') return;

  // Get target resource first
  const targetResource = masterResources.find((res) => res.type === resource.output);
  if (!targetResource) { console.warn(`⚠️ No matching resource found for output: ${resource.output}`); return; }

  // Get required skill
  const requirement = resource.requires;
  const isSkill = masterResources.some(
    res => res.type === requirement && res.category === "skill"
  );

  // Required Skill Missing
  if (isSkill) {
    const hasSkill = currentPlayer.skills?.some(skill => skill.type === requirement);
    if (!hasSkill) {
      addFloatingText(`${requirement} Required`, col, row, TILE_SIZE);
      // Show notification about missing skill (different message for Axe vs Pickaxe)
      // Skip notification in starter dungeon - player is expected to not have Axe yet
      const isInStarterDungeon = gridId === FTUE_CAVE_GRID_ID;
      const messageKey = requirement === 'Axe' ? 7057 : requirement === 'Pickaxe' ? 7058 : null;
      if (messageKey && !isInStarterDungeon) {
        showNotification('FTUE', {
          title: strings[7049],
          message: strings[messageKey],
          icon: '💪',
          username: currentPlayer?.username
        });
      }
      return;
    }
  }

    createSourceConversionEffect(col, row, TILE_SIZE, requirement);

    // Play SFX based on tool used
    if (requirement === 'Axe') {
      soundManager.playSFX('treeCut');
    } else if (requirement === 'Pickaxe') {
      soundManager.playSFX('stoneCut');
    }

  // Check if the object should disappear (output is null/empty) or transform
  const shouldDisappear = !resource.output || resource.output === 'null' || !targetResource;
  
  if (shouldDisappear) {
    // Find the original resource to check for shadows - use global state like ProtectedSelling does
    const originalResource = GlobalGridStateTilesAndResources.getResources().find(
      r => r.x === col && r.y === row
    );

    // Update local state to reflect removal of resource and shadows
    const filteredResources = GlobalGridStateTilesAndResources.getResources().filter(
      (res) => {
        // Remove the main resource
        if (res.x === col && res.y === row) return false;
        
        // Remove any shadows belonging to this resource if it was multi-tile
        if (originalResource && originalResource.size && originalResource.size > 1 && res.type === 'shadow') {
          const anchorKey = originalResource.anchorKey || `${originalResource.type}-${originalResource.x}-${originalResource.y}`;
          if (res.parentAnchorKey === anchorKey) {
            return false;
          }
        }
        return true;
      }
    );

    // Update both global and local state with the same filtered array - exactly like ProtectedSelling does
    GlobalGridStateTilesAndResources.setResources(filteredResources);
    setResources(filteredResources);

    // Perform server update to remove the main resource
    try {
      const gridUpdateResponse = await updateGridResource(
        gridId,
        { type: null, x: col, y: row },
        true
      );
      if (gridUpdateResponse?.success) {
        // VFX
        // createSourceConversionEffect(col, row, TILE_SIZE, requirement);
        console.log('✅ Resource removal completed successfully on the server.');
      } else {
        throw new Error('Server failed to confirm the resource removal.');
      }
    } catch (error) {
      console.error('❌ Error during resource removal:', error);
      console.warn('Server update failed. The client may become out of sync.');
    }
  } else {
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

    // Find the original resource to check for shadows - use global state like ProtectedSelling does
    const originalResource = GlobalGridStateTilesAndResources.getResources().find(
      r => r.x === col && r.y === row
    );

    // Filter out the main resource AND any shadows, then add the new resource
    const filteredResources = GlobalGridStateTilesAndResources.getResources().filter(
      (res) => {
        // Remove the main resource
        if (res.x === col && res.y === row) return false;

        // Remove any shadows belonging to this resource if it was multi-tile
        if (originalResource && originalResource.size && originalResource.size > 1 && res.type === 'shadow') {
          const anchorKey = originalResource.anchorKey || `${originalResource.type}-${originalResource.x}-${originalResource.y}`;
          if (res.parentAnchorKey === anchorKey) {
            return false;
          }
        }
        return true;
      }
    );
    
    // Add the new resource to the filtered list
    const finalResources = [...filteredResources, enrichedNewResource];
    
    // Update both global and local state with the same filtered array - exactly like ProtectedSelling does
    GlobalGridStateTilesAndResources.setResources(finalResources);
    setResources(finalResources);

    // Perform server update
    try {
      const gridUpdateResponse = await updateGridResource(
        gridId, 
        { type: targetResource.type, x: col, y: row }, 
        true
      );
      if (gridUpdateResponse?.success) {
        // VFX
        //createSourceConversionEffect(col, row, TILE_SIZE, requirement);
        console.log('✅ Source conversion completed successfully on the server.');
      } else {
        throw new Error('Server failed to confirm the source conversion.');
      }
    } catch (error) {
      console.error('❌ Error during source conversion:', error);
      console.warn('Server update failed. The client may become out of sync.');
    }
  }
  
  // Shared cleanup regardless of disappear/transform
  try {
    await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);
    unlockResource(col, row);
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  }
}