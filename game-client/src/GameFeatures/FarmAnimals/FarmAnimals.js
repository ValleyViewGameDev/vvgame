import API_BASE from '../../config';
import axios from 'axios';
import { gainIngredients } from '../../Utils/InventoryManagement';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panel';
import FloatingTextManager from '../../UI/FloatingText';
import { updateGridResource } from '../../Utils/GridManagement';
import { createCollectEffect } from '../../VFX/VFX';
import '../../UI/SharedButtons.css';
import { useStrings } from '../../UI/StringsContext';
import { useUILock } from '../../UI/UILockContext';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import { handleProtectedSelling } from '../../Utils/ProtectedSelling';
import TransactionButton from '../../UI/TransactionButton';

const AnimalPanel = ({
  onClose,
  inventory,
  setInventory,
  backpack,
  setBackpack,
  currentPlayer,
  setCurrentPlayer,
  setResources,
  stationType,
  currentStationPosition,
  gridId,
  npcId,
  TILE_SIZE,
  updateStatus,
  masterResources,
}) => {
  const { setUILocked } = useUILock();
  const [isActionCoolingDown, setIsActionCoolingDown] = useState(false);
  const COOLDOWN_DURATION = 2000;
  const [stallDetails, setStallDetails] = useState(null);
  const [currentNPC, setCurrentNPC] = useState(null);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const strings = useStrings();

  console.log('--------Inside Animal Panel:', { stationType, currentStationPosition });

  useEffect(() => {
    const stallResource = masterResources.find((res) => res.type === stationType);
    setStallDetails(stallResource);
  }, [stationType, masterResources]);

  // Get current NPC data and update it periodically
  useEffect(() => {
    const updateNPCData = () => {
      if (npcId && gridId) {
        const npcsInGrid = NPCsInGridManager.getNPCsInGrid(gridId);
        const npc = Object.values(npcsInGrid).find(n => n.id === npcId);
        setCurrentNPC(npc);
      }
    };

    updateNPCData(); // Initial load
    const interval = setInterval(updateNPCData, 1000); // Update every second for live status

    return () => clearInterval(interval);
  }, [npcId, gridId]);

  // Update current time every second for live countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Function to generate status text like the tooltip
  const getNPCStatusText = (npc) => {
    if (!npc) return "Unknown status";
    
    switch (npc.state) {
      case 'processing':
        return "is ready.";
      case 'hungry':
        return "is hungry and looking for grass.";
      case 'grazing':
        if (npc.grazeEnd) {
          const timeLeft = Math.max(0, npc.grazeEnd - currentTime);
          const minutes = Math.floor(timeLeft / 60000);
          const seconds = Math.floor((timeLeft % 60000) / 1000);
          return `is grazing. ${minutes}m ${seconds}s`;
        }
        return "is grazing.";
      case 'roam':
        return "is roaming.";
      case 'stall':
        return "is looking for an Animal Stall.";
      default:
        return `is in ${npc.state} state.`;
    }
  };

  useEffect(() => {
    const syncInventory = async () => {
      try {
        const storedInventory = JSON.parse(localStorage.getItem('inventory')) || [];
        setInventory(storedInventory);
  
        const serverResponse = await axios.get(`${API_BASE}/api/inventory/${currentPlayer.playerId}`);
        const serverInventory = serverResponse.data.inventory || [];
        if (JSON.stringify(storedInventory) !== JSON.stringify(serverInventory)) {
          setInventory(serverInventory);
          localStorage.setItem('inventory', JSON.stringify(serverInventory));
        }
      } catch (error) {
        console.error('Error syncing inventory:', error);
      }
    };
    syncInventory();
  }, [currentPlayer]);

  const handleSellStation = async (transactionId, transactionKey) => {
    try {
      // Use protected selling for the main transaction
      const result = await handleProtectedSelling({
        currentPlayer,
        setInventory,
        setBackpack,
        setCurrentPlayer,
        setResources,
        stationType,
        currentStationPosition,
        gridId,
        TILE_SIZE,
        updateStatus,
        onClose
      });

      // If selling was successful, also remove the associated NPC
      if (result?.success && npcId) {
        console.log(`🐄 Removing animal NPC ${npcId} (original position: ${currentStationPosition.x}, ${currentStationPosition.y})`);
        await NPCsInGridManager.removeNPC(gridId, npcId);
        console.log("🧹 Animal NPC removed from NPCsInGrid.");
      }
    } catch (error) {
      console.error('Error in farm animal selling:', error);
    }
  };
  

  return (
    <Panel onClose={onClose} descriptionKey="1029" titleKey="1129" panelName="AnimalPanel" >
      <div className="standard-panel">
        <h2>
            {stallDetails?.symbol || '🛖'} {stationType}
        </h2>

        {/* Show current NPC status */}
        {currentNPC && (
          <p>
            <strong>{currentNPC.type}</strong> {getNPCStatusText(currentNPC)}
          </p>
        )}

        {currentPlayer.location.gtype === 'homestead' && (
          <>
            <hr />
              <div className="standard-buttons">
                <TransactionButton 
                  className="btn-success" 
                  onAction={handleSellStation}
                  transactionKey={`sell-refund-${stationType}-${currentStationPosition.x}-${currentStationPosition.y}-${gridId}`}
                >
                  {strings[425]}
                </TransactionButton>
              </div>
          </>
        )}
      </div>
    </Panel>
  );
  
};

export default React.memo(AnimalPanel);
