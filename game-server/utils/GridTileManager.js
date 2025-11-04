// GridTileManager.js
// Handles dual-path tile loading and management for grid optimization

const TileEncoder = require('./TileEncoder');

class GridTileManager {
  constructor() {
    this.initialized = true; // TileEncoder doesn't need external resources
  }

  /**
   * Load tiles from a grid document
   * @param {Object} grid - The grid document from MongoDB
   * @returns {Array<Array<string>>} - 64x64 2D array of tile types
   */
  getTiles(grid) {
    if (!grid) {
      return this.createEmptyTileGrid();
    }

    // All grids now use compressed tiles field
    if (grid.tiles && typeof grid.tiles === 'string') {
      return this.decodeTilesV2(grid.tiles);
    }
    
    return this.createEmptyTileGrid();
  }

  /**
   * Decode tiles
   * @param {string} encodedTiles - Base64 encoded compressed tile data
   * @returns {Array<Array<string>>} - 64x64 2D array of tile types
   */
  decodeTilesV2(encodedTiles) {
    try {
      return TileEncoder.decode(encodedTiles);
    } catch (error) {
      console.error('❌ Failed to decode tiles:', error);
      throw new Error(`Failed to decode tiles: ${error.message}`);
    }
  }

  /**
   * Encode tiles
   * @param {Array<Array<string>>} tiles - 64x64 2D array of tile types
   * @returns {string} - Base64 encoded compressed tile data
   */
  encodeTilesV2(tiles) {
    try {
      return TileEncoder.encode(tiles);
    } catch (error) {
      console.error('❌ Failed to encode tiles:', error);
      throw new Error(`Failed to encode tiles: ${error.message}`);
    }
  }

  /**
   * Update a single tile in the grid
   * @param {Object} grid - The grid document
   * @param {number} x - X coordinate (0-63)
   * @param {number} y - Y coordinate (0-63)  
   * @param {string} newTileType - New tile type ('g', 'd', 'p', 's', etc.)
   * @returns {Object} - Updated grid document (not saved)
   */
  updateTile(grid, x, y, newTileType) {
    // Validate coordinates
    if (x < 0 || x >= 64 || y < 0 || y >= 64) {
      throw new Error(`Invalid tile coordinates: (${x}, ${y}). Must be 0-63.`);
    }

    // Validate tile type
    if (!TileEncoder.isValidTileType(newTileType)) {
      throw new Error(`Invalid tile type: ${newTileType}. Valid types: ${TileEncoder.getSupportedTileTypes().join(', ')}`);
    }

    // All grids now use compressed tiles
    if (!grid.tiles) {
      // Create default grass grid if no tiles exist
      const defaultTiles = this.createEmptyTileGrid();
      grid.tiles = this.encodeTilesV2(defaultTiles);
    }
    
    try {
      const decodedTiles = this.decodeTilesV2(grid.tiles);
      decodedTiles[y][x] = newTileType;
      grid.tiles = this.encodeTilesV2(decodedTiles);
    } catch (error) {
      console.error('❌ Failed to update tiles:', error);
      throw error;
    }

    return grid;
  }

  /**
   * Get a single tile from the grid
   * @param {Object} grid - The grid document
   * @param {number} x - X coordinate (0-63)
   * @param {number} y - Y coordinate (0-63)
   * @returns {string} - Tile type
   */
  getTile(grid, x, y) {
    // Validate coordinates
    if (x < 0 || x >= 64 || y < 0 || y >= 64) {
      throw new Error(`Invalid tile coordinates: (${x}, ${y}). Must be 0-63.`);
    }

    const tiles = this.getTiles(grid);
    return tiles[y][x];
  }

  /**
   * Create an empty 64x64 grass grid
   * @returns {Array<Array<string>>} - 64x64 2D array filled with grass tiles
   */
  createEmptyTileGrid() {
    const tiles = [];
    for (let y = 0; y < 64; y++) {
      const row = [];
      for (let x = 0; x < 64; x++) {
        row.push('g'); // Default to grass
      }
      tiles.push(row);
    }
    return tiles;
  }

  /**
   * Get statistics about tile storage
   * @param {Object} grid - The grid document
   * @returns {Object} - Statistics about storage usage
   */
  getStorageStats(grid) {
    if (!grid) return { error: 'No grid provided' };

    const stats = {
      hasTiles: !!(grid.tiles && typeof grid.tiles === 'string'),
      lastOptimized: grid.lastOptimized || null
    };

    // Calculate storage size
    if (grid.tiles) {
      stats.storageSize = grid.tiles.length;
    }

    return stats;
  }

  /**
   * Validate tile data integrity
   * @param {Object} grid - The grid document
   * @returns {Object} - Validation result
   */
  validateTileIntegrity(grid) {
    const result = {
      valid: true,
      errors: [],
      warnings: []
    };

    if (!grid) {
      result.valid = false;
      result.errors.push('No grid provided');
      return result;
    }

    // Check V2 tiles
    if (grid.tiles) {
      try {
        if (typeof grid.tiles !== 'string') {
          result.errors.push('Tiles is not a string');
          result.valid = false;
        } else {
          // Test decode tiles
          const decodedTiles = this.decodeTilesV2(grid.tiles);
          
          // Validate dimensions
          if (decodedTiles.length !== 64) {
            result.errors.push(`Decoded tiles has ${decodedTiles.length} rows, expected 64`);
            result.valid = false;
          }
        }
      } catch (error) {
        result.errors.push(`Validation error: ${error.message}`);
        result.valid = false;
      }
    }

    return result;
  }
}

// Export singleton instance
const gridTileManager = new GridTileManager();
module.exports = gridTileManager;