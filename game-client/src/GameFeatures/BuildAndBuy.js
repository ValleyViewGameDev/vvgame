import API_BASE from '../config';
import axios from 'axios';
import { applyPlayerDelta, postAction } from '../Utils/playerDelta';
import { addResourceToGrid } from '../Utils/worldHelpers';
import FloatingTextManager from '../UI/FloatingText';
import NPCsInGridManager from '../GridState/GridStateNPCs';
import playersInGridManager from '../GridState/PlayersInGrid';
import { getCurrentTileCoordinates, enrichResourceFromMaster, growsInRegion } from '../Utils/ResourceHelpers';
import { getLocalizedString } from '../Utils/stringLookup';
import GlobalGridStateTilesAndResources from '../GridState/GlobalGridStateTilesAndResources';
import { createCollectEffect } from '../VFX/VFX';
import soundManager from '../Sound/SoundManager';
import { footprintOf, footprintCells } from '../Utils/footprint';

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
      useGems: true,
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
  globalTuning, // Optional: for limit checking
  masterResources, // Optional: for limit checking
  useGems = false, // the gem button: gems stand in for what is missing (priced on the server)
  strings = {}, // for the regional-animal refusal text
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
  const { w: fw, h: fh } = footprintOf(selectedResource); // size, or sizeX x sizeY (Utils/footprint.js)
  const resourceSize = fw * fh;
  console.log(`🏗️ Building ${selectedItem} with footprint ${fw} x ${fh}`);

  // Skip tile occupation check for NPCs since they don't occupy grid tiles
  if (selectedResource.category !== 'npc') {
    // For multi-tile resources, check all required tiles
    // Using player position as lower-left anchor
    const tilesToCheck = footprintCells(x, y, fw, fh);

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

  // A regional farm animal (resources.json growregion, e.g. the Goat: Bohemia) lives only on a grid of its region
  const gridRegion = GlobalGridStateTilesAndResources.getGridMeta()?.region ?? currentPlayer?.location?.region ?? null;
  if (!growsInRegion(selectedResource, gridRegion)) {
    const onlyIn = String(strings[17025] || 'Only raised in {region}').replace('{region}', getLocalizedString(selectedResource.growregion, strings));
    FloatingTextManager.addFloatingText(onlyIn, x, y, TILE_SIZE);
    return false;
  }

  // Check limits for farm animals and town buildings
  if (globalTuning) {
    // Farm animal limit check (action: 'graze')
    const isFarmAnimal = selectedResource.passable && selectedResource.action === 'graze';
    if (isFarmAnimal) {
      const maxFarmAnimals = globalTuning.maxFarmAnimals || 10;
      const npcsInGrid = NPCsInGridManager.getNPCsInGrid(gridId);
      const currentFarmAnimals = npcsInGrid
        ? Object.values(npcsInGrid).filter(npc => npc.action === 'graze').length
        : 0;

      if (currentFarmAnimals >= maxFarmAnimals) {
        console.warn(`Cannot buy ${selectedItem} - farm animal limit (${maxFarmAnimals}) reached.`);
        FloatingTextManager.addFloatingText(407, x, y, TILE_SIZE); // 407: "Maximum reached for this location."
        return false;
      }
    }

    // Town building limit check (source: 'BuildTown' on non-homestead grids)
    const isTownBuilding = selectedResource.source === 'BuildTown' && currentPlayer?.location?.gtype !== 'homestead';
    if (isTownBuilding && masterResources) {
      const maxTownBuildings = globalTuning.maxTownBuildings || 500;
      const currentTownBuildings = resources.filter(resource => {
        const masterResource = masterResources.find(mr => mr.type === resource.type);
        return masterResource?.source === 'BuildTown';
      }).length;

      if (currentTownBuildings >= maxTownBuildings) {
        console.warn(`Cannot build ${selectedItem} - town building limit (${maxTownBuildings}) reached.`);
        FloatingTextManager.addFloatingText(407, x, y, TILE_SIZE); // 407: "Maximum reached for this location."
        return false;
      }
    }

    // Crafting station per-type limit check
    if (selectedResource.category === 'crafting') {
      const maxPerType = globalTuning.maxCraftingStationsPerType || 4;
      const currentCount = resources.filter(r => r.type === selectedItem).length;

      if (currentCount >= maxPerType) {
        console.warn(`Cannot build ${selectedItem} - crafting station per-type limit (${maxPerType}) reached.`);
        FloatingTextManager.addFloatingText(407, x, y, TILE_SIZE);
        return false;
      }
    }
  }

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
  const deltaSetters = { setCurrentPlayer, setInventory, setBackpack };
  const placeRequest = () => postAction('/api/action/place', { playerId: currentPlayer.playerId, gridId, x, y, type: selectedItem, useGems });
  const refusal = (answer) => {
    applyPlayerDelta(answer.data, deltaSetters);
    if (answer.reason === 'occupied') FloatingTextManager.addFloatingText(306, x, y, TILE_SIZE);
    else if (answer.reason === 'limit') FloatingTextManager.addFloatingText(407, x, y, TILE_SIZE);
    else FloatingTextManager.addFloatingText(305, playerPosition.x, playerPosition.y, TILE_SIZE);
  };

  // ONE request (game-server routes/actionRoutes.js /action/place): the server checks where it may
  // go, the footprint and the limits, charges resources.json's price, writes the building and
  // advances Build / Buy quests.
  if (selectedResource.category === 'npc') {
    const answer = await placeRequest();
    if (!answer.ok) { refusal(answer); return false; }
    applyPlayerDelta(answer.data, deltaSetters);
    // Spawning NPC at the target position (cursor position if in cursor mode, otherwise player position)
    const spawnPosition = overridePosition ? { x, y } : playerPosition;
    NPCsInGridManager.spawnNPC(gridId, selectedResource, spawnPosition);
    createCollectEffect(x, y, TILE_SIZE);
    FloatingTextManager.addFloatingText(300, x, y, TILE_SIZE);
    soundManager.playSFX('place');
    updateStatus(`${selectedResource.type} purchased for ${costString}.`);
    return true;
  }

  // A building appears on the tap; a refusal takes it away again
  const rawResource = { type: selectedItem, x, y };
  if (selectedResource.category === 'crafting') rawResource.stationLevel = 0;
  const enriched = enrichResourceFromMaster(rawResource, buildOptions); // buildOptions contains masterResources
  if (resourceSize > 1) {
    enriched.anchorKey = `${selectedItem}_${x}_${y}`; // size / sizeX / sizeY came with the master row
  }
  const before = resources;
  const finalResources = [...resources, enriched];
  // Shadow placeholders for multi-tile objects in LOCAL STATE ONLY (never saved)
  if (resourceSize > 1) {
    for (let dx = 0; dx < resourceSize; dx++) {
      for (let dy = 0; dy < resourceSize; dy++) {
        if (dx === 0 && dy === 0) continue;
        finalResources.push({ type: 'shadow', x: x + dx, y: y - dy, parentAnchorKey: enriched.anchorKey, passable: enriched.passable });
      }
    }
  }
  GlobalGridStateTilesAndResources.setResources(finalResources);
  setResources(finalResources);
  createCollectEffect(x, y, TILE_SIZE);
  soundManager.playSFX('place');

  const answer = await placeRequest();
  if (!answer.ok) {
    if (answer.status !== 0) {
      GlobalGridStateTilesAndResources.setResources(before);
      setResources(before);
    }
    refusal(answer);
    return false;
  }
  applyPlayerDelta(answer.data, deltaSetters);
  updateStatus(`${selectedItem} purchased for ${costString}.`);
  return true;
};