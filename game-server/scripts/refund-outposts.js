#!/usr/bin/env node
/**
 * Phase 0: the Outpost feature is removed. This returns what players had in outpost stalls and
 * strips the Outpost stations from grids.
 *
 *   node scripts/refund-outposts.js          -> dry run, prints the ledger
 *   node scripts/refund-outposts.js --apply  -> writes
 *
 * For every grid with outpostTradeStall slots:
 *   - slot bought (boughtBy set): the seller is paid boughtFor Money (they never collected).
 *   - slot unsold: the seller gets `amount` x `resource` back in their warehouse inventory.
 * Then the outpostTradeStall field is unset, and every Outpost resource is removed from grid resources.
 * Run scripts/backup.js first.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Player = require('../models/player');
const Grid = require('../models/grid');
const gridResourceManager = require('../utils/GridResourceManager');

const apply = process.argv.includes('--apply');

async function giveToWarehouse(playerId, item, qty, ledger) {
  const player = await Player.findById(playerId);
  if (!player) { ledger.push(`  ! seller ${playerId} not found; ${qty} ${item} lost`); return; }
  const entry = player.inventory.find((i) => i.type === item);
  if (entry) entry.quantity += qty; else player.inventory.push({ type: item, quantity: qty });
  ledger.push(`  ${player.username.padEnd(16)} +${qty} ${item}`);
  if (apply) await player.save();
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  await gridResourceManager.initialize();
  console.log(`${apply ? 'APPLYING' : 'DRY RUN'} against "${mongoose.connection.db.databaseName}"`);
  const ledger = [];

  // 1. Stall contents (raw collection read: the field is no longer in the schema)
  const raw = mongoose.connection.db.collection('grids');
  const stalls = await raw.find({ outpostTradeStall: { $exists: true } }, { projection: { outpostTradeStall: 1 } }).toArray();
  for (const g of stalls) {
    for (const slot of g.outpostTradeStall || []) {
      if (!slot.resource || !slot.sellerId) continue;
      if (slot.boughtBy) await giveToWarehouse(slot.sellerId, 'Money', slot.boughtFor || 0, ledger);
      else await giveToWarehouse(slot.sellerId, slot.resource, slot.amount || 0, ledger);
    }
  }
  if (apply) await raw.updateMany({ outpostTradeStall: { $exists: true } }, { $unset: { outpostTradeStall: '' } });
  console.log(`Stall refunds (${stalls.length} grids):`); ledger.forEach((l) => console.log(l));

  // 2. Remove Outpost stations from grid resources
  let removed = 0;
  const grids = await Grid.find({ gridType: { $ne: 'homestead' } }, '_id resources');
  for (const grid of grids) {
    const resources = gridResourceManager.getResources(grid);
    const keep = resources.filter((r) => r.type !== 'Outpost' && r.type !== 'UNKNOWN_T2');
    if (keep.length !== resources.length) {
      removed += resources.length - keep.length;
      if (apply) { grid.resources = gridResourceManager.encodeResourcesV2(keep); await grid.save({ validateBeforeSave: false }); }
    }
  }
  console.log(`Outpost stations removed from grids: ${removed}`);
  await mongoose.disconnect();
  console.log(apply ? 'Done.' : 'Dry run complete. Re-run with --apply to write.');
})().catch((e) => { console.error(e); process.exit(1); });
