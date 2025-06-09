// game-server/utils/relocatePlayersHome.js
const Player = require("../models/player");
const Grid = require("../models/grid");
const Settlement = require("../models/settlement");
const ObjectId = require("mongoose").Types.ObjectId;

async function relocatePlayersHome(frontierId) {
  console.group("🏠 Relocating players to home grids (modernized schema)...");
  let relocatedCount = 0;

  const players = await Player.find({ frontierId });
  const settlements = await Settlement.find({ frontierId });
  const grids = await Grid.find({ frontierId });

  console.log(`📥 Loaded ${players.length} players, ${settlements.length} settlements, ${grids.length} grids`);

  const gridMap = new Map(grids.map(g => [g._id.toString(), g]));
  console.log(`📦 Constructed gridMap with ${gridMap.size} entries`);

  const playerMap = new Map(players.map(p => [p._id.toString(), p]));
  console.log(`📦 Constructed playerMap with ${playerMap.size} entries`);

  const settlementInfo = {};
  for (const settlement of settlements) {
    for (const row of settlement.grids) {
      for (const grid of row) {
        settlementInfo[grid.gridId.toString()] = {
          gridCoord: grid.gridCoord,
          gridType: grid.gridType,
        };
      }
    }
  }
  console.log(`📦 Built settlementInfo map with ${Object.keys(settlementInfo).length} entries`);

  for (const grid of grids) {
    if (!grid.playersInGrid || typeof grid.playersInGrid.entries !== 'function') {
      console.warn(`⚠️ Grid ${grid._id} has invalid or missing playersInGrid map. Skipping.`);
      continue;
    }
    const gridIdStr = grid._id.toString();
    const playersInGrid = grid.playersInGrid instanceof Map
      ? grid.playersInGrid
      : new Map(Object.entries(grid.playersInGrid || {}));

    console.log(`🔍 Checking grid ${gridIdStr} with ${playersInGrid.size} players`);

    for (const [playerId, pcData] of playersInGrid.entries()) {
      console.log(`👤 Evaluating player ${playerId}`);
      const player = playerMap.get(playerId);
      if (!player) {
        console.warn(`⚠️ No Player found in DB for ID ${playerId}. Skipping.`);
        continue;
      }
      if (!player.gridId) {
        console.warn(`⚠️ Player ${player.username} has no gridId. Skipping.`);
        continue;
      }
      const homeGridIdStr = player.gridId?.toString();
      if (!homeGridIdStr) {
        console.warn(`⚠️ Player ${player.username} has invalid or missing gridId. Skipping.`);
        continue;
      }
      const isHome = homeGridIdStr === gridIdStr;
      if (isHome) {
        console.log(`✅ Player ${player.username} already at home grid, skipping.`);
        continue;
      }

      const homeGrid = gridMap.get(homeGridIdStr);
      if (!homeGrid) {
        console.warn(`❌ No home grid found for player ${player.username} (homeGridId: ${homeGridIdStr}), skipping...`);
        continue;
      }

      // Add to home grid's playersInGrid
      homeGrid.playersInGrid = homeGrid.playersInGrid || new Map();
      homeGrid.playersInGrid.set(playerId, pcData);
      homeGrid.playersInGridLastUpdated = new Date();
      await homeGrid.save();
      console.log(`💾 Saved updated home grid ${homeGridIdStr} with player ${player.username}`);

      // Remove from current grid
      grid.playersInGrid.delete(playerId);
      grid.playersInGridLastUpdated = new Date();
      await grid.save();
      console.log(`🧹 Removed ${player.username} from grid ${gridIdStr}`);

      // Update player.location
      const info = settlementInfo[homeGridIdStr] || {};
      player.location = {
        g: player.gridId,
        s: player.settlementId,
        f: player.frontierId,
        gridCoord: info.gridCoord || "0,0,0",
        gtype: info.gridType || "valley",
        x: 1,
        y: 1
      };
      await player.save();
      relocatedCount++;
      console.log(`✅ Moved ${player.username} to home grid ${info.gridCoord || "?"}`);
      console.log(`🚚 Moved player ${player.username} from ${gridIdStr} to ${homeGridIdStr}`);
    }
  }
  console.log(`🔢 Total players relocated: ${relocatedCount}`);
  console.groupEnd();
  return relocatedCount;
}

module.exports = relocatePlayersHome;