// GridTileManager.js
// Handles dual-path tile loading and management for grid optimization

const TileEncoder = require('./TileEncoder');

class GridTileManager {
  constructor() {
    this.initialized = true; // TileEncoder doesn't need external resources
  }

  /**
   * Load tiles from a grid document, handling both v1 and v2 formats
   * @param {Object} grid - The grid document from MongoDB
   * @returns {Array<Array<string>>} - 64x64 2D array of tile types
   */
  getTiles(grid) {
    if (!grid) {
      return this.createEmptyTileGrid();
    }

    const schemaVersion = grid.tilesSchemaVersion_REMOVED || 'v1';

    switch (schemaVersion) {
      case 'v1':
        // Use original tiles field, fall back to v2 if tiles is empty/missing
        if (grid.tiles && Array.isArray(grid.tiles) && grid.tiles.length > 0) {
          return grid.tiles;
        } else if (grid.tiles && typeof grid.tiles === 'string') {
          // Decode v2 format as fallback
          return this.decodeTilesV2(grid.tiles);
        }
        return this.createEmptyTileGrid();

      case 'v2':
        // Use only v2 format
        if (grid.tiles && typeof grid.tiles === 'string') {
          return this.decodeTilesV2(grid.tiles);
        }
        return this.createEmptyTileGrid();

      default:
        console.warn(`Unknown tiles schema version: ${schemaVersion}, falling back to v1`);
        return grid.tiles || this.createEmptyTileGrid();
    }
  }

  /**
   * Decode v2 format tiles
   * @param {string} encodedTiles - Base64 encoded compressed tile data
   * @returns {Array<Array<string>>} - 64x64 2D array of tile types
   */
  decodeTilesV2(encodedTiles) {
    try {
      return TileEncoder.decode(encodedTiles);
    } catch (error) {
      console.error('❌ Failed to decode v2 tiles:', error);
      throw new Error(`Failed to decode v2 tiles: ${error.message}`);
    }
  }

  /**
   * Encode tiles to v2 format
   * @param {Array<Array<string>>} tiles - 64x64 2D array of tile types
   * @returns {string} - Base64 encoded compressed tile data
   */
  encodeTilesV2(tiles) {
    try {
      return TileEncoder.encode(tiles);
    } catch (error) {
      console.error('❌ Failed to encode tiles to v2:', error);
      throw new Error(`Failed to encode tiles to v2: ${error.message}`);
    }
  }

  /**
   * Update a single tile in the grid, handling the appropriate format
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

    const schemaVersion = grid.tilesSchemaVersion_REMOVED || 'v1';

    switch (schemaVersion) {
      case 'v1':
        // Update both formats if they exist
        if (!grid.tiles) {
          grid.tiles = this.createEmptyTileGrid();
        }
        
        // Update v1 format
        grid.tiles[y][x] = newTileType;
        grid.markModified(`tiles.${y}.${x}`);

        // Update v2 format if it exists
        if (grid.tiles) {
          try {
            const decodedTiles = this.decodeTilesV2(grid.tiles);
            decodedTiles[y][x] = newTileType;
            grid.tiles = this.encodeTilesV2(decodedTiles);
          } catch (error) {
            console.warn('⚠️ Failed to update v2 tiles, keeping v1 only:', error);
          }
        }
        break;

      case 'v2':
        // Update only v2 format
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
          console.error('❌ Failed to update v2 tiles:', error);
          throw error;
        }
        break;

      default:
        throw new Error(`Unknown tiles schema version: ${schemaVersion}`);
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
      tilesSchemaVersion_REMOVED: grid.tilesSchemaVersion_REMOVED || 'v1',
      hasV1Tiles: !!(grid.tiles && Array.isArray(grid.tiles)),
      hasV2Tiles: !!(grid.tiles && typeof grid.tiles === 'string'),
      lastOptimized: grid.lastOptimized || null
    };

    // Calculate storage sizes
    if (grid.tiles) {
      stats.v1StorageSize = JSON.stringify(grid.tiles).length;
    }
    
    if (grid.tiles) {
      stats.v2StorageSize = grid.tiles.length;
    }

    // Calculate potential savings
    if (stats.v1StorageSize && stats.v2StorageSize) {
      const savings = ((stats.v1StorageSize - stats.v2StorageSize) / stats.v1StorageSize * 100).toFixed(1);
      stats.storageSavings = `${savings}%`;
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

    // Check v1 tiles
    if (grid.tiles) {
      try {
        if (!Array.isArray(grid.tiles)) {
          result.errors.push('v1 tiles is not an array');
          result.valid = false;
        } else {
          // Validate dimensions
          if (grid.tiles.length !== 64) {
            result.errors.push(`v1 tiles has ${grid.tiles.length} rows, expected 64`);
            result.valid = false;
          } else {
            for (let y = 0; y < grid.tiles.length; y++) {
              if (!Array.isArray(grid.tiles[y])) {
                result.errors.push(`v1 tiles row ${y} is not an array`);
                result.valid = false;
                break;
              }
              if (grid.tiles[y].length !== 64) {
                result.errors.push(`v1 tiles row ${y} has ${grid.tiles[y].length} columns, expected 64`);
                result.valid = false;
                break;
              }
              // Validate tile types
              for (let x = 0; x < grid.tiles[y].length; x++) {
                const tileType = grid.tiles[y][x];
                if (!TileEncoder.isValidTileType(tileType)) {
                  result.errors.push(`Invalid v1 tile type '${tileType}' at (${x}, ${y})`);
                  result.valid = false;
                }
              }
            }
          }
        }
      } catch (error) {
        result.errors.push(`v1 validation error: ${error.message}`);
        result.valid = false;
      }
    }

    // Check v2 tiles
    if (grid.tiles) {
      try {
        if (typeof grid.tiles !== 'string') {
          result.errors.push('v2 tiles is not a string');
          result.valid = false;
        } else {
          // Test decode v2 tiles
          const decodedTiles = this.decodeTilesV2(grid.tiles);
          
          // Validate dimensions
          if (decodedTiles.length !== 64) {
            result.errors.push(`Decoded v2 tiles has ${decodedTiles.length} rows, expected 64`);
            result.valid = false;
          }
        }
      } catch (error) {
        result.errors.push(`v2 validation error: ${error.message}`);
        result.valid = false;
      }
    }

    // Check for consistency if both formats exist
    if (grid.tiles && grid.tiles) {
      try {
        const v1Tiles = grid.tiles;
        const v2Tiles = this.decodeTilesV2(grid.tiles);
        
        // Compare dimensions
        if (v1Tiles.length !== v2Tiles.length) {
          result.warnings.push(`Tile row count mismatch: v1=${v1Tiles.length}, v2=${v2Tiles.length}`);
        } else {
          // Sample comparison (check a few tiles for performance)
          const samplePositions = [[0,0], [31,31], [63,63], [15,47], [48,16]];
          for (const [x, y] of samplePositions) {
            if (v1Tiles[y] && v2Tiles[y] && v1Tiles[y][x] !== v2Tiles[y][x]) {
              result.warnings.push(`Tile mismatch at (${x}, ${y}): v1='${v1Tiles[y][x]}', v2='${v2Tiles[y][x]}'`);
            }
          }
        }
      } catch (error) {
        result.warnings.push(`Consistency check error: ${error.message}`);
      }
    }

    return result;
  }
}

// Export singleton instance
const gridTileManager = new GridTileManager();
module.exports = gridTileManager;