import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import PixiCamera from '../../Render/PixiRenderer/PixiCamera';

export const FTUE_WHEAT_TILE_KEY = 'vv_ftue_wheat_tile'; // set by ResourceClicking when the tutorial Wheat is harvested

// The tile of a named thing on the current board: a resource (by type) first, else an NPC.
// Returns { x, y, size } in tiles, or null. Shared by the doinker, the scrim and cutscenes.
export function findBoardTarget(targetName, gridId) {
  const resources = GlobalGridStateTilesAndResources.getResources();
  const res = resources?.find((r) => r && r.type === targetName);
  if (res) return { x: res.x, y: res.y, size: res.size || 1 };
  if (gridId) {
    const npcs = NPCsInGridManager.getNPCsInGrid(gridId);
    const npc = npcs && Object.values(npcs).find((n) => n.type === targetName);
    if (npc && npc.position) return { x: npc.position.x, y: npc.position.y, size: 1 };
  }
  return null;
}
// The dirt tile the FTUE planting beat points at: the tile the tutorial Wheat was harvested from
// when it is empty dirt again, else the empty dirt tile nearest the player. Null when none.
export function resolveFtueDirtTile() {
  const tiles = GlobalGridStateTilesAndResources.getTiles();
  const resources = GlobalGridStateTilesAndResources.getResources() || [];
  if (!tiles || !tiles.length) return null;
  const occupied = new Set(resources.filter(Boolean).map((r) => `${r.x},${r.y}`));
  const emptyDirt = (x, y) => tiles[y] && tiles[y][x] === 'd' && !occupied.has(`${x},${y}`);
  try {
    const saved = JSON.parse(localStorage.getItem(FTUE_WHEAT_TILE_KEY) || 'null');
    if (saved && emptyDirt(saved.x, saved.y)) return { x: saved.x, y: saved.y, size: 1 };
  } catch (_) { /* storage off */ }
  const me = PixiCamera.debug().playerTile;
  let best = null; let bestD = Infinity;
  for (let y = 0; y < tiles.length; y++) {
    for (let x = 0; x < tiles[y].length; x++) {
      if (!emptyDirt(x, y)) continue;
      const d = (x + 0.5 - me.x) ** 2 + (y + 0.5 - me.y) ** 2;
      if (d < bestD) { bestD = d; best = { x, y, size: 1 }; }
    }
  }
  return best;
}

// Any scrim/doinker target to a screen rect: a board name, 'ftue-dirt', { selector } (a DOM
// element) or { dirtTile: true }. Returns { x1, y1, x2, y2 } in page px, or null.
export function targetRect(target, gridId, pad = 6) {
  const BASE_TILE = 45;
  if (target && typeof target === 'object' && target.selector) {
    const el = document.querySelector(target.selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x1: Math.round(r.left - pad), y1: Math.round(r.top - pad), x2: Math.round(r.right + pad), y2: Math.round(r.bottom + pad) };
  }
  const spot = (target && typeof target === 'object' && target.dirtTile) || target === 'ftue-dirt'
    ? resolveFtueDirtTile()
    : findBoardTarget(target, gridId);
  if (!spot || !PixiCamera.isAttached()) return null;
  const size = spot.size || 1;
  const host = document.querySelector('.homestead')?.getBoundingClientRect() || { left: 0, top: 0 };
  const tl = PixiCamera.worldToScreen(spot.x * BASE_TILE, spot.y * BASE_TILE);
  const br = PixiCamera.worldToScreen((spot.x + size) * BASE_TILE, (spot.y + size) * BASE_TILE);
  return { x1: Math.round(host.left + tl.x - pad), y1: Math.round(host.top + tl.y - pad), x2: Math.round(host.left + br.x + pad), y2: Math.round(host.top + br.y + pad) };
}

if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') { window.__boardTarget = findBoardTarget; window.__ftueDirtTile = resolveFtueDirtTile; } // dev hooks
