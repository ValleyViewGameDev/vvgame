const axios = require('axios');
const Frontier = require("../models/frontier");
const Settlement = require("../models/settlement");
const Grid = require("../models/grid");
const Player = require("../models/player");
const masterResources = require("../tuning/resources.json");
const globalTuning = require("../tuning/globalTuning.json");
const ObjectId = require("mongoose").Types.ObjectId;
const fs = require("fs");
const { truncate } = require("fs/promises");
const shuffle = (array) => array.sort(() => Math.random() - 0.5);
const relocatePlayersHome = require("./relocatePlayersHome");
const { performGridReset } = require('./resetGridLogic');
  
const STEPS = {
  wipeHomesteads: false,
  resetPlayerAssignments: false,
  reassignPlayers: false,
  relocatePlayersHome: true,
  resetTownsAndValley: true,
  applyMoneyNerf: true,
};
const POP_THRESHOLD = 5;
const SAVE_FLAG = false;

async function seasonReset(frontierId) {
    try {
      const startTime = Date.now();
      console.group("↩️↩️↩️↩️↩️ STARTING seasonReset for frontier: ",frontierId);
      const frontier = await Frontier.findById(frontierId);
      if (!frontier) return console.error("❌ Frontier not found");
      const settlements = await Settlement.find({ frontierId });
      // ✅ Calculate population from settlements
      const totalPop = settlements.reduce((sum, s) => sum + (s.population || 0), 0);
      console.log(`📊 Total Population across all settlements: ${totalPop}`);
      if (totalPop < POP_THRESHOLD) {
        console.log("📦 Population under threshold — skipping reassignment of players to homesteads.");
        STEPS.reassignPlayers = false;
        STEPS.resetPlayerAssignments = false;
      }

      console.log("fetching players and grids...");
      // ✅ Also fetch players and grids AFTER this check
      const allPlayers = await Player.find({ frontierId });
      const grids = await Grid.find({ frontierId });
  
//////////////////////////////////////////////////////
//////////////////////////////////////////////////////

      // // ✅ STEP 1: Wipe homestead ownership + availability
      // if (STEPS.wipeHomesteads) {
      //   const stepStart = Date.now();
      //   console.log("🔁 STEP 1: Wiping homestead ownership...");
      //   for (const settlement of settlements) {
      //     for (const row of settlement.grids) {
      //       for (const grid of row) {
      //         if (grid.gridType === "homestead") {
      //           grid.available = true;
      //           grid.gridId = null;
      //         }
      //       }
      //     }
      //     settlement.population = 0;
      //     settlement.roles = {};
      //     settlement.votes = [];
      //     settlement.campaignPromises = [];
      //     settlement.currentoffers = [];
      //     settlement.nextoffers = [];
      //     settlement.trainrewards = [];
  
      //     if (SAVE_FLAG) {
      //       await settlement.save();
      //     } else {
      //       console.log("🚩 SAVE_FLAG off; Skipped saving settlement");
      //     }
      //   }
  
      //   for (const grid of grids) {
      //     grid.ownerId = null;
      //     if (SAVE_FLAG) {
      //       await grid.save();
      //     } else {
      //       console.log("🚩 SAVE_FLAG off; Skipped saving grid");
      //     }
      //   }
      //   console.log(`⏱️ Step 1 took ${Date.now() - stepStart}ms`);
      // } else {
      //   console.log("⏭️ STEP 1: Skipped wiping homesteads.");
      // }
  
      // ✅ STEP 2: Reset player grid assignments
      if (STEPS.resetPlayerAssignments) {
        const stepStart = Date.now();
        console.log("🔁 STEP 2: Resetting player gridIds...");
        for (const player of allPlayers) {
          player.gridId = null;
        }
        if (SAVE_FLAG) {
          await Promise.all(allPlayers.map((p) => p.save()));
        } else {
          console.log("🚩 SAVE_FLAG off; Skipped saving player grid assignments.");
        }
        console.log(`⏱️ Step 2 took ${Date.now() - stepStart}ms`);
      } else {
        console.log("⏭️ STEP 2: Skipped resetting player gridIds.");
      }

      // ✅ STEP 3: Reassign players to homesteads
      if (STEPS.reassignPlayers) {
        const stepStart = Date.now();
        console.log("🔁 STEP 3: Reassigning players to homesteads...");
        const unassignedPlayers = shuffle([...allPlayers]);
        const homesteadGrids = grids.filter((g) => g.gridType === "homestead");
        let currentSettlementIndex = 0;
        let currentGroup = [];
        for (const player of unassignedPlayers) {
          if (currentGroup.length >= 30 || currentGroup.length === 0) {
            currentGroup = [];
            currentSettlementIndex++;
          }  
          const settlement = settlements[currentSettlementIndex % settlements.length];
          const settlementGrids = settlement.grids.flat().filter(g => g.gridType === "homestead" && g.available);
          const grid = shuffle(settlementGrids).find(g => g.available);
          if (!grid) {
            console.warn(`⚠️ No available homesteads for player ${player.username}`);
            continue;
          } 
          grid.available = false;
//        grid.gridId = await createAndLinkGrid(player, settlement._id, frontierId, grid.gridCoord);
          player.settlementId = settlement._id;
          player.gridId = grid.gridId;
          player.frontierId = frontierId; 
          currentGroup.push(player);
        }
        if (SAVE_FLAG) {
          await Promise.all(settlements.map((s) => s.save()));
        } else {
          console.log("🚩 SAVE_FLAG off; Skipped saving settlements after reassignment.");
        }
        console.log(`⏱️ Step 3 took ${Date.now() - stepStart}ms`);
      } else {
        console.log("⏭️ STEP 3: Skipped player reassignment.");
      }
  
      // ✅ STEP 4: Relocate players back home
      if (STEPS.relocatePlayersHome) {
        const stepStart = Date.now();
        console.log("🏠 Invoking relocatePlayersHome with frontierId:", frontierId);
        console.time("⏱ relocatePlayersHome");
        const relocatedCount = await relocatePlayersHome(frontierId);
        console.timeEnd("⏱ relocatePlayersHome");
        console.log("✅ relocatePlayersHome completed. Players relocated:", relocatedCount);
        console.log(`⏱️ Step 4 took ${Date.now() - stepStart}ms`);


        // 🔁 Update the seasonlog for this season
        const currentSeasonNumber = frontier.seasons?.seasonNumber;
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
      } else {
        console.log("⏭️ STEP 4: Skipped relocating players.");
      }

      
     // ✅ STEP 5: Reset All Grids (including towns, valley, and homesteads)
     if (STEPS.resetTownsAndValley) {
        const stepStart = Date.now();
        const publicGrids = await Grid.find({ frontierId }); // ✅ Check ALL grids
        console.log(`🔁 Found ${publicGrids.length} public grids to reset...`);
        for (const grid of publicGrids) {
          const isPublic = grid.gridType === "town" || grid.gridType.startsWith("valley");
          if (!isPublic) continue;

          try {
            console.log(`🔁 Resetting ${grid.gridType} grid (${grid._id})`);
            await performGridReset(grid._id);
            console.log(`✅ Grid ${grid._id} reset successfully (${grid.gridType})`);
          } catch (err) {
            console.error(`❌ Error resetting grid ${grid._id}:`, err.message);
          }
        }
        // 🔁 Update the seasonlog for this season
        // Log the number of grids reset
        const currentSeasonNumber = frontier.seasons?.seasonNumber;
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

     } else {
       console.log("⏭️ STEP 5: Skipped resetting towns and valley.");
     }


     // ✅ STEP 6: Apply money nerfs + wipe inventory
      if (STEPS.applyMoneyNerf) {
        const stepStart = Date.now();
        console.log("🔁 STEP 6: Applying money nerfs and wiping inventories...");
        for (const player of allPlayers) {
          const isGold = player.accountStatus?.includes("Gold");
          const nerf = isGold ? globalTuning.seasonMoneyNerfGold : globalTuning.seasonMoneyNerf;
          console.log(`💰 Nerfing player ${player.username} (${player._id}) by ${nerf * 100}%`);
          const moneyItem = player.inventory.find((i) => i.type === "Money");
          if (moneyItem) {
            moneyItem.quantity = Math.floor(moneyItem.quantity * (1 - nerf));
          }
          player.inventory = player.inventory.filter(i =>
            ["Money", "Prospero's Orb", "King’s Crown", "Golden Key"].includes(i.type)
          );
          console.log(`Player ${player.username} inventory wiped, keeping Money, Prospero's Orb, King's Crown, and Golden Key.`) ;
          console.log('Player inventory after wipe:', player.inventory);
          player.netWorth = null;
          await player.save({ overwrite: true });
        }
        console.log(`⏱️ Step 6 took ${Date.now() - stepStart}ms`);
      } else {
        console.log("⏭️ STEP 6: Skipped money nerf/inventory wipe.");
      }
  
      console.log(`⏱️ Total seasonReset took ${Date.now() - startTime}ms`);
      console.groupEnd();

    } catch (error) {
      console.error("❌ Error in seasonReset.js:", error.message);
      console.error(error.stack);
    }
  }
  
  module.exports = seasonReset;