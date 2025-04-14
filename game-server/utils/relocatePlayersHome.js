// game-server/utils/relocatePlayersHome.js
const Player = require("../models/player");
const Grid = require("../models/grid");
const Settlement = require("../models/settlement");
const ObjectId = require("mongoose").Types.ObjectId;

async function relocatePlayersHome(frontierId) {
  console.group("🏠 Relocating players to home grids...");

  const players = await Player.find({ frontierId });
  const settlements = await Settlement.find({ frontierId });
  const grids = await Grid.find({ frontierId });

  const gridMap = new Map(grids.map(g => [g._id.toString(), g]));

  for (const player of players) {
    const gridIdStr = player.gridId?.toString();
    const homeGrid = gridMap.get(gridIdStr);
    if (!homeGrid) {
      throw new Error(`❌ No grid found for player ${player.username} (gridId: ${gridIdStr})`);
    }

    // Find gridCoord and gridType from settlements.grids
    let gridCoord = null;
    let gridType = null;
    for (const settlement of settlements) {
      for (const row of settlement.grids) {
        for (const grid of row) {
          if (grid.gridId?.toString() === gridIdStr) {
            gridCoord = grid.gridCoord;
            gridType = grid.gridType;
          }
        }
      }
    }

    if (!gridCoord || !gridType) {
      throw new Error(`❌ Could not determine gridCoord/gridType for player ${player.username}`);
    }

    // Update player.location
    player.location = {
      g: player.gridId,
      s: player.settlementId,
      f: player.frontierId,
      gridCoord,
      gtype: gridType,
      x: 1,
      y: 1
    };
    await player.save();

    // 🧠 Try to recover existing gridState.pcs entry
    let previousPCS = null;
    const previousGrid = gridMap.get(player.location?.g?.toString());
    if (
      previousGrid &&
      previousGrid.gridState?.pcs &&
      previousGrid.gridState.pcs.has(player._id.toString())
    ) {
      previousPCS = previousGrid.gridState.pcs.get(player._id.toString());
    }

    if (!previousPCS) {
      console.warn(`⚠️ No existing gridState.pcs found for ${player.username}. Using fallback defaults.`);
      previousPCS = {
        playerId: player._id.toString(),
        username: player.username,
        icon: player.icon || "🙂",
        type: "pc",
        position: { x: 2, y: 2 },
        hp: 25,
        maxhp: 25,
        attackbonus: 1,
        armorclass: 10,
        damage: 3,
        attackrange: 1,
        speed: 3,
        iscamping: false,
      };
    }

    // Assign only this player to their home grid
    homeGrid.gridState = homeGrid.gridState || {};
    homeGrid.gridState.pcs = {};  // ✅ Use plain object
    homeGrid.gridState.pcs[player._id.toString()] = previousPCS;
    await homeGrid.save();

    // Remove player from all other grids
    for (const otherGrid of grids) {
      const otherId = otherGrid._id.toString();
      if (otherId !== homeGridIdStr && otherGrid.gridState?.pcs?.[player._id.toString()]) {
        delete otherGrid.gridState.pcs[player._id.toString()];
        await otherGrid.save();
        console.log(`🧹 Removed ${player.username} from grid ${otherId}`);
      }
    }

    console.log(`✅ Relocated ${player.username} to home grid ${gridCoord}`);
  }

  console.groupEnd();
}

module.exports = relocatePlayersHome;