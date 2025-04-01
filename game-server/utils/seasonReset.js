// game-server/utils/seasonReset.js
const Frontier = require("../models/frontier");
const Settlement = require("../models/settlement");
const Grid = require("../models/grid");
const Player = require("../models/player");
const masterResources = require("../tuning/resources.json");
const globalTuning = require("../tuning/globalTuning.json");
const ObjectId = require("mongoose").Types.ObjectId;
const fs = require("fs");
const shuffle = (array) => array.sort(() => Math.random() - 0.5);

const STEPS = {
  wipeHomesteads: true,
  resetPlayerAssignments: true,
  reassignPlayers: true,
  applyMoneyNerf: true,
};


async function seasonReset(frontierId) {
    try {
      console.group("🌿 STARTING seasonReset");
  
      const frontier = await Frontier.findById(frontierId);
      if (!frontier) return console.error("❌ Frontier not found");
  
      const allPlayers = await Player.find({ frontierId });
      const totalPop = allPlayers.length;
      console.log(`📊 Total Players in Frontier: ${totalPop}`);
  
      if (totalPop < 60) {
        console.log("📦 Population under 60, skipping reassignment.");
        return;
      }
  
      const settlements = await Settlement.find({ frontierId });
      const grids = await Grid.find({ frontierId });
  
      // ✅ STEP 3: Wipe homestead ownership + availability
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
          settlement.currentOffers = [];
          settlement.nextOffers = [];
          settlement.trainRewards = [];
  
          await settlement.save();
        }
  
        for (const grid of grids) {
          grid.ownerId = null;
          await grid.save();
        }
      } else {
        console.log("⏭️ STEP 3: Skipped wiping homesteads.");
      }
  
      // ✅ STEP 4: Reset player grid assignments
      if (STEPS.resetPlayerAssignments) {
        console.log("🔁 STEP 4: Resetting player gridIds...");
        for (const player of allPlayers) {
          player.gridId = null;
        }
        await Promise.all(allPlayers.map((p) => p.save()));
      } else {
        console.log("⏭️ STEP 4: Skipped resetting player gridIds.");
      }
  
      // ✅ STEP 5: Reassign players to homesteads
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
          grid.gridId = await createAndLinkGrid(player, settlement._id, frontierId, grid.gridCoord);
  
          player.settlementId = settlement._id;
          player.gridId = grid.gridId;
          player.frontierId = frontierId;
  
          currentGroup.push(player);
        }
  
        await Promise.all(settlements.map((s) => s.save()));
      } else {
        console.log("⏭️ STEP 5: Skipped player reassignment.");
      }
  
      // ✅ STEP 6: Apply money nerfs + wipe inventory
      if (STEPS.applyMoneyNerf) {
        console.log("🔁 STEP 6: Applying money nerfs and wiping inventories...");
        for (const player of allPlayers) {
          const isGold = player.userState?.includes("Gold");
          const nerf = isGold ? globalTuning.seasonMoneyNerfGold : globalTuning.seasonMoneyNerf;
  
          const moneyItem = player.inventory.find((i) => i.type === "Money");
          if (moneyItem) {
            moneyItem.quantity = Math.floor(moneyItem.quantity * (1 - nerf));
          }
  
          player.inventory = player.inventory.filter(i =>
            ["Money", "Merlin’s Orb", "King’s Crown"].includes(i.type)
          );
  
          player.netWorth = null;
          await player.save();
        }
      } else {
        console.log("⏭️ STEP 6: Skipped money nerf/inventory wipe.");
      }
  
      console.log("✅ Season Reset Complete!");
      console.groupEnd();
    } catch (error) {
      console.error("❌ Error in seasonReset.js:", error);
    }
  }
  
  module.exports = seasonReset;