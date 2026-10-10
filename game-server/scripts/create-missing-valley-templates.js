#!/usr/bin/env node
/**
 * Make every valley template live in the database (owner, 2026-10-10): each valley cell whose
 * settlement entry has no template instance gets one, built from its valleyFixedCoord file
 * exactly as the editor's World tab "Create grid" does (performGridCreation).
 *
 *   node scripts/create-missing-valley-templates.js          -> dry run, prints the ledger
 *   node scripts/create-missing-valley-templates.js --apply  -> writes (--limit=N for a trial)
 *
 * Differences from /api/create-grid, both for safety against the running game server:
 *   - the settlement cell is pointed at the new grid with one targeted $set on that cell
 *     (and only while it is still empty), instead of saving the whole settlement document;
 *   - a cell whose gridId points at a missing Grid is listed, never touched.
 * Cells that already have a template instance are left alone (no resets).
 * Run scripts/backup.js first.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Grid = require('../models/grid');
const Settlement = require('../models/settlement');
const { performGridCreation } = require('../utils/createGridLogic');

const apply = process.argv.includes('--apply');
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : Infinity; // --limit=N: create only the first N (a trial run)
const LAYOUTS = path.join(__dirname, '../layouts/gridLayouts/valleyFixedCoord');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} on database "${mongoose.connection.db.databaseName}"`);

  const settlements = await Settlement.find({}, { grids: 1, frontierId: 1 }).lean();
  const todo = []; const dangling = []; let present = 0; let noFile = 0;
  for (const s of settlements) {
    (s.grids || []).forEach((row, r) => (row || []).forEach((cell, c) => {
      if (!cell || !/^valley/.test(cell.gridType || '')) return;
      if (cell.gridId) { present++; dangling.push({ s, r, c, cell }); return; }
      if (!fs.existsSync(path.join(LAYOUTS, `${cell.gridCoord}.json`))) { noFile++; return; }
      todo.push({ s, r, c, cell });
    }));
  }
  // Cells that point at a grid: confirm the grid exists (listed, never changed)
  const ids = dangling.map(d => d.cell.gridId);
  const found = new Set((await Grid.find({ _id: { $in: ids } }, { _id: 1 }).lean()).map(g => String(g._id)));
  const missing = dangling.filter(d => !found.has(String(d.cell.gridId)));
  for (const d of missing) console.log(`  ! cell ${d.cell.gridCoord} points at missing grid ${d.cell.gridId} (left as is)`);

  console.log(`valley cells: ${present} with a template instance, ${todo.length} to create, ${noFile} without a layout file`);
  if (!apply) { console.log('dry run, nothing written.'); await mongoose.disconnect(); return; }

  let made = 0; let skipped = 0; const failed = [];
  for (const { s, r, c, cell } of todo.slice(0, limit)) {
    try {
      // perPlayer: true makes the grid without saving the whole settlement; it is then marked
      // as the template instance and the cell is pointed at it below.
      const { gridId } = await performGridCreation({
        gridCoord: cell.gridCoord, gridType: cell.gridType, settlementId: s._id, frontierId: s.frontierId, perPlayer: true,
      });
      await Grid.updateOne({ _id: gridId }, { $set: { isTemplate: true } });
      const res = await Settlement.updateOne(
        { _id: s._id, [`grids.${r}.${c}.gridCoord`]: cell.gridCoord, [`grids.${r}.${c}.gridId`]: { $in: [null] } },
        { $set: { [`grids.${r}.${c}.gridId`]: gridId, [`grids.${r}.${c}.available`]: false } }
      );
      if (res.modifiedCount !== 1) {
        // the cell changed under us: drop the grid we just made
        await Grid.deleteOne({ _id: gridId });
        skipped++; console.log(`  - ${cell.gridCoord}: cell changed meanwhile, skipped`);
      } else {
        made++;
        if (made % 100 === 0) console.log(`  ${made} / ${todo.length} created`);
      }
    } catch (err) {
      failed.push(cell.gridCoord); console.log(`  x ${cell.gridCoord}: ${err.message}`);
    }
  }
  console.log(`${made} created, ${skipped} skipped, ${failed.length} failed${failed.length ? `: ${failed.join(', ')}` : ''}.`);
  await mongoose.disconnect();
})().catch(async (err) => { console.error(err); await mongoose.disconnect(); process.exit(1); });
