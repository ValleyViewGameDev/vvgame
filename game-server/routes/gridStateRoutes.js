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

// Save or update gridState
router.post('/save-grid-state', async (req, res) => {
  const { gridId, gridState } = req.body;

  if (!gridId || !gridState) {
    return res.status(400).json({
      error: 'gridId and gridState are required.',
    });
  }

  try {
    console.log(`Saving gridState for gridId: ${gridId}`);
    const grid = await Grid.findById(gridId);
    if (!grid) {
      return res.status(404).json({ error: `Grid not found for ID: ${gridId}` });
    }

    grid.gridState = gridState;
    await grid.save();
//    console.log('GridState saved: with pcs: ',gridState.pcs);
//    console.log(`GridState saved successfully for gridId: ${gridId}`);
    res.status(200).json({ success: true, message: `GridState saved successfully.` });
  } catch (error) {
    console.error('Error saving gridState:', error);
    res.status(500).json({ error: 'Failed to save gridState.' });
  }
});

router.get('/load-grid-state/:gridId', async (req, res) => {
  const { gridId } = req.params;
  console.log('Loading gridState for gridId:', gridId);
  try {
    const grid = await Grid.findById(gridId, 'gridState');
    //console.log('Grid.findById found:', grid);
    if (!grid) {
      return res.status(404).send({ error: 'Grid not found.' });
    }

    // Normalize the Map fields to plain objects
    const gridState = {
      npcs: grid.gridState.npcs ? Object.fromEntries(grid.gridState.npcs) : {},
      pcs: grid.gridState.pcs
        ? Object.fromEntries(
            Array.from(grid.gridState.pcs).map(([key, value]) => [
              key,
              value.toObject ? value.toObject() : { ...value }, // Robustly convert to plain object
            ])
          )
        : {},
      lastUpdated: grid.gridState.lastUpdated || Date.now(), // ✅ Add this line
    };

    //console.log('Normalized gridState:', gridState);
    res.send({ gridState });
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

// New route for PC-only updates
router.post('/update-grid-state-pcs', async (req, res) => {
  const { gridId, pcs, lastUpdated } = req.body;

  if (!gridId || !pcs) {
    return res.status(400).json({
      error: 'gridId and pcs are required.',
    });
  }

  try {
    console.log(`Updating PCs for gridId: ${gridId}`);
    const grid = await Grid.findById(gridId);
    if (!grid) {
      return res.status(404).json({ error: `Grid not found for ID: ${gridId}` });
    }

    // Initialize gridState if it doesn't exist
    if (!grid.gridState) {
      grid.gridState = { npcs: {}, pcs: {}, lastUpdated: Date.now() };
    }

    // Only update PCs, preserve existing NPCs
    grid.gridState = {
      ...grid.gridState,
      pcs,
      lastUpdated: lastUpdated || Date.now()
    };

    await grid.save();
    console.log(`✅ PCs updated successfully for gridId: ${gridId}`);
    
    res.status(200).json({ 
      success: true, 
      message: 'PCs updated successfully',
      lastUpdated: grid.gridState.lastUpdated
    });
  } catch (error) {
    console.error('Error updating PCs:', error);
    res.status(500).json({ error: 'Failed to update PCs.' });
  }
});

// New route for NPC-only updates
router.post('/update-grid-state-npcs', async (req, res) => {
  const { gridId, npcs, lastUpdated } = req.body;

  if (!gridId || !npcs) {
    return res.status(400).json({
      error: 'gridId and npcs are required.',
    });
  }

  try {
    console.log(`Updating NPCs for gridId: ${gridId}`);
    const grid = await Grid.findById(gridId);
    if (!grid) {
      return res.status(404).json({ error: `Grid not found for ID: ${gridId}` });
    }

    // Initialize gridState if it doesn't exist
    if (!grid.gridState) {
      grid.gridState = { npcs: {}, pcs: {}, lastUpdated: Date.now() };
    }

    // Only update NPCs, preserve existing PCs
    grid.gridState = {
      ...grid.gridState,
      npcs,
      lastUpdated: lastUpdated || Date.now()
    };

    await grid.save();
    console.log(`✅ NPCs updated successfully for gridId: ${gridId}`);
    
    res.status(200).json({ 
      success: true, 
      message: 'NPCs updated successfully',
      lastUpdated: grid.gridState.lastUpdated
    });
  } catch (error) {
    console.error('Error updating NPCs:', error);
    res.status(500).json({ error: 'Failed to update NPCs.' });
  }
});

module.exports = router;
