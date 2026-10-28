/**
 * Read-only homestead view (docs/refactor-plan.md D6; developers only for now, 2026-10-28).
 *
 * A developer who crosses or taps into another player's homestead sees it as last saved
 * (GET /api/homestead-snapshot). The server never moves them there: their location stays on
 * the grid they came from. While the view is up:
 *   - the board takes no interaction but walking and signposts (App handleTileClick, NPC clicks,
 *     combat), NPCs do not tick, crops do not convert;
 *   - nothing is saved: the player-state flushes and beacons stand down, and this module's axios
 *     interceptor cancels every write that names the viewed grid (body gridId / GridId /
 *     fromGridId, or the grid id in the URL) plus /player/state, so a path that slips through
 *     fails like any refused request and its optimistic UI rolls back.
 * enter-grid is let through: leaving the view is an ordinary crossing (the server only writes a
 * from-grid's NPC positions when that grid is the player's own).
 */
import axios from 'axios';

let view = null;             // { gridId, ownerUsername } while a snapshot is shown
let canViewSnapshots = false; // set from App once the developer check answers

export const setSnapshotViewer = (allowed) => { canViewSnapshots = !!allowed; };
export const canViewHomesteadSnapshots = () => canViewSnapshots;

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
