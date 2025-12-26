import API_BASE from '../config';
import axios from 'axios';
import playersInGridManager from '../GridState/PlayersInGrid';
import { changePlayerLocation } from './GridManagement';
import { fetchHomesteadSignpostPosition } from './worldHelpers';


// Helper function to calculate derived level based on player XP
// masterXPLevels is now an array of XP thresholds: [40, 100, 180, 270, ...]
// Level 1 requires 40 XP, Level 2 requires 100 XP, etc.
export const getDerivedLevel = (currentPlayer, masterXPLevels = []) => {
  const playerXP = currentPlayer?.xp || 0;
  
  if (!masterXPLevels || masterXPLevels.length === 0) {
    return 1; // Default level if no data available
  }
  
  // Find the highest level the player has reached
  let level = 1;
  for (let i = 0; i < masterXPLevels.length; i++) {
    if (playerXP >= masterXPLevels[i]) {
      level = i + 2; // Level is index + 2 (Level 1 = index 0, Level 2 = index 1, etc.)
    } else {
      break;
    }
  }
  
  return level;
};

// Helper function to get XP required for next level
export const getXpForNextLevel = (currentPlayer, masterXPLevels = []) => {
  const playerXP = currentPlayer?.xp || 0;
  
  if (!masterXPLevels || masterXPLevels.length === 0) {
    return 1000; // Default if no data available
  }
  
  const currentLevel = getDerivedLevel(currentPlayer, masterXPLevels);
  const nextLevelIndex = currentLevel - 1; // Convert level to index (Level 2 = index 1)
  
  // If at max level, return current XP (no more levels to gain)
  if (nextLevelIndex >= masterXPLevels.length) {
    return playerXP;
  }
  
  return masterXPLevels[nextLevelIndex];
};

export const modifyPlayerStatsInGridState = async (statToMod, amountToMod, playerId, gridId) => {
  try {
    console.log('made it to modifyPlayerStatsInGridState');
    console.log('statToMod = ', statToMod, '; amountToMod = ', amountToMod);

    if (!statToMod || !amountToMod) { console.error('Invalid stat or amount to modify.'); return; }

    // Use playersInGridManager to get PCs and update
    const pcs = playersInGridManager.getPlayersInGrid(gridId);
    const player = pcs?.[playerId];

    if (!player) {
      console.warn(`🛑 Player ${playerId} not found in playersInGrid for gridId ${gridId}`);
      console.warn('🧠 All available PCs:', Object.keys(pcs));
      return;
    }

    // Modify stat safely
    const updatedValue = (player[statToMod] || 0) + amountToMod;
    playersInGridManager.updatePC(gridId, playerId, { [statToMod]: updatedValue });
    console.log(`✅ Modified ${statToMod} for player ${playerId} by +${amountToMod}. New value: ${updatedValue}`);

  } catch (error) {
    console.error('Error in modifyPlayerStats:', error);
  }
};


export const modifyPlayerStatsInPlayer = async (statToMod, amountToMod, playerId) => {
  try {
    console.log('🔄 Modifying player stats in the Player Profile (DB)');
    console.log('statToMod = ', statToMod, '; amountToMod = ', amountToMod);

    if (!statToMod || !amountToMod) {
      console.error('❌ Invalid stat or amount to modify.');
      return null;
    }

    // Step 1: Fetch the current player data from the server
    const response = await axios.get(`${API_BASE}/api/player/${playerId}`);
    const currentPlayerData = response.data;

    if (!currentPlayerData || !currentPlayerData.playerId) {
      console.error('❌ Failed to fetch current player data from the server.');
      return null;
    }

    // Step 2: Calculate new stat value by adding to the existing value
    const currentStatValue = currentPlayerData[statToMod] || 0;  // Default to 0 if undefined
    const newStatValue = currentStatValue + amountToMod;
    console.log(`✅ Updating ${statToMod}: ${currentStatValue} + ${amountToMod} = ${newStatValue}`);

    // Step 3: Send the updated stat back to the database
    await axios.post(`${API_BASE}/api/update-profile`, {
      playerId,
      updates: {
        [statToMod]: newStatValue,  // ✅ Now ADDING instead of replacing
      },
    });

    console.log(`✅ Successfully updated ${statToMod} in the database.`);

    // Step 4: Return updated player data
    currentPlayerData[statToMod] = newStatValue;
    return currentPlayerData;

  } catch (error) {
    console.error('❌ Error in modifyPlayerStatsInPlayer:', error);
    return null;
  }
};

/**
 * Determines if a given stat should be stored in NPCsInGrid rather than the player document.
 * @param {string} stat - The name of the stat to check.
 * @returns {boolean} - Returns true if the stat belongs in NPCsInGrid, false otherwise.
 */
export const isAGridStateStat = (stat) => {
  const NPCsInGridStats = new Set([
    "damage",
    "armorclass",
    "hp",
    "maxhp",
    "attackbonus",
    "attackrange",
    "speed",
    "iscamping",
    "isinboat",
  ]);

  return NPCsInGridStats.has(stat);
};

