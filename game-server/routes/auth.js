
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

const crypto = require('crypto');
const { sendNewUserEmail } = require('../utils/emailUtils.js');
const { recordActivity, ensurePageview, sanitizeClientInfo } = require('../utils/analytics');
const { NO_PASSWORD, hasPassword, publicPlayer } = require('../utils/publicPlayer');
const { validateUsername } = require('../utils/usernames');

// --- Per-network signup cap (anti-abuse, ported from House) -----------------------------
// Passwordless, email-less accounts are free to spin up, so NEW accounts per IP are capped
// within a window, production only. A salted hash of the IP is stored, never the IP.
// Private/loopback IPs (local dev) are skipped and the check fails OPEN on any error.
const IS_PROD = process.env.NODE_ENV === 'production';
const SIGNUP_IP_DAILY_CAP = 5;
const SIGNUP_IP_WINDOW_HOURS = 24;
const PRIVATE_IP_RE = /^(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|::1$|::ffff:127\.|f[cd][0-9a-f]{2}:|fe80:|localhost$)/i;
function signupIpHash(ip) {
  if (!ip || PRIVATE_IP_RE.test(String(ip))) return null;
  const salt = process.env.SIGNUP_IP_SALT || process.env.SECRET_KEY || '';
  return crypto.createHash('sha256').update(String(ip) + salt).digest('hex').slice(0, 32);
}
async function signupRateLimited(ipHash) {
  if (!IS_PROD || !ipHash) return false;
  try {
    const since = new Date(Date.now() - SIGNUP_IP_WINDOW_HOURS * 60 * 60 * 1000);
    const recent = await Player.countDocuments({ signup_ip_hash: ipHash, created: { $gte: since } });
    return recent >= SIGNUP_IP_DAILY_CAP;
  } catch (err) {
    console.warn('[register] rate-limit check failed, allowing signup:', err?.message || err);
    return false;
  }
}

// Free avatars a new profile may pick: game-client/src/Authentication/PlayerIcons.json `free[].value`
// (the server reads the client's file when the repo is checked out whole; on a server-only deploy it
// falls back to "any short string", i.e. one emoji). Anything else gets the starter icon.
let freeIcons = null;
function isFreeIcon(icon) {
  if (typeof icon !== 'string' || !icon || icon.length > 8) return false;
  if (freeIcons === null) {
    try {
      const icons = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../game-client/src/Authentication/PlayerIcons.json'), 'utf8'));
      freeIcons = new Set((icons.free || []).map((i) => i.value).filter(Boolean));
    } catch (_) { freeIcons = false; }
  }
  return freeIcons ? freeIcons.has(icon) : true;
}

// POST /check-username {username} -> { available, reason } (reason: TAKEN or a validateUsername code)
router.post('/check-username', async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const reason = validateUsername(username);
  if (reason) return res.json({ available: false, reason });
  const taken = await Player.exists({ username });
  res.json({ available: !taken, reason: taken ? 'TAKEN' : null });
});


// POST /register-new-player
// Player registration - homestead is NOT created here. It's created when player buys Home Deed.
// This allows us to avoid creating homesteads for players who churn before completing the tutorial.
// A password is OPTIONAL (docs/onboarding-plan.md phase A): without one the profile stores
// NO_PASSWORD and signs in with the username alone; the player can add one later from Profile.

router.post('/register-new-player', async (req, res) => {
  const { password, language, frontierId, browser, os, diagnostics } = req.body;
  const username = String(req.body.username || '').trim();
  console.log('POST /register-new-player:', { username, frontierId, browser, os, diagnostics });
  // Optional acquisition context from the client beacon (Utils/pageviewBeacon.js):
  // { visitor_id, surface, acquisition: { utm_source, utm_medium, utm_campaign,
  // referrer_host, landing_path } }. Older clients send nothing -> stays null.
  const clientInfo = sanitizeClientInfo(req.body.clientInfo || req.body.acquisition || null);

  if (!username || !language || !frontierId) {
    return res.status(400).json({ error: 'Missing required fields for registration.', code: 'MISSING' });
  }
  const nameProblem = validateUsername(username);
  if (nameProblem) {
    return res.status(400).json({ error: 'That name cannot be used.', code: nameProblem });
  }
  if (password !== undefined && password !== null && password !== '' && (typeof password !== 'string' || password.length < 4)) {
    return res.status(400).json({ error: 'Password must be at least 4 characters.', code: 'PASSWORD_SHORT' });
  }
  try {
    // Check if username exists
    const existingPlayer = await Player.findOne({ username });
    if (existingPlayer) {
      return res.status(400).json({ error: 'Username already exists.', code: 'TAKEN' });
    }

    const ipHash = signupIpHash(req.ip);
    if (await signupRateLimited(ipHash)) {
      return res.status(429).json({ error: 'Too many new profiles from this network today. Please try again tomorrow.', code: 'RATE_LIMITED' });
    }

    // Hash the password when one was given; otherwise the profile is passwordless
    const hashedPassword = password ? await bcrypt.hash(password, 10) : NO_PASSWORD;

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
    // FTUE: every new player gets their own copy of the tutorial cave (docs/phase-2-contract.md).
    const { createDungeonGrid, FTUE_TEMPLATE, FTUE_KEY } = require('../utils/dungeonUtils');
    const FTUE_CAVE_START_X = 4;
    const FTUE_CAVE_START_Y = 9;
    const newPlayerId = new mongoose.Types.ObjectId();
    const caveGrid = await createDungeonGrid(FTUE_TEMPLATE, {
      frontierId, settlementId: frontierId, ownerId: newPlayerId, templateKey: FTUE_KEY,
    });

    const newPlayer = new Player({
      _id: newPlayerId,
      username,
      password: hashedPassword,
      signup_ip_hash: ipHash,
      icon: isFreeIcon(req.body.icon) ? req.body.icon : defaultIcon,
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
      hp: baseMaxhp,
      maxhp: baseMaxhp,
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
        g: caveGrid._id,
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
      client_info: clientInfo,
    });

    await newPlayer.save();

    // Analytics (fire-and-forget, never awaited): cohort row + day-0 activity, and
    // make sure the visitor's pageview exists so the Site Traffic funnel's
    // numerator never outruns its denominator. See docs/analytics.md.
    recordActivity(newPlayer._id, { username: newPlayer.username }).catch(() => {});
    if (clientInfo && clientInfo.visitor_id) {
      ensurePageview(clientInfo.visitor_id, {
        utm_source: clientInfo.acquisition.utm_source,
        referrer_host: clientInfo.acquisition.referrer_host,
        source: clientInfo.surface,
      }).catch(() => {});
    }

    newPlayer.playerId = newPlayer._id;
    await newPlayer.save();

    // Note: Settlement population is NOT incremented here
    // It will be incremented when the player actually claims a homestead (buys Home Deed)

    console.log(`✅ New player created: ${username} (homestead will be created when Home Deed is purchased)`);
    sendNewUserEmail(newPlayer);

    res.status(201).json({ success: true, player: publicPlayer(newPlayer) });
  } catch (err) {
    console.error('❌ Error in /register-new-player:', err);
    res.status(500).json({ error: 'Failed to register player.' });
  }
});


