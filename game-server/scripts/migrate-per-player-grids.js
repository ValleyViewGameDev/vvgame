#!/usr/bin/env node
/**
 * Phase 2 migration: shared world -> per-player towns/valleys/dungeons (docs/phase-2-contract.md).
 *
 *   node scripts/migrate-per-player-grids.js          -> dry run (prints the plan)
 *   node scripts/migrate-per-player-grids.js --apply  -> writes
 *
 * Run scripts/backup.js first. Steps:
 *  1. Stamp gridCoord on every grid referenced by a settlement cell (homesteads + the shared town/valley docs).
 *  2. Mark every non-homestead grid with no owner as a template instance (isTemplate, templateKey).
 *  3. Convert Frontier.dungeons[*].entranceGrids from valley grid ids to gridCoords.
 *  4. Players standing in a shared town get a personal clone of that town (keeps anything they built).
 *  5. Everyone goes home (location -> homestead spawn, HP restored). Players with no homestead get a
 *     personal FTUE cave and start there.
 *  6. Clear playersInGrid on template instances; create the new indexes.
 * The old shared valley docs stay as templates (the editor can still inspect them); delete later if wanted.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Player = require('../models/player');
const Grid = require('../models/grid');
const Settlement = require('../models/settlement');
const Frontier = require('../models/frontier');
const gridResourceManager = require('../utils/GridResourceManager');
const { sendPlayerHome, FTUE_KEY, FTUE_TEMPLATE } = require('../utils/gridResolver');
const { createDungeonGrid } = require('../utils/dungeonUtils');

const apply = process.argv.includes('--apply');
const log = (...a) => console.log(...a);

function templateKeyFor(grid, coord) {
  if (grid.gridType === 'town') return 'town/unknown'; // exact file is not recoverable; copies regenerate from position anyway
  if (/^valley/.test(grid.gridType)) return `valleyFixedCoord/${coord}`; // valid for fixed coords; random ones are still fine as a label
  return null;
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  await gridResourceManager.initialize();
  log(`${apply ? 'APPLYING' : 'DRY RUN'} against "${mongoose.connection.db.databaseName}"`);

  const frontier = await Frontier.findOne({});
  if (!frontier) throw new Error('no frontier');
  // Raw read: the schema now types entranceGrids as Number, so legacy grid-id strings are dropped by Mongoose casting.
  const rawFrontier = await mongoose.connection.db.collection('frontiers').findOne({ _id: frontier._id });
  const rawDungeons = rawFrontier.dungeons || {};
  const settlements = await Settlement.find({ frontierId: frontier._id });

  // 1 + 2: gridCoord stamps and template marks
  const coordByGridId = new Map();
  for (const s of settlements) for (const cell of s.grids.flat()) if (cell.gridId) coordByGridId.set(cell.gridId.toString(), Number(cell.gridCoord));
  log(`settlement cells with grids: ${coordByGridId.size}`);
  let stamped = 0, templated = 0;
  for (const [gridId, coord] of coordByGridId) {
    const grid = await Grid.findById(gridId, 'gridType ownerId gridCoord isTemplate templateKey');
    if (!grid) continue;
    const set = { gridCoord: coord };
    if (grid.gridType !== 'homestead' && !grid.ownerId) { set.isTemplate = true; set.templateKey = templateKeyFor(grid, coord); templated++; }
    stamped++;
    if (apply) await Grid.updateOne({ _id: grid._id }, { $set: set });
  }
  log(`step 1-2: stamped gridCoord on ${stamped} grids, marked ${templated} town/valley docs as templates`);

  // dungeons: the registry's grids become templates too
  const dungeonIds = Object.keys(rawDungeons);
  for (const id of dungeonIds) {
    const entry = rawDungeons[id];
    const key = entry.templateUsed === FTUE_TEMPLATE ? FTUE_KEY : `dungeon:${entry.templateUsed}`;
    if (apply) await Grid.updateOne({ _id: id }, { $set: { isTemplate: true, templateKey: key, gridCoord: null, ownerId: null } });
  }
  log(`step 2b: ${dungeonIds.length} dungeon docs marked as templates`);

  // 3: entranceGrids -> gridCoords
  for (const id of dungeonIds) {
    const entry = rawDungeons[id];
    const before = entry.entranceGrids || [];
    const after = [];
    for (const v of before) {
      if (Number.isFinite(Number(v)) && String(v).length < 12) { after.push(Number(v)); continue; }
      const coord = coordByGridId.get(String(v));
      if (coord != null) after.push(coord); else log(`  ! entrance ${v} for ${entry.templateUsed} has no settlement cell; dropped`);
    }
    log(`step 3: ${entry.templateUsed}: entrances ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
    if (apply) await Frontier.updateOne({ _id: frontier._id }, { $set: { [`dungeons.${id}.entranceGrids`]: after, [`dungeons.${id}.needsReset`]: false } });
  }

  // 4 + 5: players
  const players = await Player.find({});
  for (const player of players) {
    const loc = player.location || {};
    const standingIn = loc.g ? await Grid.findById(loc.g, 'gridType ownerId isTemplate') : null;
    if (standingIn && standingIn.gridType === 'town' && !standingIn.ownerId) {
      const coord = coordByGridId.get(standingIn._id.toString());
      log(`step 4: ${player.username} is in shared town ${standingIn._id} (coord ${coord}); cloning it as their copy`);
      if (apply) {
        const full = await Grid.findById(standingIn._id).lean();
        const { _id, ...rest } = full;
        const clone = new Grid({ ...rest, ownerId: player._id, isTemplate: false, gridCoord: coord, templateKey: full.templateKey || 'town/unknown',
          seasonNumber: frontier.seasons?.seasonNumber ?? null, playersInGrid: new Map() });
        await clone.save({ validateBeforeSave: false });
      }
    }
    if (player.gridId) {
      log(`step 5: ${player.username} -> home (homestead ${player.gridId})`);
      if (apply) await sendPlayerHome(player);
    } else {
      log(`step 5: ${player.username} has no homestead -> personal FTUE cave`);
      if (apply) {
        const cave = await createDungeonGrid(FTUE_TEMPLATE, { frontierId: frontier._id, settlementId: frontier._id, ownerId: player._id, templateKey: FTUE_KEY });
        player.location = { ...(player.location?.toObject?.() || player.location || {}), g: cave._id, s: null, f: frontier._id, gridCoord: null, gtype: 'dungeon', region: null, x: 4, y: 9 };
        await player.save();
      }
    }
  }

  // 6: template hygiene + indexes
  if (apply) {
    const r = await Grid.updateMany({ isTemplate: true }, { $set: { playersInGrid: {} } });
    log(`step 6: cleared playersInGrid on ${r.modifiedCount} templates`);
    await Grid.syncIndexes();
    log('step 6: indexes synced');
  } else {
    log('step 6: (dry run) would clear playersInGrid on templates and sync indexes');
  }

  await mongoose.disconnect();
  log(apply ? 'Done.' : 'Dry run complete. Re-run with --apply to write.');
})().catch((e) => { console.error(e); process.exit(1); });
