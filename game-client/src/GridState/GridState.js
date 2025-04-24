import API_BASE from '../config';
import socket from '../socketManager'; 
import axios from 'axios';
import NPC from '../GameFeatures/NPCs/NPCs';
import { loadMasterResources } from '../Utils/TuningManager';
import { setGridStateExternally } from './GridStateContext'; // Add this at top

let gridTimer = null; // For periodic grid updates

let lastGridStateTimestamp = 0;
export const updateLastGridStateTimestamp = (timestamp) => {
  if (timestamp > lastGridStateTimestamp) {
    lastGridStateTimestamp = timestamp;
  }
};
export const getLastGridStateTimestamp = () => lastGridStateTimestamp;

class GridStateManager {
  constructor() {
    this.gridStates = {}; // Store grid states in memory
    console.log('GridStateManager instance created.');
  }

  /**
   * Initialize the gridState for a specific gridId.
   */
  async initializeGridState(gridId) {
    console.log('Fetching gridState for gridId:', gridId);
    if (!gridId) {
      console.error('initializeGridState: gridId is undefined.');
      return;
    }
  
    try {
      const response = await axios.get(`${API_BASE}/api/load-grid-state/${gridId}`);
      const {
        gridStateNPCs = { npcs: {}, lastUpdated: 0 },
        gridStatePCs  = { pcs:  {}, lastUpdated: 0 }
      } = response.data;

      // Build a consolidated local state for convenience
      const gridState = {
        npcs: gridStateNPCs.npcs || {},
        pcs:  gridStatePCs.pcs  || {},
        lastUpdated: Math.max(
          new Date(gridStateNPCs.lastUpdated || 0).getTime(),
          new Date(gridStatePCs.lastUpdated  || 0).getTime()
        ),
      };

      console.log('Fetched gridState:', gridState);

      // Load master resources
      const masterResources = await loadMasterResources();

      // Rehydrate NPCs
      if (gridState.npcs) {
        Object.keys(gridState.npcs).forEach((npcId) => {
          const lightweightNPC = gridState.npcs[npcId];

          console.log('lightweightNPC:', lightweightNPC);
          console.log('masterResources:', masterResources);

          const npcTemplate = masterResources.find(
            (res) => res.type === lightweightNPC.type
          );

          if (npcTemplate) {
            gridState.npcs[npcId] = new NPC(
              npcId,
              lightweightNPC.type,
              lightweightNPC.position,
              { ...npcTemplate, ...lightweightNPC }
            );
            console.log(`Rehydrated NPC with ID: ${npcId}`, gridState.npcs[npcId]);
          } else {
            console.warn(`No template found for NPC type: ${lightweightNPC.type}`);
          }
        });
      }

    // **Preserve PCs from DB (don’t wipe them)**
    gridState.pcs = gridState.pcs || {};  // Only initialize if undefined

    console.log('Existing PCs from DB:', gridState.pcs);

    // **Rehydrate PCs (existing and returning players)**
    Object.keys(gridState.pcs).forEach((playerId) => {
      const pcData = gridState.pcs[playerId];
    
      gridState.pcs[playerId] = {
        ...pcData,  // Automatically rehydrate all properties
        position: pcData.position || { x: 0, y: 0 },  // Provide fallback for critical fields
      };
    
      console.log(`Rehydrated PC with ID: ${playerId}`, gridState.pcs[playerId]);
    });


  // **Step 2: Check for and add the current player (new player case)**
    const currentPlayer = JSON.parse(localStorage.getItem('player'));
    if (currentPlayer && !gridState.pcs[currentPlayer._id]) {
      console.log(`Adding currentPlayer ${currentPlayer.username} to gridState for gridId ${gridId}`);

      // **Ensure clean structure for gridState.pcs**
      gridState.pcs[currentPlayer._id] = {
        playerId: currentPlayer._id,
        type: 'pc',  // Default 'pc' for player characters
        username: currentPlayer.username,
        position: { x: currentPlayer.location.x || 2, y: currentPlayer.location.y || 2 },  // Ensure correct position format
        icon: currentPlayer.icon || '😀',
        hp: currentPlayer.hp || 1,
        maxhp: currentPlayer.maxhp || 1,  // Ensure maxhp is included
        attackbonus: currentPlayer.attackbonus || 1,
        armorclass: currentPlayer.armorclass || 1,
        damage: currentPlayer.damage || 1,
        attackrange: currentPlayer.attackrange || 1,
        speed: currentPlayer.speed || 1,
        iscamping: currentPlayer.iscamping || false,
      };

      // Save the updated PCs only
      await this.saveGridStatePCs(gridId);
    } else {
      console.log(`Player ${currentPlayer?.username} already exists in gridState.`);
    }

      this.gridStates[gridId] = gridState;
      console.log(`🔄 Loaded gridState with timestamp:`, gridState.lastUpdated || 'No timestamp');
      console.log(`Initialized and enriched gridState for gridId ${gridId}:`, gridState);
    } catch (error) {
      console.error('Error fetching gridState:', error);
    }
  }


  
/**
 * Get the gridState for a specific gridId.
 */
getGridState(gridId) {
  const gridState = this.gridStates[gridId];
  if (!gridState) {
    console.warn(`⚠️ No gridState found for gridId: ${gridId}`);
    return { npcs: {}, pcs: {} }; // Return empty structure if not found
  }

  // Combine gridStatePCs and gridStateNPCs into a single structure
  return {
    npcs: gridState.npcs || {},
    pcs: gridState.pcs || {},
  };
}
 
