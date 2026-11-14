/**
 * heldWeapon: the weapon in an avatar's hand (docs/equipment-plan.md, owner 2026-11-13).
 *
 * The weapon is held in the NEAR arm (the image's left on a figure drawn facing right; the far arm is
 * half hidden by every outfit and is a sliver when lifted), crossing the body in front. It is its own
 * sprite on the arm rig's hand (ArmRig.setHeld), RIGID in the hand at its category's angle to the
 * forearm: no wrist. The guard is a held pose of the rig (ArmRig.setStance) and the attack is a clip
 * (armClips.js: the arm's swing and the body's move together) whose keys start and end in that guard.
 *
 * A weapon's resources.json row names its CATEGORY as `weaponClass` (WEAPON_CLASSES below). The
 * category owns the look and the motion: the drawing in the hand, how it sits in the hand, the guard
 * and the attack clip. Every weapon of a category shares them; a row may name its own drawing of the
 * same shape as `heldArt`. A weapon with no category shows nothing in the hand. The bows (`bow`,
 * `longbow`) are the exception to all of this: they have no picture, the rig draws the bow itself (ArmRig.setBow).
 *
 * Every drawing is upright, point or head up, at ONE scale (PX_PER_TILE canvas px to a board tile),
 * on its category's canvas (`size`) with the middle of where the hand holds it at `grip`. Files live
 * in public/assets/avatar/hand/; tools/art/weaponfit.js cuts a generated drawing to a canvas.
 *
 * Two hands: a category with `second` is held in both (the great sword, the polearm, the axe, the hammer). The row's `hands` only
 * decides the shield; a two-handed weapon whose category has no `second` is swung by the one arm.
 */
import { rigFor } from './ArmRig';

export const PX_PER_TILE = 512 / 1.2; // the long sword's 512 px canvas is 1.2 tiles tall; every drawing keeps that scale
export const HELD_ARM = 'L';

// Guards are ABSOLUTE poses, as the avatar's clips are (armClips.js): s where the upper arm points, s + e the forearm.
const ACROSS = Math.PI / 2; // at a right angle to the forearm, pointing the way the figure faces: a weapon that CUTS
const ALONG = Math.PI;      // in line with the forearm, pointing on past the hand: a weapon that THRUSTS
// en garde: the forearm across the body just below level, so the blade stands up and leans forward
const CUT_GUARD = { side: HELD_ARM, s: 0.28, e: -1.3 };
// the point forward: the elbow tucked back, the forearm level, the weapon aimed at the enemy from the hip
const THRUST_GUARD = { side: HELD_ARM, s: 0.43, e: -2.05 };
// the polearm's guard: the shaft across the lower chest, its point a little raised, the rear hand low by the near side and the far forearm out along it
// (`weapon`: as the two-handed clip keys it, armClips.js thrust2; s, e: the one-armed fallback)
const POLE_GUARD = { side: HELD_ARM, s: 0.43, e: -2.05, weapon: { f: 1.9, u: 0, a: 1.4 } };
// the two-handed sword's guard: both hands at the belly, the blade standing up and leaning well forward
// (`weapon`: the same guard as the two-handed clip keys it, armClips.js slash2; s, e: the one-armed fallback)
const GREAT_GUARD = { side: HELD_ARM, s: 0.15, e: -1.02, weapon: { f: -1.44, u: 0, a: 0.7 } };
// a heavy two-handed head carried low and ready: the rear hand at the hip, the haft across the body with the head forward and up
// (`weapon`: the guard as the two-handed clip keys it, armClips.js chop2; s, e: the one-armed fallback)
const HEAVY_GUARD = { side: HELD_ARM, s: 0.1, e: -0.47, weapon: { f: -1.44, u: 0, a: 0.95 } };

/**
 * The weapon categories. `art`: the drawing; `size` and `grip`: its canvas and where the hand holds
 * it (px); `angle`: how it sits in the hand, from the forearm; `guard`: the held pose; `clip`: the
 * attack (armClips.js); `second`: a TWO-HANDED hold, the other hand on the weapon this many tiles from
 * the first toward its point. Such a category's guard and clip carry `weapon` keys, which set the far
 * arm and the weapon and leave the near arm to be solved (ArmRig.weaponPose); a figure whose rig has no
 * far arm holds the weapon in the one hand.
 * The attacks, `<attack>` in one hand and `<attack>2` in two: the sword's `slash` and the great
 * sword's `slash2`; the `thrust` (rapier, dagger, spear) and the polearm's `thrust2`; the `chop2` of the axe and
 * the hammer, which share it (there is no one-handed chop).
 */
