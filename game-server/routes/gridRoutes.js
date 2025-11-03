const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;
const fs = require('fs');
const express = require('express');
const router = express.Router();
const path = require('path');
const { readJSON } = require('../utils/fileUtils');
const Grid = require('../models/grid'); // Assuming you have a Grid model
const Player = require('../models/player'); // Required for orphaned homesteads cleanup
const queue = require('../queue'); // Import the in-memory queue
const UltraCompactResourceEncoder = require('../utils/ResourceEncoder');
const TileEncoder = require('../utils/TileEncoder');
const gridTileManager = require('../utils/GridTileManager');

///////////////////////////////////////////////////////////////
// GRID STATE ROUTES 
///////////////////////////////////////////////////////////////

// Dedicated route: save only PCs without altering NPCs
router.post('/save-grid-state-pcs', async (req, res) => {
  const { gridId, pcs, playersInGridLastUpdated } = req.body;

  try {
    // Validate input
    if (!gridId || !pcs) {
      return res.status(400).json({ error: 'gridId and pcs are required.' });
    }

    // Find the grid by ID
    const grid = await Grid.findById(gridId);
    if (!grid) {
      return res.status(404).json({ error: 'Grid not found.' });
    }

    // Update the playersInGrid and timestamp
    grid.playersInGrid = pcs;
    grid.playersInGridLastUpdated = new Date(playersInGridLastUpdated);

    await grid.save();

    console.log(`✅ PCs successfully saved for gridId: ${gridId}`);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ Error saving NPCsInGrid PCs:', error);
    res.status(500).json({ error: 'Failed to save NPCsInGrid PCs.' });
  }
});

// Dedicated route: save a single PC to playersInGrid
router.post('/save-single-pc', async (req, res) => {
  const { gridId, playerId, pc, lastUpdated } = req.body;

  try {
    if (!gridId || !playerId || !pc || !lastUpdated) {
      return res.status(400).json({ error: 'gridId, playerId, pc, and lastUpdated are required.' });
    }

    const grid = await Grid.findById(gridId);
    if (!grid) {
      return res.status(404).json({ error: 'Grid not found.' });
    }

    // Ensure playersInGrid is a Map
    const pcs = new Map(grid.playersInGrid || []);
    pc.lastUpdated = new Date(lastUpdated); // ensures consistent format
    pcs.set(playerId, pc);
    grid.playersInGrid = pcs;

    // Optionally update global PC timestamp
    grid.playersInGridLastUpdated = new Date(lastUpdated);

    await grid.save();

    console.log(`✅ Single PC ${playerId} saved for gridId: ${gridId}`);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ Error saving single PC:', error);
    res.status(500).json({ error: 'Failed to save single PC.' });
  }
});

// Dedicated route: remove a single PC from playersInGrid
router.post('/remove-single-pc', async (req, res) => {
  const { gridId, playerId } = req.body;

  try {
    if (!gridId || !playerId) {
      return res.status(400).json({ error: 'gridId and playerId are required.' });
    }

    const grid = await Grid.findById(gridId);
    if (!grid) {
      console.log(`⚠️ Grid not found for removal: ${gridId}`);
      return res.status(404).json({ error: 'Grid not found.' });
    }

    const pcs = new Map(grid.playersInGrid || []);
    const beforeSize = pcs.size;
    
    // Log all player IDs in the grid before removal
    console.log(`📋 Players in grid ${gridId} before removal:`, Array.from(pcs.keys()));
    console.log(`🔍 Attempting to remove player: ${playerId} (type: ${typeof playerId})`);
    
    // Try both string and potential ObjectId formats
    let removed = false;
    
    // Check for dead player data with any format of playerId
    const keysToRemove = [];
    for (const [key, playerData] of pcs.entries()) {
      // Match by various ID formats
      if (key === playerId || 
          key === playerId.toString() || 
          key.toString() === playerId || 
          key.toString() === playerId.toString()) {
        keysToRemove.push(key);
      }
      // Also check if this is a dead player that should be cleaned up
      else if (playerData && playerData.playerId && 
               (playerData.playerId === playerId || 
                playerData.playerId === playerId.toString() ||
                playerData.playerId.toString() === playerId ||
                playerData.playerId.toString() === playerId.toString())) {
        console.log(`🧹 Found dead player data with mismatched key: ${key} vs ${playerId}`);
        keysToRemove.push(key);
      }
    }
    
    // Remove all matching entries
    for (const key of keysToRemove) {
      pcs.delete(key);
      removed = true;
      console.log(`🗑️ Removed player entry with key: ${key}`);
    }
    
    const afterSize = pcs.size;
    console.log(`📊 Grid ${gridId} players: ${beforeSize} → ${afterSize} (removed: ${removed})`);
    
    if (!removed) {
      console.warn(`⚠️ Player ${playerId} was not found in grid ${gridId}`);
    }
    
    grid.playersInGrid = pcs;
    grid.playersInGridLastUpdated = new Date();
    await grid.save();

    console.log(`✅ Completed remove-single-pc for player ${playerId} from grid ${gridId}`);
    res.status(200).json({ success: true, removed });
  } catch (error) {
    console.error('❌ Error removing single PC:', error);
    res.status(500).json({ error: 'Failed to remove single PC.' });
  }
});

// Dedicated route: save only NPCs without altering PCs
router.post('/save-grid-state-npcs', async (req, res) => {
  const { gridId, npcs, NPCsInGridLastUpdated } = req.body;

  if (!gridId || !npcs) {
    return res.status(400).json({ error: 'gridId and npcs are required.' });
  }
  try {
    const grid = await Grid.findById(gridId);
    if (!grid) {
      return res.status(404).json({ error: `Grid not found for ID: ${gridId}` });
    }

    // ✅ Directly set the npcs object into NPCsInGrid
    grid.NPCsInGrid = npcs;
    grid.NPCsInGridLastUpdated = new Date(NPCsInGridLastUpdated);

    await grid.save();

    console.log(`✅ NPCs successfully saved for gridId: ${gridId}`);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ Error saving NPCsInGrid NPCs:', error);
    res.status(500).json({ error: 'Failed to save NPCsInGrid NPCs.' });
  }
});


router.get('/load-grid-state/:gridId', async (req, res) => {
  const { gridId } = req.params;
  console.log('Loading NPCsInGrid for gridId:', gridId);
  try {
    const grid = await Grid.findById(gridId, 'NPCsInGrid NPCsInGridLastUpdated playersInGrid playersInGridLastUpdated');
    if (!grid) {
      return res.status(404).send({ error: 'Grid not found.' });
    }

    // Normalize separate NPC and PC maps
    const rawNPCs = grid.NPCsInGrid || new Map();
    const rawPCs  = grid.playersInGrid  || new Map();
    const NPCsInGrid = {
      npcs: Object.fromEntries(rawNPCs),
      lastUpdated: grid.NPCsInGridLastUpdated || 0
    };
    const playersInGrid = {
      pcs:  Object.fromEntries(rawPCs),
      lastUpdated: grid.playersInGridLastUpdated  || 0
    };
    res.send({ NPCsInGrid, playersInGrid });
  } catch (error) {
    console.error('Error fetching NPCsInGrid:', error);
    res.status(500).send({ error: 'Failed to fetch NPCsInGrid.' });
  }
});

