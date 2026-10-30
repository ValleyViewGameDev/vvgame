import API_BASE from '../../config';
import axios from 'axios';
import { gainIngredients } from '../../Utils/InventoryManagement';
import React, { useState, useEffect } from 'react';
import Panel from '../../UI/Panels/Panel';
import '../../UI/Buttons/SharedButtons.css';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import soundManager from '../../Sound/SoundManager';
import './AnimalPanel.css';
import { sellSection } from '../../UI/Panels/SellSection';
import { countAnimalsOfType, scaledAnimalMoneyCost } from './animalPricing';

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
  isDeveloper,
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

  // Animals of this type on the grid, for the refund (price inflation is per type: animalPricing.js)
  const countFarmAnimals = () => countAnimalsOfType(NPCsInGridManager.getNPCsInGrid(gridId), stationType);
  const getScaledMoneyCost = (baseCost, animalCount) =>
    scaledAnimalMoneyCost(baseCost, animalCount, globalTuning?.farmAnimalInflation);

  // Calculate the refund amount for display in the button
  const getRefundAmount = () => {
    if (!stallDetails) return 0;
    const currentAnimalCount = countFarmAnimals();
    const animalCountAtPurchase = Math.max(0, currentAnimalCount - 1);

    let totalRefund = 0;
    for (let i = 1; i <= 3; i++) {
      const ingredientType = stallDetails[`ingredient${i}`];
      const ingredientQty = stallDetails[`ingredient${i}qty`];
      if (ingredientType === 'Money' && ingredientQty && stallDetails.action === 'graze') {
        totalRefund += getScaledMoneyCost(ingredientQty, animalCountAtPurchase);
      } else if (ingredientType === 'Money' && ingredientQty) {
        totalRefund += ingredientQty;
      }
    }
    return totalRefund;
  };

  const handleSellStation = async (transactionId, transactionKey) => {
    // Count current animals to calculate inflated refund
    // Use currentCount - 1 because we're refunding what they paid when they bought this animal
    // (i.e., when there was one fewer animal on the grid)
    const currentAnimalCount = countFarmAnimals();
    const animalCountAtPurchase = Math.max(0, currentAnimalCount - 1);

    const ingredients = [];
    for (let i = 1; i <= 3; i++) {
      const ingredientType = stallDetails[`ingredient${i}`];
      const ingredientQty = stallDetails[`ingredient${i}qty`];
      if (ingredientType && ingredientQty) {
        // Apply inflation scaling only to Money ingredients
        if (ingredientType === 'Money' && stallDetails.action === 'graze') {
          const scaledQty = getScaledMoneyCost(ingredientQty, animalCountAtPurchase);
          ingredients.push({ type: ingredientType, quantity: scaledQty });
        } else {
          ingredients.push({ type: ingredientType, quantity: ingredientQty });
        }
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
      soundManager.playSFX('collect_money');
      onClose();
    } catch (error) {
      console.error('Error selling the stall:', error);
    }
  };
  

  // Sell section (UI/Panels/SellSection.js): an animal walks about, so Sell only (no Move); its
  // refund is the panel's own figure (the price scales with the herd: getRefundAmount)
  const sellFooter = sellSection({
    canSell: currentPlayer?.location?.gtype === 'homestead',
    isDeveloper,
    resourceType: stationType,
    masterResources,
    refund: [{ type: 'Money', quantity: getRefundAmount() }],
    onSell: handleSellStation,
    transactionKey: `sell-refund-${stationType}-${currentStationPosition.x}-${currentStationPosition.y}-${gridId}`,
  });

  return (
    <Panel footer={sellFooter} onClose={onClose} titleKey="1129" panelName="AnimalPanel" >
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
        
      </div>
    </Panel>
  );
  
};

export default React.memo(AnimalPanel);
