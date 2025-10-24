/**
 * Economy utility functions for gem costs and calculations
 */

/**
 * Calculate gem cost for speeding up crafting based on remaining time
 * @param {number} remainingTimeMs - Remaining time in milliseconds
 * @returns {number} - Number of gems required
 */
export function calculateGemSpeedupCost(remainingTimeMs) {
  if (remainingTimeMs <= 0) return 0;
  
  const remainingMinutes = remainingTimeMs / (1000 * 60);
  
  // Use formula: gem cost = (remainingMinutes)^0.45
  // This gives approximately:
  // - 40 minutes → ~5 gems
  // - 100 minutes → ~8 gems
  const gemCost = Math.ceil(Math.pow(remainingMinutes, 0.45));
  
  return gemCost;
}