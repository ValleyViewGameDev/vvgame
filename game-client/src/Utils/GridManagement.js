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
  console.log('UPDATE GRID RESOURCE; resource = ', resource);
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
    console.log('UPDATE GRID RESOURCE; payload = ', payload);

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
    // 1. Update gridState in DB
    const gridStateUpdate = {
      playerId: currentPlayer._id,
      fromGridId: fromLocation.g,
      toGridId: toLocation.g,
      playerData: {
        playerId: currentPlayer._id,
        username: currentPlayer.username,
        position: { x: toLocation.x, y: toLocation.y },
        icon: currentPlayer.icon,
        hp: currentPlayer.hp,
        maxhp: currentPlayer.maxhp,
        armorclass: currentPlayer.armorclass,
        attackbonus: currentPlayer.attackbonus,
        damage: currentPlayer.damage,
        speed: currentPlayer.speed,
        attackrange: currentPlayer.attackrange,
        iscamping: currentPlayer.iscamping,
      }
    };

    const response = await axios.post(`${API_BASE}/api/update-grid-state`, gridStateUpdate);
    
    if (response.data.success) {
      // 2. Emit socket updates for both grids
      if (fromLocation.g) {
        socket.emit('player-left-grid', {
          gridId: fromLocation.g,
          playerId: currentPlayer._id,
          gridState: response.data.fromGridState
        });
      }
      
      if (toLocation.g) {
        socket.emit('player-joined-grid', {
          gridId: toLocation.g,
          playerId: currentPlayer._id,
          playerData: gridStateUpdate.playerData,
          gridState: response.data.toGridState
        });
      }
    }

    // 3. Update player location in DB
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

    const locationResponse = await axios.post(`${API_BASE}/api/update-player-location`, payload);
    
    if (!locationResponse.data.success) {
      throw new Error(locationResponse.data.error);
    }

    // 4. Update local state
    const updatedPlayer = {
      ...currentPlayer,
      location: toLocation
    };

    setCurrentPlayer(updatedPlayer);
    localStorage.setItem("player", JSON.stringify(updatedPlayer));

    // 5. Change grid context & fetch new grid data
    setGridId(toLocation.g);
    await initializeGrid(TILE_SIZE, toLocation.g, setGrid, setResources, setTileTypes);

    // 6. Center view on player
    const gameContainer = document.querySelector(".homestead");
    if (gameContainer) {
      const centerX = toLocation.x * TILE_SIZE - window.innerWidth / 2;
      const centerY = toLocation.y * TILE_SIZE - window.innerHeight / 2;
      gameContainer.scrollTo({
        left: centerX,
        top: centerY,
        behavior: "instant"
      });
    }

  } catch (error) {
    console.error('❌ Location change error:', error);
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