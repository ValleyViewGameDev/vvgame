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
  const { gridId, pcs, gridStatePCsLastUpdated } = req.body;

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

    // Update the gridStatePCs and timestamp
    grid.gridStatePCs = pcs;
    grid.gridStatePCsLastUpdated = new Date(gridStatePCsLastUpdated);

    await grid.save();

    console.log(`✅ PCs successfully saved for gridId: ${gridId}`);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ Error saving gridState PCs:', error);
    res.status(500).json({ error: 'Failed to save gridState PCs.' });
  }
});

// Dedicated route: save a single PC to gridStatePCs
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

    // Ensure gridStatePCs is a Map
    const pcs = new Map(grid.gridStatePCs || []);
    pcs.set(playerId, pc);
    grid.gridStatePCs = pcs;

    // Optionally update global PC timestamp
    grid.gridStatePCsLastUpdated = new Date(lastUpdated);

    await grid.save();

    console.log(`✅ Single PC ${playerId} saved for gridId: ${gridId}`);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ Error saving single PC:', error);
    res.status(500).json({ error: 'Failed to save single PC.' });
  }
});

// Dedicated route: save only NPCs without altering PCs
router.post('/save-grid-state-npcs', async (req, res) => {
  const { gridId, npcs, gridStateNPCsLastUpdated } = req.body;

  if (!gridId || npcs == null) {
    return res.status(400).json({ error: 'gridId and npcs are required.' });
  }
  try {
    const grid = await Grid.findById(gridId);
    if (!grid) {
      return res.status(404).json({ error: `Grid not found for ID: ${gridId}` });
    }
    const { lastUpdated: clientTs, ...npcEntries } = npcs;
    grid.set('gridStateNPCs', new Map(Object.entries(npcEntries)));
    grid.set('gridStateNPCsLastUpdated', new Date(clientTs));
    await grid.save();
    res.status(200).json({ success: true, message: 'GridState NPCs saved successfully.' });
  } catch (error) {
    console.error('Error saving gridState NPCs:', error);
    res.status(500).json({ error: 'Failed to save gridState NPCs.' });
  }
});


router.get('/load-grid-state/:gridId', async (req, res) => {
  const { gridId } = req.params;
  console.log('Loading gridState for gridId:', gridId);
  try {
    const grid = await Grid.findById(gridId, 'gridStateNPCs gridStateNPCsLastUpdated gridStatePCs gridStatePCsLastUpdated');
    if (!grid) {
      return res.status(404).send({ error: 'Grid not found.' });
    }

    // Normalize separate NPC and PC maps
    const rawNPCs = grid.gridStateNPCs || new Map();
    const rawPCs  = grid.gridStatePCs  || new Map();
    const gridStateNPCs = {
      npcs: Object.fromEntries(rawNPCs),
      lastUpdated: grid.gridStateNPCsLastUpdated || 0
    };
    const gridStatePCs = {
      pcs:  Object.fromEntries(rawPCs),
      lastUpdated: grid.gridStatePCsLastUpdated  || 0
    };
    res.send({ gridStateNPCs, gridStatePCs });
  } catch (error) {
    console.error('Error fetching gridState:', error);
    res.status(500).send({ error: 'Failed to fetch gridState.' });
  }
});

router.post('/get-multiple-grid-states', async (req, res) => {
  const { gridIds } = req.body;
  
  if (!Array.isArray(gridIds)) {
    return res.status(400).json({ error: 'gridIds must be an array' });
  }

  try {
    // Find all grids in one query
    const grids = await Grid.find({ _id: { $in: gridIds } });
    
    // Create a map of gridId to gridState
    const gridStates = grids.reduce((acc, grid) => {
      acc[grid._id] = grid.gridState || {};
      return acc;
    }, {});
    
    res.json(gridStates);
  } catch (error) {
    console.error('Error fetching multiple grid states:', error);
    res.status(500).json({ error: 'Failed to fetch grid states' });
  }
});

module.exports = router;
