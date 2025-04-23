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

    // Sanitize full gridState: extract maps safely
    const { npcs: npcsObj = {}, pcs: pcsObj = {}, lastUpdated: topTs } = gridState;
    // Build NPC map
    const { lastUpdated: npcTs, ...npcEntries } = npcsObj;
    grid.gridState.npcs = new Map(Object.entries(npcEntries));
    grid.gridState.npcs.lastUpdated = new Date(npcTs);
    // Build PC map
    const { lastUpdated: pcTs, ...pcEntries } = pcsObj;
    grid.gridState.pcs = new Map(Object.entries(pcEntries));
    grid.gridState.pcs.lastUpdated = new Date(pcTs);
    // Top-level timestamp
    grid.gridState.lastUpdated = new Date(topTs || Date.now());

    await grid.save();
//    console.log('GridState saved: with pcs: ',gridState.pcs);
//    console.log(`GridState saved successfully for gridId: ${gridId}`);
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
    // Replace only the PCs map and bump its lastUpdated
    const { lastUpdated: clientTs, ...pcEntries } = pcs;
    grid.gridState.pcs = new Map(Object.entries(pcEntries));
    grid.gridState.pcs.lastUpdated = new Date(clientTs);
    await grid.save();
    res.status(200).json({ success: true, message: 'GridState PCs saved successfully.' });
  } catch (error) {
    console.error('Error saving gridState PCs:', error);
    res.status(500).json({ error: 'Failed to save gridState PCs.' });
  }
});

// Proper handler: update-grid-state-pcs
router.post('/update-grid-state-pcs', async (req, res) => {
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
    grid.gridState.pcs = new Map(Object.entries(pcEntries));
    grid.gridState.pcs.lastUpdated = new Date(clientTs);
    await grid.save();
    res.status(200).json({ success: true, message: 'GridState PCs updated successfully.' });
  } catch (error) {
    console.error('Error updating gridState PCs:', error);
    res.status(500).json({ error: 'Failed to update gridState PCs.' });
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
      lastUpdated: grid.gridState.lastUpdated || Date.now(), // 
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



module.exports = router;
