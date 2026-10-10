/**
 * World store: frontiers and settlements from the game server (GET /api/frontiers,
 * GET /api/settlements), loaded once and shared by the World and Atlas tabs, plus the
 * gridCoord arithmetic both tabs need. Reads only; nothing here writes.
 *
 * gridCoord is a 7-digit number FFFSSGG: FFF frontier prefix (101 ...), S settlement row/col
 * (0-7), G grid row/col inside the settlement (0-7). A frontier is therefore a 64x64 board
 * of grids: board row = settlementRow * 8 + gridRow, board col = settlementCol * 8 + gridCol.
 */
import { game } from './api.js';

export const SETTLEMENTS_PER_SIDE = 8;
export const GRIDS_PER_SETTLEMENT = 8;
export const BOARD = SETTLEMENTS_PER_SIDE * GRIDS_PER_SETTLEMENT; // 64

let cache = null; // { frontiers, settlements, loadedAt }

export async function loadWorld(force = false) {
  if (cache && !force) return cache;
  const [frontiers, settlements] = await Promise.all([game.get('/api/frontiers'), game.get('/api/settlements')]);
  cache = { frontiers: Array.isArray(frontiers) ? frontiers : [], settlements: Array.isArray(settlements) ? settlements : [], loadedAt: new Date() };
  return cache;
}
export function getWorld() { return cache; }

export const idOf = (v) => (v && typeof v === 'object' ? String(v._id ?? v) : v == null ? null : String(v));
export const isValleyType = (t) => typeof t === 'string' && t.startsWith('valley');

export function coordParts(gridCoord) {
  const s = String(gridCoord ?? '').padStart(7, '0');
  if (!/^\d{7}$/.test(s)) return null;
  const sr = +s[3], sc = +s[4], gr = +s[5], gc = +s[6];
  if (sr >= SETTLEMENTS_PER_SIDE || sc >= SETTLEMENTS_PER_SIDE || gr >= GRIDS_PER_SETTLEMENT || gc >= GRIDS_PER_SETTLEMENT) return null;
  return { prefix: s.slice(0, 3), settlementRow: sr, settlementCol: sc, gridRow: gr, gridCol: gc, row: sr * GRIDS_PER_SETTLEMENT + gr, col: sc * GRIDS_PER_SETTLEMENT + gc };
}
export function coordFrom(prefix, row, col) {
  const sPart = Math.floor(row / GRIDS_PER_SETTLEMENT) * 10 + Math.floor(col / GRIDS_PER_SETTLEMENT);
  const gPart = (row % GRIDS_PER_SETTLEMENT) * 10 + (col % GRIDS_PER_SETTLEMENT);
  return Number(prefix) * 10000 + sPart * 100 + gPart;
}

export function settlementsOf(world, frontierId) {
  return (world?.settlements || []).filter((s) => idOf(s.frontierId) === String(frontierId));
}

/**
 * A settlement is closed when it is a homestead settlement whose frontier entry says
 * `available: false` (the four corners today); the game never shows its grids, so neither
 * does the editor, even though the database still holds them. Same rule as the client's
 * PixiRendererFrontierSettlements.isClosedSettlement (docs/phase-3-contract.md).
 */
export function closedSettlementIds(world, frontierId) {
  const frontier = (world?.frontiers || []).find((f) => idOf(f._id) === String(frontierId));
  const closed = new Set();
  for (const row of Array.isArray(frontier?.settlements) ? frontier.settlements : []) {
    for (const e of Array.isArray(row) ? row : []) {
      if (e && typeof e.settlementType === 'string' && e.settlementType.startsWith('homestead') && e.available === false) closed.add(idOf(e.settlementId));
    }
  }
  return closed;
}

/** Map gridCoord -> grid cell enriched with its settlement (closed settlements left out). Cells carry gridId, gridType, region, available. */
export function gridMapOf(world, frontierId) {
  const map = new Map();
  const closed = closedSettlementIds(world, frontierId);
  for (const s of settlementsOf(world, frontierId)) {
    if (closed.has(idOf(s._id))) continue;
    const rows = Array.isArray(s.grids) ? s.grids : [];
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      for (const g of row) {
        if (!g || g.gridCoord == null) continue;
        map.set(Number(g.gridCoord), { ...g, gridCoord: Number(g.gridCoord), gridId: g.gridId ? idOf(g.gridId) : null, settlementId: idOf(s._id), settlementName: s.displayName || s.name, frontierId: idOf(s.frontierId) });
      }
    }
  }
  return map;
}

/** The 3-digit frontier prefix shared by a frontier's grids (from its settlements), or null. */
export function frontierPrefix(gridMap) {
  for (const coord of gridMap.keys()) { const p = coordParts(coord); if (p) return p.prefix; }
  return null;
}

// Town layouts that exist in layouts/gridLayouts/town (keep in step with that folder)
const TOWN_LAYOUTS = new Set(['townN', 'townS', 'townE', 'townW']);

/** Which town layout file the game server would use for this settlement (town<POS>), or null. */
export function townLayoutName(frontier, settlementId) {
  const rows = Array.isArray(frontier?.settlements) ? frontier.settlements : [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const entry = row.find((e) => e && idOf(e.settlementId) === String(settlementId));
    if (!entry) continue;
    // Same rule as the game server (templateUtils.getTownLayoutFile): the settlement's own
    // town<POS> layout when one exists, else the standard townN
    const m = String(entry.settlementType || '').match(/homesteadSet([NSEW]+)$/);
    return m && TOWN_LAYOUTS.has(`town${m[1]}`) ? `town${m[1]}` : 'townN';
  }
  return null;
}
