import { io } from 'socket.io-client';
import gridStateManager from './GridState/GridState';

const socket = io('https://vvgame-server.onrender.com', {
  transports: ['websocket'],
  autoConnect: false, // Don't connect until explicitly told to
});

export const listenForPCandNPCSocketEvents = async (socketInstance, gridId, currentPlayer, setGridState) => {
  console.log('📡 Listening for Socket Events');

  const gridState = gridStateManager.getGridState(gridId);

  let lastUpdateTimePCs = 0;
  let lastUpdateTimeNPCs = 0;

  // PC sync listener: update PCs and include join/leave events
  const handlePCSync = ({ pcs, gridStatePClastUpdated }) => {
    console.log('📡 Received gridState-sync-PCs event:', { pcs, gridStatePClastUpdated });
    if (!pcs || !gridStatePClastUpdated) return;
    const parsedPCTime = new Date(gridStatePClastUpdated);
    if (isNaN(parsedPCTime.getTime())) {
      console.error("Invalid gridStatePClastUpdated timestamp:", gridStatePClastUpdated);
      return;
    }
    if (parsedPCTime.getTime() > lastUpdateTimePCs) {
      const localPlayerId = currentPlayer?._id;
      const newPCs = {
        ...pcs,
        [localPlayerId]: gridState?.pcs?.[localPlayerId] || pcs[localPlayerId],
      };
      setGridState(prevState => ({
        ...prevState,
        pcs: newPCs,
        lastUpdateTimePCs: parsedPCTime.toISOString(),
      }));
      lastUpdateTimePCs = parsedPCTime.getTime();
    } else {
      console.log('⏳ Skipping older PC update.');
    }
  };

  // NPC sync listener: parse timestamp similarly
  const handleNPCSync = ({ npcs, gridStateNPClastUpdated }) => {
    console.log('🔄 Received gridState-sync-NPCs event:', { npcs, gridStateNPClastUpdated });
    if (!npcs || !gridStateNPClastUpdated) return;
    const parsedNPCTime = new Date(gridStateNPClastUpdated);
    if (isNaN(parsedNPCTime.getTime())) {
      console.error("Invalid gridStateNPClastUpdated timestamp:", gridStateNPClastUpdated);
      return;
    }
    if (parsedNPCTime.getTime() > lastUpdateTimeNPCs) {
      setGridState(prevState => ({
        ...prevState,
        npcs: npcs,
        lastUpdateTimeNPCs: parsedNPCTime.toISOString(),
      }));
      lastUpdateTimeNPCs = parsedNPCTime.getTime();
    } else {
      console.log('⏳ Skipping older NPC update.');
    }
  };

  // Player join/leave events integrated with PC updates
  const handlePlayerJoinedGrid = ({ playerId, username, playerData }) => {
    console.log(`👋 Player ${username} joined grid with data:`, playerData);
    setGridState(prevState => ({
      ...prevState,
      pcs: {
        ...prevState.pcs,
        [playerId]: playerData,
      },
    }));
  };

  const handlePlayerLeftGrid = ({ playerId, username }) => {
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

  console.log("🧲 [gridState] Subscribing to PC and NPC sync events for grid:", gridId);
  socket.on('gridState-sync-PCs', handlePCSync);
  socket.on('gridState-sync-NPCs', handleNPCSync);
  socket.on('player-joined-grid', handlePlayerJoinedGrid);
  socket.on('player-left-grid', handlePlayerLeftGrid);

  return () => {
    console.log("🧹 Unsubscribing from PC and NPC sync events for grid:", gridId);
    socket.off('gridState-sync-PCs', handlePCSync);
    socket.off('gridState-sync-NPCs', handleNPCSync);
    socket.off('player-joined-grid', handlePlayerJoinedGrid);
    socket.off('player-left-grid', handlePlayerLeftGrid);
  };
};

export const listenForResourceSocketEvents = async (socket, gridId, setResources, setTileTypes, masterResources) => {
  console.log('📡 Listening for Resource Socket Events');
};

export const listenForTileSocketEvents = async (socket, gridId, setTileTypes, masterResources) => {
  console.log('📡 Listening for Tile Socket Events');
};

// Attach listenForSocketEvents to the socket instance for backwards compatibility.
socket.listenForPCandNPCSocketEvents = listenForPCandNPCSocketEvents;
socket.listenForResourceSocketEvents = listenForResourceSocketEvents;
socket.listenForTileSocketEvents = listenForTileSocketEvents;

export default socket;