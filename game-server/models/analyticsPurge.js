// One row per purge run of unnamed silent accounts (utils/purgeUnnamed.js): how many visitors
// bounced in the cave without ever signing the deed. Never deleted; the dashboard's FTUE tab
// shows the sum for its date range beside the funnel (those players are gone from `players`).
const mongoose = require('mongoose');

const AnalyticsPurgeSchema = new mongoose.Schema({
  day: { type: String, required: true, index: true }, // YYYY-MM-DD (UTC) of the run
  ts: { type: Date, default: Date.now },
  count: { type: Number, required: true },
  criteria: { type: Object, default: null },
}, { collection: 'analytics_purge', versionKey: false });

module.exports = mongoose.model('AnalyticsPurge', AnalyticsPurgeSchema);
