/**
 * GET /api/login-scene: the living grid behind the Begin screen (docs/login-scene-plan.md).
 * No player, no auth, no database: the fixed layout layouts/gridLayouts/homestead/start-screen.json,
 * decoded the way a fixed grid is created (utils/worldUtils generateFixedGrid / generateFixedResources),
 * plus its NPCs as { type, x, y }. Cached once in production; re-read per request locally so an
 * editor save shows on the next page load.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const masterResources = require('../tuning/resources.json');
const { generateFixedGrid, generateFixedResources } = require('../utils/worldUtils');

const router = express.Router();
const LAYOUT_FILE = path.join(__dirname, '../layouts/gridLayouts/homestead/start-screen.json');
const IS_PROD = process.env.NODE_ENV === 'production';
let cached = null;

function buildScene() {
  const layout = JSON.parse(fs.readFileSync(LAYOUT_FILE, 'utf8'));
  const npcs = [];
  layout.resources.forEach((row, y) => row.forEach((cell, x) => {
    if (cell === '**') return;
    const entry = masterResources.find((r) => r.layoutkey === cell && r.category === 'npc');
    if (entry) npcs.push({ type: entry.type, x, y });
  }));
  return {
    tiles: generateFixedGrid(layout),          // rows of tile letters ('g', 'w', 'z', ...)
    resources: generateFixedResources(layout), // [{ type, x, y }], NPCs left out
    npcs,
    zones: layout.sceneZones || {},             // the animals' roaming areas (tools/login-scene.js)
  };
}

router.get('/login-scene', (req, res) => {
  try {
    const scene = (IS_PROD && cached) || buildScene();
    if (IS_PROD) cached = scene;
    // no-cache, not max-age: a browser-cached copy replays the X-App-Build of the deploy that served
    // it, and Utils/buildWatch.js then sees two builds and shows "The Game Has Updated" on every
    // load (owner 2026-11-11). The ETag keeps the revalidation a cheap 304.
    res.set('Cache-Control', IS_PROD ? 'no-cache' : 'no-store');
    res.json(scene);
  } catch (err) {
    console.error('login-scene:', err.message);
    res.status(500).json({ error: 'login-scene unavailable' });
  }
});

module.exports = router;
