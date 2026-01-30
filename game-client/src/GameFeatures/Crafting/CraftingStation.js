import API_BASE from '../../config';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panels/Panel';
import axios from 'axios';
import '../../UI/Buttons/ResourceButton.css';
import ResourceButton from '../../UI/Buttons/ResourceButton';
import FloatingTextManager from '../../UI/FloatingText';
import { getIngredientDetails } from '../../Utils/ResourceHelpers';
import { calculateGemSpeedupCost } from '../../Economy/EconomyUtils';
import { updateGridResource } from '../../Utils/GridManagement';
import { canAfford, calculateSkillMultiplier, applySkillMultiplier } from '../../Utils/InventoryManagement';
import { refreshPlayerAfterInventoryUpdate } from '../../Utils/InventoryManagement';
import { StatusBarContext } from '../../UI/StatusBar/StatusBar';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import { spendIngredients, gainIngredients } from '../../Utils/InventoryManagement';
import { formatSingleCollection } from '../../UI/StatusBar/CollectionFormatters';
import '../../UI/Buttons/SharedButtons.css';
import { handleProtectedSelling } from '../../Utils/ProtectedSelling';
import TransactionButton from '../../UI/Buttons/TransactionButton';
import { formatCountdown, formatDuration } from '../../UI/Timers';
import { getMayorUsername } from '../Government/GovUtils';
import './ScrollStation.css'; // Import for shared station panel styles

