import API_BASE from '../config';
import axios from 'axios';
import { initializeGrid } from '../AppInit';
import NPCsInGridManager from '../GridState/GridStateNPCs';
import playersInGridManager from '../GridState/PlayersInGrid';
import socket from '../socketManager'; // ⚠️ At top of file if not already present
import GlobalGridStateTilesAndResources from '../GridState/GlobalGridStateTilesAndResources';
import { mergeResources, mergeTiles } from './ResourceHelpers';
import { centerCameraOnPlayer } from '../PlayerMovement';
import { closePanel } from '../UI/Panels/PanelContext';
import { fetchHomesteadOwner } from './worldHelpers';
import { earnTrophy } from '../GameFeatures/Trophies/TrophyUtils';
import { showNotification } from '../UI/Notifications/Notifications';
import locationChangeManager from './LocationChangeManager';
import SVGAssetManager from '../Render/SVGAssetManager';
import { isGridVisited } from './gridsVisitedUtils';
import farmState from '../FarmState';
import { parseGridCoord } from '../Render/PixiRenderer/UnifiedCamera';

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
  masterTrophies = null, // ✅ Add masterTrophies for trophy visibility checks
  transitionFadeControl = null // ✅ Add transition fade control
) => {

  console.log('🚀 [GRID TRANSITION] Starting transactional grid change...');
  
  // Start fade to black immediately when location change is detected
  if (transitionFadeControl?.startTransition) {
    transitionFadeControl.startTransition();
  }
  
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
      updateStatus('Leaving ...');
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
      farmState.stopSeedTimer(); // Stop FarmState timer before grid change
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
      updateStatus('Loading ...');
    }

    // Load grid state data
    console.log('📡 [LOAD] Fetching grid state data...');
    const toGridResponse = await axios.get(`${API_BASE}/api/load-grid-state/${toLocation.g}`);
    
    // Pre-load grid data to validate it exists, but don't apply to state yet
    console.log('📡 [LOAD] Pre-loading grid data for validation...');
    const gridDataResponse = await axios.get(`${API_BASE}/api/load-grid/${toLocation.g}`);
    const newTilesData = gridDataResponse.data?.tiles || [];
    const newResourcesData = gridDataResponse.data?.resources || [];

    // Extract region from the new grid for region transition notifications
    const toRegion = gridDataResponse.data?.region || null;
    const fromRegion = currentPlayer.location?.region || null;
    console.log(`🗺️ [LOAD] Region transition check: from "${fromRegion || 'none'}" to "${toRegion || 'none'}"`);

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
      updateStatus('Validating ...');
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
      updateStatus('Entering ...');
    }
    
    // Step 1: Join socket room first (ensure socket is connected)
    if (socket.connected) {
      socket.emit('join-grid', { gridId: toLocation.g, playerId: playerId });
      console.log('📡 Emitted join-grid for grid transition:', toLocation.g);
    } else {
      console.warn('⚠️ Socket not connected during grid transition, waiting...');
      await new Promise((resolve) => {
        socket.once('connect', () => {
          socket.emit('join-grid', { gridId: toLocation.g, playerId: playerId });
          console.log('📡 Emitted join-grid after reconnect:', toLocation.g);
          resolve();
        });
      });
    }
    
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

    // Clear grid and resources (but NOT tileTypes - see note below)
    // IMPORTANT: We do NOT clear tileTypes here to prevent PixiRenderer from unmounting.
    // Clearing tileTypes causes tileTypes.length to become 0, which unmounts PixiRenderer,
    // destroying the WebGL context. When new tileTypes arrive moments later, PixiRenderer
    // remounts with a new WebGL context. This rapid destroy/create cycle can exhaust GPU
    // resources and cause "Could not initialize shader" errors.
    // The old tiles remain visible but are hidden behind the black transition overlay
    // until new tiles are loaded by initializeGrid().
    setGrid([]);
    setResources([]);
    // setTileTypes([]); - REMOVED to prevent PixiRenderer unmount
    GlobalGridStateTilesAndResources.setTiles([]);
    GlobalGridStateTilesAndResources.setResources([]);
    
    // Update grid ID and player state first
    setGridId(toLocation.g);
    
    const updatedPlayer = {
      ...currentPlayer,
      location: locationResponse.data.player.location,
      // Preserve any other fields that may have been updated (e.g., homesteadGridCoord from handlePlayerDeath)
      ...(locationResponse.data.player.homesteadGridCoord && { homesteadGridCoord: locationResponse.data.player.homesteadGridCoord }),
    };
    setCurrentPlayer(updatedPlayer);
    localStorage.setItem('player', JSON.stringify(updatedPlayer));
    
    // Now properly initialize the grid with tiles and resources using the correct function
    console.log('🔄 [COMMIT] Initializing grid with proper tile loading...');
    await initializeGrid(TILE_SIZE, toLocation.g, setGrid, setResources, setTileTypes, updateStatus, updatedPlayer, masterResources);

    console.log('✅ [COMMIT] State successfully committed with proper grid initialization');

    // ================================
    // POST-INIT DIAGNOSTICS
    // ================================
    console.log('🔍 [POST-INIT] Running grid transition diagnostics...');

    // Check tile state
    const postInitTiles = GlobalGridStateTilesAndResources.getTiles();
    const postInitResources = GlobalGridStateTilesAndResources.getResources();

    console.log('🔍 [POST-INIT] Tile/Resource State:', {
      tilesCount: postInitTiles?.length || 0,
      tilesIsArray: Array.isArray(postInitTiles),
      tilesFirstItem: postInitTiles?.[0],
      resourcesCount: postInitResources?.length || 0,
      resourcesIsArray: Array.isArray(postInitResources),
      resourcesFirstItem: postInitResources?.[0],
      resourcesWithFilename: postInitResources?.filter(r => {
        const master = masterResources?.find(m => m.type === r.type);
        return master?.filename;
      })?.length || 0
    });

    // Check SVG cache state
    const svgDiagnosis = SVGAssetManager.diagnoseLoadingState();
    console.log('🔍 [POST-INIT] SVG Cache Health:', svgDiagnosis);

    // Log if there are resources that need SVGs but SVG cache is empty
    if (postInitResources?.length > 0 && svgDiagnosis.textures === 0) {
      console.warn('⚠️ [POST-INIT] WARNING: Resources exist but SVG texture cache is empty!');
      console.warn('⚠️ [POST-INIT] This may cause blank resource rendering.');
    }

    // ================================
    // SVG PRELOADING
    // ================================
    // Preload SVGs to ensure they're ready before we fade in
    if (masterResources && postInitResources?.length > 0) {
      console.log('🖼️ [SVG PRELOAD] Preloading SVGs for grid resources...');
      if (updateStatus) {
        updateStatus('Loading assets...');
      }

      const preloadResult = await SVGAssetManager.preloadResourceSVGs(
        postInitResources,
        masterResources,
        TILE_SIZE
      );

      if (!preloadResult.success) {
        console.warn('⚠️ [SVG PRELOAD] Some SVGs failed to load:', preloadResult.results);
      } else {
        console.log('✅ [SVG PRELOAD] All SVGs preloaded successfully');
      }
    } else {
      console.log('🖼️ [SVG PRELOAD] Skipping preload - no masterResources or no resources');
    }

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

    // ✅ CHECK: Region transition notification
    if (strings && fromRegion !== toRegion) {
      // Regions are different - show a notification
      if (toRegion) {
        // Entering a new region
        console.log(`🗺️ Player entering region: ${toRegion}`);
        showNotification('Travel', {
          title: strings[10185] || 'Elsinore',
          message: `${strings[10182] || 'You are entering '}${toRegion}.`
        });
      } else if (fromRegion) {
        // Leaving a region (toRegion is null/undefined)
        console.log(`🗺️ Player leaving region: ${fromRegion}`);
        showNotification('Travel', {
          title: strings[10185] || 'Elsinore',
          message: `${strings[10183] || 'You are leaving '}${fromRegion}.`
        });
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
        
        playersInGridManager.setPlayersInGridReact(prev => ({
          ...prev,
          [toLocation.g]: {
            pcs: updatedPCState,
            playersInGridLastUpdated: Date.now(),
          }
        }));

        console.log('✅ [FINALIZATION] Player force-added to grid');
      } else {
        playersInGridManager.setPlayersInGridReact(prev => ({
          ...prev,
          [toLocation.g]: {
            pcs: freshPCState,
            playersInGridLastUpdated: Date.now(),
          }
        }));
      }

      NPCsInGridManager.setGridStateReact(prev => ({
        ...prev,
        [toLocation.g]: {
          npcs: freshGridState,
          NPCsInGridLastUpdated: Date.now(),
        }
      }));
      
      console.log('✅ [FINALIZATION] NPCs and PCs initialized successfully');
    } catch (err) {
      console.error('❌ [FINALIZATION] Error initializing NPCs/PCs:', err);
      throw new Error(`Failed to initialize grid entities: ${err.message}`);
    }
    
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

        // Apply directional offset so player doesn't spawn on top of the signpost
        // The offset moves the player one tile away from the signpost in the appropriate direction
        const signpostType = toLocation.findSignpost;
        const signpostOffsets = {
          'Signpost NE': { x: -1, y: 1 },
          'Signpost E':  { x: -1, y: 0 },
          'Signpost SE': { x: -1, y: -1 },
          'Signpost S':  { x: 0,  y: -1 },
          'Signpost SW': { x: 1,  y: -1 },
          'Signpost W':  { x: 1,  y: 0 },
          'Signpost NW': { x: 1,  y: 1 },
          'Signpost N':  { x: 0,  y: 1 },
          'Signpost Home': { x: 0, y: 1 }, // Keep existing behavior for town signpost
        };

        const offset = signpostOffsets[signpostType];
        if (offset) {
          finalX += offset.x;
          finalY += offset.y;
          console.log(`📍 [FINALIZATION] Applied offset for ${signpostType}: (${offset.x}, ${offset.y}) -> final position (${finalX}, ${finalY})`);
        }

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
    
    // Center camera immediately after grid initialization, before verification delays
    // Parse grid AND settlement position from gridCoord for proper world coordinate calculation
    const gridCoord = toLocation.gridCoord ?? updatedPlayer.homesteadGridCoord;
    let gridPosition = { row: 0, col: 0 };
    let settlementPosition = { row: 0, col: 0 };

    if (gridCoord != null) {
      const parsed = parseGridCoord(gridCoord);
      if (parsed) {
        gridPosition = { row: parsed.gridRow, col: parsed.gridCol };
        settlementPosition = { row: parsed.settlementRow, col: parsed.settlementCol };
        console.log(`📍 [GRID TRANSITION] Position from gridCoord ${gridCoord}: grid=(${parsed.gridRow}, ${parsed.gridCol}), settlement=(${parsed.settlementRow}, ${parsed.settlementCol})`);
      }
    } else {
      console.warn(`⚠️ [GRID TRANSITION] No gridCoord available for grid ${toLocation.g} - camera may be mispositioned`);
    }

    // Center camera and wait for it to complete before fading up
    // centerCameraOnPlayer now returns a Promise that resolves when scroll is actually set
    let cameraReady = false;
    if (typeof finalX === 'number' && typeof finalY === 'number') {
      console.log(`📷 [GRID TRANSITION] Centering camera on (${finalX}, ${finalY}) in grid (${gridPosition.row}, ${gridPosition.col}), settlement (${settlementPosition.row}, ${settlementPosition.col})`);
      // Await the Promise - this ensures camera is in position before we continue
      cameraReady = await centerCameraOnPlayer(
        { x: finalX, y: finalY },
        TILE_SIZE,
        1, // zoomScale
        0, // retryCount
        gridPosition,
        settlementPosition,
        true // instant=true for grid transitions
      );
      console.log(`📷 [GRID TRANSITION] Camera centering complete: ${cameraReady ? 'SUCCESS' : 'FAILED'}`);
    } else {
      console.warn('⚠️ [GRID TRANSITION] Cannot center camera - invalid final coordinates:', { finalX, finalY });
    }
    
    // Note: Server verification removed to improve transition performance
    // The race condition was rare and fallback values now handle incomplete data
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
    
    // 🚨 [DEBUG] Log playerData being emitted for socket debugging
    console.log('🚨 [GRID MGMT DEBUG] Emitting player-joined-grid with data:', {
      gridId: toLocation.g,
      playerId: playerId,
      username: currentPlayer.username,
      playerDataKeys: playerData ? Object.keys(playerData) : 'undefined',
      playerDataHP: playerData?.hp,
      playerDataMaxHP: playerData?.maxhp,
      playerDataArmorClass: playerData?.armorclass,
      playerDataAttackBonus: playerData?.attackbonus,
      fullPlayerData: playerData
    });
    
    socket.emit('player-joined-grid', {
      gridId: toLocation.g,
      playerId: playerId,
      username: currentPlayer.username,
      playerData,
    });
    
    if (updateStatus && toLocation.gtype) {
      await updateGridStatus(toLocation.gtype, null, updateStatus, currentPlayer, toLocation.g);
    }

    console.log('🎉 [GRID TRANSITION] Transactional grid change completed successfully');

    // Wait for PixiJS to render a few frames after camera is positioned
    // This ensures the canvas is fully rendered before we fade out from black
    console.log('🎨 [GRID TRANSITION] Waiting for PixiJS to render...');
    await new Promise((resolve) => {
      let frameCount = 0;
      const waitForFrames = () => {
        frameCount++;
        if (frameCount >= 3) {
          resolve();
        } else {
          requestAnimationFrame(waitForFrames);
        }
      };
      requestAnimationFrame(waitForFrames);
    });
    console.log('🎨 [GRID TRANSITION] PixiJS render frames complete');

    // End fade transition - fade back to normal view
    if (transitionFadeControl?.endTransition) {
      transitionFadeControl.endTransition();
    }
    
    // Mark location change as completed
    locationChangeManager.completeLocationChange({
      from: fromLocation,
      to: toLocation,
      playerId: playerId,
      success: true
    });

    // Track visited grid (only make API call if not already visited)
    console.log(`📍 [GRIDS_VISITED] Checking visit tracking - gridCoord: ${toLocation.gridCoord}, type: ${typeof toLocation.gridCoord}`);
    if (typeof toLocation.gridCoord === 'number' && toLocation.gridCoord >= 0) {
      const alreadyVisited = isGridVisited(currentPlayer.gridsVisited, toLocation.gridCoord);
      console.log(`📍 [GRIDS_VISITED] Grid ${toLocation.gridCoord} alreadyVisited: ${alreadyVisited}, hasGridsVisited: ${!!currentPlayer.gridsVisited}`);
      if (!alreadyVisited) {
        console.log(`📍 [GRIDS_VISITED] Making API call to mark grid ${toLocation.gridCoord} as visited for player ${playerId}`);
        try {
          const visitResponse = await axios.post(`${API_BASE}/api/mark-grid-visited`, {
            playerId: playerId,
            gridCoord: toLocation.gridCoord
          });
          console.log(`📍 [GRIDS_VISITED] API response:`, visitResponse.data);
          if (visitResponse.data.success && visitResponse.data.gridsVisited) {
            // Update local player state with new gridsVisited data
            const playerWithVisited = {
              ...updatedPlayer,
              gridsVisited: visitResponse.data.gridsVisited
            };
            setCurrentPlayer(playerWithVisited);
            localStorage.setItem('player', JSON.stringify(playerWithVisited));
            console.log(`📍 [GRIDS_VISITED] ✅ Marked grid ${toLocation.gridCoord} as visited`);
          }
        } catch (visitError) {
          console.warn('📍 [GRIDS_VISITED] ⚠️ Failed to mark grid as visited:', visitError);
          // Non-critical error, don't fail the location change
        }
      } else {
        console.log(`📍 [GRIDS_VISITED] Grid ${toLocation.gridCoord} was already visited, skipping API call`);
      }
    } else {
      console.log(`📍 [GRIDS_VISITED] Skipping visit tracking - gridCoord invalid`);
    }

    return true;
  } catch (error) {
    console.error('❌ Location change error:', error);
    
    // End fade transition even on error to restore visibility
    if (transitionFadeControl?.endTransition) {
      transitionFadeControl.endTransition();
    }
    
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
      updateStatus(16);
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

/** Helper to get tiles in line of sight between two points using Bresenham's algorithm **/
export function getLineOfSightTiles(start, end) {
    const tiles = [];
    let x0 = Math.floor(start.x);
    let y0 = Math.floor(start.y);
    const x1 = Math.floor(end.x);
    const y1 = Math.floor(end.y);

    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    let prevX = x0;
    let prevY = y0;

    while (true) {
        // Don't include the start or end positions
        if ((x0 !== Math.floor(start.x) || y0 !== Math.floor(start.y)) &&
            (x0 !== x1 || y0 !== y1)) {
            tiles.push({ x: x0, y: y0 });

            // Check if we moved diagonally - if so, add the two adjacent tiles
            // to prevent line of sight going through corners
            if (prevX !== x0 && prevY !== y0) {
                tiles.push({ x: prevX, y: y0 }); // Vertical neighbor of previous position
                tiles.push({ x: x0, y: prevY }); // Horizontal neighbor of current position
            }
        }

        if (x0 === x1 && y0 === y1) break;

        prevX = x0;
        prevY = y0;

        const e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            x0 += sx;
        }
        if (e2 < dx) {
            err += dx;
            y0 += sy;
        }
    }

    return tiles;
}

/** Helper to check if a position falls within a wall's footprint **/
function isWithinWallFootprint(x, y, wall) {
    const tileSpan = wall.size || 1;
    // For walls with size > 1, check if (x, y) falls within the footprint
    // Wall footprint extends from anchor (wall.x, wall.y) down and right
    return (
        x >= wall.x &&
        x < wall.x + tileSpan &&
        y >= wall.y &&
        y < wall.y + tileSpan
    );
}

/** Helper to check if there's a wall blocking line of sight **/
export function isWallBlocking(start, end) {
    const resources = GlobalGridStateTilesAndResources.getResources();
    const lineOfSightTiles = getLineOfSightTiles(start, end);

    // Check each tile in the line of sight for walls
    for (const tile of lineOfSightTiles) {
        // Check if this tile is blocked by any wall (including large walls)
        const wall = resources.find(res =>
            (res.action === 'wall' || res.action === 'door') &&
            isWithinWallFootprint(tile.x, tile.y, res)
        );
        if (wall) {
            return true; // Wall found blocking the path
        }
    }

    return false; // No walls blocking
}
