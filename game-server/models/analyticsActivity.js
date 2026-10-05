// Durable per-(player, UTC day) activity record. Powers the DAU series and
// retention on the analytics dashboard (tools/analytics/). Written by
// utils/analytics.recordActivity from the places that already stamp
// players.lastActive (login, update-last-active, enter-grid, player/state).
// NEVER deleted: it survives account deletion, so historical DAU and retention
// stay intact after the source player doc is gone. Deliberately independent of
// the players collection. See docs/analytics.md.

const mongoose = require('mongoose');

const AnalyticsActivitySchema = new mongoose.Schema({
  // "<playerId>:<YYYY-MM-DD>": deterministic, so the day's first write inserts
  // and every later write that day is a cheap idempotent no-op (no duplicates,
  // so countDocuments({day}) == unique active players that day).
  _id: { type: String },
  playerId: { type: String, required: true, index: true }, // stringified player _id
  day: { type: String, required: true, index: true },      // YYYY-MM-DD (UTC)
  ts: { type: Date, default: Date.now },                   // first activity instant that day
  // 'live'     recorded by the running server (real, continuous activity)
  // 'backfill' a day-0 signup record reconstructed from players.created by
  //            tools/analytics/backfill-firstseen.js, so DAU >= New Users holds
  //            historically. Backfill rows are a DAU FLOOR only (returning visits
  //            before instrumentation were never recorded), so retention ignores
  //            them when deciding which cohorts have real data.
  source: { type: String, default: 'live', enum: ['live', 'backfill'] },
  // True if the player actually PLAYED that day, not merely opened the app.
  // The activity row is written on login / app boot / grid entry, so opening the
  // tab creates one; this flag is set by utils/analytics.recordPlayed from a
  // gameplay write (bulk-harvest, crafting collect). Forward-only: rows before
  // the deploy carry no flag and must read as NO DATA, never as "didn't play".
  played: { type: Boolean, default: false },
  // True if the player turned in at least one quest that day (the client's
  // update-profile call carrying completedQuests). Idempotent per (player, day).
  quest_completed: { type: Boolean, default: false },
  // True if the player made a store purchase that day (purchase-store-offer).
  // The purchases ledger (models/purchase.js) holds the per-purchase rows; this
  // is just the per-day reach flag for "% of DAU buying".
  purchase: { type: Boolean, default: false },
  // Count of grid entries (enter-grid calls) that day: a COUNTER ($inc), since a
  // player travels many times a day. Total moves/day = sum; movers/day = rows
  // with grids_entered > 0.
  grids_entered: { type: Number, default: 0 },
  schema_version: { type: Number, default: 1 },
}, { collection: 'analytics_activity', versionKey: false });

module.exports = mongoose.model('AnalyticsActivity', AnalyticsActivitySchema);
