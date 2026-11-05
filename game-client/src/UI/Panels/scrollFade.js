/**
 * scrollFade: the "there is more below" fade on scrolling panel content (docs/ui-conventions.md §3).
 *
 * Any box inside a panel (`.panel-container`, the Map panel included) that scrolls
 * vertically and has content below its bottom edge gets `scroll-fade--more`, which
 * scrollFade.css turns into a 20 px mask fading the content out at the bottom. The class
 * drops as soon as the box is scrolled to its end, so the last line is never faded.
 *
 * The nav bar's button strip (`.nav-scroll`) gets the same treatment on whichever axis it
 * scrolls: `scroll-fade--more-x` fades its right edge on a horizontal bar, `scroll-fade--more`
 * its bottom on the phone-landscape column.
 *
 * Installed once from App.js, like panelExitGhost: panels come and go by many routes and
 * several keep their own inner scroller above a footer (stations, animals, pets, deco), so a
 * document-level scan beats wiring a ref into each one. Scroll events update just the box
 * that scrolled; DOM changes, image loads and resizes rescan the open panels.
 */

const ROOTS = '.panel-container';
const NAV = '.nav-scroll'; // the nav bar's buttons: may also scroll sideways
const CLASS_HOST = 'scroll-fade';
const CLASS_MORE = 'scroll-fade--more';
const CLASS_MORE_X = 'scroll-fade--more-x';
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
  if (el.matches(NAV)) {
    const moreX = el.scrollWidth - el.clientWidth - el.scrollLeft > SLACK;
    el.classList.toggle(CLASS_MORE_X, moreX);
  }
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
  // the nav bar: one known scroller, either axis (a row on desktop and phone portrait, a
  // column in phone landscape)
  document.querySelectorAll(NAV).forEach((el) => {
    const overflows = el.scrollHeight > el.clientHeight + SLACK || el.scrollWidth > el.clientWidth + SLACK;
    if (overflows) {
      el.classList.add(CLASS_HOST);
      updateBox(el);
    } else {
      el.classList.remove(CLASS_HOST, CLASS_MORE, CLASS_MORE_X);
    }
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
