import NPC from './GameFeatures/NPCs/AllNPCsShared';
import FloatingTextManager from './UI/FloatingText';
import NPCsInGridManager from './GridState/GridStateNPCs';
import playersInGridManager from './GridState/PlayersInGrid';
import { io } from 'socket.io-client';
import { animateRemotePC } from './Render/RenderAnimatePosition';
import { createCollectEffect } from './VFX/VFX';

const socket = io('https://vvgame-server.onrender.com', {
  transports: ['websocket'],
  autoConnect: false, // Don't connect until explicitly told to
});

export function socketListenForPCJoinAndLeave(gridId, currentPlayer, isMasterResourcesReady, setPlayersInGrid, controllerUsername, setControllerUsername) {

  console.log("🌐 useEffect for PC join & leave running. gridId:", gridId, "socket:", !!socket);
  console.log("  🌐 isMasterResourcesReady = ", isMasterResourcesReady);

  if (!gridId || !currentPlayer || !isMasterResourcesReady) return;

const handlePlayerJoinedGrid = ({ playerId, username, playerData, emitterId }) => {
  if (emitterId === socket.id) {
    console.log('😀 Ignoring player-joined event from self.');
    return; // Ignore updates emitted by this client
  }
  console.log(`👋 Player ${username} joined grid with data:`, playerData);
  setPlayersInGrid(prevState => {
    const existing = prevState[gridId]?.pcs?.[playerId];
    const incomingTime = new Date(playerData?.lastUpdated).getTime() || 0;
    const localTime = new Date(existing?.lastUpdated).getTime() || 0;

    if (!existing || incomingTime > localTime) {
      console.log(`⏩ Inserting or updating PC ${playerId} from player-joined-sync.`);

      // ✅ Update memory manager too
      if (playersInGridManager.addPC) {
        playersInGridManager.addPC(gridId, playerId, playerData);
      } else {
        console.warn('🛑 playersInGridManager.addPC is not defined.');
      }

      return {
        ...prevState,
        [gridId]: {
          ...prevState[gridId],
          pcs: {
            ...(prevState[gridId]?.pcs || {}),
            [playerId]: playerData,
          },
        },
      };
    }

    console.log(`⏳ Skipping player-joined-sync for ${playerId}; local is newer.`);
    return prevState;
  });
};

  const handlePlayerLeftGrid = ({ playerId, username, emitterId }) => {
    if (emitterId === socket.id) {
      console.log('😀 Ignoring player-left event from self.');
      return; // Ignore updates emitted by this client
    }
    console.log(`👋 Player ${username} left grid`);
    // ✅ Remove from memory manager
    if (playersInGridManager.removePC) {
      playersInGridManager.removePC(gridId, playerId);
    } else {
      console.warn('🛑 playersInGridManager.removePC is not defined.');
    }

    setPlayersInGrid(prevState => {
      if (!prevState[gridId]?.pcs) return prevState;
      const updatedGrid = { ...prevState[gridId]?.pcs };
      delete updatedGrid[playerId];
      
      // Check if removed player was the controller
      if (controllerUsername === username && setControllerUsername) {
        console.log(`🎮 Removed player ${username} was the NPCController, clearing controller`);
        setControllerUsername(null);
      }
      
      return {
        ...prevState,
        [gridId]: {
          ...prevState[gridId],
          pcs: updatedGrid,
        },
      };
    });
  };

  const handleCurrentGridPlayers = ({ gridId: receivedGridId, pcs }) => {
    console.log(`📦 Received current PCs for grid ${receivedGridId}:`, pcs);
    
    // Only update if this is for our current grid
    if (receivedGridId !== gridId) {
      console.log(`🔄 Ignoring PC list for different grid ${receivedGridId} (current: ${gridId})`);
      return;
    }
    
    // Replace the entire pcs object with server's authoritative list
    setPlayersInGrid(prev => ({
      ...prev,
      [gridId]: {
        ...prev[gridId],
        pcs: pcs || {}, // Complete replacement, not a merge
      },
    }));
    
    // Also update the memory manager with the complete list
    if (playersInGridManager.setAllPCs) {
      playersInGridManager.setAllPCs(gridId, pcs || {});
    }
    
    // Check if the current controller is in the player list
    if (controllerUsername && setControllerUsername) {
      const controllerStillInGrid = Object.values(pcs || {}).some(pc => pc.username === controllerUsername);
      if (!controllerStillInGrid) {
        console.log(`🎮 NPCController ${controllerUsername} is not in the current player list, clearing controller`);
        setControllerUsername(null);
      }
    }
  };

  console.log("🧲 [NPCsInGrid join/leave] Subscribing to PC and NPC join/leave sync events for grid:", gridId);
  socket.on('player-joined-sync', handlePlayerJoinedGrid);
  socket.on('player-left-sync', handlePlayerLeftGrid);
  socket.on('current-grid-players', handleCurrentGridPlayers);

  return () => {
    socket.off('player-joined-sync', handlePlayerJoinedGrid);
    socket.off('player-left-sync', handlePlayerLeftGrid);
    socket.off('current-grid-players', handleCurrentGridPlayers);
  };

};

