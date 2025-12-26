const express = require('express');
const router = express.Router();
const Grid = require('../models/grid');

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

// Dedicated route: save a single PC to playersInGrid (using atomic operations)
router.post('/save-single-pc', async (req, res) => {
  const { gridId, playerId, pc, lastUpdated } = req.body;

  try {
    if (!gridId || !playerId || !pc || !lastUpdated) {
      console.error('❌ save-single-pc: Missing required parameters', { gridId: !!gridId, playerId: !!playerId, pc: !!pc, lastUpdated: !!lastUpdated });
      return res.status(400).json({ error: 'gridId, playerId, pc, and lastUpdated are required.' });
    }

    console.log(`🔍 save-single-pc: Attempting to save PC ${playerId} to grid ${gridId}`);

    // Validate lastUpdated date format
    let updatedDate;
    try {
      updatedDate = new Date(lastUpdated);
      if (isNaN(updatedDate.getTime())) {
        throw new Error('Invalid date format');
      }
    } catch (dateError) {
      console.error('❌ save-single-pc: Invalid lastUpdated date format:', lastUpdated, dateError);
      return res.status(400).json({ error: 'Invalid lastUpdated date format.' });
    }

    // Add lastUpdated to pc object
    pc.lastUpdated = updatedDate;

    // Use atomic update to avoid VersionError race conditions
    const result = await Grid.findByIdAndUpdate(
      gridId,
      {
        $set: {
          [`playersInGrid.${playerId}`]: pc,
          playersInGridLastUpdated: updatedDate
        }
      },
      { new: true }
    );

    if (!result) {
      console.error(`❌ save-single-pc: Grid not found for gridId: ${gridId}`);
      return res.status(404).json({ error: 'Grid not found.' });
    }

    console.log(`✅ Single PC ${playerId} saved atomically for gridId: ${gridId}`);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ Error saving single PC:', {
      error: error.message,
      stack: error.stack,
      gridId,
      playerId,
      pcData: pc ? Object.keys(pc) : 'undefined',
      lastUpdated
    });
    res.status(500).json({ error: 'Failed to save single PC.' });
  }
});

