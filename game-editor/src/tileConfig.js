// Shared tile color configuration
// Source of truth: game-client/src/Render/RenderTilesCanvas.js

// Single-letter keys (used by GridEditor sliders/checkboxes)
export const tileColors = {
  g: "#67c257",    // grass
  s: "#8fa6bdff",  // stone
  d: "#c0834a",    // dirt
  w: "#58cad8",    // water
  p: "#c5a85d",    // pavement
  l: "#c4583d",    // lava
  n: "#fbde00",    // sand
  x: "#959ba3ff",  // cobblestone
  y: "#000000ff",  // dungeon
  z: "#1b712cff",  // moss
};

// Two-letter layout keys (used by Tile.jsx rendering)
export const layoutKeyColors = {
  "**": "#fff",       // none
  "GR": "#67c257",    // grass
  "SL": "#8fa6bdff",  // stone
  "DI": "#c0834a",    // dirt
  "WA": "#58cad8",    // water
  "PA": "#c5a85d",    // pavement
  "LV": "#c4583d",    // lava
  "SA": "#fbde00",    // sand
  "CB": "#959ba3ff",  // cobblestone
  "DU": "#000000ff",  // dungeon
  "ZZ": "#1b712cff",  // moss
};

// Default color for unknown tile types
export const defaultTileColor = "#fff";
