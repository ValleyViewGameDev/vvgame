import API_BASE from '../config';
import axios from 'axios';
import NPC from '../GameFeatures/NPCs/AllNPCsShared';
import { stopAllHeadlineEffects } from '../VFX/NPCVFX';
import { loadMasterResources } from '../Utils/TuningManager';

class GridStateManager {
  constructor() {
    this.NPCsInGrid = {}; // Store grid states in memory
    this.pendingPositionUpdates = new Map(); // Map<gridId, Map<npcId, {position, timestamp}>>
    this.batchSaveInterval = null;
    this.BATCH_SAVE_DELAY = 10000; // 10 seconds
    console.log('GridStateManager instance created.');
    
    // Start batch save timer
    this.startBatchSaveTimer();

    // A reload or a closed tab would lose up to 10 s of NPC movement: send what is queued
    if (typeof window !== 'undefined') window.addEventListener('pagehide', () => this.sendBeaconPositions());
  }

  /** Queued positions by sendBeacon (pagehide): the same payload as the batch flush. */
  sendBeaconPositions() {
    if (typeof navigator === 'undefined' || !navigator.sendBeacon) return;
    for (const [gridId, npcUpdates] of this.pendingPositionUpdates) {
      if (!npcUpdates.size) continue;
      const updates = {};
      for (const [npcId, u] of npcUpdates) updates[npcId] = u.position;
      try {
        navigator.sendBeacon(`${API_BASE}/api/batch-update-npc-positions`, new Blob([JSON.stringify({ gridId, updates })], { type: 'application/json' }));
        npcUpdates.clear();
      } catch (_) { /* best effort */ }
    }
  }

  /**
   * Start the batch save timer
   */
  startBatchSaveTimer() {
    if (this.batchSaveInterval) return; // Already running
    
    this.batchSaveInterval = setInterval(() => {
      this.flushPendingPositionUpdates();
    }, this.BATCH_SAVE_DELAY);
    
    console.log('✅ Batch save timer started (10s interval)');
  }

  /**
   * Stop the batch save timer
   */
  stopBatchSaveTimer() {
    if (this.batchSaveInterval) {
      clearInterval(this.batchSaveInterval);
      this.batchSaveInterval = null;
      console.log('❌ Batch save timer stopped');
    }
  }

  /**
   * Queue a position update for batch saving
   */
  queuePositionUpdate(gridId, npcId, position) {
    if (!this.pendingPositionUpdates.has(gridId)) {
      this.pendingPositionUpdates.set(gridId, new Map());
    }
    
    const gridUpdates = this.pendingPositionUpdates.get(gridId);
    gridUpdates.set(npcId, {
      position: { x: position.x, y: position.y },
      timestamp: Date.now()
    });
    
    //console.log(`📍 Queued position update for NPC ${npcId} at (${position.x}, ${position.y})`);
  }

  /**
   * Flush all pending position updates to the database
   */
  async flushPendingPositionUpdates() {
    if (this.pendingPositionUpdates.size === 0) return;
    
    // console.log(`💾 Flushing batch position updates for ${this.pendingPositionUpdates.size} grids`);
    
    // Process each grid's updates
    for (const [gridId, npcUpdates] of this.pendingPositionUpdates) {
      if (npcUpdates.size === 0) continue;
      
      try {
        // Convert Map to object for API
        const updates = {};
        for (const [npcId, update] of npcUpdates) {
          updates[npcId] = update.position;
        }
        
        // Send batch update to server
        await axios.post(`${API_BASE}/api/batch-update-npc-positions`, {
          gridId,
          updates,
          timestamp: Date.now()
        });
        
        // console.log(`✅ Batch saved ${npcUpdates.size} NPC positions for grid ${gridId}`);
        
        // Clear the updates for this grid
        npcUpdates.clear();
      } catch (error) {
        console.error(`❌ Failed to batch save positions for grid ${gridId}:`, error);
        // Keep the updates to retry next time
      }
    }
    
    // Clean up empty grid entries
    for (const [gridId, npcUpdates] of this.pendingPositionUpdates) {
      if (npcUpdates.size === 0) {
        this.pendingPositionUpdates.delete(gridId);
      }
    }
  }

