import API_BASE from '../../config';
import axios from 'axios';
import { addResourceToGrid } from '../../Utils/worldHelpers';
import { convertTileType, updateGridResource } from '../../Utils/GridManagement';
import { validateTileType, enrichResourceFromMaster } from '../../Utils/ResourceHelpers';
import { refreshPlayerAfterInventoryUpdate, checkAndDeductIngredients } from '../../Utils/InventoryManagement';
import FloatingTextManager from '../../UI/FloatingText';
import farmState from '../../FarmState';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import { getCurrentTileCoordinates } from '../../Utils/ResourceHelpers';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';

export const handleFarmPlotPlacement = async ({
  selectedItem,
  TILE_SIZE,
  resources,
  setResources,
  currentPlayer,
  inventory,
  setInventory,
  gridId,
  masterResources,
  masterSkills,
}) => {
  try {
    console.log(masterResources);
    
    const coords = getCurrentTileCoordinates(gridId, currentPlayer);
    if (!coords) return;
    const { tileX, tileY } = coords;

    const tileType = await validateTileType(gridId, tileX, tileY);
    if (tileType !== 'd') {
      FloatingTextManager.addFloatingText(303, tileX, tileY, TILE_SIZE); // "Must be dirt"
      return;
    }

    const tileOccupied = resources.find((res) => res.x === tileX && res.y === tileY);
    if (tileOccupied) {
      FloatingTextManager.addFloatingText(304, tileX, tileY, TILE_SIZE); // "Occupied"
      return;
    }

    const updatedInventory = [...inventory];
    const canPlace = checkAndDeductIngredients(selectedItem.type, updatedInventory);
    if (!canPlace) {
      FloatingTextManager.addFloatingText(305, tileX, tileY, TILE_SIZE); // "Missing ingredients"
      return;
    }

    // Save inventory
    await axios.post(`${API_BASE}/api/update-inventory`, {
      playerId: currentPlayer.playerId,
      inventory: updatedInventory,
    });
    setInventory(updatedInventory);

    // Timer setup
    const growEndTime = Date.now() + (selectedItem.growtime || 0) * 1000;

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
    } else {
      throw new Error('Server update failed.');
    }
  } catch (error) {
    console.error('❌ Error in handleFarmPlotPlacement:', error);
  }
};



export const handleTerraform = async ({ actionType, gridId, currentPlayer, setTileTypes }) => {

  console.log("handleTerraform;  currentPlayer = ",currentPlayer);
  
  if (!currentPlayer?.location) {
    console.error("❌ handleTerraform: Missing currentPlayer location.");
    return;
  }

  const coords = getCurrentTileCoordinates(gridId, currentPlayer);
  if (!coords) return;
  const { tileX, tileY } = coords;
  
  let newType;

  // Determine the new tile type based on the action
  switch (actionType) {
    case "till":
      newType = "d";
      break;
    case "plantGrass":
      newType = "g";
      break;
    default:
      console.error(`❌ handleTerraform: Unknown actionType "${actionType}"`);
      return;
  }

  console.log(`🌱 handleTerraform: Changing tile at (${tileX}, ${tileY}) to "${newType}"`);

  // Call convertTileType to update the tile in the database and emit the change
  await convertTileType(gridId, tileX, tileY, newType, setTileTypes);
};
