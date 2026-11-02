/**
 * The Caravan (code name: Train), the player's side. The server owns the orders, the rewards and
 * the reward mail (utils/caravan.js); the client never writes Player.train (/update-profile drops
 * it) and no longer mails itself through /send-mailbox-message.
 *
 *   POST /api/caravan/sync { playerId }
 *        -> { success, train, delivered, messages, settlementTrainNumber }
 *        Brings the player's Caravan up to the settlement's (the earned tiers of an old one mailed
 *        first) or makes one; the panel calls it when it opens.
 *   POST /api/caravan/fill { playerId, offerIndex, transactionId }
 *        -> { success, train, delivered, money, inventory, backpack, messages }
 *        Fills one order while the Caravan is loading: the goods leave (backpack first), its Money
 *        arrives, and any reward tier it completes is mailed in the same write.
 *        409 departed | stale-train | already-filled; 400 not-enough (the goods are short).
 */
const express = require('express');
const router = express.Router();
const Player = require('../models/player');
const Frontier = require('../models/frontier');
const { takeFromHoldings } = require('../utils/playerHoldings');
const caravan = require('../utils/caravan');

const TX_KEY = 'caravan-fill';

function emitMailboxBadge(req, player) {
  const io = req.app.get('socketio');
  if (io) io.to(String(player._id)).emit('mailbox-badge-update', { playerId: String(player._id), hasNewMail: true });
}

async function loadCaravanContext(playerId) {
  const player = await Player.findOne({ playerId });
  if (!player) return { error: [404, 'Player not found.'] };
  const [frontier, settlement] = await Promise.all([
    Frontier.findById(player.frontierId, 'seasons train').lean(),
    caravan.homeSettlement(player),
  ]);
  return { player, frontier, settlement, settlementNumber: caravan.settlementTrainNumber(settlement) };
}

router.post('/caravan/sync', async (req, res) => {
  const { playerId } = req.body || {};
  if (!playerId) return res.status(400).json({ error: 'playerId is required.' });
  try {
    const ctx = await loadCaravanContext(playerId);
    if (ctx.error) return res.status(ctx.error[0]).json({ error: ctx.error[1] });
    const { player, frontier, settlementNumber } = ctx;
    const { changed, delivered } = caravan.catchUp(player, settlementNumber, caravan.seasonFor(player, frontier));
    if (changed) await player.save();
    if (delivered.length) emitMailboxBadge(req, player);
    res.json({ success: true, train: player.train, delivered, messages: player.messages, settlementTrainNumber: settlementNumber });
  } catch (err) {
    console.error('❌ caravan/sync failed:', err);
    res.status(500).json({ error: 'Caravan sync failed.' });
  }
});

router.post('/caravan/fill', async (req, res) => {
  const { playerId, offerIndex, transactionId } = req.body || {};
  const index = Number(offerIndex);
  if (!playerId || !Number.isInteger(index) || !transactionId) {
    return res.status(400).json({ error: 'playerId, offerIndex and transactionId are required.' });
  }
  try {
    const ctx = await loadCaravanContext(playerId);
    if (ctx.error) return res.status(ctx.error[0]).json({ error: ctx.error[1] });
    const { player, frontier, settlementNumber } = ctx;

    const last = player.lastTransactionIds?.get(TX_KEY);
    if (last && typeof last === 'object' && last.id === transactionId) {
      return res.json({ success: true, ...last.result, train: player.train, inventory: player.inventory, backpack: player.backpack, messages: player.messages });
    }

    // The panel's own gates: the Caravan's level, and only in the home settlement
    if (caravan.playerLevelOf(player) < caravan.TRAIN_LEVEL) return res.status(403).json({ error: 'level' });
    if (String(player.location?.s) !== String(player.settlementId)) return res.status(403).json({ error: 'not-home-settlement' });

    const phase = frontier?.train?.phase;
    const endTime = frontier?.train?.endTime ? new Date(frontier.train.endTime).getTime() : 0;
    if (phase !== 'loading' || (endTime && Date.now() >= endTime)) return res.status(409).json({ error: 'departed' });
    if ((player.train?.currentTrainNumber || 0) !== settlementNumber) return res.status(409).json({ error: 'stale-train' });

    const offer = player.train.currentTrainOffers?.[index];
    if (!offer) return res.status(404).json({ error: 'No such order.' });
    if (offer.completed) return res.status(409).json({ error: 'already-filled' });

    if (!takeFromHoldings(player.inventory, player.backpack, offer.item, offer.quantity)) {
      return res.status(400).json({ error: 'not-enough', item: offer.item, quantity: offer.quantity });
    }
    const money = caravan.orderMoney(offer);
    const wallet = player.inventory.find((i) => i.type === 'Money');
    if (wallet) wallet.quantity += money;
    else player.inventory.push({ type: 'Money', quantity: money });
    player.markModified('inventory');
    player.markModified('backpack');

    offer.completed = true;
    player.markModified('train');
    const delivered = caravan.mailEarnedTiers(player);

    const result = { money, delivered };
    player.lastTransactionIds.set(TX_KEY, { id: transactionId, timestamp: Date.now(), result });
    await player.save();
    if (delivered.length) emitMailboxBadge(req, player);
    res.json({ success: true, ...result, train: player.train, inventory: player.inventory, backpack: player.backpack, messages: player.messages });
  } catch (err) {
    console.error('❌ caravan/fill failed:', err);
    res.status(500).json({ error: 'Caravan order failed.' });
  }
});

module.exports = router;
