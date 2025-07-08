// game-server/utils/gridCreationLogic.js
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const Settlement = require('../models/settlement');
const Frontier = require('../models/frontier');
const Grid = require('../models/grid');
const { readJSON } = require('./fileUtils');
const { getTemplate, getHomesteadLayoutFile, getTownLayoutFile } = require('./templateUtils');
const masterResources = require('../tuning/resources.json');
const { generateGrid, generateResources, generateFixedGrid, generateFixedResources } = require('./worldUtils');

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
    layoutFileName = getTownLayoutFile(seasonType);
    layout = readJSON(path.join(__dirname, '../layouts/gridLayouts/town', layoutFileName));
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

  const newTiles = isFixedLayout
    ? generateFixedGrid(layout)
    : generateGrid(layout, layout.tileDistribution).map(row =>
        row.map(k => {
          const tile = masterResources.find(r => r.layoutkey === k && r.category === 'tile');
          return tile?.type || 'g';
        }));

  const newResources = isFixedLayout
    ? generateFixedResources(layout)
    : generateResources(layout, newTiles, layout.resourceDistribution);

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

  const newGrid = new Grid({
    gridType,
    frontierId,
    settlementId,
    tiles: newTiles,
    resources: newResources,
    NPCsInGrid: new Map(Object.entries(newGridState.npcs)),
    NPCsInGridLastUpdated: Date.now(),
  });

  await newGrid.save();

  targetGrid.available = false;
  targetGrid.gridId = newGrid._id;
  await settlement.save();

  return { success: true, gridId: newGrid._id, message: 'Grid created successfully.' };
}

module.exports = { performGridCreation };