import API_BASE from '../config';
import socket from '../socketManager';
import axios from 'axios';
import { setGridStatePCsExternally } from './GridStatePCContext';

class GridStatePCManager {
    constructor() {
      this.gridStatePCs = {}; // Store PC states in memory
    }

    getGridStatePCs(gridId) {
        const pcs = this.gridStatePCs[gridId];
        if (!pcs) {
          console.warn(`⚠️ No PC state found for gridId: ${gridId}`);
          return {};
        }
        return pcs;
      }
    
      async addOrUpdatePC(gridId, playerId, pcData) {
        if (!this.gridStatePCs[gridId]) {
          this.gridStatePCs[gridId] = {};
        }
    
        const now = Date.now();
        const updatedPC = {
          ...pcData,
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
          console.log(`✅ Saved single PC ${playerId} to server.`);
        } catch (error) {
          console.error(`❌ Failed to save single PC ${playerId}:`, error);
        }
    
        // Emit to other clients
        if (socket && socket.emit) {
          socket.emit('update-gridState-PCs', {
            gridId,
            pcs: { [playerId]: updatedPC },
            gridStatePCsLastUpdated: now,
          });
        }
    
        // Update local React context
        setGridStatePCsExternally(prevState => ({
          ...prevState,
          [playerId]: updatedPC,
        }));
      }
    }
    
    const gridStatePCManager = new GridStatePCManager();
    export default gridStatePCManager;

    