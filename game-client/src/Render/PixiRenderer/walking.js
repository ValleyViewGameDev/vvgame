/**
 * walking - the legs of a figure that walks (docs/avatar-plan.md, "Walking", owner 2026-11-10:
 * "content agnostic and all procedural").
 *
 * A figure is ONE drawing, so its walk is a deformation of that drawing, as its breath is
 * (breathing.js). Nothing is authored per figure: where its legs are is read from the drawing's
 * own silhouette, once per texture.
 *
 *   findLegs    reads the silhouette from the feet up. Where a gap runs up between two feet
 *               (two legs, or two shoes under a hem), the figure HAS LEGS: from the top of that
 *               gap down, the drawing is cut along the gap into two halves that move on their
 *               own. Where there is no gap (a gown to the ground, a tail), it has a HEM: the
 *               bottom of the drawing sways in one piece.
 *               A leg swings from the HIP, not from where the gap between the legs ends: the
 *               gap's top is the crotch (or a tunic's hem), the lowest point of the pelvis, and
 *               a walk hinged there moves only the shins and feet (owner: "hinged too low"). So
 *               a figure with real legs gets a `hinge` above the gap, and between the two the
 *               drawing is still one piece: its sides go with their own leg and its middle with
 *               the mean, which reads as the hips turning and tipping. Shoes under a robe keep
 *               their hinge at the hem (they only shuffle), and so does a hem.
 *   walkLegs    where each half goes at a moment of the walk cycle: a foot LIFTS (its leg
 *               shortens from the hinge, as a knee bends toward the viewer) and SWINGS forward
 *               while it is in the air, then stands and slides back while the other one swings;
 *               a hem sways side to side and tips up on the side that steps. The body above bobs
 *               a little, once per footfall.
 *
 * BreathSprite bends its vertices by these numbers; the renderers only say `sprite.walking`.
 * Everything here but `legsOf` is pure (no Pixi, no DOM).
 */
export const WALK = {
  cycleMs: 420,     // one full cycle, both feet (the player moves fast: about five footfalls a second)
  npcCycleMs: 760,  // an NPC strolls
  lift: 0.07,       // a foot rises by this fraction of the figure square's height ... (0.035, 0.045, 0.065, then the owner's 7 %)
  liftOfLeg: 0.55,  // ... but never by more than this fraction of the leg that shows (shoes under a hem only shuffle)
  stride: 0.05,     // a foot swings this fraction of the square's width forward and back of where it is drawn ... (0.03, 0.035, 0.07 "too much", then the owner's 5 %)
  strideOfLeg: 1.2, // ... but never by more than this multiple of the leg that shows (shoes stay under their hem)
  hipRise: 0.3,     // the hinge sits this share of the visible leg ABOVE the top of the gap between the legs: the hip, not the crotch
  hipFrom: 0.06,    // a gap shorter than this share of the square is shoes under a robe: hinged at the hem, no rise;
  hipFull: 0.12,    // ... at this length and above it is a pair of legs, hinged at the hip (in between, part of the rise)
  bob: 0.01,        // the body rises by this fraction of the square's height at each footfall's middle
  hemSpan: 0.13,    // a figure with no legs: this much of the square above its lowest point sways
  hemSway: 0.018,   // ... this far side to side, as a fraction of the square's width
  hemTip: 0.5,      // ... and tips up on the stepping side by this share of `lift`
  attackMs: 90,     // the legs reach full swing this long after the walk starts
  releaseMs: 140,   // and settle to the drawing this long after it stops
};

const GRID = 192;        // the silhouette is read on a grid this size (the figure's whole square)
const OPAQUE = 96;       // alpha at or above this is the figure
const MAX_LEG = 0.45;    // legs are never taller than this share of the figure
const MIN_LEG = 0.02;    // a gap shorter than this share of the square is not a pair of legs

