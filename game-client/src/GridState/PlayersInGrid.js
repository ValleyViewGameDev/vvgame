import API_BASE from '../config';
import socket from '../socketManager';
import axios from 'axios';
import { animateRemotePC } from '../Render/RenderAnimatePosition';
import { loadMasterResources } from '../Utils/TuningManager';

class GridStatePCManager {
    constructor() {
      this.playersInGrid = {}; // Store PC states in memory
      this.pendingUpdates = {}; // Track pending position updates
      this.batchInterval = null; // Interval for batch saving
      this.BATCH_SAVE_INTERVAL = 500; // Save positions every 500ms
    }
 
    registerSetPlayersInGrid(setter) {
      this.setPlayersInGridReact = setter;
    }
    registerTileSize(tileSize) {
      this.tileSize = tileSize;
    }
    
    // Start the batch save interval
    startBatchSaving() {
      if (this.batchInterval) return; // Already running
      
      this.batchInterval = setInterval(() => {
        this.processPendingUpdates();
      }, this.BATCH_SAVE_INTERVAL);
      console.log('🔄 Started batch saving interval');
    }
    
    // Stop the batch save interval
    stopBatchSaving() {
      if (this.batchInterval) {
        clearInterval(this.batchInterval);
        this.batchInterval = null;
      }
      // Save any remaining updates
      this.processPendingUpdates();
    }
    
    // Process all pending position updates
    async processPendingUpdates() {
      const updates = Object.entries(this.pendingUpdates);
      if (updates.length === 0) return;
      
      console.log(`📦 Processing ${updates.length} pending position updates`);
      
      // Clear pending updates first
      this.pendingUpdates = {};
      
      // For now, use individual saves until batch endpoint exists
      for (const [key, data] of updates) {
        try {
          await axios.post(`${API_BASE}/api/save-single-pc`, {
            gridId: data.gridId,
            playerId: data.playerId,
            pc: data.pc,
            lastUpdated: data.lastUpdated,
          });
        } catch (error) {
          console.error(`❌ Failed to save position for ${data.playerId}:`, error);
          // Re-add failed update back to pending
          this.pendingUpdates[key] = data;
        }
      }
      
      if (Object.keys(this.pendingUpdates).length === 0) {
        console.log(`✅ All position updates saved successfully`);
      }
    }
    
    // Force save all pending updates immediately
    async forceSavePendingUpdates() {
      await this.processPendingUpdates();
    }
    /**
     * Initialize the playersInGrid for a specific gridId.
     */
    async initializePlayersInGrid(gridId) {

      console.log('🧠 Fetching playersInGrid for gridId:', gridId);
      if (!gridId) {
        console.error('initializePlayersInGrid: gridId is undefined.');
        return;
      }
    
      try {
        const response = await axios.get(`${API_BASE}/api/load-grid-state/${gridId}`);
        const {
          playersInGrid = { pcs: {}, lastUpdated: 0 },
        } = response.data;
    
        // Build a consolidated local state with independent timestamps
        const state = {
          pcs: playersInGrid.pcs || {},
          playersInGridLastUpdated: new Date(playersInGrid.lastUpdated || 0).getTime(),
        };
        const pcs = state.pcs || {};
        console.log('Fetched PC NPCsInGrid:', state);
    
        // Normalize PC format
        Object.keys(pcs).forEach((playerId) => {
          const pcData = pcs[playerId];
          pcs[playerId] = {
            ...pcData,
            position: pcData.position || { x: 0, y: 0 },
          };
        });
    
        this.playersInGrid[gridId] = state;
    
        this.setPlayersInGridReact((prev) => ({
          ...prev,
          [gridId]: {
            pcs: pcs,
            playersInGridLastUpdated: Date.now(),
          },
        }));

        console.log(`✅ Initialized playersInGrid for gridId ${gridId}:`, pcs);
        
        // Start batch saving for position updates
        this.startBatchSaving();
        
        // Save positions before page unload
        if (!this.unloadListenerAdded) {
          window.addEventListener('beforeunload', () => {
            console.log('🔄 Page unloading, saving pending positions...');
            // Use synchronous XMLHttpRequest for beforeunload
            const updates = Object.entries(this.pendingUpdates);
            if (updates.length > 0) {
              for (const [key, data] of updates) {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', `${API_BASE}/api/save-single-pc`, false); // false = synchronous
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.send(JSON.stringify({
                  gridId: data.gridId,
                  playerId: data.playerId,
                  pc: data.pc,
                  lastUpdated: data.lastUpdated,
                }));
              }
            }
          });
          this.unloadListenerAdded = true;
        }
        
        // Request fresh player list from server after loading DB state
        // This will override any stale data with current server state
        console.log('🔄 Requesting current players from server for grid:', gridId);
        if (socket && socket.emit) {
          socket.emit('request-current-grid-players', { gridId });
        }
      } catch (error) {
        console.error('❌ Error fetching playersInGrid:', error);
      }
    }
    
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

