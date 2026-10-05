/** Per-file dirty registry: drives the top-bar indicator and the beforeunload guard. */
import { $ } from './dom.js';

const dirty = new Map(); // id -> label

function render() {
  const n = $('#dirty');
  if (!n) return;
  n.textContent = dirty.size ? `● unsaved: ${[...dirty.values()].join(', ')}` : '';
}

export function setDirty(id, label, isDirty) {
  if (isDirty) dirty.set(id, label); else dirty.delete(id);
  render();
}
export function isAnyDirty() { return dirty.size > 0; }
export function dirtyLabels() { return [...dirty.values()]; }

window.addEventListener('beforeunload', (e) => {
  if (!dirty.size) return;
  e.preventDefault();
  e.returnValue = '';
});
