import API_BASE from '../config';
import socket from '../socketManager';
import axios from 'axios';
import { animateRemotePC } from '../Render/RenderAnimatePosition';
import { loadMasterResources } from '../Utils/TuningManager';

class GridStatePCManager {
    constructor() {
      this.playersInGrid = {}; // Store PC states in memory
    }
 
    registerSetPlayersInGrid(setter) {
      this.setPlayersInGridReact = setter;
    }
    registerTileSize(tileSize) {
      this.tileSize = tileSize;
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

      // Compute modifiers from powers
      const modifiers = {};
      (pcData.powers || []).forEach(power => {
        const resource = masterResources.find(r => r.type === power.type);
        if (resource?.output && typeof resource.qtycollected === 'number') {
          const value = (power.quantity || 0) * resource.qtycollected;
          modifiers[resource.output] = (modifiers[resource.output] || 0) + value;
        }
      });

      const getStat = (baseKey, modKey) => (pcData[baseKey] || 0) + (modifiers[modKey] || 0);

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
    addPC(gridId, playerId, pcData) {
      if (!this.playersInGrid[gridId]) {
        this.playersInGrid[gridId] = {
          pcs: {},
          playersInGridLastUpdated: Date.now(),
        };
      }

      const now = Date.now();
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
    }


    // Update an existing PC in the playersInGrid for a given gridId and playerId.
    async updatePC(gridId, playerId, newProperties) {
      console.log("😀😀 updatePC -- gridId: ",gridId," playerId: ",playerId," newProperties:", newProperties);
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
        console.log(`⏭️ Skipping update for PC ${playerId}; no meaningful changes.`);
        return;
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
    
        console.log("📡 Emitting update-NPCsInGrid-PCs with payload:", JSON.stringify(payload, null, 2));
        socket.emit('update-NPCsInGrid-PCs', payload);
      }
    
      console.log('oldPosition:', oldPosition);
      console.log('newPosition:', newPosition);
      console.log('this.tileSize:', this.tileSize);

      if (
        this.tileSize &&
        oldPosition &&
        newPosition &&
        (oldPosition.x !== newPosition.x || oldPosition.y !== newPosition.y)
      ) {
        console.log('Calling animateRemotePC from updatePC');
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

        // Save to server
        try {
          await axios.post(`${API_BASE}/api/save-single-pc`, {
            gridId,
            playerId,
            pc: updatedPC,
            lastUpdated: now,
          });
          console.log(`✅ Updated PC ${playerId} on server.`);
        } catch (error) {
          console.error(`❌ Failed to update PC ${playerId}:`, error);
        }
    }


  // Remove a PC from the playersInGrid for a given gridId and playerId.
  removePC(gridId, playerId) {
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

    console.log(`🗑️ Removed PC ${playerId} from grid ${gridId}`);
  }

  }
    

    const playersInGridManager = new GridStatePCManager();
    export default playersInGridManager;
    export const { initializePlayersInGrid } = playersInGridManager;