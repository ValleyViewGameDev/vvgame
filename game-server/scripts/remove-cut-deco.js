#!/usr/bin/env node
/**
 * Deco pass A (docs/art/deco-pass-plan.md, owner greenlight 2026-11-08): the nine deco rows cut
 * from resources.json (Toilet, Teddy Bear, Slide, White Dove, Green / Blue / Orange / Sand Wall,
 * Holiday Tree) are removed from every live grid and template, and a homestead's owner is
 * refunded the Gold each one cost (the row's ingredient1qty at the time of the cut, listed here
 * since the rows are gone). Run BEFORE the deploy that drops the rows, so no grid holds an
 * unknown type.
 *   node scripts/remove-cut-deco.js          -> dry run, prints the ledger
 *   node scripts/remove-cut-deco.js --apply  -> writes
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Grid = require('../models/grid');
const Player = require('../models/player');
const gridResourceManager = require('../utils/GridResourceManager');
const apply = process.argv.includes('--apply');
// by layoutkey: the rows are gone from resources.json, so the decoder gives these pieces the
// placeholder type UNKNOWN_<layoutkey>; the value is the Gold each cost
const CUT_KEYS = { To: ['Toilet', 1000], TB: ['Teddy Bear', 7500], Sl: ['Slide', 15000], dov: ['White Dove', 0], Gw: ['Green Wall', 20], Lw: ['Blue Wall', 20], Ow: ['Orange Wall', 20], Sw: ['Sand Wall', 20], Xm: ['Holiday Tree', 5000] };
const CUT = {}; for (const [k, [name, gold]] of Object.entries(CUT_KEYS)) { CUT[name] = gold; CUT[`UNKNOWN_${k}`] = gold; }
const nameOf = (r) => (r.type.startsWith('UNKNOWN_') ? CUT_KEYS[r.type.slice(8)]?.[0] || r.type : r.type);
(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  await gridResourceManager.initialize();
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} on database "${mongoose.connection.db.databaseName}"`);
  const refunds = {}; let removed = 0, gridsChanged = 0;
  const grids = await Grid.find({}, '_id gridType gridCoord ownerId isTemplate resources');
  for (const grid of grids) {
    let res; try { res = gridResourceManager.getResources(grid); } catch (e) { continue; }
    const gone = res.filter((r) => r.type in CUT);
    if (!gone.length) continue;
    const owner = grid.ownerId ? await Player.findById(grid.ownerId, 'username inventory') : null;
    const tally = {}; for (const r of gone) tally[nameOf(r)] = (tally[nameOf(r)] || 0) + 1;
    console.log(`  ${grid.gridType}${grid.isTemplate ? ' TEMPLATE' : ''} @${grid.gridCoord} owner ${owner?.username || '-'}: ${JSON.stringify(tally)}`);
    removed += gone.length; gridsChanged++;
    if (grid.gridType === 'homestead' && owner) {
      const gold = gone.reduce((a, r) => a + (CUT[r.type] || 0), 0);
      if (gold) refunds[owner.username] = (refunds[owner.username] || 0) + gold;
      if (apply && gold) {
        const money = owner.inventory.find((i) => i.type === 'Money');
        if (money) money.quantity += gold; else owner.inventory.push({ type: 'Money', quantity: gold });
        await owner.save({ validateBeforeSave: false });
      }
    }
    if (apply) {
      grid.resources = gridResourceManager.encodeResourcesV2(res.filter((r) => !(r.type in CUT)));
      await grid.save({ validateBeforeSave: false });
    }
  }
  console.log(`${removed} pieces on ${gridsChanged} grids; refunds: ${JSON.stringify(refunds)}${apply ? '' : ' (dry run, nothing written)'}`);
  await mongoose.disconnect();
})().catch(async (e) => { console.error(e); await mongoose.disconnect(); process.exit(1); });
