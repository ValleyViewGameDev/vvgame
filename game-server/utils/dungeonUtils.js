/**
 * Dungeon grids from templates (layouts/gridLayouts/dungeon/<name>.json).
 * One template instance per registered dungeon (isTemplate, editor-owned) plus one copy per player,
 * created on first entry and reset lazily (docs/phase-2-contract.md).
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Grid = require('../models/grid');
const TileEncoder = require('./TileEncoder');
const UltraCompactResourceEncoder = require('./ResourceEncoder');
const { generateFixedGrid, generateFixedResources } = require('./worldUtils');
const masterResources = require('../tuning/resources.json');

const FTUE_TEMPLATE = 'opening';
const FTUE_KEY = 'ftue-cave';

function templatePath(templateFilename) {
  return path.join(__dirname, '../layouts/gridLayouts/dungeon', `${templateFilename}.json`);
}

function dungeonTemplateExists(templateFilename) {
  return !!templateFilename && fs.existsSync(templatePath(templateFilename));
}

/** Tiles, resources and NPCs for a dungeon template, already encoded for a Grid document. */
function buildDungeonFields(templateFilename) {
  if (!dungeonTemplateExists(templateFilename)) throw new Error(`Dungeon template not found: ${templateFilename}`);
  const template = JSON.parse(fs.readFileSync(templatePath(templateFilename), 'utf-8'));
  const tiles = generateFixedGrid(template);
  const resources = generateFixedResources(template);

  const npcs = new Map();
  (template.resources || []).forEach((row, y) => {
    row.forEach((cell, x) => {
      if (!cell || cell === '.' || cell === '**') return;
      const def = masterResources.find((r) => r.layoutkey === cell && r.category === 'npc');
      if (!def) return;
      const id = new mongoose.Types.ObjectId().toString();
      npcs.set(id, {
        id, type: def.type, position: { x, y }, state: def.defaultState || 'idle',
        hp: def.maxhp || 10, maxhp: def.maxhp || 10, armorclass: def.armorclass || 10,
        attackbonus: def.attackbonus || 0, damage: def.damage || 1, attackrange: def.attackrange || 1,
        speed: def.speed || 1, lastUpdated: new Date(),
      });
    });
  });

  const encoder = new UltraCompactResourceEncoder(masterResources);
  const encodedResources = resources.map((r) => encoder.encode(r));
  return { tiles: TileEncoder.encode(tiles), resources: encodedResources, NPCsInGrid: npcs };
}

async function createDungeonGrid(templateFilename, { frontierId, settlementId, ownerId = null, templateKey = null, isTemplate = false }) {
  const fields = buildDungeonFields(templateFilename);
  const grid = new Grid({
    gridType: 'dungeon',
    frontierId,
    settlementId: settlementId || frontierId,
    ownerId,
    isTemplate,
    templateKey: templateKey || `dungeon:${templateFilename}`,
    gridCoord: null,
    resetEpoch: new Date(),
    tiles: fields.tiles,
    resources: fields.resources,
    NPCsInGrid: fields.NPCsInGrid,
    NPCsInGridLastUpdated: new Date(),
    playersInGrid: new Map(),
    lastOptimized: new Date(),
  });
  await grid.save();
  return grid;
}

/** Regenerate a dungeon grid's tiles/resources/NPCs from its template in place. */
async function resetDungeonGrid(grid, templateFilename) {
  const fields = buildDungeonFields(templateFilename);
  grid.tiles = fields.tiles;
  grid.resources = fields.resources;
  grid.NPCsInGrid = fields.NPCsInGrid;
  grid.NPCsInGridLastUpdated = new Date();
  grid.resetEpoch = new Date();
  grid.markModified('NPCsInGrid');
  await grid.save({ validateBeforeSave: false });
  return grid;
}

module.exports = { buildDungeonFields, createDungeonGrid, resetDungeonGrid, dungeonTemplateExists, FTUE_TEMPLATE, FTUE_KEY };
