const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;
const fs = require('fs');
const express = require('express');
const router = express.Router();
const path = require('path');
const { readJSON } = require('../utils/fileUtils');
const Grid = require('../models/grid'); // Assuming you have a Grid model
const queue = require('../queue'); // Import the in-memory queue

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


module.exports = router;
