/**
 * ScrollReveal.js
 * Helper functions for determining random scroll reveal outcomes
 */

import { loadMasterResources } from '../../Utils/TuningManager';

/**
 * Determines the random doober reward from revealing a scroll
 * @param {Array} masterResources - Master resource list
 * @param {Object} playerStats - Optional player stats for future scaling
 * @returns {Object} { type: string, quantity: number }
 */
export function getRandomScrollReveal(masterResources, playerStats = null) {
  // Define possible doober rewards with weights
  // These are common collectible resources that make sense as scroll rewards
  const possibleRewards = [
    { type: 'Wood', weight: 20, minQty: 5, maxQty: 15 },
    { type: 'Stone', weight: 20, minQty: 5, maxQty: 15 },
    { type: 'Clay', weight: 15, minQty: 3, maxQty: 10 },
    { type: 'Gold', weight: 5, minQty: 1, maxQty: 3 },
    { type: 'Silver', weight: 8, minQty: 2, maxQty: 5 },
    { type: 'Gem', weight: 3, minQty: 1, maxQty: 2 },
    { type: 'Bones', weight: 10, minQty: 2, maxQty: 8 },
    { type: 'Mushroom', weight: 8, minQty: 2, maxQty: 6 },
    { type: 'Rosemary', weight: 6, minQty: 1, maxQty: 4 },
    { type: 'Feverfew', weight: 5, minQty: 1, maxQty: 3 }
  ];

  // Calculate total weight
  const totalWeight = possibleRewards.reduce((sum, reward) => sum + reward.weight, 0);

  // Generate random number between 0 and totalWeight
  let random = Math.random() * totalWeight;

  // Select reward based on weighted random
  let selectedReward = null;
  for (const reward of possibleRewards) {
    random -= reward.weight;
    if (random <= 0) {
      selectedReward = reward;
      break;
    }
  }

  // Fallback to first reward if something goes wrong
  if (!selectedReward) {
    selectedReward = possibleRewards[0];
  }

  // Calculate random quantity within the range
  const quantity = Math.floor(Math.random() * (selectedReward.maxQty - selectedReward.minQty + 1)) + selectedReward.minQty;

  // Verify the resource exists in masterResources
  const resourceExists = masterResources.find(r => r.type === selectedReward.type);
  if (!resourceExists) {
    console.warn(`Resource type ${selectedReward.type} not found in masterResources, defaulting to Wood`);
    return { type: 'Wood', quantity: 10 };
  }

  return {
    type: selectedReward.type,
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