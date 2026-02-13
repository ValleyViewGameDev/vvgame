// plantNewTreesLogic.js
// Replants Oak Trees and Pine Trees on valley grids to replace harvested ones

const Grid = require('../models/grid');
const gridResourceManager = require('./GridResourceManager');
const masterResources = require('../tuning/resources.json');
const randomValleyGridLayouts = require('../layouts/gridLayouts/randomValleyGridLayouts.json');
const TileEncoder = require('./TileEncoder');

/**
 * Plant new trees on a valley grid to replace harvested ones.
 *
 * Algorithm:
 * 1. Verify grid is a valley type (valley1, valley2, valley3)
 * 2. Remove all Wood doobers from the grid
 * 3. Look up the valley type's Oak Tree and Pine Tree quantities from randomValleyGridLayouts.json
 *    - Find first matching layout for this valleyType (variant 1)
 *    - Extract r1qty (Oak Tree) and r2qty (Pine Tree) values
 * 4. Count existing Oak Trees and Pine Trees on the grid
 * 5. Calculate how many new trees are needed
 * 6. Find valid placement positions (grass 'g', dirt 'd', snow 'o' tiles without resources)
 * 7. Place new trees at valid positions
 * 8. Save grid to database
 *
 * @param {string} gridId - MongoDB ObjectId of the grid
 * @returns {Object} Result with counts of trees added and wood removed
 */
async function plantNewTrees(gridId) {
  console.log(`🌳 plantNewTrees called for gridId: ${gridId}`);

  // Load grid
  const grid = await Grid.findById(gridId);
  if (!grid) throw new Error(`Grid not found: ${gridId}`);

  const gridType = grid.gridType;

  // Verify this is a valley grid
  if (!gridType || !gridType.startsWith('valley')) {
    throw new Error(`plantNewTrees only works on valley grids. Current type: ${gridType}`);
  }

  // Get resources
  const resources = gridResourceManager.getResources(grid);

  // Get tiles (decode if needed)
  const tiles = TileEncoder.decode(grid.tiles);

  // Step 1: Remove Wood doobers
  let woodRemoved = 0;
  const filteredResources = resources.filter(r => {
    if (r.type === 'Wood') {
      woodRemoved++;
      return false;
    }
    return true;
  });

  // Step 2: Find target tree quantities from randomValleyGridLayouts.json
  // Get the first layout matching this valley type (variant 1)
  const layoutConfig = randomValleyGridLayouts.find(l => l.valleyType === gridType && l.variant === 1);
  if (!layoutConfig) {
    throw new Error(`No layout config found for valley type: ${gridType}`);
  }

  const targetOakTrees = layoutConfig.r1qty || 0;  // Oak Tree is typically r1
  const targetPineTrees = layoutConfig.r2qty || 0; // Pine Tree is typically r2

  // Verify r1 and r2 are Oak/Pine trees
  if (layoutConfig.r1 !== 'Oak Tree' || layoutConfig.r2 !== 'Pine Tree') {
    console.warn(`⚠️ Layout r1/r2 are not Oak/Pine Trees: r1=${layoutConfig.r1}, r2=${layoutConfig.r2}`);
  }

  // Step 3: Count existing trees
  let existingOakTrees = 0;
  let existingPineTrees = 0;
  filteredResources.forEach(r => {
    if (r.type === 'Oak Tree') existingOakTrees++;
    if (r.type === 'Pine Tree') existingPineTrees++;
  });

  // Step 4: Calculate how many trees to add
  const oakTreesNeeded = Math.max(0, targetOakTrees - existingOakTrees);
  const pineTreesNeeded = Math.max(0, targetPineTrees - existingPineTrees);

  console.log(`🌳 Tree status: Oak ${existingOakTrees}/${targetOakTrees}, Pine ${existingPineTrees}/${targetPineTrees}`);
  console.log(`🌳 Trees needed: Oak +${oakTreesNeeded}, Pine +${pineTreesNeeded}`);

  // Step 5: Find valid placement positions
  // Trees are valid on: grass 'g', dirt 'd', snow 'o'
  const oakTreeDef = masterResources.find(r => r.type === 'Oak Tree');

  // Build set of occupied positions
  const occupiedPositions = new Set();
  filteredResources.forEach(r => {
    occupiedPositions.add(`${r.x},${r.y}`);
  });

  // Find valid empty positions for trees
  const validPositions = [];
  for (let y = 0; y < tiles.length; y++) {
    for (let x = 0; x < tiles[y].length; x++) {
      const posKey = `${x},${y}`;
      if (occupiedPositions.has(posKey)) continue;

      const tileType = tiles[y][x];
      // Check if Oak Tree is valid here (same rules for Pine Tree)
      const validKey = `validon${tileType}`;
      if (oakTreeDef && oakTreeDef[validKey] === true) {
        validPositions.push({ x, y });
      }
    }
  }

  // Shuffle valid positions for random distribution
  shuffleArray(validPositions);

  // Step 6: Place new trees
  let oakTreesAdded = 0;
  let pineTreesAdded = 0;

  // Place Oak Trees first
  for (let i = 0; i < oakTreesNeeded && validPositions.length > 0; i++) {
    const pos = validPositions.pop();
    filteredResources.push({ type: 'Oak Tree', x: pos.x, y: pos.y });
    oakTreesAdded++;
  }

  // Place Pine Trees
  for (let i = 0; i < pineTreesNeeded && validPositions.length > 0; i++) {
    const pos = validPositions.pop();
    filteredResources.push({ type: 'Pine Tree', x: pos.x, y: pos.y });
    pineTreesAdded++;
  }

  // Step 7: Encode and save
  grid.resources = gridResourceManager.encodeResourcesV2(filteredResources);
  await grid.save();

  console.log(`✅ Planted trees: Oak +${oakTreesAdded}, Pine +${pineTreesAdded}, Wood removed: ${woodRemoved}`);

  return {
    success: true,
    gridType,
    woodRemoved,
    oakTreesAdded,
    pineTreesAdded,
    totalTreesNow: existingOakTrees + oakTreesAdded + existingPineTrees + pineTreesAdded,
    targetTrees: targetOakTrees + targetPineTrees
  };
}

// Helper function to shuffle array in place
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

module.exports = { plantNewTrees };
