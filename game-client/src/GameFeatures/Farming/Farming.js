import API_BASE from '../../config';
import axios from 'axios';
import { addResourceToGrid } from '../../Utils/worldHelpers';
import { convertTileType, updateGridResource } from '../../Utils/GridManagement';
import { validateTileType, enrichResourceFromMaster } from '../../Utils/ResourceHelpers';
import { refreshPlayerAfterInventoryUpdate, spendIngredients } from '../../Utils/InventoryManagement';
import FloatingTextManager from '../../UI/FloatingText';
import farmState from '../../FarmState';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import { getCurrentTileCoordinates } from '../../Utils/ResourceHelpers';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import { tryAdvanceFTUEByTrigger } from '../FTUE/FTUEutils';
import { createCollectEffect, createPlantGrowEffect } from '../../VFX/VFX';
import soundManager from '../../Sound/SoundManager';

/**
 * Determines the appropriate error string for an invalid planting attempt.
 * Checks all validon[x] fields to find which tile types ARE valid.
 * - If exactly 1 tile type is valid, returns the specific error string for that tile.
 * - If multiple or zero valid tile types, returns the default "Can't plant here" (304).
 *
 * Tile type to string mapping:
 * - d (dirt) → 303 "Must plant on dirt"
 * - z (moss) → 307 "Must plant on moss"
 * - n (sand) → 308 "Must plant on sand"
 * - fallback → 304 "Can't plant here"
 */
const getPlantingErrorString = (farmplotItem) => {
  // Map of tile type codes to their specific error strings
  const tileTypeToString = {
    'd': 303, // dirt
    'z': 307, // moss
    'n': 308, // sand
  };

  // All possible validon fields to check
  const validonFields = ['g', 'd', 's', 'p', 'w', 'l', 'n', 'o', 'x', 'y', 'z'];

  // Find all tile types that are valid for this farmplot
  const validTileTypes = validonFields.filter(tileCode => {
    const fieldName = `validon${tileCode}`;
    return farmplotItem[fieldName] === true;
  });

  // If exactly one valid tile type and we have a specific string for it
  if (validTileTypes.length === 1 && tileTypeToString[validTileTypes[0]]) {
    return tileTypeToString[validTileTypes[0]];
  }

  // Otherwise return default "Can't plant here"
  return 304;
};

export const handleFarmPlotPlacement = async ({
  selectedItem,
  TILE_SIZE,
  resources,
  setResources,
  currentPlayer,
  setCurrentPlayer,
  inventory,
  setInventory,
  backpack,
  setBackpack,
  gridId,
  masterResources,
  masterSkills,
  updateStatus,
  overridePosition, // Optional: { x, y } to plant at a specific tile instead of player position
  strings = {},
}) => {
  let tileX, tileY;
  if (overridePosition) {
    tileX = overridePosition.x;
    tileY = overridePosition.y;
  } else {
    const coords = getCurrentTileCoordinates(gridId, currentPlayer);
    if (!coords) return false;
    tileX = coords.tileX;
    tileY = coords.tileY;
  }

  // ===== DOUBLE-CLICK PROTECTION =====
  const plantId = `plant-${tileX}-${tileY}-${gridId}`;
  if (window._processingPlants && window._processingPlants.has(plantId)) {
    console.log("Already processing planting at this location, ignoring duplicate");
    return false;
  }
  if (!window._processingPlants) {
    window._processingPlants = new Set();
  }
  window._processingPlants.add(plantId);

  try {
    // ===== VALIDATION (before any state changes) =====
    const tileOccupied = resources.find((res) => res.x === tileX && res.y === tileY);
    if (tileOccupied) {
      FloatingTextManager.addFloatingText(304, tileX, tileY, TILE_SIZE); // "Occupied"
      window._processingPlants.delete(plantId);
      return false;
    }

    const tiles = GlobalGridStateTilesAndResources.getTiles();
    const tileType = tiles?.[tileY]?.[tileX];
    const validonField = `validon${tileType}`;
    const isValidTile = selectedItem[validonField] === true;

    if (!tileType || !isValidTile) {
      const errorStringId = getPlantingErrorString(selectedItem);
      FloatingTextManager.addFloatingText(errorStringId, tileX, tileY, TILE_SIZE);
      window._processingPlants.delete(plantId);
      return false;
    }

    // ===== OPTIMISTIC UI: Show feedback immediately =====
    // 1. Play sound immediately
    soundManager.playSFX('plant');

    // 2. Timer setup
    const growEndTime = Date.now() + (selectedItem.growtime || 0) * 1000;
    console.log(`⏱️ Planting ${selectedItem.type}: growtime = ${selectedItem.growtime}, growEndTime = ${growEndTime}`);

    // 3. Prepare enriched resource for optimistic placement
    const enrichedNewResource = enrichResourceFromMaster(
      {
        type: selectedItem.type,
        x: tileX,
        y: tileY,
        growEnd: growEndTime,
      },
      masterResources
    );
    console.log("🌾 Enriched resource for optimistic placement:", enrichedNewResource);

    // 4. Start grow animation BEFORE updating state so PixiRenderer skips rendering
    if (enrichedNewResource.symbol) {
      createPlantGrowEffect(tileX, tileY, TILE_SIZE, enrichedNewResource.symbol, null, enrichedNewResource.filename);
    }

    // 5. Show VFX and floating text immediately
    createCollectEffect(tileX, tileY, TILE_SIZE);
    FloatingTextManager.addFloatingText(302, tileX, tileY, TILE_SIZE); // "Planted!"

    // 6. Save original inventory state for potential rollback
    const originalInventory = inventory ? [...inventory] : [];
    const originalBackpack = backpack ? [...backpack] : [];

    // 7. Optimistically spend ingredients (this updates inventory state)
    const didSpend = await spendIngredients({
      playerId: currentPlayer.playerId,
      recipe: selectedItem,
      inventory,
      backpack,
      setInventory,
      setBackpack,
      setCurrentPlayer,
      updateStatus,
    });
    if (!didSpend) {
      FloatingTextManager.addFloatingText(305, tileX, tileY, TILE_SIZE); // "Missing ingredients"
      window._processingPlants.delete(plantId);
      return false;
    }

    // 8. Optimistically update local resources (add the new plant)
    const existingResources = GlobalGridStateTilesAndResources.getResources() || [];
    GlobalGridStateTilesAndResources.setResources([...existingResources, enrichedNewResource]);
    setResources([...existingResources, enrichedNewResource]);

    // ===== SERVER VALIDATION =====
    try {
      const gridUpdateResponse = await updateGridResource(
        gridId,
        {
          type: selectedItem.type,
          x: tileX,
          y: tileY,
          growEnd: growEndTime,
        },
        true
      );

      if (gridUpdateResponse?.success) {
        // Server confirmed - add to farmState for timer tracking
        farmState.addSeed({
          type: selectedItem.type,
          x: tileX,
          y: tileY,
          growEnd: growEndTime,
          output: selectedItem.output,
        });

        // Track quest progress
        const cropName = selectedItem.output || selectedItem.type;
        await trackQuestProgress(currentPlayer, 'Plant', cropName, 1, setCurrentPlayer);

        // Try to advance FTUE if this is the player's first crop planted
        await tryAdvanceFTUEByTrigger('PlantedFirstCrop', currentPlayer.playerId, currentPlayer, setCurrentPlayer);

        console.log(`✅ Planting confirmed by server: ${selectedItem.type} at (${tileX}, ${tileY})`);
        window._processingPlants.delete(plantId);
        return true;
      } else {
        throw new Error('Server rejected planting');
      }
    } catch (serverError) {
      // ===== ROLLBACK: Server failed, undo optimistic changes =====
      console.error('❌ Server rejected planting, rolling back:', serverError);

      // Rollback resources - remove the optimistically placed plant
      const currentResources = GlobalGridStateTilesAndResources.getResources() || [];
      const rolledBackResources = currentResources.filter(
        (res) => !(res.x === tileX && res.y === tileY && res.type === selectedItem.type)
      );
      GlobalGridStateTilesAndResources.setResources(rolledBackResources);
      setResources(rolledBackResources);

      // Rollback inventory - restore original state
      setInventory(originalInventory);
      setBackpack(originalBackpack);
      setCurrentPlayer(prev => ({
        ...prev,
        inventory: originalInventory,
        backpack: originalBackpack
      }));

      // Show error feedback
      FloatingTextManager.addFloatingText(304, tileX, tileY, TILE_SIZE); // "Can't plant here"

      window._processingPlants.delete(plantId);
      return false;
    }
  } catch (error) {
    console.error('❌ Error in handleFarmPlotPlacement:', error);
    window._processingPlants.delete(plantId);
    return false;
  }
};



