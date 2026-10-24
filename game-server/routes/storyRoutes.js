/**
 * Story moments that change the player's world (utils/storyState.js, docs/story.md §0).
 *
 *   POST /api/story/wake-gertrude { playerId, gridId, npcId? }
 *        -> { success, npc, storyFlags }
 *        403 'feste-quest' until Feste's "If Music Be the Food of Love" is complete;
 *        404 'no-statue' when the grid holds no statue (already awake there: answers success).
 *
 * The client is optimistic (house rule): Feste sings and the Queen stands up on the tap, this
 * call runs alongside; npcId is the id the client gave her so both sides agree. Feste being next
 * to the statue is checked on the client only (NPC positions are client-simulated).
 * The grid write lock queues this by the gridId in the body.
 */
const express = require('express');
const router = express.Router();
const Player = require('../models/player');
const Grid = require('../models/grid');
const { FESTE_QUEST, QUEEN, hasCompleted, wakeOnGrid } = require('../utils/storyState');

router.post('/story/wake-gertrude', async (req, res) => {
  const { playerId, gridId, npcId } = req.body || {};
  if (!playerId || !gridId) return res.status(400).json({ error: 'playerId and gridId are required.' });
  try {
    const player = await Player.findOne({ playerId });
    if (!player) return res.status(404).json({ error: 'Player not found.' });
    if (!hasCompleted(player, FESTE_QUEST)) return res.status(403).json({ error: 'feste-quest' });
    const grid = await Grid.findById(gridId);
    if (!grid) return res.status(404).json({ error: 'Grid not found.' });
    if (grid.gridType !== 'town' || String(grid.ownerId) !== String(player._id)) return res.status(403).json({ error: 'not-your-town' });

    const queen = wakeOnGrid(grid, npcId);
    const already = !queen && [...(grid.NPCsInGrid instanceof Map ? grid.NPCsInGrid.values() : Object.values(grid.NPCsInGrid || {}))].find((n) => n?.type === QUEEN);
    if (!queen && !already) return res.status(404).json({ error: 'no-statue' });
    if (queen) await grid.save();

    player.storyFlags = { ...(player.storyFlags || {}), gertrudeAwake: player.storyFlags?.gertrudeAwake || new Date() };
    player.markModified('storyFlags');
    await player.save();
    res.json({ success: true, npc: queen || already, storyFlags: player.storyFlags });
  } catch (err) {
    console.error('story/wake-gertrude failed:', err);
    res.status(500).json({ error: 'Wake failed.' });
  }
});

module.exports = router;
