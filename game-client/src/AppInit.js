import API_BASE from './config';
import axios from 'axios';
import { fetchGridData } from './Utils/GridManagement'; // Utility for fetching grid data
import GlobalGridStateTilesAndResources from './GridState/GlobalGridStateTilesAndResources';
import farmState from './FarmState';
import ambientVFXManager from './VFX/AmbientVFXManager';
import soundManager from './Sound/SoundManager';

/**
 * Grid Initialization (Runs on Refresh or Login)
 * This is for TILES and RESOURCES (not players)
 */
export const initializeGrid = async (
  TILE_SIZE,
  gridId,
  setGrid,
  setResources,
  setTileTypes,
  updateStatus,
  DBPlayerData,
  masterResources
) => {
  try {
    if (!gridId) {
      console.error('🚨 [CRITICAL] GridId is missing. Cannot initialize grid.');
      return;
    }

    console.log('🔄 Initializing grid for gridId:', gridId);

    const gridData = await fetchGridData(gridId, updateStatus, DBPlayerData);
    const { tiles, resources } = gridData;
    
    console.log('🔍 [DEBUG] fetchGridData result:', {
      gridDataKeys: Object.keys(gridData || {}),
      tilesLength: tiles?.length || 0,
      resourcesLength: resources?.length || 0,
      tilesType: typeof tiles,
      resourcesType: typeof resources,
      firstTile: tiles?.[0],
      firstResource: resources?.[0]
    });
    

    // Process resources to add shadow tiles for multi-tile buildings
    const processedResources = [];
    const loadedResources = resources || [];
    
    for (const rawResource of loadedResources) {
      // Enrich resource with master data to get properties like range, passable, etc
      let resource = rawResource;
      if (masterResources && masterResources.length > 0) {
        const template = masterResources.find(r => r.type === rawResource.type);
        if (template) {
          resource = {
            ...template,
            ...rawResource // Raw data overrides template (for x, y, growEnd, etc)
          };
        }
      }
      
      processedResources.push(resource);
      
      
      // If this is a multi-tile resource (has size > 1), create shadow tiles
      // Note: Resources from server might not have anchorKey, so we generate one if needed
      if (resource.size && resource.size > 1) {
        const anchorKey = resource.anchorKey || `${resource.type}-${resource.x}-${resource.y}`;

        for (let dx = 0; dx < resource.size; dx++) {
          for (let dy = 0; dy < resource.size; dy++) {
            // Skip the anchor tile (0,0)
            if (dx === 0 && dy === 0) continue;

            const shadowX = resource.x + dx;
            const shadowY = resource.y - dy;
            const shadowResource = {
              type: 'shadow',
              x: shadowX,
              y: shadowY,
              parentAnchorKey: anchorKey,
              passable: resource.passable
            };

            processedResources.push(shadowResource);
          }
        }
      }
    }

    console.log('🔧 [DEBUG] Setting state:', {
      tilesLength: (tiles || []).length,
      processedResourcesLength: processedResources.length,
      aboutToSetGrid: true,
      aboutToSetResources: true,
      aboutToSetTileTypes: true
    });

    setGrid(tiles || []);
    setResources(processedResources);
    setTileTypes(tiles || []);
    
    // Also update the global grid state with both tiles and resources
    GlobalGridStateTilesAndResources.setTiles(tiles || []);
    GlobalGridStateTilesAndResources.setResources(processedResources);

    console.log('✅ Grid, tiles, and resources initialized for gridId:', gridId);
    console.log('🔍 [DEBUG] Final verification in AppInit:', {
      globalTilesLength: GlobalGridStateTilesAndResources.getTiles().length,
      globalResourcesLength: GlobalGridStateTilesAndResources.getResources().length
    });

    // Initialize FarmState with enriched resources - this happens AFTER resources are set
    // to ensure FarmState sees the fully enriched data with master properties like 'output'
    if (masterResources && masterResources.length > 0 && processedResources.length > 0) {
      console.log('🌾 [AppInit] Initializing FarmState for grid:', gridId);
      await farmState.initializeAndProcessCompleted({
        resources: processedResources,
        gridId,
        setResources,
        masterResources
      });
      farmState.startSeedTimer({ gridId, setResources, masterResources });
    }

    // Trigger ambient VFX and music for the new grid
    const gridWidth = tiles?.[0]?.length || 24;
    const gridHeight = tiles?.length || 24;

    // Respect player's VFX setting for ambient effects
    const toggleVFX = DBPlayerData?.settings?.toggleVFX ?? true;
    ambientVFXManager.setEnabled(toggleVFX);
    ambientVFXManager.onGridEnter(DBPlayerData?.location, gridWidth, gridHeight, TILE_SIZE);

    // Respect player's audio settings
    const musicOn = DBPlayerData?.settings?.musicOn ?? true;
    const soundEffectsOn = DBPlayerData?.settings?.soundEffectsOn ?? true;
    if (!musicOn) {
      soundManager.mute();
    }
    soundManager.setSoundEffectsEnabled(soundEffectsOn);
    soundManager.onGridEnter(DBPlayerData?.location);
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