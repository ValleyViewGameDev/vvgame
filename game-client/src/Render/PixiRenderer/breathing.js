/**
 * breathing - the idle "breath" of a standing figure (docs/avatar-plan.md v2 §5, owner 2026-11-10).
 *
 * Two things happen together on each breath, as a rig's breath deformer does (Live2D's ParamBreath
 * cycles 0..1 and lifts the chest and shoulders; Character Animator's Breathe scales the chest):
 *   - the figure RISES: a vertical stretch pivoted at the feet, zero at the ground and growing
 *     linearly to the top of the head;
 *   - the CHEST EXPANDS: the figure widens about its centre line by a bell-shaped weight that
 *     peaks at the chest and is zero at the feet and the head (breathBell).
 * The feet never move in either direction. The board bends a strip of rows in the sprite's own
 * vertices (BreathSprite.js); the Edit Avatar stage draws the same strips on a canvas. Only
 * standing figures breathe: a walking one has its bob. Everything here is pure (no Pixi, no DOM).
 */
export const BREATH = {
  periodMs: 3600,     // one breath: about 17 a minute, a calm resting rate
  amplitude: 0.012,   // the head rises this fraction of the figure's height at full inhale (owner: 75 % of the first 0.016)
  chest: 0.055,       // the chest widens by this fraction of its width at full inhale (owner: "go bigger", from 0.03)
  chestAt: 0.44,      // where the chest is, as a fraction of the figure square from its top (collar ~0.33, belt ~0.55)
  chestSpread: 0.12,  // the bell's width (same units): shoulders get about half, the head and the knees nothing
  inhale: 0.4,        // share of the cycle spent breathing in
  exhale: 0.45,       // ... breathing out; the rest is the pause before the next breath
  periodJitter: 0.24, // each figure's period varies by up to +-12 % so a crowd never breathes in step
};

/** The chest weight at height v (0 = the top of the figure square, 1 = its bottom, the feet): 1 at the chest, 0 at the feet and the head. */
export const breathBell = (v) => { const d = (v - BREATH.chestAt) / BREATH.chestSpread; return Math.exp(-d * d); };

/**
 * Where a point of the figure goes at breath level L (0..1). x and y are fractions of the figure
 * square (x from its centre line, -0.5..0.5; y from its top, 0..1). Returns [x, y] in the same units.
 */
export const breathPoint = (x, y, L) => [x * (1 + BREATH.chest * L * breathBell(y)), 1 - (1 - y) * (1 + BREATH.amplitude * L)];

const smooth = (x) => x * x * (3 - 2 * x);

/** A stable number for an id (an NPC id, a player id): the figure's own phase and tempo. */
export function breathSeed(id) {
  const s = String(id ?? '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 100000;
}

/** How far into the breath a figure is at time t: 0 (rest) .. 1 (full inhale). */
export function breathLevel(tMs, seed = 0) {
  const period = BREATH.periodMs * (1 + ((seed % 97) / 97 - 0.5) * BREATH.periodJitter);
  const phase = ((tMs + ((seed % 1000) / 1000) * period) % period) / period;
  if (phase < BREATH.inhale) return smooth(phase / BREATH.inhale);
  if (phase < BREATH.inhale + BREATH.exhale) return 1 - smooth((phase - BREATH.inhale) / BREATH.exhale);
  return 0;
}

/** Players who ask the system for less motion get still figures. */
export const breathingAllowed = () => !(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
