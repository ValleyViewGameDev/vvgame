/**
 * Action routes (docs/refactor-plan.md Phase 5, "Transaction hardening"; started 2026-11-04).
 *
 * One request per player action. The server checks it, makes every change it implies (the grid,
 * the holdings, quests, trophies) and answers with the player fields it changed, so the client
 * applies the answer (Utils/playerDelta.js) and never refetches the player. The client still
 * reacts on the tap and sends this in parallel; it reverts only when the answer is a refusal.
 * The rules live in utils/playerEconomy.js. Grid and player writes are serialised per grid and
 * per player by utils/gridWriteLock.js and utils/playerWriteLock.js.
 *
 *   POST /action/harvest   collect a doober (or a special) from the board
 *   POST /action/convert   chop / mine a source (a tree, a rock) into what it becomes
 */
const express = require('express');
const router = express.Router();
const Player = require('../models/player');
const Grid = require('../models/grid');
const gridResourceManager = require('../utils/GridResourceManager');
const econ = require('../utils/playerEconomy');
const { applyTrophy } = require('../utils/trophyUtils');

const fail = (res, status, reason, extra = {}) => res.status(status).json({ success: false, error: reason, reason, ...extra });

// Collecting these counts toward a trophy, one per item (the Quest for Hope artifacts)
const COLLECT_TROPHIES = new Set(["King's Crown", 'Trident']);

/**
 * POST /api/action/harvest { playerId, gridId, x, y }
 * → { success, collected: {type, qty}, drop: {type, qty, added} | null,
 *     replant: {type, x, y, growEnd} | null, trophies: [{name, trophy, isNewMilestone}],
 *     player: <playerDelta>, seq }
 * Refusals (nothing changed; the client puts the doober back unless the reason is 'gone'):
 *   409 gone            nothing collectable on that tile any more (already collected: keep it gone)
 *   409 no-backpack | warehouse-full | backpack-full
 *   403 needs-<skill>   a Pickaxe / Better Pickaxe doober without the skill
 */
router.post('/action/harvest', async (req, res) => {
  const { playerId, gridId, x, y } = req.body || {};
  if (!playerId || !gridId || !Number.isInteger(x) || !Number.isInteger(y)) return fail(res, 400, 'bad-request');
  try {
    const [player, grid] = await Promise.all([Player.findById(playerId), Grid.findById(gridId)]);
    if (!player) return fail(res, 404, 'no-player');
    if (!grid) return fail(res, 404, 'no-grid');
    if (!econ.ownsGrid(grid, player)) return fail(res, 403, 'not-your-grid');
    const answer = (status, reason) => fail(res, status, reason, { player: econ.playerDelta(player), seq: econ.nextSeq() });

    const onTile = (gridResourceManager.getResources(grid) || []).find((r) => r && r.x === x && r.y === y);
    const def = onTile && econ.resourceDef(onTile.type);
    if (!def || (def.category !== 'doober' && def.category !== 'special')) return answer(409, 'gone');

    if ((def.requires === 'Pickaxe' || def.requires === 'Better Pickaxe') && !econ.hasSkill(player, def.requires)) {
      return answer(403, `needs-${def.requires}`);
    }

    const atHome = econ.atHomeOn(grid);
    const qty = (onTile.qtycollected || def.qtycollected || 1) * econ.skillMultiplier(player, def.type);
    const room = econ.roomFor(player, def.type, qty, { atHome });
    if (!room.ok) return answer(409, room.reason);

    // 1. The board: the doober goes; a repeatable one is replanted as its farm plot (trees too)
    gridResourceManager.updateResource(grid, { type: null, x, y });
    let replant = null;
    if (def.repeatable === true) {
      const plot = econ.findFarmplotFor(def.type);
      if (plot) {
        replant = { type: plot.type, x, y, growEnd: Date.now() + (plot.growtime || 0) * 1000 };
        gridResourceManager.updateResource(grid, replant);
      }
    }

    // 2. The player: the goods, Collect quests, a crop's bonus tool, collection trophies
    econ.grant(player, def.type, qty, { atHome });
    econ.advanceQuests(player, 'Collect', def.type, qty);

    let drop = null;
    const dropType = econ.rollWarehouseDrop(player, def.type);
    if (dropType) {
      const added = econ.roomFor(player, dropType, 1, { atHome }).ok;
      if (added) {
        econ.grant(player, dropType, 1, { atHome });
        econ.advanceQuests(player, 'Collect', dropType, 1);
      }
      drop = { type: dropType, qty: 1, added };
    }

    const trophies = [];
    if (COLLECT_TROPHIES.has(def.type)) {
      for (let i = 0; i < qty; i++) {
        const t = applyTrophy(player, def.type, 1);
        if (t.success) trophies.push({ name: def.type, trophy: t.trophy, isNewMilestone: t.isNewMilestone });
      }
    }

    player.lastActive = new Date();
    // Grid first: if it fails nothing is granted (never a duplicate); the player save follows
    await grid.save({ validateBeforeSave: false });
    await player.save();

    return res.json({
      success: true,
      collected: { type: def.type, qty },
      drop,
      replant,
      trophies,
      player: econ.playerDelta(player),
      seq: econ.nextSeq(),
    });
  } catch (err) {
    console.error('❌ action/harvest failed:', err);
    return res.status(500).json({ success: false, error: 'harvest-failed', detail: err.message });
  }
});

/**
 * POST /api/action/convert { playerId, gridId, x, y }
 * → { success, converted: { from, to: type | null } }
 * A source with action convertTo becomes its output (a tree into wood, a rock into stone), or
 * goes when it has none. Needs its `requires` skill when that is a skill (Axe, Pickaxe).
 * Refusals: 409 gone (nothing convertible there now), 403 needs-<skill>.
 */
router.post('/action/convert', async (req, res) => {
  const { playerId, gridId, x, y } = req.body || {};
  if (!playerId || !gridId || !Number.isInteger(x) || !Number.isInteger(y)) return fail(res, 400, 'bad-request');
  try {
    const [player, grid] = await Promise.all([Player.findById(playerId), Grid.findById(gridId)]);
    if (!player) return fail(res, 404, 'no-player');
    if (!grid) return fail(res, 404, 'no-grid');
    if (!econ.ownsGrid(grid, player)) return fail(res, 403, 'not-your-grid');

    const onTile = (gridResourceManager.getResources(grid) || []).find((r) => r && r.x === x && r.y === y);
    const def = onTile && econ.resourceDef(onTile.type);
    if (!def || def.action !== 'convertTo') return fail(res, 409, 'gone');
    const needsSkill = def.requires && econ.resourceDef(def.requires)?.category === 'skill';
    if (needsSkill && !econ.hasSkill(player, def.requires)) return fail(res, 403, `needs-${def.requires}`);

    const target = def.output && def.output !== 'null' ? econ.resourceDef(def.output) : null;
    gridResourceManager.updateResource(grid, target ? { type: target.type, x, y } : { type: null, x, y });
    await grid.save({ validateBeforeSave: false });
    return res.json({ success: true, converted: { from: def.type, to: target ? target.type : null } });
  } catch (err) {
    console.error('❌ action/convert failed:', err);
    return res.status(500).json({ success: false, error: 'convert-failed', detail: err.message });
  }
});

module.exports = router;
