/**
 * UnifiedCamera.js - Unified World Model for Fixed Player Position Camera
 *
 * The world is ALWAYS the full frontier size (4096×4096 tiles) plus TRUE PADDING.
 * Container size scales proportionally with zoomScale - no jumps, no coordinate system changes.
 *
 * This eliminates the root cause of camera jitter: coordinate systems that change at each zoom level.
 *
 * World Structure:
 * - Frontier: 8×8 settlements (64 total, real DB data)
 * - Settlement: 8×8 grids (64 per settlement)
 * - Grid: 64×64 tiles (4096 per grid)
 * - TRUE PADDING: 4 settlements on each side (visual only, no DB data exists)
 *
 * Total World Size Calculation:
 * - TILES_PER_SETTLEMENT = 8 grids × 64 tiles = 512 tiles
 * - TILES_PER_FRONTIER = 8 settlements × 512 = 4096 tiles
 * - Padding = 2 sides × 4 settlements × 512 = 4096 tiles
 * - WORLD_SIZE_TILES = 4096 + 4096 = 8192×8192 tiles (16×16 settlements)
 */

// World structure constants
// 4 settlements of padding on each side ensures the camera is never scroll-constrained
// at frontier zoom, regardless of player location within the 8×8 frontier
export const WORLD_PADDING_SETTLEMENTS = 4;
export const SETTLEMENTS_PER_FRONTIER = 8;   // 8×8 settlements in the frontier
export const GRIDS_PER_SETTLEMENT = 8;       // 8×8 grids per settlement
export const TILES_PER_GRID = 64;            // 64×64 tiles per grid

// Derived constants
export const TILES_PER_SETTLEMENT = GRIDS_PER_SETTLEMENT * TILES_PER_GRID; // 512 tiles
export const TILES_PER_FRONTIER = SETTLEMENTS_PER_FRONTIER * TILES_PER_SETTLEMENT; // 4096 tiles
export const WORLD_SIZE_TILES = TILES_PER_FRONTIER + 2 * WORLD_PADDING_SETTLEMENTS * TILES_PER_SETTLEMENT; // 8192 tiles (16×16 settlements)

// Grids and settlements including padding
export const GRIDS_PER_FRONTIER = SETTLEMENTS_PER_FRONTIER * GRIDS_PER_SETTLEMENT; // 64 grids
export const TOTAL_SETTLEMENTS = SETTLEMENTS_PER_FRONTIER + 2 * WORLD_PADDING_SETTLEMENTS; // 16 settlements (8 + 2×4)
export const TOTAL_GRIDS = GRIDS_PER_FRONTIER + 2 * WORLD_PADDING_SETTLEMENTS * GRIDS_PER_SETTLEMENT; // 128 grids (64 + 2×4×8)

// Fixed player screen position - player is ALWAYS at this pixel position in the viewport
export const PLAYER_FIXED_POSITION = { x: 450, y: 350 };

/**
 * Calculate the player's absolute world position in TILES.
 * This is the ONE formula used at ALL zoom levels - no coordinate system switching.
 *
 * @param {Object} playerTilePos - Player's position within the grid { x, y } (0-63)
 * @param {Object} gridPosition - Grid's position within the settlement { row, col } (0-7)
 * @param {Object} settlementPosition - Settlement's position in frontier { row, col } (0-7)
 * @returns {Object} Player's absolute world position in tiles { x, y }
 */
export function getPlayerWorldPosition(playerTilePos, gridPosition, settlementPosition) {
  const { x: tileX, y: tileY } = playerTilePos || { x: 0, y: 0 };
  const { row: gridRow, col: gridCol } = gridPosition || { row: 0, col: 0 };
  const { row: settlementRow, col: settlementCol } = settlementPosition || { row: 0, col: 0 };

  // World position = padding offset + settlement offset + grid offset + tile position
  return {
    x: WORLD_PADDING_SETTLEMENTS * TILES_PER_SETTLEMENT
       + settlementCol * TILES_PER_SETTLEMENT
       + gridCol * TILES_PER_GRID
       + tileX,
    y: WORLD_PADDING_SETTLEMENTS * TILES_PER_SETTLEMENT
       + settlementRow * TILES_PER_SETTLEMENT
       + gridRow * TILES_PER_GRID
       + tileY
  };
}

/**
 * Calculate the scroll position needed to keep the player at the fixed screen position.
 * This formula scales LINEARLY with zoomScale - no jumps when zoom level changes.
 *
 * @param {Object} playerWorldPos - Player's absolute world position in tiles { x, y }
 * @param {number} zoomScale - Current CSS zoom scale
 * @param {number} baseTileSize - Size of one tile in base pixels (before zoom)
 * @param {Object} fixedScreenPos - Fixed screen position for player { x, y }
 * @returns {Object} Scroll position { x, y }
 */
export function getScrollPosition(playerWorldPos, zoomScale, baseTileSize, fixedScreenPos = PLAYER_FIXED_POSITION) {
  return {
    x: playerWorldPos.x * baseTileSize * zoomScale - fixedScreenPos.x,
    y: playerWorldPos.y * baseTileSize * zoomScale - fixedScreenPos.y
  };
}