    setAllPCs(gridId, pcsObject) {
      this.playersInGrid[gridId] = {
        pcs: pcsObject || {},
        playersInGridLastUpdated: Date.now(),
      };
    
      if (this.setPlayersInGridReact) {
        this.setPlayersInGridReact(prev => ({
          ...prev,
          [gridId]: this.playersInGrid[gridId],
        }));
      }
    }
    
    async addPlayer(gridId, playerId, pcData) {
    // Add a new PC to the playersInGrid for a given gridId and playerId.
    // This is only run on app initialization, IF the saved currentPlayer cannot be found in the playersInGrid.
      if (!this.playersInGrid[gridId]) {
        this.playersInGrid[gridId] = {
          pcs: {},
          playersInGridLastUpdated: Date.now(),
        };
      }

      const now = Date.now();
      const masterResources = await loadMasterResources();

      // Compute modifiers from powers - support multiple attributes per power
      // Only count equipped weapons/armor + all magic enhancements
      const modifiers = {};
      const equippedWeapon = pcData.settings?.equippedWeapon || null;
      const equippedArmor = pcData.settings?.equippedArmor || null;
      
      // Helper functions to categorize powers
      const isWeapon = (resource) => resource.passable === true && typeof resource.damage === 'number' && resource.damage > 0;
      const isArmor = (resource) => resource.passable === true && typeof resource.armorclass === 'number' && resource.armorclass > 0;
      const isMagicEnhancement = (resource) => !isWeapon(resource) && !isArmor(resource);
      
      (pcData.powers || []).forEach(power => {
        const resource = masterResources.find(r => r.type === power.type);
        if (resource && resource.category === 'power') {
          const powerQty = power.quantity || 0;
          
          // Only count equipped weapons and armor, or all magic enhancements
          const shouldCount = isMagicEnhancement(resource) || 
                             (isWeapon(resource) && power.type === equippedWeapon) ||
                             (isArmor(resource) && power.type === equippedArmor);
          
          if (shouldCount) {
            // Combat stat attributes to check for
            const combatAttributes = ['hp', 'maxhp', 'damage', 'armorclass', 'attackbonus', 'attackrange', 'speed'];
            
            combatAttributes.forEach(attr => {
              if (typeof resource[attr] === 'number') {
                const value = powerQty * resource[attr];
                modifiers[attr] = (modifiers[attr] || 0) + value;
              }
            });
            
          }
        }
      });

      const getStat = (baseKey, modKey) => (pcData[baseKey] || 0) + (modifiers[modKey] || 0);

      console.log('🚨 [HP DEBUG] addPlayer - Base stat calculation:');
      console.log('  pcData.baseHp:', pcData.baseHp);
      console.log('  pcData.baseMaxhp:', pcData.baseMaxhp);
      console.log('  modifiers.hp:', modifiers.hp);
      console.log('  modifiers.maxhp:', modifiers.maxhp);
      console.log('  getStat("baseHp", "hp"):', getStat('baseHp', 'hp'));
      console.log('  getStat("baseMaxhp", "maxhp"):', getStat('baseMaxhp', 'maxhp'));

      const newPC = {
        playerId,
        username: pcData.username,
        type: 'pc',
        icon: pcData.icon,
        position: pcData.position || { x: 0, y: 0 },
        hp: getStat('baseHp', 'hp'),
        maxhp: getStat('baseMaxhp', 'maxhp'),
        armorclass: getStat('baseArmorclass', 'armorclass'),
        attackbonus: getStat('baseAttackbonus', 'attackbonus'),
        damage: getStat('baseDamage', 'damage'),
        attackrange: getStat('baseAttackrange', 'attackrange'),
        speed: getStat('baseSpeed', 'speed'),
        iscamping: pcData.iscamping || false,
        isinboat: pcData.isinboat || false,
        lastUpdated: now,
      };

      this.playersInGrid[gridId].pcs[playerId] = newPC;

      // Save to server
      try {
        await axios.post(`${API_BASE}/api/save-single-pc`, {
          gridId,
          playerId,
          pc: newPC,
          lastUpdated: now,
        });
        console.log(`✅ Added and saved new PC ${playerId} to server.`);
      } catch (error) {
        console.error(`❌ Failed to add PC ${playerId}:`, error);
      }

      // Emit to other clients
      if (socket && socket.emit) {
        socket.emit('update-NPCsInGrid-PCs', {
          gridId,
          pcs: { [playerId]: newPC },
          playersInGridLastUpdated: now,
        });
      }

      // Note: Caller should update React context using setPlayersInGrid if needed
    }


