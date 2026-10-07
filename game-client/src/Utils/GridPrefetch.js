import axios from 'axios';
import API_BASE from '../config';

/**
 * Neighbour-grid prefetch cache (docs/phase-3-contract.md §4.3).
 *
 * `POST /api/grid-prefetch { playerId, gridCoord }` returns the same `grid`
 * payload `enter-grid` would for that cell without moving the player. Entries
 * are keyed by gridCoord, live for MAX_AGE_MS, and are dropped by `clear()`
 * whenever the player changes grid. One request is in flight at a time;
 * 403/404 refusals are remembered (quietly) so edge steps do not refetch.
 */

const MAX_AGE_MS = 5 * 60 * 1000;
const RETRY_AFTER_MS = 30 * 1000;

const cache = new Map();    // gridCoord -> { gridCoord, grid, ownerUsername, fetchedAt }
// The server reads Player and Frontier in one round trip when it knows the frontier up front
const storedFrontierId = () => { try { return JSON.parse(localStorage.getItem('player') || 'null')?.frontierId || undefined; } catch (_) { return undefined; } };
const refused = new Map();  // gridCoord -> { at, permanent }
let inflight = null;        // { gridCoord, promise } | null
let generation = 0;         // bumped by clear() so a late response is not cached

const toKey = (gridCoord) => Number(gridCoord);
const isFresh = (entry) => !!entry && Date.now() - entry.fetchedAt < MAX_AGE_MS;

/**
 * Fetch `gridCoord`'s bundle into the cache unless it is already cached,
 * in flight, or recently refused. Returns the request promise when one is
 * started (or already running for that coord), otherwise null.
 */
export function prefetchNeighbour(playerId, gridCoord) {
  const key = toKey(gridCoord);
  if (!playerId || !Number.isFinite(key)) return null;

  if (isFresh(cache.get(key))) return null;
  if (inflight) return inflight.gridCoord === key ? inflight.promise : null;

  const refusal = refused.get(key);
  if (refusal && (refusal.permanent || Date.now() - refusal.at < RETRY_AFTER_MS)) return null;

  const startedGeneration = generation;
  const promise = axios
    .post(`${API_BASE}/api/grid-prefetch`, { playerId: String(playerId), gridCoord: key, frontierId: storedFrontierId() })
    .then((response) => {
      const grid = response.data?.grid;
      if (!grid?._id || !Array.isArray(grid.tiles) || grid.tiles.length === 0 || !Array.isArray(grid.resources)) {
        console.warn(`⚠️ [PREFETCH] Incomplete bundle for gridCoord ${key}; ignored`);
        return null;
      }
      if (startedGeneration !== generation) return null; // the player left this grid meanwhile
      const entry = {
        gridCoord: key,
        grid,
        ownerUsername: response.data.ownerUsername ?? null,
        fetchedAt: Date.now(),
      };
      cache.set(key, entry);
      refused.delete(key);
      return entry;
    })
    .catch((error) => {
      const status = error?.response?.status;
      refused.set(key, { at: Date.now(), permanent: status === 403 || status === 404 });
      if (status !== 403 && status !== 404) {
        console.warn(`⚠️ [PREFETCH] gridCoord ${key} failed:`, error?.response?.data || error.message);
      }
      return null;
    })
    .finally(() => {
      if (inflight?.gridCoord === key) inflight = null;
    });

  inflight = { gridCoord: key, promise };
  return promise;
}

/** Return and remove the cached bundle for `gridCoord` when fresh; null otherwise. */
export function takePrefetched(gridCoord) {
  const key = toKey(gridCoord);
  const entry = cache.get(key);
  if (!entry) return null;
  cache.delete(key);
  return isFresh(entry) ? entry : null;
}

/** Drop everything (called on every grid change). An in-flight response is discarded. */
export function clear() {
  cache.clear();
  refused.clear();
  generation += 1;
}
