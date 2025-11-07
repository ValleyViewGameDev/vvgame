const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Player = require('../models/player'); // Import the Player model
const Grid = require('../models/grid');
const Settlement = require('../models/settlement');
const { relocateOnePlayerHome } = require('../utils/relocatePlayersHome');
const queue = require('../queue'); // Import the in-memory queue
const sendMailboxMessage = require('../utils/messageUtils');
const { awardTrophy } = require('../utils/trophyUtils');
 
///////// PLAYER MANAGEMENT ROUTES ////////////

// POST /api/send-player-home
router.post('/send-player-home', async (req, res) => {
  const { playerId } = req.body;
  
  if (!playerId) {
    return res.status(400).json({ error: 'Player ID is required' });
  }
  
  try {
    console.log(`🏠 Sending player ${playerId} home...`);
    
    const success = await relocateOnePlayerHome(playerId);
    
    if (success) {
      console.log(`✅ Successfully sent player ${playerId} home`);
      res.json({ success: true, message: 'Player sent home successfully' });
    } else {
      console.error(`❌ Failed to send player ${playerId} home`);
      res.status(400).json({ error: 'Failed to send player home' });
    }
  } catch (error) {
    console.error('Error sending player home:', error);
    res.status(500).json({ error: 'Server error while sending player home' });
  }
});

///////// QUEST ROUTES ////////////

// GET /api/quests
router.get('/quests', (req, res) => {
  try {
    const questsPath = path.join(__dirname, '../tuning/quests/questsEN.json');
    const questsData = JSON.parse(fs.readFileSync(questsPath, 'utf-8'));
    res.json(questsData);
  } catch (error) {
    console.error('Error reading quests.json:', error);
    res.status(500).json({ error: 'Failed to load quests.' });
  }
});

// Endpoint to add a quest to a player's active quests
router.post('/add-player-quest', async (req, res) => {
  const { playerId, questId, startTime, progress } = req.body;

  if (!playerId || !questId || !startTime) {
    return res.status(400).json({ error: 'Player ID, quest ID, and start time are required.' });
  }

  try {
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    if (!Array.isArray(player.activeQuests)) {
      player.activeQuests = [];
    }

    const isQuestActive = player.activeQuests.some((quest) => quest.questId === questId);
    if (isQuestActive) {
      return res.status(400).json({ error: 'Quest is already active.' });
    }

    // Load quest details from quests.json
    const questsPath = path.join(__dirname, '../tuning/quests/questsEN.json');
    const questsData = JSON.parse(fs.readFileSync(questsPath, 'utf-8'));
    const questDetails = questsData.find((q) => q.title === questId);

    if (!questDetails) {
      return res.status(404).json({ error: 'Quest details not found in quests.json.' });
    }

    // Default progress setup (if none provided)
    let initialProgress = progress || { goal1: 0, goal2: 0, goal3: 0 };

    // Check if all goals are met at the time of quest addition
    let totalGoals = 0;
    let completedGoals = 0;

    for (let i = 1; i <= 3; i++) {
      const goalAction = questDetails[`goal${i}action`];
      const goalItem = questDetails[`goal${i}item`];
      const goalQty = questDetails[`goal${i}qty`];

      if (!goalAction || !goalItem || !goalQty) continue; // Skip undefined goals
      totalGoals++;

      // Ensure the goal exists in progress
      if (typeof initialProgress[`goal${i}`] !== 'number') {
        initialProgress[`goal${i}`] = 0;
      }

      if (initialProgress[`goal${i}`] >= goalQty) {
        completedGoals++;
      }
    }

    const isQuestCompleted = totalGoals > 0 && completedGoals === totalGoals;

    // Add the full quest details to activeQuests
    player.activeQuests.push({
      questId,
      startTime,
      progress: initialProgress, // Use provided progress or default to 0
      completed: isQuestCompleted, // Mark as completed if all goals met
      rewardCollected: false,
      ...questDetails, // Include goal actions, items, and quantities
    });

    await player.save();

    console.log(`✅ Quest "${questId}" added to player "${playerId}" with progress:`, initialProgress);

    res.json({ success: true, player });
  } catch (error) {
    console.error('Error adding quest to player:', error);
    res.status(500).json({ error: 'Failed to add quest to player.' });
  }
});

router.post('/clear-quest-history', async (req, res) => {
  const { playerId } = req.body;

  if (!playerId) {
    return res.status(400).json({ error: 'Player ID is required.' });
  }

  try {
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    // Clear both activeQuests and completedQuests
    player.activeQuests = [];
    player.completedQuests = [];
    await player.save();

    console.log(`Quest history (active and completed) cleared for player: ${playerId}`);
    res.status(200).json({ success: true, player });
  } catch (error) {
    console.error('Error clearing quest history:', error);
    res.status(500).json({ error: 'Failed to clear quest history.' });
  }
});

router.post('/complete-quest', async (req, res) => {
  const { playerId, questId, reward } = req.body;

  if (!playerId || !questId || !reward) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  try {
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    const questIndex = player.activeQuests.findIndex((q) => q.questId === questId);

    if (questIndex === -1 || !player.activeQuests[questIndex].completed) {
      return res.status(400).json({ error: 'Quest is not marked as completed.' });
    }

    // Add the reward to inventory
    const inventory = player.inventory || [];
    const itemIndex = inventory.findIndex((item) => item.type === reward.type);
    if (itemIndex >= 0) {
      inventory[itemIndex].quantity += reward.quantity;
    } else {
      inventory.push({ type: reward.type, quantity: reward.quantity });
    }

    // Move the quest to completedQuests and remove extra details
    const completedQuest = {
      questId,
      timestamp: Date.now(),
      completed: true,
    };
    player.completedQuests = player.completedQuests || [];
    player.completedQuests.push(completedQuest);

    // Remove the quest from activeQuests
    player.activeQuests.splice(questIndex, 1);

    player.inventory = inventory;
    await player.save();

    res.json({ success: true, player });
  } catch (error) {
    console.error('Error completing quest:', error);
    res.status(500).json({ error: 'Failed to complete quest.' });
  }
});

