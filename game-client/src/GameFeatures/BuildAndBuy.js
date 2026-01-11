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
import { createCollectEffect } from '../VFX/VFX';

export const handleConstructionWithGems = async (params) => {
  // Wrapper function that uses a modified recipe if provided
  if (params.modifiedRecipe) {
    // Replace the selected resource in buildOptions with the modified recipe
    const modifiedBuildOptions = params.buildOptions.map(item =>
      item.type === params.modifiedRecipe.type ? params.modifiedRecipe : item
    );
    return handleConstruction({
      ...params,
      buildOptions: modifiedBuildOptions,
    });
  }
  return handleConstruction(params);
};

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
  overridePosition, // Optional: { x, y } for cursor mode placement
}) => {
  if (!currentPlayer) {
    console.warn('Current Player not provided; inventory changes will not be saved.');
    return false;
  }
  if (!selectedItem) {
    console.warn('Invalid building selection.');
    return false;
  }
  // **Get player position dynamically **
  const playerId = currentPlayer._id.toString();  // Convert ObjectId to string
  const playersInGrid = playersInGridManager.getPlayersInGrid(gridId);
  const player = playersInGrid?.[playerId];
  const playerPosition = player?.position;  // Use grid-relative coordinates directly (no scaling)

  // Use override position if provided (cursor mode), otherwise use player position
  let x, y;
  if (overridePosition) {
    x = overridePosition.x;
    y = overridePosition.y;
  } else {
    const coords = getCurrentTileCoordinates(gridId, currentPlayer);
    if (!coords) return false;
    x = coords.tileX;
    y = coords.tileY;
  }

  console.log('playerPosition = ', playerPosition);
  console.log('x = ', x, " y = ", y);

  // Ensure valid player position
  if (!playerPosition || x == null || y == null) {
    console.warn('Player position is invalid.');
    return false;
  }

  const selectedResource = buildOptions.find((item) => item.type === selectedItem);

  // Check if this is a multi-tile resource (size is tile footprint)
  const resourceSize = selectedResource.size || 1;
  console.log(`🏗️ Building ${selectedItem} with size ${resourceSize}`);

  // Skip tile occupation check for NPCs since they don't occupy grid tiles
  if (selectedResource.category !== 'npc') {
    // For multi-tile resources, check all required tiles
    // Using player position as lower-left anchor
    const tilesToCheck = [];
    for (let dx = 0; dx < resourceSize; dx++) {
      for (let dy = 0; dy < resourceSize; dy++) {
        tilesToCheck.push({ x: x + dx, y: y - dy });
      }
    }

    console.log('📍 Tiles to check for placement:', tilesToCheck);

    // Check if any of the required tiles are occupied
    const occupiedTile = tilesToCheck.find(tile => 
      resources.some(res => res.x === tile.x && res.y === tile.y)
    );

    if (occupiedTile) {
      console.warn(`Cannot build ${selectedItem} - tile at (${occupiedTile.x}, ${occupiedTile.y}) is occupied.`);
      FloatingTextManager.addFloatingText(306, x, y, TILE_SIZE);
      return false; // Exit before deducting inventory
    }
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
    return false;
  }
  // refreshPlayerAfterInventoryUpdate is already called inside spendIngredients

  console.log('selectedResource.action=', selectedResource.action);

  // Calculate total cost for status message
  const costDetails = [];
  for (let i = 1; i <= 4; i++) {
    const ingredientType = selectedResource[`ingredient${i}`];
    const ingredientQty = selectedResource[`ingredient${i}qty`];
    if (ingredientType && ingredientQty) {
      costDetails.push(`${ingredientQty} ${ingredientType}`);
    }
  }
  const costString = costDetails.length > 0 ? costDetails.join(', ') : 'free';

  if (selectedResource.category === 'npc') {
    // Spawning NPC at the target position (cursor position if in cursor mode, otherwise player position)
    const spawnPosition = overridePosition ? { x, y } : playerPosition;
    NPCsInGridManager.spawnNPC(gridId, selectedResource, spawnPosition);
    console.log('Spawned NPC:', gridId, selectedResource, spawnPosition);

    // Show VFX and floating text for NPC purchase
    createCollectEffect(x, y, TILE_SIZE);
    FloatingTextManager.addFloatingText(300, x, y, TILE_SIZE);
    
    // Show status message with purchase details
    updateStatus(`${selectedResource.type} purchased for ${costString}.`);
    
    // Track quest progress for "Buy" actions
    await trackQuestProgress(currentPlayer, 'Buy', selectedResource.type, 1, setCurrentPlayer);

  } else {
    console.log('Placing resource on the grid:', selectedItem);
    const debugBefore = resources.find(res => res.x === x && res.y === y);
    console.log('🔍 Existing resource at location before setResources:', debugBefore);

    const rawResource = { type: selectedItem, x, y };
    const enriched = enrichResourceFromMaster(rawResource, buildOptions); // buildOptions contains masterResources

    // Ensure size is included for multi-tile resources
    if (resourceSize > 1) {
      enriched.size = resourceSize;
      enriched.anchorKey = `${selectedItem}_${x}_${y}`;
    }

    let finalResources = [...resources, enriched];

    console.log('📦 Preparing resource update with:', enriched);

    try {
      // Create shadow placeholders for multi-tile objects in LOCAL STATE ONLY
      if (resourceSize > 1) {

        for (let dx = 0; dx < resourceSize; dx++) {
          for (let dy = 0; dy < resourceSize; dy++) {
            // Skip the anchor tile (0,0)
            if (dx === 0 && dy === 0) continue;

            const shadowX = x + dx;
            const shadowY = y - dy;
            const shadowResource = {
              type: 'shadow',
              x: shadowX,
              y: shadowY,
              parentAnchorKey: enriched.anchorKey,
              passable: enriched.passable // Inherit passable property from parent
              // No symbol - renders as empty/invisible
            };


            // Add shadow to final resources array (LOCAL STATE ONLY - NOT SAVED TO DB)
            finalResources.push(shadowResource);
          }
        }
      }
      
      // Update local state ONCE with all resources (main + shadows)
      console.log('🧪 Updating local state with all resources');
      GlobalGridStateTilesAndResources.setResources(finalResources);
      setResources(finalResources);
      
      // Update ONLY the main resource in DB (NOT shadows)
      await updateGridResource(gridId, rawResource, true);

      // Show VFX and floating text for resource placement
      createCollectEffect(x, y, TILE_SIZE);
      FloatingTextManager.addFloatingText(300, playerPosition.x, playerPosition.y, TILE_SIZE);
      
      // Show status message with purchase details
      updateStatus(`${selectedItem} purchased for ${costString}.`);
      
      // Track quest progress sequentially to avoid conflicts
      await trackQuestProgress(currentPlayer, 'Build', selectedItem, 1, setCurrentPlayer);
      await trackQuestProgress(currentPlayer, 'Buy', selectedItem, 1, setCurrentPlayer);
      return true; // Success
    } catch (error) {
      console.error('Error placing resource on grid:', error);
      return false;
    }
  }
  return true; // Success (for NPC category)
};