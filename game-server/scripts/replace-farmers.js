#!/usr/bin/env node
/**
 * The Farmer worker is legacy content (owner, 2026-10-09): only the Farm Hand remains. This
 * clears every Farmer NPC out of the grids so the Farmer row can leave resources.json.
 *
 *   node scripts/replace-farmers.js          -> dry run, prints the ledger
 *   node scripts/replace-farmers.js --apply  -> writes
 *
 * For every grid whose NPCsInGrid holds a Farmer:
 *   - no Farm Hand on that grid: the Farmer BECOMES the Farm Hand (same id and tile; its
 *     citizen loop fields are cleared so the Farm Hand starts its own loop and finds its slot);
 *   - a Farm Hand is already there: the Farmer is removed.
 * It also lists (never changes) players carrying a "Farmer" item, so nothing is left behind.
 * Run scripts/backup.js first.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

const apply = process.argv.includes('--apply');
const CITIZEN_FIELDS = ['citizenState', 'citizenStateUntil', 'citizenTask', 'homeX', 'homeY'];

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  const grids = db.collection('grids');
  const players = db.collection('players');
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} on database "${db.databaseName}"`);

  const all = await grids.find({}, { projection: { gridType: 1, ownerId: 1, gridCoord: 1, isTemplate: 1, NPCsInGrid: 1 } }).toArray();
  let replaced = 0; let removed = 0;
  for (const g of all) {
    const npcs = g.NPCsInGrid || {};
    const farmers = Object.entries(npcs).filter(([, n]) => n && n.type === 'Farmer');
    if (!farmers.length) continue;
    const hasFarmHand = Object.values(npcs).some((n) => n && n.type === 'Farm Hand');

    let owner = '';
    if (g.ownerId) {
      const p = await players.findOne({ _id: g.ownerId }, { projection: { username: 1, lastActive: 1, updatedAt: 1 } })
        || await players.findOne({ playerId: String(g.ownerId) }, { projection: { username: 1, lastActive: 1, updatedAt: 1 } });
      const seen = p?.lastActive || p?.updatedAt;
      owner = p ? `${p.username}${seen ? ` (last seen ${new Date(seen).toISOString().slice(0, 10)})` : ''}` : `owner ${g.ownerId} (not found)`;
    }
    const label = `${g.gridType}${g.isTemplate ? ' TEMPLATE' : ''} ${g._id}${g.gridCoord != null ? ` @${g.gridCoord}` : ''} ${owner}`;

    const set = {}; const unset = {};
    farmers.forEach(([id], i) => {
      if (!hasFarmHand && i === 0) {
        set[`NPCsInGrid.${id}.type`] = 'Farm Hand';
        set[`NPCsInGrid.${id}.state`] = 'idle';
        for (const f of CITIZEN_FIELDS) unset[`NPCsInGrid.${id}.${f}`] = '';
        console.log(`  ${label}: Farmer ${id} -> Farm Hand`);
        replaced++;
      } else {
        unset[`NPCsInGrid.${id}`] = '';
        console.log(`  ${label}: Farmer ${id} removed (${hasFarmHand ? 'already has a Farm Hand' : 'second Farmer'})`);
        removed++;
      }
    });
    if (apply) {
      const update = {};
      if (Object.keys(set).length) update.$set = set;
      if (Object.keys(unset).length) update.$unset = unset;
      await grids.updateOne({ _id: g._id }, update);
    }
  }

  const carriers = await players.find(
    { $or: [{ 'inventory.type': 'Farmer' }, { 'backpack.type': 'Farmer' }, { 'skills.type': 'Farmer' }] },
    { projection: { username: 1 } }
  ).toArray();
  for (const p of carriers) console.log(`  ! player ${p.username} carries a "Farmer" item (left as is)`);

  console.log(`${replaced} replaced, ${removed} removed${apply ? '' : ' (dry run, nothing written)'}.`);
  await mongoose.disconnect();
})().catch(async (err) => { console.error(err); await mongoose.disconnect(); process.exit(1); });
