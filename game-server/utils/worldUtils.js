const { readJSON } = require('./fileUtils');
const config = require('../config');
const path = require('path');
const { getTemplate } = require('../utils/templateUtils');
const masterResources = require('../tuning/resources.json');
const mongoose = require('mongoose'); // Import resources.json directly
const resourcesFilePath = path.join(__dirname, '../tuning/resources.json');
console.log('Loading resources ...');
const resourcesData = readJSON(resourcesFilePath);

// Default grid size from config (used when tiles/resources arrays are missing from layout)
const DEFAULT_GRID_SIZE = config.GRID_SIZE || 64;

if (!resourcesData) {
  console.error('Error loading critical JSON files.');
  throw new Error('Failed to load required JSON files.');
}

// Clumping settings for deposit tiles (used on valley grids)
const CLUMP_SIZE = 30;
const CLUMP_VARIATION = 5;
const MIN_CLUMP_SIZE = 5;
const CLUMP_TIGHTNESS = 2.5;

/**
 * Generate a grid of wildcard markers for random tile/resource generation.
 * Used when tiles[] or resources[] arrays are missing from valley templates.
 * @param {number} size - Grid dimension (default from config)
 * @returns {Array} 2D array filled with '**' wildcards
 */
function generateWildcardGrid(size = DEFAULT_GRID_SIZE) {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => '**')
  );
}
 
// Helper function to create a distribution array
function createDistributionArray(tileDistribution) {
  const distributionArray = [];
  Object.entries(tileDistribution).forEach(([tileType, percentage]) => {
    const count = Math.round(percentage * 100); // ✅ Ensure proportional weight
    for (let i = 0; i < count; i++) {
      distributionArray.push(tileType);
    }
  });
  if (distributionArray.length === 0) {
    console.warn("⚠️ Tile distribution array is empty! Defaulting to grass.");
    return ["g"]; // Default fallback to grass if distribution is missing
  }
  //console.log("📊 Generated Tile Distribution Array:", distributionArray.slice(0, 20)); // Debugging
  return distributionArray;
}


/**
 * Generate clumps for a specific deposit tile type
 * @param {Array} tiles - 2D array of tiles to modify (rows x cols)
 * @param {string} layoutkey - The layoutkey for the tile type (e.g., 'SL', 'ZZ', 'CY')
 * @param {number} totalTiles - Total number of tiles to place for this type
 * @param {Array} eligiblePositions - Array of {row, col} positions that are available
 * @returns {Array} Updated eligiblePositions with used positions removed
 */
