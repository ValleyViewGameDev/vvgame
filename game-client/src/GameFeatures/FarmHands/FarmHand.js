import API_BASE from '../../config';
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Panel from '../../UI/Panels/Panel';
import ProgressModal from '../../UI/Modals/ProgressModal';
import '../../UI/Buttons/ResourceButton.css';
import ResourceButton from '../../UI/Buttons/ResourceButton';
import { canAfford } from '../../Utils/InventoryManagement';
import { refreshPlayerAfterInventoryUpdate, gainIngredients, spendIngredients } from '../../Utils/InventoryManagement';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import { handleDooberClick, handleSourceConversion } from '../../ResourceClicking'; // adjust path if necessary
import FloatingTextManager from '../../UI/FloatingText';
import NPCsInGridManager from "../../GridState/GridStateNPCs";
import playersInGridManager from '../../GridState/PlayersInGrid';
import { useNPCOverlay } from '../../UI/NPCOverlayContext';
import { useBulkOperation } from '../../UI/BulkOperationContext';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import { BulkHarvestModal, executeBulkHarvest, prepareBulkHarvestData } from './BulkHarvest';
import BulkHarvestResultsModal from './BulkHarvestResultsModal';
import { BulkAnimalModal, executeBulkAnimalCollect } from './BulkAnimalCollect';
import { BulkCraftingModal, executeBulkCrafting, prepareBulkCraftingData } from './BulkCrafting';
import { isACrop } from '../../Utils/ResourceHelpers';
import { getDerivedLevel } from '../../Utils/playerManagement';

