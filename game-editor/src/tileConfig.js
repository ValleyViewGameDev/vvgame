// Shared tile color configuration
// Source of truth: game-client/src/UI/Styles/tileColors.js
// Keep this file in sync with the centralized config

// Single-letter keys (used by GridEditor sliders/checkboxes)
export const tileColors = {
  g: "#67c257",    // grass
  s: "#8fa6bdff",  // stone/slate
  d: "#c0834a",    // dirt
  w: "#58cad8",    // water
  p: "#c5a85d",    // pavement
  l: "#c4583d",    // lava
  n: "#fbde00",    // sand
  o: "#ffffff",    // snow
  x: "#959ba3ff",  // cobblestone
  y: "#000000ff",  // dungeon
  z: "#1b712cff",  // moss
  c: "#6c3b3bff",  // clay
  v: "#44551dff",  // tbdTile1
  u: "#1b712cff",  // tbdTile2
};

// Two-letter layout keys (used by Tile.jsx rendering)
export const layoutKeyColors = {
  "**": "#fff",       // none
  "GR": "#67c257",    // grass
  "SL": "#8fa6bdff",  // stone/slate
  "DI": "#c0834a",    // dirt
  "WA": "#58cad8",    // water
  "PA": "#c5a85d",    // pavement
  "LV": "#c4583d",    // lava
  "SA": "#fbde00",    // sand
  "SN": "#ffffff",    // snow
  "CB": "#959ba3ff",  // cobblestone
  "DU": "#000000ff",  // dungeon
  "ZZ": "#1b712cff",  // moss
  "CY": "#6c3b3bff",  // clay
  "VV": "#44551dff",  // tbdTile1
  "UU": "#1b712cff",  // tbdTile2
};

// Default color for unknown tile types
export const defaultTileColor = "#fff";
