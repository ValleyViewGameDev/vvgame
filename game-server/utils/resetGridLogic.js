// resetGridLogic.js
const Grid = require('../models/grid');
const Frontier = require('../models/frontier');
const path = require('path');
const fs = require('fs');
const { generateGrid, generateResources } = require('./worldUtils');
const { readJSON } = require('./fileUtils');const { ObjectId } = require('mongodb');
const masterResources = require('../tuning/resources.json');
const { getTemplate, getHomesteadLayoutFile } = require('./templateUtils');

async function performGridReset(gridId, overrideGridCoord = null) {
  const grid = await Grid.findById(gridId);
  if (!grid) throw new Error(`Grid not found: ${gridId}`);

  const gridCoord = overrideGridCoord || grid.gridCoord;
  const { gridType } = grid;

  // Load layout
  let layout, layoutFileName;
  if (gridType === 'homestead') {
    const frontier = await Frontier.findById(grid.frontierId);
    const seasonType = frontier?.seasons?.seasonType || 'default';
    const layoutFile = getHomesteadLayoutFile(seasonType);
    const seasonalPath = path.join(__dirname, '../layouts/gridLayouts/homestead', layoutFile);
    layout = readJSON(seasonalPath);
    layoutFileName = layoutFile;
    console.log(`🌱 Using seasonal homestead layout for reset: ${layoutFile}`);
  } else {
    const fixedCoordPath = path.join(__dirname, `../layouts/gridLayouts/valleyFixedCoord/${gridCoord}.json`);
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
  grid.resources = newResources;
  grid.NPCsInGrid = new Map(); // Clear existing NPCs explicitly before resetting
  grid.NPCsInGrid = new Map(Object.entries(newNPCs));
  grid.NPCsInGridLastUpdated = Date.now();

  await grid.save();
  console.log(`✅ Grid ${gridId} reset successfully (${gridType})`);
}

module.exports = { performGridReset };