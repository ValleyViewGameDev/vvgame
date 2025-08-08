import API_BASE from '../../config.js';
import ChangeIconModal from '../../UI/ChangeIconModal';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panel';
import axios from 'axios';
import { StatusBarContext } from '../../UI/StatusBar';
import { usePanelContext } from '../../UI/PanelContext';
import { spendIngredients } from '../../Utils/InventoryManagement';
import NPCsInGridManager from '../../GridState/GridStateNPCs.js';
import playersInGridManager from '../../GridState/PlayersInGrid';
import RelationshipCard from '../Relationships/RelationshipCard';
import '../Relationships/Relationships.css';
import socket from '../../socketManager';

const SocialPanel = ({
  onClose,
  pcData,
  currentPlayer,
  setCurrentPlayer,
  inventory,
  setInventory,
  backpack,
  setBackpack,
  updateStatus,
  masterInteractions,
  isDeveloper,
  controllerUsername,
  setControllerUsername,
}) => {
  const [tentCount, setTentCount] = useState(0);
  const [boatCount, setBoatCount] = useState(0);
  const [isCamping, setIsCamping] = useState(false);
  const [isInBoat, setIsInBoat] = useState(false);
  const [displayedPCData, setDisplayedPCData] = useState(pcData);
  const [showChangeIconModal, setShowChangeIconModal] = useState(false);

  console.log('made it to SocialPanel; pc = ', pcData);

  useEffect(() => {
    if (!pcData) return;
    
    // ✅ Update displayed data when viewing other players
    if (pcData.username !== currentPlayer.username) {
      const gridId = currentPlayer?.location?.g;
      if (!gridId) return;
      
      const NPCsInGrid = playersInGridManager.getPlayersInGrid(gridId);
      const latestData = NPCsInGrid[pcData.playerId];
      if (latestData) {
          setIsCamping(latestData.iscamping || false);
          setIsInBoat(latestData.isinboat || false);
          setDisplayedPCData(prev => ({
            ...prev,
            iscamping: latestData.iscamping,
            isinboat: latestData.isinboat,
            hp: latestData.hp,
            username: latestData.username,
          }));
      }
    }
}, [pcData, currentPlayer]);


  useEffect(() => {
    if (!pcData) {
      console.warn("SocialPanel was opened with missing pcData.");
      setDisplayedPCData({ username: "Unknown", hp: 0, iscamping: false });
      return;
    }

    // ✅ Check if the selected PC is the current player
    if (pcData.username === currentPlayer.username) {
      // Update displayed data with current player's latest state
      setDisplayedPCData({
        ...pcData,
        iscamping: currentPlayer.iscamping || false,
        isinboat: currentPlayer.isinboat || false,
        hp: currentPlayer.hp || pcData.hp
      });
      
      setIsCamping(currentPlayer.iscamping || false);
      setIsInBoat(currentPlayer.isinboat || false);

      // ✅ Get tent count from Backpack
      const tentsInBackpack = currentPlayer.backpack?.find(item => item.type === "Tent")?.quantity || 0;
      setTentCount(tentsInBackpack);

      // ✅ Get boat count from Backpack
      const boatsInBackpack = currentPlayer.backpack?.find(item => item.type === "Boat")?.quantity || 0;
      setBoatCount(boatsInBackpack);
    } else {
      setDisplayedPCData(pcData);
    }
  }, [pcData, currentPlayer, currentPlayer.iscamping, currentPlayer.isinboat]);

  // ✅ Handle Pitching a Tent
  const handlePitchTent = async () => {
    console.log("⛺️ handlePitchTent called; tentCount = ", tentCount);
    if (tentCount <= 0) return;

    // Optimistically update UI immediately
    setIsCamping(true);
    setDisplayedPCData(prev => ({ ...prev, iscamping: true }));
    setCurrentPlayer(prev => ({ ...prev, iscamping: true }));
    
    // Optimistically reduce tent count
    setTentCount(prev => prev - 1);

    try {
      // First update the camping status
      const response = await axios.post(`${API_BASE}/api/update-profile`, {
        playerId: currentPlayer.playerId,
        updates: { iscamping: true },
      });

      if (!response.data.success) {
        // Revert all optimistic updates if server update failed
        setIsCamping(false);
        setDisplayedPCData(prev => ({ ...prev, iscamping: false }));
        setCurrentPlayer(prev => ({ ...prev, iscamping: false }));
        setTentCount(prev => prev + 1);
        return;
      }

      // Then spend the tent
      const fakeRecipe = { ingredient1: "Tent", ingredient1qty: 1 };
      const success = await spendIngredients({
        playerId: currentPlayer.playerId,
        recipe: fakeRecipe,
        inventory,
        backpack,
        setInventory,
        setBackpack,
        setCurrentPlayer,
        updateStatus,
      });

      if (!success) {
        // Revert camping status if we couldn't spend the tent
        await axios.post(`${API_BASE}/api/update-profile`, {
          playerId: currentPlayer.playerId,
          updates: { iscamping: false },
        });
        setIsCamping(false);
        setDisplayedPCData(prev => ({ ...prev, iscamping: false }));
        setCurrentPlayer(prev => ({ ...prev, iscamping: false }));
        setTentCount(prev => prev + 1);
        return;
      }

      console.log('⛺️ iscamping: updated profile successfully');
      updateStatus(28);
      
      // Update PlayersInGrid directly
      const gridId = currentPlayer?.location?.g;
      if (gridId) {
        playersInGridManager.updatePC(gridId, currentPlayer.playerId, { iscamping: true });
      }
    } catch (error) {
      console.error("❌ Error pitching tent:", error);
      updateStatus(29);
      // Revert all optimistic updates on error
      setIsCamping(false);
      setDisplayedPCData(prev => ({ ...prev, iscamping: false }));
      setCurrentPlayer(prev => ({ ...prev, iscamping: false }));
      setTentCount(prev => prev + 1);
    }
  };

  

  // ✅ Handle Putting Away a Tent
  const handlePutAwayTent = async () => {
    // Optimistically update UI immediately
    setIsCamping(false);
    setDisplayedPCData(prev => ({ ...prev, iscamping: false }));
    setCurrentPlayer(prev => ({ ...prev, iscamping: false }));
    
    // Optimistically increase tent count (getting tent back)
    setTentCount(prev => prev + 1);

    try {
      // ✅ Update camping status in the database
      const response = await axios.post(`${API_BASE}/api/update-profile`, {
        playerId: currentPlayer.playerId,
        updates: { iscamping: false },
      });

      if (response.data.success) {
        updateStatus(30);

        // Update PlayersInGrid directly
        const gridId = currentPlayer?.location?.g;
        if (gridId) {
          playersInGridManager.updatePC(gridId, currentPlayer.playerId, { iscamping: false });
        }
      } else {
        // Revert optimistic update if server update failed
        setIsCamping(true);
        setDisplayedPCData(prev => ({ ...prev, iscamping: true }));
        setCurrentPlayer(prev => ({ ...prev, iscamping: true }));
        setTentCount(prev => prev - 1);
      }
    } catch (error) {
      console.error("❌ Error putting away tent:", error);
      updateStatus(29);
      // Revert optimistic update on error
      setIsCamping(true);
      setDisplayedPCData(prev => ({ ...prev, iscamping: true }));
      setCurrentPlayer(prev => ({ ...prev, iscamping: true }));
      setTentCount(prev => prev - 1);
    }
};

  // ✅ Handle Getting in Boat
  const handleGetInBoat = async () => {
    console.log("🛶 handleGetInBoat called; boatCount = ", boatCount);
    if (boatCount <= 0) return;

    // Optimistically update UI immediately
    setIsInBoat(true);
    setDisplayedPCData(prev => ({ ...prev, isinboat: true }));
    setCurrentPlayer(prev => ({ ...prev, isinboat: true }));

    try {
      // Note: Unlike tent, we don't consume the boat item
      const response = await axios.post(`${API_BASE}/api/update-profile`, {
        playerId: currentPlayer.playerId,
        updates: { isinboat: true },
      });

      if (response.data.success) {
        console.log('🛶 isinboat: updated profile successfully; response = ', response);
        updateStatus("You got in your boat."); // TODO: Add proper string ID
        
        // Update PlayersInGrid directly
        const gridId = currentPlayer?.location?.g;
        if (gridId) {
          playersInGridManager.updatePC(gridId, currentPlayer.playerId, { isinboat: true });
        }
      } else {
        // Revert optimistic update if server update failed
        setIsInBoat(false);
        setDisplayedPCData(prev => ({ ...prev, isinboat: false }));
        setCurrentPlayer(prev => ({ ...prev, isinboat: false }));
      }
    } catch (error) {
      console.error("❌ Error getting in boat:", error);
      updateStatus("Failed to get in boat."); // TODO: Add proper string ID
      // Revert optimistic update on error
      setIsInBoat(false);
      setDisplayedPCData(prev => ({ ...prev, isinboat: false }));
      setCurrentPlayer(prev => ({ ...prev, isinboat: false }));
    }
  };

  // ✅ Handle Getting out of Boat
  const handleGetOutOfBoat = async () => {
    // Optimistically update UI immediately
    setIsInBoat(false);
    setDisplayedPCData(prev => ({ ...prev, isinboat: false }));
    setCurrentPlayer(prev => ({ ...prev, isinboat: false }));

    try {
      // ✅ Update boat status in the database
      const response = await axios.post(`${API_BASE}/api/update-profile`, {
        playerId: currentPlayer.playerId,
        updates: { isinboat: false },
      });

      if (response.data.success) {
        updateStatus("You got out of your boat."); // TODO: Add proper string ID
        
        // Update PlayersInGrid directly
        const gridId = currentPlayer?.location?.g;
        if (gridId) {
          playersInGridManager.updatePC(gridId, currentPlayer.playerId, { isinboat: false });
        }
      } else {
        // Revert optimistic update if server update failed
        setIsInBoat(true);
        setDisplayedPCData(prev => ({ ...prev, isinboat: true }));
        setCurrentPlayer(prev => ({ ...prev, isinboat: true }));
      }
    } catch (error) {
      console.error("❌ Error getting out of boat:", error);
      updateStatus("Failed to get out of boat."); // TODO: Add proper string ID
      // Revert optimistic update on error
      setIsInBoat(true);
      setDisplayedPCData(prev => ({ ...prev, isinboat: true }));
      setCurrentPlayer(prev => ({ ...prev, isinboat: true }));
    }
};

  // ✅ Handle Remove from GridState (Debug)
  const handleRemoveFromGridState = async () => {
    if (!pcData || !pcData.playerId) {
      console.error("❌ Cannot remove: No player data");
      updateStatus("Failed to remove player from grid state");
      return;
    }

    const gridId = currentPlayer?.location?.g;
    if (!gridId) {
      console.error("❌ Cannot remove: No grid ID found");
      updateStatus("Failed to remove player from grid state");
      return;
    }

    const playerId = pcData.playerId;
    
    console.log(`🗑️ Removing player ${pcData.username} (${playerId}) from grid ${gridId}`);
    
    try {
      // Step 1: Remove from database first
      console.log('📤 Calling /remove-single-pc to remove player from database...');
      const response = await axios.post(`${API_BASE}/api/remove-single-pc`, {
        gridId: gridId,
        playerId: playerId,
      });
      
      if (!response.data.success) {
        throw new Error('Failed to remove player from database');
      }
      
      console.log(`✅ Successfully removed player ${pcData.username} from database`);
      
      // Step 2: Remove from local state
      playersInGridManager.removePC(gridId, playerId);
      console.log(`✅ Successfully removed player ${pcData.username} from local grid state`);
      
      // Step 3: Force NPCController transfer if the removed player was the controller
      // Check if the removed player was the controller
      if (controllerUsername === pcData.username) {
        console.log(`🎮 Removed player ${pcData.username} was the NPCController, clearing controller`);
        // Clear the controller username locally first
        if (setControllerUsername) {
          setControllerUsername(null);
        }
      }
      
      if (socket) {
        console.log(`🎮 Forcing NPCController reassignment after removing ${pcData.username}`);
        // Tell the server to remove this player and reassign controller
        // Using existing socket events that the server already handles
        socket.emit('leave-grid', { 
          gridId: gridId,
          playerId: playerId,
          username: pcData.username
        });
        
        // If they were the controller, request to become the new controller
        if (controllerUsername === pcData.username) {
          setTimeout(() => {
            socket.emit('request-npc-controller', { gridId: gridId });
          }, 100);
        }
      }
      
      updateStatus(`Removed ${pcData.username} from grid${controllerUsername === pcData.username ? ' and cleared NPC control' : ''}`);
      
      // Close the panel since the player is no longer in the grid
      if (pcData.username !== currentPlayer.username) {
        onClose();
      }
    } catch (error) {
      console.error("❌ Error removing player from grid state:", error);
      updateStatus("Failed to remove player from grid state");
    }
  };

  return (
    <Panel onClose={onClose} descriptionKey="1014" titleKey="1114" panelName="SocialPanel">
        <div className="panel-content">
        <div className="debug-buttons">
        <h2>{displayedPCData.username}{displayedPCData.username === currentPlayer.username && " (You)"}</h2>

        {displayedPCData.username === currentPlayer.username && (
          <button 
            className="btn-success" 
            onClick={() => setShowChangeIconModal(true)}
          >
            {currentPlayer.icon || '🙂'} Change Avatar
          </button>
        )}
        
        <h3>❤️‍🩹 HP: {displayedPCData.hp}</h3>

        {/* Show camping/boat status for other players */}
        {displayedPCData.username !== currentPlayer.username && (
          <>
            {displayedPCData.iscamping && (
              <h3 style={{ fontWeight: "bold", color: "#4CAF50" }}>🏕️ Camping.</h3>
            )}
            {displayedPCData.isinboat && (
              <h3 style={{ fontWeight: "bold", color: "#2196F3" }}>🛶 In a boat.</h3>
            )}
          </>
        )}

        {/* Show RelationshipCard only for other players */}
        {displayedPCData.username !== currentPlayer.username && (
          <RelationshipCard
            currentPlayer={currentPlayer}
            setCurrentPlayer={setCurrentPlayer}
            targetName={displayedPCData.username}
            targetType="player"
            showActions={true}
            compact={false}
            masterInteractions={masterInteractions}
            updateStatus={updateStatus}
            onRelationshipChange={(interaction, success) => {
              // Additional handling if needed after interaction completes
            }}
          />
        )}

        {/* Debug button for developers to remove player from grid state */}
        {isDeveloper && displayedPCData.username !== currentPlayer.username && (
          <div className="standard-buttons">
            <button 
              className="btn-danger" 
              onClick={handleRemoveFromGridState}
            >
              🗑️ Remove from GridState (dev only)
            </button>
          </div>
        )}
        

        {/* ✅ Show camping and boat buttons only for current player */}
        {displayedPCData.username === currentPlayer.username && (
          <>
            {/* Tent functionality */}
            <br /><br />
            {isCamping ? (
              <h3 style={{ fontWeight: "bold", color: "#4CAF50" }}>🏕️ Camping.</h3>
            ) : (
              <p>You have <strong>{tentCount}</strong> tents.</p>
            )}
            
            {isCamping ? (
              <button className="btn-success" onClick={handlePutAwayTent}>⛺ Put Away Tent</button>
            ) : (
              <button 
                className="btn-success" 
                disabled={isInBoat}
                onClick={() => {
                  if (tentCount <= 0) {
                    console.warn("🚫 No tents found. Button press ignored.");
                    updateStatus(27); // "You don't have a tent."
                  } else {
                    handlePitchTent();
                  }
                }}
              >
                🏕️ Pitch Tent
              </button>
            )}


            {/* Boat functionality */}
            {isInBoat ? (
              <h3 style={{ fontWeight: "bold", color: "#2196F3" }}>🛶 In a boat.</h3>
            ) : (
              <p>You have <strong>{boatCount}</strong> boats.</p>
            )}
            
            {isInBoat ? (
              <button className="btn-success" onClick={handleGetOutOfBoat}>🛶 Get Out of Boat</button>
            ) : (
              <button 
                className="btn-success" 
                disabled={isCamping}
                onClick={() => {
                  if (boatCount <= 0) {
                    console.warn("🚫 No boats found. Button press ignored.");
                    updateStatus("You don't have a boat."); // TODO: Add proper string ID
                  } else {
                    handleGetInBoat();
                  }
                }}
              >
                🛶 Get in Boat
              </button>
            )}

          </>
        )}

        </div>
        </div>
      {showChangeIconModal && (
        <ChangeIconModal
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          updateStatus={updateStatus}
          currentIcon={currentPlayer.icon}
          playerId={currentPlayer.playerId}
          onClose={() => setShowChangeIconModal(false)}
          onSave={(newIcon) => {
            setDisplayedPCData(prev => ({ ...prev, icon: newIcon }));
            setShowChangeIconModal(false);
          }}
        />
      )}
    </Panel>
  );
};

export default React.memo(SocialPanel);