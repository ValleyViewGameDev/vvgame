import API_BASE from '../config';
import axios from 'axios';
import playersInGridManager from '../GridState/PlayersInGrid';

// Helper function to check if an item is a currency (doesn't count against inventory)
export const isCurrency = (resourceType) => {
  return resourceType === 'Money' || 
         resourceType === 'Gem' || 
         resourceType === 'Yellow Heart' ||
         resourceType === 'Green Heart' ||
         resourceType === 'Purple Heart';
};

/**
 * Calculate skill multiplier for a specific resource type
 * @param {String} resourceType - The resource type to check skills for
 * @param {Array} playerSkills - Player's skills array
 * @param {Object} masterSkills - Master skills definitions
 * @returns {Object} Object containing multiplier, applicable skills, and whether skills apply
 */
export function calculateSkillMultiplier(resourceType, playerSkills, masterSkills) {
  const applicableSkills = [];
  let multiplier = 1;
  
  // Find all skills that buff this resource type
  playerSkills.forEach(skill => {
    const buffValue = masterSkills?.[skill.type]?.[resourceType];
    if (buffValue && buffValue > 1) {
      applicableSkills.push(skill.type);
      multiplier *= buffValue;
    }
  });
  
  return {
    multiplier,
    skills: applicableSkills,
    hasSkills: applicableSkills.length > 0
  };
}

/**
 * Apply skill multiplier to a base quantity
 * @param {Number} baseQuantity - Base quantity before skills
 * @param {Number} multiplier - Skill multiplier
 * @returns {Number} Final quantity after applying skills
 */
export function applySkillMultiplier(baseQuantity, multiplier) {
  return Math.floor(baseQuantity * multiplier);
}

/**
 * Derives the total warehouse and backpack capacity based on player skills and master resources.
 * @param {object} currentPlayer - The player object including skills and base capacities.
 * @param {Array} masterResources - Array of all master resource definitions.
 * @returns {object} - { warehouse: number, backpack: number }
 */

export function deriveWarehouseAndBackpackCapacity(currentPlayer, masterResources) {
  const baseWarehouse = currentPlayer?.warehouseCapacity || 0;
  const baseBackpack = currentPlayer?.backpackCapacity || 0;
  const isGold = currentPlayer?.accountStatus === "Gold";
  const warehouseBonus = isGold ? 1000000 : 0;
  const backpackBonus = isGold ? 10000 : 0;

  return (currentPlayer?.skills || []).reduce(
    (acc, skill) => {
      const skillDetails = masterResources?.find(res => res.type === skill.type);
      if (skillDetails) {
        const bonus = skillDetails.qtycollected || 0;
        if (skillDetails.output === 'warehouseCapacity') {
          acc.warehouse += bonus;
        } else if (skillDetails.output === 'backpackCapacity') {
          acc.backpack += bonus;
        }
      }
      return acc;
    },
    { warehouse: baseWarehouse + warehouseBonus, backpack: baseBackpack + backpackBonus }
  );
}



export const canAfford = (recipe, inventory = [], backpack = [], amount = 1) => {
  if (!recipe) return false;
  const inv = Array.isArray(inventory) ? inventory : [];
  const bp = Array.isArray(backpack) ? backpack : [];
  // Check up to 5 ingredients to support gem purchases
  for (let i = 1; i <= 5; i++) {
    const ingredientType = recipe[`ingredient${i}`];
    const ingredientQty = recipe[`ingredient${i}qty`] * amount;
    if (ingredientType && ingredientQty >= 0) {
      const backpackItem = bp.find((item) => item.type === ingredientType);
      const inventoryItem = inv.find((item) => item.type === ingredientType);
      const totalQty = (backpackItem?.quantity || 0) + (inventoryItem?.quantity || 0);
      if (totalQty < ingredientQty) { return false; }
    }
  }
  return true;
};

/**
 * Checks if there's room to store a resource without actually adding it
 * @param {object} params - Parameters for checking capacity
 * @returns {boolean} - True if there's room, false otherwise
 */
