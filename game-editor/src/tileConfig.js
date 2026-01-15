// Shared tile color configuration
// Source of truth: game-client/src/UI/Styles/tileColors.js
// Keep this file in sync with the centralized config

// Single-letter keys (used by GridEditor sliders/checkboxes)
export const tileColors = {
  g: '#81ba44',    // grass
  s: '#8fa6bdff',  // stone/slate
  d: '#c0834a',    // dirt
  w: '#58cad8',    // water
  p: '#d3ce7b',    // pavement
  l: '#c4583d',    // lava
  n: '#fbde00',    // sand
  o: '#ffffff',    // snow
  x: '#959ba3ff',  // cobblestone
  y: '#000000ff',  // dungeon
  z: '#1b712cff',  // moss
  c: '#6c3b3bff',  // clay
  v: '#44551dff',  // tbdTile1
  u: '#1b712cff',  // tbdTile2
};

// Mapping from two-letter layout keys to single-letter tile types
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

// Default color for unknown tile types
export const defaultTileColor = '#ff0000'; // debug red

// Helper to get color from two-letter layout key
export function getLayoutKeyColor(layoutKey) {
  if (layoutKey === '**') return '#fff';
  const tileType = LAYOUT_KEY_TO_TILE_TYPE[layoutKey];
  return tileType ? tileColors[tileType] : defaultTileColor;
}
