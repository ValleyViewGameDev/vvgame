/** Placeholder for tabs built in later slices (docs/tools-plan.md §4). */
import { el, clear } from '../core/dom.js';

export function stubTab(id, label, icon, group) {
  return {
    id, label, icon, group,
    mount(selectionEl, editorEl) {
      clear(selectionEl).appendChild(el('h2', {}, label));
      clear(editorEl).appendChild(el('div', { class: 'stub' }, `${label}: coming in the next slice (see docs/tools-plan.md §4).`));
    },
    unmount() {},
  };
}
