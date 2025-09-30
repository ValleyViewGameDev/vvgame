import API_BASE from './config';
import axios from 'axios';
import { fetchGridData } from './Utils/GridManagement'; // Utility for fetching grid data
import GlobalGridStateTilesAndResources from './GridState/GlobalGridStateTilesAndResources';

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
      console.error('GridId is missing. Cannot initialize grid.');
      return;
    }

    console.log('Initializing grid for gridId:', gridId);

    const gridData = await fetchGridData(gridId, updateStatus, DBPlayerData);
    const { tiles, resources } = gridData;
    

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
      
      
      // If this is a multi-tile resource (has range > 1), create shadow tiles
      // Note: Resources from server might not have anchorKey, so we generate one if needed
      if (resource.range && resource.range > 1) {
        const anchorKey = resource.anchorKey || `${resource.type}-${resource.x}-${resource.y}`;
        
        for (let dx = 0; dx < resource.range; dx++) {
          for (let dy = 0; dy < resource.range; dy++) {
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