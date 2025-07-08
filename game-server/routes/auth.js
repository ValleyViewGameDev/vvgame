
const express = require('express');
const bcrypt = require('bcrypt'); // or `bcryptjs`
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Player = require('../models/player'); // Adjust path as needed
const Grid = require('../models/grid'); // Assuming you have a Grid model
const Settlement = require('../models/settlement'); 
const router = express.Router();

const starterAccountPath = path.resolve(__dirname, '../tuning/starterAccount.json');
const starterAccount = JSON.parse(fs.readFileSync(starterAccountPath, 'utf8'));

const { sendNewUserEmail } = require('../utils/emailUtils.js');
const { performGridCreation } = require('../utils/createGridLogic.js');

// POST /register
router.post('/register', async (req, res) => {
  const { username, password, language, location } = req.body;
  console.log('POST /register:', { username, location });

  // Make sure we have username, password, language and location
  if (!username || !password || !language || !location) {
    return res.status(400).json({ error: 'Username, password, and language are required.' });
  }
  try {
    // 1) Check if username already exists
    const existingPlayer = await Player.findOne({ username });
    if (existingPlayer) {
      return res.status(400).json({ error: 'Username already exists.' });
    }
    // 2) Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    // 3) Load default attributes from starterAccount
    const {
      icon: defaultIcon,
      range,
      baseHp,
      baseMaxhp,
      baseArmorclass,
      baseAttackbonus,
      baseDamage,
      baseSpeed,
      baseAttackrange,
      inventory,
      backpack,
      skills,
      powers,
      warehouseCapacity,
      backpackCapacity,
      accountStatus,
      role,
      iscamping,
      relocations,
    } = starterAccount.defaultAttributes;

    // 4) Validate location data
    const {
      g: gridId,
      s: settlementId,
      f: frontierId,
      gridCoord,
      x,
      y,
      gtype,
    } = location;

    if (!gridId || !settlementId || !frontierId) {
      return res.status(400).json({
        error: 'Location must include g (gridId), s (settlementId), and f (frontierId).',
      });
    }

    // 5) Create the new player
    const newPlayer = new Player({
      username,
      password: hashedPassword,
      icon: defaultIcon,      // always use default icon from starterAccount
      language,
      range,
      baseHp,
      baseMaxhp,
      baseArmorclass,
      baseAttackbonus,
      baseDamage,
      baseSpeed,
      baseAttackrange,
      inventory: [...inventory],
      backpack: [...backpack],
      skills: [...skills],
      powers: [...powers],
      warehouseCapacity,
      backpackCapacity,
      accountStatus,
      role,
      tradeStall: Array(starterAccount.tradeStallSlots[accountStatus] || 6).fill(null),
      location: {
        g: gridId,
        s: settlementId,
        f: frontierId,
        gridCoord: gridCoord || null,  // store numeric or string code
        x: x ?? 0,
        y: y ?? 0,
        gtype: gtype || '',
      },
      activeQuests: [
        {
          questId: "Find the Wizard in the Valley",
          completed: true, // Mark as completed so the player can collect the reward
          rewardCollected: false, // Ensure the reward is still available
          progress: {}, // No progress required since it's marked completed
          giver: "Wizard",
          startTime: Date.now(),
          reward: "Prospero's Orb",
          rewardqty: 1,
          symbol: "🧙", // Optional: Add a symbol for the quest
        },
      ],
      relocations,
      iscamping,
      gridId,
      settlementId,
      frontierId,
      settings: {
          isStateMachineEnabled: false,
          isTeleportEnabled: false,
          toggleVFX: true,
          hasDied: false,
        },
    });

    const grid = await Grid.findById(gridId);
    if (!grid) {
      console.warn(`❌ gridId ${gridId} passed in player location does not exist.`);
    } else if (grid.ownerId) {
      console.warn(`⚠️ Warning: registering player to grid ${gridId}, but it already has ownerId: ${grid.ownerId}`);
    } else {
      console.log(`✅ gridId ${gridId} is valid and unclaimed`);
    }

    await newPlayer.save();

    // 6) Populate playerId with _id (redundant, but often used by the client)
    newPlayer.playerId = newPlayer._id;
    await newPlayer.save();
    console.log(`New player registered: ${username}`);
    sendNewUserEmail(newPlayer); // 🚀 Notify yourself

    // 7) Send final response
    res.status(201).json({ success: true, player: newPlayer });
  } catch (error) {
    console.error('Error during player registration:', error);
    res.status(500).json({ error: 'Failed to register player.' });
  }
});

