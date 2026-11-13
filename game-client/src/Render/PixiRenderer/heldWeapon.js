/**
 * heldWeapon: the weapon in an avatar's hand (docs/equipment-plan.md; the in-game prototype,
 * owner 2026-11-13).
 *
 * The sword is held in the NEAR arm (the image's left on a figure drawn facing right; the far arm is
 * half hidden by every outfit and is a sliver when lifted), crossing the body in front. It is its own
 * sprite on the arm rig's hand (ArmRig.setHeld), RIGID at a right angle to the forearm: no wrist. The
 * guard is a held pose of the rig (ArmRig.setStance) and the attack is the `slash` clip (armClips.js),
 * whose keys start and end in that guard.
 *
 * Every weapon is drawn on one footprint (WEAPON): a 128 x 512 canvas, the weapon upright, point up,
 * the middle of its grip at (64, 448), the canvas 1.2 tiles tall on the board. Files live in
 * public/assets/avatar/hand/.
 *
 * A weapon's resources.json row names its CATEGORY as `weaponClass` (WEAPON_CLASSES below). The
 * category owns the look and the motion: the drawing in the hand, the guard and the attack clip.
 * Every weapon of a category shares them (owner 2026-11-13: "tagged as Sword ... inherit the prop and
 * animation"); a row may name its own drawing of the same shape as `heldArt`. A weapon with no
 * category (an axe, a hammer, a bow, until theirs are built) shows nothing in the hand.
 */
import { rigFor } from './ArmRig';

export const WEAPON = { w: 128, h: 512, grip: [64, 448], tiles: 1.2 };
export const HELD_ARM = 'L';
/** The weapon categories. `art`: the drawing, `guard`: the held pose, `clip`: the attack (armClips.js). */
export const WEAPON_CLASSES = {
  // en garde: the forearm across the body just below level, so the blade stands up and leans forward
  sword: { art: 'weapon-long-sword.png', guard: { side: HELD_ARM, s: 0.15, e: -1.25 }, clip: 'slash' },
};

const heldCache = new Map();
/**
 * What an equipped weapon's row puts in the hand: { key, art, guard, clip }, or null (no row, or a
 * weapon with no category yet). The same row always gives the same object, so it can be compared and
 * used as a hook dependency.
 */
export function heldFor(row) {
  const cls = row ? WEAPON_CLASSES[row.weaponClass] : null;
  if (!cls) return null;
  const art = row.heldArt || cls.art, key = `${row.weaponClass}|${art}`;
  if (!heldCache.has(key)) heldCache.set(key, { key, art, guard: cls.guard, clip: cls.clip });
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
    tex: weaponTex, grip: WEAPON.grip, size: [WEAPON.w, WEAPON.h],
    scale: (WEAPON.tiles / WEAPON.h) * (cutW / spanTiles),
    angle: Math.PI / 2, // a right angle to the forearm, the blade toward the side the figure faces
  });
  armRig.attackClip = held.clip;
  armRig.setStance(held.guard, true);
}
