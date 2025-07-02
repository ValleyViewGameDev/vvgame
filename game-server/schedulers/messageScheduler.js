const API_BASE = process.env.API_BASE || 'http://localhost:3001'; // Add API base URL
const tuningConfig = require("../tuning/globalTuning.json");
const Settlement = require("../models/settlement");
const Frontier = require("../models/frontier");
const Player = require("../models/player");
const sendMailboxMessage = require('../utils/messageUtils');
const { getSocketIO } = require('../socketInstance');

async function messageScheduler(frontierId, phase, frontier = null) {
    console.log(`📪 MESSAGE SCHEDULING LOGIC for Frontier ${frontierId}, Phase: ${phase}`);
    if (!frontierId) { console.warn("⚠️ No frontierId provided to messageScheduler."); return {}; }
    if (phase === "waiting") { console.log(`✉️ Phase is 'waiting'. No action taken.`); return {}; }
    if (phase !== "sending") { console.log(`⏳ Phase '${phase}' is not actionable. Skipping.`); return {}; }

    const players = await Player.find({});
    const now = new Date();
    const cutOffDays = 14;
    const cutOffMS = cutOffDays * 24 * 60 * 60 * 1000;
    const cutOffTime = new Date(now.getTime() - cutOffMS);

    const dailyMessageId = 5;
    const io = getSocketIO();
    if (!io) { console.warn("⚠️ Socket.IO instance not found. Messages will be sent without badge updates."); }

console.log("📦 io from getSocketIO():", io?.constructor?.name, io?.path);
console.log("✅ getSocketIO returned an object. Known rooms:", Object.keys(io.sockets.adapter.rooms));
console.log("🔍 Connected sockets (count):", io.engine.clientsCount);

    for (const player of players) {
        await sendMailboxMessage(player._id.toString(), dailyMessageId, [], io);
    }
    console.log(`📬 Daily message ${dailyMessageId} sent to ${players.length} players.`);

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
    return {};
}

module.exports = messageScheduler;