// 🔄 SOCKET LISTENER: PCs: Real-time updates for GridState (PC sync)
export function socketListenForPCstateChanges(TILE_SIZE, gridId, currentPlayer, setPlayersInGrid, localPlayerMoveTimestampRef) {

  console.log("🌐🌐🌐🌐🌐🌐 useEffect for PC & NPC grid-state-sync running. gridId:", gridId, "socket:", !!socket);

  if (!gridId) return;

  // Updated handlePCSync to fully overwrite local PC with incoming PC if newer
  const handlePCSync = (payload) => {
    //console.log("📥 Received sync-PCs payload:", JSON.stringify(payload, null, 2));
  
    const { emitterId } = payload;
    const mySocketId = socket.id;
    if (emitterId === mySocketId) {
      console.log(`📤 Skipping sync-PCs from self (emitterId = socket.id)`);
      return;
    }
  
    // Extract gridId and gridData (we only expect one grid per payload)
    const gridEntries = Object.entries(payload).filter(([key]) => key !== 'emitterId');
    if (gridEntries.length === 0) {
      console.warn("❌ No grid data found in sync-PCs payload:", payload);
      return;
    }
  
    const [gridId, gridData] = gridEntries[0];
    const { pcs, playersInGridLastUpdated } = gridData || {};
    if (!pcs || typeof pcs !== 'object') {
      console.warn("📤 Invalid sync-PCs payload (missing pcs):", payload);
      return;
    }
  
    const [playerId, incomingPC] = Object.entries(pcs)[0];
    const incomingTime = new Date(incomingPC?.lastUpdated).getTime();
  
    setPlayersInGrid((prevState) => {
      const localPC = prevState[gridId]?.pcs?.[playerId];
      const localTime = new Date(localPC?.lastUpdated).getTime() || 0;

      // --- Begin changed fields logging and floating text (like NPCs) ---
      const changedFields = Object.keys(incomingPC).filter(key => {
        if (key === 'lastUpdated') return false;
        return JSON.stringify(incomingPC[key]) !== JSON.stringify(localPC?.[key]);
      });

      if (changedFields.length > 0) {
        console.log(`🔄 PC ${playerId} changed fields: ${changedFields.join(', ')}`);
        // Show floating damage text if HP was reduced
        if (changedFields.includes('hp') && localPC?.hp && incomingPC?.hp < localPC.hp) {
          const damageTaken = localPC.hp - incomingPC.hp;
          FloatingTextManager.addFloatingText(`- ${damageTaken} ❤️‍🩹 HP`, incomingPC.position.x, incomingPC.position.y, TILE_SIZE);
        }
      }
      // --- End changed fields logging and floating text ---

      // CRITICAL: Never update our own player from socket broadcasts
      // This prevents the race condition where high latency causes our movements to be overwritten
      if (currentPlayer && playerId === String(currentPlayer._id)) {
        console.log(`🛡️ Blocking socket update for own player (${playerId}). LocalTimestamp: ${localPlayerMoveTimestampRef.current}, IncomingTimestamp: ${incomingTime}`);
        return prevState;
      }

      if (incomingTime <= localTime) {
        console.log(`⏳ Skipping stale update for PC ${playerId}.`);
        return prevState;
      }

      console.log(`⏩ Updating PC ${playerId} from socket event.`);
      playersInGridManager.updatePC(gridId, playerId, incomingPC);

      const prevPosition = localPC?.position;
      const newPosition = incomingPC?.position;
      if (
        prevPosition &&
        newPosition &&
        (prevPosition.x !== newPosition.x || prevPosition.y !== newPosition.y)
      ) {
        animateRemotePC(playerId, prevPosition, newPosition, TILE_SIZE);
      }

      const prevGridState = prevState[gridId] || {};
      const prevPCs = prevGridState.pcs || {};

      const setPayload = {
        ...prevState,
        [gridId]: {
          ...prevGridState,
          pcs: {
            ...prevPCs,
            [playerId]: incomingPC,
          },
          playersInGridLastUpdated: playersInGridLastUpdated || prevGridState.playersInGridLastUpdated,
        },
      };

      // console.log("🧠 Pre-state before merge:", JSON.stringify(prevState, null, 2));
      // console.log("📥 Incoming update for:", playerId, "with data:", incomingPC);
      // console.log("📦 setPlayersInGrid payload:", JSON.stringify(setPayload, null, 2));

      return setPayload;
    });
  };

  console.log("🧲 Subscribing to PC sync events for grid:", gridId);
  socket.on("sync-PCs", handlePCSync);

  return () => {
    console.log("🧹 Unsubscribing from PC sync events for grid:", gridId);
    socket.off("sync-PCs", handlePCSync);
  };
};


