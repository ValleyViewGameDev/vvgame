import axios from 'axios';
import API_BASE from '../config';
import GlobalGridStateTilesAndResources from '../GridState/GlobalGridStateTilesAndResources';
import { parseGridCoord } from './gridsVisitedUtils';

/**
 * Frontier world map (docs/phase-3-contract.md §4.1).
 *
 * `GET /api/world-map/:frontierId?playerId=` → { settlements: [8][8] of
 * { settlementId, type, open, cells } }. The client keeps it in
 * GlobalGridStateTilesAndResources; canTravel (Transit.js) reads cells from it.
 */

/**
 * Fetch the map into the store. Non-fatal: on any failure the store is left
 * as it was (null at boot) and canTravel defers to the server. Returns the map or null.
 */
export async function fetchWorldMap(frontierId, playerId) {
  if (!frontierId) return null;
  try {
    const query = playerId ? `?playerId=${encodeURIComponent(String(playerId))}` : '';
    const response = await axios.get(`${API_BASE}/api/world-map/${frontierId}${query}`);
    const map = response.data;
    if (!map || !Array.isArray(map.settlements)) {
      console.warn('⚠️ [WORLD MAP] Unexpected response; travel validation falls back to the server');
      return null;
    }
    GlobalGridStateTilesAndResources.setWorldMap(map);
    return map;
  } catch (error) {
    console.warn('⚠️ [WORLD MAP] Fetch failed; travel validation falls back to the server:', error?.response?.data || error.message);
    return null;
  }
}

/**
 * The world-map cell for a gridCoord: 'H' | 'M' | 'T' | 'V' | 'R'.
 * A closed settlement (`open === false`) or a missing entry reads as 'R'.
 * Returns null when no map is loaded (the caller lets the server decide).
 */
export function worldMapCell(gridCoord) {
  const map = GlobalGridStateTilesAndResources.getWorldMap();
  if (!map) return null;
  const parsed = parseGridCoord(gridCoord);
  if (!parsed) return 'R';
  const entry = map.settlements?.[parsed.settlementRow]?.[parsed.settlementCol];
  if (!entry || entry.open === false) return 'R';
  const cells = entry.cells;
  if (typeof cells !== 'string' || cells.length < 64) return 'R';
  return cells[parsed.gridRow * 8 + parsed.gridCol] || 'R';
}
