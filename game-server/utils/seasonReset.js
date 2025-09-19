const axios = require('axios');
const Frontier = require("../models/frontier");
const Settlement = require("../models/settlement");
const Grid = require("../models/grid");
const Player = require("../models/player");
const globalTuning = require("../tuning/globalTuning.json");
const fs = require("fs");
const shuffle = (array) => array.sort(() => Math.random() - 0.5);
const { relocatePlayersHome } = require('./relocatePlayersHome');
const { performGridReset } = require('./resetGridLogic');
  

async function seasonReset(frontierId) {
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

      // ✅ STEP 2: Reset All Grids (including towns, valley)
      console.log("🏠 STEP 2: Resetting grids: towns and valleys");
      const publicGrids = await Grid.find({ frontierId }); // ✅ Check ALL grids
      console.log(`🔁 Found ${publicGrids.length} public grids to reset...`);

      const gridIdToCoordMap = {};
      settlements.forEach(settlement => {
        settlement.grids?.flat().forEach(g => {
          if (g.gridId && g.gridCoord) {
            gridIdToCoordMap[g.gridId.toString()] = g.gridCoord;
          }
        });
      });
      for (const grid of publicGrids) {
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
      const gridsResetCount = publicGrids.filter(g => g.gridType === "town" || g.gridType.startsWith("valley")).length;
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

 
     // ✅ STEP 3: Apply money nerfs + wipe inventory
      console.log("🔁 STEP 3: Applying money nerfs and wiping inventories...");
      for (const player of allPlayers) {
        const isGold = player.accountStatus?.includes("Gold");
        const nerf = isGold ? globalTuning.seasonMoneyNerfGold : globalTuning.seasonMoneyNerf;
        console.log(`💰 Nerfing player ${player.username} (${player._id}) by ${nerf * 100}%`);
        const moneyItem = player.inventory.find((i) => i.type === "Money");
        if (moneyItem) {
          moneyItem.quantity = Math.floor(moneyItem.quantity * (1 - nerf));
        }
        player.inventory = player.inventory.filter(i =>
          ["Money", "Gem", "Prospero's Orb", "King's Crown", "Golden Key", "Skeleton Key", "Trident"].includes(i.type)
        );
        console.log(`Player ${player.username} inventory wiped, keeping Money, Gems, and certain high value quest items.`) ;
        console.log('Player inventory after wipe:', player.inventory);
        player.netWorth = null;
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