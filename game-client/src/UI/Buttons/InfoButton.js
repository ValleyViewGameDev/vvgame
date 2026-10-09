import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { canHover } from '../../Utils/inputMode';
import './ResourceButton.css';

/**
 * The ℹ️ details badge (ResourceButton, Trophy cards). One convention on every layout:
 * desktop shows the details on hover, beside the cursor; touch screens show them on a TAP of
 * the badge, anchored under it, and close them on the next tap anywhere (docs/ui-conventions.md
 * §5). The tap never reaches the control underneath, so tapping ℹ️ on a resource button does not
 * also craft or buy.
 *
 * Render it OUTSIDE a <button>: a disabled button swallows taps on its children.
 * `info` is an HTML string or JSX.
 */
const TOOLTIP_MAX_W = 200;

export default function InfoButton({ info, className = '', style }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [tapMode, setTapMode] = useState(false);
  const badgeRef = useRef(null);

  // Tap mode: the next tap anywhere (including the badge again) closes it
  useEffect(() => {
    if (!open || !tapMode) return undefined;
    const close = (e) => {
      if (badgeRef.current && badgeRef.current.contains(e.target)) return; // the badge toggles itself
      setOpen(false);
    };
    const closeNow = () => setOpen(false);
    document.addEventListener('pointerdown', close, true);
    window.addEventListener('scroll', closeNow, true);
    window.addEventListener('resize', closeNow);
    return () => {
      document.removeEventListener('pointerdown', close, true);
      window.removeEventListener('scroll', closeNow, true);
      window.removeEventListener('resize', closeNow);
    };
  }, [open, tapMode]);

  if (!info) return null;

  const followCursor = (event) => {
    setPos({ top: event.clientY + window.scrollY + 10, left: event.clientX + window.scrollX + 15 });
  };

  const handleClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (canHover()) return; // desktop: hover only
    if (open) { setOpen(false); return; }
    const r = badgeRef.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.right - TOOLTIP_MAX_W, window.innerWidth - TOOLTIP_MAX_W - 8));
    setPos({ top: r.bottom + window.scrollY + 6, left: left + window.scrollX });
    setTapMode(true);
    setOpen(true);
  };

  return (
    <>
      <span
        ref={badgeRef}
        className={`info-button ${className}`}
        style={style}
        role="button"
        aria-label="Info"
        onClick={handleClick}
        onMouseEnter={(event) => { if (!canHover()) return; setTapMode(false); followCursor(event); setOpen(true); }}
        onMouseMove={(event) => { if (canHover() && !tapMode) followCursor(event); }}
        onMouseLeave={() => { if (!tapMode) setOpen(false); }}
      >
        ℹ️
      </span>
      {open && ReactDOM.createPortal(
        <div
          className={`info-toaster ${tapMode ? 'info-toaster--tap' : ''}`}
          style={{ top: pos.top, left: pos.left, position: 'absolute' }}
        >
          {typeof info === 'string' ? <p dangerouslySetInnerHTML={{ __html: info }} /> : info}
        </div>,
        document.body
      )}
    </>
  );
}