/**
 * The legs of a silhouette. `alpha` is n x n (row-major), the figure's whole square.
 * Returns { split, top, hinge, feet, gapU } in fractions of the square: `feet` the lowest row of
 * the figure, `top` where the two legs part (or the hem begins), `hinge` where the walk begins to
 * move the drawing (the hip: at or above `top`), `gapU` the column the legs part at, `split`
 * whether there are two legs to move apart. null when the square is empty.
 */
export function findLegs(alpha, n = GRID) {
  const runsOf = (y) => {
    const runs = []; let s = -1;
    for (let x = 0; x <= n; x++) {
      const on = x < n && alpha[y * n + x] >= OPAQUE;
      if (on && s < 0) s = x;
      else if (!on && s >= 0) { if (x - s >= 2) runs.push([s, x - 1]); s = -1; } // a lone pixel is a speck, not a foot
    }
    return runs;
  };
  let feetY = -1, headY = -1;
  for (let y = n - 1; y >= 0 && feetY < 0; y--) if (runsOf(y).length) feetY = y;
  if (feetY < 0) return null;
  for (let y = 0; y < n && headY < 0; y++) if (runsOf(y).length) headY = y;
  const H = feetY - headY + 1;
  // the middle of what stands on the ground: the opaque pixels of the lowest tenth of the figure
  let sx = 0, sn = 0;
  for (let y = Math.max(0, feetY - Math.round(H * 0.1)); y <= feetY; y++) for (const [a, b] of runsOf(y)) { sx += (a + b) / 2 * (b - a + 1); sn += b - a + 1; }
  const groundX = sn ? sx / sn : n / 2;
  const hemTop = Math.max(0, (feetY + 1) / n - WALK.hemSpan);
  const hem = { split: false, top: hemTop, hinge: hemTop, feet: (feetY + 1) / n, gapU: (groundX + 0.5) / n };

  // climb from the feet while a gap between two runs continues upward. The lowest rows can be the
  // toes of one foot alone, or hold a nick between two toes: a climb that dies at once is dropped
  // and the next one starts a little higher (the bare-legged base bodies read as hems until this).
  const climb = (fromY) => {
    const rows = []; let ref = groundX, misses = 0, started = false;
    for (let y = fromY; y >= Math.max(0, stopY); y--) {
      const runs = runsOf(y); let best = null;
      for (let i = 0; i + 1 < runs.length; i++) {
        const a = runs[i][1] + 1, b = runs[i + 1][0] - 1, c = (a + b) / 2;
        if (b - a + 1 < 2) continue; // a one-pixel nick is not the space between two legs
        if (Math.abs(c - ref) <= n * (started ? 0.06 : 0.16) && (!best || Math.abs(c - ref) < Math.abs(best.c - ref))) best = { a, b, c };
      }
      if (best) { rows.push({ y, ...best }); ref = best.c; started = true; misses = 0; }
      else if (!started) { if (feetY - y > H * 0.06) break; }  // one foot can reach lower than the other: look a little higher for the gap
      else if (++misses > 1) break;                            // the gap has closed: the crotch, or the hem
    }
    return rows;
  };
  const stopY = feetY - Math.round(H * MAX_LEG);
  let rows = [];
  for (let from = feetY; from >= feetY - Math.round(H * 0.06) && rows.length < Math.max(3, n * MIN_LEG); ) {
    rows = climb(from);
    from = (rows.length ? rows[0].y : from) - 1;
  }
  if (rows.length < Math.max(3, n * MIN_LEG)) return hem;
  // one straight cut: the column most of the gap rows hold, then the legs end where the gap first leaves it
  const centres = rows.map((r) => r.c).sort((p, q) => p - q); const cut = centres[centres.length >> 1];
  let topY = feetY + 1, held = 0;
  for (const r of rows) { if (cut < r.a - 0.5 || cut > r.b + 0.5) break; topY = r.y; held++; }
  if (held < Math.max(3, n * MIN_LEG)) return hem;
  const top = topY / n, feet = (feetY + 1) / n, span = feet - top;
  // the hip: above the gap by a share of the leg that shows, for real legs; shoes under a robe stay hinged at the hem
  const legged = Math.min(1, Math.max(0, (span - WALK.hipFrom) / (WALK.hipFull - WALK.hipFrom)));
  return { split: true, top, hinge: top - WALK.hipRise * span * legged, feet, gapU: (cut + 0.5) / n };
}

