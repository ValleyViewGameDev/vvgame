import API_BASE from '../../config';
import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import Panel from '../../UI/Panel';
import Modal from '../../UI/Modal';
import ProgressModal from '../../UI/ProgressModal';
import '../../UI/ResourceButton.css';
import ResourceButton from '../../UI/ResourceButton';
import { canAfford } from '../../Utils/InventoryManagement';
import { refreshPlayerAfterInventoryUpdate, gainIngredients, spendIngredients } from '../../Utils/InventoryManagement';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import { handleDooberClick, handleSourceConversion } from '../../ResourceClicking'; // adjust path if necessary
import FloatingTextManager from '../../UI/FloatingText';
import NPCsInGridManager from "../../GridState/GridStateNPCs";
import playersInGridManager from '../../GridState/PlayersInGrid';
import { handleNPCClick } from '../NPCs/NPCUtils';
import { updateGridResource } from '../../Utils/GridManagement';
import { handleFarmPlotPlacement } from '../Farming/Farming';
import { validateTileType } from '../../Utils/ResourceHelpers';
import { useNPCOverlay } from '../../UI/NPCOverlayContext';
import { useBulkOperation } from '../../UI/BulkOperationContext';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import { calculateBulkHarvestCapacity, buildBulkHarvestOperations, formatBulkHarvestResults } from './BulkHarvestUtils';
import { enrichResourceFromMaster } from '../../Utils/ResourceHelpers';
import farmState from '../../FarmState';

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
  masterSkills, // Added as prop
  currentSeason,
}) => {
  const strings = useStrings();
  const [recipes, setRecipes] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [stationEmoji, setStationEmoji] = useState('🛖');
  const [stationDetails, setStationDetails] = useState(null);
  const [workerSkills, setFarmhandSkills] = useState([]);
  const [workerUpgrades, setFarmhandUpgrades] = useState([]);
  const [isHarvestModalOpen, setIsHarvestModalOpen] = useState(false);
  const [selectedCropTypes, setSelectedCropTypes] = useState({});
  const [selectedReplantTypes, setSelectedReplantTypes] = useState({});
  const [availableCrops, setAvailableCrops] = useState([]);
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
  const [isContentLoading, setIsContentLoading] = useState(false);
  const [bulkProgressModal, setBulkProgressModal] = useState({ isOpen: false, message: '', onComplete: null });
  const { setBusyOverlay, clearNPCOverlay } = useNPCOverlay();
  const { startBulkOperation, endBulkOperation } = useBulkOperation();
  
  // Determine which features to show based on NPC type
  const npcType = npc?.type || stationType; // Use NPC type from the npc object, fallback to stationType
  const showBulkHarvest = ['Farmer', 'Farm Hand'].includes(npcType);
  const showBulkReplant = ['Farmer', 'Farm Hand'].includes(npcType) && hasBulkReplant;
  const showBulkAnimalCollect = ['Farmer', 'Rancher'].includes(npcType);
  const showLogging = ['Farmer', 'Lumberjack'].includes(npcType);
  const showBetterLogging = ['Farmer', 'Lumberjack'].includes(npcType);
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

  useEffect(() => {
    try {
      const farmOutputs = masterResources
        .filter((res) => res.category === 'farmplot')
        .map((res) => res.output)
        .filter(Boolean);

      const filteredRecipes = masterResources.filter((res) => {
        // Check if resource is in farmOutputs and not Oak Tree
        if (!farmOutputs.includes(res.type) || res.type === 'Oak Tree') return false;
        
        // Check seasonal restriction
        if (res.season && currentSeason && res.season !== currentSeason) {
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
  }, [stationType, masterResources]);

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
      (res.category === 'skill' || res.category === 'upgrade') &&
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
    
    setFarmhandSkills(skills.filter(res => res.category === 'skill'));
    setFarmhandUpgrades(skills.filter(res => res.category === 'upgrade'));
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

    await trackQuestProgress(currentPlayer, 'Gain skill with', resource.type, 1, setCurrentPlayer);
    await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);
    updateStatus(`${resource.type} acquired.`);
  };


  function handleBulkAnimalCollect() {
    console.log('🐮 Opening selective animal collect modal');
    
    const npcs = Object.values(NPCsInGridManager.getNPCsInGrid(gridId) || {});
    const processingAnimals = npcs.filter(npc => npc.state === 'processing');
    
    // Log animal states for debugging
    console.log('🐮 Processing animals:', processingAnimals.map(npc => ({
      id: npc.id,
      type: npc.type,
      state: npc.state,
      grazeEnd: npc.grazeEnd,
      position: npc.position
    })));

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
    console.log('🐮 Executing selective animal collect');
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

    try {
      // Get selected animal types
      const selectedTypes = Object.keys(selectedAnimalTypes).filter(type => selectedAnimalTypes[type]);
      
      if (selectedTypes.length === 0) {
        updateStatus('No animals selected for collection.');
        return;
      }

      const npcs = Object.values(NPCsInGridManager.getNPCsInGrid(gridId) || {});
      const animalsToCollect = npcs.filter(npc => 
        npc.state === 'processing' && selectedTypes.includes(npc.type)
      );

      const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
      const successfulCollects = {};

      for (const npc of animalsToCollect) {
        await handleNPCClick(
          npc,
          npc.position.y,
          npc.position.x,
          setInventory,
          setResources,
          currentPlayer,
          setCurrentPlayer,
          TILE_SIZE,
          masterResources,
          masterSkills,
          gridId,
          () => {}, // setModalContent (not used here)
          () => {}, // setIsModalOpen (not used here)
          updateStatus,
          () => {}, // openPanel (not used here)
          () => {}, // setActiveStation (not used here)
          strings
        );

        successfulCollects[npc.type] = (successfulCollects[npc.type] || 0) + 1;
        await wait(100); // avoid overloading server
      }

      await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);

      updateStatus(`${strings[469]} ${Object.entries(successfulCollects).map(([t, q]) => `${q} ${getLocalizedString(t, strings)}`).join(', ')}`);
    } catch (error) {
      console.error('Selective animal collect failed:', error);
      setErrorMessage('Failed to collect selected animals.');
    } finally {
      // End bulk operation tracking
      endBulkOperation(operationId);
      
      // Clear busy overlay when operation completes
      const npcsCleanup = Object.values(NPCsInGridManager.getNPCsInGrid(gridId) || {});
      const workerNPCCleanup = npcsCleanup.find(npc => npc.action === 'worker' && ['Farmer', 'Rancher'].includes(npc.type));
      if (workerNPCCleanup) {
        clearNPCOverlay(workerNPCCleanup.id);
      }
    }
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
        updateStatus(437);
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
              strings
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


  function handleBulkHarvest() {
    console.log('🚜 Opening selective harvest modal');
    
    // Get farmplot outputs (crop types)
    const cropTypes = masterResources
      .filter(res => res.category === 'farmplot')
      .map(res => res.output)
      .filter(Boolean);

    // Count how many of each crop is present in the current grid (excluding trees)
    const resourceCounts = {};
    resources?.forEach((res) => {
      if (cropTypes.includes(res.type) && res.type !== "Oak Tree" && res.type !== "Pine Tree") {
        resourceCounts[res.type] = (resourceCounts[res.type] || 0) + 1;
      }
    });

    if (Object.keys(resourceCounts).length === 0) {
      updateStatus(429); // No crops available
      return;
    }
    
    // Find the Farmer NPC to apply busy overlay
    const npcs = Object.values(NPCsInGridManager.getNPCsInGrid(gridId) || {});
    const farmerNPC = npcs.find(npc => npc.action === 'worker');
    if (farmerNPC) {
      setBusyOverlay(farmerNPC.id);
    }

    // Create array of available crops with counts and symbols
    const cropsWithDetails = Object.entries(resourceCounts).map(([cropType, count]) => {
      const resourceDef = masterResources.find(res => res.type === cropType);
      return {
        type: cropType,
        count,
        symbol: resourceDef?.symbol || '🌾'
      };
    });

    setAvailableCrops(cropsWithDetails);
    
    // Select all crops by default
    const defaultSelection = {};
    cropsWithDetails.forEach(crop => {
      defaultSelection[crop.type] = true;
    });
    setSelectedCropTypes(defaultSelection);
    
    // Select all replant options by default (if bulk replant skill is available and player has required skills)
    if (showBulkReplant) {
      const defaultReplantSelection = {};
      cropsWithDetails.forEach(crop => {
        // Only default-select crops that the player has the skill to replant
        const farmplotResource = masterResources.find(res => 
          res.category === 'farmplot' && res.output === crop.type
        );
        if (hasRequiredSkill(farmplotResource?.requires)) {
          defaultReplantSelection[crop.type] = true;
        }
      });
      setSelectedReplantTypes(defaultReplantSelection);
    }
    
    setIsHarvestModalOpen(true);
  }
 
  async function executeSelectiveHarvest() {
    console.log('🚜 Executing selective harvest');
    setIsHarvestModalOpen(false);
    // Don't close the panel immediately - keep it open for progress modal
    // onClose();
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
    
    // Store the status message to show after modal completes
    let pendingStatusMessage = '';
    
    // Store cleanup function reference
    let cleanupExecuted = false;
    const cleanup = () => {
      if (cleanupExecuted) return;
      cleanupExecuted = true;
      
      setBulkProgressModal({ isOpen: false, message: '', onComplete: null });
      if (farmerNPC) clearNPCOverlay(farmerNPC.id);
      endBulkOperation(operationId);
      
      // Show the status message after modal closes
      if (pendingStatusMessage) {
        updateStatus(pendingStatusMessage);
      }
    };
    
    // Show progress modal with onComplete callback
    setBulkProgressModal({ 
      isOpen: true, 
      message: strings[477],
      onComplete: cleanup
    });

    try {
      // Get selected crop types
      const selectedTypes = Object.keys(selectedCropTypes).filter(type => selectedCropTypes[type]);
      
      if (selectedTypes.length === 0) {
        pendingStatusMessage = strings[449] || 'No crops selected for harvest.';
        // Progress modal will auto-close via onComplete
        return;
      }

      // First, calculate capacity to check if we can harvest
      const capacityCheck = await calculateBulkHarvestCapacity(
        selectedTypes,
        resources,
        masterResources,
        masterSkills,
        currentPlayer
      );

      // Check if we have enough space
      if (!capacityCheck.canHarvest) {
        const spaceNeeded = capacityCheck.totalCapacityNeeded;
        const spaceAvailable = capacityCheck.availableSpace;
        pendingStatusMessage = `${strings[447] || 'Not enough space'}: ${spaceNeeded} needed, ${spaceAvailable} available`;
        // Progress modal will auto-close via onComplete
        return;
      }

      // If replanting, check seeds
      if (showBulkReplant && !capacityCheck.canReplantAll) {
        const missingSeeds = Object.entries(capacityCheck.hasEnoughSeeds)
          .filter(([_, data]) => !data.enough)
          .map(([type, data]) => `${getLocalizedString(type, strings)}: ${data.needed - data.has} more needed`)
          .join(', ');
        
        // Still proceed with harvest, but warn about replanting
        console.log(`⚠️ Not enough seeds for replanting: ${missingSeeds}`);
      }

      // Build operations for API call
      const operations = buildBulkHarvestOperations(capacityCheck, selectedReplantTypes);
      
      // Generate transaction ID for idempotency
      const transactionId = `bulk-harvest-${currentPlayer._id}-${Date.now()}`;
      const transactionKey = `bulk-harvest-${gridId}`;

      // Make the bulk harvest API call
      const response = await axios.post(`${API_BASE}/api/bulk-harvest`, {
        playerId: currentPlayer._id,
        gridId: gridId,
        operations: operations,
        transactionId: transactionId,
        transactionKey: transactionKey
      });

      if (response.data.success) {
        const results = response.data.results;
        
        // Update local inventory state
        setInventory(response.data.inventory.warehouse);
        setBackpack(response.data.inventory.backpack);
        
        // Update player state with new inventory
        setCurrentPlayer(prev => ({
          ...prev,
          inventory: response.data.inventory.warehouse,
          backpack: response.data.inventory.backpack
        }));

        // Remove harvested resources from local state
        const harvestedPositions = new Set();
        Object.values(results.harvested).forEach(data => {
          data.positions.forEach(pos => {
            harvestedPositions.add(`${pos.x},${pos.y}`);
          });
        });

        setResources(prev => prev.filter(res => !harvestedPositions.has(`${res.x},${res.y}`)));

        // Add replanted resources to local state
        if (results.replanted) {
          const allNewResources = [];
          
          Object.values(results.replanted).forEach(data => {
            const farmplotDef = masterResources.find(r => r.type === data.farmplotType);
            if (farmplotDef) {
              data.positions.forEach(pos => {
                // Calculate growEnd time matching server logic
                const growEndTime = Date.now() + (data.growtime || 0) * 1000;
                
                // Enrich the resource with master data, matching handleFarmPlotPlacement
                const enrichedResource = enrichResourceFromMaster(
                  {
                    type: data.farmplotType,
                    x: pos.x,
                    y: pos.y,
                    growEnd: growEndTime,
                  },
                  masterResources
                );
                
                allNewResources.push(enrichedResource);
                
                // Add to farmState for crop conversion tracking
                farmState.addSeed({
                  type: data.farmplotType,
                  x: pos.x,
                  y: pos.y,
                  growEnd: growEndTime,
                  output: farmplotDef.output
                });
              });
            }
          });
          
          if (allNewResources.length > 0) {
            // Update both global and local state, matching handleFarmPlotPlacement
            const currentGlobalResources = GlobalGridStateTilesAndResources.getResources() || [];
            const updatedGlobalResources = [...currentGlobalResources, ...allNewResources];
            GlobalGridStateTilesAndResources.setResources(updatedGlobalResources);
            
            setResources(prev => [...prev, ...allNewResources]);
          }
        }

        // Store success message to show after modal closes
        pendingStatusMessage = formatBulkHarvestResults(results, strings, getLocalizedString);

        // Track quest progress for harvested items
        Object.entries(results.harvested).forEach(([type, data]) => {
          trackQuestProgress({
            questProgressCategory: 'collect',
            itemName: type,
            quantity: data.quantity,
            currentPlayer,
            setCurrentPlayer,
            masterResources
          });
        });

        // Track quest progress for seeds used in replanting
        Object.entries(results.seedsUsed || {}).forEach(([type, quantity]) => {
          trackQuestProgress({
            questProgressCategory: 'spend',
            itemName: type,
            quantity: quantity,
            currentPlayer,
            setCurrentPlayer,
            masterResources
          });
        });

      } else {
        pendingStatusMessage = strings[448] || 'Bulk harvest failed';
      }

    } catch (error) {
      console.error('Bulk harvest error:', error);
      pendingStatusMessage = error.response?.data?.error || strings[448] || 'Bulk harvest failed';
    } finally {
      // Cleanup handled by onComplete callback in ProgressModal
      // No need for manual cleanup here
    }
  }

  function handleBulkCrafting() {
    console.log('🛖 Opening selective crafting modal');
    
    const now = Date.now();
    const resources = GlobalGridStateTilesAndResources.getResources() || [];
    
    // Find all crafting stations with completed crafts
    const readyStations = resources.filter(res => {
      // Check if this is a crafting station
      const stationDef = masterResources.find(r => r.type === res.type);
      if (!stationDef || stationDef.category !== 'crafting') return false;
      
      // Check if it has a completed craft
      return res.craftEnd && res.craftEnd <= now && res.craftedItem;
    });

    if (readyStations.length === 0) {
      updateStatus(466);
      return;
    }

    // Group stations by type and crafted item
    const stationGroups = {};
    readyStations.forEach(station => {
      const key = `${station.type}-${station.craftedItem}`;
      if (!stationGroups[key]) {
        const stationResource = masterResources.find(r => r.type === station.type);
        const craftedResource = masterResources.find(r => r.type === station.craftedItem);
        // Find the recipe that produces this item from this station
        const recipe = masterResources.find(r => 
          r.source === station.type && r.type === station.craftedItem
        );
        stationGroups[key] = {
          stationType: station.type,
          stationSymbol: stationResource?.symbol || '🏭',
          craftedItem: station.craftedItem,
          craftedSymbol: craftedResource?.symbol || '🔨',
          recipe: recipe,
          stations: [],
          count: 0
        };
      }
      stationGroups[key].stations.push(station);
      stationGroups[key].count++;
    });

    const stationsWithDetails = Object.values(stationGroups);
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

  async function executeSelectiveCrafting() {
    console.log('🛖 Executing selective crafting');
    setIsCraftingModalOpen(false);
    onClose();
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

    try {
      // Get selected station groups
      const selectedGroups = Object.keys(selectedCraftingStations)
        .filter(key => selectedCraftingStations[key])
        .map(key => availableCraftingStations.find(g => `${g.stationType}-${g.craftedItem}` === key))
        .filter(Boolean);
      
      if (selectedGroups.length === 0) {
        updateStatus('No crafting stations selected for collection.');
        return;
      }

      // Flatten all selected stations
      const stationsToCollect = selectedGroups.flatMap(group => group.stations);

      console.log(`🔨 Found ${stationsToCollect.length} crafting stations ready to collect`);
      
      const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
      const successfulCollects = {};
      const successfulRestarts = {};

      for (const station of stationsToCollect) {
        try {
          const craftedItem = station.craftedItem;
          
          // Create a unique transaction for each collection
          const transactionId = `bulk-craft-collect-${Date.now()}-${Math.random()}`;
          const transactionKey = `crafting-collect-${craftedItem}-${station.x}-${station.y}`;
          
          console.log(`📦 Collecting ${craftedItem} from station at (${station.x}, ${station.y})`);
          
          // Call the server endpoint directly (similar to handleCollect in CraftingStation)
          const response = await axios.post(`${API_BASE}/api/crafting/collect-item`, {
            playerId: currentPlayer.playerId,
            gridId,
            stationX: station.x,
            stationY: station.y,
            craftedItem,
            transactionId,
            transactionKey
          });

          if (response.data.success) {
            const { collectedItem, isNPC } = response.data;
            
            // Apply skill buffs to crafted collection
            const playerBuffs = (currentPlayer.skills || [])
              .filter((item) => {
                const resourceDetails = masterResources.find((res) => res.type === item.type);
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

            const finalQtyCollected = skillMultiplier;
            
            FloatingTextManager.addFloatingText(`+${finalQtyCollected} ${getLocalizedString(collectedItem, strings)}`, station.x, station.y, TILE_SIZE);

            // Handle NPC spawning client-side
            if (isNPC) {
              const craftedResource = masterResources.find(res => res.type === collectedItem);
              if (craftedResource) {
                NPCsInGridManager.spawnNPC(gridId, craftedResource, { x: station.x, y: station.y });
              }
            } else {
              // Add to inventory with buffs
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
                console.error('❌ Failed to add crafted item to inventory.');
              }
            }

            // Track quest progress
            await trackQuestProgress(currentPlayer, 'Craft', collectedItem, finalQtyCollected, setCurrentPlayer);

            // Update local resources to clear the crafting state
            const updatedResources = GlobalGridStateTilesAndResources.getResources().map(res =>
              res.x === station.x && res.y === station.y
                ? { ...res, craftEnd: undefined, craftedItem: undefined }
                : res
            );
            GlobalGridStateTilesAndResources.setResources(updatedResources);
            setResources(updatedResources);

            successfulCollects[collectedItem] = (successfulCollects[collectedItem] || 0) + finalQtyCollected;
            
            // Handle restart if selected and player has the skill
            if (hasBulkRestartCraft && selectedRestartStations[`${station.type}-${collectedItem}`]) {
              // Find the station group to get the recipe
              const stationGroup = selectedGroups.find(g => 
                g.stationType === station.type && g.craftedItem === collectedItem
              );
              
              if (stationGroup && stationGroup.recipe) {
                const restarted = await restartCrafting(station, stationGroup.recipe, strings);
                if (restarted) {
                  successfulRestarts[stationGroup.recipe.type] = (successfulRestarts[stationGroup.recipe.type] || 0) + 1;
                  console.log(`✅ Restarted crafting at station (${station.x}, ${station.y})`);
                }
              }
            }
          }
          
          await wait(100); // Avoid overloading server
        } catch (error) {
          console.error(`Failed to collect from station at (${station.x}, ${station.y}):`, error);
        }
      }

      await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);
      
      if (Object.keys(successfulCollects).length > 0) {
        let statusMessage = `${strings[467]} ${Object.entries(successfulCollects).map(([t, q]) => `${q} ${getLocalizedString(t, strings)}`).join(', ')}`;
        if (Object.keys(successfulRestarts).length > 0) {
          statusMessage += ` | ${strings[468]} ${Object.entries(successfulRestarts).map(([t, q]) => `${q} ${getLocalizedString(t, strings)}`).join(', ')}`;
        }
        updateStatus(statusMessage);
      } else {
        updateStatus('Failed to collect any crafted items.');
      }
    } catch (error) {
      console.error('Bulk crafting failed:', error);
      setErrorMessage('Failed to collect crafted items.');
    } finally {
      // End bulk operation tracking
      endBulkOperation(operationId);
      
      // Clear busy overlay when operation completes
      const npcsCleanup = Object.values(NPCsInGridManager.getNPCsInGrid(gridId) || {});
      const workerNPCCleanup = npcsCleanup.find(npc => npc.action === 'worker' && ['Farmer', 'Crafter'].includes(npc.type));
      if (workerNPCCleanup) {
        clearNPCOverlay(workerNPCCleanup.id);
      }
    }
  }

  // Helper function to restart crafting at a station
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
        updateStatus(`${strings[440]} ${getLocalizedString(recipe.type, strings)}`);
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
              symbol="🚜"
              name="Bulk Harvest"
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
              name="Bulk Animal Collect"
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
              name="Logging"
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
              name="Bulk Crafting"
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

                const details = `Buy 1 for: 💰 ${cost}`;

                const info = (
                  <div className="info-content">
                    <div><strong>{strings[422]}</strong> 💰 {cost}</div>
                  </div>
                );

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
      {isHarvestModalOpen && (
        <Modal
          isOpen={isHarvestModalOpen}
          onClose={() => {
            setIsHarvestModalOpen(false);
            // Clear busy overlay when modal is closed
            const npcs = Object.values(NPCsInGridManager.getNPCsInGrid(gridId) || {});
            const workerNPC = npcs.find(npc => npc.action === 'worker');
            if (workerNPC) {
              clearNPCOverlay(workerNPC.id);
            }
          }}
          title={strings[315]}
          size="medium"
        >
          <div style={{ padding: '20px', fontSize: '16px' }}>            
            <div style={{ marginBottom: '15px', display: 'flex', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  onClick={() => {
                    const allSelected = {};
                    availableCrops.forEach(crop => {
                      allSelected[crop.type] = true;
                    });
                    setSelectedCropTypes(allSelected);
                  }}
                  style={{ padding: '5px 10px', fontSize: '12px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '3px' }}
                >
                  {strings[316]}
                </button>
                <button 
                  onClick={() => setSelectedCropTypes({})}
                  style={{ padding: '5px 10px', fontSize: '12px', backgroundColor: '#808080', color: 'white', border: 'none', borderRadius: '3px' }}
                >
                  {strings[317]}
                </button>
              </div>
              
              {showBulkReplant && (
                <div style={{ display: 'flex', gap: '10px', marginLeft: '210px' }}>
                  <button 
                    onClick={() => {
                      const allSelected = {};
                      availableCrops.forEach(crop => {
                        // Only select crops that the player has the skill to replant
                        const farmplotResource = masterResources.find(res => 
                          res.category === 'farmplot' && res.output === crop.type
                        );
                        if (hasRequiredSkill(farmplotResource?.requires)) {
                          allSelected[crop.type] = true;
                        }
                      });
                      setSelectedReplantTypes(allSelected);
                    }}
                    style={{ padding: '5px 10px', fontSize: '12px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '3px' }}
                  >
                    {strings[316]}
                  </button>
                  <button 
                    onClick={() => setSelectedReplantTypes({})}
                    style={{ padding: '5px 10px', fontSize: '12px', backgroundColor: '#808080', color: 'white', border: 'none', borderRadius: '3px' }}
                  >
                    {strings[317]}
                  </button>
                </div>
              )}
            </div>
            
            <div style={{ marginBottom: '20px' }}>
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px', fontWeight: 'bold', borderBottom: '1px solid #ccc', paddingBottom: '5px' }}>
                <span style={{ marginRight: '10px', width: '20px' }}></span>
                <span style={{ marginRight: '10px', width: '30px' }}></span>
                <span style={{ marginRight: '10px', width: '100px' }}>Crop</span>
                <span style={{ marginRight: '10px', width: '60px' }}>Count</span>
                {showBulkReplant && (
                  <>
                    <span style={{ marginRight: '10px', width: '80px' }}></span>
                    <span style={{ width: '80px' }}>Replant?</span>
                  </>
                )}
              </div>
              
              {availableCrops.map((crop, index) => (
                <div key={crop.type} style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  marginBottom: '10px',
                  padding: '5px',
                  backgroundColor: index % 2 === 0 ? 'transparent' : '#f0f0f0'
                }}>
                  <input
                    type="checkbox"
                    checked={selectedCropTypes[crop.type] || false}
                    onChange={(e) => {
                      setSelectedCropTypes(prev => ({
                        ...prev,
                        [crop.type]: e.target.checked
                      }));
                    }}
                    style={{ marginRight: '10px', width: '20px' }}
                  />
                  <span style={{ marginRight: '10px', width: '30px' }}>{crop.symbol}</span>
                  <span style={{ marginRight: '10px', width: '100px', fontWeight: 'bold' }}>{getLocalizedString(crop.type, strings)}</span>
                  <span style={{ marginRight: '10px', width: '60px', color: '#666' }}>({crop.count})</span>
                  
                  {showBulkReplant && (() => {
                    // Find the farmplot resource that produces this crop to check skill requirements
                    const farmplotResource = masterResources.find(res => 
                      res.category === 'farmplot' && res.output === crop.type
                    );
                    const canReplant = hasRequiredSkill(farmplotResource?.requires);
                    
                    return (
                      <div style={{ marginLeft: '60px', width: '80px', display: 'flex', justifyContent: 'center' }}>
                        <input
                          type="checkbox"
                          checked={selectedReplantTypes[crop.type] || false}
                          onChange={(e) => {
                            if (canReplant) {
                              setSelectedReplantTypes(prev => ({
                                ...prev,
                                [crop.type]: e.target.checked
                              }));
                            }
                          }}
                          disabled={!canReplant}
                          style={{ 
                            width: '20px',
                            opacity: canReplant ? 1 : 0.5,
                            cursor: canReplant ? 'pointer' : 'not-allowed'
                          }}
                          title={canReplant ? '' : `Requires ${farmplotResource?.requires || 'unknown skill'} to replant ${crop.type}`}
                        />
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button 
                onClick={executeSelectiveHarvest}
                style={{ padding: '10px 20px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px' }}
                disabled={Object.values(selectedCropTypes).every(selected => !selected)}
              >
                {strings[318]}
              </button>
            </div>
          </div>
        </Modal>
      )}
      
      {/* Selective Animal Collect Modal */}
      {isAnimalModalOpen && (
        <Modal
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
          title={strings[319]}
          size="medium"
        >
          <div style={{ padding: '20px', fontSize: '16px' }}>            
            <div style={{ marginBottom: '15px', display: 'flex', gap: '10px' }}>
              <button 
                onClick={() => {
                  const allSelected = {};
                  availableAnimals.forEach(animal => {
                    allSelected[animal.type] = true;
                  });
                  setSelectedAnimalTypes(allSelected);
                }}
                style={{ padding: '5px 10px', fontSize: '12px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '3px' }}
              >
                {strings[316]}
              </button>
              <button 
                onClick={() => setSelectedAnimalTypes({})}
                style={{ padding: '5px 10px', fontSize: '12px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '3px' }}
              >
                {strings[317]}
              </button>
            </div>
            
            <div style={{ marginBottom: '20px' }}>
              {availableAnimals.map((animal, index) => (
                <div key={animal.type} style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  marginBottom: '10px',
                  padding: '5px',
                  backgroundColor: index % 2 === 0 ? 'transparent' : '#f0f0f0'
                }}>
                  <input
                    type="checkbox"
                    checked={selectedAnimalTypes[animal.type] || false}
                    onChange={(e) => {
                      setSelectedAnimalTypes(prev => ({
                        ...prev,
                        [animal.type]: e.target.checked
                      }));
                    }}
                    style={{ marginRight: '10px' }}
                  />
                  <span style={{ marginRight: '10px' }}>{animal.symbol}</span>
                  <span style={{ marginRight: '10px', fontWeight: 'bold' }}>{getLocalizedString(animal.type, strings)}</span>
                  <span style={{ color: '#666' }}>({animal.count})</span>
                </div>
              ))}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button 
                onClick={executeSelectiveAnimalCollect}
                style={{ padding: '10px 20px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px' }}
                disabled={Object.values(selectedAnimalTypes).every(selected => !selected)}
              >
                {strings[318]}
              </button>
            </div>
          </div>
        </Modal>
      )}
      
      {/* Selective Crafting Modal */}
      {isCraftingModalOpen && (
        <Modal
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
          title={strings[467] || "Select Crafting Stations to Collect"}
          size="medium"
        >
          <div style={{ padding: '20px', fontSize: '16px' }}>
            <div style={{ marginBottom: '15px', display: 'flex', gap: '10px', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  onClick={() => {
                    const allSelected = {};
                    availableCraftingStations.forEach(group => {
                      allSelected[`${group.stationType}-${group.craftedItem}`] = true;
                    });
                    setSelectedCraftingStations(allSelected);
                  }}
                  style={{ padding: '5px 10px', fontSize: '12px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '3px' }}
                >
                  {strings[316]}
                </button>
                <button 
                  onClick={() => setSelectedCraftingStations({})}
                  style={{ padding: '5px 10px', fontSize: '12px', backgroundColor: '#808080', color: 'white', border: 'none', borderRadius: '3px' }}
                >
                  {strings[317]}
                </button>
              </div>
              
              {hasBulkRestartCraft && (
                <div style={{ display: 'flex', gap: '10px', marginLeft: 'auto' }}>
                  <button 
                    onClick={() => {
                      const allSelected = {};
                      availableCraftingStations.forEach(group => {
                        allSelected[`${group.stationType}-${group.craftedItem}`] = true;
                      });
                      setSelectedRestartStations(allSelected);
                    }}
                    style={{ padding: '5px 10px', fontSize: '12px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '3px' }}
                  >
                    {strings[316]}
                  </button>
                  <button 
                    onClick={() => setSelectedRestartStations({})}
                    style={{ padding: '5px 10px', fontSize: '12px', backgroundColor: '#808080', color: 'white', border: 'none', borderRadius: '3px' }}
                  >
                    {strings[317]}
                  </button>
                </div>
              )}
            </div>
            
            <div style={{ marginBottom: '20px' }}>
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px', fontWeight: 'bold', borderBottom: '1px solid #ccc', paddingBottom: '5px' }}>
                <span style={{ marginRight: '10px', width: '20px' }}></span>
                <span style={{ marginRight: '10px', width: '30px' }}></span>
                <span style={{ marginRight: '10px', width: '120px' }}>{strings[476]}</span>
                <span style={{ marginRight: '10px', width: '120px' }}>{strings[161]}</span>
                <span style={{ marginRight: '10px', width: '40px' }}>{strings[164]}</span>
                {hasBulkRestartCraft && (
                  <>
                    <span style={{ marginRight: '10px', width: '80px' }}></span>
                    <span style={{ marginRight: '10px', width: '80px' }}>{strings[475]}</span>
                    <span style={{ width: '200px' }}>{strings[177]}</span> {/* "Need" */}
                  </>
                )}
              </div>
              
              {availableCraftingStations.map((group, index) => {
                const key = `${group.stationType}-${group.craftedItem}`;
                return (
                  <div key={key} style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    marginBottom: '10px',
                    padding: '5px',
                    backgroundColor: index % 2 === 0 ? 'transparent' : '#f0f0f0'
                  }}>
                    <input
                      type="checkbox"
                      checked={selectedCraftingStations[key] || false}
                      onChange={(e) => {
                        setSelectedCraftingStations(prev => ({
                          ...prev,
                          [key]: e.target.checked
                        }));
                      }}
                      style={{ marginRight: '10px', width: '20px' }}
                    />
                    <span style={{ marginRight: '10px', width: '30px' }}>{group.stationSymbol}</span>
                    <span style={{ marginRight: '10px', width: '120px' }}>{getLocalizedString(group.stationType, strings)}</span>
                    <span style={{ marginRight: '10px', width: '120px', fontWeight: 'bold' }}>{getLocalizedString(group.craftedItem, strings)}</span>
                    <span style={{ marginRight: '10px', width: '60px', color: '#666' }}>({group.count})</span>
                    
                    {hasBulkRestartCraft && (() => {
                      // Calculate if player has enough ingredients
                      const craftedResource = masterResources.find(r => r.type === group.craftedItem);
                      let hasAllIngredients = true;
                      let ingredientElements = [];
                      
                      if (craftedResource) {
                        const ingredients = [];
                        for (let i = 1; i <= 5; i++) {
                          const ingredientType = craftedResource[`ingredient${i}`];
                          const ingredientQty = craftedResource[`ingredient${i}qty`];
                          if (ingredientType) {
                            ingredients.push({ type: ingredientType, quantity: ingredientQty || 1 });
                          }
                        }
                        
                        if (ingredients.length > 0) {
                          const playerInventory = {};
                          [...(inventory || []), ...(backpack || [])].forEach(item => {
                            playerInventory[item.type] = (playerInventory[item.type] || 0) + item.quantity;
                          });
                          
                          ingredientElements = ingredients.map((ing, idx) => {
                            const needed = ing.quantity * group.count;
                            const has = playerInventory[ing.type] || 0;
                            const hasEnough = has >= needed;
                            if (!hasEnough) hasAllIngredients = false;
                            
                            const ingredientResource = masterResources.find(r => r.type === ing.type);
                            const symbol = ingredientResource?.symbol || '?';
                            
                            return (
                              <div key={idx} style={{ 
                                color: hasEnough ? '#666' : 'red'
                              }}>
                                {symbol} {needed} / {has}
                              </div>
                            );
                          });
                        } else {
                          hasAllIngredients = false;
                        }
                      } else {
                        hasAllIngredients = false;
                      }
                      
                      return (
                        <>
                          <div style={{ marginLeft: '60px', width: '80px', display: 'flex', justifyContent: 'center' }}>
                            <input
                              type="checkbox"
                              checked={hasAllIngredients ? (selectedRestartStations[key] || false) : false}
                              onChange={(e) => {
                                if (hasAllIngredients) {
                                  setSelectedRestartStations(prev => ({
                                    ...prev,
                                    [key]: e.target.checked
                                  }));
                                }
                              }}
                              disabled={!hasAllIngredients}
                              style={{ 
                                width: '20px',
                                cursor: hasAllIngredients ? 'pointer' : 'not-allowed',
                                opacity: hasAllIngredients ? 1 : 0.5
                              }}
                              title={hasAllIngredients ? "Restart crafting after collection" : "Not enough ingredients to restart"}
                            />
                          </div>
                          
                          {/* Need column */}
                          <div style={{ width: '200px' }}>
                            {ingredientElements.length > 0 ? (
                              <div style={{ 
                                display: 'flex', 
                                flexDirection: 'column',
                                gap: '2px',
                                color: hasAllIngredients ? '#666' : 'red'
                              }}>
                                {ingredientElements}
                              </div>
                            ) : (
                              <span style={{ color: '#666' }}>-</span>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button 
                onClick={executeSelectiveCrafting}
                style={{ padding: '10px 20px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px' }}
                disabled={Object.values(selectedCraftingStations).every(selected => !selected)}
              >
                {strings[318]}
              </button>
            </div>
          </div>
        </Modal>
      )}
      
      {/* Bulk Operation Progress Modal */}
      <ProgressModal
        isOpen={bulkProgressModal.isOpen}
        title={strings[478]}
        message={bulkProgressModal.message}
        onComplete={bulkProgressModal.onComplete}
      />
    </Panel>
  );


};

export default React.memo(FarmHandPanel);