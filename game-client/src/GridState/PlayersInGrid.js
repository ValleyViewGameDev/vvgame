import API_BASE from '../config';
import axios from 'axios';
import { animateRemotePC } from '../Render/RenderAnimatePosition';
import { loadMasterResources } from '../Utils/TuningManager';

/**
 * Single-PC store.
 *
 * Only the local player ever lives in this map. The read contract is unchanged
 * for the ~40 call sites: `getPlayersInGrid(gridId)` / `getAllPCs(gridId)`
 * return `{ [playerId]: pc }` keyed by gridId, now containing one record.
 */

const DEFAULT_PC_RECORD_FIELDS = {
  hp: 25,
  maxhp: 25,
  armorclass: 10,
  attackbonus: 0,
  damage: 1,
  attackrange: 1,
  speed: 1,
};

/**
 * Build the in-grid PC record from whatever shape the caller has
 * (a Player document, a previous PC record, or a hand-built payload).
 */
function buildPCRecord(playerId, pcData = {}, now = Date.now()) {
  return {
    playerId: String(pcData.playerId || playerId),
    username: pcData.username,
    type: 'pc',
    icon: pcData.icon,
    position: pcData.position || { x: 0, y: 0 },
    hp: pcData.hp ?? DEFAULT_PC_RECORD_FIELDS.hp,
    maxhp: pcData.maxhp ?? DEFAULT_PC_RECORD_FIELDS.maxhp,
    armorclass: pcData.armorclass ?? DEFAULT_PC_RECORD_FIELDS.armorclass,
    attackbonus: pcData.attackbonus ?? DEFAULT_PC_RECORD_FIELDS.attackbonus,
    damage: pcData.damage ?? DEFAULT_PC_RECORD_FIELDS.damage,
    attackrange: pcData.attackrange ?? DEFAULT_PC_RECORD_FIELDS.attackrange,
    speed: pcData.speed ?? DEFAULT_PC_RECORD_FIELDS.speed,
    iscamping: pcData.iscamping || false,
    isinboat: pcData.isinboat || false,
    lastUpdated: pcData.lastUpdated || now,
  };
}

/**
 * Resolve the local player's id: an explicit argument wins, otherwise the
 * `player` record in localStorage (the same source App.js / index.js use).
 */
function resolveLocalPlayerId(playerId) {
  if (playerId) return String(playerId);
  try {
    const stored = JSON.parse(localStorage.getItem('player') || 'null');
    const id = stored?._id || stored?.playerId;
    return id ? String(id) : null;
  } catch (err) {
    return null;
  }
}

class GridStatePCManager {
  constructor() {
    this.playersInGrid = {}; // { [gridId]: { pcs: { [playerId]: pc }, playersInGridLastUpdated } }
    this.pendingUpdates = {}; // { [`${gridId}-${playerId}`]: { gridId, playerId, pc, lastUpdated } }
    this.batchInterval = null;
    this.BATCH_SAVE_INTERVAL = 5000; // Save positions every 5 seconds
    this.localPlayerId = null;
    this.unloadListenerAdded = false;
  }

  registerSetPlayersInGrid(setter) {
    this.setPlayersInGridReact = setter;
  }

  registerTileSize(tileSize) {
    this.tileSize = tileSize;
  }

  // ---------------------------------------------------------------------------
  // React mirror
  // ---------------------------------------------------------------------------

  syncReact(gridId) {
    if (!this.setPlayersInGridReact) return;
    const pcs = { ...(this.playersInGrid[gridId]?.pcs || {}) };
    this.setPlayersInGridReact((prev) => ({
      ...prev,
      [gridId]: {
        ...(prev[gridId] || {}),
        pcs,
        playersInGridLastUpdated: Date.now(),
      },
    }));
  }

  ensureGridEntry(gridId) {
    if (!this.playersInGrid[gridId]) {
      this.playersInGrid[gridId] = {
        pcs: {},
        playersInGridLastUpdated: Date.now(),
      };
    }
    return this.playersInGrid[gridId];
  }

