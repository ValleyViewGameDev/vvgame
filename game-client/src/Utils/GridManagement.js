import API_BASE from '../config';
import axios from 'axios';
import { initializeGrid } from '../AppInit';
import gridStateManager from '../GridState/GridState';
import socket from '../socketManager'; // ⚠️ At top of file if not already present
import GlobalGridState from '../GridState/GlobalGridState';
import { mergeResources, mergeTiles } from './ResourceHelpers';
import { enrichResourceFromMaster } from './ResourceHelpers';

export const updateGridResource = async (
  gridId,
  resource,
  setResources = null,
  broadcast = true
) => {
  console.log('UPDATE GRID RESOURCE; resource = ',resource);
  try {
    const { x, y, growEnd, craftEnd, craftedItem, type } = resource;
    // ✅ Flat payload — no "newResource" key
    const payload = {
      resource: {
        type,
        x,
        y,
        ...(growEnd !== undefined && { growEnd }),
        ...(craftEnd !== undefined && { craftEnd }),
        ...(craftedItem !== undefined && { craftedItem }),
      },
      broadcast, // optional - depending on your server usage
    };
    console.log('UPDATE GRID RESOURCE; payload = ',payload);

    // ✅ 1. Update the database
    const response = await axios.patch(`${API_BASE}/api/update-grid/${gridId}`, payload);
    if (!response.data.success) throw new Error('Failed DB update');

    // ✅ 2. Update GlobalGridState
    const prevResources = GlobalGridState.getResources();
    const updatedResource = resource
    ? {
        type: typeof resource === 'string' ? resource : resource.type,
        x,
        y,
        ...(resource.growEnd && { growEnd: resource.growEnd }),
        ...(resource.craftEnd && { craftEnd: resource.craftEnd }),
        ...(resource.craftedItem && { craftedItem: resource.craftedItem }),
      }
    : null;

// // WE DON'T NEED TO ENRICH THE RESOURCE OR UPDATE LOCAL STATE
// // BECAUSE THE SOCKET LISTENER IN APP.JS IS DOING THIS

    // // Skip if type is null -- this means we are just removing the resource
    // if (updatedResource?.type === null) {
    //   const cleaned = prevResources.filter(r => !(r.x === x && r.y === y));
    //   GlobalGridState.setResources(cleaned);
    //   if (setResources) setResources(cleaned);      // ✅ 3. Update local React state
    // } else {
    //   const merged = mergeResources(prevResources, [updatedResource]);
    //   GlobalGridState.setResources(merged);
    //   if (setResources) setResources(merged);      // ✅ 3. Update local React state
    // }

    // ✅ 4. Emit to other clients
    if (broadcast && socket && socket.emit) {
      console.log("📡 Emitting update-tile-resource from updateGridResource:");
      console.log("GridId:", gridId);
      console.log("Resource:", resource);
      
      socket.emit('update-resource', {
        gridId,
        updatedResources: [updatedResource?.type === null ? { x, y, type: null } : updatedResource],
      });
    }

    return { success: true };
  } catch (error) {
    console.error('❌ Error in updateGridResource:', error);
    return { success: false };
  }
};


export const convertTileType = async (gridId, x, y, newType, setTileTypes = null) => {
  try {
    console.log(`Converting tile at (${x}, ${y}) to type: ${newType}`);

    // Update the tile in the database
    const response = await axios.patch(`${API_BASE}/api/update-tile/${gridId}`, {
      x,
      y,
      newType,
    });

    if (response.data.success) {
      console.log(`✅ Tile at (${x}, ${y}) successfully updated to ${newType} in the database.`);

      // ✅ Immediately update local state optimistically
      if (setTileTypes) {
        setTileTypes((prevTiles) => {
          const updated = mergeTiles(prevTiles, [{ x, y, type: newType }]);
          console.log("🌱 Optimistically updated tileTypes (emitter):", updated);
          return updated;
        });
      }

      console.log('newType before emitter:', newType);
      // Emit the change to all connected clients via the socket
      socket.emit('update-tile', {
        gridId,
        updatedTiles: [{ x, y, type: newType }],
      });
    } else {
      console.error(`❌ Failed to update tile at (${x}, ${y}):`, response.data.message);
    }
  } catch (error) {
    console.error(`❌ Error converting tile at (${x}, ${y}):`, error);
  }
};


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
) => {  
  try {
    // Add validation logging
    console.log('📝 Change Location Request:');
    console.log('Current Player:', {
      id: currentPlayer?._id,
      playerId: currentPlayer?.playerId,
      location: currentPlayer?.location
    });
    console.log('From Location:', fromLocation);
    console.log('To Location:', toLocation);

    // Validate all required fields
    if (!toLocation?.g || !toLocation?.s || !toLocation?.f || !toLocation?.gtype) {
      throw new Error(`Missing required location fields: ${JSON.stringify(toLocation)}`);
    }

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
      location: {
        x: toLocation.x || 1,
        y: toLocation.y || 1,
        g: toLocation.g,
        s: toLocation.s,
        f: toLocation.f,
        gtype: toLocation.gtype,
        gridCoord: toLocation.gridCoord
      }
    };

    console.log('🚀 Sending location update payload:', payload);
    
    const response = await axios.post(`${API_BASE}/api/update-player-location`, payload);
    
    console.log('📥 Location update response:', response.data);

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

    // After initializing the grid and before reloading
    const gameContainer = document.querySelector(".homestead");
    if (gameContainer) {
      // Calculate center position based on the player's new position
      const centerX = toLocation.x * TILE_SIZE - window.innerWidth / 2;
      const centerY = toLocation.y * TILE_SIZE - window.innerHeight / 2;

      // Scroll to player position
      gameContainer.scrollTo({
        left: centerX,
        top: centerY,
        behavior: "instant" // Use "instant" instead of "smooth" for immediate centering
      });
    }
    
    //window.location.reload();
    
    // return updatedPlayer;
  } 
  catch (error) {
    console.error('❌ Location change error details:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
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
    case 'valley0':
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

export function getCurrentTileCoordinates(gridId, currentPlayer) {
  const gridState = gridStateManager.getGridState(gridId);
  if (!gridState || !currentPlayer?.playerId) {
    console.warn('⚠️ GridState or playerId missing.');
    return null;
  }
  const playerData = gridState.pcs?.[currentPlayer.playerId];
  if (!playerData) {
    console.warn('⚠️ Player not found in gridState.');
    return null;
  }
  const { x, y } = playerData.position;
  if (x == null || y == null) {
    console.warn('⚠️ Invalid player position.');
    return null;
  }
  const tileX = Math.floor(x);
  const tileY = Math.floor(y);
  return { tileX, tileY };
}