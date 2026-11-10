/**
 * breathing - the idle "breath" of a standing figure (docs/avatar-plan.md v2 §5, owner 2026-11-10).
 *
 * A breath does two things at once, as a rig's breath deformer does (Live2D's ParamBreath cycles
 * 0..1 and lifts the chest and shoulders; Character Animator's Breathe scales the chest):
 *   - the BODY rises: a vertical stretch pivoted at the feet, from the ground up to the top of the
 *     shoulders;
 *   - the CHEST expands: the torso widens about the centre line by a bump that is zero at the top
 *     of the shoulders, peaks at the chest and is zero again at the hips.
 * The HEAD is rigid (owner: "the head doesn't change size at all"): everything above `top` (where
 * the head and neck end, per figure: `breathTop` on the resource row or the player icon) is only
 * carried up by the rise of the shoulders under it, never stretched or widened. The feet never
 * move. The board bends a strip of rows in the sprite's own vertices (BreathSprite.js); the Edit
 * Avatar stage draws the same strips on a canvas. Only standing figures breathe: a walking one
 * has its bob. Everything here is pure (no Pixi, no DOM).
 */
export const BREATH = {
  periodMs: 3600,     // one breath: about 17 a minute, a calm resting rate
  amplitude: 0.012,   // the body stretches by this fraction of its height at full inhale (owner: 75 % of the first 0.016; not raised since)
  chest: 0.09,        // the chest widens by this fraction of its width at full inhale (0.03, then 0.055, then "more noticeable")
  chestSpan: 0.3,     // the torso the expansion covers, as a fraction of the figure square below `top` (shoulders to hips)
  chestSkew: 0.72,    // below 1 moves the peak up from the middle of that span toward the chest (0.72: about 0.38 of the way down)
  top: 0.33,          // the default `breathTop`: where the head and neck end, from the top of the figure square
  inhale: 0.4,        // share of the cycle spent breathing in
  exhale: 0.45,       // ... breathing out; the rest is the pause before the next breath
  periodJitter: 0.24, // each figure's period varies by up to +-12 % so a crowd never breathes in step
};

/**
 * Where a point of the figure goes at breath level L (0..1). `x` is its distance from the figure's
 * centre line (any unit), `v` its height as a fraction of the figure square from the top (0) to
 * the feet (1), `top` the figure's breathTop. Returns [x, v] in the same units.
 */
export function breathDeform(x, v, L, top = BREATH.top) {
  const lift = BREATH.amplitude * L;
  if (v <= top) return [x, v - (1 - top) * lift]; // the head: carried by the shoulders' rise, unchanged in size
  const u = (v - top) / BREATH.chestSpan;
  const bump = u >= 1 ? 0 : Math.sin(Math.PI * Math.pow(u, BREATH.chestSkew)) ** 2;
  return [x * (1 + BREATH.chest * L * bump), 1 - (1 - v) * (1 + lift)];
}

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

/**
 * Blinking (owner 2026-11-10). A figure's eyes close for a moment every few seconds: each figure
 * has its own cycle length (BLINK.everyMs, from its seed) and, inside every cycle, the blink lands
 * at a different moment (a hash of the cycle number), so nobody blinks like a metronome and two
 * figures never stay in step. The closed frame is the figure's own art with the eyes repainted
 * in its own skin (tools/art/parts.js blink), so a lid always matches the face.
 */
export const BLINK = { everyMs: [2800, 6200], closedMs: 130 };
const hashFrac = (n) => { let h = (n ^ 0x9e3779b9) >>> 0; h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
/** True while the figure with this seed has its eyes closed at time t. */
export function isBlinking(tMs, seed = 0) {
  const [lo, hi] = BLINK.everyMs;
  const period = lo + ((seed % 89) / 89) * (hi - lo);
  const t = tMs + ((seed % 977) / 977) * period;
  const cycle = Math.floor(t / period), local = t - cycle * period;
  const start = hashFrac(seed * 31 + cycle) * (period - BLINK.closedMs - 200);
  return local >= start && local < start + BLINK.closedMs;
}
