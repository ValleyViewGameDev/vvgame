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
 * public/assets/avatar/hand/ and a weapon's resources.json row names its file as `heldArt`.
 */
import { rigFor } from './ArmRig';

export const WEAPON = { w: 128, h: 512, grip: [64, 448], tiles: 1.2 };
export const HELD_ARM = 'L';
/** En garde: the forearm across the body just below level, so the blade stands up and leans forward. */
export const GUARD = { side: HELD_ARM, s: 0.15, e: -1.25 };
export const SWING_CLIP = 'slash';

export const weaponSrc = (file) => `/assets/avatar/hand/${file}`;

/** The arm rig for an avatar: its outfit's own (`avatar:<outfit id>`), else its body's (`avatar:male`). */
export const avatarRig = (body, outfitId) => rigFor(`avatar:${outfitId}`) || rigFor(`avatar:${body || 'female'}`);

/**
 * Put a weapon in the rigged figure's hand and raise the guard. `cutW`: the figure texture's width
 * (px), `spanTiles`: how many tiles that square is on the board (the avatar: 1.8).
 */
export function armFigure(armRig, weaponTex, cutW, spanTiles) {
  armRig.setHeld(HELD_ARM, {
    tex: weaponTex, grip: WEAPON.grip, size: [WEAPON.w, WEAPON.h],
    scale: (WEAPON.tiles / WEAPON.h) * (cutW / spanTiles),
    angle: Math.PI / 2, // a right angle to the forearm, the blade toward the side the figure faces
  });
  armRig.attackClip = SWING_CLIP;
  armRig.setStance(GUARD, true);
}