// 🔄 SOCKET LISTENER: NPCs:  Real-time updates for GridStateNPC snc
export function socketListenForNPCStateChanges(TILE_SIZE, gridId, setGridState, npcController) {
  //console.log("🌐 useEffect for NPC grid-state-sync running. gridId:", gridId, "socket:", !!socket);
  if (!gridId) return;

  const handleNPCSync = (payload) => {
    //console.log('📥 Received sync-NPCs payload:');
  
    const { emitterId } = payload;
    const mySocketId = socket.id;
    if (emitterId === mySocketId) {
      console.log(`📤 Skipping sync-NPCs from self (emitterId = socket.id)`);
      return;
    }
  
    // Extract gridId and gridData (we only expect one grid per payload)
    const gridEntries = Object.entries(payload).filter(([key]) => key !== 'emitterId');
    if (gridEntries.length === 0) {
      console.warn("❌ No grid data found in sync-NPCs payload:", payload);
      return;
    }
  
    const [gridId, gridData] = gridEntries[0];
    const { npcs, NPCsInGridLastUpdated } = gridData || {};
    if (!npcs || typeof npcs !== 'object') {
      console.warn("📤 Invalid sync-NPCs payload (missing npcs):", payload);
      return;
    }
  
    const isController = npcController.isControllingGrid(gridId);
    console.log('IsNPCController:', isController);
  
    setGridState(prevState => {
      const updatedNPCs = { ...prevState.npcs };
      const liveGrid = NPCsInGridManager.NPCsInGrid?.[gridId];
  
      Object.entries(npcs).forEach(([npcId, incomingNPC]) => {
        if (!incomingNPC) {
          //console.log(`  🧹 Received null NPC ${npcId}; removing from local state.`);
          delete updatedNPCs[npcId];
          if (liveGrid?.npcs) {
            delete liveGrid.npcs[npcId];
            //console.log(`🧠 Removed NPC ${npcId} from live NPCsInGrid`);
          } else {
            console.warn(`⚠️ liveGrid.npcs missing for gridId ${gridId}`);
          }
          return;
        }

        const localNPC = updatedNPCs[npcId];
        const incomingTime = new Date(incomingNPC.lastUpdated).getTime();
        const localTime = localNPC?.lastUpdated ? new Date(localNPC.lastUpdated).getTime() : 0;

        if (incomingTime > localTime) {
          // Broadly log which attributes changed
          const changedFields = Object.keys(incomingNPC).filter(key => {
            if (key === 'lastUpdated') return false;
            return JSON.stringify(incomingNPC[key]) !== JSON.stringify(localNPC?.[key]);
          });
          if (changedFields.length > 0) {
            console.log(`🔄 NPC ${npcId} changed fields: ${changedFields.join(', ')}`);
            // Show floating damage text if HP was reduced
            if (changedFields.includes('hp') && localNPC?.hp && incomingNPC?.hp < localNPC.hp) {
              const damageTaken = localNPC.hp - incomingNPC.hp;
              FloatingTextManager.addFloatingText(`- ${damageTaken} ❤️‍🩹 HP`, incomingNPC.position.x, incomingNPC.position.y, TILE_SIZE);
            }
          }

          //console.log(`  🐮📡 Updating NPC ${npcId} from emitter ${emitterId}: ${incomingNPC.state}`);

          const rehydrated = new NPC(
            incomingNPC.id,
            incomingNPC.type,
            incomingNPC.position,
            incomingNPC,
            incomingNPC.gridId || gridId
          );

          updatedNPCs[npcId] = rehydrated;

          if (liveGrid?.npcs) {
            liveGrid.npcs[npcId] = rehydrated;
            //console.log(`🧠 Rehydrated NPC ${npcId} into live NPCsInGrid`);
          } else {
            console.warn(`⚠️ liveGrid.npcs missing for gridId ${gridId}`);
          }
        } else {
          console.log(`  ⏳ Skipped NPC ${npcId}, newer or same version already present.`);
        }
      });
  
      return {
        ...prevState,
        npcs: updatedNPCs,
      };
    });
  };

  // Add handler for npc-moved-sync
  const handleNPCMoveSync = ({ npcId, newPosition, emitterId }) => {
    //console.log('📡 handleNPCMoveSync invoked.');
    //console.log('📥 Received npc-moved-sync event:', { npcId, newPosition, emitterId });

    if (!npcId || !newPosition) return;
    
    // Skip if this is the controller receiving their own broadcast
    if (emitterId && emitterId === socket.id) {
      console.log(`📤 Skipping NPC animation for own broadcast (NPC ${npcId})`);
      return;
    }

    setGridState(prevState => {
      const updatedNPCs = { ...prevState.npcs };
      const existing = updatedNPCs[npcId];
      //console.log('📦 SETTING GridState for existing:', existing);
      if (existing) {
        // Cache previous position BEFORE rehydration
        const prevPosition = existing?.position;
        // ✅ Rehydrate if needed
        const rehydrated = existing instanceof NPC
          ? existing
          : new NPC(
              existing.id,
              existing.type,
              existing.position,
              existing,
              existing.gridId || gridId
            );
        //console.log('📦 Rehydrated NPC:', rehydrated);
        // Animate movement if position changed
        if (
          prevPosition &&
          newPosition &&
          (prevPosition.x !== newPosition.x || prevPosition.y !== newPosition.y)
        ) {
          console.log('Calling animateRemotePC for NPC', npcId, prevPosition, newPosition);
          animateRemotePC(npcId, prevPosition, newPosition, TILE_SIZE, 30); // More steps for smoother NPC movement
        }
        // Assign new position AFTER animation call
        rehydrated.position = newPosition;
        updatedNPCs[npcId] = rehydrated;
        // ✅ Also patch live memory state for controller
        if (rehydrated instanceof NPC) {
          NPCsInGridManager.NPCsInGrid[gridId].npcs[npcId] = rehydrated;
        } else {
          console.warn(`🛑 Tried to inject non-NPC instance into live NPCsInGrid for ${npcId}`);
        }
      }
      return {
        ...prevState,
        npcs: updatedNPCs,
      };
    });
  };

    // Add handler for npc-removal-sync
  const handleNPCRemoval = ({ gridId, npcId }) => {
    //console.log(`🧹 Received remove-NPC for ${npcId} in grid ${gridId}`);
    setGridState(prevState => {
      const updatedNPCs = { ...prevState.npcs };
      delete updatedNPCs[npcId];
      const liveGrid = NPCsInGridManager.NPCsInGrid?.[gridId];
      if (liveGrid?.npcs) {
        delete liveGrid.npcs[npcId];
        console.log(`🧠 Removed NPC ${npcId} from live NPCsInGrid (remove-NPC event)`);
      }
      return {
        ...prevState,
        npcs: updatedNPCs,
      };
    });
  };

  //console.log("🧲 Subscribing to NPC sync events for grid:", gridId);
  socket.on("sync-NPCs", handleNPCSync);
  socket.on("npc-moved-sync", handleNPCMoveSync); // main handler
  socket.on("remove-NPC", handleNPCRemoval);

  return () => {
    //console.log("🧹 Unsubscribing from NPC sync events for grid:", gridId);
    socket.off("sync-NPCs", handleNPCSync);
    socket.off("npc-moved-sync", handleNPCMoveSync);
    socket.off("remove-NPC", handleNPCRemoval);
  };
}


