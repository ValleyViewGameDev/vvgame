/**
 * Story moments that change the player's world (utils/storyState.js, docs/story.md §0).
 *
 *   POST /api/story/wake-gertrude { playerId, gridId, npcId? }
 *        -> { success, npc, storyFlags, relationships }  (waking her counts as meeting her)
 *        403 'feste-quest' until Feste has the Song (or his quest is complete);
 *        404 'no-statue' when the grid holds no statue (already awake there: answers success).
 *
 * The client is optimistic (house rule): Feste sings and the Queen stands up on the tap, this
 * call runs alongside; npcId is the id the client gave her so both sides agree. Feste being next
 * to the statue is checked on the client only (NPC positions are client-simulated).
 * The grid write lock queues this by the gridId in the body.
 *
 *   POST /api/story/give-feste-song { playerId }  -> { success, inventory, backpack, storyFlags }
 *        Feste's quest reward is collected: Gertrude's Song leaves the player (backpack first; it
 *        is a quest item, so it is consumed like a trade) and storyFlags.festeHasSong is set, which
 *        puts the statue in its ready state (a checkmark; "Music, awake her!" works with or without
 *        Feste beside her). 403 'feste-quest' until his quest is done. Idempotent.
 */
const express = require('express');
const router = express.Router();
const Player = require('../models/player');
const Grid = require('../models/grid');
const sendMailboxMessage = require('../utils/messageUtils');

const QUEEN_GIFT_MESSAGE_ID = 7; // messages.json: "A Gift from the Queen"
const { takeFromHoldings, heldQuantity } = require('../utils/playerHoldings');
const { FESTE_QUEST, QUEEN, SONG, isStatueReady, meetGertrude, hasCompleted, wakeOnGrid, ISLAND_COORD, VIOLA_HOME_COORD, SEBASTIAN, VIOLA, npcRecord, npcMap, applyViolaHomeState } = require('../utils/storyState');

router.post('/story/wake-gertrude', async (req, res) => {
  const { playerId, gridId, npcId } = req.body || {};
  if (!playerId || !gridId) return res.status(400).json({ error: 'playerId and gridId are required.' });
  try {
    const player = await Player.findOne({ playerId });
    if (!player) return res.status(404).json({ error: 'Player not found.' });
    if (!isStatueReady(player)) return res.status(403).json({ error: 'feste-quest' });
    const grid = await Grid.findById(gridId);
    if (!grid) return res.status(404).json({ error: 'Grid not found.' });
    if (grid.gridType !== 'town' || String(grid.ownerId) !== String(player._id)) return res.status(403).json({ error: 'not-your-town' });

    const queen = wakeOnGrid(grid, npcId);
    const already = !queen && [...(grid.NPCsInGrid instanceof Map ? grid.NPCsInGrid.values() : Object.values(grid.NPCsInGrid || {}))].find((n) => n?.type === QUEEN);
    if (!queen && !already) return res.status(404).json({ error: 'no-statue' });
    if (queen) await grid.save();

    const firstWaking = !player.storyFlags?.gertrudeAwake;
    player.storyFlags = { ...(player.storyFlags || {}), gertrudeAwake: player.storyFlags?.gertrudeAwake || new Date() };
    player.markModified('storyFlags');
    meetGertrude(player); // her waking speech is the meeting ("Be Stone No More" is a Meet goal)
    await player.save();
    // the early game's finale (backlog OB-8): the Queen's gift, mailed once, on the first waking
    if (firstWaking) {
      await sendMailboxMessage(String(player._id), QUEEN_GIFT_MESSAGE_ID, [], req.app.get('socketio'))
        .catch((err) => console.error("The Queen's gift failed:", err));
    }
    res.json({ success: true, npc: queen || already, storyFlags: player.storyFlags, relationships: player.relationships });
  } catch (err) {
    console.error('story/wake-gertrude failed:', err);
    res.status(500).json({ error: 'Wake failed.' });
  }
});

