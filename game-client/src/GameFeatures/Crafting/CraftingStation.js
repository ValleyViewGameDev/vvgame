import API_BASE from '../../config';
import React, { useState, useEffect, useContext, useMemo } from 'react';
import ReactDOM from 'react-dom';
import Panel from '../../UI/Panels/Panel';
import axios from 'axios';
import '../../UI/Buttons/ResourceButton.css';
import ResourceButton from '../../UI/Buttons/ResourceButton';
import FloatingTextManager from '../../UI/FloatingText';
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
import soundManager from '../../Sound/SoundManager';
import '../../UI/Buttons/SharedButtons.css';
import { handleProtectedSelling } from '../../Utils/ProtectedSelling';
import TransactionButton from '../../UI/Buttons/TransactionButton';
import { formatDuration, formatCompactCountdown } from '../../UI/Timers';
import { getMayorUsername } from '../Government/GovUtils';
import './CraftingStation.css'; // Import for crafting station panel and slot styles

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
  const [npcRefreshKey, setNpcRefreshKey] = useState(0);
  const [stationRefreshKey, setStationRefreshKey] = useState(0);
  const [isMayor, setIsMayor] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [slotTooltip, setSlotTooltip] = useState({ show: false, slotIndex: null, top: 0, left: 0 });
  const [outputTooltip, setOutputTooltip] = useState({ show: false, top: 0, left: 0 });
  // Per-slot countdown timers (keyed by slot index)
  const [slotCountdowns, setSlotCountdowns] = useState({});
  // Slot index showing "Added" floating text animation (null when none)
  const [slotAddedAnimation, setSlotAddedAnimation] = useState(null);
  // Slot collection animation state: { slotIndex, text } or null
  const [slotCollectedAnimation, setSlotCollectedAnimation] = useState(null);

  // Tooltip position update function (similar to ResourceButton)
  const updateSlotTooltipPosition = (event, slotIndex) => {
    setSlotTooltip({
      show: true,
      slotIndex,
      top: event.clientY + window.scrollY + 10,
      left: event.clientX + window.scrollX + 15,
    });
  };

  // Get station level (default 0 for pre-existing stations)
  const station = resources?.find(
    (res) => res.x === currentStationPosition?.x && res.y === currentStationPosition?.y
  );
  const stationLevel = station?.stationLevel ?? 0;
  const maxSlots = globalTuning?.maxCraftingStationSlots || 4;

  // Compute effective slots - merge legacy craftEnd/craftedItem into slot 0 if no slots array
  // This handles backward compatibility for stations that had crafts before the multi-slot update
  const effectiveSlots = useMemo(() => {
    if (station?.slots && station.slots.length > 0) {
      return station.slots;
    }
    // Legacy fallback: if station has craftEnd/craftedItem but no slots, treat as slot 0
    if (station?.craftEnd || station?.craftedItem) {
      return [{
        craftEnd: station.craftEnd,
        craftedItem: station.craftedItem,
        qty: station.qty || 1
      }];
    }
    return [];
  }, [station?.slots, station?.craftEnd, station?.craftedItem, station?.qty]);

   // ✅ Manage per-slot countdown timers
   useEffect(() => {
    if (!stationType || !currentStationPosition) return;

    const updateCountdowns = () => {
      const newCountdowns = {};
      (effectiveSlots || []).forEach((slot, i) => {
        if (slot?.craftEnd && slot.craftEnd > Date.now()) {
          newCountdowns[i] = Math.max(0, Math.floor((slot.craftEnd - Date.now()) / 1000));
        }
      });
      setSlotCountdowns(newCountdowns);
    };

    updateCountdowns();
    const interval = setInterval(updateCountdowns, 1000);
    return () => clearInterval(interval);
  }, [stationType, currentStationPosition, effectiveSlots, stationRefreshKey]);


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

  // Build a spendIngredients-compatible recipe from globalTuning slot costs
  const buildSlotCostRecipe = (slotIndex) => {
    const slotKey = `slot${slotIndex}`;
    const costs = globalTuning?.craftingStationSlotCosts?.[slotKey];
    if (!costs) return null;

    const recipe = {};
    let i = 1;
    for (const [resourceType, qty] of Object.entries(costs)) {
      if (qty <= 0) continue;
      recipe[`ingredient${i}`] = resourceType;
      recipe[`ingredient${i}qty`] = qty;
      i++;
    }
    return Object.keys(recipe).length > 0 ? recipe : null;
  };

  const handleUpgradeSlot = async (slotIndex) => {
    if (isUpgrading) return;
    setIsUpgrading(true);

    try {
      const response = await axios.post(`${API_BASE}/api/crafting/upgrade-station`, {
        playerId: currentPlayer.playerId,
        gridId,
        stationX: currentStationPosition.x,
        stationY: currentStationPosition.y,
        targetLevel: slotIndex,
        transactionId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        transactionKey: `upgrade-station-${currentStationPosition.x}-${currentStationPosition.y}-${gridId}`
      });

      if (response.data.success) {
        // Update inventory from server
        if (response.data.inventory) setInventory(response.data.inventory);
        if (response.data.backpack) setBackpack(response.data.backpack);
        setCurrentPlayer(prev => ({
          ...prev,
          inventory: response.data.inventory || prev.inventory,
          backpack: response.data.backpack || prev.backpack
        }));

        // Update station level in local grid resources
        const newLevel = response.data.newLevel;
        const updatedResources = GlobalGridStateTilesAndResources.getResources().map(res =>
          res.x === currentStationPosition.x && res.y === currentStationPosition.y
            ? { ...res, stationLevel: newLevel }
            : res
        );
        GlobalGridStateTilesAndResources.setResources(updatedResources);
        setResources(updatedResources);

        FloatingTextManager.addFloatingText(`Slot ${slotIndex + 1}`, currentStationPosition.x, currentStationPosition.y, TILE_SIZE);
        soundManager.playSFX('collect_item');

        // Refresh player data
        await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);
      }
    } catch (error) {
      if (error.response?.status === 429) {
        updateStatus(451);
      } else {
        updateStatus(452);
      }
    } finally {
      setIsUpgrading(false);
    }
  };

  const hasRequiredSkill = (requiredSkill) => {
    return !requiredSkill || currentPlayer.skills?.some((owned) => owned.type === requiredSkill);
  };


  // Protected function to start crafting using transaction system (slot-based)
  const handleCraft = async (transactionId, transactionKey, recipe) => {
    console.log(`🔒 [PROTECTED CRAFTING] Starting protected craft for ${recipe.type}`);
    setErrorMessage('');

    if (!recipe) {
      setErrorMessage('Invalid recipe selected.');
      return;
    }

    // Check if all slots are full (client-side pre-check)
    const currentSlots = effectiveSlots;
    const unlockedCount = stationLevel + 1;
    let hasAvailableSlot = false;
    for (let i = 0; i < unlockedCount; i++) {
      const slot = currentSlots[i];
      if (!slot?.craftedItem) {
        hasAvailableSlot = true;
        break;
      }
    }

    if (!hasAvailableSlot) {
      updateStatus(409); // "All crafting slots are full."
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
        const { slots: newSlots, slotIndex, inventory, backpack } = response.data;

        // Update inventory from server response
        if (inventory) {
          setInventory(inventory);
          setCurrentPlayer(prev => ({ ...prev, inventory }));
        }
        if (backpack) {
          setBackpack(backpack);
          setCurrentPlayer(prev => ({ ...prev, backpack }));
        }

        // Update station with new slots array
        console.log(`🔄 [CRAFT START] Updating slot ${slotIndex} with craft`);
        const updatedGlobalResources = GlobalGridStateTilesAndResources.getResources().map(res =>
          res.x === currentStationPosition.x && res.y === currentStationPosition.y
            ? { ...res, slots: newSlots }
            : res
        );
        GlobalGridStateTilesAndResources.setResources(updatedGlobalResources);
        setResources(updatedGlobalResources);

        // Refresh player data to ensure consistency
        await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);

        // Show "Added" floating text on the slot
        setSlotAddedAnimation(slotIndex);
        setTimeout(() => setSlotAddedAnimation(null), 1800); // Clear after animation (matches 1.8s CSS duration)

        updateStatus(`${strings[440]} ${getLocalizedString(recipe.type, strings)}`);

        console.log(`✅ ${recipe.type} crafting started in slot ${slotIndex}.`);
      }
    } catch (error) {
      console.error('Error in protected crafting start:', error);
      if (error.response?.status === 429) {
        updateStatus(451);
      } else if (error.response?.data?.code === 'SLOTS_FULL') {
        updateStatus(409); // "All crafting slots are full."
      } else if (error.response?.status === 400) {
        updateStatus(450);
      } else {
        updateStatus(452);
      }
    }
  };


  // Slot-based collection function
  const handleCollectSlot = async (slotIndex) => {
    const slot = effectiveSlots?.[slotIndex];
    if (!slot?.craftedItem) {
      console.error('❌ No item in this slot');
      return;
    }
    if (slot.craftEnd > Date.now()) {
      console.error('❌ Item not ready yet');
      return;
    }

    const craftedItemType = slot.craftedItem;
    const transactionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const transactionKey = `crafting-collect-slot-${slotIndex}-${currentStationPosition.x}-${currentStationPosition.y}`;

    console.log(`🔒 [PROTECTED CRAFTING] Collecting from slot ${slotIndex}: ${craftedItemType}`);

    try {
      const response = await axios.post(`${API_BASE}/api/crafting/collect-item`, {
        playerId: currentPlayer.playerId,
        gridId,
        stationX: currentStationPosition.x,
        stationY: currentStationPosition.y,
        craftedItem: craftedItemType,
        slotIndex,
        transactionId,
        transactionKey
      });

      if (response.data.success) {
        const { collectedItem, slots: newSlots, isNPC } = response.data;

        // Apply skill buffs to crafted collection (station-based)
        const skillInfo = calculateSkillMultiplier(stationType, currentPlayer.skills || [], masterSkills);
        const baseQtyCollected = slot.qty || 1;
        const finalQtyCollected = applySkillMultiplier(baseQtyCollected, skillInfo.multiplier);

        // Handle NPC spawning client-side
        if (isNPC) {
          const craftedResource = allResources.find(res => res.type === collectedItem);
          if (craftedResource) {
            NPCsInGridManager.spawnNPC(gridId, craftedResource, { x: currentStationPosition.x, y: currentStationPosition.y });
            setNpcRefreshKey(prev => prev + 1);
          }
          const npcSymbol = craftedResource?.symbol || '🎁';
          // Show floating text on the slot instead of the grid
          setSlotCollectedAnimation({ slotIndex, text: `+${finalQtyCollected} ${npcSymbol} ${getLocalizedString(collectedItem, strings)}` });
          setTimeout(() => setSlotCollectedAnimation(null), 1800);
          soundManager.playSFX('collect_item');
        } else {
          // Add non-NPC items to inventory
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

          if (gained !== true && (!gained || gained.success === false)) {
            console.error('❌ Failed to add crafted item to inventory.');
            return;
          }

          const collectedItemResource = masterResources.find(r => r.type === collectedItem);
          const collectedSymbol = collectedItemResource?.symbol || '🎁';
          // Show floating text on the slot instead of the grid
          setSlotCollectedAnimation({ slotIndex, text: `+${finalQtyCollected} ${collectedSymbol} ${getLocalizedString(collectedItem, strings)}` });
          setTimeout(() => setSlotCollectedAnimation(null), 1800);
          soundManager.playSFX('collect_item');
        }

        // Track quest progress
        await trackQuestProgress(currentPlayer, 'Craft', collectedItem, finalQtyCollected, setCurrentPlayer);

        // Update station with new slots array
        console.log(`🔄 [COLLECT] Cleared slot ${slotIndex}`);
        const updatedGlobalResources = GlobalGridStateTilesAndResources.getResources().map(res =>
          res.x === currentStationPosition.x && res.y === currentStationPosition.y
            ? { ...res, slots: newSlots }
            : res
        );
        GlobalGridStateTilesAndResources.setResources(updatedGlobalResources);
        setResources(updatedGlobalResources);

        // Force a refresh of the station state
        setStationRefreshKey(prev => prev + 1);

        // Refresh player data
        await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);

        // Status message
        const statusMessage = formatSingleCollection('craft', collectedItem, finalQtyCollected,
          skillInfo.hasSkills ? skillInfo : null, strings, getLocalizedString);
        updateStatus(statusMessage);

        console.log(`✅ ${collectedItem} collected from slot ${slotIndex}.`);
      }
    } catch (error) {
      console.error('Error collecting from slot:', error);
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
        inventory,
        backpack,
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
  
  // Generate skill bonus info (multiplier + tooltip messages)
  const getSkillBonusInfo = () => {
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

    if (applicableSkills.length === 0) return { multiplier: 1, tooltipLines: [], hasSkills: false };

    // Separate owned and unowned skills
    const ownedSkills = applicableSkills.filter(skill => skill.hasSkill);
    const unownedSkills = applicableSkills.filter(skill => !skill.hasSkill);

    // Calculate combined multiplier for owned skills
    const combinedMultiplier = ownedSkills.reduce((total, skill) => total * skill.multiplier, 1);

    let tooltipLines = [];

    // Message for owned skills
    if (ownedSkills.length > 0) {
      if (ownedSkills.length === 1) {
        // Single skill: "Your [skill] Skill increases the base output of this station by [X]."
        tooltipLines.push(`${strings[805]}${getLocalizedString(ownedSkills[0].skillName, strings)}${strings[806]}${ownedSkills[0].multiplier}x.`);
      } else {
        // Multiple skills: list them with their multipliers and show combined effect
        const skillsList = ownedSkills
          .map(skill => `${getLocalizedString(skill.skillName, strings)} (${skill.multiplier}x)`)
          .join(' & ');
        tooltipLines.push(`Your ${skillsList} skills combine to increase output by ${combinedMultiplier}x.`);
      }
    }

    // Message for unowned skills
    if (unownedSkills.length > 0) {
      unownedSkills.forEach(skill => {
        const skillResource = allResources.find(res => res.type === skill.skillName);
        const skillSource = skillResource?.source || 'Skill Shop';
        // "Acquire the [skill] Skill at the [source] to increase the output of this station by [X]x."
        tooltipLines.push(`${strings[801]}${getLocalizedString(skill.skillName, strings)}${strings[802]}${getLocalizedString(skillSource, strings)}${strings[803]}${skill.multiplier}x.`);
      });
    }

    return { multiplier: combinedMultiplier, tooltipLines, hasSkills: applicableSkills.length > 0 };
  };

  const skillBonusInfo = getSkillBonusInfo();

  // Output tooltip position handler
  const updateOutputTooltipPosition = (event) => {
    setOutputTooltip({
      show: true,
      top: event.clientY + window.scrollY + 10,
      left: event.clientX + window.scrollX + 15,
    });
  };

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
            {skillBonusInfo.hasSkills && (
              <div
                className="output-multiplier-badge"
                onMouseEnter={updateOutputTooltipPosition}
                onMouseMove={updateOutputTooltipPosition}
                onMouseLeave={() => setOutputTooltip({ show: false, top: 0, left: 0 })}
              >
                {strings[807] || 'Output'}: {skillBonusInfo.multiplier}x
              </div>
            )}
            {/* Crafting Station Slots — only for crafting category */}
            {stationDetails?.category === 'crafting' && (() => {
              // Progressive row display logic:
              // - Show row N only if the last slot of row N-1 is unlocked (or it's the first row)
              // - Each row has 4 slots
              const SLOTS_PER_ROW = 4;
              const totalRows = Math.ceil(maxSlots / SLOTS_PER_ROW);

              // Determine how many rows to show based on stationLevel
              // A row becomes visible when the last slot of the previous row is unlocked
              // Row 0 (slots 0-3): always visible
              // Row 1 (slots 4-7): visible when slot 3 is unlocked (stationLevel >= 3)
              // Row 2 (slots 8-11): visible when slot 7 is unlocked (stationLevel >= 7)
              // etc.
              // Formula: show next row when stationLevel >= (rowIndex * 4) - 1, i.e., last slot of previous row
              const visibleRows = Math.min(
                totalRows,
                Math.floor((stationLevel + 1) / SLOTS_PER_ROW) + 1
              );

              return (
                <div className="crafting-slots-container">
                  {Array.from({ length: visibleRows }, (_, rowIndex) => {
                    const rowStartSlot = rowIndex * SLOTS_PER_ROW;
                    const rowEndSlot = Math.min(rowStartSlot + SLOTS_PER_ROW, maxSlots);

                    return (
                      <div className="crafting-slots-grid" key={rowIndex} style={rowIndex > 0 ? { marginTop: '8px' } : undefined}>
                        {Array.from({ length: rowEndSlot - rowStartSlot }, (_, slotInRow) => {
                          const i = rowStartSlot + slotInRow;
                          const isUnlocked = i <= stationLevel;
                          const slotCostRecipe = !isUnlocked ? buildSlotCostRecipe(i) : null;
                          const canAffordSlot = slotCostRecipe ? canAfford(slotCostRecipe, inventory, backpack, 1) : false;
                          const isNextSlot = i === stationLevel + 1;

                          // Get slot state from effectiveSlots (only for unlocked slots)
                          const slot = isUnlocked ? effectiveSlots?.[i] : null;
                          const slotIsCrafting = slot?.craftEnd && slot.craftEnd > Date.now();
                          const slotIsReady = slot?.craftedItem && slot?.craftEnd && slot.craftEnd <= Date.now();
                          const slotIsEmpty = isUnlocked && !slot?.craftedItem;

                          // Get item info for symbol
                          const craftedItemInfo = slot?.craftedItem
                            ? masterResources?.find(r => r.type === slot.craftedItem)
                            : null;

                          return (
                            <div className="crafting-slot-wrapper" key={i}>
                              <div
                                className={`crafting-slot ${isUnlocked ? 'unlocked' : 'locked'} ${!isUnlocked && isNextSlot ? 'clickable' : ''} ${!isUnlocked && canAffordSlot && isNextSlot ? 'affordable' : ''} ${slotIsCrafting ? 'crafting' : ''} ${slotIsReady ? 'ready' : ''}`}
                                onMouseEnter={(e) => updateSlotTooltipPosition(e, i)}
                                onMouseMove={(e) => updateSlotTooltipPosition(e, i)}
                                onMouseLeave={() => setSlotTooltip({ show: false, slotIndex: null, top: 0, left: 0 })}
                                onClick={() => {
                                  if (!isUnlocked && isNextSlot && !isUpgrading) {
                                    if (canAffordSlot) {
                                      handleUpgradeSlot(i);
                                    } else {
                                      updateStatus(305); // "Not enough resources"
                                    }
                                  } else if (slotIsReady) {
                                    handleCollectSlot(i);
                                  }
                                }}
                              >
                                {!isUnlocked ? (
                                  <span className="crafting-slot-icon locked">&#x1F512;</span>
                                ) : slotIsEmpty ? (
                                  <span className="crafting-slot-icon"></span>
                                ) : (
                                  <>
                                    <span className="crafting-slot-icon">{craftedItemInfo?.symbol || '🎁'}</span>
                                    {slotIsReady && <span className="crafting-slot-ready-badge">&#x2705;</span>}
                                  </>
                                )}
                                {/* "Added" floating text animation on slot */}
                                {slotAddedAnimation === i && (
                                  <span className="crafting-slot-added-text">{strings[300]}</span>
                                )}
                                {/* "Collected" floating text animation on slot */}
                                {slotCollectedAnimation?.slotIndex === i && (
                                  <span className="crafting-slot-collected-text">{slotCollectedAnimation.text}</span>
                                )}
                                {/* Countdown timer overlay at bottom of slot */}
                                {slotIsCrafting && slotCountdowns[i] !== undefined && (
                                  <span className="crafting-slot-timer">
                                    {formatCompactCountdown(slot.craftEnd, Date.now())}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            <div className="station-panel-content">
        
          {recipes?.length > 0 ? (
            recipes.map((recipe) => {
              const affordable = canAfford(recipe, inventory, Array.isArray(backpack) ? backpack : [], 1);
              const requirementsMet = hasRequiredSkill(recipe.requires);
              const skillColor = requirementsMet ? 'green' : 'red';

              // Check if this is a healer and if we've hit the hospital capacity limit
              const isHealer = recipe.action === 'heal';
              const healerLimitReached = isHealer && currentHealers >= maxHealersAllowed;

              // Craft time display (no longer shows countdown - that's in slots now)
              const craftTimeText = recipe.crafttime
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

              // Format costs with color per ingredient
              const formattedCosts = [1, 2, 3, 4].map((idx) => {
                const type = recipe[`ingredient${idx}`];
                const qty = recipe[`ingredient${idx}qty`];
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
                  className="resource-button"
                  details={
                    (healerLimitReached ? `<span style="color: red;">${strings[408]}</span><br>` : '') +
                    (recipe.requires ? `<span style="color: ${skillColor};">${strings[460]}${getLocalizedString(recipe.requires, strings)}</span><br>` : '') +
                    `${craftTimeText}<br>` +
                    `${strings[461]}<div>${formattedCosts}</div>`
                  }
                  info={info}
                  disabled={!affordable || !requirementsMet || healerLimitReached}
                  onClick={undefined}
                  isTransactionMode={true}
                  transactionKey={`crafting-start-${recipe.type}-${currentStationPosition.x}-${currentStationPosition.y}`}
                  onTransactionAction={(transactionId, transactionKey) => handleCraft(transactionId, transactionKey, recipe)}
                  // Gem purchase for instant craft (bypasses slot system - instant to inventory)
                  onGemPurchase={(recipe.gemcost && (!affordable || !requirementsMet) && !healerLimitReached) ? handleGemPurchase : null}
                  resource={recipe}
                  inventory={inventory}
                  backpack={backpack}
                  masterResources={masterResources}
                  currentPlayer={currentPlayer}
                  hideGem={!recipe.gemcost || healerLimitReached}
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

      {/* Output multiplier tooltip portal */}
      {outputTooltip.show && skillBonusInfo.tooltipLines.length > 0 && ReactDOM.createPortal(
        <div
          className="info-toaster"
          style={{
            top: outputTooltip.top,
            left: outputTooltip.left,
            position: 'absolute',
          }}
        >
          {skillBonusInfo.tooltipLines.map((line, idx) => (
            <div key={idx} style={{ marginBottom: idx < skillBonusInfo.tooltipLines.length - 1 ? '6px' : 0 }}>
              {line}
            </div>
          ))}
        </div>,
        document.body
      )}

      {/* Slot tooltip portal - renders near cursor like ResourceButton info tooltip */}
      {slotTooltip.show && slotTooltip.slotIndex !== null && (() => {
        const idx = slotTooltip.slotIndex;
        const isUnlocked = idx <= stationLevel;
        const slot = effectiveSlots?.[idx];
        const slotIsCrafting = slot?.craftEnd && slot.craftEnd > Date.now();
        const slotIsReady = slot?.craftedItem && slot?.craftEnd && slot.craftEnd <= Date.now();

        // Empty unlocked slot - no tooltip
        if (isUnlocked && !slotIsCrafting && !slotIsReady) return null;

        return ReactDOM.createPortal(
          <div
            className="info-toaster"
            style={{
              top: slotTooltip.top,
              left: slotTooltip.left,
              position: 'absolute',
            }}
          >
            {!isUnlocked ? (
              // Locked slot - show unlock costs with have/need format
              <div>
                <div style={{ marginBottom: '4px', fontWeight: 'bold' }}>{strings[175] || 'Unlock'}:</div>
                {globalTuning?.craftingStationSlotCosts?.[`slot${idx}`] &&
                  Object.entries(globalTuning.craftingStationSlotCosts[`slot${idx}`])
                    .filter(([, v]) => v > 0)
                    .map(([resourceType, qty]) => {
                      const resourceInfo = masterResources?.find(r => r.type === resourceType);
                      const symbol = resourceInfo?.symbol || '';
                      const inventoryQty = inventory?.find(item => item.type === resourceType)?.quantity || 0;
                      const backpackQty = backpack?.find(item => item.type === resourceType)?.quantity || 0;
                      const playerQty = inventoryQty + backpackQty;
                      const hasEnough = playerQty >= qty;
                      return (
                        <div key={resourceType} style={{ color: hasEnough ? 'green' : 'red' }}>
                          {symbol} {getLocalizedString(resourceType, strings)}: {playerQty} / {qty}
                        </div>
                      );
                    })}
              </div>
            ) : (
              // Crafting or ready slot - show item info (quantity is shown in Output badge)
              <div>
                <div>{masterResources?.find(r => r.type === slot.craftedItem)?.symbol || '🎁'} {getLocalizedString(slot.craftedItem, strings)}</div>
                {slotIsReady && <div style={{ color: 'green' }}>{strings[457] || 'Ready to collect!'}</div>}
              </div>
            )}
          </div>,
          document.body
        );
      })()}
    </Panel>
  );
};

export default React.memo(CraftingStation);