router.post('/update-player-quests', async (req, res) => {
  const { playerId, activeQuests } = req.body;

  if (!playerId || !Array.isArray(activeQuests)) {
    return res.status(400).json({ error: 'Invalid request data.' });
  }

  try {
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    // Update the player's active quests
    player.activeQuests = activeQuests;
    await player.save();

    res.json({ success: true, player });
  } catch (error) {
    console.error('Error updating player quests:', error);
    res.status(500).json({ error: 'Failed to update player quests.' });
  }
});



///////// TROPHY ROUTES ////////////

// POST /api/earn-trophy
router.post('/earn-trophy', async (req, res) => {
  const { playerId, trophyName, progressIncrement = 1 } = req.body;
  
  if (!playerId || !trophyName) {
    return res.status(400).json({ error: 'Player ID and trophy name are required.' });
  }
  
  try {
    // Use the utility function
    const result = await awardTrophy(playerId, trophyName, progressIncrement);
    
    if (!result.success) {
      return res.status(result.error ? 400 : 200).json(result);
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Error earning trophy:', error);
    res.status(500).json({ error: 'Failed to earn trophy.' });
  }
});

// GET /api/player/:playerId/trophies
router.get('/player/:playerId/trophies', async (req, res) => {
  const { playerId } = req.params;
  
  try {
    const player = await Player.findById(playerId).select('trophies username');
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }
    
    res.json({
      success: true,
      username: player.username,
      trophies: player.trophies || []
    });
    
  } catch (error) {
    console.error('Error fetching trophies:', error);
    res.status(500).json({ error: 'Failed to fetch trophies.' });
  }
});

// POST /api/collect-trophy-reward
router.post('/collect-trophy-reward', async (req, res) => {
  const { playerId, trophyName } = req.body;
  
  if (!playerId || !trophyName) {
    return res.status(400).json({ error: 'Player ID and trophy name are required.' });
  }
  
  try {
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }
    
    // Find the trophy in player's trophies
    const trophy = player.trophies.find(t => t.name === trophyName);
    if (!trophy) {
      return res.status(404).json({ error: 'Trophy not found in player trophies.' });
    }
    
    // Check if already collected
    if (trophy.collected === true) {
      return res.status(400).json({ error: 'Trophy reward already collected.' });
    }
    
    // Load master trophies to get reward amount
    const trophiesPath = path.join(__dirname, '../tuning/trophies.json');
    const masterTrophies = JSON.parse(fs.readFileSync(trophiesPath, 'utf8'));
    const trophyDef = masterTrophies.find(t => t.name === trophyName);
    
    if (!trophyDef || !trophyDef.reward) {
      return res.status(400).json({ error: 'Trophy reward not defined.' });
    }
    
    // Mark as collected
    trophy.collected = true;
    
    // Add gems to inventory
    const gemIndex = player.inventory.findIndex(item => item.type === 'Gem');
    if (gemIndex >= 0) {
      player.inventory[gemIndex].quantity += trophyDef.reward;
    } else {
      player.inventory.push({ type: 'Gem', quantity: trophyDef.reward });
    }
    
    await player.save();
    
    console.log(`💎 Player ${player.username} collected ${trophyDef.reward} gems from ${trophyName} trophy!`);
    
    res.json({
      success: true,
      gemReward: trophyDef.reward,
      inventory: player.inventory,
      message: `Collected ${trophyDef.reward} gem${trophyDef.reward > 1 ? 's' : ''}!`
    });
    
  } catch (error) {
    console.error('Error collecting trophy reward:', error);
    res.status(500).json({ error: 'Failed to collect trophy reward.' });
  }
});


///////// CORE PLAYER ROUTES ////////////

// ✅ Get player by ID
router.get('/player/:playerId', async (req, res) => {
  const { playerId } = req.params;

  console.log(`Fetching player with ID: ${playerId}`);

  if (!mongoose.Types.ObjectId.isValid(playerId)) {
    return res.status(400).json({ error: 'Invalid player ID format.' });
  }

  try {
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    res.json(player); // Return the full player object
  } catch (error) {
    console.error('Error fetching player data:', error);
    res.status(500).json({ error: 'Failed to fetch player data.' });
  }
});

// ✅ Get player by username
router.get('/get-player-by-username/:username', async (req, res) => {
  const { username } = req.params;

  try {
    const player = await Player.findOne({ username });
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    res.json(player); // Return full player object
  } catch (error) {
    console.error('Error fetching player by username:', error);
    res.status(500).json({ error: 'Failed to fetch player.' });
  }
});

