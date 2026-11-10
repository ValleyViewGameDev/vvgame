import React, { useState } from 'react';
import AvatarModal from '../../Avatar/AvatarModal';
import AvatarFace from '../../Avatar/AvatarFace';
import PlayerAvatarFace from '../../UI/Icons/PlayerAvatarFace';
import '../../UI/Icons/NPCPortrait.css';
import EatingModal from '../Eating/Eating';
import { spendIngredients } from '../../Utils/InventoryManagement';
import playersInGridManager from '../../GridState/PlayersInGrid';
import { earnTrophy } from '../Trophies/TrophyUtils';
import API_BASE from '../../config.js';
import axios from 'axios';
import { useStrings } from '../../UI/StringsContext';
import { getDerivedLevel, getXpForNextLevel } from '../../Utils/playerManagement';
import soundManager from '../../Sound/SoundManager';
import './PlayerPanel.css';
import { applyPlayerDelta, postAction } from '../../Utils/playerDelta';
import { showNotification } from '../../UI/Notifications/Notifications';
import XpStar from '../../UI/Icons/XpStar';

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
  isDeveloper,
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
  const [showAvatarModal, setShowAvatarModal] = useState(false); // Change Avatar: the avatar editor (docs/avatar-plan.md)
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
      // ONE request (game-server routes/actionRoutes.js /action/pitch-tent): the Tent is used and
      // the player is camping, both on the server (Adventurer trophy)
      const answer = await postAction('/api/action/pitch-tent', { playerId: currentPlayer.playerId });
      applyPlayerDelta(answer.data, { setCurrentPlayer, setInventory, setBackpack });
      if (!answer.ok) {
        setIsCamping(false);
        setDisplayedPCData(prev => ({ ...prev, iscamping: false }));
        setCurrentPlayer(prev => ({ ...prev, iscamping: false }));
        setTentCount(prev => prev + 1);
        return;
      }
      soundManager.playSFX('tent_on');
      updateStatus(28);
      for (const t of answer.data.trophies || []) if (t.isNewMilestone) showNotification('Trophy', t.trophy);
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
      {/* first row, like the NPC panel (owner 2026-11-10): the big round avatar (40%) and, beside it,
          a stack of Settings, the tent and the boat; Edit Avatar is the pencil on the avatar. The greeting is the panel title. */}
      <div className="player-panel-top">
        <div className="player-panel-portrait">
          {/* the avatar itself opens Edit Avatar too (owner 2026-11-10) */}
          <button className="npc-portrait player-panel-avatar" onClick={() => setShowAvatarModal(true)} aria-label={strings[4065]}>
            <AvatarFace avatar={currentPlayer.avatar} fallback={<PlayerAvatarFace icon={currentPlayer.icon} />} />
          </button>
          {/* Edit Avatar is the pencil on the avatar's lower right (owner 2026-11-10) */}
          <button className="player-panel-edit" onClick={() => setShowAvatarModal(true)} title={strings[4065]} aria-label={strings[4065]}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.21a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
            </svg>
          </button>
        </div>
        <div className="player-panel-top-actions">
          <div className="shared-buttons">
            <button className="btn-basic btn-neutral" onClick={() => openPanel('ProfilePanel')}>{strings[1190]}</button>
          </div>
          <div className="shared-buttons">
            {isCamping ? (
              <button className="btn-basic btn-success" onClick={handlePutAwayTent}>{strings[10155]}</button>
            ) : (
              <button
                className="btn-basic btn-success"
                disabled={isInBoat}
                onClick={() => {
                  if (tentCount <= 0) updateStatus(27); // "You don't have a tent."
                  else handlePitchTent();
                }}
              >
                {strings[10154]} ({tentCount})
              </button>
            )}
          </div>
          <div className="shared-buttons">
            {isInBoat ? (
              <button className="btn-basic btn-success" onClick={handleGetOutOfBoat}>{strings[10153]}</button>
            ) : (
              <button
                className="btn-basic btn-success"
                disabled={isCamping}
                onClick={() => {
                  if (boatCount <= 0) updateStatus(37);
                  else handleGetInBoat();
                }}
              >
                {strings[10152]}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Level Display */}
      <h3>{strings[10150]} {getDerivedLevel(currentPlayer, masterXPLevels)}</h3>

      {/* XP Display */}
      <h3><XpStar /> {strings[10151]} {currentPlayer.xp || 0} / {getXpForNextLevel(currentPlayer, masterXPLevels)}</h3>
      
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

      {/* The Quest for Hope moved to the top of the To Do list (QuestPanel), 2026-10-17 */}


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

      {/* Inventory, Skills, Combat: a gap above, since Eat belongs with Health (owner 2026-11-10) */}
      <div className="shared-buttons player-panel-group-gap">
        <button className="btn-basic btn-success" onClick={() => openPanel('InventoryPanel')}>
          {strings[10103]}
        </button>
      </div>
      <div className="shared-buttons" style={{ display: 'flex', gap: '8px' }}>
        <button className="btn-basic" style={{ flex: 1 }} onClick={() => openPanel('SkillsPanel')}>
          {strings[1105]} ({currentPlayer.skills?.length || 0})
        </button>
        <button className="btn-basic" style={{ flex: 1 }} onClick={() => openPanel('CombatPanel')}>
          {strings[1124]}
        </button>
      </div>

      {showAvatarModal && (
        <AvatarModal
          currentPlayer={currentPlayer}
          setCurrentPlayer={setCurrentPlayer}
          setInventory={setInventory}
          setBackpack={setBackpack}
          masterResources={masterResources}
          updateStatus={updateStatus}
          onClose={() => setShowAvatarModal(false)}
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