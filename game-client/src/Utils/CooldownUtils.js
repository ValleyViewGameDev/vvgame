/**
 * Utility hook for managing cooldown states on multiple items
 * @param {number} cooldownDuration - Duration in milliseconds
 * @returns {object} - Object with methods to manage cooldowns
 */
import { useState, useCallback } from 'react';

export const useCooldownManager = (cooldownDuration = 500) => {
  const [coolingDownItems, setCoolingDownItems] = useState(new Set());

  const startCooldown = useCallback((itemKey) => {
    setCoolingDownItems(prev => new Set(prev).add(itemKey));
    
    setTimeout(() => {
      setCoolingDownItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemKey);
        return newSet;
      });
    }, cooldownDuration);
  }, [cooldownDuration]);

  const isCoolingDown = useCallback((itemKey) => {
    return coolingDownItems.has(itemKey);
  }, [coolingDownItems]);

  const getCooldownProps = useCallback((itemKey) => {
    const cooling = coolingDownItems.has(itemKey);
    return {
      className: cooling ? 'cooldown' : '',
      style: cooling ? { '--cooldown-duration': `${cooldownDuration / 1000}s` } : {}
    };
  }, [coolingDownItems, cooldownDuration]);

  return {
    startCooldown,
    isCoolingDown,
    getCooldownProps,
    coolingDownItems
  };
};

/**
 * Higher-order function to wrap any action with cooldown
 * @param {function} action - The action to wrap
 * @param {string} itemKey - Unique key for this item
 * @param {function} startCooldown - Function to start cooldown
 * @param {function} isCoolingDown - Function to check cooldown status
 * @returns {function} - Wrapped action with cooldown
 */
export const withCooldown = (action, itemKey, startCooldown, isCoolingDown) => {
  return async (...args) => {
    if (isCoolingDown(itemKey)) return;
    
    startCooldown(itemKey);
    await action(...args);
  };
};