// Endpoint to update the player's profile
router.post('/update-profile', async (req, res) => {
  const { playerId, updates } = req.body;

  try {
    // ✅ Check if the username is already taken (excluding the current player)
    if (updates.username) {
      const existingPlayer = await Player.findOne({ username: updates.username });
      if (existingPlayer && existingPlayer._id.toString() !== playerId) {
        return res.status(400).json({ error: "TAKEN" });
      }
    }
    
    // ✅ Hash the password if it's being updated
    if (updates.password) {
      const hashedPassword = await bcrypt.hash(updates.password, 10);
      updates.password = hashedPassword;
      console.log(`🔐 Password hashed for player ${playerId}`);
    }
        
    // ✅ Proceed with the update if no conflicts
    const player = await Player.findByIdAndUpdate(playerId, { $set: updates }, { new: true });
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    res.json({ success: true, player });
  } catch (err) {
    console.error('Error updating profile:', err);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

router.post('/update-settings', async (req, res) => {
  const { playerId, settings } = req.body;

  try {
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ success: false, error: 'Player not found.' });
    }

    // Update player settings
    player.settings = { ...settings };
    await player.save();

    res.json({ success: true, player });
  } catch (error) {
    console.error('Error updating player settings:', error);
    res.status(500).json({ success: false, error: 'Failed to update settings.' });
  }
});

// ✅ Get all players in a given settlement
router.get('/get-players-by-settlement/:settlementId', async (req, res) => {
  try {
    const { settlementId } = req.params;
    console.log(`📡 Fetching players for settlement: ${settlementId}`);

    const players = await Player.find(
      { settlementId },
      '_id username role netWorth tradeStall' // Added tradeStall to selected fields
    );

    if (!players || players.length === 0) {
      return res.json([]);
    }

    console.log(`✅ Found ${players.length} players with data:`, 
      players.map(p => ({
        id: p._id, 
        username: p.username, 
        netWorth: p.netWorth,
        tradeStall: p.tradeStall
      }))
    );
    
    res.json(players);
  } catch (error) {
    console.error("❌ Error fetching players by settlement:", error);
    res.status(500).json({ error: 'Server error while fetching players' });
  }
});




///////////// INVENTORY BASED ROUTES ////////////

// Endpoint to get the current player inventory or backpack
router.get('/inventory/:playerId', async (req, res) => {
  const { playerId } = req.params;
  console.log(`GET /api/inventory/:playerId - Fetching inventory and backpack for playerId: ${playerId}`);
 
  // Validate the ObjectId format
  if (!mongoose.Types.ObjectId.isValid(playerId)) {
    console.error(`Invalid ObjectId format: ${playerId}`);
    return res.status(400).json({ error: 'Invalid player ID format.' });
  }

  try {
    const player = await Player.findById(playerId); // Use findById for playerId
    if (player) {
      res.json({
        inventory: player.inventory || [],
        backpack: player.backpack || [],
        warehouseCapacity: player.warehouseCapacity || 0,
        backpackCapacity: player.backpackCapacity || 0,
      });
    } else {
      res.status(404).json({ error: 'Player not found' });
    }
  } catch (error) {
    console.error('Error fetching inventory and backpack:', error);
    res.status(500).json({ error: 'Failed to fetch inventory and backpack' });
  }
});

// Endpoint to update the player inventory or backpack
router.post('/update-inventory', (req, res) => {
  const { playerId, inventory, backpack } = req.body;
  console.log(`POST /api/update-inventory - Updating inventory and/or backpack for playerId: ${playerId}`);
  console.log("👀 Incoming inventory:", inventory);
  console.log("👀 Incoming backpack:", backpack);

  // Enqueue the inventory update task using player-based key
  queue.enqueueByKey(playerId, async () => {
    try {
      const player = await Player.findById(playerId);
      if (!player) {
        console.error('Player not found.');
        res.status(404).json({ error: 'Player not found.' }); // Respond if player not found
        return;
      }
      if (inventory) player.inventory = inventory;
      if (backpack) player.backpack = backpack;

      await player.save();

      // Respond after processing
      res.json({
        success: true,
        player,
      });
    } catch (error) {
      console.error('Error updating inventory or backpack:', error);

      // Respond with an error if processing fails
      res.status(500).json({ error: 'Failed to update inventory or backpack.' });
    }
  });
});

// ✅ Delta-based inventory update (safer for concurrent actions)
router.post('/update-inventory-delta', (req, res) => {
  const { playerId, delta } = req.body;
  console.log(`POST /api/update-inventory-delta - Applying delta to playerId: ${playerId}`);
  console.log('Delta Payload:', delta);
  if (!playerId || !delta) {
    return res.status(400).json({ error: 'playerId and delta are required.' });
  }

  queue.enqueueByKey(playerId, async () => {
    try {
      const player = await Player.findById(playerId);
      if (!player) {
        return res.status(404).json({ error: 'Player not found.' });
      }
      const updates = Array.isArray(delta) ? delta : [delta];
      player.inventory = player.inventory || [];
      player.backpack = player.backpack || [];

      for (const change of updates) {
        const { type, quantity, target = 'inventory' } = change;
        if (!type || typeof quantity !== 'number') continue;

        const container = target === 'backpack' ? player.backpack : player.inventory;
        const existing = container.find(item => item.type === type);
        if (existing) {
          existing.quantity += quantity;
          if (existing.quantity <= 0) {
            const index = container.findIndex(i => i.type === type);
            container.splice(index, 1);
          }
        } else if (quantity > 0) {
          container.push({ type, quantity });
        }
      }

      await player.save();
      res.json({ success: true, player });
    } catch (error) {
      console.error('❌ Error in update-inventory-delta:', error);
      res.status(500).json({ error: 'Failed to apply inventory delta.' });
    }
  });
});


