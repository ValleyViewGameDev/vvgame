/**
 * Autotiling Utility Module
 * Provides quarter-tile based autotiling for organic transitions between tile types
 */

import { getTileColor, tilePriorityOrder } from '../UI/Styles/tileColors';

// Neighbor offsets for each quarter [rowOffset, colOffset]
// Each quarter checks: horizontal neighbor, vertical neighbor, diagonal neighbor
const QUARTER_NEIGHBORS = {
  topLeft: { h: [0, -1], v: [-1, 0], d: [-1, -1] },     // left, top, top-left
  topRight: { h: [0, 1], v: [-1, 0], d: [-1, 1] },      // right, top, top-right
  bottomLeft: { h: [0, -1], v: [1, 0], d: [1, -1] },    // left, bottom, bottom-left
  bottomRight: { h: [0, 1], v: [1, 0], d: [1, 1] }      // right, bottom, bottom-right
};

// Position offsets for each quarter within a tile [x multiplier, y multiplier]
export const QUARTER_POSITIONS = {
  topLeft: [0, 0],
  topRight: [1, 0],
  bottomLeft: [0, 1],
  bottomRight: [1, 1]
};

// Direction each quarter's edge faces when there's a horizontal or vertical neighbor difference
export const QUARTER_EDGE_DIRECTIONS = {
  topLeft: { h: 'left', v: 'top' },
  topRight: { h: 'right', v: 'top' },
  bottomLeft: { h: 'left', v: 'bottom' },
  bottomRight: { h: 'right', v: 'bottom' }
};

// Transition configuration per tile type
export const tileTransitions = {
  g: { edgeDecor: 'grassBlades', blendStyle: 'organic', decorColor: 'rgba(30, 100, 30, 0.6)' },
  d: { edgeDecor: 'dirtParticles', blendStyle: 'organic', decorColor: 'rgba(100, 70, 40, 0.4)' },
  n: { edgeDecor: 'sandGrains', blendStyle: 'organic', decorColor: 'rgba(180, 160, 100, 0.3)' },
  s: { edgeDecor: null, blendStyle: 'hard' },
  p: { edgeDecor: null, blendStyle: 'hard' },
  x: { edgeDecor: null, blendStyle: 'hard' },
  w: { edgeDecor: 'ripples', blendStyle: 'ripple', decorColor: 'rgba(100, 150, 200, 0.3)' },
  l: { edgeDecor: null, blendStyle: 'glow' },
  o: { edgeDecor: 'snowDust', blendStyle: 'organic', decorColor: 'rgba(255, 255, 255, 0.4)' },
  z: { edgeDecor: 'mossPatches', blendStyle: 'organic', decorColor: 'rgba(60, 120, 60, 0.5)' },
  c: { edgeDecor: 'clayChunks', blendStyle: 'organic', decorColor: 'rgba(150, 100, 70, 0.3)' },
  y: { edgeDecor: null, blendStyle: 'hard' },
  v: { edgeDecor: null, blendStyle: 'organic' },
  u: { edgeDecor: null, blendStyle: 'organic' }
};

/**
 * Get the neighbor tile type at a given offset
 */
function getNeighbor(tileTypes, row, col, offset, defaultType) {
  const neighborRow = row + offset[0];
  const neighborCol = col + offset[1];
  return tileTypes[neighborRow]?.[neighborCol] ?? defaultType;
}

/**
 * Analyze a quarter-tile's neighbors and determine rendering info
 * @param {string} tileType - Current tile type
 * @param {string} quarter - Which quarter ('topLeft', 'topRight', 'bottomLeft', 'bottomRight')
 * @param {number} row - Row index
 * @param {number} col - Column index
 * @param {Array} tileTypes - 2D array of tile types
 * @returns {Object} { blendType, neighborType, direction }
 */