router.post('/get-multiple-grid-states', async (req, res) => {
  const { gridIds } = req.body;
  
  if (!Array.isArray(gridIds)) {
    return res.status(400).json({ error: 'gridIds must be an array' });
  }

  try {
    // Find all grids in one query, selecting only relevant fields
    const grids = await Grid.find(
      { _id: { $in: gridIds } },
      'playersInGrid playersInGridLastUpdated NPCsInGrid NPCsInGridLastUpdated'
    );
    
    // Create a map of gridId to NPCsInGrid
    const NPCsInGrids = grids.reduce((acc, grid) => {
      acc[grid._id] = {
        playersInGrid: {
          pcs: Object.fromEntries(grid.playersInGrid || []),
          lastUpdated: grid.playersInGridLastUpdated || null
        },
        NPCsInGrid: {
          npcs: Object.fromEntries(grid.NPCsInGrid || []),
          lastUpdated: grid.NPCsInGridLastUpdated || null
        }
      };
      return acc;
    }, {});
    
    res.json(NPCsInGrids);
  } catch (error) {
    console.error('Error fetching multiple grid states:', error);
    res.status(500).json({ error: 'Failed to fetch grid states' });
  }
});


// Dedicated route: save a single NPC to NPCsInGrid
router.post('/save-single-npc', async (req, res) => {
  const { gridId, npcId, npc, lastUpdated } = req.body;

  try {
    if (!gridId || !npcId || !npc || !lastUpdated) {
      return res.status(400).json({ error: 'gridId, npcId, npc, and lastUpdated are required.' });
    }

    const grid = await Grid.findById(gridId);
    if (!grid) {
      return res.status(404).json({ error: 'Grid not found.' });
    }

    // Ensure NPCsInGrid is a Map
    const npcs = new Map(grid.NPCsInGrid || []);
    npc.lastUpdated = new Date(lastUpdated); // Ensure consistent format
    npcs.set(npcId, npc);
    grid.NPCsInGrid = npcs;

    // Optionally update the global NPCs lastUpdated timestamp
    grid.NPCsInGridLastUpdated = new Date(lastUpdated);

    await grid.save();

    //console.log(`✅ Single NPC ${npcId} saved for gridId: ${gridId}`);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ Error saving single NPC:', error);
    res.status(500).json({ error: 'Failed to save single NPC.' });
  }
});

// Dedicated route: remove a single NPC from NPCsInGrid
router.post('/remove-single-npc', async (req, res) => {
  const { gridId, npcId } = req.body;

  try {
    if (!gridId || !npcId) {
      return res.status(400).json({ error: 'gridId and npcId are required.' });
    }

    const grid = await Grid.findById(gridId);
    if (!grid) {
      return res.status(404).json({ error: 'Grid not found.' });
    }

    const npcs = new Map(grid.NPCsInGrid || []);
    npcs.delete(npcId);
    grid.NPCsInGrid = npcs;

    // Optionally update the NPCs lastUpdated timestamp
    grid.NPCsInGridLastUpdated = new Date();

    await grid.save();

    console.log(`🗑️ Removed NPC ${npcId} from gridId: ${gridId}`);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ Error removing single NPC:', error);
    res.status(500).json({ error: 'Failed to remove single NPC.' });
  }
});

// Batch update route: Update multiple NPC positions in one request
router.post('/batch-update-npc-positions', async (req, res) => {
  const { gridId, updates, timestamp } = req.body;

  try {
    // Validate input
    if (!gridId || !updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'gridId and updates object are required.' });
    }

    // Check if there are actually updates to process
    const updateEntries = Object.entries(updates);
    if (updateEntries.length === 0) {
      return res.status(400).json({ error: 'No updates provided.' });
    }

    // Load the grid
    const grid = await Grid.findById(gridId);
    if (!grid) {
      return res.status(404).json({ error: 'Grid not found.' });
    }

    // Get current NPCs
    const npcs = new Map(grid.NPCsInGrid || []);
    let updatedCount = 0;
    const errors = [];

    // Process each position update
    for (const [npcId, position] of updateEntries) {
      // Validate position has x and y
      if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
        errors.push(`Invalid position for NPC ${npcId}`);
        continue;
      }

      // Check if NPC exists
      const npc = npcs.get(npcId);
      if (!npc) {
        errors.push(`NPC ${npcId} not found in grid`);
        continue;
      }

      // Update only the position and lastUpdated
      npc.position = { x: position.x, y: position.y };
      npc.lastUpdated = new Date(timestamp || Date.now());
      npcs.set(npcId, npc);
      updatedCount++;
    }

    // Only save if we had successful updates
    if (updatedCount > 0) {
      grid.NPCsInGrid = npcs;
      grid.NPCsInGridLastUpdated = new Date(timestamp || Date.now());
      await grid.save();
      console.log(`💾 Batch updated ${updatedCount} NPC positions for grid ${gridId}`);
    }

    // Return result with any errors
    res.status(200).json({ 
      success: true, 
      updated: updatedCount,
      total: updateEntries.length,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('❌ Error in batch NPC position update:', error);
    res.status(500).json({ error: 'Failed to batch update NPC positions.' });
  }
});

// Batch update route: Update multiple PC positions in one request
router.post('/batch-update-pc-positions', async (req, res) => {
  const { gridId, updates, timestamp } = req.body;

  try {
    // Validate input
    if (!gridId || !updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'gridId and updates object are required.' });
    }

    // Check if there are actually updates to process
    const updateEntries = Object.entries(updates);
    if (updateEntries.length === 0) {
      return res.status(400).json({ error: 'No updates provided.' });
    }

    // Load the grid
    const grid = await Grid.findById(gridId);
    if (!grid) {
      return res.status(404).json({ error: 'Grid not found.' });
    }

    // Get current PCs
    const pcs = new Map(grid.playersInGrid || []);
    let updatedCount = 0;
    const errors = [];

    // Process each position update
    for (const [playerId, pcData] of updateEntries) {
      // Check if PC exists
      const pc = pcs.get(playerId);
      if (!pc) {
        errors.push(`PC ${playerId} not found in grid`);
        continue;
      }

      // Update PC data (position and any other changed properties)
      Object.assign(pc, pcData, {
        lastUpdated: new Date(timestamp || Date.now())
      });
      
      pcs.set(playerId, pc);
      updatedCount++;
    }

    // Only save if we had successful updates
    if (updatedCount > 0) {
      grid.playersInGrid = pcs;
      grid.playersInGridLastUpdated = new Date(timestamp || Date.now());
      await grid.save();
      console.log(`💾 Batch updated ${updatedCount} PC positions for grid ${gridId}`);
    }

    // Return result with any errors
    res.status(200).json({ 
      success: true, 
      updated: updatedCount,
      total: updateEntries.length,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('❌ Error in batch PC position update:', error);
    res.status(500).json({ error: 'Failed to batch update PC positions.' });
  }
});

///////////////////////////////////////////////////////////////
// DATABASE OPTIMIZATION ROUTES 
///////////////////////////////////////////////////////////////

