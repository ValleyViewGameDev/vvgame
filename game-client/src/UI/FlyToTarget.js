/**
 * FlyToTarget: send a piece of UI (a floating "+480 💰", say) flying into a header counter.
 *
 * Any element that can be hit carries `data-fly-target="<key>"` (the header's Money counter is
 * "money", its Level button and XP bar "xp"). `flyToTarget(el, key)` clones `el` where it stands,
 * flies the clone along a curve that keeps the text's upward momentum and then ACCELERATES into the
 * target, and on impact pulses every element with that key (class `fly-hit`, FlyToTarget.css).
 *
 * Counters that should rise on impact rather than the moment the server answers use
 * `useHeldValue(value, key)`: while a flight to `key` is in the air, the shown value waits; on
 * impact it rolls up to the latest value. `registerFlight(key)` marks a flight as coming (call it
 * when the text is created, so the counter holds from the start); `flyToTarget` lands it.
 *
 * Used by FloatingText (`options.flyTo`); nothing here is specific to it.
 */
import { useEffect, useRef, useState } from 'react';
import './FlyToTarget.css';

// ---------- flights in the air, by target key ----------
const pending = new Map();      // key -> flights not yet landed
const listeners = new Set();    // (key, landed: boolean) => void
const notify = (key, landed) => listeners.forEach((fn) => fn(key, landed));

export function registerFlight(key) {
  if (!key) return;
  pending.set(key, (pending.get(key) || 0) + 1);
  notify(key, false);
  // a flight that never lands (its source vanished) must not hold a counter forever
  setTimeout(() => { if (pending.get(key) > 0) landFlight(key); }, 8000);
}
function landFlight(key) {
  const n = Math.max(0, (pending.get(key) || 0) - 1);
  pending.set(key, n);
  notify(key, true);
}
export const flightsPending = (key) => pending.get(key) || 0;

// ---------- the impact ----------
export function pulseTarget(key) {
  document.querySelectorAll(`[data-fly-target="${key}"]`).forEach((el) => {
    el.classList.remove('fly-hit');
    void el.offsetWidth;   // restart the animation on a quick second hit
    el.classList.add('fly-hit');
    clearTimeout(el.__flyHitTimer);
    el.__flyHitTimer = setTimeout(() => el.classList.remove('fly-hit'), 600);
  });
}

/** The visible element for a key (the first one with a real size: phones hide some). */
function targetRect(key) {
  for (const el of document.querySelectorAll(`[data-fly-target="${key}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return r;
  }
  return null;
}

const easeIn = (t) => t * t * t;   // slow off the mark, then faster and faster: it HITS

/**
 * Fly a clone of `source` (an element, or { rect, text, className }) into the target `key`.
 * The flight was registered when the text appeared (registerFlight); this lands it.
 * Options: { duration (ms), onArrive() }.
 */
export function flyToTarget(source, key, { duration = 620, onArrive } = {}) {
  const fromRect = source instanceof Element ? source.getBoundingClientRect() : source.rect;
  const to = targetRect(key);
  const finish = () => { landFlight(key); onArrive?.(); };
  if (!fromRect || !to) { finish(); return; }

  const node = document.createElement('div');
  node.className = `fly-to-target ${source instanceof Element ? source.className : (source.className || '')}`;
  node.textContent = source instanceof Element ? source.textContent : source.text;
  if (source instanceof Element) {
    const cs = getComputedStyle(source);
    node.style.color = cs.color;
    node.style.fontSize = cs.fontSize;
  }
  node.style.animation = 'none';
  node.style.position = 'fixed';
  node.style.zIndex = '2147483001';   // over modals and the scrim, whatever classes it carries
  node.style.left = '0px';
  node.style.top = '0px';
  document.body.appendChild(node);

  const sx = fromRect.left + fromRect.width / 2, sy = fromRect.top + fromRect.height / 2;
  const tx = to.left + to.width / 2, ty = to.top + to.height / 2;
  // control point: the text keeps rising a little (its momentum), drifting toward the target's side
  const cx = sx + (tx - sx) * 0.15, cy = Math.min(sy, ty) - Math.max(60, Math.abs(ty - sy) * 0.35);
  const start = performance.now();

  const step = (now) => {
    const t = Math.min(1, (now - start) / duration), e = easeIn(t), u = 1 - e;
    const x = u * u * sx + 2 * u * e * cx + e * e * tx;
    const y = u * u * sy + 2 * u * e * cy + e * e * ty;
    const scale = 1 - 0.45 * e;
    node.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${scale})`;
    if (t < 1) { requestAnimationFrame(step); return; }
    node.remove();
    pulseTarget(key);
    finish();
  };
  requestAnimationFrame(step);
}

// ---------- counters that rise on impact ----------
/**
 * The value to SHOW for a counter that flights land on: it holds while a flight to `key` is in the
 * air and rolls up (or down) to the latest value when one lands. With nothing in the air it simply
 * follows `value`.
 */
export function useHeldValue(value, key, { rollMs = 450 } = {}) {
  const [shown, setShown] = useState(value);
  const latest = useRef(value);
  const shownRef = useRef(value);
  const anim = useRef(null);
  latest.current = value;

  const rollTo = (target) => {
    cancelAnimationFrame(anim.current);
    const from = shownRef.current, start = performance.now();
    if (typeof target !== 'number' || typeof from !== 'number' || from === target) { shownRef.current = target; setShown(target); return; }
    const tick = (now) => {
      const t = Math.min(1, (now - start) / rollMs), e = 1 - Math.pow(1 - t, 3);
      const v = t < 1 ? Math.round(from + (target - from) * e) : target;
      shownRef.current = v; setShown(v);
      if (t < 1) anim.current = requestAnimationFrame(tick);
    };
    anim.current = requestAnimationFrame(tick);
  };

  // no flight coming: follow the value straight away
  useEffect(() => {
    if (flightsPending(key) === 0 && value !== shownRef.current) { cancelAnimationFrame(anim.current); shownRef.current = value; setShown(value); }
  }, [value, key]);

  // a flight landed: roll up to whatever the value is now
  useEffect(() => {
    const fn = (k, landed) => { if (k === key && landed) rollTo(latest.current); };
    listeners.add(fn);
    return () => { listeners.delete(fn); cancelAnimationFrame(anim.current); };
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps

  return shown;
}
