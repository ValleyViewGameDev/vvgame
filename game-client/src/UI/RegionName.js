import React, { useEffect, useMemo, useRef, useState } from 'react';
import './RegionName.css';
import './SaleBurst.css'; // .sale-spark: the same gold sparkles as a sale, flung wider
import { whenToastClears } from './Notifications/Notifications';

// The Region announcement (backlog W-5): the Region the player stands in, top centre of the board.
// Entering a Region bursts the name in (a flash of light, rays, a ring and sparkles while the word
// expands, RegionName.css); leaving one fades the old name out. `visible` hides it without losing
// track of the Region, so changing zoom never replays the burst: only a new Region does.
// Entering a Region also drops a "You are entering ..." toast (GridManagement.js); the burst waits
// until that toast has gone, so the two never compete for the top of the screen.
// Only ENTERING bursts: the Region the page starts in (a reload, a sign-in) is where the player
// already was, so it shows plainly. `ready` says the player's location is known; the Region at
// that moment is the starting one (owner 2026-11-04: the burst played behind the loading screen).
const SPARK_GLYPHS = ['✦', '✧', '✨', '•', '✦', '⭐'];
const SETTLE_MS = 2200;  // the burst and the word's gather are over (.region-name-in); plain from here on
const LEAVE_MS = 600;    // the old name's fade (.region-name-leaving)
const TOAST_LAG_MS = 120;     // the toast is shown in the same transition; give it a moment to land
const MAX_TOAST_WAIT_MS = 7000; // never hold the name back longer than a timed toast lives

function RegionBurst() {
  const sparks = useMemo(() => Array.from({ length: 26 }, (_, i) => {
    const angle = (i / 26) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
    const dist = 90 + Math.random() * 110;
    return {
      glyph: SPARK_GLYPHS[i % SPARK_GLYPHS.length],
      dx: `${Math.round(Math.cos(angle) * dist * 1.4)}px`, dy: `${Math.round(Math.sin(angle) * dist * 0.45)}px`,
      rot: `${Math.round((Math.random() - 0.5) * 540)}deg`, size: `${12 + Math.round(Math.random() * 12)}px`,
      delay: `${80 + Math.round(Math.random() * 120)}ms`,
    };
  }), []);
  return (
    <div className="region-burst" aria-hidden="true">
      <div className="region-burst-rays" />
      <div className="region-burst-flash" />
      <div className="region-burst-ring" />
      {sparks.map((sp, i) => (
        <span key={i} className="sale-spark" style={{ '--dx': sp.dx, '--dy': sp.dy, '--rot': sp.rot, fontSize: sp.size, animationDelay: sp.delay }}>{sp.glyph}</span>
      ))}
    </div>
  );
}

export default function RegionName({ region, visible, ready = true }) {
  const [current, setCurrent] = useState(ready && region ? { name: region, id: 1, phase: 'settled' } : null);
  const [leaving, setLeaving] = useState([]);
  const lastRegion = useRef(ready ? region : undefined);
  const started = useRef(ready); // has the starting Region been taken (shown plainly) yet?

  const currentRef = useRef(current);
  currentRef.current = current;

  useEffect(() => {
    if (!ready) return undefined;
    if (!started.current) {
      // the starting Region: no burst, no wait for a toast
      started.current = true;
      lastRegion.current = region;
      setCurrent(region ? { name: region, id: Date.now(), phase: 'settled' } : null);
      return undefined;
    }
    if (region === lastRegion.current) return undefined;
    lastRegion.current = region;
    const prev = currentRef.current;
    if (prev && prev.phase !== 'waiting') { // a name never shown has nothing to fade
      const old = { ...prev, id: `out-${prev.id}` };
      setLeaving((l) => [...l, old]);
      // not cleared on a quick second change: each old name must still leave the list
      setTimeout(() => setLeaving((l) => l.filter((x) => x.id !== old.id)), LEAVE_MS + 50);
    }
    if (!region) { setCurrent(null); return undefined; }
    // the new name waits, unseen, for the entry toast to go, then bursts in
    const id = Date.now() + Math.random();
    setCurrent({ name: region, id, phase: 'waiting' });
    let released = false;
    let cancelWait = () => {};
    const release = () => {
      if (released) return;
      released = true;
      cancelWait();
      setCurrent((c) => (c?.id === id ? { ...c, phase: 'in' } : c));
    };
    const lag = setTimeout(() => { cancelWait = whenToastClears(release); }, TOAST_LAG_MS);
    const cap = setTimeout(release, MAX_TOAST_WAIT_MS);
    return () => { clearTimeout(lag); clearTimeout(cap); cancelWait(); };
  }, [region, ready]);

  useEffect(() => {
    if (current?.phase !== 'in') return undefined;
    const t = setTimeout(() => setCurrent((c) => (c?.id === current.id ? { ...c, phase: 'settled' } : c)), SETTLE_MS);
    return () => clearTimeout(t);
  }, [current?.id, current?.phase]);

  if (!visible) return null;
  return (
    <>
      {leaving.map((l) => (
        <div key={l.id} className="region-name region-name-leaving"><span className="region-name-text">{l.name}</span></div>
      ))}
      {current && current.phase !== 'waiting' && (
        <div key={current.id} className={`region-name${current.phase === 'in' ? ' region-name-in' : ''}`}>
          {current.phase === 'in' && <RegionBurst />}
          <span className="region-name-text">{current.name}</span>
        </div>
      )}
    </>
  );
}
