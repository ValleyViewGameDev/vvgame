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
const { plantNewTrees } = require('./plantNewTreesLogic');
  

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

// ✅ STEP 2: Plant new trees on valley grids (replaces full grid reset)
      // Note: We no longer do full grid resets. Instead:
      // - Valley grids get trees planted (replaces harvested trees, removes Wood doobers)
      // - Town grids only get snow/melt (handled in Step 2.5)
      // - Homesteads only get snow/melt (no changes to player-placed resources)

      console.log("🌳 STEP 2: Planting trees on valley grids...");

      // Query ONLY valley grids (not towns - they don't need tree planting)
      const valleyGrids = await Grid.find({
        frontierId,
        gridType: /^valley/ // Regex for valley*
      }, { _id: 1, gridType: 1 }); // Only load _id and gridType fields

      console.log(`🌳 Found ${valleyGrids.length} valley grids for tree planting`);

      // Build gridCoord lookup map from settlements
      const gridIdToCoordMap = {};
      settlements.forEach(settlement => {
        settlement.grids?.flat().forEach(g => {
          if (g.gridId && g.gridCoord) {
            gridIdToCoordMap[g.gridId.toString()] = g.gridCoord;
          }
        });
      });

      // Plant trees on each valley grid
      let treesPlantedCount = 0;
      let totalOakAdded = 0;
      let totalPineAdded = 0;
      let totalWoodRemoved = 0;

      for (const grid of valleyGrids) {
        try {
          const gridCoord = gridIdToCoordMap[grid._id.toString()];
          const result = await plantNewTrees(grid._id.toString(), gridCoord);
          treesPlantedCount++;
          totalOakAdded += result.oakTreesAdded || 0;
          totalPineAdded += result.pineTreesAdded || 0;
          totalWoodRemoved += result.woodRemoved || 0;
          console.log(`🌳 Planted trees on ${grid.gridType} (${gridCoord}): +${result.oakTreesAdded} Oak, +${result.pineTreesAdded} Pine, -${result.woodRemoved} Wood (${result.layoutSource})`);
        } catch (err) {
          console.error(`❌ Error planting trees on grid ${grid._id}:`, err.message);
        }
      }

      console.log(`✅ Planted trees on ${treesPlantedCount} valley grids: +${totalOakAdded} Oak, +${totalPineAdded} Pine, -${totalWoodRemoved} Wood removed`);

      // 🔁 Update the seasonlog
      console.log("Updating seasonlog...");
      const gridsResetCount = treesPlantedCount; // Now tracking valley grids with trees planted
      if (currentSeasonNumber !== undefined) {
        const logIndex = frontier.seasonlog?.findIndex(log => log.seasonnumber === currentSeasonNumber);
        if (logIndex !== -1) {
          frontier.seasonlog[logIndex].gridsreset = gridsResetCount;
          frontier.markModified(`seasonlog.${logIndex}.gridsreset`);
          await frontier.save();
          console.log(`📝 Updated gridsreset (${gridsResetCount}) in seasonlog.`);
        } else {
          console.warn("⚠️ Could not update gridsreset — season entry not found.");
        }
      } else {
        console.warn("⚠️ Current season number missing; cannot update gridsreset in log.");
      }

      // ✅ STEP 2.5: Apply seasonal tile changes (snow/melt) based on new season
      if (nextSeasonType) {
        console.log(`🌨️ STEP 2.5: Applying seasonal tile changes for ${nextSeasonType}...`);
        const TileEncoder = require('./TileEncoder');

        // Get ALL grids in the frontier (including homesteads, valleys, towns)
        // ✅ Use projection to only load tiles and gridType fields (not resources, playersInGrid, etc.)
        const allGridsForSeasonalChange = await Grid.find(
          { frontierId },
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