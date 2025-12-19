// game-server/utils/relocatePlayersHome.js
const Player = require("../models/player");
const Grid = require("../models/grid");
const Settlement = require("../models/settlement");
const ObjectId = require("mongoose").Types.ObjectId;
const gridResourceManager = require('./GridResourceManager');

async function relocatePlayersHome(frontierId) {
  console.group("🏠 Relocating players to home grids (modernized schema)...");
  let relocatedCount = 0;

  // Initialize GridResourceManager if needed
  if (!gridResourceManager.initialized) {
    await gridResourceManager.initialize();
  }

  // ✅ Load players and settlements (small datasets)
  const players = await Player.find({ frontierId });
  const settlements = await Settlement.find({ frontierId });
  console.log(`📥 Loaded ${players.length} players, ${settlements.length} settlements`);

  // ✅ Build helper maps (small memory footprint)
  const playerMap = new Map(players.map(p => [p._id.toString(), p]));
  console.log(`📦 Constructed playerMap with ${playerMap.size} entries`);

  const settlementInfo = {};
  for (const settlement of settlements) {
    for (const row of settlement.grids) {
      for (const grid of row) {
        if (!grid?.gridId) continue;
        const id = grid.gridId.toString();
        settlementInfo[id] = {
          gridCoord: grid.gridCoord,
          gridType: grid.gridType,
        };
      }
    }
  }
  console.log(`📦 Built settlementInfo map with ${Object.keys(settlementInfo).length} entries`);

  // ✅ Find grids with players WITHOUT loading all grids into memory
  // Use MongoDB aggregation to get only grid IDs that have players
  const gridsWithPlayers = await Grid.find(
    {
      frontierId,
      $or: [
        { 'playersInGrid.0': { $exists: true } }, // If playersInGrid is array
        { playersInGrid: { $ne: {} } } // If playersInGrid is object/map
      ]
    },
    { _id: 1 }
  ).lean();

  const gridIdsWithPlayers = gridsWithPlayers.map(g => g._id);
  console.log(`🔍 Found ${gridIdsWithPlayers.length} grids with players (out of ~882 total)`);

  // ✅ Cache for home grids (fetch on-demand with full resources)
  const homeGridCache = new Map();

  // ✅ Process grids in batches to avoid memory spike
  const BATCH_SIZE = 10;
  for (let i = 0; i < gridIdsWithPlayers.length; i += BATCH_SIZE) {
    const batchIds = gridIdsWithPlayers.slice(i, i + BATCH_SIZE);
    console.log(`🔄 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(gridIdsWithPlayers.length / BATCH_SIZE)} (${batchIds.length} grids)...`);

    // Load current batch of grids with resources (for Train finding)
    const batchGrids = await Grid.find(
      { _id: { $in: batchIds } },
      { _id: 1, playersInGrid: 1, playersInGridLastUpdated: 1, resources: 1 }
    );

    for (const grid of batchGrids) {
      if (!grid.playersInGrid) {
        continue;
      }

      const gridIdStr = grid._id.toString();
      const playersInGrid = grid.playersInGrid instanceof Map
        ? grid.playersInGrid
        : new Map(Object.entries(grid.playersInGrid || {}));

      if (playersInGrid.size === 0) continue;
      console.log(`🔍 Checking grid ${gridIdStr} with ${playersInGrid.size} players`);

      for (const [playerId, pcData] of playersInGrid.entries()) {
        const player = playerMap.get(playerId);
        if (!player) {
          console.warn(`⚠️ No Player found in DB for ID ${playerId}. Skipping.`);
          continue;
        }
        if (!player.gridId) {
          console.warn(`⚠️ Player ${player.username} has no gridId. Skipping.`);
          continue;
        }

        const homeGridIdStr = player.gridId.toString();
        const isHome = homeGridIdStr === gridIdStr;

        if (isHome) {
          // 🩹 Restore HP and reset position for players already at home
          if (typeof pcData === 'object' && player.baseMaxhp) {
            // Find Signpost Town coordinates and place player at x+1
            let spawnX = 0, spawnY = 0;
            try {
              const decodedResources = gridResourceManager.getResources(grid);
              const signpostTown = decodedResources.find(res => res.type === 'Signpost Town');
              if (signpostTown && typeof signpostTown.x === 'number' && typeof signpostTown.y === 'number') {
                spawnX = signpostTown.x + 1; // Place player 1 tile to the right
                spawnY = signpostTown.y;
              }
            } catch (err) {
              console.warn(`⚠️ Could not decode resources for grid ${gridIdStr}:`, err.message);
            }
            pcData.hp = player.baseMaxhp;
            pcData.position = { x: spawnX, y: spawnY };
            grid.playersInGrid.set(playerId, pcData);
            grid.playersInGridLastUpdated = new Date();
            await grid.save();
            console.log(`🩺 Restored HP for ${player.username} at home grid at (${spawnX}, ${spawnY})`);
          }
          continue;
        }

        // ✅ Fetch home grid on-demand with resources for Signpost Town finding
        let homeGrid = homeGridCache.get(homeGridIdStr);
        if (!homeGrid) {
          homeGrid = await Grid.findById(homeGridIdStr, {
            playersInGrid: 1,
            playersInGridLastUpdated: 1,
            resources: 1
          });
          if (homeGrid) {
            homeGridCache.set(homeGridIdStr, homeGrid);
          }
        }

        if (!homeGrid) {
          console.warn(`❌ No home grid found for player ${player.username} (homeGridId: ${homeGridIdStr}), skipping...`);
          continue;
        }

        // Find Signpost Town coordinates in home grid and place player at x+1
        let spawnX = 0, spawnY = 0;
        try {
          const decodedResources = gridResourceManager.getResources(homeGrid);
          const signpostTown = decodedResources.find(res => res.type === 'Signpost Town');
          if (signpostTown && typeof signpostTown.x === 'number' && typeof signpostTown.y === 'number') {
            spawnX = signpostTown.x + 1; // Place player 1 tile to the right
            spawnY = signpostTown.y;
          }
        } catch (err) {
          console.warn(`⚠️ Could not decode resources for home grid ${homeGridIdStr}:`, err.message);
        }

        // Add to home grid's playersInGrid
        homeGrid.playersInGrid = homeGrid.playersInGrid || new Map();
        homeGrid.playersInGrid.set(playerId, pcData);
        if (typeof pcData === 'object' && player.baseMaxhp) {
          pcData.hp = player.baseMaxhp;
          pcData.position = { x: spawnX, y: spawnY };
        }
        homeGrid.playersInGridLastUpdated = new Date();
        await homeGrid.save();
        console.log(`💾 Moved ${player.username} to home grid at (${spawnX}, ${spawnY})`);

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
          x: spawnX,
          y: spawnY
        };
        await player.save();
        relocatedCount++;
        console.log(`✅ Relocated ${player.username} to home grid ${info.gridCoord || "?"}`);
      }
    }
  }

  console.log(`🔢 Total players relocated: ${relocatedCount}`);
  console.groupEnd();
  return relocatedCount;
}


