#!/usr/bin/env node
// One-time (idempotent) backfill from players.created. For each existing player
// it writes TWO durable records keyed off the account-creation day:
//   - analytics_player: first-seen registry -> New Users history + cohorts
//   - analytics_activity (source:'backfill'): a day-0 activity record, so DAU
//     >= New Users holds historically (a new user was, by definition, active
//     the day they signed up). Backfill rows are a DAU FLOOR only: returning
//     visits before instrumentation were never recorded, so the retention view
//     ignores source:'backfill' when deciding which cohorts have real data.
//
// Uses $min on firstSeenDay/firstSeenAt so it is safe to run any time and in
// any order relative to live recordActivity writes: the doc always lands on
// the earliest known day. Connects to whatever MONGODB_URI game-server/.env
// points at (production Atlas), so this WRITES TO PRODUCTION ANALYTICS. Run
// with --dry first.
//
// Usage: node tools/analytics/backfill-firstseen.js [--dry]

const path = require('path');

const GAME_SERVER = path.join(__dirname, '..', '..', 'game-server');
// Reuse game-server's installed deps (no npm install under tools/).
require(path.join(GAME_SERVER, 'node_modules', 'dotenv'))
  .config({ path: path.join(GAME_SERVER, '.env') });

const mongoose = require(path.join(GAME_SERVER, 'node_modules', 'mongoose'));
// game-server/config/database.js is dead code (its Mongoose 5 options are
// rejected by Mongoose 8; the game server calls mongoose.connect directly), so
// connect the same way game-server/server.js does.
function connectMongo() {
  if (!process.env.MONGODB_URI) return Promise.reject(new Error('MONGODB_URI is not set'));
  return mongoose.connect(process.env.MONGODB_URI, { maxPoolSize: 5, serverSelectionTimeoutMS: 10000, socketTimeoutMS: 30000, autoIndex: false });
}
const Player = require(path.join(GAME_SERVER, 'models', 'player'));
const AnalyticsPlayer = require(path.join(GAME_SERVER, 'models', 'analyticsPlayer'));
const AnalyticsActivity = require(path.join(GAME_SERVER, 'models', 'analyticsActivity'));
const { dayKeyUTC } = require(path.join(GAME_SERVER, 'utils', 'analytics'));

const DRY = process.argv.includes('--dry');

async function main() {
  await connectMongo();
  await AnalyticsPlayer.createIndexes();
  await AnalyticsActivity.createIndexes();

  const total = await Player.countDocuments();
  console.log(`[backfill] ${total} players to scan${DRY ? ' (dry run, no writes)' : ''}`);

  let scanned = 0;
  let written = 0;
  // Stream to keep memory flat regardless of player count.
  const cursor = Player.find({}, { _id: 1, created: 1, createdAt: 1, username: 1 }).lean().cursor();
  for (let p = await cursor.next(); p != null; p = await cursor.next()) {
    scanned++;
    // `created` has a schema default and exists on every doc; `createdAt` is the
    // Mongoose timestamp (missing on the oldest docs). The ObjectId's embedded
    // timestamp is the last resort.
    const created = p.created || p.createdAt || p._id.getTimestamp();
    const day = dayKeyUTC(created);
    if (DRY) { console.log(`[dry] ${p._id} ${p.username || '<no username>'} -> ${day}`); continue; }
    const pid = String(p._id);
    const [rp] = await Promise.all([
      AnalyticsPlayer.updateOne(
        { _id: pid },
        {
          $min: { firstSeenDay: day, firstSeenAt: new Date(created) },
          $set: { username: p.username || null },
          $setOnInsert: { schema_version: 1 },
        },
        { upsert: true },
      ),
      // Day-0 activity floor. $setOnInsert so we never clobber a real 'live'
      // record that already exists for this player+day.
      AnalyticsActivity.updateOne(
        { _id: `${pid}:${day}` },
        { $setOnInsert: { playerId: pid, day, ts: new Date(created), source: 'backfill' } },
        { upsert: true },
      ),
    ]);
    if (rp.upsertedCount || rp.modifiedCount) written++;
  }

  const registryCount = await AnalyticsPlayer.countDocuments();
  const backfillActivity = await AnalyticsActivity.countDocuments({ source: 'backfill' });
  console.log(`[backfill] scanned ${scanned}, wrote/updated ${written} first-seen docs; `
    + `analytics_player has ${registryCount}, analytics_activity backfill rows: ${backfillActivity}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[backfill] failed:', err);
  process.exit(1);
});
