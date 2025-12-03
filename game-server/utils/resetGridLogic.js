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
  console.log(`🔄 performGridReset called with: gridId=${gridId}, gridType=${gridType}, gridCoord=${gridCoord}`);

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

  } else if (gridType === 'dungeon') {
    // Get the template from frontier's dungeons registry
    if (!frontier || !frontier.dungeons) {
      throw new Error('Frontier or dungeon registry not found');
    }
    
    const dungeonEntry = frontier.dungeons.get(gridId);
    if (!dungeonEntry) {
      throw new Error('Dungeon not found in frontier registry');
    }
    
    const templateFilename = dungeonEntry.templateUsed;
    const templatePath = path.join(__dirname, '../layouts/gridLayouts/dungeon', `${templateFilename}.json`);
    
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template not found: ${templateFilename}`);
    }
    
    layout = readJSON(templatePath);
    layoutFileName = templateFilename;
    isFixedLayout = true; // Dungeons always use fixed layouts
    console.log(`⚔️ Using dungeon template for reset: ${templateFilename}`);

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

  // Generate random enemies for non-fixed layouts
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
  await grid.save({ validateBeforeSave: false });
  console.log(`✅ Grid ${gridId} reset successfully (${gridType})`);
}

module.exports = { performGridReset };