export const WEAPON_CLASSES = {
  sword:   { art: 'weapon-long-sword.png', size: [128, 512], grip: [64, 448], angle: ACROSS, guard: CUT_GUARD, clip: 'slash' },
  // the far hand sits just above the near one on the long grip and stays there: no `give`, it must not slide onto the blade
  greatsword: { art: 'weapon-great-sword.png', size: [192, 720], grip: [96, 650], angle: ACROSS, guard: GREAT_GUARD, clip: 'slash2', second: 0.23 },
  // a sword that thrusts: its own slender drawing, held along the forearm as the dagger and the spear are (owner 2026-11-13)
  rapier:  { art: 'weapon-rapier.png', size: [224, 608], grip: [112, 540], angle: ALONG, guard: THRUST_GUARD, clip: 'thrust' },
  // a bow is not a picture in a hand: ArmRig draws it, held out in the FAR hand and drawn by the near one (setBow).
  // `bow` names the drawing (ArmRig BOW_STYLES); every bow shares the one shot (owner 2026-11-13)
  bow:     { bow: 'short', clip: 'shoot' },
  longbow: { bow: 'long', clip: 'shoot' },
  dagger:  { art: 'weapon-dagger.png', size: [128, 512], grip: [64, 448], angle: ALONG, guard: THRUST_GUARD, clip: 'thrust' },
  spear:   { art: 'weapon-spear.png', size: [128, 768], grip: [64, 470], angle: ALONG, guard: THRUST_GUARD, clip: 'thrust' },
  polearm: { art: 'weapon-halberd.png', size: [256, 896], grip: [128, 580], angle: ALONG, guard: POLE_GUARD, clip: 'thrust2', second: 0.5 },
  axe:     { art: 'weapon-great-axe.png', size: [256, 576], grip: [128, 480], angle: ACROSS, guard: HEAVY_GUARD, clip: 'chop2', second: 0.28 },
  hammer:  { art: 'weapon-war-hammer.png', size: [256, 576], grip: [128, 480], angle: ACROSS, guard: HEAVY_GUARD, clip: 'chop2', second: 0.28 },
};

const heldCache = new Map();
/**
 * What an equipped weapon's row puts in the hand: its category's entry with `key` and the row's own
 * `art` if it names one, or null (no row, or a weapon with no category). The same row always gives the same object, so it can be compared and
 * used as a hook dependency.
 */
export function heldFor(row) {
  const cls = row ? WEAPON_CLASSES[row.weaponClass] : null;
  if (!cls) return null;
  const art = row.heldArt || cls.art, key = `${row.weaponClass}|${art}`;
  if (!heldCache.has(key)) heldCache.set(key, { ...cls, key, art });
  return heldCache.get(key);
}

export const weaponSrc = (file) => `/assets/avatar/hand/${file}`;

/** The arm rig for an avatar: its outfit's own (`avatar:<outfit id>`), else its body's (`avatar:male`). */
export const avatarRig = (body, outfitId) => rigFor(`avatar:${outfitId}`) || rigFor(`avatar:${body || 'female'}`);

/**
 * Put a weapon in the rigged figure's hand and raise its guard. `held`: heldFor(row), `cutW`: the
 * figure texture's width (px), `spanTiles`: how many tiles that square is on the board (the avatar: 1.8).
 */
export function armFigure(armRig, held, weaponTex, cutW, spanTiles) {
  if (held.bow) { // the bow: drawn by the rig, both arms its own
    armRig.setHeld(HELD_ARM, null);
    armRig.setBow({ clip: held.clip, pxPerTile: cutW / spanTiles, style: held.bow });
    armRig.attackClip = held.clip;
    armRig.setStance({ side: HELD_ARM, bow: true }, true);
    return;
  }
  armRig.setBow(null);
  armRig.setHeld(HELD_ARM, {
    tex: weaponTex, grip: held.grip, size: held.size,
    scale: (cutW / spanTiles) / PX_PER_TILE, // canvas px to the figure texture's px
    angle: held.angle,
    pxPerTile: cutW / spanTiles, // the figure texture's px to a board tile: a clip's `slide` and `second` are in tiles
    // a two-handed weapon on a figure whose rig has the other arm: that hand holds it too, `second` tiles toward the point
    second: held.second && armRig.arms.R && armRig.arms.R.part.fist ? { side: 'R', dist: held.second, pxPerTile: cutW / spanTiles } : null,
  });
  armRig.attackClip = held.clip;
  armRig.setStance(held.guard, true);
}
