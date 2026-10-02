/**
 * Seasonal tile conversion (Winter: grass -> snow, Spring: snow -> grass).
 * Used by the season-end sweep over shared grids and by the lazy per-player catch-up
 * in gridResolver (docs/phase-2-contract.md).
 */
const TileEncoder = require('./TileEncoder');

function seasonTileSwap(seasonType) {
  const s = (seasonType || '').toLowerCase();
  if (s === 'winter') return { from: 'g', to: 'o' };
  if (s === 'spring') return { from: 'o', to: 'g' };
  return null;
}

/** Mutates grid.tiles in place when the season calls for it. Returns the number of tiles changed. */
function applySeasonTiles(grid, seasonType) {
  const swap = seasonTileSwap(seasonType);
  if (!swap || !grid.tiles) return 0;
  const tiles = TileEncoder.decode(grid.tiles);
  let changed = 0;
  for (let y = 0; y < tiles.length; y++) {
    for (let x = 0; x < tiles[y].length; x++) {
      if (tiles[y][x] === swap.from) { tiles[y][x] = swap.to; changed++; }
    }
  }
  if (changed) grid.tiles = TileEncoder.encode(tiles);
  return changed;
}

module.exports = { applySeasonTiles, seasonTileSwap };
