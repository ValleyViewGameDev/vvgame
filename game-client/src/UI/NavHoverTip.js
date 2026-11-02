import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

// Hovertips for the nav bar and the floating HUD buttons (owner 2026-11-02): the header's instant
// parchment pill (App.css .header-tip), drawn outside the buttons as one fixed tip placed from the
// hovered button's rect (the nav pill clips its contents, and the HUD buttons sit at the board's
// edges). Buttons carry their name in data-tip (plus aria-label for screen readers), never a
// delayed browser title. placement 'above' (the nav bar): over the bar, centred on the button;
// 'side' (the HUD): beside the button, toward the middle of the screen (a left-column button's
// tip opens to its right, a right-column button's to its left). Mouse devices only: a tap on a
// phone never leaves a tip behind.
const GAP = 8;    // between the bar or button and the pill
const EDGE = 6;   // the pill never comes closer than this to the window's sides

export function useHoverTip(placement = 'above') {
  const [tip, setTip] = useState(null);
  const canHover = useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches, []);
  const onMouseOver = useCallback((e) => {
    if (!canHover) return;
    const btn = e.target.closest?.('[data-tip]');
    if (!btn || !e.currentTarget.contains(btn)) { setTip(null); return; }
    const text = btn.getAttribute('data-tip');
    const b = btn.getBoundingClientRect();
    if (placement === 'side') {
      const onLeft = b.left + b.width / 2 < window.innerWidth / 2;
      setTip({ text, placement, y: b.top + b.height / 2, ...(onLeft ? { left: b.right + GAP } : { right: window.innerWidth - b.left + GAP }) });
    } else {
      const bar = e.currentTarget.getBoundingClientRect();
      setTip({ text, placement, x: b.left + b.width / 2, bottom: window.innerHeight - bar.top + GAP });
    }
  }, [canHover, placement]);
  const onMouseLeave = useCallback(() => setTip(null), []);
  // a click opens a panel (or the bar scrolls): the tip goes until the mouse moves again
  const onClick = useCallback(() => setTip(null), []);
  return { tip, handlers: { onMouseOver, onMouseLeave, onClick } };
}

// the nav bar's tips
export function useNavHoverTip() {
  const { tip, handlers } = useHoverTip('above');
  return { navTip: tip, navTipHandlers: handlers };
}

export default function NavHoverTip({ tip }) {
  const ref = useRef(null);
  const [left, setLeft] = useState(null);
  useLayoutEffect(() => {
    if (!tip || tip.placement === 'side' || !ref.current) return;
    const w = ref.current.offsetWidth;
    setLeft(Math.min(Math.max(tip.x - w / 2, EDGE), window.innerWidth - w - EDGE));
  }, [tip]);
  if (!tip || !tip.text) return null;
  const style = tip.placement === 'side'
    ? { top: tip.y, transform: 'translateY(-50%)', left: tip.left ?? 'auto', right: tip.right ?? 'auto' }
    : { left: left ?? tip.x, bottom: tip.bottom, visibility: left == null ? 'hidden' : 'visible' };
  return (
    <div ref={ref} className="header-tip nav-hover-tip" style={style} aria-hidden="true">
      {tip.text}
    </div>
  );
}
