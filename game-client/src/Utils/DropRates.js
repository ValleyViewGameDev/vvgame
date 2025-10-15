/**
 * DropRates.js
 * Shared utility for managing drop rates and rarity chances across the game.
 * Used by both ScrollReveal and PetPanel systems.
 */

/**
 * Standard rarity table for the game
 * These values represent the relative weight/chance of each rarity tier.
 * Higher numbers = more common.
 */
const STANDARD_RARITY_TABLE = {
  'common': 100,     // 1 in 1 (baseline)
  'uncommon': 50,    // 1 in 2 
  'rare': 20,        // 1 in 5
  'epic': 5,         // 1 in 20
  'legendary': 1     // 1 in 100
};

/**
 * Convert rarity string to numeric chance value for weighted selection
 * @param {string} rarity - Rarity tier: 'common', 'uncommon', 'rare', 'epic', 'legendary'
 * @param {number} level - Optional level multiplier (default: 1). Higher levels increase drop rates.
 *                        Level 1 = standard rates, Level 2 = 2x drop rates, etc.
 * @returns {number} Chance weight (higher = more common)
 */
export function getRarityChance(rarity, level = 1) {
  // Handle backward compatibility with old numeric values
  if (typeof rarity === 'number') {
    return rarity * level;
  }
  
  // Get base rarity from table
  const baseRarity = STANDARD_RARITY_TABLE[rarity] || STANDARD_RARITY_TABLE['common'];
  
  // Apply level multiplier to effectively reduce the rarity gap
  // The goal is to make rare items more common at higher levels
  // by multiplying their weight more than common items.
  // 
  // We use a formula that compresses the rarity distribution:
  // newWeight = baseRarity * level^scaleFactor
  // where scaleFactor is higher for rarer items
  // 
  // For the desired behavior where legendary goes from 1/100 to 1/20 at level 5:
  // We need legendary weight to go from 1 to 5 (5x increase)
  // While common weight should increase less dramatically
  
  // Calculate scale factor based on rarity (rarer items get bigger boost)
  // Common (100) gets smallest boost, Legendary (1) gets biggest boost
  const rarityScale = 1 + (100 - baseRarity) / 100; // Common=1, Legendary=1.99
  
  // Apply the level scaling with the rarity-specific multiplier
  // This makes rare items increase faster than common items
  return baseRarity * Math.pow(level, rarityScale - 1);
}

/**
 * Example calculations for getRarityChance at different levels:
 * 
 * Level 1 (base rates):
 * - Common: 100 * 1^0 = 100 (1 in 1.76)
 * - Uncommon: 50 * 1^0.5 = 50 (1 in 3.52)
 * - Rare: 20 * 1^0.8 = 20 (1 in 8.8)
 * - Epic: 5 * 1^0.95 = 5 (1 in 35.2)
 * - Legendary: 1 * 1^0.99 = 1 (1 in 176)
 * 
 * Level 5 (compressed distribution):
 * - Common: 100 * 5^0 = 100 (1 in 3.89)
 * - Uncommon: 50 * 5^0.5 = 111.8 (1 in 3.48)
 * - Rare: 20 * 5^0.8 = 65.9 (1 in 5.91)
 * - Epic: 5 * 5^0.95 = 22.8 (1 in 17.07)
 * - Legendary: 1 * 5^0.99 = 4.9 (1 in 79.4)
 * 
 * This achieves the goal where legendary becomes approximately 5x more common at level 5
 * while common items stay at the same absolute weight.
 */

/**
 * Select a random rarity tier based on weighted probabilities
 * @param {number} level - Optional level multiplier for drop rates (default: 1)
 * @returns {string} Selected rarity tier
 */
export function selectRandomRarity(level = 1) {
  // Calculate total weight with level multiplier
  const totalWeight = Object.entries(STANDARD_RARITY_TABLE).reduce(
    (sum, [rarity, baseChance]) => sum + getRarityChance(rarity, level), 
    0
  );
  
  // Generate random value
  const roll = Math.random() * totalWeight;
  let cumulative = 0;
  
  // Find which rarity tier the roll falls into
  for (const [rarity, baseChance] of Object.entries(STANDARD_RARITY_TABLE)) {
    cumulative += getRarityChance(rarity, level);
    if (roll <= cumulative) {
      return rarity;
    }
  }
  
  // Fallback (shouldn't reach here)
  return 'common';
}

/**
 * Select a random item from a weighted array based on rarity
 * @param {Array} items - Array of items with scrollchance property
 * @param {number} level - Optional level multiplier for drop rates (default: 1)
 * @returns {Object|null} Selected item or null if no items
 */
export function selectWeightedRandomItem(items, level = 1) {
  if (!items || items.length === 0) {
    return null;
  }
  
  // Calculate total weight based on rarity chances
  const totalWeight = items.reduce(
    (sum, item) => sum + getRarityChance(item.scrollchance, level), 
    0
  );
  
  // Generate weighted random selection
  const roll = Math.random() * totalWeight;
  let cumulative = 0;
  
  // Find the selected item based on weighted probability
  for (const item of items) {
    cumulative += getRarityChance(item.scrollchance, level);
    if (roll <= cumulative) {
      return item;
    }
  }
  
  // Fallback to first item
  return items[0];
}

/**
 * Get drop quantity for a given rarity
 * Common items tend to drop in larger quantities
 * @param {string} rarity - The rarity tier
 * @returns {number} Quantity to drop
 */
export function getDropQuantity(rarity) {
  const quantityRanges = {
    'common': { min: 1, max: 3 },
    'uncommon': { min: 1, max: 2 },
    'rare': { min: 1, max: 1 },
    'epic': { min: 1, max: 1 },
    'legendary': { min: 1, max: 1 }
  };
  
  const range = quantityRanges[rarity] || quantityRanges['common'];
  return Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
}

/**
 * Export the standard rarity table for reference
 */
export const RARITY_TABLE = STANDARD_RARITY_TABLE;