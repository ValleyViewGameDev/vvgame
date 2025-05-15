import API_BASE from '../config';
import socket from '../socketManager';
import axios from 'axios';

class GridStatePCManager {
    constructor() {
      this.playersInGrid = {}; // Store PC states in memory
    }
 
    registerSetPlayersInGrid(setter) {
      this.setPlayersInGridReact = setter;
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
    
    // Add a new PC to the playersInGrid for a given gridId and playerId.
    async addPC(gridId, playerId, pcData) {
      if (!this.playersInGrid[gridId]) {
        this.playersInGrid[gridId] = {
          pcs: {},
          playersInGridLastUpdated: Date.now(),
        };
      }

      const now = Date.now();
      const newPC = {
        ...pcData,
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

    // Update an existing PC in the playersInGrid for a given gridId and playerId.
    async updatePC(gridId, playerId, newProperties) {
      const gridPCs = this.playersInGrid[gridId]?.pcs;
      if (!gridPCs || !gridPCs[playerId]) {
        console.error(`Cannot update PC ${playerId}. No NPCsInGrid or PC found for gridId: ${gridId}`);
        return;
      }

      const now = Date.now();
      const updatedPC = {
        ...gridPCs[playerId],
        ...newProperties,
        lastUpdated: now,
      };

      this.playersInGrid[gridId].pcs[playerId] = updatedPC;

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

      // Emit to other clients

      if (socket && socket.emit) {
        socket.emit('update-NPCsInGrid-PCs', {
          gridId,
          pcs: { [playerId]: updatedPC },
          playersInGridLastUpdated: now,
        });
        console.log(`📡 Emitted update for PC ${playerId} to other clients.`);
      }
 
      // Note: Caller should update React context using setPlayersInGrid if needed
    }
  }
    

    const playersInGridManager = new GridStatePCManager();
    export default playersInGridManager;
    export const { initializePlayersInGrid } = playersInGridManager;