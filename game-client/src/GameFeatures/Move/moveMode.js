import axios from 'axios';
import API_BASE from '../../config';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import { enrichGridResources } from '../../AppInit';
import { createCollectEffect } from '../../VFX/VFX';
import soundManager from '../../Sound/SoundManager';
import FloatingTextManager from '../../UI/FloatingText';
import { TILES_PER_GRID } from '../../Render/PixiRenderer/UnifiedCamera';

/**
 * Move: pick up something placed on the grid and put it down somewhere else on the same grid
 * (docs/ui-conventions.md §3, "Sell section"). The Move button in a panel's Sell section calls
 * requestMove; useMoveMode (App) turns that into cursorMode { type: 'move' }: the panel closes,
 * the original stays on the board as a ghost (resource.__moving, drawn at low alpha by
 * PixiRenderer), the cursor carries the item on desktop, and a banner (MoveBanner) says what is
 * being moved and offers Cancel (phones have no cursor; Esc also cancels on desktop). The next
 * tile tap calls placeMovedResource: it checks the footprint locally, moves it at once
 * (optimistic) and tells the server (POST /api/move-resource), putting it back if that fails.
 */
export const MOVE_START_EVENT = 'vv:move-start';

/** Ask App to pick up the resource at (x, y) of this type. */
export function requestMove({ type, x, y }) {
  window.dispatchEvent(new CustomEvent(MOVE_START_EVENT, { detail: { type, x, y } }));
}

// the footprint, anchored at the lower-left like placement: x .. x+size-1, y-size+1 .. y
const cells = (x, y, size) => {
  const out = [];
  for (let dx = 0; dx < size; dx++) for (let dy = 0; dy < size; dy++) out.push(`${x + dx},${y - dy}`);
  return out;
};

export const findAnchor = (from) => GlobalGridStateTilesAndResources.getResources()
  .find((r) => r.x === from.x && r.y === from.y && r.type === from.type);

/** Set or clear the ghost flag on the anchor, in both copies of the resource list. */
export function setGhost(from, on, setResources) {
  const next = GlobalGridStateTilesAndResources.getResources().map((r) => {
    if (!(r.x === from.x && r.y === from.y && r.type === from.type)) return r;
    if (on) return { ...r, __moving: true };
    const { __moving, ...rest } = r;
    return rest;
  });
  GlobalGridStateTilesAndResources.setResources(next);
  setResources(next);
}

/**
 * Put the picked-up resource down at (x, y). Returns 'placed', 'blocked' (stay in move mode)
 * or 'cancel' (nothing to move, or the same spot).
 */
export async function placeMovedResource({ cursorMode, x, y, gridId, currentPlayer, masterResources, setResources, TILE_SIZE, strings }) {
  const { from } = cursorMode;
  const anchor = findAnchor(from);
  if (!anchor) return 'cancel';
  const size = anchor.size || cursorMode.size || 1;
  if (x === from.x && y === from.y) return 'cancel';

  const own = new Set(cells(from.x, from.y, size));
  const target = cells(x, y, size);
  const outside = target.some((c) => { const [cx, cy] = c.split(',').map(Number); return cx < 0 || cy < 0 || cx >= TILES_PER_GRID || cy >= TILES_PER_GRID; });
  const all = GlobalGridStateTilesAndResources.getResources();
  const taken = new Set(all.filter((r) => r.type && !own.has(`${r.x},${r.y}`)).map((r) => `${r.x},${r.y}`));
  if (outside || target.some((c) => taken.has(c))) {
    FloatingTextManager.addFloatingText(strings?.[2115] || 'That spot is taken.', x, y, TILE_SIZE);
    return 'blocked';
  }

  // optimistic: the old anchor and its shadow tiles go, the same record (every field kept)
  // lands at the new anchor with fresh shadows
  const before = all.map((r) => (r === anchor ? (({ __moving, ...rest }) => rest)(r) : r));
  const { __moving, anchorKey, ...raw } = anchor;
  const moved = enrichGridResources([{ ...raw, x, y }], masterResources);
  const next = [...all.filter((r) => !own.has(`${r.x},${r.y}`)), ...moved];
  GlobalGridStateTilesAndResources.setResources(next);
  setResources(next);
  createCollectEffect(x, y, TILE_SIZE);
  soundManager.playSFX('place');

  try {
    const { data } = await axios.post(`${API_BASE}/api/move-resource`, {
      playerId: currentPlayer.playerId, gridId, type: from.type, fromX: from.x, fromY: from.y, toX: x, toY: y,
    });
    if (!data?.success) throw new Error(data?.error || 'move failed');
  } catch (err) {
    console.error('Move failed, putting it back:', err?.response?.data || err.message);
    GlobalGridStateTilesAndResources.setResources(before);
    setResources(before);
    FloatingTextManager.addFloatingText(strings?.[2116] || "Couldn't move it there.", x, y, TILE_SIZE);
  }
  return 'placed';
}
