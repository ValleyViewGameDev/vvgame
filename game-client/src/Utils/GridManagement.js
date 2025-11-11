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
import SVGAssetManager from '../Render/SVGAssetManager';

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

  console.log('🚀 [GRID TRANSITION] Starting transactional grid change...');
  
  // Check if any bulk operation is active
  if (bulkOperationContext?.isAnyBulkOperationActive?.()) {
    if (updateStatus) {
      updateStatus(470); // "Bulk operation in progress"
    }
    return false;
  }

  // ✅ NEW: Check if location change is already in progress
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

  // ================================
  // PHASE 1: PREPARATION
  // ================================
  console.log('📋 [PHASE 1] PREPARATION - Disabling interaction and showing loading');
  
  // Disable user interaction and show loading screen
  if (updateStatus) {
    updateStatus('Traveling...');
  }
  
  // Close all panels before transition
  if (closeAllPanels) {
    closeAllPanels();
  }
  
  // Store current state for rollback if needed
  const rollbackState = {
    gridId: fromLocation.g,
    tiles: GlobalGridStateTilesAndResources.getTiles(),
    resources: GlobalGridStateTilesAndResources.getResources(),
    playerState: playersInGridManager.getPlayersInGrid(fromLocation.g)?.[playerId]
  };

  if (!fromLocation || !toLocation) {
    console.error('❌ Invalid fromLocation or toLocation');
    locationChangeManager.failLocationChange(new Error('Invalid locations'));
    return false;
  }

  try {
    // ================================
    // PHASE 2: CLEANUP
    // ================================
    console.log('🧹 [PHASE 2] CLEANUP - Removing from old grid and flushing updates');
    
    if (updateStatus) {
      updateStatus('Leaving current area...');
    }

    // Get player state before removal for stat preservation
    const inMemoryFromPlayerState = playersInGridManager.getPlayersInGrid(fromLocation.g)?.[playerId];
    const fromGridResponse = await axios.get(`${API_BASE}/api/load-grid-state/${fromLocation.g}`);
    const fromPCs = fromGridResponse.data?.playersInGrid?.pcs || {};
    const fromPlayerState = inMemoryFromPlayerState || fromPCs[playerId] || {};
    
    console.log('💾 [CLEANUP] Preserving player state:', fromPlayerState);

    // Flush all pending updates BEFORE removing player
    console.log('💾 [CLEANUP] Flushing pending position updates...');
    await Promise.all([
      NPCsInGridManager.flushGridPositionUpdates(fromLocation.g),
      playersInGridManager.flushGridPositionUpdates(fromLocation.g)
    ]);
    
    // Stop all timers and intervals for the old grid to prevent memory accumulation
    console.log('🕐 [CLEANUP] Stopping all timers and intervals for old grid...');
    try {
      NPCsInGridManager.stopGridTimer();
      playersInGridManager.stopBatchSaving();
      console.log('✅ [CLEANUP] Timers stopped successfully');
    } catch (timerError) {
      console.warn('⚠️ [CLEANUP] Error stopping timers:', timerError);
    }

    // Remove player from old grid with immediate DB persistence
    console.log('🚫 [CLEANUP] Removing player from old grid...');
    await playersInGridManager.removePC(fromLocation.g, playerId);

    // Emit socket events for leaving
    socket.emit('player-left-grid', {
      gridId: fromLocation.g,
      playerId: playerId,
      username: currentPlayer.username,
    });
    socket.emit('leave-grid', fromLocation.g);
    
    // ================================
    // PHASE 3: LOAD NEW DATA
    // ================================
    console.log('📦 [PHASE 3] LOAD - Loading new grid data completely');
    
    if (updateStatus) {
      updateStatus('Loading new area...');
    }

    // Load grid state data
    console.log('📡 [LOAD] Fetching grid state data...');
    const toGridResponse = await axios.get(`${API_BASE}/api/load-grid-state/${toLocation.g}`);
    
    // Pre-load grid data to validate it exists, but don't apply to state yet
    console.log('📡 [LOAD] Pre-loading grid data for validation...');
    const gridDataResponse = await axios.get(`${API_BASE}/api/load-grid/${toLocation.g}`);
    const newTilesData = gridDataResponse.data?.tiles || [];
    const newResourcesData = gridDataResponse.data?.resources || [];
    
    const toPCs = toGridResponse.data?.playersInGrid?.pcs || {};
    
    // Prepare player data with preserved combat stats
    const now = Date.now();
    
    console.log('👤 [LOAD] Preparing player data with preserved stats...');
    console.log('  fromPlayerState.hp:', fromPlayerState.hp);
    console.log('  fromPlayerState.maxhp:', fromPlayerState.maxhp);
    
    const finalHp = fromPlayerState.hp ?? currentPlayer.hp ?? 25;
    const finalMaxHp = fromPlayerState.maxhp ?? currentPlayer.maxhp ?? 25;
    
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
    
    // ================================
    // PHASE 4: VALIDATION
    // ================================
    console.log('✅ [PHASE 4] VALIDATION - Verifying all data loaded successfully');
    
    if (updateStatus) {
      updateStatus('Validating new area...');
    }
    
    // Validate that all required data was loaded
    const validationChecks = {
      tiles: Array.isArray(newTilesData) && newTilesData.length > 0,
      resources: Array.isArray(newResourcesData),
      gridState: toGridResponse.data && typeof toGridResponse.data === 'object',
      playerData: playerData && 
                  typeof playerData.playerId === 'string' && 
                  typeof playerData.username === 'string' &&
                  playerData.playerId.length > 0 &&
                  playerData.username.length > 0
    };
    
    console.log('🔍 [VALIDATION] Data validation results:', validationChecks);
    console.log('🔍 [VALIDATION] Player data details:', {
      playerId: playerData.playerId,
      username: playerData.username,
      type: typeof playerData.playerId,
      valid: validationChecks.playerData
    });
    
    const allValid = Object.values(validationChecks).every(check => check === true);
    if (!allValid) {
      throw new Error(`Validation failed: ${JSON.stringify(validationChecks)}`);
    }
    
    console.log('✅ [VALIDATION] All data validation checks passed');
    
    // ================================
    // PHASE 5: COMMIT STATE ATOMICALLY
    // ================================
    console.log('🔄 [PHASE 5] COMMIT - Atomically swapping to new grid state');
    
    if (updateStatus) {
      updateStatus('Entering new area...');
    }
    
    // Step 1: Join socket room first
    socket.emit('join-grid', { gridId: toLocation.g, playerId: playerId });
    
    // Step 2: Add player to new grid database
    console.log('📤 [COMMIT] Adding player to new grid database...');
    await playersInGridManager.addPC(toLocation.g, playerId, playerData);
    
    // Step 3: Update player location in database
    console.log('📍 [COMMIT] Updating player location in database...');
    const locationResponse = await axios.post(`${API_BASE}/api/update-player-location`, {
      playerId: playerId,
      location: toLocation,
    });

    if (!locationResponse.data.success) {
      throw new Error(`Failed to update player location: ${locationResponse.data.error}`);
    }
    
    // Step 4: HYPOTHESIS TEST - Don't clear SVG cache to see if that's causing the issue
    console.log('🧪 [COMMIT] HYPOTHESIS TEST: Keeping SVG cache (not clearing)');
    
    // Step 5: ATOMICALLY COMMIT ALL STATE CHANGES
    console.log('⚡ [COMMIT] Atomically committing all state changes...');
    
    // Clear old state first
    setGrid([]);
    setResources([]);
    setTileTypes([]);
    GlobalGridStateTilesAndResources.setTiles([]);
    GlobalGridStateTilesAndResources.setResources([]);
    
    // Small delay to ensure clearing completes
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Update grid ID and player state first
    setGridId(toLocation.g);
    
    const updatedPlayer = {
      ...currentPlayer,
      location: locationResponse.data.player.location,
    };
    setCurrentPlayer(updatedPlayer);
    localStorage.setItem('player', JSON.stringify(updatedPlayer));
    
    // Now properly initialize the grid with tiles and resources using the correct function
    console.log('🔄 [COMMIT] Initializing grid with proper tile loading...');
    await initializeGrid(TILE_SIZE, toLocation.g, setGrid, setResources, setTileTypes, updateStatus, updatedPlayer);
    
    console.log('✅ [COMMIT] State successfully committed with proper grid initialization');

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

    // ================================
    // PHASE 6: FINALIZATION
    // ================================
    console.log('🏁 [PHASE 6] FINALIZATION - Completing grid transition');
    
    // Initialize NPCs and PCs for the new grid
    console.log('👥 [FINALIZATION] Initializing NPCs and PCs...');
    try {
      await NPCsInGridManager.initializeGridState(toLocation.g);
      await playersInGridManager.initializePlayersInGrid(toLocation.g);  
      
      const freshGridState = NPCsInGridManager.getNPCsInGrid(toLocation.g);
      const freshPCState = playersInGridManager.getPlayersInGrid(toLocation.g);

      // Verify that our player exists in the fresh PC state
      if (!freshPCState || !freshPCState[playerId]) {
        console.warn('⚠️ [FINALIZATION] Player not found in fresh PC state, forcing re-add...');
        
        // Re-add the player to ensure they appear
        await playersInGridManager.addPC(toLocation.g, playerId, playerData);
        
        // Get the updated state
        const updatedPCState = playersInGridManager.getPlayersInGrid(toLocation.g);
        
        playersInGridManager.setPlayersInGridReact({ [toLocation.g]: {
          pcs: updatedPCState,
          playersInGridLastUpdated: Date.now(),
        }});
        
        console.log('✅ [FINALIZATION] Player force-added to grid');
      } else {
        playersInGridManager.setPlayersInGridReact({ [toLocation.g]: {
          pcs: freshPCState,
          playersInGridLastUpdated: Date.now(),
        }});
      }

      NPCsInGridManager.setGridStateReact({ [toLocation.g]: {
        npcs: freshGridState,
        NPCsInGridLastUpdated: Date.now(),
      }});
      
      console.log('✅ [FINALIZATION] NPCs and PCs initialized successfully');
    } catch (err) {
      console.error('❌ [FINALIZATION] Error initializing NPCs/PCs:', err);
      throw new Error(`Failed to initialize grid entities: ${err.message}`);
    }
    
    // Clean up dead player if needed
    if (currentPlayer.hp <= 0) {
      console.log('⚰️ [FINALIZATION] Verifying dead player cleanup...');
      try {
        await axios.post(`${API_BASE}/api/remove-single-pc`, {
          gridId: fromLocation.g,
          playerId: playerId,
        });
        console.log('✅ [FINALIZATION] Dead player cleanup verified');
      } catch (cleanupError) {
        console.warn('⚠️ [FINALIZATION] Cleanup verification failed:', cleanupError);
      }
    }

    // Emit socket events for new grid
    socket.emit('set-username', { username: currentPlayer.username });
    socket.emit('request-npc-controller', { gridId: toLocation.g });
    socket.emit('player-joined-grid', {
      gridId: toLocation.g,
      playerId: playerId,
      username: currentPlayer.username,
      playerData,
    });
    
    // Handle signpost finding if needed
    let finalX = toLocation.x;
    let finalY = toLocation.y;
    
    if (toLocation.findSignpost) {
      console.log(`🔍 [FINALIZATION] Looking for ${toLocation.findSignpost}...`);
      const currentResources = GlobalGridStateTilesAndResources.getResources();
      const signpost = currentResources.find(res => res.type === toLocation.findSignpost);
      
      if (signpost) {
        finalX = signpost.x;
        finalY = signpost.y;
        
        const updatedPlayerData = {
          ...playerData,
          position: { x: finalX, y: finalY }
        };
        
        playersInGridManager.updatePC(toLocation.g, playerId, updatedPlayerData);
        
        await axios.post(`${API_BASE}/api/save-single-pc`, {
          gridId: toLocation.g,
          playerId: playerId,
          pc: updatedPlayerData,
          lastUpdated: Date.now(),
        });
        
        socket.emit('player-moved', {
          gridId: toLocation.g,
          playerId: playerId,
          position: { x: finalX, y: finalY },
          username: currentPlayer.username,
        });
        
        console.log(`✅ [FINALIZATION] Player positioned at signpost (${finalX}, ${finalY})`);
      } else {
        console.log(`⚠️ [FINALIZATION] ${toLocation.findSignpost} not found, using default position`);
      }
    }
    
    // Center camera and update status with retry mechanism
    const centerCameraWithRetry = async (position, attempts = 0) => {
      if (typeof position.x !== 'number' || typeof position.y !== 'number') {
        console.warn('⚠️ [GRID TRANSITION] Cannot center camera - invalid coordinates:', position);
        return;
      }
      
      try {
        centerCameraOnPlayer(position, TILE_SIZE);
        console.log(`📷 [GRID TRANSITION] Camera centered on (${position.x}, ${position.y})`);
      } catch (error) {
        if (attempts < 3) {
          console.warn(`⚠️ [GRID TRANSITION] Camera centering failed, retrying in 100ms (attempt ${attempts + 1}/3):`, error);
          setTimeout(() => centerCameraWithRetry(position, attempts + 1), 100);
        } else {
          console.error(`❌ [GRID TRANSITION] Camera centering failed after 3 attempts:`, error);
        }
      }
    };
    
    // Ensure we have valid coordinates before centering camera
    if (typeof finalX === 'number' && typeof finalY === 'number') {
      await centerCameraWithRetry({ x: finalX, y: finalY });
    } else {
      console.warn('⚠️ [GRID TRANSITION] Cannot center camera - invalid final coordinates:', { finalX, finalY });
    }
    
    if (updateStatus && toLocation.gtype) {
      await updateGridStatus(toLocation.gtype, null, updateStatus, currentPlayer, toLocation.g);
      updateStatus(''); // Clear loading message
    }

    console.log('🎉 [GRID TRANSITION] Transactional grid change completed successfully');
    
    // Mark location change as completed
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
