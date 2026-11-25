/**
 * Read-only homestead view (docs/refactor-plan.md D6; developers only, 2026-10-28).
 *
 * A developer may travel onto another player's homestead for real (enter-grid saves the location
 * there, so a refresh or a zoom keeps them on it; owner 2026-11-25). Every grid load
 * (GridManagement.seedGridFromBundle) turns the view on for someone else's homestead and off for
 * anything else. While the view is up:
 *   - the board takes no interaction but walking (tap to walk, and the developer teleport), signposts
 *     and the Trade Stall (it opens the viewer's own stall panel and a Global Market of the visited
 *     settlement; App handleTileClick, NPC clicks, combat), NPCs do not tick, crops do not convert;
 *   - nothing is saved: the player-state flushes and beacons stand down, and this module's axios
 *     interceptor cancels every write that names the viewed grid (body gridId / GridId /
 *     fromGridId, or the grid id in the URL) plus /player/state, so a path that slips through
 *     fails like any refused request and its optimistic UI rolls back. The server refuses them too:
 *     every write route checks the grid is the player's own.
 * enter-grid is let through: leaving the view is an ordinary crossing (the server only writes a
 * from-grid's NPC positions when that grid is the player's own).
 */
import axios from 'axios';

let view = null;             // { gridId, ownerUsername } while a snapshot is shown
let canViewSnapshots = false; // set from App once the developer check answers

export const setSnapshotViewer = (allowed) => { canViewSnapshots = !!allowed; };
export const canViewHomesteadSnapshots = () => canViewSnapshots;

/** Someone else's homestead: what a developer may stand on read-only (enter-grid lets them, 2026-11-25). */
export const isOthersHomestead = (grid, player) =>
  grid?.gridType === 'homestead' && !!grid.ownerId && !!player
  && String(grid.ownerId) !== String(player._id || player.playerId);

export const enterViewOnly = (gridId, ownerUsername = null) => { view = { gridId: String(gridId), ownerUsername }; };
export const leaveViewOnly = () => { view = null; };
export const getViewOnly = () => view;
/** true while a snapshot is shown (for `gridId`, when given) */
export const isViewOnly = (gridId = null) => !!view && (gridId == null || String(gridId) === view.gridId);

const WRITE_METHODS = new Set(['post', 'put', 'patch', 'delete']);

function namesViewedGrid(config) {
  if (!view) return false;
  if (String(config.url || '').includes('/api/enter-grid')) return false;
  if (String(config.url || '').includes('/api/player/state')) return true;
  if (String(config.url || '').includes(view.gridId)) return true;
  let body = config.data;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object') return false;
  return [body.gridId, body.GridId, body.fromGridId].some((id) => id != null && String(id) === view.gridId);
}

axios.interceptors.request.use((config) => {
  if (WRITE_METHODS.has(String(config.method || 'get').toLowerCase()) && namesViewedGrid(config)) {
    console.warn(`👁️ [VIEW ONLY] blocked ${String(config.method).toUpperCase()} ${config.url}`);
    return Promise.reject(new axios.CanceledError('view-only'));
  }
  return config;
});
