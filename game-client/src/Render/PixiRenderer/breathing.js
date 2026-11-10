/**
 * breathing - the idle "breath" of a standing figure (docs/avatar-plan.md v2 §5, owner 2026-11-10).
 *
 * One sprite per character today, so the breath is the classic single-sprite idle: a small
 * vertical stretch PIVOTED AT THE FEET (squash and stretch about the ground contact). The
 * displacement is zero at the feet and grows linearly to the top of the head, which is what a
 * rig's breath deformer does to a still drawing (Live2D's ParamBreath cycles 0..1 and lifts the
 * chest and shoulders; Character Animator's Breathe scales the chest), without a mesh. Width is
 * not scaled: scaling x about the centre would slide each foot sideways.
 *
 * Only standing figures breathe: a walking one has its bob; a still one would otherwise be a
 * cut-out. Everything here is pure (no Pixi, no DOM) so the board renderers and tests share it;
 * the Edit Avatar preview runs the same curve as CSS keyframes (Avatar/AvatarModal.css).
 */
export const BREATH = {
  periodMs: 3600,     // one breath: about 17 a minute, a calm resting rate
  amplitude: 0.016,   // the head rises this fraction of the figure's height at full inhale
  inhale: 0.4,        // share of the cycle spent breathing in
  exhale: 0.45,       // ... breathing out; the rest is the pause before the next breath
  periodJitter: 0.24, // each figure's period varies by up to +-12 % so a crowd never breathes in step
};

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

/** The vertical scale factor at time t (1 at rest, 1 + amplitude at full inhale). */
export const breathScaleY = (tMs, seed = 0) => 1 + BREATH.amplitude * breathLevel(tMs, seed);

/** Players who ask the system for less motion get still figures. */
export const breathingAllowed = () => !(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
