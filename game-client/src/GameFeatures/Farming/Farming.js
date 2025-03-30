import API_BASE from '../../config';
import axios from 'axios';
import { addResourceToGrid } from '../../Utils/worldHelpers';
import { convertTileType, updateGridResource, validateTileType } from '../../Utils/GridManagement';
import { refreshPlayerAfterInventoryUpdate, checkAndDeductIngredients } from '../../Utils/InventoryManagement';
import FloatingTextManager from '../../UI/FloatingText';
import farmState from '../../FarmState';
import { canAfford, getIngredientDetails } from '../../Utils/ResourceHelpers';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import gridStateManager from '../../GridState/GridState';

export const handleFarmPlotPlacement = async ({
    selectedItem,
    TILE_SIZE,
    resources,
    setResources,
    tiles,
    tileTypes,
    setTileTypes,
    currentPlayer,
    setCurrentPlayer,
    inventory,
    setInventory,
    gridId,

}) => {

    const coords = getCurrentTileCoordinates(gridId, currentPlayer);
    if (!coords) return;
    const { tileX, tileY } = coords;

    try {
        const tileType = await validateTileType(gridId, tileX, tileY);
        if (tileType !== 'd') {
            FloatingTextManager.addFloatingText(303, tileX*TILE_SIZE, tileY*TILE_SIZE);
        return;
        }
        const tileResource = resources.find((res) => res.x === tileX && res.y === tileY);
        if (tileResource) {
            FloatingTextManager.addFloatingText(304, tileX*TILE_SIZE, tileY*TILE_SIZE);
        return;
        }

        const updatedInventory = [...inventory];
        const canPlace = checkAndDeductIngredients(selectedItem.type, updatedInventory);

        if (!canPlace) {
            FloatingTextManager.addFloatingText(305, tileX*TILE_SIZE, tileY*TILE_SIZE);
        return;
        }

        await axios.post(`${API_BASE}/api/update-inventory`, {
        playerId: currentPlayer.playerId,
        inventory: updatedInventory,
        });
        setInventory(updatedInventory);
 
        const growEndTime = Date.now() + selectedItem.growtime * 1000;

        const newResourcePayload = {
          type: selectedItem.type,
          x: tileX,
          y: tileY,
          growEnd: growEndTime,
        };

        try { 
          const gridUpdateResponse = await updateGridResource(
            gridId,
            newResourcePayload,
            setResources,
            true
        );
            
        if (gridUpdateResponse?.success) {
            farmState.addSeed({
            type: selectedItem.type,
            x: tileX,
            y: tileY,
            growEnd: growEndTime,
        });

            FloatingTextManager.addFloatingText(302, tileX*TILE_SIZE, tileY*TILE_SIZE);
        } else {
            throw new Error('Failed to update grid resource.');
        }
        } catch (error) {
        console.error('Error planting seed:', error);
        }
    } catch (error) {
        console.error('Error planting seed:', error);
    }
    };


    export const handleTerraform = async ({ actionType, gridId, currentPlayer, setTileTypes }) => {
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


 function getCurrentTileCoordinates(gridId, currentPlayer) {
  const gridState = gridStateManager.getGridState(gridId);
  if (!gridState || !currentPlayer?.playerId) {
    console.warn('⚠️ GridState or playerId missing.');
    return null;
  }
  const playerData = gridState.pcs?.[currentPlayer.playerId];
  if (!playerData) {
    console.warn('⚠️ Player not found in gridState.');
    return null;
  }
  const { x, y } = playerData.position;
  if (x == null || y == null) {
    console.warn('⚠️ Invalid player position.');
    return null;
  }
  const tileX = Math.floor(x);
  const tileY = Math.floor(y);
  return { tileX, tileY };
}