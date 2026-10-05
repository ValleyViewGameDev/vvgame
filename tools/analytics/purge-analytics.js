#!/usr/bin/env node
// Surgically remove analytics rows for specific playerIds.
//
// The analytics store is durable BY DESIGN: deleted players keep counting in
// DAU/retention. This script is the only sanctioned way to remove an entry,
// for cleaning up throwaway dev/test accounts. It is targeted (you name the
// ids) so it never touches real deleted users. Read docs/analytics.md
// (Purges & data cleanup) before running it; ALWAYS --dry first.
//
//   node tools/analytics/purge-analytics.js --list-orphans
//       List analytics playerIds with NO surviving players-collection doc
//       (deleted accounts), with last-known username + first-seen + the
//       span/number of active days, so you can spot test churn and copy ids.
//
//   node tools/analytics/purge-analytics.js --player <id> [--player <id> ...] [--dry]
//       Delete analytics_activity + analytics_player rows for the given
//       playerId(s). --dry reports what WOULD be deleted without writing.
//       The purchases ledger is NOT touched (revenue history stays intact).
//
//   node tools/analytics/purge-analytics.js --orphans [--dry]
//       Delete analytics rows for EVERY orphaned account in one pass. Use with
//       care: legitimately-deleted real users are orphans too. Prefer --player.
//
// Connects to whatever MONGODB_URI game-server/.env points at (prod Atlas).

const path = require('path');

const GAME_SERVER = path.join(__dirname, '..', '..', 'game-server');
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
const AnalyticsActivity = require(path.join(GAME_SERVER, 'models', 'analyticsActivity'));
const AnalyticsPlayer = require(path.join(GAME_SERVER, 'models', 'analyticsPlayer'));

function parseArgs(argv) {
  const args = { players: [], list: false, orphans: false, dry: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--player') args.players.push(argv[++i]);
    else if (argv[i] === '--list-orphans') args.list = true;
    else if (argv[i] === '--orphans') args.orphans = true;
    else if (argv[i] === '--dry') args.dry = true;
    else if (argv[i] === '-h' || argv[i] === '--help') { printHelp(); process.exit(0); }
    else { console.error(`Unknown arg: ${argv[i]}`); printHelp(); process.exit(1); }
  }
  return args;
}
function printHelp() {
  console.log(`Purge analytics rows for specific playerIds.
  --list-orphans              list analytics ids whose player no longer exists
  --player <id> [--player..]  delete analytics rows for these playerId(s)
  --orphans                   delete analytics rows for ALL orphaned accounts
  --dry                       preview deletes without writing`);
}
const HEX24 = /^[0-9a-fA-F]{24}$/;
const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));

// analytics_player docs whose player no longer exists in the players collection.
// Only valid-hex analytics ids are cast for the existence query; a non-hex
// analytics _id (synthetic junk) cannot match any player and is therefore,
// correctly, always an orphan. Without this guard one junk row would crash the
// whole listing.
async function getOrphans() {
  const aplayers = await AnalyticsPlayer.find({}, { firstSeenDay: 1, username: 1 }).lean();
  const hexIds = aplayers.filter((a) => HEX24.test(String(a._id))).map((a) => toObjectId(a._id));
  const existing = await Player.find({ _id: { $in: hexIds } }, { _id: 1 }).lean();
  const existingSet = new Set(existing.map((p) => String(p._id)));
  return aplayers.filter((a) => !existingSet.has(String(a._id)));
}

async function listOrphans() {
  const orphans = await getOrphans();
  if (!orphans.length) { console.log('No orphaned analytics players (every analytics id still has a players doc).'); return; }
  console.log(`Orphaned analytics players (deleted accounts): ${orphans.length}\n`);
  for (const o of orphans) {
    const days = await AnalyticsActivity.find({ playerId: o._id }, { day: 1, _id: 0 }).sort({ day: 1 }).lean();
    const span = days.length ? `${days[0].day}..${days[days.length - 1].day}` : '-';
    console.log(`  ${o._id}  username=${o.username || '<unknown>'}  firstSeen=${o.firstSeenDay}  activeDays=${days.length}  span=${span}`);
  }
  console.log('\nTo remove: node tools/analytics/purge-analytics.js --player <id> [--player <id> ...]');
}

async function purge(ids, dry) {
  for (const id of ids) {
    const actCount = await AnalyticsActivity.countDocuments({ playerId: id });
    const plCount = await AnalyticsPlayer.countDocuments({ _id: id });
    if (dry) {
      console.log(`[dry] ${id}: would delete ${actCount} activity row(s) + ${plCount} player row(s)`);
      continue;
    }
    const a = await AnalyticsActivity.deleteMany({ playerId: id });
    const p = await AnalyticsPlayer.deleteOne({ _id: id });
    console.log(`${id}: deleted ${a.deletedCount} activity row(s) + ${p.deletedCount} player row(s)`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.list && !args.orphans && !args.players.length) { printHelp(); process.exit(1); }
  await connectMongo();
  if (args.list) await listOrphans();
  let ids = [...args.players];
  if (args.orphans) {
    const orphans = await getOrphans();
    console.log(`--orphans: ${orphans.length} orphaned account(s) targeted`);
    ids = ids.concat(orphans.map((o) => o._id));
  }
  if (ids.length) await purge(ids, args.dry);
  await mongoose.disconnect();
}

main().catch((err) => { console.error('[purge] failed:', err); process.exit(1); });
