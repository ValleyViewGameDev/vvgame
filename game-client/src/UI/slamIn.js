import './SlamIn.css';

// The "hangs big, falls, lands hard" entrance (UI/SlamIn.css), ported from Heir & Spare's
// render/slamIn.js. The element cannot animate in place: inside a panel it sits in scrolling,
// clipping boxes, so at 4x it would be sliced off. The animation runs on a position: fixed clone
// on <body>, pinned to the element's measured rect; the element keeps its place in the layout
// (hidden with visibility, so nothing reflows) and is revealed the frame the clone, which ends at
// scale 1 on the same rect, is removed. Never leaves the element hidden on any path.
const SLAM_MS = 1100;         // keep in step with the keyframes (SlamIn.css)
const IMPACT_MS = 759;        // 69% of the run: the moment it hits (onImpact)

/**
 * Slam `el` into place. `onImpact(rect)` runs at the moment of contact (for a burst there).
 * Resolves when it has landed, or at once when the effect is skipped (reduced motion, no rect).
 */
export function slamIn(el, { onImpact } = {}) {
  if (!el) return Promise.resolve();
  const reveal = () => { el.style.visibility = ''; };
  let reduced = false;
  try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { /* older WebView */ }
  const r = el.getBoundingClientRect();
  if (reduced || !r.width || !r.height) { reveal(); onImpact?.(r); return Promise.resolve(); }

  // re-parenting to <body> drops every descendant selector that styled the original, so the
  // computed text properties are carried across inline (or the clone lands looking different)
  const cs = getComputedStyle(el);
  const clone = el.cloneNode(true);
  clone.classList.add('slam-in-clone');
  clone.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;`
    + `margin:0;box-sizing:border-box;display:flex;align-items:center;justify-content:center;`
    + `visibility:visible;color:${cs.color};font:${cs.font};opacity:${cs.opacity};filter:${cs.filter};`;
  el.style.visibility = 'hidden';
  document.body.appendChild(clone);

  const impact = setTimeout(() => onImpact?.(r), IMPACT_MS);
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(impact);
      clone.remove();
      reveal();
      resolve();
    };
    clone.addEventListener('animationend', finish, { once: true });
    // a backgrounded tab may drop the animation: never strand the clone with the element hidden
    setTimeout(finish, SLAM_MS + 300);
  });
}
