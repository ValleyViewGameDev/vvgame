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
}) => {
  try {
    console.log(masterResources);

    let tileX, tileY;
    if (overridePosition) {
      // Use the override position (from cursor mode click)
      tileX = overridePosition.x;
      tileY = overridePosition.y;
    } else {
      // Use player's current position
      const coords = getCurrentTileCoordinates(gridId, currentPlayer);
      if (!coords) return false;
      tileX = coords.tileX;
      tileY = coords.tileY;
    }

    // Use local tile data instead of async server call for instant response
    const tiles = GlobalGridStateTilesAndResources.getTiles();
    const tileType = tiles?.[tileY]?.[tileX];
    if (!tileType || tileType !== 'd') {
      FloatingTextManager.addFloatingText(303, tileX, tileY, TILE_SIZE); // "Must be dirt"
      return false;
    }

    const tileOccupied = resources.find((res) => res.x === tileX && res.y === tileY);
    if (tileOccupied) {
      FloatingTextManager.addFloatingText(304, tileX, tileY, TILE_SIZE); // "Occupied"
      return false;
    }

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
      return false;
    }

    // Timer setup
    const growEndTime = Date.now() + (selectedItem.growtime || 0) * 1000;
    console.log(`⏱️ Planting ${selectedItem.type}: growtime = ${selectedItem.growtime}, growEndTime = ${growEndTime}, secondsFromNow = ${(growEndTime - Date.now()) / 1000}`);

    // Lookup from masterResources for enrichment
    console.log("🌱 Attempting to plant:", selectedItem.type, "at", tileX, tileY);
    const enrichedNewResource = enrichResourceFromMaster(
      {
        type: selectedItem.type,
        x: tileX,
        y: tileY,
        growEnd: growEndTime,
      },
      masterResources
    );
    console.log("🌾 Enriched resource before setResources:", enrichedNewResource);

    // Optimistically update local client state
    const existing = GlobalGridStateTilesAndResources.getResources() || [];
    GlobalGridStateTilesAndResources.setResources([...existing, enrichedNewResource]);
    console.log("🧪 Global resources after planting:", GlobalGridStateTilesAndResources.getResources());
    setResources([...existing, enrichedNewResource]);

    // Update server and all clients
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
      farmState.addSeed({
        type: selectedItem.type,
        x: tileX,
        y: tileY,
        growEnd: growEndTime,
        output: selectedItem.output, // ✅ required for crop conversion
      });

      FloatingTextManager.addFloatingText(302, tileX, tileY, TILE_SIZE); // "Planted!"

      // Track quest progress for "Plant" actions
      // Use the output (crop) name instead of the plot name for quest tracking
      const cropName = selectedItem.output || selectedItem.type;
      await trackQuestProgress(currentPlayer, 'Plant', cropName, 1, setCurrentPlayer);

      // Try to advance FTUE if this is the player's first crop planted
      await tryAdvanceFTUEByTrigger('PlantedFirstCrop', currentPlayer.playerId, currentPlayer, setCurrentPlayer);

      return true; // Success!
    } else {
      throw new Error('Server update failed.');
    }
  } catch (error) {
    console.error('❌ Error in handleFarmPlotPlacement:', error);
    return false;
  }
};



export const handleTerraform = async ({ TILE_SIZE, actionType, gridId, currentPlayer, tileTypes, setTileTypes, overridePosition }) => {

  console.log("handleTerraform;  currentPlayer = ",currentPlayer);

  if (!currentPlayer?.location) {
    console.error("❌ handleTerraform: Missing currentPlayer location.");
    return;
  }

  // Use override position if provided (cursor mode), otherwise use player position
  let tileX, tileY;
  if (overridePosition) {
    tileX = overridePosition.x;
    tileY = overridePosition.y;
  } else {
    const coords = getCurrentTileCoordinates(gridId, currentPlayer);
    if (!coords) return;
    tileX = coords.tileX;
    tileY = coords.tileY;
  }

  const tile = tileTypes?.[tileY]?.[tileX];
  console.log("tile at ",tileY,", ",tileX," = ",tile);

  if (!tile) {
    console.error("❌ handleTerraform: Could not find tile at given coordinates.");
    return;
  }
  if (tile === 'l') {
      FloatingTextManager.addFloatingText(320, tileX, tileY, TILE_SIZE);
    return;
  }
  if (tile === 'w') {
      FloatingTextManager.addFloatingText(320, tileX, tileY, TILE_SIZE); // Same message as lava for now
    return;
  }

  let newType;
  // Determine the new tile type based on the action
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
      return;
  }

  console.log(`🌱 handleTerraform: Changing tile at (${tileX}, ${tileY}) to "${newType}"`);

  // Call convertTileType to update the tile in the database and emit the change
  await convertTileType(gridId, tileX, tileY, newType, setTileTypes);
};
