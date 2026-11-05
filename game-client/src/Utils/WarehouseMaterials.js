/**
 * Warehouse materials and ingredient drop utilities
 */

// Import isACrop from ResourceHelpers since it's a general utility
import { isACrop } from './ResourceHelpers';
import { selectTierFirstItem } from '../Economy/DropRates';

/**
 * The tools' own drop tuning (docs/tuning.md §4k): `globalTuning.warehouseDropRate` is the chance a
 * crop harvest drops a tool, and `warehouseDropOdds` the percent per rarity tier once it does.
 * Kept apart from `harvestDropRate`, which Kent's bonus valley item also uses. A tuning file
 * without them falls back to harvestDropRate and the standard rarity weights.
 */
const warehouseDropRate = (globalTuning) =>
  globalTuning?.warehouseDropRate ?? globalTuning?.harvestDropRate ?? 0.1;

const pickWarehouseIngredient = (personalizedIngredients, globalTuning, selectWeightedRandomItem) =>
  (globalTuning?.warehouseDropOdds
    ? selectTierFirstItem(personalizedIngredients, globalTuning.warehouseDropOdds)
    : selectWeightedRandomItem(personalizedIngredients, 1));

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


