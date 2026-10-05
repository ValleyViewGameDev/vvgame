#!/usr/bin/env node
// One-off: tuning/FTUEsteps.json was renumbered on 2026-10-05 (Queen Gertrude's story + deed push
// at the start; gift + avatar beats after the first homestead visit; open-loop ending). Players
// still in the FTUE keep their place (old numbering -> new):
//   1 -> 1, 2 -> 3 (move to Elbow), 3 -> 4, 4 -> 5, 5 -> 8 (sell to Kent), 6 -> 9, 7 -> 10, 8 -> 11,
//   9 -> 12, 10 -> 13, 11 -> 14, 12 -> 15, old 13/14 (mailbox beats at the end) -> 16 (open loop).
//   node scripts/migrate-ftue-steps-2026-10-05.js            dry run
//   node scripts/migrate-ftue-steps-2026-10-05.js --apply
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Player = require('../models/player');

const MAP = { 2: 3, 3: 4, 4: 5, 5: 8, 6: 9, 7: 10, 8: 11, 9: 12, 10: 13, 11: 14, 12: 15, 13: 16, 14: 16 };

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