router.post('/story/give-feste-song', async (req, res) => {
  const { playerId } = req.body || {};
  if (!playerId) return res.status(400).json({ error: 'playerId is required.' });
  try {
    const player = await Player.findOne({ playerId });
    if (!player) return res.status(404).json({ error: 'Player not found.' });
    const questDone = hasCompleted(player, FESTE_QUEST)
      || (player.activeQuests || []).some((q) => q?.questId === FESTE_QUEST && q.completed);
    if (!questDone && !player.storyFlags?.festeHasSong) return res.status(403).json({ error: 'feste-quest' });
    const held = heldQuantity(player.inventory, player.backpack, SONG);
    if (held > 0) {
      takeFromHoldings(player.inventory, player.backpack, SONG, held);
      player.markModified('inventory'); player.markModified('backpack');
    }
    if (!player.storyFlags?.festeHasSong) {
      player.storyFlags = { ...(player.storyFlags || {}), festeHasSong: new Date() };
      player.markModified('storyFlags');
    }
    await player.save();
    res.json({ success: true, inventory: player.inventory, backpack: player.backpack, storyFlags: player.storyFlags });
  } catch (err) {
    console.error('story/give-feste-song failed:', err);
    res.status(500).json({ error: 'Giving the song failed.' });
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

/**
 *   POST /api/story/hope-finale { playerId, gridId }
 *        -> { success, first, storyFlags, relationships, npcRelationships,
 *             removedNpcIds, removedResources, addedResources, addedNpcs, gems }
 * The Quest for Hope's finale (utils/hopeFinale.js): the player holds Hope (the Oracle's trade);
 * the client calls this from the Oracle's grid as the Oracle turns into a dove. The first call
 * sets storyFlags.hopeReturned, makes everyone friends, and drops the 100 gems; every call puts
 * the grid in its after-Hope state and answers what changed, so the client can stage it.
 * 403 'no-hope' without Hope; 403 'not-the-oracle' off the player's own copy of her grid.
 * The grid write lock queues this by the gridId in the body. Idempotent.
 */
router.post('/story/hope-finale', async (req, res) => {
  const { playerId, gridId } = req.body || {};
  if (!playerId || !gridId) return res.status(400).json({ error: 'playerId and gridId are required.' });
  try {
    const hope = require('../utils/hopeFinale');
    const player = await Player.findOne({ playerId });
    if (!player) return res.status(404).json({ error: 'Player not found.' });
    if (!hope.holdsHope(player)) return res.status(403).json({ error: 'no-hope' });
    const grid = await Grid.findById(gridId);
    if (!grid) return res.status(404).json({ error: 'Grid not found.' });
    if (Number(grid.gridCoord) !== hope.HOPE_COORD || String(grid.ownerId) !== String(player._id)) return res.status(403).json({ error: 'not-the-oracle' });

    const first = !hope.isHopeReturned(player);
    if (first) {
      player.storyFlags = { ...(player.storyFlags || {}), hopeReturned: new Date() };
      player.markModified('storyFlags');
      hope.reconcileRelationships(player);
    }
    const avoid = player.location?.g && String(player.location.g) === String(grid._id) ? [{ x: Math.round(player.location.x), y: Math.round(player.location.y) }] : [];
    const diff = hope.applyHopeGrid(grid, player, { dropGems: true, avoid });
    if (diff.changed) await grid.save();
    await player.save();
    res.json({
      success: true, first, storyFlags: player.storyFlags, relationships: player.relationships, npcRelationships: player.npcRelationships || [],
      removedNpcIds: diff.removedNpcIds, removedResources: diff.removedResources, addedResources: diff.addedResources, addedNpcs: diff.addedNpcs, gems: diff.gems,
    });
  } catch (err) {
    console.error('story/hope-finale failed:', err);
    res.status(500).json({ error: 'Hope finale failed.' });
  }
});

/**
 *   POST /api/story/quince-chop { playerId, gridId, x, y } -> { success }
 * Peter Quince, the Oracle's woodcutter (utils/hopeFinale.js), fells the tree at (x, y) on the
 * player's copy of the Oracle's grid after the finale: the tree goes and its wood goes nowhere
 * (no doober, nothing to the player). Trees only (convertTo with an Axe or Better Axe); the
 * valley's lazy tree top-up grows them back. The client is optimistic (the tree falls on the
 * swing); a refusal puts it back.
 */
const QUINCE_TREE_SKILLS = ['Axe', 'Better Axe'];
router.post('/story/quince-chop', async (req, res) => {
  const { playerId, gridId } = req.body || {};
  const x = Number(req.body?.x), y = Number(req.body?.y);
  if (!playerId || !gridId || !Number.isInteger(x) || !Number.isInteger(y)) return res.status(400).json({ error: 'playerId, gridId, x and y are required.' });
  try {
    const hope = require('../utils/hopeFinale');
    const gridResourceManager = require('../utils/GridResourceManager');
    const masterResources = require('../tuning/resources.json');
    const player = await Player.findOne({ playerId }).select('_id storyFlags');
    if (!player) return res.status(404).json({ error: 'Player not found.' });
    if (!hope.isHopeReturned(player)) return res.status(403).json({ error: 'no-hope' });
    const grid = await Grid.findById(gridId);
    if (!grid) return res.status(404).json({ error: 'Grid not found.' });
    if (Number(grid.gridCoord) !== hope.HOPE_COORD || String(grid.ownerId) !== String(player._id)) return res.status(403).json({ error: 'not-the-oracle' });
    const tree = gridResourceManager.getResources(grid).find((r) => r.x === x && r.y === y);
    const def = tree && masterResources.find((m) => m.type === tree.type);
    if (!def || def.action !== 'convertTo' || !QUINCE_TREE_SKILLS.includes(def.requires)) return res.status(409).json({ error: 'not-a-tree' });
    gridResourceManager.updateResource(grid, { x, y, type: null });
    await grid.save();
    res.json({ success: true });
  } catch (err) {
    console.error('story/quince-chop failed:', err);
    res.status(500).json({ error: 'Chop failed.' });
  }
});

module.exports = router;
