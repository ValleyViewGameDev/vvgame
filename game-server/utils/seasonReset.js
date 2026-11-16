/**
 * The season change (docs/season-reset.md, owner 2026-11-16). In order:
 *   1. every player goes home
 *   2. snow or melt on homesteads and the template grids (player copies catch up on entry)
 *   3. every player's Valley3 copy is deleted: the next entry builds a fresh one from the template
 *   4. the Quest for Hope begins again for every player (utils/hopeReset.js)
 * Town and Valley1/2 copies are NOT rebuilt: on their first entry of the new season
 * (gridResolver.applySeasonCatchUp) Wood left lying is cleared, the Quest for Hope's guardians come
 * back and the snow follows; whatever players built there stays. No other quest is touched.
 *
 * `{ dryRun: true }` (scripts/season-reset-dry-run.js) writes nothing and returns what it would do.
 */
const Frontier = require("../models/frontier");
const Grid = require("../models/grid");
const Player = require("../models/player");
const { relocatePlayersHome } = require('./relocatePlayersHome');
const { hopeItems, hopeQuestTitles, hopeResetFor } = require('./hopeReset');

async function seasonReset(frontierId, nextSeasonType = null, { dryRun = false } = {}) {
    const report = { dryRun, nextSeasonType, relocated: 0, snowGrids: 0, valley3CopiesDeleted: 0, hopeReset: { players: 0, artifactsTaken: 0, questsRemoved: 0, oracleBack: 0 } };
    try {
      const startTime = Date.now();
      console.group("↩️↩️↩️↩️↩️ STARTING seasonReset for frontier: ",frontierId);

      const frontier = await Frontier.findById(frontierId);
      if (!frontier) return console.error("❌ Frontier not found");
      const currentSeasonNumber = frontier.seasons?.seasonNumber;
      const allPlayers = await Player.find({ frontierId });
  
      // ✅ STEP 1: Relocate players back home
      console.log("🏠 STEP 1: Invoking relocatePlayersHome with frontierId:", frontierId);
      const relocatedCount = dryRun
        ? allPlayers.filter((p) => p.gridId && String(p.location?.g || '') !== String(p.gridId)).length
        : await relocatePlayersHome(frontierId);
      report.relocated = relocatedCount;
      console.log("✅ relocatePlayersHome completed. Players relocated:", relocatedCount);

      // 🔁 Update the seasonlog
      console.log("Updating seasonlog...");
      if (dryRun) {
        // nothing written
      } else if (currentSeasonNumber !== undefined) {
        const logIndex = frontier.seasonlog?.findIndex(log => log.seasonnumber === currentSeasonNumber);
        if (logIndex !== -1) {
          frontier.seasonlog[logIndex].playersrelocated = relocatedCount;
          frontier.markModified(`seasonlog.${logIndex}.playersrelocated`);
          await frontier.save();
          const savedLog = frontier.seasonlog[logIndex];
          console.log("📝 Final season log entry being saved:", JSON.stringify(savedLog, null, 2));
        } else {
          console.warn("⚠️ Could not update playersrelocated — season entry not found.");
        }
      } else {
        console.warn("⚠️ Current season number missing; cannot update playersrelocated in log.");
      }

// Valley1/2 and Town copies catch up lazily on their next entry (utils/gridResolver.applySeasonCatchUp),
// keyed on Grid.seasonNumber vs frontier.seasons.seasonNumber.

      // ✅ STEP 2.5: Apply seasonal tile changes (snow/melt) based on new season
      if (nextSeasonType) {
        console.log(`🌨️ STEP 2.5: Applying seasonal tile changes for ${nextSeasonType}...`);
        const TileEncoder = require('./TileEncoder');

        // Get ALL grids in the frontier (including homesteads, valleys, towns)
        // ✅ Use projection to only load tiles and gridType fields (not resources, playersInGrid, etc.)
        // Shared grids only: homesteads and template instances. Per-player copies catch up lazily on entry.
        const allGridsForSeasonalChange = await Grid.find(
          { frontierId, gridType: { $ne: 'dungeon' }, $or: [{ gridType: 'homestead' }, { isTemplate: true }] },
          { _id: 1, tiles: 1, gridType: 1 }
        );
        console.log(`🌍 Found ${allGridsForSeasonalChange.length} total grids for seasonal tile changes`);

        let tilesModifiedCount = 0;
        let gridsModifiedCount = 0;
        const BATCH_SIZE = 5; // Process 5 grids at a time
        const BATCH_DELAY_MS = 100; // 100ms delay between batches

        // Determine which tile conversion to apply
        const isWinter = nextSeasonType === 'Winter' || nextSeasonType === 'winter';
        const isSpring = nextSeasonType === 'Spring' || nextSeasonType === 'spring';
        const fromTile = isWinter ? 'g' : isSpring ? 'o' : null;
        const toTile = isWinter ? 'o' : isSpring ? 'g' : null;

        // Skip if not winter or spring (no tile changes needed)
        if (!fromTile || !toTile) {
          console.log(`ℹ️ No tile changes needed for ${nextSeasonType}`);
        } else {
          // Process grids in batches to avoid CPU overload
          for (let i = 0; i < allGridsForSeasonalChange.length; i += BATCH_SIZE) {
            const batch = allGridsForSeasonalChange.slice(i, i + BATCH_SIZE);
            const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(allGridsForSeasonalChange.length / BATCH_SIZE);

            console.log(`🔄 Processing batch ${batchNumber}/${totalBatches} (${batch.length} grids)...`);

            // Process each grid in the batch
            await Promise.all(batch.map(async (grid) => {
              try {
                // Decode tiles
                const tiles = TileEncoder.decode(grid.tiles);
                let gridModified = false;
                let gridTileCount = 0;

                // Optimized: single loop with early termination check
                for (let y = 0; y < tiles.length; y++) {
                  for (let x = 0; x < tiles[y].length; x++) {
                    if (tiles[y][x] === fromTile) {
                      tiles[y][x] = toTile;
                      gridModified = true;
                      gridTileCount++;
                    }
                  }
                }

                // Save if modified
                if (gridModified) {
                  if (!dryRun) {
                    grid.tiles = TileEncoder.encode(tiles);
                    await grid.save();
                  }

                  tilesModifiedCount += gridTileCount;
                  gridsModifiedCount++;

                  const emoji = isWinter ? '❄️' : '🌱';
                  const action = isWinter ? 'snow' : 'melt';
                  console.log(`${emoji} Applied ${action} to grid ${grid._id} (${grid.gridType}): ${gridTileCount} tiles`);
                }
              } catch (err) {
                console.error(`❌ Error applying seasonal change to grid ${grid._id}:`, err.message);
              }
            }));

            // Delay between batches to prevent CPU overload
            if (i + BATCH_SIZE < allGridsForSeasonalChange.length) {
              await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
            }
          }

          report.snowGrids = gridsModifiedCount;
          console.log(`✅ Seasonal tile changes complete. Modified ${tilesModifiedCount} tiles across ${gridsModifiedCount}/${allGridsForSeasonalChange.length} grids.`);
        }
      }

 
// ✅ STEP 2.75: Valley3 is rebuilt for everyone (docs/season-reset.md): every player copy goes,
// and the next entry makes a fresh one from the template. Players were sent home in step 1.

      const valley3Copies = { frontierId, gridType: 'valley3', ownerId: { $ne: null }, isTemplate: { $ne: true } };
      report.valley3CopiesDeleted = dryRun
        ? await Grid.countDocuments(valley3Copies)
        : (await Grid.deleteMany(valley3Copies)).deletedCount;
      console.log(`🏔️ STEP 2.75: ${dryRun ? 'would delete' : 'deleted'} ${report.valley3CopiesDeleted} Valley3 copies`);
      if (!dryRun && currentSeasonNumber !== undefined) {
        await Frontier.updateOne(
          { _id: frontierId, 'seasonlog.seasonnumber': currentSeasonNumber },
          { $set: { 'seasonlog.$.gridsreset': report.valley3CopiesDeleted } }
        );
      }

// ✅ STEP 4: The Quest for Hope begins again (utils/hopeReset.js). No other quest is touched.

      console.log("🔁 STEP 4: Resetting the Quest for Hope...");
      const items = hopeItems();
      const titles = hopeQuestTitles();
      const hopeOps = [];
      for (const player of allPlayers) {
        const { update, summary } = hopeResetFor(player.toObject(), items, titles);
        if (!update) continue;
        hopeOps.push({ updateOne: { filter: { _id: player._id }, update } });
        report.hopeReset.players++;
        report.hopeReset.artifactsTaken += summary.taken.length;
        report.hopeReset.questsRemoved += summary.questsRemoved;
        if (summary.returned) report.hopeReset.oracleBack++;
      }
      if (hopeOps.length && !dryRun) {
        const hopeResult = await Player.bulkWrite(hopeOps);
        console.log(`✅ Quest for Hope reset for ${hopeResult.modifiedCount} players`);
      } else {
        console.log(`ℹ️ Quest for Hope: ${hopeOps.length} players ${dryRun ? 'would be' : 'were'} reset`);
      }

      console.log(`⏱️ Total seasonReset took ${Date.now() - startTime}ms`);
      console.groupEnd();
      return report;

  } catch (error) {
    console.error("❌ Error in seasonReset:", error);
  }
} 

module.exports = seasonReset;