// Endpoint to update player capacities
router.post('/update-capacity', async (req, res) => {
  const { playerId, warehouseCapacity, backpackCapacity } = req.body;
  console.log(`POST /api/update-capacity - Updating capacities for playerId: ${playerId}`);

  if (!playerId) {
    return res.status(400).json({ error: 'Player ID is required.' });
  }

  try {
    const updateFields = {};
    if (warehouseCapacity !== undefined) updateFields.warehouseCapacity = warehouseCapacity;
    if (backpackCapacity !== undefined) updateFields.backpackCapacity = backpackCapacity;

    const player = await Player.findByIdAndUpdate(
      playerId,
      { $set: updateFields },
      { new: true }
    );

    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    res.json({
      success: true,
      warehouseCapacity: player.warehouseCapacity,
      backpackCapacity: player.backpackCapacity,
      player, // Return the full updated player object if needed
    });
  } catch (error) {
    console.error('Error updating capacities:', error);
    res.status(500).json({ error: 'Failed to update capacities.' });
  }
});

////////// RELATIONSHIP ROUTES ///////////

// Add a new relationship
router.post('/add-relationship', async (req, res) => {
  const { playerId, targetName, initialScore = 0 } = req.body;

  if (!playerId || !targetName) {
    return res.status(400).json({ error: 'Player ID and target name are required.' });
  }

  try {
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    // Check if relationship already exists
    const existingRelationship = player.relationships.find(rel => rel.name === targetName);
    if (existingRelationship) {
      return res.status(400).json({ error: 'Relationship already exists.' });
    }

    // Add new relationship with just name and score
    player.relationships.push({
      name: targetName,
      relscore: initialScore
    });

    await player.save();

    res.json({
      success: true,
      relationships: player.relationships,
      player
    });
  } catch (error) {
    console.error('Error adding relationship:', error);
    res.status(500).json({ error: 'Failed to add relationship.' });
  }
});

// Update an existing relationship score
router.post('/update-relationship', async (req, res) => {
  const { playerId, targetName, delta } = req.body;

  if (!playerId || !targetName || delta === undefined) {
    return res.status(400).json({ error: 'Player ID, target name, and delta are required.' });
  }

  try {
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    // Find the relationship
    const relationship = player.relationships.find(rel => rel.name === targetName);
    if (!relationship) {
      return res.status(404).json({ error: 'Relationship not found.' });
    }

    // Update relationship score (clamped between -100 and 100)
    relationship.relscore = Math.max(-100, Math.min(100, relationship.relscore + delta));

    await player.save();

    res.json({
      success: true,
      relationship,
      relationships: player.relationships,
      player
    });
  } catch (error) {
    console.error('Error updating relationship:', error);
    res.status(500).json({ error: 'Failed to update relationship.' });
  }
});

// Add or update relationship status (friend, crush, love, married, rival, etc.)
router.post('/add-or-update-relationship-status', async (req, res) => {
  const { playerId, name, status, value } = req.body;

  if (!playerId || !name || !status || value === undefined) {
    return res.status(400).json({ error: 'Player ID, name, status, and value are required.' });
  }

  try {
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    // Find the relationship
    const relationship = player.relationships.find(rel => rel.name === name);
    if (!relationship) {
      return res.status(404).json({ error: 'Relationship not found.' });
    }

    // Dynamically set the status field
    relationship[status] = value;

    // Mark the path as modified since we're dynamically setting fields
    player.markModified(`relationships`);
    
    await player.save();

    res.json({
      success: true,
      relationship,
      relationships: player.relationships,
      player
    });
  } catch (error) {
    console.error('Error updating relationship status:', error);
    res.status(500).json({ error: 'Failed to update relationship status.' });
  }
});


////////// LOCATION BASED ROUTES ///////////

// Endpoint to get the current player position
router.get('/player-position/:username', async (req, res) => {
  const { username } = req.params;

  try {
    const player = await Player.findOne({ username });
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
    res.json({ location: player.location });
  } catch (error) {
    console.error('Error fetching player position:', error);
    res.status(500).json({ error: 'Failed to fetch player position' });
  }
});

// Endpoint to update the player's position
router.post('/update-player-position', async (req, res) => {
  const { playerId, location } = req.body;

  if (!location) {
    return res.status(400).json({ error: 'Location data is required.' });
  }

  const { x, y, g, s, f, gtype } = location;
  console.log('Payload:', { x, y, g, s, f, gtype });

  if (!playerId || typeof x !== 'number' || typeof y !== 'number' || !g) {
    return res.status(400).json({ error: 'Invalid player coordinates or location data.' });
  }

  try {
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    player.location = location;
    await player.save();

    console.log('Player position successfully updated:', player.location);
    res.json({ success: true, player });
  } catch (error) {
    console.error('Error updating player position:', error);
    res.status(500).json({ error: 'Failed to update player position.' });
  }
});

// Endpoint to update the player's location in SettlementView
router.post('/update-player-location', async (req, res) => {
  const { playerId, location } = req.body;

  console.log(`POST /api/update-player-location - Updating location for playerId: ${playerId}`);
  console.log('Payload:', location);

  if (
    !playerId ||
    !location ||
    typeof location.x !== 'number' ||
    typeof location.y !== 'number' ||
    !location.g ||
    !location.s ||
    !location.f ||
    !location.gtype
  ) {
    return res.status(400).json({ error: 'Invalid location data. Ensure playerId and all location fields are provided.' });
  }

  try {
    const updatedPlayer = await Player.findByIdAndUpdate(
      playerId,
      { $set: { location } },
      { new: true }
    );

    if (!updatedPlayer) {
      return res.status(404).json({ error: 'Player not found' });
    }

    console.log('Player location successfully updated:', updatedPlayer.location);
    res.json({ success: true, player: updatedPlayer });
  } catch (error) {
    console.error('Error updating player location:', error);
    res.status(500).json({ error: 'Failed to update player location.' });
  }
});



