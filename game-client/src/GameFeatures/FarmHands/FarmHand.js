import API_BASE from '../../config';
import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import Panel from '../../UI/Panel';
import Modal from '../../UI/Modal';
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

      const filteredRecipes = masterResources.filter((res) => 
        farmOutputs.includes(res.type) && res.type !== 'Oak Tree'
      );
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

    if (processingAnimals.length === 0) {
      updateStatus('No animals are ready to collect.');
      return;
    }
    
    // Find the Farmer NPC to apply busy overlay
    const farmerNPC = npcs.find(npc => npc.action === 'worker');
    if (farmerNPC) {
      setBusyOverlay(farmerNPC.id);
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
    
    // Find the Farmer NPC to apply busy overlay
    const npcs = Object.values(NPCsInGridManager.getNPCsInGrid(gridId) || {});
    const farmerNPC = npcs.find(npc => npc.action === 'worker');
    if (farmerNPC) {
      setBusyOverlay(farmerNPC.id);
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
          updateStatus
        );

        successfulCollects[npc.type] = (successfulCollects[npc.type] || 0) + 1;
        await wait(100); // avoid overloading server
      }

      await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);

      updateStatus(`Selective Animal Collect complete: ${Object.entries(successfulCollects).map(([t, q]) => `${q} ${t}`).join(', ')}`);
    } catch (error) {
      console.error('Selective animal collect failed:', error);
      setErrorMessage('Failed to collect selected animals.');
    } finally {
      // End bulk operation tracking
      endBulkOperation(operationId);
      
      // Clear busy overlay when operation completes
      const npcs = Object.values(NPCsInGridManager.getNPCsInGrid(gridId) || {});
      const farmerNPC = npcs.find(npc => npc.action === 'worker');
      if (farmerNPC) {
        clearNPCOverlay(farmerNPC.id);
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
    onClose();
    setErrorMessage('');

    const safeInventory = Array.isArray(inventory) ? inventory : [];
    const safeBackpack = Array.isArray(backpack) ? backpack : [];
    
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
      // Get selected crop types
      const selectedTypes = Object.keys(selectedCropTypes).filter(type => selectedCropTypes[type]);
      
      if (selectedTypes.length === 0) {
        updateStatus('No crops selected for harvest.');
        return;
      }

      // Filter resources to only selected crop types
      const cropsToHarvest = resources.filter(res => selectedTypes.includes(res.type));
      const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
      const successfulHarvest = {};

      for (const crop of cropsToHarvest) {
        const preInventory = [...safeInventory];
        const preBackpack = [...safeBackpack];

        // Store crop position for potential replanting
        const cropPosition = { x: crop.x, y: crop.y };
        const shouldReplant = selectedReplantTypes[crop.type] || false;

        await handleDooberClick(
          crop,
          crop.y,
          crop.x,
          resources,
          setResources,
          setInventory,
          setBackpack,
          preInventory,
          preBackpack,
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

        // Handle replanting if selected
        if (shouldReplant && showBulkReplant) {
          // Find the farmplot resource that outputs this crop type
          const farmplotResource = masterResources.find(res => 
            res.category === 'farmplot' && res.output === crop.type
          );
          
          // Double-check skill requirement as safety measure
          if (farmplotResource && hasRequiredSkill(farmplotResource.requires)) {
            // Check if the tile is still dirt before replanting
            const tileType = await validateTileType(gridId, cropPosition.x, cropPosition.y);
            if (tileType !== 'd') {
              console.log(`⚠️ Skipping replant at (${cropPosition.x}, ${cropPosition.y}) - tile is not dirt (${tileType})`);
              FloatingTextManager.addFloatingText(303, cropPosition.x, cropPosition.y, TILE_SIZE); // "Must be dirt"
              continue; // Skip this replant and continue with next crop
            }
            
            console.log(`🌱 Replanting ${crop.type} with ${farmplotResource.type} at (${cropPosition.x}, ${cropPosition.y})`);
            
            // Direct placement using the existing server sync logic
            const growEndTime = Date.now() + (farmplotResource.growtime || 0) * 1000;
            
            // Create the new farmplot resource
            const enrichedNewResource = {
              ...farmplotResource,
              type: farmplotResource.type,
              x: cropPosition.x,
              y: cropPosition.y,
              growEnd: growEndTime,
            };
            
            // Update local state
            setResources(prevResources => [...prevResources, enrichedNewResource]);
            
            // Update server and all clients
            await updateGridResource(
              gridId,
              {
                type: farmplotResource.type,
                x: cropPosition.x,
                y: cropPosition.y,
                growEnd: growEndTime,
              },
              true
            );
            
            FloatingTextManager.addFloatingText(302, cropPosition.x, cropPosition.y, TILE_SIZE); // "Planted!"
          }
        }

        successfulHarvest[crop.type] = (successfulHarvest[crop.type] || 0) + 1;
        await wait(100); // avoid hammering server
      }

      await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer);

      updateStatus(`🌱 Selective Crop Harvest complete: ${Object.entries(successfulHarvest).map(([t, q]) => `${q} ${t}`).join(', ')}`);
    } catch (error) {
      console.error('Selective crop harvest failed:', error);
      setErrorMessage('Failed to harvest selected crops.');
    } finally {
      // End bulk operation tracking
      endBulkOperation(operationId);
      
      // Clear busy overlay when operation completes
      const npcs = Object.values(NPCsInGridManager.getNPCsInGrid(gridId) || {});
      const farmerNPC = npcs.find(npc => npc.action === 'worker');
      if (farmerNPC) {
        clearNPCOverlay(farmerNPC.id);
      }
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
    
    // If player has Bulk Restart Craft skill, pre-select all restart options
    if (hasBulkRestartCraft) {
      const defaultRestartSelection = {};
      stationsWithDetails.forEach(group => {
        defaultRestartSelection[`${group.stationType}-${group.craftedItem}`] = true;
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
                const restarted = await restartCrafting(station, stationGroup.recipe);
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
        let statusMessage = `🔨 Bulk Crafting complete: ${Object.entries(successfulCollects).map(([t, q]) => `${q} ${t}`).join(', ')}`;
        if (Object.keys(successfulRestarts).length > 0) {
          statusMessage += ` | Restarted: ${Object.entries(successfulRestarts).map(([t, q]) => `${q} ${t}`).join(', ')}`;
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
  async function restartCrafting(station, recipe) {
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
          onClose={() => setIsHarvestModalOpen(false)}
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
          onClose={() => setIsAnimalModalOpen(false)}
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
          onClose={() => setIsCraftingModalOpen(false)}
          title={strings[467] || "Select Crafting Stations to Collect"}
          size="medium"
        >
          <div style={{ padding: '20px', fontSize: '16px' }}>
            <div style={{ marginBottom: '15px', display: 'flex', gap: '10px' }}>
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
                <div style={{ display: 'flex', gap: '10px', marginLeft: '180px' }}>
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
                <span style={{ marginRight: '10px', width: '30px' }}></span>
                <span style={{ marginRight: '10px', width: '120px' }}>Station</span>
                <span style={{ marginRight: '10px', width: '120px' }}>Item</span>
                <span style={{ marginRight: '10px', width: '60px' }}>Count</span>
                {hasBulkRestartCraft && (
                  <>
                    <span style={{ marginRight: '10px', width: '80px' }}></span>
                    <span style={{ width: '80px' }}>Restart?</span>
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
                    <span style={{ marginRight: '10px', width: '30px' }}>{group.craftedSymbol}</span>
                    <span style={{ marginRight: '10px', width: '120px' }}>{getLocalizedString(group.stationType, strings)}</span>
                    <span style={{ marginRight: '10px', width: '120px', fontWeight: 'bold' }}>{getLocalizedString(group.craftedItem, strings)}</span>
                    <span style={{ marginRight: '10px', width: '60px', color: '#666' }}>({group.count})</span>
                    
                    {hasBulkRestartCraft && (
                      <div style={{ marginLeft: '60px', width: '80px', display: 'flex', justifyContent: 'center' }}>
                        <input
                          type="checkbox"
                          checked={selectedRestartStations[key] || false}
                          onChange={(e) => {
                            setSelectedRestartStations(prev => ({
                              ...prev,
                              [key]: e.target.checked
                            }));
                          }}
                          style={{ 
                            width: '20px',
                            cursor: 'pointer'
                          }}
                          title="Restart crafting after collection"
                        />
                      </div>
                    )}
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
    </Panel>
  );


};

export default React.memo(FarmHandPanel);