function generateClumpsForTileType(tiles, layoutkey, totalTiles, eligiblePositions) {
  if (totalTiles <= 0 || eligiblePositions.length === 0) return eligiblePositions;

  console.log(`🪨 Generating clumps for ${layoutkey}: ${totalTiles} tiles requested, ${eligiblePositions.length} positions available`);

  // Calculate clump sizes
  const clumpSizes = [];
  let remaining = totalTiles;
  while (remaining > 0) {
    const variation = Math.floor(Math.random() * (CLUMP_VARIATION * 2 + 1)) - CLUMP_VARIATION;
    const baseSize = Math.max(MIN_CLUMP_SIZE, CLUMP_SIZE + variation);
    const size = Math.min(remaining, baseSize);
    clumpSizes.push(size);
    remaining -= size;
  }

  console.log(`   📊 Clump plan: ${clumpSizes.length} clumps with sizes [${clumpSizes.join(', ')}]`);

  let totalPlaced = 0;

  // Generate each clump
  for (const targetClumpSize of clumpSizes) {
    if (eligiblePositions.length === 0) {
      console.warn(`   ⚠️ Ran out of eligible positions while generating clumps for ${layoutkey}`);
      break;
    }

    // Pick a random starting position
    const startIdx = Math.floor(Math.random() * eligiblePositions.length);
    const startPos = eligiblePositions[startIdx];

    // Build clump by growing outward from start position
    const clumpTiles = [startPos];
    eligiblePositions.splice(startIdx, 1);

    // Track positions we've already added to clump (for faster lookup)
    const clumpSet = new Set([`${startPos.row},${startPos.col}`]);

    while (clumpTiles.length < targetClumpSize && eligiblePositions.length > 0) {
      // Find all eligible neighbors of existing clump tiles
      const validNeighbors = [];

      for (const tile of clumpTiles) {
        const adjacents = [
          { row: tile.row - 1, col: tile.col },     // up
          { row: tile.row + 1, col: tile.col },     // down
          { row: tile.row, col: tile.col - 1 },     // left
          { row: tile.row, col: tile.col + 1 },     // right
          { row: tile.row - 1, col: tile.col - 1 }, // diagonals for more organic shapes
          { row: tile.row - 1, col: tile.col + 1 },
          { row: tile.row + 1, col: tile.col - 1 },
          { row: tile.row + 1, col: tile.col + 1 }
        ];

        for (const adj of adjacents) {
          const key = `${adj.row},${adj.col}`;
          if (!clumpSet.has(key)) {
            // Check if this position is in eligible positions
            const eligibleIdx = eligiblePositions.findIndex(p => p.row === adj.row && p.col === adj.col);
            if (eligibleIdx !== -1) {
              // Count how many clump tiles are adjacent to this position
              const neighbors = [
                { row: adj.row - 1, col: adj.col },
                { row: adj.row + 1, col: adj.col },
                { row: adj.row, col: adj.col - 1 },
                { row: adj.row, col: adj.col + 1 },
                { row: adj.row - 1, col: adj.col - 1 },
                { row: adj.row - 1, col: adj.col + 1 },
                { row: adj.row + 1, col: adj.col - 1 },
                { row: adj.row + 1, col: adj.col + 1 }
              ];
              const adjacentCount = neighbors.filter(n => clumpSet.has(`${n.row},${n.col}`)).length;
              const weight = Math.pow(adjacentCount, CLUMP_TIGHTNESS);
              validNeighbors.push({ row: adj.row, col: adj.col, eligibleIdx, weight });
            }
          }
        }
      }

      if (validNeighbors.length === 0) {
        // No more neighbors available - clump is isolated
        break;
      }

      // Weighted random selection - prefer neighbors with more adjacent clump tiles
      const totalWeight = validNeighbors.reduce((sum, n) => sum + n.weight, 0);
      let randomValue = Math.random() * totalWeight;
      let chosen = validNeighbors[0];
      for (const neighbor of validNeighbors) {
        randomValue -= neighbor.weight;
        if (randomValue <= 0) {
          chosen = neighbor;
          break;
        }
      }

      clumpTiles.push({ row: chosen.row, col: chosen.col });
      clumpSet.add(`${chosen.row},${chosen.col}`);

      // Remove from eligible positions (need to find current index since it may have shifted)
      const currentIdx = eligiblePositions.findIndex(p => p.row === chosen.row && p.col === chosen.col);
      if (currentIdx !== -1) {
        eligiblePositions.splice(currentIdx, 1);
      }
    }

    // Apply clump tiles to the tiles array
    for (const tile of clumpTiles) {
      tiles[tile.row][tile.col] = layoutkey;
      totalPlaced++;
    }

    console.log(`   ✅ Created clump of ${clumpTiles.length} tiles at (${startPos.row}, ${startPos.col})`);
  }

  console.log(`   📍 Total ${layoutkey} tiles placed: ${totalPlaced}/${totalTiles}`);
  return eligiblePositions;
}

