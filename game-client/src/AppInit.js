import API_BASE from './config';
import axios from 'axios';
import { fetchGridData } from './Utils/GridManagement'; // Utility for fetching grid data

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
  updateStatus
) => {
  try {
    if (!gridId) {
      console.error('GridId is missing. Cannot initialize grid.');
      return;
    }
 
    console.log('Initializing grid for gridId:', gridId);

    const gridData = await fetchGridData(gridId, updateStatus);
    const { tiles, resources } = gridData;

    setGrid(tiles || []);
    setResources(resources || []);
    setTileTypes(tiles || []);

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