async function relocateOnePlayerHome(playerId) {
  try {
    // Initialize GridResourceManager if needed
    if (!gridResourceManager.initialized) {
      await gridResourceManager.initialize();
    }

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

      // Find Signpost Town coordinates and place player at x+1
      let spawnX = 0, spawnY = 0;
      try {
        const decodedResources = gridResourceManager.getResources(currentGrid);
        const signpostTown = decodedResources.find(res => res.type === 'Signpost Town');
        if (signpostTown && typeof signpostTown.x === 'number' && typeof signpostTown.y === 'number') {
          spawnX = signpostTown.x + 1; // Place player 1 tile to the right
          spawnY = signpostTown.y;
          console.log(`🏠 Found Signpost Town, placing player at (${spawnX}, ${spawnY})`);
        } else {
          console.log(`🏠 No Signpost Town found, using default (0, 0)`);
        }
      } catch (err) {
        console.warn(`⚠️ Could not decode resources for grid ${currentGridIdStr}:`, err.message);
      }

      const playersInGrid = currentGrid.playersInGrid instanceof Map
        ? currentGrid.playersInGrid
        : new Map(Object.entries(currentGrid.playersInGrid?.pcs || currentGrid.playersInGrid || {}));

      const pcData = playersInGrid.get(playerIdStr);
      if (pcData) {
        pcData.hp = player.baseMaxhp || pcData.maxhp || 1000;
        pcData.position = { x: spawnX, y: spawnY };

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
      player.location.x = spawnX;
      player.location.y = spawnY;
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

    // Find Signpost Town coordinates in home grid and place player at x+1
    let spawnX = 0, spawnY = 0;
    try {
      const decodedResources = gridResourceManager.getResources(homeGrid);
      console.log(`🔍 DEBUG: Decoded ${decodedResources.length} resources for home grid`);
      const signpostTown = decodedResources.find(res => res.type === 'Signpost Town');
      if (signpostTown) {
        console.log(`🔍 DEBUG: Signpost Town found:`, JSON.stringify(signpostTown));
      }
      if (signpostTown && typeof signpostTown.x === 'number' && typeof signpostTown.y === 'number') {
        spawnX = signpostTown.x + 1; // Place player 1 tile to the right
        spawnY = signpostTown.y;
        console.log(`🏠 Found Signpost Town at (${signpostTown.x}, ${signpostTown.y}), placing player at (${spawnX}, ${spawnY}) in home grid`);
      } else {
        console.log(`🏠 No Signpost Town found in home grid, using default (0, 0)`);
      }
    } catch (err) {
      console.warn(`⚠️ Could not decode resources for home grid ${homeGridIdStr}:`, err.message);
    }

    // Add to home grid with restored HP and reset position
    // Explicitly construct the PC data (don't spread Mongoose subdocuments)
    const restoredPcData = {
      playerId: playerIdStr,
      username: pcData.username || player.username,
      type: 'pc',
      position: { x: spawnX, y: spawnY },  // New position at Signpost Town
      icon: pcData.icon || player.icon || '😀',
      hp: player.baseMaxhp || pcData.maxhp || 1000,
      maxhp: player.baseMaxhp || pcData.maxhp || 1000,
      armorclass: pcData.armorclass ?? 10,
      attackbonus: pcData.attackbonus ?? 0,
      damage: pcData.damage ?? 1,
      attackrange: pcData.attackrange ?? 1,
      speed: pcData.speed ?? 1,
      iscamping: false,
      isinboat: false,
      lastUpdated: new Date()
    };
    console.log(`🔍 DEBUG: restoredPcData position = (${restoredPcData.position.x}, ${restoredPcData.position.y})`);

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
      x: spawnX,
      y: spawnY
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
