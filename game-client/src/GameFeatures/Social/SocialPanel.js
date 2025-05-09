import API_BASE from '../../config.js';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panel';
import axios from 'axios';
import { StatusBarContext } from '../../UI/StatusBar';
import { usePanelContext } from '../../UI/PanelContext';
import { checkAndDeductIngredients } from '../../Utils/InventoryManagement';
import gridStateManager from '../../GridState/GridStateNPCs.js';
import gridStatePCManager from '../../GridState/GridStatePCs';

const SocialPanel = ({
  onClose,
  pcData,
  currentPlayer,
  setCurrentPlayer,
  setInventory,
  setBackpack,
}) => {
  const { updateStatus } = useContext(StatusBarContext);
  const { closePanel } = usePanelContext();
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [tentCount, setTentCount] = useState(0);
  const [isCamping, setIsCamping] = useState(false);

  console.log('made it to SocialPanel; pc = ', pcData);

  useEffect(() => {
    if (!pcData) return;
    
    // ✅ Subscribe to gridStatePCManager updates for camping state
    const interval = setInterval(() => {
        const gridId = currentPlayer?.location?.g;
        if (!gridId) return;
        
        const gridState = gridStatePCManager.getGridStatePCs(gridId);
        const latestCamping = gridState[pcData.playerId]?.iscamping || false;
        setIsCamping(latestCamping);
        pcData.iscamping = latestCamping;
    }, 2000); // ✅ Refresh every 2 seconds

    return () => clearInterval(interval);
}, [pcData, currentPlayer]);


  useEffect(() => {
    if (!pcData) {
      console.warn("SocialPanel was opened with missing pcData.");
      pcData = { username: "Unknown", hp: 0, iscamping: false };
    }

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
    console.log("⛺️ handlePitchTent called; tentCount = ",tentCount);
    if (tentCount <= 0) return;

    try {
      let updatedBackpack = [...currentPlayer.backpack];
      // ✅ Deduct the tent from the backpack directly
      const tentIndex = updatedBackpack.findIndex(item => item.type === "Tent");

      if (tentIndex >= 0 && updatedBackpack[tentIndex].quantity > 0) {
          updatedBackpack[tentIndex].quantity -= 1;
          if (updatedBackpack[tentIndex].quantity <= 0) {
              updatedBackpack.splice(tentIndex, 1); // Remove item if quantity reaches 0
          }
      } else {
          console.warn("🚫 No tents found in backpack. Cannot pitch tent.");
          updateStatus(27); // "You don't have a tent."
          return;
      }
      console.log("⛺️ Tent deducted. Updated Backpack:", updatedBackpack);
      setBackpack(updatedBackpack); // ✅ Update the backpack state

      // ✅ Save updated inventory/backpack to DB
      await axios.post(`${API_BASE}/api/update-inventory`, {
        playerId: currentPlayer.playerId,
        backpack: updatedBackpack,
      });
      console.log('⛺️ iscamping: updated inventory; updatedBackpack = ',updatedBackpack);

      // ✅ Update camping status in the database
      const response = await axios.post(`${API_BASE}/api/update-profile`, {
        playerId: currentPlayer.playerId,
        updates: { iscamping: true },
      });

      if (response.data.success) {
        console.log('⛺️ iscamping: updated profile successfully; response = ',response);
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
            console.error("❌ Cannot update gridState: No gridId found.");
            return;
        }

        // ✅ Only update gridStatePCManager
        const gridStatePCs = gridStatePCManager.getGridStatePCs(gridId);
        if (gridStatePCs?.[playerId]) {
            gridStatePCManager.updatePC(gridId, playerId, { iscamping: campingState });
            console.log(`✅ Updated camping state in gridStatePCs: ${playerId} iscamping=${campingState}`);
        } else {
            console.warn(`⚠️ Player ${playerId} not found in gridStatePCs.`);
        }
    } catch (error) {
        console.error("❌ Error updating camping state in gridStatePCs:", error);
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
        <h2>{pcData.username}{pcData.username === currentPlayer.username && " (You)"}</h2>
        <p>❤️‍🩹 HP: {pcData.hp}</p>

        {/* ✅ Show "You are camping." if iscamping === true */}
        {pcData.iscamping && (
          <h3 style={{ fontWeight: "bold", color: "#4CAF50" }}>🏕️ Camping.</h3>
        )}

        {/* ✅ Show camping button only for current player */}
        {pcData.username === currentPlayer.username && (
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

    </Panel>
  );
};

export default React.memo(SocialPanel);