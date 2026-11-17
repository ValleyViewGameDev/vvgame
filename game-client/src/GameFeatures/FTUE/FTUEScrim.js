import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import PixiCamera from '../../Render/PixiRenderer/PixiCamera';
import { targetRect } from './findBoardTarget';
import { lockInput, unlockInput } from '../../Utils/inputLock';
import './FTUEScrim.css';

const PAD = 6;

/**
 * Scrim Moment (FTUE step option `scrim: true`; target = `scrimTarget` or the step's
 * doinkerTarget: a board name, 'ftue-dirt', { selector } for a UI element such as a nav
 * button, or { dirtTile: true }): darkens the whole screen except the target and lets taps
 * through only there. The hole is the gap between four dark panels, re-measured 20 times a second
 * so it tracks the camera (four dark panels framing it); the overlay sits above the header, nav, panels and modals, and
 * body.ftue-scrim-active lifts the doinker and the toast back above it. Movement keys are locked
 * while it is up, so the only way forward is the thing the arrow points at.
 */
export default function FTUEScrim({ target, gridId }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!target) return undefined;
    document.body.classList.add('ftue-scrim-active');
    lockInput('scrim');
    // 20 fps is plenty for a hole that tracks a walking camera, and a timer keeps working in a
    // background tab where requestAnimationFrame stalls.
    const tick = () => {
      const el = ref.current;
      let rect = targetRect(target, gridId, PAD);
      // the board arrow above a board target stays inside the hole: a tap on it reaches the board,
      // where it counts as a tap on its target (PixiRendererDoinker boardArrowTargetAt)
      const arrow = rect && !(target && typeof target === 'object') && document.querySelector('.ftue-doinker-board');
      if (arrow) {
        // the arrow's RESTING box (its inline left/top/size, centred on left by translateX(-50%)),
        // not getBoundingClientRect: that follows the bounce, and the hole bounced with it
        // (owner 2026-11-16). The -12 below already leaves room for the bounce's 12 px lift.
        const w = parseFloat(arrow.style.width) || 0, h = parseFloat(arrow.style.height) || 0;
        const l = parseFloat(arrow.style.left) - w / 2, t = parseFloat(arrow.style.top);
        const a = { left: l, top: t, right: l + w, bottom: t + h };
        rect = { x1: Math.min(rect.x1, Math.round(a.left - PAD)), y1: Math.min(rect.y1, Math.round(a.top - PAD - 12)),
          x2: Math.max(rect.x2, Math.round(a.right + PAD)), y2: rect.y2 };
      }
      if (el && rect) {
        const { x1, y1, x2, y2 } = rect;
        // Four dark panels framing the hole; the hole itself is empty, so taps there reach the target
        const [top, bottom, left, right] = el.children;
        top.style.cssText = `left:0;top:0;width:100%;height:${Math.max(0, y1)}px`;
        bottom.style.cssText = `left:0;top:${y2}px;width:100%;bottom:0`;
        left.style.cssText = `left:0;top:${y1}px;width:${Math.max(0, x1)}px;height:${Math.max(0, y2 - y1)}px`;
        right.style.cssText = `left:${x2}px;top:${y1}px;right:0;height:${Math.max(0, y2 - y1)}px`;
        el.style.clipPath = '';
        el.style.opacity = '1';
      } else if (el) {
        el.style.opacity = '0'; // nothing to point at yet (board still loading): no blackout
      }
    };
    tick();
    const timer = setInterval(tick, 50);
    return () => {
      clearInterval(timer);
      document.body.classList.remove('ftue-scrim-active');
      unlockInput('scrim');
    };
  }, [JSON.stringify(target), gridId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!target) return null;
  // Portal to <body>: inside the board's stacking context a z-index could never clear the nav pill
  return createPortal(
    <div ref={ref} id="ftue-scrim" className="ftue-scrim" aria-hidden="true">
      <div className="ftue-scrim-panel" /><div className="ftue-scrim-panel" /><div className="ftue-scrim-panel" /><div className="ftue-scrim-panel" />
    </div>,
    document.body
  );
}