function generateGrid(layout, gridType = null) {
  // For valley templates, generate wildcard grid if tiles[] is missing
  const tiles = layout.tiles || generateWildcardGrid(layout.gridSize || DEFAULT_GRID_SIZE);

  const tileDistribution = layout.tileDistribution || {};
  const distributionArray = createDistributionArray(tileDistribution);

  // ============================================================
  // CLUMPING LOGIC: Only applies to valley grids (valley1, valley2, etc.)
  // For all other grid types (homestead, town, dungeon), we use the
  // original random distribution logic below - completely unchanged.
  // ============================================================
  const useClumping = gridType && gridType.startsWith('valley');

  if (useClumping) {
    console.log(`🪨 Using clumping algorithm for valley grid: ${gridType}`);
    return generateGridWithClumping(layout, tileDistribution);
  }

  // ============================================================
  // ORIGINAL LOGIC (unchanged): Used for homestead, town, dungeon, etc.
  // This is the exact same logic that existed before clumping was added.
  // ============================================================
  return tiles.map((row, rowIndex) =>
    row.map((cell, colIndex) => {
      if (cell === '**') {
        const randomTile = distributionArray.length > 0
          ? distributionArray[Math.floor(Math.random() * distributionArray.length)]
          : 'g'; // ✅ Use weighted randomness instead of defaulting to grass

        // ✅ Find the correct layoutkey for the randomTile
        const tileResource = masterResources.find(res => res.type === randomTile && res.category === 'tile');
        return tileResource ? tileResource.layoutkey : 'g'; // ✅ Default to 'GR' if missing
      }
      // ✅ Directly return the correct tile layoutkey
      const tileResource = masterResources.find(res => res.layoutkey === cell && res.category === 'tile');
      return tileResource ? tileResource.layoutkey : 'g'; // ✅ Default to 'GR' if missing
    })
  );
}

/**
 * Generate grid with clumping for deposit tiles.
 * ONLY used for valley grids (valley1, valley2, valley3).
 * Deposit tiles (source='deposit') are placed in clumps for a more natural look.
 * Regular tiles are distributed randomly to fill remaining positions.
 */
function generateGridWithClumping(layout, tileDistribution) {
  // Get tiles array, or generate wildcard grid if missing (for simplified valley templates)
  const layoutTiles = layout.tiles || generateWildcardGrid(layout.gridSize || DEFAULT_GRID_SIZE);

  // First pass: Create the base grid and identify eligible positions for random tiles
  const tiles = layoutTiles.map((row) =>
    row.map((cell) => {
      if (cell === '**') {
        return '**'; // Mark for later processing
      }
      // Directly return the correct tile layoutkey for fixed tiles
      const tileResource = masterResources.find(res => res.layoutkey === cell && res.category === 'tile');
      return tileResource ? tileResource.layoutkey : 'g';
    })
  );

  // Find all positions marked for random generation
  let eligiblePositions = [];
  tiles.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      if (cell === '**') {
        eligiblePositions.push({ row: rowIndex, col: colIndex });
      }
    });
  });

  if (eligiblePositions.length === 0) {
    return tiles; // No random tiles to generate
  }

  const totalEligible = eligiblePositions.length;
  console.log(`📍 Found ${totalEligible} positions for random tile generation`);

  // Build tile counts based on distribution percentages
  // Note: tileDistribution values are whole numbers (e.g., 8 = 8%), not decimals (0.08)
  const tileCounts = {};
  for (const [tileType, percentage] of Object.entries(tileDistribution)) {
    if (percentage > 0) {
      const tileResource = masterResources.find(res => res.type === tileType && res.category === 'tile');
      if (tileResource) {
        // Convert percentage (e.g., 8 for 8%) to actual count
        const count = Math.round((percentage / 100) * totalEligible);
        if (count > 0) {
          tileCounts[tileType] = {
            layoutkey: tileResource.layoutkey,
            count: count,
            isDeposit: tileResource.source === 'deposit'
          };
        }
      }
    }
  }

  // PASS 1: Generate clumps for deposit tiles (source='deposit')
  const depositTiles = Object.entries(tileCounts).filter(([_, data]) => data.isDeposit);

  if (depositTiles.length > 0) {
    console.log(`🪨 Pass 1: Generating clumps for ${depositTiles.length} deposit tile types...`);

    for (const [tileType, data] of depositTiles) {
      eligiblePositions = generateClumpsForTileType(tiles, data.layoutkey, data.count, eligiblePositions);
    }
  }

  // PASS 2: Generate remaining tiles randomly (grass, dirt, sand, etc.)
  const regularTiles = Object.entries(tileCounts).filter(([_, data]) => !data.isDeposit);

  if (regularTiles.length > 0 && eligiblePositions.length > 0) {
    console.log(`🎲 Pass 2: Randomly distributing ${regularTiles.length} regular tile types across ${eligiblePositions.length} remaining positions...`);

    // Build a pool of tiles for random distribution
    let regularPool = [];
    for (const [tileType, data] of regularTiles) {
      for (let i = 0; i < data.count; i++) {
        regularPool.push(data.layoutkey);
      }
    }

    // Shuffle the pool
    shuffleArray(regularPool);

    // Shuffle eligible positions so tiles are distributed randomly across the grid
    // (not biased toward first rows getting the same tiles)
    shuffleArray(eligiblePositions);

    // Assign tiles to remaining positions
    eligiblePositions.forEach(({ row, col }, idx) => {
      // Cycle through pool if we have more positions than tiles
      const tileIdx = idx % regularPool.length;
      tiles[row][col] = regularPool[tileIdx] || 'g'; // Fallback to grass
    });

    console.log(`   ✅ Distributed tiles to ${eligiblePositions.length} positions`);
  }

  // DEBUG: Count layoutkeys before returning
  const layoutkeyCounts = {};
  tiles.forEach(row => row.forEach(t => {
    layoutkeyCounts[t] = (layoutkeyCounts[t] || 0) + 1;
  }));
  console.log(`🔍 DEBUG: Layoutkey counts after clumping:`, layoutkeyCounts);

  return tiles;
}