  /**
 * Spawn a new NPC and immediately save the updated gridState to the DB.
 */
async spawnNPC(gridId, npcType, position) {
  
  console.log('spawnNPC called with:', { gridId, npcType, position });
  if (typeof npcType === 'object' && npcType?.type) { npcType = npcType.type; // Extract the type string
  }
  if (typeof npcType !== 'string') { console.error('Invalid npcType. Expected a string but got:', npcType); return;
  }
  const masterResources = await axios.get(`${API_BASE}/api/resources`);
  const npcTemplate = masterResources.data.find((res) => res.type === npcType && res.category === 'npc');
  if (!npcTemplate) { console.error(`NPC template not found for type: ${npcType}`); return; }

  const npcId = `${Date.now()}`;

  let lightweightNPC;

  if (npcTemplate.action === 'graze') {
    lightweightNPC = {
      id: npcId,
      type: npcType,
      action: npcTemplate.action,
      state: 'idle',
      position,
      hp: 0,   
      maxhp: npcTemplate.maxhp,
      lastMoveTime: 0,
    };
  } else if (npcTemplate.action === 'spawn') {  // Ensure spawners track nextspawn
    lightweightNPC = {
      id: npcId,
      type: npcType,
      action: npcTemplate.action,
      state: 'hungry',
      position,
      hp: npcTemplate.maxhp,
      maxhp: npcTemplate.maxhp,
      lastMoveTime: 0,
      nextspawn: Date.now() + npcTemplate.speed * 1000  // Ensure nextspawn is explicitly set
    };
  } else {  
    lightweightNPC = {
      id: npcId,
      type: npcType,
      action: npcTemplate.action,
      state: 'idle',
      position,
      hp: npcTemplate.maxhp,
      maxhp: npcTemplate.maxhp,
      lastMoveTime: 0
    };
  }
  console.log('Creating lightweightNPC:', lightweightNPC);

  // Ensure NPC is properly instantiated as an `NPC` class object before adding
  const npc = new NPC(
    npcId,
    npcType,
    position,
    { ...npcTemplate, ...lightweightNPC },
    gridId       // Include gridId
  );
  this.addNPC(gridId, npc);

  console.log(`Successfully added NPC to gridState. NPC ID: ${npcId}`);

}
  /**
   * Add an NPC to the gridState.
   */

async addNPC(gridId, npc) {
    console.log(`Adding NPC to gridState for gridId: ${gridId}. NPC:`, npc);
    const gridState = this.getGridState(gridId);
    if (!gridState) {
      console.error(`Cannot add NPC. No gridState found for gridId: ${gridId}`);
      return;
    }
    if (!gridState.npcs) gridState.npcs = {};
    // Load masterResources and ensure it's an array
    const masterResources = await loadMasterResources(); // Assuming ensureMasterResources is an async function
    if (!Array.isArray(masterResources)) {
      console.error('masterResources is not an array:', masterResources);
      return;
    }
    // Find the NPC template
    const npcTemplate = masterResources.find(
      (res) => res.type === npc.type && res.category === 'npc'
    );

    if (npcTemplate) {
      gridState.npcs[npc.id] = new NPC(
        npc.id,
        npc.type,
        npc.position,
        { ...npc, ...npcTemplate },
        gridId
      );
    
    } else {
      console.warn(`No template found for NPC type: ${npc.type}. Adding as plain object.`);
      gridState.npcs[npc.id] = npc;
    }
    console.log(`NPC added to gridState for gridId ${gridId}. Current NPCs:`, gridState.npcs);
    this.saveGridStateNPCs(gridId);
  }

/**
 * Update an NPC in the gridState and save to the DB.
 */
updateNPC(gridId, npcId, newProperties) {
  const gridState = this.getGridState(gridId);
  if (!gridState || !gridState.npcs?.[npcId]) {
    console.error(`Cannot update NPC ${npcId}. No gridState or NPC found for gridId: ${gridId}`);
    return;
  }
  Object.assign(gridState.npcs[npcId], newProperties);
  gridState.lastUpdated = Date.now();
  updateLastGridStateTimestamp(gridState.lastUpdated);
  console.log(`NPC ${npcId} updated in gridState for gridId ${gridId}:`, gridState.npcs[npcId]);
  // Save the updated gridState to the database
  this.saveGridStateNPCs(gridId);
}

/**
 * Remove an NPC from the gridState and save to the DB.
 */
removeNPC(gridId, npcId) {
  const gridState = this.getGridState(gridId);
  if (!gridState || !gridState.npcs) {
    console.error(`Cannot remove NPC. No gridState or NPCs found for gridId: ${gridId}`);
    return;
  }
  delete gridState.npcs[npcId];
  console.log(`NPC ${npcId} removed from gridState for gridId ${gridId}.`);
  // Save the updated gridState to the database
  this.saveGridStateNPCs(gridId);
}

addPC(gridId, pc) {
  const gridState = this.getGridState(gridId);
  console.log(`Top of AddPC; gridState = `, gridState); // Debugging check
  if (!gridState) {
    console.error(`Cannot add PC. No gridState found for gridId: ${gridId}`);
    return;
  }
  if (!gridState.pcs) gridState.pcs = {}; // Ensure pcs is initialized
  if (!gridState.npcs) gridState.npcs = {}; // Ensure npcs is initialized
  gridState.pcs[pc.playerId] = pc;  // Add PC to the grid state
  console.log(`PC added to gridState for gridId ${gridId}. Current PCs:`, gridState.pcs);
  console.log(`Ensuring NPCs are preserved:`, gridState.npcs); // Debugging check

  this.saveGridStatePCs(gridId);  // Save the updated PCs only
}

updatePC(gridId, playerId, newProperties) {
  const gridState = this.getGridState(gridId);
  if (!gridState || !gridState.pcs?.[playerId]) {
    console.error(`Cannot update PC ${playerId}. No gridState or PC found for gridId: ${gridId}`);
    return;
  }
  // Merge the new properties into the existing PC data
  Object.assign(gridState.pcs[playerId], newProperties);
  console.log(`PC ${playerId} updated in gridState for gridId ${gridId}:`, gridState.pcs[playerId]);
  // Save the updated gridState to the database
  this.saveGridStatePCs(gridId);
}

/**
 * Testing
 * Save only PCs in the gridState to the database.
 */
async saveGridStatePCs(gridId) {
  try {
    const gridState = this.gridStates[gridId];
    if (!gridState || !gridState.pcs) {
      console.warn(`⚠️ No PCs to save for grid ${gridId}`);
      return;
    }

    // Emit updated PCs to other clients
    if (socket && socket.emit) {
      console.log(`📡 Emitting gridStatePCs update for grid ${gridId}`);
      socket.emit('gridState-sync', {
        gridId,
        updatedGridState: {
          gridStatePCs: gridState.pcs,
          gridStatePCsLastUpdated: Date.now(),
        },
      });
    }

    // Save to the server
    await axios.post(`${API_BASE}/api/save-grid-state-pcs`, {
      gridId,
      pcs: gridState.pcs,
    });

    console.log(`✅ Saved PCs for grid ${gridId}`);
  } catch (error) {
    console.error(`❌ Error saving PCs for grid ${gridId}:`, error);
  }
}

/**
 * Save only NPCs in the gridState to the database.
 */
async saveGridStateNPCs(gridId) {
  const gridState = this.getGridState(gridId);
  if (!gridState) {
    console.error(`Cannot save NPCs. No gridState found for gridId: ${gridId}`);
    return;
  }
  try {
    // Fetch current NPC state from server
    const response = await axios.get(`${API_BASE}/api/load-grid-state/${gridId}`);
    const { gridStateNPCs = {} } = response.data;
    const { npcs: dbNpcs = {}, lastUpdated: rawDbNpcLast } = gridStateNPCs;
    const hasDbNpcs = Object.keys(dbNpcs).length > 0;
    const dbNpcTs = hasDbNpcs && rawDbNpcLast ? new Date(rawDbNpcLast).getTime() : 0;
    const localNpcTs = gridState.npcs?.lastUpdated || 0;
    if (dbNpcTs > localNpcTs) {
      console.log('💾 DB has more recent NPC data, preserving it');
      gridState.npcs = gridStateNPCs.npcs || {};
    } else {
      gridState.npcs = { ...(gridState.npcs || {}), lastUpdated: Date.now() };
    }
    // Sync manager timestamp
    this.gridStates[gridId].lastUpdated = Date.now();
    updateLastGridStateTimestamp(this.gridStates[gridId].lastUpdated);
    // Debug logging
    const npcIds = Object.keys(gridState.npcs || {});
    console.warn(`💾 Saving NPCs for gridId: ${gridId}`, npcIds);
    // Send only NPCs payload
    await axios.post(`${API_BASE}/api/save-grid-state-npcs`, { gridId, npcs: gridState.npcs });
    // Emit update
    socket.emit('update-gridState', {
      gridId,
      gridState: {
        lastUpdated: this.gridStates[gridId].lastUpdated,
        npcs: gridState.npcs,
        pcs:  gridState.pcs,
      },
    });
    if (typeof setGridStateExternally === 'function') {
      setGridStateExternally(this.gridStates[gridId]);
    }
  } catch (error) {
    console.error('Error saving gridStateNPCs:', error);
  }
}