    // Add a new lightweight PC (from grid.playersInGrid schema) to the local in-memory playersInGrid
    async addPC(gridId, playerId, pcData) {
      if (!this.playersInGrid[gridId]) {
        this.playersInGrid[gridId] = {
          pcs: {},
          playersInGridLastUpdated: Date.now(),
        };
      }

      const now = Date.now();
      
      console.log('🚨 [HP DEBUG] addPC - Incoming PC data:');
      console.log('  pcData.hp:', pcData.hp);
      console.log('  pcData.maxhp:', pcData.maxhp);
      console.log('  playerId:', playerId);
      
      const newPC = {
        playerId: pcData.playerId,
        username: pcData.username,
        type: pcData.type,
        icon: pcData.icon,
        position: pcData.position || { x: 0, y: 0 },
        hp: pcData.hp,
        maxhp: pcData.maxhp,
        armorclass: pcData.armorclass,
        attackbonus: pcData.attackbonus,
        damage: pcData.damage,
        attackrange: pcData.attackrange,
        speed: pcData.speed,
        iscamping: pcData.iscamping || false,
        isinboat: pcData.isinboat || false,
        lastUpdated: now,
      };

      this.playersInGrid[gridId].pcs[playerId] = newPC;

      // Also update React state if setter is registered
      if (this.setPlayersInGridReact) {
        this.setPlayersInGridReact(prev => ({
          ...prev,
          [gridId]: {
            ...(prev[gridId] || {}),
            pcs: {
              ...(prev[gridId]?.pcs || {}),
              [playerId]: newPC,
            },
          },
        }));
      }

      // Save to database immediately for location changes to prevent inconsistency
      try {
        await axios.post(`${API_BASE}/api/save-single-pc`, {
          gridId,
          playerId,
          pc: newPC,
          lastUpdated: now,
        });
        console.log(`✅ Added PC ${playerId} to grid ${gridId} and database`);
      } catch (error) {
        console.error(`❌ Failed to save PC ${playerId} to database:`, error);
        // Remove from local state if database save fails
        delete this.playersInGrid[gridId].pcs[playerId];
        if (this.setPlayersInGridReact) {
          this.setPlayersInGridReact(prev => {
            const updatedGrid = { ...(prev[gridId]?.pcs || {}) };
            delete updatedGrid[playerId];
            return {
              ...prev,
              [gridId]: {
                ...(prev[gridId] || {}),
                pcs: updatedGrid,
              },
            };
          });
        }
        throw error; // Re-throw to let changePlayerLocation handle the error
      }
    }


