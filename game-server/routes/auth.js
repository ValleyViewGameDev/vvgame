
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
const { performGridCreation, claimHomestead } = require('../utils/createGridLogic');


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
      firsttimeuser,
      ftuestep,
      location: defaultLocation,
      settings,
      relationships,
      tradeStall,
      kentOffers,
    } = starterAccount.defaultAttributes;

    // Step 4: Create the new player

    const newPlayer = new Player({
      username,
      password: hashedPassword,
      icon: defaultIcon,
      language,
      firsttimeuser,
      ftuestep,
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
      location: {
        g: gridId,
        s: location.settlementId,
        f: location.frontierId,
        gridCoord: location.gridCoord || null,
        x: location.x ?? defaultLocation.x,
        y: location.y ?? defaultLocation.y,
        gtype: location.gtype || defaultLocation.gtype,
      },
      relocations,
      iscamping,
      gridId,
      settlementId: location.settlementId,
      frontierId: location.frontierId,
      settings,
    });

    await newPlayer.save();

    // Claim homestead for the new player
    try {
      const claimResult = await claimHomestead(gridId, newPlayer._id);
      console.log('🏡 Homestead claim result:', claimResult);
    } catch (claimErr) {
      console.error('❌ Failed to claim homestead:', claimErr);
    }

    newPlayer.playerId = newPlayer._id;
    await newPlayer.save();

    // Increment settlement population
    await Settlement.findByIdAndUpdate(
      location.settlementId,
      { $inc: { population: 1 } },
      { new: true }
    );

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
