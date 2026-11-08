#!/usr/bin/env node
/** Read-only: how many of each deco row stand on live grids, split by grid kind (homestead / town / valley / dungeon / template). */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Grid = require('../models/grid');
const gridResourceManager = require('../utils/GridResourceManager');
(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  await gridResourceManager.initialize();
  const deco = new Set(gridResourceManager.masterResources.filter((r) => r.category === 'deco').map((r) => r.type));
  const counts = {}; const grids = {};
  const all = await Grid.find({}, '_id gridType isTemplate resources');
  for (const g of all) {
    let res; try { res = gridResourceManager.getResources(g); } catch (e) { continue; }
    const kind = (g.isTemplate ? 'template-' : '') + g.gridType;
    for (const r of res) if (deco.has(r.type)) {
      counts[r.type] = counts[r.type] || {}; counts[r.type][kind] = (counts[r.type][kind] || 0) + 1;
      grids[r.type] = grids[r.type] || new Set(); grids[r.type].add(String(g._id));
    }
  }
  for (const t of [...deco].sort()) console.log(`${t.padEnd(28)} ${counts[t] ? JSON.stringify(counts[t]) + ' on ' + grids[t].size + ' grids' : 'NONE'}`);
  await mongoose.disconnect();
})().catch(async (e) => { console.error(e); await mongoose.disconnect(); process.exit(1); });
