import API_BASE from '../../config';
import axios from 'axios';
import { addResourceToGrid } from '../../Utils/worldHelpers';
import { validateTileType, enrichResourceFromMaster, growsInRegion, cropCapReached } from '../../Utils/ResourceHelpers';
import { getLocalizedString } from '../../Utils/stringLookup';
import { applyPlayerDelta, postAction } from '../../Utils/playerDelta';
import FloatingTextManager from '../../UI/FloatingText';
import farmState from '../../FarmState';
import { getCurrentTileCoordinates } from '../../Utils/ResourceHelpers';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import { tryAdvanceFTUEByTrigger } from '../FTUE/FTUEutils';
import { createCollectEffect, createPlantGrowEffect } from '../../VFX/VFX';
import { boardArtScale } from '../../Render/PixiRenderer/boardArt';
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

    // A region-locked crop (resources.json growregion) is planted only on a grid of its region
    const gridRegion = GlobalGridStateTilesAndResources.getGridMeta()?.region ?? currentPlayer?.location?.region ?? null;
    if (!growsInRegion(selectedItem, gridRegion)) {
      const onlyIn = String(strings[17022] || 'Only grows in {region}').replace('{region}', getLocalizedString(selectedItem.growregion, strings));
      FloatingTextManager.addFloatingText(onlyIn, tileX, tileY, TILE_SIZE);
      window._processingPlants.delete(plantId);
      return false;
    }

    // The per-crop cap (resources.json maxpergrid): its plots + ripe crops on this grid
    if (cropCapReached(selectedItem, GlobalGridStateTilesAndResources.getResources() || resources)) {
      FloatingTextManager.addFloatingText(strings[17023] || 'Maximum reached of this crop type', tileX, tileY, TILE_SIZE);
      window._processingPlants.delete(plantId);
      return false;
    }

    // ===== OPTIMISTIC UI: Show feedback immediately =====
    // A tree from the catalog comes fully grown: it lands like deco (BuildAndBuy.js), with no
    // grow-in from a seedling the way a crop plot has. So does a plot flagged noGrow in
    // resources.json (the Grape Vine: the vine simply stands there, then bears)
    const isTree = selectedItem.source === 'tree';
    const landsGrown = isTree || !!selectedItem.noGrow;

    // 1. Play sound immediately
    soundManager.playSFX(landsGrown ? 'place' : 'plant');

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
    if (enrichedNewResource.symbol && !landsGrown) {
      createPlantGrowEffect(tileX, tileY, TILE_SIZE, enrichedNewResource.symbol, null, enrichedNewResource.filename, boardArtScale(enrichedNewResource));
    }

    // 5. Show VFX and floating text immediately
    createCollectEffect(tileX, tileY, TILE_SIZE);
    FloatingTextManager.addFloatingText(isTree ? 300 : 302, tileX, tileY, TILE_SIZE); // "Added" / "Planted!"

    // 6. Save original inventory state for potential rollback
    // The plot appears on the tap; ONE request (game-server routes/actionRoutes.js /action/plant)
    // checks the tile and the skill, spends the seeds, starts the clock and advances Plant quests.
    const existingResources = GlobalGridStateTilesAndResources.getResources() || [];
    GlobalGridStateTilesAndResources.setResources([...existingResources, enrichedNewResource]);
    setResources([...existingResources, enrichedNewResource]);
    const answer = await postAction('/api/action/plant', { playerId: currentPlayer.playerId, gridId, x: tileX, y: tileY, type: selectedItem.type });
    applyPlayerDelta(answer.data, { setCurrentPlayer, setInventory, setBackpack });
    if (!answer.ok && answer.status !== 0) {
      const rolledBack = (GlobalGridStateTilesAndResources.getResources() || []).filter(
        (res) => !(res.x === tileX && res.y === tileY && res.type === selectedItem.type)
      );
      GlobalGridStateTilesAndResources.setResources(rolledBack);
      setResources(rolledBack);
      FloatingTextManager.addFloatingText(String(answer.reason || '').startsWith('short-') ? 305 : 304, tileX, tileY, TILE_SIZE);
      window._processingPlants.delete(plantId);
      return false;
    }
    const growEnd = answer.data?.planted?.growEnd || growEndTime;
    farmState.addSeed({ type: selectedItem.type, x: tileX, y: tileY, growEnd, output: selectedItem.output });
    await tryAdvanceFTUEByTrigger('PlantedFirstCrop', currentPlayer.playerId, currentPlayer, setCurrentPlayer);
    window._processingPlants.delete(plantId);
    return true;
  } catch (error) {
    console.error('❌ Error in handleFarmPlotPlacement:', error);
    window._processingPlants.delete(plantId);
    return false;
  }
};



