/**
 * Warehouse materials and ingredient drop utilities
 */

// Import isACrop from ResourceHelpers since it's a general utility
import { isACrop } from './ResourceHelpers';

/**
 * Determine which third of players a player belongs to based on their ID
 * Used for asymmetric rarity distribution
 * @param {string} playerId - The player's unique ID
 * @returns {number} 0, 1, or 2 (splits players into thirds)
 */
export function getPlayerRarityGroup(playerId) {
  // Simple hash: sum all character codes
  let hash = 0;
  for (let i = 0; i < playerId.length; i++) {
    hash += playerId.charCodeAt(i);
  }
  // Return 0, 1, or 2 (splits players into thirds)
  return hash % 3;
}

/**
 * Map warehouse ingredient rarity based on player's deterministic group
 * Each third of players gets a different rarity distribution
 * @param {string} itemType - The warehouse ingredient type (Saw, Shovel, Screwdriver)
 * @param {string} playerId - The player's unique ID
 * @returns {string} 'common', 'uncommon', or 'rare'
 */
export function getPersonalizedWarehouseRarity(itemType, playerId) {
  const rarityGroup = getPlayerRarityGroup(playerId);
  
  // Define rotation pattern for the three warehouse ingredients
  // Each row represents what a player group experiences
  const rarityRotation = {
    'Saw': ['common', 'uncommon', 'rare'],        // Group 0: common, Group 1: uncommon, Group 2: rare
    'Shovel': ['uncommon', 'rare', 'common'],      // Group 0: uncommon, Group 1: rare, Group 2: common
    'Screwdriver': ['rare', 'common', 'uncommon']  // Group 0: rare, Group 1: common, Group 2: uncommon
  };
  
  // Return the rarity for this item based on player's group
  return rarityRotation[itemType]?.[rarityGroup] || 'common';
}


/**
 * Checks for and processes warehouse ingredient drops when collecting crops
 * Uses globalTuning.harvestDropRate to determine if a drop occurs (e.g., 0.1 = 10% chance)
 * Then uses resource.scrollchance to determine which warehouse ingredient to drop
 * @param {string} collectedItemType - The type of item that was collected
 * @param {number} col - Column position for floating text
 * @param {number} row - Row position for floating text
 * @param {number} TILE_SIZE - Tile size for positioning
 * @param {Object} params - Object containing required parameters
 * @param {Object} params.currentPlayer - Current player object
 * @param {Array} params.inventory - Current inventory
 * @param {Array} params.backpack - Current backpack
 * @param {Function} params.setInventory - Inventory setter
 * @param {Function} params.setBackpack - Backpack setter
 * @param {Function} params.setCurrentPlayer - Player setter
 * @param {Function} params.updateStatus - Status update function
 * @param {Array} params.masterResources - Master resources array with warehouse ingredients (requires: "Warehouse")
 * @param {Object} params.globalTuning - Global tuning configuration with harvestDropRate
 * @param {Object} params.strings - Localized strings
 * @param {Function} params.FloatingTextManager - Floating text manager
 * @param {Function} params.gainIngredients - Gain ingredients function
 * @param {Function} params.trackQuestProgress - Quest progress tracking function
 * @param {Function} params.getLocalizedString - String localization function
 * @param {Function} params.selectWeightedRandomItem - Weighted random selection function
 * @param {Function} params.getDropQuantity - Drop quantity calculation function
 * @returns {Promise<{dropped: boolean, item?: string, quantity?: number}>} Result of the drop attempt
 */
export async function checkAndDropWarehouseIngredient(
  collectedItemType,
  col,
  row,
  TILE_SIZE,
  {
    currentPlayer,
    inventory,
    backpack,
    setInventory,
    setBackpack,
    setCurrentPlayer,
    updateStatus,
    masterResources,
    globalTuning,
    strings,
    FloatingTextManager,
    gainIngredients,
    trackQuestProgress,
    getLocalizedString,
    selectWeightedRandomItem,
  }
) {
  // Check if this is a crop (excluding Wheat to prevent exploit)
  if (!isACrop(collectedItemType, masterResources) || collectedItemType === 'Wheat') {
    return { dropped: false };
  }
  
  console.log(`<> Collected crop: ${collectedItemType}, checking for warehouse ingredient drops...`);
  
  // Check if we should drop based on harvestDropRate from globalTuning
  const dropRate = globalTuning?.harvestDropRate || 0.1; // Default to 10% if not configured
  const roll = Math.random();
  
  if (roll > dropRate) {
    console.log(`<� Drop roll failed: ${roll.toFixed(3)} > ${dropRate} (${(dropRate * 100).toFixed(0)}% chance)`);
    return { dropped: false };
  }
  
  console.log(`<� Drop roll succeeded: ${roll.toFixed(3)} <= ${dropRate} (${(dropRate * 100).toFixed(0)}% chance)`);
  
  // Get all warehouse ingredients from masterResources
  const warehouseIngredients = masterResources.filter(res => res.requires === 'Warehouse' && res.scrollchance);
  
  if (warehouseIngredients.length === 0) {
    console.warn('� No warehouse ingredients found in masterResources');
    return { dropped: false };
  }
  
  // Apply personalized rarity to warehouse ingredients
  const personalizedIngredients = warehouseIngredients.map(ingredient => ({
    ...ingredient,
    scrollchance: getPersonalizedWarehouseRarity(ingredient.type, currentPlayer.playerId)
  }));
  
  // Use weighted random selection based on personalized rarity
  const selectedIngredient = selectWeightedRandomItem(personalizedIngredients, 1);
  
  if (!selectedIngredient) {
    return { dropped: false };
  }
  
  // Warehouse ingredients always drop exactly 1, regardless of rarity
  const dropQty = 1;
  
  console.log(`<� Warehouse ingredient drop: ${selectedIngredient.type} x${dropQty} (${selectedIngredient.scrollchance})`);
  
  // Show bonus floating text with offset to avoid overlap with main doober text
  const symbol = selectedIngredient.symbol || '';
  FloatingTextManager.addFloatingText(
    `${symbol} +${dropQty} ${getLocalizedString(selectedIngredient.type, strings)}`, 
    col, 
    row - (30 / TILE_SIZE), // Offset up (converted to tile units)
    TILE_SIZE
  );
  
  // Add the warehouse ingredient to inventory
  const bonusGained = await gainIngredients({
    playerId: currentPlayer.playerId,
    currentPlayer,
    resource: selectedIngredient.type,
    quantity: dropQty,
    inventory,
    backpack,
    setInventory,
    setBackpack,
    setCurrentPlayer,
    updateStatus,
    masterResources,
    globalTuning,
  });
  
  if (!bonusGained) {
    console.warn('L Failed to add bonus warehouse ingredient to inventory - may be full');
    // Don't show error to user - this is a bonus drop
    return { dropped: true, item: selectedIngredient.type, quantity: dropQty, added: false };
  }
  
  // Track quest progress for the bonus item
  await trackQuestProgress(currentPlayer, 'Collect', selectedIngredient.type, dropQty, setCurrentPlayer);
  
  return { dropped: true, item: selectedIngredient.type, quantity: dropQty, added: true };
}

