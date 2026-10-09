const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Player = require('../models/player'); // Import the Player model
const { applyDelta: applyNpcDelta } = require('../utils/npcRelationships');
const { NO_PASSWORD, publicPlayer } = require('../utils/publicPlayer');
const { validateUsername } = require('../utils/usernames');
const { isDeveloperPlayerId } = require('../utils/serviceMode');
const { derivedStats } = require('../utils/combatStats');

// Account routes the editor uses (and the profile's own delete): the caller must be a developer
// (x-player-id of a developer account, as the maintenance gate checks) or, for delete, the player themself.
async function requireDeveloperOrSelf(req, res, targetId, { allowSelf }) {
  const callerId = req.get('x-player-id') || null;
  if (allowSelf && callerId && String(callerId) === String(targetId)) return true;
  if (await isDeveloperPlayerId(callerId)) return true;
  res.status(403).json({ error: 'Not allowed.' });
  return false;
}
const Grid = require('../models/grid');
const Settlement = require('../models/settlement');
const { relocateOnePlayerHome } = require('../utils/relocatePlayersHome');
const queue = require('../queue'); // Import the in-memory queue
const sendMailboxMessage = require('../utils/messageUtils');
const { awardTrophy } = require('../utils/trophyUtils');
const { recordActivity, recordQuestCompleted } = require('../utils/analytics');
const { isCurrency } = require('../utils/inventoryUtils');
const { isGridVisited, markGridVisited } = require('../utils/gridsVisitedUtils');
 
///////// PLAYER MANAGEMENT ROUTES ////////////