function generateResources(layout, tiles, resourceDistribution = null) {
  // Get resources array, or generate wildcard grid if missing (for simplified valley templates)
  const layoutResources = layout.resources || generateWildcardGrid(layout.gridSize || DEFAULT_GRID_SIZE);

  console.log("📌 Generating resources with new validation...");

  // DEBUG: Count tile types received
  const receivedTileCounts = {};
  tiles.forEach(row => row.forEach(t => {
    receivedTileCounts[t] = (receivedTileCounts[t] || 0) + 1;
  }));
  console.log(`🔍 DEBUG: generateResources received tiles:`, receivedTileCounts);
  // ✅ Use the provided resourceDistribution or fall back to the template's
  resourceDistribution = resourceDistribution || layout.resourceDistribution || {};
  console.log(`📊 Resource distribution has ${Object.keys(resourceDistribution).length} types:`, Object.keys(resourceDistribution).slice(0, 5));
  const resources = [];
  const availableCells = [];

  // ✅ Step 1: Place Static Resources First
  layoutResources.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell === '**') {
        availableCells.push({ x, y }); // ✅ Keep track of empty spots
      } else {
        const resourceEntry = masterResources.find(res => res.layoutkey === cell);

        if (resourceEntry) {
          if (resourceEntry.category === 'npc') {
            console.log(`📌 Skipping NPC "${resourceEntry.type}" at (${x}, ${y}) – handled separately.`);
          } else {
            const tileType = tiles[y]?.[x] || 'g'; // ✅ Ensure tile type exists
            const validKey = `validon${tileType.toLowerCase()}`;
            const isValid = resourceEntry[validKey] === true;

            if (isValid) {
              resources.push({ type: resourceEntry.type, x, y });
            } else {
              console.warn(`❌ Static resource "${resourceEntry.type}" is not valid on "${tileType}" at (${x},${y}).`);
            }
          }
        } else {
          console.warn(`⚠️ No matching resource for key "${cell}" at (${x},${y}).`);
        }
      }
    });
  });

  // --- Count already-placed statics by type ---
  const alreadyPlacedCounts = {};
  resources.forEach(r => {
    if (!alreadyPlacedCounts[r.type]) alreadyPlacedCounts[r.type] = 0;
    alreadyPlacedCounts[r.type]++;
  });

  // ✅ Step 2: Randomly Place Distributed Resources
  // Pre-group available cells by tile type for efficient lookup
  // This is critical for resources that require specific tiles (e.g., Rocks on slate, Clay Pit on clay)
  const cellsByTileType = {};
  availableCells.forEach(cell => {
    const tileType = tiles[cell.y]?.[cell.x] || 'g';
    if (!cellsByTileType[tileType]) {
      cellsByTileType[tileType] = [];
    }
    cellsByTileType[tileType].push(cell);
  });

  // Shuffle each tile type's cells
  Object.values(cellsByTileType).forEach(cells => shuffleArray(cells));

  // Log available cells by tile type for debugging
  const cellCountsByType = {};
  Object.entries(cellsByTileType).forEach(([type, cells]) => {
    cellCountsByType[type] = cells.length;
  });
  console.log(`📍 Found ${availableCells.length} available cells for random resource placement:`, cellCountsByType);

  Object.entries(resourceDistribution).forEach(([resourceType, quantity]) => {
    const alreadyPlaced = alreadyPlacedCounts[resourceType] || 0;
    let remaining = Math.max(quantity - alreadyPlaced, 0);
    const resourceDefinition = masterResources.find(res => res.type === resourceType);

    if (!resourceDefinition) {
      console.warn(`⚠️ Resource definition not found for "${resourceType}"`);
      return;
    }

    // Find which tile types this resource is valid on
    const validTileTypes = [];
    ['g', 's', 'd', 'w', 'p', 'l', 'n', 'o', 'x', 'y', 'z', 'c', 'v', 'u'].forEach(tileType => {
      const validKey = `validon${tileType}`;
      if (resourceDefinition[validKey] === true) {
        validTileTypes.push(tileType);
      }
    });

    // Place resources on valid tiles
    let placed = 0;
    while (remaining > 0) {
      // Find a valid tile type that has available cells
      let foundCell = null;
      for (const tileType of validTileTypes) {
        if (cellsByTileType[tileType] && cellsByTileType[tileType].length > 0) {
          foundCell = cellsByTileType[tileType].pop();
          break;
        }
      }

      if (!foundCell) {
        if (remaining > 0) {
          console.warn(`⚠️ No valid tiles available for "${resourceType}". Unable to place remaining ${remaining} instances. Valid on: [${validTileTypes.join(', ')}]`);
        }
        break;
      }

      resources.push({ type: resourceType, x: foundCell.x, y: foundCell.y });
      remaining--;
      placed++;
    }

    if (placed > 0 && validTileTypes.length <= 2) {
      // Log placement for resources with specific tile requirements
      console.log(`📍 Placed ${placed} "${resourceType}" on tiles: [${validTileTypes.join(', ')}]`);
    }

    if (remaining > 0) {
      //console.warn(`⚠️ Unable to place ${remaining} instances of "${resourceType}".`);
    }
  });

  return resources;
}

