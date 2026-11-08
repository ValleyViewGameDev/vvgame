#!/usr/bin/env node
/**
 * One of every pickup on a player's homestead, for an art review (owner, 2026-11-07: "add one of
 * every doober type onto Oberon's homestead so I can review everything and test it out"). Every
 * resources.json row of category 'doober' that the homestead does not already hold (anywhere on
 * the grid) is placed once, on an empty grass or dirt tile the row says it is valid on
 * in one compact block: the first (top-left-most) empty rectangle of grass and dirt tiles big
 * enough for them all, trying the widest shape first, so the review field reads as a table on
 * the board. Rows already present are listed and left alone. The validon flags are planting
 * rules and are not applied here: this is a review field, not play.
 *
 *   node scripts/seed-doober-review.js --player Oberon            -> dry run, prints the ledger
 *   node scripts/seed-doober-review.js --player Oberon --apply    -> writes
 *   --extra Gem,Hope                                              -> rows outside the doober category to add too
 *   --at 51,48                                                    -> no rectangle search: walk right then down from this tile, first free tiles
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Grid = require('../models/grid');
const Player = require('../models/player');
const gridResourceManager = require('../utils/GridResourceManager');
const { recordFootprint } = require('../utils/footprint');
const gridTileManager = require('../utils/GridTileManager');

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const apply = args.includes('--apply');
const username = opt('player', 'Oberon');
const at = args.includes('--at') ? String(opt('at')).split(',').map(Number) : null;
const extra = String(opt('extra', '')).split(',').map((t) => t.trim()).filter(Boolean);

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  await gridResourceManager.initialize();
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} on database "${mongoose.connection.db.databaseName}"`);

  const player = await Player.findOne({ username }, 'username gridId');
  if (!player?.gridId) throw new Error(`no homestead for player "${username}"`);
  const grid = await Grid.findById(player.gridId);
  if (!grid) throw new Error(`homestead grid ${player.gridId} not found`);
  const resources = gridResourceManager.getResources(grid);
  const tiles = gridTileManager.getTiles(grid);
  const master = gridResourceManager.masterResources;
  const doobers = master.filter((r) => r.category === 'doober');
  for (const t of extra) {
    const row = master.find((r) => r.type === t);
    if (!row) throw new Error(`--extra: no resource row "${t}"`);
    if (!doobers.includes(row)) doobers.push(row);
  }

  const present = new Map(); // type -> count on the grid
  for (const r of resources) if (doobers.some((d) => d.type === r.type)) present.set(r.type, (present.get(r.type) || 0) + 1);
  const occupied = new Set(resources.map((r) => `${r.x},${r.y}`));
  // a multi-tile resource covers tiles above and to the right of its anchor (the renderer grows upward)
  for (const r of resources) {
    const { w, h } = recordFootprint(r, master.find((m) => m.type === r.type));
    for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) occupied.add(`${r.x + dx},${r.y - dy}`);
  }

  const missing = doobers.filter((d) => !present.has(d.type));
  console.log(`${username}'s homestead ${grid._id} @${grid.gridCoord}: ${doobers.length} pickup rows, ${present.size} already there, ${missing.length} to place`);
  for (const [t, n] of present) console.log(`  have ${t} x${n}`);

  const tileType = (x, y) => tiles[y]?.[x];
  const free = (x, y) => !occupied.has(`${x},${y}`) && (tileType(x, y) === 'g' || tileType(x, y) === 'd');
  // the first empty rectangle that holds them all, widest shape first
  const need = missing.length;
  const shapes = [16, 14, 12, 10, 8, 6].map((w) => [w, Math.ceil(need / w)]);
  let block = null;
  outer: for (const [w, h] of (at ? [] : shapes)) {
    for (let y = 0; y + h <= 64; y++) for (let x = 0; x + w <= 64; x++) {
      let ok = true;
      for (let dy = 0; dy < h && ok; dy++) for (let dx = 0; dx < w; dx++) if (!free(x + dx, y + dy)) { ok = false; break; }
      if (ok) { block = { x, y, w, h }; break outer; }
    }
  }
  const placed = [];
  if (at) {
    // the caller's spot: the first free tiles right then down from it (the spare cells of an
    // earlier review block, say)
    const walk = [];
    for (let y = at[1]; y < 64 && walk.length < need; y++) for (let x = (y === at[1] ? at[0] : 0); x < 64 && walk.length < need; x++) if (free(x, y)) walk.push({ x, y });
    if (walk.length < need) console.log(`only ${walk.length} free tiles from (${at[0]}, ${at[1]})`);
    missing.slice(0, walk.length).forEach((d, i) => placed.push({ type: d.type, x: walk[i].x, y: walk[i].y }));
  } else if (!block) {
    console.log(`NO empty rectangle holds ${need} pickups (tried widths ${shapes.map((s) => s[0]).join(', ')}); clear some ground first.`);
  } else {
    console.log(`block ${block.w} x ${block.h} at (${block.x}, ${block.y})`);
    missing.forEach((d, i) => placed.push({ type: d.type, x: block.x + (i % block.w), y: block.y + Math.floor(i / block.w) }));
  }
  for (const p of placed) console.log(`  place ${p.type} at (${p.x}, ${p.y}) on ${tileType(p.x, p.y)}`);
  if (apply && placed.length) {
    grid.resources = gridResourceManager.encodeResourcesV2([...resources, ...placed]);
    await grid.save({ validateBeforeSave: false });
    console.log(`${placed.length} pickups written.`);
  } else {
    console.log(`${placed.length} pickups to place${apply ? '' : ' (dry run, nothing written)'}.`);
  }
  await mongoose.disconnect();
})().catch(async (err) => { console.error(err); await mongoose.disconnect(); process.exit(1); });
