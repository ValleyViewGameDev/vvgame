// game-server/utils/seasonReset.js
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

const STEPS = {
  wipeHomesteads: true,
  resetPlayerAssignments: true,
  reassignPlayers: true,
  relocatePlayersHome: true,
  resetTownsAndValley: true,
  applyMoneyNerf: true,
};
const POP_THRESHOLD = 5;
const SAVE_FLAG = false;

async function seasonReset(frontierId) {
    try {
      console.group("↩️↩️↩️↩️↩️ STARTING seasonReset for frontier: ",frontierId);
  
      const frontier = await Frontier.findById(frontierId);
      if (!frontier) return console.error("❌ Frontier not found");
  
      const settlements = await Settlement.find({ frontierId });

      // ✅ Calculate population from settlements
      const totalPop = settlements.reduce((sum, s) => sum + (s.population || 0), 0);
      console.log(`📊 Total Population across all settlements: ${totalPop}`);
      
      if (totalPop < POP_THRESHOLD) {
        console.log("📦 Population under threshold — skipping reassignment.");
        console.groupEnd();
        return;
      }

      console.log("fetching players and grids...");
      // ✅ Also fetch players and grids AFTER this check
      const allPlayers = await Player.find({ frontierId });
      const grids = await Grid.find({ frontierId });
  
//////////////////////////////////////////////////////
//////////////////////////////////////////////////////


      // ✅ STEP 1: Wipe homestead ownership + availability
      if (STEPS.wipeHomesteads) {
        console.log("🔁 STEP 3: Wiping homestead ownership and resetting grid references...");
        for (const settlement of settlements) {
          for (const row of settlement.grids) {
            for (const grid of row) {
              if (grid.gridType === "homestead") {
                grid.available = true;
                grid.gridId = null;
              }
            }
          }
          settlement.population = 0;
          settlement.roles = {};
          settlement.votes = [];
          settlement.campaignPromises = [];
          settlement.currentoffers = [];
          settlement.nextoffers = [];
          settlement.trainrewards = [];
  
          if (SAVE_FLAG) {
            await settlement.save();
          } else {
            console.log("🚩 SAVE_FLAG off; Skipped saving settlement");
          }
        }
  
        for (const grid of grids) {
          grid.ownerId = null;
          if (SAVE_FLAG) {
            await grid.save();
          } else {
            console.log("🚩 SAVE_FLAG off; Skipped saving grid");
          }
                }
      } else {
        console.log("⏭️ STEP 1: Skipped wiping homesteads.");
      }
  
      // ✅ STEP 2: Reset player grid assignments
      if (STEPS.resetPlayerAssignments) {
        console.log("🔁 STEP 4: Resetting player gridIds...");
        for (const player of allPlayers) {
          player.gridId = null;
        }
        if (SAVE_FLAG) {
          await Promise.all(allPlayers.map((p) => p.save()));
        } else {
          console.log("🚩 SAVE_FLAG off; Skipped saving player grid assignments.");
        }
      } else {
        console.log("⏭️ STEP 2: Skipped resetting player gridIds.");
      }


  
      // ✅ STEP 3: Reassign players to homesteads
      if (STEPS.reassignPlayers) {
        console.log("🔁 STEP 5: Reassigning players to homesteads...");
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
//          grid.gridId = await createAndLinkGrid(player, settlement._id, frontierId, grid.gridCoord);
  
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
      } else {
        console.log("⏭️ STEP 3: Skipped player reassignment.");
      }
  
      // ✅ STEP 4: Relocate players back home
      if (STEPS.relocatePlayersHome) {
        await relocatePlayersHome(frontierId);
      
      } else {
        console.log("⏭️ STEP 4: Skipped relocating players.");
      }

     // ✅ STEP 5: Relocate players back home
     if (STEPS.resetTownsAndValley) {

      // for each settlement,
      // delete all grids with gtype = "town", "valley1", "valley2", or "valley3"
      // run these existing debug functions:
      // 

     } else {
       console.log("⏭️ STEP 5: Skipped resetting towns and valley.");
     }


     // ✅ STEP 6: Apply money nerfs + wipe inventory
      if (STEPS.applyMoneyNerf) {
        console.log("🔁 STEP 6: Applying money nerfs and wiping inventories...");
        for (const player of allPlayers) {
          const isGold = player.accountStatus?.includes("Gold");
          const nerf = isGold ? globalTuning.seasonMoneyNerfGold : globalTuning.seasonMoneyNerf;
  
          const moneyItem = player.inventory.find((i) => i.type === "Money");
          if (moneyItem) {
            moneyItem.quantity = Math.floor(moneyItem.quantity * (1 - nerf));
          }
  
          player.inventory = player.inventory.filter(i =>
            ["Money", "Merlin’s Orb", "King’s Crown"].includes(i.type)
          );
  
          player.netWorth = null;
          if (SAVE_FLAG) {
            await player.save();
          } else {
            console.log("🚩 SAVE_FLAG off; Skipped saving player after money nerf.");
          }
        }
      } else {
        console.log("⏭️ STEP 6: Skipped money nerf/inventory wipe.");
      }

     // ✅ STEP 7: Force refresh of clients
      io.emit("force-refresh", { reason: "seasonReset" });
  
      console.log("✅ Season Reset Complete!");
      console.groupEnd();

    } catch (error) {
      console.error("❌ Error in seasonReset.js:", error);
    }
  }
  
  module.exports = seasonReset;