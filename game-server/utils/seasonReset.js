const axios = require('axios');
const Frontier = require("../models/frontier");
const Settlement = require("../models/settlement");
const Grid = require("../models/grid");
const Player = require("../models/player");
const globalTuning = require("../tuning/globalTuning.json");
const masterResources = require("../tuning/resources.json");
const fs = require("fs");
const shuffle = (array) => array.sort(() => Math.random() - 0.5);
const { relocatePlayersHome } = require('./relocatePlayersHome');
  

async function seasonReset(frontierId, nextSeasonType = null) {
    try {
      const startTime = Date.now();
      console.group("↩️↩️↩️↩️↩️ STARTING seasonReset for frontier: ",frontierId);

      const frontier = await Frontier.findById(frontierId);
      if (!frontier) return console.error("❌ Frontier not found");
      const settlements = await Settlement.find({ frontierId });
      const currentSeasonNumber = frontier.seasons?.seasonNumber;
      const allPlayers = await Player.find({ frontierId });
  
      // ✅ STEP 1: Relocate players back home
      console.log("🏠 STEP 1: Invoking relocatePlayersHome with frontierId:", frontierId);
      const relocatedCount = await relocatePlayersHome(frontierId);
      console.log("✅ relocatePlayersHome completed. Players relocated:", relocatedCount);

      // 🔁 Update the seasonlog
      console.log("Updating seasonlog...");
      if (currentSeasonNumber !== undefined) {
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

// STEP 2 (tree top-up on valleys) is now applied lazily per player copy on next entry
// (utils/gridResolver.applySeasonCatchUp), keyed on Grid.seasonNumber vs frontier.seasons.seasonNumber.

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
                  const encodedTiles = TileEncoder.encode(tiles);
                  grid.tiles = encodedTiles;
                  await grid.save();

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

          console.log(`✅ Seasonal tile changes complete. Modified ${tilesModifiedCount} tiles across ${gridsModifiedCount}/${allGridsForSeasonalChange.length} grids.`);
        }
      }

 
// ✅ STEP 3: Reset Gold status

      console.log("🔁 STEP 3: Resetting Gold Status...");
      const goldPlayersResetCount = allPlayers.filter(p => p.accountStatus === "Gold").length;

      if (goldPlayersResetCount > 0) {
        console.log(`🔄 Resetting ${goldPlayersResetCount} Gold players to Free...`);

        // Batch update all Gold players at once
        const bulkOps = allPlayers
          .filter(player => player.accountStatus === "Gold")
          .map(player => ({
            updateOne: {
              filter: { _id: player._id },
              update: { $set: { accountStatus: "Free" } }
            }
          }));

        if (bulkOps.length > 0) {
          const result = await Player.bulkWrite(bulkOps);
          console.log(`✅ Reset ${result.modifiedCount} players from Gold to Free`);
        }
      } else {
        console.log("ℹ️ No Gold players to reset");
      }

// ✅ STEP 4: Wipe active and completed quests

      console.log("🔁 STEP 4: Wiping quests...");
      console.log(`🧹 Wiping quests for ${allPlayers.length} players...`);

      // Batch update all players' quests at once
      const questBulkOps = allPlayers.map(player => ({
        updateOne: {
          filter: { _id: player._id },
          update: {
            $set: {
              activeQuests: [],
              completedQuests: []
            }
          }
        }
      }));

      if (questBulkOps.length > 0) {
        const questResult = await Player.bulkWrite(questBulkOps);
        console.log(`✅ Wiped quests for ${questResult.modifiedCount} players`);
      }

      console.log(`⏱️ Total seasonReset (including STEP 7) took ${Date.now() - startTime}ms`);

  } catch (error) {
    console.error("❌ Error in seasonReset:", error);
  }
} 

module.exports = seasonReset;