// Dedicated route: remove a single PC from playersInGrid (using atomic operations)
router.post('/remove-single-pc', async (req, res) => {
  const { gridId, playerId } = req.body;

  try {
    if (!gridId || !playerId) {
      return res.status(400).json({ error: 'gridId and playerId are required.' });
    }

    console.log(`🔍 remove-single-pc: Attempting to remove player ${playerId} from grid ${gridId}`);

    // Use atomic update to avoid VersionError race conditions
    const result = await Grid.findByIdAndUpdate(
      gridId,
      {
        $unset: {
          [`playersInGrid.${playerId}`]: 1
        },
        $set: {
          playersInGridLastUpdated: new Date()
        }
      },
      { new: true }
    );

    if (!result) {
      console.log(`⚠️ Grid not found for removal: ${gridId}`);
      return res.status(404).json({ error: 'Grid not found.' });
    }

    console.log(`✅ Completed remove-single-pc for player ${playerId} from grid ${gridId}`);
    res.status(200).json({ success: true, removed: true });
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

    // ✅ OPTIMIZED: Update single NPC field directly without loading entire grid
    // This reduces memory usage by ~100x for grids with many NPCs
    npc.lastUpdated = new Date(lastUpdated);

    const result = await Grid.updateOne(
      { _id: gridId },
      {
        $set: {
          [`NPCsInGrid.${npcId}`]: npc,
          NPCsInGridLastUpdated: new Date(lastUpdated)
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Grid not found.' });
    }

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

    // Skip validation to allow removal even if other NPCs have invalid data
    await grid.save({ validateBeforeSave: false });

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

    // ✅ OPTIMIZED: Build update operations for multiple NPC positions without loading grid
    const updateOps = {};
    const lastUpdated = new Date(timestamp || Date.now());

    for (const [npcId, position] of updateEntries) {
      // Validate position has x and y
      if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
        continue; // Skip invalid positions
      }

      // Build dot-notation path for each NPC's position
      updateOps[`NPCsInGrid.${npcId}.position`] = { x: position.x, y: position.y };
      updateOps[`NPCsInGrid.${npcId}.lastUpdated`] = lastUpdated;
    }

    // Update grid's global timestamp
    updateOps.NPCsInGridLastUpdated = lastUpdated;

    // Execute single atomic update for all NPCs
    const result = await Grid.updateOne(
      { _id: gridId },
      { $set: updateOps }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Grid not found.' });
    }

    const updatedCount = updateEntries.length;
    console.log(`💾 Batch updated ${updatedCount} NPC positions for grid ${gridId}`);

    res.status(200).json({
      success: true,
      updated: updatedCount,
      total: updateEntries.length
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

    // ✅ OPTIMIZED: Build update operations for multiple PC positions without loading grid
    // This prevents race conditions where grid.save() could overwrite concurrent remove-single-pc calls
    const updateOps = {};
    const lastUpdated = new Date(timestamp || Date.now());

    for (const [playerId, pcData] of updateEntries) {
      // Validate pcData has required fields
      if (!pcData || typeof pcData !== 'object') {
        continue; // Skip invalid data
      }

      // Build dot-notation path for each PC's fields
      // Only update fields that are present in pcData to avoid overwriting
      if (pcData.position && typeof pcData.position.x === 'number' && typeof pcData.position.y === 'number') {
        updateOps[`playersInGrid.${playerId}.position`] = { x: pcData.position.x, y: pcData.position.y };
      }

      // Update other PC properties if present
      const allowedFields = ['hp', 'maxhp', 'armorclass', 'attackbonus', 'damage', 'attackrange', 'speed', 'iscamping', 'isinboat'];
      for (const field of allowedFields) {
        if (pcData[field] !== undefined) {
          updateOps[`playersInGrid.${playerId}.${field}`] = pcData[field];
        }
      }

      updateOps[`playersInGrid.${playerId}.lastUpdated`] = lastUpdated;
    }

    // Update grid's global timestamp
    updateOps.playersInGridLastUpdated = lastUpdated;

    // Execute single atomic update for all PCs
    const result = await Grid.updateOne(
      { _id: gridId },
      { $set: updateOps }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Grid not found.' });
    }

    const updatedCount = updateEntries.length;
    console.log(`💾 Batch updated ${updatedCount} PC positions atomically for grid ${gridId}`);

    res.status(200).json({
      success: true,
      updated: updatedCount,
      total: updateEntries.length
    });

  } catch (error) {
    console.error('❌ Error in batch PC position update:', error);
    res.status(500).json({ error: 'Failed to batch update PC positions.' });
  }
});

// Check if a specific grid has a specific resource type
router.get('/grid-has-resource', async (req, res) => {
  try {
    const { gridId, resourceType } = req.query;
    
    if (!gridId || !resourceType) {
      return res.status(400).json({ 
        error: 'gridId and resourceType query parameters are required' 
      });
    }
    
    // Find the specific grid
    const grid = await Grid.findOne({ 
      $or: [
        { _id: gridId },
        { gridId: gridId }
      ]
    }, 'gridId gridType resources').lean();
    
    if (!grid) {
      return res.json({ hasResource: false, error: 'Grid not found' });
    }
    
    // Decode resources to check for the specified resource type
    const masterResources = require('../tuning/resources.json');
    const UltraCompactResourceEncoder = require('../utils/ResourceEncoder');
    const encoder = new UltraCompactResourceEncoder(masterResources);
    
    let hasResource = false;
    
    for (const encodedResource of grid.resources || []) {
      try {
        const decoded = encoder.decode(encodedResource);
        if (decoded.type === resourceType) {
          hasResource = true;
          break;
        }
      } catch (error) {
        console.error(`Failed to decode resource:`, error);
      }
    }
    
    res.json({ 
      hasResource, 
      gridId: grid.gridId,
      gridType: grid.gridType
    });
    
  } catch (error) {
    console.error('Error checking grid resource:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to check grid resource' 
    });
  }
});

module.exports = router;