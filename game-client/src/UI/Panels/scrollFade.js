/**
 * scrollFade: the "there is more below" fade on scrolling panel content (docs/ui-conventions.md §3).
 *
 * Any box inside a panel (`.panel-container`, the Map panel included) that scrolls
 * vertically and has content below its bottom edge gets `scroll-fade--more`, which
 * scrollFade.css turns into a 20 px mask fading the content out at the bottom. The class
 * drops as soon as the box is scrolled to its end, so the last line is never faded.
 *
 * Installed once from App.js, like panelExitGhost: panels come and go by many routes and
 * several keep their own inner scroller above a footer (stations, animals, pets, deco), so a
 * document-level scan beats wiring a ref into each one. Scroll events update just the box
 * that scrolled; DOM changes, image loads and resizes rescan the open panels.
 */

const ROOTS = '.panel-container';
const CLASS_HOST = 'scroll-fade';
const CLASS_MORE = 'scroll-fade--more';
const SLACK = 4; // px of remaining scroll that still counts as "at the end"

let installed = false;
let scanQueued = false;

function scrollsVertically(el) {
  const o = getComputedStyle(el).overflowY;
  return o === 'auto' || o === 'scroll';
}

function updateBox(el) {
  const more = el.scrollHeight - el.clientHeight - el.scrollTop > SLACK;
  el.classList.toggle(CLASS_MORE, more);
}

function scan() {
  scanQueued = false;
  document.querySelectorAll(ROOTS).forEach((root) => {
    if (root.classList.contains('panel-ghost')) return;
    const candidates = [root, ...root.querySelectorAll('*')];
    candidates.forEach((el) => {
      const overflows = el.scrollHeight > el.clientHeight + SLACK;
      if (overflows && scrollsVertically(el)) {
        el.classList.add(CLASS_HOST);
        updateBox(el);
      } else if (el.classList.contains(CLASS_HOST)) {
        el.classList.remove(CLASS_HOST, CLASS_MORE);
      }
    });
  });
}

function queueScan() {
  if (scanQueued) return;
  scanQueued = true;
  requestAnimationFrame(scan);
}

function onScroll(e) {
  const el = e.target;
  if (el && el.nodeType === 1 && el.classList.contains(CLASS_HOST)) updateBox(el);
}

export function installScrollFade() {
  if (installed || typeof document === 'undefined') return () => {};
  installed = true;
  document.addEventListener('scroll', onScroll, true);
  document.addEventListener('load', queueScan, true); // images inside a panel change its height
  window.addEventListener('resize', queueScan);
  const mo = new MutationObserver(queueScan);
  mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  queueScan();
  return () => {
    installed = false;
    document.removeEventListener('scroll', onScroll, true);
    document.removeEventListener('load', queueScan, true);
    window.removeEventListener('resize', queueScan);
    mo.disconnect();
  };
}