// POST /register-new-player (Atomic registration + grid creation)
router.post('/register-new-player', async (req, res) => {
  const { username, password, language, location } = req.body;
  console.log('POST /register-new-player:', { username, location });

  if (!username || !password || !language || !location || !location.gridCoord || !location.settlementId || !location.frontierId || !location.gtype) {
    return res.status(400).json({ error: 'Missing required fields for registration.' });
  }
  try {
    // Check if username exists
    const existingPlayer = await Player.findOne({ username });
    if (existingPlayer) {
      return res.status(400).json({ error: 'Username already exists.' });
    }

    // Step 1: Create grid for homestead
    const gridResult = await performGridCreation({
      gridCoord: location.gridCoord,
      gridType: 'homestead',
      settlementId: location.settlementId,
      frontierId: location.frontierId,
    });

    if (!gridResult?.success) {
      return res.status(500).json({ error: 'Grid creation failed.' });
    }

    const gridId = gridResult.gridId;

    // Step 2: Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Step 3: Load starter attributes
    const {
      icon: defaultIcon,
      range,
      baseHp,
      baseMaxhp,
      baseArmorclass,
      baseAttackbonus,
      baseDamage,
      baseSpeed,
      baseAttackrange,
      inventory,
      backpack,
      skills,
      powers,
      warehouseCapacity,
      backpackCapacity,
      accountStatus,
      role,
      iscamping,
      relocations,
    } = starterAccount.defaultAttributes;

    // Step 4: Create the new player
    const newPlayer = new Player({
      username,
      password: hashedPassword,
      icon: defaultIcon,
      language,
      range,
      baseHp,
      baseMaxhp,
      baseArmorclass,
      baseAttackbonus,
      baseDamage,
      baseSpeed,
      baseAttackrange,
      inventory: [...inventory],
      backpack: [...backpack],
      skills: [...skills],
      powers: [...powers],
      warehouseCapacity,
      backpackCapacity,
      accountStatus,
      role,
      tradeStall: Array(starterAccount.tradeStallSlots[accountStatus] || 6).fill(null),
      location: {
        g: gridId,
        s: location.settlementId,
        f: location.frontierId,
        gridCoord: location.gridCoord || null,
        x: location.x ?? 0,
        y: location.y ?? 0,
        gtype: location.gtype || '',
      },
      activeQuests: [
        {
          questId: "Find the Wizard in the Valley",
          completed: true,
          rewardCollected: false,
          progress: {},
          giver: "Wizard",
          startTime: Date.now(),
          reward: "Prospero's Orb",
          rewardqty: 1,
          symbol: "🧙",
        },
      ],
      relocations,
      iscamping,
      gridId,
      settlementId: location.settlementId,
      frontierId: location.frontierId,
      settings: {
        isStateMachineEnabled: false,
        isTeleportEnabled: false,
        toggleVFX: true,
        hasDied: false,
      },
    });

    await newPlayer.save();

    newPlayer.playerId = newPlayer._id;
    await newPlayer.save();

    console.log(`✅ New player created with grid ${gridId}: ${username}`);
    sendNewUserEmail(newPlayer);

    res.status(201).json({ success: true, player: newPlayer });
  } catch (err) {
    console.error('❌ Error in /register-new-player:', err);
    res.status(500).json({ error: 'Failed to register player and create homestead.' });
  }
});


// Route: Login an Existing Player
router.post('/login', async (req, res) => {
  console.log("POST /login route hit", { body: req.body });

  const { username, password } = req.body;

  // Validation
  if (!username || !password) {
    return res.status(400).send('Missing required fields');
  }

  try {
    // Find the player by username
    const player = await Player.findOne({ username });
    if (!player) {
      return res.status(400).json({ success: false, error: 'Player not found' });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, player.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, error: 'Invalid password' });
    }

    console.log('Login successful for user:', player.username);

    // Respond with player details (excluding password)
    return res.status(200).json({
      success: true,
      message: 'Login successful',
      player: {
        playerId: player._id,
        username: player.username,
        language: player.language,
        icon: player.icon,
        location: player.location,
        inventory: player.inventory,
        skills: player.skills,
        accountStatus: player.accountStatus,
        role: player.role,
        tradeStall: player.tradeStall,
        frontierId: player.frontierId,
        settlementId: player.settlementId,
        gridId: player.gridId,
      },
    });
  } catch (err) {
    console.error('Error during login:', err.message || err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});


module.exports = router;
