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
   * Load resources from a grid document (V2 format only)
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

    // V2-only: All grids now use compressed resources field
    if (grid.resources && grid.resources.length > 0) {
      return this.decodeResourcesV2(grid.resources);
    }
    
    return [];
  }

  /**
   * Decode v2 format resources
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
      console.error('❌ Failed to decode v2 resources:', error);
      throw new Error(`Failed to decode v2 resources: ${error.message}`);
    }
  }

  /**
   * Encode resources to v2 format
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
      console.error('❌ Failed to encode resources to v2:', error);
      throw new Error(`Failed to encode resources to v2: ${error.message}`);
    }
  }

  /**
   * Update a single resource in the grid, handling the appropriate format
   * @param {Object} grid - The grid document
   * @param {Object} resourceUpdate - The resource to update/add
   * @returns {Object} - Updated grid document (not saved)
   */
  updateResource(grid, resourceUpdate) {
    if (!this.initialized) {
      throw new Error('GridResourceManager not initialized');
    }

    const schemaVersion = grid.resourcesSchemaVersion_REMOVED || 'v1';

    switch (schemaVersion) {
      case 'v1':
        // Update both formats if they exist
        if (!grid.resources) grid.resources = [];
        
        // Find and update in v1 format
        const v1Index = grid.resources.findIndex(r => r.x === resourceUpdate.x && r.y === resourceUpdate.y);
        if (v1Index >= 0) {
          if (resourceUpdate.type === null) {
            // Remove resource
            grid.resources.splice(v1Index, 1);
          } else {
            // Update resource
            grid.resources[v1Index] = resourceUpdate;
          }
        } else if (resourceUpdate.type !== null) {
          // Add new resource
          grid.resources.push(resourceUpdate);
        }

        // Update v2 format if it exists
        if (grid.resources) {
          try {
            const decodedResources = this.decodeResourcesV2(grid.resources);
            const v2Index = decodedResources.findIndex(r => r.x === resourceUpdate.x && r.y === resourceUpdate.y);
            
            if (v2Index >= 0) {
              if (resourceUpdate.type === null) {
                decodedResources.splice(v2Index, 1);
              } else {
                decodedResources[v2Index] = resourceUpdate;
              }
            } else if (resourceUpdate.type !== null) {
              decodedResources.push(resourceUpdate);
            }
            
            grid.resources = this.encodeResourcesV2(decodedResources);
          } catch (error) {
            console.warn('⚠️ Failed to update v2 resources, keeping v1 only:', error);
          }
        }
        break;

      case 'v2':
        // Update only v2 format
        if (!grid.resources) grid.resources = [];
        
        try {
          const decodedResources = grid.resources.length > 0 ? this.decodeResourcesV2(grid.resources) : [];
          const v2Index = decodedResources.findIndex(r => r.x === resourceUpdate.x && r.y === resourceUpdate.y);
          
          if (v2Index >= 0) {
            if (resourceUpdate.type === null) {
              decodedResources.splice(v2Index, 1);
            } else {
              decodedResources[v2Index] = resourceUpdate;
            }
          } else if (resourceUpdate.type !== null) {
            decodedResources.push(resourceUpdate);
          }
          
          grid.resources = this.encodeResourcesV2(decodedResources);
        } catch (error) {
          console.error('❌ Failed to update v2 resources:', error);
          throw error;
        }
        break;

      default:
        throw new Error(`Unknown schema version: ${schemaVersion}`);
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
      schemaVersion: grid.resourcesSchemaVersion_REMOVED || 'v1',
      v1ResourceCount: grid.resources ? grid.resources.length : 0,
      v2ResourceCount: grid.resources ? grid.resources.length : 0,
      lastOptimized: grid.lastOptimized || null
    };

    // Calculate storage sizes
    if (grid.resources) {
      stats.v1StorageSize = JSON.stringify(grid.resources).length;
    }
    
    if (grid.resources) {
      stats.v2StorageSize = JSON.stringify(grid.resources).length;
    }

    // Calculate potential savings
    if (stats.v1StorageSize && stats.v2StorageSize) {
      const savings = ((stats.v1StorageSize - stats.v2StorageSize) / stats.v1StorageSize * 100).toFixed(1);
      stats.storageSavings = `${savings}%`;
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

    // Check v1 resources
    if (grid.resources) {
      try {
        if (!Array.isArray(grid.resources)) {
          result.errors.push('v1 resources is not an array');
          result.valid = false;
        } else {
          for (let i = 0; i < grid.resources.length; i++) {
            const resource = grid.resources[i];
            if (!resource.type || typeof resource.x !== 'number' || typeof resource.y !== 'number') {
              result.errors.push(`Invalid v1 resource at index ${i}`);
              result.valid = false;
            }
          }
        }
      } catch (error) {
        result.errors.push(`v1 validation error: ${error.message}`);
        result.valid = false;
      }
    }

    // Check v2 resources
    if (grid.resources) {
      try {
        if (!Array.isArray(grid.resources)) {
          result.errors.push('v2 resources is not an array');
          result.valid = false;
        } else if (this.initialized) {
          // Test decode a sample of v2 resources
          const sampleSize = Math.min(10, grid.resources.length);
          for (let i = 0; i < sampleSize; i++) {
            try {
              this.encoder.decode(grid.resources[i]);
            } catch (decodeError) {
              result.errors.push(`Invalid v2 resource at index ${i}: ${decodeError.message}`);
              result.valid = false;
            }
          }
        }
      } catch (error) {
        result.errors.push(`v2 validation error: ${error.message}`);
        result.valid = false;
      }
    }

    // Check for consistency if both formats exist
    if (grid.resources && grid.resources && this.initialized) {
      try {
        const v1Count = grid.resources.length;
        const v2Count = grid.resources.length;
        
        if (v1Count !== v2Count) {
          result.warnings.push(`Resource count mismatch: v1=${v1Count}, v2=${v2Count}`);
        }
      } catch (error) {
        result.warnings.push(`Consistency check error: ${error.message}`);
      }
    }

    return result;
  }
}

// Export singleton instance
const gridResourceManager = new GridResourceManager();
module.exports = gridResourceManager;