import axios from 'axios';
import { fetchGridData } from './Utils/GridManagement'; // Utility for fetching grid data
import gridStateManager from './GridState/GridState';
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
 * Post-login Initialization (Runs After Login)
 */
// export const postLoginInitialization = async (
//   playerData,
//   activeTileSize,
//   setCurrentPlayer,
//   setGrid,
//   setResources,
//   setTileTypes,
//   setGridId,
//   setGridState,
//   updateStatus
// ) => {
//   try {
//     console.log('Post-login initialization with playerData:', playerData);

//     // 1. Fetch full player data from the server
//     const response = await axios.get(`http://localhost:3001/api/player/${playerData.playerId}`);
//     const fullPlayerData = response.data;
//     if (!fullPlayerData || !fullPlayerData.playerId) {
//       console.error('Invalid full player data from server:', fullPlayerData);
//       return;
//     }

//     // 2. Merge with local player data
//     const updatedPlayerData = { ...playerData, ...fullPlayerData };

//     // Save the updated player data locally
//     setCurrentPlayer(updatedPlayerData);
//     localStorage.setItem('player', JSON.stringify(updatedPlayerData));

//     // 3. Sync player with the gridState and database
//     await syncPlayerAndGridState(updatedPlayerData, updatedPlayerData.location.g, setCurrentPlayer);

//     // 4. Save gridState immediately after syncing the player (ensures DB consistency)
//     console.log(`Forcing gridState save after login for grid ${updatedPlayerData.location.g}`);
//     await gridStateManager.saveGridState(updatedPlayerData.location.g);
    
//     // 4. Call the main Grid initialization logic to avoid redundancy
//     await initializeGrid(
//       activeTileSize,
//       updatedPlayerData.location.g,  // Directly pass gridId
//       setGrid,
//       setResources,
//       setTileTypes,
//       updateStatus
//     );

//     console.log('Post-login initialization complete.');
//   } catch (error) {
//     console.error('Error during post-login initialization:', error);
//   }
// };

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