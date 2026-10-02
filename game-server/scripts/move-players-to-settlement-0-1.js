#!/usr/bin/env node
/**
 * Move every homestead into settlement (0,1) and close the four corner settlements
 * (docs/phase-3-contract.md §2).
 *
 *   node scripts/move-players-to-settlement-0-1.js          -> dry run
 *   node scripts/move-players-to-settlement-0-1.js --apply  -> writes
 *
 * Per player not already in (0,1): claim the first available homestead cell in (0,1), move the
 * homestead Grid's pointer (source cell freed, target cell claimed), update grid.settlementId /
 * grid.gridCoord, player.settlementId / homesteadGridCoord / location (when standing at home),
 * both population counters, delete the player's town copies from the old settlement, and rewrite
 * dungeon registry entrances that pointed at the old homestead coord. Then mark the corner
 * settlements unavailable in Frontier.settlements and every homestead cell in them unavailable.
 * Run scripts/backup.js first.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Player = require('../models/player');
const Grid = require('../models/grid');
const Settlement = require('../models/settlement');
const Frontier = require('../models/frontier');

const apply = process.argv.includes('--apply');
const TARGET = { row: 0, col: 1 };
const CORNERS = [[0, 0], [0, 7], [7, 0], [7, 7]];

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  console.log(`${apply ? 'APPLYING' : 'DRY RUN'} against "${mongoose.connection.db.databaseName}"`);
  const frontier = await Frontier.findOne({});
  const targetEntry = frontier.settlements[TARGET.row][TARGET.col];
  const target = await Settlement.findById(targetEntry.settlementId);
  const settlementById = new Map();
  const getSettlement = async (id) => { const k = String(id); if (!settlementById.has(k)) settlementById.set(k, await Settlement.findById(id)); return settlementById.get(k); };
  settlementById.set(String(target._id), target);

  const freeCells = () => target.grids.flat().filter((c) => c.gridType === 'homestead' && c.available && !c.gridId);
  console.log(`target ${target.name}: ${freeCells().length} free homestead cells`);

  const players = await Player.find({ gridId: { $ne: null } });
  const movedCoords = []; // [oldCoord, newCoord]
  for (const player of players) {
    if (String(player.settlementId) === String(target._id)) { console.log(`${player.username.padEnd(12)} already in ${target.name}`); continue; }
    const grid = await Grid.findById(player.gridId);
    const from = await getSettlement(player.settlementId);
    const fromCell = from?.grids.flat().find((c) => c.gridId && String(c.gridId) === String(grid._id));
    const toCell = freeCells()[0];
    if (!grid || !from || !fromCell || !toCell) { console.log(`${player.username.padEnd(12)} ! cannot move (grid ${!!grid}, from ${!!from}, cell ${!!fromCell}, free ${!!toCell})`); continue; }
    const oldCoord = Number(fromCell.gridCoord), newCoord = Number(toCell.gridCoord);
    const atHome = String(player.location?.g) === String(grid._id);
    const oldTownCopies = await Grid.countDocuments({ ownerId: player._id, gridType: 'town', settlementId: from._id });
    console.log(`${player.username.padEnd(12)} ${from.name} ${oldCoord} -> ${target.name} ${newCoord}${atHome ? ' (standing at home)' : ''}; drop ${oldTownCopies} old town cop${oldTownCopies === 1 ? 'y' : 'ies'}`);
    movedCoords.push([oldCoord, newCoord]);
    // mutate in memory so later players see the claimed cell even in dry run
    fromCell.gridId = null; fromCell.available = true;
    toCell.gridId = grid._id; toCell.available = false;
    from.population = Math.max(0, (from.population || 0) - 1); target.population = (target.population || 0) + 1;
    if (apply) {
      grid.settlementId = target._id; grid.gridCoord = newCoord; await grid.save({ validateBeforeSave: false });
      player.settlementId = target._id; player.homesteadGridCoord = newCoord;
      if (atHome) { player.location.s = target._id; player.location.gridCoord = newCoord; player.markModified('location'); }
      await player.save();
      await Grid.deleteMany({ ownerId: player._id, gridType: 'town', settlementId: from._id });
      from.markModified('grids'); await from.save();
    }
  }
  if (apply) { target.markModified('grids'); await target.save(); }

  // dungeon entrances that pointed at a moved homestead
  const raw = await mongoose.connection.db.collection('frontiers').findOne({ _id: frontier._id });
  for (const [id, entry] of Object.entries(raw.dungeons || {})) {
    const before = (entry.entranceGrids || []).map(Number);
    const after = before.map((c) => { const m = movedCoords.find(([o]) => o === c); return m ? m[1] : c; });
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      console.log(`dungeon ${entry.templateUsed}: entrances ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
      if (apply) await Frontier.updateOne({ _id: frontier._id }, { $set: { [`dungeons.${id}.entranceGrids`]: after } });
    }
  }

  // close the corners
  for (const [r, c] of CORNERS) {
    const entry = frontier.settlements[r][c];
    const s = await getSettlement(entry.settlementId);
    const open = s.grids.flat().filter((x) => x.gridType === 'homestead' && x.available).length;
    console.log(`corner (${r},${c}) ${s.name}: closing (${open} open homestead cells, ${s.grids.flat().filter((x) => x.gridType === 'homestead' && x.gridId).length} still occupied)`);
    if (apply) {
      await Frontier.updateOne({ _id: frontier._id }, { $set: { [`settlements.${r}.${c}.available`]: false } });
      for (const cell of s.grids.flat()) if (cell.gridType === 'homestead' && !cell.gridId) cell.available = false;
      s.markModified('grids'); await s.save();
    }
  }
  await mongoose.disconnect();
  console.log(apply ? 'Done.' : 'Dry run complete. Re-run with --apply to write.');
})().catch((e) => { console.error(e); process.exit(1); });
