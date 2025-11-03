import API_BASE from '../config'; 
import axios from 'axios';
import React, { useState, useEffect } from 'react';
import Panel from '../UI/Panel';
import '../UI/Panel.css'; // Specific styles for Debug Panel
import '../UI/SharedButtons.css'; // Specific styles for Debug Panel
import { fetchInventory, refreshPlayerAfterInventoryUpdate } from './InventoryManagement';
import { fetchGridData, changePlayerLocation } from './GridManagement';
import NPCsInGridManager from '../GridState/GridStateNPCs'; // Use default export for NPCsInGridManager
import playersInGridManager from '../GridState/PlayersInGrid';
import GridStateDebugPanel from './GridStateDebug';
import { generateTownGrids, generateValleyGrids, createSingleValleyGrid } from './WorldGeneration';

const DebugPanel = ({ onClose, currentPlayer, setCurrentPlayer, setInventory, setResources, currentGridId, updateStatus, TILE_SIZE, setGrid, setGridId, setTileTypes, closeAllPanels }) => {
  const [timers, setTimers] = useState([]);
  const [npcs, setNPCs] = useState([]);
  const [pcs, setPCs] = useState([]);
  const [updatedNPCs, setUpdatedNPCs] = useState(npcs);
  const [refreshDebug, setRefreshDebug] = useState(false);
  const [singleGridCoord, setSingleGridCoord] = useState('');
  const [toGridCoord, setToGridCoord] = useState('');
  const [usernameToDelete, setUsernameToDelete] = useState('');
  const [messageIdentifier, setMessageIdentifier] = useState('');
  
  // Fetch resources with timers when the panel opens or gridId changes
  useEffect(() => {
    if (!currentGridId) return;

    const fetchTimers = async () => {
        try {
            console.log('Fetching timers for gridId:', currentGridId);
            const gridData = await fetchGridData(currentGridId,updateStatus,currentPlayer);

            // ✅ Include both growEnd (Farming) and craftEnd (Crafting)
            const resourcesWithTimers = (gridData.resources || []).filter(
                (res) => res.growEnd || res.craftEnd
            );

            console.log('⏳ Active Timers:', resourcesWithTimers);
            setTimers(resourcesWithTimers);
        } catch (error) {
            console.error('Error fetching timers:', error);
        }
    };

    fetchTimers();
  }, [currentGridId]);

  // Refresh timers periodically
  useEffect(() => {
    const timerInterval = setInterval(() => {
      setTimers((prevTimers) =>
        prevTimers.map((timer) => {
          const growTimeRemaining = timer.growEnd ? Math.max(0, Math.floor((timer.growEnd - Date.now()) / 1000)) : null;
          const craftTimeRemaining = timer.craftEnd ? Math.max(0, Math.floor((timer.craftEnd - Date.now()) / 1000)) : null;

          return {
            ...timer,
            remainingTime: growTimeRemaining !== null ? growTimeRemaining : craftTimeRemaining, // Prioritize active timer
          };
        })
      );
    }, 1000);

    return () => clearInterval(timerInterval);
  }, []);

  // Fetch NPCs and PCs from GridState
  useEffect(() => {
    if (!currentGridId) return;

    const fetchGridStateEntities = () => {
      const NPCsInGrid = NPCsInGridManager.getNPCsInGrid(currentGridId);
      const playersInGrid = playersInGridManager.getPlayersInGrid(currentGridId);

      if (!NPCsInGrid) {
        console.warn(`No NPCsInGrid found for gridId: ${currentGridId}`);
        setNPCs([]);
      } else {
        setNPCs(Object.values(NPCsInGrid.npcs || {}));
      }

      if (!playersInGrid) {
        console.warn(`No playersInGrid found for gridId: ${currentGridId}`);
        setPCs([]);
      } else {
        setPCs(Object.values(playersInGrid));
      }
    };

    fetchGridStateEntities();
  }, [currentGridId, refreshDebug]);
  
  // Synchronize updatedNPCs with npcs when npcs changes
  useEffect(() => {
    setUpdatedNPCs(npcs);
  }, [npcs]);




  const handleResetGrid = async () => {
    if (!currentGridId) { console.error('currentGridId is not defined.'); return; }
    console.log('handleResetGrid: gridId:', currentGridId);
  
    try {
      // Fetch settlement details using the player's current location
      const settlementId = currentPlayer?.location?.s; // Fetch settlementId from current player location
      if (!settlementId) {
        console.error('Settlement ID not found for the current player.');
        alert('Settlement ID not found for the current player.');
        return;
      }
  
      // Fetch settlement data to retrieve frontierId
      const settlementResponse = await axios.get(`${API_BASE}/api/get-settlement/${settlementId}`);
      const settlement = settlementResponse.data;
  
      if (!settlement || !settlement.frontierId) {
        console.error('Settlement data is incomplete or missing frontierId.');
        alert('Settlement data is incomplete or missing frontierId.');
        return;
      }
  
      const frontierId = settlement.frontierId; // Extract frontierId from the settlement
      console.log('Settlement and frontierId resolved:', { settlementId, frontierId });
  
      // Fetch grid data to determine the gridType dynamically
      const gridResponse = await axios.get(`${API_BASE}/api/load-grid/${currentGridId}`);
      const gridData = gridResponse.data;
  
      if (!gridData || !gridData.gridType) {
        console.error('Grid data is incomplete or missing gridType.');
        alert('Grid data is incomplete or missing gridType.');
        return;
      }
  
      const gridType = gridData.gridType;

      let gridCoord = null;
      for (const row of settlement.grids) {
        for (const cell of row) {
          if (cell.gridId && String(cell.gridId) === String(currentGridId)) {
            gridCoord = cell.gridCoord;
            break;
          }
        }
        if (gridCoord !== null) break;
      }

      if (gridCoord === null) {
        console.error('Could not resolve gridCoord from settlement.');
        alert('Could not resolve gridCoord from settlement.');
        return;
      }

      console.log('Extracted gridData: gridType=', gridType, '; gridCoord=', gridCoord);
  
      // Send request to reset the grid
      const resetResponse = await axios.post(`${API_BASE}/api/reset-grid`, {
        gridCoord,
        gridId: currentGridId, // Use the Mongo `_id` of the grid
        gridType,
        settlementId,
        frontierId,
      });
  
      console.log(`Grid ${currentGridId} of type ${gridType} reset successfully:`, resetResponse.data);
      updateStatus(903);
      window.location.reload();
    } catch (error) {
      console.error(`Error resetting grid "${currentGridId}":`, error);
      alert(`Failed to reset grid "${currentGridId}". Check the console for details.`);
    }
  }; 

  
  const handleAddMoney = async () => {
    try {
      const playerId = currentPlayer?.playerId;
      if (!playerId) { console.error('No user logged in. Cannot add money.'); return; }
      // Call delta-based inventory update
      await axios.post(`${API_BASE}/api/update-inventory-delta`, {
        playerId,
        delta: { type: 'Money', quantity: 10000, target: 'inventory' },
      });

      // Update local inventory state
      const updatedInventory = await fetchInventory(playerId);
      setInventory(updatedInventory);
      // Update currentPlayer with the new inventory
      setCurrentPlayer(prev => ({ ...prev, inventory: updatedInventory }));
      // Refresh player data (but preserve the inventory we just set)
      await refreshPlayerAfterInventoryUpdate(playerId, setCurrentPlayer, true);
      console.log('✅ Added 10,000 Money successfully using delta update.');
    } catch (error) {
      console.error('❌ Error adding money:', error);
    }
  };

const handleGetRich = async () => {
  try {
    const playerId = currentPlayer?.playerId;
    if (!playerId) {
      console.error('No user logged in. Cannot perform Get Rich.');
      return;
    }

    // Define resources to add
    const resourcesToAdd = [
      { type: 'Money', quantity: 100000 },
      { type: 'Potion A', quantity: 50 },
      { type: 'Potion B', quantity: 50 },
      { type: 'Potion C', quantity: 50 },
      { type: 'Gem', quantity: 200 },
      { type: 'Book', quantity: 100 },
      { type: 'Wood', quantity: 1000 },
      { type: 'Clay', quantity: 1000 },
      { type: 'Stone', quantity: 1000 },
      { type: 'Wheat', quantity: 1000 },
      { type: 'Corn', quantity: 1000 },
      { type: 'Carrot', quantity: 1000 },
      { type: 'Grapes', quantity: 500 },
      { type: 'Apple', quantity: 500 },
      { type: 'Bread', quantity: 500 },
      { type: 'Olive Oil', quantity: 500 },
      { type: 'Honey', quantity: 500 },
      { type: 'Flour', quantity: 500 },
      { type: 'Butter', quantity: 500 },
      { type: 'Egg', quantity: 500 },
      { type: 'Sugar', quantity: 500 },
      { type: 'Cream', quantity: 500 },
      { type: 'Lemon', quantity: 500 },
      { type: 'Orange', quantity: 500 },
      { type: 'Cloth', quantity: 500 },
      { type: 'Lumber', quantity: 500 },
      { type: 'Thread', quantity: 500 },
      { type: 'Milk', quantity: 500 },
      { type: 'Aged Wine', quantity: 500 },
      { type: 'Sweater', quantity: 500 },
      { type: 'Cheese', quantity: 500 },
      { type: 'Sugarcane', quantity: 500 },
      { type: 'Strawberry', quantity: 500 },
      { type: 'Diamond Ring', quantity: 500 },
      { type: 'Feverfew', quantity: 100 },
      { type: 'Golden Key', quantity: 100 },
      { type: 'Skeleton Key', quantity: 100 },
      { type: 'Furniture', quantity: 100 },
      { type: 'Port', quantity: 100 },
      { type: 'Wool', quantity: 500 },
      { type: 'Scroll', quantity: 100 },
      { type: 'Pottery', quantity: 100 },
      { type: 'Portrait', quantity: 10 },
      { type: 'Trident', quantity: 10 },
      { type: 'Yellow Heart', quantity: 1000 },
      { type: 'Green Heart', quantity: 500 },
      { type: 'Purple Heart', quantity: 500 },
      { type: 'Saw', quantity: 10 },
      { type: 'Shovel', quantity: 20 },
      { type: 'Screwdriver', quantity: 30 },
      { type: 'Hammer', quantity: 40 },
      { type: 'Bolt', quantity: 50 },
    ];

    // Use delta endpoint for batched update, adding target: 'inventory' to each resource
    await axios.post(`${API_BASE}/api/update-inventory-delta`, {
      playerId,
      delta: resourcesToAdd.map(item => ({ ...item, target: 'inventory' })),
    });

    // Update local inventory state
    const updatedInventory = await fetchInventory(playerId);
    setInventory(updatedInventory);
    
    // Update currentPlayer with the new inventory
    setCurrentPlayer(prev => ({ ...prev, inventory: updatedInventory }));
    
    // Refresh player data after the batched update (preserve inventory)
    await refreshPlayerAfterInventoryUpdate(playerId, setCurrentPlayer, true);

    console.log('💰 Get Rich: Inventory updated successfully via delta.');
  } catch (error) {
    console.error('❌ Error performing Get Rich:', error);
  }
};
  
  const handleGetSkills = async () => {
    try {
      const playerId = currentPlayer?.playerId;
      if (!playerId) {
        console.error('No user logged in. Cannot add skills.');
        return;
      }
  
      // Fetch master resources
      const response = await axios.get(`${API_BASE}/api/resources`);
      const masterResources = response.data;
  
      if (!Array.isArray(masterResources)) {
        console.error('Master resources are not an array:', masterResources);
        return;
      }
  
      // Filter resources of type "skill"
      const skillResources = masterResources.filter((res) => res.category === 'skill');
      if (skillResources.length === 0) {
        console.warn('No skill resources found.');
        alert('No skill resources available to add.');
        return;
      }
  
      // Fetch the latest skills
      const skillsResponse = await axios.get(`${API_BASE}/api/skills/${playerId}`);
      const currentSkills = skillsResponse.data.skills || [];
  
      // Create a new skills list by adding one of each skill
      const updatedSkills = [...currentSkills];
      skillResources.forEach((skill) => {
        const existingSkill = updatedSkills.find((item) => item.type === skill.type);
        if (existingSkill) {
          existingSkill.quantity += 1;
        } else {
          updatedSkills.push({ type: skill.type, quantity: 1 });
        }
      });
  
      // Send the full updated skills list to the server
      await axios.post(`${API_BASE}/api/update-skills`, {
        playerId,
        skills: updatedSkills,
      });
  
      // Update the `currentPlayer` state with new skills
      const updatedPlayer = { ...currentPlayer, skills: updatedSkills };
      setCurrentPlayer(updatedPlayer);
      localStorage.setItem('player', JSON.stringify(updatedPlayer));
      updateStatus(904);
      console.log('Get Skills: Added skills successfully.');
    } catch (error) {
      console.error('Error adding skills:', error);
      alert('Failed to add skills. Check console for details.');
    }
  };
  
  const handleClearTrophies = async () => {
    try {
      const playerId = currentPlayer?.playerId;
      if (!playerId) {
        console.error('No player ID found. Cannot clear trophies.');
        return;
      }

      // Clear trophies
      const clearedTrophies = [];
      console.log('Clearing all trophies.');
      
      // Update trophies on the server by setting to empty array
      await axios.post(`${API_BASE}/api/update-profile`, {
        playerId,
        updates: {
          trophies: clearedTrophies
        }
      });
      
      console.log('Trophies cleared successfully on the server.');

      // Refresh player data after updates
      await refreshPlayerAfterInventoryUpdate(playerId, setCurrentPlayer);

      // Update the local state for trophies
      setCurrentPlayer((prevPlayer) => ({
        ...prevPlayer,
        trophies: clearedTrophies
      }));
      
      updateStatus('Trophies cleared successfully.');
      console.log('Trophies cleared successfully.');
    } catch (error) {
      console.error('Error clearing trophies:', error);
    }
  };
  
  const handleClearInventory = async () => {
    try {
      const playerId = currentPlayer?.playerId;
      if (!playerId) {
        console.error('No player ID found. Cannot clear inventory.');
        return;
      }

      // Retain only Money and Gems in the inventory
      const filteredInventory = currentPlayer.inventory.filter(
        (item) => item.type === 'Money' || item.type === 'Gem'
      );
      console.log('Filtered inventory to retain only Money and Gems:', filteredInventory);

      // Update inventory on the server
      await axios.post(`${API_BASE}/api/update-inventory`, {
        playerId,
        inventory: filteredInventory,
        backpack: currentPlayer.backpack || [],
      });
      console.log('Inventory updated successfully on the server.');

      // Refresh player data after updates
      await refreshPlayerAfterInventoryUpdate(playerId, setCurrentPlayer);

      // Force a re-fetch to confirm changes are saved
      const updatedInventory = await fetchInventory(playerId);
      console.log('Fetched inventory after clearing:', updatedInventory);

      // Update the local state for inventory
      setInventory(updatedInventory);
      setCurrentPlayer((prevPlayer) => ({
        ...prevPlayer,
        inventory: updatedInventory,
      }));
      updateStatus(900);
      console.log('Inventory cleared successfully except for Money.');
    } catch (error) {
      console.error('Error clearing inventory:', error);
    }
  };

  const handleClearSkillsAndPowers = async () => {
    try {
      const playerId = currentPlayer?.playerId;
      if (!playerId) {
        console.error('No player ID found. Cannot clear skills and powers.');
        return;
      }

      // Clear skills
      const clearedSkills = [];
      console.log('Clearing all skills.');
      await axios.post(`${API_BASE}/api/update-skills`, {
        playerId,
        skills: clearedSkills,
      });
      console.log('Skills cleared successfully on the server.');

      // Clear powers
      const clearedPowers = [];
      console.log('Clearing all powers.');
      await axios.post(`${API_BASE}/api/update-powers`, {
        playerId,
        powers: clearedPowers,
      });
      console.log('Powers cleared successfully on the server.');

      // Refresh player data after updates
      await refreshPlayerAfterInventoryUpdate(playerId, setCurrentPlayer);

      // Update the local state for skills and powers
      setCurrentPlayer((prevPlayer) => ({
        ...prevPlayer,
        skills: clearedSkills,
        powers: clearedPowers,
      }));
      updateStatus(905);
      console.log('Skills and powers cleared successfully.');
    } catch (error) {
      console.error('Error clearing skills and powers:', error);
    }
  };
  
  const handleClearQuestHistory = async () => {
    try {
        const playerId = currentPlayer?.playerId;
        if (!playerId) {
            console.error('No player logged in. Cannot clear quest history.');
            return;
        }

        // Make the API request to clear both activeQuests and completedQuests
        await axios.post(`${API_BASE}/api/clear-quest-history`, { playerId });

        // Update the `currentPlayer` state to reflect changes
        const updatedPlayer = { 
            ...currentPlayer, 
            activeQuests: [], 
            completedQuests: [] 
        };
        setCurrentPlayer(updatedPlayer);

        console.log('Quest history cleared successfully.');
        updateStatus(901); // Update with a debug-specific status code

    } catch (error) {
        console.error('Error clearing quest history:', error);
    }
  };

  const handleClearTradeStall = async () => {
    try {
      const username = currentPlayer?.username;
      if (!username) {
        console.error('No user logged in. Cannot clear Trade Stall.');
        return;
      }

      await axios.post(`${API_BASE}/api/update-player-trade-stall`, {
        username,
        tradeStall: [], // Clear the trade stall
      });

      console.log('Trade Stall cleared successfully.');
    } catch (error) {
      console.error('Error clearing Trade Stall:', error);
    }
  };

  const handleWelcomeMessage = async () => {
    const playerId = currentPlayer?.playerId;
    if (!playerId) { console.error("❌ No player ID available."); return; }
    try {
      await axios.post(`${API_BASE}/api/send-mailbox-message`, {
        playerId,
        messageId: 1, // Assuming 1 is the Welcome message ID
      });
      console.log("📬 Welcome message added to mailbox.");
      updateStatus("✅ Welcome message delivered.");
      await refreshPlayerAfterInventoryUpdate(playerId, setCurrentPlayer);

    } catch (mailError) {
      console.error("❌ Failed to send welcome message:", mailError);
      updateStatus("❌ Failed to deliver welcome message.");
    }
  };

  const handleRewardMessage = async () => {
    const playerId = currentPlayer?.playerId;
    if (!playerId) { console.error("❌ No player ID available."); return; }
    try {
      await axios.post(`${API_BASE}/api/send-mailbox-message`, {
        playerId,
        messageId: 101, 
      });
      console.log("📬 Welcome message added to mailbox.");
      updateStatus("✅ Welcome message delivered.");
      await refreshPlayerAfterInventoryUpdate(playerId, setCurrentPlayer);

    } catch (mailError) {
      console.error("❌ Failed to send welcome message:", mailError);
      updateStatus("❌ Failed to deliver welcome message.");
    }
  };

  const sendMessageToAll = async (messageId) => {
    try {
      await axios.post(`${API_BASE}/api/send-mailbox-message-all`, {
        messageId: messageId, // Send to all players
      });
      console.log(`📬 Message ${messageId} added to mailbox for all users.`);
      updateStatus(`✅ Message ${messageId} delivered to all users.`);
      // Optionally refresh current player
      if (currentPlayer?.playerId) {
        await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);
      }
    } catch (mailError) {
      console.error(`❌ Failed to send message ${messageId}:`, mailError);
      updateStatus(`❌ Failed to deliver message ${messageId}.`);
    }
  };
  
  const handleClearGridState = async (command) => {
    switch (command) {
      case 'cleargrid':
        if (NPCsInGridManager.clearGridState(currentGridId)) {
          updateStatus('Grid state cleared successfully');
          // Clear from localStorage if you're using it
          localStorage.removeItem(`NPCsInGrid_${currentGridId}`);
        } else {
          updateStatus('Failed to clear grid state');
        }
        break;

      // Add other debug commands here
      default:
        console.warn(`Unknown debug command: ${command}`);
    }
  };

  // Add Reset Combat Stats handler
  const handleResetCombatStats = async () => {
    try {
      const playerId = currentPlayer?.playerId;
      if (!playerId) {
        console.error('No player ID found. Cannot reset combat stats.');
        return;
      }

      const combatStats = {
        maxhp: currentPlayer.baseMaxhp,
        attackbonus: currentPlayer.baseAttackbonus,
        armorclass: currentPlayer.baseArmorclass,
        damage: currentPlayer.baseDamage,
        attackrange: currentPlayer.baseAttackrange,
        speed: currentPlayer.baseSpeed,
      };

      await playersInGridManager.updatePC(currentGridId, playerId, combatStats);

      console.log('Combat stats reset successfully using updatePC.');
      updateStatus(906); // Optional: new debug status
    } catch (error) {
      console.error('Error resetting combat stats:', error);
    }
  };

  const handleCreateNewFrontier = async () => {
    try {
      const response = await axios.post(`${API_BASE}/api/create-frontier`);
      console.log('Create New Frontier response:', response.data);
      alert('New Frontier created successfully!');
    } catch (error) {
      console.error('Error creating new Frontier:', error);
      alert('Failed to create new Frontier. Check console for details.');
    }
  };

  const handleGenerateTown = async () => {
    try { await generateTownGrids({ currentPlayer }); } catch (error) {
      console.error('Error generating town:', error);
      alert('Failed to generate town. Check console for details.');
    }
  };

  const handleGenerateValley = async (valleyType) => {
    try { await generateValleyGrids({ valleyType, currentPlayer }); } catch (error) {
      console.error(`Error generating valley${valleyType} grids:`, error);
      alert(`Failed to generate valley${valleyType} grids. Check the console for details.`);
    }
  };

  const handleDeleteAccount = async (username) => {
    // Accept either {username} or username string for backward compatibility
    if (typeof username === "object" && username?.username) {
      username = username.username;
    }
    if (!username) {
      alert("Please enter a username.");
      return;
    }

    try {
      // Step 1: Look up the player by username
      const lookupResponse = await axios.get(`${API_BASE}/api/get-player-by-username/${username}`);
      const player = lookupResponse.data;

      if (!player || !player._id) {
        alert(`Player not found for username: ${username}`);
        return;
      }

      const confirmed = window.confirm(`Are you sure you want to delete the account for "${username}"? This cannot be undone.`);
      if (!confirmed) return;

      // Step 2: Delete the player by ID
      const deleteResponse = await axios.post(`${API_BASE}/api/delete-player`, {
        playerId: player._id,
      });

      if (deleteResponse.data.success) {
        alert(`✅ Account for "${username}" deleted successfully.`);
        console.log(`✅ Account deleted for username: ${username}`);
      } else {
        alert("❌ Failed to delete account. See console for details.");
        console.error("Delete failed:", deleteResponse.data);
      }
    } catch (error) {
      console.error("❌ Error deleting account:", error);
      alert("An error occurred while trying to delete the account.");
    }
  };

  const handleTeleport = async (gridCoord) => {
    if (!gridCoord || typeof gridCoord !== 'number' || isNaN(gridCoord)) {
      console.error('❌ Invalid gridCoord passed to handleTeleport:', gridCoord);
      updateStatus('❌ Invalid grid selected for teleport.');
      return;
    }

    // Extract settlement row and col from the 4th and 5th digits
    const coordStr = String(gridCoord).padStart(7, '0'); // Ensure string is long enough
    const row = parseInt(coordStr[3], 10); // 4th digit
    const col = parseInt(coordStr[4], 10); // 5th digit

    console.log(`🔢 Parsed gridCoord ${gridCoord} → row=${row}, col=${col}`);

    try {
      // 1. Call backend to get settlement data
      const response = await axios.get(`${API_BASE}/api/get-settlement-by-coords/${row}/${col}`);
      const settlement = response.data;

      if (!settlement || !settlement.grids || settlement.grids.length === 0) {
        console.warn('No settlement or empty grids array found.');
        updateStatus('❌ Settlement data not found.');
        return;
      }

      // 2. Search through grids to find the matching gridCoord
      let matchingGridObj = null;
      for (const row of settlement.grids) {
        for (const cell of row) {
          if (cell.gridCoord === gridCoord) {
            matchingGridObj = cell;
            break;
          }
        }
        if (matchingGridObj) break;
      }

      if (!matchingGridObj) {
        console.warn(`GridCoord ${gridCoord} not found in settlement.`);
        updateStatus('❌ Grid not found in settlement.');
        return;
      }

      // 3. Build toLocation using found grid data
      const fromLocation = currentPlayer.location;
      const toLocation = {
        x: 0,
        y: 0,
        g: matchingGridObj.gridId,
        s: settlement._id,
        f: currentPlayer.location.f,
        gtype: matchingGridObj.gridType,
        gridCoord: gridCoord,
      };

      // 4. Call changePlayerLocation
      changePlayerLocation(
        currentPlayer,
        fromLocation,
        toLocation,
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
    } catch (error) {
      console.error('Error during teleport:', error);
      updateStatus('❌ Teleport failed due to error.');
    }
  };


  const handleResetFTUE = async () => {
    const playerId = currentPlayer?.playerId;
    if (!playerId) { console.error("❌ No player ID available."); return; }

    try {
      // Update player document on DB: player.firsttimeuser = true
      const response = await axios.post(`${API_BASE}/api/update-profile`, {
        playerId,
        updates: { firsttimeuser: true, ftuestep: 1 }, 
      });
      
      if (response.data.success) {
        // Update in the local storage as well
        const updatedPlayer = {
          ...currentPlayer,
          firsttimeuser: true,
          ftuestep: 1, 
        };
        localStorage.setItem('player', JSON.stringify(updatedPlayer));
        
        console.log('✅ FTUE reset successfully.');
        updateStatus('✅ FTUE reset. Refreshing page...');
        
        // Refresh the window after a short delay
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        console.error('❌ Failed to reset FTUE:', response.data.error);
        updateStatus('❌ Failed to reset FTUE.');
      }
    } catch (error) {
      console.error('❌ Error resetting FTUE:', error);
      updateStatus('❌ Error resetting FTUE.');
    }
  };

  const handleRemoveHomestead = async () => {
    if (!currentGridId) {
      console.error('❌ No grid ID available.');
      updateStatus('❌ No grid ID available.');
      return;
    }

    // Check if this is actually a homestead
    const gridType = currentPlayer?.location?.gtype;
    if (gridType !== 'homestead') {
      alert('⚠️ This command only works on homestead grids.');
      return;
    }

    const confirmed = window.confirm(
      `⚠️ Are you absolutely sure you want to remove this homestead grid?\n\n` +
      `Grid ID: ${currentGridId}\n\n` +
      `This will:\n` +
      `1. Delete this grid from the database\n` +
      `2. Mark this location as available in the settlement\n\n` +
      `This action CANNOT be undone!`
    );

    if (!confirmed) return;

    try {
      console.log('🏚️ Removing homestead grid:', currentGridId);
      
      const response = await axios.post(`${API_BASE}/api/remove-homestead`, {
        gridId: currentGridId
      });

      if (response.data.success) {
        console.log('✅ Homestead removed successfully');
        updateStatus('✅ Homestead removed. Players relocated. Reloading...');
        
        // The server has relocated all players using relocateOnePlayerHome
        // Just reload the page to reflect the new state
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        console.error('❌ Failed to remove homestead:', response.data);
        updateStatus('❌ Failed to remove homestead.');
      }
    } catch (error) {
      console.error('❌ Error removing homestead:', error);
      updateStatus('❌ Error removing homestead.');
      alert('Failed to remove homestead. Check console for details.');
    }
  };

  const handleGenerateCompactDBResources = async () => {
    if (!currentGridId) {
      console.error('❌ No grid ID available.');
      updateStatus('❌ No grid ID available.');
      return;
    }

    try {
      console.log('📦 Generating compact DB resources for grid:', currentGridId);
      updateStatus('📦 Converting grid resources to compact format...');
      
      const response = await axios.post(`${API_BASE}/api/generate-compact-db`, {
        gridId: currentGridId
      });

      if (response.data.success) {
        console.log('✅ Compact DB resources generated successfully:', response.data.result);
        updateStatus(`✅ Compact DB resources generated. Savings: ${response.data.result.savings}`);
        
        // Show detailed savings information
        const { originalSize, encodedSize, resourceCount, savings } = response.data.result;
        alert(
          `📦 Compact DB Resources Complete!\n\n` +
          `Resources processed: ${resourceCount}\n` +
          `Original size: ${originalSize} chars\n` +
          `Encoded size: ${encodedSize} chars\n` +
          `Storage savings: ${savings}\n\n` +
          `Grid ${currentGridId} now has resourcesV2 field with compact data.`
        );
      } else {
        console.error('❌ Failed to generate compact DB resources:', response.data);
        updateStatus('❌ Failed to generate compact DB resources.');
        alert(`Failed to generate compact DB resources: ${response.data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('❌ Error generating compact DB resources:', error);
      updateStatus('❌ Error generating compact DB resources.');
      alert('Failed to generate compact DB resources. Check console for details.');
    }
  };

  const handleDeleteOldDBResourcesSchema = async () => {
    if (!currentGridId) {
      console.error('❌ No grid ID available.');
      updateStatus('❌ No grid ID available.');
      return;
    }

    const confirmed = window.confirm(
      `⚠️ Are you sure you want to delete the old DB resources schema?\n\n` +
      `This will:\n` +
      `1. Remove the original "resources" field from the grid\n` +
      `2. Switch the grid to use only resourcesV2 format\n` +
      `3. Mark resource schema version as v2\n\n` +
      `Make sure the compact DB resources are working correctly first!\n` +
      `This action CANNOT be undone!`
    );

    if (!confirmed) return;

    try {
      console.log('🗑️ Deleting old DB resources schema for grid:', currentGridId);
      updateStatus('🗑️ Removing old resource format...');
      
      const response = await axios.post(`${API_BASE}/api/delete-old-schema`, {
        gridId: currentGridId
      });

      if (response.data.success) {
        console.log('✅ Old DB resources schema deleted successfully');
        updateStatus('✅ Old DB resources schema removed. Grid now uses v2 format only.');
        alert(
          `✅ Old DB Resources Schema Removed!\n\n` +
          `Grid ${currentGridId} now uses only the compact resourcesV2 format.\n` +
          `Schema version updated to v2.\n` +
          `Original "resources" field has been removed.`
        );
      } else {
        console.error('❌ Failed to delete old resources schema:', response.data);
        updateStatus('❌ Failed to delete old resources schema.');
        alert(`Failed to delete old resources schema: ${response.data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('❌ Error deleting old resources schema:', error);
      updateStatus('❌ Error deleting old resources schema.');
      alert('Failed to delete old resources schema. Check console for details.');
    }
  };

  const handleGenerateCompactDBTiles = async () => {
    if (!currentGridId) {
      console.error('❌ No grid ID available.');
      updateStatus('❌ No grid ID available.');
      return;
    }

    try {
      console.log('🗺️ Generating compact DB tiles for grid:', currentGridId);
      updateStatus('🗺️ Converting grid tiles to compact format...');
      
      const response = await axios.post(`${API_BASE}/api/generate-compact-tiles`, {
        gridId: currentGridId
      });

      if (response.data.success) {
        console.log('✅ Compact DB tiles generated successfully:', response.data.result);
        updateStatus(`✅ Compact DB tiles generated. Savings: ${response.data.result.savings}`);
        
        // Show detailed savings information
        const { originalSize, encodedSize, savings } = response.data.result;
        alert(
          `🗺️ Compact DB Tiles Complete!\n\n` +
          `Original size: ${originalSize} chars\n` +
          `Encoded size: ${encodedSize} chars\n` +
          `Storage savings: ${savings}\n\n` +
          `Grid ${currentGridId} now has tilesV2 field with compact data.`
        );
      } else {
        console.error('❌ Failed to generate compact DB tiles:', response.data);
        updateStatus('❌ Failed to generate compact DB tiles.');
        alert(`Failed to generate compact DB tiles: ${response.data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('❌ Error generating compact DB tiles:', error);
      updateStatus('❌ Error generating compact DB tiles.');
      alert('Failed to generate compact DB tiles. Check console for details.');
    }
  };

  const handleDeleteOldDBTilesSchema = async () => {
    if (!currentGridId) {
      console.error('❌ No grid ID available.');
      updateStatus('❌ No grid ID available.');
      return;
    }

    const confirmed = window.confirm(
      `⚠️ Are you sure you want to delete the old DB tiles schema?\n\n` +
      `This will:\n` +
      `1. Remove the original "tiles" field from the grid\n` +
      `2. Switch the grid to use only tilesV2 format\n` +
      `3. Mark tiles schema version as v2\n\n` +
      `Make sure the compact DB tiles are working correctly first!\n` +
      `This action CANNOT be undone!`
    );

    if (!confirmed) return;

    try {
      console.log('🗑️ Deleting old DB tiles schema for grid:', currentGridId);
      updateStatus('🗑️ Removing old tiles format...');
      
      const response = await axios.post(`${API_BASE}/api/delete-old-tiles-schema`, {
        gridId: currentGridId
      });

      if (response.data.success) {
        console.log('✅ Old DB tiles schema deleted successfully');
        updateStatus('✅ Old DB tiles schema removed. Grid now uses v2 format only.');
        alert(
          `✅ Old DB Tiles Schema Removed!\n\n` +
          `Grid ${currentGridId} now uses only the compact tilesV2 format.\n` +
          `Tiles schema version updated to v2.\n` +
          `Original "tiles" field has been removed.`
        );
      } else {
        console.error('❌ Failed to delete old tiles schema:', response.data);
        updateStatus('❌ Failed to delete old tiles schema.');
        alert(`Failed to delete old tiles schema: ${response.data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('❌ Error deleting old tiles schema:', error);
      updateStatus('❌ Error deleting old tiles schema.');
      alert('Failed to delete old tiles schema. Check console for details.');
    }
  };

  const handleBulkMigrateValleysTowns = async () => {
    const confirmed = window.confirm(
      `🔄 Bulk Migration: Valleys and Towns to V2\n\n` +
      `This will:\n` +
      `1. Find all valley and town grids (NOT homesteads)\n` +
      `2. Encode their resources and tiles to V2 format\n` +
      `3. Set both schema versions to V2\n` +
      `4. Keep V1 data for safety (delete separately)\n\n` +
      `This is safe to run and can be tested before removing V1 data.\n\n` +
      `Continue with bulk migration?`
    );

    if (!confirmed) return;

    try {
      console.log('🔄 Starting bulk migration of valleys and towns...');
      updateStatus('🔄 Bulk migrating non-homestead grids to V2...');
      
      const response = await axios.post(`${API_BASE}/api/bulk-migrate-valleys-towns`);

      if (response.data.success) {
        const { migrated, skipped, errors, details } = response.data.result;
        console.log('✅ Bulk migration completed:', response.data.result);
        updateStatus(`✅ Bulk migration complete: ${migrated} migrated, ${skipped} skipped, ${errors} errors`);
        
        // Show detailed results
        const resultMessage = 
          `✅ Bulk Migration Complete!\n\n` +
          `Migrated: ${migrated} grids\n` +
          `Skipped: ${skipped} grids (already V2 or no data)\n` +
          `Errors: ${errors} grids\n\n` +
          `V1 data is still present for safety.\n` +
          `Test the migrated grids, then use "Delete V1 DB" to clean up.`;
        
        alert(resultMessage);
        
        if (details && details.length > 0) {
          console.log('📋 Migration details:', details);
        }
      } else {
        console.error('❌ Bulk migration failed:', response.data);
        updateStatus('❌ Bulk migration failed.');
        alert(`Bulk migration failed: ${response.data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('❌ Error during bulk migration:', error);
      updateStatus('❌ Error during bulk migration.');
      alert('Bulk migration failed. Check console for details.');
    }
  };

  const handleBulkDeleteValleysTownsV1 = async () => {
    const confirmed = window.confirm(
      `🗑️ Bulk Delete V1 Data: Valleys and Towns\n\n` +
      `⚠️ WARNING: This will permanently remove V1 data!\n\n` +
      `This will:\n` +
      `1. Find all valley and town grids using V2 format\n` +
      `2. Remove old "resources" and "tiles" fields\n` +
      `3. Keep only resourcesV2 and tilesV2 data\n\n` +
      `IMPORTANT: Only run this AFTER testing V2 migration!\n` +
      `This action CANNOT be undone!\n\n` +
      `Are you sure you want to delete all V1 data?`
    );

    if (!confirmed) return;

    // Double confirmation for deletion
    const doubleConfirmed = window.confirm(
      `⚠️ FINAL CONFIRMATION ⚠️\n\n` +
      `You are about to PERMANENTLY DELETE V1 data from all valleys and towns.\n\n` +
      `This will free up significant database space but cannot be undone.\n\n` +
      `Type "DELETE" in the next prompt to continue...`
    );

    if (!doubleConfirmed) return;

    const deleteConfirmation = window.prompt(
      `Type "DELETE" to confirm permanent deletion of V1 data:`
    );

    if (deleteConfirmation !== "DELETE") {
      alert("Deletion cancelled - confirmation text did not match.");
      return;
    }

    try {
      console.log('🗑️ Starting bulk deletion of V1 data...');
      updateStatus('🗑️ Bulk deleting V1 data from valleys and towns...');
      
      const response = await axios.post(`${API_BASE}/api/bulk-delete-valleys-towns-v1`);

      if (response.data.success) {
        const { cleaned, errors, details } = response.data.result;
        console.log('✅ Bulk V1 cleanup completed:', response.data.result);
        updateStatus(`✅ V1 cleanup complete: ${cleaned} cleaned, ${errors} errors`);
        
        // Show detailed results
        const resultMessage = 
          `✅ V1 Data Cleanup Complete!\n\n` +
          `Cleaned: ${cleaned} grids\n` +
          `Errors: ${errors} grids\n\n` +
          `All valleys and towns now use only V2 format.\n` +
          `Significant database space has been freed.`;
        
        alert(resultMessage);
        
        if (details && details.length > 0) {
          console.log('📋 Cleanup details:', details);
        }
      } else {
        console.error('❌ Bulk V1 cleanup failed:', response.data);
        updateStatus('❌ Bulk V1 cleanup failed.');
        alert(`Bulk V1 cleanup failed: ${response.data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('❌ Error during bulk V1 cleanup:', error);
      updateStatus('❌ Error during bulk V1 cleanup.');
      alert('Bulk V1 cleanup failed. Check console for details.');
    }
  };

  const handleCheckMigrationStatus = async () => {
    try {
      console.log('📊 Checking migration status...');
      updateStatus('📊 Checking migration status...');
      
      const response = await axios.get(`${API_BASE}/api/migration-status-valleys-towns`);

      if (response.data.success) {
        const { statusCounts, totals, summary } = response.data;
        console.log('📊 Migration status:', response.data);
        
        // Format results for display
        let statusMessage = `📊 Migration Status Report\n\n`;
        statusMessage += `Total Non-Homesteads: ${summary.totalNonHomesteads}\n`;
        statusMessage += `V2 Resources: ${summary.totalV2Resources}\n`;
        statusMessage += `V2 Tiles: ${summary.totalV2Tiles}\n`;
        statusMessage += `Grids with V1 Data: ${summary.totalWithV1Data}\n\n`;
        
        statusMessage += `By Grid Type:\n`;
        totals.forEach(type => {
          statusMessage += `${type._id}: ${type.total} total, ${type.v2Resources} v2 resources, ${type.v2Tiles} v2 tiles, ${type.hasV1Data} with v1 data\n`;
        });
        
        statusMessage += `\nDetailed Breakdown:\n`;
        statusCounts.forEach(status => {
          const { gridType, resourcesSchemaVersion, tilesSchemaVersion } = status._id;
          statusMessage += `${gridType} (R:${resourcesSchemaVersion}, T:${tilesSchemaVersion}): ${status.count} grids\n`;
        });
        
        alert(statusMessage);
        updateStatus(`📊 Status: ${summary.totalV2Resources}/${summary.totalNonHomesteads} resources migrated, ${summary.totalV2Tiles}/${summary.totalNonHomesteads} tiles migrated`);
      } else {
        console.error('❌ Failed to check migration status:', response.data);
        updateStatus('❌ Failed to check migration status.');
        alert(`Failed to check migration status: ${response.data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('❌ Error checking migration status:', error);
      updateStatus('❌ Error checking migration status.');
      alert('Failed to check migration status. Check console for details.');
    }
  };

  const handleDebugUnmigratedGrids = async () => {
    try {
      console.log('🔍 Debugging unmigrated grids...');
      updateStatus('🔍 Analyzing unmigrated grids...');
      
      const response = await axios.get(`${API_BASE}/api/debug-unmigrated-grids`);

      if (response.data.success) {
        const { totalSuspicious, analysis, summary } = response.data;
        console.log('🔍 Unmigrated grids analysis:', response.data);
        
        // Format results for display
        let debugMessage = `🔍 Unmigrated Grids Analysis\n\n`;
        debugMessage += `Total Suspicious Grids: ${totalSuspicious}\n\n`;
        
        debugMessage += `Issue Summary:\n`;
        debugMessage += `• No resources to migrate: ${summary.noResources}\n`;
        debugMessage += `• Claims V2 but missing data: ${summary.claimsV2ButMissingData}\n`;
        debugMessage += `• Has V1 but migration skipped: ${summary.hasV1ButSkipped}\n`;
        debugMessage += `• Unknown issues: ${summary.unknown}\n\n`;
        
        if (analysis.length > 0) {
          debugMessage += `First 10 Problem Grids:\n`;
          analysis.slice(0, 10).forEach((grid, index) => {
            debugMessage += `${index + 1}. ${grid.gridType} (${grid.gridId})\n`;
            debugMessage += `   Schema: R:${grid.resourcesSchemaVersion}, T:${grid.tilesSchemaVersion}\n`;
            debugMessage += `   Resources: V1:${grid.v1ResourceCount}, V2:${grid.v2ResourceCount}\n`;
            debugMessage += `   Issue: ${grid.issue}\n\n`;
          });
          
          if (analysis.length > 10) {
            debugMessage += `... and ${analysis.length - 10} more grids\n`;
          }
        }
        
        alert(debugMessage);
        updateStatus(`🔍 Found ${totalSuspicious} suspicious grids. Check console for full details.`);
      } else {
        console.error('❌ Failed to debug unmigrated grids:', response.data);
        updateStatus('❌ Failed to debug unmigrated grids.');
        alert(`Failed to debug unmigrated grids: ${response.data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('❌ Error debugging unmigrated grids:', error);
      updateStatus('❌ Error debugging unmigrated grids.');
      alert('Failed to debug unmigrated grids. Check console for details.');
    }
  };

  const handleBulkMigrateHomesteads = async () => {
    const confirmed = window.confirm(
      `🏠 Bulk Migration: Homesteads to V2\n\n` +
      `This will:\n` +
      `1. Find all homestead grids\n` +
      `2. Encode their resources and tiles to V2 format\n` +
      `3. Set both schema versions to V2\n` +
      `4. Keep V1 data for safety (delete separately)\n\n` +
      `⚠️ This affects player homesteads!\n` +
      `Make sure the valley/town migration worked perfectly first.\n\n` +
      `Continue with homestead migration?`
    );

    if (!confirmed) return;

    try {
      console.log('🏠 Starting bulk migration of homesteads...');
      updateStatus('🏠 Bulk migrating homestead grids to V2...');
      
      const response = await axios.post(`${API_BASE}/api/bulk-migrate-homesteads`);

      if (response.data.success) {
        const { migrated, skipped, errors, details } = response.data.result;
        console.log('✅ Homestead migration completed:', response.data.result);
        updateStatus(`✅ Homestead migration complete: ${migrated} migrated, ${skipped} skipped, ${errors} errors`);
        
        // Show detailed results
        const resultMessage = 
          `✅ Homestead Migration Complete!\n\n` +
          `Migrated: ${migrated} homesteads\n` +
          `Skipped: ${skipped} homesteads (already V2 or no data)\n` +
          `Errors: ${errors} homesteads\n\n` +
          `V1 data is still present for safety.\n` +
          `Test the migrated homesteads, then use "Delete V1 DB" to clean up.`;
        
        alert(resultMessage);
        
        if (details && details.length > 0) {
          console.log('📋 Homestead migration details:', details);
        }
      } else {
        console.error('❌ Homestead migration failed:', response.data);
        updateStatus('❌ Homestead migration failed.');
        alert(`Homestead migration failed: ${response.data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('❌ Error during homestead migration:', error);
      updateStatus('❌ Error during homestead migration.');
      alert('Homestead migration failed. Check console for details.');
    }
  };

  const handleBulkDeleteHomesteadsV1 = async () => {
    const confirmed = window.confirm(
      `🗑️ Bulk Delete V1 Data: Homesteads\n\n` +
      `⚠️ WARNING: This affects PLAYER HOMESTEADS!\n\n` +
      `This will:\n` +
      `1. Find all homestead grids using V2 format\n` +
      `2. Remove old "resources" and "tiles" fields\n` +
      `3. Keep only resourcesV2 and tilesV2 data\n\n` +
      `CRITICAL: Only run this AFTER thorough testing!\n` +
      `This action CANNOT be undone!\n\n` +
      `Are you absolutely sure?`
    );

    if (!confirmed) return;

    // Double confirmation for homesteads
    const doubleConfirmed = window.confirm(
      `⚠️ FINAL CONFIRMATION - HOMESTEADS ⚠️\n\n` +
      `You are about to PERMANENTLY DELETE V1 data from PLAYER HOMESTEADS.\n\n` +
      `This could affect active player saves!\n` +
      `Make sure homestead migration was thoroughly tested!\n\n` +
      `Type "DELETE HOMESTEADS" in the next prompt to continue...`
    );

    if (!doubleConfirmed) return;

    const deleteConfirmation = window.prompt(
      `Type "DELETE HOMESTEADS" to confirm deletion of homestead V1 data:`
    );

    if (deleteConfirmation !== "DELETE HOMESTEADS") {
      alert("Deletion cancelled - confirmation text did not match.");
      return;
    }

    try {
      console.log('🗑️ Starting bulk deletion of homestead V1 data...');
      updateStatus('🗑️ Bulk deleting V1 data from homesteads...');
      
      const response = await axios.post(`${API_BASE}/api/bulk-delete-homesteads-v1`);

      if (response.data.success) {
        const { cleaned, errors, details } = response.data.result;
        console.log('✅ Homestead V1 cleanup completed:', response.data.result);
        updateStatus(`✅ Homestead cleanup complete: ${cleaned} cleaned, ${errors} errors`);
        
        // Show detailed results
        const resultMessage = 
          `✅ Homestead V1 Data Cleanup Complete!\n\n` +
          `Cleaned: ${cleaned} homesteads\n` +
          `Errors: ${errors} homesteads\n\n` +
          `All homesteads now use only V2 format.\n` +
          `Significant database space has been freed.`;
        
        alert(resultMessage);
        
        if (details && details.length > 0) {
          console.log('📋 Homestead cleanup details:', details);
        }
      } else {
        console.error('❌ Homestead V1 cleanup failed:', response.data);
        updateStatus('❌ Homestead V1 cleanup failed.');
        alert(`Homestead V1 cleanup failed: ${response.data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('❌ Error during homestead V1 cleanup:', error);
      updateStatus('❌ Error during homestead V1 cleanup.');
      alert('Homestead V1 cleanup failed. Check console for details.');
    }
  };

  const handleCheckHomesteadMigrationStatus = async () => {
    try {
      console.log('📊 Checking homestead migration status...');
      updateStatus('📊 Checking homestead migration status...');
      
      const response = await axios.get(`${API_BASE}/api/migration-status-homesteads`);

      if (response.data.success) {
        const { statusCounts, summary } = response.data;
        console.log('📊 Homestead migration status:', response.data);
        
        // Format results for display
        let statusMessage = `📊 Homestead Migration Status\n\n`;
        statusMessage += `Total Homesteads: ${summary.total}\n`;
        statusMessage += `V2 Resources: ${summary.v2Resources}\n`;
        statusMessage += `V2 Tiles: ${summary.v2Tiles}\n`;
        statusMessage += `Grids with V1 Data: ${summary.hasV1Data}\n\n`;
        
        statusMessage += `Schema Combinations:\n`;
        statusCounts.forEach(status => {
          const { resourcesSchemaVersion, tilesSchemaVersion } = status._id;
          statusMessage += `Resources:${resourcesSchemaVersion}, Tiles:${tilesSchemaVersion} - ${status.count} homesteads\n`;
        });
        
        alert(statusMessage);
        updateStatus(`📊 Homesteads: ${summary.v2Resources}/${summary.total} resources migrated, ${summary.v2Tiles}/${summary.total} tiles migrated`);
      } else {
        console.error('❌ Failed to check homestead migration status:', response.data);
        updateStatus('❌ Failed to check homestead migration status.');
        alert(`Failed to check homestead migration status: ${response.data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('❌ Error checking homestead migration status:', error);
      updateStatus('❌ Error checking homestead migration status.');
      alert('Failed to check homestead migration status. Check console for details.');
    }
  };

  const handlePreviewOrphanedHomesteads = async () => {
    try {
      console.log('👁️ Previewing orphaned homesteads...');
      updateStatus('👁️ Checking for orphaned homesteads...');
      
      const response = await axios.get(`${API_BASE}/api/preview-orphaned-homesteads`);

      if (response.data.success) {
        const { summary, sample, totalCount } = response.data;
        console.log('👁️ Orphaned homesteads preview:', response.data);
        
        // Format results for display
        let previewMessage = `👁️ Orphaned Homesteads Preview\n\n`;
        previewMessage += `Total Orphaned: ${summary.totalOrphaned}\n`;
        previewMessage += `Resources V1: ${summary.byResourcesVersion.v1}, V2: ${summary.byResourcesVersion.v2}\n`;
        previewMessage += `Tiles V1: ${summary.byTilesVersion.v1}, V2: ${summary.byTilesVersion.v2}\n`;
        previewMessage += `With Data: ${summary.withData}, Without Data: ${summary.withoutData}\n`;
        previewMessage += `With Activity: ${summary.withActivity}\n\n`;
        
        // Staleness breakdown
        if (summary.staleness) {
          previewMessage += `📅 Last Activity Analysis:\n`;
          previewMessage += `• Very Stale (6+ months): ${summary.staleness.veryStale}\n`;
          previewMessage += `• Stale (3-6 months): ${summary.staleness.stale}\n`;
          previewMessage += `• Somewhat Stale (1-3 months): ${summary.staleness.somewhatStale}\n`;
          previewMessage += `• 1 week - 1 month: ${summary.staleness.recentWeek}\n`;
          previewMessage += `• 3 days - 1 week: ${summary.staleness.recentDays}\n`;
          previewMessage += `• 1-3 days: ${summary.staleness.veryRecent}\n`;
          previewMessage += `• Today: ${summary.staleness.today}\n`;
          previewMessage += `• No Activity Timestamp: ${summary.staleness.noActivityTimestamp}\n\n`;
        }
        
        // Creation info
        if (summary.creationInfo) {
          previewMessage += `📆 Creation Info:\n`;
          previewMessage += `• With CreatedAt: ${summary.creationInfo.withCreatedAt}\n`;
          previewMessage += `• Missing CreatedAt: ${summary.creationInfo.withoutCreatedAt}\n\n`;
        }
        
        if (sample.length > 0) {
          previewMessage += `Sample (first ${sample.length}):\n`;
          sample.forEach((homestead, index) => {
            const createdDate = homestead.createdAt ? new Date(homestead.createdAt).toLocaleDateString() : 'Unknown';
            
            // Calculate staleness for this sample (excluding createdAt from activity)
            const lastActivity = homestead.playersInGridLastUpdated || homestead.NPCsInGridLastUpdated || homestead.lastOptimized || homestead.updatedAt;
            let stalenessText = 'No activity timestamp';
            if (lastActivity) {
              const daysSince = Math.floor((new Date() - new Date(lastActivity)) / (1000 * 60 * 60 * 24));
              if (daysSince > 180) stalenessText = `${daysSince}d (Very Stale)`;
              else if (daysSince > 90) stalenessText = `${daysSince}d (Stale)`;
              else if (daysSince > 30) stalenessText = `${daysSince}d (Somewhat Stale)`;
              else if (daysSince > 7) stalenessText = `${daysSince}d`;
              else if (daysSince > 3) stalenessText = `${daysSince}d`;
              else if (daysSince > 1) stalenessText = `${daysSince}d`;
              else if (daysSince === 1) stalenessText = `1d`;
              else stalenessText = `Today (${daysSince}d)`;
            }
            
            // Check for data presence
            const hasData = (homestead.resources && homestead.resources.length > 0) ||
                           (homestead.resourcesV2 && homestead.resourcesV2.length > 0) ||
                           (homestead.tiles && homestead.tiles.length > 0) ||
                           (homestead.tilesV2 && homestead.tilesV2.length > 0);
            const dataText = hasData ? '📦' : '📭';
            
            // Add grid version and creation info
            const gridVersion = homestead.__v !== undefined ? `v${homestead.__v}` : 'v?';
            const createdText = homestead.createdAt ? `Created: ${createdDate}` : 'Created: Unknown';
            
            previewMessage += `${index + 1}. ${dataText} Grid: ${homestead._id.substring(0, 8)}... (${gridVersion}), ${createdText}, Last Activity: ${stalenessText}\n`;
          });
        }
        
        alert(previewMessage);
        updateStatus(`👁️ Found ${totalCount} orphaned homesteads`);
      } else {
        console.error('❌ Failed to preview orphaned homesteads:', response.data);
        updateStatus('❌ Failed to preview orphaned homesteads.');
        alert(`Failed to preview orphaned homesteads: ${response.data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('❌ Error previewing orphaned homesteads:', error);
      updateStatus('❌ Error previewing orphaned homesteads.');
      alert('Failed to preview orphaned homesteads. Check console for details.');
    }
  };

  const handleDeleteOrphanedHomesteads = async () => {
    // Initial confirmation
    const confirmed = window.confirm(
      `⚠️ DELETE ORPHANED HOMESTEADS ⚠️\n\n` +
      `This will permanently delete all homestead grids that have no corresponding player.\n\n` +
      `Based on your data:\n` +
      `• 295 total homesteads\n` +
      `• 170 valid players\n` +
      `• ~125 orphaned homesteads to delete\n\n` +
      `This action CANNOT be undone!\n\n` +
      `Continue with dry run first?`
    );

    if (!confirmed) return;

    try {
      // First, do a dry run
      console.log('🧪 Running dry run for orphaned homesteads deletion...');
      updateStatus('🧪 Performing dry run...');
      
      const dryRunResponse = await axios.post(`${API_BASE}/api/delete-orphaned-homesteads`, {
        confirm: true,
        dryRun: true
      });

      if (dryRunResponse.data.success) {
        const { details, orphanedSample } = dryRunResponse.data;
        const orphanedToDelete = details.orphanedToDelete;
        console.log('🧪 Dry run results:', dryRunResponse.data);
        
        // Show dry run results
        let dryRunMessage = `🧪 DRY RUN RESULTS\n\n`;
        dryRunMessage += `Total Homesteads: ${details.totalHomesteads}\n`;
        dryRunMessage += `Valid Players: ${details.playerCount}\n`;
        dryRunMessage += `Orphaned to Delete: ${orphanedToDelete}\n`;
        dryRunMessage += `Valid Remaining: ${details.validHomesteadsRemaining}\n\n`;
        
        if (orphanedSample.length > 0) {
          dryRunMessage += `Sample orphaned (first 5):\n`;
          orphanedSample.forEach((homestead, index) => {
            const createdDate = homestead.createdAt ? new Date(homestead.createdAt).toLocaleDateString() : 'Unknown';
            dryRunMessage += `${index + 1}. Grid: ${homestead._id.substring(0, 8)}..., Created: ${createdDate}\n`;
          });
        }
        
        dryRunMessage += `\nProceed with actual deletion?`;
        
        const proceedConfirmed = window.confirm(dryRunMessage);
        if (!proceedConfirmed) return;

        // Final confirmation for actual deletion
        const finalConfirmed = window.confirm(
          `⚠️ FINAL CONFIRMATION ⚠️\n\n` +
          `You are about to PERMANENTLY DELETE ${orphanedToDelete} orphaned homesteads.\n\n` +
          `This will free up database space and clean up orphaned data.\n` +
          `The ${details.validHomesteadsRemaining} valid homesteads will remain untouched.\n\n` +
          `Type "DELETE ORPHANED" in the next prompt to continue...`
        );

        if (!finalConfirmed) return;

        const deleteConfirmation = window.prompt(
          `Type "DELETE ORPHANED" to confirm deletion:`
        );

        if (deleteConfirmation !== "DELETE ORPHANED") {
          alert("Deletion cancelled - confirmation text did not match.");
          return;
        }

        // Perform actual deletion
        console.log('🗑️ Starting orphaned homesteads deletion...');
        updateStatus('🗑️ Deleting orphaned homesteads...');
        
        const deleteResponse = await axios.post(`${API_BASE}/api/delete-orphaned-homesteads`, {
          confirm: true,
          dryRun: false
        });

        if (deleteResponse.data.success) {
          const { deleted, errors, details: finalDetails } = deleteResponse.data;
          console.log('✅ Orphaned homesteads cleanup completed:', deleteResponse.data);
          updateStatus(`✅ Cleanup complete: ${deleted} deleted, ${errors} errors`);
          
          // Show success results
          const successMessage = 
            `✅ Orphaned Homesteads Cleanup Complete!\n\n` +
            `Deleted: ${deleted} orphaned homesteads\n` +
            `Errors: ${errors}\n\n` +
            `Before: ${finalDetails.beforeCounts.homesteads} homesteads, ${finalDetails.beforeCounts.players} players\n` +
            `After: ${finalDetails.afterCounts.homesteads} homesteads, ${finalDetails.afterCounts.players} players\n\n` +
            `Match Expected: ${finalDetails.afterCounts.expectedMatch ? 'YES' : 'NO'}\n\n` +
            `Database space has been freed by removing orphaned data.`;
          
          alert(successMessage);
        } else {
          console.error('❌ Orphaned homesteads deletion failed:', deleteResponse.data);
          updateStatus('❌ Orphaned homesteads deletion failed.');
          alert(`Orphaned homesteads deletion failed: ${deleteResponse.data.error || 'Unknown error'}`);
        }
      } else {
        console.error('❌ Dry run failed:', dryRunResponse.data);
        updateStatus('❌ Dry run failed.');
        alert(`Dry run failed: ${dryRunResponse.data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('❌ Error during orphaned homesteads cleanup:', error);
      updateStatus('❌ Error during orphaned homesteads cleanup.');
      alert('Orphaned homesteads cleanup failed. Check console for details.');
    }
  };


  return (
    <Panel onClose={onClose} titleKey="1120" panelName="DebugPanel">
      <div className="shared-buttons">
        <button className="btn-basic btn-danger" onClick={handleCreateNewFrontier}> Create New Frontier </button>
      </div>
      <div className="shared-buttons">
        <button className="btn-basic btn-danger" onClick={handleResetGrid}> Reset This Grid </button>
      </div>
      <div className="shared-buttons">
        <button className="btn-basic btn-danger" onClick={handleRemoveHomestead}> Remove Homestead </button>
      </div>
      <div className="shared-buttons">
        <button className="btn-basic btn-danger" onClick={handleGenerateTown}> Generate Town </button>
      </div>
      <div className="shared-buttons">
        <button className="btn-basic btn-danger" onClick={() => handleGenerateValley(0)}> Generate Valley 0 </button>
      </div>
      <div className="shared-buttons">
        <button className="btn-basic btn-danger" onClick={() => handleGenerateValley(1)}> Generate Valley 1 </button>
      </div>
      <div className="shared-buttons">
        <button className="btn-basic btn-danger" onClick={() => handleGenerateValley(2)}> Generate Valley 2 </button>
      </div>
      <div className="shared-buttons">
        <button className="btn-basic btn-danger" onClick={() => handleGenerateValley(3)}> Generate Valley 3 </button>
      </div>
      <div className="shared-buttons">
        <button className="btn-basic btn-neutral" onClick={handleClearInventory}> Clear Inventory </button>
      </div>
      <div className="shared-buttons">
        <button className="btn-basic btn-neutral" onClick={handleClearSkillsAndPowers}> Clear Skills & Powers </button>
      </div>
      <div className="shared-buttons">
        <button className="btn-basic btn-neutral" onClick={handleResetCombatStats}> Reset Combat Stats </button>
      </div>
      <div className="shared-buttons">
        <button className="btn-basic btn-neutral" onClick={handleClearQuestHistory}> Clear Quest History </button>
      </div>
      <div className="shared-buttons">
        <button className="btn-basic btn-neutral" onClick={handleClearGridState}> Clear Grid State </button>
      </div>
      <div className="shared-buttons">
        <button className="btn-basic btn-neutral" onClick={handleClearTradeStall}> Clear Trade Stall </button>
      </div>
      <div className="shared-buttons">
        <button className="btn-basic btn-neutral" onClick={handleClearTrophies}> Clear Trophies </button>
      </div>
      <div className="shared-buttons">
        <button className="btn-basic btn-success" onClick={handleResetFTUE}> Reset FTUE </button>
      </div>
      <div className="shared-buttons">
        <button className="btn-basic btn-success" onClick={handleWelcomeMessage}> Resend Welcome Message </button>
      </div>
      <div className="shared-buttons">
        <button className="btn-basic btn-success" onClick={handleRewardMessage}> Resend Reward Message </button>
      </div>
      <div className="shared-buttons">
        <button className="btn-basic btn-success" onClick={handleAddMoney}> Add Money </button>
      </div>
      <div className="shared-buttons">
        <button className="btn-basic btn-success" onClick={handleGetRich}> Get Rich </button>
      </div>
      <div className="shared-buttons">
        <button className="btn-basic btn-success" onClick={handleGetSkills}> Get Skills </button>
      </div>

      <h3>📦 Database Optimization</h3>
      <h4>Resources:</h4>
      <div className="shared-buttons">
        <button className="btn-basic btn-warning" onClick={handleGenerateCompactDBResources}> Generate Compact DB Resources for This Grid </button>
      </div>
      <div className="shared-buttons">
        <button className="btn-basic btn-danger" onClick={handleDeleteOldDBResourcesSchema}> Delete Old DB Resources Schema for This Grid </button>
      </div>
      <h4>Tiles:</h4>
      <div className="shared-buttons">
        <button className="btn-basic btn-warning" onClick={handleGenerateCompactDBTiles}> Generate Compact DB Tiles for This Grid </button>
      </div>
      <div className="shared-buttons">
        <button className="btn-basic btn-danger" onClick={handleDeleteOldDBTilesSchema}> Delete Old DB Tiles Schema for This Grid </button>
      </div>
      
      <h4>Bulk Migration (Non-Homesteads):</h4>
      <div className="shared-buttons">
        <button className="btn-basic btn-warning" onClick={handleBulkMigrateValleysTowns}> Generate V2 DB for Valleys and Towns </button>
      </div>
      <div className="shared-buttons">
        <button className="btn-basic btn-danger" onClick={handleBulkDeleteValleysTownsV1}> Delete V1 DB for Valleys and Towns </button>
      </div>
      <div className="shared-buttons">
        <button className="btn-basic btn-info" onClick={handleCheckMigrationStatus}> Check Migration Status </button>
      </div>
      <div className="shared-buttons">
        <button className="btn-basic btn-info" onClick={handleDebugUnmigratedGrids}> Debug Unmigrated Grids </button>
      </div>
      
      <h4>Bulk Migration (Homesteads):</h4>
      <div className="shared-buttons">
        <button className="btn-basic btn-warning" onClick={handleBulkMigrateHomesteads}> Generate V2 DB for Homesteads </button>
      </div>
      <div className="shared-buttons">
        <button className="btn-basic btn-danger" onClick={handleBulkDeleteHomesteadsV1}> Delete V1 DB for Homesteads </button>
      </div>
      <div className="shared-buttons">
        <button className="btn-basic btn-info" onClick={handleCheckHomesteadMigrationStatus}> Check Homestead Migration Status </button>
      </div>
      
      <h4>Orphaned Homesteads Cleanup:</h4>
      <div className="shared-buttons">
        <button className="btn-basic btn-info" onClick={handlePreviewOrphanedHomesteads}> 👁️ Preview Orphaned Homesteads </button>
      </div>
      <div className="shared-buttons">
        <button className="btn-basic btn-danger" onClick={handleDeleteOrphanedHomesteads}> 🗑️ Delete Orphaned Homesteads </button>
      </div>

        <h3>Create Single Valley Grid</h3>
        <input
          type="text"
          placeholder="Enter GridCoord"
          value={singleGridCoord}
          onChange={(e) => setSingleGridCoord(e.target.value)}
        />
        <div className="shared-buttons">
          <button
            className="btn-basic btn-danger"
            onClick={async () => {
              const settlementId = currentPlayer?.location?.s;
              const frontierId = currentPlayer?.location?.f;
              const gridType = currentPlayer?.location?.gtype || 'valley0';
              if (!singleGridCoord || !settlementId || !frontierId) {
                alert("Missing gridCoord, settlementId, or frontierId.");
                return;
              }
              try {
                await createSingleValleyGrid({
                  gridCoord: singleGridCoord,
                });
              } catch (error) {
                console.error("Error creating single valley grid:", error);
                alert("Failed to create valley grid. See console for details.");
              }
            }}
          >
            Create Grid
          </button>
        </div>

        <h3>Teleport to Another Grid</h3>
        <input
          type="text"
          placeholder="Enter Username"
          value={toGridCoord}
          onChange={(e) => setToGridCoord(e.target.value)}
        />
        <div className="shared-buttons">
          <button
            className="btn-basic btn-danger"
            onClick={async () => {
              try {
                const parsedCoord = parseInt(toGridCoord, 10);
                if (isNaN(parsedCoord)) {
                  alert("Invalid gridCoord (not a number).");
                  return;
                }
                await handleTeleport(parsedCoord);
              } catch (error) {
                console.error("Error teleporting:", error);
                alert("Failed to teleport.");
              }
            }}
          >
            Teleport
          </button>
        </div>
        

        <h3>Delete User Account</h3>
        <input
          type="text"
          placeholder="Enter Username"
          value={usernameToDelete}
          onChange={(e) => setUsernameToDelete(e.target.value)}
        />
        <div className="shared-buttons">
          <button
            className="btn-basic btn-danger"
            onClick={async () => {
              const confirmed = window.confirm(`⚠️ Are you absolutely sure you want to permanently delete the account for "${usernameToDelete}"? This cannot be undone.`);
              if (!confirmed) return;

              try {
                await handleDeleteAccount({
                  username: usernameToDelete,
                });
              } catch (error) {
                console.error("Error deleting user account:", error);
                alert("Failed to delete user account. See console for details.");
              }
            }}
          >
            Delete
          </button>
        </div>
        

        <h3>Send Message to All Users</h3>
        <input
          type="text"
          placeholder="Enter Message ID"
          value={messageIdentifier}
          onChange={(e) => setMessageIdentifier(e.target.value)}
        />
        <div className="shared-buttons">
          <button
            className="btn-basic btn-danger"
            onClick={async () => {
              if (!messageIdentifier) {
                alert("Please enter a message ID.");
                return;
              }
              try {
                await sendMessageToAll(Number(messageIdentifier));
              } catch (error) {
                console.error("Error sending message to all users:", error);
                alert("Failed to send message. See console for details.");
              }
            }}
          >
            Send Message
          </button>
        </div>

    <br />
    <h3>FTUE Step: {currentPlayer?.ftuestep || "Not set"}</h3>
    <h3>Warehouse Level: {currentPlayer?.warehouseLevel ?? 0}</h3>

      <div className="debug-timers">
        <h3>⏳ Active Timers:</h3>
        {timers.length > 0 ? (
          <ul>
            {timers.map((res, index) => (
              <li key={index}>
                {res.type} at ({res.x}, {res.y}) - 
                {res.growEnd ? ` 🌱 Farming Timer Ends in ${res.remainingTime}s` : ""}
                {res.craftedItem ? ` 🛠️ ${res.craftedItem}: ` : ""}
                {res.craftEnd ? ` Ends in ${res.remainingTime}s` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p>No active timers.</p>
        )}
      </div>
          
    <GridStateDebugPanel
      gridId={currentGridId}
      gridCoord={currentPlayer?.location?.gridCoord}
      gridType={currentPlayer?.location?.gtype}
      settlementId={currentPlayer?.location?.s}
      NPCsInGrid={{ [currentGridId]: NPCsInGridManager.getNPCsInGrid(currentGridId) }}
      playersInGrid={{ [currentGridId]: playersInGridManager.getPlayersInGrid(currentGridId) }}
    />

    </Panel>
  );
};

export default DebugPanel;