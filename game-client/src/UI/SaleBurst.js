import React from 'react';
import './SaleBurst.css';

// The sale's burst: a flash ring and a shower of gold sparkles flying out from a card (SaleBurst.css).
// Drop <SaleBurst key={id} /> into a position: relative card when it is sold or completed
// (Kent sales, Train orders); a new key replays it.
// Directions are spread round the circle with a little jitter; CSS animates them out and away.
const SPARK_GLYPHS = ['✦', '✧', '✨', '•', '✦', '⭐'];
export default function SaleBurst() {
    const sparks = React.useMemo(() => Array.from({ length: 22 }, (_, i) => {
        const angle = (i / 22) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        const dist = 55 + Math.random() * 70;
        return {
            glyph: SPARK_GLYPHS[i % SPARK_GLYPHS.length],
            dx: `${Math.round(Math.cos(angle) * dist)}px`, dy: `${Math.round(Math.sin(angle) * dist * 0.75)}px`,
            rot: `${Math.round((Math.random() - 0.5) * 540)}deg`, size: `${10 + Math.round(Math.random() * 12)}px`,
            delay: `${Math.round(Math.random() * 60)}ms`,
        };
    }), []);
    return (
        <div className="sale-burst" aria-hidden="true">
            <div className="sale-burst-ring" />
            {sparks.map((sp, i) => (
                <span key={i} className="sale-spark" style={{ '--dx': sp.dx, '--dy': sp.dy, '--rot': sp.rot, fontSize: sp.size, animationDelay: sp.delay }}>{sp.glyph}</span>
            ))}
        </div>
    );
}
