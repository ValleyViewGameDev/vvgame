/**
 * ScrollReveal.js
 * Helper functions for determining random scroll reveal outcomes
 */

import { loadMasterResources } from '../../Utils/TuningManager';

/**
 * Determines the random doober reward from revealing a scroll
 * @param {Array} masterResources - Master resource list
 * @param {Object} playerStats - Optional player stats for future scaling
 * @param {number} rollCount - Number of internal rolls to make (default: 3)
 * @returns {Object} { type: string, quantity: number }
 */
export function getRandomScrollReveal(masterResources, playerStats = null, rollCount = 3) {
  // Filter resources that can be obtained from scrolls
  const scrollableItems = masterResources.filter(item => {
    const chance = item.scrollchance;
    return chance && chance > 0 && 
           (item.category === 'doober' || item.category === 'skill' || 
            item.category === 'power' || item.category === 'upgrade');
  });

  if (scrollableItems.length === 0) {
    console.warn('No scrollable items found in masterResources, using fallback');
    return { type: 'Wood', quantity: 10 };
  }

  const results = [];
  
  // Make multiple internal rolls for variety
  for (let i = 0; i < rollCount; i++) {
    // Add variance to each item's chance (±30% randomness)
    const variedPool = scrollableItems.map(item => ({
      ...item,
      currentChance: item.scrollchance * (0.7 + Math.random() * 0.6)
    }));
    
    // Calculate total weight with varied chances
    const totalWeight = variedPool.reduce((sum, item) => sum + item.currentChance, 0);
    
    // Generate random selection point
    const roll = Math.random() * totalWeight;
    
    // Select item based on weighted random
    let cumulative = 0;
    for (const item of variedPool) {
      cumulative += item.currentChance;
      if (roll <= cumulative) {
        results.push(item);
        break;
      }
    }
  }

  // If no results (shouldn't happen), use first scrollable item
  if (results.length === 0) {
    results.push(scrollableItems[0]);
  }
  
  // Select the rarest item found (lowest scrollchance = rarer)
  results.sort((a, b) => a.scrollchance - b.scrollchance);
  const selectedItem = results[0];
  
  // Use the item's defined scrollqty, or default to 1
  const quantity = selectedItem.scrollqty || 1;

  console.log(`🎲 Scroll reveal: ${selectedItem.type} x${quantity} (chance: ${selectedItem.scrollchance})`);

  return {
    type: selectedItem.type,
    quantity: quantity
  };
}

/**
 * Get display name for scroll reveal result
 * @param {Object} reveal - The reveal result from getRandomScrollReveal
 * @param {Array} masterResources - Master resource list
 * @returns {string} Display string like "5x Wood"
 */
export function getRevealDisplayString(reveal, masterResources) {
  const resource = masterResources.find(r => r.type === reveal.type);
  const symbol = resource?.symbol || '📦';
  return `${reveal.quantity}x ${symbol} ${reveal.type}`;
}

/**
 * Check if player can afford to reveal a scroll
 * @param {Object} recipe - The Reveal Scroll recipe
 * @param {Array} inventory - Player inventory
 * @param {Array} backpack - Player backpack
 * @returns {boolean}
 */
export function canAffordReveal(recipe, inventory, backpack) {
  const playerItems = [...(inventory || []), ...(backpack || [])];
  
  // Check each ingredient requirement
  for (let i = 1; i <= 5; i++) {
    const ingredientType = recipe[`ingredient${i}`];
    const ingredientQty = recipe[`ingredient${i}qty`] || 1;
    
    if (ingredientType) {
      const playerQty = playerItems
        .filter(item => item.type === ingredientType)
        .reduce((sum, item) => sum + item.quantity, 0);
        
      if (playerQty < ingredientQty) {
        return false;
      }
    }
  }
  
  return true;
}