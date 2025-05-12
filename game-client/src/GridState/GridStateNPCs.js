import API_BASE from '../config';
import socket from '../socketManager'; 
import axios from 'axios';
import NPC from '../GameFeatures/NPCs/NPCs';
import { loadMasterResources } from '../Utils/TuningManager';

let gridTimer = null; // For periodic grid updates
let externalSetGridState = null;

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

  registerSetGridState(setterFunction) {
    externalSetGridState = setterFunction;
  }

  /**
   * Initialize the gridState for a specific gridId.
   */
  async initializeGridState(gridId) {
    
    console.log('🔍 NPC class prototype:', NPC?.prototype); // move it here

    console.log('Fetching gridState for gridId:', gridId);
    if (!gridId) {
      console.error('initializeGridState: gridId is undefined.');
      return;
    }

    try {
      const response = await axios.get(`${API_BASE}/api/load-grid-state/${gridId}`);
      const {
        gridStateNPCs = { npcs: {}, lastUpdated: 0 },
        gridStatePCs = { pcs: {}, lastUpdated: 0 },
      } = response.data;

      // Build a consolidated local state with independent timestamps
      const gridState = {
        npcs: gridStateNPCs.npcs || {},
        pcs: gridStatePCs.pcs || {},
        gridStateNPCsLastUpdated: new Date(gridStateNPCs.lastUpdated || 0).getTime(),
        gridStatePCsLastUpdated: new Date(gridStatePCs.lastUpdated || 0).getTime(),
      };

      console.log('Fetched gridState:', gridState);

      // Load master resources
      const masterResources = await loadMasterResources();

      // Rehydrate NPCs
      if (gridState.npcs) {
        Object.keys(gridState.npcs).forEach((npcId) => {
          const lightweightNPC = gridState.npcs[npcId];
          const npcTemplate = masterResources.find(
            (res) => res.type === lightweightNPC.type
          );

          console.log('🔄 Rehydrating NPC:', npcId, lightweightNPC);
          console.log('  🔍 Before rehydration — constructor:', lightweightNPC?.constructor?.name);
          console.log('  🔍 Before rehydration — has update:', typeof lightweightNPC.update === 'function');
          console.log('  🔍 npcTemplate:', npcTemplate);

          if (!npcTemplate) {
            console.warn(`⚠️ Missing template for NPC type: ${lightweightNPC.type}`);
            console.log('Master resources:', masterResources.map(res => res.type));
          }

          const hydrated = new NPC(
            npcId,
            lightweightNPC.type,
            lightweightNPC.position,
            { ...npcTemplate, ...lightweightNPC },
            gridId
          );

          console.log('  ✅ Hydrated NPC instance:', hydrated);
          console.log('  🔍 After hydration — constructor:', hydrated.constructor?.name);
          console.log('  🔍 After hydration — has update:', typeof hydrated.update === 'function');

          gridState.npcs[npcId] = hydrated;
        });
      }

      this.gridStates[gridId] = gridState;
      console.log(`Initialized and enriched gridState for gridId ${gridId}:`, gridState);
    } catch (error) {
      console.error('Error fetching gridState:', error);
    }
  }

  /**
   * Get the gridState for a specific gridId.
   */
  getGridState(gridId) {
    console.log('⊞ getGridState called with gridId:', gridId);
    const gridState = this.gridStates[gridId];
    console.log('⊞ this.gridStates[gridId]:', gridState);
    if (!gridState) {
      console.warn(`⚠️ No gridState found for gridId: ${gridId}`);
      return { npcs: {} }; // Only return NPCs
    }

    return {
      npcs: gridState.npcs || {},
    };
  }

  /**
   * Spawn a new NPC and immediately save the updated gridState to the DB.
   */
  async spawnNPC(gridId, npcType, position) {
    // DEBUG: Log input parameters for spawnNPC
    console.log('spawnNPC called with:', { gridId, npcType, position });
    if (typeof npcType === 'object' && npcType?.type) {
      npcType = npcType.type; // Extract the type string
    }
    if (typeof npcType !== 'string') {
      console.error('Invalid npcType. Expected a string but got:', npcType);
      return;
    }
    const masterResources = await axios.get(`${API_BASE}/api/resources`);
    const npcTemplate = masterResources.data.find((res) => res.type === npcType && res.category === 'npc');
    if (!npcTemplate) {
      console.error(`NPC template not found for type: ${npcType}`);
      return;
    }

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
        lastUpdated: Date.now(),
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
        lastUpdated: Date.now(),
        nextspawn: Date.now() + npcTemplate.speed * 1000, // Ensure nextspawn is explicitly set
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
        lastUpdated: Date.now(),
      };
    }
    console.log('Creating lightweightNPC:', lightweightNPC);

    // Ensure NPC is properly instantiated as an `NPC` class object before adding
    const npc = new NPC(
      npcId,
      npcType,
      position,
      { ...npcTemplate, ...lightweightNPC },
      gridId // Include gridId
    );
    this.addNPC(gridId, npc);

    console.log(`Successfully added NPC to gridState. NPC ID: ${npcId}`);
  }

  /**
   * Add an NPC to the gridState using per-NPC save model.
   */
  async addNPC(gridId, npc) {
    console.log(`Adding NPC to gridState for gridId: ${gridId}. NPC:`, npc);
    const gridState = this.gridStates[gridId];
    if (!gridState) {
      console.error(`Cannot add NPC. No gridState found for gridId: ${gridId}`);
      return;
    }
    if (!gridState.npcs) gridState.npcs = {};

    const now = Date.now();
    npc.lastUpdated = now;

    gridState.npcs[npc.id] = npc;

    try {
      await axios.post(`${API_BASE}/api/save-single-npc`, {
        gridId,
        npcId: npc.id,
        npc,
        lastUpdated: now,
      });
      console.log(`✅ Saved single NPC ${npc.id} to server.`);
    } catch (error) {
      console.error(`❌ Failed to save single NPC ${npc.id}:`, error);
    }

    if (socket && socket.emit) {
      socket.emit('update-gridState-NPCs', {
        gridId,
        npcs: { [npc.id]: npc },
        gridStateNPCsLastUpdated: now,
      });
      console.log(`📡 Emitted NPC grid-state update for NPC ${npc.id}`);
    }
  }

  /**
   * Update an NPC in the gridState using the per-NPC save model.
   */
  async updateNPC(gridId, npcId, newProperties) {
    console.log(`🐮++ Updating NPC ${npcId} for gridId: ${gridId}`);
    const gridState = this.gridStates[gridId];
    const existing = gridState?.npcs?.[npcId];

    if (!gridState || !gridState.npcs?.[npcId]) {
      console.error(`Cannot update NPC ${npcId}. No gridState or NPC found for gridId: ${gridId}`);
      return;
    }

    if (!(existing instanceof NPC)) {
      console.error(`🛑 Skipping updateNPC for ${npcId} — not an instance of NPC:`, existing);
      return;
    }
  
    const now = Date.now();
    const npc = gridState.npcs[npcId]; // already an instance of NPC
    Object.assign(npc, newProperties);
    npc.lastUpdated = now;

    console.log(`[🐮 gridStateManager.updateNPC] NPC ${npcId} updated with:`, newProperties);

    try {
      await axios.post(`${API_BASE}/api/save-single-npc`, {
        gridId,
        npcId,
        npc,
        lastUpdated: now,
      });
      console.log(`🐮✅ Saved single NPC ${npcId} to server.`);
    } catch (error) {
      console.error(`❌ Failed to save single NPC ${npcId}:`, error);
    }

    if (socket && socket.emit) {
      socket.emit('update-gridState-NPCs', {
        gridId,
        npcs: { [npcId]: npc },
        gridStateNPCsLastUpdated: now,
      });
      console.log(`🐮📡 Emitted NPC update for ${npcId}`);
    }
  }

  /**
   * Remove an NPC from the gridState using the per-NPC save model.
   */
  async removeNPC(gridId, npcId) {
    console.log(`Removing NPC ${npcId} from gridId: ${gridId}`);
    const gridState = this.gridStates[gridId];
    if (!gridState || !gridState.npcs) {
      console.error(`Cannot remove NPC. No gridState or NPCs found for gridId: ${gridId}`);
      return;
    }

    delete gridState.npcs[npcId];

    try {
      await axios.post(`${API_BASE}/api/remove-single-npc`, {
        gridId,
        npcId,
      });
      console.log(`✅ Removed single NPC ${npcId} from server.`);
    } catch (error) {
      console.error(`❌ Failed to remove single NPC ${npcId}:`, error);
    }

    if (socket && socket.emit) {
      socket.emit('update-gridState-NPCs', {
        gridId,
        npcs: { [npcId]: null }, // Broadcast removal
        gridStateNPCsLastUpdated: Date.now(),
      });
      console.log(`📡 Emitted NPC removal for ${npcId}`);
    }
  }

  /**
   * Save only NPCs in the gridState to the database.
   * This version dehydrates live NPC instances into plain objects and matches the PC saving structure.
   */
  async saveGridStateNPCs(gridId) {
    console.log('💾 saveGridStateNPCs called with gridId:', gridId);
    try {
      const gridState = this.gridStates[gridId];
      if (!gridState || !gridState.npcs) {
        console.warn(`⚠️ No NPCs to save for grid ${gridId}`);
        return;
      }

      // Update local NPC timestamp
      const now = Date.now();
      gridState.gridStateNPCsLastUpdated = now;

      // Dehydrate the NPCs to simple objects
      const dehydratedNPCs = {};
      Object.entries(gridState.npcs).forEach(([id, npc]) => {
        dehydratedNPCs[id] = {
          id: npc.id,
          type: npc.type,
          position: npc.position,
          state: npc.state,
          hp: npc.hp,
          maxhp: npc.maxhp,
          grazeEnd: npc.grazeEnd,
          lastUpdated: npc.lastUpdated,
        };
      });

      const payload = {
        gridId,
        npcs: dehydratedNPCs,
        gridStateNPCsLastUpdated: now,
      };

      console.log('💾 Payload for saving NPCs:', payload);

      // Save to server
      await axios.post(`${API_BASE}/api/save-grid-state-npcs`, payload);
      console.log(`✅ 💾 Saved NPCs for grid ${gridId}`);

      // Emit updated NPCs to other clients
      if (socket && socket.emit) {
        console.log(`📡 Emitting NPC grid-state for grid ${gridId}`);
        socket.emit('update-gridState-NPCs', {
          gridId,
          npcs: dehydratedNPCs,
          gridStateNPCsLastUpdated: now,
        });
      }
    } catch (error) {
      console.error(`❌ Error saving NPCs for grid ${gridId}:`, error);
    }
  }

  /**
   * Start periodic updates for NPCs in the gridState.
   */
  startGridTimer(gridId) {
    if (gridTimer) clearInterval(gridTimer);

    gridTimer = setInterval(() => {
      const gridState = this.gridStates[gridId];
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

  setAllNPCs(gridId, npcs) {
    if (!this.gridStates[gridId]) {
      this.gridStates[gridId] = { npcs: {} };
    }
    this.gridStates[gridId].npcs = npcs;

    if (typeof externalSetGridState === 'function') {
      externalSetGridState((prev) => ({
        ...prev,
        [gridId]: {
          ...prev[gridId],
          npcs,
        },
      }));
    }
  }
}

const gridStateManager = new GridStateManager();

// Export individual methods for direct use
export const {
  initializeGridState,
  getGridState,
  addNPC,
  updateNPC,
  removeNPC, 
  saveGridStateNPCs,
  registerSetGridState,
  setAllNPCs,
} = gridStateManager;

// Default export for the entire manager
export default gridStateManager;