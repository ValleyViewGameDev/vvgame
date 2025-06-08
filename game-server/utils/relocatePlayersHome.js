// game-server/utils/relocatePlayersHome.js
const Player = require("../models/player");
const Grid = require("../models/grid");
const Settlement = require("../models/settlement");
const ObjectId = require("mongoose").Types.ObjectId;

async function relocatePlayersHome(frontierId) {
  console.group("🏠 Relocating players to home grids (modernized schema)...");

  const players = await Player.find({ frontierId });
  const settlements = await Settlement.find({ frontierId });
  const grids = await Grid.find({ frontierId });

  const gridMap = new Map(grids.map(g => [g._id.toString(), g]));
  const playerMap = new Map(players.map(p => [p._id.toString(), p]));

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

  for (const grid of grids) {
    const gridIdStr = grid._id.toString();
    const playersInGrid = grid.playersInGrid || new Map();

    for (const [playerId, pcData] of playersInGrid.entries()) {
      const player = playerMap.get(playerId);
      if (!player) {
        console.warn(`⚠️ No player found for ID ${playerId}, skipping...`);
        continue;
      }

      const homeGridIdStr = player.gridId?.toString();
      const isHome = homeGridIdStr === gridIdStr;
      if (isHome) continue;

      const homeGrid = gridMap.get(homeGridIdStr);
      if (!homeGrid) {
        console.warn(`❌ No home grid found for player ${player.username}, skipping...`);
        continue;
      }

      // Add to home grid's playersInGrid
      homeGrid.playersInGrid = homeGrid.playersInGrid || new Map();
      homeGrid.playersInGrid.set(playerId, pcData);
      homeGrid.playersInGridLastUpdated = new Date();
      await homeGrid.save();

      // Remove from current grid
      grid.playersInGrid.delete(playerId);
      grid.playersInGridLastUpdated = new Date();
      await grid.save();

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

      console.log(`✅ Moved ${player.username} to home grid ${info.gridCoord || "?"}`);
    }
  }

  console.groupEnd();
}

module.exports = relocatePlayersHome;