// 🔄 SOCKET LISTENER: Real-time updates for resources
export function socketListenForResourceChanges(TILE_SIZE, gridId, isMasterResourcesReady, setResources, masterResources, enrichResourceFromMaster) {

  //console.log("🌐 useEffect for resource-sync running. gridId:", gridId, "socket:", !!socket);
  
  // Wait until masterResources is ready
  if (!gridId || !socket || !isMasterResourcesReady) {
    console.warn('Master Resources not ready or missing gridId/socket.');
    return; // 🛑 Don't process until ready
  }
  const handleResourceSync = ({ updatedResources }) => {
    //console.log("🌐 Real-time tile/resource update received!", updatedResources);

    if (updatedResources?.length) {
      setResources((prevResources) => {
        if (!masterResources?.length) {
          console.warn(`⏳ Skipping resource enrichment; masterResources not yet ready`);
          return prevResources; // Do nothing until master data is populated
        }
        const updated = [...prevResources];
        updatedResources.forEach((newRes) => {
          if (!newRes || typeof newRes.x !== 'number' || typeof newRes.y !== 'number') {
            console.warn("⚠️ Skipping invalid socket resource:", newRes);
            return;
          }

          // ✅ HANDLE RESOURCE REMOVAL
          if (newRes.type === null) {
            //console.log(`🧹 Removing resource at (${newRes.x}, ${newRes.y})`);
            const indexToRemove = updated.findIndex(
              (res) => res.x === newRes.x && res.y === newRes.y
            );
            //console.log('TILE_SIZE:', TILE_SIZE);
            createCollectEffect(newRes.x, newRes.y, TILE_SIZE);

            if (indexToRemove !== -1) {
              updated.splice(indexToRemove, 1);
            }
            return; // Skip enrichment
          }
  
          // ✅ NORMAL ENRICHMENT PATH
          const resourceTemplate = masterResources.find(r => r.type === newRes.type);
          if (!resourceTemplate) {
            console.warn(`⚠️ No matching resource template found for ${newRes.type}`);
          }
          const enriched = enrichResourceFromMaster(newRes, masterResources);
          //console.log('🌐🌐 LISTENER: enriched resource = ', enriched);
          const filtered = updated.filter(r => !(r.x === newRes.x && r.y === newRes.y));
          filtered.push(enriched);
          updated.splice(0, updated.length, ...filtered);
        });

        // Now recreate shadow tiles for all multi-tile resources
        // This also handles removal - any old shadow tiles not recreated will be gone
        const finalResources = [...updated];
        updated.forEach((resource) => {
          if (resource.range && resource.range > 1) {
            const anchorKey = resource.anchorKey || `${resource.type}-${resource.x}-${resource.y}`;
            for (let dx = 0; dx < resource.range; dx++) {
              for (let dy = 0; dy < resource.range; dy++) {
                if (dx === 0 && dy === 0) continue; // Skip anchor
                
                const shadowX = resource.x + dx;
                const shadowY = resource.y - dy;
                const shadowResource = {
                  type: 'shadow',
                  x: shadowX,
                  y: shadowY,
                  parentAnchorKey: anchorKey,
                  passable: resource.passable // Inherit from anchor
                };
                finalResources.push(shadowResource);
              }
            }
          }
        });
        
        return finalResources;
      });
    }
  };

  console.log("🧲 [resources] Subscribing to real-time updates for grid:", gridId);
  socket.on("resource-sync", handleResourceSync);

  return () => {
    socket.off("resource-sync", handleResourceSync);
  };
};

