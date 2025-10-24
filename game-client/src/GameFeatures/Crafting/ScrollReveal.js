/**
 * ScrollReveal.js
 * Helper functions for determining random scroll reveal outcomes
 */

import { selectWeightedRandomItem } from '../../Economy/DropRates';

/**
 * Determines the random doober reward from revealing a scroll
 * @param {Array} masterResources - Master resource list
 * @param {Object} playerStats - Optional player stats for future scaling
 * @param {number} rollCount - Number of internal rolls to make (default: 3)
 * @returns {Object} { type: string, quantity: number }
 */
export function getRandomScrollReveal(masterResources, playerStats = null, rollCount = 3) {
  // Filter resources that can be obtained from scrolls - any item with scrollchance defined
  const scrollableItems = masterResources.filter(item => item.scrollchance);

  if (scrollableItems.length === 0) {
    console.warn('No scrollable items found in masterResources, using fallback');
    return { type: 'Wood', quantity: 10 };
  }

  // Use the shared utility to select a weighted random item
  // Scrolls are always level 1 for now (no level multiplier)
  const selectedItem = selectWeightedRandomItem(scrollableItems, 1);
  
  if (selectedItem) {
    const quantity = selectedItem.scrollqty || 1;
    console.log(`🎲 Scroll reveal: ${selectedItem.type} x${quantity} (rarity: ${selectedItem.scrollchance})`);
    
    return {
      type: selectedItem.type,
      quantity: quantity
    };
  }
  
  // Fallback (shouldn't reach here)
  const fallbackItem = scrollableItems[0];
  return { 
    type: fallbackItem.type, 
    quantity: fallbackItem.scrollqty || 1 
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