  /**
   * Take the pending position updates for a grid WITHOUT posting them:
   * returns `{ [npcId]: { x, y } }` (empty object when nothing is queued) and
   * clears the queue. changePlayerLocation puts the result into
   * `enter-grid`'s `leave.npcPositions` (docs/phase-3-contract.md §4.2).
   */
  drainPendingPositions(gridId) {
    const npcUpdates = this.pendingPositionUpdates.get(gridId);
    const positions = {};
    if (npcUpdates) {
      for (const [npcId, update] of npcUpdates) {
        positions[npcId] = { x: update.position.x, y: update.position.y };
      }
      npcUpdates.clear();
      this.pendingPositionUpdates.delete(gridId);
    }
    return positions;
  }

  /** Put drained positions back on the queue (a leave that the server never applied). */
  requeuePositions(gridId, positions) {
    if (!gridId || !positions) return;
    for (const [npcId, position] of Object.entries(positions)) {
      if (!position) continue;
      const gridUpdates = this.pendingPositionUpdates.get(gridId);
      if (gridUpdates?.has(npcId)) continue; // a newer position was queued since
      this.queuePositionUpdate(gridId, npcId, position);
    }
  }

  /**
   * Force flush position updates for a specific grid
   * Used when player leaves a grid to ensure all updates are saved
   */
  async flushGridPositionUpdates(gridId) {
    const npcUpdates = this.pendingPositionUpdates.get(gridId);
    if (!npcUpdates || npcUpdates.size === 0) return;
    
    try {
      // Convert Map to object for API
      const updates = {};
      for (const [npcId, update] of npcUpdates) {
        updates[npcId] = update.position;
      }
      
      // Send batch update to server
      await axios.post(`${API_BASE}/api/batch-update-npc-positions`, {
        gridId,
        updates,
        timestamp: Date.now()
      });
      
      console.log(`✅ Force batch saved ${npcUpdates.size} NPC positions for grid ${gridId}`);
      
      // Clear the updates for this grid
      npcUpdates.clear();
      this.pendingPositionUpdates.delete(gridId);
    } catch (error) {
      console.error(`❌ Failed to force batch save positions for grid ${gridId}:`, error);
    }
  }

  /**
   * Update ONLY the position of an NPC without saving to database
   * Used for movement to reduce server load
   */
  async updateNPCPosition(gridId, npcId, position) {
    //console.log(`🐮 Updating position for NPC ${npcId} to (${position.x}, ${position.y})`);
    
    const NPCsInGrid = this.NPCsInGrid[gridId];
    if (!NPCsInGrid || !NPCsInGrid.npcs?.[npcId]) {
      console.error(`Cannot update position for NPC ${npcId}. Not found in grid ${gridId}`);
      return;
    }
    
    const npc = NPCsInGrid.npcs[npcId];
    const now = Date.now();
    
    // Update position in memory
    npc.position = { x: position.x, y: position.y };
    npc.lastUpdated = now;
    
    // Queue for batch save instead of immediate save
    this.queuePositionUpdate(gridId, npcId, position);

    this.syncReact(gridId, now);
  }

  /**
   * Mirror the in-memory grid entry into React state (triggers re-render).
   */
  syncReact(gridId, now = Date.now()) {
    const NPCsInGrid = this.NPCsInGrid[gridId];
    if (!NPCsInGrid) return;
    NPCsInGrid.NPCsInGridLastUpdated = now;
    if (this.setGridStateReact) {
      this.setGridStateReact(prev => ({
        ...prev,
        [gridId]: {
          ...(prev[gridId] || {}),
          ...NPCsInGrid,
          NPCsInGridLastUpdated: now,
        },
      }));
    }
  }

