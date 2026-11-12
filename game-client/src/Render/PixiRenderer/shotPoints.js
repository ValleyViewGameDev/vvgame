/**
 * shotPoints: where a projectile leaves and where it lands (owner 2026-11-12).
 *
 * A shot leaves an ENEMY at its `shotFrom` point (resources.json, "x,y" as fractions of the
 * drawn art square: 0,0 its top-left, 1,1 its bottom-right; the Demon's mouth is 0.5,0.38), else
 * from its chest. A PLAYER's shot (a bow) leaves the player's chest. Every shot lands on the
 * target's chest: an NPC's `chestAt` (the same "x,y" art fractions), else the default chest,
 * CHEST_DOWN of the way from the top of the drawn art (its opaque top, artHitTest) to its feet.
 * The player's chest is the default unless PC_CHEST_AT is set.
 *
 * The points are read from the live display objects (the sprite's anchor, size and mirror), so
 * they follow artSpan, artScale, the facing flip and multi-tile bodies; an x fraction is
 * mirrored with the sprite. Without a display object (renderer not up) the old body centre is
 * used. Returns tile coordinates in CombatFX.projectile's convention (the tile's centre is x, y).
 */
import { npcDisplay, pcDisplay, tileSize } from './CombatFX';
import { getMasterResources } from '../../Utils/TuningManager';
import { npcCentre } from '../../Utils/npcFootprint';

export const CHEST_DOWN = 0.4;   // the default chest: this far down from the head to the feet
export const PC_CHEST_AT = null; // e.g. '0.5,0.55' pins the player's chest on the avatar square

const parsePoint = (v) => {
  if (!v) return null;
  const [x, y] = String(v).split(',').map(Number);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
};

const rowOf = (npc) => getMasterResources()?.find((m) => m.type === npc?.type) || null;

/** A point on the drawn art (fractions of its square) in tile coords; null without art. */
function artPoint(obj, at) {
  if (!obj || obj.destroyed || !obj.parent) return null;
  const T = tileSize();
  const w = Math.abs(obj.width); const h = Math.abs(obj.height);
  const ax = obj.anchor?.x ?? 0.5; const ay = obj.anchor?.y ?? 0.5;
  const mirrored = obj.scale.x < 0;
  const fx = mirrored ? 1 - at.x : at.x;
  const left = obj.x - (mirrored ? 1 - ax : ax) * w;
  const top = obj.y - ay * h;
  return { x: (left + fx * w) / T - 0.5, y: (top + at.y * h) / T - 0.5 };
}

/** The default chest of a drawn figure: CHEST_DOWN from its opaque top to its feet. */
const defaultChest = (obj) => {
  const artTop = obj?.__artTop || 0;
  return { x: 0.5, y: artTop + CHEST_DOWN * (1 - artTop) };
};

/** Where a shot lands on an NPC (tile coords). */
export function npcChest(npc) {
  const obj = npcDisplay(npc.id);
  const at = parsePoint(rowOf(npc)?.chestAt) || defaultChest(obj);
  return artPoint(obj, at) || npcCentre(npc);
}

/** Where an enemy's shot leaves it (tile coords): its `shotFrom`, else its chest. */
export function npcShotOrigin(npc) {
  const at = parsePoint(rowOf(npc)?.shotFrom);
  if (!at) return npcChest(npc);
  return artPoint(npcDisplay(npc.id), at) || npcCentre(npc);
}

/** The player's chest (tile coords): where its shots leave and where enemy shots land. */
export function pcChest(position) {
  const obj = pcDisplay();
  const at = parsePoint(PC_CHEST_AT) || defaultChest(obj);
  return artPoint(obj, at) || { x: position.x, y: position.y };
}
