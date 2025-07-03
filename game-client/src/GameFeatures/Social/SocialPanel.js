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
  const [isCamping, setIsCamping] = useState(false);
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
            setDisplayedPCData(prev => ({
              ...prev,
              iscamping: latestData.iscamping,
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

      // ✅ Get tent count from Backpack
      const tentsInBackpack = currentPlayer.backpack?.find(item => item.type === "Tent")?.quantity || 0;
      setTentCount(tentsInBackpack);
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
        updateCampingStateInGridState(currentPlayer.playerId, true);
      }
    } catch (error) {
      console.error("❌ Error pitching tent:", error);
      updateStatus(29);
    }
  };

  const updateCampingStateInGridState = async (playerId, campingState) => {
    try {
        const gridId = currentPlayer?.location?.g;
        if (!gridId) {
            console.error("❌ Cannot update NPCsInGrid: No gridId found.");
            return;
        }

        // ✅ Only update playersInGridManager
        const playersInGrid = playersInGridManager.getPlayersInGrid(gridId);
        if (playersInGrid?.[playerId]) {
            playersInGridManager.updatePC(gridId, playerId, { iscamping: campingState });
            console.log(`✅ Updated camping state in playersInGrid: ${playerId} iscamping=${campingState}`);
        } else {
            console.warn(`⚠️ Player ${playerId} not found in playersInGrid.`);
        }
    } catch (error) {
        console.error("❌ Error updating camping state in playersInGrid:", error);
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

        // ✅ Update GridState so other players see the change
        updateCampingStateInGridState(currentPlayer.playerId, false);
      }
    } catch (error) {
      console.error("❌ Error putting away tent:", error);
      updateStatus(29);
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

        {/* ✅ Show camping button only for current player */}
        {displayedPCData.username === currentPlayer.username && (
          <>
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