// Generate compact database format for a specific grid
router.post('/generate-compact-db', async (req, res) => {
  const { gridId } = req.body;

  try {
    if (!gridId) {
      return res.status(400).json({ error: 'gridId is required.' });
    }

    // Load the grid with current resources
    const grid = await Grid.findById(gridId);
    if (!grid) {
      return res.status(404).json({ error: 'Grid not found.' });
    }

    // Check if already has v2 format
    if (grid.resourcesSchemaVersion === 'v2') {
      return res.status(400).json({ 
        error: 'Grid already using v2 schema. Use delete-old-schema to remove v1 data.' 
      });
    }

    // Get master resources for encoding
    const masterResourcesPath = path.join(__dirname, '../tuning/resources.json');
    const masterResources = readJSON(masterResourcesPath);
    
    if (!masterResources || !Array.isArray(masterResources)) {
      return res.status(500).json({ error: 'Failed to load master resources.' });
    }

    // Initialize encoder with master resources
    const encoder = new UltraCompactResourceEncoder(masterResources);

    // Get current resources
    const currentResources = grid.resources || [];
    
    if (currentResources.length === 0) {
      return res.status(400).json({ error: 'No resources to encode on this grid.' });
    }

    // Encode all resources
    const encodedResources = [];
    let totalOriginalSize = 0;
    let totalEncodedSize = 0;

    for (const resource of currentResources) {
      try {
        const encoded = encoder.encode(resource);
        encodedResources.push(encoded);
        
        // Calculate size savings
        const originalSize = JSON.stringify(resource).length;
        const encodedSize = JSON.stringify(encoded).length;
        totalOriginalSize += originalSize;
        totalEncodedSize += encodedSize;
      } catch (encodeError) {
        console.error(`❌ Failed to encode resource:`, resource, encodeError);
        return res.status(500).json({ 
          error: `Failed to encode resource at (${resource.x}, ${resource.y}): ${encodeError.message}` 
        });
      }
    }

    // Update grid with encoded resources (keeping original for safety)
    grid.resourcesV2 = encodedResources;
    grid.resourcesSchemaVersion = 'v1'; // Still dual-format
    grid.lastOptimized = new Date();

    await grid.save();

    // Calculate savings
    const savingsPercent = ((totalOriginalSize - totalEncodedSize) / totalOriginalSize * 100).toFixed(1);

    const result = {
      resourceCount: currentResources.length,
      originalSize: totalOriginalSize,
      encodedSize: totalEncodedSize,
      savings: `${savingsPercent}%`
    };

    console.log(`📦 Generated compact DB for grid ${gridId}:`, result);

    res.status(200).json({
      success: true,
      message: 'Compact database generated successfully',
      result
    });

  } catch (error) {
    console.error('❌ Error generating compact DB:', error);
    res.status(500).json({ error: 'Failed to generate compact database.' });
  }
});

// Delete old database schema and switch to v2 only
router.post('/delete-old-schema', async (req, res) => {
  const { gridId } = req.body;

  try {
    if (!gridId) {
      return res.status(400).json({ error: 'gridId is required.' });
    }

    // Load the grid
    const grid = await Grid.findById(gridId);
    if (!grid) {
      return res.status(404).json({ error: 'Grid not found.' });
    }

    // Check if grid has v2 resources
    if (!grid.resourcesV2 || grid.resourcesV2.length === 0) {
      return res.status(400).json({ 
        error: 'Grid does not have resourcesV2 data. Generate compact DB first.' 
      });
    }

    // Verify v2 data integrity before deletion
    try {
      // Get master resources for decoding verification
      const masterResourcesPath = path.join(__dirname, '../tuning/resources.json');
      const masterResources = readJSON(masterResourcesPath);
      const encoder = new UltraCompactResourceEncoder(masterResources);
      
      // Test decode a few resources to ensure integrity
      const testDecodes = grid.resourcesV2.slice(0, Math.min(5, grid.resourcesV2.length));
      console.log(`🔍 Testing ${testDecodes.length} resources for integrity check:`);
      
      for (let i = 0; i < testDecodes.length; i++) {
        const encoded = testDecodes[i];
        console.log(`  Resource ${i}: ${JSON.stringify(encoded)}`);
        try {
          const decoded = encoder.decode(encoded);
          console.log(`  ✅ Decoded: ${JSON.stringify(decoded)}`);
        } catch (decodeError) {
          console.error(`  ❌ Failed to decode resource ${i}: ${decodeError.message}`);
          throw decodeError;
        }
      }
      console.log('✅ All test resources decoded successfully');
    } catch (verifyError) {
      console.error('❌ V2 data integrity check failed:', verifyError);
      return res.status(400).json({ 
        error: `V2 data integrity check failed: ${verifyError.message}. Cannot safely delete old schema.` 
      });
    }

    // Store old resource count for logging
    const oldResourceCount = grid.resources ? grid.resources.length : 0;
    const newResourceCount = grid.resourcesV2.length;

    // Remove old resources field and update schema version
    await Grid.findByIdAndUpdate(gridId, {
      $unset: { resources: 1 },
      $set: {
        resourcesSchemaVersion: 'v2',
        lastOptimized: new Date()
      }
    });

    console.log(`🗑️ Deleted old schema for grid ${gridId}. Resources: ${oldResourceCount} → ${newResourceCount} (v2)`);

    res.status(200).json({
      success: true,
      message: 'Old database schema deleted successfully',
      result: {
        oldResourceCount,
        newResourceCount,
        schemaVersion: 'v2'
      }
    });

  } catch (error) {
    console.error('❌ Error deleting old schema:', error);
    res.status(500).json({ error: 'Failed to delete old database schema.' });
  }
});

///////////////////////////////////////////////////////////////
// TILE OPTIMIZATION ROUTES 
///////////////////////////////////////////////////////////////

// Generate compact tile format for a specific grid
router.post('/generate-compact-tiles', async (req, res) => {
  const { gridId } = req.body;

  try {
    if (!gridId) {
      return res.status(400).json({ error: 'gridId is required.' });
    }

    // Load the grid with current tiles
    const grid = await Grid.findById(gridId);
    if (!grid) {
      return res.status(404).json({ error: 'Grid not found.' });
    }

    // Check if already has v2 format
    if (grid.tilesSchemaVersion === 'v2') {
      return res.status(400).json({ 
        error: 'Grid already using v2 tiles schema. Use delete-old-tiles-schema to remove v1 data.' 
      });
    }

    // Get current tiles
    const currentTiles = grid.tiles;
    
    if (!currentTiles || !Array.isArray(currentTiles) || currentTiles.length === 0) {
      return res.status(400).json({ error: 'No tiles to encode on this grid.' });
    }

    // Validate tile dimensions
    if (currentTiles.length !== 64) {
      return res.status(400).json({ error: `Invalid tile grid: expected 64 rows, got ${currentTiles.length}` });
    }

    // Encode tiles
    try {
      const encodedTiles = TileEncoder.encode(currentTiles);
      
      // Calculate size savings
      const originalSize = JSON.stringify(currentTiles).length;
      const encodedSize = encodedTiles.length;
      const savingsPercent = ((originalSize - encodedSize) / originalSize * 100).toFixed(1);

      // Update grid with encoded tiles (keeping original for safety)
      grid.tilesV2 = encodedTiles;
      grid.tilesSchemaVersion = 'v1'; // Still dual-format
      grid.lastOptimized = new Date();

      await grid.save();

      const result = {
        originalSize: originalSize,
        encodedSize: encodedSize,
        savings: `${savingsPercent}%`
      };

      console.log(`📦 Generated compact tiles for grid ${gridId}:`, result);

      res.status(200).json({
        success: true,
        message: 'Compact tiles generated successfully',
        result
      });

    } catch (encodeError) {
      console.error(`❌ Failed to encode tiles:`, encodeError);
      return res.status(500).json({ 
        error: `Failed to encode tiles: ${encodeError.message}` 
      });
    }

  } catch (error) {
    console.error('❌ Error generating compact tiles:', error);
    res.status(500).json({ error: 'Failed to generate compact tiles.' });
  }
});

