#!/usr/bin/env node
/**
 * Coffee grows only in Strathmoore (owner, 2026-11-05; resources.json Coffee Plant growregion,
 * docs/tuning.md 4m). Duke Angelo's grid (1014204, Angelo's Keep) had a bed of 27 Coffee
 * Cherries; the layout file loses them in the same change, and this clears them from the live
 * game: the template instance and every player's copy of that cell. The dirt bed stays.
 *
 *   node scripts/remove-angelo-coffee.js          -> dry run, prints the ledger
 *   node scripts/remove-angelo-coffee.js --apply  -> writes
 *
 * It also lists (never touches) Coffee Cherries and Coffee Plants standing on any OTHER grid, so
 * a stray one outside Strathmoore is visible. Safe to run before or after the deploy, and twice.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Grid = require('../models/grid');
const Player = require('../models/player');
const gridResourceManager = require('../utils/GridResourceManager');

const apply = process.argv.includes('--apply');
const ANGELO = 1014204;
const COFFEE = new Set(['Coffee Cherry', 'Coffee Plant']);

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  await gridResourceManager.initialize();
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} on database "${mongoose.connection.db.databaseName}"`);

  let removed = 0; let gridsChanged = 0; const elsewhere = [];
  const grids = await Grid.find({ gridType: { $ne: 'dungeon' } }, '_id gridType gridCoord ownerId isTemplate region resources');
  for (const grid of grids) {
    const resources = gridResourceManager.getResources(grid);
    const coffee = resources.filter((r) => COFFEE.has(r.type));
    if (!coffee.length) continue;
    const owner = grid.ownerId ? (await Player.findById(grid.ownerId, 'username'))?.username || String(grid.ownerId) : '-';
    const label = `${grid.gridType}${grid.isTemplate ? ' TEMPLATE' : ''} @${grid.gridCoord} (${grid.region || 'no region'}) owner ${owner}`;
    if (Number(grid.gridCoord) !== ANGELO) { elsewhere.push(`  ${label}: ${coffee.length} coffee (left alone)`); continue; }
    console.log(`  ${label}: ${coffee.length} removed`);
    removed += coffee.length; gridsChanged++;
    if (apply) {
      grid.resources = gridResourceManager.encodeResourcesV2(resources.filter((r) => !COFFEE.has(r.type)));
      await grid.save({ validateBeforeSave: false });
    }
  }
  if (elsewhere.length) { console.log('Coffee on other grids:'); elsewhere.forEach((l) => console.log(l)); }
  console.log(`${removed} coffee removed from ${gridsChanged} grid(s) at ${ANGELO}${apply ? '' : ' (dry run, nothing written)'}.`);
  await mongoose.disconnect();
})().catch(async (err) => { console.error(err); await mongoose.disconnect(); process.exit(1); });