export const hasRoomFor = ({
  resource,
  quantity,
  currentPlayer,
  inventory,
  backpack,
  masterResources
}) => {
  const isCurrencyItem = isCurrency(resource);
  const isHomestead = currentPlayer?.location?.gtype === 'homestead';
  const storingInBackpack = !isCurrencyItem && !isHomestead;
  
  
  // Currencies always have room
  if (isCurrencyItem) return true;
  
  // Check backpack skill if storing in backpack
  if (storingInBackpack) {
    const hasBackpackSkill = currentPlayer?.skills?.some((item) => item.type === 'Backpack' && item.quantity > 0);
    if (!hasBackpackSkill) {
      return false;
    }
  }
  
  // Check capacity
  const target = isHomestead ? inventory : backpack;
  
  const { warehouse, backpack: maxBackpack } = deriveWarehouseAndBackpackCapacity(currentPlayer, masterResources || []);
  const capacity = isHomestead ? warehouse : maxBackpack;
  
  const totalItems = target
    .filter(item => item && !isCurrency(item.type) && typeof item.quantity === 'number')
    .reduce((acc, item) => acc + item.quantity, 0);
    
  return totalItems + quantity <= capacity;
};


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

 
/**
 * Refreshes the player's state after an inventory update.
 * Ensures that the latest inventory and other properties are reflected in the UI.
 * @param {string} playerId - The player's ID.
 * @param {Function} setCurrentPlayer - Function to update the currentPlayer state.
 * @param {boolean} preserveInventory - If true, preserves local inventory/backpack state
 */
export async function refreshPlayerAfterInventoryUpdate(playerId, setCurrentPlayer, preserveInventory = true) {
  try {
    const response = await axios.get(`${API_BASE}/api/player/${playerId}`);
    const updatedPlayerData = response.data;
    
    // If preserveInventory is true, keep the current inventory and backpack
    if (preserveInventory) {
      setCurrentPlayer(currentPlayer => {
        const merged = {
          ...updatedPlayerData,
          inventory: currentPlayer.inventory,
          backpack: currentPlayer.backpack
        };
        
        // Pull latest location from playersInGridManager if available
        const gridPlayer = playersInGridManager.getPlayersInGrid(merged.location?.g)?.[playerId];
        if (gridPlayer) {
          merged.location = {
            ...merged.location,
            x: gridPlayer.position.x,
            y: gridPlayer.position.y,
          };
        }
        
        return merged;
      });
    } else {
      // Original behavior - full replacement
      // Pull latest location from playersInGridManager if available
      const gridPlayer = playersInGridManager.getPlayersInGrid(updatedPlayerData.location?.g)?.[playerId];
      if (gridPlayer) {
        updatedPlayerData.location = {
          ...updatedPlayerData.location,
          x: gridPlayer.position.x,
          y: gridPlayer.position.y,
        };
      }
      setCurrentPlayer(updatedPlayerData);
    }
  } catch (error) {
    console.error('Error refreshing player:', error);
  }
}



