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
    this.NPCsInGrid = {}; // Store grid states in memory
    console.log('GridStateManager instance created.');
  }

  registerSetGridState(setterFunction) {
    externalSetGridState = setterFunction;
  }

  /**
   * Initialize the NPCsInGrid for a specific gridId.
   */
  async initializeGridState(gridId) {

    console.log('👍 Initialize NPCsInGrid for gridId:', gridId);
    if (!gridId) {
      console.error('initializeGridState: gridId is undefined.');
      return;
    }

    try {
      const response = await axios.get(`${API_BASE}/api/load-grid-state/${gridId}`);
      const {
        NPCsInGrid = { npcs: {}, lastUpdated: 0 },
      } = response.data;

      // Build a consolidated local state with independent timestamps
      const hydratedState = {
        npcs: NPCsInGrid.npcs || {},
        NPCsInGridLastUpdated: new Date(NPCsInGrid.lastUpdated || 0).getTime(),
      };
      const npcs = hydratedState.npcs || {};
      console.log('Fetched NPCsInGrid:', hydratedState);

      // Load master resources
      const masterResources = await loadMasterResources();

      // Rehydrate NPCs
      if (npcs) {
        Object.keys(npcs).forEach((npcId) => {
          const lightweightNPC = npcs[npcId];
          const npcTemplate = masterResources.find((res) => res.type === lightweightNPC.type);
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

          NPCsInGrid.npcs[npcId] = hydrated;
        });
      }

      this.NPCsInGrid[gridId] = NPCsInGrid;

      if (this.setGridStateReact) {
        console.log('📡 Syncing initialized NPCs to React state for gridId:', gridId);
        this.setGridStateReact(prev => ({
          ...prev,
          [gridId]: {
            ...(prev[gridId] || {}),
            ...NPCsInGrid,
          },
        }));
      }

      console.log(`✅ Initialized and enriched NPCsInGrid for gridId ${gridId}:`, NPCsInGrid);
    } catch (error) {
      console.error('Error fetching NPCsInGrid:', error);
    }
  }

  /**
   * Get the NPCsInGrid for a specific gridId.
   */
  getNPCsInGrid(gridId) {
    const NPCsInGrid = this.NPCsInGrid[gridId];
    if (!NPCsInGrid) {
      console.warn(`⚠️ No NPCsInGrid found for gridId: ${gridId}`);
      return { npcs: {} }; // Only return NPCs
    }
    return NPCsInGrid.npcs;
  }

  /**
   * Spawn a new NPC and immediately save the updated NPCsInGrid to the DB.
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

    console.log(`Successfully added NPC to NPCsInGrid. NPC ID: ${npcId}`);

    const updatedGridState = this.getNPCsInGrid(gridId);
    this.setAllNPCs(gridId, updatedGridState);
  }

  /**
   * Add an NPC to the NPCsInGrid using per-NPC save model.
   */
  async addNPC(gridId, npc) {
    console.log(`Adding NPC to NPCsInGrid for gridId: ${gridId}. NPC:`, npc);
    const NPCsInGrid = this.NPCsInGrid[gridId];
    if (!NPCsInGrid) {
      console.error(`Cannot add NPC. No NPCsInGrid found for gridId: ${gridId}`);
      return;
    }
    if (!NPCsInGrid.npcs) NPCsInGrid.npcs = {};

    const now = Date.now();
    npc.lastUpdated = now;

    NPCsInGrid.npcs[npc.id] = npc;

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
      const payload = {
        [gridId]: {
          npcs: { [npc.id]: npc }, // or [npc.id]: npc in addNPC
          NPCsInGridLastUpdated: now,
        },
        emitterId: socket.id,
      };
      console.log("📡 Emitting update-NPCsInGrid-NPCs with payload:", JSON.stringify(payload, null, 2));
      socket.emit('update-NPCsInGrid-NPCs', payload);
    }
  }

  /**
   * Update an NPC in the NPCsInGrid using the per-NPC save model.
   */
  async updateNPC(gridId, npcId, newProperties) {
    console.log(`🐮++ Updating NPC ${npcId} for gridId: ${gridId}`);
    const NPCsInGrid = this.NPCsInGrid[gridId];
    const existing = NPCsInGrid?.npcs?.[npcId];

    if (!NPCsInGrid || !NPCsInGrid.npcs?.[npcId]) {
      console.error(`Cannot update NPC ${npcId}. No NPCsInGrid or NPC found for gridId: ${gridId}`);
      return;
    }

    if (!(existing instanceof NPC)) {
      console.error(`🛑 Skipping updateNPC for ${npcId} — not an instance of NPC:`, existing);
      return;
    }
  
    const now = Date.now();
    const npc = NPCsInGrid.npcs[npcId]; // already an instance of NPC
    Object.assign(npc, newProperties);
    npc.lastUpdated = now;

    console.log(`[🐮 NPCsInGridManager.updateNPC] NPC ${npcId} updated with:`, newProperties);

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
      const payload = {
        [gridId]: {
          npcs: { [npcId]: npc }, // or [npc.id]: npc in addNPC
          NPCsInGridLastUpdated: now,
        },
        emitterId: socket.id,
      };
      //console.log("📡 Emitting update-NPCsInGrid-NPCs with payload:", JSON.stringify(payload, null, 2));
      socket.emit('update-NPCsInGrid-NPCs', payload);
    }

    const updatedGridState = this.getNPCsInGrid(gridId);
    this.setAllNPCs(gridId, updatedGridState);
  }

  /**
   * Remove an NPC from the NPCsInGrid using the per-NPC save model.
   */
  async removeNPC(gridId, npcId) {
    console.log(`Removing NPC ${npcId} from gridId: ${gridId}`);
    const NPCsInGrid = this.NPCsInGrid[gridId];
    if (!NPCsInGrid || !NPCsInGrid.npcs) {
      console.error(`Cannot remove NPC. No NPCsInGrid or NPCs found for gridId: ${gridId}`);
      return;
    }

    delete NPCsInGrid.npcs[npcId];

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
      socket.emit('update-NPCsInGrid-NPCs', {
        gridId,
        npcs: { [npcId]: null }, // Broadcast removal
        NPCsInGridLastUpdated: Date.now(),
      });
      console.log(`📡 Emitted NPC removal for ${npcId}`);
    }
  }

  /**
   * Save only NPCs in the NPCsInGrid to the database.
   * This version dehydrates live NPC instances into plain objects and matches the PC saving structure.
   */
  async saveGridStateNPCs(gridId) {
    console.log('💾 saveGridStateNPCs called with gridId:', gridId);
    try {
      const NPCsInGrid = this.NPCsInGrid[gridId];
      if (!NPCsInGrid || !NPCsInGrid.npcs) {
        console.warn(`⚠️ No NPCs to save for grid ${gridId}`);
        return;
      }

      // Update local NPC timestamp
      const now = Date.now();
      NPCsInGrid.NPCsInGridLastUpdated = now;

      // Dehydrate the NPCs to simple objects
      const dehydratedNPCs = {};
      Object.entries(NPCsInGrid.npcs).forEach(([id, npc]) => {
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
        NPCsInGridLastUpdated: now,
      };

      console.log('💾 Payload for saving NPCs:', payload);

      // Save to server
      await axios.post(`${API_BASE}/api/save-grid-state-npcs`, payload);
      console.log(`✅ 💾 Saved NPCs for grid ${gridId}`);

      // Emit updated NPCs to other clients
      if (socket && socket.emit) {
        console.log(`📡 Emitting NPC grid-state for grid ${gridId}`);
        socket.emit('update-NPCsInGrid-NPCs', {
          gridId,
          npcs: dehydratedNPCs,
          NPCsInGridLastUpdated: now,
        });
      }
    } catch (error) {
      console.error(`❌ Error saving NPCs for grid ${gridId}:`, error);
    }
  }

  /**
   * Start periodic updates for NPCs in the NPCsInGrid.
   */
  startGridTimer(gridId) {
    if (gridTimer) clearInterval(gridTimer);

    gridTimer = setInterval(() => {
      const NPCsInGrid = this.NPCsInGrid[gridId];
      if (!NPCsInGrid) return;

      const { npcs } = NPCsInGrid;
      const now = Date.now();

      Object.values(npcs || {}).forEach((npc) => {
        if (npc instanceof NPC && typeof npc.update === 'function') {
          //console.log(`Calling update() for NPC ID: ${npc.id}`);
          npc.update(now, NPCsInGrid); // Let each NPC handle its own updates
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
    this.NPCsInGrid = {}; // Clear in-memory grid states
  }

  registerSetGridState(setter) {
    this.setGridStateReact = setter;
  }

  setAllNPCs(gridId, npcsObject) {
    console.log('Setting all NPCs for gridId:', gridId, '; NPCs object:', npcsObject);
  
    // Safely get or create the current state
    const existingState = this.NPCsInGrid[gridId] || {};
    const lastUpdated = existingState.NPCsInGridLastUpdated || Date.now();
  
    this.NPCsInGrid[gridId] = {
      ...existingState,
      npcs: npcsObject || {},
      NPCsInGridLastUpdated: lastUpdated,
    };
  
    if (this.setGridStateReact) {
      this.setGridStateReact(prev => ({
        ...prev,
        [gridId]: {
          ...(prev[gridId] || {}),
          npcs: npcsObject || {},
          NPCsInGridLastUpdated: lastUpdated,
        },
      }));
    }
  }

}

const NPCsInGridManager = new GridStateManager();

// Export individual methods for direct use
export const {
  initializeGridState,
  getNPCsInGrid,
  addNPC,
  updateNPC,
  removeNPC, 
  saveGridStateNPCs,
  registerSetGridState,
  setAllNPCs,
} = NPCsInGridManager;

// Default export for the entire manager
export default NPCsInGridManager;