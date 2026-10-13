#!/usr/bin/env node
/**
 * The Animal Stall is legacy (owner, 2026-10-13): farm animals have been ready to collect where
 * they graze since SKIP_STALL_AFTER_GRAZING, so the building did nothing. This clears it from
 * the live game before its resources.json row goes.
 *
 *   node scripts/remove-animal-stalls.js          -> dry run, prints the ledger
 *   node scripts/remove-animal-stalls.js --apply  -> writes
 *
 * For every grid (templates, player copies, homesteads):
 *   - every Animal Stall resource is removed;
 *   - a farm animal left in the old 'stall' state (walking to a stall) becomes 'processing'
 *     (ready to collect), with grazeEnd set to now if it had none.
 * The owner of each HOMESTEAD that had stalls gets their build cost back by mailbox (message
 * 1003): the stall's ingredients (25 Money + 20 Wood) per stall removed. Stalls on valley grids
 * belong to templates nobody built, so nothing is refunded for them.
 *
 * Must run while resources.json still has the Animal Stall row (its layoutkey decodes the
 * stored resources). Run scripts/backup.js first.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Grid = require('../models/grid');
const Player = require('../models/player');
const gridResourceManager = require('../utils/GridResourceManager');
const sendMailboxMessage = require('../utils/messageUtils');
const masterResources = require('../tuning/resources.json');

const apply = process.argv.includes('--apply');
const STALL = 'Animal Stall';
const REFUND_MESSAGE_ID = 1003;

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  await gridResourceManager.initialize();
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} on database "${mongoose.connection.db.databaseName}"`);

  const stallDef = masterResources.find((r) => r.type === STALL);
  if (!stallDef) throw new Error('Animal Stall is no longer in resources.json: this script must run before the row is removed.');
  const unitCost = [];
  for (let i = 1; i <= 4; i++) {
    if (stallDef[`ingredient${i}`]) unitCost.push({ item: stallDef[`ingredient${i}`], qty: stallDef[`ingredient${i}qty`] || 0 });
  }
  console.log(`Refund per stall: ${unitCost.map((c) => `${c.qty} ${c.item}`).join(' + ')}`);

  let removed = 0; let npcsFixed = 0; const refunds = [];
  const grids = await Grid.find({}, '_id gridType gridCoord ownerId isTemplate resources NPCsInGrid');
  for (const grid of grids) {
    const resources = gridResourceManager.getResources(grid);
    const keep = resources.filter((r) => r.type !== STALL);
    const count = resources.length - keep.length;

    const stuck = [];
    for (const [id, npc] of (grid.NPCsInGrid || new Map()).entries()) {
      if (npc && npc.state === 'stall') stuck.push(id);
    }
    if (!count && !stuck.length) continue;

    const label = `${grid.gridType}${grid.isTemplate ? ' TEMPLATE' : ''} ${grid._id} @${grid.gridCoord}`;
    if (count) { console.log(`  ${label}: ${count} Animal Stall(s) removed`); removed += count; }
    if (stuck.length) { console.log(`  ${label}: ${stuck.length} animal(s) 'stall' -> 'processing'`); npcsFixed += stuck.length; }

    if (count && grid.gridType === 'homestead' && grid.ownerId) {
      refunds.push({ ownerId: grid.ownerId, count, rewards: unitCost.map((c) => ({ item: c.item, qty: c.qty * count })) });
    }

    if (apply) {
      if (count) grid.resources = gridResourceManager.encodeResourcesV2(keep);
      for (const id of stuck) {
        const npc = grid.NPCsInGrid.get(id);
        npc.state = 'processing';
        if (!npc.grazeEnd) npc.grazeEnd = Date.now();
        grid.NPCsInGrid.set(id, npc);
      }
      if (stuck.length) { grid.markModified('NPCsInGrid'); grid.NPCsInGridLastUpdated = Date.now(); }
      await grid.save({ validateBeforeSave: false });
    }
  }

  console.log('Refunds (mailbox message 1003):');
  for (const r of refunds) {
    const player = await Player.findById(r.ownerId, 'username');
    console.log(`  ${(player?.username || String(r.ownerId)).padEnd(16)} ${r.count} stalls -> ${r.rewards.map((x) => `${x.qty} ${x.item}`).join(' + ')}`);
    if (apply && player) await sendMailboxMessage(player._id, REFUND_MESSAGE_ID, r.rewards);
  }

  console.log(`${removed} Animal Stalls removed, ${npcsFixed} animals moved to processing, ${refunds.length} owners refunded${apply ? '' : ' (dry run, nothing written)'}.`);
  await mongoose.disconnect();
})().catch(async (err) => { console.error(err); await mongoose.disconnect(); process.exit(1); });
