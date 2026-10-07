import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import PixiCamera from '../../Render/PixiRenderer/PixiCamera';
import { findBoardTarget } from './findBoardTarget';
import { lockInput, unlockInput } from '../../Utils/inputLock';
import './FTUEScrim.css';

const BASE_TILE = 45;
const PAD = 6;

/**
 * Scrim Moment (FTUE step option `scrim: true`, target = the step's doinkerTarget or
 * `scrimTarget`): darkens the whole screen except the target's tile and lets taps through
 * only there. The hole is the gap between four dark panels, re-measured 20 times a second
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
      const spot = findBoardTarget(target, gridId);
      if (el && spot && PixiCamera.isAttached()) {
        const size = spot.size || 1;
        const tl = PixiCamera.worldToScreen(spot.x * BASE_TILE, spot.y * BASE_TILE);
        const br = PixiCamera.worldToScreen((spot.x + size) * BASE_TILE, (spot.y + size) * BASE_TILE);
        const host = document.querySelector('.homestead')?.getBoundingClientRect() || { left: 0, top: 0 };
        const x1 = Math.round(host.left + tl.x - PAD), y1 = Math.round(host.top + tl.y - PAD);
        const x2 = Math.round(host.left + br.x + PAD), y2 = Math.round(host.top + br.y + PAD);
        // Four dark panels framing the hole; the hole itself is empty, so taps there reach the board
        const [top, bottom, left, right] = el.children;
        top.style.cssText = `left:0;top:0;width:100%;height:${Math.max(0, y1)}px`;
        bottom.style.cssText = `left:0;top:${y2}px;width:100%;bottom:0`;
        left.style.cssText = `left:0;top:${y1}px;width:${Math.max(0, x1)}px;height:${Math.max(0, y2 - y1)}px`;
        right.style.cssText = `left:${x2}px;top:${y1}px;right:0;height:${Math.max(0, y2 - y1)}px`;
        el.style.clipPath = ''; // a hot-reloaded node may still carry the earlier clip-path attempt
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
  }, [target, gridId]);
  if (!target) return null;
  // Portal to <body>: inside the board's stacking context a z-index could never clear the nav pill
  return createPortal(
    <div ref={ref} id="ftue-scrim" className="ftue-scrim" aria-hidden="true">
      <div className="ftue-scrim-panel" /><div className="ftue-scrim-panel" /><div className="ftue-scrim-panel" /><div className="ftue-scrim-panel" />
    </div>,
    document.body
  );
}
