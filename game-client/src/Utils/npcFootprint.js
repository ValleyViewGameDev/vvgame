/**
 * An NPC's footprint (owner 2026-11-11: "Enemies, like deco, should be arbitrary x, y").
 *
 * An NPC row's `sizeX` x `sizeY` (or `size`) is its footprint in tiles, read with the same rule as
 * a resource's (Utils/footprint.js): anchored at its lower-left tile, covering x .. x+w-1 and
 * y-h+1 .. y. `npc.position` IS that anchor tile, so a 1 x 1 NPC is unchanged and nothing saved
 * changes shape. Everything that asks where an NPC is, what it blocks, how far it is from
 * something or where its middle is goes through these, so a 2 x 2 Phoenix or a 2 x 4 Dragon
 * blocks, is hit, reaches and is drawn by its whole body.
 *
 * Pure (no imports but footprint.js): AllNPCsShared (movement and routes), NPCEnemyBehavior
 * (sight and reach), Combat (the player's reach), Pathfinding and PlayerMovement (what blocks
 * the player) and PixiRenderer (drawing, taps) all use it.
 */
import { footprintOf } from './footprint';

/** The footprint in tiles: { w, h }. */
export const npcSize = (npc) => footprintOf(npc);

export const isMultiTileNpc = (npc) => { const { w, h } = footprintOf(npc); return w * h > 1; };

const anchorOf = (npc, at) => {
  const p = at || npc?.position || { x: npc?.x, y: npc?.y };
  return { x: Math.floor(p.x), y: Math.floor(p.y) };
};

/** Every tile the NPC covers when its anchor is at `at` (default: where it stands). */
export const npcCells = (npc, at = null) => {
  const { w, h } = footprintOf(npc); const a = anchorOf(npc, at); const cells = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) cells.push({ x: a.x + dx, y: a.y - dy });
  return cells;
};

/** True when the NPC's body covers the tile (col, row). */
export const npcCovers = (npc, col, row, at = null) => {
  if (!npc || !(at || npc.position)) return false;
  const { w, h } = footprintOf(npc); const a = anchorOf(npc, at);
  return col >= a.x && col < a.x + w && row <= a.y && row > a.y - h;
};

/** The tile of the NPC's body nearest to a point: where a blow lands, where it looks and swings from. */
export const npcNearestCell = (npc, to, at = null) => {
  const { w, h } = footprintOf(npc); const a = anchorOf(npc, at);
  const tx = Math.round(to.x), ty = Math.round(to.y);
  return { x: Math.max(a.x, Math.min(a.x + w - 1, tx)), y: Math.max(a.y - h + 1, Math.min(a.y, ty)) };
};

/** Board reach (Chebyshev) between the NPC's body and a tile: 1 = touching, 0 = on it. */
export const npcReach = (npc, to, at = null) => {
  const c = npcNearestCell(npc, to, at);
  return Math.max(Math.abs(c.x - Math.round(to.x)), Math.abs(c.y - Math.round(to.y)));
};

/** The middle of the body in tile units (the anchor itself for a 1 x 1). `at` may be a mid-step render position. */
export const npcCentre = (npc, at = null) => {
  const { w, h } = footprintOf(npc); const p = at || npc.position;
  return { x: p.x + (w - 1) / 2, y: p.y - (h - 1) / 2 };
};

/**
 * Where the NPC can stand to be BESIDE a tile (touching it, never on it): every anchor whose body
 * is exactly one tile from (tx, ty). For a 1 x 1 these are the eight neighbours.
 */
export const anchorsBeside = (npc, tx, ty) => {
  const { w, h } = footprintOf(npc); const out = [];
  for (let ay = ty - 1; ay <= ty + h; ay++) for (let ax = tx - w; ax <= tx + 1; ax++) {
    if (npcReach(npc, { x: tx, y: ty }, { x: ax, y: ay }) === 1) out.push({ x: ax, y: ay });
  }
  return out;
};

/** The first NPC (spawners excepted: they are passable) whose body covers the tile, or null. */
export const npcOnTile = (npcs, col, row, exceptId = null) => {
  const list = Array.isArray(npcs) ? npcs : Object.values(npcs || {});
  return list.find((n) => n && n.id !== exceptId && n.action !== 'spawn' && n.position && npcCovers(n, col, row)) || null;
};
