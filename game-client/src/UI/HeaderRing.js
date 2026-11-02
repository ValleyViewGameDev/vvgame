import React from 'react';

// The ring round a desktop header stat (Level, Health, Inventory: App.js .header-ring): a faint
// track and an arc that fills clockwise from the top. tone: 'xp' (default), 'health', 'plain',
// 'danger' (App.css .header-ring-arc--*).
const R = 22;
const C = 2 * Math.PI * R;
export default function HeaderRing({ percent = 0, tone = 'xp' }) {
  const p = Math.min(100, Math.max(0, Number(percent) || 0));
  return (
    <svg className="header-ring-svg" viewBox="0 0 50 50" aria-hidden="true">
      <circle className="header-ring-track" cx="25" cy="25" r={R} />
      <circle className={`header-ring-arc header-ring-arc--${tone}`} cx="25" cy="25" r={R}
        strokeDasharray={C} strokeDashoffset={C * (1 - p / 100)} transform="rotate(-90 25 25)" />
    </svg>
  );
}
