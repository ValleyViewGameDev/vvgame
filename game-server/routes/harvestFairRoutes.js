/**
 * The Harvest Fair (code name: Carnival), the player's side. The Fair's orders are the
 * settlement's (Settlement.carnival.currentoffers); a player claims one order at a time, then fills
 * it. Both steps are decided here, for the player making the request; the old open
 * /update-carnival-offer route (any claimant, any `filled`, no goods taken) is gone. The rewards are
 * unchanged: schedulers/carnivalScheduler.js mails them at departure to everyone who filled an
 * order, when every order is filled, with no login needed.
 *
 *   POST /api/harvest-fair/claim { playerId, offerId }  -> { success, offers }
 *        409 claimed (someone else got it) | has-claim (you hold an unfilled one)
 *   POST /api/harvest-fair/fill  { playerId, offerId, transactionId }
 *        -> { success, offers, paid: { item, qty }, inventory, backpack }
 *        The goods leave (backpack first), the order's payment arrives, the order is filled.
 *        409 not-yours | already-filled; 400 not-enough.
 * Both: 403 level | not-home-settlement, 409 not-here (the Fair is not in town).
 */
const express = require('express');
const router = express.Router();
const Player = require('../models/player');
const Settlement = require('../models/settlement');
const Frontier = require('../models/frontier');
const masterResources = require('../tuning/resources.json');
const { takeFromHoldings } = require('../utils/playerHoldings');
const { playerLevelOf } = require('../utils/caravan');

const FAIR_LEVEL = masterResources.find((r) => r.type === 'Carnival')?.level || 1;   // the panel's LevelLock
const TX_KEY = 'harvest-fair-fill';

/** The player, their settlement and the Fair's timer, with the gates both routes share. */
async function loadFair(playerId) {
  const player = await Player.findOne({ playerId });
  if (!player) return { error: [404, 'Player not found.'] };
  if (playerLevelOf(player) < FAIR_LEVEL) return { error: [403, 'level'] };
  if (!player.settlementId || String(player.location?.s) !== String(player.settlementId)) return { error: [403, 'not-home-settlement'] };
  const frontier = await Frontier.findById(player.frontierId, 'carnival').lean();
  const endTime = frontier?.carnival?.endTime ? new Date(frontier.carnival.endTime).getTime() : 0;
  if (frontier?.carnival?.phase !== 'here' || (endTime && Date.now() >= endTime)) return { error: [409, 'not-here'] };
  return { player, me: String(player.playerId) };
}

const offersOf = (settlement) => settlement?.carnival?.currentoffers || [];

router.post('/harvest-fair/claim', async (req, res) => {
  const { playerId, offerId } = req.body || {};
  if (!playerId || !offerId) return res.status(400).json({ error: 'playerId and offerId are required.' });
  try {
    const ctx = await loadFair(playerId);
    if (ctx.error) return res.status(ctx.error[0]).json({ error: ctx.error[1] });
    const { player, me } = ctx;

    const settlement = await Settlement.findById(player.settlementId, 'carnival.currentoffers').lean();
    const offers = offersOf(settlement);
    const offer = offers.find((o) => String(o._id) === String(offerId));
    if (!offer) return res.status(404).json({ error: 'Offer not found.' });
    if (offer.claimedBy && String(offer.claimedBy) !== me) return res.status(409).json({ error: 'claimed', offers });
    if (offers.some((o) => String(o.claimedBy) === me && !o.filled && String(o._id) !== String(offerId))) {
      return res.status(409).json({ error: 'has-claim', offers });
    }

    // One atomic write, so two players tapping the same order cannot both get it
    const updated = await Settlement.findOneAndUpdate(
      { _id: player.settlementId, 'carnival.currentoffers': { $elemMatch: { _id: offer._id, filled: { $ne: true }, $or: [{ claimedBy: null }, { claimedBy: player.playerId }] } } },
      { $set: { 'carnival.currentoffers.$.claimedBy': player.playerId } },
      { new: true, projection: { 'carnival.currentoffers': 1 } }
    ).lean();
    if (!updated) {
      const fresh = await Settlement.findById(player.settlementId, 'carnival.currentoffers').lean();
      return res.status(409).json({ error: 'claimed', offers: offersOf(fresh) });
    }
    res.json({ success: true, offers: offersOf(updated) });
  } catch (err) {
    console.error('❌ harvest-fair/claim failed:', err);
    res.status(500).json({ error: 'Claim failed.' });
  }
});

router.post('/harvest-fair/fill', async (req, res) => {
  const { playerId, offerId, transactionId } = req.body || {};
  if (!playerId || !offerId || !transactionId) return res.status(400).json({ error: 'playerId, offerId and transactionId are required.' });
  try {
    const ctx = await loadFair(playerId);
    if (ctx.error) return res.status(ctx.error[0]).json({ error: ctx.error[1] });
    const { player, me } = ctx;

    const last = player.lastTransactionIds?.get(TX_KEY);
    if (last && typeof last === 'object' && last.id === transactionId) {
      const s = await Settlement.findById(player.settlementId, 'carnival.currentoffers').lean();
      return res.json({ success: true, ...last.result, offers: offersOf(s), inventory: player.inventory, backpack: player.backpack });
    }

    const settlement = await Settlement.findById(player.settlementId, 'carnival.currentoffers').lean();
    const offer = offersOf(settlement).find((o) => String(o._id) === String(offerId));
    if (!offer) return res.status(404).json({ error: 'Offer not found.' });
    if (String(offer.claimedBy) !== me) return res.status(409).json({ error: 'not-yours' });
    if (offer.filled) return res.status(409).json({ error: 'already-filled' });
    if (!takeFromHoldings(player.inventory, player.backpack, offer.itemBought, offer.qtyBought)) {
      return res.status(400).json({ error: 'not-enough', item: offer.itemBought, quantity: offer.qtyBought });
    }

    // Mark it filled first (atomic, only if still ours and open), then pay: a race loses nothing
    const marked = await Settlement.findOneAndUpdate(
      { _id: player.settlementId, 'carnival.currentoffers': { $elemMatch: { _id: offer._id, claimedBy: player.playerId, filled: { $ne: true } } } },
      { $set: { 'carnival.currentoffers.$.filled': true } },
      { new: true, projection: { 'carnival.currentoffers': 1 } }
    ).lean();
    if (!marked) return res.status(409).json({ error: 'already-filled' });

    const paid = { item: offer.itemGiven, qty: offer.qtyGiven };
    const slot = player.inventory.find((i) => i.type === paid.item);
    if (slot) slot.quantity += paid.qty;
    else player.inventory.push({ type: paid.item, quantity: paid.qty });
    player.markModified('inventory');
    player.markModified('backpack');
    player.lastTransactionIds.set(TX_KEY, { id: transactionId, timestamp: Date.now(), result: { paid } });
    await player.save();
    res.json({ success: true, paid, offers: offersOf(marked), inventory: player.inventory, backpack: player.backpack });
  } catch (err) {
    console.error('❌ harvest-fair/fill failed:', err);
    res.status(500).json({ error: 'Delivery failed.' });
  }
});

module.exports = router;
