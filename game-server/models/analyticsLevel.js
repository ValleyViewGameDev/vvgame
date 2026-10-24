// Durable per-(player, level) record: when a player first reached each level (backlog OB-7).
// Written by utils/analytics.recordLevelUps from the three places XP changes on the server
// (/api/addXP, the mailbox collect, a combat kill). Write-once: the first crossing inserts, a
// repeat is a no-op. NEVER deleted with the player (like analytics_activity), so pacing survives
// account deletion. Read by `node tools/progression.js --pacing`. Forward-only: levels reached
// before the deploy have no row.

const mongoose = require('mongoose');

const AnalyticsLevelSchema = new mongoose.Schema({
  _id: { type: String },                                    // "<playerId>:<level>"
  playerId: { type: String, required: true, index: true },  // stringified player _id
  level: { type: Number, required: true, index: true },
  ts: { type: Date, default: Date.now },                    // the instant the level was reached
  day: { type: String, required: true },                    // YYYY-MM-DD (UTC) of ts
  xp: { type: Number },                                     // total xp just after the crossing
  schema_version: { type: Number, default: 1 },
}, { collection: 'analytics_level', versionKey: false });

module.exports = mongoose.model('AnalyticsLevel', AnalyticsLevelSchema);
