import API_BASE from '../config';
import axios from 'axios';
import NPCsInGridManager from '../GridState/GridStateNPCs';
import playersInGridManager from '../GridState/PlayersInGrid';
import { changePlayerLocation } from './GridManagement';
import strings from '../UI/strings.json';

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
  closeAllPanels

) => {
  console.log('⚰️ Handling player death for', player.username);

  try {
    const currentGridId = player.location.g;
    // Determine respawn grid and coordinates
    const targetLocation = {
      x: 1,
      y: 1,
      g: player.gridId !== currentGridId ? player.gridId : currentGridId,
      s: player.settlementId,
      gtype: "homestead",
    };
    // Preserve other location fields (frontier, settlement, gtype)
    const updatedLocation = {
      ...player.location,
      ...targetLocation,
    };

    // Determine restored HP based on account status
    let restoredHp = 25;
    if (player.accountStatus === "Gold") {
      restoredHp = Math.floor(player.baseMaxhp / 2); // use baseMaxhp or maxHp as appropriate
    }

    // Update player object in place
    player.hp = restoredHp;
    player.backpack = [];
    const originalLocation = { ...player.location }; // ✅ preserve the correct fromLocation
    player.location = updatedLocation;

    // 1. **Update Player Data in the Database**
    await axios.post(`${API_BASE}/api/update-profile`, {
      playerId: player._id,
      updates: {
        backpack: [],  // Empty the backpack
        hp: restoredHp,  // Use restored HP value
        location: updatedLocation,  // Update location
        settings: player.settings,
      },
    });
    setCurrentPlayer(player);
    localStorage.setItem('player', JSON.stringify(player));

    // ✅ Immediately update PlayersInGrid with restored HP
    await playersInGridManager.updatePC(currentGridId, player._id, { hp: restoredHp });

    console.log(`Player ${player.username} teleported to home grid with ${restoredHp} HP.`);
    console.log('📦 Player before changePlayerLocation:', JSON.stringify(player, null, 2));

    // 4. **Load New Grid & Add Player to GridState**
    await changePlayerLocation(
      player,
      originalLocation,   // fromLocation
      updatedLocation,   // toLocation
      setCurrentPlayer,
      setGridId,
      setGrid,
      setTileTypes,
      setResources,
      TILE_SIZE,
      updateStatus,
      closeAllPanels,
    );


  } catch (error) {
    console.error('Error during player death handling and teleportation:', error);
  }
};
