// resetGridLogic.js 
const Grid = require('../models/grid');
const Frontier = require('../models/frontier');
const path = require('path');
const fs = require('fs');
const { generateGrid, generateResources, generateFixedGrid, generateFixedResources, generateEnemies } = require('./worldUtils');
const { readJSON } = require('./fileUtils');const { ObjectId } = require('mongodb');
const masterResources = require('../tuning/resources.json');
const { getTemplate, getHomesteadLayoutFile, getTownLayoutFile, getPositionFromSettlementType } = require('./templateUtils');
const Settlement = require('../models/settlement');
const seasonsConfig = require('../tuning/seasons.json');
const UltraCompactResourceEncoder = require('./ResourceEncoder');
const TileEncoder = require('./TileEncoder');

async function performGridReset(gridId, gridType, gridCoord) {
  const grid = await Grid.findById(gridId);
  if (!grid) throw new Error(`Grid not found: ${gridId}`);

  const frontier = await Frontier.findById(grid.frontierId);
  const seasonType = frontier?.seasons?.seasonType || 'default';

  // Load layout
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

  } else {
    console.log(`🔍 Fetching layout for gridType: ${gridType}, gridCoord: ${gridCoord}`);
    const fixedCoordPath = path.join(__dirname, `../layouts/gridLayouts/valleyFixedCoord/${gridCoord}.json`);
    console.log(`🔍 Checking for fixed-coordinate layout at: ${fixedCoordPath}`);
    if (fs.existsSync(fixedCoordPath)) {
      layout = readJSON(fixedCoordPath);
      layoutFileName = `${gridCoord}.json`;
      isFixedLayout = true;
      console.log(`📌 Using fixed-coordinate layout: ${layoutFileName}`);
    } else {
      const layoutInfo = getTemplate('gridLayouts', gridType, gridCoord);
      layout = layoutInfo.template;
      layoutFileName = layoutInfo.fileName;
      console.log(`📦 Using standard grid layout: ${layoutFileName}`);
    }
  }

  if (!layout?.tiles || !layout?.resources) {
    throw new Error(`Invalid layout for gridType: ${gridType}`);
  }

  // For town grids, apply seasonTownCrops from seasons.json
  let resourceDistribution = layout.resourceDistribution || {};
  if (gridType === 'town') {
    const seasonData = seasonsConfig.find(s => s.seasonType === seasonType);
    if (seasonData && seasonData.seasonTownCrops) {
      resourceDistribution = seasonData.seasonTownCrops;
      console.log(`🌻 Applying seasonTownCrops for ${seasonType} town: ${Object.keys(resourceDistribution).length} resource types`);
    } else {
      console.warn(`⚠️ No seasonTownCrops found for season: ${seasonType}`);
    }
  }

  const newTiles = isFixedLayout
    ? generateFixedGrid(layout)
    : generateGrid(layout, layout.tileDistribution).map(row =>
        row.map(layoutKey => {
          const tileRes = masterResources.find(r => r.layoutkey === layoutKey && r.category === 'tile');
          return tileRes ? tileRes.type : 'g';
        })
      );

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
  layout.resources.forEach((row, y) => {
    row.forEach((cell, x) => {
      const res = masterResources.find(r => r.layoutkey === cell && r.category === 'npc');
      if (!res) return;
      const npcId = new ObjectId();
      newNPCs[npcId.toString()] = {
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
    });
  });

  // Generate random enemies for non-fixed layouts
  if (!isFixedLayout && layout.enemiesDistribution) {
    const newEnemies = generateEnemies(layout, newTiles, newNPCs);
    // Merge the generated enemies into the existing NPCs
    Object.assign(newNPCs, newEnemies);
    console.log(`🎯 Generated ${Object.keys(newEnemies).length} enemies for grid reset ${gridCoord}`);
  }

  // Handle tiles and resources based on existing schema version
  const currentResourcesVersion = grid.resourcesSchemaVersion || 'v1';
  const currentTilesVersion = grid.tilesSchemaVersion || 'v1';
  
  if (currentResourcesVersion === 'v2') {
    // Grid is already v2 - encode resources to v2 format
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
    
    grid.resourcesV2 = encodedResources;
    console.log(`📦 Reset v2 resources: ${encodedResources.length} encoded resources`);
  } else {
    // Grid is v1 - keep using v1 format for backwards compatibility
    grid.resources = filteredResources;
    console.log(`📦 Reset v1 resources: ${filteredResources.length} resources`);
  }
  
  if (currentTilesVersion === 'v2') {
    // Grid is already v2 - encode tiles to v2 format
    try {
      const encodedTiles = TileEncoder.encode(newTiles);
      grid.tilesV2 = encodedTiles;
      console.log(`📦 Reset v2 tiles: ${encodedTiles.length} chars`);
    } catch (error) {
      console.error(`❌ Failed to encode tiles during reset:`, error);
      throw new Error(`Failed to encode tiles: ${error.message}`);
    }
  } else {
    // Grid is v1 - keep using v1 format for backwards compatibility
    grid.tiles = newTiles;
    console.log(`📦 Reset v1 tiles: 64x64 grid`);
  }
  
  // Properly clear NPCs to avoid duplicates
  grid.NPCsInGrid.clear(); // Clear the existing map
  grid.markModified('NPCsInGrid'); // Mark as modified to ensure MongoDB saves the change
  
  // Now add the new NPCs
  Object.entries(newNPCs).forEach(([key, npc]) => {
    grid.NPCsInGrid.set(key, npc);
  });
  
  grid.NPCsInGridLastUpdated = Date.now();
  grid.markModified('NPCsInGrid'); // Mark as modified again after adding new NPCs
  grid.lastOptimized = new Date(); // Update optimization timestamp

  await grid.save();
  console.log(`✅ Grid ${gridId} reset successfully (${gridType})`);
}

module.exports = { performGridReset };