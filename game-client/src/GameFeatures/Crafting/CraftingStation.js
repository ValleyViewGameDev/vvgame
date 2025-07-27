import API_BASE from '../../config';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panel';
import axios from 'axios';
import '../../UI/ResourceButton.css'; 
import ResourceButton from '../../UI/ResourceButton';
import FloatingTextManager from '../../UI/FloatingText';
import { getIngredientDetails } from '../../Utils/ResourceHelpers';
import { canAfford } from '../../Utils/InventoryManagement';
import { updateGridResource } from '../../Utils/GridManagement';
import { refreshPlayerAfterInventoryUpdate } from '../../Utils/InventoryManagement';
import { StatusBarContext } from '../../UI/StatusBar';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import { createCollectEffect } from '../../VFX/VFX';
import { useStrings } from '../../UI/StringsContext';
import { spendIngredients, gainIngredients } from '../../Utils/InventoryManagement';
import '../../UI/SharedButtons.css';
import { useUILock } from '../../UI/UILockContext';
import { handleProtectedSelling } from '../../Utils/ProtectedSelling';
import TransactionButton from '../../UI/TransactionButton';

const CraftingStation = ({
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
  masterResources,
  masterSkills,
  TILE_SIZE,
}) => {
  const strings = useStrings();
  const [recipes, setRecipes] = useState([]);
  const [allResources, setAllResources] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [stationEmoji, setStationEmoji] = useState('🛖');
  const { updateStatus } = useContext(StatusBarContext);
  const [stationDetails, setStationDetails] = useState(null);
  const [activeTimer, setActiveTimer] = useState(false);
  const [craftedItem, setCraftedItem] = useState(null);
  const [craftingCountdown, setCraftingCountdown] = useState(null);
  const [isCrafting, setIsCrafting] = useState(false);
  const [isReadyToCollect, setIsReadyToCollect] = useState(false);
  const [isActionCoolingDown, setIsActionCoolingDown] = useState(false);
  const COOLDOWN_DURATION = 2000;
  const { setUILocked } = useUILock();

   // ✅ Check for active crafting timers
   useEffect(() => {
    if (!stationType || !currentStationPosition) return;

    console.log('🔄 Checking GlobalGridStateTilesAndResources for active crafting timers...');
    
    const station = GlobalGridStateTilesAndResources.getResources()?.find(
      (res) => res.x === currentStationPosition.x && res.y === currentStationPosition.y
    );
    console.log('📡 Fetched station from GlobalGridStateTilesAndResources:', station);

    if (station && station.craftEnd) {
        console.log(`⏳ Active crafting found: ${station.craftedItem} until ${new Date(station.craftEnd).toLocaleTimeString()}`);
        
        setCraftedItem(station.craftedItem);
        setIsCrafting(true);
        setActiveTimer(true);  // ✅ Ensure UI treats this as an active timer

        const updateCountdown = () => {
          const remainingTime = Math.max(0, Math.floor((station.craftEnd - Date.now()) / 1000));
          setCraftingCountdown(remainingTime);
          console.log(`⏳ Crafting countdown: ${remainingTime}s remaining`);

          if (remainingTime === 0) {
              console.log('✅ Crafting complete! Ready to collect.');
              setIsCrafting(false);
              setIsReadyToCollect(true);
          }
      };

        updateCountdown();
        const timer = setInterval(updateCountdown, 1000);
        return () => clearInterval(timer);
    } else {
        console.log('❌ No active crafting timer found.');
        setCraftedItem(null);
        setIsCrafting(false);
        setIsReadyToCollect(false);
        setCraftingCountdown(null);
        setActiveTimer(false);
    }
  }, [stationType, currentStationPosition, GlobalGridStateTilesAndResources.getResources(), craftingCountdown]); // ✅ Ensure state triggers re-render


  // Sync inventory with local storage and server
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

  // Fetch recipes and resources (refactored: use masterResources directly)
  useEffect(() => {
    try {
      const filteredRecipes = masterResources.filter((resource) => resource.source === stationType);
      setRecipes(filteredRecipes);
      const stationResource = masterResources.find((resource) => resource.type === stationType);
      setStationEmoji(stationResource?.symbol || '🛖');
      setStationDetails(stationResource);
      setAllResources(masterResources || []);
    } catch (error) {
      console.error('Error processing masterResources:', error);
    }
  }, [stationType, masterResources]);


  const hasRequiredSkill = (requiredSkill) => {
    return !requiredSkill || currentPlayer.skills?.some((owned) => owned.type === requiredSkill);
  };


  // Protected function to start crafting using transaction system
  const handleCraft = async (transactionId, transactionKey, recipe) => {
    console.log(`🔒 [PROTECTED CRAFTING] Starting protected craft for ${recipe.type}`);
    setErrorMessage('');
    
    if (!recipe) { 
      setErrorMessage('Invalid recipe selected.'); 
      return; 
    }

    try {
      const response = await axios.post(`${API_BASE}/api/crafting/start-craft`, {
        playerId: currentPlayer.playerId,
        gridId,
        stationX: currentStationPosition.x,
        stationY: currentStationPosition.y,
        recipe,
        transactionId,
        transactionKey
      });

      if (response.data.success) {
        // Update local state with server response
        const { craftEnd, craftedItem, inventory, backpack } = response.data;
        
        // Update inventory from server response
        if (inventory) {
          setInventory(inventory);
          setCurrentPlayer(prev => ({ ...prev, inventory }));
        }
        if (backpack) {
          setBackpack(backpack);
          setCurrentPlayer(prev => ({ ...prev, backpack }));
        }

        // Update only the specific station resource in global state
        const updatedGlobalResources = GlobalGridStateTilesAndResources.getResources().map(res =>
          res.x === currentStationPosition.x && res.y === currentStationPosition.y
            ? { ...res, craftEnd, craftedItem }
            : res
        );
        GlobalGridStateTilesAndResources.setResources(updatedGlobalResources);
        setResources(updatedGlobalResources);

        // Update UI state immediately
        setCraftedItem(craftedItem);
        setCraftingCountdown(Math.max(0, Math.floor((craftEnd - Date.now()) / 1000)));
        setActiveTimer(true);
        setIsCrafting(true);
        setIsReadyToCollect(false);

        // Refresh player data to ensure consistency
        await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);

        FloatingTextManager.addFloatingText(404, currentStationPosition.x, currentStationPosition.y, TILE_SIZE);
        updateStatus(`✅ Started crafting ${recipe.type}`);
        console.log(`✅ ${recipe.type} crafting started using protected endpoint.`);
      }
    } catch (error) {
      console.error('Error in protected crafting start:', error);
      if (error.response?.status === 429) {
        updateStatus('⚠️ Crafting already in progress');
      } else if (error.response?.status === 400) {
        updateStatus('❌ Cannot afford crafting costs');
      } else {
        updateStatus('❌ Failed to start crafting');
      }
    }
  };

  // Legacy function for reference (can be removed after testing)
  const handleCraftLegacy = async (recipe) => {
    setErrorMessage('');
    if (!recipe) { setErrorMessage('Invalid recipe selected.'); return; }

    const spent = await spendIngredients({
      playerId: currentPlayer.playerId,
      recipe,
      inventory,
      backpack,
      setInventory,
      setBackpack,
      setCurrentPlayer,
      updateStatus
    });
    if (!spent) return;

    const craftedQty = 1;
    const craftTime = recipe.crafttime || 60; // Default to 60s if no timer exists
    const craftEnd = Date.now() + craftTime * 1000; // Calculate timestamp

    try {
      // ✅ Ensure we update only the clicked Crafting Station
      const updatedStation = {
        type: stationType,
        x: currentStationPosition.x, 
        y: currentStationPosition.y, 
        craftEnd: craftEnd,
        craftedItem: recipe.type,  // ✅ Store crafted item
      };
      console.log('handleCraft: updatedStation:  ',updatedStation);
      await updateGridResource(gridId, updatedStation, setResources, true);
      console.log('📡 Fetched station from GlobalGridStateTilesAndResources:', GlobalGridStateTilesAndResources.getResources);

      // ✅ Step 1: Ensure UI Updates Immediately
      setCraftedItem(recipe.type);
      setCraftingCountdown(Math.max(0, Math.floor((craftEnd - Date.now()) / 1000)));
      setActiveTimer(true);
      setIsCrafting(true);
      setIsReadyToCollect(false);

      console.log(`🛠️ Started crafting ${recipe.type}. Will be ready at ${craftEnd}`);

      // ✅ Step 2: Update GlobalGridStateTilesAndResources Immediately
      const updatedResources = GlobalGridStateTilesAndResources.getResources().map(res =>
          res.x === currentStationPosition.x && res.y === currentStationPosition.y
              ? { ...res, craftEnd, craftedItem: recipe.type }
              : res
      );
      GlobalGridStateTilesAndResources.setResources(updatedResources);
      console.log("🌎 GlobalGridStateTilesAndResources updated after crafting start!");

      // ✅ Step 3: Ensure UI State Reflects GlobalGridStateTilesAndResources
      setResources(updatedResources);

      FloatingTextManager.addFloatingText(404, currentStationPosition.x, currentStationPosition.y, TILE_SIZE);
      console.log(`✅ ${recipe.type} will be ready at ${new Date(craftEnd).toLocaleTimeString()}`);

      } catch (error) {
        console.error(`❌ Error starting craft for ${recipe.type}:`, error);
      }

    // Track quest progress for "Craft" actions
    await trackQuestProgress(currentPlayer, 'Craft', recipe.type, craftedQty, setCurrentPlayer);
    await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);
  };


  // Protected function to collect crafted items using transaction system
  const handleCollect = async (transactionId, transactionKey, recipe) => {
    console.log(`🔒 [PROTECTED CRAFTING] Starting protected collection for ${recipe.type}`);
    
    if (!recipe) { 
      console.error("❌ No valid crafted item to collect."); 
      return; 
    }

    try {
      const response = await axios.post(`${API_BASE}/api/crafting/collect-item`, {
        playerId: currentPlayer.playerId,
        gridId,
        stationX: currentStationPosition.x,
        stationY: currentStationPosition.y,
        craftedItem,
        transactionId,
        transactionKey
      });

      if (response.data.success) {
        // Update local state with server response
        const { collectedItem, isNPC, inventory, updatedStation } = response.data;
        
        // Handle NPC spawning client-side
        if (isNPC) {
          const craftedResource = allResources.find(res => res.type === collectedItem);
          if (craftedResource) {
            NPCsInGridManager.spawnNPC(gridId, craftedResource, { x: currentStationPosition.x, y: currentStationPosition.y });
            await trackQuestProgress(currentPlayer, 'Craft', collectedItem, 1, setCurrentPlayer);
          }
        }

        // Update inventory from server response
        if (inventory) {
          setInventory(inventory);
          setCurrentPlayer(prev => ({ ...prev, inventory }));
        }

        // Update grid resources to remove crafting state
        const updatedGlobalResources = GlobalGridStateTilesAndResources.getResources().map(res =>
          res.x === currentStationPosition.x && res.y === currentStationPosition.y
            ? { ...res, craftEnd: undefined, craftedItem: undefined }
            : res
        );
        GlobalGridStateTilesAndResources.setResources(updatedGlobalResources);
        setResources(updatedGlobalResources);

        // Reset UI state
        setActiveTimer(false);
        setCraftedItem(null);
        setCraftingCountdown(null);
        setIsReadyToCollect(false);

        // Refresh player data to ensure consistency
        await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);

        updateStatus(`✅ Collected: ${collectedItem}`);
        console.log(`✅ ${recipe.type} collected successfully using protected endpoint.`);
      }
    } catch (error) {
      console.error('Error in protected crafting collection:', error);
      if (error.response?.status === 429) {
        updateStatus('⚠️ Collection already in progress');
      } else {
        updateStatus('❌ Failed to collect item');
      }
    }
  };


  const handleSellStation = async (transactionId, transactionKey) => {
    await handleProtectedSelling({
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
  };
  

  return (
    <Panel onClose={onClose} descriptionKey="1009" titleKey="1109" panelName="CraftingStation">
      <div className="standard-panel">
        <h2> {stationEmoji} {stationType} </h2>
        
          {recipes?.length > 0 ? (
            recipes.map((recipe) => {
              const ingredients = getIngredientDetails(recipe, allResources || []);
              const affordable = canAfford(recipe, inventory, Array.isArray(backpack) ? backpack : [], 1);
              const requirementsMet = hasRequiredSkill(recipe.requires);
              const isCrafting = craftedItem === recipe.type && craftingCountdown > 0;
              const isReadyToCollect = craftedItem === recipe.type && craftingCountdown === 0;

              const formatCountdown = (seconds) => {
                const days = Math.floor(seconds / 86400);
                const hours = Math.floor((seconds % 86400) / 3600);
                const minutes = Math.floor((seconds % 3600) / 60);
                const secs = seconds % 60;
              
                const parts = [];
                if (days > 0) parts.push(`${days}d`);
                if (hours > 0) parts.push(`${hours}h`);
                if (minutes > 0) parts.push(`${minutes}m`);
                if (secs > 0 && parts.length === 0) parts.push(`${secs}s`); // Only show seconds if no other units
                
                return parts.join(' ') || '0s';
              };
              
              const craftTimeText = isCrafting
              ? `⏳ In progress: ${formatCountdown(craftingCountdown)}`
              : isReadyToCollect
              ? `✅ Ready!`
              : recipe.crafttime
              ? `Time: ${formatCountdown(recipe.crafttime)}`
              : `Instant`;
              
              const info = (
                <div className="info-content">
                  <div>
                    <strong>{strings[421]}</strong>{' '}
                    {allResources
                      .filter((res) =>
                        [res.ingredient1, res.ingredient2, res.ingredient3, res.ingredient4].includes(recipe.type)
                      )
                      .map((res) => `${res.symbol || ''} ${res.type}`)
                      .join(', ') || 'None'}
                  </div>
                  <div><strong>{strings[422]}</strong> 💰 {recipe.minprice || 'n/a'}</div>
                </div>
              );
              
              // Format costs with color per ingredient (now using display: block and no <br>)
              const formattedCosts = [1, 2, 3, 4].map((i) => {
                const type = recipe[`ingredient${i}`];
                const qty = recipe[`ingredient${i}qty`];
                if (!type || !qty) return '';

                const inventoryQty = inventory?.find(item => item.type === type)?.quantity || 0;
                const backpackQty = backpack?.find(item => item.type === type)?.quantity || 0;
                const playerQty = inventoryQty + backpackQty;
                const color = playerQty >= qty ? 'green' : 'red';
                const symbol = allResources.find(r => r.type === type)?.symbol || '';
                return `<span style="color: ${color}; display: block;">${symbol} ${type} ${qty} / ${playerQty}</span>`;
              }).join('');

              return (
                <ResourceButton
                  key={recipe.type}
                  symbol={recipe.symbol}
                  name={recipe.type}
                  className={`resource-button ${isCrafting ? 'in-progress' : isReadyToCollect ? 'ready' : ''}`}
                  details={
                    (isReadyToCollect ? '' : `Costs:<div>${formattedCosts}</div>`) +
                    (recipe.requires ? `<br>Requires: ${recipe.requires}` : '') +
                    `<br>${craftTimeText}`
                  }
                  info={info}
                  disabled={!isReadyToCollect && (craftedItem !== null || !affordable || !requirementsMet)}
                  onClick={undefined} // Remove direct onClick since we're using transaction mode
                  // Transaction mode props for both craft start and collect
                  isTransactionMode={true}
                  transactionKey={isReadyToCollect ? 
                    `crafting-collect-${recipe.type}-${currentStationPosition.x}-${currentStationPosition.y}` : 
                    `crafting-start-${recipe.type}-${currentStationPosition.x}-${currentStationPosition.y}`}
                  onTransactionAction={isReadyToCollect ? 
                    (transactionId, transactionKey) => handleCollect(transactionId, transactionKey, recipe) :
                    (transactionId, transactionKey) => handleCraft(transactionId, transactionKey, recipe)}
                >
                </ResourceButton>
              );
            })
          ) : <p>{strings[424]}</p>}

        {errorMessage && <p className="error-message">{errorMessage}</p>}

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

export default React.memo(CraftingStation);