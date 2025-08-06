import API_BASE from './config';
import axios from 'axios';
import { fetchGridData } from './Utils/GridManagement'; // Utility for fetching grid data
import GlobalGridStateTilesAndResources from './GridState/GlobalGridStateTilesAndResources';

//import { syncPlayerAndGridState } from './Utils/playerManagement';

/**
 * Main App Initialization (Runs on Refresh or Login)
 */
export const initializeGrid = async (
  TILE_SIZE,
  gridId,
  setGrid,
  setResources,
  setTileTypes,
  updateStatus,
  DBPlayerData
) => {
  try {
    if (!gridId) {
      console.error('GridId is missing. Cannot initialize grid.');
      return;
    }

    console.log('Initializing grid for gridId:', gridId);

    const gridData = await fetchGridData(gridId, updateStatus, DBPlayerData);
    const { tiles, resources } = gridData;

    // Process resources to add shadow tiles for multi-tile buildings
    const processedResources = [];
    const loadedResources = resources || [];
    
    for (const resource of loadedResources) {
      processedResources.push(resource);
      
      // If this is a multi-tile resource (has range > 1), create shadow tiles
      if (resource.range && resource.range > 1 && resource.anchorKey) {
        console.log(`🔲 Recreating shadow tiles for ${resource.type} with range ${resource.range}`);
        
        for (let dx = 0; dx < resource.range; dx++) {
          for (let dy = 0; dy < resource.range; dy++) {
            // Skip the anchor tile (0,0)
            if (dx === 0 && dy === 0) continue;
            
            const shadowResource = {
              type: 'shadow',
              x: resource.x + dx,
              y: resource.y - dy,
              parentAnchorKey: resource.anchorKey,
              passable: resource.passable
            };
            
            processedResources.push(shadowResource);
          }
        }
      }
    }

    setGrid(tiles || []);
    setResources(processedResources);
    setTileTypes(tiles || []);
    
    // Also update the global grid state
    GlobalGridStateTilesAndResources.setResources(processedResources);

    console.log('Grid, tiles, and resources initialized for gridId:', gridId);
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