/** The legs of a texture (cached per texture; null until its image can be read, or when it cannot). */
const cache = new WeakMap();
let scratch = null;
export function legsOf(texture) {
  if (!texture) return null;
  if (cache.has(texture)) return cache.get(texture);
  const base = texture.baseTexture; const src = base?.resource?.source;
  const fr = texture.frame, orig = texture.orig, trim = texture.trim;
  if (!base?.valid || !src || !fr || !orig || orig.width < 8 || orig.height < 8) return null; // not loaded yet (or the empty texture): ask again later
  let legs = null;
  try {
    if (!texture.rotate && typeof document !== 'undefined') {
      if (!scratch) { scratch = document.createElement('canvas'); scratch.width = GRID; scratch.height = GRID; }
      const ctx = scratch.getContext('2d', { willReadFrequently: true });
      ctx.clearRect(0, 0, GRID, GRID);
      const res = base.resolution || 1, kx = GRID / orig.width, ky = GRID / orig.height;
      // the frame is the trimmed art; it is drawn where it sits inside the figure's whole square
      ctx.drawImage(src, fr.x * res, fr.y * res, fr.width * res, fr.height * res,
        (trim ? trim.x : 0) * kx, (trim ? trim.y : 0) * ky, (trim ? trim.width : orig.width) * kx, (trim ? trim.height : orig.height) * ky);
      const rgba = ctx.getImageData(0, 0, GRID, GRID).data; const alpha = new Uint8Array(GRID * GRID);
      for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
      legs = findLegs(alpha, GRID);
    }
  } catch (e) { legs = null; } // an image the canvas may not read: the figure sways as a hem
  cache.set(texture, legs);
  return legs;
}

/** What a figure with no readable legs does: the default hem. */
export const DEFAULT_LEGS = { split: false, top: 1 - WALK.hemSpan, hinge: 1 - WALK.hemSpan, feet: 1, gapU: 0.5 };

/**
 * The walk at phase `phase` (in cycles; the whole number is the cycle count) and strength `amp`
 * (0..1, the walk fading in and out). Returns, as fractions of the figure square:
 *   bob       how far the body is up
 *   lift[i]   how far foot i is up (0: the half on the drawing's left, 1: the right)
 *   swing[i]  how far foot i is forward (+) or back (-) of where it is drawn; forward is the way
 *             the drawing faces (its right), which the facing flip mirrors with everything else
 *   sway      (a hem) how far the bottom is to the side
 */
export function walkLegs(phase, amp, legs) {
  const th = 2 * Math.PI * phase;
  const span = Math.max(0.001, legs.feet - legs.top); // the leg that shows
  const up = Math.min(WALK.lift, WALK.liftOfLeg * span) * amp;
  const reach = Math.min(WALK.stride, WALK.strideOfLeg * span) * amp;
  const foot = (t) => ({ lift: Math.max(0, Math.sin(t)) * up, swing: -Math.cos(t) * reach });
  const a = foot(th), b = foot(th + Math.PI);
  return {
    bob: Math.abs(Math.sin(th)) * WALK.bob * amp,
    lift: legs.split ? [a.lift, b.lift] : [a.lift * WALK.hemTip, b.lift * WALK.hemTip],
    swing: legs.split ? [a.swing, b.swing] : [0, 0],
    sway: legs.split ? 0 : Math.sin(th) * WALK.hemSway * amp,
  };
}