// POST /api/send-player-home
router.post('/send-player-home', async (req, res) => {
  const { playerId, fromGridId } = req.body;

  if (!playerId) {
    return res.status(400).json({ error: 'Player ID is required' });
  }

  try {
    // Get the player's username and current grid before relocating
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const currentGridId = fromGridId || (player.location?.g?.toString());
    const username = player.username;

    console.log(`🏠 Sending player ${username} (${playerId}) home from grid ${currentGridId}...`);

    const success = await relocateOnePlayerHome(playerId);

    if (success) {
      console.log(`✅ Successfully sent player ${username} home`);

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

    res.json({ success: true, player: publicPlayer(player) });
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

    res.json({ success: true, player: publicPlayer(player) });
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

    res.json(publicPlayer(player)); // the full player object minus the password hash
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

    res.json(publicPlayer(player)); // full player object minus the password hash
  } catch (error) {
    console.error('Error fetching player by username:', error);
    res.status(500).json({ error: 'Failed to fetch player.' });
  }
});

// Endpoint to update the player's profile
// Identity and billing fields never travel through this generic route: the password has its own
// route (/player/change-password), the subscription tier is set by the Stripe webhook, the role by the
// election scheduler. Developers (x-player-id) may still set accountStatus/role from the Profile panel.
// The full allowlist is refactor-plan Phase 5; this is the denylist that phase A needs.
const PROFILE_NEVER = ['password', 'signup_ip_hash', '_id', 'playerId', 'created', 'createdAt', 'email', 'email_source', 'marketing_consent', 'unsubscribe_token'];
// Combat stats are DERIVED on the server (utils/combatStats.js) from base stats + powers; the
// base stats, hp and maxhp are never set from the client (hp goes through /player/state).
const PROFILE_DEVELOPER_ONLY = ['accountStatus', 'role', 'baseMaxhp', 'baseDamage', 'baseAttackbonus', 'baseArmorclass', 'baseSpeed', 'baseAttackrange', 'hp', 'maxhp'];

router.post('/update-profile', async (req, res) => {
  const { playerId } = req.body;
  const updates = { ...(req.body.updates || {}) };

  try {
    for (const key of Object.keys(updates)) {
      if (PROFILE_NEVER.includes(key.split('.')[0])) delete updates[key];
    }
    if (PROFILE_DEVELOPER_ONLY.some((k) => k in updates) && !(await isDeveloperPlayerId(req.get('x-player-id')))) {
      for (const k of PROFILE_DEVELOPER_ONLY) delete updates[k];
    }

    // ✅ Username: same rules as registration, and not already taken by someone else
    if (updates.username !== undefined) {
      updates.username = String(updates.username).trim();
      const problem = validateUsername(updates.username);
      if (problem) return res.status(400).json({ error: problem, code: problem });
      const existingPlayer = await Player.findOne({ username: updates.username });
      if (existingPlayer && existingPlayer._id.toString() !== playerId) {
        return res.status(400).json({ error: "TAKEN", code: 'TAKEN' });
      }
    }

    // ✅ Proceed with the update if no conflicts
    const player = await Player.findByIdAndUpdate(playerId, { $set: updates }, { new: true });
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    // Analytics: the quest turn-in path (NPCsPanel) writes completedQuests through
    // this generic route, so a body carrying completedQuests is the "turned in a
    // quest today" signal. Idempotent per day; fire-and-forget.
    if (Array.isArray(updates.completedQuests) && updates.completedQuests.length) {
      recordQuestCompleted(playerId).catch(() => {});
    }

    res.json({ success: true, player: publicPlayer(player) });
  } catch (err) {
    console.error('Error updating profile:', err);
    res.status(500).json({ error: 'Failed to update profile.' });
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

// ✅ Delta-based inventory update using atomic MongoDB operations
router.post('/update-inventory-delta', async (req, res) => {
  const { playerId, delta } = req.body;
  console.log(`POST /api/update-inventory-delta - Applying delta to playerId: ${playerId}`);
  console.log('Delta Payload:', delta);

  if (!playerId || !delta) {
    return res.status(400).json({ error: 'playerId and delta are required.' });
  }

  try {
    const updates = Array.isArray(delta) ? delta : [delta];

    // Build atomic operations for each change
    const bulkOps = [];

    for (const change of updates) {
      const { type, quantity, target = 'inventory' } = change;
      if (!type || typeof quantity !== 'number') continue;

      const field = target === 'backpack' ? 'backpack' : 'inventory';

      if (quantity > 0) {
        // For additions: try to increment existing item
        bulkOps.push({
          updateOne: {
            filter: { _id: playerId, [`${field}.type`]: type },
            update: { $inc: { [`${field}.$.quantity`]: quantity } }
          }
        });
        // If item doesn't exist, add it
        bulkOps.push({
          updateOne: {
            filter: { _id: playerId, [`${field}.type`]: { $ne: type } },
            update: { $push: { [field]: { type, quantity } } }
          }
        });
      } else if (quantity < 0) {
        // For subtractions: only decrement if item exists (never create with negative)
        bulkOps.push({
          updateOne: {
            filter: { _id: playerId, [`${field}.type`]: type },
            update: { $inc: { [`${field}.$.quantity`]: quantity } }
          }
        });
      }
    }

    // Execute all increment/add operations atomically
    if (bulkOps.length > 0) {
      await Player.bulkWrite(bulkOps);
    }

    // Clean up items with quantity <= 0
    await Player.updateOne(
      { _id: playerId },
      {
        $pull: {
          inventory: { quantity: { $lte: 0 } },
          backpack: { quantity: { $lte: 0 } }
        }
      }
    );

    // Fetch the updated player to return
    const player = await Player.findById(playerId);

    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    res.json({ success: true, player: publicPlayer(player) });
  } catch (error) {
    console.error('❌ Error in update-inventory-delta:', error);
    res.status(500).json({ error: 'Failed to apply inventory delta.' });
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


// A conversation between two citizens moved their relationship (docs/citizens.md §2.2).
// POST /api/npc-relationship { playerId, a, b, delta, seed?: { relscore, love } }
// → { success, relationship, npcRelationships }
router.post('/npc-relationship', async (req, res) => {
  const { playerId, a, b, delta, seed } = req.body || {};
  if (!playerId || !a || !b || a === b || !Number.isFinite(Number(delta))) {
    return res.status(400).json({ error: 'playerId, two different NPC types and a numeric delta are required.' });
  }
  if (Math.abs(Number(delta)) > 50) return res.status(400).json({ error: 'delta out of range' });
  try {
    const player = await Player.findById(playerId);
    if (!player) return res.status(404).json({ error: 'Player not found.' });
    const relationship = applyNpcDelta(player, a, b, Number(delta), seed || {});
    await player.save();
    res.json({ success: true, relationship, npcRelationships: player.npcRelationships });
  } catch (error) {
    console.error('Error updating npc relationship:', error);
    res.status(500).json({ error: 'Failed to update npc relationship.' });
  }
});


////////// LOCATION BASED ROUTES ///////////



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
    // Fetch the gridCoord for the target grid to ensure FrontierMiniMap updates correctly
    let gridCoord = location.gridCoord; // Use existing if provided
    
    // If gridCoord is not provided, look it up
    if (!gridCoord) {
      console.log('🔍 GridCoord not provided, looking up for gridId:', location.g);
      
      const searchGridId = new mongoose.Types.ObjectId(location.g);
      const settlements = await Settlement.find({}).lean();
      
      // Search for the gridCoord in settlements
      for (const settlement of settlements) {
        if (settlement.grids && Array.isArray(settlement.grids)) {
          for (const row of settlement.grids) {
            if (Array.isArray(row)) {
              for (const cell of row) {
                if (cell && cell.gridId && (cell.gridId.toString() === location.g || cell.gridId.equals(searchGridId))) {
                  gridCoord = cell.gridCoord;
                  console.log('✅ Found gridCoord:', gridCoord);
                  break;
                }
              }
            }
            if (gridCoord) break;
          }
        }
        if (gridCoord) break;
      }
      
      if (!gridCoord) {
        console.warn('⚠️ Could not find gridCoord for gridId:', location.g);
        // Don't fail the request, just log the warning
        // Some legacy grids might not have gridCoord set
      }
    }

    // Fetch the target grid to get its region
    let region = null;
    try {
      const targetGrid = await Grid.findById(location.g).select('region').lean();
      if (targetGrid) {
        region = targetGrid.region || null;
        console.log(`🗺️ Target grid region: ${region || 'none'}`);
      }
    } catch (gridError) {
      console.warn('⚠️ Could not fetch grid region:', gridError.message);
    }

    // Include gridCoord and region in the location update
    const locationWithExtras = {
      ...location,
      ...(gridCoord && { gridCoord }), // Only include gridCoord if we found it
      region // Include region (can be null)
    };

    const updatedPlayer = await Player.findByIdAndUpdate(
      playerId,
      { $set: { location: locationWithExtras } },
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

// GET /api/xp-levels
router.get('/xp-levels', (req, res) => {
  try {
    const filePath = path.join(__dirname, '../tuning/xpLevels.json');
    const xpLevels = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Optimize: Return just array of XP thresholds instead of objects with "lvl" and "xp" keys
    // This reduces memory usage significantly (no repeated strings)
    const optimizedXPThresholds = xpLevels.map(level => level.xp);
    
    res.json(optimizedXPThresholds);
  } catch (error) {
    console.error('Error loading xpLevels.json:', error);
    res.status(500).json({ error: 'Failed to load XP levels.' });
  }
});

// POST /api/addXP - Efficiently add XP to player
router.post('/addXP', async (req, res) => {
  const { playerId, xpAmount } = req.body;
  
  if (!playerId || typeof xpAmount !== 'number') {
    return res.status(400).json({ error: 'Player ID and valid XP amount are required.' });
  }
  
  if (!mongoose.Types.ObjectId.isValid(playerId)) {
    return res.status(400).json({ error: 'Invalid player ID format.' });
  }
  
  try {
    const player = await Player.findByIdAndUpdate(
      playerId,
      { $inc: { xp: xpAmount } }, // Atomic increment operation
      { new: true, select: 'xp username' } // Only return xp and username for efficiency
    );
    
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }
    
    console.log(`✅ Added ${xpAmount} XP to ${player.username}. New total: ${player.xp}`);
    res.json({ 
      success: true, 
      newXP: player.xp, 
      xpGained: xpAmount 
    });
  } catch (error) {
    console.error('Error adding XP:', error);
    res.status(500).json({ error: 'Failed to add XP.' });
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
  if (!(await requireDeveloperOrSelf(req, res, playerId, { allowSelf: true }))) return;

  try {
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    const { gridId, settlementId } = player;
    const currentLocationGridId = player.location?.g;

    // 1. Remove player from their current location's grid state
    // Always remove from current location (including shared grids like "opening" dungeon)
    // Skip only if current location IS the homestead (since homestead gets deleted anyway)
    if (currentLocationGridId) {
      const isInHomestead = gridId && currentLocationGridId === gridId.toString();
      if (!isInHomestead) {
        console.log(`🧹 Removing player from current location grid: ${currentLocationGridId}`);
        try {
          // Use atomic $unset to avoid race conditions (same as remove-single-pc endpoint)
          await Grid.findByIdAndUpdate(
            currentLocationGridId,
            {
              $unset: { [`playersInGrid.${playerId}`]: 1 },
              $set: { playersInGridLastUpdated: new Date() }
            }
          );
          console.log(`✅ Removed player ${playerId} from grid ${currentLocationGridId} playersInGrid data`);
        } catch (error) {
          console.error(`❌ Error removing player from current location grid: ${error}`);
        }
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
    // Per-player world copies (towns, valleys, dungeons, FTUE cave) go with the account.
    await Grid.deleteMany({ ownerId: playerId, isTemplate: { $ne: true } });
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

// Developer-only (editor Players tab): clears the password, so the player signs in with the
// username alone and can set a new one from Profile. No more shared "temp" password.
router.post('/reset-password', async (req, res) => {
  const { playerId } = req.body;
  if (!playerId) {
    return res.status(400).json({ error: 'Player ID is required.' });
  }
  if (!(await requireDeveloperOrSelf(req, res, playerId, { allowSelf: false }))) return;

  try {
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    player.password = NO_PASSWORD;
    await player.save();

    console.log(`✅ Password cleared for player: ${player.username} (ID: ${playerId})`);
    res.json({
      success: true,
      message: `Password cleared for ${player.username}: they sign in with the username alone and can add a new one in Profile.`
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
    let totalXP = 0;

    for (const reward of rewards) {
      const { item, qty } = reward;

      // Handle different reward types
      if (item === 'XP') {
        // Special handling for XP - accumulate for atomic update
        totalXP += qty;
        collectedItems.push(`${qty} ${item}`);
      } else if (item === 'Relocation') {
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

    // Award XP if any XP rewards were collected
    if (totalXP > 0) {
      player.xp = (player.xp || 0) + totalXP;
      console.log(`✅ Added ${totalXP} XP from mailbox to ${player.username}. New total: ${player.xp}`);
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
      relocations: player.relocations,
      xp: player.xp
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
    // Analytics heartbeat (fire-and-forget). Id only: this route cannot verify
    // the id belongs to a real player, so it must never mint a cohort row.
    recordActivity(playerId).catch(() => {});
    
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
      .select('username settlementId accountStatus role created location icon language netWorth activeQuests completedQuests skills powers lastActive inventory ftuestep firsttimeuser aspiration warehouseCapacity backpackCapacity ftueFeedback xp warehouseLevel')
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

// GET /api/ftue-steps - Get FTUE steps configuration (single source of truth)
router.get('/ftue-steps', (req, res) => {
  try {
    const FTUEsteps = require('../tuning/FTUEsteps.json');
    res.json(FTUEsteps);
  } catch (error) {
    console.error('Error loading FTUEsteps.json:', error);
    res.status(500).json({ error: 'Failed to load FTUE steps' });
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



// POST /api/transfer-inventory - Transfer items between warehouse and backpack
router.post('/transfer-inventory', async (req, res) => {
  const { playerId, transfers, direction } = req.body;
  
  // Validate input
  if (!playerId || !Array.isArray(transfers) || !direction) {
    return res.status(400).json({ error: 'Player ID, transfers array, and direction are required.' });
  }
  
  if (!['warehouse-to-backpack', 'backpack-to-warehouse'].includes(direction)) {
    return res.status(400).json({ error: 'Direction must be "warehouse-to-backpack" or "backpack-to-warehouse".' });
  }

  try {
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    // Calculate total quantities being transferred
    let totalTransferQuantity = 0;
    const processedTransfers = [];

    for (const transfer of transfers) {
      const { itemType, quantity } = transfer;
      if (!itemType || !quantity || quantity <= 0) {
        return res.status(400).json({ error: 'Each transfer must have itemType and positive quantity.' });
      }
      
      totalTransferQuantity += quantity;
      processedTransfers.push({ itemType, quantity });
    }

    const sourceArray = direction === 'warehouse-to-backpack' ? player.inventory : player.backpack;
    const targetArray = direction === 'warehouse-to-backpack' ? player.backpack : player.inventory;
    
    // Load global tuning for capacity bonuses
    const globalTuningPath = path.join(__dirname, '../tuning/globalTuning.json');
    const globalTuning = JSON.parse(fs.readFileSync(globalTuningPath, 'utf8'));
    
    // Load master resources for skill bonuses
    const resourcesPath = path.join(__dirname, '../tuning/resources.json');
    const masterResources = JSON.parse(fs.readFileSync(resourcesPath, 'utf8'));
    
    // Calculate proper capacity with Gold bonuses and skill bonuses
    const baseWarehouse = player.warehouseCapacity || 0;
    const baseBackpack = player.backpackCapacity || 0;
    const isGold = player.accountStatus === "Gold";
    const warehouseBonus = isGold ? (globalTuning?.warehouseCapacityGold || 100000) : 0;
    const backpackBonus = isGold ? (globalTuning?.backpackCapacityGold || 5000) : 0;

    let warehouseCapacity = baseWarehouse + warehouseBonus;
    let backpackCapacity = baseBackpack + backpackBonus;

    // Add skill bonuses
    (player.skills || []).forEach(skill => {
      const skillDetails = masterResources.find(res => res.type === skill.type);
      if (skillDetails) {
        const bonus = skillDetails.qtycollected || 0;
        if (skillDetails.output === 'warehouseCapacity') {
          warehouseCapacity += bonus;
        } else if (skillDetails.output === 'backpackCapacity') {
          backpackCapacity += bonus;
        }
      }
    });
    
    const maxTargetCapacity = direction === 'warehouse-to-backpack' ? backpackCapacity : warehouseCapacity;
    
    // Calculate current target capacity usage (exclude currencies)
    const currentTargetQuantity = targetArray
      .filter(item => !isCurrency(item.type))
      .reduce((sum, item) => sum + item.quantity, 0);

    // Check capacity
    if (currentTargetQuantity + totalTransferQuantity > maxTargetCapacity) {
      return res.status(400).json({ 
        error: 'Insufficient capacity in target storage.',
        currentQuantity: currentTargetQuantity,
        maxCapacity: maxTargetCapacity,
        transferQuantity: totalTransferQuantity
      });
    }

    // Process each transfer
    for (const transfer of processedTransfers) {
      const { itemType, quantity } = transfer;

      // Find source item
      const sourceItemIndex = sourceArray.findIndex(item => item.type === itemType);
      if (sourceItemIndex === -1) {
        return res.status(400).json({ error: `Item ${itemType} not found in source storage.` });
      }

      const sourceItem = sourceArray[sourceItemIndex];
      if (sourceItem.quantity < quantity) {
        return res.status(400).json({ 
          error: `Insufficient quantity of ${itemType}. Available: ${sourceItem.quantity}, Requested: ${quantity}` 
        });
      }

      // Update source
      if (sourceItem.quantity === quantity) {
        sourceArray.splice(sourceItemIndex, 1);
      } else {
        sourceItem.quantity -= quantity;
      }

      // Update target
      const targetItemIndex = targetArray.findIndex(item => item.type === itemType);
      if (targetItemIndex >= 0) {
        targetArray[targetItemIndex].quantity += quantity;
      } else {
        targetArray.push({ type: itemType, quantity });
      }
    }

    await player.save();

    res.json({
      success: true,
      message: `Successfully transferred items ${direction}.`,
      inventory: player.inventory,
      backpack: player.backpack
    });

  } catch (error) {
    console.error('Error transferring inventory:', error);
    res.status(500).json({ error: 'Failed to transfer items.' });
  }
});

////////// GRIDS VISITED ROUTES ///////////

// POST /api/mark-grid-visited - Mark a grid as visited for a player
router.post('/mark-grid-visited', async (req, res) => {
  const { playerId, gridCoord } = req.body;

  console.log(`📍 [GRIDS_VISITED] API called with playerId=${playerId}, gridCoord=${gridCoord}, type=${typeof gridCoord}`);

  if (!playerId || typeof gridCoord !== 'number' || gridCoord < 0) {
    console.log(`📍 [GRIDS_VISITED] Validation failed: playerId=${!!playerId}, gridCoord=${gridCoord}, type=${typeof gridCoord}`);
    return res.status(400).json({ error: 'Player ID and valid gridCoord are required.' });
  }

  try {
    const player = await Player.findById(playerId);
    if (!player) {
      console.log(`📍 [GRIDS_VISITED] Player not found: ${playerId}`);
      return res.status(404).json({ error: 'Player not found.' });
    }

    console.log(`📍 [GRIDS_VISITED] Found player ${player.username}, existing gridsVisited: ${player.gridsVisited ? 'exists' : 'null/undefined'}`);

    // Check if already visited
    if (isGridVisited(player.gridsVisited, gridCoord)) {
      console.log(`📍 [GRIDS_VISITED] Grid ${gridCoord} already visited by ${player.username}`);
      return res.json({
        success: true,
        alreadyVisited: true,
        gridsVisited: player.gridsVisited
      });
    }

    // Mark as visited
    const oldBuffer = player.gridsVisited;
    player.gridsVisited = markGridVisited(player.gridsVisited, gridCoord);
    console.log(`📍 [GRIDS_VISITED] Marking grid ${gridCoord} - old buffer exists: ${!!oldBuffer}, new buffer exists: ${!!player.gridsVisited}`);

    // Tell Mongoose the buffer was modified (it doesn't detect in-place Buffer mutations)
    player.markModified('gridsVisited');
    await player.save();
    console.log(`📍 [GRIDS_VISITED] ✅ Player ${player.username} visited grid ${gridCoord} - saved successfully`);

    res.json({
      success: true,
      alreadyVisited: false,
      gridsVisited: player.gridsVisited
    });

  } catch (error) {
    console.error('📍 [GRIDS_VISITED] ❌ Error marking grid as visited:', error);
    res.status(500).json({ error: 'Failed to mark grid as visited.' });
  }
});

// POST /api/grids-tiles - Fetch tiles for multiple grids by gridCoord
router.post('/grids-tiles', async (req, res) => {
  // Settlement-view thumbnails for the cells the client says are visited. Homestead cells show the owned
  // grid's tiles; town/valley cells show the VIEWER's own copy (per-player world). A visited cell with no
  // copy yet (copies are made on first entry; the "Set All Grids Visited" debug sets bits only) falls back
  // to the template instance the copy would be created from (Settlement.grids[].gridId).
  const { playerId, settlementId, gridCoords } = req.body;
  if (!settlementId || !Array.isArray(gridCoords)) {
    return res.status(400).json({ error: 'settlementId and gridCoords array are required.' });
  }
  try {
    const settlement = await Settlement.findById(settlementId);
    if (!settlement) return res.status(404).json({ error: 'Settlement not found.' });
    const wanted = new Set(gridCoords.map(Number));
    const homesteadIds = [];
    const copyCoords = [];
    const templateIdByCoord = new Map();
    for (const cell of settlement.grids.flat()) {
      if (!cell || !wanted.has(Number(cell.gridCoord))) continue;
      if (cell.gridType === 'homestead') { if (cell.gridId) homesteadIds.push(cell.gridId); }
      else {
        copyCoords.push(Number(cell.gridCoord));
        if (cell.gridId) templateIdByCoord.set(Number(cell.gridCoord), cell.gridId);
      }
    }
    const tilesMap = {};
    if (homesteadIds.length) {
      const grids = await Grid.find({ _id: { $in: homesteadIds } }).select('tiles gridCoord').lean();
      for (const g of grids) if (g.gridCoord != null) tilesMap[g.gridCoord] = g.tiles;
    }
    if (playerId && copyCoords.length) {
      const copies = await Grid.find({ ownerId: playerId, gridCoord: { $in: copyCoords } }).select('tiles gridCoord').lean();
      for (const g of copies) tilesMap[g.gridCoord] = g.tiles;
    }
    const templateIds = copyCoords.filter((c) => tilesMap[c] == null && templateIdByCoord.has(c)).map((c) => templateIdByCoord.get(c));
    if (templateIds.length) {
      const templates = await Grid.find({ _id: { $in: templateIds } }).select('tiles').lean();
      const tilesById = new Map(templates.map((g) => [String(g._id), g.tiles]));
      for (const [coord, id] of templateIdByCoord) {
        if (tilesMap[coord] == null && tilesById.get(String(id))) tilesMap[coord] = tilesById.get(String(id));
      }
    }
    res.json({ success: true, tilesMap });
  } catch (error) {
    console.error('Error fetching grid tiles:', error);
    res.status(500).json({ error: 'Failed to fetch grid tiles.' });
  }
});

// POST /api/set-all-grids-visited - Debug: Mark all 4096 grids as visited
router.post('/set-all-grids-visited', async (req, res) => {
  const { playerId } = req.body;

  if (!playerId) {
    return res.status(400).json({ error: 'Player ID is required.' });
  }

  try {
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    // Create a buffer with all 4096 bits set to 1
    // 4096 bits = 512 bytes, all set to 0xFF (255)
    const allVisitedBuffer = Buffer.alloc(512, 0xFF);

    player.gridsVisited = allVisitedBuffer;
    player.markModified('gridsVisited');
    await player.save();

    console.log(`📍 [DEBUG] Set all grids visited for player ${player.username}`);

    res.json({
      success: true,
      gridsVisited: player.gridsVisited
    });

  } catch (error) {
    console.error('Error setting all grids visited:', error);
    res.status(500).json({ error: 'Failed to set all grids visited.' });
  }
});


// Phase 3: the player's position and current hp/maxhp live on the Player (docs/phase-3-contract.md).
// The client sends this debounced (30 s), on grid leave/arrival and on unload.
router.post('/player/state', async (req, res) => {
  const { playerId, x, y, hp } = req.body || {};
  if (!playerId) return res.status(400).json({ error: 'playerId is required' });
  const set = { lastActive: new Date() };
  if (Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < 64 && y >= 0 && y < 64) { set['location.x'] = x; set['location.y'] = y; }
  try {
    // maxhp is what the server derives from base + powers (never the client's number); hp is
    // clamped to it (utils/combatStats.js)
    if (Number.isFinite(hp)) {
      const basis = await Player.findById(playerId, 'baseMaxhp powers settings').lean();
      if (!basis) return res.status(404).json({ error: 'Player not found' });
      const { maxhp: derivedMax } = derivedStats(basis);
      set.maxhp = derivedMax;
      set.hp = Math.max(0, Math.min(hp, derivedMax));
    }
    const player = await Player.findByIdAndUpdate(playerId, { $set: set }, { new: true, projection: 'location hp maxhp' });
    if (!player) return res.status(404).json({ error: 'Player not found' });
    recordActivity(playerId).catch(() => {});   // analytics heartbeat, fire-and-forget (id only)
    res.json({ success: true, location: player.location, hp: player.hp, maxhp: player.maxhp });
  } catch (err) {
    console.error('player/state failed:', err);
    res.status(500).json({ error: 'Failed to save player state' });
  }
});

module.exports = router;
