
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


// POST /register-new-player
// Player registration - homestead is NOT created here. It's created when player buys Home Deed.
// This allows us to avoid creating homesteads for players who churn before completing the tutorial.

router.post('/register-new-player', async (req, res) => {
  const { username, password, language, frontierId, browser, os, diagnostics } = req.body;
  console.log('POST /register-new-player:', { username, frontierId, browser, os, diagnostics });

  if (!username || !password || !language || !frontierId) {
    return res.status(400).json({ error: 'Missing required fields for registration.' });
  }
  try {
    // Check if username exists
    const existingPlayer = await Player.findOne({ username });
    if (existingPlayer) {
      return res.status(400).json({ error: 'Username already exists.' });
    }

    // Hash the password
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
      firsttimeuser,
      ftuestep,
      location: defaultLocation,
      settings,
      relationships,
      tradeStall,
      kentOffers,
    } = starterAccount.defaultAttributes;

    // Create the new player
    // FTUE: New players start in the Cave dungeon
    // Homestead will be created when they buy the Home Deed
    const FTUE_CAVE_GRID_ID = '695bd5b76545a9be8a36ee22';
    const FTUE_CAVE_START_X = 4; // 2 tiles right of original position
    const FTUE_CAVE_START_Y = 9;

    const newPlayer = new Player({
      username,
      password: hashedPassword,
      icon: defaultIcon,
      language,
      firsttimeuser,
      ftuestep,
      ftueFeedback: {
        positive: [],
        negative: [],
        browser: browser || null,
        os: os || null,
        // Diagnostics captured at account creation
        latency: diagnostics?.latency ?? null,
        connectionType: diagnostics?.connectionType ?? null,
        downlink: diagnostics?.downlink ?? null,
        screenWidth: diagnostics?.screenWidth ?? null,
        screenHeight: diagnostics?.screenHeight ?? null,
        viewportWidth: diagnostics?.viewportWidth ?? null,
        viewportHeight: diagnostics?.viewportHeight ?? null,
        devicePixelRatio: diagnostics?.devicePixelRatio ?? null,
        deviceMemory: diagnostics?.deviceMemory ?? null,
        hardwareConcurrency: diagnostics?.hardwareConcurrency ?? null,
        isMobile: diagnostics?.isMobile ?? null,
        isTouchDevice: diagnostics?.isTouchDevice ?? null,
        webglSupported: diagnostics?.webglSupported ?? null,
        timezone: diagnostics?.timezone ?? null,
      },
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
      relationships: [...relationships],
      tradeStall: [...tradeStall],
      kentOffers: kentOffers ? { ...kentOffers, offers: [...kentOffers.offers] } : undefined,
      // FTUE: Start new players in the Cave dungeon
      location: {
        g: FTUE_CAVE_GRID_ID,
        s: null, // No settlement until homestead is created
        f: frontierId,
        gridCoord: null, // Dungeons don't have gridCoord
        x: FTUE_CAVE_START_X,
        y: FTUE_CAVE_START_Y,
        gtype: 'dungeon',
      },
      relocations,
      iscamping,
      // gridId and settlementId are NOT set - they'll be set when player buys Home Deed
      frontierId,
      settings,
    });

    await newPlayer.save();

    newPlayer.playerId = newPlayer._id;
    await newPlayer.save();

    // Note: Settlement population is NOT incremented here
    // It will be incremented when the player actually claims a homestead (buys Home Deed)

    console.log(`✅ New player created: ${username} (homestead will be created when Home Deed is purchased)`);
    sendNewUserEmail(newPlayer);

    res.status(201).json({ success: true, player: newPlayer });
  } catch (err) {
    console.error('❌ Error in /register-new-player:', err);
    res.status(500).json({ error: 'Failed to register player.' });
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
    
    // Update lastActive on successful login
    await Player.findByIdAndUpdate(player._id, { 
      lastActive: new Date() 
    });

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
