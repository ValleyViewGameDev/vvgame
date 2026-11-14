/**
 * Arm clips (docs/arm-rig-plan.md): keyframed joint angles for an ArmRig, in radians.
 *
 * The AVATAR's clips (slash, thrust, thrust2, chop2; a name ending in 2 is two-handed) are ABSOLUTE: `s` is where the upper arm points and
 * `s + e` where the forearm points, clockwise from straight down (ArmRig.poseOf, an arm that `holds`),
 * so every outfit swings alike. An enemy's clip turns its joints from the way its arm is drawn:
 *
 *   shoulder (s): + raises the arm up and OUT to its own side (0 hangs as drawn; PI/2 level).
 *   elbow (e):    + bends the forearm on round the same way the shoulder raises (with the arm up,
 *                 the hand curls over toward the head); - bends it back (a hanging arm's hand comes in
 *                 across the body).
 *
 * `lead` is the arm on the target's side (the attacking arm), `off` the other one (optional).
 *   wrist (w):    only for an arm whose rig has a `wrist` (the Ogre's club arm): + turns the hand and what
 *                 it holds the same way again (the weapon cocked back at the top of a swing), - the
 *                 other way (it snaps on through at the bottom). Optional on a key (0).
 * Each key is { t (ms), s, e, ease } where `ease` shapes the move INTO that key: 'inOut' (default),
 * 'in' (starts slow, arrives fast: a strike), 'out' (leaves fast, settles). `hit` is when the blow
 * lands (ms from the start): the attack's damage waits for it. An optional `lean` track ({ t, l, ease })
 * leans the whole body toward the target (BreathSprite.lean: the top shifts l of the square, the feet stay).
 * An optional `body` track ({ t, d, ease }) MOVES the whole figure along the line to its target: d tiles
 * toward it (+) or away from it (-). It is the body's half of a weapon's attack, written beside the arm's
 * half so the two stay in step (the player's avatar: CombatFX.playerAttack; owner 2026-11-13).
 */
