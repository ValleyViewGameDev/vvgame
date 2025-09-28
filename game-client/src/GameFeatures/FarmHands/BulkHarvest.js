import React, { useState } from 'react';
import axios from 'axios';
import API_BASE from '../../config';
import Modal from '../../UI/Modal';
import { calculateBulkHarvestCapacity, buildBulkHarvestOperations } from './BulkHarvestUtils';
import { calculateSkillMultiplier } from '../../Utils/InventoryManagement';
import { formatCollectionResults } from '../../UI/StatusBar/CollectionFormatters';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import { getLocalizedString } from '../../Utils/stringLookup';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import { isACrop } from '../../Utils/ResourceHelpers';
import '../../UI/SharedButtons.css';

// Component for the bulk harvest selection modal
export function BulkHarvestModal({ 
  isOpen, 
  onClose, 
  crops, 
  getFreshCrops,
  onExecute,
  showBulkReplant,
  hasRequiredSkill,
  strings 
}) {
  const [selectedCropTypes, setSelectedCropTypes] = useState({});
  const [selectedReplantTypes, setSelectedReplantTypes] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);

  // Initialize selections when modal opens
  React.useEffect(() => {
    if (isOpen && crops.length > 0) {
      // Select all crops by default
      const defaultSelection = {};
      crops.forEach(crop => {
        defaultSelection[crop.type] = true;
      });
      setSelectedCropTypes(defaultSelection);
      
      // Select replant options if available
      if (showBulkReplant) {
        const defaultReplantSelection = {};
        crops.forEach(crop => {
          if (hasRequiredSkill(crop.replantRequires)) {
            defaultReplantSelection[crop.type] = true;
          }
        });
        setSelectedReplantTypes(defaultReplantSelection);
      }
    }
  }, [isOpen, crops, showBulkReplant, hasRequiredSkill]);

  const handleToggleCrop = (cropType) => {
    setSelectedCropTypes(prev => {
      const newValue = !prev[cropType];
      // If unchecking harvest, also uncheck replant
      if (!newValue) {
        setSelectedReplantTypes(replantPrev => ({
          ...replantPrev,
          [cropType]: false
        }));
      }
      return {
        ...prev,
        [cropType]: newValue
      };
    });
  };

  const handleToggleReplant = (cropType) => {
    setSelectedReplantTypes(prev => {
      const newValue = !prev[cropType];
      // If checking replant, also check harvest
      if (newValue) {
        setSelectedCropTypes(cropPrev => ({
          ...cropPrev,
          [cropType]: true
        }));
      }
      return {
        ...prev,
        [cropType]: newValue
      };
    });
  };

  const handleExecute = async () => {
    if (isProcessing) return;
    
    setIsProcessing(true);
    try {
      // If getFreshCrops is provided, validate selections against fresh data
      if (getFreshCrops) {
        const freshCrops = await getFreshCrops();
        
        // Filter selections to only include crops that still exist
        const validCropTypes = {};
        const validReplantTypes = {};
        
        freshCrops.forEach(crop => {
          if (selectedCropTypes[crop.type]) {
            validCropTypes[crop.type] = true;
          }
          if (selectedReplantTypes[crop.type]) {
            validReplantTypes[crop.type] = true;
          }
        });
        
        onExecute(validCropTypes, validReplantTypes);
      } else {
        onExecute(selectedCropTypes, selectedReplantTypes);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={strings[315] || "Select Crops to Harvest"} size="medium">
      <div style={{ padding: '20px', fontSize: '16px' }}>
        <div style={{ marginBottom: '15px', display: 'flex', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              onClick={() => {
                const allSelected = {};
                crops.forEach(crop => {
                  allSelected[crop.type] = true;
                });
                setSelectedCropTypes(allSelected);
              }}
              style={{ padding: '5px 10px', fontSize: '12px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '3px' }}
            >
              {strings[316] || 'Select All'}
            </button>
            <button 
              onClick={() => {
                setSelectedCropTypes({});
                // When deselecting all harvest, also deselect all replant
                setSelectedReplantTypes({});
              }}
              style={{ padding: '5px 10px', fontSize: '12px', backgroundColor: '#808080', color: 'white', border: 'none', borderRadius: '3px' }}
            >
              {strings[317] || 'Deselect All'}
            </button>
          </div>
          
          {showBulkReplant && (
            <div style={{ display: 'flex', gap: '10px', marginLeft: 'auto' }}>
              <button 
                onClick={() => {
                  const allReplantSelected = {};
                  const allHarvestSelected = {};
                  crops.forEach(crop => {
                    if (hasRequiredSkill(crop.replantRequires)) {
                      allReplantSelected[crop.type] = true;
                      // When selecting replant, also select harvest
                      allHarvestSelected[crop.type] = true;
                    } else {
                      // Keep existing harvest selection for crops that can't be replanted
                      allHarvestSelected[crop.type] = selectedCropTypes[crop.type] || false;
                    }
                  });
                  setSelectedReplantTypes(allReplantSelected);
                  setSelectedCropTypes(prev => ({
                    ...prev,
                    ...allHarvestSelected
                  }));
                }}
                style={{ padding: '5px 10px', fontSize: '12px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '3px' }}
              >
                {strings[316] || 'Select All'}
              </button>
              <button 
                onClick={() => setSelectedReplantTypes({})}
                style={{ padding: '5px 10px', fontSize: '12px', backgroundColor: '#808080', color: 'white', border: 'none', borderRadius: '3px' }}
              >
                {strings[317] || 'Deselect All'}
              </button>
            </div>
          )}
        </div>
        
        {showBulkReplant && (
          <div style={{ display: 'flex', marginBottom: '10px', fontSize: '14px', fontWeight: 'bold' }}>
            <div style={{ width: '30px', paddingLeft: '5px' }}>{strings[342] || 'Harvest?'}</div>
            <div style={{ flex: 1 }}></div>
            <div style={{ width: '120px', textAlign: 'center' }}>{strings[343] || 'Replant?'}</div>
          </div>
        )}
        
        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          {crops.map(crop => {
            const canReplant = hasRequiredSkill(crop.replantRequires);
            return (
              <div key={crop.type} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', padding: '5px', borderBottom: '1px solid #eee' }}>
                <div style={{ width: '30px' }}>
                  <input
                    type="checkbox"
                    checked={selectedCropTypes[crop.type] || false}
                    onChange={() => handleToggleCrop(crop.type)}
                    style={{ width: '20px' }}
                  />
                </div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  {crop.symbol} {getLocalizedString(crop.type, strings)} ({crop.count})
                </div>
                {showBulkReplant && (() => {
                  return (
                    <div style={{ marginLeft: '60px', width: '80px', display: 'flex', justifyContent: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selectedReplantTypes[crop.type] || false}
                        onChange={() => canReplant && handleToggleReplant(crop.type)}
                        disabled={!canReplant}
                        style={{ 
                          width: '20px',
                          opacity: canReplant ? 1 : 0.5,
                          cursor: canReplant ? 'pointer' : 'not-allowed'
                        }}
                        title={canReplant ? '' : `Requires ${crop.replantRequires || 'unknown skill'} to replant ${crop.type}`}
                      />
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button 
            onClick={handleExecute}
            style={{ 
              padding: '10px 20px', 
              backgroundColor: isProcessing ? '#808080' : '#4CAF50', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px',
              cursor: isProcessing ? 'not-allowed' : 'pointer'
            }}
            disabled={isProcessing || Object.values(selectedCropTypes).every(selected => !selected)}
          >
            {isProcessing ? 'Processing...' : (strings[318] || 'Harvest Selected')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Main function to execute bulk harvest
export async function executeBulkHarvest({
  selectedCropTypes,
  selectedReplantTypes,
  resources,
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
  refreshPlayerAfterInventoryUpdate
}) {
  // Get selected crop types
  const selectedTypes = Object.keys(selectedCropTypes).filter(type => selectedCropTypes[type]);
  
  if (selectedTypes.length === 0) {
    return strings[449] || 'No crops selected for harvest.';
  }
  
  // Sync FarmState before proceeding to ensure client/server consistency
  const farmState = await import('../../FarmState').then(m => m.default);
  
  await farmState.forceProcessPendingSeeds({ gridId, setResources, masterResources });
  
  // Get fresh resources after initial sync
  const GlobalGridStateTilesAndResources = await import('../../GridState/GlobalGridStateTilesAndResources').then(m => m.default);
  let currentResources = GlobalGridStateTilesAndResources.getResources();
  
  // Find all farmplots that might still be converting to crops
  const pendingFarmplots = currentResources.filter(res => {
    if (res.category === 'farmplot' && res.growEnd) {
      const now = Date.now();
      return res.growEnd <= now; // Should have converted but might not be synced yet
    }
    return false;
  });
  
  if (pendingFarmplots.length > 0) {
    // Wait up to 5 seconds for conversions to complete
    let attempts = 0;
    const maxAttempts = 50;
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
      
      // Get fresh resources
      currentResources = GlobalGridStateTilesAndResources.getResources();
      
      // Check if all pending farmplots have been converted
      const stillPending = pendingFarmplots.filter(farmplot => {
        const resourceAtPosition = currentResources.find(res => 
          res.x === farmplot.x && res.y === farmplot.y
        );
        
        if (!resourceAtPosition) return false;
        
        if (resourceAtPosition.category === 'farmplot' && resourceAtPosition.growEnd) {
          return true; // Still a farmplot waiting to convert
        }
        
        return false;
      });
      
      if (stillPending.length === 0) {
        break;
      }
    }
    
    if (attempts === maxAttempts) {
      // One more force sync attempt
      await farmState.forceProcessPendingSeeds({ gridId, setResources, masterResources });
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  // Final sync to catch any last-minute conversions
  await farmState.forceProcessPendingSeeds({ gridId, setResources, masterResources });
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Final resource fetch
  const freshResources = GlobalGridStateTilesAndResources.getResources();
  

  // First, calculate capacity to check if we can harvest
  const capacityCheck = await calculateBulkHarvestCapacity(
    selectedTypes,
    freshResources,  // Use the fresh resources we just validated
    masterResources,
    masterSkills,
    currentPlayer
  );
  

  // Check if we have enough space
  if (!capacityCheck.canHarvest) {
    const spaceNeeded = capacityCheck.totalCapacityNeeded;
    const spaceAvailable = capacityCheck.availableSpace;
    return `${strings[447] || 'Not enough space'}: ${spaceNeeded} needed, ${spaceAvailable} available`;
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
  try {
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
    if (response.data.inventory) {
      setInventory(response.data.inventory.warehouse || []);
      setBackpack(response.data.inventory.backpack || []);
      
      // Update player state with new inventory
      setCurrentPlayer(prev => ({
        ...prev,
        inventory: response.data.inventory.warehouse || [],
        backpack: response.data.inventory.backpack || []
      }));
    }

    // Remove harvested resources from local state
    const harvestedPositions = new Set();
    if (results.harvested) {
      Object.values(results.harvested).forEach(data => {
        if (data && data.positions && Array.isArray(data.positions)) {
          data.positions.forEach(pos => harvestedPositions.add(`${pos.x},${pos.y}`));
        }
      });
    }
    
    
    const updatedResources = freshResources.filter(res => 
      !harvestedPositions.has(`${res.x},${res.y}`)
    );
    
    // Add replanted resources
    if (results.replanted) {
      Object.entries(results.replanted).forEach(([cropType, data]) => {
        
        // Find the farmplot that produces this crop
        const farmplot = masterResources.find(r => 
          r.category === 'farmplot' && r.output === cropType
        );
        
        if (farmplot && data.positions && Array.isArray(data.positions)) {
          data.positions.forEach((pos, index) => {
            // Calculate growEnd from current time + growtime
            // The server gives us growtime in seconds, but we need milliseconds
            const growTimeMs = (data.growtime || farmplot.growtime || 300) * 1000;
            const growEnd = Date.now() + growTimeMs;
            
            
            // Create the farmplot resource with all necessary properties
            updatedResources.push({
              ...farmplot, // Include all properties from the farmplot template
              x: pos.x,
              y: pos.y,
              type: farmplot.type, // This will be "Wheat Plot", not "Wheat"
              growEnd: growEnd,
              stage: 1,
              category: 'farmplot', // Ensure category is set
              output: farmplot.output // Ensure output is set for crop conversion
            });
          });
        }
      });
    }
    
    GlobalGridStateTilesAndResources.setResources(updatedResources);
    setResources(updatedResources);
    
    // Re-initialize FarmState with the updated resources
    farmState.initializeFarmState(updatedResources);

    // Calculate which skills were applied for each harvested type using shared utility
    const harvestSkillsInfo = {};
    if (results.harvested && typeof results.harvested === 'object') {
      Object.entries(results.harvested).forEach(([cropType, data]) => {
        if (data) {
          const skillInfo = calculateSkillMultiplier(cropType, currentPlayer.skills || [], masterSkills);
          if (skillInfo.hasSkills) {
            harvestSkillsInfo[cropType] = skillInfo;
          }
        }
      });
    }
    
    // Transform harvest results to simple format for shared formatter
    const harvestResults = {};
    if (results.harvested && typeof results.harvested === 'object') {
      Object.entries(results.harvested).forEach(([type, data]) => {
        if (data && typeof data.quantity !== 'undefined') {
          harvestResults[type] = data.quantity;
        }
      });
    }
    
    
    // Transform replant info
    const replantInfo = {};
    if (results.replanted) {
      Object.entries(results.replanted).forEach(([type, data]) => {
        replantInfo[type] = data.count;
      });
    }
    
    // Return success message using shared formatter
    const statusMessage = formatCollectionResults('harvest', harvestResults, harvestSkillsInfo, replantInfo, strings, getLocalizedString);

    // Track quest progress for harvested items
    if (results.harvested && typeof results.harvested === 'object') {
      Object.entries(results.harvested).forEach(([type, data]) => {
        if (data && data.quantity) {
          trackQuestProgress({
            questProgressCategory: 'collect',
            itemName: type,
            quantity: data.quantity,
            currentPlayer,
            setCurrentPlayer,
            masterResources
          });
        }
      });
    }

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
    
    return statusMessage;
  } else {
    return strings[448] || 'Bulk harvest failed';
  }
  } catch (error) {
    console.error('🌾 Bulk harvest error:', error);
    return error.response?.data?.message || error.message || 'Bulk harvest failed';
  }
}

// Function to prepare crops for the modal
export function prepareBulkHarvestData(resources, masterResources) {
  // Group crops by type
  const cropCounts = {};
  
  const readyCrops = resources.filter(res => {
    // Check if this resource is a crop
    const isCrop = isACrop(res.type, masterResources);
    
    
    return isCrop;
  });

  readyCrops.forEach((crop) => {
    if (!cropCounts[crop.type]) {
      const baseCrop = masterResources.find(r => r.type === crop.type);
      const farmplot = masterResources.find(r => 
        r.category === 'farmplot' && r.output === crop.type
      );
      cropCounts[crop.type] = {
        count: 0,
        symbol: baseCrop?.symbol || '🌾',
        replantRequires: farmplot?.requires
      };
    }
    cropCounts[crop.type].count++;
  });

  // Convert to array format
  const result = Object.entries(cropCounts).map(([type, data]) => ({
    type,
    count: data.count,
    symbol: data.symbol,
    replantRequires: data.replantRequires
  }));
  
  return result;
}