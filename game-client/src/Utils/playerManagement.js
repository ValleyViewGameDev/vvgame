import axios from 'axios';
import gridStateManager from '../GridState/GridState';


export const modifyPlayerStatsInGridState = async (statToMod, amountToMod, playerId, gridId) => {
  try {
    console.log('made it to modifyPlayerStatsInGridState');
    console.log('statToMod = ', statToMod, '; amountToMod = ', amountToMod);

    if (!statToMod || !amountToMod) { console.error('Invalid stat or amount to modify.'); return; }
 
    // Step 1: Get the current player data from gridState (lightweight schema)
    const gridState = gridStateManager.getGridState(gridId);
    const lightweightPlayer = gridState?.pcs?.[String(playerId)];
    if (!lightweightPlayer) {
      console.error(`Player ${playerId} not found in gridState.`);
      return;
    }
    // Step 2: Modify the stat in the gridState locally
    if (statToMod in lightweightPlayer) {
      lightweightPlayer[statToMod] += amountToMod;
      console.log(`Modified ${statToMod} in gridState: new value = ${lightweightPlayer[statToMod]}`);
    }

    // Step 3: Save changes to the local gridState
    gridStateManager.updatePC(gridId, playerId, { [statToMod]: lightweightPlayer[statToMod] });
    console.log(`Updated ${statToMod} for player ${playerId} in gridState.`);

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
    const response = await axios.get(`http://localhost:3001/api/player/${playerId}`);
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
    await axios.post('http://localhost:3001/api/update-profile', {
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
 * Determines if a given stat should be stored in gridState rather than the player document.
 * @param {string} stat - The name of the stat to check.
 * @returns {boolean} - Returns true if the stat belongs in gridState, false otherwise.
 */
export const isAGridStateStat = (stat) => {
  const gridStateStats = new Set([
    "damage",
    "armorclass",
    "hp",
    "maxhp",
    "attackbonus",
    "attackrange",
    "speed",
    "iscamping",
  ]);

  return gridStateStats.has(stat);
};