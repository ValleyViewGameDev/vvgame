// GlobalGridStateTilesAndResources.js
//
// Module-level mirror of the loaded grid: tiles, resources, and the grid's
// metadata from the `enter-grid` bundle (`gridMeta`). Feature code that is not
// a React component reads the current grid from here.
const GlobalGridStateTilesAndResources = {
  tiles: [],
  resources: [],
  gridMeta: null,

  setTiles(newTiles) {
    this.tiles = newTiles;
  },

  setResources(newResources) {
    this.resources = newResources;
  },

  getTiles() {
    return this.tiles;
  },

  getResources() {
    return this.resources;
  },

  /**
   * Metadata of the grid the player is in, seeded by changePlayerLocation from
   * the `enter-grid` response:
   * { gridId, gridType, gridCoord, templateKey, ownerId, ownerUsername,
   *   isFTUECave, region, settlementId, frontierId }
   */
  setGridMeta(meta) {
    this.gridMeta = meta ? { ...meta } : null;
  },

  getGridMeta() {
    return this.gridMeta;
  },
};

export default GlobalGridStateTilesAndResources;
