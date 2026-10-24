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
const { FESTE_QUEST, QUEEN, hasCompleted, wakeOnGrid, ISLAND_COORD, VIOLA_HOME_COORD, SEBASTIAN, VIOLA, npcRecord, npcMap, applyViolaHomeState } = require('../utils/storyState');

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

/**
 *   POST /api/story/reunite-viola { playerId, gridId, npcId, x, y }
 *        -> { success, npc, storyFlags, inventory, backpack, relationships }
 * Called on the island (1011670) when the player has greeted Sebastian: Viola joins him there at
 * (x, y) (a water tile beside the island, chosen by the client, which shows her rising and swimming
 * up at once), leaves the player's copy of her old lake (1012435), counts as met, and gives the
 * player her Secret (owner, 2026-10-24: the reunion replaces her love-90 trade). Idempotent.
 */
router.post('/story/reunite-viola', async (req, res) => {
  const { playerId, gridId, npcId } = req.body || {};
  const x = Number(req.body?.x), y = Number(req.body?.y);
  if (!playerId || !gridId || !Number.isInteger(x) || !Number.isInteger(y)) return res.status(400).json({ error: 'playerId, gridId, x and y are required.' });
  try {
    const player = await Player.findOne({ playerId });
    if (!player) return res.status(404).json({ error: 'Player not found.' });
    if (!player.relationships?.some((r) => r.name === SEBASTIAN && r.met)) return res.status(403).json({ error: 'meet-sebastian' });
    const grid = await Grid.findById(gridId);
    if (!grid) return res.status(404).json({ error: 'Grid not found.' });
    if (Number(grid.gridCoord) !== ISLAND_COORD || String(grid.ownerId) !== String(player._id)) return res.status(403).json({ error: 'not-the-island' });

    const npcs = npcMap(grid);
    let viola = [...npcs.values()].find((n) => n?.type === VIOLA);
    if (!viola) {
      const id = typeof npcId === 'string' && /^[0-9a-f]{24}$/.test(npcId) && !npcs.has(npcId) ? npcId : undefined;
      viola = npcRecord(VIOLA, x, y, id);
      npcs.set(viola.id, viola);
      grid.NPCsInGrid = npcs; grid.markModified('NPCsInGrid'); grid.NPCsInGridLastUpdated = new Date();
      await grid.save();
    }

    const first = !player.storyFlags?.violaReunited;
    player.storyFlags = { ...(player.storyFlags || {}), violaReunited: player.storyFlags?.violaReunited || { x: viola.position.x, y: viola.position.y, id: viola.id, at: new Date() } };
    player.markModified('storyFlags');
    if (!player.relationships.some((r) => r.name === VIOLA)) player.relationships.push({ name: VIOLA, relscore: 10, met: true, clues: ['met'] });
    else player.relationships.forEach((r) => { if (r.name === VIOLA) r.met = true; });
    const holds = [...(player.inventory || []), ...(player.backpack || [])].some((i) => i.type === "Viola's Secret" && i.quantity > 0);
    if (first && !holds) {
      const inv = player.inventory || [];
      const item = inv.find((i) => i.type === "Viola's Secret");
      if (item) item.quantity += 1; else inv.push({ type: "Viola's Secret", quantity: 1 });
      player.inventory = inv;
    }
    await player.save();

    // her old lake, if the player has a copy of it
    const home = await Grid.findOne({ ownerId: player._id, gridCoord: VIOLA_HOME_COORD });
    if (home && applyViolaHomeState(home, player)) await home.save();

    res.json({ success: true, npc: viola, storyFlags: player.storyFlags, inventory: player.inventory, backpack: player.backpack, relationships: player.relationships });
  } catch (err) {
    console.error('story/reunite-viola failed:', err);
    res.status(500).json({ error: 'Reunion failed.' });
  }
});

module.exports = router;
