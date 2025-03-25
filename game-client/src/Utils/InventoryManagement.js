import API_BASE from '../config';
import axios from 'axios';
import gridStateManager from '../GridState/GridState';

export async function fetchInventoryAndBackpack(playerId) {
  if (!playerId) {
    console.error('No playerId provided for fetching inventory and backpack');
    return { inventory: [], backpack: [] };
  }
  try {
    const response = await axios.get(`${API_BASE}/api/inventory/${playerId}`);
    return {
      inventory: response.data?.inventory || [],
      backpack: response.data?.backpack || [],
      warehouseCapacity: response.data?.warehouseCapacity || 0,
      backpackCapacity: response.data?.backpackCapacity || 0,
    };
  } catch (error) {
    console.error('Error fetching inventory and backpack:', error);
    return { inventory: [], backpack: [] };
  }
}

export async function fetchInventory(playerId) {
  if (!playerId) {
    console.error('No playerId provided for fetching inventory');
    return [];
  }
  try {
    const response = await axios.get(`${API_BASE}/api/inventory/${playerId}`);
    return response.data?.inventory || [];
  } catch (error) {
    console.error('Error fetching inventory:', error);
    return [];
  }
}

export async function updateInventory(currentPlayer, resourceType, quantityChange, setCurrentPlayer) {
  if (!currentPlayer?.playerId) {
    console.error('No player ID provided for updating inventory');
    return [];
  }
  
  try {
    const updatedInventory = [...currentPlayer.inventory];

    const resourceIndex = updatedInventory.findIndex((item) => item.type === resourceType);
    if (resourceIndex !== -1) {
      updatedInventory[resourceIndex].quantity += quantityChange;
      if (updatedInventory[resourceIndex].quantity <= 0) {
        updatedInventory.splice(resourceIndex, 1); // Remove resource if quantity is zero
      }
    } else if (quantityChange > 0) {
      updatedInventory.push({ type: resourceType, quantity: quantityChange });
    }

    await axios.post(`${API_BASE}/api/update-inventory`, {
      playerId: currentPlayer.playerId,
      inventory: updatedInventory,
      backpack: currentPlayer.backpack, // Ensure backpack remains unchanged
    });

    console.log('Inventory updated successfully on the server.');

    // Update currentPlayer and sync with localStorage
    const updatedPlayer = { ...currentPlayer, inventory: updatedInventory };
    setCurrentPlayer(updatedPlayer);
    localStorage.setItem('player', JSON.stringify(updatedPlayer));

    return updatedInventory;
  } catch (error) {
    console.error('Error updating inventory:', error);
    throw error;
  }
}

/**
 * Refreshes the player's state after an inventory update.
 * Ensures that the latest inventory and other properties are reflected in the UI.
 * @param {string} playerId - The player's ID.
 * @param {Function} setCurrentPlayer - Function to update the currentPlayer state.
 */
export async function refreshPlayerAfterInventoryUpdate(playerId, setCurrentPlayer) {
  try {
    const response = await axios.get(`${API_BASE}/api/player/${playerId}`);
    const updatedPlayerData = response.data;

    // Pull latest location from gridState if available
    const gridPlayer = gridStateManager.getGridState(updatedPlayerData.location?.g)?.pcs[playerId];
    if (gridPlayer) {
      updatedPlayerData.location = {
        ...updatedPlayerData.location,
        x: gridPlayer.position.x,
        y: gridPlayer.position.y,
      };
    }

    setCurrentPlayer(updatedPlayerData);
    console.log('Player refreshed successfully:', response.data);
  } catch (error) {
    console.error('Error refreshing player:', error);
  }
}


/**
 * Checks if the player has enough ingredients in the inventory and deducts them if possible.
 * @param {Object} resource - The resource to place (e.g., seed, building).
 * @param {Array} updatedInventory - A copy of the player's current inventory.
 * @param {Function} setErrorMessage - Optional function to set error messages.
 * @returns {Boolean} - Returns true if the ingredients were successfully deducted, false otherwise.
 */
export function checkAndDeductIngredients(resource, updatedInventory) {
  let canProceed = true;

  // Validate and deduct ingredients
  for (let i = 1; i <= 3; i++) {
    const ingredientType = resource[`ingredient${i}`];
    const ingredientQty = resource[`ingredient${i}qty`];
    if (ingredientType && ingredientQty) {
      const inventoryItem = updatedInventory.find((item) => item.type === ingredientType);
      if (!inventoryItem || inventoryItem.quantity < ingredientQty) {
        canProceed = false;
        break;
      }
    }
  }

  if (canProceed) {
    for (let i = 1; i <= 3; i++) {
      const ingredientType = resource[`ingredient${i}`];
      const ingredientQty = resource[`ingredient${i}qty`];
      if (ingredientType && ingredientQty) {
        const inventoryIndex = updatedInventory.findIndex((item) => item.type === ingredientType);
        if (inventoryIndex >= 0) {
          updatedInventory[inventoryIndex].quantity -= ingredientQty;
          if (updatedInventory[inventoryIndex].quantity <= 0) {
            updatedInventory.splice(inventoryIndex, 1); // Remove item if quantity is 0
          }
        }
      }
    }
  }

  return canProceed;
}


/**
 * Checks if there is enough capacity to add an item to the inventory or backpack.
 * @param {Object} player - The current player object.
 * @param {Array} inventory - The player's inventory array.
 * @param {Array} backpack - The player's backpack array.
 * @param {String} type - The type of item being added.
 * @param {Number} quantity - The quantity of the item being added.
 * @returns {Boolean} - True if there is enough capacity, false otherwise.
 */
export function checkInventoryCapacity(player, inventory = [], backpack = [], type, quantity) {
  const gtype = player.location?.gtype || 'homestead';
  const isBackpack = !["homestead"].includes(gtype);

  const targetInventory = isBackpack ? backpack : inventory;
  const maxCapacity = isBackpack ? player.backpackCapacity : player.warehouseCapacity;

  // Safely calculate current capacity
  const currentCapacity = targetInventory
    .filter((item) => item.type !== 'Money')
    .reduce((sum, item) => sum + (item.quantity || 0), 0);

  // Check if there is enough capacity
  const hasCapacity = currentCapacity + quantity <= maxCapacity;
  if (!hasCapacity) {
    console.warn(
      `Cannot add ${quantity} ${type}: Exceeds capacity in ${isBackpack ? "backpack" : "warehouse"}.`
    );
  }

  return hasCapacity;
}