/**
 * DoinkerRadar: the radar pulse under every FTUE doinker arrow (owner 2026-11-16). Deep red rings
 * grow out of the centre of the thing being pointed at and fade, staggered like a radar sweep.
 * Pure CSS (FTUE.css .ftue-radar), pointer-events none, so taps reach the target. `fixed` for a
 * portal on <body> (board and button doinkers), else absolute in its parent. The rings sweep out
 * over the screen and are gone at a radius of a phone's width (390 px; owner 2026-11-16),
 * whatever the target's size: the diameter is FTUE.css --radar-size, `size` only overrides it.
 */
const RINGS = 6;
const PERIOD_S = 4.5; // FTUE.css ftue-radar-ping's duration

const DoinkerRadar = ({ x, y, size = null, fixed = true, className = '' }) => (
  <div
    className={`ftue-radar ${fixed ? 'ftue-radar--fixed' : ''} ${className}`.trim()}
    style={{ left: `${Math.round(x)}px`, top: `${Math.round(y)}px`, ...(size ? { width: `${Math.round(size)}px`, height: `${Math.round(size)}px` } : null) }}
    aria-hidden="true"
  >
    {Array.from({ length: RINGS }, (_, i) => (
      <span key={i} className="ftue-radar-ring" style={{ animationDelay: `${(i * PERIOD_S) / RINGS}s` }} />
    ))}
  </div>
);

export default DoinkerRadar;
