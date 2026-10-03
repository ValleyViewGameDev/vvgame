// GlobalGridStateTilesAndResources.js
//
// Module-level mirror of the loaded grid: tiles, resources, and the grid's
// metadata from the `enter-grid` bundle (`gridMeta`). Feature code that is not
// a React component reads the current grid from here. Also holds the
// frontier world map (`GET /api/world-map/:frontierId`) used by canTravel.
const GlobalGridStateTilesAndResources = {
  tiles: [],
  resources: [],
  gridMeta: null,
  worldMap: null,

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

  /**
   * Frontier world map (docs/phase-3-contract.md §4.1):
   * { frontierId, settlements: [8][8] of { settlementId, type, open, cells } }
   * where `cells` is a 64-char row-major string: H (someone's homestead),
   * M (your homestead), T (town), V (valley), R (reserved / closed).
   * Fetched once at boot and after a homestead relocation; null until then.
   */
  setWorldMap(map) {
    this.worldMap = map && Array.isArray(map.settlements) ? map : null;
  },

  getWorldMap() {
    return this.worldMap;
  },
};

export default GlobalGridStateTilesAndResources;
