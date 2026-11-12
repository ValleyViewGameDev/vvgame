const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Grid = require('../models/grid');
const { ownerGuard } = require('../utils/session');
const { applyNpcSaveRules } = require('../utils/npcSaveRules');
const { resourceDef } = require('../utils/playerEconomy');

///////////////////////////////////////////////////////////////
// GRID NPC STATE ROUTES
///////////////////////////////////////////////////////////////
// The client ticks the NPCs of the grid it stands on and saves them here (GridState/GridStateNPCs.js).
// Single-player (Phase 2): a town, valley or dungeon is the viewer's own copy and a homestead is its
// owner's, so only the grid's owner (or a developer) may write its NPCs (ownerGuard, BL-2 part 2,
// 2026-11-11); a visitor's read-only homestead view never saves. The synchronous-era PC routes
// (save-single-pc, remove-single-pc, batch-update-pc-positions, load-grid-state), the unused
// grid-has-resource and the never-called whole-map save-grid-state-npcs were removed then: grids
// hold no player records. What a save may change (graze timers, hp, maxhp) is checked against the
// server's own copy by utils/npcSaveRules.js (BL-20); positions are free.

const NPC_ID_RE = /^[A-Za-z0-9_-]{1,64}$/; // ObjectId hex or a timestamp; never a dotted path

/** Loads the grid's owner and checks the caller may write it; answers the request when not. */
async function writableGrid(req, res, gridId) {
  if (!gridId || !mongoose.isValidObjectId(gridId)) { res.status(400).json({ error: 'A valid gridId is required.' }); return false; }
  const grid = await Grid.findById(gridId, { ownerId: 1 }).lean();
  if (!grid) { res.status(404).json({ error: 'Grid not found.' }); return false; }
  return ownerGuard(req, res, grid.ownerId, `grid=${gridId}`);
}

// Updates touch only an NPC the grid still holds; only `create: true` (GridStateNPCs.addNPC: a
// spawn, a bought animal) may add a new id. A grid reset rebuilds the NPCs with NEW ids, and a page
// that loaded the grid before the reset (another tab, the editor's reset-for-all) kept saving its
// old NPCs back beside the new ones: two Snugs (2026-11-04). The same rule
// batch-update-npc-positions already follows.
router.post('/save-single-npc', async (req, res) => {
  const { gridId, npcId, npc, lastUpdated, create } = req.body;

  try {
    if (!gridId || !npcId || !npc || !lastUpdated) {
      return res.status(400).json({ error: 'gridId, npcId, npc, and lastUpdated are required.' });
    }
    if (!NPC_ID_RE.test(String(npcId)) || typeof npc !== 'object') {
      return res.status(400).json({ error: 'Invalid npcId or npc.' });
    }
    if (!mongoose.isValidObjectId(gridId)) return res.status(400).json({ error: 'A valid gridId is required.' });
    // the owner and the stored copy of this one NPC, in one read
    const stored = await Grid.findById(gridId, { ownerId: 1, [`NPCsInGrid.${npcId}`]: 1 }).lean();
    if (!stored) return res.status(404).json({ error: 'Grid not found.' });
    if (!(await ownerGuard(req, res, stored.ownerId, `grid=${gridId}`))) return;
    const prev = stored.NPCsInGrid ? stored.NPCsInGrid[npcId] : undefined;

    // The fields something is paid for follow the server's copy and clock (BL-20); the client
    // adopts what was adjusted from the answer
    const def = resourceDef(npc.type || prev?.type);
    const adjusted = applyNpcSaveRules(prev, npc, def && def.category === 'npc' ? def : null);
    if (adjusted) console.warn(`🔐 NPC save adjusted grid=${gridId} npc=${npcId} ${npc.type || ''} ${JSON.stringify(adjusted)}`);

    // Update the one NPC field directly, without loading the grid
    npc.lastUpdated = new Date(lastUpdated);

    const filter = create === true ? { _id: gridId } : { _id: gridId, [`NPCsInGrid.${npcId}`]: { $exists: true } };
    const result = await Grid.updateOne(
      filter,
      {
        $set: {
          [`NPCsInGrid.${npcId}`]: npc,
          NPCsInGridLastUpdated: new Date(lastUpdated)
        }
      }
    );

    if (result.matchedCount === 0) {
      if (create !== true && await Grid.exists({ _id: gridId })) {
        return res.status(409).json({ error: 'NPC not in grid (stale page?)', code: 'NPC_NOT_IN_GRID' });
      }
      return res.status(404).json({ error: 'Grid not found.' });
    }

    res.status(200).json(adjusted ? { success: true, adjusted } : { success: true });
  } catch (error) {
    console.error('❌ Error saving single NPC:', error);
    res.status(500).json({ error: 'Failed to save single NPC.' });
  }
});

