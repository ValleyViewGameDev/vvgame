/**
 * Shared cursor logic for DOM and Canvas modes
 * Provides consistent cursor behavior across rendering modes
 */
import { getAttackCooldownStatus } from '../GameFeatures/NPCs/NPCInteractionUtils';

/**
 * Determines the appropriate cursor style for an NPC
 * @param {Object} npc - The NPC object
 * @returns {string} CSS cursor class name
 */
export function getNPCCursorClass(npc) {
  if (!npc) return 'cursor-pointer';
  
  // Handle different NPC types
  switch (npc.action) {
    case 'heal':
    case 'worker':
    case 'trade':
    case 'quest':
      return 'cursor-help';
      
    case 'attack':
    case 'spawn':
      // For attack NPCs, check cooldown status from shared state
      const cooldownStatus = getAttackCooldownStatus();
      return cooldownStatus.isOnCooldown ? 'cursor-wait' : 'cursor-crosshair';
      
    default:
      return 'cursor-pointer';
  }
}

/**
 * Determines the appropriate cursor style for a resource
 * @param {Object} resource - The resource object
 * @returns {string} CSS cursor class name
 */
export function getResourceCursorClass(resource) {
  if (!resource) return 'cursor-pointer';
  
  // All interactive resources should show pointer cursor (finger)
  // This includes crafting stations, farmhouses, doobers, etc.
  return 'cursor-pointer';
}

/**
 * Applies cursor class to a DOM element
 * @param {HTMLElement} element - The DOM element
 * @param {string} cursorClass - The cursor class to apply
 */
export function applyCursorClass(element, cursorClass) {
  if (!element) return;
  
  // Remove all cursor classes first
  element.classList.remove('cursor-pointer', 'cursor-help', 'cursor-wait', 'cursor-crosshair');
  
  // Apply the new cursor class
  if (cursorClass) {
    element.classList.add(cursorClass);
  }
}

/**
 * Sets cursor style for canvas elements using CSS
 * @param {HTMLCanvasElement} canvas - The canvas element
 * @param {string} cursorClass - The cursor class to apply
 */
export function setCanvasCursor(canvas, cursorClass) {
  if (!canvas) return;
  
  // Map cursor classes to CSS cursor values
  const cursorMap = {
    'cursor-pointer': 'pointer',
    'cursor-help': 'help',
    'cursor-wait': 'wait',
    'cursor-crosshair': 'crosshair'
  };
  
  canvas.style.cursor = cursorMap[cursorClass] || 'default';
}