// 🔄 SOCKET LISTENER: Real-time updates for tiles
export function socketListenForTileChanges(gridId, setTileTypes, mergeTiles) {

  //console.log("🌐 useEffect for tile-sync running. gridId:", gridId, "socket:", !!socket);

  if (!gridId || !socket) {
    console.warn('Missing gridId or socket.');
    return;
  }

  const handleTileSync = ({ updatedTiles }) => {
    //console.log("🌐 Real-time tile update received!", updatedTiles);

    updatedTiles.forEach(tile => {
      //console.log("📦 Tile type in update:", tile.type); // Add this
    });

    if (updatedTiles?.length) {
      setTileTypes((prev) => {
        const merged = mergeTiles(prev, updatedTiles); // Merge updated tiles into the current state
        return merged;
      });
    }
  };

  console.log("🧲 [tiles] Subscribing to real-time tile updates for grid:", gridId);
  socket.on("tile-sync", handleTileSync);

  return () => {
    console.log("🧹 Unsubscribing from tile-sync for grid:", gridId);
    socket.off("tile-sync", handleTileSync);
  };
};

// Add socket event listeners for NPC controller status
export function socketListenForNPCControllerStatus(gridId, currentPlayer, setControllerUsername) {

  console.log("🌐 useEffect for npc-controller running. gridId:", gridId, "socket:", !!socket);

  if (!socket || !currentPlayer) return;

  // Send username to server when joining grid
  if (gridId) {
    socket.emit('set-username', { username: currentPlayer.username });
  }

  socket.on('npc-controller-update', ({ controllerUsername }) => {
    setControllerUsername(controllerUsername);
  });

  socket.on('npc-controller-assigned', ({ gridId: controlledGridId }) => {
    console.log(`🎮 Assigned as NPC controller for grid ${controlledGridId}`);
  });

  socket.on('npc-controller-revoked', ({ gridId: revokedGridId }) => {
    console.log(`🎮 Revoked as NPC controller for grid ${revokedGridId}`);
  });

  return () => {
    socket.off('npc-controller-update');
    socket.off('npc-controller-assigned');
    socket.off('npc-controller-revoked');
  };

};