////////////// SKILLS BASED ROUTES ///////////

// Endpoint to get the current player skills
router.get('/skills/:playerId', async (req, res) => {
  const { playerId } = req.params;
  console.log(`GET /api/skills/:playerId - Fetching skills for playerId: ${playerId}`);
 
  // Validate the ObjectId format
  if (!mongoose.Types.ObjectId.isValid(playerId)) {
    console.error(`Invalid ObjectId format: ${playerId}`);
    return res.status(400).json({ error: 'Invalid player ID format.' });
  }

  try {
    const player = await Player.findById(playerId); // Use findById for playerId
    if (player) {
      res.json({
        skills: player.skills || [],
      });
    } else {
      res.status(404).json({ error: 'Player not found' });
    }
  } catch (error) {
    console.error('Error fetching skills:', error);
    res.status(500).json({ error: 'Failed to fetch skills' });
  }
});

router.get('/skills-tuning', (req, res) => {
  try {
    const filePath = path.join(__dirname, '../tuning/skillsTuning.json'); // Adjusted path
    const skillsTuning = JSON.parse(fs.readFileSync(filePath, 'utf8')); // Dynamically read the file
    res.json(skillsTuning);
  } catch (error) {
    console.error('Error loading skillsTuning.json:', error);
    res.status(500).json({ error: 'Failed to load skills tuning.' });
  }
});

router.get('/interactions', (req, res) => {
  try {
    const filePath = path.join(__dirname, '../tuning/interactions.json');
    const interactions = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json(interactions);
  } catch (error) {
    console.error('Error loading interactions.json:', error);
    res.status(500).json({ error: 'Failed to load interactions.' });
  }
});

// Endpoint to update player skills
router.post('/update-skills', async (req, res) => {
  const { playerId, skills } = req.body;
  console.log(`POST /api/update-skills - Updating skills for playerId: ${playerId}`);

  if (!playerId || !Array.isArray(skills)) {
    return res.status(400).json({ error: 'Player ID and a valid skills array are required.' });
  }

  try {
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    player.skills = skills; // Replace the skills array
    await player.save();

    res.json({
      success: true,
      player,
    });

    console.log('Skills updated successfully:', player.skills);
  } catch (error) {
    console.error('Error updating skills:', error);
    res.status(500).json({ error: 'Failed to update skills.' });
  }
});

router.post('/update-powers', async (req, res) => {
  const { playerId, powers } = req.body;
  if (!playerId || !Array.isArray(powers)) {
    return res.status(400).json({ error: 'Missing or invalid playerId or powers array.' });
  }
  try {
    const updatedPlayer = await Player.findByIdAndUpdate(
      playerId,
      { powers },
      { new: true }
    );
    if (!updatedPlayer) {
      return res.status(404).json({ error: 'Player not found.' });
    }
    res.json({ message: 'Powers updated successfully.', powers: updatedPlayer.powers });
  } catch (err) {
    console.error('Error updating powers:', err);
    res.status(500).json({ error: 'Failed to update powers.' });
  }
});


////////////////////////////////////////////////////////
////////////// DELETE PLAYER ///////////////////////////

router.post('/delete-player', async (req, res) => {
  const { playerId } = req.body;
  if (!playerId) {
    return res.status(400).json({ error: 'Player ID is required.' });
  }

  try {
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    const { gridId, settlementId } = player;
    const currentLocationGridId = player.location?.g;

    // 1. Remove player from their current location's grid state (if different from homestead)
    if (currentLocationGridId && currentLocationGridId !== gridId) {
      console.log(`🧹 Removing player from current location grid: ${currentLocationGridId}`);
      try {
        // Use the existing remove-single-pc endpoint logic
        const currentGrid = await Grid.findById(currentLocationGridId);
        if (currentGrid) {
          const pcs = new Map(currentGrid.playersInGrid || []);
          pcs.delete(playerId.toString());
          currentGrid.playersInGrid = pcs;
          currentGrid.playersInGridLastUpdated = new Date();
          await currentGrid.save();
          console.log(`✅ Removed player ${playerId} from grid ${currentLocationGridId} playersInGrid data`);
        }
      } catch (error) {
        console.error(`❌ Error removing player from current location grid: ${error}`);
      }
    }

    // 2. Send other players in this grid home
    if (gridId) {
      const grid = await Grid.findById(gridId);
      if (grid && grid.playersInGrid) {
        const playersInGrid = grid.playersInGrid instanceof Map
          ? Array.from(grid.playersInGrid.keys())
          : Object.keys(grid.playersInGrid);
        for (const id of playersInGrid) {
          if (id !== playerId.toString()) {
            await relocateOnePlayerHome(id);
          }
        }
      }
    }

    // 3. Update Settlement grid reference and availability (search ALL settlements for the grid)
    if (gridId) {
      let fromSettlement = null;
      const settlements = await Settlement.find({});
      for (const settlement of settlements) {
        for (const row of settlement.grids) {
          for (const cell of row) {
            if (cell.gridId && String(cell.gridId) === String(gridId)) {
              cell.gridId = null;
              cell.available = true;
              fromSettlement = settlement;
            }
          }
        }
      }

      if (fromSettlement) {
        fromSettlement.markModified('grids');
        fromSettlement.population = Math.max((fromSettlement.population || 1) - 1, 0);
        await fromSettlement.save();
      }
    }

    // 4. Delete the Grid document
    if (gridId) {
      await Grid.findByIdAndDelete(gridId);
      console.log(`🗑️ Deleted homestead grid: ${gridId}`);
    }

    // 5. Delete the player
    await Player.deleteOne({ _id: playerId });

    console.log(`✅ Player ${playerId} and associated grid ${gridId} deleted.`);
    res.json({ success: true });

  } catch (error) {
    console.error('❌ Error deleting player:', error);
    res.status(500).json({ error: 'Failed to delete player.' });
  }
});


