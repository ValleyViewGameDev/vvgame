import socket from '../socketManager';
import gridStateManager from './GridState';

class NPCController {
  constructor() {
    this.controlledGrids = new Map();
    this.setupSocketListeners();
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
  }

  joinGrid(gridId) {
    console.log(`🎮 Requesting controller status for grid ${gridId}`);
    socket.emit('join-grid-controller', { gridId });
  }

  leaveGrid(gridId) {
    console.log(`🎮 Leaving grid ${gridId}`);
    socket.emit('leave-grid-controller', { gridId });
    this.removeController(gridId);
  }

  setAsController(gridId) {
    this.controlledGrids.set(gridId, { isController: true });
  }

  removeController(gridId) {
    this.controlledGrids.delete(gridId);
  }

  isControllingGrid(gridId) {
    return this.controlledGrids.get(gridId)?.isController === true;
  }
}

export const npcController = new NPCController();
export default npcController;
