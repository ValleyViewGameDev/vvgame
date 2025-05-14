import API_BASE from '../config';
import axios from 'axios';
import { initializeGrid } from '../AppInit';
import gridStateManager from '../GridState/GridStateNPCs';
import gridStatePCManager from '../GridState/GridStatePCs';
import socket from '../socketManager'; // ⚠️ At top of file if not already present
import GlobalGridStateTilesAndResources from '../GridState/GlobalGridStateTilesAndResources';
import { mergeResources, mergeTiles } from './ResourceHelpers';

export const updateGridResource = async (
  gridId,
  resource,
  broadcast = true
) => {
  console.log('UPDATE GRID RESOURCE; resource = ', resource);

  try {
    const { x, y, growEnd, craftEnd, craftedItem, type } = resource;
    
    // ✅ 1. Optimistically update GlobalGridStateTilesAndResources
    const prevResources = GlobalGridStateTilesAndResources.getResources();
    let updatedResources;
    if (resource?.type === null) {
      updatedResources = prevResources.filter((r) => !(r.x === x && r.y === y));
    } else {
      updatedResources = mergeResources(prevResources, [resource]);
    }
    GlobalGridStateTilesAndResources.setResources(updatedResources);

    // ✅ 2. Flat payload — no "newResource" key
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

    // ✅ 3. Update the database
    const response = await axios.patch(`${API_BASE}/api/update-grid/${gridId}`, payload);
    if (!response.data.success) throw new Error('Failed DB update');

    // ✅ 4. Emit to other clients
    if (broadcast && socket && socket.emit) {
      console.log("📡 Emitting update-tile-resource from updateGridResource:");
      console.log("GridId:", gridId);
      console.log("Resource:", resource);

      socket.emit('update-resource', {
        gridId,
        updatedResources: [resource?.type === null ? { x, y, type: null } : resource],
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
  setGridId,
  setGrid,
  setTileTypes,
  setResources,
  TILE_SIZE,
  updateStatus,
) => {
  // DEBUG: Log input parameters for changePlayerLocation
  console.log('changePlayerLocation called with:', {
    currentPlayer,
    fromLocation,
    toLocation,
    TILE_SIZE,
    // ...other setters omitted for brevity...
  });

  try {
    console.log('🔄 changePlayerLocation called');
    console.log('FROM:', { grid: fromLocation.g, type: fromLocation.gtype });
    console.log('TO:', { grid: toLocation.g, type: toLocation.gtype });

// 1. Update FROM grid's state (remove player)
    if (fromLocation.g) {
      console.log(`1️⃣ Removing player from grid ${fromLocation.g}`);
      console.log('loading gridState from db...');
      const fromGridResponse = await axios.get(`${API_BASE}/api/load-grid-state/${fromLocation.g}`);
      console.log('fromGridResponse.data: ', fromGridResponse.data);

      // Extract gridStatePCs and ensure it is properly structured
      const fromPCs = fromGridResponse.data?.gridStatePCs?.pcs || {};
      console.log('Extracted fromPCs out of the gridState we just loaded; fromPCs = ', fromPCs);

      // Remove the player from the `pcs` object
      console.log('Removing player from the fromPCs.');
      if (fromPCs[currentPlayer.playerId]) {
        delete fromPCs[currentPlayer.playerId];
      }

      console.log('📤 Calling /remove-single-pc route to remove player from grid...');
      await axios.post(`${API_BASE}/api/remove-single-pc`, {
        gridId: fromLocation.g,
        playerId: currentPlayer.playerId,
      });

      // Emit AFTER saving to DB
      socket.emit('player-left-grid', {
        gridId: fromLocation.g,
        playerId: currentPlayer.playerId,
        username: currentPlayer.username,
      });
      console.log(`📢 Emitted [player-left-grid] for ${fromLocation.g}`);
    }
      socket.emit('leave-grid', fromLocation.g);
      console.log(`📢 Emitted [leave-grid] for grid: ${fromLocation.g}`);
      
// 2. Update TO grid's state (add player)

    if (toLocation.g) {
      console.log(`2️⃣ Adding player to grid ${toLocation.g}`);
      console.log('loading gridState from db...');
      const toGridResponse = await axios.get(`${API_BASE}/api/load-grid-state/${toLocation.g}`);
      console.log('toGridResponse.data: ', toGridResponse.data);

      // Extract gridStatePCs and ensure it is properly structured
      const toPCs = toGridResponse.data?.gridStatePCs?.pcs || {};
      console.log('Extracted toPCs from what we just loaded; toPCs = ', toPCs);

      const now = Date.now();

      // Add the player to the `pcs` object`
      console.log('Adding player to the toPCs object')
      const playerData = {
        playerId: currentPlayer.playerId,
        type: 'pc',
        username: currentPlayer.username,
        position: { x: toLocation.x, y: toLocation.y },
        icon: currentPlayer.icon || '😀',
        hp: currentPlayer.hp || 25,
        maxhp: currentPlayer.maxhp || 25,
        armorclass: currentPlayer.armorclass || 10,
        attackbonus: currentPlayer.attackbonus || 0,
        damage: currentPlayer.damage || 1,
        speed: currentPlayer.speed || 1,
        attackrange: currentPlayer.attackrange || 1,
        iscamping: currentPlayer.iscamping || false,
        lastUpdated: now,
      };

      // Construct the payload
      const toPayload = {
        gridId: toLocation.g,
        playerId: currentPlayer.playerId,
        pc: playerData,
        lastUpdated: now,
      };
      console.log('📤 Constructed Payload for adding player:', toPayload);

      // ✅ Save only this PC to DB
      console.log('📤 Saving single PC to grid...');
      await axios.post(`${API_BASE}/api/save-single-pc`, toPayload);

      socket.emit('player-joined-grid', {
        gridId: toLocation.g,
        playerId: currentPlayer.playerId,
        username: currentPlayer.username,
        playerData,
      });
      console.log(`📢 Emitted player-joined-grid for ${toLocation.g}`);
    }

// 3. Update player location in player record on the DB
    console.log('3️⃣ Updating player location...');
    const locationResponse = await axios.post(`${API_BASE}/api/update-player-location`, {
      playerId: currentPlayer.playerId,
      location: toLocation,
    });

    if (!locationResponse.data.success) {
      throw new Error(locationResponse.data.error);
    }
    console.log('✅ Player location updated in DB');

    // 4. Update local state
    console.log('4️⃣ Updating local Player Document...');
    const updatedPlayer = {
      ...currentPlayer,
      location: toLocation,
    };

    setCurrentPlayer(updatedPlayer);
    localStorage.setItem('player', JSON.stringify(updatedPlayer));

    // 5. Change grid context & fetch new grid data
    console.log('5️⃣ Calling setGridId...');
    setGridId(toLocation.g);
    // WHAT does this ^^ do?

    // Run these in parallel
    console.log('!! Running initializeGridState and setGridState');
    await Promise.all([
      initializeGrid(TILE_SIZE, toLocation.g, setGrid, setResources, setTileTypes, updateStatus),
      (async () => {
        try {
          await gridStateManager.initializeGridState(toLocation.g);
          await gridStatePCManager.initializeGridStatePCs(toLocation.g);  
          const freshGridState = gridStateManager.getGridState(toLocation.g);
          const freshPCState = gridStatePCManager.getGridStatePCs(toLocation.g);

          gridStateManager.setGridStateReact({ [toLocation.g]: {
            npcs: freshGridState,
            gridStateNPCsLastUpdated: Date.now(),
          }});
          gridStatePCManager.setGridStatePCsReact({ [toLocation.g]: {
            pcs: freshPCState,
            gridStatePCsLastUpdated: Date.now(),
          }});     

        } catch (err) {
          console.error('❌ Error initializing gridStatePCs:', err);
        }
      })(),
    ]);
    console.log('✅ New grid fully initialized');

    // Ensure the client joins the new grid room
    // Is this placed correctly?
    socket.emit('join-grid', { gridId: toLocation.g, playerId: currentPlayer.playerId });
    console.log(`📡 Emitted join-grid for grid: ${toLocation.g}`);
    socket.emit('set-username', { username: currentPlayer.username });
    
    // 6. Center view on player
    console.log('6️⃣ Centering view...');
    const gameContainer = document.querySelector('.homestead');
    if (gameContainer) {
      const centerX = toLocation.x * TILE_SIZE - window.innerWidth / 2;
      const centerY = toLocation.y * TILE_SIZE - window.innerHeight / 2;
      gameContainer.scrollTo({
        left: centerX,
        top: centerY,
        behavior: 'instant',
      });
    }
    console.log('✅ Location change complete');
  } catch (error) {
    console.error('❌ Location change error:', error);
    throw error;
  } 
};

export async function fetchGridData(gridId, updateStatus) {
  try {
    console.log(`Fetching grid data for gridId: ${gridId}`);

    // 1) Fetch the grid data (which now has separate gridStatePCs and gridStateNPCs)
    const gridResponse = await axios.get(`${API_BASE}/api/load-grid/${gridId}`);
    const gridData = gridResponse.data || {};
    const { gridType, _id: fetchedGridId, ownerId, gridStatePCs, gridStateNPCs } = gridData;

    console.log('Fetched grid data:', gridData);

    // 2) Combine gridStatePCs and gridStateNPCs into a single gridState
    const combinedGridState = {
      pcs: gridStatePCs?.pcs || {},
      npcs: gridStateNPCs?.npcs || {},
    };

    // 3) Update the status bar (e.g., "Welcome to Oberon's homestead")
    let username = null;
    if (gridType === 'homestead' && ownerId) {
      username = ownerId.username || 'Unknown';
    }
    updateGridStatus(gridType, username, updateStatus);

    return { ...gridData, gridState: combinedGridState }; // Return the full grid data with combined gridState
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
