export const canAfford = (recipe, inventory, amount = 1) => {
    if (!recipe || !Array.isArray(inventory)) return false;
  
    for (let i = 1; i <= 3; i++) {
      const ingredientType = recipe[`ingredient${i}`];
      const ingredientQty = recipe[`ingredient${i}qty`] * amount;
  
      if (ingredientType && ingredientQty >= 0) {
        const inventoryItem = inventory.find((item) => item.type === ingredientType);
        if (!inventoryItem || inventoryItem.quantity <= ingredientQty) {
          return false;
        }
      }
    }
    return true;
  };
  
export const getIngredientDetails = (recipe, allResources) => {
  
    const ingredients = [];
    for (let i = 1; i <= 4; i++) {
      const ingredientType = recipe[`ingredient${i}`];
      const ingredientQty = recipe[`ingredient${i}qty`];
      if (ingredientType && ingredientQty) {
        const ingredientResource = allResources.find((res) => res.type === ingredientType);
        const symbol = ingredientResource?.symbol || '';
        ingredients.push(`${symbol} ${ingredientType} x${ingredientQty}`);
      }
    }
    return ingredients;
  };
  

// Utility Function for Socket Listener
export function mergeResources(existingResources, updatedResources) {
  console.log("🧪 mergeResources called");
  console.log("📥 Existing Resources:", existingResources.length);
  console.log("📥 Updated Resources:", updatedResources);

  const map = new Map();

  // Add all existing resources to map
  for (const res of existingResources) {
    const key = `${res.x},${res.y}`;
    map.set(key, res);
  }

  // Track whether any actual changes were made
  let changed = false;

  // Overwrite with updated ones
  for (const updated of updatedResources) {
    const key = `${updated.x},${updated.y}`;
    const existing = map.get(key);
    const merged = { ...existing, ...updated };

    // Deep compare for debugging
    const changedFields = Object.entries(updated).filter(
      ([k, v]) => existing?.[k] !== v
    );
    if (changedFields.length > 0) {
      console.log(`🔄 Resource at (${key}) changed fields:`, changedFields);
      changed = true;
    } else {
      console.log(`✅ Resource at (${key}) unchanged`);
    }

    map.set(key, merged);
  }

  const result = Array.from(map.values());

  console.log("✅ mergeResources returning new array of length:", result.length);
  console.log("🔁 Resources actually changed?", changed);
  return result;
}


export function mergeTiles(existingTiles, updatedTiles) {
  console.log("🧪 mergeTiles called");
  console.log("📥 Existing Tiles:", existingTiles.length, "rows");
  console.log("📥 Updated Tiles:", updatedTiles);

  const newTiles = existingTiles.map(row => [...row]); // Create deep copy
  let changed = false;

  updatedTiles.forEach(({ x, y, type: tileType }) => {
    if (newTiles[y] && typeof newTiles[y][x] !== 'undefined') {
      const oldTile = newTiles[y][x];
      if (oldTile !== tileType) {
        console.log(`🔄 Tile at (${x},${y}) changed from "${oldTile}" to "${tileType}"`);
        newTiles[y][x] = tileType;
        changed = true;
      } else {
        console.log(`✅ Tile at (${x},${y}) is already "${tileType}" — no change`);
      }
    } else {
      console.warn(`⚠️ Attempted to update invalid tile at (${x},${y})`);
    }
  });

  console.log("✅ mergeTiles returning new tile array");
  console.log("🔁 Any tiles changed?", changed);
  return newTiles;
}