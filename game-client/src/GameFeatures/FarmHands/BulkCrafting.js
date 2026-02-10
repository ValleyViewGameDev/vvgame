import React, { useState } from 'react';
import axios from 'axios';
import API_BASE from '../../config';
import Modal from '../../UI/Modals/Modal';
import { canAfford, spendIngredients, gainIngredients, calculateSkillMultiplier } from '../../Utils/InventoryManagement';
import { formatCollectionResults, formatRestartResults } from '../../UI/StatusBar/CollectionFormatters';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import { getLocalizedString } from '../../Utils/stringLookup';
import { refreshPlayerAfterInventoryUpdate } from '../../Utils/InventoryManagement';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import '../../UI/Buttons/SharedButtons.css';

// Component for the bulk crafting selection modal
// NEW: stationGroups is now an array of stations, each with readySlots[] inside
export function BulkCraftingModal({
  isOpen,
  onClose,
  stationGroups,  // Array of { x, y, stationType, stationSymbol, readySlots: [...] }
  onExecute,
  hasBulkRestartCraft,
  strings,
  masterResources,
  inventory,
  backpack
}) {
  // Per-slot selection: key = "x-y-slotIndex", value = { collect: boolean, restart: boolean }
  const [selectedSlots, setSelectedSlots] = useState({});

  // Initialize selections when modal opens
  React.useEffect(() => {
    if (isOpen && stationGroups.length > 0) {
      const defaultSelections = {};
      stationGroups.forEach(station => {
        station.readySlots.forEach(slot => {
          const slotKey = `${station.x}-${station.y}-${slot.slotIndex}`;
          defaultSelections[slotKey] = {
            collect: true,  // All slots selected for collection by default
            restart: hasBulkRestartCraft && slot.affordable  // Auto-check restart if affordable
          };
        });
      });
      setSelectedSlots(defaultSelections);
    }
  }, [isOpen, stationGroups, hasBulkRestartCraft]);

  const handleToggleCollect = (slotKey) => {
    setSelectedSlots(prev => {
      const current = prev[slotKey] || { collect: false, restart: false };
      const newCollect = !current.collect;
      return {
        ...prev,
        [slotKey]: {
          collect: newCollect,
          restart: newCollect ? current.restart : false  // Uncheck restart if unchecking collect
        }
      };
    });
  };

  const handleToggleRestart = (slotKey) => {
    setSelectedSlots(prev => {
      const current = prev[slotKey] || { collect: false, restart: false };
      const newRestart = !current.restart;
      return {
        ...prev,
        [slotKey]: {
          collect: newRestart ? true : current.collect,  // Auto-check collect if checking restart
          restart: newRestart
        }
      };
    });
  };

  const handleExecute = () => {
    onExecute(stationGroups, selectedSlots);
  };

  if (!isOpen) return null;

  // Calculate ingredient needs for a single slot's recipe
  const calculateSlotNeeds = (slot) => {
    if (!slot.recipe) return null;
    const needs = {};
    for (let i = 1; i <= 4; i++) {
      const ingredientType = slot.recipe[`ingredient${i}`];
      const ingredientQty = slot.recipe[`ingredient${i}qty`];
      if (ingredientType && ingredientQty) {
        const inventoryQty = inventory?.find(item => item.type === ingredientType)?.quantity || 0;
        const backpackQty = backpack?.find(item => item.type === ingredientType)?.quantity || 0;
        const totalAvailable = inventoryQty + backpackQty;
        needs[ingredientType] = {
          needed: ingredientQty,
          available: totalAvailable,
          symbol: masterResources.find(r => r.type === ingredientType)?.symbol || ''
        };
      }
    }
    return Object.keys(needs).length > 0 ? needs : null;
  };

  const selectAllCollect = () => {
    setSelectedSlots(prev => {
      const updated = { ...prev };
      stationGroups.forEach(station => {
        station.readySlots.forEach(slot => {
          const slotKey = `${station.x}-${station.y}-${slot.slotIndex}`;
          updated[slotKey] = { ...updated[slotKey], collect: true };
        });
      });
      return updated;
    });
  };

  const selectNoneCollect = () => {
    setSelectedSlots(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(key => {
        updated[key] = { collect: false, restart: false };
      });
      return updated;
    });
  };

  const selectAllRestarts = () => {
    setSelectedSlots(prev => {
      const updated = { ...prev };
      stationGroups.forEach(station => {
        station.readySlots.forEach(slot => {
          if (slot.affordable) {
            const slotKey = `${station.x}-${station.y}-${slot.slotIndex}`;
            updated[slotKey] = { collect: true, restart: true };
          }
        });
      });
      return updated;
    });
  };

  const selectNoneRestarts = () => {
    setSelectedSlots(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(key => {
        updated[key] = { ...updated[key], restart: false };
      });
      return updated;
    });
  };

  // Count selected slots for the Collect button
  const selectedCount = Object.values(selectedSlots).filter(s => s.collect).length;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={strings[1109] || "Bulk Crafting"} size="large">
      <div style={{ padding: '20px', fontSize: '16px' }}>
        <div style={{ marginBottom: '15px', display: 'flex', gap: '10px' }}>
          <div className="shared-buttons" style={{ display: 'flex', gap: '10px' }}>
            <button
              className="btn-basic btn-success btn-modal-small"
              onClick={selectAllCollect}
            >
              {strings[316] || 'Select All'}
            </button>
            <button
              className="btn-basic btn-neutral btn-modal-small"
              onClick={selectNoneCollect}
            >
              {strings[317] || 'Deselect All'}
            </button>
          </div>

          {hasBulkRestartCraft && (
            <div className="shared-buttons" style={{ display: 'flex', gap: '10px', marginLeft: 'auto', marginRight: '20px' }}>
              <button
                className="btn-basic btn-success btn-modal-small"
                onClick={selectAllRestarts}
              >
                {strings[316] || 'Select All'}
              </button>
              <button
                className="btn-basic btn-neutral btn-modal-small"
                onClick={selectNoneRestarts}
              >
                {strings[317] || 'Deselect All'}
              </button>
            </div>
          )}
        </div>

        {/* Header row */}
        <div style={{ display: 'flex', marginBottom: '10px', fontSize: '14px', fontWeight: 'bold' }}>
          <div style={{ width: '50px', textAlign: 'center' }}>{strings[346] || 'Collect'}</div>
          <div style={{ width: '180px', textAlign: 'left', paddingLeft: '10px' }}>{strings[476] || 'Station'}</div>
          <div style={{ flex: 1, textAlign: 'left' }}>{strings[161] || 'Item'}</div>
          {hasBulkRestartCraft && (
            <div style={{ width: '60px', textAlign: 'center' }}>{strings[475] || 'Restart'}</div>
          )}
          <div style={{ width: '150px', textAlign: 'center' }}>{strings[177] || 'Cost'}</div>
        </div>

        {/* Station list with slot rows */}
        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          {stationGroups.map((station) => {
            const stationKey = `${station.x}-${station.y}`;
            return (
              <div key={stationKey} style={{ marginBottom: '8px', borderBottom: '1px solid #eee' }}>
                {/* Each ready slot gets its own row */}
                {station.readySlots.map((slot, slotIdx) => {
                  const slotKey = `${station.x}-${station.y}-${slot.slotIndex}`;
                  const selection = selectedSlots[slotKey] || { collect: false, restart: false };
                  const needs = calculateSlotNeeds(slot);

                  return (
                    <div
                      key={slotKey}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '4px 5px',
                        backgroundColor: slotIdx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)'
                      }}
                    >
                      {/* Collect checkbox */}
                      <div style={{ width: '50px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={selection.collect}
                          onChange={() => handleToggleCollect(slotKey)}
                          style={{ width: '18px', height: '18px' }}
                        />
                      </div>

                      {/* Station name (only show on first slot row) */}
                      <div style={{ width: '180px', textAlign: 'left', fontWeight: 'bold', paddingLeft: '10px' }}>
                        {slotIdx === 0 ? (
                          <>
                            {station.stationSymbol} {getLocalizedString(station.stationType, strings)}
                            {station.readySlots.length > 1 && (
                              <span style={{ fontSize: '11px', color: '#666', marginLeft: '4px' }}>
                                ({station.readySlots.length} slots)
                              </span>
                            )}
                          </>
                        ) : (
                          <span style={{ color: '#999', fontSize: '12px', paddingLeft: '20px' }}>└ slot {slot.slotIndex + 1}</span>
                        )}
                      </div>

                      {/* Crafted item */}
                      <div style={{ flex: 1, textAlign: 'left' }}>
                        {slot.craftedSymbol} {getLocalizedString(slot.craftedItem, strings)}
                      </div>

                      {/* Restart checkbox */}
                      {hasBulkRestartCraft && (
                        <div style={{ width: '60px', textAlign: 'center' }}>
                          {slot.canRestart ? (
                            <input
                              type="checkbox"
                              checked={selection.restart}
                              onChange={() => slot.affordable && handleToggleRestart(slotKey)}
                              disabled={!slot.affordable}
                              style={{
                                width: '18px',
                                height: '18px',
                                opacity: slot.affordable ? 1 : 0.4,
                                cursor: slot.affordable ? 'pointer' : 'not-allowed'
                              }}
                              title={slot.affordable ? '' : (strings[347] || 'Not enough resources')}
                            />
                          ) : (
                            <span style={{ fontSize: '10px', color: '#999' }}>{strings[346] || 'Locked'}</span>
                          )}
                        </div>
                      )}

                      {/* Cost/Needs column */}
                      <div style={{ width: '150px', textAlign: 'center', fontSize: '11px' }}>
                        {needs && Object.entries(needs).map(([type, data], idx) => {
                          const hasEnough = data.available >= data.needed;
                          return (
                            <span key={idx} style={{ color: hasEnough ? 'green' : 'red', marginRight: '6px' }}>
                              {data.symbol}{data.needed}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="shared-buttons" style={{ display: 'flex', justifyContent: 'center', marginTop: '15px' }}>
          <button
            className="btn-basic btn-success btn-modal"
            onClick={handleExecute}
            disabled={selectedCount === 0}
          >
            {strings[318] || 'Collect'} ({selectedCount})
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Main function to execute bulk crafting collection
// NEW: stationGroups is array of stations with readySlots[], selectedSlots is { "x-y-slotIndex": { collect, restart } }
export async function executeBulkCrafting({
  stationGroups,        // NEW: array of stations, each with readySlots[]
  selectedSlots,        // NEW: { "x-y-slotIndex": { collect: boolean, restart: boolean } }
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
}) {
  // Flatten stations and filter to only slots selected for collection
  const slotsToCollect = [];
  stationGroups.forEach(station => {
    station.readySlots.forEach(slot => {
      const slotKey = `${station.x}-${station.y}-${slot.slotIndex}`;
      const selection = selectedSlots[slotKey];
      if (selection?.collect) {
        slotsToCollect.push({
          x: station.x,
          y: station.y,
          stationType: station.stationType,
          slotIndex: slot.slotIndex,
          craftedItem: slot.craftedItem,
          recipe: slot.recipe,
          shouldRestart: hasBulkRestartCraft && selection.restart && slot.recipe
        });
      }
    });
  });

  if (slotsToCollect.length === 0) {
    return 'No crafting stations selected for collection.';
  }

  // Prepare batch data for all slots
  const batchStations = slotsToCollect.map(slot => ({
    x: slot.x,
    y: slot.y,
    type: slot.stationType,
    craftedItem: slot.craftedItem,
    slotIndex: slot.slotIndex,
    transactionId: `bulk-craft-collect-${Date.now()}-${Math.random()}`,
    shouldRestart: slot.shouldRestart,
    restartRecipe: slot.shouldRestart ? slot.recipe : null
  }));
  
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
      
      // Process each result and build a map of station slot updates
      // Key: "x-y", Value: { slots: [...updated slots array] }
      const stationUpdates = {};

      for (const result of results) {
        if (result.collected || result.success) {
          const { station, collectedItem, craftedItem, isNPC, slotIndex, slots } = result;
          const itemCollected = collectedItem || craftedItem;
          const key = `${station.x}-${station.y}`;

          // Use the slots array returned by the server if available
          if (slots) {
            stationUpdates[key] = { slots };
          } else {
            // Fallback: manually update the specific slot
            const targetSlotIndex = slotIndex ?? station.slotIndex ?? 0;
            if (!stationUpdates[key]) {
              // Find the current resource to get existing slots
              const currentRes = updatedResources.find(r => r.x === station.x && r.y === station.y);
              stationUpdates[key] = { slots: currentRes?.slots ? [...currentRes.slots] : [] };
            }
            // Ensure the slots array is long enough
            while (stationUpdates[key].slots.length <= targetSlotIndex) {
              stationUpdates[key].slots.push({ craftEnd: null, craftedItem: null, qty: 1 });
            }
            // Update the specific slot
            if (result.restarted && result.newCraftEnd) {
              stationUpdates[key].slots[targetSlotIndex] = {
                craftEnd: result.newCraftEnd,
                craftedItem: result.newCraftedItem || itemCollected,
                qty: 1
              };
            } else {
              stationUpdates[key].slots[targetSlotIndex] = {
                craftEnd: null,
                craftedItem: null,
                qty: 1
              };
            }
          }

          // Calculate skill info
          const stationType = station.stationType || station.type;
          const playerBuffs = (currentPlayer.skills || [])
            .filter((item) => {
              const resourceDetails = masterResources.find((res) => res.type === item.type);
              const isSkill = resourceDetails?.category === 'skill';
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
          globalTuning,
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

        // Return results object for modal display
        return {
          success: true,
          collectResults: successfulCollects,
          restartInfo: successfulRestarts,
          craftSkillsInfo: appliedSkillsInfo,
          statusMessage: parts.join(' | ')
        };
      } else if (totalProcessed > 0) {
        // Items were processed but maybe all were NPCs
        return {
          success: true,
          collectResults: {},
          restartInfo: {},
          craftSkillsInfo: {},
          statusMessage: `Collected from ${totalProcessed} crafting station${totalProcessed > 1 ? 's' : ''}.`
        };
      } else {
        return { success: false, error: 'Failed to collect any crafted items.' };
      }
    } else {
      return { success: false, error: 'Failed to collect crafted items.' };
    }
  } catch (error) {
    console.error('🏭 Bulk crafting error:', error);
    return { success: false, error: error.response?.data?.message || error.message || 'Bulk crafting failed' };
  }
}

// Function to prepare crafting station data for the modal
// NEW STRUCTURE: Groups by station position, with ready slots listed within each station
export function prepareBulkCraftingData(masterResources, inventory, backpack, currentPlayer, hasRequiredSkill) {
  const now = Date.now();
  const resources = GlobalGridStateTilesAndResources.getResources() || [];

  // Clone inventory for affordability simulation (we simulate spending as we go)
  const simInventory = inventory ? inventory.map(i => ({ ...i })) : [];
  const simBackpack = backpack ? backpack.map(i => ({ ...i })) : [];

  // Helper to simulate spending ingredients
  const simulateSpend = (recipe) => {
    for (let j = 1; j <= 4; j++) {
      const ingType = recipe[`ingredient${j}`];
      const ingQty = recipe[`ingredient${j}qty`];
      if (ingType && ingQty) {
        let remaining = ingQty;
        const simInvItem = simInventory.find(x => x.type === ingType);
        if (simInvItem) {
          const take = Math.min(simInvItem.quantity, remaining);
          simInvItem.quantity -= take;
          remaining -= take;
        }
        if (remaining > 0) {
          const simBpItem = simBackpack.find(x => x.type === ingType);
          if (simBpItem) {
            simBpItem.quantity -= Math.min(simBpItem.quantity, remaining);
          }
        }
      }
    }
  };

  // Build list of stations with ready slots
  const stationsWithReadySlots = [];

  resources.forEach(res => {
    const stationDef = masterResources.find(r => r.type === res.type);
    if (!stationDef || stationDef.category !== 'crafting') return;

    const readySlots = [];

    // Check slots array first (new format)
    if (res.slots && res.slots.length > 0) {
      res.slots.forEach((slot, slotIndex) => {
        if (slot && slot.craftEnd && slot.craftEnd <= now && slot.craftedItem) {
          // Find the recipe for this slot's crafted item
          const recipe = masterResources.find(r =>
            r.source === res.type && r.type === slot.craftedItem
          );
          const craftedResource = masterResources.find(r => r.type === slot.craftedItem);
          const canRestart = !!recipe && hasRequiredSkill(recipe?.requires);

          // Check affordability (simulate sequential spending)
          let affordable = false;
          if (canRestart && recipe && canAfford(recipe, simInventory, simBackpack, 1)) {
            affordable = true;
            simulateSpend(recipe); // Deduct from simulation
          }

          readySlots.push({
            slotIndex,
            craftedItem: slot.craftedItem,
            craftedSymbol: craftedResource?.symbol || '📦',
            craftEnd: slot.craftEnd,
            qty: slot.qty || 1,
            recipe,
            canRestart,
            affordable
          });
        }
      });
    }
    // Fallback: legacy format (craftEnd/craftedItem on station itself)
    else if (res.craftEnd && res.craftEnd <= now && res.craftedItem) {
      const recipe = masterResources.find(r =>
        r.source === res.type && r.type === res.craftedItem
      );
      const craftedResource = masterResources.find(r => r.type === res.craftedItem);
      const canRestart = !!recipe && hasRequiredSkill(recipe?.requires);

      let affordable = false;
      if (canRestart && recipe && canAfford(recipe, simInventory, simBackpack, 1)) {
        affordable = true;
        simulateSpend(recipe);
      }

      readySlots.push({
        slotIndex: 0,
        craftedItem: res.craftedItem,
        craftedSymbol: craftedResource?.symbol || '📦',
        craftEnd: res.craftEnd,
        qty: res.qty || 1,
        recipe,
        canRestart,
        affordable
      });
    }

    // Only include stations with at least one ready slot
    if (readySlots.length > 0) {
      const stationResource = masterResources.find(r => r.type === res.type);
      stationsWithReadySlots.push({
        x: res.x,
        y: res.y,
        stationType: res.type,
        stationSymbol: stationResource?.symbol || '🏭',
        readySlots: readySlots,
        // Station-level: has at least one affordable restart
        hasAffordableRestart: readySlots.some(s => s.affordable)
      });
    }
  });

  // Sort by station type, then by position
  stationsWithReadySlots.sort((a, b) => {
    const typeCompare = a.stationType.localeCompare(b.stationType);
    if (typeCompare !== 0) return typeCompare;
    if (a.x !== b.x) return a.x - b.x;
    return a.y - b.y;
  });

  return stationsWithReadySlots;
}