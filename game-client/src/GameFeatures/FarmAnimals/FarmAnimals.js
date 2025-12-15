import API_BASE from '../../config';
import axios from 'axios';
import { gainIngredients } from '../../Utils/InventoryManagement';
import React, { useState, useEffect } from 'react';
import Panel from '../../UI/Panels/Panel';
import '../../UI/Buttons/SharedButtons.css';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import TransactionButton from '../../UI/Buttons/TransactionButton';
import './AnimalPanel.css';

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
  globalTuning,
}) => {

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
        const lookingFor = npc.type === 'Pig' ? 'dirt' : 'grass';
        return `is hungry and looking for ${lookingFor}.`;
      case 'grazing':
        if (npc.grazeEnd) {
          const remainingTime = Math.max(0, npc.grazeEnd - currentTime);
          const minutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((remainingTime % (1000 * 60)) / 1000);
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
    const ingredients = [];
    for (let i = 1; i <= 3; i++) {
      const ingredientType = stallDetails[`ingredient${i}`];
      const ingredientQty = stallDetails[`ingredient${i}qty`];
      if (ingredientType && ingredientQty) {
        ingredients.push({ type: ingredientType, quantity: ingredientQty });
      }
    }
    if (!ingredients.length) { console.error('No ingredients found for refund.'); return; }

    try {
      for (const { type, quantity } of ingredients) {
        const success = await gainIngredients({
          playerId: currentPlayer.playerId,
          currentPlayer,
          resource: type,
          quantity,
          inventory,
          backpack,
          setInventory,
          setBackpack,
          setCurrentPlayer,
          updateStatus,
          masterResources,
          globalTuning,
        });
        if (!success) return;
      }

      // Update currentPlayer with the new inventory to ensure money display updates
      setCurrentPlayer(prev => ({ 
        ...prev, 
        inventory: inventory,
        backpack: backpack 
      }));

      // Note: We don't remove the animal stall building here - only the NPC
      // The stall building can be sold separately from the AnimalStall panel

      // Remove the animal NPC from NPCsInGrid using the specific NPC ID
      try {
        if (npcId) {
          console.log(`🐄 Removing animal NPC ${npcId} (original position: ${currentStationPosition.x}, ${currentStationPosition.y})`);
          await NPCsInGridManager.removeNPC(gridId, npcId);
          console.log("🧹 Animal NPC removed from NPCsInGrid.");
        } else {
          console.error("No NPC ID provided - cannot remove animal NPC");
        }
      } catch (error) {
        console.error('Error removing NPC:', error);
      }

      const totalRefund = ingredients
        .filter((item) => item.type === "Money")
        .reduce((sum, item) => sum + item.quantity, 0);

      console.log(`Sold ${stationType} successfully for ${totalRefund} Money.`);
      updateStatus(`Sold ${getLocalizedString(stationType, strings)} for ${totalRefund} ${getLocalizedString('Money', strings)}.`);
      onClose();
    } catch (error) {
      console.error('Error selling the stall:', error);
    }
  };
  

  return (
    <Panel onClose={onClose} titleKey="1129" panelName="AnimalPanel" >
      <div className="animal-panel-container">
        <div className="animal-panel-content">
          <h2>
              {stallDetails?.symbol || '🛖'} {getLocalizedString(stationType, strings)}
          </h2>

          {/* Show current NPC status */}
          {currentNPC && (
            <p>
              <strong>{getLocalizedString(currentNPC.type, strings)}</strong> {getNPCStatusText(currentNPC)}
            </p>
          )}
        </div>
        
        {currentPlayer.location.gtype === 'homestead' && (
          <div className="animal-panel-footer">
            <hr />
            <div className="shared-buttons">
              <TransactionButton 
                className="btn-basic btn-success" 
                onAction={handleSellStation}
                transactionKey={`sell-refund-${stationType}-${currentStationPosition.x}-${currentStationPosition.y}-${gridId}`}
              >
                {strings[425]}
              </TransactionButton>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
  
};

export default React.memo(AnimalPanel);
