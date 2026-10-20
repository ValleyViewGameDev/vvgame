/**
 * The Inn (resources.json 'Inn', a station built in the Valley, one per grid): a Rest costs Money
 * and restores full health at once; then that Inn rests for a cooldown, stored on the Inn resource
 * itself as `craftEnd` (so each Inn has its own, and it survives reloads).
 *
 *   POST /api/inn/rest { playerId, gridId, x, y }
 *        -> { success, hp, maxhp, craftEnd, inventory, backpack }
 *        409 { error: 'resting', craftEnd } while the cooldown runs; 400 when the Money is short.
 *
 * Price and cooldown: globalTuning.json innRest { costMoney, cooldownMinutes }. Max hp is the
 * server's own derived value (utils/combatStats), never the client's. The grid write lock
 * (utils/gridWriteLock.js) queues this route by the gridId in the body.
 */
const express = require('express');
const router = express.Router();
const Player = require('../models/player');
const Grid = require('../models/grid');
const gridResourceManager = require('../utils/GridResourceManager');
const { spendCosts } = require('../utils/playerHoldings');
const { derivedStats } = require('../utils/combatStats');
const globalTuning = require('../tuning/globalTuning.json');

const INN = 'Inn';

router.post('/inn/rest', async (req, res) => {
  const { playerId, gridId, x, y } = req.body || {};
  if (!playerId || !gridId || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) {
    return res.status(400).json({ error: 'playerId, gridId, x and y are required.' });
  }
  const { costMoney = 2500, cooldownMinutes = 1440 } = globalTuning.innRest || {};
  try {
    const player = await Player.findOne({ playerId });
    if (!player) return res.status(404).json({ error: 'Player not found.' });
    const grid = await Grid.findById(gridId);
    if (!grid) return res.status(404).json({ error: 'Grid not found.' });
    if (grid.ownerId && String(grid.ownerId) !== String(player._id)) return res.status(403).json({ error: 'not-your-grid' });

    const inn = gridResourceManager.getResources(grid).find((r) => r.x === Number(x) && r.y === Number(y) && r.type === INN);
    if (!inn) return res.status(404).json({ error: 'No Inn there.' });
    const now = Date.now();
    if (inn.craftEnd && inn.craftEnd > now) return res.status(409).json({ error: 'resting', craftEnd: inn.craftEnd });

    const inventory = player.inventory || [];
    const backpack = player.backpack || [];
    if (!spendCosts({ Money: costMoney }, inventory, backpack, { table: true })) {
      return res.status(400).json({ error: 'Not enough Money.', code: 'not-enough-money', cost: costMoney });
    }
    const { maxhp } = derivedStats(player);
    player.inventory = inventory;
    player.backpack = backpack;
    player.hp = maxhp;
    player.maxhp = maxhp;

    const craftEnd = now + cooldownMinutes * 60 * 1000;
    gridResourceManager.updateResource(grid, { ...inn, craftEnd });
    await grid.save();
    await player.save();
    res.json({ success: true, hp: maxhp, maxhp, craftEnd, inventory: player.inventory, backpack: player.backpack });
  } catch (err) {
    console.error('inn/rest failed:', err);
    res.status(500).json({ error: 'Rest failed.' });
  }
});

module.exports = router;
