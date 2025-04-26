import API_BASE from '../config';
import axios from 'axios';
import gridStateManager from '../GridState/GridState';
import { changePlayerLocation } from './GridManagement';

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

export const handlePlayerDeath = async (
  player,
  setCurrentPlayer,
  fetchGrid,
  setGridId,
  setGrid,
  setResources,
  setTileTypes,
  setGridState,
  TILE_SIZE,

) => {
  console.log('Handling player death...');
  console.log('currentPlayer = ', player);

  try {
    const playerId = String(player._id);  // Ensure consistency
    const currentGridId = player.location.g;
    // Determine respawn grid and coordinates
    const targetLocation = {
      x: 1,
      y: 1,
      g: player.gridId !== currentGridId ? player.gridId : currentGridId,
      gtype: "homestead",
    };
    // Preserve other location fields (frontier, settlement, gtype)
    const updatedLocation = {
      ...player.location,
      ...targetLocation,
    };

    console.log(`Updating profile and clearing backpack for player ${player.username}`);

    // 1. **Update Player Data in the Database**
    await axios.post(`${API_BASE}/api/update-profile`, {
      playerId: player._id,
      updates: {
        backpack: [],  // Empty the backpack
        hp: 25,  // Reset HP
        location: updatedLocation,  // Update location
        settings: { ...player.settings, hasDied: true }  // ✅ Store inside settings
      },
    });

    // 2. **Remove Player from Current Grid’s gridState using API**
    console.log(`Removing player ${player.username} from gridState.pcs in grid ${currentGridId} via API`);
    await axios.post(`${API_BASE}/api/remove-single-pc`, {
      gridId: currentGridId,
      playerId: playerId,
    });

    // 3. **Update Player's Location and State in React**
    const updatedPlayer = {
      ...player,
      hp: 5,
      location: updatedLocation,
      backpack: [],  // Ensure backpack clears in UI
      settings: { ...player.settings, hasDied: true },  // ✅ Ensure settings updates in local state
    };

    setCurrentPlayer(updatedPlayer);
    localStorage.setItem('player', JSON.stringify(updatedPlayer));

    console.log(`Player ${player.username} teleported to home grid with 5 HP.`);

    // 4. **Load New Grid & Add Player to GridState**
    await changePlayerLocation(
      updatedPlayer,
      player.location,   // fromLocation
      updatedLocation,        // toLocation
      setCurrentPlayer,
      fetchGrid,
      setGridId,                // ✅ Ensure this is passed
      setGrid,                  // ✅ Pass setGrid function
      setResources,             // ✅ Pass setResources function
      setTileTypes,             // ✅ Pass setTileTypes function
      setGridState,
      TILE_SIZE,
    );

  } catch (error) {
    console.error('Error during player death handling and teleportation:', error);
  }
};