// Delete old tile schema and switch to v2 only
router.post('/delete-old-tiles-schema', async (req, res) => {
  const { gridId } = req.body;

  try {
    if (!gridId) {
      return res.status(400).json({ error: 'gridId is required.' });
    }

    // Load the grid
    const grid = await Grid.findById(gridId);
    if (!grid) {
      return res.status(404).json({ error: 'Grid not found.' });
    }

    // Check if grid has v2 tiles
    if (!grid.tilesV2 || typeof grid.tilesV2 !== 'string') {
      return res.status(400).json({ 
        error: 'Grid does not have tilesV2 data. Generate compact tiles first.' 
      });
    }

    // Verify v2 data integrity before deletion
    try {
      const testDecode = TileEncoder.decode(grid.tilesV2);
      console.log(`🔍 Testing tile integrity: decoded ${testDecode.length} rows`);
      
      if (testDecode.length !== 64 || testDecode[0].length !== 64) {
        throw new Error(`Invalid decoded dimensions: ${testDecode.length}x${testDecode[0].length}`);
      }
      console.log('✅ V2 tile data integrity verified');
    } catch (verifyError) {
      console.error('❌ V2 tile integrity check failed:', verifyError);
      return res.status(400).json({ 
        error: `V2 tile integrity check failed: ${verifyError.message}. Cannot safely delete old schema.` 
      });
    }

    // Store old tile count for logging
    const oldTileSize = grid.tiles ? JSON.stringify(grid.tiles).length : 0;
    const newTileSize = grid.tilesV2.length;

    // Remove old tiles field and update schema version
    await Grid.findByIdAndUpdate(gridId, {
      $unset: { tiles: 1 },
      $set: {
        tilesSchemaVersion: 'v2',
        lastOptimized: new Date()
      }
    });

    console.log(`🗑️ Deleted old tile schema for grid ${gridId}. Size: ${oldTileSize} → ${newTileSize} chars (v2)`);

    res.status(200).json({
      success: true,
      message: 'Old tile schema deleted successfully',
      result: {
        oldTileSize,
        newTileSize,
        tilesSchemaVersion: 'v2'
      }
    });

  } catch (error) {
    console.error('❌ Error deleting old tile schema:', error);
    res.status(500).json({ error: 'Failed to delete old tile schema.' });
  }
});


///////////////////////////////////////////////////////////////
// BULK MIGRATION ROUTES FOR NON-HOMESTEAD GRIDS
///////////////////////////////////////////////////////////////

// Bulk migrate non-homestead grids to v2 schema
router.post('/bulk-migrate-valleys-towns', async (req, res) => {
  try {
    // Find all non-homestead grids that are still v1
    const gridsToMigrate = await Grid.find({
      gridType: { $ne: 'homestead' },
      $or: [
        { resourcesSchemaVersion: { $ne: 'v2' } },
        { tilesSchemaVersion: { $ne: 'v2' } },
        { resourcesSchemaVersion: { $exists: false } },
        { tilesSchemaVersion: { $exists: false } }
      ]
    });

    console.log(`🔄 Found ${gridsToMigrate.length} non-homestead grids to migrate`);

    if (gridsToMigrate.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No non-homestead grids need migration',
        result: { migrated: 0, skipped: 0, errors: 0 }
      });
    }

    // Initialize encoders
    const masterResourcesPath = path.join(__dirname, '../tuning/resources.json');
    const masterResources = readJSON(masterResourcesPath);
    const resourceEncoder = new UltraCompactResourceEncoder(masterResources);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;
    const migrationResults = [];

    for (const grid of gridsToMigrate) {
      try {
        const currentResourcesVersion = grid.resourcesSchemaVersion || 'v1';
        const currentTilesVersion = grid.tilesSchemaVersion || 'v1';
        let resourcesMigrated = false;
        let tilesMigrated = false;

        // Migrate resources if needed (including empty grids)
        if (currentResourcesVersion !== 'v2') {
          if (grid.resources && grid.resources.length > 0) {
            // Grid has resources - encode them
            const encodedResources = [];
            for (const resource of grid.resources) {
              try {
                const encoded = resourceEncoder.encode(resource);
                encodedResources.push(encoded);
              } catch (error) {
                console.error(`❌ Failed to encode resource in grid ${grid._id}:`, resource, error);
                throw new Error(`Failed to encode resource at (${resource.x}, ${resource.y}): ${error.message}`);
              }
            }
            
            grid.resourcesV2 = encodedResources;
            grid.resourcesSchemaVersion = 'v2';
            resourcesMigrated = true;
            console.log(`📦 Migrated ${encodedResources.length} resources for grid ${grid._id}`);
          } else {
            // Grid is empty - just set schema version to v2
            grid.resourcesSchemaVersion = 'v2';
            // Don't set resourcesV2 for empty grids - let it remain undefined
            resourcesMigrated = true;
            console.log(`📝 Set empty grid ${grid._id} to v2 resources schema`);
          }
        }

        // Migrate tiles if needed
        if (currentTilesVersion !== 'v2' && grid.tiles && Array.isArray(grid.tiles)) {
          try {
            const encodedTiles = TileEncoder.encode(grid.tiles);
            grid.tilesV2 = encodedTiles;
            grid.tilesSchemaVersion = 'v2';
            tilesMigrated = true;
            console.log(`📦 Migrated tiles for grid ${grid._id}: ${encodedTiles.length} chars`);
          } catch (error) {
            console.error(`❌ Failed to encode tiles for grid ${grid._id}:`, error);
            throw new Error(`Failed to encode tiles: ${error.message}`);
          }
        }

        if (resourcesMigrated || tilesMigrated) {
          grid.lastOptimized = new Date();
          await grid.save();
          migrated++;
          
          migrationResults.push({
            gridId: grid._id,
            gridType: grid.gridType,
            resourcesMigrated,
            tilesMigrated,
            status: 'success'
          });
        } else {
          skipped++;
          migrationResults.push({
            gridId: grid._id,
            gridType: grid.gridType,
            resourcesMigrated: false,
            tilesMigrated: false,
            status: 'skipped - already v2 or no data'
          });
        }

      } catch (error) {
        errors++;
        console.error(`❌ Error migrating grid ${grid._id}:`, error);
        migrationResults.push({
          gridId: grid._id,
          gridType: grid.gridType,
          status: 'error',
          error: error.message
        });
      }
    }

    console.log(`✅ Bulk migration complete: ${migrated} migrated, ${skipped} skipped, ${errors} errors`);

    res.status(200).json({
      success: true,
      message: 'Bulk migration completed',
      result: {
        migrated,
        skipped,
        errors,
        details: migrationResults
      }
    });

  } catch (error) {
    console.error('❌ Error in bulk migration:', error);
    res.status(500).json({ error: 'Failed to perform bulk migration.' });
  }
});

