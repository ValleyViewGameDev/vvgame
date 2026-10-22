/**
 * Revive for Gems (the "You have fallen" modal, game-client UI/Modals/RevivalModal.js): spends
 * globalTuning.costToRevive Gems and restores percentageToRevive of max hp where the player fell.
 *
 *   POST /api/player/revive { playerId }
 *        -> { success, hp, maxhp, inventory, backpack }
 *        400 { error, code: 'not-enough-gems' } when the Gems are short.
 *
 * The client is optimistic (house rule): it revives on the tap and calls this alongside, putting
 * the player back to the modal only on a refusal. Max hp is the server's own derived value
 * (utils/combatStats), never the client's.
 */
const express = require('express');
const router = express.Router();
const Player = require('../models/player');
const { spendCosts } = require('../utils/playerHoldings');
const { derivedStats } = require('../utils/combatStats');
const globalTuning = require('../tuning/globalTuning.json');

router.post('/player/revive', async (req, res) => {
  const { playerId } = req.body || {};
  if (!playerId) return res.status(400).json({ error: 'playerId is required.' });
  const cost = globalTuning.costToRevive ?? 50;
  const fraction = globalTuning.percentageToRevive ?? 0.25;
  try {
    const player = await Player.findOne({ playerId });
    if (!player) return res.status(404).json({ error: 'Player not found.' });
    const inventory = player.inventory || [];
    const backpack = player.backpack || [];
    if (!spendCosts({ Gem: cost }, inventory, backpack, { table: true })) {
      return res.status(400).json({ error: 'Not enough Gems.', code: 'not-enough-gems', cost });
    }
    const { maxhp } = derivedStats(player);
    const hp = Math.max(1, Math.floor(maxhp * fraction));
    player.inventory = inventory;
    player.backpack = backpack;
    player.hp = hp;
    player.maxhp = maxhp;
    await player.save();
    res.json({ success: true, hp, maxhp, inventory: player.inventory, backpack: player.backpack });
  } catch (err) {
    console.error('player/revive failed:', err);
    res.status(500).json({ error: 'Revive failed.' });
  }
});

module.exports = router;