// Remove a single NPC from NPCsInGrid
router.post('/remove-single-npc', async (req, res) => {
  const { gridId, npcId } = req.body;

  try {
    if (!gridId || !npcId) {
      return res.status(400).json({ error: 'gridId and npcId are required.' });
    }
    if (!NPC_ID_RE.test(String(npcId))) return res.status(400).json({ error: 'Invalid npcId.' });
    if (!(await writableGrid(req, res, gridId))) return;

    // One atomic $unset: no load-and-save of the whole map
    const result = await Grid.updateOne(
      { _id: gridId },
      { $unset: { [`NPCsInGrid.${npcId}`]: '' }, $set: { NPCsInGridLastUpdated: new Date() } }
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Grid not found.' });

    console.log(`🗑️ Removed NPC ${npcId} from gridId: ${gridId}`);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ Error removing single NPC:', error);
    res.status(500).json({ error: 'Failed to remove single NPC.' });
  }
});

// Batch update: many NPC positions in one request (also the page-hide beacon, which carries the
// session token in its body)
router.post('/batch-update-npc-positions', async (req, res) => {
  const { gridId, updates, timestamp } = req.body;

  try {
    if (!gridId || !updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'gridId and updates object are required.' });
    }

    const updateEntries = Object.entries(updates);
    if (updateEntries.length === 0) {
      return res.status(400).json({ error: 'No updates provided.' });
    }
    if (!(await writableGrid(req, res, gridId))) return;

    // Only NPCs the grid still has: a position for an id it no longer holds (a page that
    // outlived a grid reset, a killed NPC) used to $set a ghost entry with just position +
    // lastUpdated, and the old NPC came back beside the reset one. Reads the NPC map only.
    const current = await Grid.findById(gridId, { NPCsInGrid: 1 }).lean();
    if (!current) return res.status(404).json({ error: 'Grid not found.' });
    const known = new Set(Object.keys(current.NPCsInGrid || {}));

    const updateOps = {};
    const lastUpdated = new Date(timestamp || Date.now());
    let skipped = 0;

    for (const [npcId, position] of updateEntries) {
      if (!known.has(npcId)) { skipped++; continue; }
      if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
        continue; // Skip invalid positions
      }
      updateOps[`NPCsInGrid.${npcId}.position`] = { x: position.x, y: position.y };
      updateOps[`NPCsInGrid.${npcId}.lastUpdated`] = lastUpdated;
    }

    updateOps.NPCsInGridLastUpdated = lastUpdated;

    const result = await Grid.updateOne(
      { _id: gridId },
      { $set: updateOps }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Grid not found.' });
    }

    const updatedCount = updateEntries.length - skipped;
    console.log(`💾 Batch updated ${updatedCount} NPC positions for grid ${gridId}${skipped ? ` (${skipped} unknown ids skipped)` : ''}`);

    res.status(200).json({
      success: true,
      updated: updatedCount,
      total: updateEntries.length
    });

  } catch (error) {
    console.error('❌ Error in batch NPC position update:', error);
    res.status(500).json({ error: 'Failed to batch update NPC positions.' });
  }
});

module.exports = router;
