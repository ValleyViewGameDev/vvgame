// /game-server/routes/frontierRoutes.js
const mongoose = require('mongoose');
const fs = require('fs');
const express = require('express');
const router = express.Router();
const { readJSON } = require('../utils/fileUtils');
const Settlement = require('../models/settlement');
const Frontier = require('../models/frontier');
const Grid = require('../models/grid'); // If needed for referencing large grid data
const tuningConfig = require('../tuning/globalTuning.json');
const seasonConfig = require('../tuning/seasons.json');
const { getTemplate } = require('../utils/templateUtils');
const { ObjectId } = require("mongodb");

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
// TUNING DATA ROUTES
// ============================================

// GET /api/global-tuning - Returns global tuning configuration
router.get('/global-tuning', async (req, res) => {
  try {
    res.json(tuningConfig);
  } catch (error) {
    console.error('Error fetching global tuning:', error);
    res.status(500).json({ error: 'Failed to fetch global tuning' });
  }
});

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
// Returns all frontiers with full document data (including season, tax, election, train, bank timing, etc.)
router.get('/frontiers', async (req, res) => {
  try {
    const frontiers = await Frontier.find({});
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
    const messagesDuration = tuningConfig.messages.phases[tuningConfig.messages.startPhase] * 60000;
    const dungeonDuration = tuningConfig.dungeon.phases[tuningConfig.dungeon.startPhase] * 60000;

    // ✅ Define start and end times
    const seasonStart = now;
    const seasonEnd = new Date(now.getTime() + seasonDuration);
    const taxEnd = new Date(now.getTime() + taxDuration);
    const electionEnd = new Date(now.getTime() + electionDuration);
    const trainEnd = new Date(now.getTime() + trainDuration);
    const bankEnd = new Date(now.getTime() + bankDuration);
    const messagesEnd = new Date(now.getTime() + messagesDuration);
    const dungeonEnd = new Date(now.getTime() + dungeonDuration);

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
      messages: {
        phase: tuningConfig.messages.startPhase,
        startTime: now,
        endTime: messagesEnd,
        offers: [],
      },
      dungeon: {
        phase: tuningConfig.dungeon.startPhase,
        startTime: now,
        endTime: dungeonEnd,
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






///////////
/////////// SEASON-RELATED ROUTES
///////////




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


/////////// LOGS

// ✅ Get season log for a specific frontier
router.get('/frontier/:frontierId/seasonlog', async (req, res) => {
  try {
    const { frontierId } = req.params;
    const frontier = await Frontier.findById(frontierId).lean();
    if (!frontier) {
      return res.status(404).json({ error: 'Frontier not found.' });
    }

    const seasonlog = frontier.seasonlog || [];
    res.status(200).json({ seasonlog });
  } catch (error) {
    console.error("❌ Error fetching season log:", error);
    res.status(500).json({ error: 'Failed to fetch season log.' });
  }
});



// ✅ Bundled frontier data with settlement grids
router.get('/frontier-bundle/:frontierId', async (req, res) => {
  try {
    const { frontierId } = req.params;
    const playerSettlementId = req.query?.playerSettlementId;

    // Step 1: Fetch the frontier grid structure
    const frontier = await Frontier.findById(frontierId).lean();
    if (!frontier) {
      return res.status(404).json({ error: 'Frontier not found' });
    }

    // Step 2: Build settlement map by ID
    const settlementIds = frontier.settlements.flat().map(tile => tile.settlementId).filter(Boolean);
    const settlements = await Settlement.find({ _id: { $in: settlementIds } }).lean();
    const settlementsMap = {};
    settlements.forEach(settlement => {
      settlementsMap[settlement._id] = settlement;
    });

    // Step 3: Load settlement grids - include if has any claimed homesteads or is player's settlement
    const populatedSettlementData = {};
    const closedIds = new Set(frontier.settlements.flat().filter(e => e && e.available === false && /^homestead/.test(e.settlementType || '')).map(e => String(e.settlementId)));
    for (const settlement of settlements) {
      if (closedIds.has(String(settlement._id)) && String(settlement._id) !== String(playerSettlementId)) continue; // closed corner (§4.4)
      // Check if settlement has any claimed homesteads (non-available homestead slots)
      const hasClaimedHomesteads = settlement.grids.flat().some(cell => 
        cell && cell.gridType === 'homestead' && cell.gridId && !cell.available
      );
      
      if (
        hasClaimedHomesteads ||
        String(settlement._id) === String(playerSettlementId)
      ) {
        populatedSettlementData[settlement._id] = { grid: settlement.grids };
      }
    }

    res.status(200).json({
      frontierGrid: frontier.settlements,
      settlementGrids: populatedSettlementData,
    });
  } catch (error) {
    console.error('❌ Error in /frontier-bundle:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/homestead-gridcoord/:gridId - Find gridCoord for a specific gridId
router.get('/homestead-gridcoord/:gridId', async (req, res) => {
  try {
    const { gridId } = req.params;
    
    if (!gridId) {
      return res.status(400).json({ error: 'GridId is required' });
    }

    console.log('🏠 Searching for gridId:', gridId);

    // Convert gridId to ObjectId for proper comparison
    const { ObjectId } = require('mongodb');
    const searchGridId = new ObjectId(gridId);

    // Find all settlements and search their grids for the matching gridId
    const settlements = await Settlement.find({}).lean();
    console.log(`🏠 Found ${settlements.length} settlements to search`);
    
    for (const settlement of settlements) {
      if (settlement.grids && Array.isArray(settlement.grids)) {
        for (let row = 0; row < settlement.grids.length; row++) {
          if (Array.isArray(settlement.grids[row])) {
            for (let col = 0; col < settlement.grids[row].length; col++) {
              const cell = settlement.grids[row][col];
              if (cell && cell.gridId) {
                // Compare ObjectIds properly
                if (cell.gridId.toString() === gridId || cell.gridId.equals(searchGridId)) {
                  console.log('🏠✅ Found matching gridId in settlement:', settlement._id);
                  return res.status(200).json({
                    gridCoord: cell.gridCoord,
                    settlementId: settlement._id,
                    position: { row, col }
                  });
                }
              }
            }
          }
        }
      }
    }
    
    // GridId not found
    console.log('🏠❌ GridId not found in any settlement');
    return res.status(404).json({ error: 'GridId not found in any settlement' });
    
  } catch (error) {
    console.error('❌ Error finding gridCoord for gridId:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;