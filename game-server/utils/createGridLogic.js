// game-server/utils/gridCreationLogic.js
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const Settlement = require('../models/settlement');
const Frontier = require('../models/frontier');
const Grid = require('../models/grid');
const { readJSON } = require('./fileUtils');
const { getTemplate, getHomesteadLayoutFile, getTownLayoutFile, getPositionFromSettlementType } = require('./templateUtils');
const masterResources = require('../tuning/resources.json');
const { generateGrid, generateResources, generateFixedGrid, generateFixedResources, generateEnemies } = require('./worldUtils');
const seasonsConfig = require('../tuning/seasons.json');
const UltraCompactResourceEncoder = require('./ResourceEncoder');
const TileEncoder = require('./TileEncoder');

async function performGridCreation({ gridCoord, gridType, settlementId, frontierId }) {
  if (!gridCoord || !gridType || !settlementId || !frontierId) {
    throw new Error('gridCoord, gridType, settlementId, and frontierId are required.');
  }

  let settlement = await Settlement.findById(settlementId);
  if (!settlement) {
    const allSettlements = await Settlement.find({});
    for (const s of allSettlements) {
      const match = s.grids.flat().find(g => g.gridCoord === Number(gridCoord));
      if (match) {
        settlement = s;
        break;
      }
    }
    if (!settlement) throw new Error('Settlement not found for gridCoord: ' + gridCoord);
  }

  const frontier = await Frontier.findById(frontierId);
  if (!frontier) throw new Error('Frontier not found.');

  const targetGrid = settlement.grids.flat().find(g => g.gridCoord === Number(gridCoord));
  if (!targetGrid) throw new Error(`No sub-grid found in settlement for gridCoord: ${gridCoord}`);

  const seasonType = frontier.seasons?.seasonType || 'default';
  let layoutFileName, layout, isFixedLayout = false;

  if (gridType === 'homestead') {
    layoutFileName = getHomesteadLayoutFile(seasonType);
    layout = readJSON(path.join(__dirname, '../layouts/gridLayouts/homestead', layoutFileName));
  } else if (gridType === 'town') {
    // Get settlement position from settlementType in the Frontier document
    let position = '';
    
    // Find the settlement in frontier.settlements array
    if (frontier.settlements) {
      for (const row of frontier.settlements) {
        const settlementEntry = row.find(s => s.settlementId.toString() === settlementId.toString());
        if (settlementEntry) {
          position = getPositionFromSettlementType(settlementEntry.settlementType);
          console.log(`🔍 Found settlement in frontier: settlementType=${settlementEntry.settlementType}, position=${position}`);
          break;
        }
      }
    }
    
    layoutFileName = getTownLayoutFile(seasonType, position);
    layout = readJSON(path.join(__dirname, '../layouts/gridLayouts/town', layoutFileName));
    console.log(`🏘️ Creating town with position: ${position || 'default'}, season: ${seasonType}, layout: ${layoutFileName}`);
  } else {
    const fixedPath = path.join(__dirname, `../layouts/gridLayouts/valleyFixedCoord/${gridCoord}.json`);
    if (fs.existsSync(fixedPath)) {
      layoutFileName = `${gridCoord}.json`;
      layout = readJSON(fixedPath);
      isFixedLayout = true;
    } else {
      const templateData = getTemplate('gridLayouts', gridType, gridCoord);
      layoutFileName = templateData.fileName;
      layout = templateData.template;
    }
  }

  if (!layout || !layout.tiles || !layout.resources) {
    throw new Error(`Invalid layout: ${layoutFileName}`);
  }

  // For town and homestead grids, apply seasonal crops from seasons.json
  let resourceDistribution = layout.resourceDistribution || {};
  if (gridType === 'town' || gridType === 'homestead') {
    const seasonData = seasonsConfig.find(s => s.seasonType === seasonType);
    if (seasonData) {
      if (gridType === 'town' && seasonData.seasonTownCrops) {
        resourceDistribution = seasonData.seasonTownCrops;
        console.log(`🌻 Applying seasonTownCrops for ${seasonType} town: ${Object.keys(resourceDistribution).length} resource types`);
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

  // Pass gridType to generateGrid so valley grids use clumping for deposit tiles
  const newTiles = isFixedLayout
    ? generateFixedGrid(layout)
    : generateGrid(layout, gridType).map(row =>
        row.map(k => {
          const tile = masterResources.find(r => r.layoutkey === k && r.category === 'tile');
          return tile?.type || 'g';
        }));

  // Apply snow tiles for Winter (convert grass 'g' to snow 'o')
  console.log(`🌨️ Season check for ${gridType} at ${gridCoord}: seasonType="${seasonType}"`);
  if (seasonType === 'Winter' || seasonType === 'winter') {
    let snowTileCount = 0;
    for (let y = 0; y < newTiles.length; y++) {
      for (let x = 0; x < newTiles[y].length; x++) {
        if (newTiles[y][x] === 'g') {
          newTiles[y][x] = 'o';
          snowTileCount++;
        }
      }
    }
    console.log(`❄️ Applied snow to ${snowTileCount} tiles for Winter ${gridType} at ${gridCoord}`);
  }

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

  const newGridState = { npcs: {} };
  layout.resources.forEach((row, y) => {
    row.forEach((cell, x) => {
      const entry = masterResources.find(res => res.layoutkey === cell && res.category === 'npc');
      if (entry) {
        const npcId = new mongoose.Types.ObjectId().toString();
        newGridState.npcs[npcId] = {
          id: npcId,
          type: entry.type,
          position: { x, y },
          state: entry.defaultState || 'idle',
          hp: entry.maxhp || 10,
          maxhp: entry.maxhp || 10,
          armorclass: entry.armorclass || 10,
          attackbonus: entry.attackbonus || 0,
          damage: entry.damage || 1,
          attackrange: entry.attackrange || 1,
          speed: entry.speed || 1,
          lastUpdated: 0,
        };
      }
    });
  });

  // Generate random enemies for non-fixed layouts
  if (!isFixedLayout && layout.enemiesDistribution) {
    const newEnemies = generateEnemies(layout, newTiles, newGridState.npcs);
    // Merge the generated enemies into the existing NPCs
    Object.assign(newGridState.npcs, newEnemies);
    console.log(`🎯 Generated ${Object.keys(newEnemies).length} enemies for grid ${gridCoord}`);
  }

  // Remove any "Stub" resources before finalizing the grid
  const filteredResources = newResources.filter(resource => resource.type !== 'Stub');
  
  if (newResources.length !== filteredResources.length) {
    console.log(`🧹 Removed ${newResources.length - filteredResources.length} Stub resource(s) from grid at ${gridCoord}`);
  }

  // Encode resources and tiles to v2 format for new grids
  const encoder = new UltraCompactResourceEncoder(masterResources);
  
  // Encode resources to v2 format
  const encodedResources = [];
  for (const resource of filteredResources) {
    try {
      const encoded = encoder.encode(resource);
      encodedResources.push(encoded);
    } catch (error) {
      console.error(`❌ Failed to encode resource:`, resource, error);
      throw new Error(`Failed to encode resource at (${resource.x}, ${resource.y}): ${error.message}`);
    }
  }

  // Encode tiles to v2 format
  let encodedTiles;
  try {
    encodedTiles = TileEncoder.encode(newTiles);
  } catch (error) {
    console.error(`❌ Failed to encode tiles:`, error);
    throw new Error(`Failed to encode tiles: ${error.message}`);
  }

  // Create grid with v2 schema only (no v1 fields)
  const newGrid = new Grid({
    gridType,
    frontierId,
    settlementId,
    resources: encodedResources,
    tiles: encodedTiles,
    NPCsInGrid: new Map(Object.entries(newGridState.npcs)),
    NPCsInGridLastUpdated: Date.now(),
    lastOptimized: new Date()
  });

  console.log(`📦 Created grid: ${encodedResources.length} resources, ${encodedTiles.length} chars tiles`);

  await newGrid.save();

  targetGrid.available = false;
  targetGrid.gridId = newGrid._id;
  await settlement.save();

  return { success: true, gridId: newGrid._id, message: 'Grid created successfully.' };
}

// Claim a homestead grid for a player
async function claimHomestead(gridId, playerId) {
  if (!playerId) throw new Error('No playerId provided to claim homestead.');

  const grid = await Grid.findById(gridId);
  if (!grid) throw new Error('Grid not found.');

  if (grid.gridType !== 'homestead') {
    throw new Error('Cannot claim a non-homestead grid.');
  }

  if (grid.ownerId) {
    throw new Error('Homestead is already claimed.');
  }

  grid.ownerId = playerId;
  await grid.save();
  return { success: true, message: 'Homestead claimed successfully.' };
}

module.exports = { performGridCreation, claimHomestead };