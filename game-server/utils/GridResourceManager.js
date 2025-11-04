// GridResourceManager.js
// Handles dual-path resource loading and management for grid optimization

const UltraCompactResourceEncoder = require('./ResourceEncoder');
const { readJSON } = require('./fileUtils');
const path = require('path');

class GridResourceManager {
  constructor() {
    this.encoder = null;
    this.masterResources = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // Load master resources
      const masterResourcesPath = path.join(__dirname, '../tuning/resources.json');
      this.masterResources = readJSON(masterResourcesPath);
      
      if (!this.masterResources || !Array.isArray(this.masterResources)) {
        throw new Error('Failed to load master resources for GridResourceManager');
      }

      // Initialize encoder
      this.encoder = new UltraCompactResourceEncoder(this.masterResources);
      this.initialized = true;
      
      console.log(`📦 GridResourceManager initialized with ${this.masterResources.length} resource types`);
    } catch (error) {
      console.error('❌ Failed to initialize GridResourceManager:', error);
      throw error;
    }
  }

  /**
   * Load resources from a grid document
   * @param {Object} grid - The grid document from MongoDB
   * @returns {Array} - Array of decoded resource objects
   */
  getResources(grid) {
    if (!this.initialized) {
      throw new Error('GridResourceManager not initialized. Call initialize() first.');
    }

    if (!grid) {
      return [];
    }

    if (grid.resources && grid.resources.length > 0) {
      const firstResource = grid.resources[0];
      
      // Check if this is legacy format (object with type) or encoded format (array)
      if (Array.isArray(firstResource)) {
        // Encoded format - decode normally
        try {
          return this.decodeResourcesV2(grid.resources);
        } catch (error) {
          console.error('❌ Failed to decode resources:', error);
          throw error;
        }
      } else if (typeof firstResource === 'object' && firstResource.type) {
        // Legacy format - return raw resources
        console.warn(`⚠️ Grid ${grid._id} has unexpected resource format`);
        return grid.resources;
      }
    }
    
    return [];
  }

  /**
   * Decode encoded resources
   * @param {Array} encodedResources - Array of encoded resource arrays
   * @returns {Array} - Array of decoded resource objects
   */
  decodeResourcesV2(encodedResources) {
    if (!this.initialized) {
      throw new Error('GridResourceManager not initialized');
    }

    try {
      return this.encoder.decodeResources(encodedResources);
    } catch (error) {
      console.error('❌ Failed to decode resources:', error);
      throw new Error(`Failed to decode resources: ${error.message}`);
    }
  }

  /**
   * Encode resources
   * @param {Array} resources - Array of resource objects
   * @returns {Array} - Array of encoded resource arrays
   */
  encodeResourcesV2(resources) {
    if (!this.initialized) {
      throw new Error('GridResourceManager not initialized');
    }

    try {
      return this.encoder.encodeResources(resources);
    } catch (error) {
      console.error('❌ Failed to encode resources:', error);
      throw new Error(`Failed to encode resources: ${error.message}`);
    }
  }

  /**
   * Update a single resource in the grid
   * @param {Object} grid - The grid document
   * @param {Object} resourceUpdate - The resource to update/add
   * @returns {Object} - Updated grid document (not saved)
   */
  updateResource(grid, resourceUpdate) {
    if (!this.initialized) {
      throw new Error('GridResourceManager not initialized');
    }

    // All grids now use compressed resources
    if (!grid.resources) grid.resources = [];
    
    try {
      const decodedResources = grid.resources.length > 0 ? this.decodeResourcesV2(grid.resources) : [];
      const resourceIndex = decodedResources.findIndex(r => r.x === resourceUpdate.x && r.y === resourceUpdate.y);
      
      if (resourceIndex >= 0) {
        if (resourceUpdate.type === null) {
          // Remove resource
          decodedResources.splice(resourceIndex, 1);
        } else {
          // Update resource
          decodedResources[resourceIndex] = resourceUpdate;
        }
      } else if (resourceUpdate.type !== null) {
        // Add new resource
        decodedResources.push(resourceUpdate);
      }
      
      grid.resources = this.encodeResourcesV2(decodedResources);
    } catch (error) {
      console.error('❌ Failed to update resources:', error);
      throw error;
    }

    return grid;
  }

  /**
   * Get statistics about resource storage
   * @param {Object} grid - The grid document
   * @returns {Object} - Statistics about storage usage
   */
  getStorageStats(grid) {
    if (!grid) return { error: 'No grid provided' };

    const stats = {
      resourceCount: grid.resources ? grid.resources.length : 0,
      lastOptimized: grid.lastOptimized || null
    };

    // Calculate storage size
    if (grid.resources) {
      stats.storageSize = JSON.stringify(grid.resources).length;
    }

    return stats;
  }

  /**
   * Validate resource data integrity
   * @param {Object} grid - The grid document
   * @returns {Object} - Validation result
   */
  validateResourceIntegrity(grid) {
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

    // Check resources
    if (grid.resources) {
      try {
        if (!Array.isArray(grid.resources)) {
          result.errors.push('Resources is not an array');
          result.valid = false;
        } else if (this.initialized) {
          // Test decode a sample of resources
          const sampleSize = Math.min(10, grid.resources.length);
          for (let i = 0; i < sampleSize; i++) {
            try {
              this.encoder.decode(grid.resources[i]);
            } catch (decodeError) {
              result.errors.push(`Invalid resource at index ${i}: ${decodeError.message}`);
              result.valid = false;
            }
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
const gridResourceManager = new GridResourceManager();
module.exports = gridResourceManager;