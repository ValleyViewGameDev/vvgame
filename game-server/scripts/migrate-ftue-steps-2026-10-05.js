#!/usr/bin/env node
// One-off: tuning/FTUEsteps.json was renumbered on 2026-10-05 (gift + avatar beats inserted after
// the first homestead visit; open-loop ending). Players still in the FTUE keep their place:
//   old 5 -> 7 (sell to Kent), 6 -> 8, 7 -> 9, 8 -> 10, 9 -> 11, 10 -> 12, 11 -> 13, 12 -> 14,
//   old 13/14 (mailbox beats at the end) -> 15 (open-loop ending). Steps 1-4 are unchanged.
//   node scripts/migrate-ftue-steps-2026-10-05.js            dry run
//   node scripts/migrate-ftue-steps-2026-10-05.js --apply
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Player = require('../models/player');

const MAP = { 5: 7, 6: 8, 7: 9, 8: 10, 9: 11, 10: 12, 11: 13, 12: 14, 13: 15, 14: 15 };

(async () => {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(process.env.MONGODB_URI);
  const players = await Player.find({ firsttimeuser: true, ftuestep: { $in: Object.keys(MAP).map(Number) }, ftue_renumbered_2026_10_05: { $ne: true } }, { username: 1, ftuestep: 1 }).lean();
  for (const p of players) {
    console.log(`${p.username}: ${p.ftuestep} -> ${MAP[p.ftuestep]}`);
    if (apply) await Player.updateOne({ _id: p._id }, { $set: { ftuestep: MAP[p.ftuestep], ftue_renumbered_2026_10_05: true } }, { strict: false });
  }
  console.log(apply ? `Migrated ${players.length}.` : `${players.length} would change. Re-run with --apply.`);
  await mongoose.disconnect();
})().catch((err) => { console.error(err); process.exit(1); });
