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
const { performGridReset } = require('./resetGridLogic');
  

async function seasonReset(frontierId, nextSeasonType = null) {
    try {
      const startTime = Date.now();
      console.group("↩️↩️↩️↩️↩️ STARTING seasonReset for frontier: ",frontierId);

      // EMERGENCY BYPASS: Skip season reset to prevent OOM crash
      // Remove this after fixing the underlying memory issues
      console.log("⚠️ EMERGENCY: Skipping season reset to prevent OOM crash");
      console.groupEnd();
      return;

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

// ✅ STEP 2: Reset All Grids (including towns, valley)

      console.log("🏠 STEP 2: Resetting grids: towns and valleys");
      const totalGrids = await Grid.find({ frontierId }); // ✅ Check ALL grids
      console.log(`🔁 Found ${totalGrids.length} grids to consider ...`);

      const gridIdToCoordMap = {};
      settlements.forEach(settlement => {
        settlement.grids?.flat().forEach(g => {
          if (g.gridId && g.gridCoord) {
            gridIdToCoordMap[g.gridId.toString()] = g.gridCoord;
          }
        });
      });
      for (const grid of totalGrids) {
        const isPublic = grid.gridType === "town" || grid.gridType.startsWith("valley");
        if (!isPublic) continue;

        try {
          const gridCoord = gridIdToCoordMap[grid._id.toString()];
          console.log(`🔁 Resetting ${grid.gridType} grid (${grid._id}) with gridCoord = (${gridCoord})`);
          await performGridReset(grid._id, grid.gridType, gridCoord);
          console.log(`✅ Grid ${grid._id} reset successfully (${grid.gridType})`);
        } catch (err) {
          console.error(`❌ Error resetting grid ${grid._id}:`, err.message);
        }
      }

      // 🔁 Update the seasonlog
      console.log("Updating seasonlog...");
      const gridsResetCount = totalGrids.filter(g => g.gridType === "town" || g.gridType.startsWith("valley")).length;
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
        
        // Get ALL grids in the frontier (including homesteads)
        const allGridsForSeasonalChange = await Grid.find({ frontierId });
        console.log(`🌍 Found ${allGridsForSeasonalChange.length} total grids for seasonal tile changes`);
        
        let tilesModifiedCount = 0;
        
        // Process each grid sequentially to avoid race conditions
        for (const grid of allGridsForSeasonalChange) {
          try {
            console.log(`Processing seasonal change for grid ${grid._id} (${grid.gridType})...`);
            
            // Decode tiles
            const tiles = TileEncoder.decode(grid.tiles);
            let modified = false;
            
            if (nextSeasonType === 'Winter' || nextSeasonType === 'winter') {
              // Convert grass to snow
              for (let y = 0; y < tiles.length; y++) {
                for (let x = 0; x < tiles[y].length; x++) {
                  if (tiles[y][x] === 'g') {
                    tiles[y][x] = 'o';
                    modified = true;
                    tilesModifiedCount++;
                  }
                }
              }
              if (modified) {
                console.log(`❄️ Made it snow on grid ${grid._id} (${grid.gridType})`);
              }
            } else if (nextSeasonType === 'Spring' || nextSeasonType === 'spring') {
              // Convert snow to grass
              for (let y = 0; y < tiles.length; y++) {
                for (let x = 0; x < tiles[y].length; x++) {
                  if (tiles[y][x] === 'o') {
                    tiles[y][x] = 'g';
                    modified = true;
                    tilesModifiedCount++;
                  }
                }
              }
              if (modified) {
                console.log(`🌱 Melted snow on grid ${grid._id} (${grid.gridType})`);
              }
            }
            
            // Save if modified
            if (modified) {
              const encodedTiles = TileEncoder.encode(tiles);
              grid.tiles = encodedTiles;
              await grid.save();
            }
            
          } catch (err) {
            console.error(`❌ Error applying seasonal change to grid ${grid._id}:`, err.message);
          }
          
          // Add a small delay between grids to ensure sequential processing
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        
        console.log(`✅ Seasonal tile changes complete. Modified ${tilesModifiedCount} tiles across ${allGridsForSeasonalChange.length} grids.`);
      }

 
// ✅ STEP 3: Reset Gold status

      console.log("🔁 STEP 3: Resetting Gold Status...");
      for (const player of allPlayers) {

        // // NOTE: Inventory and Money nerfing has been disabled 

        // const isGold = player.accountStatus?.includes("Gold");
        // const nerf = isGold ? globalTuning.seasonMoneyNerfGold : globalTuning.seasonMoneyNerf;
        // console.log(`💰 Nerfing player ${player.username} (${player._id}) by ${nerf * 100}%`);
        // const moneyItem = player.inventory.find((i) => i.type === "Money");
        // if (moneyItem) {
        //   moneyItem.quantity = Math.floor(moneyItem.quantity * (1 - nerf));
        // }

        // // Build list of resources to keep based on dynamic criteria
        // const resourcesToKeep = new Set();
        
        // // Keep resources where output==='noBank' AND repeatable===false
        // masterResources.forEach(resource => {
        //   if (resource.output === 'noBank' && resource.repeatable === false) {
        //     resourcesToKeep.add(resource.type);
        //   }
        // });
        
        // console.log(`Resources to keep during season reset:`, Array.from(resourcesToKeep));
        
        // // Wipe inventory except for protected resources
        // player.inventory = player.inventory.filter(i => resourcesToKeep.has(i.type));
        // console.log(`Player ${player.username} inventory wiped, keeping protected resources.`);
        // console.log('Player inventory after wipe:', player.inventory);

        // // Wipe backpack except for protected resources
        // player.backpack = player.backpack.filter(i => resourcesToKeep.has(i.type));
        // console.log(`Player ${player.username} backpack wiped, keeping protected resources.`);
        // console.log('Player backpack after wipe:', player.backpack);

        // // Reset netWorth to null 
        // player.netWorth = null;
        
        // Reset Gold status to Free
        
        if (player.accountStatus === "Gold") {
          player.accountStatus = "Free";
          console.log(`🔄 Reset player ${player.username} account status from Gold to Free`);
        }
        
        await player.save({ overwrite: true });
      }

// ✅ STEP 4: Wipe active and completed quests

      console.log("🔁 STEP 4: Wiping quests...");
      for (const player of allPlayers) {
        player.activeQuests = [];
        player.completedQuests = [];
        console.log(`🧹 Wiped quests for player ${player.username}`);
        await player.save();
      }

      console.log(`⏱️ Total seasonReset (including STEP 7) took ${Date.now() - startTime}ms`);

  } catch (error) {
    console.error("❌ Error in seasonReset:", error);
  }
} 

module.exports = seasonReset;