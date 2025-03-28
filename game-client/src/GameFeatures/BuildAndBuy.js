import API_BASE from '../config';
import axios from 'axios';
import { refreshPlayerAfterInventoryUpdate, checkAndDeductIngredients } from '../Utils/InventoryManagement';
import { updateGridResource } from '../Utils/GridManagement';
import { addResourceToGrid } from '../Utils/worldHelpers';
import FloatingTextManager from '../UI/FloatingText';
import { trackQuestProgress } from './Quests/QuestGoalTracker';
import gridStateManager from '../GridState/GridState';

export const handleConstruction = async ({
  selectedItem,
  buildOptions,
  inventory,
  setInventory,
  tiles,
  resources,
  setResources,
  setErrorMessage,
  currentPlayer,
  gridId,
  setCurrentPlayer,
  updateStatus,
}) => {
  if (!currentPlayer) {
    console.warn('Current Player not provided; inventory changes will not be saved.');
    return;
  }
  if (!selectedItem) {
    setErrorMessage('Invalid building selection.');
    return;
  }

  // **Get player position dynamically from the gridState**
  const playerId = currentPlayer._id.toString();  // Convert ObjectId to string
  const gridState = gridStateManager.getGridState(gridId);
  const player = gridState?.pcs[playerId];
  if (!player) {
    setErrorMessage('Player not found in gridState.');
    return;
  }
  const playerPosition = player.position;  // Use grid-relative coordinates directly (no scaling)
  console.log('handleConstruction: Player position (grid-relative):', playerPosition);
  const x = playerPosition.x;
  const y = playerPosition.y;

  // Ensure valid player position
  if (!playerPosition || x == null || y == null) {
    setErrorMessage('Player position is invalid.');
    return;
  }

  const selectedResource = buildOptions.find((item) => item.type === selectedItem);

  // Check if the tile is already occupied
  const isTileOccupied = resources.some((res) => res.x === x && res.y === y);
  if (isTileOccupied) {
    console.warn('Cannot build on an occupied tile.');
    FloatingTextManager.addFloatingText(306, x, y);
    return; // Exit before deducting inventory
  }

  const updatedInventory = [...inventory];

  // Check and deduct ingredients
  const canBuild = checkAndDeductIngredients(selectedItem, updatedInventory);
  if (!canBuild) {
    FloatingTextManager.addFloatingText(305, playerPosition.x, playerPosition.y);
    return;
  }

  // Save inventory updates to the server
  try {
    await axios.post(`${API_BASE}/api/update-inventory`, {
      playerId: currentPlayer.playerId,
      inventory: updatedInventory,
    });
    console.log('Inventory successfully updated on server.');
  } catch (error) {
    console.error('Error updating inventory on server:', error);
    setErrorMessage('Error updating inventory on server.');
    return;
  }

  // Update inventory in the client
  setInventory(updatedInventory);

  console.log('selectedResource.action=', selectedResource.action);

  if (selectedResource.category === 'npc') {
    // Spawning NPC directly at player’s tile coordinates
    gridStateManager.spawnNPC(gridId, selectedResource, playerPosition);
    console.log('Spawned NPC:', gridId, selectedResource, playerPosition);

    // Track quest progress for "Buy" actions
    await trackQuestProgress(currentPlayer, 'Buy', selectedResource.type, 1, setCurrentPlayer);
  } else {

    console.log('Placing resource on the grid:', selectedItem); 
    try {
      // Update the grid on the server
      const gridUpdateResponse = await updateGridResource(
        gridId, 
        { type: selectedItem, x: x, y: y}, 
        setResources,
        true
      );
      FloatingTextManager.addFloatingText(300, playerPosition.x, playerPosition.y);

      // Track quest progress for "Build or Buy" actions
      await trackQuestProgress(currentPlayer, 'Build', selectedItem, 1, setCurrentPlayer);
      await trackQuestProgress(currentPlayer, 'Buy', selectedItem, 1, setCurrentPlayer);

      if (gridUpdateResponse?.success) {
        // Enrich resource locally
        const enrichedResources = await addResourceToGrid(resources, selectedItem);
        // setResources(enrichedResources);
        console.log('Resource successfully added to grid and enriched.');
      } else {
        throw new Error('Failed to update grid resource.');
      }
    } catch (error) {
      console.error('Error placing resource on grid:', error);
      setErrorMessage('Failed to place resource on grid.');
      return;
    }
  }

  // Refresh player data to ensure client sync
  try {
    console.log('Player refreshed successfully after construction.');
  } catch (error) {
    console.error('Error refreshing player after construction:', error);
  }
};