  // ---------------------------------------------------------------------------
  // Batch position persistence (5 s) + beforeunload flush
  // ---------------------------------------------------------------------------

  startBatchSaving() {
    if (this.batchInterval) return;
    this.batchInterval = setInterval(() => {
      this.processPendingUpdates();
    }, this.BATCH_SAVE_INTERVAL);
    console.log('🔄 Started batch saving interval');
  }

  stopBatchSaving() {
    if (this.batchInterval) {
      clearInterval(this.batchInterval);
      this.batchInterval = null;
    }
    this.processPendingUpdates();
  }

  async postBatch(gridId, updates) {
    const response = await axios.post(`${API_BASE}/api/batch-update-pc-positions`, {
      gridId,
      updates,
      timestamp: Date.now(),
    });
    if (response.data.errors && response.data.errors.length > 0) {
      console.warn(`⚠️ Batch update had ${response.data.errors.length} errors:`, response.data.errors);
    }
    return response;
  }

  // Process all pending position updates
  async processPendingUpdates() {
    const updates = Object.entries(this.pendingUpdates);
    if (updates.length === 0) return;

    const updatesByGrid = {};
    for (const [, data] of updates) {
      if (!updatesByGrid[data.gridId]) updatesByGrid[data.gridId] = {};
      updatesByGrid[data.gridId][data.playerId] = data.pc;
    }

    this.pendingUpdates = {};

    for (const [gridId, gridUpdates] of Object.entries(updatesByGrid)) {
      try {
        await this.postBatch(gridId, gridUpdates);
      } catch (error) {
        console.error(`❌ Failed to batch save positions for grid ${gridId}:`, error);
        for (const [playerId, pc] of Object.entries(gridUpdates)) {
          this.pendingUpdates[`${gridId}-${playerId}`] = { gridId, playerId, pc, lastUpdated: pc.lastUpdated };
        }
      }
    }
  }

  // Flush pending position updates for one grid (used on grid leave)
  async flushGridPositionUpdates(gridId) {
    const gridEntries = Object.entries(this.pendingUpdates)
      .filter(([, data]) => data.gridId === gridId);
    if (gridEntries.length === 0) return;

    gridEntries.forEach(([key]) => { delete this.pendingUpdates[key]; });

    const updates = {};
    gridEntries.forEach(([, data]) => { updates[data.playerId] = data.pc; });

    try {
      await this.postBatch(gridId, updates);
    } catch (error) {
      console.error(`❌ Failed to flush PC positions for grid ${gridId}:`, error);
      gridEntries.forEach(([key, data]) => { this.pendingUpdates[key] = data; });
    }
  }