// Bulk delete v1 schema from migrated non-homestead grids
router.post('/bulk-delete-valleys-towns-v1', async (req, res) => {
  try {
    // Find all non-homestead grids that are v2 and still have v1 data
    const gridsToCleanup = await Grid.find({
      gridType: { $ne: 'homestead' },
      $and: [
        {
          $or: [
            { resourcesSchemaVersion: 'v2' },
            { tilesSchemaVersion: 'v2' }
          ]
        },
        {
          $or: [
            { resources: { $exists: true } },
            { tiles: { $exists: true } }
          ]
        }
      ]
    });

    console.log(`🗑️ Found ${gridsToCleanup.length} non-homestead grids with v1 data to cleanup`);

    if (gridsToCleanup.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No non-homestead grids need v1 cleanup',
        result: { cleaned: 0, errors: 0 }
      });
    }

    let cleaned = 0;
    let errors = 0;
    const cleanupResults = [];

    for (const grid of gridsToCleanup) {
      try {
        const updateFields = {};
        const unsetFields = {};
        let needsUpdate = false;

        // Remove resources field if grid is v2 for resources
        if (grid.resourcesSchemaVersion === 'v2' && grid.resources) {
          unsetFields.resources = 1;
          needsUpdate = true;
        }

        // Remove tiles field if grid is v2 for tiles  
        if (grid.tilesSchemaVersion === 'v2' && grid.tiles) {
          unsetFields.tiles = 1;
          needsUpdate = true;
        }

        if (needsUpdate) {
          await Grid.findByIdAndUpdate(grid._id, {
            $unset: unsetFields,
            $set: { lastOptimized: new Date() }
          });

          cleaned++;
          console.log(`🗑️ Cleaned v1 data from grid ${grid._id} (${grid.gridType})`);
          
          cleanupResults.push({
            gridId: grid._id,
            gridType: grid.gridType,
            removedResources: !!unsetFields.resources,
            removedTiles: !!unsetFields.tiles,
            status: 'success'
          });
        }

      } catch (error) {
        errors++;
        console.error(`❌ Error cleaning grid ${grid._id}:`, error);
        cleanupResults.push({
          gridId: grid._id,
          gridType: grid.gridType,
          status: 'error',
          error: error.message
        });
      }
    }

    console.log(`✅ Bulk cleanup complete: ${cleaned} cleaned, ${errors} errors`);

    res.status(200).json({
      success: true,
      message: 'Bulk v1 cleanup completed',
      result: {
        cleaned,
        errors,
        details: cleanupResults
      }
    });

  } catch (error) {
    console.error('❌ Error in bulk cleanup:', error);
    res.status(500).json({ error: 'Failed to perform bulk cleanup.' });
  }
});

