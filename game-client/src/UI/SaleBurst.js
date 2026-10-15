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

// The repeatable-card cycle (Bank offers, traders' offers): the card pops away with the burst, the
// slot stays empty for a beat, and the same card slides back in from the left, landing at
// `returnMs` (the Bank's spam-guard cooldown). Classes in SaleBurst.css (.card-fx-pop, .card-fx-slidein).
export const CARD_CYCLE = { popMs: 300, slideMs: 440, returnMs: 1500 };
/**
 * Run the cycle on a fx state setter: setFx receives { slot, id, phase: 'pop' | 'slidein' } and
 * null at the end. Render `card-fx-${fx.phase}` on the card's wrapper and <SaleBurst key={fx.id} />
 * beside it while fx.slot matches. Returns a revert (a failed server call brings the card back now).
 */
export function runCardReturn(setFx, slot, { returnMs = CARD_CYCLE.returnMs } = {}) {
    const id = Date.now() + Math.random();
    const { popMs, slideMs } = CARD_CYCLE;
    setFx({ slot, id, phase: 'pop' });
    const t1 = setTimeout(() => setFx((fx) => (fx?.id === id ? { ...fx, phase: 'slidein' } : fx)), Math.max(popMs, returnMs - slideMs));
    const t2 = setTimeout(() => setFx((fx) => (fx?.id === id ? null : fx)), Math.max(popMs + slideMs, returnMs) + 20);
    return () => { clearTimeout(t1); clearTimeout(t2); setFx((fx) => (fx?.id === id ? null : fx)); };
}
