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
  const handlePCSync = ({ pcs, gridStatePCsLastUpdated }) => {
    console.log('📥 Received gridState-sync-PCs event:', { pcs, gridStatePCsLastUpdated });
    if (!pcs || !gridStatePCsLastUpdated) return;
    const parsedPCTime = new Date(gridStatePCsLastUpdated);
    if (isNaN(parsedPCTime.getTime())) {
      console.error("Invalid gridStatePClastUpdated timestamp:", gridStatePCsLastUpdated);
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
  const handleNPCSync = ({ npcs, gridStateNPCsLastUpdated }) => {
    console.log('📥 Received gridState-sync-NPCs event:', { npcs, gridStateNPCsLastUpdated });
    if (!npcs || !gridStateNPCsLastUpdated) return;
    const parsedNPCTime = new Date(gridStateNPCsLastUpdated);
    if (isNaN(parsedNPCTime.getTime())) {
      console.error("Invalid gridStateNPClastUpdated timestamp:", gridStateNPCsLastUpdated);
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

  console.log("🧲 Subscribing to PC and NPC sync events for grid:", gridId);
  socketInstance.on('gridState-sync-PCs', handlePCSync);
  socketInstance.on('gridState-sync-NPCs', handleNPCSync);

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