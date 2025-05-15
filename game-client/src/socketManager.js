import NPC from './GameFeatures/NPCs/NPCs';
import NPCsInGridManager from './GridState/GridStateNPCs';
import playersInGridManager from './GridState/PlayersInGrid';
import { io } from 'socket.io-client';
import { animateRemotePC } from './Render/RenderAnimatePosition';

const socket = io('https://vvgame-server.onrender.com', {
  transports: ['websocket'],
  autoConnect: false, // Don't connect until explicitly told to
});

export function socketListenForPCJoinAndLeave(gridId, currentPlayer, isMasterResourcesReady, setPlayersInGrid) {

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
      const existing = prevState[gridId]?.[playerId];
      const incomingTime = new Date(playerData?.lastUpdated).getTime() || 0;
      const localTime = new Date(existing?.lastUpdated).getTime() || 0;

      if (incomingTime > localTime) {
        console.log(`⏩ Updating PC ${playerId} from player-joined-sync (newer data).`);
        return {
          ...prevState,
          [gridId]: {
            ...prevState[gridId],
            [playerId]: playerData,
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
    setPlayersInGrid(prevState => {
      if (!prevState[gridId]) return prevState;
      const updatedGrid = { ...prevState[gridId] };
      delete updatedGrid[playerId];
      return {
        ...prevState,
        [gridId]: updatedGrid,
      };
    });
  };

  const handleCurrentGridPlayers = ({ gridId, pcs }) => {
    console.log(`📦 Received current PCs for grid ${gridId}:`, pcs);
    setPlayersInGrid(prev => ({
      ...prev,
      [gridId]: {
        ...prev[gridId],
        ...pcs,
      },
    }));
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

  const handlePCSync = ({ pcs, emitterId }) => {
    console.log('📥 Received sync-PCs event:', { pcs });

    const [playerId, incomingPC] = Object.entries(pcs)[0];
    const incomingTime = new Date(incomingPC?.lastUpdated).getTime();

    setPlayersInGrid(prevState => {
      const localPC = prevState[gridId]?.[playerId];
      const localTime = new Date(localPC?.lastUpdated).getTime() || 0;

      if (currentPlayer && playerId === String(currentPlayer._id)) {
        if (localPlayerMoveTimestampRef.current > incomingTime) {
          console.log(`⏳ Skipping local PC (${playerId}) update; local movement is newer.`);
          return prevState;
        }
      }

      if (incomingTime > localTime) {
        console.log(`⏩ Updating PC ${playerId} from socket event.`);

        // Trigger animation if position changed
        const prevPosition = localPC?.position;
        const newPosition = incomingPC?.position;
        if (
          prevPosition &&
          newPosition &&
          (prevPosition.x !== newPosition.x || prevPosition.y !== newPosition.y)
        ) {
          animateRemotePC(playerId, prevPosition, newPosition, TILE_SIZE); // Use your actual TILE_SIZE here
        }

        return {
          ...prevState,
          [gridId]: {
            ...prevState[gridId],
            [playerId]: incomingPC,
          },
        };
      }

      console.log(`⏳ Skipping stale update for PC ${playerId}.`);
      return prevState;
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
export function socketListenForNPCStateChanges(gridId, setGridState, npcController) {
  console.log("🌐 useEffect for NPC grid-state-sync running. gridId:", gridId, "socket:", !!socket);
  if (!gridId) return;

  const handleNPCSync = ({ npcs, emitterId }) => {
    console.log('📥 Received sync-NPCs event:', { npcs, emitterId });
    const isController = npcController.isControllingGrid(gridId);
    console.log('IsNPCController:', isController);
  
    if (!npcs) return;
  
    setGridState(prevState => {
      const updatedNPCs = { ...prevState.npcs };
      const liveGrid = isController ? NPCsInGridManager.NPCsInGrids?.[gridId] : null;
  
      Object.entries(npcs).forEach(([npcId, incomingNPC]) => {
 
        if (!incomingNPC) {
          console.log(`  🧹 Received null NPC ${npcId}; removing from local state.`);
          delete updatedNPCs[npcId];
          if (isController && liveGrid?.npcs) {
            delete liveGrid.npcs[npcId];
            console.log(`🧠 Controller removed NPC ${npcId} from live NPCsInGrid`);
          }
          return;
        }

        const localNPC = updatedNPCs[npcId];
        const incomingTime = new Date(incomingNPC.lastUpdated).getTime();
        const localTime = localNPC?.lastUpdated ? new Date(localNPC.lastUpdated).getTime() : 0;
  
        if (incomingTime > localTime) {
          console.log(`  🐮📡 Updating NPC ${npcId} from emitter ${emitterId}: ${incomingNPC.state}`);
  
          // Always rehydrate as full NPC instance
          const rehydrated = new NPC(
            incomingNPC.id,
            incomingNPC.type,
            incomingNPC.position,
            incomingNPC,
            incomingNPC.gridId || gridId
          );
  
          updatedNPCs[npcId] = rehydrated;
  
          // 🔁 Update the controller’s live in-memory copy too
          if (isController && liveGrid?.npcs) {
            liveGrid.npcs[npcId] = rehydrated;
            console.log(`🧠 Controller rehydrated NPC ${npcId} into live NPCsInGrid`);
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
    console.log('📥 Received npc-moved-sync event:', { npcId, newPosition, emitterId });
    const isController = npcController.isControllingGrid(gridId);
    console.log('IsNPCController:', isController);
  
    if (!npcId || !newPosition) return;
  
    setGridState(prevState => {
      const updatedNPCs = { ...prevState.npcs };
      const existing = updatedNPCs[npcId];
  
      if (existing) {
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
  
        rehydrated.position = newPosition;
        updatedNPCs[npcId] = rehydrated;
  
        // ✅ Also patch live memory state for controller
        if (rehydrated instanceof NPC) {
          NPCsInGridManager.NPCsInGrids[gridId].npcs[npcId] = rehydrated;
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

  console.log("🧲 Subscribing to NPC sync events for grid:", gridId);
  socket.on("sync-NPCs", handleNPCSync);
  socket.on("npc-moved-sync", handleNPCMoveSync);

  return () => {
    console.log("🧹 Unsubscribing from NPC sync events for grid:", gridId);
    socket.off("sync-NPCs", handleNPCSync);
    socket.off("npc-moved-sync", handleNPCMoveSync);
  };
}


// 🔄 SOCKET LISTENER: Real-time updates for resources
export function socketListenForResourceChanges(gridId, isMasterResourcesReady, setResources, masterResources, enrichResourceFromMaster) {

  console.log("🌐 useEffect for tile-resource-sync running. gridId:", gridId, "socket:", !!socket);
  
  // Wait until masterResources is ready
  if (!gridId || !socket || !isMasterResourcesReady) {
    console.warn('Master Resources not ready or missing gridId/socket.');
    return; // 🛑 Don't process until ready
  }
  const handleResourceSync = ({ updatedTiles, updatedResources }) => {
    console.log("🌐 Real-time tile/resource update received!", {
      updatedTiles,
      updatedResources,
    });

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
            console.log(`🧹 Removing resource at (${newRes.x}, ${newRes.y})`);
            const indexToRemove = updated.findIndex(
              (res) => res.x === newRes.x && res.y === newRes.y
            );
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
          console.log('🌐🌐 LISTENER: enriched resource = ', enriched);
          const filtered = updated.filter(r => !(r.x === newRes.x && r.y === newRes.y));
          filtered.push(enriched);
          updated.splice(0, updated.length, ...filtered);
        });

        return updated;
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

  console.log("🌐 useEffect for tile-sync running. gridId:", gridId, "socket:", !!socket);

  if (!gridId || !socket) {
    console.warn('Missing gridId or socket.');
    return;
  }

  const handleTileSync = ({ updatedTiles }) => {
    console.log("🌐 Real-time tile update received!", { updatedTiles });

    updatedTiles.forEach(tile => {
      console.log("📦 Tile type in update:", tile.type); // Add this
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

  const handlePlayerConnected = ({ playerId }) => {
    setConnectedPlayers(prev => new Set(prev).add(playerId));
  };

  const handlePlayerDisconnected = ({ playerId }) => {
    setConnectedPlayers(prev => {
      const newSet = new Set(prev);
      newSet.delete(playerId);
      return newSet;
    });
  };
  
  socket.on('player-connected', handlePlayerConnected);
  socket.on('player-disconnected', handlePlayerDisconnected);

  return () => {
    socket.off('player-connected', handlePlayerConnected);
    socket.off('player-disconnected', handlePlayerDisconnected);
  };
};

export default socket;