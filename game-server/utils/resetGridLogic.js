// resetGridLogic.js 
const Grid = require('../models/grid');
const Frontier = require('../models/frontier');
const path = require('path');
const fs = require('fs');
const { generateGrid, generateResources, generateFixedGrid, generateFixedResources, generateEnemies } = require('./worldUtils');
const { readJSON } = require('./fileUtils');const { ObjectId } = require('mongodb');
const masterResources = require('../tuning/resources.json');
const { getTemplate, getRandomValleyLayout, getHomesteadLayoutFile, getTownLayoutFile, getPositionFromSettlementType } = require('./templateUtils');
const Settlement = require('../models/settlement');
const seasonsConfig = require('../tuning/seasons.json');
const UltraCompactResourceEncoder = require('./ResourceEncoder');
const TileEncoder = require('./TileEncoder');

/**
 * Resets a grid to its initial state, regenerating tiles, resources, and NPCs.
 *
 * === LAYOUT TYPES ===
 *
 * There are two fundamentally different ways a grid can be reset:
 *
 * 1. FIXED LAYOUT (isFixedLayout = true)
 *    - Used when a valleyFixedCoord/{gridCoord}.json file exists, or for dungeons
 *    - The layout file contains explicit tile and resource placements
 *    - Every tile position is pre-defined (no '**' wildcards)
 *    - Resources are placed at exact positions specified in the layout
 *    - Uses: generateFixedGrid() and generateFixedResources()
 *    - Result: Grid looks identical every time it's reset
 *
 * 2. RANDOM LAYOUT (isFixedLayout = false)
 *    - Used when no valleyFixedCoord file exists for this grid coordinate
 *    - Falls back to a template file (e.g., valley1/default.json)
 *    - Template contains '**' wildcards that get filled randomly
 *    - Tiles are generated based on tileDistribution percentages
 *    - Resources are generated based on resourceDistribution quantities
 *    - Uses: generateGrid() and generateResources()
 *    - For valley grids: deposit tiles (slate, clay, etc.) are clumped together
 *    - Result: Grid looks different each time it's reset
 *
 * === GRID TYPE SPECIFICS ===
 *
 * - homestead: Always uses seasonal layout from homestead/ folder (random generation)
 * - town: Uses seasonal layout with position variant (random generation)
 * - dungeon: Always uses fixed layout from dungeons registry
 * - valley*: Checks for valleyFixedCoord first, falls back to random with clumping
 *
 * @param {string} gridId - The MongoDB ObjectId of the grid to reset
 * @param {string} gridType - The type of grid (homestead, town, dungeon, valley1, etc.)
 * @param {string} gridCoord - The coordinate string (e.g., "0,0", "1,-2")
 */
