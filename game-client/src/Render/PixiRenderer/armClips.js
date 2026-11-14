/**
 * Arm clips (docs/arm-rig-plan.md): keyframed joint angles for an ArmRig, in radians.
 *
 * The AVATAR's clips (slash, slash2, thrust, thrust2, chop2; a name ending in 2 is two-handed) are ABSOLUTE: `s` is where the upper arm points and
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
  // the avatar's TWO-HANDED SLASH (great swords). It is keyed by the FRONT ARM (`weapon`,
  // ArmRig.weaponPose), which does as little as an arm can: its upper arm all but still (`u`, a small
  // swing toward the target), its forearm doing the work (`f`: where it points from hanging straight
  // down, - in across the body), and `a` the way the blade points (0 straight up, + toward the target).
  // The rear hand is a grip's width back along the blade and the near arm is solved to hold it there. So
  // the far arm never thrashes or winds itself over, on any body (owner 2026-11-13). The blade is free
  // in the hands here, not held at a right angle to the forearm. From the guard, hands at the belly and
  // the blade leaning forward, the forearm lifts the hilt to the collarbone, the blade upright, and
  // sweeps it down and out to level at the belt, the upper arm following a little. `lead` is only the
  // one-armed fallback for a figure whose rig has no far arm
  slash2: {
    hit: 295,
    body: [
      { t: 0, d: 0 },
      { t: 195, d: -0.1, ease: 'out' },
      { t: 295, d: 0.46, ease: 'in' },
      { t: 370, d: 0.42 },
      { t: 640, d: 0 },
    ],
    weapon: [
      { t: 0, f: -1.44, u: 0, a: 0.7 },
      { t: 120, f: -1.95, u: 0.04, a: 0.3, ease: 'out' },
      { t: 195, f: -2.45, u: 0.08, a: -0.1 },
      { t: 225, f: -2.48, u: 0.08, a: -0.12 },
      { t: 295, f: -0.75, u: 0.25, a: 1.5, ease: 'in' },
      { t: 335, f: -0.7, u: 0.25, a: 1.55, ease: 'out' },
      { t: 430, f: -0.7, u: 0.25, a: 1.55 },
      { t: 640, f: -1.44, u: 0, a: 0.7 },
    ],
    lead: [
      { t: 0, s: 0.15, e: -1.02 },
      { t: 120, s: 0.08, e: -1.28, ease: 'out' },
      { t: 195, s: 0, e: -1.67 },
      { t: 225, s: 0, e: -1.7 },
      { t: 265, s: 0.1, e: -1.0, ease: 'in' },
      { t: 295, s: -0.55, e: 0.28 },
      { t: 335, s: -0.5, e: 0.3, ease: 'out' },
      { t: 430, s: -0.5, e: 0.3 },
      { t: 640, s: 0.15, e: -1.02 },
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
  // the avatar's TWO-HANDED THRUST (polearms). Keyed by the FRONT ARM, as slash2 and chop2 are (`weapon`,
  // ArmRig.weaponPose): the far arm hardly moves, its forearm lying out along the shaft (`f`) and its
  // upper arm giving a little on the thrust (`u`); `a` is the way the shaft points. The rear hand is
  // `second` tiles back along the shaft and the near arm is solved to hold it there, so it is the REAR
  // hand that does the thrusting: drawn back (the hold widens as the shaft runs back through the front
  // hand), then driven forward almost to a straight arm (the hold closes up). `slide` runs the shaft a
  // little further through both hands as the blow lands. `lead` is only the one-armed fallback
  thrust2: {
    hit: 215,
    body: [
      { t: 0, d: 0 },
      { t: 140, d: -0.08, ease: 'out' },
      { t: 215, d: 0.34, ease: 'in' },
      { t: 290, d: 0.3 },
      { t: 480, d: 0 },
    ],
    weapon: [
      { t: 0, f: 1.9, u: 0, a: 1.4 },
      { t: 145, f: 1.92, u: -0.03, a: 1.42, ease: 'out' },
      { t: 210, f: 1.75, u: 0.2, a: 1.55, ease: 'in' },
      { t: 280, f: 1.78, u: 0.18, a: 1.55 },
      { t: 480, f: 1.9, u: 0, a: 1.4 },
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
      { t: 0, d: 0.5 },
      { t: 145, d: 0.6, ease: 'out' },
      { t: 210, d: 0.44, ease: 'in' },
      { t: 280, d: 0.46 },
      { t: 480, d: 0.5 },
    ],
  },
  // the avatar's TWO-HANDED CHOP (axes and hammers share it; the head stands at a right angle to the
  // forearm in the one-armed fallback). The rear hand holds the foot of the haft, the front hand `second`
  // tiles up it, and both arms are solved onto the weapon as its keys place it.
  // From the guard, the weapon carried low across the body with its head forward and up, it is HOISTED
  // upright in front of the far shoulder (never back across the face), hangs a moment, and is brought
  // down forward to level at the belt. Slower and heavier than the slash: the body rocks back under the lift and steps in hard
  chop2: {
    hit: 385,
    // keyed by the FRONT ARM, as slash2 is (ArmRig.weaponPose): its forearm does the work (`f`), its upper
    // arm barely moves (`u`), and `a` is the way the head points. At rest the forearm lies in across the
    // belly, so the far elbow hangs straight down against the body
    weapon: [
      { t: 0, f: -1.44, u: 0, a: 0.95 },
      { t: 170, f: -1.95, u: 0.05, a: 0.6, ease: 'out' },
      { t: 260, f: -2.6, u: 0.1, a: 0.25 }, // the head stays forward of upright: clear of the face
      { t: 300, f: -2.62, u: 0.1, a: 0.22 },
      { t: 385, f: -0.75, u: 0.25, a: 1.45, ease: 'in' },
      { t: 430, f: -0.7, u: 0.25, a: 1.55, ease: 'out' },
      { t: 560, f: -0.7, u: 0.25, a: 1.55 },
      { t: 800, f: -1.44, u: 0, a: 0.95 },
    ],
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
    // the front hand's hold up the haft from the rear hand (tiles): close under the head's weight at the
    // top, a little wider for the blow. `lead` above is only the one-armed fallback
    second: [
      { t: 0, d: 0.28 },
      { t: 260, d: 0.22, ease: 'out' },
      { t: 300, d: 0.22 },
      { t: 385, d: 0.3, ease: 'in' },
      { t: 560, d: 0.3 },
      { t: 800, d: 0.28 },
    ],
  },
  // the avatar's CROSSBOW SHOT (owner 2026-11-13: "hold it level ... no animation other than the standard
  // full-body recoil"). No arm keys and no `weapon` track: a clip that keys no weapon holds the guard, so
  // both hands stay on the crossbow, level (ArmRig.secondPose). The bolt goes at once and the body kicks back
  bolt: {
    hit: 30,
    total: 260,
    body: [
      { t: 0, d: 0 },
      { t: 30, d: 0 },
      { t: 80, d: -0.07, ease: 'out' },
      { t: 240, d: 0 },
    ],
  },
  // the avatar's BOW SHOT (owner 2026-11-13; ArmRig.setBow / bowPose). Not arm keys: the `bow` block.
  //   hand: where the bow hand is, from the far shoulder in lengths of that arm. It does not move.
  //   draw: the draw hand's reach from the near shoulder, in lengths of that arm, [ms, reach] ...
  //   pull: ... nudged `toPull` of the way toward this, one length of string for every body ([ms, tiles
  //         behind the bow hand]): a short-armed figure then draws a few px further and its arm folds as it did
  //   loose: the arrow leaves (the clip's `hit`: the projectile is launched then); nock: a new arrow is
  //         in the hand; take: the string is taken up again between these two moments
  // At rest the figure stands at the first key: ready, the string half drawn (the near hand cannot reach
  // a resting string out past the far shoulder). The body gives a little as the arrow goes
  shoot: {
    hit: 260,
    total: 400,
    body: [
      { t: 0, d: 0 },
      { t: 260, d: 0 },
      { t: 290, d: -0.04, ease: 'out' },
      { t: 380, d: 0 },
    ],
    bow: {
      hand: [0.62, 0.3],
      // loosed at 260, the draw arm SNAPS back to the ready in 70 ms (owner 2026-11-13: "very fast"), a new
      // arrow already in the hand and the string taken up as it arrives
      draw: [[0, 0.8], [200, 0.31], [260, 0.31], [330, 0.8], [400, 0.8]],
      pull: [[0, 0.41], [200, 0.68], [260, 0.68], [330, 0.41], [400, 0.41]],
      toPull: 0.25,
      loose: 260,
      nock: 295,
      take: [300, 330],
    },
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

/** Several values of a key track at time t (ms): { field: value } for each of `fields`, eased as poseAt eases. */
export function keyAt(keys, t, fields) {
  const pick = (k) => Object.fromEntries(fields.map((f) => [f, k[f] || 0]));
  if (!keys || !keys.length) return null;
  if (t <= keys[0].t) return pick(keys[0]);
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i];
    if (t <= b.t) {
      const a = keys[i - 1], p = (EASE[b.ease] || EASE.inOut)((t - a.t) / Math.max(1, b.t - a.t));
      return Object.fromEntries(fields.map((f) => [f, (a[f] || 0) + ((b[f] || 0) - (a[f] || 0)) * p]));
    }
  }
  return pick(keys[keys.length - 1]);
}

/** How long a clip runs (ms): its last key. */
export const clipLength = (clip) => Math.max(clip.total || 0, ...['lead', 'off', 'lean', 'body', 'second', 'slide', 'weapon'].map((k) => (clip[k]?.length ? clip[k][clip[k].length - 1].t : 0)));
