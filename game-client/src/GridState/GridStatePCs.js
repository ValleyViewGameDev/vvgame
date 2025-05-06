import API_BASE from '../config';
import socket from '../socketManager';
import axios from 'axios';

class GridStatePCManager {
    constructor() {
      this.gridStatePCs = {}; // Store PC states in memory
    }

    /**
     * Initialize the gridStatePCs for a specific gridId.
     */
    async initializeGridStatePCs(gridId) {
      console.log('🧠 Fetching gridStatePCs for gridId:', gridId);
      if (!gridId) {
        console.error('initializeGridStatePCs: gridId is undefined.');
        return;
      }
    
      try {
        const response = await axios.get(`${API_BASE}/api/load-grid-state/${gridId}`);
        const {
          gridStatePCs = { pcs: {}, lastUpdated: 0 },
        } = response.data;
    
        const pcs = gridStatePCs.pcs || {};
    
        // Normalize PC format
        Object.keys(pcs).forEach((playerId) => {
          const pcData = pcs[playerId];
          pcs[playerId] = {
            ...pcData,
            position: pcData.position || { x: 0, y: 0 },
          };
        });
    
        this.gridStatePCs[gridId] = pcs;
    
        console.log(`✅ Initialized gridStatePCs for gridId ${gridId}:`, pcs);
      } catch (error) {
        console.error('❌ Error fetching gridStatePCs:', error);
      }
    }
    
    getGridStatePCs(gridId) {
        const pcs = this.gridStatePCs[gridId];
        if (!pcs) {
          console.warn(`⚠️ No PC state found for gridId: ${gridId}`);
          return {};
        }
        return pcs;
      }


      // Add a new PC to the gridStatePCs for a given gridId and playerId.
      async addPC(gridId, playerId, pcData) {
        if (!this.gridStatePCs[gridId]) {
          this.gridStatePCs[gridId] = {};
        }

        const now = Date.now();
        const newPC = {
          ...pcData,
          lastUpdated: now,
        };

        this.gridStatePCs[gridId][playerId] = newPC;

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
          socket.emit('update-gridState-PCs', {
            gridId,
            pcs: { [playerId]: newPC },
            gridStatePCsLastUpdated: now,
          });
        }

        // Note: Caller should update React context using setGridStatePCs if needed
      }

      // Update an existing PC in the gridStatePCs for a given gridId and playerId.
      async updatePC(gridId, playerId, newProperties) {
        const gridPCs = this.gridStatePCs[gridId];
        if (!gridPCs || !gridPCs[playerId]) {
          console.error(`Cannot update PC ${playerId}. No gridState or PC found for gridId: ${gridId}`);
          return;
        }

        const now = Date.now();
        const updatedPC = {
          ...gridPCs[playerId],
          ...newProperties,
          lastUpdated: now,
        };

        this.gridStatePCs[gridId][playerId] = updatedPC;

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
          socket.emit('update-gridState-PCs', {
            gridId,
            pcs: { [playerId]: updatedPC },
            gridStatePCsLastUpdated: now,
          });
        }

        // Note: Caller should update React context using setGridStatePCs if needed
      }
    }
    
    const gridStatePCManager = new GridStatePCManager();
    export default gridStatePCManager;
    export const { initializeGridStatePCs } = gridStatePCManager;