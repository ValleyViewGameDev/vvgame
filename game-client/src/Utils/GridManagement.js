import API_BASE from '../config';
import axios from 'axios';
import { initializeGrid } from '../AppInit';
import gridStateManager from '../GridState/GridState';
import socket from '../socketManager'; // ⚠️ At top of file if not already present
import GlobalGridState from '../GridState/GlobalGridState';
import { mergeResources } from './ResourceHelpers';

export async function updateGridResource(gridId, payload, setResources) {
  try {
    console.log('🌱 updateGridResource: payload =', payload);
    const response = await axios.patch(`${API_BASE}/api/update-grid/${gridId}`, payload);

    if (response?.data?.success) {
      const { newResource, x, y, growEnd, craftEnd, craftedItem } = payload;

      const currentResources = GlobalGridState.getResources();
      let updatedResource = null;

      // 👇 Construct the update (could be a deletion)
      if (newResource === null) {
        updatedResource = { x, y, type: null };
      } else {
        const existing = currentResources.find(r => r.x === x && r.y === y);
        updatedResource = {
          ...(existing || { x, y }),
          ...(newResource && { type: newResource }),
          ...(growEnd !== undefined && { growEnd }),
          ...(craftEnd !== undefined && { craftEnd }),
          ...(craftedItem !== undefined && { craftedItem }),
        };
      }

      // ✅ Merge with existing state
      const updatedResources = mergeResources(currentResources, [updatedResource]);

      GlobalGridState.setResources(updatedResources);
      if (setResources) setResources(updatedResources);

      // ✅ Emit to all clients
      socket.emit('update-tile-resource', {
        gridId,
        updatedTiles: GlobalGridState.getTiles(),
        updatedResources: [updatedResource],
      });
      console.log("📡 Emitting update-tile-resource via socket:", gridId, updatedResource);
    }

    return response.data;
  } catch (error) {
    console.error('❌ updateGridResource error:', error);

    if (error.response?.status === 500 && error.response.data?.message?.includes('VersionError')) {
      console.warn('🔁 Retrying update due to version conflict...');
      return await updateGridResource(gridId, payload, setResources);
    }

    return null;
  }
}

export async function convertTileType(gridId, x, y, tileType, setTileTypes, getCurrentTileTypes) {
  const currentTiles = getCurrentTileTypes();

  // Optimistic update
  setTileTypes((prev) => {
    const updated = [...prev];
    updated[y] = [...prev[y]];
    updated[y][x] = tileType;
    return updated;
  });

  try {
    const response = await axios.patch(`${API_BASE}/api/update-tile/${gridId}`, { x, y, tileType });

    // 🔁 Broadcast tile + resource update to others
    socket.emit('update-tile-resource', {
      gridId,
      updatedTiles: GlobalGridState.getTiles(),
      updatedResources: GlobalGridState.getResources(),
    });

    return response.data;
  } catch (error) {
    console.error('❌ convertTileType failed, reverting:', error);
    setTileTypes(currentTiles); // Revert optimistic change
    throw error;
  }
}


