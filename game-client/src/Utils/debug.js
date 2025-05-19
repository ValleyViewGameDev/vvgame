import API_BASE from '../config';
import axios from 'axios';
import React, { useState, useEffect } from 'react';
import Panel from '../UI/Panel';
import '../UI/Panel.css'; // Specific styles for Debug Panel
import { fetchInventory, updateInventory, refreshPlayerAfterInventoryUpdate } from './InventoryManagement';
import { fetchGridData } from './GridManagement';
import NPCsInGridManager from '../GridState/GridStateNPCs'; // Use default export for NPCsInGridManager
import playersInGridManager from '../GridState/PlayersInGrid';

const DebugPanel = ({ onClose, currentPlayer, setCurrentPlayer, setInventory, setResources, currentGridId, updateStatus }) => {
  const [timers, setTimers] = useState([]);
  const [npcs, setNPCs] = useState([]);
  const [pcs, setPCs] = useState([]);
  const [updatedNPCs, setUpdatedNPCs] = useState(npcs);
  const [refreshDebug, setRefreshDebug] = useState(false);
  
  // Fetch resources with timers when the panel opens or gridId changes
  useEffect(() => {
    if (!currentGridId) return;

    const fetchTimers = async () => {
        try {
            console.log('Fetching timers for gridId:', currentGridId);
            const gridData = await fetchGridData(currentGridId);

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

  const handleGenerateTown = async () => {
    try {
      const settlementId = currentPlayer.location.s;
      if (!settlementId) {
        console.error('No settlement ID found for the current player.');
        alert('No settlement ID found for the current player.');
        return;
      }
  
      // Fetch the settlement data
      const response = await axios.get(
        `${API_BASE}/api/get-settlement/${settlementId}`
      );
  
      const settlement = response.data;
      if (!settlement || !settlement.grids || settlement.grids.length === 0) {
        console.error('Settlement data is incomplete or missing grids.');
        alert('Settlement data is incomplete or missing grids.');
        return;
      }
  
      // Find all uninitialized town grids by looking for gridType === 'town' but no gridId
      const townGrids = [];
      settlement.grids.forEach((row) => {
        row.forEach((grid) => {
          if (grid.gridType === 'town' && !grid.gridId) {
            // Instead of placeholderName, push the gridCoord
            townGrids.push(grid.gridCoord);
          }
        });
      });
  
      if (townGrids.length === 0) {
        console.log('No uninitialized town grids found in this settlement.');
        alert('No uninitialized town grids found in this settlement.');
        return;
      }
  
      console.log(`Found ${townGrids.length} uninitialized town grids. Processing grids...`);
  
      // Generate/create each town grid by passing gridCoord
      for (const gridCoord of townGrids) {
        try {
          console.log(`Creating Town grid with gridCoord: ${gridCoord}`);
  
          const result = await axios.post(`${API_BASE}/api/create-grid`, {
            gridCoord,             // instead of placeholderName
            gridType: 'town',
            settlementId,
            frontierId: settlement.frontierId,
          });
  
          console.log(`Processed town grid for gridCoord: ${gridCoord}`, result.data);
  
        } catch (gridError) {
          console.error(`Failed to process grid for gridCoord: ${gridCoord}`, gridError);
        }
      }
  
      alert('Town grids created successfully!');
    } catch (error) {
      console.error('Error processing town grids:', error);
      alert('Failed to create town grids. Check the console for details.');
    }
  };
  
  const handleAddMoney = async () => {
    try {
      const playerId = currentPlayer?.playerId;
      if (!playerId) {
        console.error('No user logged in. Cannot add money.');
        return;
      }

      // Fetch the latest inventory
      const currentInventory = await fetchInventory(playerId);

      // Add 1000 Money to the inventory
      await updateInventory(currentPlayer, 'Money', 10000, setCurrentPlayer);

      // Update the state
      const updatedInventory = currentInventory.map((item) =>
        item.type === 'Money'
          ? { ...item, quantity: item.quantity + 10000 }
          : item
      );
      setInventory(updatedInventory);

      console.log('Added 1000 Money successfully.');
    } catch (error) {
      console.error('Error adding money:', error);
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
        { type: 'Wood', quantity: 10000 },
        { type: 'Clay', quantity: 10000 },
        { type: 'Stone', quantity: 10000 },
        { type: 'Wheat', quantity: 10000 },
        { type: 'Corn', quantity: 10000 },
        { type: 'Carrot', quantity: 10000 },
        { type: 'Potion 1', quantity: 50 },
        { type: 'Potion 2', quantity: 50 },
        { type: 'Cloth', quantity: 500 },
        { type: 'Lumber', quantity: 500 },
        { type: 'Thread', quantity: 500 },
        { type: 'Metal', quantity: 500 },
        { type: 'Aged Wine', quantity: 500 },
        { type: 'Sweater', quantity: 5000 },
        { type: 'Aged Wine', quantity: 500 },
        { type: 'Cheese', quantity: 5000 },
        { type: 'Sugarcane', quantity: 5000 },
        { type: 'Strawberry', quantity: 5000 },
        { type: 'Diamond', quantity: 500 },
        { type: 'Feverfew', quantity: 100 },
        { type: 'Golden Key', quantity: 100 },
      ];
  
      // Fetch the latest inventory and work on a copy
      let updatedInventory = [...currentPlayer.inventory];
  
      // Process each resource and update the inventory in-memory
      for (const resource of resourcesToAdd) {
        const resourceIndex = updatedInventory.findIndex((item) => item.type === resource.type);
        if (resourceIndex !== -1) {
          updatedInventory[resourceIndex].quantity += resource.quantity;
        } else {
          updatedInventory.push({ type: resource.type, quantity: resource.quantity });
        }
  
        // Call updateInventory for each resource (server update only)
        await updateInventory(
          { ...currentPlayer, inventory: updatedInventory }, // Simulate the updated player
          resource.type,
          resource.quantity,
          () => {} // Temporarily bypass setCurrentPlayer
        );
      }
  
      // Update state once with the final aggregated inventory
      const finalPlayerState = { ...currentPlayer, inventory: updatedInventory };
      setCurrentPlayer(finalPlayerState);
      localStorage.setItem('player', JSON.stringify(finalPlayerState));
      setInventory(updatedInventory);
  
      console.log('Get Rich: Inventory updated successfully.');
    } catch (error) {
      console.error('Error performing Get Rich:', error);
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
  
  const handleClearInventory = async () => {
    try {
      const playerId = currentPlayer?.playerId;
      if (!playerId) {
        console.error('No player ID found. Cannot clear inventory and skills.');
        return;
      }
  
      // Retain only Money in the inventory
      const filteredInventory = currentPlayer.inventory.filter(
        (item) => item.type === 'Money'
      );
      console.log('Filtered inventory to retain only Money:', filteredInventory);
  
      // Clear skills and upgrades
      const clearedSkills = [];
      console.log('Clearing all skills and upgrades.');
  
      // Update inventory on the server
      await axios.post(`${API_BASE}/api/update-inventory`, {
        playerId,
        inventory: filteredInventory,
        backpack: currentPlayer.backpack || [], // Ensure backpack is included
      });
      console.log('Inventory updated successfully on the server.');
  
      // Update skills on the server
      await axios.post(`${API_BASE}/api/update-skills`, {
        playerId,
        skills: clearedSkills,
      });
      console.log('Skills cleared successfully on the server.');
  
      // Refresh player data after updates
      await refreshPlayerAfterInventoryUpdate(playerId, setCurrentPlayer);
  
      // Force a re-fetch to confirm changes are saved
      const updatedInventory = await fetchInventory(playerId);
      console.log('Fetched inventory after clearing:', updatedInventory);
  
      // Update the local state for inventory and skills
      setInventory(updatedInventory);
      setCurrentPlayer((prevPlayer) => ({
        ...prevPlayer,
        inventory: updatedInventory,
        skills: clearedSkills,
      }));
      updateStatus(900);
      console.log('Inventory and skills cleared successfully except for Money.');

    } catch (error) {
      console.error('Error clearing inventory and skills:', error);
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

  const handleGenerateValley = async (valleyType) => {
    try {
      const frontierId = currentPlayer?.location?.f;
      if (!frontierId) {
        console.error("No frontier ID found for the current player.");
        alert("No frontier ID found for the current player.");
        return;
      }
  
      console.log(`Fetching frontier data for ID: ${frontierId}`);
      const frontierResponse = await axios.get(`${API_BASE}/api/get-frontier/${frontierId}`);
      const frontierData = frontierResponse.data;
  
      if (!frontierData || !frontierData.settlements) {
        console.error("Frontier data is incomplete or missing settlements.");
        alert("Frontier data is incomplete or missing settlements.");
        return;
      }
  
      console.log(`Searching settlements for valley${valleyType} grids.`);
      const valleyGrids = [];
  
      // 1) For each settlement in the frontier, fetch its data
      for (const settlementRow of frontierData.settlements) {
        for (const settlement of settlementRow) {
          if (!settlement?.settlementId) {
            console.warn("Settlement is invalid or missing settlementId. Skipping.");
            continue;
          }
  
          try {
            console.log("Fetching settlement data for settlement ID:", settlement.settlementId);
            const settlementResponse = await axios.get(
              `${API_BASE}/api/get-settlement/${settlement.settlementId}`
            );
            const settlementData = settlementResponse.data;
  
            if (!settlementData?.grids) {
              console.warn(`Settlement ${settlement.settlementId} has no grids. Skipping.`);
              continue;
            }
  
            // 2) Find all uninitialized valleyX sub-grids (i.e., same valleyType, no gridId)
            settlementData.grids.flat().forEach((grid) => {
              if (grid.gridType === `valley${valleyType}` && !grid.gridId) {
                valleyGrids.push({
                  ...grid,
                  settlementId: settlement.settlementId,
                });
              }
            });
          } catch (error) {
            console.error(`Failed to fetch data for settlement ${settlement.settlementId}:`, error);
          }
        }
      }
  
      if (valleyGrids.length === 0) {
        console.log(`No valley${valleyType} grids found in this frontier.`);
        alert(`No valley${valleyType} grids found in this frontier.`);
        return;
      }
  
      console.log(`Found ${valleyGrids.length} valley${valleyType} grids. Starting generation process.`);
  
      // 3) Create each valley grid via /create-grid, sending gridCoord instead of placeholderName
      for (const valleyGrid of valleyGrids) {
        try {
          console.log(
            `Creating valley${valleyType} grid with gridCoord: ${valleyGrid.gridCoord}, Settlement ID: ${valleyGrid.settlementId}`
          );
  
          await axios.post(`${API_BASE}/api/create-grid`, {
            gridCoord: valleyGrid.gridCoord,
            gridType: valleyGrid.gridType, // 'valley0', 'valley1', 'valley2', or 'valley3'
            settlementId: valleyGrid.settlementId,
            frontierId: frontierId,
          });
  
          console.log(`Successfully created valley${valleyType} grid for gridCoord: ${valleyGrid.gridCoord}`);
        } catch (error) {
          console.error(
            `Error creating valley${valleyType} grid with gridCoord ${valleyGrid.gridCoord}:`,
            error
          );
        }
      }
  
      alert(`Valley${valleyType} grids processed successfully!`);
    } catch (error) {
      console.error(`Error processing valley${valleyType} grids:`, error);
      alert(`Failed to process valley${valleyType} grids. Check the console for details.`);
    }
  };
 
  
  const handleAttributeChange = (npcId, attribute, newValue) => {
    setNPCs((prevNPCs) => {
      const updatedNPCs = prevNPCs.map((npc) =>
        npc.id === npcId ? { ...npc, [attribute]: parseFloat(newValue) || 0 } : npc
      );
  
      // Update the actual NPC object in the game state
      const NPCsInGrid = NPCsInGridManager.getNPCsInGrid(currentGridId);
      if (NPCsInGrid && NPCsInGrid.npcs[npcId]) {
        NPCsInGrid.npcs[npcId][attribute] = parseFloat(newValue) || 0;
      }
  
      return updatedNPCs;
    });
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

  return (
    <Panel onClose={onClose} titleKey="1120" panelName="DebugPanel">
      <div className="debug-buttons">
        <button className="btn-success" onClick={handleWelcomeMessage}> Resend Welcome Message </button>
        <button className="btn-success" onClick={handleRewardMessage}> Resend Reward Message </button>
        <button className="btn-danger" onClick={handleCreateNewFrontier}> Create New Frontier </button>
        <button className="btn-danger" onClick={handleResetGrid}> Reset This Grid </button>
        <button className="btn-danger" onClick={handleGenerateTown}> Generate Town </button>
        <button className="btn-danger" onClick={() => handleGenerateValley(0)}> Generate Valley 0 </button>
        <button className="btn-danger" onClick={() => handleGenerateValley(1)}> Generate Valley 1 </button>
        <button className="btn-danger" onClick={() => handleGenerateValley(2)}> Generate Valley 2 </button>
        <button className="btn-danger" onClick={() => handleGenerateValley(3)}> Generate Valley 3 </button>
        <button className="btn-danger" onClick={handleClearInventory}> Clear Inventory & Skills </button>
        <button className="btn-danger" onClick={handleClearQuestHistory}> Clear Quest History </button>
        <button className="btn-danger" onClick={handleClearGridState}> Clear Grid State </button>
        <button className="btn-neutral" onClick={handleClearTradeStall}> Clear Trade Stall </button>
        <button className="btn-success" onClick={handleAddMoney}> Add Money </button>
        <button className="btn-success" onClick={handleGetRich}> Get Rich </button>
        <button className="btn-success" onClick={handleGetSkills}> Get Skills </button>
        <button className="btn-neutral" onClick={() => setRefreshDebug((prev) => !prev)} > Refresh Debug Panel </button>
      </div>
      <div className="debug-entities">


      <h3>Active NPCs:</h3>

      {npcs.length > 0 ? (
       <ul style={{ listStyleType: 'none', padding: 0 }}>
        {npcs.map((npc) => (
            <li key={npc.id}>
                <pre
                  style={{
                    background: '#f4f4f4',
                    padding: '10px',
                    borderRadius: '5px',
                    overflowX: 'auto',
                  }}
                >
        <p>{npc.type} no. {npc.id}</p>
        <p>action: {npc.action}</p>
        <p>state: {npc.state}</p>
        <p>x: {npc.position.x}</p>
        <p>y: {npc.position.y}</p>
        <p>hp/hunger: {npc.hp}</p>
        <p>maxhp: {npc.maxhp}</p>
        <p>lastUpdated: {npc.lastUpdated}</p>
        <p>nextspawn: {npc.nextspawn}</p>
                
                </pre>
                <div style={{ margin: '10px 0' }}>
                  {['maxhp', 'growTime', 'speed', 'range', 'attackrange', 'armorclass', 'attackbonus', 'damage', 'iscamping'].map((attribute) => (
                    <div key={attribute} style={{ marginBottom: '5px' }}>
                      <label>
                        <strong>{attribute}:</strong>
                      </label>

                      <input
                        type="number"
                        value={npc[attribute] || 0}
                        onChange={(e) => handleAttributeChange(npc.id, attribute, e.target.value)}
                        style={{
                          width: '50px',
                          textAlign: 'center',
                          marginRight: '5px',
                        }}
                      />

                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p>No active NPCs.</p>
        )}
      </div>


      <div className="debug-timers">
        <h3>😀 Active PCs:</h3>

        {pcs.length > 0 ? (
        <ul style={{ listStyleType: 'none', padding: 0 }}>
            {pcs.map((pc) => (
              <p key={pc.playerId}>
                {pc.username} ({pc.playerId}) 
                Position: ({pc.position.x}, {pc.position.y})
                ❤️‍🩹 HP: {pc.hp}
              </p>
            ))}
          </ul>
          
        ) : (
          <p>No active PCs.</p>
        )}
      </div>

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

      {currentPlayer?.location ? (
        <div className="debug-player-location">
          <h3>📍 Current Location:</h3>
          <p>FrontierID: {currentPlayer.location.f || 'N/A'}</p>
          <p>SettlementID: {currentPlayer.location.s || 'N/A'}</p>
          <p>GridID: {currentPlayer.location.g || 'N/A'}</p>
          <p>GridType: {currentPlayer.location.gtype || 'N/A'}</p>
        </div>
      ) : (
        <p>No player location data available.</p>
      )}
    </Panel>
  );
};

export default DebugPanel;