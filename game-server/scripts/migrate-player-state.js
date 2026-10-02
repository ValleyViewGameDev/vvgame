#!/usr/bin/env node
/**
 * Phase 3 slice 1: seed Player.hp / Player.maxhp (docs/phase-3-contract.md §1).
 *
 *   node scripts/migrate-player-state.js          -> dry run
 *   node scripts/migrate-player-state.js --apply  -> writes
 *
 * For every player: take hp/maxhp from the PC record on the grid they are standing in (the old
 * playersInGrid map) if one exists, else maxhp = baseMaxhp and hp = baseMaxhp. Players that already
 * have hp/maxhp set are left alone (idempotent). Does NOT remove playersInGrid (next slice).
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Player = require('../models/player');

const apply = process.argv.includes('--apply');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  const grids = mongoose.connection.db.collection('grids');
  console.log(`${apply ? 'APPLYING' : 'DRY RUN'} against "${mongoose.connection.db.databaseName}"`);
  const players = await Player.find({});
  let seeded = 0;
  for (const p of players) {
    if (p.hp != null && p.maxhp != null) { console.log(`${p.username.padEnd(12)} already hp=${p.hp}/${p.maxhp}`); continue; }
    let hp = null, maxhp = null, source = 'baseMaxhp';
    if (p.location?.g) {
      const grid = await grids.findOne({ _id: new mongoose.Types.ObjectId(String(p.location.g)) }, { projection: { [`playersInGrid.${p._id}`]: 1 } });
      const rec = grid?.playersInGrid?.[String(p._id)];
      if (rec && Number.isFinite(rec.maxhp)) { hp = rec.hp; maxhp = rec.maxhp; source = 'grid record'; }
    }
    if (maxhp == null) { maxhp = p.baseMaxhp || 25; hp = maxhp; }
    hp = Math.max(0, Math.min(Number.isFinite(hp) ? hp : maxhp, maxhp));
    console.log(`${p.username.padEnd(12)} hp=${hp}/${maxhp}  (${source})`);
    if (apply) await Player.updateOne({ _id: p._id }, { $set: { hp, maxhp } });
    seeded++;
  }
  console.log(`${apply ? 'Seeded' : 'Would seed'} ${seeded} players.`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
