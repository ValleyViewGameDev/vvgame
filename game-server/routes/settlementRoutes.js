const mongoose = require('mongoose');
const fs = require('fs');
const express = require('express');
const router = express.Router();
const path = require('path');
const { readJSON } = require('../utils/fileUtils');
const { tileTypes } = require('../utils/worldUtils');
const Settlement = require('../models/settlement');
const Frontier = require('../models/frontier');
const Grid = require('../models/grid'); // Assuming you have a Grid model
const Player = require('../models/player'); // Import the Player model
 

// ✅ Route to get all settlements with full editor UI context
router.get('/settlements', async (req, res) => {
  try {
    const settlements = await Settlement.find({}).lean();

    // Collect all gridIds from all settlements
    const allGridIds = [];
    settlements.forEach(settlement => {
      if (settlement.grids) {
        settlement.grids.flat().forEach(cell => {
          if (cell.gridId) {
            allGridIds.push(cell.gridId);
          }
        });
      }
    });

    // Fetch region data for all grids in one query
    const gridRegions = await Grid.find(
      { _id: { $in: allGridIds } },
      { _id: 1, region: 1 }
    ).lean();

    // Create a map of gridId to region
    const regionMap = {};
    gridRegions.forEach(grid => {
      regionMap[grid._id.toString()] = grid.region;
    });

    // Enrich settlements with region data
    const enrichedSettlements = settlements.map(settlement => ({
      ...settlement,
      grids: settlement.grids?.map(row =>
        row.map(cell => ({
          ...cell,
          region: cell.gridId ? regionMap[cell.gridId.toString()] || null : null
        }))
      )
    }));

    res.status(200).json(enrichedSettlements);
  } catch (error) {
    console.error('❌ Error fetching settlements:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// SETTLEMENT ROUTES


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
    const players = await Player.find({ 'location.s': settlementId }, 'username playerId accountStatus icon');
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


///////////
/////////// GOVERNMENT-RELATED ROUTES
///////////


router.post('/update-settlement-role', async (req, res) => {
  try {
      const { settlementId, roleName, playerId } = req.body;

      console.log(`🏛️ Assigning player ${playerId} to role "${roleName}" in settlement ${settlementId}`);

      // Don't store Citizen roles - it's the default
      if (roleName === 'Citizen') {
          console.log(`✅ Skipping Citizen role assignment (default role).`);
          return res.status(200).json({ message: 'Citizen is the default role and is not stored.' });
      }

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


///////////
////// CARNIVAL ROUTES
///////////

router.post('/update-carnival-offer/:settlementId', async (req, res) => {
  const { updateOffer } = req.body;
  const { settlementId } = req.params;

  try {
    const settlement = await Settlement.findById(settlementId);
    if (!settlement) return res.status(404).json({ error: 'Settlement not found' });

    // Initialize carnival object if it doesn't exist
    if (!settlement.carnival) {
      settlement.carnival = { currentoffers: [], nextoffers: [], carnivallog: [], nextCarnivalNumber: 1 };
    }

    // ✅ Use _id to locate the specific offer to update
    const offerIndex = settlement.carnival.currentoffers.findIndex(
      (o) => o._id.toString() === updateOffer._id
    );

    if (offerIndex === -1) {
      return res.status(404).json({ error: 'Offer not found' });
    }

    // ✅ Validate claim attempts
    const currentOffer = settlement.carnival.currentoffers[offerIndex];
    
    console.log('🎪 Carnival offer update attempt:', {
      currentClaimedBy: currentOffer.claimedBy,
      newClaimedBy: updateOffer.claimedBy,
      offerItem: currentOffer.itemBought
    });
    
    if ('claimedBy' in updateOffer && updateOffer.claimedBy) {
      // Someone is trying to claim this offer
      if (currentOffer.claimedBy && currentOffer.claimedBy.toString() !== updateOffer.claimedBy) {
        // Offer was already claimed by someone else
        console.log('❌ Rejecting claim - already claimed by:', currentOffer.claimedBy);
        return res.status(409).json({ 
          error: 'Offer already claimed',
          claimedBy: currentOffer.claimedBy 
        });
      }
      // Either unclaimed or same player reclaiming - allow the update
      settlement.carnival.currentoffers[offerIndex].claimedBy = updateOffer.claimedBy;
    } else if ('claimedBy' in updateOffer && !updateOffer.claimedBy) {
      // Clearing the claim (setting claimedBy to null)
      settlement.carnival.currentoffers[offerIndex].claimedBy = null;
    }
    
    if ('filled' in updateOffer) {
      settlement.carnival.currentoffers[offerIndex].filled = updateOffer.filled;
    }

    await settlement.save();
    return res.status(200).json({ success: true });

  } catch (error) {
    console.error("❌ Error updating carnival offer:", error);
    return res.status(500).json({ error: 'Server error' });
  }
});


///////////
////// LOG ROUTES
///////////

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


router.get('/settlement/:id/banklog', async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid settlement ID.' });
  }

  try {
    const settlement = await Settlement.findById(id, 'banklog').lean();
    if (!settlement) {
      return res.status(404).json({ error: 'Settlement not found.' });
    }

    res.status(200).json({ banklog: settlement.banklog || [] });
  } catch (error) {
    console.error('❌ Error fetching bank log:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});


router.get('/settlement/:id/trainlog', async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid settlement ID.' });
  }

  try {
    const settlement = await Settlement.findById(id, 'trainlog').lean();
    if (!settlement) {
      return res.status(404).json({ error: 'Settlement not found.' });
    }

    res.status(200).json({ trainlog: settlement.trainlog || [] });
  } catch (error) {
    console.error('❌ Error fetching train log:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/settlement/:id/carnivallog', async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid settlement ID.' });
  }

  try {
    const settlement = await Settlement.findById(id, 'carnival').lean();
    if (!settlement) {
      return res.status(404).json({ error: 'Settlement not found.' });
    }

    res.status(200).json({ carnivallog: settlement.carnival?.carnivallog || [] });
  } catch (error) {
    console.error('❌ Error fetching carnival log:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/settlement/:id/electionlog', async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid settlement ID.' });
  }

  try {
    const settlement = await Settlement.findById(id, 'electionlog').lean();
    if (!settlement) {
      return res.status(404).json({ error: 'Settlement not found.' });
    }

    res.status(200).json({ electionlog: settlement.electionlog || [] });
  } catch (error) {
    console.error('❌ Error fetching election log:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});




// ✅ Optimized bundle route for SettlementView
router.post('/get-settlement-bundle', async (req, res) => {
  try {
    const { settlementId } = req.body;
    if (!settlementId || !mongoose.Types.ObjectId.isValid(settlementId)) {
      return res.status(400).json({ error: 'Invalid or missing settlement ID.' });
    }

    const settlement = await Settlement.findById(settlementId).lean();
    if (!settlement) {
      return res.status(404).json({ error: 'Settlement not found.' });
    }

    const flatGrids = settlement.grids.flat().filter(cell => cell.gridId);
    const gridIds = flatGrids.map(cell => cell.gridId);

    const grids = await Grid.find({ _id: { $in: gridIds } }, { _id: 1, ownerId: 1 }).lean();
    const ownerMap = {};
    grids.forEach(grid => {
      ownerMap[grid._id.toString()] = grid.ownerId;
    });

    const enrichedGrid = settlement.grids.map(row =>
      row.map(cell => ({
        ...cell,
        ownerId: cell.gridId ? ownerMap[cell.gridId.toString()] || null : null
      }))
    );

    const ownerIds = grids.map(grid => grid.ownerId).filter(Boolean).map(id => id.toString());
    const players = await Player.find({ _id: { $in: ownerIds } }, 'username role netWorth tradeStall').lean();

    res.status(200).json({
      settlement: {
        _id: settlement._id,
        name: settlement.name,
        displayName: settlement.displayName,
        grids: enrichedGrid
      },
      players
    });

  } catch (error) {
    console.error('❌ Error in get-settlement-bundle:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
