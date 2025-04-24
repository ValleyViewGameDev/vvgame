import { io } from 'socket.io-client';
import gridStateManager from './GridState/GridState';

const socket = io('https://vvgame-server.onrender.com', {
  transports: ['websocket'],
  autoConnect: false, // Don't connect until explicitly told to
});


// Check connection status after 3 seconds
setTimeout(() => {
  console.log('⏱️ Delayed check - socket.connected:', socket.connected);
}, 3000);

export const listenForPCandNPCSocketEvents = async (socketInstance, gridId, currentPlayer, setGridState) => {
  console.log('📡 Listening for Socket Events on grid:', gridId);

  const gridState = gridStateManager.getGridState(gridId);

  let lastUpdateTimePCs = 0;
  let lastUpdateTimeNPCs = 0;

  // PC sync listener
  const handlePCSync = ({ pcs, gridStatePCsLastUpdated, emitterId }) => {
    console.log('📥 Received gridState-sync-PCs event:', { pcs, gridStatePCsLastUpdated });
    console.log('📥 Emitter ID:', emitterId);

    if (emitterId === socket.id) {
      console.log('😀 Ignoring PC sync event from self.');
      return; // Ignore updates emitted by this client
    }

    if (!pcs || !gridStatePCsLastUpdated) return;

    const parsedPCTime = new Date(gridStatePCsLastUpdated);
    if (isNaN(parsedPCTime.getTime())) {
      console.error("Invalid gridStatePCsLastUpdated timestamp:", gridStatePCsLastUpdated);
      return;
    }

    if (parsedPCTime.getTime() > lastUpdateTimePCs) {
      const localPlayerId = currentPlayer?._id;

      // Filter out invalid PCs
      const validPCs = Object.fromEntries(
        Object.entries(pcs).filter(([id, pc]) => pc && pc.position && typeof pc.position.x === 'number' && typeof pc.position.y === 'number')
      );

      const newPCs = {
        ...validPCs,
        [localPlayerId]: validPCs[localPlayerId] || pcs[localPlayerId], // Ensure local PC is included
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

  return () => {
    console.log("🧹 Unsubscribing from PC and NPC sync events for grid:", gridId);
    socketInstance.off('gridState-sync-PCs', handlePCSync);
    socketInstance.off('gridState-sync-NPCs', handleNPCSync);
  };
};

export const listenForResourceSocketEvents = async (socket, gridId, setResources, setTileTypes, masterResources) => {
  //console.log('📡 Listening for Resource Socket Events');
};

export const listenForTileSocketEvents = async (socket, gridId, setTileTypes, masterResources) => {
  //console.log('📡 Listening for Tile Socket Events');
};

// Attach listenForSocketEvents to the socket instance for backwards compatibility.
socket.listenForPCandNPCSocketEvents = listenForPCandNPCSocketEvents;
socket.listenForResourceSocketEvents = listenForResourceSocketEvents;
socket.listenForTileSocketEvents = listenForTileSocketEvents;

export default socket;