export const handleTerraform = async ({ TILE_SIZE, actionType, tileType, gridId, currentPlayer, tileTypes, setTileTypes, overridePosition, isDeveloper }) => {

  console.log("handleTerraform;  currentPlayer = ",currentPlayer);

  if (!currentPlayer?.location) {
    console.error("❌ handleTerraform: Missing currentPlayer location.");
    return false;
  }

  // Use override position if provided (cursor mode), otherwise use player position
  let tileX, tileY;
  if (overridePosition) {
    tileX = overridePosition.x;
    tileY = overridePosition.y;
  } else {
    const coords = getCurrentTileCoordinates(gridId, currentPlayer);
    if (!coords) return false;
    tileX = coords.tileX;
    tileY = coords.tileY;
  }

  const tile = tileTypes?.[tileY]?.[tileX];
  console.log("tile at ",tileY,", ",tileX," = ",tile);

  if (!tile) {
    console.error("❌ handleTerraform: Could not find tile at given coordinates.");
    return false;
  }
  if (tile === 'l' && !isDeveloper) {
      FloatingTextManager.addFloatingText(320, tileX, tileY, TILE_SIZE);
    return false;
  }
  if (tile === 'w' && !isDeveloper) {
      FloatingTextManager.addFloatingText(320, tileX, tileY, TILE_SIZE); // Same message as lava for now
    return false;
  }

  let newType;

  // If tileType is directly provided, use it (new dynamic approach)
  if (tileType) {
    newType = tileType;
  } else {
    // Legacy: Determine the new tile type based on the action (for backwards compatibility)
    switch (actionType) {
      case "till":
        newType = "d";
        break;
      case "plantGrass":
        newType = "g";
        break;
      case "pave":
        newType = "p";
        break;
      case "stone":
        newType = "s";
        break;
      case "cobblestone":
        newType = "x";
        break;
      case "water":
        newType = "w";
        break;
      default:
        console.error(`❌ handleTerraform: Unknown actionType "${actionType}"`);
        return false;
    }
  }

  console.log(`🌱 handleTerraform: Changing tile at (${tileX}, ${tileY}) to "${newType}"`);

  // Call convertTileType to update the tile in the database and emit the change
  await convertTileType(gridId, tileX, tileY, newType, setTileTypes);

  // Show VFX for terraforming
  createCollectEffect(tileX, tileY, TILE_SIZE);
  soundManager.playSFX('terraform');
  return true; // Success
};
