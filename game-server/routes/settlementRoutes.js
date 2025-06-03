const mongoose = require('mongoose');
const fs = require('fs');
const express = require('express');
const router = express.Router();
const path = require('path');
const { readJSON } = require('../utils/fileUtils');
const { tileTypes } = require('../utils/worldUtils');
const Settlement = require('../models/settlement');
const Frontier = require('../models/frontier');
const Town = require('../models/town');
const Grid = require('../models/grid'); // Assuming you have a Grid model
const Player = require('../models/player'); // Import the Player model
const tuningConfig = require('../tuning/globalTuning.json');


// ✅ Route to get all settlements with id and name
router.get('/settlements', async (req, res) => {
  try {
    const settlements = await Settlement.find({}, '_id name').lean();
    res.status(200).json(settlements);
  } catch (error) {
    console.error('❌ Error fetching settlements:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// SETTLEMENT ROUTES

router.get('/get-settlement-by-grid/:gridId', async (req, res) => {
  console.log('Route hit with params:', req.params);

  try {
    const { gridId } = req.params;

    console.log('Fetching settlement for gridId:', gridId);

    // Ensure the gridId is treated as a string or ObjectId as needed
    const objectId = new mongoose.Types.ObjectId(gridId);

    // Query to search for the gridId in the nested grids array of arrays
    const settlement = await Settlement.findOne({
      grids: { $elemMatch: { $elemMatch: { gridId: objectId } } }
    }).lean();

    if (!settlement) {
      console.error(`No settlement found containing gridId: ${gridId}`);
      return res.status(404).json({ error: 'Settlement not found' });
    }

    // Return the settlementId
    res.status(200).json({ settlementId: settlement._id });
  } catch (error) {
    console.error('Error fetching settlement ID by grid:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/get-settlement/:settlementId', async (req, res) => {

    console.log(`📡 Received request for settlement ID: ${req.params.settlementId}`);
    
    try {
      const { settlementId } = req.params;
  
      // Ensure settlementId is valid
      if (!mongoose.Types.ObjectId.isValid(settlementId)) {
        console.error(`Invalid settlementId: ${settlementId}`);
        return res.status(400).json({ error: 'Invalid settlement ID.' });
      }
  
      // Query the database for the settlement
      const settlement = await Settlement.findById(settlementId).lean();
  
      if (!settlement) {
        console.error(`No settlement found for settlementId: ${settlementId}`);
        return res.status(404).json({ error: 'Settlement not found.' });
      }
  
      // Return the full settlement document
      console.log('Settlement fetched');
      res.status(200).json(settlement);
    } catch (error) {
      console.error('Error fetching settlement:', error);
      res.status(500).json({ error: 'Internal server error.' });
    }
});

router.get('/get-settlement-grid/:settlementId', async (req, res) => {
  console.log('Fetching Settlement Grid for settlementId:', req.params.settlementId);

  try {
    const { settlementId } = req.params;
    const objectId = new mongoose.Types.ObjectId(settlementId);

    // First get settlement grids
    const settlement = await Settlement.findById(objectId).lean();
    if (!settlement) {
      return res.status(404).json({ error: 'Settlement not found' });
    }

    // Get all gridIds from the settlement
    const gridIds = settlement.grids.flat()
      .filter(g => g.gridId)
      .map(g => g.gridId);

    // Fetch just the ownerId for these grids
    const gridOwners = await Grid.find(
      { _id: { $in: gridIds } },
      { ownerId: 1 }
    ).lean();

    // Create a map of gridId to ownerId
    const ownerMap = gridOwners.reduce((acc, grid) => {
      acc[grid._id.toString()] = grid.ownerId;
      return acc;
    }, {});

    // Add owner information to the settlement grid
    const enrichedGrid = settlement.grids.map(row =>
      row.map(cell => ({
        ...cell,
        ownerId: cell.gridId ? ownerMap[cell.gridId.toString()] : null
      }))
    );

    res.status(200).json({ grid: enrichedGrid });
  } catch (error) {
    console.error('Error fetching settlement grid:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/get-settlement-by-coords/:row/:col', async (req, res) => {
    const { row, col } = req.params;
  
    if (!row || !col) {
      return res.status(400).json({ error: 'Row and column are required.' });
    }
  
    try {
      console.log(`Fetching settlement with coordinates row: ${row}, col: ${col}`);
  
      // Build the settlement name based on coordinates
      const settlementName = `Settlement_${row}_${col}`;
  
      // Query the settlement by its name
      const settlement = await Settlement.findOne({ name: settlementName }).lean();
  
      if (!settlement) {
        console.warn(`No settlement found with name: ${settlementName}`);
        return res.status(404).json({ error: 'Settlement not found for given coordinates.' });
      }
  
      res.status(200).json(settlement);
    } catch (error) {
      console.error('Error fetching settlement by coordinates:', error);
      res.status(500).json({ error: 'Failed to fetch settlement.' });
    }
});

router.get('/players-in-settlement', async (req, res) => {
  // Route to fetch players in a specific settlement
  const { settlementId } = req.query;

  if (!settlementId) {
    return res.status(400).send('Missing settlementId');
  }

  try {
    const players = await Player.find({ 'location.s': settlementId }, 'username playerId accountStatus');
    res.status(200).json({ players });
  } catch (error) {
    console.error('Error fetching players in settlement:', error);
    res.status(500).send('Server error fetching players in settlement');
  }
});

router.post('/update-settlement', async (req, res) => {
    try {
        const { settlementId, updates } = req.body;

        if (!settlementId || !updates) {
            return res.status(400).json({ success: false, error: "Missing settlementId or updates." });
        }

        // If trying to update name, redirect to displayName
        if (updates.name) {
            updates.displayName = updates.name;
            delete updates.name;
        }

        console.log(`Updating settlement ${settlementId} with:`, updates);

        // ✅ Find the settlement by ID and update fields
        const updatedSettlement = await Settlement.findOneAndUpdate(
            { _id: settlementId },
            { $set: updates },
            { new: true } // ✅ Return the updated document
        );

        if (!updatedSettlement) {
            return res.status(404).json({ success: false, error: "Settlement not found." });
        }

        console.log("✅ Settlement updated:", updatedSettlement);
        res.json({ success: true, settlement: updatedSettlement });

    } catch (error) {
        console.error("❌ Error updating settlement:", error);
        res.status(500).json({ success: false, error: "Internal server error." });
    }
});

router.post('/increment-settlement-population', async (req, res) => {
  const { settlementId } = req.body;

  if (!mongoose.Types.ObjectId.isValid(settlementId)) {
      return res.status(400).json({ error: 'Invalid settlement ID format.' });
  }

  try {
      // Update Settlement document
      const updatedSettlement = await Settlement.findByIdAndUpdate(
          settlementId,
          { $inc: { population: 1 } },
          { new: true }
      );

      if (!updatedSettlement) {
          return res.status(404).json({ error: 'Settlement not found.' });
      }

      console.log('🔍 Settlement updated:', {
          id: updatedSettlement._id,
          newPopulation: updatedSettlement.population,
          frontierId: updatedSettlement.frontierId
      });

      // Find frontier using frontierId from the settlement
      const frontier = await Frontier.findById(updatedSettlement.frontierId);

      console.log('🔍 Found Frontier:', { id: frontier?._id, hasSettlements: !!frontier?.settlements });

      if (frontier) {
          let updated = false;
          frontier.settlements.forEach((row, i) => {
              row.forEach((settlement, j) => {
                  if (settlement.settlementId.toString() === settlementId) {
                      console.log('🔍 Found settlement in frontier:', {
                          position: `[${i}][${j}]`,
                          oldPopulation: settlement.population,
                          newPopulation: updatedSettlement.population
                      });
                      settlement.population = updatedSettlement.population;
                      updated = true;
                  }
              });
          });

          if (updated) {
              frontier.markModified('settlements');
              await frontier.save();
              
              // Verify the update
              const verifyFrontier = await Frontier.findById(frontier._id);
              const verifySettlement = verifyFrontier.settlements.flat()
                  .find(s => s.settlementId.toString() === settlementId);
              
              console.log('✅ Verification after save:', {
                  settlementId,
                  expectedPopulation: updatedSettlement.population,
                  actualPopulation: verifySettlement?.population
              });
          } else {
              console.warn('⚠️ Settlement found in Frontier but not updated');
          }
      }

      res.status(200).json({ 
          success: true, 
          population: updatedSettlement.population 
      });

  } catch (error) {
      console.error('❌ Error incrementing settlement population:', error);
      res.status(500).json({ error: 'Failed to increment settlement population.' });
  }
});


///////////
/////////// GOVERNMENT-RELATED ROUTES
///////////


router.post('/update-settlement-role', async (req, res) => {
  try {
      const { settlementId, roleName, playerId } = req.body;

      console.log(`🏛️ Assigning player ${playerId} to role "${roleName}" in settlement ${settlementId}`);

      if (!mongoose.Types.ObjectId.isValid(settlementId) || !mongoose.Types.ObjectId.isValid(playerId)) {
          return res.status(400).json({ error: 'Invalid settlement or player ID format.' });
      }

      // 🔍 Fetch existing settlement
      const existingSettlement = await Settlement.findById(settlementId).lean();
      if (!existingSettlement) {
          return res.status(404).json({ error: 'Settlement not found.' });
      }

      // 🏛️ Remove any previous role the player held
      const updatedRoles = existingSettlement.roles.filter(role => role.playerId !== playerId);

      // 🚀 Ensure the new role object has the correct format
      const newRole = { roleName, playerId };

      // 🔄 Add the new role to the updated roles list
      updatedRoles.push(newRole);

      // 🔄 Update the settlement, preserving other fields dynamically
      const updatedSettlement = await Settlement.findByIdAndUpdate(
          settlementId,
          { $set: { roles: updatedRoles } }, // ✅ Ensure only roles are updated
          { new: true, runValidators: true }
      );

      console.log(`✅ Player ${playerId} assigned as ${roleName}.`);
      res.status(200).json(updatedSettlement);

  } catch (error) {
      console.error('❌ Error updating settlement role:', error);
      res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/settlement/:id/roles', async (req, res) => {
  try {
      const settlement = await Settlement.findById(req.params.id).populate('roles.playerId', 'username');
      if (!settlement) {
          return res.status(404).json({ success: false, error: "Settlement not found." });
      }

      // ✅ Map roles with player usernames
      const rolesWithNames = settlement.roles.map(role => ({
          roleName: role.roleName,
          playerId: role.playerId ? role.playerId._id : null,
          username: role.playerId ? role.playerId.username : "Vacant"
      }));

      res.json(rolesWithNames);
  } catch (error) {
      console.error("❌ Error fetching roles:", error);
      res.status(500).json({ success: false, error: "Internal server error." });
  }
});

router.get('/election-phase/:settlementId', async (req, res) => {
  const { settlementId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(settlementId)) {
    return res.status(400).json({ error: 'Invalid settlement ID.' });
  }

  try {
    const settlement = await Settlement.findById(settlementId, 'electionPhase');

    if (!settlement) {
      return res.status(404).json({ error: 'Settlement not found.' });
    }

    res.status(200).json({ electionPhase: settlement.electionPhase });
  } catch (error) {
    console.error('❌ Error fetching election phase:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/reset-election-votes', async (req, res) => {
  const { settlementId } = req.body;
  if (!settlementId) return res.status(400).json({ error: 'Missing settlement ID.' });

  try {
      const updatedSettlement = await Settlement.findByIdAndUpdate(settlementId, {
          votes: [], // ✅ Use an empty array instead of an object
          campaignPromises: [], // ✅ Reset campaign promises
      }, { new: true });

      console.log(`✅ Election reset for ${settlementId}. New phase: Campaigning`);
      res.status(200).json({ message: 'Election reset successfully', settlement: updatedSettlement });

  } catch (error) {
      console.error('Error resetting election:', error);
      res.status(500).json({ error: 'Internal server error.' });
  }
});


router.get('/election-status/:settlementId', async (req, res) => {
  const { settlementId } = req.params;

  console.log(`📡 Received election status request for settlement ID: ${settlementId}`);

  if (!mongoose.Types.ObjectId.isValid(settlementId)) {
      return res.status(400).json({ error: 'Invalid settlement ID format.' });
  }

  try {
      const settlement = await Settlement.findById(settlementId);

      if (!settlement) {
          return res.status(404).json({ error: 'Settlement not found.' });
      }

      const now = new Date();
      const { campaignStart, votingStart, votingEnd } = settlement;

      let nextPhase;
      let timeRemainingMs;
      if (now < campaignStart) {
          nextPhase = "Campaigning";
          timeRemainingMs = campaignStart - now;
      } else if (now < votingStart) {
          nextPhase = "Voting";
          timeRemainingMs = votingStart - now;
      } else if (now < votingEnd) {
          nextPhase = "Administration";
          timeRemainingMs = votingEnd - now;
        } else {
          console.log(`🔄 Election cycle ended, resetting to next campaign.`);
          
          // ✅ Auto-reset timestamps to create a new cycle
          const now = new Date();
          const campaignStart = new Date(now.getTime() + tuningConfig.termLength * 60000); 
          const votingStart = new Date(campaignStart.getTime() + tuningConfig.campaignLength * 60000);
          const votingEnd = new Date(votingStart.getTime() + tuningConfig.votingLength * 60000);
      
          // ✅ Update settlement in DB
          await Settlement.findByIdAndUpdate(settlementId, {
              campaignStart,
              votingStart,
              votingEnd,
              electionPhase: "Administration",  // Ensure phase starts correctly
              campaignPromises: [],
              votes: {},
              electionCandidates: []
          });
      
          console.log(`🔁 New election cycle scheduled for ${settlement.name}: Campaign starts at ${campaignStart}`);
      
          nextPhase = "Campaigning"; // Ensure UI shows proper next phase
          timeRemainingMs = campaignStart - now;
      }

      let electionPhase;
        if (now < campaignStart) {
          electionPhase = "Administration";
      } else if (now < votingStart) {
        electionPhase = "Campaigning";
      } else if (now < votingEnd) {
        electionPhase = "Voting";
      } else {
        electionPhase = "Administration"; // Ensure phase resets correctly after election cycle
      }

      const timeRemaining = {
          hours: Math.floor(timeRemainingMs / (1000 * 60 * 60)),
          minutes: Math.floor((timeRemainingMs % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((timeRemainingMs % (1000 * 60)) / 1000),
      };

      res.status(200).json({
          currentPhase: electionPhase || "Unknown",
          nextPhase,
          timeRemaining,
      });
  } catch (error) {
      console.error("❌ Error retrieving election status:", error);
      res.status(500).json({ error: "Internal server error." });
  }
});

router.post('/save-campaign-promise', async (req, res) => {
  const { settlementId, playerId, username, text } = req.body;

  console.log(`📢 Saving campaign promise in settlement ${settlementId}: ${username} → ${text}`);

  if (!mongoose.Types.ObjectId.isValid(settlementId) || !mongoose.Types.ObjectId.isValid(playerId)) {
      return res.status(400).json({ error: 'Invalid ID format.' });
  }

  try {
      const settlement = await Settlement.findById(settlementId);
      if (!settlement) {
          return res.status(404).json({ error: 'Settlement not found.' });
      }

      // ✅ Append new campaign promise without modifying votes
      settlement.campaignPromises.push({ playerId, username, text });

      // ✅ Save ONLY campaignPromises field
      await settlement.save();

      console.log(`✅ Campaign promise saved: ${username} → ${text}`);

      res.status(200).json({ 
          message: 'Campaign promise successfully submitted.', 
          campaignPromises: settlement.campaignPromises 
      });
  } catch (error) {
      console.error('❌ Error saving campaign promise:', error);
      res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/cast-vote', async (req, res) => {
  const { settlementId, voterId, candidateId } = req.body;

  console.log(`🗳️ Incoming vote in settlement ${settlementId}: ${voterId} → ${candidateId}`);

  // ✅ Validate IDs
  if (!mongoose.Types.ObjectId.isValid(settlementId) || !mongoose.Types.ObjectId.isValid(voterId) || !mongoose.Types.ObjectId.isValid(candidateId)) {
      return res.status(400).json({ error: 'Invalid ID format.' });
  }

  try {
      const settlement = await Settlement.findById(settlementId);
      if (!settlement) {
          return res.status(404).json({ error: 'Settlement not found.' });
      }

      // ✅ Validate voter & candidate exist
      const candidateExists = settlement.campaignPromises.find(p => p.playerId?.toString() === candidateId.toString());
      if (!candidateExists) {
          return res.status(400).json({ error: 'Invalid candidate: Not found in campaignPromises.' });
      }

      // ✅ Check if voter already voted
      const alreadyVoted = settlement.votes.some(vote => vote.voterId?.toString() === voterId.toString());
      if (alreadyVoted) {
          return res.status(400).json({ error: 'Already voted.' });
      }

      // ✅ Ensure votes are stored properly
      settlement.votes.push({ voterId, candidateId });

      console.log("✅ Votes before saving:", settlement.votes);

      // ✅ Save updated settlement with new vote
      await settlement.save();

      console.log(`✅ Vote recorded: ${voterId} → ${candidateId}`);
      res.status(200).json({ message: 'Vote successfully cast.' });

  } catch (error) {
      console.error('❌ Error casting vote:', error);
      res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/settlement/:id/taxlog', async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid settlement ID.' });
  }

  try {
    const settlement = await Settlement.findById(id, 'taxlog').lean();
    if (!settlement) {
      return res.status(404).json({ error: 'Settlement not found.' });
    }

    res.status(200).json({ taxlog: settlement.taxlog || [] });
  } catch (error) {
    console.error('❌ Error fetching tax log:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});


///////////
////// TRAIN ROUTES
///////////

router.get("/get-train", async (req, res) => {
  try {
      const trainData = await getTrainDataFromDB(); // Fetch from DB
      res.json(trainData);
  } catch (error) {
      console.error("Error fetching train data:", error);
      res.status(500).json({ error: "Failed to fetch train data" });
  }
});

router.post('/update-train-offer/:settlementId', async (req, res) => {
  const { updateOffer } = req.body;
  const { settlementId } = req.params;

  try {
    const settlement = await Settlement.findById(settlementId);
    if (!settlement) return res.status(404).json({ error: 'Settlement not found' });

    const offerIndex = settlement.currentoffers.findIndex(o =>
      o.itemBought === updateOffer.itemBought &&
      o.qtyBought === updateOffer.qtyBought &&
      o.itemGiven === updateOffer.itemGiven &&
      o.qtyGiven === updateOffer.qtyGiven
    );

    if (offerIndex === -1) {
      return res.status(404).json({ error: 'Offer not found' });
    }

    // ✅ Apply updates dynamically if fields are present
    if ('claimedBy' in updateOffer) {
      settlement.currentoffers[offerIndex].claimedBy = updateOffer.claimedBy;
    }
    if ('filled' in updateOffer) {
      settlement.currentoffers[offerIndex].filled = updateOffer.filled;
    }

    await settlement.save();
    return res.status(200).json({ success: true });

  } catch (error) {
    console.error("❌ Error updating offer:", error);
    return res.status(500).json({ error: 'Server error' });
  }
});


module.exports = router;