export const handleTerraform = async ({ TILE_SIZE, actionType, tileType, gridId, currentPlayer, tileTypes, setTileTypes, overridePosition, isDeveloper }) => {
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

  // ===== DOUBLE-CLICK PROTECTION =====
  const terraformId = `terraform-${tileX}-${tileY}-${gridId}`;
  if (window._processingTerraforms && window._processingTerraforms.has(terraformId)) {
    console.log("Already processing terraforming at this location, ignoring duplicate");
    return false;
  }
  if (!window._processingTerraforms) {
    window._processingTerraforms = new Set();
  }
  window._processingTerraforms.add(terraformId);

  // ===== VALIDATION =====
  // Read from GlobalGridStateTilesAndResources for consistent state (not stale React props)
  const tiles = GlobalGridStateTilesAndResources.getTiles();
  const originalTileType = tiles?.[tileY]?.[tileX];

  if (!originalTileType) {
    console.error("❌ handleTerraform: Could not find tile at given coordinates.");
    window._processingTerraforms.delete(terraformId);
    return false;
  }
  if (originalTileType === 'l' && !isDeveloper) {
    FloatingTextManager.addFloatingText(320, tileX, tileY, TILE_SIZE);
    window._processingTerraforms.delete(terraformId);
    return false;
  }
  if (originalTileType === 'w' && !isDeveloper) {
    FloatingTextManager.addFloatingText(320, tileX, tileY, TILE_SIZE);
    window._processingTerraforms.delete(terraformId);
    return false;
  }

  // Determine the new tile type
  let newType;
  if (tileType) {
    newType = tileType;
  } else {
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
      case "stepstones":
        newType = "k";
        break;
      case "water":
        newType = "w";
        break;
      default:
        console.error(`❌ handleTerraform: Unknown actionType "${actionType}"`);
        window._processingTerraforms.delete(terraformId);
        return false;
    }
  }

  console.log(`🌱 handleTerraform: Changing tile at (${tileX}, ${tileY}) from "${originalTileType}" to "${newType}"`);

  // ===== OPTIMISTIC UI: Show feedback immediately =====
  // 1. Play sound immediately
  soundManager.playSFX('terraform');

  // 2. Show VFX immediately
  createCollectEffect(tileX, tileY, TILE_SIZE);

  // 3. Update GlobalGridStateTilesAndResources immediately for visual feedback
  if (tiles?.[tileY]) {
    const updatedRow = [...tiles[tileY]];
    updatedRow[tileX] = newType;
    const updatedTiles = [...tiles];
    updatedTiles[tileY] = updatedRow;
    GlobalGridStateTilesAndResources.setTiles(updatedTiles);
  }

  // ===== SERVER UPDATE =====
  // Call convertTileType for server update and React state sync
  // Pass setTileTypes so it updates React state after server confirms
  // ONE validated request (game-server routes/actionRoutes.js /action/terraform): the tile row's
  // skill and level locks are checked on the server; a refusal puts the old ground back
  const answer = await postAction('/api/action/terraform', { playerId: currentPlayer.playerId, gridId, x: tileX, y: tileY, tileType: newType });
  if (!answer.ok && answer.status !== 0) {
    const now = GlobalGridStateTilesAndResources.getTiles();
    if (now?.[tileY]) {
      const row = [...now[tileY]]; row[tileX] = originalTileType;
      const restored = [...now]; restored[tileY] = row;
      GlobalGridStateTilesAndResources.setTiles(restored);
      if (typeof setTileTypes === 'function') setTileTypes(restored);
    }
    FloatingTextManager.addFloatingText(320, tileX, tileY, TILE_SIZE);
  } else if (typeof setTileTypes === 'function') {
    setTileTypes(GlobalGridStateTilesAndResources.getTiles());
  }

  console.log(`✅ Terraform completed: (${tileX}, ${tileY}) → "${newType}"`);
  window._processingTerraforms.delete(terraformId);
  return true;
};
