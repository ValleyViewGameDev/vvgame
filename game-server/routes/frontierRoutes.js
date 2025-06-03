// /game-server/routes/frontierRoutes.js
const mongoose = require('mongoose');
const fs = require('fs');
const express = require('express');
const router = express.Router();
const path = require('path');
const { readJSON } = require('../utils/fileUtils');
const Settlement = require('../models/settlement');
const Frontier = require('../models/frontier');
const Grid = require('../models/grid'); // If needed for referencing large grid data
const Player = require("../models/player"); // Adjust path as needed
const tuningConfig = require('../tuning/globalTuning.json');
const seasonConfig = require('../tuning/seasons.json');
const { getTemplate } = require('../utils/templateUtils');
const { ObjectId } = require("mongodb");
const { levyTax } = require("../controllers/taxController"); // Import the function

// ========================
// Coordinate Calculation
// ========================
function calcGridCoord(frontierTier, frontierIndex, setRow, setCol, gridRow, gridCol) {
  // Frontier Tier -> 2 digits
  const tierStr = frontierTier.toString().padStart(2, '0');    // e.g. "01"
  // Frontier Index -> 2 digits
  const indexStr = frontierIndex.toString().padStart(2, '0');  // e.g. "02"
  // Settlement row -> 1 digit (0..7)
  const sRowStr = setRow.toString();
  // Settlement col -> 1 digit (0..7)
  const sColStr = setCol.toString();
  // Grid row -> 1 digit (0..7)
  const gRowStr = gridRow.toString();
  // Grid col -> 1 digit (0..7)
  const gColStr = gridCol.toString();

  // Combined string => e.g. "01023456"
  const codeStr = tierStr + indexStr + sRowStr + sColStr + gRowStr + gColStr;

  // Convert to integer (or store as a string if you prefer)
  return parseInt(codeStr, 10);
}

// ============================================
// FRONTIER ROUTES
// ============================================

// Example: GET /frontiers-by-name
router.get('/frontiers-by-name', async (req, res) => {
  try {
    const { name, tier } = req.query;
    const query = {};
    if (name) query.name = name;
    if (tier) query.tier = tier;

    const frontiers = await Frontier.find(query).populate('settlements');
    if (frontiers.length === 0) {
      return res.status(404).json({ error: 'No frontier found with the specified criteria.' });
    }
    res.status(200).json(frontiers);
  } catch (error) {
    console.error('Error fetching Frontiers:', error);
    res.status(500).json({ error: 'Failed to fetch Frontiers' });
  }
});

// Example: GET /api/frontiers
// Returns all frontiers with _id and name for UI dropdowns
router.get('/frontiers', async (req, res) => {
  try {
    const frontiers = await Frontier.find({}, '_id name');
    res.status(200).json(frontiers);
  } catch (error) {
    console.error('❌ Error fetching frontiers:', error);
    res.status(500).json({ error: 'Failed to fetch frontiers.' });
  }
});


// Example: GET /get-frontier/:frontierId
router.get("/get-frontier/:frontierId", async (req, res) => {
  try {
    const { frontierId } = req.params;
    if (!frontierId) {
      return res.status(400).json({ error: "Frontier ID is required." });
    }

    const frontier = await Frontier.findById(frontierId).populate("settlements");
    if (!frontier) {
      return res.status(404).json({ error: "Frontier not found." });
    }
    res.status(200).json(frontier);
  } catch (error) {
    console.error("Error fetching frontier:", error);
    res.status(500).json({ error: "Failed to fetch frontier." });
  }
});

