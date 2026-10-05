/**
 * panelExitGhost: the slide-out for panels (every layout).
 *
 * Panels leave the DOM by many routes (the close button, a nav tap, a station being
 * cleared, auto-close on a board tap), and most of them unmount the panel at once, so a
 * CSS animation on the live node never gets to play. Instead, when a `.panel-container`
 * node is removed from the document, a static clone of it is dropped back in
 * at the same place with the `panel-ghost` class, plays the slide-out (App.css; mobile.css on phones)
 * and is removed when the animation ends. The clone has no React behind it and no pointer
 * events, so it is purely visual. Switching panels ghosts the old one while the new one
 * slides in.
 */

const GHOST_MS = 260;
let observer = null;

function ghost(node) {
  if (node.classList.contains('panel-ghost')) return;
  const clone = node.cloneNode(true);
  clone.classList.add('panel-ghost');
  clone.setAttribute('aria-hidden', 'true');
  clone.style.pointerEvents = 'none';
  // The clone keeps the panel's class, so the stylesheet positions it where the panel was
  document.body.appendChild(clone);
  const remove = () => { if (clone.parentNode) clone.parentNode.removeChild(clone); };
  clone.addEventListener('animationend', remove, { once: true });
  setTimeout(remove, GHOST_MS + 100); // belt and braces
}

export function installPanelExitGhost() {
  if (observer || typeof MutationObserver === 'undefined') return () => {};
  observer = new MutationObserver((records) => {
    for (const rec of records) {
      rec.removedNodes.forEach((n) => {
        if (n.nodeType !== 1) return;
        if (n.classList && n.classList.contains('panel-container')) { ghost(n); return; }
        if (n.querySelectorAll) n.querySelectorAll('.panel-container').forEach(ghost);
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return () => { observer.disconnect(); observer = null; };
}