export const handlePlayerDeath = async (
  player,
  setCurrentPlayer,
  setGridId,
  setGrid,
  setResources,
  setTileTypes,
  TILE_SIZE,
  updateStatus,
  setModalContent,
  setIsModalOpen,
  closeAllPanels,
  offerRevival = true

) => {
  console.log('⚰️ Handling player death for', player.username);

  try {
    const currentGridId = player.location.g;
    
    // Fetch the Signpost Town position from the homestead grid
    const signpostPosition = await fetchHomesteadSignpostPosition(player.gridId);
    
    // Fetch the homestead's gridCoord to ensure proper MiniMap display
    let homesteadGridCoord = player.homesteadGridCoord; // Use cached if available
    if (!homesteadGridCoord && player.gridId) {
      try {
        console.log('🏠 Fetching homestead gridCoord for death teleportation...');
        const homesteadResponse = await axios.get(`${API_BASE}/api/homestead-gridcoord/${player.gridId}`);
        if (homesteadResponse.data.gridCoord) {
          homesteadGridCoord = homesteadResponse.data.gridCoord;
          console.log('🏠✅ Found homestead gridCoord:', homesteadGridCoord);
        }
      } catch (error) {
        console.warn('⚠️ Could not fetch homestead gridCoord:', error);
      }
    }
    
    // Determine respawn grid and coordinates
    const targetLocation = {
      x: signpostPosition.x,
      y: signpostPosition.y,
      g: player.gridId !== currentGridId ? player.gridId : currentGridId,
      s: player.settlementId,
      gtype: "homestead",
      ...(homesteadGridCoord && { gridCoord: homesteadGridCoord }), // Include gridCoord for proper MiniMap display
    };
    // Preserve other location fields (frontier, settlement, gtype)
    const updatedLocation = {
      ...player.location,
      ...targetLocation,
    };

    // Determine restored HP based on account status
    let restoredHp = 40;
    if (player.accountStatus === "Gold") {
      restoredHp = Math.floor(player.baseMaxhp / 2); // use baseMaxhp or maxHp as appropriate
    }
    
    // Calculate proper maxHP from base stats and equipment (don't let it get corrupted)
    const properMaxHp = (player.baseMaxhp || 990) + (player.maxhpModifier || 0);
    
    console.log(`🚨 [HP DEBUG] Death recovery for ${player.username}:`);
    console.log('  player.baseMaxhp:', player.baseMaxhp);
    console.log('  player.maxhp (before):', player.maxhp);
    console.log('  properMaxHp (calculated):', properMaxHp);
    console.log('  restoredHp:', restoredHp);
    
    // Keep only Tent and Boat items in backpack, discard everything else
    const filteredBackpack = player.backpack.filter((item) => item.type === "Tent" || item.type === "Boat");
    const originalLocation = { ...player.location }; // ✅ preserve the correct fromLocation
    
    // Create updated player object with restored HP and proper maxHP
    const updatedPlayer = {
      ...player,
      hp: restoredHp,
      maxhp: properMaxHp,  // Ensure maxHP is not corrupted
      backpack: filteredBackpack,
      location: updatedLocation,
      ...(homesteadGridCoord && { homesteadGridCoord }) // Ensure homestead dot appears on MiniMap
    };

    // 1. **Update Player Data in the Database**
    await axios.post(`${API_BASE}/api/update-profile`, {
      playerId: player._id,
      updates: {
        backpack: filteredBackpack,  // Backpack now only contains Tent and Boat
        hp: restoredHp,  // Use restored HP value
        maxhp: properMaxHp,  // Ensure maxHP is preserved in database
        location: updatedLocation,  // Update location
        settings: player.settings,
        ...(homesteadGridCoord && { homesteadGridCoord }), // Save homesteadGridCoord for MiniMap
      },
    });
    setCurrentPlayer(updatedPlayer);
    localStorage.setItem('player', JSON.stringify(updatedPlayer));

    // REMOVED: Don't update PlayersInGrid here - let changePlayerLocation handle the cleanup
    // The player is dead and about to be moved, so we shouldn't update their HP in the current grid

    console.log(`Player ${player.username} will be teleported to home grid with ${restoredHp} HP.`);
    console.log('📦 Player before changePlayerLocation:', JSON.stringify(updatedPlayer, null, 2));

    // 4. **Load New Grid & Add Player to GridState**
    await changePlayerLocation(
      updatedPlayer,
      originalLocation,   // fromLocation
      updatedLocation,   // toLocation
      setCurrentPlayer,
      setGridId,
      setGrid,
      setTileTypes,
      setResources,
      TILE_SIZE,
      closeAllPanels,
      updateStatus,
      null, // bulkOperationContext not available
      null, // masterResources not available
      null, // strings not available
      null  // masterTrophies not available
    );

    // 5. **Ensure HP is properly set in the grid state after teleportation**
    console.log(`🏥 Ensuring player HP is set to ${restoredHp} in grid state`);
    const playersInGridManager = await import('../GridState/PlayersInGrid').then(m => m.default);
    await playersInGridManager.updatePC(updatedPlayer.gridId, updatedPlayer._id, { hp: restoredHp });
    
    // Also ensure the currentPlayer state reflects the restored HP
    setCurrentPlayer(prevPlayer => ({
      ...prevPlayer,
      hp: restoredHp
    }));

  } catch (error) {
    console.error('Error during player death handling and teleportation:', error);
  }
};