export const ARM_CLIPS = {
  // the Zombie: the arm rises high with the claw cocked in over its head, then rakes down and
  // across the body in one sweep, the forearm opening on the way down and curling at the end
  claw: {
    hit: 330,
    lead: [
      { t: 0, s: 0, e: 0 },
      { t: 240, s: 2.3, e: 0.9, ease: 'out' },
      { t: 300, s: 2.2, e: 0.8 },
      { t: 400, s: 0.5, e: -0.1, ease: 'in' },
      { t: 470, s: -0.25, e: -0.45 },
      { t: 720, s: 0, e: 0 },
    ],
    off: [
      { t: 0, s: 0, e: 0 },
      { t: 260, s: 0.25, e: -0.2 },
      { t: 720, s: 0, e: 0 },
    ],
  },
  // the Bear: a heavy forepaw swipe, as an arm really moves (owner 2026-11-12). Up: the shoulder
  // raises the arm while the elbow bends the OTHER way. Down: the shoulder alone swings it down and on
  // in across the body, carrying that bent elbow unchanged (the blow lands on the way down). Last
  // beat: the arm swings back out to hang and the elbow straightens
  swipe: {
    hit: 400,
    lead: [
      { t: 0, s: 0, e: 0 },
      { t: 260, s: 1.8, e: -0.75, ease: 'out' },
      { t: 310, s: 1.75, e: -0.75 },
      { t: 500, s: -0.45, e: -0.75, ease: 'in' },
      { t: 560, s: -0.5, e: -0.7 },
      { t: 780, s: 0, e: 0 },
    ],
    // the whole bear leans toward the player as it swipes and rights itself as the swipe ends: the
    // top of the drawing shifts this far (of its square) toward the target, the feet planted. Played
    // only when the player is in another column (ArmRig.playAttack's leanDir)
    lean: [
      { t: 0, l: 0 },
      { t: 260, l: -0.03, ease: 'out' },
      { t: 430, l: 0.14, ease: 'in' },
      { t: 520, l: 0.12 },
      { t: 780, l: 0 },
    ],
    // the other arm stays hanging at the bear's side: it leans with the body (ArmRig shears it), and
    // any swing of its own opened a gap at the flank (owner 2026-11-12)
  },
  // the Ogre: an overhead club smash with the club arm (rig `attackArm`, three joints). Up: the arm
  // rises out and over with the elbow bent and the wrist cocked, the club laid back over the head.
  // Down: the shoulder drives the arm down toward the target while the elbow opens and the wrist snaps
  // through, so the club's head arrives last and lands beside him. Then it is drawn back to hang
  smash: {
    hit: 480,
    lead: [
      { t: 0, s: 0, e: 0, w: 0 },
      { t: 320, s: 2.5, e: 0.75, w: 0.7, ease: 'out' },
      { t: 380, s: 2.55, e: 0.8, w: 0.75 },
      { t: 490, s: 0.85, e: 0.05, w: -0.3, ease: 'in' },
      { t: 570, s: 0.75, e: 0, w: -0.35 },
      { t: 920, s: 0, e: 0, w: 0 },
    ],
    lean: [
      { t: 0, l: 0 },
      { t: 320, l: -0.03, ease: 'out' },
      { t: 490, l: 0.09, ease: 'in' },
      { t: 590, l: 0.08 },
      { t: 920, l: 0 },
    ],
  },
  // the avatar's sword cut (docs/equipment-plan.md §3.4; rigs `avatar:*`, heldWeapon.js). Every key is
  // a WHOLE pose and the clip starts and ends in the guard (heldWeapon.GUARD). The sword is rigid at a
  // right angle to the forearm, so the forearm alone aims it. Raise: the elbow folds and the shoulder
  // turns the arm part of the way forward, the blade rising and tipping a little back. Cut: the elbow
  // straightens as the arm comes down in front, the blade coming over to level. Then back to the guard.
  // The body goes WITH the sword: a small step back as the blade is raised, forward into the cut, then home
  slash: {
    hit: 235,
    body: [
      { t: 0, d: 0 },
      { t: 155, d: -0.08, ease: 'out' },
      { t: 230, d: 0.3, ease: 'in' },
      { t: 300, d: 0.27 },
      { t: 520, d: 0 },
    ],
    lead: [
      { t: 0, s: 0.28, e: -1.3 },
      { t: 95, s: -0.27, e: -1.4, ease: 'out' },
      { t: 155, s: -0.62, e: -1.4 },
      { t: 220, s: -0.72, e: -0.25, ease: 'in' },
      { t: 255, s: -0.17, e: -0.15 },
      { t: 290, s: 0.08, e: -0.1, ease: 'out' },
      { t: 350, s: 0.08, e: -0.1 },
      { t: 520, s: 0.28, e: -1.3 },
    ],
  },
  // the avatar's THRUST (daggers, spears, polearms: the weapon lies along the forearm, heldWeapon.js).
  // From the guard (the point forward at the hip) the elbow is drawn back, then the whole arm drives
  // straight out at the target, the forearm staying level so the point travels in a line. The body
  // goes with it: a short step back as the arm is drawn, a long one forward behind the point, then home
  thrust: {
    hit: 215,
    body: [
      { t: 0, d: 0 },
      { t: 140, d: -0.08, ease: 'out' },
      { t: 215, d: 0.34, ease: 'in' },
      { t: 290, d: 0.3 },
      { t: 480, d: 0 },
    ],
    lead: [
      { t: 0, s: 0.43, e: -2.05 },
      { t: 110, s: 0.98, e: -2.55, ease: 'out' },
      { t: 145, s: 1.03, e: -2.6 },
      { t: 210, s: -1.17, e: -0.45, ease: 'in' },
      { t: 280, s: -1.12, e: -0.5 },
      { t: 480, s: 0.43, e: -2.05 },
    ],
  },
  // the avatar's TWO-HANDED THRUST (polearms). The rear hand (the weapon arm) does what the thrust does,
  // a little shorter; the front hand is not keyed: it is solved onto the shaft each frame
  // (ArmRig.secondPose) and `second` slides its hold along the shaft, tiles from the rear hand. As the
  // shaft is drawn back it runs back through the front hand (the hold moves toward the point), and on
  // the thrust it shoots forward through it (the hold closes up), the front hand itself moving little.
  // These are the holds ASKED for: the front arm is never stretched past its reach (ArmRig.secondPose),
  // so on a short-armed figure the shaft slides further through the hand instead
  thrust2: {
    hit: 215,
    body: [
      { t: 0, d: 0 },
      { t: 140, d: -0.08, ease: 'out' },
      { t: 215, d: 0.34, ease: 'in' },
      { t: 290, d: 0.3 },
      { t: 480, d: 0 },
    ],
    lead: [
      { t: 0, s: 0.43, e: -2.05 },
      { t: 110, s: 0.93, e: -2.5, ease: 'out' },
      { t: 145, s: 0.98, e: -2.55 },
      { t: 210, s: -0.77, e: -0.8, ease: 'in' },
      { t: 280, s: -0.72, e: -0.85 },
      { t: 480, s: 0.43, e: -2.05 },
    ],
    // the shaft itself runs forward through BOTH hands as the thrust lands and back again as the guard
    // returns (tiles toward the point): more reach for the point, the arms and hands where they were
    slide: [
      { t: 0, d: 0 },
      { t: 150, d: 0 },
      { t: 210, d: 0.2, ease: 'in' },
      { t: 280, d: 0.18 },
      { t: 480, d: 0 },
    ],
    second: [
      { t: 0, d: 0.58 },
      { t: 145, d: 0.68, ease: 'out' },
      { t: 210, d: 0.38, ease: 'in' },
      { t: 280, d: 0.4 },
      { t: 480, d: 0.58 },
    ],
  },
  // the avatar's TWO-HANDED CHOP (axes and hammers share it; the head stands at a right angle to the
  // forearm, as the sword does). The rear hand (the weapon arm) holds the foot of the haft and is keyed
  // here; the front hand is solved onto the haft each frame (ArmRig.secondPose), `second` tiles up it.
  // From the guard, the weapon carried low across the body with its head forward and up, it is HOISTED
  // upright in front of the far shoulder (never back across the face), hangs a moment, and is brought
  // down forward to level at the belt. Slower and heavier than the slash: the body rocks back under the lift and steps in hard
  chop2: {
    hit: 385,
    body: [
      { t: 0, d: 0 },
      { t: 260, d: -0.12, ease: 'out' },
      { t: 385, d: 0.34, ease: 'in' },
      { t: 470, d: 0.3 },
      { t: 800, d: 0 },
    ],
    lead: [
      { t: 0, s: 0.1, e: -0.47 },
      { t: 170, s: -0.3, e: -0.8, ease: 'out' },
      { t: 260, s: -0.7, e: -0.87 },
      { t: 300, s: -0.72, e: -0.88 },
      { t: 385, s: -0.25, e: 0.13, ease: 'in' },
      { t: 430, s: -0.22, e: 0.16, ease: 'out' },
      { t: 560, s: -0.22, e: 0.16 },
      { t: 800, s: 0.1, e: -0.47 },
    ],
    // the front hand's hold: it slides DOWN the haft as the weapon is hoisted, so that at the top it sits
    // just above the rear hand and close in front of its own shoulder. Held high on an upright haft the
    // far elbow had to wing out sideways; held low it folds down against the body (owner 2026-11-13)
    second: [
      { t: 0, d: 0.5 },
      { t: 170, d: 0.34, ease: 'out' },
      { t: 260, d: 0.22 },
      { t: 300, d: 0.22 },
      { t: 385, d: 0.3, ease: 'in' },
      { t: 560, d: 0.3 },
      { t: 800, d: 0.5 },
    ],
  },
  // the Coyote: no arm, the whole body lurches at the target (feet planted) and springs back; in the
  // same column it lurches straight down or up at it (`leanVertical`)
  lurch: {
    hit: 300,
    leanVertical: true,
    lean: [
      { t: 0, l: 0 },
      { t: 200, l: -0.04, ease: 'out' },
      { t: 300, l: 0.13, ease: 'in' },
      { t: 380, l: 0.11 },
      { t: 600, l: 0 },
    ],
  },
};