  /**
   * Seed the NPCsInGrid for `gridId` from the `enter-grid` bundle.
   * Accepts either the `{ npcs, lastUpdated }` wrapper or a
   * bare `{ [npcId]: npc }` map. No HTTP: the bundle already holds the NPCs.
   */
  async initializeFromData(gridId, NPCsInGridData) {
    this.startBatchSaveTimer(); // idempotent: back on after a logout stopped it
    stopAllHeadlineEffects(); // the previous grid's Zzz and the like

    if (!gridId) {
      console.error('initializeFromData: gridId is undefined.');
      return;
    }

    const wrapper = NPCsInGridData && typeof NPCsInGridData === 'object' && 'npcs' in NPCsInGridData
      ? NPCsInGridData
      : { npcs: NPCsInGridData || {}, lastUpdated: 0 };
    const rawNPCs = wrapper.npcs || {};
    const lastUpdated = new Date(wrapper.lastUpdated || 0).getTime() || Date.now();

    const masterResources = await loadMasterResources();

    const npcs = {};
    Object.keys(rawNPCs).forEach((npcId) => {
      const raw = rawNPCs[npcId];
      if (!raw || !raw.type || !raw.position || !Number.isFinite(raw.position.x)) { console.warn('⚠️ Skipping malformed NPC entry', npcId, raw); return; }
      const lightweightNPC = rawNPCs[npcId];
      if (!lightweightNPC) return;
      const npcTemplate = masterResources.find((res) => res.type === lightweightNPC.type);
      if (!npcTemplate) {
        console.warn(`⚠️ Missing template for NPC type: ${lightweightNPC.type}`);
      }
      npcs[npcId] = new NPC(
        npcId,
        lightweightNPC.type,
        lightweightNPC.position,
        { ...npcTemplate, ...lightweightNPC },
        gridId
      );
    });

    this.NPCsInGrid[gridId] = { npcs, NPCsInGridLastUpdated: lastUpdated };
    this.syncReact(gridId, lastUpdated);

    console.log(`✅ Seeded NPCsInGrid for gridId ${gridId} (${Object.keys(npcs).length} NPCs)`);
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
  async spawnNPC(gridId, npcType, position, extra = {}) {
    // DEBUG: Log input parameters for spawnNPC
    console.log('spawnNPC called with:', { gridId, npcType, position });
    if (typeof npcType === 'object' && npcType?.type) {
      npcType = npcType.type; // Extract the type string
    }
    if (typeof npcType !== 'string') {
      console.error('Invalid npcType. Expected a string but got:', npcType);
      return;
    }
    const masterResources = await loadMasterResources();
    const npcTemplate = masterResources.find((res) => res.type === npcType && res.category === 'npc');
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
        ...extra, // e.g. homeX / homeY for a worker's slot (docs/citizens.md)
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
    let NPCsInGrid = this.NPCsInGrid[gridId];
    if (!NPCsInGrid) {
      console.warn(`⚠️ No NPCsInGrid found for gridId: ${gridId}. Initializing new entry.`);
      NPCsInGrid = { npcs: {}, NPCsInGridLastUpdated: Date.now() };
      this.NPCsInGrid[gridId] = NPCsInGrid;
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
  }

  /**
   * Update an NPC in the NPCsInGrid using the per-NPC save model.
   */
  async updateNPC(gridId, npcId, newProperties) {
    //console.log(`🐮++ Updating NPC ${npcId} for gridId: ${gridId}`);
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

    //console.log(`[🐮 NPCsInGridManager.updateNPC] NPC ${npcId} updated with:`, newProperties);

    try {
      // Send only the essential properties to the server
      const npcData = {
        id: npc.id,
        type: npc.type,
        position: npc.position,
        state: npc.state,
        hp: npc.hp,
        maxhp: npc.maxhp,
        grazeEnd: npc.grazeEnd,
        lastUpdated: npc.lastUpdated,
        action: npc.action,
        gridId: npc.gridId,
        // Citizens (docs/citizens.md): where in the loop they are, so they resume on re-entry
        citizenState: npc.citizenState ?? null,
        citizenStateUntil: npc.citizenStateUntil ?? null,
        citizenTask: npc.citizenTask ?? null,
        homeX: npc.homeX ?? null,
        homeY: npc.homeY ?? null,
      };

      // For spawner NPCs, include spawner-specific properties
      if (npc.action === 'spawn') {
        npcData.requires = npc.requires;
        npcData.qtycollected = npc.qtycollected;
        npcData.range = npc.range;
        npcData.nextspawn = npc.nextspawn;
      }

      //console.log(`🐮 Saving NPC ${npcId} to server with state: ${npcData.state}`);
      
      await axios.post(`${API_BASE}/api/save-single-npc`, {
        gridId,
        npcId,
        npc: npcData,
        lastUpdated: now,
      });
      //console.log(`🐮✅ Saved single NPC ${npcId} to server with state: ${npcData.state}`);
    } catch (error) {
      console.error(`❌ Failed to save single NPC ${npcId}:`, error);
    }

    this.syncReact(gridId, now);
  }


  /**
   * Drop an NPC from the local store only (React synced, no request): for outcomes the server
   * already knows about through another route (a kill reported to /action/npc-kill).
   */
  forgetNPC(gridId, npcId) {
    const NPCsInGrid = this.NPCsInGrid[gridId];
    if (!NPCsInGrid?.npcs?.[npcId]) return;
    this.pendingPositionUpdates.get(gridId)?.delete(npcId);
    delete NPCsInGrid.npcs[npcId];
    this.setAllNPCs(gridId, NPCsInGrid.npcs);
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

    // Clear any pending position updates for this NPC to prevent race condition
    const gridUpdates = this.pendingPositionUpdates.get(gridId);
    if (gridUpdates) {
      gridUpdates.delete(npcId);
      console.log(`🧹 Cleared pending position update for removed NPC ${npcId}`);
    }

    delete NPCsInGrid.npcs[npcId];
    this.setAllNPCs(gridId, NPCsInGrid.npcs); // 🧠 Update React state after deletion

    try {
      await axios.post(`${API_BASE}/api/remove-single-npc`, {
        gridId,
        npcId,
      });
      console.log(`✅ Removed single NPC ${npcId} from server.`);
    } catch (error) {
      console.error(`❌ Failed to remove single NPC ${npcId}:`, error);
    }
  }

  /**
   * Save only NPCs in the NPCsInGrid to the database.
   * This version dehydrates live NPC instances into plain objects and matches the PC saving structure.
   */
  async saveGridStateNPCs(gridId) {
    //console.log('💾 saveGridStateNPCs called with gridId:', gridId);
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

      //console.log('💾 Payload for saving NPCs:', payload);

      // Save to server (no callers yet; Phase 3 switches persistence to this per-grid snapshot)
      await axios.post(`${API_BASE}/api/save-grid-state-npcs`, payload);
    } catch (error) {
      console.error(`❌ Error saving NPCs for grid ${gridId}:`, error);
    }
  }

  // Stop updates or clear grid state
  stopGridStateUpdates() {
    // Flush any pending position updates before clearing
    this.flushPendingPositionUpdates();
    
    // Stop the batch save timer
    this.stopBatchSaveTimer();
    
    this.NPCsInGrid = {}; // Clear in-memory grid states
    this.pendingPositionUpdates.clear(); // Clear pending updates
  }

  registerSetGridState(setter) {
    this.setGridStateReact = setter;
  }

  setAllNPCs(gridId, npcsObject) {
    //console.log('Setting all NPCs for gridId:', gridId, '; NPCs object:', npcsObject);
  
    // Safely get or create the current state
    const existingState = this.NPCsInGrid[gridId] || {};
    const lastUpdated = existingState.NPCsInGridLastUpdated || Date.now();
  
    this.NPCsInGrid[gridId] = {
      ...existingState,
      npcs: npcsObject || {},
      NPCsInGridLastUpdated: lastUpdated,
    };

    this.syncReact(gridId);
  }

}

const NPCsInGridManager = new GridStateManager();

export default NPCsInGridManager;