////////////////////////////////////////
export async function gainIngredients({
  playerId,
  currentPlayer,
  resource,
  quantity,
  inventory,
  backpack,
  setInventory,
  setBackpack,
  setCurrentPlayer,
  updateStatus,
  masterResources,
}) {
  const isCurrencyItem = isCurrency(resource);
  const isHomestead = currentPlayer?.location?.gtype === 'homestead';
  const storingInBackpack = !isCurrencyItem && !isHomestead;

  const target = isCurrencyItem || isHomestead ? [...inventory] : [...backpack];

  // ✅ Backpack skill check if storing in backpack
  if (storingInBackpack) {
    const hasBackpackSkill = currentPlayer?.skills?.some((item) => item.type === 'Backpack' && item.quantity > 0);
    if (!hasBackpackSkill) {
      if (updateStatus) updateStatus(19); // Missing backpack
      return false;
    }
  }
    
  // ✅ Capacity check
  if (!isCurrencyItem) {
    const { warehouse, backpack: maxBackpack } = deriveWarehouseAndBackpackCapacity(currentPlayer, masterResources || []);
    const capacity = isHomestead ? warehouse : maxBackpack;
    const totalItems = target
      .filter(item => item && item.type !== 'Money' && item.type !== 'Gem' && typeof item.quantity === 'number')
      .reduce((acc, item) => acc + item.quantity, 0);
    if (totalItems + quantity > capacity) {
      if (updateStatus) updateStatus(isHomestead ? 20 : 21); // 20 = warehouse full, 21 = backpack full
      return false;
    }
  }

  // ✅ Apply gain
  const index = target.findIndex((item) => item.type === resource);
  if (index >= 0) {
    target[index].quantity += quantity;
  } else {
    target.push({ type: resource, quantity });
  }

  // Prepare delta payload for update-inventory-delta endpoint, including explicit target
  const deltaPayload = {
    playerId,
    delta: [{
      type: resource,
      quantity: quantity,
      target: storingInBackpack ? 'backpack' : 'inventory'
    }]
  };

  try {
    await axios.post(`${API_BASE}/api/update-inventory-delta`, deltaPayload);
    
    setInventory(isCurrencyItem || isHomestead ? target : inventory);
    setBackpack(!isCurrencyItem && !isHomestead ? target : backpack);
    
    // Update currentPlayer with new inventory to ensure UI updates properly
    setCurrentPlayer(prev => ({
      ...prev,
      inventory: isCurrencyItem || isHomestead ? target : inventory,
      backpack: !isCurrencyItem && !isHomestead ? target : backpack
    }));
    await refreshPlayerAfterInventoryUpdate(playerId, setCurrentPlayer);
    return true;
  } catch (err) {
    console.error("❌ Error gaining ingredient:", err);
    console.error("Error details:", {
      status: err.response?.status,
      data: err.response?.data,
      message: err.message,
      resource,
      quantity,
      target: storingInBackpack ? 'backpack' : 'inventory'
    });
    return false;
  }
}


////////////////////////////////////////
export async function spendIngredients({
  playerId,
  recipe,
  inventory,
  backpack,
  setInventory,
  setBackpack,
  setCurrentPlayer,
  updateStatus,
}) {
  let updatedInventory = [...inventory];
  let updatedBackpack = [...backpack];

  if (!canAfford(recipe, inventory, backpack, 1)) { updateStatus(4); return false; }

  // Build delta changes array
  const deltaChanges = [];
  
  // Deduct ingredients with new logic (support up to 5 for gems)
  for (let i = 1; i <= 5; i++) {
    const type = recipe?.[`ingredient${i}`];
    const qty = recipe?.[`ingredient${i}qty`];
    if (type && qty) {
      let remaining = qty;
      
      // First deduct from backpack
      const backpackItem = updatedBackpack.find((item) => item.type === type);
      if (backpackItem) {
        const used = Math.min(remaining, backpackItem.quantity);
        backpackItem.quantity -= used;
        remaining -= used;
        deltaChanges.push({ type, quantity: -used, target: 'backpack' });
        if (backpackItem.quantity <= 0) {
          updatedBackpack.splice(updatedBackpack.indexOf(backpackItem), 1);
        }
      }
      
      // Then deduct from inventory if needed
      if (remaining > 0) {
        const inventoryItem = updatedInventory.find((item) => item.type === type);
        if (inventoryItem) {
          const used = Math.min(remaining, inventoryItem.quantity);
          inventoryItem.quantity -= used;
          deltaChanges.push({ type, quantity: -used, target: 'inventory' });
          if (inventoryItem.quantity <= 0) {
            updatedInventory.splice(updatedInventory.indexOf(inventoryItem), 1);
          }
        }
      }
      
    }
  }

  try {
    // Use delta update endpoint to avoid race conditions
    await axios.post(`${API_BASE}/api/update-inventory-delta`, {
      playerId,
      delta: deltaChanges
    });
    
    setInventory(updatedInventory);
    setBackpack(updatedBackpack);
    
    // Update currentPlayer with new inventory to ensure UI updates properly
    setCurrentPlayer(prev => ({
      ...prev,
      inventory: updatedInventory,
      backpack: updatedBackpack
    }));
    
    await refreshPlayerAfterInventoryUpdate(playerId, setCurrentPlayer);
    
    // Return object that's backward compatible (truthy) but also includes updated arrays
    const result = { success: true, updatedInventory, updatedBackpack };
    // Make the object truthy for backward compatibility
    result.valueOf = () => true;
    return result;

  } catch (err) {
    console.error("❌ Error spending ingredients:", err);
    return false;
  }
}