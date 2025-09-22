import { deriveWarehouseAndBackpackCapacity } from '../../Utils/InventoryManagement';

/**
 * Calculate total capacity needed for bulk harvest operation
 * @param {Array} selectedTypes - Array of crop types to harvest
 * @param {Array} resources - Current grid resources
 * @param {Array} masterResources - Master resource definitions
 * @param {Object} masterSkills - Master skill definitions
 * @param {Object} currentPlayer - Current player data
 * @returns {Object} Capacity check results
 */
export async function calculateBulkHarvestCapacity(
  selectedTypes, 
  resources, 
  masterResources, 
  masterSkills, 
  currentPlayer
) {
  let totalCapacityNeeded = 0;
  const harvestDetails = [];
  
  // Get player's current inventory usage (exclude Money and Gem from capacity calculations)
  const currentWarehouseUsage = (currentPlayer.inventory || [])
    .filter(item => item.type !== 'Money' && item.type !== 'Gem')
    .reduce((sum, item) => sum + (item.quantity || 0), 0);
  const currentBackpackUsage = (currentPlayer.backpack || [])
    .filter(item => item.type !== 'Money' && item.type !== 'Gem')
    .reduce((sum, item) => sum + (item.quantity || 0), 0);
  
  // Get total capacities with skills using the existing function
  const capacities = deriveWarehouseAndBackpackCapacity(currentPlayer, masterResources);
  const warehouseCapacity = capacities.warehouse || 0;
  const backpackCapacity = capacities.backpack || 0;
  
  const totalCapacity = warehouseCapacity + backpackCapacity;
  const currentTotalUsage = currentWarehouseUsage + currentBackpackUsage;
  const availableSpace = totalCapacity - currentTotalUsage;
  
  console.log('Bulk harvest capacity check:', {
    warehouseCapacity,
    backpackCapacity,
    totalCapacity,
    currentWarehouseUsage,
    currentBackpackUsage,
    currentTotalUsage,
    availableSpace
  });
  
  // Calculate yield for each crop type
  for (const cropType of selectedTypes) {
    const crops = resources.filter(res => res.type === cropType);
    if (crops.length === 0) continue;
    
    const baseCrop = masterResources.find(r => r.type === cropType);
    if (!baseCrop) continue;
    
    // Calculate skill multipliers for this crop
    let skillMultiplier = 1;
    const playerSkills = currentPlayer.skills || [];
    
    playerSkills.forEach(skill => {
      // Check if this skill buffs this crop type
      const buffValue = masterSkills?.[skill.type]?.[cropType];
      if (buffValue && buffValue > 1) {
        skillMultiplier *= buffValue;
      }
    });
    
    const baseYield = baseCrop.qtycollected || 1;
    const yieldPerCrop = Math.floor(baseYield * skillMultiplier);
    const totalYield = crops.length * yieldPerCrop;
    
    harvestDetails.push({
      type: cropType,
      count: crops.length,
      baseYield,
      skillMultiplier,
      yieldPerCrop,
      totalYield,
      positions: crops.map(c => ({ x: c.x, y: c.y })),
      symbol: baseCrop.symbol || '🌾'
    });
    
    totalCapacityNeeded += totalYield;
  }
  
  // Calculate seeds needed for replanting
  const replantDetails = [];
  const seedsNeeded = {};
  
  for (const detail of harvestDetails) {
    // Find the farmplot that produces this crop
    const farmplot = masterResources.find(r => 
      r.category === 'farmplot' && r.output === detail.type
    );
    
    if (farmplot) {
      // Check if this farmplot requires seeds (has ingredient cost)
      for (let i = 1; i <= 4; i++) {
        const ingredientType = farmplot[`ingredient${i}`];
        const ingredientQty = farmplot[`ingredient${i}qty`];
        
        if (ingredientType && ingredientQty) {
          const totalNeeded = ingredientQty * detail.count;
          seedsNeeded[ingredientType] = (seedsNeeded[ingredientType] || 0) + totalNeeded;
        }
      }
      
      replantDetails.push({
        farmplotType: farmplot.type,
        cropType: detail.type,
        count: detail.count,
        positions: detail.positions,
        growtime: farmplot.growtime || 60
      });
    }
  }
  
  // Check if player has enough seeds
  const hasEnoughSeeds = {};
  let canReplantAll = true;
  
  Object.entries(seedsNeeded).forEach(([seedType, needed]) => {
    const inInventory = currentPlayer.inventory?.find(item => item.type === seedType)?.quantity || 0;
    const inBackpack = currentPlayer.backpack?.find(item => item.type === seedType)?.quantity || 0;
    const totalHas = inInventory + inBackpack;
    
    hasEnoughSeeds[seedType] = {
      needed,
      has: totalHas,
      enough: totalHas >= needed
    };
    
    if (totalHas < needed) {
      canReplantAll = false;
    }
  });
  
  return {
    canHarvest: availableSpace >= totalCapacityNeeded,
    totalCapacityNeeded,
    availableSpace,
    currentTotalUsage,
    totalCapacity,
    warehouseCapacity,
    backpackCapacity,
    harvestDetails,
    replantDetails,
    seedsNeeded,
    hasEnoughSeeds,
    canReplantAll
  };
}

/**
 * Build operations array for bulk harvest API call
 * @param {Object} capacityCheck - Results from calculateBulkHarvestCapacity
 * @param {Object} selectedReplantTypes - Which crops to replant
 * @returns {Array} Operations array for API
 */
export function buildBulkHarvestOperations(capacityCheck, selectedReplantTypes) {
  const operations = [];
  
  // Group by crop type for efficiency
  capacityCheck.harvestDetails.forEach(detail => {
    const shouldReplant = selectedReplantTypes[detail.type] || false;
    
    operations.push({
      cropType: detail.type,
      positions: detail.positions,
      replant: shouldReplant,
      expectedYield: detail.totalYield
    });
  });
  
  return operations;
}

/**
 * Format harvest results for display
 * @param {Object} results - Results from bulk harvest API
 * @param {Object} skillsInfo - Skills applied for each crop type
 * @param {Object} strings - Localized strings
 * @param {Function} getLocalizedString - String localization function
 * @returns {String} Formatted message
 */
export function formatBulkHarvestResults(results, skillsInfo, strings, getLocalizedString) {
  const parts = [];
  
  // Format harvested items with skill info
  if (results.harvested && Object.keys(results.harvested).length > 0) {
    const harvestParts = Object.entries(results.harvested)
      .map(([type, data]) => {
        const skillInfo = skillsInfo[type];
        if (skillInfo && skillInfo.skills.length > 0) {
          const skillsStr = skillInfo.skills.join(', ');
          return `${data.quantity} ${getLocalizedString(type, strings)} with ${skillsStr} applied (${skillInfo.multiplier}x)`;
        } else {
          return `${data.quantity} ${getLocalizedString(type, strings)}`;
        }
      })
      .join(', ');
    parts.push(`Harvest complete: ${harvestParts}`);
  }
  
  // Format replanted items
  if (results.replanted && Object.keys(results.replanted).length > 0) {
    const replantParts = Object.entries(results.replanted)
      .map(([type, data]) => `${data.count} ${getLocalizedString(type, strings)}`)
      .join(', ');
    parts.push(`${replantParts} replanted`);
  }
  
  return parts.join(' | ');
}