// Check migration status of non-homestead grids
router.get('/migration-status-valleys-towns', async (req, res) => {
  try {
    // Count grids by type and schema version
    const statusCounts = await Grid.aggregate([
      {
        $match: { gridType: { $ne: 'homestead' } }
      },
      {
        $group: {
          _id: {
            gridType: '$gridType',
            resourcesSchemaVersion: { $ifNull: ['$resourcesSchemaVersion', 'v1'] },
            tilesSchemaVersion: { $ifNull: ['$tilesSchemaVersion', 'v1'] }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.gridType': 1, '_id.resourcesSchemaVersion': 1 }
      }
    ]);

    // Get total counts
    const totals = await Grid.aggregate([
      {
        $match: { gridType: { $ne: 'homestead' } }
      },
      {
        $group: {
          _id: '$gridType',
          total: { $sum: 1 },
          v2Resources: {
            $sum: { $cond: [{ $eq: ['$resourcesSchemaVersion', 'v2'] }, 1, 0] }
          },
          v2Tiles: {
            $sum: { $cond: [{ $eq: ['$tilesSchemaVersion', 'v2'] }, 1, 0] }
          },
          hasV1Data: {
            $sum: { 
              $cond: [
                { 
                  $or: [
                    { $gt: [{ $size: { $ifNull: ['$resources', []] } }, 0] },
                    { $gt: [{ $size: { $ifNull: ['$tiles', []] } }, 0] }
                  ]
                }, 
                1, 
                0
              ]
            }
          }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      statusCounts,
      totals,
      summary: {
        totalNonHomesteads: totals.reduce((sum, t) => sum + t.total, 0),
        totalV2Resources: totals.reduce((sum, t) => sum + t.v2Resources, 0),
        totalV2Tiles: totals.reduce((sum, t) => sum + t.v2Tiles, 0),
        totalWithV1Data: totals.reduce((sum, t) => sum + t.hasV1Data, 0)
      }
    });

  } catch (error) {
    console.error('❌ Error checking migration status:', error);
    res.status(500).json({ error: 'Failed to check migration status.' });
  }
});

// Debug: Get detailed info about unmigrated grids
router.get('/debug-unmigrated-grids', async (req, res) => {
  try {
    // Find grids that appear to need migration but were skipped
    const suspiciousGrids = await Grid.find({
      gridType: { $ne: 'homestead' },
      $or: [
        // Has v1 resources but claims to be v2
        {
          resourcesSchemaVersion: 'v2',
          resources: { $exists: true, $ne: [] },
          resourcesV2: { $exists: false }
        },
        // Has v1 resources but no v2 version set
        {
          resourcesSchemaVersion: { $ne: 'v2' },
          resources: { $exists: true, $ne: [] },
          resourcesV2: { $exists: false }
        },
        // Missing schema version entirely but has resources
        {
          resourcesSchemaVersion: { $exists: false },
          resources: { $exists: true, $ne: [] }
        }
      ]
    }).select('_id gridType resourcesSchemaVersion tilesSchemaVersion resources resourcesV2 tiles tilesV2');

    const analysis = suspiciousGrids.map(grid => ({
      gridId: grid._id,
      gridType: grid.gridType,
      resourcesSchemaVersion: grid.resourcesSchemaVersion || 'missing',
      tilesSchemaVersion: grid.tilesSchemaVersion || 'missing',
      hasV1Resources: !!(grid.resources && grid.resources.length > 0),
      hasV2Resources: !!(grid.resourcesV2 && grid.resourcesV2.length > 0),
      hasV1Tiles: !!(grid.tiles && Array.isArray(grid.tiles) && grid.tiles.length > 0),
      hasV2Tiles: !!(grid.tilesV2 && typeof grid.tilesV2 === 'string'),
      v1ResourceCount: grid.resources ? grid.resources.length : 0,
      v2ResourceCount: grid.resourcesV2 ? grid.resourcesV2.length : 0,
      issue: determineIssue(grid)
    }));

    function determineIssue(grid) {
      if (!grid.resources || grid.resources.length === 0) {
        return 'No resources to migrate';
      }
      if (grid.resourcesSchemaVersion === 'v2' && (!grid.resourcesV2 || grid.resourcesV2.length === 0)) {
        return 'Claims v2 but missing resourcesV2 data';
      }
      if (grid.resourcesSchemaVersion !== 'v2' && grid.resources && grid.resources.length > 0) {
        return 'Has v1 resources but migration skipped';
      }
      return 'Unknown issue';
    }

    res.status(200).json({
      success: true,
      totalSuspicious: suspiciousGrids.length,
      analysis,
      summary: {
        noResources: analysis.filter(a => a.issue === 'No resources to migrate').length,
        claimsV2ButMissingData: analysis.filter(a => a.issue === 'Claims v2 but missing resourcesV2 data').length,
        hasV1ButSkipped: analysis.filter(a => a.issue === 'Has v1 resources but migration skipped').length,
        unknown: analysis.filter(a => a.issue === 'Unknown issue').length
      }
    });

  } catch (error) {
    console.error('❌ Error debugging unmigrated grids:', error);
    res.status(500).json({ error: 'Failed to debug unmigrated grids.' });
  }
});

///////////////////////////////////////////////////////////////
// BULK MIGRATION ROUTES FOR HOMESTEAD GRIDS
///////////////////////////////////////////////////////////////

// Bulk migrate homestead grids to v2 schema
router.post('/bulk-migrate-homesteads', async (req, res) => {
  try {
    // Find all homestead grids that are still v1
    const gridsToMigrate = await Grid.find({
      gridType: 'homestead',
      $or: [
        { resourcesSchemaVersion: { $ne: 'v2' } },
        { tilesSchemaVersion: { $ne: 'v2' } },
        { resourcesSchemaVersion: { $exists: false } },
        { tilesSchemaVersion: { $exists: false } }
      ]
    });

    console.log(`🏠 Found ${gridsToMigrate.length} homestead grids to migrate`);

    if (gridsToMigrate.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No homestead grids need migration',
        result: { migrated: 0, skipped: 0, errors: 0 }
      });
    }

    // Initialize encoders
    const masterResourcesPath = path.join(__dirname, '../tuning/resources.json');
    const masterResources = readJSON(masterResourcesPath);
    const resourceEncoder = new UltraCompactResourceEncoder(masterResources);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;
    const migrationResults = [];

    for (const grid of gridsToMigrate) {
      try {
        const currentResourcesVersion = grid.resourcesSchemaVersion || 'v1';
        const currentTilesVersion = grid.tilesSchemaVersion || 'v1';
        let resourcesMigrated = false;
        let tilesMigrated = false;

        // Migrate resources if needed (including empty grids)
        if (currentResourcesVersion !== 'v2') {
          if (grid.resources && grid.resources.length > 0) {
            // Grid has resources - encode them
            const encodedResources = [];
            for (const resource of grid.resources) {
              try {
                const encoded = resourceEncoder.encode(resource);
                encodedResources.push(encoded);
              } catch (error) {
                console.error(`❌ Failed to encode resource in homestead ${grid._id}:`, resource, error);
                throw new Error(`Failed to encode resource at (${resource.x}, ${resource.y}): ${error.message}`);
              }
            }
            
            grid.resourcesV2 = encodedResources;
            grid.resourcesSchemaVersion = 'v2';
            resourcesMigrated = true;
            console.log(`🏠 Migrated ${encodedResources.length} resources for homestead ${grid._id}`);
          } else {
            // Grid is empty - just set schema version to v2
            grid.resourcesSchemaVersion = 'v2';
            resourcesMigrated = true;
            console.log(`🏠 Set empty homestead ${grid._id} to v2 resources schema`);
          }
        }

        // Migrate tiles if needed
        if (currentTilesVersion !== 'v2' && grid.tiles && Array.isArray(grid.tiles)) {
          try {
            const encodedTiles = TileEncoder.encode(grid.tiles);
            grid.tilesV2 = encodedTiles;
            grid.tilesSchemaVersion = 'v2';
            tilesMigrated = true;
            console.log(`🏠 Migrated tiles for homestead ${grid._id}: ${encodedTiles.length} chars`);
          } catch (error) {
            console.error(`❌ Failed to encode tiles for homestead ${grid._id}:`, error);
            throw new Error(`Failed to encode tiles: ${error.message}`);
          }
        }

        if (resourcesMigrated || tilesMigrated) {
          grid.lastOptimized = new Date();
          await grid.save();
          migrated++;
          
          migrationResults.push({
            gridId: grid._id,
            gridType: grid.gridType,
            resourcesMigrated,
            tilesMigrated,
            status: 'success'
          });
        } else {
          skipped++;
          migrationResults.push({
            gridId: grid._id,
            gridType: grid.gridType,
            resourcesMigrated: false,
            tilesMigrated: false,
            status: 'skipped - already v2 or no data'
          });
        }

      } catch (error) {
        errors++;
        console.error(`❌ Error migrating homestead ${grid._id}:`, error);
        migrationResults.push({
          gridId: grid._id,
          gridType: grid.gridType,
          status: 'error',
          error: error.message
        });
      }
    }

    console.log(`✅ Homestead migration complete: ${migrated} migrated, ${skipped} skipped, ${errors} errors`);

    res.status(200).json({
      success: true,
      message: 'Homestead bulk migration completed',
      result: {
        migrated,
        skipped,
        errors,
        details: migrationResults
      }
    });

  } catch (error) {
    console.error('❌ Error in homestead bulk migration:', error);
    res.status(500).json({ error: 'Failed to perform homestead bulk migration.' });
  }
});

// Bulk delete v1 schema from migrated homestead grids
router.post('/bulk-delete-homesteads-v1', async (req, res) => {
  try {
    // Find all homestead grids that are v2 and still have v1 data
    const gridsToCleanup = await Grid.find({
      gridType: 'homestead',
      $and: [
        {
          $or: [
            { resourcesSchemaVersion: 'v2' },
            { tilesSchemaVersion: 'v2' }
          ]
        },
        {
          $or: [
            { resources: { $exists: true } },
            { tiles: { $exists: true } }
          ]
        }
      ]
    });

    console.log(`🗑️ Found ${gridsToCleanup.length} homestead grids with v1 data to cleanup`);

    if (gridsToCleanup.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No homestead grids need v1 cleanup',
        result: { cleaned: 0, errors: 0 }
      });
    }

    let cleaned = 0;
    let errors = 0;
    const cleanupResults = [];

    for (const grid of gridsToCleanup) {
      try {
        const updateFields = {};
        const unsetFields = {};
        let needsUpdate = false;

        // Remove resources field if grid is v2 for resources
        if (grid.resourcesSchemaVersion === 'v2' && grid.resources) {
          unsetFields.resources = 1;
          needsUpdate = true;
        }

        // Remove tiles field if grid is v2 for tiles  
        if (grid.tilesSchemaVersion === 'v2' && grid.tiles) {
          unsetFields.tiles = 1;
          needsUpdate = true;
        }

        if (needsUpdate) {
          await Grid.findByIdAndUpdate(grid._id, {
            $unset: unsetFields,
            $set: { lastOptimized: new Date() }
          });

          cleaned++;
          console.log(`🗑️ Cleaned v1 data from homestead ${grid._id}`);
          
          cleanupResults.push({
            gridId: grid._id,
            gridType: grid.gridType,
            removedResources: !!unsetFields.resources,
            removedTiles: !!unsetFields.tiles,
            status: 'success'
          });
        }

      } catch (error) {
        errors++;
        console.error(`❌ Error cleaning homestead ${grid._id}:`, error);
        cleanupResults.push({
          gridId: grid._id,
          gridType: grid.gridType,
          status: 'error',
          error: error.message
        });
      }
    }

    console.log(`✅ Homestead cleanup complete: ${cleaned} cleaned, ${errors} errors`);

    res.status(200).json({
      success: true,
      message: 'Homestead V1 cleanup completed',
      result: {
        cleaned,
        errors,
        details: cleanupResults
      }
    });

  } catch (error) {
    console.error('❌ Error in homestead bulk cleanup:', error);
    res.status(500).json({ error: 'Failed to perform homestead bulk cleanup.' });
  }
});