/**
 * Get the total world size in pixels at the given zoom scale.
 * This is the container size - it scales proportionally with zoomScale.
 *
 * @param {number} zoomScale - Current CSS zoom scale
 * @param {number} baseTileSize - Size of one tile in base pixels
 * @returns {number} World size in pixels
 */
export function getWorldPixelSize(zoomScale, baseTileSize) {
  return WORLD_SIZE_TILES * baseTileSize * zoomScale;
}

/**
 * Get the absolute world position for a grid (in pixels).
 * Used for positioning PixiJS canvas and other content.
 *
 * @param {Object} gridPosition - Grid's position within settlement { row, col } (0-7)
 * @param {Object} settlementPosition - Settlement's position in frontier { row, col } (0-7)
 * @param {number} zoomScale - Current CSS zoom scale
 * @param {number} baseTileSize - Size of one tile in base pixels
 * @returns {Object} Grid's absolute pixel position { x, y }
 */
export function getGridWorldPixelPosition(gridPosition, settlementPosition, zoomScale, baseTileSize) {
  const { row: gridRow, col: gridCol } = gridPosition || { row: 0, col: 0 };
  const { row: settlementRow, col: settlementCol } = settlementPosition || { row: 0, col: 0 };

  const gridWorldTileX = WORLD_PADDING_SETTLEMENTS * TILES_PER_SETTLEMENT
    + settlementCol * TILES_PER_SETTLEMENT
    + gridCol * TILES_PER_GRID;

  const gridWorldTileY = WORLD_PADDING_SETTLEMENTS * TILES_PER_SETTLEMENT
    + settlementRow * TILES_PER_SETTLEMENT
    + gridRow * TILES_PER_GRID;

  return {
    x: gridWorldTileX * baseTileSize * zoomScale,
    y: gridWorldTileY * baseTileSize * zoomScale
  };
}

/**
 * Get the absolute world position for a settlement (in pixels).
 * Used for positioning settlement content in frontier view.
 *
 * @param {Object} settlementPosition - Settlement's position in frontier { row, col } (0-7)
 * @param {number} zoomScale - Current CSS zoom scale
 * @param {number} baseTileSize - Size of one tile in base pixels
 * @returns {Object} Settlement's absolute pixel position { x, y }
 */
export function getSettlementWorldPixelPosition(settlementPosition, zoomScale, baseTileSize) {
  const { row: settlementRow, col: settlementCol } = settlementPosition || { row: 0, col: 0 };

  const settlementWorldTileX = WORLD_PADDING_SETTLEMENTS * TILES_PER_SETTLEMENT
    + settlementCol * TILES_PER_SETTLEMENT;

  const settlementWorldTileY = WORLD_PADDING_SETTLEMENTS * TILES_PER_SETTLEMENT
    + settlementRow * TILES_PER_SETTLEMENT;

  return {
    x: settlementWorldTileX * baseTileSize * zoomScale,
    y: settlementWorldTileY * baseTileSize * zoomScale
  };
}

/**
 * Get the size of one grid in pixels at the current zoom scale.
 *
 * @param {number} zoomScale - Current CSS zoom scale
 * @param {number} baseTileSize - Size of one tile in base pixels
 * @returns {number} Grid size in pixels
 */
export function getGridPixelSize(zoomScale, baseTileSize) {
  return TILES_PER_GRID * baseTileSize * zoomScale;
}

/**
 * Get the size of one settlement in pixels at the current zoom scale.
 *
 * @param {number} zoomScale - Current CSS zoom scale
 * @param {number} baseTileSize - Size of one tile in base pixels
 * @returns {number} Settlement size in pixels
 */
export function getSettlementPixelSize(zoomScale, baseTileSize) {
  return TILES_PER_SETTLEMENT * baseTileSize * zoomScale;
}

/**
 * Extract settlement and grid positions from a gridCoord.
 *
 * GridCoord format: TTIISSGGCC (8 digits) where:
 * - TT = frontier tier (2 digits, padded)
 * - II = frontier index (2 digits, padded)
 * - SS = settlement row (1 digit) + settlement col (1 digit)
 * - GG = grid row (1 digit) + grid col (1 digit)
 *
 * Example: 01023456 = tier 01, index 02, settlement (3,4), grid (5,6)
 *
 * @param {number} gridCoord - The encoded grid coordinate
 * @returns {Object} Decoded positions { settlementRow, settlementCol, gridRow, gridCol }
 */
export function parseGridCoord(gridCoord) {
  if (gridCoord === null || gridCoord === undefined || gridCoord < 0) {
    return null;
  }

  // Convert to string and pad to 8 digits
  const coordStr = String(gridCoord).padStart(8, '0');

  // Extract positions from the string
  // Format: TTIISSGG where positions are:
  // 0-1: tier, 2-3: index, 4: settlementRow, 5: settlementCol, 6: gridRow, 7: gridCol
  const settlementRow = parseInt(coordStr[4], 10);
  const settlementCol = parseInt(coordStr[5], 10);
  const gridRow = parseInt(coordStr[6], 10);
  const gridCol = parseInt(coordStr[7], 10);

  return {
    settlementRow,
    settlementCol,
    gridRow,
    gridCol,
    // Also provide as position objects for convenience
    settlementPosition: { row: settlementRow, col: settlementCol },
    gridPosition: { row: gridRow, col: gridCol }
  };
}
