import API_BASE from '../config';
import axios from 'axios';
import playersInGridManager from '../GridState/PlayersInGrid';


export const canAfford = (recipe, inventory = [], backpack = [], amount = 1) => {
  if (!recipe) return false;
  const inv = Array.isArray(inventory) ? inventory : [];
  const bp = Array.isArray(backpack) ? backpack : [];
  for (let i = 1; i <= 3; i++) {
    const ingredientType = recipe[`ingredient${i}`];
    const ingredientQty = recipe[`ingredient${i}qty`] * amount;
    if (ingredientType && ingredientQty >= 0) {
      const backpackItem = bp.find((item) => item.type === ingredientType);
      const inventoryItem = inv.find((item) => item.type === ingredientType);
      const totalQty = (backpackItem?.quantity || 0) + (inventoryItem?.quantity || 0);
      if (totalQty < ingredientQty) { return false; }
    }
  }
  console.log(`✅ canAfford returns TRUE for ${recipe.type}`);
  return true;
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
 */
export async function refreshPlayerAfterInventoryUpdate(playerId, setCurrentPlayer) {
  try {
    const response = await axios.get(`${API_BASE}/api/player/${playerId}`);
    const updatedPlayerData = response.data;
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
    console.log('Player refreshed successfully:', response.data);
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
}) {
  console.log("Made it to gainIngredients; resource = ", resource, "; quantity = ", quantity);

  const isMoney = resource === "Money";
  const isHomestead = currentPlayer?.location?.gtype === 'homestead';
  const storingInBackpack = !isMoney && !isHomestead;
  console.log("🏠 isHomestead:", isHomestead, "| 💰 isMoney:", isMoney, "| 🎒 storingInBackpack:", storingInBackpack);

  const target = isMoney || isHomestead ? [...inventory] : [...backpack];

  // ✅ Backpack skill check if storing in backpack
  if (storingInBackpack) {
    const hasBackpackSkill = currentPlayer?.skills?.some((item) => item.type === 'Backpack' && item.quantity > 0);
    if (!hasBackpackSkill) {
      if (updateStatus) updateStatus(19); // Missing backpack
      return false;
    }
  }
    
  // ✅ Capacity check
  if (!isMoney) {
    const capacity = isHomestead ? currentPlayer?.warehouseCapacity : currentPlayer?.backpackCapacity;
    const totalItems = target
      .filter(item => item && item.type !== 'Money' && typeof item.quantity === 'number')
      .reduce((acc, item) => acc + item.quantity, 0);
    if (totalItems + quantity > capacity) {
      console.log("📦 Capacity check failed. totalItems =", totalItems, "quantity =", quantity, "capacity =", capacity);
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

  // THIS IS THE ORIGINAL CODE THAT USED THE update-inventory ENDPOINT
  // This is now replaced with the update-inventory-delta endpoint
  //
  // const payload = {
  //   playerId,
  //   inventory: isMoney || isHomestead ? target : inventory,
  //   backpack: !isMoney && !isHomestead ? target : backpack,
  // };
  // console.log("📤 Sending inventory payload to server:", payload);

  // try {
  //   await axios.post(`${API_BASE}/api/update-inventory`, payload);
  //   setInventory(payload.inventory);
  //   setBackpack(payload.backpack);
  //   await refreshPlayerAfterInventoryUpdate(playerId, setCurrentPlayer);
  //   return true;
  // } catch (err) {
  //   console.error("❌ Error gaining ingredient", err);
  //   return false;
  // }


  // Prepare delta payload for update-inventory-delta endpoint
  const deltaPayload = {
    playerId,
    delta: [{ type: resource, quantity: quantity }]
  };
  console.log("📤 Sending inventory delta payload to server:", deltaPayload);

  try {
    await axios.post(`${API_BASE}/api/update-inventory-delta`, deltaPayload);
    setInventory(isMoney || isHomestead ? target : inventory);
    setBackpack(!isMoney && !isHomestead ? target : backpack);
    await refreshPlayerAfterInventoryUpdate(playerId, setCurrentPlayer);
    return true;
  } catch (err) {
    console.error("❌ Error gaining ingredient", err);
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
  console.log("Made it to spendIngredients; recipe = ",recipe);
  let updatedInventory = [...inventory];
  let updatedBackpack = [...backpack];

  if (!canAfford(recipe, inventory, backpack, 1)) { updateStatus(4); return false; }

  // Deduct ingredients with new logic
  for (let i = 1; i <= 3; i++) {
    const type = recipe?.[`ingredient${i}`];
    const qty = recipe?.[`ingredient${i}qty`];
    if (type && qty) {
      let remaining = qty;

      const deductFrom = (list) => {
        const index = list.findIndex((item) => item.type === type);
        if (index >= 0) {
          const used = Math.min(remaining, list[index].quantity);
          list[index].quantity -= used;
          remaining -= used;
          if (list[index].quantity <= 0) list.splice(index, 1);
        }
      };
      deductFrom(updatedBackpack);
      console.log(`✅ Deducted ${qty} of ${type} from inventory/backpack`);
      if (remaining > 0) deductFrom(updatedInventory);
    }
  }

  try {
    await axios.post(`${API_BASE}/api/update-inventory`, {
      playerId,
      inventory: updatedInventory,
      backpack: updatedBackpack,
    });
    setInventory(updatedInventory);
    setBackpack(updatedBackpack);
    await refreshPlayerAfterInventoryUpdate(playerId, setCurrentPlayer);
    return true;

  } catch (err) {
    console.error("❌ Error spending ingredients:", err);
    return false;
  }
}