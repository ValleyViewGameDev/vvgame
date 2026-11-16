/**
 * Where nothing may be built (owner 2026-11-16, docs/season-reset.md). Client twin:
 * game-client/src/Utils/buildRules.js (same rules, same reasons).
 *
 *   - Valley3 grids are the story stage, rebuilt for everyone every season: nothing is placed,
 *     planted, terraformed or moved there (chopping, mining and collecting still work).
 *   - Homestead columns 0-7 (x < 8; owner 2026-11-16) are kept free for features shipped to every homestead later:
 *     nothing is placed, planted, terraformed or moved INTO them (what is already there stays,
 *     and may be moved out).
 */
const HOMESTEAD_RESERVED_COLUMNS = 8;

/**
 * Why nothing can be built on these tiles of this grid, or null. `cells` = [{ x, y }] (a footprint).
 * Reasons: 'no-build-valley3', 'reserved-columns'.
 */
function noBuildReason(grid, cells) {
  const type = String(grid?.gridType || '');
  if (type === 'valley3') return 'no-build-valley3';
  if (type === 'homestead' && (cells || []).some((c) => Number(c.x) < HOMESTEAD_RESERVED_COLUMNS)) return 'reserved-columns';
  return null;
}

/** The cells of a footprint anchored at its lower-left tile (x .. x+w-1, y-h+1 .. y). */
const cellsOf = (x, y, w = 1, h = w) => {
  const out = [];
  for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) out.push({ x: x + dx, y: y - dy });
  return out;
};

module.exports = { HOMESTEAD_RESERVED_COLUMNS, noBuildReason, cellsOf };
