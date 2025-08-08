// resetGridLogic.js 
const Grid = require('../models/grid');
const Frontier = require('../models/frontier');
const path = require('path');
const fs = require('fs');
const { generateGrid, generateResources } = require('./worldUtils');
const { readJSON } = require('./fileUtils');const { ObjectId } = require('mongodb');
const masterResources = require('../tuning/resources.json');
const { getTemplate, getHomesteadLayoutFile, getTownLayoutFile } = require('./templateUtils');

async function performGridReset(gridId, gridType, gridCoord) {
  const grid = await Grid.findById(gridId);
  if (!grid) throw new Error(`Grid not found: ${gridId}`);

  const frontier = await Frontier.findById(grid.frontierId);
  const seasonType = frontier?.seasons?.seasonType || 'default';

  // Load layout
  let layout, layoutFileName;
  if (gridType === 'homestead') {
    const layoutFile = getHomesteadLayoutFile(seasonType);
    const seasonalPath = path.join(__dirname, '../layouts/gridLayouts/homestead', layoutFile);
    layout = readJSON(seasonalPath);
    layoutFileName = layoutFile;
    console.log(`🗓️ Using seasonal homestead layout for reset: ${layoutFile}`);

  } else if (gridType === 'town') {
    const layoutFile = getTownLayoutFile(seasonType);
    const seasonalPath = path.join(__dirname, '../layouts/gridLayouts/town', layoutFile);
    layout = readJSON(seasonalPath);
    layoutFileName = layoutFile;
    console.log(`🗓️ Using seasonal town layout for reset: ${layoutFile}`);

  } else {
    console.log(`🔍 Fetching layout for gridType: ${gridType}, gridCoord: ${gridCoord}`);
    const fixedCoordPath = path.join(__dirname, `../layouts/gridLayouts/valleyFixedCoord/${gridCoord}.json`);
    console.log(`🔍 Checking for fixed-coordinate layout at: ${fixedCoordPath}`);
    if (fs.existsSync(fixedCoordPath)) {
      layout = readJSON(fixedCoordPath);
      layoutFileName = `${gridCoord}.json`;
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

  const newTiles = generateGrid(layout, layout.tileDistribution).map(row =>
    row.map(layoutKey => {
      const tileRes = masterResources.find(r => r.layoutkey === layoutKey && r.category === 'tile');
      return tileRes ? tileRes.type : 'g';
    })
  );

  const newResources = generateResources(layout, newTiles, layout.resourceDistribution);
  
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

  grid.tiles = newTiles;
  grid.resources = newResources;  // Use only the main resources, not shadows
  grid.NPCsInGrid = new Map(); // Clear existing NPCs explicitly before resetting
  grid.NPCsInGrid = new Map(Object.entries(newNPCs));
  grid.NPCsInGridLastUpdated = Date.now();

  await grid.save();
  console.log(`✅ Grid ${gridId} reset successfully (${gridType})`);
}

module.exports = { performGridReset };