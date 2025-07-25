import API_BASE from '../config';
import axios from 'axios';
import { initializeGrid } from '../AppInit';
import NPCsInGridManager from '../GridState/GridStateNPCs';
import playersInGridManager from '../GridState/PlayersInGrid';
import socket from '../socketManager'; // ⚠️ At top of file if not already present
import GlobalGridStateTilesAndResources from '../GridState/GlobalGridStateTilesAndResources';
import { mergeResources, mergeTiles } from './ResourceHelpers';
import { centerCameraOnPlayer } from '../PlayerMovement';
import { closePanel } from '../UI/PanelContext';
import { fetchHomesteadOwner } from './worldHelpers';

export const updateGridResource = async (
  gridId,
  resource,
  broadcast = true
) => {
  console.log('UPDATE GRID RESOURCE; resource = ', resource);

  try {
    const { x, y, growEnd, craftEnd, craftedItem, type } = resource;
    
    // ✅ 1. Flat payload — no "newResource" key
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

    // ✅ 2. Update the database
    const response = await axios.patch(`${API_BASE}/api/update-grid/${gridId}`, payload);
    if (!response.data.success) throw new Error('Failed DB update');

    // ✅ 3. Emit to other clients
    if (broadcast && socket && socket.emit) {
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
  closeAllPanels // ✅ Add this prop
) => {

  console.log("🔁 changePlayerLocation invoked. closeAllPanels =", !!closeAllPanels);
  
  // DEBUG: Log input parameters for changePlayerLocation
  console.log('changePlayerLocation called with:', {
    currentPlayer,
    fromLocation,
    toLocation,
    TILE_SIZE,
    // ...other setters omitted for brevity...
  });


  console.log('🔄 changePlayerLocation called');
  console.log('FROM:', { grid: fromLocation.g, type: fromLocation.gtype });
  console.log('TO:', { grid: toLocation.g, type: toLocation.gtype });
  if (!fromLocation || !toLocation) {
    console.error('❌ Invalid fromLocation or toLocation');
    return;
  }

  try {

    // STEP 1: Close any open panels before grid transition
    if (closeAllPanels) {
      closeAllPanels();
      console.log("🧹 Closed all panels before location change.");
    }

    // ✅ STEP 2: Update FROM grid's state (remove player)
    console.log(`1️⃣ Removing player from grid ${fromLocation.g}`);

    console.log('loading PCS gridstates from memory...');
    const inMemoryFromPlayerState = playersInGridManager.getPlayersInGrid(fromLocation.g)?.[currentPlayer.playerId];
    console.log('loading NPCS and PCS gridstates from db...');
    const fromGridResponse = await axios.get(`${API_BASE}/api/load-grid-state/${fromLocation.g}`);
    console.log('fromGridResponse.data: ', fromGridResponse.data);
    const fromPCs = fromGridResponse.data?.playersInGrid?.pcs || {};
    console.log('Extracted fromPCs from what we just loaded; fromPCs = ', fromPCs);
    const fromPlayerState = inMemoryFromPlayerState || fromPCs[currentPlayer.playerId] || {};
    console.log('fromPlayerState (prioritize what was in memory) = ', fromPlayerState);
    console.log('Removing player from the fromPCs.');
    if (fromPCs[currentPlayer.playerId]) {
      delete fromPCs[currentPlayer.playerId];
    }

    console.log('📤 Calling /remove-single-pc route to remove player from grid...');
    await axios.post(`${API_BASE}/api/remove-single-pc`, {
      gridId: fromLocation.g,
      playerId: currentPlayer.playerId,
    });

    // ✅ STEP 3: Emit AFTER saving to DB
    socket.emit('player-left-grid', {
      gridId: fromLocation.g,
      playerId: currentPlayer.playerId,
      username: currentPlayer.username,
    });
    console.log(`📢 Emitted [player-left-grid] for ${fromLocation.g}`);
  
    socket.emit('leave-grid', fromLocation.g);
    console.log(`📢 Emitted [leave-grid] for grid: ${fromLocation.g}`);
      
    // ✅ STEP 4: Update TO grid's state (add player)

    console.log(`2️⃣ Adding player to grid ${toLocation.g}`);
    console.log('loading NPCsInGrid from db...');
    const toGridResponse = await axios.get(`${API_BASE}/api/load-grid-state/${toLocation.g}`);
    console.log('toGridResponse.data: ', toGridResponse.data);
    const toPCs = toGridResponse.data?.playersInGrid?.pcs || {};
    console.log('Extracted toPCs from what we just loaded; toPCs = ', toPCs);

    const now = Date.now();

    // ✅ STEP 5: Add the player to the `pcs` object`
    console.log('IN CHANGE PLAYER LOCATION:  Adding player to the toPCs object')
    // Use combat stats from the fromGrid state if available, fallback to currentPlayer
    console.log('🚨🚨🚨🚨fromPlayerState = ', fromPlayerState);
    console.log('🚨🚨🚨🚨currentPlayer = ', currentPlayer);

    const playerData = {
      playerId: currentPlayer.playerId,
      type: 'pc',
      username: currentPlayer.username,
      position: { x: toLocation.x, y: toLocation.y },
      icon: currentPlayer.icon || '😀',
      hp: fromPlayerState.hp ?? currentPlayer.hp ?? 25,
      maxhp: fromPlayerState.maxhp ?? currentPlayer.maxhp ?? 25,
      armorclass: fromPlayerState.armorclass ?? currentPlayer.armorclass ?? 10,
      attackbonus: fromPlayerState.attackbonus ?? currentPlayer.attackbonus ?? 0,
      damage: fromPlayerState.damage ?? currentPlayer.damage ?? 1,
      speed: fromPlayerState.speed ?? currentPlayer.speed ?? 1,
      attackrange: fromPlayerState.attackrange ?? currentPlayer.attackrange ?? 1,
      iscamping: fromPlayerState.iscamping ?? currentPlayer.iscamping ?? false,
      isinboat: fromPlayerState.isinboat ?? currentPlayer.isinboat ?? false,
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

    // ✅ STEP 6: Save only this PC to DB
    console.log('📤 Saving single PC to grid...');
    await axios.post(`${API_BASE}/api/save-single-pc`, toPayload);

    socket.emit('player-joined-grid', {
      gridId: toLocation.g,
      playerId: currentPlayer.playerId,
      username: currentPlayer.username,
      playerData,
    });
    console.log(`📢 Emitted player-joined-grid for ${toLocation.g}`);
  

    // ✅ STEP 7: Update player location in player record on the DB
    console.log('3️⃣ Updating player location...');
    const locationResponse = await axios.post(`${API_BASE}/api/update-player-location`, {
      playerId: currentPlayer.playerId,
      location: toLocation,
    });

    if (!locationResponse.data.success) {
      throw new Error(locationResponse.data.error);
    }
    console.log('✅ Player location updated in DB');

    // ✅ STEP 8: Update local state
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

    // ✅ STEP 9: Initialize the new grid, PCs and NPCs
    console.log('!! Running initializeGridState and setGridState');
    await Promise.all([
      initializeGrid(TILE_SIZE, toLocation.g, setGrid, setResources, setTileTypes, updateStatus, currentPlayer),
      (async () => {
        try {
          await NPCsInGridManager.initializeGridState(toLocation.g);
          await playersInGridManager.initializePlayersInGrid(toLocation.g);  
          const freshGridState = NPCsInGridManager.getNPCsInGrid(toLocation.g);
          const freshPCState = playersInGridManager.getPlayersInGrid(toLocation.g);

          NPCsInGridManager.setGridStateReact({ [toLocation.g]: {
            npcs: freshGridState,
            NPCsInGridLastUpdated: Date.now(),
          }});
          playersInGridManager.setPlayersInGridReact({ [toLocation.g]: {
            pcs: freshPCState,
            playersInGridLastUpdated: Date.now(),
          }});     

        } catch (err) {
          console.error('❌ Error initializing playersInGrid:', err);
        }
      })(),
    ]);
    console.log('✅ New grid fully initialized');

    // ✅ STEP 10: Ensure the client joins the new grid room
    socket.emit('join-grid', { gridId: toLocation.g, playerId: currentPlayer.playerId });
    console.log(`📡 Emitted join-grid for grid: ${toLocation.g}`);
    socket.emit('set-username', { username: currentPlayer.username });
    
    // ✅ STEP 11: Center view on player
    console.log('6️⃣ Centering view...');

    centerCameraOnPlayer({ x: toLocation.x, y: toLocation.y }, TILE_SIZE);

    console.log('✅ Location change complete');
  } catch (error) {
    console.error('❌ Location change error:', error);
    throw error;
  } 
};




export async function fetchGridData(gridId, updateStatus, DBPlayerData) {
  try {
    console.log(`Fetching grid data for gridId: ${gridId}`);

    // 1) Fetch the grid data (which now has separate playersInGrid and NPCsInGrid)
    const gridResponse = await axios.get(`${API_BASE}/api/load-grid/${gridId}`);
    const gridData = gridResponse.data || {};
    const { gridType, _id: fetchedGridId, ownerId, playersInGrid, NPCsInGrid } = gridData;

    console.log('Fetched grid data:', gridData);

    // 2) Combine playersInGrid and NPCsInGrid into a single NPCsInGrid
    const combinedGridState = {
      pcs: playersInGrid?.pcs || {},
      npcs: NPCsInGrid?.npcs || {},
    };

    if (["valley0", "valley1", "valley2", "valley3"].includes(gridType)) {
        updateStatus(16);
      } else if (gridType === "town") {
        updateStatus(111);
      } else {
        const { username, gridType } = await fetchHomesteadOwner(gridId);
        if (username === DBPlayerData.username) { updateStatus(112) }
        else { updateGridStatus(gridType, username, updateStatus) };
      }

    return { ...gridData, NPCsInGrid: combinedGridState }; // Return the full grid data with combined NPCsInGrid
  } catch (error) {
    console.error('Error fetching grid data:', error);
    if (updateStatus) updateStatus('Failed to load grid data');
    return {};
  }
}




// Separate function for status updates
export function updateGridStatus(gridType, ownerUsername, updateStatus) {
  if (!updateStatus) return;

  console.log("😀😀 UPDATING GRID STATUS message");
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
