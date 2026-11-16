#!/usr/bin/env node
// What the next season change would do, on the live data, writing NOTHING (docs/season-reset.md).
// Runs utils/seasonReset.js with { dryRun: true } for every frontier and prints its report, the
// next season from utils/seasonPlan.js, and every player the Quest for Hope reset would touch.
//   node scripts/season-reset-dry-run.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Frontier = require('../models/frontier');
const Player = require('../models/player');
const seasonReset = require('../utils/seasonReset');
const { nextSeason, seasonLengthMs } = require('../utils/seasonPlan');
const { hopeResetFor } = require('../utils/hopeReset');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  for (const frontier of await Frontier.find({}, { name: 1, seasons: 1 })) {
    const { seasonType: current, seasonNumber } = frontier.seasons || {};
    const next = nextSeason(current, seasonNumber);
    console.log(`\n=== ${frontier.name}: ${current} #${seasonNumber} ends ${frontier.seasons?.endTime?.toISOString()}`);
    console.log(`    next: ${next.seasonType} #${next.seasonNumber}, ${seasonLengthMs(next.seasonNumber) / 864e5} days`);
    const report = await seasonReset(frontier._id, next.seasonType, { dryRun: true });
    console.log(JSON.stringify(report, null, 2));
    for (const p of await Player.find({ frontierId: frontier._id })) {
      const { summary } = hopeResetFor(p.toObject());
      if (summary) console.log(`    ${p.username}: takes ${summary.taken.join(', ') || 'nothing'}; ${summary.questsRemoved} quests; hopeFound ${summary.found}${summary.returned ? '; Oracle back' : ''}`);
    }
  }
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
