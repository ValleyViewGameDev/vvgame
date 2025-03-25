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

    // **Get player position dynamically from the gridState**
    const gridState = gridStateManager.getGridState(gridId);

    console.log('Farming: selectedItem: ',selectedItem);
    console.log('Farming: gridState: ',gridState);
    console.log('Farming: currentPlayer: ',currentPlayer);

    const playerData = gridState?.pcs[currentPlayer.playerId];

    
    if (!playerData) {
        console.warn('Player not found in gridState.');
        return;
    }
    const playerPosition = {
        x: playerData.position.x * TILE_SIZE,
        y: playerData.position.y * TILE_SIZE,
    };
    // Ensure valid player position
    if (!playerPosition || playerPosition.x == null || playerPosition.y == null) {
        console.warn('Player position is invalid.');
        return;
    }
    const tileX = Math.floor(playerPosition.x / TILE_SIZE);
    const tileY = Math.floor(playerPosition.y / TILE_SIZE);

    try {
        const tileType = await validateTileType(gridId, tileX, tileY);
        if (tileType !== 'd') {
            FloatingTextManager.addFloatingText(303, playerPosition.x+25, playerPosition.y+10);
        return;
        }

        const tileResource = resources.find((res) => res.x === tileX && res.y === tileY);
        if (tileResource) {
            FloatingTextManager.addFloatingText(304, playerPosition.x+25, playerPosition.y+10);
        return;
        }

        const updatedInventory = [...inventory];
        const canPlace = checkAndDeductIngredients(selectedItem.type, updatedInventory);

        if (!canPlace) {
            FloatingTextManager.addFloatingText(305, playerPosition.x+25, playerPosition.y+10);
        return;
        }

        await axios.post('http://localhost:3001/api/update-inventory', {
        playerId: currentPlayer.playerId,
        inventory: updatedInventory,
        });
        setInventory(updatedInventory);

        const growEndTime = Date.now() + selectedItem.growtime * 1000;

        const newResourcePayload = {
        newResource: selectedItem.type,
        x: tileX,
        y: tileY,
        growEnd: growEndTime,
        };

        try {
        const gridUpdateResponse = await updateGridResource(gridId, newResourcePayload, setResources);

        if (gridUpdateResponse?.success) {
            farmState.addSeed({
            type: selectedItem.type,
            x: tileX,
            y: tileY,
            growEnd: growEndTime,
            });

            const updatedResources = await addResourceToGrid(resources, newResourcePayload);
            setResources(updatedResources);

            FloatingTextManager.addFloatingText(302, playerPosition.x+20, playerPosition.y+10);
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


export const handleTerraform = async ({
    actionType, // "till" or "plantGrass"
    TILE_SIZE,
    setTileTypes,
    getCurrentTileTypes,
    gridId,
    currentPlayer
    }) => {
    // ✅ Get player position dynamically from gridState
    const gridState = gridStateManager.getGridState(gridId);
    const playerData = gridState?.pcs[currentPlayer.playerId];
    
    if (!playerData) {
        console.warn('Player not found in gridState.');
        return;
    }
    
    const tileX = playerData.position.x;
    const tileY = playerData.position.y;
    
    try {
        // ✅ Determine target tile type
        const targetTileType = actionType === "till" ? 'd' : actionType === "plantGrass" ? 'g' : null;
    
        if (!targetTileType) {
        console.error("Invalid actionType provided to handleTerraform.");
        return;
        }
    
        // ✅ Convert the tile type
        await convertTileType(gridId, tileX, tileY, targetTileType, setTileTypes, getCurrentTileTypes);
    
        // ✅ Update local tile state
        setTileTypes((prev) => {
        const updated = [...prev];
        updated[tileY][tileX] = targetTileType;
        return updated;
        });
    
        console.log(`Successfully changed tile at (${tileX}, ${tileY}) to ${targetTileType}`);
    } catch (error) {
        console.error(`Error performing ${actionType} action:`, error);
    }
    };