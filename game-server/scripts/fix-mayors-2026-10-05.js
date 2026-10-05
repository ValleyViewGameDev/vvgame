#!/usr/bin/env node
// One-off (2026-10-05): after every player was merged into Settlement_0_1 the settlement had
// several players carrying role "Mayor" from their old settlements. Make moehong the one Mayor of
// Settlement_0_1: everyone else there becomes Citizen, the settlement's roles array holds only
// moehong, and his stale Mayor entry on Settlement_0_0 is removed.
//   node scripts/fix-mayors-2026-10-05.js            dry run
//   node scripts/fix-mayors-2026-10-05.js --apply
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Player = require('../models/player');
const Settlement = require('../models/settlement');

const MAYOR = 'moehong';

(async () => {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(process.env.MONGODB_URI);
  const mayor = await Player.findOne({ username: MAYOR }, { username: 1, role: 1, settlementId: 1 }).lean();
  if (!mayor) throw new Error(`${MAYOR} not found`);
  const sid = mayor.settlementId;
  const others = await Player.find({ role: 'Mayor', settlementId: sid, _id: { $ne: mayor._id } }, { username: 1 }).lean();
  console.log(`settlement ${sid}: demote ${others.map((p) => p.username).join(', ') || '(nobody)'}; ${MAYOR} ${mayor.role === 'Mayor' ? 'already' : 'becomes'} Mayor`);
  const stale = await Settlement.find({ _id: { $ne: sid }, 'roles.playerId': String(mayor._id) }, { name: 1 }).lean();
  console.log(`stale Mayor entries for ${MAYOR} on: ${stale.map((s) => s.name).join(', ') || '(none)'}`);
  const home = await Settlement.findById(sid, { name: 1, roles: 1 }).lean();
  console.log(`${home.name} roles now: ${JSON.stringify(home.roles)}`);
  if (!apply) { console.log('Dry run. Re-run with --apply.'); await mongoose.disconnect(); return; }
  await Player.updateMany({ _id: { $in: others.map((p) => p._id) } }, { $set: { role: 'Citizen' } });
  await Player.updateOne({ _id: mayor._id }, { $set: { role: 'Mayor' } });
  await Settlement.updateOne({ _id: sid }, { $set: { roles: [{ roleName: 'Mayor', playerId: String(mayor._id) }] } });
  for (const s of stale) await Settlement.updateOne({ _id: s._id }, { $pull: { roles: { playerId: String(mayor._id) } } });
  const after = await Settlement.findById(sid, { roles: 1 }).lean();
  console.log(`Applied. ${home.name} roles: ${JSON.stringify(after.roles)}; mayors in settlement: ${(await Player.find({ role: 'Mayor', settlementId: sid }, { username: 1 }).lean()).map((p) => p.username).join(', ')}`);
  await mongoose.disconnect();
})().catch((err) => { console.error(err); process.exit(1); });