// Route: Login an Existing Player
// A passwordless profile (password === NO_PASSWORD) signs in with the username alone; sending a
// password for one is refused so the player learns to leave the field blank. Error codes are
// mapped to strings on the client: NOT_FOUND | NO_PASSWORD | PASSWORD_REQUIRED | BAD_PASSWORD.
router.post('/login', async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  console.log("POST /login route hit", { username });

  if (!username) {
    return res.status(400).json({ success: false, error: 'Missing required fields', code: 'MISSING' });
  }

  try {
    const player = await Player.findOne({ username });
    if (!player) {
      return res.status(400).json({ success: false, error: 'Player not found', code: 'NOT_FOUND' });
    }

    if (!hasPassword(player)) {
      if (password) {
        return res.status(400).json({ success: false, error: 'This profile has no password. Leave the password field blank.', code: 'NO_PASSWORD' });
      }
    } else {
      if (!password) {
        return res.status(400).json({ success: false, error: 'This profile has a password.', code: 'PASSWORD_REQUIRED' });
      }
      const isMatch = await bcrypt.compare(password, player.password);
      if (!isMatch) {
        return res.status(400).json({ success: false, error: 'Invalid password', code: 'BAD_PASSWORD' });
      }
    }

    console.log('Login successful for user:', player.username);

    // Update lastActive on successful login
    await Player.findByIdAndUpdate(player._id, { lastActive: new Date() });
    // Analytics heartbeat (fire-and-forget). Login holds the player doc, so it
    // is one of the two call sites allowed to stamp the username (docs/analytics.md).
    recordActivity(player._id, { username: player.username }).catch(() => {});

    // Respond with player details (never the password hash)
    return res.status(200).json({
      success: true,
      message: 'Login successful',
      player: {
        playerId: player._id,
        username: player.username,
        language: player.language,
        icon: player.icon,
        location: player.location,
        hp: player.hp,
        maxhp: player.maxhp,
        inventory: player.inventory,
        skills: player.skills,
        accountStatus: player.accountStatus,
        role: player.role,
        tradeStall: player.tradeStall,
        frontierId: player.frontierId,
        settlementId: player.settlementId,
        gridId: player.gridId,
        hasPassword: hasPassword(player),
      },
    });
  } catch (err) {
    console.error('Error during login:', err.message || err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /player/change-password {playerId, currentPassword?, newPassword}
// Initial set (passwordless profile): no current password needed. Change: the current one must match.
router.post('/player/change-password', async (req, res) => {
  const { playerId, currentPassword, newPassword } = req.body || {};
  if (!playerId) return res.status(400).json({ error: 'playerId is required.', code: 'MISSING' });
  if (typeof newPassword !== 'string' || newPassword.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters.', code: 'PASSWORD_SHORT' });
  }
  try {
    const player = await Player.findById(playerId);
    if (!player) return res.status(404).json({ error: 'Player not found.', code: 'NOT_FOUND' });
    if (hasPassword(player)) {
      if (typeof currentPassword !== 'string' || !currentPassword) {
        return res.status(400).json({ error: 'Current password is required.', code: 'PASSWORD_REQUIRED' });
      }
      const ok = await bcrypt.compare(currentPassword, player.password);
      if (!ok) return res.status(401).json({ error: 'Current password is incorrect.', code: 'BAD_PASSWORD' });
    }
    player.password = await bcrypt.hash(newPassword, 10);
    await player.save();
    res.json({ success: true, hasPassword: true });
  } catch (err) {
    console.error('❌ /player/change-password:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});


module.exports = router;
