import API_BASE from '../../config';
import axios from 'axios';
import { gainIngredients } from '../../Utils/InventoryManagement';
import React, { useState, useEffect } from 'react';
import ResourceIcon from '../../UI/Icons/ResourceIcon';
import Panel from '../../UI/Panels/Panel';
import '../../UI/Buttons/SharedButtons.css';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import soundManager from '../../Sound/SoundManager';
import '../../UI/Buttons/ResourceButton.css'; // the .gem-button chip
import './AnimalPanel.css';
import { sellSection } from '../../UI/Panels/SellSection';
import { countAnimalsOfType, scaledAnimalMoneyCost } from './animalPricing';
import { applyPlayerDelta, postAction } from '../../Utils/playerDelta';
import { calculateGemSpeedupCost } from '../../Economy/EconomyUtils';
import { getPlayerQuantity } from '../../Utils/InventoryManagement';
import { confirmGemSpend } from '../../UI/Modals/GemSpendConfirm';
import { usePanelContext } from '../../UI/Panels/PanelContext';
import { formatCountdown, formatNumber } from '../../UI/Timers';
import FloatingTextManager from '../../UI/FloatingText';

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
  const { openPanel } = usePanelContext();

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
        return "is grazing."; // the countdown has its own row, with the gem skip
      case 'roam':
        return "is roaming.";
      default:
        return `is in ${npc.state} state.`;
    }
  };

  // (The inventory arrives as props and every action's answer updates it: no resync GET here.)

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
      // ONE request (game-server routes/actionRoutes.js /action/animal-sell): the refund at the
      // price it cost, worked out on the server, and the animal leaves the server's grid
      const answer = await postAction('/api/action/animal-sell', { playerId: currentPlayer.playerId, gridId, npcId });
      applyPlayerDelta(answer.data, { setCurrentPlayer, setInventory, setBackpack });
      if (!answer.ok) { updateStatus('❌ Failed to sell'); return; }
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

      const totalRefund = (answer.data.refund || [])
        .filter((item) => item.type === "Money")
        .reduce((sum, item) => sum + item.qty, 0);

      console.log(`Sold ${stationType} successfully for ${totalRefund} Money.`);
      updateStatus(`Sold ${getLocalizedString(stationType, strings)} for ${totalRefund} ${getLocalizedString('Money', strings)}.`);
      soundManager.playSFX('collect_money');
      onClose();
    } catch (error) {
      console.error('Error selling the stall:', error);
    }
  };
  

  // Skip the grazing timer for gems: ONE request (/action/graze-speedup), priced by the server from
  // its own clock. Optimistic: the animal shows ready on the tap; reverted if the server refuses.
  const grazeLeftMs = currentNPC?.state === 'grazing' && currentNPC.grazeEnd ? Math.max(0, currentNPC.grazeEnd - currentTime) : 0;
  const grazeGemCost = grazeLeftMs > 0 ? calculateGemSpeedupCost(grazeLeftMs) : 0;
  const handleGrazeSpeedup = async () => {
    const npc = currentNPC;
    if (!npc || !(grazeGemCost > 0)) return;
    if (getPlayerQuantity('Gem', inventory, backpack) < grazeGemCost) { openPanel('HowToGemsPanel'); return; }
    if (!(await confirmGemSpend({ gems: grazeGemCost }))) return;
    const before = { state: npc.state, grazeEnd: npc.grazeEnd };
    NPCsInGridManager.markLocal(gridId, npc.id, { state: 'processing', grazeEnd: Date.now() });
    setCurrentNPC({ ...npc, state: 'processing', grazeEnd: Date.now() });
    const answer = await postAction('/api/action/graze-speedup', { playerId: currentPlayer.playerId, gridId, npcId: npc.id });
    applyPlayerDelta(answer.data, { setCurrentPlayer, setInventory, setBackpack });
    if (!answer.ok) {
      NPCsInGridManager.markLocal(gridId, npc.id, before);
      updateStatus(answer.reason === 'short-Gem' ? `Need ${grazeGemCost} gems` : '❌ Failed to skip the timer');
      return;
    }
    const { gems, updatedNPC } = answer.data;
    await NPCsInGridManager.updateNPC(gridId, npc.id, { state: 'processing', grazeEnd: updatedNPC?.grazeEnd || Date.now() });
    if (npc.position) FloatingTextManager.addFloatingText(`-${gems} {res:Gem}`, Math.round(npc.position.x), Math.round(npc.position.y), TILE_SIZE);
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
              <ResourceIcon resource={stallDetails} symbol={stallDetails?.symbol || '🛖'} /> {getLocalizedString(stationType, strings)}
          </h2>

          {/* Show current NPC status */}
          {currentNPC && (
            <p>
              <strong>{getLocalizedString(currentNPC.type, strings)}</strong> {getNPCStatusText(currentNPC)}
            </p>
          )}

          {/* Grazing: the countdown on its own row, the gem skip right-justified on it */}
          {grazeLeftMs > 0 && (
            <div className="panel-timer-row">
              <span>{strings[324] || 'Remaining:'} {formatCountdown(currentNPC.grazeEnd, currentTime)}</span>
              <button type="button" className="gem-button" onClick={handleGrazeSpeedup}>
                <img className="gem-button-icon" src="/assets/resources/item-gem.svg" alt="" draggable="false" />
                <span className="gem-button-cost">{formatNumber(grazeGemCost)}</span>
              </button>
            </div>
          )}
        </div>
        
      </div>
    </Panel>
  );
  
};

export default React.memo(AnimalPanel);