    // Update an existing PC in the playersInGrid for a given gridId and playerId.
    async updatePC(gridId, playerId, newProperties) {
      const gridPCs = this.playersInGrid[gridId]?.pcs;
      if (!gridPCs || !gridPCs[playerId]) {
        console.error(`Cannot update PC ${playerId}. No NPCsInGrid or PC found for gridId: ${gridId}`);
        return;
      }
    
      const currentData = gridPCs[playerId];
      
      const keysToCompare = Object.keys(newProperties).filter(key => key !== 'lastUpdated');
      const isSame = keysToCompare.every(key => {
        const a = currentData[key];
        const b = newProperties[key];
        return JSON.stringify(a) === JSON.stringify(b);
      });

      if (isSame) {
        return; // Skip update if no changes
      }
    
      const oldPosition = gridPCs[playerId]?.position;
      const now = Date.now();
      const updatedPC = {
        ...gridPCs[playerId],
        ...newProperties,
        lastUpdated: now,
      };
      const newPosition = updatedPC.position; // 👈 and derive newPosition from updatedPC

      this.playersInGrid[gridId].pcs[playerId] = updatedPC;
    
      // Emit to other clients
      if (socket && socket.emit) {
        const payload = {
          [gridId]: {
            pcs: { [playerId]: updatedPC },
            playersInGridLastUpdated: now,
          },
          emitterId: socket.id,
        };
    
        socket.emit('update-NPCsInGrid-PCs', payload);
      }
    
      if (
        this.tileSize &&
        oldPosition &&
        newPosition &&
        (oldPosition.x !== newPosition.x || oldPosition.y !== newPosition.y)
      ) {
        animateRemotePC(playerId, oldPosition, newPosition, this.tileSize);
      }

      // ✅ Also update React state if setter is registered
      if (this.setPlayersInGridReact) {
        this.setPlayersInGridReact(prev => ({
          ...prev,
          [gridId]: {
            ...(prev[gridId] || {}),
            pcs: {
              ...(prev[gridId]?.pcs || {}),
              [playerId]: updatedPC,
            },
          },
        }));
      }

        // Add to pending updates for batch saving instead of immediate save
        const updateKey = `${gridId}-${playerId}`;
        this.pendingUpdates[updateKey] = {
          gridId,
          playerId,
          pc: updatedPC,
          lastUpdated: now
        };
        
        // Start batch saving if not already running
        if (!this.batchInterval) {
          this.startBatchSaving();
        }
    }


  // Remove a PC from the playersInGrid for a given gridId and playerId.
  async removePC(gridId, playerId) {
    if (!this.playersInGrid[gridId]?.pcs?.[playerId]) {
      console.warn(`⚠️ Cannot remove PC ${playerId}; not found in grid ${gridId}.`);
      return;
    }

    delete this.playersInGrid[gridId].pcs[playerId];

    // Also update React state if setter is registered
    if (this.setPlayersInGridReact) {
      this.setPlayersInGridReact(prev => {
        const updatedGrid = { ...(prev[gridId]?.pcs || {}) };
        delete updatedGrid[playerId];

        return {
          ...prev,
          [gridId]: {
            ...(prev[gridId] || {}),
            pcs: updatedGrid,
          },
        };
      });
    }

    // Remove from database immediately for location changes to prevent ghost PCs
    try {
      await axios.post(`${API_BASE}/api/remove-single-pc`, {
        gridId,
        playerId,
      });
      console.log(`🗑️ Removed PC ${playerId} from grid ${gridId} and database`);
    } catch (error) {
      console.error(`❌ Failed to remove PC ${playerId} from database:`, error);
      // Re-add the player back to local state if database removal fails
      if (!this.playersInGrid[gridId]) {
        this.playersInGrid[gridId] = { pcs: {}, playersInGridLastUpdated: Date.now() };
      }
      // Note: We would need the original player data to restore, which we don't have here
      // This is an edge case that should be handled by proper error handling in changePlayerLocation
    }
  }

  }
    

    const playersInGridManager = new GridStatePCManager();
    export default playersInGridManager;
    export const { initializePlayersInGrid } = playersInGridManager;