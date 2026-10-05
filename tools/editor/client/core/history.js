import { clone } from './dom.js';

/** Snapshot undo/redo with a cap. Snapshots are deep clones of whatever state you pass. */
export class History {
  constructor(limit = 60) { this.limit = limit; this.undoStack = []; this.redoStack = []; }
  push(state) {
    this.undoStack.push(clone(state));
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  }
  undo(current) {
    if (!this.undoStack.length) return null;
    this.redoStack.push(clone(current));
    return this.undoStack.pop();
  }
  redo(current) {
    if (!this.redoStack.length) return null;
    this.undoStack.push(clone(current));
    return this.redoStack.pop();
  }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
  clear() { this.undoStack.length = 0; this.redoStack.length = 0; }
}
