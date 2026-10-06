#!/usr/bin/env node
// One-off: melt the snow on every grid as if Winter had ended (the season was set back to Fall
// by hand on 2026-10-06, so the Spring melt in utils/seasonReset.js never ran). Converts snow
// 'o' tiles to grass 'g' on every non-dungeon grid: homesteads, template instances and the
// per-player town/valley copies that were snowed by the lazy catch-up. Dungeons never have snow.
//   node scripts/melt-snow.js            dry run (counts only)
//   node scripts/melt-snow.js --apply
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Grid = require('../models/grid');
const { applySeasonTiles } = require('../utils/seasonTiles');

(async () => {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(process.env.MONGODB_URI);
  const cursor = Grid.find({ gridType: { $ne: 'dungeon' } }, { tiles: 1, gridType: 1, isTemplate: 1, ownerId: 1 }).cursor();
  let grids = 0, snowy = 0, tiles = 0;
  const byType = {};
  for await (const grid of cursor) {
    grids++;
    const changed = applySeasonTiles(grid, 'spring'); // 'o' -> 'g', mutates grid.tiles when needed
    if (!changed) continue;
    snowy++; tiles += changed;
    byType[grid.gridType] = (byType[grid.gridType] || 0) + 1;
    if (apply) await Grid.updateOne({ _id: grid._id }, { $set: { tiles: grid.tiles } });
  }
  console.log(`${grids} grids scanned; ${snowy} with snow (${tiles} tiles)`, byType);
  console.log(apply ? 'Melted.' : 'Dry run. Re-run with --apply.');
  await mongoose.disconnect();
})().catch((err) => { console.error(err); process.exit(1); });