  ensureUnloadFlush() {
    if (this.unloadListenerAdded) return;
    window.addEventListener('beforeunload', () => {
      const updates = Object.entries(this.pendingUpdates);
      if (updates.length === 0) return;

      const updatesByGrid = {};
      for (const [, data] of updates) {
        if (!updatesByGrid[data.gridId]) updatesByGrid[data.gridId] = {};
        updatesByGrid[data.gridId][data.playerId] = data.pc;
      }

      // Synchronous XHR so the request survives page teardown
      for (const [gridId, gridUpdates] of Object.entries(updatesByGrid)) {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_BASE}/api/batch-update-pc-positions`, false);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(JSON.stringify({ gridId, updates: gridUpdates, timestamp: Date.now() }));
      }
    });
    this.unloadListenerAdded = true;
  }

  // ---------------------------------------------------------------------------
  // Hydration
  // ---------------------------------------------------------------------------

  /**
   * Hydrate ONLY the local player's record for `gridId` from `load-grid-state`.
   * `playerId` is optional; when omitted it is read from localStorage 'player'.
   */
  async initializePlayersInGrid(gridId, playerId = null) {
    if (!gridId) {
      console.error('initializePlayersInGrid: gridId is undefined.');
      return;
    }

    const localId = resolveLocalPlayerId(playerId);
    if (localId) this.localPlayerId = localId;

    try {
      const response = await axios.get(`${API_BASE}/api/load-grid-state/${gridId}`);
      const storedPCs = response.data?.playersInGrid?.pcs || {};
      const storedPC = localId ? storedPCs[localId] : null;

      const pcs = {};
      if (storedPC) {
        pcs[localId] = buildPCRecord(localId, storedPC);
      }

      this.playersInGrid[gridId] = {
        pcs,
        playersInGridLastUpdated: Date.now(),
      };
      this.syncReact(gridId);

      console.log(`✅ Initialized playersInGrid for gridId ${gridId}:`, pcs);

      this.startBatchSaving();
      this.ensureUnloadFlush();
    } catch (error) {
      console.error('❌ Error fetching playersInGrid:', error);
    }
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  getPlayersInGrid(gridId) {
    const playersInGrid = this.playersInGrid[gridId];
    if (!playersInGrid) {
      console.warn(`⚠️ No PC state found for gridId: ${gridId}`);
      return {};
    }
    return playersInGrid.pcs;
  }

  getAllPCs(gridId) {
    return this.playersInGrid?.[gridId]?.pcs || {};
  }

  getPlayerPosition(gridId, playerId) {
    return this.playersInGrid?.[gridId]?.pcs?.[playerId]?.position || null;
  }

  // ---------------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------------

  /**
   * Add the local player from a Player document, deriving combat stats from
   * base stats + equipped-power modifiers. Only used on app init when the saved
   * player is missing from the grid.
   */
  async addPlayer(gridId, playerId, pcData) {
    this.ensureGridEntry(gridId);
    const now = Date.now();
    const masterResources = await loadMasterResources();

    // Compute modifiers from powers: equipped weapon/armor + all magic enhancements
    const modifiers = {};
    const equippedWeapon = pcData.settings?.equippedWeapon || null;
    const equippedArmor = pcData.settings?.equippedArmor || null;

    const isWeapon = (resource) => resource.passable === true && typeof resource.damage === 'number' && resource.damage > 0;
    const isArmor = (resource) => resource.passable === true && typeof resource.armorclass === 'number' && resource.armorclass > 0;
    const isMagicEnhancement = (resource) => !isWeapon(resource) && !isArmor(resource);
    const combatAttributes = ['hp', 'maxhp', 'damage', 'armorclass', 'attackbonus', 'attackrange', 'speed'];

    (pcData.powers || []).forEach((power) => {
      const resource = masterResources.find((r) => r.type === power.type);
      if (!resource || resource.category !== 'power') return;
      const powerQty = power.quantity || 0;
      const shouldCount = isMagicEnhancement(resource) ||
        (isWeapon(resource) && power.type === equippedWeapon) ||
        (isArmor(resource) && power.type === equippedArmor);
      if (!shouldCount) return;
      combatAttributes.forEach((attr) => {
        if (typeof resource[attr] === 'number') {
          modifiers[attr] = (modifiers[attr] || 0) + powerQty * resource[attr];
        }
      });
    });

    const getStat = (baseKey, modKey) => (pcData[baseKey] || 0) + (modifiers[modKey] || 0);

    const newPC = buildPCRecord(playerId, {
      username: pcData.username,
      icon: pcData.icon,
      position: pcData.position,
      hp: getStat('baseHp', 'hp'),
      maxhp: getStat('baseMaxhp', 'maxhp'),
      armorclass: getStat('baseArmorclass', 'armorclass'),
      attackbonus: getStat('baseAttackbonus', 'attackbonus'),
      damage: getStat('baseDamage', 'damage'),
      attackrange: getStat('baseAttackrange', 'attackrange'),
      speed: getStat('baseSpeed', 'speed'),
      iscamping: pcData.iscamping,
      isinboat: pcData.isinboat,
    }, now);

    this.localPlayerId = newPC.playerId;
    this.playersInGrid[gridId].pcs[newPC.playerId] = newPC;
    this.syncReact(gridId);

    try {
      await axios.post(`${API_BASE}/api/save-single-pc`, {
        gridId,
        playerId: newPC.playerId,
        pc: newPC,
        lastUpdated: now,
      });
      console.log(`✅ Added and saved new PC ${newPC.playerId} to server.`);
    } catch (error) {
      console.error(`❌ Failed to add PC ${newPC.playerId}:`, error);
    }
  }

  /**
   * Add the local player to a grid from an already-built PC record
   * (grid transitions). Throws if the server save fails so the caller can
   * handle the failed transition.
   */
  async addPC(gridId, playerId, pcData) {
    this.ensureGridEntry(gridId);
    const now = Date.now();
    const newPC = buildPCRecord(playerId, pcData, now);

    this.localPlayerId = newPC.playerId;
    this.playersInGrid[gridId].pcs[newPC.playerId] = newPC;
    this.syncReact(gridId);

    try {
      await axios.post(`${API_BASE}/api/save-single-pc`, {
        gridId,
        playerId: newPC.playerId,
        pc: newPC,
        lastUpdated: now,
      });
      console.log(`✅ Added PC ${newPC.playerId} to grid ${gridId} and database`);
    } catch (error) {
      console.error(`❌ Failed to save PC ${newPC.playerId} to database:`, {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
        gridId,
        playerId: newPC.playerId,
      });
      delete this.playersInGrid[gridId].pcs[newPC.playerId];
      this.syncReact(gridId);
      throw error;
    }
  }

  // Update the local PC's record; position changes animate and queue for the batch save.
  async updatePC(gridId, playerId, newProperties) {
    const gridPCs = this.playersInGrid[gridId]?.pcs;
    if (!gridPCs || !gridPCs[playerId]) {
      console.error(`Cannot update PC ${playerId}. No PC found for gridId: ${gridId}`);
      return;
    }

    const currentData = gridPCs[playerId];
    const keysToCompare = Object.keys(newProperties).filter((key) => key !== 'lastUpdated');
    const isSame = keysToCompare.every((key) =>
      JSON.stringify(currentData[key]) === JSON.stringify(newProperties[key])
    );
    if (isSame) return;

    const oldPosition = currentData.position;
    const now = Date.now();
    const updatedPC = {
      ...currentData,
      ...newProperties,
      lastUpdated: now,
    };
    const newPosition = updatedPC.position;

    gridPCs[playerId] = updatedPC;

    if (
      this.tileSize &&
      oldPosition &&
      newPosition &&
      (oldPosition.x !== newPosition.x || oldPosition.y !== newPosition.y)
    ) {
      // 60 ms default matches MOVEMENT_COOLDOWN_MS for smooth continuous movement
      animateRemotePC(playerId, oldPosition, newPosition, this.tileSize);
    }

    this.syncReact(gridId);

    this.pendingUpdates[`${gridId}-${playerId}`] = {
      gridId,
      playerId,
      pc: updatedPC,
      lastUpdated: now,
    };
    if (!this.batchInterval) this.startBatchSaving();
  }

  // Remove the local player from a grid (grid leave). Refuses any other id.
  async removePC(gridId, playerId) {
    const id = String(playerId);
    const localId = this.localPlayerId || resolveLocalPlayerId(null);
    if (localId && id !== localId) {
      console.warn(`⚠️ removePC ignored for non-local player ${id} (local is ${localId}).`);
      return;
    }

    // Clear any pending update first so the batch save cannot re-add the record
    delete this.pendingUpdates[`${gridId}-${id}`];

    if (!this.playersInGrid[gridId]?.pcs?.[id]) {
      console.warn(`⚠️ Cannot remove PC ${id}; not found in grid ${gridId}.`);
      return;
    }

    delete this.playersInGrid[gridId].pcs[id];
    this.syncReact(gridId);

    try {
      await axios.post(`${API_BASE}/api/remove-single-pc`, { gridId, playerId: id });
      console.log(`🗑️ Removed PC ${id} from grid ${gridId} and database`);
    } catch (error) {
      console.error(`❌ Failed to remove PC ${id} from database:`, error);
    }
  }
}

const playersInGridManager = new GridStatePCManager();
export default playersInGridManager;