// 🔄 SOCKET LISTENER: Force refresh on season reset
export function socketListenForSeasonReset() {

  if (!socket) return;

  socket.on("force-refresh", ({ reason }) => {
    console.warn(`🔁 Server requested refresh: ${reason}`);
    window.location.reload();
  });

  return () => {
    socket.off("force-refresh");
  };
};

// 🔄 SOCKET LISTENER: Player Connect and Disconnect
export function socketListenForConnectAndDisconnect(gridId, currentPlayer, setIsSocketConnected) {
  const handleConnect = () => {
    console.log('📡 Socket connected!');
    setIsSocketConnected(true);
    // Emit presence info
    socket.emit('player-connected', { playerId: currentPlayer._id, gridId });
  };

  const handleDisconnect = () => {
    console.warn('📴 Socket disconnected.');
    setIsSocketConnected(false);
    // Notify others of disconnect
    socket.emit('player-disconnected', { playerId: currentPlayer._id, gridId });
  };

  socket.on('connect', handleConnect);
  socket.on('disconnect', handleDisconnect);

  return () => {
    socket.off('connect', handleConnect);
    socket.off('disconnect', handleDisconnect);
  };
};

// 🔄 SOCKET LISTENER: Listen for announcement that a player is connected/disconnected (I THINK ??)
export function socketListenForPlayerConnectedAndDisconnected(gridId, setConnectedPlayers) {
  if (!socket || !gridId) return;

  console.log("🌐 useEffect for player-connected/disconnected running. gridId:", gridId);

  // 🔄 Request current connection state on init
  console.log("🔄 Requesting connected players list on startup.");
  socket.emit('request-connected-players', { gridId });

  const handlePlayerConnected = ({ playerId }) => {
    console.log(`📡 Player connected: ${playerId}`);
    setConnectedPlayers(prev => new Set(prev).add(playerId));
  };

  const handlePlayerDisconnected = ({ playerId }) => {
    console.log(`📴 Player disconnected: ${playerId}`);
    setConnectedPlayers(prev => {
      const newSet = new Set(prev);
      newSet.delete(playerId);
      return newSet;
    });
  };

  const handleCurrentConnectedPlayers = ({ connectedPlayerIds }) => {
    console.log("📦 Received full list of currently connected players:", connectedPlayerIds);
    setConnectedPlayers(new Set(connectedPlayerIds));
  };

  socket.on('player-connected', handlePlayerConnected);
  socket.on('player-disconnected', handlePlayerDisconnected);
  // Listen for the correct event name as emitted by the server
  socket.on('connected-players', handleCurrentConnectedPlayers);

  return () => {
    socket.off('player-connected', handlePlayerConnected);
    socket.off('player-disconnected', handlePlayerDisconnected);
    socket.off('connected-players', handleCurrentConnectedPlayers);
  };
}