////////////////////////////////////////////////////////
////////////// RESET PASSWORD //////////////////////////

router.post('/reset-password', async (req, res) => {
  const { playerId } = req.body;
  if (!playerId) {
    return res.status(400).json({ error: 'Player ID is required.' });
  }

  try {
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    // Hash the temporary password "temp"
    const tempPassword = 'temp';
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // Update the player's password
    player.password = hashedPassword;
    await player.save();

    console.log(`✅ Password reset to 'temp' for player: ${player.username} (ID: ${playerId})`);
    res.json({ 
      success: true, 
      message: `Password reset to 'temp' for ${player.username}` 
    });

  } catch (error) {
    console.error('❌ Error resetting password:', error);
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});


////////////////////////////////////////////////////////
////////////// MESSAGE & STORE BASED ROUTES ///////////

// ✅ POST /api/send-mailbox-message
router.post('/send-mailbox-message', async (req, res) => {
  const { playerId, messageId, customRewards = [] } = req.body;

  if (!playerId || !messageId) { return res.status(400).json({ error: 'Missing playerId or messageId.' }); }

  // ✅ Sanitize rewards here (removes MongoDB subdocument _ids)
  const sanitizedRewards = customRewards.map(({ item, qty }) => ({
    item,
    qty
  }));

  try {
    const io = req.app.get('socketio'); // assuming io was attached in server.js
    await sendMailboxMessage(playerId, messageId, sanitizedRewards, io);

    return res.status(200).json({ success: true, message: 'Message delivered to mailbox.' });
  } catch (error) {
    console.error('❌ Error in send-mailbox-message route:', error);
    return res.status(500).json({ error: 'Server error while sending message.' });
  }
});

// ✅ POST /api/send-mailbox-message-all
router.post('/send-mailbox-message-all', async (req, res) => {
  const { messageId, customRewards = [] } = req.body;
  if (!messageId) { return res.status(400).json({ error: 'Missing messageId.' }); }
  // ✅ Sanitize rewards here (removes MongoDB subdocument _ids)
  const sanitizedRewards = customRewards.map(({ item, qty }) => ({
    item,
    qty
  }));
  try {
    const players = await Player.find({}, '_id');
    const io = req.app.get('socketio'); // assuming io was attached in server.js

console.log("📦 io from req.app.get('socketio'):", io?.constructor?.name, io?.path);
console.log("✅ req.app.get('socketio') returned. Known rooms:", Object.keys(io.sockets.adapter.rooms));
console.log("🔍 Connected sockets (count):", io.engine.clientsCount);

    for (const player of players) {
      await sendMailboxMessage(player._id.toString(), messageId, sanitizedRewards, io);
    }
    console.log(`📬 Message ${messageId} sent to ${players.length} players.`);
    return res.status(200).json({ success: true, message: `Message sent to ${players.length} players.` });
  } catch (error) {
    console.error('❌ Error in send-mailbox-message-all route:', error);
    return res.status(500).json({ error: 'Server error while sending message to all players.' });
  }
});


router.get('/messages', (req, res) => {
  const filePath = path.join(__dirname, '../tuning/messages.json');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error("Failed to read messages.json", err);
      return res.status(500).json({ error: 'Failed to load messages' });
    }
    res.json(JSON.parse(data));
  });
});

