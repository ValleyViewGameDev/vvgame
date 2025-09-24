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

  const getRestartLabel = (group) => {
    if (!hasBulkRestartCraft) {
      return strings[345] || 'Requires skill';
    }
    if (!group.canRestart) {
      return strings[346] || 'Locked';
    }
    if (!group.affordable) {
      return null;  // Don't show text for insufficient ingredients
    }
    return null;
  };

  const isRestartDisabled = (group) => {
    return !hasBulkRestartCraft || !group.canRestart || !group.affordable;
  };

  // Calculate total ingredient needs for a group
  const calculateGroupNeeds = (group) => {
    if (!group.recipe || !group.stationCount) return null;
    
    const needs = {};
    
    // Calculate needs for each ingredient
    for (let i = 1; i <= 4; i++) {
      const ingredientType = group.recipe[`ingredient${i}`];
      const ingredientQty = group.recipe[`ingredient${i}qty`];
      
      if (ingredientType && ingredientQty) {
        const totalNeeded = ingredientQty * group.stationCount;
        const inventoryQty = inventory?.find(item => item.type === ingredientType)?.quantity || 0;
        const backpackQty = backpack?.find(item => item.type === ingredientType)?.quantity || 0;
        const totalAvailable = inventoryQty + backpackQty;
        
        needs[ingredientType] = {
          needed: totalNeeded,
          available: totalAvailable,
          symbol: masterResources.find(r => r.type === ingredientType)?.symbol || ''
        };
      }
    }
    
    return needs;
  };

  const selectAll = () => {
    setSelectedGroups(stationGroups);
  };

  const selectNone = () => {
    setSelectedGroups([]);
    // When deselecting all collections, also deselect all restarts
    setSelectedRestartStations({});
  };

  const selectAllRestarts = () => {
    const allRestartSelection = {};
    const groupsToSelect = [];
    stationGroups.forEach(group => {
      if (group.canRestart && group.affordable) {
        const key = `${group.stationType}-${group.craftedItem}`;
        allRestartSelection[key] = true;
        // Also select the group for collection
        if (!isGroupSelected(group)) {
          groupsToSelect.push(group);
        }
      }
    });
    setSelectedRestartStations(prev => ({
      ...prev,
      ...allRestartSelection
    }));
    setSelectedGroups(prev => [...prev, ...groupsToSelect]);
  };

  const selectNoneRestarts = () => {
    setSelectedRestartStations({});
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={strings[341] || "Select Crafting Stations to Collect:"} size="large">
      <div style={{ padding: '20px', fontSize: '16px' }}>
        <div style={{ marginBottom: '15px', display: 'flex', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              onClick={selectAll}
              style={{ padding: '5px 10px', fontSize: '12px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '3px' }}
            >
              {strings[316] || 'Select All'}
            </button>
            <button 
              onClick={selectNone}
              style={{ padding: '5px 10px', fontSize: '12px', backgroundColor: '#808080', color: 'white', border: 'none', borderRadius: '3px' }}
            >
              {strings[317] || 'Deselect All'}
            </button>
          </div>
          
          {hasBulkRestartCraft && (
            <div style={{ display: 'flex', gap: '10px', marginLeft: 'auto', marginRight: '50px' }}>
              <button 
                onClick={selectAllRestarts}
                style={{ padding: '5px 10px', fontSize: '12px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '3px' }}
              >
                {strings[316] || 'Select All'}
              </button>
              <button 
                onClick={selectNoneRestarts}
                style={{ padding: '5px 10px', fontSize: '12px', backgroundColor: '#808080', color: 'white', border: 'none', borderRadius: '3px' }}
              >
                {strings[317] || 'Deselect All'}
              </button>
            </div>
          )}
        </div>
        
        <div style={{ display: 'flex', marginBottom: '10px', fontSize: '14px', fontWeight: 'bold' }}>
          <div style={{ width: '60px', textAlign: 'center' }}>{strings[346] || 'Collect?'}</div>
          <div style={{ width: '200px', textAlign: 'left', paddingLeft: '10px' }}>{strings[476] || 'Station'}</div>
          <div style={{ width: '270px', textAlign: 'left' }}>{strings[161] || 'Item'}</div>
          {hasBulkRestartCraft && (
            <div style={{ width: '80px', textAlign: 'center' }}>{strings[475]}</div>
          )}
          <div style={{ width: '150px', textAlign: 'center' }}>{strings[177]}</div>
        </div>
        
        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          {stationGroups.map((group, index) => {
            const key = `${group.stationType}-${group.craftedItem}`;
            const needs = calculateGroupNeeds(group);
            return (
              <div key={index} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', padding: '5px', borderBottom: '1px solid #eee' }}>
                <div style={{ width: '60px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={isGroupSelected(group)}
                    onChange={() => handleToggleGroup(group)}
                    style={{ width: '20px' }}
                  />
                </div>
                <div style={{ width: '200px', textAlign: 'left', fontWeight: 'bold', paddingLeft: '10px' }}>
                  {group.stationSymbol} {getLocalizedString(group.stationType, strings)}
                </div>
                <div style={{ width: '270px', textAlign: 'left' }}>
                  {group.craftedSymbol} {getLocalizedString(group.craftedItem, strings)} ({group.stationCount})
                </div>
                {hasBulkRestartCraft ? (() => {
                  const restartLabel = getRestartLabel(group);
                  return (
                    <div style={{ marginLeft: '0px', width: '80px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selectedRestartStations[key] || false}
                        onChange={() => !isRestartDisabled(group) && handleToggleRestart(group)}
                        disabled={isRestartDisabled(group)}
                        style={{ 
                          width: '20px',
                          opacity: isRestartDisabled(group) ? 0.5 : 1,
                          cursor: isRestartDisabled(group) ? 'not-allowed' : 'pointer'
                        }}
                        title={restartLabel || ''}
                      />
                      {restartLabel && (
                        <span style={{ fontSize: '11px', color: 'red', marginTop: '2px' }}>
                          {restartLabel}
                        </span>
                      )}
                    </div>
                  );
                })() : null}
                {/* Needs column */}
                <div style={{ width: '150px', textAlign: 'center', fontSize: '12px' }}>
                  {needs && Object.entries(needs).map(([type, data], idx) => {
                    const color = data.available >= data.needed ? 'green' : 'red';
                    return (
                      <div key={idx} style={{ color }}>
                        {data.symbol} {data.needed}/{data.available}
                      </div>
                    );
                  })}
                </div>
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
            {strings[318] || 'Collect'}
          </button>
        </div>
      </div>
    </Modal>
  );
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
      if (stationGroup && stationGroup.recipe && stationGroup.affordable) {
        restartRecipe = stationGroup.recipe;
      }
    }
    
    return {
      x: station.x,
      y: station.y,
      type: station.type,
      craftedItem: station.craftedItem,
      transactionId: `bulk-craft-collect-${Date.now()}-${Math.random()}`,
      shouldRestart: shouldRestart && restartRecipe !== null,
      restartRecipe: restartRecipe
    };
  });
  
  const transactionId = `bulk-craft-collect-${currentPlayer._id}-${Date.now()}`;
  const transactionKey = `bulk-craft-collect-${gridId}`;
  
  // Make single API call for both collection and restart
  
  try {
    const response = await axios.post(`${API_BASE}/api/crafting/collect-bulk`, {
      playerId: currentPlayer.playerId || currentPlayer._id,
      gridId,
      stations: batchStations,
      transactionId,
      transactionKey
    });
    
    if (response.data.success && response.data.results) {
      const results = response.data.results;
      let updatedResources = [...GlobalGridStateTilesAndResources.getResources()];
      
      // Track successful collections and applied skills
      const successfulCollects = {};
      const successfulRestarts = {};
      const appliedSkillsInfo = {};
      
      // Process each result and build a map of station updates
      const stationUpdates = {};
      
      for (const result of results) {
        if (result.collected || result.success) {
          const { station, collectedItem, craftedItem, isNPC } = result;
          const itemCollected = collectedItem || craftedItem;
          const key = `${station.x}-${station.y}`;
          
          if (result.restarted && result.newCraftEnd) {
            // Restarted - update with new craft state
            stationUpdates[key] = { 
              craftEnd: result.newCraftEnd, 
              craftedItem: result.newCraftedItem || itemCollected 
            };
          } else {
            // Just collected - clear craft state
            stationUpdates[key] = { 
              craftEnd: undefined, 
              craftedItem: undefined 
            };
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
          
          // Track restart info
          if (result.restarted) {
            const restartedItem = result.newCraftedItem || result.restartedItem || itemCollected;
            if (restartedItem) {
              successfulRestarts[restartedItem] = (successfulRestarts[restartedItem] || 0) + 1;
            }
          }
        }
      }
      
      // Now apply all station updates in one pass using map pattern (like single crafting)
      updatedResources = updatedResources.map(res => {
        const key = `${res.x}-${res.y}`;
        if (stationUpdates[key]) {
          return { ...res, ...stationUpdates[key] };
        }
        return res;
      });
      
      // Update inventory from server response if provided
      if (response.data.inventory) {
        // Update local inventory with what server says we have after spending for restarts
        setInventory(response.data.inventory.warehouse || response.data.inventory);
        setBackpack(response.data.inventory.backpack || []);
        setCurrentPlayer(prev => ({
          ...prev,
          inventory: response.data.inventory.warehouse || response.data.inventory,
          backpack: response.data.inventory.backpack || []
        }));
      }
      
      // NOW update global resources with all changes (collections + restarts) - ONLY ONCE
      // Just like single crafting does it - simple and clean
      GlobalGridStateTilesAndResources.setResources(updatedResources);
      setResources(updatedResources);
      
      // Use fresh inventory state from server response
      const currentInventory = response.data.inventory?.warehouse || inventory;
      const currentBackpack = response.data.inventory?.backpack || backpack;
      
      // Add collected items to inventory with skills applied
      for (const [collectedItem, quantity] of Object.entries(successfulCollects)) {
        await gainIngredients({
          playerId: currentPlayer.playerId,
          currentPlayer: {
            ...currentPlayer,
            inventory: currentInventory,
            backpack: currentBackpack
          },
          resource: collectedItem,
          quantity: quantity,
          inventory: currentInventory,
          backpack: currentBackpack,
          setInventory,
          setBackpack,
          setCurrentPlayer,
          updateStatus,
          masterResources,
        });
        
        // Track quest progress
        await trackQuestProgress(currentPlayer, 'Craft', collectedItem, quantity, setCurrentPlayer);
      }
      
      // Refresh player state to ensure everything is in sync
      await refreshPlayerAfterInventoryUpdate(currentPlayer.playerId, setCurrentPlayer, false);
      
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
  } catch (error) {
    console.error('🏭 Bulk crafting error:', error);
    return error.response?.data?.message || error.message || 'Bulk crafting failed';
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