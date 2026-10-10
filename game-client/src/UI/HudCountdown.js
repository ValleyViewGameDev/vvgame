import React, { useEffect, useState } from 'react';
import { formatCompactCountdown } from './Timers';
import './HudCountdown.css';

/**
 * The condensed countdown under a round HUD button (Season, Town News): white with a dark
 * shadow like a crafting slot's timer, red once under an hour. Ticks on its own each second
 * so App does not re-render for it. `endTimes`: one or more end timestamps (ms); the soonest
 * one still in the future is shown, nothing when none is.
 */
export default function HudCountdown({ endTimes }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const upcoming = (Array.isArray(endTimes) ? endTimes : [endTimes])
    .map(Number)
    .filter((t) => Number.isFinite(t) && t > now);
  if (!upcoming.length) return null;
  const end = Math.min(...upcoming);
  const urgent = end - now < 60 * 60 * 1000;

  return (
    <span className={`hud-countdown ${urgent ? 'hud-countdown--urgent' : ''}`}>
      {formatCompactCountdown(end, now)}
    </span>
  );
}
