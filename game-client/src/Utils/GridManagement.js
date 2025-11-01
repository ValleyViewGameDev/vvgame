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
import { earnTrophy } from '../GameFeatures/Trophies/TrophyUtils';
import { showNotification } from '../UI/Notifications/Notifications';
import locationChangeManager from './LocationChangeManager';

export const updateGridResource = async (
  gridId,
  resource,
  broadcast = true
) => {
  //console.log('UPDATE GRID RESOURCE; resource = ', resource);

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
    //console.log('UPDATE GRID RESOURCE; payload = ', payload);

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
    //console.log(`Converting tile at (${x}, ${y}) to type: ${newType}`);

    // Update the tile in the database
    const response = await axios.patch(`${API_BASE}/api/update-tile/${gridId}`, {
      x,
      y,
      newType,
    });

    if (response.data.success) {
      //console.log(`✅ Tile at (${x}, ${y}) successfully updated to ${newType} in the database.`);

      // ✅ Immediately update local state optimistically
      if (setTileTypes) {
        setTileTypes((prevTiles) => {
          const updated = mergeTiles(prevTiles, [{ x, y, type: newType }]);
          console.log("🌱 Optimistically updated tileTypes (emitter):", updated);
          return updated;
        });
      }

      //console.log('newType before emitter:', newType);
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
  closeAllPanels, // ✅ Add this prop
  updateStatus,
  bulkOperationContext, // ✅ Add bulk operation context
  masterResources = null, // ✅ Add masterResources for combat stat calculations
  strings = null, // ✅ Add strings for notifications
  masterTrophies = null // ✅ Add masterTrophies for trophy visibility checks
) => {

  // console.log("🔁 changePlayerLocation invoked. closeAllPanels =", !!closeAllPanels);
  // console.log("bulkOperationContext in changePlayerLocation:", bulkOperationContext);
  // console.log("isAnyBulkOperationActive:", bulkOperationContext?.isAnyBulkOperationActive?.());
  
  // Check if any bulk operation is active
  if (bulkOperationContext?.isAnyBulkOperationActive?.()) {
    // const activeOps = bulkOperationContext.getActiveBulkOperations();
    // console.log('🚫 Travel blocked: Bulk operation in progress', activeOps);
    if (updateStatus) {
      updateStatus(470); // "Bulk operation in progress"
    }
    return false;
  }

  // ✅ NEW: Check if location change is already in progress
  // Use consistent player ID format
  const playerId = currentPlayer._id?.toString() || currentPlayer.playerId;
  
  const changeRequest = {
    from: fromLocation,
    to: toLocation,
    playerId: playerId,
    timestamp: Date.now()
  };

  const canProceed = await locationChangeManager.requestLocationChange(changeRequest);
  if (!canProceed) {
    console.log('🚫 Location change blocked - another change in progress');
    if (updateStatus) {
      updateStatus('Location change in progress, please wait...');
    }
    return false;
  }
  
  // DEBUG: Log input parameters for changePlayerLocation
  // console.log('changePlayerLocation called with:', {
  //   currentPlayer,
  //   fromLocation,
  //   toLocation,
  //   TILE_SIZE,
  //   // ...other setters omitted for brevity...
  // });


  //console.log('🔄 changePlayerLocation called');
  //console.log('FROM:', { grid: fromLocation.g, type: fromLocation.gtype });
  //console.log('TO:', { grid: toLocation.g, type: toLocation.gtype });
  if (!fromLocation || !toLocation) {
    console.error('❌ Invalid fromLocation or toLocation');
    return;
  }

  try {

    // STEP 1: Close any open panels before grid transition
    if (closeAllPanels) {
      closeAllPanels();
      //console.log("🧹 Closed all panels before location change.");
    }

    // ✅ STEP 2: Update FROM grid's state (remove player using batch system)
    //console.log(`1️⃣ Removing player from grid ${fromLocation.g}`);

    //console.log('loading PCS gridstates from memory...');
    const inMemoryFromPlayerState = playersInGridManager.getPlayersInGrid(fromLocation.g)?.[playerId];
    //console.log('loading NPCS and PCS gridstates from db...');
    const fromGridResponse = await axios.get(`${API_BASE}/api/load-grid-state/${fromLocation.g}`);
    //console.log('fromGridResponse.data: ', fromGridResponse.data);
    const fromPCs = fromGridResponse.data?.playersInGrid?.pcs || {};
    //console.log('Extracted fromPCs from what we just loaded; fromPCs = ', fromPCs);
    const fromPlayerState = inMemoryFromPlayerState || fromPCs[playerId] || {};
    //console.log('fromPlayerState (prioritize what was in memory) = ', fromPlayerState);
    
    // Use robust removal system with immediate DB persistence to prevent ghost PCs
    await playersInGridManager.removePC(fromLocation.g, playerId);

    // ✅ STEP 3: Flush pending position updates before leaving grid
    if (fromLocation && fromLocation.g) {
      // Flush NPC position updates
      await NPCsInGridManager.flushGridPositionUpdates(fromLocation.g);
      console.log(`💾 Flushed pending NPC position updates for grid ${fromLocation.g}`);
      
      // Flush PC position updates
      await playersInGridManager.flushGridPositionUpdates(fromLocation.g);
      console.log(`💾 Flushed pending PC position updates for grid ${fromLocation.g}`);
    }

    // ✅ STEP 4: Emit AFTER saving to DB
    socket.emit('player-left-grid', {
      gridId: fromLocation.g,
      playerId: playerId,
      username: currentPlayer.username,
    });
    //console.log(`📢 Emitted [player-left-grid] for ${fromLocation.g}`);
  
    socket.emit('leave-grid', fromLocation.g);
    //console.log(`📢 Emitted [leave-grid] for grid: ${fromLocation.g}`);
      
    // ✅ STEP 5: Update TO grid's state (add player)

    //console.log(`2️⃣ Adding player to grid ${toLocation.g}`);
    //console.log('loading NPCsInGrid from db...');
    const toGridResponse = await axios.get(`${API_BASE}/api/load-grid-state/${toLocation.g}`);
    //console.log('toGridResponse.data: ', toGridResponse.data);
    const toPCs = toGridResponse.data?.playersInGrid?.pcs || {};
    //console.log('Extracted toPCs from what we just loaded; toPCs = ', toPCs);

    const now = Date.now();

    // ✅ STEP 6: Add the player to the `pcs` object`
    //console.log('IN CHANGE PLAYER LOCATION:  Adding player to the toPCs object')
    // Use combat stats from the fromGrid state if available, fallback to currentPlayer
    //console.log('🚨🚨🚨🚨fromPlayerState = ', fromPlayerState);
    //console.log('🚨🚨🚨🚨currentPlayer = ', currentPlayer);

    // REVERT: The issue is in how data is stored/loaded, not in changePlayerLocation
    console.log('🚨 [HP DEBUG] changePlayerLocation - HP calculation sources:');
    console.log('  fromPlayerState.hp:', fromPlayerState.hp);
    console.log('  currentPlayer.hp:', currentPlayer.hp);
    console.log('  fromPlayerState.maxhp:', fromPlayerState.maxhp);
    console.log('  currentPlayer.maxhp:', currentPlayer.maxhp);
    
    const finalHp = fromPlayerState.hp ?? currentPlayer.hp ?? 25;
    const finalMaxHp = fromPlayerState.maxhp ?? currentPlayer.maxhp ?? 25;
    
    console.log('🚨 [HP DEBUG] changePlayerLocation - Final HP values:');
    console.log('  Final HP:', finalHp, '(fallback triggered:', finalHp === 25, ')');
    console.log('  Final MaxHP:', finalMaxHp, '(fallback triggered:', finalMaxHp === 25, ')');
    
    const playerData = {
      playerId: playerId,
      type: 'pc',
      username: currentPlayer.username,
      position: { x: toLocation.x, y: toLocation.y },
      icon: currentPlayer.icon || '😀',
      hp: finalHp,
      maxhp: finalMaxHp,
      armorclass: fromPlayerState.armorclass ?? currentPlayer.armorclass ?? 10,
      attackbonus: fromPlayerState.attackbonus ?? currentPlayer.attackbonus ?? 0,
      damage: fromPlayerState.damage ?? currentPlayer.damage ?? 1,
      speed: fromPlayerState.speed ?? currentPlayer.speed ?? 1,
      attackrange: fromPlayerState.attackrange ?? currentPlayer.attackrange ?? 1,
      iscamping: fromPlayerState.iscamping ?? currentPlayer.iscamping ?? false,
      isinboat: fromPlayerState.isinboat ?? currentPlayer.isinboat ?? false,
      lastUpdated: now,
    };

    //console.log('📤 Constructed player data for adding:', playerData);

    // ✅ STEP 7: Join the socket room FIRST before any grid operations
    socket.emit('join-grid', { gridId: toLocation.g, playerId: playerId });
    //console.log(`📡 Emitted join-grid for grid: ${toLocation.g}`);
    
    // ✅ STEP 8: Add player to new grid with immediate DB persistence
    //console.log('📤 Adding player to new grid with immediate DB persistence...');
    await playersInGridManager.addPC(toLocation.g, playerId, playerData);

    socket.emit('player-joined-grid', {
      gridId: toLocation.g,
      playerId: playerId,
      username: currentPlayer.username,
      playerData,
    });
    //console.log(`📢 Emitted player-joined-grid for ${toLocation.g}`);
  

    // ✅ STEP 9: Update player location in player record on the DB
    //console.log('3️⃣ Updating player location...');
    const locationResponse = await axios.post(`${API_BASE}/api/update-player-location`, {
      playerId: playerId,
      location: toLocation,
    });

    if (!locationResponse.data.success) {
      throw new Error(locationResponse.data.error);
    }
    //console.log('✅ Player location updated in DB');

    // ✅ CHECK: First time visiting valley - award trophy and show notification
    if (toLocation.gtype && toLocation.gtype.startsWith('valley') && strings) {
      // Check if player has "Explore the Valley" trophy
      const hasValleyTrophy = currentPlayer.trophies?.some(trophy => trophy.name === "Explore the Valley");
      
      if (!hasValleyTrophy) {
        console.log('🏆 First time visiting valley - awarding "Explore the Valley" trophy');
        
        try {
          // Award the trophy
          const trophyResult = await earnTrophy(playerId, "Explore the Valley", 1, currentPlayer, masterTrophies, setCurrentPlayer);
          
          if (trophyResult.success) {
            // Show notification
            showNotification('Message', {
              title: strings[7002],
              message: strings[7021]
            });
            
            console.log('✅ Valley trophy awarded and notification shown');
          } else {
            console.warn('⚠️ Failed to award valley trophy:', trophyResult.error);
          }
        } catch (error) {
          console.error('❌ Error awarding valley trophy:', error);
        }
      }
    }

    // ✅ STEP 10: Update local state
    //console.log('4️⃣ Updating local Player Document...');
    const updatedPlayer = {
      ...currentPlayer,
      location: toLocation,
    };

    setCurrentPlayer(updatedPlayer);
    localStorage.setItem('player', JSON.stringify(updatedPlayer));

    // 5. Change grid context & fetch new grid data
    //console.log('5️⃣ Calling setGridId...');
    setGridId(toLocation.g);
    // WHAT does this ^^ do?

    // ✅ STEP 10.5: Final cleanup verification - ensure dead player is removed from old grid
    if (currentPlayer.hp <= 0) {
      console.log('⚰️ Player was dead - verifying cleanup from old grid');
      try {
        // Double-check removal with another API call to ensure cleanup
        await axios.post(`${API_BASE}/api/remove-single-pc`, {
          gridId: fromLocation.g,
          playerId: playerId,
        });
        console.log('✅ Dead player cleanup verified');
      } catch (cleanupError) {
        console.warn('⚠️ Cleanup verification failed, but continuing:', cleanupError);
      }
    }

    // ✅ STEP 11: Initialize the new grid, PCs and NPCs
    //console.log('!! Running initializeGridState and setGridState');
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
    //console.log('✅ New grid fully initialized');

    // ✅ STEP 12: Set username for the socket
    socket.emit('set-username', { username: currentPlayer.username });
    
    // Request current NPCController status to clear any stale controller data
    //console.log(`🎮 Requesting current NPCController for grid: ${toLocation.g}`);
    socket.emit('request-npc-controller', { gridId: toLocation.g });
    
    // ✅ STEP 13: Check if we need to find a signpost location
    let finalX = toLocation.x;
    let finalY = toLocation.y;
    
    if (toLocation.findSignpost) {
      console.log(`🔍 Looking for ${toLocation.findSignpost} on the destination grid...`);
      
      // Get the resources that were just loaded
      const currentResources = GlobalGridStateTilesAndResources.getResources();
      //console.log(`📦 Total resources loaded: ${currentResources.length}`);
      //console.log(`📦 Resources types: ${currentResources.map(r => r.type).join(', ')}`);
      
      const signpost = currentResources.find(res => res.type === toLocation.findSignpost);
      
      if (signpost) {
        //console.log(`✅ Found ${toLocation.findSignpost} at (${signpost.x}, ${signpost.y})`);
        finalX = signpost.x;
        finalY = signpost.y;
        
        // Update the player's position to the signpost location
        const updatedPlayerData = {
          ...playerData,
          position: { x: finalX, y: finalY }
        };
        
        // Update local state
        playersInGridManager.updatePC(toLocation.g, playerId, updatedPlayerData);
        
        // Update database
        await axios.post(`${API_BASE}/api/save-single-pc`, {
          gridId: toLocation.g,
          playerId: playerId,
          pc: updatedPlayerData,
          lastUpdated: Date.now(),
        });
        
        // Emit updated position
        socket.emit('player-moved', {
          gridId: toLocation.g,
          playerId: playerId,
          position: { x: finalX, y: finalY },
          username: currentPlayer.username,
        });
      } else {
        console.log(`⚠️ ${toLocation.findSignpost} not found on destination grid, using default position (0, 0)`);
      }
    }
    
    // ✅ STEP 14: Center view on player

    centerCameraOnPlayer({ x: finalX, y: finalY }, TILE_SIZE);

    // ✅ STEP 15: Update status bar with new grid info
    if (updateStatus && toLocation.gtype) {
      await updateGridStatus(toLocation.gtype, null, updateStatus, currentPlayer, toLocation.g);
    }

    console.log('✅ Location change complete');
    
    // ✅ NEW: Mark location change as completed
    locationChangeManager.completeLocationChange({
      from: fromLocation,
      to: toLocation,
      playerId: playerId,
      success: true
    });
    
    return true;
  } catch (error) {
    console.error('❌ Location change error:', error);
    
    // ✅ NEW: Mark location change as failed
    locationChangeManager.failLocationChange(error);
    
    throw error;
  } 
};




export async function fetchGridData(gridId, updateStatus, DBPlayerData) {
  try {
    //console.log(`Fetching grid data for gridId: ${gridId}`);

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

    return { ...gridData, NPCsInGrid: combinedGridState }; // Return the full grid data with combined NPCsInGrid
  } catch (error) {
    console.error('Error fetching grid data:', error);
    if (updateStatus) updateStatus('Failed to load grid data');
    return {};
  }
}




// Separate function for status updates
export async function updateGridStatus(gridType, ownerUsername, updateStatus, currentPlayer = null, gridId = null) {
  if (!updateStatus) return;

  console.log("😀😀 UPDATING GRID STATUS message");
  switch (gridType) {
    case 'homestead':
      // If we have currentPlayer and gridId, check if it's their homestead
      if (currentPlayer && gridId) {
        const { username } = await fetchHomesteadOwner(gridId);
        if (username === currentPlayer.username) {
          updateStatus(112); // "You're home."
          return;
        }
        ownerUsername = username;
      }
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
