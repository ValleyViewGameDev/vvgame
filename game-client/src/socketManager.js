import NPC from './GameFeatures/NPCs/NPCs';
import { io } from 'socket.io-client';


const socket = io('https://vvgame-server.onrender.com', {
  transports: ['websocket'],
  autoConnect: false, // Don't connect until explicitly told to
});

export let socketConnectionStatus = 'disconnected';

socket.on('connect', () => {
  console.log('📡 Socket connected:', socket.id);
  socketConnectionStatus = 'connected';
});

socket.on('disconnect', () => {
  console.log('🔌 Socket disconnected');
  socketConnectionStatus = 'disconnected';
});


export function socketListenForPCJoinAndLeave(gridId, currentPlayer, isMasterResourcesReady, setGridState) {

  console.log("🌐 useEffect for PC join & leave running. gridId:", gridId, "socket:", !!socket);
  console.log("  🌐 isMasterResourcesReady = ", isMasterResourcesReady);

  if (!gridId || !currentPlayer || !isMasterResourcesReady) return;

  const handlePlayerJoinedGrid = ({ playerId, username, playerData, emitterId }) => {
    if (emitterId === socket.id) {
      console.log('😀 Ignoring player-joined event from self.');
      return; // Ignore updates emitted by this client
    }
    console.log(`👋 Player ${username} joined grid with data:`, playerData);
    setGridState(prevState => ({
      ...prevState,
      pcs: {
        ...prevState.pcs,
        [playerId]: playerData,
      },
    }));
  };

  const handlePlayerLeftGrid = ({ playerId, username, emitterId }) => {
    if (emitterId === socket.id) {
      console.log('😀 Ignoring player-left event from self.');
      return; // Ignore updates emitted by this client
    }
    console.log(`👋 Player ${username} left grid`);
    setGridState(prevState => {
      const newPCs = { ...prevState.pcs };
      delete newPCs[playerId];
      return {
        ...prevState,
        pcs: newPCs,
      };
    });
  };

  const handleCurrentGridPlayers = ({ gridId, pcs }) => {
    console.log(`📦 Received current PCs for grid ${gridId}:`, pcs);
    setGridState(prev => ({
      ...prev,
      pcs: {
        ...prev.pcs,
        ...pcs,
      },
    }));
  };

  console.log("🧲 [gridState join/leave] Subscribing to PC and NPC join/leave sync events for grid:", gridId);
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
export function socketListenForPCstateChanges(gridId, currentPlayer, setGridState, localPlayerMoveTimestampRef) {

  console.log("🌐🌐🌐🌐🌐🌐 useEffect for PC & NPC grid-state-sync running. gridId:", gridId, "socket:", !!socket);

  if (!gridId) return;

  const handlePCSync = ({ pcs, gridStatePCsLastUpdated, emitterId }) => {
    console.log('📥 Received gridState-sync-PCs event:', { pcs, gridStatePCsLastUpdated });

    // Assume only a single PC is sent per update.
    const [playerId, incomingPC] = Object.entries(pcs)[0];
    // Normalize incomingTime to timestamp for reliable comparison
    const incomingTime = new Date(incomingPC?.lastUpdated || gridStatePCsLastUpdated).getTime();

    setGridState(prevState => {
      const localPC = prevState.pcs?.[playerId];
      // Normalize localTime to timestamp for reliable comparison
      const localTime = new Date(localPC?.lastUpdated).getTime() || 0;
      console.log(`[TS DEBUG] Comparing incoming ${incomingTime} vs local ${localTime}`);

      if (currentPlayer && playerId === String(currentPlayer._id)) {
        if (localPlayerMoveTimestampRef.current > incomingTime) {
          console.log(`⏳ Skipping local PC (${playerId}) update; local movement is newer.`);
          return prevState;
        }
      }

      if (incomingTime > localTime) {
        console.log(`⏩ Updating PC ${playerId} from socket event.`);
        return {
          ...prevState,
          pcs: {
            ...prevState.pcs,
            [playerId]: incomingPC,
          },
          gridStatePCsLastUpdated: incomingTime,
        };
      }

      console.log(`⏳ Skipping stale update for PC ${playerId}.`);
      return prevState;
    });
  };

  console.log("🧲 Subscribing to PC sync events for grid:", gridId);
  socket.on("gridState-sync-PCs", handlePCSync);

  return () => {
    console.log("🧹 Unsubscribing from PC sync events for grid:", gridId);
    socket.off("gridState-sync-PCs", handlePCSync);
  };
};


// 🔄 SOCKET LISTENER: NPCs:  Real-time updates for GridStateNPC snc
export function socketListenForNPCStateChanges(gridId, setGridState, isNPCController) {
  console.log("🌐 useEffect for NPC grid-state-sync running. gridId:", gridId, "socket:", !!socket);
  if (!gridId) return;
  let lastUpdateTimeNPCs = 0;

  const handleNPCSync = ({ npcs, gridStateNPCsLastUpdated, emitterId }) => {
    console.log('📥 Received gridState-sync-NPCs event:', { npcs, gridStateNPCsLastUpdated, emitterId });
    console.log('IsNPCController:', isNPCController);

    if (!npcs || !gridStateNPCsLastUpdated) return;

    const parsedNPCTime = new Date(gridStateNPCsLastUpdated);
    if (isNaN(parsedNPCTime.getTime())) {
      console.error("Invalid gridStateNPCsLastUpdated timestamp:", gridStateNPCsLastUpdated);
      return;
    }

    if (parsedNPCTime.getTime() > lastUpdateTimeNPCs) {
      console.log('⏩ Updating local NPCs:', npcs);
      setGridState(prevState => {
        const updatedNPCs = { ...prevState.npcs };

        // Merge the incoming fields into existing local NPCs
        Object.entries(npcs).forEach(([npcId, incomingNPC]) => {
          const localNPC = updatedNPCs[npcId];
          if (localNPC) {
            // Update only the changed fields
            Object.assign(localNPC, incomingNPC);
          } else {
            // If the NPC didn't exist locally (very rare), hydrate it as new
            updatedNPCs[npcId] = new NPC(
              incomingNPC.id,
              incomingNPC.type,
              incomingNPC.position,
              incomingNPC,
              incomingNPC.gridId || gridId
            );
          }
        });

        return {
          ...prevState,
          npcs: updatedNPCs,
          gridStateNPCsLastUpdated: parsedNPCTime.getTime(),
        };
      });

      lastUpdateTimeNPCs = parsedNPCTime.getTime();
    } else {
      console.log('⏳ Skipping older NPC update.');
    }
  };

  // Add handler for npc-moved-sync
  const handleNPCMoveSync = ({ npcId, newPosition, emitterId }) => {
    console.log('📥 Received npc-moved-sync event:', { npcId, newPosition, emitterId });
    console.log('IsNPCController:', isNPCController);

    if (!npcId || !newPosition) return;

    setGridState(prevState => {
      const updatedNPCs = { ...prevState.npcs };
      if (updatedNPCs[npcId]) {
        updatedNPCs[npcId] = {
          ...updatedNPCs[npcId],
          position: newPosition,
        };
      }
      return {
        ...prevState,
        npcs: updatedNPCs,
      };
    });
  };

  console.log("🧲 Subscribing to NPC sync events for grid:", gridId);
  socket.on("gridState-sync-NPCs", handleNPCSync);
  socket.on("npc-moved-sync", handleNPCMoveSync);

  return () => {
    console.log("🧹 Unsubscribing from NPC sync events for grid:", gridId);
    socket.off("gridState-sync-NPCs", handleNPCSync);
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
export function socketListenForNPCControllerStatus(gridId, currentPlayer, setControllerUsername, setIsNPCController) {

  console.log("🌐 useEffect for npc-controller running. gridId:", gridId, "socket:", !!socket);

  if (!socket || !currentPlayer) return;

  // Send username to server when joining grid
  if (gridId) {
    socket.emit('set-username', { username: currentPlayer.username });
  }

  socket.on('npc-controller-update', ({ controllerUsername }) => {
    setControllerUsername(controllerUsername);
    setIsNPCController(controllerUsername === currentPlayer.username);
  });

  socket.on('npc-controller-assigned', ({ gridId: controlledGridId }) => {
    console.log(`🎮 Assigned as NPC controller for grid ${controlledGridId}`);
    if (controlledGridId === gridId) {
      setIsNPCController(true);
    }
  });

  socket.on('npc-controller-revoked', ({ gridId: revokedGridId }) => {
    console.log(`🎮 Revoked as NPC controller for grid ${revokedGridId}`);
    if (revokedGridId === gridId) {
      setIsNPCController(false);
    }
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


export default socket;