export const changePlayerLocation = async (
  currentPlayer,
  fromLocation,
  toLocation,
  setCurrentPlayer,
  fetchGrid,
  setGridId,    
  setGrid,       
  setResources,   
  setTileTypes,  
  setGridState,
  TILE_SIZE,
) => {  try {
    // Validate inputs
    if (!currentPlayer) { throw new Error("Player data is missing or invalid."); }
    if (!fromLocation || !toLocation) { throw new Error("Both 'from' and 'to' locations are required."); }

    console.log("🚨 ENTERING changePlayerLocation()");
    console.log(`🔍 BEFORE FETCH: Player ${currentPlayer.username} moving from ${fromLocation.g} to ${toLocation.g}`);

    console.log("🔍 Checking player local state before fetch:", JSON.stringify(currentPlayer, null, 2));

    // Check what local gridState holds BEFORE fetching
    console.log("🔍 Local gridState BEFORE fetch:", JSON.stringify(gridStateManager.getGridState(fromLocation.g), null, 2));

    console.log("🔍 Fetching grid states from DB...");
    const fromGridStateResponse = await axios.get(`${API_BASE}/api/load-grid-state/${fromLocation.g}`);
    const toGridStateResponse = await axios.get(`${API_BASE}/api/load-grid-state/${toLocation.g}`);

    console.log('🚨 AFTER FETCH: Raw fromGridStateResponse:', JSON.stringify(fromGridStateResponse.data, null, 2));
    console.log('🚨 AFTER FETCH: Raw toGridStateResponse:', JSON.stringify(toGridStateResponse.data, null, 2));


    let fromGridState = fromGridStateResponse.data?.gridState || { pcs: {} };
    let targetGridState = toGridStateResponse.data?.gridState || { pcs: {} };

    if (!Object.keys(fromGridState.pcs).length) {
      console.error(`🚨 ERROR: fromGridState for grid ${fromLocation.g} is already empty after fetch!`);
  }
    console.log('Fetched fromGridState:', fromGridState);
    console.log('Fetched targetGridState:', targetGridState);

    // // 2️⃣ Extract player data from gridState before removing them
    const playerId = String(currentPlayer.playerId);
    const playerInGridState = fromGridState.pcs[playerId];

    console.log('playerInGridState (fromGridState) = ',playerInGridState);

    if (!playerInGridState) {
      console.warn(`⚠️ Player ${currentPlayer.username} not found in gridState before transit.`);
    } else {
      console.log(`✅ Extracting combat stats for player ${currentPlayer.username} before transit.`);

    //   // ✅ Extract combat stats from gridState
      const combatStats = {
        hp: playerInGridState.hp,
        maxhp: playerInGridState.maxhp,
        attackbonus: playerInGridState.attackbonus,
        armorclass: playerInGridState.armorclass,
        damage: playerInGridState.damage,
        attackrange: playerInGridState.attackrange,
        speed: playerInGridState.speed,
        iscamping: playerInGridState.iscamping,
      };

    //   // ✅ Backfill combat stats into player document in DB before transit
      await axios.post(`${API_BASE}/api/update-profile`, {
        playerId: currentPlayer.playerId,
        updates: combatStats,
      });
      console.log(`✅ Combat stats saved to player document:`, combatStats);

    //   // ✅ Also update local player state immediately before transit
      setCurrentPlayer((prev) => ({
        ...prev,
        ...combatStats, // Sync combat stats locally
      }));
    }

// NO PROLBEMS ABOVE THIS

console.log("🔄 [Before Finalizing] gridState BEFORE saving locally:", 
  JSON.stringify(gridStateManager.getGridState(toLocation.g), null, 2));
    
// 1️⃣ Add player to the "to" grid’s gridState (merge while preserving existing PCs)
if (playerInGridState) {
  playerInGridState.position = { x: toLocation.x || 1, y: toLocation.y || 1 }; // Ensure correct position
  
  targetGridState.pcs = {
    ...targetGridState.pcs,
    [playerId]: playerInGridState, // Directly assign playerInGridState
  };

  console.log(`✅ Added player ${currentPlayer.username} to target gridState with correct stats and position.`);

  // ✅ Save targetGridState FIRST
  await axios.post(`${API_BASE}/api/save-grid-state`, {
    gridId: toLocation.g,
    gridState: targetGridState,
  });
  console.log("✅ Target gridState updated and saved to DB.");
} else {
  console.error(`🚨 playerInGridState is undefined when adding to target gridState!`);
}


// 2️⃣ Now safely remove player from the "from" grid’s gridState
if (fromGridState.pcs[currentPlayer.playerId]) {
  console.log(`Removing player ${currentPlayer.username} from "from" gridState.`);

  // ✅ Clone the pcs object before modifying
  const updatedPcs = { ...fromGridState.pcs };  
  delete updatedPcs[currentPlayer.playerId];

  // ✅ Clone fromGridState before updating
  const updatedFromGridState = {
    ...fromGridState,
    pcs: updatedPcs, // Use the updated pcs object
  };

  await axios.post(`${API_BASE}/api/save-grid-state`, {
    gridId: fromLocation.g,
    gridState: updatedFromGridState,
  });

  console.log("✅ Player removed and 'from' gridState saved to DB.");
}


    // 4️⃣ Prepare payload and update on the server
    const payload = {
      playerId: currentPlayer.playerId,
      location: toLocation, // Send the "to" location
    };
    console.log("Sending payload to /update-player-location:", payload);
    // Update player location on the backend
    const response = await axios.post(`${API_BASE}/api/update-player-location`, payload);

    if (!response.data.success) { throw new Error(response.data.error); }
    console.log("Player location updated successfully on the server:", response.data);

    // 5️⃣ Update local state and localStorage with latest combat stats from gridState
    const updatedPlayer = {
      ...currentPlayer,
      location: toLocation,
      ...playerInGridState, // ✅ Ensure local player data has up-to-date combat stats
    };

    setCurrentPlayer(updatedPlayer);
    localStorage.setItem("player", JSON.stringify(updatedPlayer));
    console.log("✅ Updated player location locally with combat stats:", updatedPlayer);


    // 7️⃣ Refresh the grid using `initializeGrid`
    console.log("Initializing new grid after player transit...");
    setGridId(toLocation.g);
    await initializeGrid(TILE_SIZE, toLocation.g, setGrid, setResources, setTileTypes);

    console.log("✅ Player transit completed successfully.");
    
    window.location.reload();
    // return updatedPlayer;
  } 
  catch (error) {
    console.error("Error changing player location:", error.message || error);
    throw error;
  }
}; 

