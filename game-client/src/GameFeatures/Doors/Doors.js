/**
 * Door interaction logic
 * Checks if player has access to doors and provides appropriate feedback
 */

import FloatingTextManager from '../../UI/FloatingText';

/**
 * Check if player has a specific item in their inventory or backpack
 * @param {Object} currentPlayer - The current player object
 * @param {string} itemType - The item type to check for
 * @returns {boolean} - Whether the player has the item
 */
function hasItem(currentPlayer, itemType) {
  // Check inventory
  const inInventory = currentPlayer?.inventory?.some(item => item.type === itemType);
  if (inInventory) return true;
  
  // Check backpack
  const inBackpack = currentPlayer?.backpack?.some(item => item.type === itemType);
  return inBackpack;
}

/**
 * Handle door click interaction
 * @param {Object} door - The door resource object
 * @param {Object} currentPlayer - The current player object
 * @param {number} TILE_SIZE - The size of tiles for positioning
 * @param {Function} updateStatus - Function to update status bar
 * @param {Object} strings - Localized strings object
 */
export function handleDoorClick(door, currentPlayer, TILE_SIZE, updateStatus, strings) {
  // Use shared access checking logic
  const accessResult = checkDoorAccess(door, currentPlayer, strings);
  
  // Show appropriate message
  updateStatus(accessResult.message);
  FloatingTextManager.addFloatingText(
    accessResult.floatingText,
    door.x,
    door.y,
    TILE_SIZE
  );
}

/**
 * Check door access and get appropriate message
 * @param {Object} door - The door resource object
 * @param {Object} currentPlayer - The current player object
 * @param {Object} strings - Localized strings object
 * @returns {Object} - { hasAccess: boolean, message: string, floatingText: string }
 */
export function checkDoorAccess(door, currentPlayer, strings) {
  const requiredItem = door.requires;
  
  if (!requiredItem) {
    // No requirement - door is always open
    return {
      hasAccess: true,
      message: strings?.[10170] || "The door is open",
      floatingText: strings?.[10170] || "✓ Open"
    };
  }
  
  // Check if player has the required item
  const hasRequiredItem = hasItem(currentPlayer, requiredItem);
  
  if (!hasRequiredItem) {
    // No access
    return {
      hasAccess: false,
      message: strings?.[10171] || `You need ${requiredItem} to access this door.`,
      floatingText: strings?.[10171] || "No Access"
    };
  }
  
  // Has access
  return {
    hasAccess: true,
    message: strings?.[10170] || "The door is open",
    floatingText: strings?.[10170] || "✓ Access Granted"
  };
}

/**
 * Check if player can pass through a door
 * Used by movement system to override passable=false for doors
 * @param {Object} resource - The resource to check
 * @param {Object} currentPlayer - The current player object
 * @param {Function} updateStatus - Function to update status bar (optional)
 * @param {Object} strings - Localized strings object (optional)
 * @param {number} TILE_SIZE - Tile size for floating text (optional)
 * @returns {boolean} - Whether the player can pass through
 */
export function canPassThroughDoor(resource, currentPlayer, updateStatus, strings, TILE_SIZE) {
  // Check if it's a door
  if (resource.action !== 'door') return false;
  
  // Check door access
  const accessResult = checkDoorAccess(resource, currentPlayer, strings);
  
  // If no access and we have updateStatus, show the message
  if (!accessResult.hasAccess && updateStatus) {
    updateStatus(accessResult.message);
    if (TILE_SIZE && resource.x !== undefined && resource.y !== undefined) {
      FloatingTextManager.addFloatingText(
        accessResult.floatingText,
        resource.x,
        resource.y,
        TILE_SIZE
      );
    }
  }
  
  return accessResult.hasAccess;
}

export default {
  handleDoorClick,
  canPassThroughDoor,
  checkDoorAccess,
  hasItem
};