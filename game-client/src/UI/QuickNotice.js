import './QuickNotice.css';

/**
 * A quick notice: a short line ("Copied to clipboard") that drops in at the top of the board,
 * where the header toasts land, above every panel and modal, and fades away by itself (docs/ui-conventions.md §4).
 * For a confirmation that needs no answer; the big header toasts (UI/Notifications) are for news,
 * and gameAlert (UI/Modals/GameDialog.js) is for something the player must acknowledge.
 *
 *   showQuickNotice('Copied to clipboard');
 */
const SHOW_MS = 1600;
let current = null;

export function showQuickNotice(message, { icon = '' } = {}) {
  if (typeof document === 'undefined') return;
  if (current) { clearTimeout(current.timer); current.el.remove(); current = null; }
  const el = document.createElement('div');
  el.className = 'quick-notice';
  el.setAttribute('role', 'status');
  el.textContent = icon ? `${icon} ${message}` : message;
  document.body.appendChild(el);
  // fade out after a beat, then remove
  const timer = setTimeout(() => {
    el.classList.add('quick-notice--out');
    setTimeout(() => { el.remove(); if (current?.el === el) current = null; }, 300);
  }, SHOW_MS);
  current = { el, timer };
}
