import API_BASE from '../../config';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panel';
import axios from 'axios';
import '../../UI/ResourceButton.css'; 
import ResourceButton from '../../UI/ResourceButton';
import FloatingTextManager from '../../UI/FloatingText';
import { getIngredientDetails } from '../../Utils/ResourceHelpers';
import { canAfford } from '../../Utils/InventoryManagement';
import { refreshPlayerAfterInventoryUpdate } from '../../Utils/InventoryManagement';
import { StatusBarContext } from '../../UI/StatusBar/StatusBar';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import playersInGridManager from '../../GridState/PlayersInGrid';
import { createCollectEffect } from '../../VFX/VFX';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import { spendIngredients, gainIngredients } from '../../Utils/InventoryManagement';
import '../../UI/SharedButtons.css';
import workerPlacementData from './WorkerPlacement.json';
import { handleProtectedSelling } from '../../Utils/ProtectedSelling';
import TransactionButton from '../../UI/TransactionButton';
import { formatCountdown, formatDuration } from '../../UI/Timers';
import { earnTrophy } from '../Trophies/TrophyUtils';

const FarmHouse = ({
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
  masterTrophies,
  TILE_SIZE,
  isDeveloper,
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
  const [npcRefreshKey, setNpcRefreshKey] = useState(0);

   // ✅ Check for active crafting timers
   useEffect(() => {
    if (!stationType || !currentStationPosition) return;
    
    const station = GlobalGridStateTilesAndResources.getResources()?.find(
      (res) => res.x === currentStationPosition.x && res.y === currentStationPosition.y
    );

    if (station && station.craftEnd) {
        console.log(`⏳ Active crafting found: ${station.craftedItem} until ${new Date(station.craftEnd).toLocaleTimeString()}`);
        
        setCraftedItem(station.craftedItem);
        setIsCrafting(true);
        setActiveTimer(true);  // ✅ Ensure UI treats this as an active timer

        const updateCountdown = () => {
          const remainingTime = Math.max(0, Math.floor((station.craftEnd - Date.now()) / 1000));
          setCraftingCountdown(remainingTime);

          if (remainingTime === 0) {
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
      let filteredRecipes = masterResources.filter((resource) => resource.source === stationType);
      
      // Filter by FTUE step only if player is a first-time user
      if (currentPlayer.firsttimeuser === true && currentPlayer.ftuestep != null) {
        console.log(`🎓 Filtering FarmHouse recipes by FTUE step: ${currentPlayer.ftuestep}`);
        filteredRecipes = filteredRecipes.filter((recipe) => {
          // Only show recipes with level <= current FTUE step
          return recipe.level == null || recipe.level <= currentPlayer.ftuestep;
        });
      }
      
      // Filter out non-repeatable resources that already exist on the grid
      const npcsInGrid = NPCsInGridManager.getNPCsInGrid(gridId);
      if (npcsInGrid) {
        // Get all NPC types currently on the grid
        // NPCs are stored directly under NPCsInGrid with their ID as the key
        const existingNPCTypes = Object.values(npcsInGrid)
          .filter(npc => npc && npc.type) // Filter out any null/undefined entries
          .map(npc => npc.type);
        
        console.log('Existing NPC types on grid:', existingNPCTypes);
        
        // Filter out non-repeatable recipes that already exist
        filteredRecipes = filteredRecipes.filter(recipe => {
          // If it's not repeatable and already exists, filter it out
          if (recipe.repeatable === false && existingNPCTypes.includes(recipe.type)) {
            console.log(`Filtering out non-repeatable ${recipe.type} - already exists on grid`);
            return false;
          }
          return true;
        });
      }
      
      setRecipes(filteredRecipes);
      const stationResource = masterResources.find((resource) => resource.type === stationType);
      setStationEmoji(stationResource?.symbol || '🛖');
      setStationDetails(stationResource);
      setAllResources(masterResources || []);
    } catch (error) {
      console.error('Error processing masterResources:', error);
    }
  }, [stationType, masterResources, gridId, npcRefreshKey]);
  
  // Periodically refresh to check for NPC changes
  useEffect(() => {
    const interval = setInterval(() => {
      setNpcRefreshKey(prev => prev + 1);
    }, 2000); // Check every 2 seconds
    
    return () => clearInterval(interval);
  }, []);


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
      const payload = {
        playerId: currentPlayer.playerId,
        gridId,
        stationX: currentStationPosition.x,
        stationY: currentStationPosition.y,
        recipe,
        transactionId,
        transactionKey,
        // Add flag to indicate if this is a gem purchase (ingredients already paid)
        isGemPurchase: transactionKey && transactionKey.includes('crafting-gem-')
      };
      
      console.log('🔍 [CRAFT DEBUG] Sending to server:', payload);
      
      const response = await axios.post(`${API_BASE}/api/crafting/start-craft`, payload);

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
        updateStatus(`${strings[440]} ${getLocalizedString(recipe.type, strings)}`);

      }
    } catch (error) {
      console.error('Error in protected crafting start:', error);
      console.error('Error response data:', error.response?.data);
      if (error.response?.status === 429) {
        updateStatus(451);
      } else if (error.response?.status === 400) {
        updateStatus(450);
      } else {
        updateStatus(452);
      }
    }
  };


  // Protected function to collect crafted items using transaction system
  const handleCollect = async (transactionId, transactionKey, recipe) => {
    
    if (!recipe) { console.error("❌ No valid crafted item to collect."); return; }

    console.log('🔍 [COLLECT DEBUG] Starting collection:', {
      craftedItem,
      recipeType: recipe?.type,
      ftuestep: currentPlayer.ftuestep,
      firsttimeuser: currentPlayer.firsttimeuser,
      stationType
    });

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
        
        console.log('🔍 [COLLECT DEBUG] Server response:', {
          collectedItem,
          isNPC,
          hasInventory: !!inventory
        });

        // ✅ Apply skill buffs to crafted collection
        console.log('MasterSkills:', masterSkills);

        // Extract player skills and upgrades
        const playerBuffs = (currentPlayer.skills || [])
          .filter((item) => {
            const resourceDetails = allResources.find((res) => res.type === item.type);
            const isSkill = resourceDetails?.category === 'skill' || resourceDetails?.category === 'upgrade';
            const appliesToResource = (masterSkills?.[item.type]?.[collectedItem] || 1) > 1;
            return isSkill && appliesToResource;
          })
          .map((buffItem) => buffItem.type);

        // Calculate skill multiplier
        const skillMultiplier = playerBuffs.reduce((multiplier, buff) => {
          const buffValue = masterSkills?.[buff]?.[collectedItem] || 1;
          return multiplier * buffValue;
        }, 1);

        // Apply multiplier to quantity (default to 1 if not provided by backend)
        const baseQtyCollected = 1;
        const finalQtyCollected = baseQtyCollected * skillMultiplier;

        console.log('[DEBUG] qtyCollected after multiplier:', finalQtyCollected);
        FloatingTextManager.addFloatingText(`+${finalQtyCollected} ${getLocalizedString(collectedItem, strings)}`, currentStationPosition.x, currentStationPosition.y, TILE_SIZE);

        // Handle NPC spawning client-side
        if (isNPC) {
          const craftedResource = allResources.find(res => res.type === collectedItem);
          if (craftedResource) {
            // Get placement offset from WorkerPlacement.json
            const placementData = workerPlacementData.find(data => data.workerType === collectedItem);
            const offsetX = placementData?.offsetX || 0;
            const offsetY = placementData?.offsetY || 0;
            
            const spawnPosition = {
              x: currentStationPosition.x + offsetX,
              y: currentStationPosition.y + offsetY
            };
            
            console.log(`Spawning ${collectedItem} at offset (${offsetX}, ${offsetY}) from Farm House, final position: (${spawnPosition.x}, ${spawnPosition.y})`);
            NPCsInGridManager.spawnNPC(gridId, craftedResource, spawnPosition);
            
            // Check for First Farm Worker trophy
            if (craftedResource.action === 'worker') {
              await earnTrophy(currentPlayer.playerId, 'First Farm Worker', 1, currentPlayer, masterTrophies);
            }
            
            // Trigger refresh to update available recipes
            setNpcRefreshKey(prev => prev + 1);
          }
        } else {
          // Only add non-NPC items to inventory
          // Update inventory with buffed quantity
          const gained = await gainIngredients({
            playerId: currentPlayer.playerId,
            currentPlayer,
            resource: collectedItem,
            quantity: finalQtyCollected,
            inventory: currentPlayer.inventory,
            backpack: currentPlayer.backpack,
            setInventory,
            setBackpack,
            setCurrentPlayer,
            updateStatus,
            masterResources,
          });

          if (!gained) {
            console.error('❌ Failed to add buffed crafted item to inventory.');
          }
        }

        // Track quest progress for all crafted items (both NPCs and regular items)
        await trackQuestProgress(currentPlayer, 'Craft', collectedItem, finalQtyCollected, setCurrentPlayer);
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

      }
    } catch (error) {
      console.error('Error in protected crafting collection:', error);
      if (error.response?.status === 429) {
        updateStatus(471);
      } else {
        updateStatus(454);
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
  
  // Handle gem purchase
  const handleGemPurchase = async (modifiedRecipe) => {
    console.log('🔍 [GEM DEBUG] handleGemPurchase called with:', modifiedRecipe);
    
    // This is called by the gem button with a recipe modified to include gems
    // First spend the ingredients (including gems)
    const spendSuccess = await spendIngredients({
      playerId: currentPlayer.playerId,
      recipe: modifiedRecipe,
      inventory,
      backpack,
      setInventory,
      setBackpack,
      setCurrentPlayer,
      updateStatus,
    });

    if (!spendSuccess) {
      console.warn('Failed to spend ingredients for gem purchase.');
      return;
    }
    
    console.log('🔍 [GEM DEBUG] Ingredients spent successfully');

    // For gem purchases with NPCs, spawn them immediately
    const craftedResource = allResources.find(res => res.type === modifiedRecipe.type);
    if (craftedResource && craftedResource.category === 'npc') {
      // Get placement offset from WorkerPlacement.json
      const placementData = workerPlacementData.find(data => data.workerType === modifiedRecipe.type);
      const offsetX = placementData?.offsetX || 0;
      const offsetY = placementData?.offsetY || 0;
      
      const spawnPosition = {
        x: currentStationPosition.x + offsetX,
        y: currentStationPosition.y + offsetY
      };
      
      console.log(`Spawning ${modifiedRecipe.type} at offset (${offsetX}, ${offsetY}) from Farm House`);
      NPCsInGridManager.spawnNPC(gridId, craftedResource, spawnPosition);
      
      // Check for First Farm Worker trophy
      if (craftedResource.action === 'worker') {
        await earnTrophy(currentPlayer.playerId, 'First Farm Worker', 1, currentPlayer, masterTrophies);
      }
      
      // Track quest progress
      await trackQuestProgress(currentPlayer, 'Craft', modifiedRecipe.type, 1, setCurrentPlayer);
      
      
      // Update status and effects
      updateStatus(`💎 ${getLocalizedString(modifiedRecipe.type, strings)} hired instantly!`);
      FloatingTextManager.addFloatingText(`+1 ${getLocalizedString(modifiedRecipe.type, strings)}`, currentStationPosition.x, currentStationPosition.y, TILE_SIZE);
      
      // Trigger refresh
      setNpcRefreshKey(prev => prev + 1);
      
      // Refresh player data
      await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);
    } else {
      // For non-NPC items, we would need different handling
      updateStatus('Gem purchase not supported for this item type');
    }
  };

  return (
    <Panel onClose={onClose} descriptionKey="1032" titleKey="1132" panelName="FarmHouse">
      <div className="standard-panel">
        
          {recipes?.length > 0 ? (
            recipes.map((recipe) => {
              const ingredients = getIngredientDetails(recipe, allResources || []);
              const affordable = canAfford(recipe, inventory, Array.isArray(backpack) ? backpack : [], 1);
              const requirementsMet = hasRequiredSkill(recipe.requires);
              const skillColor = requirementsMet ? 'green' : 'red';
              const isCrafting = craftedItem === recipe.type && craftingCountdown > 0;
              const isReadyToCollect = craftedItem === recipe.type && craftingCountdown === 0;

              
              const craftTimeText = isCrafting
              ? `${strings[441]} ${formatCountdown(Date.now() + craftingCountdown * 1000, Date.now())}`
              : isReadyToCollect
              ? strings[457] 
              : recipe.crafttime
              ? `${strings[458]} ${formatDuration(recipe.crafttime)}`
              : strings[459];
              
              // Custom tooltips for workers
              let info;
              if (recipe.type === 'Farm Hand') {
                info = (
                  <div className="info-content">
                    <div>{strings[350]}</div>
                  </div>
                );
              } else if (recipe.type === 'Rancher') {
                info = (
                  <div className="info-content">
                    <div>{strings[351]}</div>
                  </div>
                );
              } else if (recipe.type === 'Lumberjack') {
                info = (
                  <div className="info-content">
                    <div>{strings[352]}</div>
                  </div>
                );
              } else if (recipe.type === 'Crafter') {
                info = (
                  <div className="info-content">
                    <div>{strings[353]}</div>
                  </div>
                );
              } else if (recipe.type === 'Kent') {
                info = (
                  <div className="info-content">
                    <div>{strings[354]}</div>
                  </div>
                );
              } else if (recipe.type === 'The Shepherd') {
                info = (
                  <div className="info-content">
                    <div>{strings[355]}</div>
                  </div>
                );
              } else {
                // Default info for non-worker recipes
                info = (
                  <div className="info-content">
                    <div>
                      <strong>{strings[421]}</strong>{' '}
                      {allResources
                        .filter((res) =>
                          [res.ingredient1, res.ingredient2, res.ingredient3, res.ingredient4].includes(recipe.type)
                        )
                        .map((res) => `${res.symbol || ''} ${getLocalizedString(res.type, strings)}`)
                        .join(', ') || 'None'}
                    </div>
                    <div><strong>{strings[422]}</strong> 💰 {recipe.minprice || 'n/a'}</div>
                  </div>
                );
              }
              
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
                return `<span style="color: ${color}; display: block;">${symbol} ${getLocalizedString(type, strings)} ${qty} / ${playerQty}</span>`;
              }).join('');

              return (
                <ResourceButton
                  key={recipe.type}
                  symbol={recipe.symbol}
                  name={getLocalizedString(recipe.type, strings)}
                  className={`resource-button ${isCrafting ? 'in-progress' : isReadyToCollect ? 'ready' : ''}`}
                  details={
                    isCrafting ? craftTimeText :
                    (
                      (recipe.requires ? `<span style="color: ${skillColor};">${strings[460]}${getLocalizedString(recipe.requires, strings)}</span><br>` : '') +
                      `${craftTimeText}<br>` +
                      (isReadyToCollect ? '' : `${strings[461]}<div>${formattedCosts}</div>`)
                    )
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
                  // Gem purchase props
                  gemCost={recipe.gemcost || null}
                  onGemPurchase={(recipe.gemcost && (!affordable || !requirementsMet || craftedItem !== null)) ? handleGemPurchase : null}
                  resource={recipe}
                  inventory={inventory}
                  backpack={backpack}
                  masterResources={masterResources || allResources}
                  currentPlayer={currentPlayer}
                  // Hide gem button if crafting or ready to collect
                  hideGem={isCrafting || isReadyToCollect || !recipe.gemcost}
                >
                </ResourceButton>
              );
            })
          ) : <p>{strings[456]}</p>}

        {errorMessage && <p className="error-message">{errorMessage}</p>}

        {(isDeveloper) && (
          <>
            <hr />
              <div className="standard-buttons">
                <TransactionButton 
                  className="btn-danger" 
                  onAction={handleSellStation}
                  transactionKey={`sell-refund-${stationType}-${currentStationPosition.x}-${currentStationPosition.y}-${gridId}`}
                >
                  {strings[490]}
                </TransactionButton>
              </div>

          </>
        )}
      </div>
    </Panel>
  );
};

export default React.memo(FarmHouse);