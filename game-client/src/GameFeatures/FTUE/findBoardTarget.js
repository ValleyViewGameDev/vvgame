import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import PixiCamera from '../../Render/PixiRenderer/PixiCamera';
import { footprintOf } from '../../Utils/footprint';

export const FTUE_WHEAT_TILE_KEY = 'vv_ftue_wheat_tile'; // set by ResourceClicking when the tutorial Wheat is harvested

// The tile of a named thing on the current board: a resource (by type) first, else an NPC.
// Returns { x, y, size, w?, h? } in tiles (x/y the lower-left tile), or null. Shared by the doinker, the scrim and cutscenes.
// With several of that type (the Collect Wheat beat), the one nearest the player, so the arrow and
// the scrim's hole move on to the next closest as each is collected.
export function nearestResourceOfType(resources, targetName) {
  const matches = (resources || []).filter((r) => r && r.type === targetName);
  if (matches.length < 2) return matches[0] || null;
  const me = PixiCamera.debug?.()?.playerTile;
  if (!me) return matches[0];
  const d = (r) => (r.x + 0.5 - me.x) ** 2 + (r.y + 0.5 - me.y) ** 2;
  return matches.reduce((best, r) => (d(r) < d(best) ? r : best), matches[0]);
}

export function findBoardTarget(targetName, gridId) {
  const res = nearestResourceOfType(GlobalGridStateTilesAndResources.getResources(), targetName);
  if (res) { const { w, h } = footprintOf(res); return { x: res.x, y: res.y, size: Math.max(w, h), w, h }; }
  if (gridId) {
    const npcs = NPCsInGridManager.getNPCsInGrid(gridId);
    const npc = npcs && Object.values(npcs).find((n) => n.type === targetName);
    if (npc && npc.position) {
      // An NPC answers taps on the figure you SEE (PixiRenderer findNpcAtScreen): `artSpan` tiles
      // tall from its tile's bottom edge, and up to half a tile off its logical tile while it
      // steps. The box covers all of that, so a scrim's hole never leaves the head (or a figure
      // mid-step) under the dark panels, where a tap cannot reach it (the Snug / Kent lockouts).
      const span = Math.max(1, Number(npc.artSpan) || 1);
      return { x: npc.position.x - 0.5, y: npc.position.y + 0.5, w: 2, h: span + 1, size: 1, npc: true };
    }
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
  const sw = spot.w || spot.size || 1, sh = spot.h || spot.size || 1;
  const host = document.querySelector('.homestead')?.getBoundingClientRect() || { left: 0, top: 0 };
  const tl = PixiCamera.worldToScreen(spot.x * BASE_TILE, (spot.y - sh + 1) * BASE_TILE);
  const br = PixiCamera.worldToScreen((spot.x + sw) * BASE_TILE, (spot.y + 1) * BASE_TILE);
  return { x1: Math.round(host.left + tl.x - pad), y1: Math.round(host.top + tl.y - pad), x2: Math.round(host.left + br.x + pad), y2: Math.round(host.top + br.y + pad) };
}

if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') { window.__boardTarget = findBoardTarget; window.__boardResources = () => GlobalGridStateTilesAndResources.getResources(); /* the capture tool's survey (tools/capture) */ window.__ftueDirtTile = resolveFtueDirtTile; } // dev hooks