export function socketListenForChatMessages(setMessagesByScope) {
  if (!socket) return;

  const handleIncomingChatMessage = (msg) => {
    console.log("💬 Incoming chat message:", msg);
    const { scope, scopeId } = msg;
    setMessagesByScope(prev => {
      const prevMessages = prev[scopeId] || [];
      return {
        ...prev,
        [scopeId]: [...prevMessages, msg],
      };
    });
    // 🔔 Emit badge update for chat to all players in this scope
    const badgePayload = {
      playerId: null, // null means broadcast to all clients
      username: null,
      hasUpdate: true,
    };
    socket.emit('chat-badge-update', badgePayload);
  };
  socket.on('receive-chat-message', handleIncomingChatMessage);
  return () => {
    socket.off('receive-chat-message', handleIncomingChatMessage);
  };
}

export function emitChatMessage({ playerId, username, message, scope, scopeId }) {
  if (!socket) return;
  socket.emit('send-chat-message', {
    playerId,
    username,
    message,
    scope,
    scopeId,
    emitterId: socket.id // ✅ Add this
  });
}



// 🔄 SOCKET LISTENER: Consolidated badge updates (mailbox, store, chat, etc)
export function socketListenForBadgeUpdates(currentPlayer, setBadgeState, updateBadge) {
  console.log("📡 socketListenForBadgeUpdates called with player:", currentPlayer?.username);

  if (!socket || !currentPlayer) return;

  const handleBadge = ({ type, playerId, username, hasUpdate }) => {
    console.log("🧪 handleBadge invoked with:", { type, playerId, username, hasUpdate });
    console.log("🔔 SOCKET LISTENER: Received badge update:", { type, playerId, username, hasUpdate });
    console.log("📛 Comparing currentPlayer._id:", currentPlayer._id, "to incoming:", playerId);
    
    const isMatch =
      type === 'chat' ? true :
      (playerId && String(currentPlayer._id) === String(playerId)) ||
      (username && currentPlayer.username === username);

    console.log("🔔 isMatch:", isMatch, "for currentPlayer:", currentPlayer.username);
    if (!isMatch) return;

    console.log(`📛 Badge update received for ${type}.`);
    updateBadge(currentPlayer, setBadgeState, type, hasUpdate);
  };

  socket.on('mailbox-badge-update', (data) => handleBadge({ ...data, type: 'mailbox' }));
  socket.on('store-badge-update', (data) => handleBadge({ ...data, type: 'store' }));
  socket.on('chat-badge-update', (data) => handleBadge({ ...data, type: 'chat' }));

  return () => {
    socket.off('mailbox-badge-update');
    socket.off('store-badge-update');
    socket.off('chat-badge-update');
  };
}

// Utility to clear the chat badge for the current player
export function clearChatBadge(currentPlayer, setBadgeState, updateBadge) {
  if (!currentPlayer) return;
  updateBadge(currentPlayer, setBadgeState, 'chat', false);
}

export default socket;
