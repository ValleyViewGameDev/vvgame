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
  const grids = await Grid.find(
    { frontierId },
    { _id: 1, playersInGrid: 1, playersInGridLastUpdated: 1 }
  );

  console.log(`📥 Loaded ${players.length} players, ${settlements.length} settlements, ${grids.length} grids`);

  const gridMap = new Map(grids.map(g => [g._id.toString(), g]));
  console.log(`📦 Constructed gridMap with ${gridMap.size} entries`);

  const playerMap = new Map(players.map(p => [p._id.toString(), p]));
  console.log(`📦 Constructed playerMap with ${playerMap.size} entries`);

  const settlementInfo = {};
  for (const settlement of settlements) {
    for (const row of settlement.grids) {
      for (const grid of row) {
        if (!grid?.gridId) continue; // Skip placeholder grids
        const id = grid.gridId.toString();
        settlementInfo[id] = {
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
        // 🩹 Restore HP and reset position for players already at home
        if (typeof pcData === 'object' && player.baseMaxhp) {
          pcData.hp = player.baseMaxhp;
          pcData.position = { x: 0, y: 0 };
          grid.playersInGrid.set(playerId, pcData);
          grid.playersInGridLastUpdated = new Date();
          await grid.save();
          console.log(`🩺 Restored HP and position for player ${player.username} at home grid ${gridIdStr}`);
        }
        console.log(`✅ Player ${player.username} already at home grid, skipping.`);
        continue;
      }

      let homeGrid = gridMap.get(homeGridIdStr);
      if (!homeGrid) {
        homeGrid = await Grid.findById(homeGridIdStr, { playersInGrid: 1, playersInGridLastUpdated: 1 });
        if (homeGrid) gridMap.set(homeGridIdStr, homeGrid);
      }
      if (!homeGrid) {
        console.warn(`❌ No home grid found for player ${player.username} (homeGridId: ${homeGridIdStr}), skipping...`);
        continue;
      }

      // Add to home grid's playersInGrid
      homeGrid.playersInGrid = homeGrid.playersInGrid || new Map();
      homeGrid.playersInGrid.set(playerId, pcData);
      if (typeof pcData === 'object' && player.baseMaxhp) {
        pcData.hp = player.baseMaxhp;
        pcData.position = { x: 0, y: 0 };
      }
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


async function relocateOnePlayerHome(playerId) {
  try {
    console.log(`🔍 Looking up player with ID: ${playerId}`);
    const player = await Player.findById(playerId);
    if (!player) {
      console.error(`❌ Player not found with ID: ${playerId}`);
      return false;
    }
    
    if (!player.gridId) {
      console.error(`❌ Player ${player.username} has no gridId`);
      return false;
    }

    const homeGridIdStr = player.gridId.toString();
    const playerIdStr = playerId.toString();
    
    console.log(`🏠 Player's home grid: ${homeGridIdStr}`);
    console.log(`📍 Player's current location: ${JSON.stringify(player.location)}`);

    // Find the current grid the player is in
    const currentGrid = await Grid.findOne({
      $or: [
        { [`playersInGrid.pcs.${playerIdStr}`]: { $exists: true } },
        { [`playersInGrid.${playerIdStr}`]: { $exists: true } }
      ]
    });

    if (!currentGrid) {
      console.error(`❌ Could not find player ${player.username} in any grid`);
      return false;
    }

    const currentGridIdStr = currentGrid._id.toString();
    console.log(`📍 Found player in grid: ${currentGridIdStr}`);

    // If already home, just restore HP and position
    if (currentGridIdStr === homeGridIdStr) {
      console.log(`✅ Player already at home grid, restoring HP and position`);
      
      const playersInGrid = currentGrid.playersInGrid instanceof Map
        ? currentGrid.playersInGrid
        : new Map(Object.entries(currentGrid.playersInGrid?.pcs || currentGrid.playersInGrid || {}));
      
      const pcData = playersInGrid.get(playerIdStr);
      if (pcData) {
        pcData.hp = player.baseMaxhp || pcData.maxhp || 1000;
        pcData.position = { x: 0, y: 0 };
        
        if (currentGrid.playersInGrid instanceof Map) {
          currentGrid.playersInGrid.set(playerIdStr, pcData);
        } else if (currentGrid.playersInGrid.pcs) {
          currentGrid.playersInGrid.pcs[playerIdStr] = pcData;
        } else {
          currentGrid.playersInGrid[playerIdStr] = pcData;
        }
        
        currentGrid.playersInGridLastUpdated = new Date();
        await currentGrid.save();
      }
      
      // Update player location
      player.location.x = 0;
      player.location.y = 0;
      await player.save();
      
      return true;
    }

    // Get player data from current grid
    let pcData;
    if (currentGrid.playersInGrid instanceof Map) {
      pcData = currentGrid.playersInGrid.get(playerIdStr);
    } else if (currentGrid.playersInGrid?.pcs) {
      pcData = currentGrid.playersInGrid.pcs[playerIdStr];
    } else {
      pcData = currentGrid.playersInGrid?.[playerIdStr];
    }

    if (!pcData) {
      console.error(`❌ Could not find player data in current grid`);
      return false;
    }

    // Load home grid
    const homeGrid = await Grid.findById(homeGridIdStr);
    if (!homeGrid) {
      console.error(`❌ Home grid not found: ${homeGridIdStr}`);
      return false;
    }

    // Remove from current grid
    if (currentGrid.playersInGrid instanceof Map) {
      currentGrid.playersInGrid.delete(playerIdStr);
    } else if (currentGrid.playersInGrid?.pcs) {
      delete currentGrid.playersInGrid.pcs[playerIdStr];
    } else {
      delete currentGrid.playersInGrid[playerIdStr];
    }
    currentGrid.playersInGridLastUpdated = new Date();
    await currentGrid.save();
    console.log(`✅ Removed player from grid ${currentGridIdStr}`);

    // Add to home grid with restored HP and reset position
    const restoredPcData = {
      ...pcData,
      hp: player.baseMaxhp || pcData.maxhp || 1000,
      position: { x: 0, y: 0 }
    };

    if (!homeGrid.playersInGrid) {
      homeGrid.playersInGrid = {};
    }

    if (homeGrid.playersInGrid instanceof Map) {
      homeGrid.playersInGrid.set(playerIdStr, restoredPcData);
    } else if (homeGrid.playersInGrid.pcs) {
      homeGrid.playersInGrid.pcs[playerIdStr] = restoredPcData;
    } else {
      homeGrid.playersInGrid[playerIdStr] = restoredPcData;
    }
    
    homeGrid.playersInGridLastUpdated = new Date();
    await homeGrid.save();
    console.log(`✅ Added player to home grid ${homeGridIdStr}`);

    // Update player.location
    const settlement = await Settlement.findById(player.settlementId);
    let info = { gridCoord: "0,0,0", gridType: "homestead" };
    
    if (settlement && settlement.grids) {
      for (const row of settlement.grids) {
        for (const g of row) {
          if (g.gridId && g.gridId.toString() === homeGridIdStr) {
            info = { gridCoord: g.gridCoord, gridType: g.gridType };
            break;
          }
        }
      }
    }

    player.location = {
      g: player.gridId,
      s: player.settlementId,
      f: player.frontierId,
      gridCoord: info.gridCoord,
      gtype: info.gridType,
      x: 0,
      y: 0
    };
    await player.save();
    console.log(`✅ Updated player location to home grid`);

    return true;
  } catch (error) {
    console.error(`❌ Error in relocateOnePlayerHome:`, error);
    return false;
  }
}

module.exports = { relocatePlayersHome, relocateOnePlayerHome };