router.post('/update-player-messages', async (req, res) => {
  const { playerId, messages } = req.body;

  try {
    const updatedPlayer = await Player.findByIdAndUpdate(
      playerId,
      { messages },
      { new: true }
    );
    res.json({ success: true, player: updatedPlayer });
  } catch (error) {
    console.error("Error updating player messages:", error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Protected mailbox collection endpoint
router.post('/mailbox/collect-rewards', async (req, res) => {
  const { playerId, messageIndex, transactionId, transactionKey } = req.body;
  
  if (!playerId || messageIndex === undefined || !transactionId || !transactionKey) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Import TransactionManager from tradingRoutes (we'll need to extract it to a shared utility)
    const player = await Player.findOne({ playerId });
    if (!player) throw new Error('Player not found');

    // Check if transaction already processed (idempotency)
    const lastTxId = player.lastTransactionIds.get(transactionKey);
    if (lastTxId === transactionId) {
      return res.json({ success: true, message: 'Rewards already collected' });
    }

    // Check if there's an active transaction for this action
    if (player.activeTransactions.has(transactionKey)) {
      const activeTransaction = player.activeTransactions.get(transactionKey);
      const timeSinceStart = Date.now() - activeTransaction.timestamp.getTime();
      
      if (timeSinceStart > 30000) {
        player.activeTransactions.delete(transactionKey);
        await player.save();
      } else {
        throw new Error('Transaction in progress');
      }
    }

    // Mark transaction as active
    player.activeTransactions.set(transactionKey, {
      type: transactionKey,
      timestamp: new Date(),
      transactionId
    });
    await player.save();

    // Validate message exists
    if (!player.messages || !player.messages[messageIndex]) {
      player.activeTransactions.delete(transactionKey);
      await player.save();
      return res.status(400).json({ error: 'Message not found' });
    }

    const message = player.messages[messageIndex];

    // Load message templates to get reward info
    const fs = require('fs');
    const path = require('path');
    const templatesPath = path.join(__dirname, '../tuning/messages.json');
    const templates = JSON.parse(fs.readFileSync(templatesPath, 'utf-8'));
    const template = templates.find(t => t.id === message.messageId);

    if (!template) {
      player.activeTransactions.delete(transactionKey);
      await player.save();
      return res.status(400).json({ error: 'Message template not found' });
    }

    const rewards = message.rewards?.length > 0 ? message.rewards : template.rewards;

    if (!rewards || rewards.length === 0) {
      player.activeTransactions.delete(transactionKey);
      await player.save();
      return res.status(400).json({ error: 'No rewards to collect' });
    }

    // Process rewards server-side
    let collectedItems = [];

    for (const reward of rewards) {
      const { item, qty } = reward;

      // Handle different reward types
      if (item === 'Relocation') {
        const currentRelocations = player.relocations || 0;
        player.relocations = currentRelocations + qty;
        collectedItems.push(`${qty} ${item}`);
      } else if (item === 'Money' || item === 'Tent' || !['skill', 'power', 'upgrade'].includes(item)) {
        // Handle inventory items (Money, Tent, and other regular items)
        const targetContainer = item === 'Tent' ? 'backpack' : 'inventory';
        const container = player[targetContainer] || [];
        
        const existingItem = container.find(i => i.type === item);
        if (existingItem) {
          existingItem.quantity += qty;
        } else {
          container.push({ type: item, quantity: qty });
        }
        
        player[targetContainer] = container;
        collectedItems.push(`${qty} ${item}`);
      } else {
        // Handle skills and powers
        const isSkill = ['skill', 'upgrade'].includes(item);
        const targetArray = isSkill ? 'skills' : 'powers';
        const currentArray = player[targetArray] || [];
        
        const alreadyHas = currentArray.some(s => s.type === item);
        if (!alreadyHas) {
          currentArray.push({ type: item, quantity: qty });
          player[targetArray] = currentArray;
          collectedItems.push(`${qty} ${item}`);
        }
      }
    }

    // Remove the message
    player.messages.splice(messageIndex, 1);

    // Save all changes
    await player.save();

    // Complete transaction
    player.lastTransactionIds.set(transactionKey, transactionId);
    player.activeTransactions.delete(transactionKey);
    await player.save();

    res.json({ 
      success: true, 
      collectedItems,
      messages: player.messages,
      inventory: player.inventory,
      backpack: player.backpack,
      skills: player.skills,
      powers: player.powers,
      relocations: player.relocations
    });

  } catch (error) {
    // Cleanup on error
    try {
      const player = await Player.findOne({ playerId });
      if (player) {
        player.activeTransactions.delete(transactionKey);
        await player.save();
      }
    } catch (cleanupError) {
      console.error('Error cleaning up failed mailbox transaction:', cleanupError);
    }

    if (error.message === 'Transaction in progress') {
      return res.status(429).json({ error: 'Collection already in progress' });
    }
    console.error('Error collecting mailbox rewards:', error);
    res.status(500).json({ error: 'Failed to collect rewards' });
  }
});





// ✅ Check if player is a developer
router.get('/check-developer-status/:username', async (req, res) => {
  const { username } = req.params;
  const pathToDevFile = path.join(__dirname, '../tuning/developerUsernames.json');

  try {
    const data = fs.readFileSync(pathToDevFile, 'utf-8');
    const developerUsernames = JSON.parse(data);

    const isDeveloper = developerUsernames.includes(username);
    res.json({ isDeveloper });
  } catch (error) {
    console.error('Error checking developer status:', error);
    res.status(500).json({ error: 'Failed to check developer status' });
  }
});

// POST /api/update-last-active - Update player's lastActive timestamp
router.post('/update-last-active', async (req, res) => {
  const { playerId } = req.body;
  
  if (!playerId) {
    return res.status(400).json({ error: 'Player ID is required.' });
  }
  
  try {
    await Player.findByIdAndUpdate(playerId, { 
      lastActive: new Date() 
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating lastActive:', error);
    res.status(500).json({ error: 'Failed to update lastActive.' });
  }
});

// GET /api/players - Get all players for editor
router.get('/players', async (req, res) => {
  try {
    const players = await Player.find({})
      .select('username settlementId accountStatus role created location icon language netWorth activeQuests completedQuests skills powers lastActive inventory ftuestep firsttimeuser aspiration warehouseCapacity backpackCapacity')
      .sort({ lastActive: -1 }); // Sort by most recently active first
    
    console.log(`📋 Editor: Found ${players.length} players`);
    res.json(players);
  } catch (error) {
    console.error('Error fetching all players:', error);
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

// GET /api/feedback-data - Get FTUE feedback data for editor
router.get('/feedback-data', async (req, res) => {
  try {
    const { createdStartDate, createdEndDate } = req.query;
    
    // Build the query object
    let query = { ftueFeedback: { $exists: true } };
    
    // Add date range filtering if provided
    if (createdStartDate || createdEndDate) {
      query.created = {};
      
      if (createdStartDate) {
        query.created.$gte = new Date(createdStartDate);
      }
      
      if (createdEndDate) {
        // Add 23:59:59 to end date to include the entire end date
        const endDate = new Date(createdEndDate);
        endDate.setHours(23, 59, 59, 999);
        query.created.$lte = endDate;
      }
      
      console.log(`📅 Filtering feedback data by created date: ${createdStartDate} to ${createdEndDate}`);
    }
    
    const players = await Player.find(query)
      .select('username lastActive aspiration ftuestep ftueFeedback language created')
      .sort({ lastActive: -1 }) // Sort by most recently active first
      .lean(); // Use lean() for better performance when we only need data
    
    console.log(`📋 Editor: Found ${players.length} players with feedback data`);
    res.json(players);
  } catch (error) {
    console.error('Error fetching feedback data:', error);
    res.status(500).json({ error: 'Failed to fetch feedback data' });
  }
});

// GET /api/players-by-frontier-with-dev-status/:frontierId - Get all players in a frontier with developer status
router.get('/players-by-frontier-with-dev-status/:frontierId', async (req, res) => {
  try {
    const { frontierId } = req.params;
    const { addDeveloperFlags } = require('../utils/developerHelpers');
    
    const players = await Player.find({ frontierId })
      .select('username settlementId netWorth') // Only select fields we need
      .lean();
    
    // Add isDeveloper flag to each player
    const playersWithDeveloperFlag = addDeveloperFlags(players);
    
    console.log(`📋 Found ${players.length} players in frontier ${frontierId}, ${playersWithDeveloperFlag.filter(p => p.isDeveloper).length} are developers`);
    
    res.json(playersWithDeveloperFlag);
  } catch (error) {
    console.error('❌ Error fetching players with developer status:', error);
    res.status(500).json({ error: 'Failed to fetch players with developer status' });
  }
});

// POST /api/migrate-warehouse-levels - Migrate warehouse levels for all players
router.post('/migrate-warehouse-levels', async (req, res) => {
  try {
    console.log('🏗️ Starting warehouse level migration for all players...');
    
    // Find all players who don't have warehouseLevel set
    const playersToMigrate = await Player.find({ 
      warehouseLevel: { $exists: false }
    });
    
    console.log(`Found ${playersToMigrate.length} players needing warehouse level migration`);
    
    let migratedCount = 0;
    let errorCount = 0;
    
    // Process each player
    for (const player of playersToMigrate) {
      try {
        // All existing players without warehouseLevel start at level 0
        // Their current capacity is preserved as-is
        const level = 0;
        
        // Update the player with their warehouse level
        await Player.updateOne(
          { _id: player._id },
          { $set: { warehouseLevel: level } }
        );
        
        migratedCount++;
        console.log(`✅ Migrated ${player.username}: set to level ${level}`);
      } catch (error) {
        errorCount++;
        console.error(`❌ Error migrating player ${player.username}:`, error);
      }
    }
    
    res.json({
      success: true,
      message: `Migration complete. Migrated: ${migratedCount}, Errors: ${errorCount}`,
      migratedCount,
      errorCount
    });
    
  } catch (error) {
    console.error('❌ Error during warehouse level migration:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to migrate warehouse levels' 
    });
  }
});

// POST /api/migrate-grid-resources - Migrate grid resources from legacy to encoded format
router.post('/migrate-grid-resources', async (req, res) => {
  try {
    const { gridIds } = req.body; // Optional array of specific grid IDs to migrate
    
    console.log('📦 Starting grid resource migration...');
    if (gridIds) {
      console.log(`🎯 Targeting specific grids: ${gridIds.join(', ')}`);
    }
    
    const Grid = require('../models/grid');
    const fs = require('fs');
    const path = require('path');
    const UltraCompactResourceEncoder = require('../utils/ResourceEncoder');
    
    // Load master resources for encoding
    const resourcesPath = path.join(__dirname, '../tuning/resources.json');
    const masterResources = JSON.parse(fs.readFileSync(resourcesPath, 'utf-8'));
    const encoder = new UltraCompactResourceEncoder(masterResources);
    
    // Build query - either specific grids or all legacy grids
    let query = {
      "resources.0": {
        "$exists": true,
        "$type": "object"
      },
      "resources.0.type": {
        "$exists": true
      }
    };
    
    // If specific grid IDs provided, add that filter
    if (gridIds && Array.isArray(gridIds) && gridIds.length > 0) {
      query._id = { $in: gridIds };
    }
    
    // Find grids with legacy resource format
    const gridsToMigrate = await Grid.find(query);
    
    console.log(`Found ${gridsToMigrate.length} grids needing resource migration`);
    
    let migratedCount = 0;
    let errorCount = 0;
    
    for (const grid of gridsToMigrate) {
      try {
        const legacyResources = grid.resources;
        console.log(`🔄 Migrating grid ${grid._id} with ${legacyResources.length} legacy resources`);
        
        // Encode the legacy resources
        const encodedResources = encoder.encodeResources(legacyResources);
        
        // Update the grid
        await Grid.updateOne(
          { _id: grid._id },
          { $set: { resources: encodedResources } }
        );
        
        migratedCount++;
        console.log(`✅ Migrated grid ${grid._id}: ${legacyResources.length} resources encoded`);
        
      } catch (error) {
        errorCount++;
        console.error(`❌ Error migrating grid ${grid._id}:`, error);
      }
    }
    
    res.json({
      success: true,
      message: `Migration complete. Migrated: ${migratedCount}, Errors: ${errorCount}`,
      migratedCount,
      errorCount
    });
    
  } catch (error) {
    console.error('❌ Error during grid resource migration:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to migrate grid resources' 
    });
  }
});

module.exports = router;
