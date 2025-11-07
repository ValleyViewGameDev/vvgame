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
import { updatePlayerSettings } from '../settings';

const DebugPanel = ({ 
  onClose, 
  currentPlayer, 
  setCurrentPlayer, 
  setInventory, 
  setResources, 
  currentGridId, 
  updateStatus, 
  TILE_SIZE, 
  setGrid, 
  setGridId, 
  setTileTypes, 
  closeAllPanels
}) => {
  const [timers, setTimers] = useState([]);
  const [npcs, setNPCs] = useState([]);
  const [pcs, setPCs] = useState([]);
  const [updatedNPCs, setUpdatedNPCs] = useState(npcs);
  const [refreshDebug, setRefreshDebug] = useState(false);
  const [singleGridCoord, setSingleGridCoord] = useState('');
  const [toGridCoord, setToGridCoord] = useState('');
  const [usernameToDelete, setUsernameToDelete] = useState('');
  const [messageIdentifier, setMessageIdentifier] = useState('');
  
  // Performance monitoring state
  const [performanceMetrics, setPerformanceMetrics] = useState({
    fps: 0,
    domElementCount: 0,
    memoryUsage: 0,
    renderMode: 'Unknown'
  });
  
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

  // Performance monitoring useEffect
  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let animationFrameId;

    const measurePerformance = () => {
      frameCount++;
      const currentTime = performance.now();
      
      // Calculate FPS every second
      if (currentTime - lastTime >= 1000) {
        const fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
        
        // Count DOM elements
        const domElementCount = document.querySelectorAll('*').length;
        
        // Detect render mode by checking for canvas vs DOM tiles
        const hasCanvasTiles = document.querySelector('canvas[style*="position: absolute"]') !== null;
        const hasDOMTiles = document.querySelector('.tile-g, .tile-s, .tile-d, .tile-w, .tile-l, .tile-p, .tile-n, .tile-o') !== null;
        let renderMode = 'Unknown';
        if (hasCanvasTiles && !hasDOMTiles) {
          renderMode = 'Canvas';
        } else if (!hasCanvasTiles && hasDOMTiles) {
          renderMode = 'DOM';
        } else if (hasCanvasTiles && hasDOMTiles) {
          renderMode = 'Mixed';
        }
        
        // Get memory usage if available
        let memoryUsage = 0;
        if (performance.memory) {
          memoryUsage = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024); // MB
        }
        
        setPerformanceMetrics({
          fps,
          domElementCount,
          memoryUsage,
          renderMode
        });
        
        frameCount = 0;
        lastTime = currentTime;
      }
      
      animationFrameId = requestAnimationFrame(measurePerformance);
    };
    
    animationFrameId = requestAnimationFrame(measurePerformance);
    
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, []);




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


  return (
    <Panel onClose={onClose} titleKey="1120" panelName="DebugPanel">
      {/* Performance Metrics Section */}
      <div style={{ 
        backgroundColor: '#f0f0f0', 
        padding: '10px', 
        marginBottom: '15px', 
        borderRadius: '5px',
        fontFamily: 'monospace',
        fontSize: '12px'
      }}>
        <h3 style={{ margin: '0 0 10px 0', color: '#333' }}>⚡ Performance Metrics</h3>
        
        {/* Canvas mode is now forced - no toggle buttons needed */}
        <div style={{ marginBottom: '10px', fontSize: '12px', color: '#666' }}>
          🎨 Rendering Mode: <strong style={{ color: 'green' }}>Canvas (Forced)</strong>
        </div>
        
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <strong>FPS:</strong> <span style={{ color: performanceMetrics.fps >= 30 ? 'green' : performanceMetrics.fps >= 15 ? 'orange' : 'red' }}>
              {performanceMetrics.fps}
            </span>
          </div>
          <div>
            <strong>Render Mode:</strong> <span style={{ color: performanceMetrics.renderMode === 'Canvas' ? 'green' : 'blue' }}>
              {performanceMetrics.renderMode}
            </span>
          </div>
          <div>
            <strong>DOM Elements:</strong> {performanceMetrics.domElementCount.toLocaleString()}
          </div>
          {performanceMetrics.memoryUsage > 0 && (
            <div>
              <strong>Memory:</strong> {performanceMetrics.memoryUsage} MB
            </div>
          )}
        </div>
      </div>
      
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