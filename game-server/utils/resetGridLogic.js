// resetGridLogic.js
const Grid = require('../models/grid');
const Frontier = require('../models/frontier');
const path = require('path');
const { readJSON, generateGrid, generateResources } = require('./worldUtils');
const masterResources = require('../tuning/resources.json');
const { ObjectId } = require('mongodb');
const { getTemplate, getHomesteadLayoutFile } = require('./templateUtils');

async function resetGridDirect({ gridId, gridType, gridCoord }) {
  const grid = await Grid.findById(gridId).lean();
  if (!grid) throw new Error(`Grid not found: ${gridId}`);

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
    const layoutInfo = getTemplate('gridLayouts', gridType, gridCoord);
    layout = layoutInfo.template;
    layoutFileName = layoutInfo.fileName;
  }

  if (!layout?.tiles || !layout?.resources) {
    throw new Error(`Invalid layout for gridType: ${gridType}`);
  }

  const newTiles = generateGrid(layout, layout.tileDistribution).map(row =>
    row.map(layoutKey => {
      const tileResource = masterResources.find(res => res.layoutkey === layoutKey && res.category === "tile");
      return tileResource ? tileResource.type : "g";
    })
  );

  const newResources = generateResources(layout, newTiles, layoutFileName);

  const isPublic = ['town', 'valley0', 'valley1', 'valley2', 'valley3'].includes(gridType);
  const existingPCs = isPublic ? {} : grid.NPCsInGrid?.pcs || {};

  const newGridState = { npcs: {}, pcs: existingPCs };
  layout.resources.forEach((row, y) => {
    row.forEach((cell, x) => {
      const resourceEntry = masterResources.find(res => res.layoutkey === cell);
      if (!resourceEntry) return;
      if (resourceEntry.category === "npc") {
        const npcId = new ObjectId();
        newGridState.npcs[npcId.toString()] = {
          id: npcId.toString(),
          type: resourceEntry.type,
          position: { x, y },
          state: resourceEntry.defaultState || 'idle',
          hp: Math.max(resourceEntry.hp || 10, 0),
          maxhp: resourceEntry.maxhp || 10,
          lastUpdated: 0,
        };
      }
    });
  });

  grid.tiles = newTiles;
  grid.resources = newResources;
  grid.NPCsInGrid = newGridState;

  await grid.save();
  console.log(`✅ Grid ${gridId} reset successfully (${gridType})`);
}

module.exports = { resetGridDirect };