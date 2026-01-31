import React, { useState } from 'react';
import ChangeIconModal from '../../UI/Modals/ChangeIconModal';
import EatingModal from '../Eating/Eating';
import { spendIngredients } from '../../Utils/InventoryManagement';
import playersInGridManager from '../../GridState/PlayersInGrid';
import { earnTrophy } from '../Trophies/TrophyUtils';
import API_BASE from '../../config.js';
import axios from 'axios';
import { useStrings } from '../../UI/StringsContext';
import { getDerivedLevel, getXpForNextLevel } from '../../Utils/playerManagement';
import HopeQuest from './HopeQuest';
import soundManager from '../../Sound/SoundManager';

const PlayerPanel = ({
  currentPlayer,
  setCurrentPlayer,
  inventory,
  setInventory,
  backpack,
  setBackpack,
  updateStatus,
  masterTrophies,
  masterResources,
  masterXPLevels,
  masterTraders,
  tentCount,
  setTentCount,
  boatCount,
  isCamping,
  setIsCamping,
  isInBoat,
  setIsInBoat,
  displayedPCData,
  setDisplayedPCData,
  openPanel
}) => {
  const [showChangeIconModal, setShowChangeIconModal] = useState(false);
  const [showEatingModal, setShowEatingModal] = useState(false);
  const strings = useStrings();

  // Handle Pitching a Tent
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
      soundManager.playSFX('tent_on');
      updateStatus(28);
      
      // Award Adventurer trophy for first time camping
      if (currentPlayer?.playerId) {
        earnTrophy(currentPlayer.playerId, 'Adventurer', 1, currentPlayer, masterTrophies, setCurrentPlayer);
      }
      
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

  // Handle Putting Away a Tent
  const handlePutAwayTent = async () => {
    // Optimistically update UI immediately
    setIsCamping(false);
    setDisplayedPCData(prev => ({ ...prev, iscamping: false }));
    setCurrentPlayer(prev => ({ ...prev, iscamping: false }));
    
    // Optimistically increase tent count (getting tent back)
    setTentCount(prev => prev + 1);

    try {
      // Update camping status in the database
      const response = await axios.post(`${API_BASE}/api/update-profile`, {
        playerId: currentPlayer.playerId,
        updates: { iscamping: false },
      });

      if (response.data.success) {
        soundManager.playSFX('tent_off');
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

  // Handle Getting in Boat
  const handleGetInBoat = async () => {
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
        soundManager.playSFX('boat_on');
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

  // Handle Getting out of Boat
  const handleGetOutOfBoat = async () => {
    // Optimistically update UI immediately
    setIsInBoat(false);
    setDisplayedPCData(prev => ({ ...prev, isinboat: false }));
    setCurrentPlayer(prev => ({ ...prev, isinboat: false }));

    try {
      // Update boat status in the database
      const response = await axios.post(`${API_BASE}/api/update-profile`, {
        playerId: currentPlayer.playerId,
        updates: { isinboat: false },
      });

      if (response.data.success) {
        soundManager.playSFX('boat_off');
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



  return (
    <>
     <h2>{strings[4051]} {currentPlayer.username} </h2>

      {/* Change Avatar Button */}
      <div className="shared-buttons">
        <button 
          className="btn-basic btn-success" 
          onClick={() => setShowChangeIconModal(true)}
        >
          {currentPlayer.icon || '🙂'} {strings[4065]}
        </button>
      </div>

      {/* Tent functionality */}
      {isCamping ? (
        <div className="shared-buttons">
          <button className="btn-basic btn-success" onClick={handlePutAwayTent}>{strings[10155]}</button>
        </div>
      ) : (
        <div className="shared-buttons">
          <button 
            className="btn-basic btn-success" 
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
            {strings[10154]} ({tentCount})
          </button>
        </div>
      )}

      {/* Boat functionality */}
      {isInBoat ? (
        <div className="shared-buttons">
          <button className="btn-basic btn-success" onClick={handleGetOutOfBoat}>{strings[10153]}</button>
        </div>
      ) : (
        <div className="shared-buttons">
          <button 
            className="btn-basic btn-success" 
            disabled={isCamping}
            onClick={() => {
              if (boatCount <= 0) {
                console.warn("🚫 No boats found. Button press ignored.");
                updateStatus(37); // TODO: Add proper string ID
              } else {
                handleGetInBoat();
              }
            }}
          >
            {strings[10152]}
          </button>
        </div>
      )}

      <br />

      {/* Level Display */}
      <h3>{strings[10150]} {getDerivedLevel(currentPlayer, masterXPLevels)}</h3>

      {/* XP Display */}
      <h3>{strings[10151]} {currentPlayer.xp || 0} / {getXpForNextLevel(currentPlayer, masterXPLevels)}</h3>
      
      {/* XP Progress Bar */}
      <div style={{
        width: '100%',
        height: '8px',
        backgroundColor: 'var(--color-button-hover)',
        borderRadius: '2px',
        overflow: 'hidden',
        marginTop: '4px',
        marginBottom: '8px'
      }}>
        <div style={{
          height: '100%',
          backgroundColor: 'var(--color-btn-primary)',
          width: `${(() => {
            const playerXP = currentPlayer?.xp || 0;
            const currentLevel = getDerivedLevel(currentPlayer, masterXPLevels);
            const nextLevelXP = getXpForNextLevel(currentPlayer, masterXPLevels);
            
            // Get XP required for current level (previous level threshold)
            const currentLevelIndex = currentLevel - 2; // Current level index (Level 1 = index -1, Level 2 = index 0)
            const currentLevelXP = currentLevelIndex >= 0 && masterXPLevels?.[currentLevelIndex] || 0;
            
            // Calculate progress percentage within current level range
            const xpIntoLevel = playerXP - currentLevelXP;
            const xpRangeForLevel = nextLevelXP - currentLevelXP;
            
            if (xpRangeForLevel <= 0) return 100; // At max level or edge case
            
            return Math.min(100, Math.max(0, (xpIntoLevel / xpRangeForLevel) * 100));
          })()}%`,
          transition: 'width 0.3s ease'
        }}>
        </div>
      </div>

      {/* Hope Quest */}
      <HopeQuest
        inventory={inventory}
        backpack={backpack}
        masterResources={masterResources}
        masterTraders={masterTraders}
        showTitle={true}
        size="normal"
      />


<br />

      {/* HP Display */}
      <h3>{strings[10112]} {currentPlayer?._id ? playersInGridManager.getPlayersInGrid(currentPlayer?.location?.g)?.[String(currentPlayer._id)]?.hp ?? "?" : "?"} / {currentPlayer?._id ? playersInGridManager.getPlayersInGrid(currentPlayer?.location?.g)?.[String(currentPlayer._id)]?.maxhp ?? "?" : "?"}</h3>
      
      {/* HP Progress Bar */}
      <div style={{
        width: '100%',
        height: '8px',
        backgroundColor: 'var(--color-button-hover)',
        borderRadius: '2px',
        overflow: 'hidden',
        marginTop: '4px',
        marginBottom: '8px'
      }}>
        <div style={{
          height: '100%',
          backgroundColor: (() => {
            const currentHp = currentPlayer?._id ? playersInGridManager.getPlayersInGrid(currentPlayer?.location?.g)?.[String(currentPlayer._id)]?.hp ?? 0 : 0;
            const maxHp = currentPlayer?._id ? playersInGridManager.getPlayersInGrid(currentPlayer?.location?.g)?.[String(currentPlayer._id)]?.maxhp ?? 1 : 1;
            const hpPercentage = (currentHp / maxHp) * 100;
            
            return hpPercentage <= 10 ? '#ff4444' : '#74ee66';
          })(),
          width: `${(() => {
            const currentHp = currentPlayer?._id ? playersInGridManager.getPlayersInGrid(currentPlayer?.location?.g)?.[String(currentPlayer._id)]?.hp ?? 0 : 0;
            const maxHp = currentPlayer?._id ? playersInGridManager.getPlayersInGrid(currentPlayer?.location?.g)?.[String(currentPlayer._id)]?.maxhp ?? 1 : 1;
            
            return Math.min(100, Math.max(0, (currentHp / maxHp) * 100));
          })()}%`,
          transition: 'width 0.3s ease, background-color 0.3s ease'
        }}>
        </div>
      </div>

      {/* Eat button */}
      <div className="shared-buttons">
        <button 
          className="btn-basic btn-success"
          onClick={() => setShowEatingModal(true)}
        >
          {strings[78]}
        </button>
      </div>

<br />

      {/* Skills - Clickable H3 */}
      <h3
        onClick={() => openPanel('SkillsPanel')}
        style={{ cursor: 'pointer', textDecoration: 'underline' }}
      >
        {strings[1105]} ({currentPlayer.skills?.length || 0})
      </h3>

      {/* Combat Stats - Clickable H3 */}
      <h3
        onClick={() => openPanel('CombatPanel')}
        style={{ cursor: 'pointer', textDecoration: 'underline' }}
      >
        {strings[1124]}
      </h3>
<br />

      {/* Settings - Clickable H3 */}
      <h3
        onClick={() => openPanel('ProfilePanel')}
        style={{ cursor: 'pointer', textDecoration: 'underline' }}
      >
        {strings[1190]}
      </h3>

      {/* Change Icon Modal */}
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

      {/* Eating Modal */}
      <EatingModal
        isOpen={showEatingModal}
        onClose={() => setShowEatingModal(false)}
        currentPlayer={currentPlayer}
        setCurrentPlayer={setCurrentPlayer}
        masterResources={masterResources}
        updateStatus={updateStatus}
      />
    </>
  );
};

export default PlayerPanel;