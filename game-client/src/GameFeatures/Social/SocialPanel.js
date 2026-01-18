import API_BASE from '../../config.js';
import React, { useState, useEffect } from 'react';
import Panel from '../../UI/Panels/Panel';
import axios from 'axios';
import playersInGridManager from '../../GridState/PlayersInGrid';
import '../Relationships/Relationships.css';
import socket from '../../socketManager';
import PlayerPanel from './PlayerPanel';
import HopeQuest from './HopeQuest';
import { getDerivedLevel, getXpForNextLevel } from '../../Utils/playerManagement';
import { checkDeveloperStatus } from '../../Utils/appUtils';
import { useStrings } from '../../UI/StringsContext';
import '../Leaderboard/Leaderboard.css';

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
  masterTrophies,
  masterResources,
  masterXPLevels,
  masterTraders,
  isDeveloper,
  controllerUsername,
  setControllerUsername,
  openPanel,
}) => {
  const [tentCount, setTentCount] = useState(0);
  const [boatCount, setBoatCount] = useState(0);
  const [isCamping, setIsCamping] = useState(false);
  const [isInBoat, setIsInBoat] = useState(false);
  const [displayedPCData, setDisplayedPCData] = useState(pcData);
  const [fullPlayerData, setFullPlayerData] = useState(null);
  const [isLoadingPlayerData, setIsLoadingPlayerData] = useState(false);
  const strings = useStrings();

  console.log('made it to SocialPanel; pc = ', pcData);

  // Fetch full player data for other players
  useEffect(() => {
    if (!pcData) return;

    // ✅ Update displayed data when viewing other players
    // Use playerId for comparison (more reliable than username which can be reused)
    if (pcData.playerId !== currentPlayer.playerId) {
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

      // Fetch full player data (xp, inventory, backpack) for display
      const fetchFullPlayerData = async () => {
        if (!pcData.playerId) return;

        setIsLoadingPlayerData(true);
        try {
          console.log(`📊 Fetching full data for ${pcData.username}`);
          const response = await axios.get(`${API_BASE}/api/player/${pcData.playerId}`);
          setFullPlayerData({
            xp: response.data.xp || 0,
            inventory: response.data.inventory || [],
            backpack: response.data.backpack || []
          });
        } catch (error) {
          console.error(`❌ Error fetching full data for ${pcData.username}:`, error);
          setFullPlayerData({
            xp: 0,
            inventory: [],
            backpack: []
          });
        } finally {
          setIsLoadingPlayerData(false);
        }
      };

      fetchFullPlayerData();
    } else {
      // Reset when viewing yourself
      setFullPlayerData(null);
    }
}, [pcData, currentPlayer]);


  useEffect(() => {
    if (!pcData) {
      console.warn("SocialPanel was opened with missing pcData.");
      setDisplayedPCData({ username: "Unknown", hp: 0, iscamping: false });
      return;
    }

    // ✅ Check if the selected PC is the current player (use playerId, not username)
    if (pcData.playerId === currentPlayer.playerId) {
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


  // ✅ Handle Remove from GridState (Debug)
  const handleRemoveFromGridState = async () => {
    // Verify developer status before executing
    const isStillDeveloper = await checkDeveloperStatus(currentPlayer?.username);
    if (!isStillDeveloper) {
      updateStatus('❌ Developer access required.');
      return;
    }

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
        
        // Request fresh player list from server to ensure state consistency
        setTimeout(() => {
          console.log('🔄 Requesting current players from server after removal');
          socket.emit('request-current-grid-players', { gridId });
        }, 50);
        
        // If they were the controller, request to become the new controller
        if (controllerUsername === pcData.username) {
          setTimeout(() => {
            socket.emit('request-npc-controller', { gridId: gridId });
          }, 100);
        }
      }
      
      updateStatus(`Removed ${pcData.username} from grid${controllerUsername === pcData.username ? ' and cleared NPC control' : ''}`);
      
      // Close the panel since the player is no longer in the grid
      if (pcData.playerId !== currentPlayer.playerId) {
        onClose();
      }
    } catch (error) {
      console.error("❌ Error removing player from grid state:", error);
      updateStatus("Failed to remove player from grid state");
    }
  };

  // ✅ Handle Send Home (Debug) - Relocates player to their homestead
  const handleSendHome = async () => {
    // Verify developer status before executing
    const isStillDeveloper = await checkDeveloperStatus(currentPlayer?.username);
    if (!isStillDeveloper) {
      updateStatus('❌ Developer access required.');
      return;
    }

    if (!pcData || !pcData.playerId) {
      console.error("❌ Cannot send home: No player data");
      updateStatus("Failed to send player home");
      return;
    }

    const playerId = pcData.playerId;
    const gridId = currentPlayer?.location?.g;

    console.log(`🏠 Sending player ${pcData.username} (${playerId}) home`);

    try {
      // Pass fromGridId so server can broadcast player-left-sync to the right room
      const response = await axios.post(`${API_BASE}/api/send-player-home`, {
        playerId: playerId,
        fromGridId: gridId,
      });

      if (!response.data.success) {
        throw new Error('Failed to send player home');
      }

      console.log(`✅ Successfully sent player ${pcData.username} home`);

      // Remove from local grid state since they're no longer in this grid
      // (Server broadcasts player-left-sync which will also trigger removal on other clients)
      if (gridId) {
        playersInGridManager.removePC(gridId, playerId);
        console.log(`✅ Removed ${pcData.username} from local grid state`);
      }

      // Handle NPCController transfer if needed
      if (controllerUsername === pcData.username) {
        console.log(`🎮 Sent player ${pcData.username} was the NPCController, clearing controller`);
        if (setControllerUsername) {
          setControllerUsername(null);
        }
        // Request controller reassignment
        if (socket) {
          setTimeout(() => {
            socket.emit('request-npc-controller', { gridId: gridId });
          }, 100);
        }
      }

      updateStatus(`Sent ${pcData.username} home`);

      // Close the panel since the player is no longer in this grid
      if (pcData.playerId !== currentPlayer.playerId) {
        onClose();
      }
    } catch (error) {
      console.error("❌ Error sending player home:", error);
      updateStatus("Failed to send player home");
    }
  };


return (
    <Panel onClose={onClose} descriptionKey="1014" titleKey="1114" panelName="SocialPanel">

        {/* Show loading state for other players */}
        {displayedPCData.playerId !== currentPlayer.playerId && isLoadingPlayerData && (
          <p>Loading player data...</p>
        )}

        {/* Show stats for other players */}
        {displayedPCData.playerId !== currentPlayer.playerId && fullPlayerData && !isLoadingPlayerData && (
          <div className="player-card" style={{ marginBottom: '20px' }}>
            {/* Player Name Header */}
            <div className="player-header">
              <div className="player-info">
                {displayedPCData.iscamping ? '🏕️ ' :
                 displayedPCData.isinboat ? '🛶 ' :
                 (displayedPCData.icon || '😊') + ' '
                }
                <strong>{displayedPCData.username}</strong>
              </div>
            </div>

            {/* Level Display */}
            <div className="player-stats">
              {strings[10150]} {getDerivedLevel(fullPlayerData, masterXPLevels)}
            </div>

            {/* XP Display */}
            <div className="player-stats">
              {strings[10151]} {fullPlayerData.xp} / {getXpForNextLevel(fullPlayerData, masterXPLevels)}
            </div>

            {/* XP Progress Bar */}
            {(() => {
              const playerLevel = getDerivedLevel(fullPlayerData, masterXPLevels);
              const xpForNextLevel = getXpForNextLevel(fullPlayerData, masterXPLevels);
              // masterXPLevels is an array of XP thresholds: [40, 100, 180, ...]
              const currentLevelIndex = playerLevel - 2; // Level 1 = no threshold, Level 2 = index 0
              const currentLevelXP = currentLevelIndex >= 0 ? (masterXPLevels?.[currentLevelIndex] || 0) : 0;
              const xpIntoLevel = fullPlayerData.xp - currentLevelXP;
              const xpRangeForLevel = xpForNextLevel - currentLevelXP;
              const xpProgress = xpRangeForLevel <= 0 ? 100 : Math.min(100, Math.max(0, (xpIntoLevel / xpRangeForLevel) * 100));

              return (
                <div className="xp-bar-container">
                  <div className="xp-bar-fill" style={{
                    width: `${xpProgress}%`
                  }}>
                  </div>
                </div>
              );
            })()}

            {/* Hope Quest Progress */}
            <HopeQuest
              inventory={fullPlayerData.inventory}
              backpack={fullPlayerData.backpack}
              masterResources={masterResources}
              masterTraders={masterTraders}
              showTitle={false}
              size="medium"
            />
          </div>
        )}

        {/* Debug buttons for developers */}
        {isDeveloper && displayedPCData.playerId !== currentPlayer.playerId && (
          <div className="shared-buttons">
            <button
              className="btn-basic btn-danger"
              onClick={handleRemoveFromGridState}
            >
              🗑️ Remove from GridState (dev only)
            </button>
            <br />
            <br />
            <button
              className="btn-basic btn-danger"
              onClick={handleSendHome}
            >
              🏠 Send Home (dev only){fullPlayerData?.inventory?.some(item => item.type === 'Home Deed') ? ' (has Home Deed)' : ''}
            </button>
          </div>
        )}

        {/* Show PlayerPanel for current player */}
        {displayedPCData.playerId === currentPlayer.playerId && (
          <PlayerPanel
            currentPlayer={currentPlayer}
            setCurrentPlayer={setCurrentPlayer}
            inventory={inventory}
            setInventory={setInventory}
            backpack={backpack}
            setBackpack={setBackpack}
            updateStatus={updateStatus}
            masterTrophies={masterTrophies}
            masterResources={masterResources}
            masterXPLevels={masterXPLevels}
            masterTraders={masterTraders}
            tentCount={tentCount}
            setTentCount={setTentCount}
            boatCount={boatCount}
            isCamping={isCamping}
            setIsCamping={setIsCamping}
            isInBoat={isInBoat}
            setIsInBoat={setIsInBoat}
            displayedPCData={displayedPCData}
            setDisplayedPCData={setDisplayedPCData}
            openPanel={openPanel}
          />
        )}

    </Panel>
  );
};

export default React.memo(SocialPanel);