import playersInGridManager from "../GridState/PlayersInGrid";
import axios from "axios";
import API_BASE from "../config";
  
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


export function enrichResourceFromMaster(raw, masterResources) {
// Used by socket listeners to enrich raw resource data with template details
  const template = masterResources.find(r => r.type === raw.type);  
  if (!template) {
    console.warn(`⚠️ No matching resource template found for ${raw.type}`);
    return raw;
  }
  return {
    ...template,
    ...raw, // Allow raw to override specific fields like growEnd, x, y
  };
}

export function getCurrentTileCoordinates(gridId, currentPlayer) {
  const playersInGrid = playersInGridManager.getPlayersInGrid(gridId);
  if (!playersInGrid || !currentPlayer?.playerId) {
    console.warn('⚠️ playersInGrid or playerId missing.');
    return null;
  }
  const playerData = playersInGrid[currentPlayer.playerId];
  if (!playerData) {
    console.warn('⚠️ Player not found in playersInGrid.');
    return null;
  }
  const { x, y } = playerData.position;
  if (x == null || y == null) {
    console.warn('⚠️ Invalid player position.');
    return null;
  }
  const tileX = Math.floor(x);
  const tileY = Math.floor(y);
  return { tileX, tileY };
}

// export async function getTileResource(gridId, x, y) {
//   try {
//     console.log(`Fetching resource at (${x}, ${y}) in grid ${gridId}`);
//     const response = await axios.get(`${API_BASE}/api/get-resource/${gridId}/${x}/${y}`);
//     console.log(`Resource at (${x}, ${y}):`, response.data);
//     return response.data;
//   } catch (error) {
//     console.error(`Error fetching resource at (${x}, ${y}) in grid ${gridId}:`, error);
//     throw error;
//   }
// }

export async function validateTileType(gridId, x, y) {
  try {
    console.log(`Validating tile type at (${x}, ${y}) in grid ${gridId}`);
    const response = await axios.get(`${API_BASE}/api/get-tile/${gridId}/${x}/${y}`);
    console.log(`Tile type at (${x}, ${y}):`, response.data.tileType);
    return response.data.tileType;
  } catch (error) {
    console.error(`Error fetching tile type at (${x}, ${y}) in grid ${gridId}:`, error);
    throw error;
  }
}

export function isACrop(itemType, masterResources) {
  // Check if this item is the output of any farmplot resource
  return masterResources.some(resource => 
    resource.category === 'farmplot' && resource.output === itemType
  );
}