const EASE = {
  inOut: (p) => p * p * (3 - 2 * p),
  in: (p) => p * p * p,
  out: (p) => 1 - (1 - p) ** 3,
};

/** The pose of one arm's key track at time t (ms): { s, e, w }. */
export function poseAt(keys, t) {
  if (!keys || !keys.length) return { s: 0, e: 0, w: 0 };
  if (t <= keys[0].t) return { s: keys[0].s, e: keys[0].e, w: keys[0].w || 0 };
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i];
    if (t <= b.t) {
      const a = keys[i - 1];
      const p = (EASE[b.ease] || EASE.inOut)((t - a.t) / Math.max(1, b.t - a.t));
      return { s: a.s + (b.s - a.s) * p, e: a.e + (b.e - a.e) * p, w: (a.w || 0) + ((b.w || 0) - (a.w || 0)) * p };
    }
  }
  const z = keys[keys.length - 1];
  return { s: z.s, e: z.e, w: z.w || 0 };
}

/** A single-value key track (the lean's `l`) at time t (ms). */
export function valueAt(keys, t, field = 'l') {
  if (!keys || !keys.length) return 0;
  if (t <= keys[0].t) return keys[0][field];
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i];
    if (t <= b.t) { const a = keys[i - 1], p = (EASE[b.ease] || EASE.inOut)((t - a.t) / Math.max(1, b.t - a.t)); return a[field] + (b[field] - a[field]) * p; }
  }
  return keys[keys.length - 1][field];
}

/** How long a clip runs (ms): its last key. */
export const clipLength = (clip) => Math.max(...['lead', 'off', 'lean', 'body', 'second', 'slide'].map((k) => (clip[k]?.length ? clip[k][clip[k].length - 1].t : 0)));
