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
 * same shape as `heldArt`. A weapon with no category (a bow) shows nothing in the hand.
 *
 * Every drawing is upright, point or head up, at ONE scale (PX_PER_TILE canvas px to a board tile),
 * on its category's canvas (`size`) with the middle of where the hand holds it at `grip`. Files live
 * in public/assets/avatar/hand/; tools/art/weaponfit.js cuts a generated drawing to a canvas.
 *
 * There is no two-handed animation: a two-handed weapon (the row's `hands`, which only decides the
 * shield) is swung by the same one arm.
 */
import { rigFor } from './ArmRig';

export const PX_PER_TILE = 512 / 1.2; // the long sword's 512 px canvas is 1.2 tiles tall; every drawing keeps that scale
export const HELD_ARM = 'L';

const ACROSS = Math.PI / 2; // at a right angle to the forearm, pointing the way the figure faces: a weapon that CUTS
const ALONG = Math.PI;      // in line with the forearm, pointing on past the hand: a weapon that THRUSTS
// en garde: the forearm across the body just below level, so the blade stands up and leans forward
const CUT_GUARD = { side: HELD_ARM, s: 0.15, e: -1.25 };
// the point forward: the elbow tucked back, the forearm level, the weapon aimed at the enemy from the hip
const THRUST_GUARD = { side: HELD_ARM, s: 0.3, e: -2.0 };
// a heavy head carried ready: the haft leaning well forward, so the head stands clear of the face
const HEAVY_GUARD = { side: HELD_ARM, s: 0.2, e: -1.07 };

/**
 * The weapon categories. `art`: the drawing; `size` and `grip`: its canvas and where the hand holds
 * it (px); `angle`: how it sits in the hand, from the forearm; `guard`: the held pose; `clip`: the
 * attack (armClips.js). Three attacks: the sword's `slash`, the `thrust` (dagger, spear, polearm) and
 * the `chop` (axe and hammer, which share it).
 */
export const WEAPON_CLASSES = {
  sword:   { art: 'weapon-long-sword.png', size: [128, 512], grip: [64, 448], angle: ACROSS, guard: CUT_GUARD, clip: 'slash' },
  dagger:  { art: 'weapon-dagger.png', size: [128, 512], grip: [64, 448], angle: ALONG, guard: THRUST_GUARD, clip: 'thrust' },
  spear:   { art: 'weapon-spear.png', size: [128, 768], grip: [64, 470], angle: ALONG, guard: THRUST_GUARD, clip: 'thrust' },
  polearm: { art: 'weapon-halberd.png', size: [256, 896], grip: [128, 580], angle: ALONG, guard: THRUST_GUARD, clip: 'thrust' },
  axe:     { art: 'weapon-great-axe.png', size: [256, 576], grip: [128, 480], angle: ACROSS, guard: HEAVY_GUARD, clip: 'chop' },
  hammer:  { art: 'weapon-war-hammer.png', size: [256, 576], grip: [128, 480], angle: ACROSS, guard: HEAVY_GUARD, clip: 'chop' },
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
  armRig.setHeld(HELD_ARM, {
    tex: weaponTex, grip: held.grip, size: held.size,
    scale: (cutW / spanTiles) / PX_PER_TILE, // canvas px to the figure texture's px
    angle: held.angle,
  });
  armRig.attackClip = held.clip;
  armRig.setStance(held.guard, true);
}
