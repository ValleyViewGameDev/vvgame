/**
 * Centralized Tile Color Configuration
 *
 * This file is the single source of truth for tile colors used throughout
 * the game client and editor. Import from here to ensure consistency.
 *
 * Usage:
 *   import { tileColors, getLayoutKeyColor, defaultTileColor } from '../UI/Styles/tileColors';
 */

// Single-letter tile type keys (used by game rendering and editor)
export const tileColors = {
  g: '#9cbb4dff',    // grass
  s: '#97968bff',  // stone/slate
  d: '#c98f59ff',    // dirt
  w: '#58cad8',    // water
  p: '#f5bf89ff',    // pavement
  l: '#c4583d',    // lava
  n: '#e0ca24ff',    // sand
  o: '#ffffff',    // snow
  x: '#acaa89ff',  // cobblestone
  y: '#000000ff',  // dungeon
  z: '#3f7449ff',  // moss
  c: '#6c3b3bff',  // clay
  v: '#44551dff',  // tbdTile1
  u: '#1b712cff',  // tbdTile2
};

// Mapping from two-letter layout keys to single-letter tile types
// Used by game-editor's Tile.jsx to look up colors from tileColors
export const LAYOUT_KEY_TO_TILE_TYPE = {
  '**': null,  // none
  'GR': 'g',   // grass
  'SL': 's',   // stone/slate
  'DI': 'd',   // dirt
  'WA': 'w',   // water
  'PA': 'p',   // pavement
  'LV': 'l',   // lava
  'SA': 'n',   // sand
  'SN': 'o',   // snow
  'CB': 'x',   // cobblestone
  'DU': 'y',   // dungeon
  'ZZ': 'z',   // moss
  'CL': 'c',   // clay
  'V1': 'v',   // tbdTile1
  'U2': 'u',   // tbdTile2
};

// Helper to get color from two-letter layout key
export function getLayoutKeyColor(layoutKey) {
  if (layoutKey === '**') return '#fff';
  const tileType = LAYOUT_KEY_TO_TILE_TYPE[layoutKey];
  return tileType ? tileColors[tileType] : defaultTileColor;
}

// Tile rounding configuration - which tile types should have rounded corners
export const tileRoundingConfig = {
  g: true,   // grass - rounded
  s: true,   // stone - rounded
  w: true,   // water - rounded
  l: true,   // lava - rounded
  n: true,   // sand - rounded
  o: true,   // snow - rounded
  d: false,  // dirt - no rounding (base layer)
  p: true,   // pavement - rounded
  x: true,   // cobblestone - rounded
  y: false,  // dungeon - no rounding
  z: false,  // moss - no rounding
  c: false,  // clay - no rounding
  v: false,  // tbdTile1 - no rounding
  u: false,  // tbdTile2 - no rounding
};

// Bit mappings for encoded tile data (used by RenderVisitedGrid)
// 4 bits per tile allows 16 tile types (0-15)
export const BITS_TO_TILE_TYPE = {
  0b0000: 'g', // grass
  0b0001: 's', // slate/stone
  0b0010: 'd', // dirt
  0b0011: 'w', // water
  0b0100: 'p', // pavement
  0b0101: 'l', // lava
  0b0110: 'n', // sand
  0b0111: 'o', // snow
  0b1000: 'x', // cobblestone
  0b1001: 'y', // dungeon
  0b1010: 'z', // moss
  0b1011: 'c', // clay
  0b1100: 'v', // tbdTile1
  0b1101: 'u', // tbdTile2
  // 0b1110, 0b1111 reserved for future tiles
};

// Reverse mapping: tile type to bits (for encoding)
export const TILE_TYPE_TO_BITS = Object.fromEntries(
  Object.entries(BITS_TO_TILE_TYPE).map(([bits, type]) => [type, parseInt(bits)])
);

// Priority order for corner color calculations
export const tilePriorityOrder = ['w', 'l', 's', 'd', 'g', 'p', 'n', 'o', 'x', 'y', 'z', 'c', 'v', 'u'];

// Default color for unknown tile types
export const defaultTileColor = '#ff0000'; // debug red

// Helper function to get tile color
export function getTileColor(tileType) {
  return tileColors[tileType] || defaultTileColor;
}