  /**
   * Start periodic updates for NPCs in the gridState.
  */
  startGridTimer(gridId) {
    if (gridTimer) clearInterval(gridTimer);
  
    gridTimer = setInterval(() => {
      const gridState = this.getGridState(gridId);
      if (!gridState) return;
  
      const { npcs } = gridState;
      const now = Date.now();
  
      Object.values(npcs || {}).forEach((npc) => {
        if (npc instanceof NPC && typeof npc.update === 'function') {
          //console.log(`Calling update() for NPC ID: ${npc.id}`);
          npc.update(now, gridState); // Let each NPC handle its own updates
        } else {
          console.error(`NPC ID: ${npc.id} is not a valid NPC instance or missing update method. NPC:`, npc);
        }
      });
  
      console.log(`Processed NPC updates for gridId ${gridId}.`);
    }, 1000);
  }

  /**
   * Stop periodic updates for NPCs.
   */
stopGridTimer() {
    if (gridTimer) clearInterval(gridTimer);
    gridTimer = null;
  }


  // Stop updates or clear grid state
stopGridStateUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval); // Clear periodic updates
      this.updateInterval = null;
      //console.log('Grid state updates stopped.');
    }
    this.gridStates = {}; // Clear in-memory grid states
  }
}

const gridStateManager = new GridStateManager();

// Export individual methods for direct use
export const {
  initializeGridState,
  getGridState,
  addNPC,
  updateNPC,
  addPC,
  updatePC,
  removeNPC, 
  saveGridStatePCs,
  saveGridStateNPCs,
} = gridStateManager;

// Default export for the entire manager
export default gridStateManager;