const FarmHandPanel = ({
  onClose,
  npc,
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
  TILE_SIZE,
  updateStatus,
  masterResources,
  masterSkills,
  currentSeason,
  globalTuning,
  isDeveloper = false,
  masterXPLevels = [],
}) => {
  const strings = useStrings();
  const [recipes, setRecipes] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [stationEmoji, setStationEmoji] = useState('🛖');
  const [stationDetails, setStationDetails] = useState(null);
  const [workerSkills, setFarmhandSkills] = useState([]);
  const [workerUpgrades, setFarmhandUpgrades] = useState([]);
  const [isHarvestModalOpen, setIsHarvestModalOpen] = useState(false);
  const [availableCrops, setAvailableCrops] = useState([]);
  const [bulkHarvestResults, setBulkHarvestResults] = useState(null);
  const [isResultsModalOpen, setIsResultsModalOpen] = useState(false);
  const [isAnimalModalOpen, setIsAnimalModalOpen] = useState(false);
  const [selectedAnimalTypes, setSelectedAnimalTypes] = useState({});
  const [availableAnimals, setAvailableAnimals] = useState([]);
  const [isCraftingModalOpen, setIsCraftingModalOpen] = useState(false);
  const [selectedCraftingStations, setSelectedCraftingStations] = useState({});
  const [selectedRestartStations, setSelectedRestartStations] = useState({});
  const [availableCraftingStations, setAvailableCraftingStations] = useState([]);
  const skills = currentPlayer.skills || [];
  const hasBulkReplant = skills.some(skill => skill.type === 'Bulk Replant');
  const hasBulkRestartCraft = skills.some(skill => skill.type === 'Bulk Restart Craft');
  const [bulkProgressModal, setBulkProgressModal] = useState({ isOpen: false, message: '' });
  const { setBusyOverlay, clearNPCOverlay } = useNPCOverlay();
  const { startBulkOperation, endBulkOperation } = useBulkOperation();
  
  // Shared function for executing bulk operations with progress modal
  async function executeBulkOperation(operationName, operationId, workerNPC, asyncOperation) {
    let pendingStatusMessage = null;
    
    // Show progress modal
    setBulkProgressModal({ 
      isOpen: true, 
      message: strings[477] || 'Processing...'
    });
    
    try {
      // Run the async operation
      pendingStatusMessage = await asyncOperation();
    } catch (error) {
      console.error(`${operationName} failed:`, error);
      pendingStatusMessage = error.message || `Failed to complete ${operationName}.`;
    } finally {
      // Close modal and cleanup
      setBulkProgressModal({ isOpen: false, message: '' });
      if (workerNPC) clearNPCOverlay(workerNPC.id);
      endBulkOperation(operationId);
      
      // Show the status message
      if (pendingStatusMessage) {
        updateStatus(pendingStatusMessage);
      }
    }
  }
  
  // Determine which features to show based on NPC type
  const npcType = npc?.type || stationType; // Use NPC type from the npc object, fallback to stationType
  const showBulkHarvest = ['Farmer', 'Farm Hand'].includes(npcType);
  const showBulkReplant = ['Farmer', 'Farm Hand'].includes(npcType) && hasBulkReplant;
  const showBulkAnimalCollect = ['Farmer', 'Rancher'].includes(npcType);
  const showLogging = ['Farmer', 'Lumberjack'].includes(npcType);
  const showCropPurchase = ['Farmer', 'Farm Hand'].includes(npcType);
  const showBulkCrafting = ['Farmer', 'Crafter'].includes(npcType);
  
  // Helper function to check if player has required skill (same logic as FarmingPanel)
  const hasRequiredSkill = (requiredSkill) => {
    return !requiredSkill || currentPlayer.skills?.some((owned) => owned.type === requiredSkill);
  };
  
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

  // Calculate player level for filtering crops
  const playerLevel = getDerivedLevel(currentPlayer, masterXPLevels);

  useEffect(() => {
    try {
      const filteredRecipes = masterResources.filter((res) => {
        // Must be a crop (output of a farmplot)
        if (!isACrop(res.type, masterResources)) return false;

        // Check devonly restriction (allow if isDeveloper)
        if (res.requires === 'devonly' && !isDeveloper) return false;

        // Check seasonal restriction (allow if isDeveloper)
        if (!isDeveloper && res.season && currentSeason && res.season !== currentSeason) {
          return false;
        }

        // Check level restriction (allow if isDeveloper)
        if (!isDeveloper && res.level && res.level > playerLevel) {
          return false;
        }

        return true;
      });
      setRecipes(filteredRecipes);

      const stationResource = masterResources.find((res) => res.type === stationType);
      setStationEmoji(stationResource?.symbol || '🛖');
      setStationDetails(stationResource);
    } catch (error) {
      console.error('Error loading worker offers:', error);
    }
  }, [stationType, masterResources, currentSeason, isDeveloper, playerLevel]);

  useEffect(() => {
    const ownedTypes = currentPlayer.skills?.map(skill => skill.type) || [];
    
    // Get skills from multiple sources based on NPC type
    let validSources = ['Farm Hand']; // Always include Farm Hand skills
    if (npcType === 'Crafter' || npcType === 'Farmer') {
      validSources.push('Crafter'); // Include Crafter skills for Crafter and Farmer NPCs
    }
    if (npcType === 'Rancher' || npcType === 'Farmer') {
      validSources.push('Rancher'); // Include Rancher skills for Rancher and Farmer NPCs
    }
    
    let skills = masterResources.filter(res =>
      res.category === 'skill' &&
      validSources.includes(res.source) &&
      !ownedTypes.includes(res.type)
    );

    // Filter skills based on NPC type
    if (npcType === 'Farm Hand') {
      skills = skills.filter(res => ['Bulk Harvest', 'Bulk Replant'].includes(res.type));
    } else if (npcType === 'Rancher') {
      skills = skills.filter(res => res.type === 'Bulk Animal Collect');
    } else if (npcType === 'Lumberjack') {
      skills = skills.filter(res => ['Logging', 'Better Logging'].includes(res.type));
    } else if (npcType === 'Crafter') {
      skills = skills.filter(res => ['Bulk Crafting', 'Bulk Restart Craft'].includes(res.type));
    }
    // For 'Farmer', show all skills from all valid sources

    setFarmhandSkills(skills);
  }, [masterResources, currentPlayer, npcType]);

  const handleTrade = async (resource) => {
    setErrorMessage('');
    const cost = (resource.maxprice || 100) * 10;

    const recipe = {
      ingredient1: 'Money',
      ingredient1qty: cost,
      type: resource.type,
    };

    const safeInventory = Array.isArray(inventory) ? inventory : [];
    const safeBackpack = Array.isArray(backpack) ? backpack : [];

    const spent = await spendIngredients({
      playerId: currentPlayer.playerId,
      recipe,
      inventory: safeInventory,
      backpack: safeBackpack,
      setInventory,
      setBackpack,
      setCurrentPlayer,
      updateStatus,
    });

    if (!spent) {
      setErrorMessage('Not enough money.');
      return;
    }

    const gained = await gainIngredients({
      playerId: currentPlayer.playerId,
      currentPlayer,
      resource: resource.type,
      quantity: 1,
      inventory: safeInventory,
      backpack: safeBackpack,
      setInventory,
      setBackpack,
      setCurrentPlayer,
      updateStatus,
      masterResources,
      globalTuning,
    });

    if (!gained) {
      setErrorMessage('Not enough space to carry that item.');
      return;
    }

    updateStatus(`Bought 1 ${resource.type} for ${cost} Money.`);
  };

  const handlePurchaseSkill = async (resource) => {
    setErrorMessage('');
    const safeInventory = Array.isArray(inventory) ? inventory : [];
    const safeBackpack = Array.isArray(backpack) ? backpack : [];

    const spent = await spendIngredients({
      playerId: currentPlayer.playerId,
      recipe: resource,
      inventory: safeInventory,
      backpack: safeBackpack,
      setInventory,
      setBackpack,
      setCurrentPlayer,
      updateStatus,
    });

    if (!spent) {
      setErrorMessage('Not enough ingredients.');
      return;
    }

    const updatedSkills = [...(currentPlayer.skills || []), { type: resource.type, category: resource.category, quantity: 1 }];
    await axios.post(`${API_BASE}/api/update-skills`, {
      playerId: currentPlayer.playerId,
      skills: updatedSkills,
    });

    await trackQuestProgress(currentPlayer, 'Acquire', resource.type, 1, setCurrentPlayer);
    await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);
    updateStatus(`${resource.type} acquired.`);
  };

  function handleBulkAnimalCollect() {
    
    const npcs = Object.values(NPCsInGridManager.getNPCsInGrid(gridId) || {});
    const processingAnimals = npcs.filter(npc => npc.state === 'processing');
    

    if (processingAnimals.length === 0) {
      updateStatus('No animals are ready to collect.');
      return;
    }
    
    // Find the appropriate worker NPC to apply busy overlay (Farmer or Rancher)
    const workerNPC = npcs.find(npc => npc.action === 'worker' && ['Farmer', 'Rancher'].includes(npc.type));
    if (workerNPC) {
      setBusyOverlay(workerNPC.id);
    }

    // Count how many of each animal type is ready
    const animalCounts = {};
    processingAnimals.forEach((npc) => {
      animalCounts[npc.type] = (animalCounts[npc.type] || 0) + 1;
    });

    // Create array of available animals with counts and symbols
    const animalsWithDetails = Object.entries(animalCounts).map(([animalType, count]) => {
      const resourceDef = masterResources.find(res => res.type === animalType);
      return {
        type: animalType,
        count,
        symbol: resourceDef?.symbol || '🐮'
      };
    });

    setAvailableAnimals(animalsWithDetails);
    
    // Select all animals by default
    const defaultSelection = {};
    animalsWithDetails.forEach(animal => {
      defaultSelection[animal.type] = true;
    });
    setSelectedAnimalTypes(defaultSelection);
    
    setIsAnimalModalOpen(true);
  }

  async function executeSelectiveAnimalCollect() {
    setIsAnimalModalOpen(false);
    onClose();
    setErrorMessage('');
    
    // Find the appropriate worker NPC to apply busy overlay (Farmer or Rancher)
    const npcs = Object.values(NPCsInGridManager.getNPCsInGrid(gridId) || {});
    const workerNPC = npcs.find(npc => npc.action === 'worker' && ['Farmer', 'Rancher'].includes(npc.type));
    if (workerNPC) {
      setBusyOverlay(workerNPC.id);
    }

    // Start bulk operation tracking
    const operationId = `bulk-animal-collect-${Date.now()}`;
    startBulkOperation('bulk-animal-collect', operationId);

    // Execute bulk operation with shared function
    await executeBulkOperation('bulk-animal-collect', operationId, workerNPC, async () => {
      return await executeBulkAnimalCollect({
        selectedAnimalTypes,
        gridId,
        currentPlayer,
        setCurrentPlayer,
        setInventory,
        setBackpack,
        setResources,
        updateStatus,
        TILE_SIZE,
        masterResources,
        masterSkills,
        strings
      });
    });
    
    onClose();
  }



  async function handleLogging() {
    console.log('🪓🪓🪓🪓🪓 Logging initiated 🪓🪓🪓🪓🪓🪓');
    onClose();
    setErrorMessage('');

    const safeInventory = Array.isArray(inventory) ? inventory : [];
    const safeBackpack = Array.isArray(backpack) ? backpack : [];
    
    // Find the appropriate worker NPC to apply busy overlay (Lumberjack or Farmer)
    let npcs = Object.values(NPCsInGridManager.getNPCsInGrid(gridId) || {});
    const workerNPC = npcs.find(npc => npc.action === 'worker' && ['Farmer', 'Lumberjack'].includes(npc.type));
    if (workerNPC) {
      setBusyOverlay(workerNPC.id);
    }

    // Start bulk operation tracking
    const operationId = `bulk-logging-${Date.now()}`;
    startBulkOperation('bulk-logging', operationId);

    try {
      // Step 1: Determine how many trees we can chop
      const loggingSkills = (currentPlayer.skills || []).filter(
        (skill) => ['Logging', 'Better Logging'].includes(skill.type)
      );
      const maxTrees = loggingSkills.reduce((sum, skill) => {
        const resourceDef = masterResources.find(res => res.type === skill.type);
        return sum + (resourceDef?.qtycollected || 0);
      }, 0);

      if (maxTrees === 0) {
        updateStatus("No logging skills available.");
        return;
      }

      // Step 2: Find the center position for tree selection (Lumberjack → Farmer → Player)
      const npcs = Object.values(NPCsInGridManager.getNPCsInGrid(gridId) || {});
      const lumberjackNPC = npcs.find(npc => npc.type === 'Lumberjack');
      const farmerNPC = npcs.find(npc => npc.type === 'Farmer' || npc.type === 'Farm Hand');
      
      let centerPos;
      let centerType;
      
      if (lumberjackNPC) {
        centerPos = lumberjackNPC.position;
        centerType = "Lumberjack";
      } else if (farmerNPC) {
        centerPos = farmerNPC.position;
        centerType = "Farmer";
      } else {
        // Use player position as fallback
        const playerData = playersInGridManager.getPlayersInGrid(gridId)?.[currentPlayer.playerId];
        if (playerData && playerData.position) {
          centerPos = playerData.position;
          centerType = "Player";
        } else {
          // Ultimate fallback to (0,0) if no player position found
          centerPos = { x: 0, y: 0 };
          centerType = "Default";
        }
      }
      
      console.log(`🪓 Using ${centerType} position as center: (${centerPos.x}, ${centerPos.y})`);

      // Step 3: Get all trees from resources and calculate distances from center position
      const treeResources = resources
        .filter(res => res.type === 'Oak Tree')
        .map(tree => ({
          ...tree,
          distance: Math.sqrt(
            Math.pow(tree.x - centerPos.x, 2) + 
            Math.pow(tree.y - centerPos.y, 2)
          )
        }))
        .sort((a, b) => a.distance - b.distance); // Sort by distance from center

      if (treeResources.length === 0) {
        updateStatus(strings[437] || 'No trees available to chop.');
        return;
      }

      // Select the closest trees up to maxTrees limit
      const treesToChop = treeResources.slice(0, maxTrees);
      console.log(`🌲 Found ${treeResources.length} trees, will chop ${treesToChop.length} closest to Lumberjack`);
      const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

      // ---- Two-phase processing ----
      const choppedTreePositions = [];

      // Phase 1: Chop trees and remember positions
      for (const tree of treesToChop) {
        await handleSourceConversion(
          tree,
          tree.y,
          tree.x,
          resources,
          setResources,
          safeInventory,
          setInventory,
          safeBackpack,
          setBackpack,
          gridId,
          FloatingTextManager.addFloatingText,
          TILE_SIZE,
          currentPlayer,
          setCurrentPlayer,
          masterResources,
          () => {}, // setModalContent
          () => {}, // setIsModalOpen
          updateStatus,
          strings
        );
        choppedTreePositions.push({ x: tree.x, y: tree.y });
        await wait(100);
      }

      await wait(300); // give state time to update

      // Phase 2: Click doobers at chopped positions
      setTimeout(async () => {
        for (const pos of choppedTreePositions) {
          // Get the most up-to-date resources state
          const latestResources = typeof setResources === 'function'
            ? await new Promise(resolve => {
                setResources(prev => {
                  resolve(prev);
                  return prev;
                });
              })
            : resources;
          const wood = latestResources.find(
            res => res.x === pos.x && res.y === pos.y && res.category === 'doober'
          );
          console.log('🪵🪵🪵 Found wood doober at', pos, ':', wood);
          if (wood) {
            console.log('Calling handleDooberClick');
            await handleDooberClick(
              wood,
              wood.y,
              wood.x,
              resources,
              setResources,
              setInventory,
              setBackpack,
              safeInventory,
              safeBackpack,
              currentPlayer.skills,
              gridId,
              FloatingTextManager.addFloatingText,
              TILE_SIZE,
              currentPlayer,
              setCurrentPlayer,
              updateStatus,
              masterResources,
              masterSkills,
              strings,
              null, // openPanel
              globalTuning
            );
            await wait(100);
          } else {
            console.warn('⚠️ No doober found at position:', pos);
          }
        }
        updateStatus(`🪵 Logging complete: ${treesToChop.length} trees chopped and collected.`);
      }, 50);

      await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);
    } catch (error) {
      console.error('Logging failed:', error);
      setErrorMessage('Failed to auto-chop trees.');
    } finally {
      // End bulk operation tracking
      endBulkOperation(operationId);
      
      // Clear busy overlay when operation completes
      const npcsCleanup = Object.values(NPCsInGridManager.getNPCsInGrid(gridId) || {});
      const workerNPCCleanup = npcsCleanup.find(npc => npc.action === 'worker' && ['Farmer', 'Lumberjack'].includes(npc.type));
      if (workerNPCCleanup) {
        clearNPCOverlay(workerNPCCleanup.id);
      }
    }
  }


  async function handleBulkHarvest() {
    // First, force FarmState to process any pending seeds
    const farmState = await import('../../FarmState').then(m => m.default);
    await farmState.forceProcessPendingSeeds({ gridId, setResources, masterResources });
    
    // Stop FarmState timer to prevent conversions during modal
    farmState.stopSeedTimer();
    
    // Wait a moment for state updates to propagate
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Now get fresh resources from global state
    const freshResources = GlobalGridStateTilesAndResources.getResources();
    const crops = prepareBulkHarvestData(freshResources, masterResources);

    if (crops.length === 0) {
      updateStatus(strings[344] || 'No crops ready for harvest.');
      // Restart FarmState timer if no crops
      farmState.initializeFarmState(freshResources);
      farmState.startSeedTimer({ gridId, setResources, masterResources });
      return;
    }
    
    setAvailableCrops(crops);
    setIsHarvestModalOpen(true);
  }
  
  // Function to get fresh crop data at any time
  const getFreshCropData = React.useCallback(async () => {
    // Force sync before getting data
    const farmState = await import('../../FarmState').then(m => m.default);
    await farmState.forceProcessPendingSeeds({ gridId, setResources, masterResources });
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const freshResources = GlobalGridStateTilesAndResources.getResources();
    return prepareBulkHarvestData(freshResources, masterResources);
  }, [gridId, setResources, masterResources]);
 
  async function executeSelectiveHarvest(selectedCropTypes, selectedReplantTypes) {
    setIsHarvestModalOpen(false);
    setErrorMessage('');

    // Find the Farmer NPC to apply busy overlay
    const npcs = Object.values(NPCsInGridManager.getNPCsInGrid(gridId) || {});
    const farmerNPC = npcs.find(npc => npc.action === 'worker');
    if (farmerNPC) {
      setBusyOverlay(farmerNPC.id);
    }

    // Start bulk operation tracking
    const operationId = `bulk-harvest-${Date.now()}`;
    startBulkOperation('bulk-harvest', operationId);

    try {
      // Execute bulk operation with shared function
      await executeBulkOperation('bulk-harvest', operationId, farmerNPC, async () => {
        const result = await executeBulkHarvest({
          selectedCropTypes,
          selectedReplantTypes,
          resources: GlobalGridStateTilesAndResources.getResources(),  // Always use fresh resources
          masterResources,
          masterSkills,
          currentPlayer,
          setCurrentPlayer,
          setInventory,
          setBackpack,
          setResources,
          gridId,
          showBulkReplant,
          strings,
          refreshPlayerAfterInventoryUpdate,
          globalTuning
        });

        // Handle the new results format
        if (result.success) {
          // Store results for modal display
          setBulkHarvestResults(result);
          // Show results modal after a brief delay
          setTimeout(() => {
            setIsResultsModalOpen(true);
          }, 500);
          // Return status message for any fallback displays
          return result.statusMessage;
        } else {
          // Return error message
          return result.error;
        }
      });
    } finally {
      // Always restart FarmState timer after harvest
      const farmState = await import('../../FarmState').then(m => m.default);
      const currentResources = GlobalGridStateTilesAndResources.getResources();
      farmState.initializeFarmState(currentResources);
      farmState.startSeedTimer({ gridId, setResources, masterResources });
    }
  }


  function handleBulkCrafting() {
    console.log('🛖 Opening selective crafting modal');
    
    const stationGroups = prepareBulkCraftingData(masterResources, inventory, backpack, currentPlayer, hasRequiredSkill);
    
    if (stationGroups.length === 0) {
      updateStatus(strings[466] || 'No crafting stations ready to collect.');
      return;
    }
    
    const stationsWithDetails = stationGroups;
    setAvailableCraftingStations(stationsWithDetails);
    
    // Select all stations by default
    const defaultSelection = {};
    stationsWithDetails.forEach(group => {
      defaultSelection[`${group.stationType}-${group.craftedItem}`] = true;
    });
    setSelectedCraftingStations(defaultSelection);
    
    // If player has Bulk Restart Craft skill, pre-select restart options only if player has enough ingredients
    if (hasBulkRestartCraft) {
      const defaultRestartSelection = {};
      const playerInventory = {};
      
      // Combine inventory and backpack
      [...(inventory || []), ...(backpack || [])].forEach(item => {
        playerInventory[item.type] = (playerInventory[item.type] || 0) + item.quantity;
      });
      
      stationsWithDetails.forEach(group => {
        const craftedResource = masterResources.find(r => r.type === group.craftedItem);
        if (craftedResource) {
          // Check if player has all ingredients
          let hasAllIngredients = true;
          for (let i = 1; i <= 5; i++) {
            const ingredientType = craftedResource[`ingredient${i}`];
            const ingredientQty = craftedResource[`ingredient${i}qty`] || 1;
            if (ingredientType) {
              const needed = ingredientQty * group.count;
              const has = playerInventory[ingredientType] || 0;
              if (has < needed) {
                hasAllIngredients = false;
                break;
              }
            }
          }
          
          // Only pre-select if player has all ingredients
          if (hasAllIngredients) {
            defaultRestartSelection[`${group.stationType}-${group.craftedItem}`] = true;
          }
        }
      });
      setSelectedRestartStations(defaultRestartSelection);
    } else {
      setSelectedRestartStations({});
    }
    
    setIsCraftingModalOpen(true);
  }

  async function executeSelectiveCrafting(selectedGroups, selectedRestartStations) {
    setIsCraftingModalOpen(false);
    setErrorMessage('');
    
    // Find the appropriate worker NPC to apply busy overlay
    const npcs = Object.values(NPCsInGridManager.getNPCsInGrid(gridId) || {});
    const workerNPC = npcs.find(npc => npc.action === 'worker' && ['Farmer', 'Crafter'].includes(npc.type));
    if (workerNPC) {
      setBusyOverlay(workerNPC.id);
    }

    // Start bulk operation tracking
    const operationId = `bulk-crafting-${Date.now()}`;
    startBulkOperation('bulk-crafting', operationId);

    // Execute bulk operation with shared function
    await executeBulkOperation('bulk-crafting', operationId, workerNPC, async () => {
      return await executeBulkCrafting({
        selectedGroups,
        selectedRestartStations,
        hasBulkRestartCraft,
        currentPlayer,
        setCurrentPlayer,
        inventory,
        setInventory,
        backpack,
        setBackpack,
        setResources,
        gridId,
        masterResources,
        masterSkills,
        strings,
        updateStatus,
        globalTuning
      });
    });
    
    onClose();
  }

  async function restartCrafting(station, recipe, strings) {
    if (!recipe) {
      console.log(`No recipe found for restarting craft at station (${station.x}, ${station.y})`);
      return false;
    }

    // Check affordability using the same logic as CraftingStation
    const affordable = canAfford(recipe, inventory, Array.isArray(backpack) ? backpack : [], 1);
    if (!affordable) {
      console.log(`Cannot afford to restart ${recipe.type} at station (${station.x}, ${station.y})`);
      return false;
    }

    // Check skill requirements
    const requirementsMet = !recipe.requires || currentPlayer.skills?.some((owned) => owned.type === recipe.requires);
    if (!requirementsMet) {
      console.log(`Missing required skill ${recipe.requires} to restart ${recipe.type}`);
      return false;
    }

    // Call crafting API directly
    const transactionId = `bulk-restart-${Date.now()}-${Math.random()}`;
    const transactionKey = `crafting-start-${recipe.type}-${station.x}-${station.y}`;
    
    try {
      const response = await axios.post(`${API_BASE}/api/crafting/start-craft`, {
        playerId: currentPlayer.playerId,
        gridId,
        stationX: station.x,
        stationY: station.y,
        recipe,
        transactionId,
        transactionKey
      });
      
      if (response.data.success) {
        // Update global state with new craft
        const { craftEnd, craftedItem, inventory: newInventory, backpack: newBackpack } = response.data;
        
        // Update inventory from server response
        if (newInventory) {
          setInventory(newInventory);
          setCurrentPlayer(prev => ({ ...prev, inventory: newInventory }));
        }
        if (newBackpack) {
          setBackpack(newBackpack);
          setCurrentPlayer(prev => ({ ...prev, backpack: newBackpack }));
        }
        
        // Update the specific station resource in global state
        const updatedResources = GlobalGridStateTilesAndResources.getResources().map(res =>
          res.x === station.x && res.y === station.y
            ? { ...res, craftEnd, craftedItem }
            : res
        );
        GlobalGridStateTilesAndResources.setResources(updatedResources);
        setResources(updatedResources);
        
        FloatingTextManager.addFloatingText(404, station.x, station.y, TILE_SIZE);
        // Status update will be handled in bulk after all operations complete
        console.log(`✅ Restarted crafting ${recipe.type} at station (${station.x}, ${station.y})`);
        return true;
      }
    } catch (error) {
      console.error(`Failed to restart crafting at station (${station.x}, ${station.y}):`, error);
      if (error.response?.status === 400) {
        console.log('Not enough ingredients to restart crafting');
      }
    }
    
    return false;
  }

  const getSkillTooltip = (skillType) => {
    switch (skillType) {
      case 'Bulk Harvest':
        return strings[427]; // "Purchase the Farm Hand's Bulk Harvest skill in order to harvest all crops at once."
      case 'Bulk Animal Collect':
        return strings[431]; // Add a new string in your strings file if needed
      case 'Logging':
        return strings[432]; // Add a new string in your strings file if needed
      case 'Better Logging':
        return strings[433]; // Add a new string in your strings file if needed
      case 'Bulk Crafting':
        return strings[464]; // Add a new string in your strings file if needed
      case 'Bulk Restart Craft':
        return strings[468] || 'Automatically restart crafting after collection'; // Add a new string in your strings file if needed
      default:
        return '';
    }
  };

  return (
    <Panel onClose={onClose} descriptionKey="1023" title={npc?.symbol ? `${npc.symbol} ${npcType}` : npcType} panelName="FarmHandPanel">
      <div className="standard-panel">

        {showBulkHarvest && skills?.some(item => item.type === 'Bulk Harvest') && (
          <div>
            <ResourceButton
              symbol="🌱"
              name={getLocalizedString('Bulk Harvest', strings)}
              className="resource-button bulk-skill"
              details={strings[428]}
              onClick={handleBulkHarvest}
            />
          </div>
        )}
        {showBulkAnimalCollect && skills?.some(item => item.type === 'Bulk Animal Collect') && (
          <div>
            <ResourceButton
              symbol="🐮"
              name={getLocalizedString('Bulk Animal Collect', strings)}
              className="resource-button bulk-skill"
              details={strings[434]}
              onClick={handleBulkAnimalCollect}
            />
          </div>
        )}
        {showLogging && skills?.some(item => item.type === 'Logging') && (
          <div>
            <ResourceButton
              symbol="🪓"
              name={getLocalizedString('Logging', strings)}
              className="resource-button bulk-skill"
              details={strings[435]}
              onClick={handleLogging}
            />
          </div>
        )}
        {showBulkCrafting && skills?.some(item => item.type === 'Bulk Crafting') && (
          <div>
            <ResourceButton
              symbol="🛖"
              name={getLocalizedString('Bulk Crafting', strings)}
              className="resource-button bulk-skill"
              details={strings[465]}
              onClick={handleBulkCrafting}
            />
          </div>
        )}

        {workerSkills.length > 0 && (
          <>
            <h3>{strings[430]}</h3>

            {workerSkills.map((resource) => {
              const affordable = canAfford(resource, inventory, 1, backpack);
              const formattedCosts = [1, 2, 3, 4].map((i) => {
                const type = resource[`ingredient${i}`];
                const qty = resource[`ingredient${i}qty`];
                if (!type || !qty) return '';
                const playerQty = (inventory.find((item) => item.type === type)?.quantity || 0) +
                                  (backpack.find((item) => item.type === type)?.quantity || 0);
                const color = playerQty >= qty ? 'green' : 'red';
                const symbol = masterResources.find(r => r.type === type)?.symbol || '';
                return `<span style="color: ${color}; display: block;">${symbol} ${type} ${qty} / ${playerQty}</span>`;
              }).join('');

              const details = `Costs:<div>${formattedCosts}</div>`;

              return (
                <ResourceButton
                  key={resource.type}
                  symbol={resource.symbol}
                  name={resource.type}
                  className="resource-button"
                  details={details}
                  onClick={() => handlePurchaseSkill(resource)}
                  disabled={!affordable}
                  info={getSkillTooltip(resource.type) ? <div>{getSkillTooltip(resource.type)}</div> : undefined}
                />
              );
            })}
          </>
        )}

        {showCropPurchase && (
          <>
            <h3>{strings[426]}</h3>
            {recipes?.length > 0 ? (
              recipes.map((resource) => {
                const cost = (resource.maxprice || 100) * 10;
                const playerMoney = (inventory.find((item) => item.type === 'Money')?.quantity || 0) +
                                    (backpack.find((item) => item.type === 'Money')?.quantity || 0);
                const affordable = playerMoney >= cost;
                const details = `${strings[347]} 💰 ${cost}`;
                return (
                  <ResourceButton
                    key={resource.type}
                    symbol={resource.symbol}
                    name={resource.type}
                    className="resource-button"
                    details={details}
                    disabled={!affordable}
                    onClick={() => handleTrade(resource)}
                  />
                );
              })
            ) : <p>{strings[423]}</p>}
          </>
        )}

        {errorMessage && <p className="error-message">{errorMessage}</p>}

      </div>
      
      {/* Selective Harvest Modal */}

      <BulkHarvestModal
        isOpen={isHarvestModalOpen}
        onClose={async () => {
          setIsHarvestModalOpen(false);
          // Clear busy overlay when modal is closed
          const npcs = Object.values(NPCsInGridManager.getNPCsInGrid(gridId) || {});
          const workerNPC = npcs.find(npc => npc.action === 'worker');
          if (workerNPC) {
            clearNPCOverlay(workerNPC.id);
          }
          
          // Restart FarmState timer
          const farmState = await import('../../FarmState').then(m => m.default);
          const currentResources = GlobalGridStateTilesAndResources.getResources();
          farmState.initializeFarmState(currentResources);
          farmState.startSeedTimer({ gridId, setResources, masterResources });
        }}
        crops={availableCrops}
        getFreshCrops={getFreshCropData}
        onExecute={executeSelectiveHarvest}
        showBulkReplant={showBulkReplant}
        hasRequiredSkill={hasRequiredSkill}
        strings={strings}
        currentSeason={currentSeason}
        masterResources={masterResources}
      />
      
      {/* Selective Animal Collect Modal */}

      <BulkAnimalModal
        isOpen={isAnimalModalOpen}
        onClose={() => {
          setIsAnimalModalOpen(false);
          // Clear busy overlay when modal is closed
          const npcs = Object.values(NPCsInGridManager.getNPCsInGrid(gridId) || {});
          const workerNPC = npcs.find(npc => npc.action === 'worker' && ['Farmer', 'Rancher'].includes(npc.type));
          if (workerNPC) {
            clearNPCOverlay(workerNPC.id);
          }
        }}
        animals={availableAnimals}
        onExecute={() => executeSelectiveAnimalCollect()}
        strings={strings}
      />
      
      {/* Selective Crafting Modal */}

      <BulkCraftingModal
        isOpen={isCraftingModalOpen}
        onClose={() => {
          setIsCraftingModalOpen(false);
          // Clear busy overlay when modal is closed
          const npcs = Object.values(NPCsInGridManager.getNPCsInGrid(gridId) || {});
          const workerNPC = npcs.find(npc => npc.action === 'worker' && ['Farmer', 'Crafter'].includes(npc.type));
          if (workerNPC) {
            clearNPCOverlay(workerNPC.id);
          }
        }}
        stationGroups={availableCraftingStations}
        onExecute={executeSelectiveCrafting}
        hasBulkRestartCraft={hasBulkRestartCraft}
        strings={strings}
        masterResources={masterResources}
        inventory={inventory}
        backpack={backpack}
      />
      
      {/* Bulk Operation Progress Modal */}

      <ProgressModal
        isOpen={bulkProgressModal.isOpen}
        title={strings[478] || "Processing..."}
        message={bulkProgressModal.message}
      />

      {/* Bulk Harvest Results Modal */}
      <BulkHarvestResultsModal
        isOpen={isResultsModalOpen}
        onClose={() => {
          setIsResultsModalOpen(false);
          setBulkHarvestResults(null);
        }}
        results={bulkHarvestResults}
        strings={strings}
        masterResources={masterResources}
      />
    </Panel>
  );


};

export default React.memo(FarmHandPanel);