import API_BASE from '../config';
import axios from 'axios';
import { refreshPlayerAfterInventoryUpdate, spendIngredients } from '../Utils/InventoryManagement';
import { updateGridResource } from '../Utils/GridManagement';
import { addResourceToGrid } from '../Utils/worldHelpers';
import FloatingTextManager from '../UI/FloatingText';
import { trackQuestProgress } from './Quests/QuestGoalTracker';
import NPCsInGridManager from '../GridState/GridStateNPCs';
import playersInGridManager from '../GridState/PlayersInGrid';
import { getCurrentTileCoordinates, enrichResourceFromMaster } from '../Utils/ResourceHelpers';
import GlobalGridStateTilesAndResources from '../GridState/GlobalGridStateTilesAndResources';

export const handleConstruction = async ({
  TILE_SIZE,
  selectedItem,
  buildOptions,
  inventory,
  setInventory,
  backpack,
  setBackpack,
  resources,
  setResources,
  currentPlayer,
  setCurrentPlayer,
  gridId,
  updateStatus,
}) => {
  if (!currentPlayer) {
    console.warn('Current Player not provided; inventory changes will not be saved.');
    return;
  }
  if (!selectedItem) {
    console.warn('Invalid building selection.');
    return;
  }
  // **Get player position dynamically from the NPCsInGrid**
  const playerId = currentPlayer._id.toString();  // Convert ObjectId to string
  const NPCsInGrid = NPCsInGridManager.getNPCsInGrid(gridId);
  const playersInGrid = playersInGridManager.getPlayersInGrid(gridId);
  const player = playersInGrid?.[playerId];
  const playerPosition = player?.position;  // Use grid-relative coordinates directly (no scaling)

  const coords = getCurrentTileCoordinates(gridId, currentPlayer);
  if (!coords) return;
  const { tileX, tileY } = coords;
  const x = tileX;
  const y = tileY;

  console.log('playerPosition = ', playerPosition);
  console.log('x = ',tileX," y = ",tileY);

  // Ensure valid player position
  if (!playerPosition || tileX == null || tileY == null) {
    console.warn('Player position is invalid.');
    return;
  }

  const selectedResource = buildOptions.find((item) => item.type === selectedItem);

  // Check if the tile is already occupied
  const isTileOccupied = resources.some((res) => res.x === x && res.y === y);
  if (isTileOccupied) {
    console.warn('Cannot build on an occupied tile.');
    FloatingTextManager.addFloatingText(306, x, y, TILE_SIZE);
    return; // Exit before deducting inventory
  }

  const success = await spendIngredients({
    playerId: currentPlayer.playerId,
    recipe: selectedResource,
    inventory,
    backpack,
    setInventory,
    setBackpack,
    setCurrentPlayer,
    updateStatus,
  });
  if (!success) {
    FloatingTextManager.addFloatingText(305, playerPosition.x, playerPosition.y, TILE_SIZE);
    return;
  }
  await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);

  console.log('selectedResource.action=', selectedResource.action);

  if (selectedResource.category === 'npc') {
    // Spawning NPC directly at player’s tile coordinates
    NPCsInGridManager.spawnNPC(gridId, selectedResource, playerPosition);
    console.log('Spawned NPC:', gridId, selectedResource, playerPosition);
    // Track quest progress for "Buy" actions
    await trackQuestProgress(currentPlayer, 'Buy', selectedResource.type, 1, setCurrentPlayer);

  } else {
    console.log('Placing resource on the grid:', selectedItem);
    const debugBefore = resources.find(res => res.x === x && res.y === y);
    console.log('🔍 Existing resource at location before setResources:', debugBefore);

    const rawResource = { type: selectedItem, x, y };
    const enriched = enrichResourceFromMaster(rawResource, buildOptions); // buildOptions contains masterResources
    const merged = [...resources, enriched];

    console.log('📦 Forcing Global and local resource update with:', enriched);
    GlobalGridStateTilesAndResources.setResources(merged);
    setResources(merged); // still triggers React re-render

    console.log('🧪 setResources was called to update client state.');
    
    try {
      await updateGridResource(gridId, rawResource, true);
      FloatingTextManager.addFloatingText(300, playerPosition.x, playerPosition.y, TILE_SIZE);
      await trackQuestProgress(currentPlayer, 'Build', selectedItem, 1, setCurrentPlayer);
      await trackQuestProgress(currentPlayer, 'Buy', selectedItem, 1, setCurrentPlayer);
    } catch (error) {
      console.error('Error placing resource on grid:', error);
      return;
    }
  }
};