const CraftingStation = ({
  onClose,
  inventory,
  setInventory,
  backpack,
  setBackpack,
  currentPlayer,
  setCurrentPlayer,
  resources,
  setResources,
  stationType,
  currentStationPosition,
  gridId,
  masterResources,
  masterSkills,
  TILE_SIZE,
  isDeveloper,
  currentSeason,
  globalTuning,
}) => {
  const isHomestead = currentPlayer?.location?.gtype === 'homestead';
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
  const [stationRefreshKey, setStationRefreshKey] = useState(0);
  const [isMayor, setIsMayor] = useState(false);

   // ✅ Check for active crafting timers
   useEffect(() => {
    if (!stationType || !currentStationPosition) return;

    console.log('🔄 [CRAFTING USEEFFECT] Checking for active crafting timers...', {
      stationRefreshKey,
      resourcesLength: resources?.length,
      currentStationPosition
    });

    const station = resources?.find(
      (res) => res.x === currentStationPosition.x && res.y === currentStationPosition.y
    );

    console.log('🔄 [CRAFTING USEEFFECT] Found station:', {
      station: station ? { x: station.x, y: station.y, craftEnd: station.craftEnd, craftedItem: station.craftedItem } : null
    });

    if (station && station.craftEnd) {
        console.log('🔄 [CRAFTING USEEFFECT] Station has craftEnd, setting up timer');
        setCraftedItem(station.craftedItem);
        setIsCrafting(true);
        setActiveTimer(true);  // ✅ Ensure UI treats this as an active timer

        const updateCountdown = () => {
          const remainingTime = Math.max(0, Math.floor((station.craftEnd - Date.now()) / 1000));
          setCraftingCountdown(remainingTime);

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
        console.log('🔄 [CRAFTING USEEFFECT] No craftEnd found, resetting state');
        setCraftedItem(null);
        setIsCrafting(false);
        setIsReadyToCollect(false);
        setCraftingCountdown(null);
        setActiveTimer(false);
    }
  }, [stationType, currentStationPosition, resources, stationRefreshKey]); // ✅ Use resources prop and stationRefreshKey for proper reactivity


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
      let filteredRecipes = masterResources.filter((resource) => {
        // Check if resource source matches station type
        if (resource.source !== stationType) return false;
        
        // Check seasonal restriction
        if (resource.season && currentSeason && resource.season !== currentSeason) {
          return false;
        }
        
        return true;
      });
      
      // Filter out non-repeatable resources that already exist on the grid
      const npcsInGrid = NPCsInGridManager.getNPCsInGrid(gridId);
      if (npcsInGrid) {
        // Get all NPC types currently on the grid
        // NPCs are stored directly under NPCsInGrid with their ID as the key
        const existingNPCTypes = Object.values(npcsInGrid)
          .filter(npc => npc && npc.type) // Filter out any null/undefined entries
          .map(npc => npc.type);        
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

  // Check if player is mayor for town building selling permissions
  useEffect(() => {
    const checkMayorStatus = async () => {
      let isPlayerMayor = false;
      if (currentPlayer?.location?.gtype === 'town' && currentPlayer?.location?.s) {
        try {
          const mayorUsername = await getMayorUsername(currentPlayer.location.s);
          isPlayerMayor = mayorUsername === currentPlayer.username;
        } catch (error) {
          console.error('Error checking mayor status:', error);
        }
      }
      setIsMayor(isPlayerMayor);
    };

    if (currentPlayer) {
      checkMayorStatus();
    }
  }, [currentPlayer?.location?.s, currentPlayer?.username]);

  const hasRequiredSkill = (requiredSkill) => {
    return !requiredSkill || currentPlayer.skills?.some((owned) => owned.type === requiredSkill);
  };


  // Protected function to start crafting using transaction system
  const handleCraft = async (transactionId, transactionKey, recipe) => {
    console.log(`🔒 [PROTECTED CRAFTING] Starting protected craft for ${recipe.type}`);
    console.log('Current station state:', { craftedItem, isCrafting, isReadyToCollect, craftingCountdown });
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
        console.log('🔄 [CRAFT START] Updating resources with new craftEnd:', craftEnd, 'craftedItem:', craftedItem);
        const updatedGlobalResources = GlobalGridStateTilesAndResources.getResources().map(res =>
          res.x === currentStationPosition.x && res.y === currentStationPosition.y
            ? { ...res, craftEnd, craftedItem }
            : res
        );
        const updatedStation = updatedGlobalResources.find(
          res => res.x === currentStationPosition.x && res.y === currentStationPosition.y
        );
        console.log('🔄 [CRAFT START] Updated station:', {
          craftEnd: updatedStation?.craftEnd,
          craftedItem: updatedStation?.craftedItem
        });
        GlobalGridStateTilesAndResources.setResources(updatedGlobalResources);
        setResources(updatedGlobalResources);

        // Update UI state immediately
        console.log('🔄 [CRAFT START] Setting UI state - isCrafting: true, activeTimer: true');
        setCraftedItem(craftedItem);
        setCraftingCountdown(Math.max(0, Math.floor((craftEnd - Date.now()) / 1000)));
        setActiveTimer(true);
        setIsCrafting(true);
        setIsReadyToCollect(false);

        // Refresh player data to ensure consistency
        await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);

        FloatingTextManager.addFloatingText(404, currentStationPosition.x, currentStationPosition.y, TILE_SIZE);
        updateStatus(`${strings[440]} ${getLocalizedString(recipe.type, strings)}`);

        console.log(`✅ ${recipe.type} crafting started using protected endpoint.`);
      }
    } catch (error) {
      console.error('Error in protected crafting start:', error);
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

        // ✅ Apply skill buffs to crafted collection (station-based)
        console.log('MasterSkills:', masterSkills);
        console.log('Station Type:', stationType);

        // Use shared skill calculation utility
        const skillInfo = calculateSkillMultiplier(stationType, currentPlayer.skills || [], masterSkills);

        // Apply multiplier to quantity (default to 1 if not provided by backend)
        const baseQtyCollected = 1;
        const finalQtyCollected = applySkillMultiplier(baseQtyCollected, skillInfo.multiplier);

        console.log('[DEBUG] qtyCollected after multiplier:', finalQtyCollected);

        // Handle NPC spawning client-side
        if (isNPC) {
          const craftedResource = allResources.find(res => res.type === collectedItem);
          if (craftedResource) {
            NPCsInGridManager.spawnNPC(gridId, craftedResource, { x: currentStationPosition.x, y: currentStationPosition.y });
            // Trigger refresh to update available recipes
            setNpcRefreshKey(prev => prev + 1);
          }
          // Show floating text for NPCs immediately since they don't need inventory space
          const npcSymbol = craftedResource?.symbol || '🎁';
          FloatingTextManager.addFloatingText(`+${finalQtyCollected} ${npcSymbol} ${getLocalizedString(collectedItem, strings)}`, currentStationPosition.x, currentStationPosition.y, TILE_SIZE);
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
            globalTuning,
          });

          // Check if gainIngredients failed (returns object with success: false, or falsy value)
          if (gained !== true && (!gained || gained.success === false)) {
            console.error('❌ Failed to add buffed crafted item to inventory.');
            return; // Exit early - don't clear crafting state if we couldn't collect
          }

          // Show floating text only after successful collection
          const collectedItemResource = masterResources.find(r => r.type === collectedItem);
          const collectedSymbol = collectedItemResource?.symbol || '🎁';
          FloatingTextManager.addFloatingText(`+${finalQtyCollected} ${collectedSymbol} ${getLocalizedString(collectedItem, strings)}`, currentStationPosition.x, currentStationPosition.y, TILE_SIZE);
        }

        // Only clear crafting state if we successfully collected (or it's an NPC)
        
        // Track quest progress for all crafted items (both NPCs and regular items)
        await trackQuestProgress(currentPlayer, 'Craft', collectedItem, finalQtyCollected, setCurrentPlayer);

        // Update grid resources to remove crafting state
        console.log('🔄 [COLLECT] Clearing crafting state from resources...');
        const updatedGlobalResources = GlobalGridStateTilesAndResources.getResources().map(res =>
          res.x === currentStationPosition.x && res.y === currentStationPosition.y
            ? { ...res, craftEnd: undefined, craftedItem: undefined }
            : res
        );
        const clearedStation = updatedGlobalResources.find(
          res => res.x === currentStationPosition.x && res.y === currentStationPosition.y
        );
        console.log('🔄 [COLLECT] Updated station after clearing:', {
          craftEnd: clearedStation?.craftEnd,
          craftedItem: clearedStation?.craftedItem
        });
        GlobalGridStateTilesAndResources.setResources(updatedGlobalResources);
        setResources(updatedGlobalResources);

        // Reset UI state
        console.log('🔄 [COLLECT] Resetting UI state...');
        setActiveTimer(false);
        setCraftedItem(null);
        setCraftingCountdown(null);
        setIsReadyToCollect(false);
        setIsCrafting(false);

        // Force a refresh of the station state
        console.log('🔄 [COLLECT] Incrementing stationRefreshKey');
        setStationRefreshKey(prev => {
          console.log('🔄 [COLLECT] stationRefreshKey changing from', prev, 'to', prev + 1);
          return prev + 1;
        });

        // Refresh player data to ensure consistency
        await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);

        // Use shared formatter for status message
        const statusMessage = formatSingleCollection('craft', collectedItem, finalQtyCollected, 
          skillInfo.hasSkills ? skillInfo : null, strings, getLocalizedString);
        updateStatus(statusMessage);

        console.log(`${recipe.type} collected successfully using protected endpoint.`);
      }
    } catch (error) {
      console.error('Error in protected crafting collection:', error);
      if (error.response?.status === 429) {
        updateStatus(471);
      } else {
        updateStatus('❌ Failed to collect item');
      }
    }
  };


  const handleSellStation = async (transactionId, transactionKey) => {
    // Mayor can sell town buildings, homestead owners can sell at home
    const isTownMayorSelling = stationDetails?.source === 'BuildTown' && currentPlayer.location.gtype === 'town' && isMayor;
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
      onClose,
      devOnly: !isHomestead && !isTownMayorSelling, // Only verify developer status when NOT on homestead and NOT mayor selling town building
    });
  };

  // Handle gem speedup for crafting
  const handleGemSpeedup = async (recipe) => {
    if (!isCrafting || !craftingCountdown) {
      console.error('❌ No active crafting to speed up');
      return;
    }

    const remainingTimeMs = craftingCountdown * 1000;
    const gemCost = calculateGemSpeedupCost(remainingTimeMs);
    
    // Check if player has enough gems
    const currentGems = (currentPlayer.inventory?.find(item => item.type === 'Gem')?.quantity || 0) +
                       (currentPlayer.backpack?.find(item => item.type === 'Gem')?.quantity || 0);
    
    if (currentGems < gemCost) {
      updateStatus(`Need ${gemCost} gems to speed up crafting`);
      return;
    }

    try {
      // Spend gems to complete crafting instantly
      const spentResult = await spendIngredients({
        playerId: currentPlayer.playerId,
        recipe: { 
          ingredient1: 'Gem',
          ingredient1qty: gemCost,
        },
        inventory,
        backpack,
        setInventory,
        setBackpack,
        setCurrentPlayer,
        updateStatus,
      });

      if (!spentResult) {
        console.error('❌ Failed to spend gems for speedup');
        return;
      }

      // Update the station in the database to mark crafting as complete
      const updateResponse = await updateGridResource(
        gridId,
        {
          type: stationType,
          x: currentStationPosition.x,
          y: currentStationPosition.y,
          craftEnd: Date.now(), // Set to current time to complete immediately
          craftedItem
        },
        true
      );

      if (updateResponse?.success) {
        // Update global state to reflect the database change
        const updatedGlobalResources = GlobalGridStateTilesAndResources.getResources().map(res =>
          res.x === currentStationPosition.x && res.y === currentStationPosition.y
            ? { ...res, craftEnd: Date.now(), craftedItem }
            : res
        );
        GlobalGridStateTilesAndResources.setResources(updatedGlobalResources);
        setResources(updatedGlobalResources);

        // Update UI state
        setCraftingCountdown(0);
        setIsCrafting(false);
        setIsReadyToCollect(true);

        updateStatus(`Used ${gemCost} gems to complete crafting instantly`);
        FloatingTextManager.addFloatingText(`-${gemCost} 💎`, currentStationPosition.x, currentStationPosition.y, TILE_SIZE);
        
        console.log(`✅ Crafting completed instantly using ${gemCost} gems`);
      } else {
        throw new Error('Failed to update crafting station in database');
      }
    } catch (error) {
      console.error('❌ Error in gem speedup:', error);
      updateStatus('❌ Failed to speed up crafting');
    }
  };

  // Handle gem purchase for instant crafting
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

    // For regular crafting items, add them to inventory immediately
    const craftedResource = allResources.find(res => res.type === modifiedRecipe.type);
    if (craftedResource) {
      // Add the item to inventory
      const gained = await gainIngredients({
        playerId: currentPlayer.playerId,
        currentPlayer,
        resource: modifiedRecipe.type,
        quantity: 1,
        inventory: currentPlayer.inventory,
        backpack: currentPlayer.backpack,
        setInventory,
        setBackpack,
        setCurrentPlayer,
        updateStatus,
        masterResources,
        globalTuning,
      });

      // Check if gainIngredients succeeded (returns true on success, object with success: false on failure)
      if (gained === true || (gained && gained.success === true)) {
        // Track quest progress
        await trackQuestProgress(currentPlayer, 'Craft', modifiedRecipe.type, 1, setCurrentPlayer);
        
        // Update status and effects
        updateStatus(`💎 ${getLocalizedString(modifiedRecipe.type, strings)} crafted instantly!`);
        FloatingTextManager.addFloatingText(`+1 ${getLocalizedString(modifiedRecipe.type, strings)}`, currentStationPosition.x, currentStationPosition.y, TILE_SIZE);
        
        // Refresh player data
        await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);
      } else {
        updateStatus('❌ Failed to add crafted item to inventory');
      }
    } else {
      updateStatus('Gem purchase not supported for this item type');
    }
  };
  
  // Generate skill bonus message
  const getSkillBonusMessage = () => {
    // Find all skills that apply to this station
    const applicableSkills = Object.entries(masterSkills || {})
      .filter(([skillName, stations]) => {
        return stations && typeof stations === 'object' && stations[stationType] > 1;
      })
      .map(([skillName, stations]) => ({
        skillName,
        multiplier: stations[stationType],
        hasSkill: currentPlayer.skills?.some(item => item.type === skillName)
      }));
    
    if (applicableSkills.length === 0) return null;
    
    // Separate owned and unowned skills
    const ownedSkills = applicableSkills.filter(skill => skill.hasSkill);
    const unownedSkills = applicableSkills.filter(skill => !skill.hasSkill);
    
    // Calculate combined multiplier for owned skills
    const combinedMultiplier = ownedSkills.reduce((total, skill) => total * skill.multiplier, 1);
    
    let messages = [];
    
    // Message for owned skills
    if (ownedSkills.length > 0) {
      if (ownedSkills.length === 1) {
        // Single skill: "Your [skill] Skill increases the base output of this station by [X]."
        messages.push(`${strings[805]}${getLocalizedString(ownedSkills[0].skillName, strings)}${strings[806]}${ownedSkills[0].multiplier}x.`);
      } else {
        // Multiple skills: list them with their multipliers and show combined effect
        const skillsList = ownedSkills
          .map(skill => `${getLocalizedString(skill.skillName, strings)} (${skill.multiplier}x)`)
          .join(' & ');
        messages.push(`Your ${skillsList} skills combine to increase output by ${combinedMultiplier}x.`);
      }
    }
    
    // Message for unowned skills
    if (unownedSkills.length > 0) {
      unownedSkills.forEach(skill => {
        const skillResource = allResources.find(res => res.type === skill.skillName);
        const skillSource = skillResource?.source || 'Skill Shop';
        // "Acquire the [skill] Skill at the [source] to increase the output of this station by [X]x."
        messages.push(`${strings[801]}${getLocalizedString(skill.skillName, strings)}${strings[802]}${getLocalizedString(skillSource, strings)}${strings[803]}${skill.multiplier}x.`);
      });
    }
    
    return messages.join(' ');
  };

  const skillMessage = getSkillBonusMessage();

  // Count hospitals on the current grid
  const countHospitals = () => {
    if (!resources || !allResources) return 0;
    
    return resources.filter(resource => {
      // Find the master resource to check if it's a Hospital
      const masterResource = allResources.find(mr => mr.type === resource.type);
      return masterResource && masterResource.type === 'Hospital';
    }).length;
  };

  // Count existing healers on the current grid
  const countHealers = () => {
    const npcsInGrid = NPCsInGridManager.getNPCsInGrid(gridId);
    if (!npcsInGrid) return 0;
    
    return Object.values(npcsInGrid).filter(npc => npc && npc.action === 'heal').length;
  };

  // Calculate maximum healers allowed based on hospitals and doctorsPerHospital setting
  const getMaxHealersAllowed = () => {
    const hospitalCount = countHospitals();
    const doctorsPerHospital = globalTuning?.doctorsPerHospital || 1; // Default to 1 if not set
    return hospitalCount * doctorsPerHospital;
  };

  const currentHealers = countHealers();
  const maxHealersAllowed = getMaxHealersAllowed();

  return (
    <Panel onClose={onClose} title={`${stationEmoji} ${getLocalizedString(stationType, strings)}`} panelName="CraftingStation">
      <div className="station-panel-container">
        {/* Check if Library or Hospital requires home settlement (valley grids are open to all) */}
        {(stationType === 'Library' || stationType === 'Hospital') &&
         !currentPlayer?.location?.gtype?.startsWith('valley') &&
         String(currentPlayer.location.s) !== String(currentPlayer.settlementId) ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <h2>{strings[2050] || "This is not your home settlement. You cannot access community services in any settlement but your own."}</h2>
          </div>
        ) : (
          <>
            {skillMessage && (
              <div className="station-panel-header" style={{
                padding: '10px',
                backgroundColor: 'var(--color-bg-light)',
                borderRadius: '5px',
                fontStyle: 'italic',
                marginBottom: '10px'
              }}>
                {skillMessage}
              </div>
            )}
            <div className="station-panel-content">
        
          {recipes?.length > 0 ? (
            recipes.map((recipe) => {
              const ingredients = getIngredientDetails(recipe, allResources || []);
              const affordable = canAfford(recipe, inventory, Array.isArray(backpack) ? backpack : [], 1);
              const requirementsMet = hasRequiredSkill(recipe.requires);
              const skillColor = requirementsMet ? 'green' : 'red';
              const isCrafting = craftedItem === recipe.type && craftingCountdown > 0;
              const isReadyToCollect = craftedItem === recipe.type && craftingCountdown === 0;
              
              // Check if this is a healer and if we've hit the hospital capacity limit
              const isHealer = recipe.action === 'heal';
              const healerLimitReached = isHealer && currentHealers >= maxHealersAllowed;
              
              // Calculate gem speedup cost for this crafting item
              // craftingCountdown is already in seconds, so we don't multiply by 1000
              const gemSpeedupCost = isCrafting ? calculateGemSpeedupCost(craftingCountdown * 1000) : 0;

              
              const craftTimeText = isCrafting
              ? `${strings[441]} ${formatCountdown(Date.now() + craftingCountdown * 1000, Date.now())}`
              : isReadyToCollect
              ? strings[457] 
              : recipe.crafttime
              ? `${strings[458]} ${formatDuration(recipe.crafttime)}`
              : strings[459];
              
              const info = (
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
                  {/* Show healer maxhp info for Hospital buildings with healer NPCs */}
                  {stationType === 'Hospital' && recipe.action === 'heal' && (
                    <div><strong>{strings[51]}</strong> {recipe.maxhp || 'n/a'}</div>
                  )}
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
                return `<span style="color: ${color}; display: block;">${symbol} ${getLocalizedString(type, strings)} ${qty} / ${playerQty}</span>`;
              }).join('');

              return (
                <ResourceButton
                  key={recipe.type}
                  symbol={recipe.symbol}
                  name={getLocalizedString(recipe.type, strings)}
                  className={`resource-button ${isCrafting ? 'in-progress' : isReadyToCollect ? 'ready btn-sell' : ''}`}
                  details={
                    isCrafting ? craftTimeText :
                    (
                      (healerLimitReached ? `<span style="color: red;">${strings[408]}</span><br>` : '') +
                      (recipe.requires ? `<span style="color: ${skillColor};">${strings[460]}${getLocalizedString(recipe.requires, strings)}</span><br>` : '') +
                      `${craftTimeText}<br>` +
                      (isReadyToCollect ? '' : `${strings[461]}<div>${formattedCosts}</div>`)
                    )
                  }
                  info={info}
                  disabled={!isReadyToCollect && (craftedItem !== null || !affordable || !requirementsMet || healerLimitReached)}
                  onClick={undefined} // Remove direct onClick since we're using transaction mode
                  // Transaction mode props for both craft start and collect
                  isTransactionMode={true}
                  transactionKey={isReadyToCollect ? 
                    `crafting-collect-${recipe.type}-${currentStationPosition.x}-${currentStationPosition.y}` : 
                    `crafting-start-${recipe.type}-${currentStationPosition.x}-${currentStationPosition.y}`}
                  onTransactionAction={isReadyToCollect ? 
                    (transactionId, transactionKey) => handleCollect(transactionId, transactionKey, recipe) :
                    (transactionId, transactionKey) => handleCraft(transactionId, transactionKey, recipe)}
                  // Gem purchase props (for instant purchase) or speedup props (for active crafting)
                  gemCost={isCrafting ? gemSpeedupCost : null}
                  onGemPurchase={isCrafting ? 
                    () => handleGemSpeedup(recipe) : 
                    ((recipe.gemcost && (!affordable || !requirementsMet) && craftedItem === null && !healerLimitReached) ? handleGemPurchase : null)}
                  resource={isCrafting ? { 
                    type: 'CraftingSpeedup', 
                    gemcost: gemSpeedupCost // Main gem cost, no ingredients
                  } : recipe}
                  inventory={inventory}
                  backpack={backpack}
                  masterResources={masterResources}
                  currentPlayer={currentPlayer}
                  // Hide gem button logic:
                  // - If ready to collect: hide
                  // - If this item is crafting: show speedup button
                  // - If another item is crafting: hide
                  // - If nothing is crafting and no gem cost: hide
                  // - If nothing is crafting and has gem cost: show purchase button
                  // - If healer limit reached: hide
                  hideGem={isReadyToCollect || 
                           (!isCrafting && craftedItem !== null) || 
                           (!isCrafting && !recipe.gemcost) ||
                           healerLimitReached}
                >
                </ResourceButton>
              );
            })
          ) : <p>{strings[424]}</p>}

          {errorMessage && <p className="error-message">{errorMessage}</p>}
        </div>
        
            {(currentPlayer.location.gtype === 'homestead' || 
              isDeveloper || 
              (stationDetails?.source === 'BuildTown' && currentPlayer.location.gtype === 'town' && isMayor)) && (
              <div className="station-panel-footer">
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
          </>
        )}
      </div>
    </Panel>
  );
};

export default React.memo(CraftingStation);