/**
 * npcHeadTops: where each NPC's head is, so status overlays (the farm animal's ✅, a quest
 * NPC's ✅ / ?, a trader's hand) sit centred just above it (owner 2026-11-10) instead of in the
 * tile's lower-left corner.
 *
 * PixiRenderer measures each NPC when it builds or resizes the sprite: the art's topmost opaque
 * row (artHitTest.opaqueTopFraction) placed by the sprite's size and anchor, stored as tiles
 * below the NPC tile's top edge (negative = above it: a 1.8-tile figure's head is ~0.8 above).
 * The overlay renderers ask npcOverlaySpot() for the overlay's top-left in world px.
 */
const tops = new Map(); // npcId -> head top, in tiles below the tile's top edge
const listeners = new Set();
let notifyQueued = false;

export const HEAD_GAP = 0.08; // tiles of air between the top of the head and the overlay

export function setNpcHeadTop(npcId, tilesBelowTileTop) {
  const v = Math.round(tilesBelowTileTop * 100) / 100;
  if (tops.get(npcId) === v) return;
  tops.set(npcId, v);
  if (notifyQueued || !listeners.size) return;
  notifyQueued = true; // one notice per frame however many NPCs were measured
  requestAnimationFrame(() => { notifyQueued = false; listeners.forEach((cb) => cb()); });
}

export function clearNpcHeadTop(npcId) { tops.delete(npcId); }

/** Subscribe to head measurements changing (returns the unsubscribe). */
export function onNpcHeadTopsChanged(cb) { listeners.add(cb); return () => listeners.delete(cb); }

/** Top-left (world px) of a `size` px overlay centred above the head of the NPC whose tile's top-left is (tileX, tileY). */
export function npcOverlaySpot(npcId, tileX, tileY, TILE_SIZE, size) {
  const head = tops.has(npcId) ? tops.get(npcId) : 0; // unmeasured: just above the tile
  return {
    x: tileX + (TILE_SIZE - size) / 2,
    y: tileY + (head - HEAD_GAP) * TILE_SIZE - size,
  };
}

/** The NPC's measured head top (tiles below its tile's top edge), or null when not measured yet. */
export function getNpcHeadTop(npcId) { return tops.has(npcId) ? tops.get(npcId) : null; }
