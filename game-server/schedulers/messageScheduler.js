const API_BASE = process.env.API_BASE || 'http://localhost:3001'; // Add API base URL
const tuningConfig = require("../tuning/globalTuning.json");
const Settlement = require("../models/settlement");
const Frontier = require("../models/frontier");
const Player = require("../models/player");
const sendMailboxMessage = require('../utils/messageUtils');
const serverApp = require('../server').app;

async function messageScheduler(frontierId, phase, frontier = null) {
    if (!frontierId) { 
        console.warn("⚠️ No frontierId provided to messageScheduler."); 
        return {}; 
    }

    console.log(`📪 MESSAGE SCHEDULING LOGIC for Frontier ${frontierId}, Phase: ${phase}`);

    const players = await Player.find({});
    const now = new Date();
    const cutOffDays = 14; // days to keep messages
    const cutOffMS = cutOffDays * 24 * 60 * 60 * 1000; // days to keep messages
    const cutOffTime = new Date(now.getTime() - cutOffMS);

    // 1. Send daily message to all players
    const dailyMessageId = 5; // ensure this exists in messages.json
    //const io = serverApp?.get('socketio');
    const io = req.app.get('socketio'); // assuming io was attached in server.js
    await sendMailboxMessage(playerId, messageId, sanitizedRewards, io);

    if (!io) {
      console.warn("⚠️ Socket.IO instance not found. Messages will be sent without badge updates.");
    }

    for (const player of players) {
    await sendMailboxMessage(player._id.toString(), dailyMessageId, [], io);
    }
    console.log(`📬 Daily message ${dailyMessageId} sent to ${players.length} players.`);

    // 2. Purge old messages (older than 2 weeks, unless neverPurge = true)
    for (const player of players) {
      const originalLength = player.messages.length;
      player.messages = player.messages.filter(msg => {
        return msg.neverPurge || new Date(msg.timestamp) >= cutOffTime;
      });
      if (player.messages.length !== originalLength) {
        await player.save();
        console.log(`🧹 Purged old messages for player ${player._id}.`);
      }
    }
}

module.exports = messageScheduler;