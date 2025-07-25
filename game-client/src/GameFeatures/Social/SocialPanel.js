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
    
    // ✅ Subscribe to playersInGridManager updates for camping state and HP and username
    const interval = setInterval(() => {
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
    }, 2000); // ✅ Refresh every 2 seconds

    return () => clearInterval(interval);
}, [pcData, currentPlayer]);


  useEffect(() => {
    if (!pcData) {
      console.warn("SocialPanel was opened with missing pcData.");
      setDisplayedPCData({ username: "Unknown", hp: 0, iscamping: false });
      return;
    }

    setDisplayedPCData(pcData);

    // ✅ Check if the selected PC is the current player
    if (pcData.username === currentPlayer.username) {
      setIsCamping(pcData.iscamping || false);
      setIsInBoat(pcData.isinboat || false);

      // ✅ Get tent count from Backpack
      const tentsInBackpack = currentPlayer.backpack?.find(item => item.type === "Tent")?.quantity || 0;
      setTentCount(tentsInBackpack);

      // ✅ Get boat count from Backpack
      const boatsInBackpack = currentPlayer.backpack?.find(item => item.type === "Boat")?.quantity || 0;
      setBoatCount(boatsInBackpack);
    }
  }, [pcData, currentPlayer]);

  // ✅ Handle Pitching a Tent
  const handlePitchTent = async () => {
    console.log("⛺️ handlePitchTent called; tentCount = ", tentCount);
    if (tentCount <= 0) return;

    try {
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

      if (!success) return;

      const response = await axios.post(`${API_BASE}/api/update-profile`, {
        playerId: currentPlayer.playerId,
        updates: { iscamping: true },
      });

      if (response.data.success) {
        console.log('⛺️ iscamping: updated profile successfully; response = ', response);
        setIsCamping(true);
        setCurrentPlayer(prev => ({ ...prev, iscamping: true }));
        updateStatus(28);
        
        // Update PlayersInGrid directly
        const gridId = currentPlayer?.location?.g;
        if (gridId) {
          playersInGridManager.updatePC(gridId, currentPlayer.playerId, { iscamping: true });
        }
      }
    } catch (error) {
      console.error("❌ Error pitching tent:", error);
      updateStatus(29);
    }
  };

  

  // ✅ Handle Putting Away a Tent
  const handlePutAwayTent = async () => {
    try {
      // ✅ Update camping status in the database
      const response = await axios.post(`${API_BASE}/api/update-profile`, {
        playerId: currentPlayer.playerId,
        updates: { iscamping: false },
      });

      if (response.data.success) {
        setIsCamping(false);
        setCurrentPlayer(prev => ({ ...prev, iscamping: false }));
        updateStatus(30);

        // Update PlayersInGrid directly
        const gridId = currentPlayer?.location?.g;
        if (gridId) {
          playersInGridManager.updatePC(gridId, currentPlayer.playerId, { iscamping: false });
        }
      }
    } catch (error) {
      console.error("❌ Error putting away tent:", error);
      updateStatus(29);
    }
};

  // ✅ Handle Getting in Boat
  const handleGetInBoat = async () => {
    console.log("🛶 handleGetInBoat called; boatCount = ", boatCount);
    if (boatCount <= 0) return;

    try {
      // Note: Unlike tent, we don't consume the boat item
      const response = await axios.post(`${API_BASE}/api/update-profile`, {
        playerId: currentPlayer.playerId,
        updates: { isinboat: true },
      });

      if (response.data.success) {
        console.log('🛶 isinboat: updated profile successfully; response = ', response);
        setIsInBoat(true);
        setCurrentPlayer(prev => ({ ...prev, isinboat: true }));
        updateStatus("You got in your boat."); // TODO: Add proper string ID
        
        // Update PlayersInGrid directly
        const gridId = currentPlayer?.location?.g;
        if (gridId) {
          playersInGridManager.updatePC(gridId, currentPlayer.playerId, { isinboat: true });
        }
      }
    } catch (error) {
      console.error("❌ Error getting in boat:", error);
      updateStatus("Failed to get in boat."); // TODO: Add proper string ID
    }
  };

  // ✅ Handle Getting out of Boat
  const handleGetOutOfBoat = async () => {
    try {
      // ✅ Update boat status in the database
      const response = await axios.post(`${API_BASE}/api/update-profile`, {
        playerId: currentPlayer.playerId,
        updates: { isinboat: false },
      });

      if (response.data.success) {
        setIsInBoat(false);
        setCurrentPlayer(prev => ({ ...prev, isinboat: false }));
        updateStatus("You got out of your boat."); // TODO: Add proper string ID
        
        // Update PlayersInGrid directly
        const gridId = currentPlayer?.location?.g;
        if (gridId) {
          playersInGridManager.updatePC(gridId, currentPlayer.playerId, { isinboat: false });
        }
      }
    } catch (error) {
      console.error("❌ Error getting out of boat:", error);
      updateStatus("Failed to get out of boat."); // TODO: Add proper string ID
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
        
        <br />  
        <h3>❤️‍🩹 HP: {displayedPCData.hp}</h3>

        {/* ✅ Show "You are camping." if iscamping === true */}
        {displayedPCData.iscamping && (
          <h3 style={{ fontWeight: "bold", color: "#4CAF50" }}>🏕️ Camping.</h3>
        )}

        {/* ✅ Show "You are in a boat." if isinboat === true */}
        {displayedPCData.isinboat && (
          <h3 style={{ fontWeight: "bold", color: "#2196F3" }}>🛶 In a boat.</h3>
        )}

        {/* ✅ Show camping and boat buttons only for current player */}
        {displayedPCData.username === currentPlayer.username && (
          <>
            {/* Tent functionality */}
            {isCamping ? (
              <button className="btn-success" onClick={handlePutAwayTent}>⛺ Put Away Tent</button>
            ) : (
              <>
                <p>You have <strong>{tentCount}</strong> tents.</p>
                <button 
                  className="btn-success" 
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
              </>
            )}

            <br /><br />

            {/* Boat functionality */}
            {isInBoat ? (
              <button className="btn-success" onClick={handleGetOutOfBoat}>🛶 Get Out of Boat</button>
            ) : (
              <>
                <p>You have <strong>{boatCount}</strong> boats.</p>
                <button 
                  className="btn-success" 
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
              </>
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