export async function fetchGridData(gridId, updateStatus) {
  try {
    console.log(`Fetching grid data for gridId: ${gridId}`);

    // 1) Fetch the grid data (which now has ownerId populated)
    const gridResponse = await axios.get(`${API_BASE}/api/load-grid/${gridId}`);
    const gridData = gridResponse.data || {};
    const { gridType, _id: fetchedGridId, ownerId } = gridData;

    console.log('Fetched grid data:', gridData);

    // 2) Check if it's a homestead and extract the username if present
    let username = null;
    if (gridType === 'homestead' && ownerId) {
      username = ownerId.username || 'Unknown';
    }

    // 3) Update the status bar (e.g., "Welcome to Oberon's homestead")
    updateGridStatus(gridType, username, updateStatus);

    return gridData; // Return the full grid data
  } catch (error) {
    console.error('Error fetching grid data:', error);
    if (updateStatus) updateStatus('Failed to load grid data');
    return {};
  }
}

// Separate function for status updates
export function updateGridStatus(gridType, ownerUsername, updateStatus) {
  if (!updateStatus) return;

  switch (gridType) {
    case 'homestead':
      updateStatus(`Welcome to ${ownerUsername || 'Unknown'}'s homestead.`);
      break;
    case 'town':
      updateStatus(14); // Town view
      break;
    case 'valley1':
    case 'valley2':
    case 'valley3':
      updateStatus(16); // Valley view
      break;
    case 'settlement':
      updateStatus(12); // Settlement view
      break;
    case 'frontier':
      updateStatus(13); // Frontier view
      break;
    default:
      //updateStatus(0); // Default status
      break;
  }
}

export async function validateResourceAtLocation(gridId, col, row, expectedType) {
    try {
        console.log(`Validating resource at (${col}, ${row}) in grid ${gridId}`);
        const response = await axios.get(`${API_BASE}/api/get-resource/${gridId}/${col}/${row}`);
        const { type } = response.data; // Extract the type from the response
        if (type === expectedType) {
            console.log(`Resource validation successful: ${type}`);
            return true;
        } else {
            console.error(`Resource validation failed: Expected ${expectedType}, but found ${type}`);
            return false;
        }
    } catch (error) {
        console.error('Error validating resource:', error);
        return false;
    }
}

export async function validateTileType(gridId, x, y) {
  try {
    console.log(`Validating tile type at (${x}, ${y}) in grid ${gridId}`);
    const response = await axios.get(`${API_BASE}/api/get-tile/${gridId}/${x}/${y}`);
    console.log(`Tile type at (${x}, ${y}):`, response.data.tileType);
    return response.data.tileType;
  } catch (error) {
    console.error(`Error fetching tile type at (${x}, ${y}) in grid ${gridId}:`, error);
    throw error;
  }
}

export async function getTileResource(gridId, x, y) {
  try {
    console.log(`Fetching resource at (${x}, ${y}) in grid ${gridId}`);
    const response = await axios.get(`${API_BASE}/api/get-resource/${gridId}/${x}/${y}`);
    console.log(`Resource at (${x}, ${y}):`, response.data);
    return response.data;
  } catch (error) {
    console.error(`Error fetching resource at (${x}, ${y}) in grid ${gridId}:`, error);
    throw error;
  }
}