function generateEnemies(layout, tiles, existingNPCs = {}) {
  const enemiesDistribution = layout.enemiesDistribution || {};
  const enemies = {};
  const availableCells = [];

  // Get resources array for checking occupied positions (may be missing in simplified templates)
  const layoutResources = layout.resources || null;

  // Find all walkable tiles that don't already have NPCs or resources
  const occupiedPositions = new Set();

  // Mark existing NPC positions as occupied
  Object.values(existingNPCs).forEach(npc => {
    occupiedPositions.add(`${npc.position.x},${npc.position.y}`);
  });

  // Mark resource positions as occupied (from layout.resources if present)
  if (layoutResources) {
    layoutResources.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell !== '**') {
          occupiedPositions.add(`${x},${y}`);
        }
      });
    });
  }

  // Find available walkable tiles
  tiles.forEach((row, y) => {
    row.forEach((tileType, x) => {
      const posKey = `${x},${y}`;
      if (!occupiedPositions.has(posKey)) {
        // Check if it's a walkable tile (not water, not mountain)
        const tileResource = masterResources.find(r => r.type === tileType && r.category === 'tile');
        if (tileResource && !tileResource.blocksmovement) {
          availableCells.push({ x, y, tileType });
        }
      }
    });
  });

  shuffleArray(availableCells);

  // Generate enemies based on distribution
  Object.entries(enemiesDistribution).forEach(([enemyType, quantity]) => {
    const enemyDef = masterResources.find(res => res.type === enemyType && res.category === 'npc');
    if (!enemyDef) {
      console.warn(`⚠️ Enemy type "${enemyType}" not found in masterResources`);
      return;
    }

    let remaining = quantity;
    let retries = 0;
    const maxRetries = 10;

    while (remaining > 0 && availableCells.length > 0) {
      if (retries >= maxRetries) {
        console.warn(`⚠️ Max retries reached for "${enemyType}". Unable to place remaining ${remaining} instances.`);
        break;
      }

      const { x, y, tileType } = availableCells.pop();
      const validKey = `validon${tileType.toLowerCase()}`;
      const isValid = enemyDef[validKey] === true;

      if (isValid) {
        const npcId = new mongoose.Types.ObjectId().toString();
        enemies[npcId] = {
          id: npcId,
          type: enemyType,
          position: { x, y },
          state: enemyDef.defaultState || 'idle',
          hp: enemyDef.maxhp || 10,
          maxhp: enemyDef.maxhp || 10,
          armorclass: enemyDef.armorclass || 10,
          attackbonus: enemyDef.attackbonus || 0,
          damage: enemyDef.damage || 1,
          attackrange: enemyDef.attackrange || 1,
          speed: enemyDef.speed || 1,
          lastUpdated: 0,
        };
        remaining--;
        retries = 0;
      } else {
        availableCells.unshift({ x, y, tileType }); // Put it back
        retries++;
      }
    }

    if (remaining > 0) {
      console.warn(`⚠️ Unable to place ${remaining} instances of enemy "${enemyType}".`);
    }
  });

  return enemies;
}