// Example: GET /get-frontier-grid/:frontierId
router.get('/get-frontier-grid/:frontierId', async (req, res) => {
  try {
    const { frontierId } = req.params;
    const frontier = await Frontier.findById(frontierId).lean();
    if (!frontier) {
      console.error(`Frontier not found for frontierId: ${frontierId}`);
      return res.status(404).json({ error: 'Frontier not found' });
    }
    res.status(200).json({ frontierGrid: frontier.settlements });
  } catch (error) {
    console.error('Error fetching Frontier Grid:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// POST /create-frontier
// Purpose: Creates a new Frontier with settlements & sub-grids
// No more placeholderName—just gridCoord!
// ============================================
router.post('/create-frontier', async (req, res) => {
  console.log('Debug route hit: /create-frontier');
  try {
    console.log('Step 1: Initializing Frontier creation...');

    // 1) Determine the next available "Valley View X" name
    const existingFrontiers = await Frontier.find({ name: /^Valley View \d+$/ }).sort({ name: -1 });
    let nextFrontierNumber = 1;
    if (existingFrontiers.length > 0) {
      const lastFrontier = existingFrontiers[0];
      const lastNumber = parseInt(lastFrontier.name.split(' ')[2], 10);
      nextFrontierNumber = lastNumber + 1;
    }
    const frontierName = `Valley View ${nextFrontierNumber}`;

    // ✅ **Ensure Season Start & End Times**
    const now = new Date();

    // ✅ Get phase durations from `globalTuning`
    const taxDuration = tuningConfig.taxes.phases[tuningConfig.taxes.startPhase] * 60000;
    const electionDuration = tuningConfig.elections.phases[tuningConfig.elections.startPhase] * 60000;
    const seasonDuration = tuningConfig.seasons.phases[tuningConfig.seasons.startPhase] * 60000;
    const trainDuration = tuningConfig.train.phases[tuningConfig.train.startPhase] * 60000;
    const bankDuration = tuningConfig.bank.phases[tuningConfig.bank.startPhase] * 60000;
    
    // ✅ Define start and end times
    const seasonStart = now;
    const seasonEnd = new Date(now.getTime() + seasonDuration);
    const taxEnd = new Date(now.getTime() + taxDuration);
    const electionEnd = new Date(now.getTime() + electionDuration);
    const trainEnd = new Date(now.getTime() + trainDuration);
    const bankEnd = new Date(now.getTime() + bankDuration);
    
    // ✅ Ensure all timers are properly initialized
    const newFrontier = new Frontier({
      name: frontierName,
      tier: 1,               
      settlements: [],
      governor: null,
      globalState: {
        resourceModifiers: {},
        weather: 'clear',
        events: [],
      },
      seasons: {
        seasonNumber: 1,
        seasonType: 'Spring',
        phase: tuningConfig.seasons.startPhase,
        startTime: seasonStart,
        endTime: seasonEnd,
      },
      taxes: {
        phase: tuningConfig.taxes.startPhase,
        startTime: now,
        endTime: taxEnd,
      },
      elections: {
        phase: tuningConfig.elections.startPhase,
        startTime: now,
        endTime: electionEnd,
      },
      train: {
        phase: tuningConfig.train.startPhase,
        startTime: now,
        endTime: trainEnd,
      },
      bank: {
        phase: tuningConfig.bank.startPhase,
        startTime: now,
        endTime: bankEnd,
        offers: [],
      },
    });
    
    await newFrontier.save();

    console.log(`Step 2a: Frontier created => Name "${newFrontier.name}", ID: ${newFrontier._id}`);

    // 3) Load a frontier layout (8x8)
    // e.g. 'frontierTier1' might define an 8x8 template of settlement types
    const frontierLayout = getTemplate('frontierLayouts', 'frontierTier1');
    if (!frontierLayout) {
      throw new Error('No valid frontier layout found for frontierTier1.');
    }
    console.log('Using frontier layout:', frontierLayout);

    // Use nextFrontierNumber as "frontierIndex"; adjust as you wish
    const frontierIndex = nextFrontierNumber;

    // 4) Build the settlements 2D array
    const settlementsGrid = [];

    for (let row = 0; row < frontierLayout.template.length; row++) {
      const rowEntries = [];

      for (let col = 0; col < frontierLayout.template[row].length; col++) {
        const settlementTileType = frontierLayout.template[row][col];
        console.log(`Processing settlementTileType "${settlementTileType}" at row ${row}, col ${col}`);

        // Retrieve an 8x8 sub-grid layout for the settlement
        const gridLayout = getTemplate('settlementLayouts', settlementTileType);
        if (!gridLayout) {
          console.warn(`No valid template found for ${settlementTileType}. Skipping this cell.`);
          continue;
        }
 
        // Build the 'grids' subdocument array
        const grids = [];
        for (let i = 0; i < gridLayout.template.length; i++) {
          const rowGrids = [];
          for (let j = 0; j < gridLayout.template[i].length; j++) {
            const cell = gridLayout.template[i][j];

            // Determine gridType & availability
            let gridType = 'reserved';
            let available = false;
            switch (cell) {
              case 'H':
                gridType = 'homestead';
                available = true;
                break;
              case 'T':
                gridType = 'town';
                break;
              case 'R':
                gridType = 'reserved';
                break;
              case 'valley0':
              case 'valley1':
              case 'valley2':
              case 'valley3':
                gridType = cell;
                break;
            }

            // Calculate the unique coordinate
            const theCoord = calcGridCoord(
              newFrontier.tier,    // e.g. 1 => "01"
              frontierIndex,       // e.g. 1 => "01"
              row,                 // settlement row in frontier
              col,                 // settlement col in frontier
              i,                   // grid row in settlement
              j                    // grid col in settlement
            );

            rowGrids.push({
              gridCoord: theCoord,
              gridType,
              available
              // No placeholderName needed!
            });
          }
          grids.push(rowGrids);
        }

        // Create Settlement doc
        const newSettlement = new Settlement({
          name: `Settlement_${row}_${col}`,
          frontierId: newFrontier._id,
          grids,
          taxrate: 2,
          roles: [], // ✅ Initialize with an empty roles array
        });
        await newSettlement.save();

        console.log(`Created Settlement with ID: ${newSettlement._id}`);

        // Insert a reference to this settlement in the frontier's 8x8
        rowEntries.push({
          settlementId: newSettlement._id,
          settlementType: settlementTileType,
          available: settlementTileType.startsWith('homesteadSet'),
        });
      }

      settlementsGrid.push(rowEntries);
    }

    // 5) Attach the 2D array of settlements to the Frontier
    newFrontier.settlements = settlementsGrid;

    console.log("🔍 settlementsGrid before attaching to Frontier:", JSON.stringify(settlementsGrid, null, 2));

    await newFrontier.save();

    console.log(`Frontier "${newFrontier.name}" successfully created with settlements.`);

    // Respond
    res.status(201).json({
      success: true,
      message: 'New Frontier created successfully.',
      frontier: newFrontier,
    });
  } catch (error) {
    console.error('Error creating new Frontier:', error);
    res.status(500).json({ error: 'Failed to create new Frontier.' });
  }
});

// Example: GET /get-transit-map
router.get("/get-transit-map", async (req, res) => {
  try {
    const transitMapPath = path.join(__dirname, "../layouts/transitMap.json");
    const transitMap = require(transitMapPath);
    res.status(200).json(transitMap);
  } catch (error) {
    console.error("Error fetching transit map:", error.message || error);
    res.status(500).json({ error: "Failed to load transit map." });
  }
});

// Example: GET /frontiers/:frontierId
router.get('/frontiers/:frontierId', async (req, res) => {
  const { frontierId } = req.params;
  try {
    const frontier = await Frontier.findById(frontierId).lean();
    if (!frontier) {
      return res.status(404).json({ error: 'Frontier not found' });
    }
    // Optional: transform frontier.settlements if needed
    res.status(200).json(frontier);
  } catch (error) {
    console.error(`Error fetching frontier with ID ${frontierId}:`, error);
    res.status(500).json({ error: 'Failed to fetch frontier' });
  }
});

// Layout routes (homestead, settlement, frontier)
router.get('/layouts/homestead', (req, res) => {
  console.log('Getting Homestead layout');
  res.sendFile(path.join(__dirname, '../layouts/homesteadLayout.json'));
});

router.get('/layouts/settlement', (req, res) => {
  console.log('Getting Settlement layout');
  res.sendFile(path.join(__dirname, '../layouts/settlementLayout.json'));
});

router.get('/layouts/frontier', (req, res) => {
  console.log('Getting Frontier layout');
  res.sendFile(path.join(__dirname, '../layouts/frontierLayout.json'));
});


///////////
/////////// SEASON-RELATED ROUTES
///////////

router.post('/reset-season', async (req, res) => {
  try {
      const frontier = await Frontier.findOne();
      if (!frontier) return res.status(404).json({ message: 'Frontier not found.' });

      // Extract season types from the config
      const seasonTypes = seasonConfig.map(season => season.seasonType);
      const currentIndex = seasonTypes.indexOf(frontier.seasons.seasonType);
      const nextSeasonIndex = (currentIndex + 1) % seasonTypes.length;
      const nextSeason = seasonConfig[nextSeasonIndex]; // Get full object

      // Update the season state with new season attributes
      frontier.seasons.seasonNumber += 1;
      frontier.seasons.seasonPhase = "onSeason";
      frontier.seasons.seasonStart = new Date();
      frontier.seasons.seasonEnd = new Date(Date.now() + tuningConfig.onSeasonLength * 60000);
      frontier.seasons.seasonType = nextSeason.seasonType;

      await frontier.save();

      console.log(`✅ Season reset: Now in ${nextSeason.seasonType}, Season ${frontier.seasons.seasonNumber}`);
      res.status(200).json({ 
          success: true, 
          message: `Season reset to ${nextSeason.seasonType}, Season ${frontier.seasons.seasonNumber}.`,
          season: frontier.seasons
      });
  } catch (error) {
      console.error('❌ Error resetting season:', error);
      res.status(500).json({ error: 'Failed to reset season.' });
  }
});

router.get('/get-season', async (req, res) => {
  try {
      const frontier = await Frontier.findOne();
      if (!frontier) return res.status(404).json({ message: 'Frontier not found.' });

      res.status(200).json(frontier.seasons);
  } catch (error) {
      console.error('❌ Error fetching season:', error);
      res.status(500).json({ error: 'Failed to fetch season.' });
  }
});


router.get('/get-tuning', async (req, res) => {
    try {
        res.status(200).json({
            onSeasonLength: tuningConfig.onSeasonLength,
            offSeasonLength: tuningConfig.offSeasonLength
        });
    } catch (error) {
        console.error('❌ Error fetching tuning data:', error);
        res.status(500).json({ error: 'Failed to fetch tuning data.' });
    }
});

// GET /api/tuning/seasons
router.get('/tuning/seasons', async (req, res) => {
  try {
    res.status(200).json(seasonConfig); // Already imported as `seasonConfig`
  } catch (error) {
    console.error('❌ Error fetching seasons.json:', error);
    res.status(500).json({ error: 'Failed to fetch season tuning data.' });
  }
});

router.get('/get-global-season-phase', async (req, res) => {
  try {
    const frontier = await Frontier.findOne({});
    if (!frontier || !frontier.seasons) {
      return res.status(404).json({ error: "No frontier with season data found" });
    }
    res.json({
      phase: frontier.seasons.phase,
      seasonType: frontier.seasons.seasonType,
      endTime: frontier.seasons.endTime,
    });
  } catch (error) {
    console.error("❌ Error in get-global-season-phase:", error);
    res.status(500).json({ error: "Server error" });
  }
});



///////////
/////////// TAXES
///////////

router.post("/levy-tax", async (req, res) => {
  try {
    const { frontierId } = req.body;
    if (!frontierId) return res.status(400).json({ error: "Frontier ID is required." });

    const result = await levyTax(frontierId);
    res.json(result);
  } catch (error) {
    console.error("❌ Error in /levy-tax route:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;