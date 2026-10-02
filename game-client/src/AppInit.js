import GlobalGridStateTilesAndResources from './GridState/GlobalGridStateTilesAndResources';
import farmState from './FarmState';
import ambientVFXManager from './VFX/AmbientVFXManager';
import soundManager from './Sound/SoundManager';

/**
 * Enrich raw grid resources with master data and add shadow tiles for
 * multi-tile buildings. Pure; no state writes.
 */
export function enrichGridResources(rawResources, masterResources) {
  const processedResources = [];
  const loadedResources = rawResources || [];

  for (const rawResource of loadedResources) {
    let resource = rawResource;
    if (masterResources && masterResources.length > 0) {
      const template = masterResources.find((r) => r.type === rawResource.type);
      if (template) {
        resource = {
          ...template,
          ...rawResource, // Raw data overrides template (for x, y, growEnd, etc)
        };
      }
    }

    processedResources.push(resource);

    // Multi-tile resource (size > 1): add shadow tiles. Resources from the
    // server might not have anchorKey, so generate one if needed.
    if (resource.size && resource.size > 1) {
      const anchorKey = resource.anchorKey || `${resource.type}-${resource.x}-${resource.y}`;

      for (let dx = 0; dx < resource.size; dx++) {
        for (let dy = 0; dy < resource.size; dy++) {
          if (dx === 0 && dy === 0) continue; // anchor tile

          processedResources.push({
            type: 'shadow',
            x: resource.x + dx,
            y: resource.y - dy,
            parentAnchorKey: anchorKey,
            passable: resource.passable,
          });
        }
      }
    }
  }

  return processedResources;
}

/**
 * Grid Initialization from an already-fetched grid payload (the `grid` object
 * of `POST /api/enter-grid`, or anything with `{ _id, tiles, resources }`).
 * This is for TILES and RESOURCES (not players or NPCs).
 *
 * @param {number} TILE_SIZE          active tile size (zoom-dependent)
 * @param {object} gridData           `{ _id, tiles, resources }`
 * @param {Function} setGrid
 * @param {Function} setResources
 * @param {Function} setTileTypes
 * @param {object} player             the player AFTER the location merge (used for settings + ambient keys)
 * @param {Array}  masterResources
 * @param {number|null} pixiBaseTileSize  PixiJS base tile size for ambient VFX (constant, not zoom-dependent)
 */
export const initializeGridFromData = async (
  TILE_SIZE,
  gridData,
  setGrid,
  setResources,
  setTileTypes,
  player,
  masterResources,
  pixiBaseTileSize = null
) => {
  const gridId = gridData?._id;
  if (!gridId) {
    console.error('🚨 [CRITICAL] initializeGridFromData: grid payload has no _id.');
    return;
  }

  try {
    const tiles = gridData.tiles || [];
    const processedResources = enrichGridResources(gridData.resources, masterResources);

    setGrid(tiles);
    setResources(processedResources);
    setTileTypes(tiles);

    // Mirror into the module-level store (NPC AI and feature code read from here)
    GlobalGridStateTilesAndResources.setTiles(tiles);
    GlobalGridStateTilesAndResources.setResources(processedResources);

    // FarmState sees the enriched resources (master props like 'output')
    if (masterResources && masterResources.length > 0 && processedResources.length > 0) {
      await farmState.initializeAndProcessCompleted({
        resources: processedResources,
        gridId,
        setResources,
        masterResources,
      });
      farmState.startSeedTimer({ gridId, setResources, masterResources });
    }

    // Ambient VFX and music for the new grid.
    // Ambient VFX uses the PixiJS base tile size, NOT the zoom-dependent activeTileSize.
    const gridWidth = tiles?.[0]?.length || 24;
    const gridHeight = tiles?.length || 24;
    const ambientTileSize = pixiBaseTileSize || TILE_SIZE;

    const toggleVFX = player?.settings?.toggleVFX ?? true;
    ambientVFXManager.setEnabled(toggleVFX);
    ambientVFXManager.onGridEnter(player?.location, gridWidth, gridHeight, ambientTileSize);

    const musicOn = player?.settings?.musicOn ?? true;
    const soundEffectsOn = player?.settings?.soundEffectsOn ?? true;
    if (!musicOn) {
      soundManager.mute();
    }
    soundManager.setSoundEffectsEnabled(soundEffectsOn);
    soundManager.onGridEnter(player?.location);
  } catch (error) {
    console.error('Error initializing grid:', error);
  }
};

/**
 * Logout Player
 */
export const logoutPlayer = (setPlayerData, setisLoginPanelOpen, setGrid, setResources, setTileTypes) => {
  localStorage.removeItem('player');
  setPlayerData(null);
  setGrid([]); // Clear the grid state
  setResources([]); // Clear resources
  setTileTypes([]); // Clear tile types
  setisLoginPanelOpen(true); // Open login modal
};