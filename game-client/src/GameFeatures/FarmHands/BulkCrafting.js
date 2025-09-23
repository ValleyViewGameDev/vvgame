import React, { useState } from 'react';
import axios from 'axios';
import API_BASE from '../../config';
import Modal from '../../UI/Modal';
import { canAfford, spendIngredients, gainIngredients, calculateSkillMultiplier } from '../../Utils/InventoryManagement';
import { formatCollectionResults, formatRestartResults } from '../../UI/StatusBar/CollectionFormatters';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import { getLocalizedString } from '../../Utils/stringLookup';
import { refreshPlayerAfterInventoryUpdate } from '../../Utils/InventoryManagement';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import '../../UI/SharedButtons.css';

// Component for the bulk crafting selection modal
export function BulkCraftingModal({ 
  isOpen, 
  onClose, 
  stationGroups, 
  onExecute,
  hasBulkRestartCraft,
  strings,
  masterResources,
  inventory,
  backpack 
}) {
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [selectedRestartStations, setSelectedRestartStations] = useState({});

  // Initialize selections when modal opens
  React.useEffect(() => {
    if (isOpen && stationGroups.length > 0) {
      // Select all station groups by default
      setSelectedGroups(stationGroups);
      
      // Select all restart options by default (if bulk restart skill is available)
      if (hasBulkRestartCraft) {
        const defaultRestartSelection = {};
        stationGroups.forEach(group => {
          if (group.canRestart) {
            const key = `${group.stationType}-${group.craftedItem}`;
            defaultRestartSelection[key] = true;
          }
        });
        setSelectedRestartStations(defaultRestartSelection);
      }
    }
  }, [isOpen, stationGroups, hasBulkRestartCraft]);

  const handleToggleGroup = (group) => {
    setSelectedGroups(prev => {
      const isSelected = prev.some(g => 
        g.stationType === group.stationType && g.craftedItem === group.craftedItem
      );
      
      if (isSelected) {
        // If unchecking collect, also uncheck restart
        const key = `${group.stationType}-${group.craftedItem}`;
        setSelectedRestartStations(restartPrev => ({
          ...restartPrev,
          [key]: false
        }));
        
        return prev.filter(g => 
          !(g.stationType === group.stationType && g.craftedItem === group.craftedItem)
        );
      } else {
        return [...prev, group];
      }
    });
  };

  const handleToggleRestart = (group) => {
    const key = `${group.stationType}-${group.craftedItem}`;
    setSelectedRestartStations(prev => {
      const newValue = !prev[key];
      // If checking restart, also check collect
      if (newValue) {
        setSelectedGroups(groupsPrev => {
          const isAlreadySelected = groupsPrev.some(g => 
            g.stationType === group.stationType && g.craftedItem === group.craftedItem
          );
          if (!isAlreadySelected) {
            return [...groupsPrev, group];
          }
          return groupsPrev;
        });
      }
      return {
        ...prev,
        [key]: newValue
      };
    });
  };

  const handleExecute = () => {
    onExecute(selectedGroups, selectedRestartStations);
  };

  const isGroupSelected = (group) => {
    return selectedGroups.some(g => 
      g.stationType === group.stationType && g.craftedItem === group.craftedItem
    );
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={strings[341] || "Select Crafting Stations to Collect"} size="medium">
      <div style={{ padding: '20px', fontSize: '16px' }}>
        <div style={{ marginBottom: '15px', display: 'flex', gap: '10px', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              onClick={() => {
                const allSelected = [];
                stationGroups.forEach(group => {
                  allSelected.push(group);
                });
                setSelectedGroups(allSelected);
              }}
              style={{ padding: '5px 10px', fontSize: '12px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '3px' }}
            >
              {strings[316] || 'Select All'}
            </button>
            <button 
              onClick={() => {
                setSelectedGroups([]);
                // When deselecting all collect, also deselect all restart
                setSelectedRestartStations({});
              }}
              style={{ padding: '5px 10px', fontSize: '12px', backgroundColor: '#808080', color: 'white', border: 'none', borderRadius: '3px' }}
            >
              {strings[317] || 'Deselect All'}
            </button>
          </div>
          
          {hasBulkRestartCraft && (
            <div style={{ display: 'flex', gap: '10px', marginLeft: 'auto' }}>
              <button 
                onClick={() => {
                  const allSelected = {};
                  const collectGroups = [];
                  stationGroups.forEach(group => {
                    if (group.canRestart && group.affordable) {
                      allSelected[`${group.stationType}-${group.craftedItem}`] = true;
                      // When selecting restart, also select collect
                      collectGroups.push(group);
                    }
                  });
                  setSelectedRestartStations(allSelected);
                  // Ensure all groups with restart selected are also selected for collect
                  setSelectedGroups(prev => {
                    const newGroups = [...prev];
                    collectGroups.forEach(group => {
                      const isAlreadySelected = newGroups.some(g => 
                        g.stationType === group.stationType && g.craftedItem === group.craftedItem
                      );
                      if (!isAlreadySelected) {
                        newGroups.push(group);
                      }
                    });
                    return newGroups;
                  });
                }}
                style={{ padding: '5px 10px', fontSize: '12px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '3px' }}
              >
                {strings[316] || 'Select All'}
              </button>
              <button 
                onClick={() => setSelectedRestartStations({})  }
                style={{ padding: '5px 10px', fontSize: '12px', backgroundColor: '#808080', color: 'white', border: 'none', borderRadius: '3px' }}
              >
                {strings[317] || 'Deselect All'}
              </button>
            </div>
          )}
        </div>
        
        <div style={{ marginBottom: '20px' }}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px', fontSize: '14px', fontWeight: 'bold', borderBottom: '1px solid #ccc', paddingBottom: '5px' }}>
            <span style={{ marginRight: '10px', width: '20px' }}>{strings[346] || 'Collect?'}</span>
            <span style={{ marginRight: '10px', width: '30px' }}></span>
            <span style={{ marginRight: '10px', width: '120px' }}>{strings[476] || 'Collect'}</span>
            <span style={{ marginRight: '10px', width: '120px' }}>{strings[161] || 'From'}</span>
            <span style={{ marginRight: '10px', width: '40px' }}>{strings[164] || 'Qty'}</span>
            {hasBulkRestartCraft && (
              <>
                <span style={{ marginRight: '10px', width: '80px' }}></span>
                <span style={{ marginRight: '10px', width: '80px' }}>{strings[475] || 'Restart?'}</span>
                <span style={{ width: '200px' }}>{strings[177] || 'Need'}</span>
              </>
            )}
          </div>
          
          {stationGroups.map((group, index) => {
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
                  checked={isGroupSelected(group)}
                  onChange={(e) => handleToggleGroup(group)}
                  style={{ marginRight: '10px', width: '20px' }}
                />
                <span style={{ marginRight: '10px', width: '30px' }}>{group.stationSymbol}</span>
                <span style={{ marginRight: '10px', width: '120px' }}>{getLocalizedString(group.stationType, strings)}</span>
                <span style={{ marginRight: '10px', width: '120px', fontWeight: 'bold' }}>{getLocalizedString(group.craftedItem, strings)}</span>
                <span style={{ marginRight: '10px', width: '60px', color: '#666' }}>({group.stationCount})</span>
                
                {hasBulkRestartCraft && (() => {
                  // Calculate if player has enough ingredients
                  const craftedResource = group.recipe;
                  let hasAllIngredients = group.affordable;
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
                        const stationCount = group.stationCount || 1;
                        const needed = ing.quantity * stationCount;
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
                    }
                  }
                  
                  return (
                    <>
                      <div style={{ marginLeft: '60px', width: '80px', display: 'flex', justifyContent: 'center' }}>
                        <input
                          type="checkbox"
                          checked={hasAllIngredients ? (selectedRestartStations[key] || false) : false}
                          onChange={() => hasAllIngredients && handleToggleRestart(group)}
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
            onClick={handleExecute}
            style={{ padding: '10px 20px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px' }}
            disabled={selectedGroups.length === 0}
          >
            {strings[318] || 'Collect Selected'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Helper function to restart crafting at a station
async function restartCrafting(station, recipe, strings, currentPlayer, gridId, inventory, backpack) {
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
  const hasRequiredSkill = !recipe.requires || currentPlayer.skills?.some((owned) => owned.type === recipe.requires);
  if (!hasRequiredSkill) {
    console.log(`Missing required skill for ${recipe.type}`);
    return false;
  }

  try {
    // Generate transaction ID for this specific restart
    const transactionId = `craft-restart-${station.x}-${station.y}-${Date.now()}`;
    const transactionKey = `crafting-start-${recipe.type}-${station.x}-${station.y}`;
    
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
        return true;
    }
  } catch (error) {
    console.error(`Failed to restart crafting at (${station.x}, ${station.y}):`, error);
  }
  
  return false;
}

// Main function to execute bulk crafting collection
export async function executeBulkCrafting({
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
  updateStatus
}) {
  if (selectedGroups.length === 0) {
    return 'No crafting stations selected for collection.';
  }

  // Flatten all selected stations
  const stationsToCollect = selectedGroups.flatMap(group => group.stations);
  
  
  // Prepare batch data for all stations
  const batchStations = stationsToCollect.map(station => {
    const key = `${station.type}-${station.craftedItem}`;
    const shouldRestart = hasBulkRestartCraft && selectedRestartStations[key];
    
    // Find the recipe if we need to restart
    let restartRecipe = null;
    if (shouldRestart) {
      const stationGroup = selectedGroups.find(g => 
        g.stationType === station.type && g.craftedItem === station.craftedItem
      );
      if (stationGroup && stationGroup.recipe) {
        restartRecipe = stationGroup.recipe;
      }
    }
    
    return {
      x: station.x,
      y: station.y,
      type: station.type,
      craftedItem: station.craftedItem,
      transactionId: `bulk-craft-collect-${Date.now()}-${Math.random()}`,
      shouldRestart: false, // We'll handle restart after collection
      restartRecipe: null // Not needed in the API call
    };
  });
  
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  
  
  const transactionId = `bulk-craft-collect-${currentPlayer._id}-${Date.now()}`;
  const transactionKey = `bulk-craft-collect-${gridId}`;
  
  const response = await axios.post(`${API_BASE}/api/crafting/collect-bulk`, {
    playerId: currentPlayer.playerId || currentPlayer._id,
    gridId,
    stations: batchStations,
    transactionId,
    transactionKey
  });
  
  
  if (response.data.success && response.data.results) {
    const results = response.data.results;
    const updatedResources = GlobalGridStateTilesAndResources.getResources();
    
    // Track successful collections and applied skills
    const successfulCollects = {};
    const successfulRestarts = {};
    const appliedSkillsInfo = {};
    
    // Process each result
    for (const result of results) {
      if (result.collected || result.success) {
        const { station, collectedItem, craftedItem, isNPC } = result;
        const itemCollected = collectedItem || craftedItem;
        
        // Update the station in global resources to clear craft state
        const resourceIndex = updatedResources.findIndex(res => 
          res.x === station.x && res.y === station.y
        );
        if (resourceIndex !== -1) {
          updatedResources[resourceIndex].craftEnd = undefined;
          updatedResources[resourceIndex].craftedItem = undefined;
        }
        
        // Calculate skill info
        const stationType = station.stationType || station.type;
        const playerBuffs = (currentPlayer.skills || [])
          .filter((item) => {
            const resourceDetails = masterResources.find((res) => res.type === item.type);
            const isSkill = resourceDetails?.category === 'skill' || resourceDetails?.category === 'upgrade';
            const appliesToStation = (masterSkills?.[item.type]?.[stationType] || 1) > 1;
            return isSkill && appliesToStation;
          })
          .map((buffItem) => buffItem.type);
        
        // Calculate skill multiplier
        const skillMultiplier = playerBuffs.reduce((multiplier, buff) => {
          const buffValue = masterSkills?.[buff]?.[stationType] || 1;
          return multiplier * buffValue;
        }, 1);
        
        // Base quantity is 1 per crafting station (matching individual crafting)
        const baseQtyCollected = 1;
        const finalQtyCollected = baseQtyCollected * skillMultiplier;
        
        // Handle NPC spawning
        if (isNPC) {
          const craftedResource = masterResources.find(res => res.type === itemCollected);
          if (craftedResource) {
            NPCsInGridManager.spawnNPC(gridId, craftedResource, { x: station.x, y: station.y });
          }
        } else {
          // Server doesn't add items - client handles with skill buffs
          // Track successful collects with skill bonuses
          successfulCollects[itemCollected] = (successfulCollects[itemCollected] || 0) + finalQtyCollected;
          
          // Track skills applied for this item type (only need to do once per item type)
          if (!appliedSkillsInfo[itemCollected] && playerBuffs.length > 0) {
            appliedSkillsInfo[itemCollected] = {
              skills: playerBuffs,
              multiplier: skillMultiplier,
              hasSkills: true
            };
          }
        }
      }
      
      // Don't track quest progress individually in bulk - will do it at the end
      
      // Track restarts
      if (result.restarted) {
        const craftType = result.station.craftedItem || result.craftType;
        successfulRestarts[craftType] = (successfulRestarts[craftType] || 0) + 1;
        
        // Update the resource with new craft state
        const resourceIndex = updatedResources.findIndex(res => 
          res.x === result.station.x && res.y === result.station.y
        );
        if (resourceIndex !== -1) {
          updatedResources[resourceIndex].craftEnd = result.newCraftEnd;
          updatedResources[resourceIndex].craftedItem = result.newCraftedItem;
        }
      }
    }
    
    // Update inventory from server response if provided
    if (response.data.inventory) {
      // Don't update inventory from server - server doesn't add collected items
      // We'll add them ourselves with skill bonuses via gainIngredients
      
      // The server response includes spent ingredients for restarts
      // Update local inventory with what server says we have after spending
      setInventory(response.data.inventory.warehouse);
      setBackpack(response.data.inventory.backpack);
      setCurrentPlayer(prev => ({
        ...prev,
        inventory: response.data.inventory.warehouse,
        backpack: response.data.inventory.backpack
      }));
    }
    
    // Update global resources with all changes
    GlobalGridStateTilesAndResources.setResources(updatedResources);
    setResources(updatedResources);
    
    // Add collected items to inventory with skills applied
    for (const [collectedItem, quantity] of Object.entries(successfulCollects)) {
      await gainIngredients({
        playerId: currentPlayer.playerId,
        currentPlayer,
        resource: collectedItem,
        quantity: quantity,
        inventory: currentPlayer.inventory,
        backpack: currentPlayer.backpack,
        setInventory,
        setBackpack,
        setCurrentPlayer,
        updateStatus,
        masterResources,
      });
      
      // Track quest progress
      await trackQuestProgress(currentPlayer, 'Craft', collectedItem, quantity, setCurrentPlayer);
    }
    
    await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer, false);
    
    // Handle restarts after bulk collection is complete
    if (hasBulkRestartCraft) {
      
      for (const result of results) {
        if ((result.collected || result.success) && !result.isNPC) {
          const { station, collectedItem, craftedItem } = result;
          const itemCollected = collectedItem || craftedItem;
          const key = `${station.type || station.stationType}-${itemCollected}`;
          
          if (selectedRestartStations[key]) {
            // Find the recipe
            const stationGroup = selectedGroups.find(g => 
              g.stationType === (station.type || station.stationType) && 
              g.craftedItem === (station.craftedItem || result.collectedItem)
            );
            
            if (stationGroup && stationGroup.recipe && stationGroup.affordable) {
              const restartSuccess = await restartCrafting(
                station,
                stationGroup.recipe,
                strings,
                currentPlayer,
                gridId,
                inventory,
                backpack
              );
              
              if (restartSuccess) {
                successfulRestarts[itemCollected] = (successfulRestarts[itemCollected] || 0) + 1;
                
                // Update local resource state
                const resourceIndex = updatedResources.findIndex(res => 
                  res.x === station.x && res.y === station.y
                );
                if (resourceIndex !== -1) {
                  updatedResources[resourceIndex].craftEnd = Date.now() + (stationGroup.recipe.crafttime || 60) * 1000;
                  updatedResources[resourceIndex].craftedItem = itemCollected;
                }
              }
              
              await wait(100); // Small delay between restarts
            }
          }
        }
      }
      
      // Update resources again after restarts
      GlobalGridStateTilesAndResources.setResources(updatedResources);
      setResources(updatedResources);
    }
    
    // Check if we have any successful operations
    const hasCollections = Object.keys(successfulCollects).length > 0;
    const hasRestarts = Object.keys(successfulRestarts).length > 0;
    const totalProcessed = results.filter(r => r.collected || r.success).length;
    
    
    if (hasCollections || hasRestarts) {
      const parts = [];
      
      if (hasCollections) {
        parts.push(formatCollectionResults('craft', successfulCollects, appliedSkillsInfo, null, strings, getLocalizedString));
      }
      
      if (hasRestarts) {
        parts.push(formatRestartResults(successfulRestarts, 'craft', strings, getLocalizedString));
      }
      
      return parts.join(' | ');
    } else if (totalProcessed > 0) {
      // Items were processed but maybe all were NPCs
      return `Collected from ${totalProcessed} crafting station${totalProcessed > 1 ? 's' : ''}.`;
    } else {
      return 'Failed to collect any crafted items.';
    }
  } else {
    return 'Failed to collect crafted items.';
  }
}

// Function to prepare crafting station data for the modal
export function prepareBulkCraftingData(masterResources, inventory, backpack, currentPlayer, hasRequiredSkill) {
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
        craftedSymbol: craftedResource?.symbol || '📦',
        stations: [],
        recipe: recipe,
        canRestart: !!recipe && hasRequiredSkill(recipe?.requires),
        affordable: recipe ? canAfford(recipe, inventory, backpack, 1) : false
      };
    }
    stationGroups[key].stations.push(station);
  });

  // Convert to array and add counts
  return Object.values(stationGroups).map(group => ({
    ...group,
    stationCount: group.stations.length
  }));
}