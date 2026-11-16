/**
 * Where nothing may be built (owner 2026-11-16, docs/season-reset.md). Server twin:
 * game-server/utils/buildRules.js (same rules, same reasons; the server refuses on its own).
 *
 *   - Valley3 grids: nothing is placed, planted, terraformed or moved there (they are rebuilt for
 *     everyone every season; chopping, mining and collecting still work).
 *   - Homestead columns 0-7 (x < 8; owner 2026-11-16): nothing is placed, planted, terraformed or moved into them.
 */
export const HOMESTEAD_RESERVED_COLUMNS = 8;

/** Why nothing can be built on these cells ([{ x, y }]) of a grid of this type, or null. */
export function noBuildReason(gridType, cells) {
  if (gridType === 'valley3') return 'no-build-valley3';
  if (gridType === 'homestead' && (cells || []).some((c) => Number(c.x) < HOMESTEAD_RESERVED_COLUMNS)) return 'reserved-columns';
  return null;
}

/** The status-bar string for a reason (strings 10260 / 10261). */
export const NO_BUILD_STRING = { 'no-build-valley3': 10260, 'reserved-columns': 10261 };
