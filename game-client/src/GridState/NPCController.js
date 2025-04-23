import socket from '../socketManager';
import gridStateManager from './GridState';

class NPCController {
  constructor() {
    this.controlledGrids = new Map();
    this.setupSocketListeners();
    this.retryTimeout = null;
  }

  setupSocketListeners() {
    socket.on('npc-controller-assigned', ({ gridId }) => {
      console.log(`🎮 Assigned as NPC controller for grid ${gridId}`);
      this.setAsController(gridId);
    });

    socket.on('npc-controller-revoked', ({ gridId }) => {
      console.log(`🎮 Revoked as NPC controller for grid ${gridId}`);
      this.removeController(gridId);
    });

    // Add connection status listeners
    socket.on('connect', () => {
      console.log('🔌 NPCController socket connected');
    });

    socket.on('disconnect', () => {
      console.log('🔌 NPCController socket disconnected');
    });

    // Add response listener
    socket.on('join-grid-controller-response', ({ success, gridId }) => {
      console.log(`📡 Received controller join response: success=${success}, gridId=${gridId}`);
    });
  }

  joinGrid(gridId) {
    if (!socket.connected) {
      console.log('⏳ Socket not ready, retrying controller join in 1s...');
      clearTimeout(this.retryTimeout);
      this.retryTimeout = setTimeout(() => this.joinGrid(gridId), 1000);
      return;
    }

    console.log(`🎮 Requesting controller status for grid ${gridId}`);
    socket.emit('join-grid-controller', { 
      gridId,
      timestamp: Date.now() // Add timestamp for debugging
    });
  }

  leaveGrid(gridId) {
    console.log(`🎮 Leaving grid ${gridId}`);
    socket.emit('leave-grid-controller', { gridId });
    this.removeController(gridId);
  }

  setAsController(gridId) {
    console.log(`🎮 Setting controller status for grid ${gridId}`);
    // Add explicit true value and verify it's set
    this.controlledGrids.set(gridId, { isController: true });
    console.log(`🔍 Controller Map after set:`, 
      Array.from(this.controlledGrids.entries())
    );
  }

  removeController(gridId) {
    this.controlledGrids.delete(gridId);
    console.log(`🎮 Removed controller for grid ${gridId}`);
    console.log(`🔍 Controller Map after remove:`, 
      Array.from(this.controlledGrids.entries())
    );
  }

  isControllingGrid(gridId) {
    const controllerData = this.controlledGrids.get(gridId);
    const isController = controllerData?.isController === true;
    console.log(`🎮 Controller check for ${gridId}:`, {
      hasData: !!controllerData,
      isController: isController,
      rawValue: controllerData?.isController
    });
    return isController;
  }
}

export const npcController = new NPCController();
export default npcController;
