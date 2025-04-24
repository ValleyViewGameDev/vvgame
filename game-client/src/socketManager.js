import { io } from 'socket.io-client';
import gridStateManager from './GridState/GridState';

const socket = io('https://vvgame-server.onrender.com', {
  transports: ['websocket'],
  autoConnect: false, // Don't connect until explicitly told to
});

// Add global logging for connection status
socket.on('connect', () => console.log('✅ Global Socket connected:', socket.id));
socket.on('disconnect', (reason) => console.log('🔌 Global Socket disconnected:', reason));
socket.on('connect_error', (err) => console.error('❌ Global Socket connect_error:', err));

// Check connection status after 3 seconds
setTimeout(() => {
  console.log('⏱️ Delayed check - socket.connected:', socket.connected);
}, 3000);

export const listenForPCandNPCSocketEvents = async (socketInstance, gridId, currentPlayer, setGridState) => {
  console.log('📡 Listening for Socket Events on grid:', gridId);
  
  socketInstance.on('connect', () => console.log('✅ SocketInstance connected:', socketInstance.id));
  socketInstance.on('disconnect', (reason) => console.log('🔌 SocketInstance disconnected:', reason));

  // Optional: listen for a custom "room-joined" event from server confirming join
  socketInstance.on('room-joined', (data) => {
    console.log('📥 Received room-joined confirmation:', data);
  });

  const gridState = gridStateManager.getGridState(gridId);

  let lastUpdateTimePCs = 0;
  let lastUpdateTimeNPCs = 0;

  // PC sync listener
  const handlePCSync = ({ pcs, gridStatePClastUpdated }) => {
    console.log('📥 Received gridState-sync-PCs event:', { pcs, gridStatePClastUpdated });
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
        [localPlayerId]: pcs[localPlayerId] || '[Local PC still exists?]',
      };
      console.log('⏩ Updating local PCs with data:', newPCs);
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

  // NPC sync listener
  const handleNPCSync = ({ npcs, gridStateNPClastUpdated }) => {
    console.log('📥 Received gridState-sync-NPCs event:', { npcs, gridStateNPClastUpdated });
    if (!npcs || !gridStateNPClastUpdated) return;
    const parsedNPCTime = new Date(gridStateNPClastUpdated);
    if (isNaN(parsedNPCTime.getTime())) {
      console.error("Invalid gridStateNPClastUpdated timestamp:", gridStateNPClastUpdated);
      return;
    }
    if (parsedNPCTime.getTime() > lastUpdateTimeNPCs) {
      console.log('⏩ Updating local NPCs:', npcs);
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

  // Player join/leave events
  const handlePlayerJoinedGrid = ({ playerId, username, playerData }) => {
    console.log(`📥 Player joined: ${username} (${playerId}) with data:`, playerData);
    setGridState(prevState => ({
      ...prevState,
      pcs: {
        ...prevState.pcs,
        [playerId]: playerData,
      },
    }));
  };

  const handlePlayerLeftGrid = ({ playerId, username }) => {
    console.log(`📥 Player left: ${username} (${playerId})`);
    setGridState(prevState => {
      const newPCs = { ...prevState.pcs };
      delete newPCs[playerId];
      return {
        ...prevState,
        pcs: newPCs,
      };
    });
  };

  console.log("🧲 Subscribing to PC and NPC sync events for grid:", gridId);
  socketInstance.on('gridState-sync-PCs', handlePCSync);
  socketInstance.on('gridState-sync-NPCs', handleNPCSync);
  socketInstance.on('player-joined-grid', handlePlayerJoinedGrid);
  socketInstance.on('player-left-grid', handlePlayerLeftGrid);

  // Log outgoing events if needed:
  const originalEmit = socketInstance.emit;
  socketInstance.emit = function(event, data) {
    console.log(`📤 Emitting event "${event}" with payload:`, data);
    originalEmit.call(socketInstance, event, data);
  };

  return () => {
    console.log("🧹 Unsubscribing from PC and NPC sync events for grid:", gridId);
    socketInstance.off('gridState-sync-PCs', handlePCSync);
    socketInstance.off('gridState-sync-NPCs', handleNPCSync);
    socketInstance.off('player-joined-grid', handlePlayerJoinedGrid);
    socketInstance.off('player-left-grid', handlePlayerLeftGrid);
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