async function performGridReset(gridId, gridType, gridCoord) {
  console.log(`🔄 performGridReset called with: gridId=${gridId}, gridType=${gridType}, gridCoord=${gridCoord}`);

  const grid = await Grid.findById(gridId);
  if (!grid) throw new Error(`Grid not found: ${gridId}`);

  const frontier = await Frontier.findById(grid.frontierId);
  const seasonType = frontier?.seasons?.seasonType || 'default';

  // ============================================================
  // LAYOUT SELECTION
  // Determines whether to use a fixed layout (exact positions) or
  // a random layout (generated from distribution percentages)
  // ============================================================
  let layout, layoutFileName, isFixedLayout = false;
  if (gridType === 'homestead') {
    const layoutFile = getHomesteadLayoutFile(seasonType);
    const seasonalPath = path.join(__dirname, '../layouts/gridLayouts/homestead', layoutFile);
    layout = readJSON(seasonalPath);
    layoutFileName = layoutFile;
    console.log(`🗓️ Using seasonal homestead layout for reset: ${layoutFile}`);

  } else if (gridType === 'town') {
    // Get settlement position from settlementType in the Frontier document
    let position = '';
    
    // Find the settlement in frontier.settlements array
    if (frontier && frontier.settlements) {
      for (const row of frontier.settlements) {
        const settlementEntry = row.find(s => s.settlementId.toString() === grid.settlementId.toString());
        if (settlementEntry) {
          position = getPositionFromSettlementType(settlementEntry.settlementType);
          console.log(`🔍 Found settlement in frontier: settlementType=${settlementEntry.settlementType}, position=${position}`);
          break;
        }
      }
    }
    
    const layoutFile = getTownLayoutFile(seasonType, position);
    const seasonalPath = path.join(__dirname, '../layouts/gridLayouts/town', layoutFile);
    layout = readJSON(seasonalPath);
    layoutFileName = layoutFile;
    console.log(`🗓️ Using town layout for reset - position: ${position || 'default'}, season: ${seasonType}, layout: ${layoutFile}`);

  } else if (gridType === 'dungeon') {
    // Get the template from frontier's dungeons registry
    console.log(`🔍 [DUNGEON RESET DEBUG] gridId: ${gridId}, type: ${typeof gridId}`);
    console.log(`🔍 [DUNGEON RESET DEBUG] frontier exists: ${!!frontier}, dungeons exists: ${!!frontier?.dungeons}`);

    if (!frontier || !frontier.dungeons) {
      throw new Error('Frontier or dungeon registry not found');
    }

    // Debug: List all dungeon keys in the registry
    console.log(`🔍 [DUNGEON RESET DEBUG] Dungeon registry keys:`, Array.from(frontier.dungeons.keys()));

    // Try both string and direct lookup
    let dungeonEntry = frontier.dungeons.get(gridId);
    if (!dungeonEntry) {
      // Try with toString() in case of ObjectId mismatch
      dungeonEntry = frontier.dungeons.get(gridId.toString());
      if (dungeonEntry) {
        console.log(`🔍 [DUNGEON RESET DEBUG] Found with toString() conversion`);
      }
    }

    if (!dungeonEntry) {
      console.error(`❌ [DUNGEON RESET DEBUG] Dungeon not found. gridId: ${gridId}`);
      throw new Error(`Dungeon not found in frontier registry. gridId: ${gridId}`);
    }

    const templateFilename = dungeonEntry.templateUsed;
    console.log(`🔍 [DUNGEON RESET DEBUG] templateUsed from registry: "${templateFilename}"`);

    const templatePath = path.join(__dirname, '../layouts/gridLayouts/dungeon', `${templateFilename}.json`);
    console.log(`🔍 [DUNGEON RESET DEBUG] Full template path: ${templatePath}`);
    console.log(`🔍 [DUNGEON RESET DEBUG] File exists: ${fs.existsSync(templatePath)}`);

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template not found: ${templateFilename} at path: ${templatePath}`);
    }

    layout = readJSON(templatePath);
    console.log(`🔍 [DUNGEON RESET DEBUG] Layout loaded, tiles rows: ${layout?.tiles?.length}, resources rows: ${layout?.resources?.length}`);

    layoutFileName = templateFilename;
    isFixedLayout = true; // Dungeons always use fixed layouts
    console.log(`⚔️ Using dungeon template for reset: ${templateFilename}`);

  } else {
    // ============================================================
    // VALLEY GRIDS: Check for fixed layout first, fall back to random
    // ============================================================
    console.log(`🔍 Fetching layout for gridType: ${gridType}, gridCoord: ${gridCoord}`);

    // First, check if a hand-crafted fixed layout exists for this exact coordinate
    // These are stored in valleyFixedCoord/ and contain exact tile/resource positions
    const fixedCoordPath = path.join(__dirname, `../layouts/gridLayouts/valleyFixedCoord/${gridCoord}.json`);
    console.log(`🔍 Checking for fixed-coordinate layout at: ${fixedCoordPath}`);

    if (fs.existsSync(fixedCoordPath)) {
      // FIXED LAYOUT: Use exact positions from the valleyFixedCoord file
      // The grid will look identical every time it's reset
      layout = readJSON(fixedCoordPath);
      layoutFileName = `${gridCoord}.json`;
      isFixedLayout = true;
      console.log(`📌 Using fixed-coordinate layout: ${layoutFileName}`);
    } else {
      // ============================================================
      // RANDOM LAYOUT: Use unified randomValleyGridLayouts.json
      // ============================================================
      // The getRandomValleyLayout function:
      // - Selects a random layout from layouts matching this gridType (valley1/2/3)
      // - Parses tile distribution from single-letter keys (g, s, d, c, z, etc.)
      // - Parses resource distribution from r1/r1qty, r2/r2qty, etc.
      // - Parses enemy distribution from e1/e1qty, e2/e2qty, etc.
      // For valley grids, deposit tiles will be clumped together (see generateGrid)
      layout = getRandomValleyLayout(gridType);
      if (!layout) {
        throw new Error(`No valley layout found for gridType: ${gridType}`);
      }
      layoutFileName = layout.layoutName || gridType;
      console.log(`📦 Using random valley layout: ${layoutFileName}`);
    }
  }

  // Valley random templates may omit tiles[] and resources[] arrays (all wildcards)
  // Fixed layouts and non-valley grids still require them
  const isValleyRandom = gridType?.startsWith('valley') && !isFixedLayout;
  if (!isValleyRandom && (!layout?.tiles || !layout?.resources)) {
    throw new Error(`Invalid layout for gridType: ${gridType}`);
  }

  // For town and homestead grids, apply seasonal crops from seasons.json
  let resourceDistribution = layout.resourceDistribution || {};
  console.log(`🔍 [RESOURCE DEBUG] gridType=${gridType}, seasonType=${seasonType}`);
  console.log(`🔍 [RESOURCE DEBUG] layout.resourceDistribution keys: ${Object.keys(layout.resourceDistribution || {}).length}`);

  if (gridType === 'town' || gridType === 'homestead') {
    const seasonData = seasonsConfig.find(s => s.seasonType === seasonType);
    console.log(`🔍 [RESOURCE DEBUG] seasonData found: ${!!seasonData}`);
    if (seasonData) {
      if (gridType === 'town' && seasonData.seasonTownCrops) {
        resourceDistribution = seasonData.seasonTownCrops;
        console.log(`🌻 Applying seasonTownCrops for ${seasonType} town: ${Object.keys(resourceDistribution).length} resource types`);
        console.log(`🔍 [RESOURCE DEBUG] seasonTownCrops resources: ${Object.keys(resourceDistribution).join(', ')}`);
      } else if (gridType === 'homestead' && seasonData.seasonHomesteadCrops) {
        resourceDistribution = seasonData.seasonHomesteadCrops;
        console.log(`🏡 Applying seasonHomesteadCrops for ${seasonType} homestead: ${Object.keys(resourceDistribution).length} resource types`);
      } else {
        console.warn(`⚠️ No seasonal crops found for ${gridType} in season: ${seasonType}`);
      }
    } else {
      console.warn(`⚠️ No season data found for: ${seasonType}`);
    }
  }

  // ============================================================
  // TILE GENERATION
  // ============================================================
  // FIXED: generateFixedGrid() reads exact tile positions from layout
  // RANDOM: generateGrid() fills '**' wildcards using tileDistribution percentages
  //         For valley grids, deposit tiles (slate, clay, etc.) are placed in
  //         natural-looking clumps rather than scattered randomly
  const unknownLayoutkeys = new Set();
  const newTiles = isFixedLayout
    ? generateFixedGrid(layout)
    : generateGrid(layout, gridType).map(row =>
        row.map(layoutKey => {
          // Convert layoutKey (e.g., 'GR', 'SL') to tile type (e.g., 'g', 's')
          const tileRes = masterResources.find(r => r.layoutkey === layoutKey && r.category === 'tile');
          if (!tileRes && layoutKey !== '**') {
            unknownLayoutkeys.add(layoutKey);
          }
          return tileRes ? tileRes.type : 'g';
        })
      );
  if (unknownLayoutkeys.size > 0) {
    console.warn(`⚠️ Unknown layoutkeys during conversion:`, Array.from(unknownLayoutkeys));
  }

  // DEBUG: Count tile types after conversion (before snow)
  if (!isFixedLayout && gridType?.startsWith('valley')) {
    const tileCounts = {};
    newTiles.forEach(row => row.forEach(t => {
      tileCounts[t] = (tileCounts[t] || 0) + 1;
    }));
    console.log(`🔍 DEBUG: Tile counts after conversion:`, tileCounts);
  }

  // Apply snow tiles for Winter (convert grass 'g' to snow 'o')
  // Note: Dungeons should never have snow applied - they are underground/indoor environments
  if ((seasonType === 'Winter' || seasonType === 'winter') && gridType !== 'dungeon') {
    let snowTileCount = 0;
    for (let y = 0; y < newTiles.length; y++) {
      for (let x = 0; x < newTiles[y].length; x++) {
        if (newTiles[y][x] === 'g') {
          newTiles[y][x] = 'o';
          snowTileCount++;
        }
      }
    }
    console.log(`❄️ Applied snow to ${snowTileCount} tiles for Winter ${gridType} reset at ${gridCoord}`);
  }

  // ============================================================
  // RESOURCE GENERATION
  // ============================================================
  // FIXED: generateFixedResources() reads exact resource positions from layout
  // RANDOM: generateResources() places resources at available '**' positions
  //         based on resourceDistribution quantities, validating each placement
  //         against tile compatibility (e.g., trees only on grass/dirt)
  const newResources = isFixedLayout
    ? generateFixedResources(layout)
    : generateResources(layout, newTiles, resourceDistribution);
  
  // Enrich multi-tile resources with anchorKey and passable properties
  // Note: Shadow tiles are created on the client side only, not stored in DB
  newResources.forEach(resource => {
    const resourceDef = masterResources.find(r => r.type === resource.type);
    if (resourceDef && resourceDef.range > 1) {
      // Add anchorKey to the main resource for client-side shadow generation
      resource.anchorKey = `${resource.type}_${resource.x}_${resource.y}`;
      
      // Ensure the main resource has the passable property
      if (resourceDef.passable !== undefined) {
        resource.passable = resourceDef.passable;
      }
    }
  });

  // Remove any "Stub" resources before finalizing the grid
  const filteredResources = newResources.filter(resource => resource.type !== 'Stub');
  
  if (newResources.length !== filteredResources.length) {
    console.log(`🧹 Removed ${newResources.length - filteredResources.length} Stub resource(s) from grid at ${gridCoord}`);
  }

  const newNPCs = {};
  // Static NPCs from layout (if resources array exists - may be missing in simplified valley templates)
  if (layout.resources) {
    layout.resources.forEach((row, y) => {
      row.forEach((cell, x) => {
        const res = masterResources.find(r => r.layoutkey === cell && r.category === 'npc');
        if (!res) return;
      const npcId = new ObjectId();
      const npcData = {
        id: npcId.toString(),
        type: res.type,
        position: { x, y },
        state: res.defaultState || 'idle',
        hp: res.maxhp || 10,
        maxhp: res.maxhp || 10,
        armorclass: res.armorclass || 10,
        attackbonus: res.attackbonus || 0,
        damage: res.damage || 1,
        attackrange: res.attackrange || 1,
        speed: res.speed || 1,
        lastUpdated: 0
      };

      // For spawner NPCs, include essential spawner-specific properties
      if (res.action === 'spawn') {
        npcData.action = res.action;
        npcData.requires = res.requires;
        npcData.qtycollected = res.qtycollected;
        npcData.range = res.range;
      }

      newNPCs[npcId.toString()] = npcData;
      });
    });
  }

  // ============================================================
  // ENEMY GENERATION (random layouts only)
  // ============================================================
  // Fixed layouts place NPCs at exact positions from the layout file
  // Random layouts generate enemies based on enemiesDistribution quantities
  if (!isFixedLayout && layout.enemiesDistribution) {
    const newEnemies = generateEnemies(layout, newTiles, newNPCs);
    // Merge the generated enemies into the existing NPCs
    Object.assign(newNPCs, newEnemies);
    console.log(`🎯 Generated ${Object.keys(newEnemies).length} enemies for grid reset ${gridCoord}`);
  }

  // V2-only: All grids now use compressed format
  const encoder = new UltraCompactResourceEncoder(masterResources);
  const encodedResources = [];
  
  for (const resource of filteredResources) {
    try {
      const encoded = encoder.encode(resource);
      encodedResources.push(encoded);
    } catch (error) {
      console.error(`❌ Failed to encode resource during reset:`, resource, error);
      throw new Error(`Failed to encode resource at (${resource.x}, ${resource.y}): ${error.message}`);
    }
  }
  
  grid.resources = encodedResources;
  console.log(`📦 Reset resources: ${encodedResources.length} encoded resources`);
  
  // V2-only: All grids now use compressed tiles
  try {
    const encodedTiles = TileEncoder.encode(newTiles);
    grid.tiles = encodedTiles;
    console.log(`📦 Reset tiles: ${encodedTiles.length} chars`);
  } catch (error) {
    console.error(`❌ Failed to encode tiles during reset:`, error);
    throw new Error(`Failed to encode tiles: ${error.message}`);
  }
  
  // Replace the entire NPCsInGrid Map to avoid ghost entries from .clear()
  grid.NPCsInGrid = new Map(Object.entries(newNPCs));
  grid.NPCsInGridLastUpdated = Date.now();
  grid.lastOptimized = new Date(); // Update optimization timestamp

  // Skip validation to handle any pre-existing corrupted NPCs
  console.log(`🔍 [DUNGEON RESET DEBUG] About to save grid._id: ${grid._id}, resources count: ${grid.resources.length}`);
  await grid.save({ validateBeforeSave: false });
  console.log(`✅ Grid ${gridId} reset successfully (${gridType}) - saved to DB`);
}

module.exports = { performGridReset };