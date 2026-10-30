#!/usr/bin/env node
/**
 * Kent and The Shepherd keep their post from 2026-10-28 (STATIONARY_CITIZENS in
 * game-client/src/GameFeatures/NPCs/NPCCitizenBehavior.js). This walks them back to it on every
 * homestead, once.
 *
 *   node scripts/return-stationary-citizens.js          -> dry run, prints the ledger
 *   node scripts/return-stationary-citizens.js --apply  -> writes
 *
 * Their post is homeX/homeY: the tile the citizen loop recorded the first time it ran on that
 * homestead (ensureHome) and leashed them to since. Homesteads were stamped from several template
 * versions, so the current template's tiles are not everyone's start. A record with no homeX/homeY
 * is on a homestead the loop never ran on, so it has not wandered: left as is. A post now covered
 * by a resource is skipped and reported. Moved records also drop their loop fields (state, task,
 * timers); the client clears them anyway.
 *
 * Run it AFTER the client with the stationary rule is deployed: an older client still running on
 * a player's device walks them off again. Run scripts/backup.js first.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const gridResourceManager = require('../utils/GridResourceManager');

const apply = process.argv.includes('--apply');
const TYPES = new Set(['Kent', 'The Shepherd']);
const LOOP_FIELDS = ['citizenState', 'citizenStateUntil', 'citizenStateAt', 'citizenTask', 'citizenResume', 'path'];

const covers = (r, x, y) => {
  const span = r.size || 1; // anchored at the lower-left tile
  return x >= r.x && x < r.x + span && y <= r.y && y > r.y - span;
};

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  await gridResourceManager.initialize();
  const db = mongoose.connection.db;
  const grids = db.collection('grids');
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} on database "${db.databaseName}"`);

  const names = new Map((await db.collection('players').find({}, { projection: { username: 1 } }).toArray())
    .map((p) => [String(p._id), p.username]));
  const all = await grids.find({ gridType: 'homestead' }, { projection: { ownerId: 1, gridCoord: 1, NPCsInGrid: 1, resources: 1 } }).toArray();

  let moved = 0; let atPost = 0; let noPost = 0; let blocked = 0;
  for (const g of all) {
    const records = Object.entries(g.NPCsInGrid || {}).filter(([, n]) => n && TYPES.has(n.type));
    if (!records.length) continue;
    const owner = names.get(String(g.ownerId)) || `owner ${g.ownerId}`;
    const resources = gridResourceManager.getResources(g) || [];
    const set = {}; const unset = {};
    for (const [id, n] of records) {
      const from = n.position || {};
      const label = `  ${owner.padEnd(14)} ${n.type.padEnd(12)} (${Math.round(from.x)},${Math.round(from.y)})`;
      if (!Number.isInteger(n.homeX) || !Number.isInteger(n.homeY)) { console.log(`${label}  no recorded post, left as is`); noPost++; continue; }
      const home = { x: n.homeX, y: n.homeY };
      if (Math.round(from.x) === home.x && Math.round(from.y) === home.y) { console.log(`${label}  already at post`); atPost++; continue; }
      const onIt = resources.find((r) => covers(r, home.x, home.y));
      if (onIt) { console.log(`${label}  post (${home.x},${home.y}) covered by ${onIt.type}, SKIPPED`); blocked++; continue; }
      set[`NPCsInGrid.${id}.position`] = home;
      for (const f of LOOP_FIELDS) if (n[f] !== undefined) unset[`NPCsInGrid.${id}.${f}`] = '';
      console.log(`${label}  -> (${home.x},${home.y})`);
      moved++;
    }
    if (apply && Object.keys(set).length) {
      const update = { $set: { ...set, NPCsInGridLastUpdated: new Date() } };
      if (Object.keys(unset).length) update.$unset = unset;
      await grids.updateOne({ _id: g._id }, update);
    }
  }

  console.log(`${moved} moved, ${atPost} already at post, ${noPost} with no recorded post, ${blocked} skipped (post covered)${apply ? '' : ' (dry run, nothing written)'}.`);
  await mongoose.disconnect();
})().catch(async (err) => { console.error(err); await mongoose.disconnect(); process.exit(1); });