// Check migration status of homestead grids
router.get('/migration-status-homesteads', async (req, res) => {
  try {
    // Count homestead grids by schema version
    const statusCounts = await Grid.aggregate([
      {
        $match: { gridType: 'homestead' }
      },
      {
        $group: {
          _id: {
            resourcesSchemaVersion: { $ifNull: ['$resourcesSchemaVersion', 'v1'] },
            tilesSchemaVersion: { $ifNull: ['$tilesSchemaVersion', 'v1'] }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.resourcesSchemaVersion': 1, '_id.tilesSchemaVersion': 1 }
      }
    ]);

    // Get summary counts
    const summary = await Grid.aggregate([
      {
        $match: { gridType: 'homestead' }
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          v2Resources: {
            $sum: { $cond: [{ $eq: ['$resourcesSchemaVersion', 'v2'] }, 1, 0] }
          },
          v2Tiles: {
            $sum: { $cond: [{ $eq: ['$tilesSchemaVersion', 'v2'] }, 1, 0] }
          },
          hasV1Data: {
            $sum: { 
              $cond: [
                { 
                  $or: [
                    { $gt: [{ $size: { $ifNull: ['$resources', []] } }, 0] },
                    { $gt: [{ $size: { $ifNull: ['$tiles', []] } }, 0] }
                  ]
                }, 
                1, 
                0
              ]
            }
          }
        }
      }
    ]);

    const summaryData = summary[0] || { total: 0, v2Resources: 0, v2Tiles: 0, hasV1Data: 0 };

    res.status(200).json({
      success: true,
      statusCounts,
      summary: summaryData
    });

  } catch (error) {
    console.error('❌ Error checking homestead migration status:', error);
    res.status(500).json({ error: 'Failed to check homestead migration status.' });
  }
});

// ORPHANED HOMESTEADS CLEANUP ENDPOINTS
// Preview orphaned homesteads (GET for safety)
router.get('/preview-orphaned-homesteads', async (req, res) => {
  try {
    // Find orphaned homesteads using aggregation
    const orphanedHomesteads = await Grid.aggregate([
      { $match: { gridType: 'homestead' } },
      { 
        $lookup: { 
          from: 'players', 
          localField: 'ownerId', 
          foreignField: '_id', 
          as: 'owner' 
        }
      },
      { $match: { owner: { $size: 0 } } },
      {
        $project: {
          _id: 1,
          ownerId: 1,
          gridType: 1,
          createdAt: 1,
          lastOptimized: 1,
          updatedAt: 1,
          playersInGridLastUpdated: 1,
          NPCsInGridLastUpdated: 1,
          resourcesSchemaVersion: { $ifNull: ['$resourcesSchemaVersion', 'v1'] },
          tilesSchemaVersion: { $ifNull: ['$tilesSchemaVersion', 'v1'] },
          resources: 1,
          resourcesV2: 1,
          tiles: 1,
          tilesV2: 1,
          playersInGrid: 1,
          NPCsInGrid: 1,
          __v: 1
        }
      },
      { $sort: { createdAt: 1 } }
    ]);

    // Get summary statistics with staleness analysis
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - (1 * 24 * 60 * 60 * 1000));
    const threeDaysAgo = new Date(now.getTime() - (3 * 24 * 60 * 60 * 1000));
    const oneWeekAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    const oneMonthAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    const threeMonthsAgo = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
    const sixMonthsAgo = new Date(now.getTime() - (180 * 24 * 60 * 60 * 1000));

    // Helper functions to check data
    const hasData = (g) => {
      return (g.resources && Array.isArray(g.resources) && g.resources.length > 0) ||
             (g.resourcesV2 && g.resourcesV2.length > 0) ||
             (g.tiles && Array.isArray(g.tiles) && g.tiles.length > 0) ||
             (g.tilesV2 && g.tilesV2.length > 0);
    };

    const hasActivity = (g) => {
      const playersActive = (g.playersInGrid && (
        (Array.isArray(g.playersInGrid) && g.playersInGrid.length > 0) ||
        (typeof g.playersInGrid === 'object' && Object.keys(g.playersInGrid).length > 0)
      ));
      const npcsActive = (g.NPCsInGrid && (
        (Array.isArray(g.NPCsInGrid) && g.NPCsInGrid.length > 0) ||
        (typeof g.NPCsInGrid === 'object' && Object.keys(g.NPCsInGrid).length > 0)
      ));
      return playersActive || npcsActive;
    };

    const getLastActivity = (g) => {
      // Only use meaningful timestamps - exclude createdAt as it's not "activity"
      // Prioritize specific activity timestamps over general updatedAt
      return g.playersInGridLastUpdated || g.NPCsInGridLastUpdated || g.lastOptimized || g.updatedAt;
    };

    const getCreationInfo = (g) => {
      return g.createdAt ? new Date(g.createdAt) : null;
    };

    const summary = {
      totalOrphaned: orphanedHomesteads.length,
      byResourcesVersion: {
        v1: orphanedHomesteads.filter(g => g.resourcesSchemaVersion === 'v1').length,
        v2: orphanedHomesteads.filter(g => g.resourcesSchemaVersion === 'v2').length
      },
      byTilesVersion: {
        v1: orphanedHomesteads.filter(g => g.tilesSchemaVersion === 'v1').length,
        v2: orphanedHomesteads.filter(g => g.tilesSchemaVersion === 'v2').length
      },
      withData: orphanedHomesteads.filter(hasData).length,
      withoutData: orphanedHomesteads.filter(g => !hasData(g)).length,
      withActivity: orphanedHomesteads.filter(hasActivity).length,
      staleness: {
        veryStale: orphanedHomesteads.filter(g => {
          const lastActivity = getLastActivity(g);
          return lastActivity && new Date(lastActivity) < sixMonthsAgo;
        }).length,
        stale: orphanedHomesteads.filter(g => {
          const lastActivity = getLastActivity(g);
          return lastActivity && new Date(lastActivity) < threeMonthsAgo && new Date(lastActivity) >= sixMonthsAgo;
        }).length,
        somewhatStale: orphanedHomesteads.filter(g => {
          const lastActivity = getLastActivity(g);
          return lastActivity && new Date(lastActivity) < oneMonthAgo && new Date(lastActivity) >= threeMonthsAgo;
        }).length,
        recentWeek: orphanedHomesteads.filter(g => {
          const lastActivity = getLastActivity(g);
          return lastActivity && new Date(lastActivity) < oneWeekAgo && new Date(lastActivity) >= oneMonthAgo;
        }).length,
        recentDays: orphanedHomesteads.filter(g => {
          const lastActivity = getLastActivity(g);
          return lastActivity && new Date(lastActivity) < threeDaysAgo && new Date(lastActivity) >= oneWeekAgo;
        }).length,
        veryRecent: orphanedHomesteads.filter(g => {
          const lastActivity = getLastActivity(g);
          return lastActivity && new Date(lastActivity) < oneDayAgo && new Date(lastActivity) >= threeDaysAgo;
        }).length,
        today: orphanedHomesteads.filter(g => {
          const lastActivity = getLastActivity(g);
          return lastActivity && new Date(lastActivity) >= oneDayAgo;
        }).length,
        noActivityTimestamp: orphanedHomesteads.filter(g => {
          return !getLastActivity(g);
        }).length
      },
      creationInfo: {
        withCreatedAt: orphanedHomesteads.filter(g => g.createdAt).length,
        withoutCreatedAt: orphanedHomesteads.filter(g => !g.createdAt).length
      }
    };

    // Sample of orphaned homesteads for review
    const sampleSize = 10;
    const sample = orphanedHomesteads.slice(0, sampleSize);

    console.log(`📊 Found ${orphanedHomesteads.length} orphaned homesteads`);
    console.log(`📈 Summary:`, summary);

    res.status(200).json({
      success: true,
      summary,
      sample,
      totalCount: orphanedHomesteads.length,
      message: `Found ${orphanedHomesteads.length} orphaned homesteads. ${sample.length} shown in sample.`
    });

  } catch (error) {
    console.error('❌ Error previewing orphaned homesteads:', error);
    res.status(500).json({ error: 'Failed to preview orphaned homesteads.' });
  }
});