/**
 * Calculate warehouse ingredient drops for bulk harvest operations
 * Calculates drops per farm plot harvested, ignoring skill multipliers
 * @param {number} numPlotsHarvested - Number of farm plots that were harvested
 * @param {Object} params - Object containing required parameters
 * @param {Array} params.masterResources - Master resources array with warehouse ingredients
 * @param {Object} params.globalTuning - Global tuning configuration with harvestDropRate
 * @param {Function} params.selectWeightedRandomItem - Weighted random selection function
 * @param {string} params.playerId - Player ID for personalized rarity calculation
 * @returns {Array} Array of warehouse ingredient drops: [{type, quantity, symbol}]
 */
export function calculateBulkWarehouseDrops(numPlotsHarvested, {
  masterResources,
  globalTuning,
  selectWeightedRandomItem,
  playerId
}) {
  const warehouseDrops = [];
  
  // Get all warehouse ingredients from masterResources
  const warehouseIngredients = masterResources.filter(res => res.requires === 'Warehouse' && res.scrollchance);
  
  if (warehouseIngredients.length === 0) {
    console.warn('� No warehouse ingredients found in masterResources');
    return warehouseDrops;
  }
  
  // Apply personalized rarity to warehouse ingredients
  const personalizedIngredients = warehouseIngredients.map(ingredient => ({
    ...ingredient,
    scrollchance: getPersonalizedWarehouseRarity(ingredient.type, playerId)
  })); 
  
  // Get drop rate from globalTuning
  const dropRate = globalTuning?.harvestDropRate || 0.1; // Default to 10%
  
  console.log(`<🎲 Bulk warehouse calculation: globalTuning.harvestDropRate = ${globalTuning?.harvestDropRate}, resolved dropRate = ${dropRate}`);
  
  // Roll for drops once per farm plot harvested (ignoring skill multipliers)
  for (let i = 0; i < numPlotsHarvested; i++) {
    const roll = Math.random();
    
    if (roll <= dropRate) {
      // Select a warehouse ingredient using weighted random with personalized rarity
      const selectedIngredient = selectWeightedRandomItem(personalizedIngredients, 1);
      
      if (selectedIngredient) {
        // Always drop quantity 1 for warehouse ingredients
        warehouseDrops.push({
          type: selectedIngredient.type,
          quantity: 1,
          symbol: selectedIngredient.symbol || '',
          rarity: selectedIngredient.scrollchance || 'common'
        });
      }
    }
  }
  
  console.log(`<� Bulk warehouse drops calculated: ${warehouseDrops.length} total drops from ${numPlotsHarvested} plots`);
  return warehouseDrops;
}

/**
 * Aggregate warehouse drops by type for display
 * @param {Array} warehouseDrops - Array of individual drops
 * @returns {Object} Aggregated drops: {type: {quantity, symbol, rarity}}
 */
export function aggregateWarehouseDrops(warehouseDrops) {
  const aggregated = {};
  
  warehouseDrops.forEach(drop => {
    if (!aggregated[drop.type]) {
      aggregated[drop.type] = {
        quantity: 0,
        symbol: drop.symbol,
        rarity: drop.rarity
      };
    }
    aggregated[drop.type].quantity += drop.quantity;
  });
  
  return aggregated;
}

/**
 * Get personalized pet rewards by applying asymmetric rarity to warehouse ingredients
 * For pets, we still use pet level as a multiplier, but warehouse ingredients get personalized rarity
 * @param {Array} petRewards - Array of resources with source === 'pets'
 * @param {string} playerId - Player ID for personalized rarity
 * @returns {Array} Array of pet rewards with personalized rarity for warehouse ingredients
 */
export function getPersonalizedPetRewards(petRewards, playerId) {
  return petRewards.map(reward => {
    // Only apply personalized rarity to warehouse ingredients
    if (reward.requires === 'Warehouse') {
      return {
        ...reward,
        scrollchance: getPersonalizedWarehouseRarity(reward.type, playerId)
      };
    }
    // Non-warehouse items keep their original rarity
    return reward;
  });
}