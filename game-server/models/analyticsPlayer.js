// Durable first-seen registry: one doc per player, written once. Powers the
// New Users series and defines retention cohorts (who joined on day D). Like
// analytics_activity it is independent of the players collection and NEVER
// deleted, so new-user history survives account deletion. Seeded once from
// players.created by tools/analytics/backfill-firstseen.js, then kept current
// by utils/analytics.recordActivity (register + login pass the username).

const mongoose = require('mongoose');

const AnalyticsPlayerSchema = new mongoose.Schema({
  _id: { type: String },                                       // stringified player _id
  firstSeenDay: { type: String, required: true, index: true }, // YYYY-MM-DD (UTC)
  firstSeenAt: { type: Date, default: Date.now },
  // Last-known username, captured at auth time. Stored here (durably) so the
  // dashboard can still identify an account, for dev filtering and the Users
  // list, AFTER the player deletes their account. Null until first captured.
  username: { type: String, default: null },
  // The browsers this account was made or signed in on (anonymous visitor ids, X-Visitor-Id;
  // $addToSet at every auth-time write). Kept here so the dashboard can still tell a developer's
  // throwaway account by its browser after the player doc is deleted (analytics_dev_device).
  visitor_ids: { type: [String], default: undefined, index: true },
  // Set when the account was made or signed in through a developer's local setup: 'local-server'
  // (a game server not running in production: it shares the production database) or
  // 'localhost-page' (a request from a localhost page). The dashboard never counts these
  // accounts (owner 2026-11-16).
  dev_source: { type: String, default: null },
  schema_version: { type: Number, default: 1 },
}, { collection: 'analytics_player', versionKey: false });

module.exports = mongoose.model('AnalyticsPlayer', AnalyticsPlayerSchema);