export function getQuarterTileInfo(tileType, quarter, row, col, tileTypes) {
  const neighbors = QUARTER_NEIGHBORS[quarter];
  const directions = QUARTER_EDGE_DIRECTIONS[quarter];

  const hNeighbor = getNeighbor(tileTypes, row, col, neighbors.h, tileType);
  const vNeighbor = getNeighbor(tileTypes, row, col, neighbors.v, tileType);
  const dNeighbor = getNeighbor(tileTypes, row, col, neighbors.d, tileType);

  const hDiff = hNeighbor !== tileType;
  const vDiff = vNeighbor !== tileType;
  const dDiff = dNeighbor !== tileType;

  // No differences - solid quarter
  if (!hDiff && !vDiff && !dDiff) {
    return { blendType: 'solid', neighborType: null, direction: null };
  }

  // Both cardinal neighbors different = outer corner
  if (hDiff && vDiff) {
    // Determine which neighbor type to use based on priority
    const hPriority = tilePriorityOrder.indexOf(hNeighbor);
    const vPriority = tilePriorityOrder.indexOf(vNeighbor);
    const dominantNeighbor = hPriority <= vPriority ? hNeighbor : vNeighbor;
    return { blendType: 'corner', neighborType: dominantNeighbor, direction: quarter };
  }

  // One cardinal neighbor different = edge
  if (hDiff) {
    return { blendType: 'edge', neighborType: hNeighbor, direction: directions.h };
  }
  if (vDiff) {
    return { blendType: 'edge', neighborType: vNeighbor, direction: directions.v };
  }

  // Only diagonal different = inner corner
  if (dDiff) {
    return { blendType: 'innerCorner', neighborType: dNeighbor, direction: quarter };
  }

  return { blendType: 'solid', neighborType: null, direction: null };
}

/**
 * Get edge decorations for a tile based on its neighbors
 * @param {string} tileType - Current tile type
 * @param {number} row - Row index
 * @param {number} col - Column index
 * @param {Array} tileTypes - 2D array of tile types
 * @returns {Array} Array of decoration objects
 */
export function getEdgeDecorations(tileType, row, col, tileTypes) {
  const decorations = [];
  const config = tileTransitions[tileType];

  if (!config?.edgeDecor) return decorations;

  // Check each cardinal edge
  const edges = [
    { dir: 'top', offset: [-1, 0] },
    { dir: 'bottom', offset: [1, 0] },
    { dir: 'left', offset: [0, -1] },
    { dir: 'right', offset: [0, 1] }
  ];

  edges.forEach(({ dir, offset }) => {
    const neighborType = getNeighbor(tileTypes, row, col, offset, tileType);
    if (neighborType !== tileType) {
      // Generate a consistent seed based on position and direction
      const seed = (row * 1000 + col * 10 + dir.charCodeAt(0)) % 10000;
      decorations.push({
        side: dir,
        decorType: config.edgeDecor,
        decorColor: config.decorColor,
        neighborType,
        seed
      });
    }
  });

  return decorations;
}

/**
 * Get Level of Detail configuration based on zoom level
 * @param {string} zoomLevel - Current zoom level
 * @param {number} TILE_SIZE - Current tile size in pixels
 */
export function getLODConfig(zoomLevel, TILE_SIZE) {
  const cornerRadius = Math.max(1, Math.floor(TILE_SIZE * 0.15));

  const configs = {
    closer: {
      cornerRadius,
      useQuarters: true,
      edgeDecor: true,
      variations: 4,
      bladeDetail: 'high',
      bladeCount: [4, 7],  // min-max blades
      bladeHeight: TILE_SIZE * 0.18
    },
    close: {
      cornerRadius,
      useQuarters: true,
      edgeDecor: true,
      variations: 4,
      bladeDetail: 'medium',
      bladeCount: [3, 5],
      bladeHeight: TILE_SIZE * 0.15
    },
    far: {
      cornerRadius: Math.max(1, Math.floor(cornerRadius / 2)),
      useQuarters: true,
      edgeDecor: false,  // Skip decorations at far zoom for performance
      variations: 1,
      bladeDetail: 'none',
      bladeCount: [0, 0],
      bladeHeight: 0
    }
  };

  return configs[zoomLevel] || configs.close;
}

/**
 * Check if a tile has any transitions (for fast-path optimization)
 * @returns {boolean} True if any neighbor is different
 */
export function hasTileTransitions(tileType, row, col, tileTypes) {
  const offsets = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],          [0, 1],
    [1, -1], [1, 0], [1, 1]
  ];

  for (const offset of offsets) {
    const neighbor = getNeighbor(tileTypes, row, col, offset, tileType);
    if (neighbor !== tileType) {
      return true;
    }
  }
  return false;
}

/**
 * Determine which tile type should be on top in a transition
 * Based on tile priority order (lower index = higher priority)
 */
export function getTransitionPriority(type1, type2) {
  const p1 = tilePriorityOrder.indexOf(type1);
  const p2 = tilePriorityOrder.indexOf(type2);

  // -1 means not found, treat as lowest priority
  const priority1 = p1 === -1 ? 999 : p1;
  const priority2 = p2 === -1 ? 999 : p2;

  return priority1 <= priority2 ? type1 : type2;
}