// Delete orphaned homesteads (POST with confirmation)
router.post('/delete-orphaned-homesteads', async (req, res) => {
  const { confirm, dryRun = false } = req.body;
  
  if (!confirm) {
    return res.status(400).json({ 
      error: 'Confirmation required. Send { "confirm": true } to proceed.' 
    });
  }

  try {
    // Double-check we still have 170 valid players and count orphaned homesteads
    const playerCount = await Player.countDocuments();
    const totalHomesteads = await Grid.countDocuments({ gridType: 'homestead' });
    
    // Find orphaned homesteads with full safety checks
    const orphanedHomesteads = await Grid.aggregate([
      { $match: { gridType: 'homestead' } },
      { 
        $lookup: { 
          from: 'players', 
          localField: 'ownerId', 
          foreignField: '_id', 
          as: 'owner' 
        }
      },
      { $match: { owner: { $size: 0 } } },
      {
        $project: {
          _id: 1,
          ownerId: 1,
          gridType: 1,
          createdAt: 1,
          lastOptimized: 1,
          updatedAt: 1,
          playersInGridLastUpdated: 1,
          NPCsInGridLastUpdated: 1,
          resourcesSchemaVersion: { $ifNull: ['$resourcesSchemaVersion', 'v1'] },
          tilesSchemaVersion: { $ifNull: ['$tilesSchemaVersion', 'v1'] },
          resources: 1,
          resourcesV2: 1,
          tiles: 1,
          tilesV2: 1,
          playersInGrid: 1,
          NPCsInGrid: 1,
          __v: 1
        }
      }
    ]);

    // Safety check: ensure we have reasonable numbers
    const expectedOrphaned = totalHomesteads - playerCount;
    if (orphanedHomesteads.length !== expectedOrphaned) {
      return res.status(400).json({
        error: `Safety check failed: Expected ${expectedOrphaned} orphaned, found ${orphanedHomesteads.length}`,
        details: {
          totalHomesteads,
          playerCount,
          orphanedFound: orphanedHomesteads.length,
          expectedOrphaned
        }
      });
    }

    // Safety check: don't proceed if numbers look wrong
    if (playerCount < 150 || playerCount > 200) {
      return res.status(400).json({
        error: `Safety check failed: Player count ${playerCount} is outside expected range (150-200)`
      });
    }

    if (orphanedHomesteads.length < 100 || orphanedHomesteads.length > 150) {
      return res.status(400).json({
        error: `Safety check failed: Orphaned count ${orphanedHomesteads.length} is outside expected range (100-150)`
      });
    }

    if (dryRun) {
      return res.status(200).json({
        success: true,
        dryRun: true,
        message: `DRY RUN: Would delete ${orphanedHomesteads.length} orphaned homesteads`,
        details: {
          totalHomesteads,
          playerCount,
          orphanedToDelete: orphanedHomesteads.length,
          validHomesteadsRemaining: totalHomesteads - orphanedHomesteads.length
        },
        orphanedSample: orphanedHomesteads.slice(0, 5)
      });
    }

    // Perform the deletion with progress tracking
    let deleted = 0;
    let errors = 0;
    const deleteResults = [];

    console.log(`🗑️ Starting deletion of ${orphanedHomesteads.length} orphaned homesteads...`);

    for (const homestead of orphanedHomesteads) {
      try {
        // Additional safety: double-check each homestead is still orphaned
        const player = await Player.findById(homestead.ownerId);
        if (player) {
          console.warn(`⚠️ Skipping ${homestead._id} - owner ${homestead.ownerId} found during deletion`);
          deleteResults.push({
            gridId: homestead._id,
            ownerId: homestead.ownerId,
            status: 'skipped',
            reason: 'Owner found during deletion'
          });
          continue;
        }

        // Safe to delete
        await Grid.findByIdAndDelete(homestead._id);
        deleted++;
        
        deleteResults.push({
          gridId: homestead._id,
          ownerId: homestead.ownerId,
          status: 'deleted',
          createdAt: homestead.createdAt
        });

        // Progress logging every 25 deletions
        if (deleted % 25 === 0) {
          console.log(`🗑️ Progress: ${deleted}/${orphanedHomesteads.length} deleted`);
        }

      } catch (error) {
        errors++;
        console.error(`❌ Error deleting homestead ${homestead._id}:`, error);
        deleteResults.push({
          gridId: homestead._id,
          ownerId: homestead.ownerId,
          status: 'error',
          error: error.message
        });
      }
    }

    // Final verification
    const finalHomesteadCount = await Grid.countDocuments({ gridType: 'homestead' });
    const finalPlayerCount = await Player.countDocuments();

    console.log(`✅ Cleanup complete: ${deleted} deleted, ${errors} errors`);
    console.log(`📊 Final counts: ${finalHomesteadCount} homesteads, ${finalPlayerCount} players`);

    res.status(200).json({
      success: true,
      message: `Successfully deleted ${deleted} orphaned homesteads`,
      details: {
        deleted,
        errors,
        beforeCounts: {
          homesteads: totalHomesteads,
          players: playerCount,
          orphaned: orphanedHomesteads.length
        },
        afterCounts: {
          homesteads: finalHomesteadCount,
          players: finalPlayerCount,
          expectedMatch: finalHomesteadCount === finalPlayerCount
        }
      },
      deleteResults: deleteResults.slice(0, 10) // Show first 10 results
    });

  } catch (error) {
    console.error('❌ Error deleting orphaned homesteads:', error);
    res.status(500).json({ error: 'Failed to delete orphaned homesteads.' });
  }
});

module.exports = router;