function generateFixedGrid(layout) {
  if (!layout.tiles) {
    throw new Error('Invalid layout: Missing "tiles".');
  }
  return layout.tiles.map((row, rowIndex) =>
    row.map((cell, colIndex) => {
      // ✅ Lookup layoutkey and translate it to DB-friendly value
      const tileResource = masterResources.find(res => res.layoutkey === cell && res.category === "tile");
      return tileResource ? tileResource.type : 'g'; // fallback to grass
    })
  );
}

function generateFixedResources(layout) {
  if (!layout.resources) {
    throw new Error('Invalid layout: Missing "resources".');
  }

  const resources = [];

  layout.resources.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell === '**') return; // skip empty cells

      const resourceEntry = masterResources.find(res => res.layoutkey === cell);

      if (resourceEntry) {
        if (resourceEntry.category === 'npc') {
          console.log(`📌 Skipping NPC "${resourceEntry.type}" at (${x}, ${y}) – handled separately.`);
        } else {
          resources.push({ type: resourceEntry.type, x, y });
        }
      } else {
        console.warn(`⚠️ No matching resource for key "${cell}" at (${x},${y}).`);
      }
    });
  });

  return resources;
}



// Helper function to determine if a resource is an NPC
const isNPC = (resource) => {
  const npcEntry = masterResources.find(item => item.type === resource);
  return npcEntry?.category === 'npc';
};

// Helper function to determine if a resource is a crop
function isACrop(resourceType) {
  // Exclude trees from being considered crops
  if (resourceType === 'Oak Tree' || resourceType === 'Pine Tree') {
    return false;
  }
  
  // Check if this item is the output of any farmplot resource
  return masterResources.some(resource => 
    resource.category === 'farmplot' && resource.output === resourceType
  );
}

// Utility to shuffle an array (Fisher-Yates shuffle)
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}


module.exports = {
//  tileTypes,
  generateGrid,
  generateResources,
  generateEnemies,
//  lookupLayoutKey,
  isNPC,
  isACrop,
  generateFixedGrid,
  generateFixedResources,
};
