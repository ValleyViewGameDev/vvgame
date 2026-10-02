import React, { useState, useEffect } from 'react';
import Panel from '../../UI/Panels/Panel';
import '../Relationships/Relationships.css';
import PlayerPanel from './PlayerPanel';
import '../Leaderboard/Leaderboard.css';

// Phase 1 (docs/refactor-plan.md): other players are never shown in a grid, so this panel is
// the current player's own profile only. The Leaderboard remains the way to see other players.
const SocialPanel = ({
  onClose,
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
  openPanel,
}) => {
  const [tentCount, setTentCount] = useState(0);
  const [boatCount, setBoatCount] = useState(0);
  const [isCamping, setIsCamping] = useState(false);
  const [isInBoat, setIsInBoat] = useState(false);
  const [displayedPCData, setDisplayedPCData] = useState(() => buildOwnPCData(currentPlayer));

  useEffect(() => {
    if (!currentPlayer) {
      setDisplayedPCData({ username: 'Unknown', hp: 0, iscamping: false });
      return;
    }

    setDisplayedPCData(buildOwnPCData(currentPlayer));
    setIsCamping(currentPlayer.iscamping || false);
    setIsInBoat(currentPlayer.isinboat || false);

    // ✅ Get tent count from Backpack
    const tentsInBackpack = currentPlayer.backpack?.find(item => item.type === 'Tent')?.quantity || 0;
    setTentCount(tentsInBackpack);

    // ✅ Get boat count from Backpack
    const boatsInBackpack = currentPlayer.backpack?.find(item => item.type === 'Boat')?.quantity || 0;
    setBoatCount(boatsInBackpack);
  }, [currentPlayer]);

  return (
    <Panel onClose={onClose} descriptionKey="1014" titleKey="1114" panelName="SocialPanel">
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
    </Panel>
  );
};

function buildOwnPCData(currentPlayer) {
  if (!currentPlayer) return { username: 'Unknown', hp: 0, iscamping: false };
  return {
    playerId: currentPlayer._id,
    username: currentPlayer.username,
    icon: currentPlayer.icon,
    hp: currentPlayer.hp || 100,
    position: { x: 0, y: 0 }, // Position not needed for own profile
    iscamping: currentPlayer.iscamping || false,
    isinboat: currentPlayer.isinboat || false,
  };
}

export default React.memo(SocialPanel);
