/**
 * The debug panel's "All Crops Ready" (developers only, requireDeveloper; owner 2026-11-14).
 *
 *   POST /api/dev/ripen-all { gridId }
 *   → { success, ripened: [{ type, x, y }] }
 *
 * Every growing farm plot on the grid (crops and planted trees: category `farmplot`) becomes its
 * `output` now, whatever its growEnd, exactly as /action/ripen does for one plot. The grid is named in
 * the body, so the one-writer-per-grid lock (utils/gridWriteLock.js) covers it.
 */
const express = require('express');
const router = express.Router();
const Grid = require('../models/grid');
const { requireDeveloper } = require('../utils/developerHelpers');
const gridResourceManager = require('../utils/GridResourceManager');
const econ = require('../utils/playerEconomy');

router.post('/dev/ripen-all', requireDeveloper, async (req, res) => {
  const { gridId } = req.body || {};
  if (!gridId) return res.status(400).json({ success: false, error: 'bad-request' });
  try {
    const grid = await Grid.findById(gridId);
    if (!grid) return res.status(404).json({ success: false, error: 'no-grid' });
    const ripened = [];
    for (const r of gridResourceManager.getResources(grid) || []) {
      const def = r && econ.resourceDef(r.type);
      if (!def || def.category !== 'farmplot') continue;
      const crop = econ.resourceDef(def.output);
      if (!crop) continue;
      ripened.push({ type: crop.type, x: r.x, y: r.y });
    }
    for (const c of ripened) gridResourceManager.updateResource(grid, c);
    if (ripened.length) await grid.save({ validateBeforeSave: false });
    return res.json({ success: true, ripened });
  } catch (err) {
    console.error('❌ dev/ripen-all failed:', err);
    return res.status(500).json({ success: false, error: 'ripen-all-failed', detail: err.message });
  }
});

module.exports = router;
