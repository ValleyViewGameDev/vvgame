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

    // Split into separate NPC/PC maps
    const { npcs: rawNPCs = {}, pcs: rawPCs = {}, lastUpdated: topTs } = gridState;
    const { lastUpdated: npcTs, ...npcEntries } = rawNPCs;
    const { lastUpdated: pcTs,  ...pcEntries } = rawPCs;
    grid.set('gridStateNPCs', new Map(Object.entries(npcEntries)));
    grid.set('gridStateNPCs.lastUpdated', new Date(npcTs || topTs || Date.now()));
    grid.set('gridStatePCs', new Map(Object.entries(pcEntries)));
    grid.set('gridStatePCs.lastUpdated', new Date(pcTs || topTs || Date.now()));

    await grid.save();
    res.status(200).json({ success: true, message: `GridState saved successfully.` });
  } catch (error) {
    console.error('Error saving gridState:', error);
    res.status(500).json({ error: 'Failed to save gridState.' });
  }
});

// Dedicated route: save only PCs without altering NPCs
router.post('/save-grid-state-pcs', async (req, res) => {
  const { gridId, pcs } = req.body;
  if (!gridId || pcs == null) {
    return res.status(400).json({ error: 'gridId and pcs are required.' });
  }
  try {
    const grid = await Grid.findById(gridId);
    if (!grid) {
      return res.status(404).json({ error: `Grid not found for ID: ${gridId}` });
    }
    const { lastUpdated: clientTs, ...pcEntries } = pcs;
    grid.set('gridStatePCs', new Map(Object.entries(pcEntries)));
    grid.set('gridStatePCs.lastUpdated', new Date(clientTs));
    await grid.save();
    res.status(200).json({ success: true, message: 'GridState PCs saved successfully.' });
  } catch (error) {
    console.error('Error saving gridState PCs:', error);
    res.status(500).json({ error: 'Failed to save gridState PCs.' });
  }
});



router.get('/load-grid-state/:gridId', async (req, res) => {
  const { gridId } = req.params;
  console.log('Loading gridState for gridId:', gridId);
  try {
    const grid = await Grid.findById(gridId, 'gridStateNPCs gridStatePCs');
    if (!grid) {
      return res.status(404).send({ error: 'Grid not found.' });
    }

    // Normalize separate NPC and PC maps
    const rawNPCs = grid.gridStateNPCs || new Map();
    const rawPCs  = grid.gridStatePCs  || new Map();
    const gridStateNPCs = {
      npcs: Object.fromEntries(rawNPCs),
      lastUpdated: grid.gridStateNPCs.lastUpdated || Date.now()
    };
    const gridStatePCs = {
      pcs:  Object.fromEntries(rawPCs),
      lastUpdated: grid.gridStatePCs.lastUpdated  || Date.now()
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
