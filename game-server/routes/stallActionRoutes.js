/**
 * The Trade Stall as action routes (docs/refactor-plan.md Phase 5: "deduct stock on list, escrow
 * moneyCommitted on request, atomic buy"; 2026-11-04). Same contract as routes/actionRoutes.js:
 * one request per action, every number from tuning (globalTuning.tradeStallSlots /
 * tradeStallRequests, resources.json maxprice), the answer carries the player delta and the stall.
 *
 * The stall lives on the Player (`tradeStall`, `tradeStallRequests`: untyped arrays, so every
 * write marks them modified). The acting player is serialised by utils/playerWriteLock.js; the
 * OTHER player in a two-player deal (a buyer taking a listing, a seller filling a request) is
 * changed with one conditional atomic update that claims the slot only if it is still exactly as
 * seen, so two buyers can never both get one listing and nothing of theirs is overwritten.
 *
 *   POST /action/stall-unlock          { slotIndex }                  Wood for a listing slot
 *   POST /action/stall-list            { slotIndex, resource, amount } goods out of the holdings onto the stall
 *   POST /action/stall-sell-to-game    { slotIndex }                  an unsold listing, after its wait, for its price
 *   POST /action/stall-collect         { slotIndex }                  the Money another player paid
 *   POST /action/stall-buy             { sellerPlayerId, slotIndex }  buy another player's listing
 *   POST /action/request-unlock        { slotIndex }                  Wood for a request slot
 *   POST /action/request-create        { slotIndex, resource, amount } ask for goods; the Money is held (escrow)
 *   POST /action/request-cancel        { slotIndex }                  the held Money comes back
 *   POST /action/request-fulfill       { buyerPlayerId, slotIndex }   fill another player's request
 */
const express = require('express');
const router = express.Router();
const Player = require('../models/player');
const globalTuning = require('../tuning/globalTuning.json');
const econ = require('../utils/playerEconomy');
const { heldQuantity, takeFromHoldings, spendCosts } = require('../utils/playerHoldings');
const { isCurrency } = require('../utils/inventoryUtils');
const { isHopeArtifact } = require('../utils/hopeArtifacts');
const offerEligibility = require('../utils/offerEligibility');

const stallBlocked = (type) => !!type && (isHopeArtifact(type) || !!offerEligibility.blocked(type, 'tradeStall'));
const fail = (res, status, reason, extra = {}) => res.status(status).json({ success: false, error: reason, reason, ...extra });

const LISTING_SLOTS = 6;
const REQUEST_SLOTS = 3;
const emptyListing = (slotIndex, locked) => ({ slotIndex, locked: !!locked, resource: null, amount: 0, price: 0, sellTime: null, boughtBy: null, boughtFor: null });
const emptyRequest = (slotIndex, locked) => ({ slotIndex, locked: !!locked, resource: null, amount: 0, price: 0, moneyCommitted: 0 });
const listingConfig = (i) => (globalTuning.tradeStallSlots || []).find((s) => s.slotIndex === i) || null;
const requestConfig = (i) => (globalTuning.tradeStallRequests || []).find((s) => s.slotIndex === i) || null;

/** The player's stall arrays, filled out to their slot counts (an old record may be short). */
function stallsOf(player) {
  // a slot is found by its slotIndex (the client's rule), falling back to its position
  const pick = (list, i) => (list || []).find((x) => x && x.slotIndex === i) || ((list || [])[i] && (list[i].slotIndex === undefined || list[i].slotIndex === i) ? { ...list[i], slotIndex: i } : null);
  const listings = Array.from({ length: LISTING_SLOTS }, (_, i) => pick(player.tradeStall, i) || emptyListing(i, i !== 0));
  const requests = Array.from({ length: REQUEST_SLOTS }, (_, i) => pick(player.tradeStallRequests, i) || emptyRequest(i, i !== 0));
  return { listings, requests };
}
function saveStalls(player, { listings, requests }) {
  if (listings) { player.tradeStall = listings; player.markModified('tradeStall'); }
  if (requests) { player.tradeStallRequests = requests; player.markModified('tradeStallRequests'); }
}

const answerWith = (player) => ({
  player: econ.playerDelta(player),
  tradeStall: player.tradeStall,
  tradeStallRequests: player.tradeStallRequests,
  seq: econ.nextSeq(),
});

/** Load the acting player; a refusal from here on carries the delta and the stall. */
async function actor(req, res) {
  const { playerId } = req.body || {};
  if (!playerId) { fail(res, 400, 'bad-request'); return null; }
  const player = await Player.findById(playerId);
  if (!player) { fail(res, 404, 'no-player'); return null; }
  const refuse = (status, reason, extra = {}) => fail(res, status, reason, { ...answerWith(player), ...extra });
  const slotIndex = Number(req.body.slotIndex);
  return { player, refuse, slotIndex };
}

const finish = async (res, player, extra = {}) => {
  player.lastActive = new Date();
  await player.save();
  return res.json({ success: true, ...extra, ...answerWith(player) });
};

const wrap = (name, fn) => async (req, res) => {
  try { await fn(req, res); } catch (err) {
    console.error(`❌ action/${name} failed:`, err);
    if (!res.headersSent) res.status(500).json({ success: false, error: `${name}-failed`, detail: err.message });
  }
};

/** Grant goods to ANOTHER player's warehouse atomically (the update-inventory-delta pattern). */
async function grantToOther(playerId, type, qty) {
  await Player.bulkWrite([
    { updateOne: { filter: { _id: playerId, 'inventory.type': type }, update: { $inc: { 'inventory.$.quantity': qty } } } },
    { updateOne: { filter: { _id: playerId, 'inventory.type': { $ne: type } }, update: { $push: { inventory: { type, quantity: qty } } } } },
  ]);
}

// ---- Listings -------------------------------------------------------------------------------

router.post('/action/stall-unlock', wrap('stall-unlock', async (req, res) => {
  const ctx = await actor(req, res); if (!ctx) return;
  const { player, refuse, slotIndex } = ctx;
  const cfg = listingConfig(slotIndex);
  const stalls = stallsOf(player);
  if (!cfg || !stalls.listings[slotIndex]) return refuse(400, 'no-slot');
  if (!stalls.listings[slotIndex].locked) return refuse(409, 'unlocked');
  if (cfg.requiresGoldPass && player.accountStatus !== 'Gold') return refuse(403, 'needs-gold');
  if (!spendCosts({ ingredient1: 'Wood', ingredient1qty: cfg.unlockCost || 0 }, player.inventory, player.backpack)) return refuse(409, 'short-Wood');
  player.markModified('inventory'); player.markModified('backpack');
  stalls.listings[slotIndex] = { ...stalls.listings[slotIndex], locked: false };
  saveStalls(player, { listings: stalls.listings });
  return finish(res, player);
}));

router.post('/action/stall-list', wrap('stall-list', async (req, res) => {
  const ctx = await actor(req, res); if (!ctx) return;
  const { player, refuse, slotIndex } = ctx;
  const { resource } = req.body;
  const amount = Math.floor(Number(req.body.amount));
  const cfg = listingConfig(slotIndex);
  const stalls = stallsOf(player);
  const slot = stalls.listings[slotIndex];
  const def = econ.resourceDef(resource);
  if (!cfg || !slot) return refuse(400, 'no-slot');
  if (slot.locked) return refuse(409, 'locked');
  if (slot.resource) return refuse(409, 'busy');
  if (!def || isCurrency(resource) || stallBlocked(resource)) return refuse(400, 'not-for-trade-stall');
  if (!(amount > 0) || amount > (cfg.maxAmount || 0)) return refuse(400, 'bad-amount');
  if (!takeFromHoldings(player.inventory, player.backpack, resource, amount)) return refuse(409, `short-${resource}`);
  player.markModified('inventory'); player.markModified('backpack');
  stalls.listings[slotIndex] = {
    ...emptyListing(slotIndex, false),
    resource, amount, price: def.maxprice || 0, sellTime: Date.now() + (cfg.sellWaitTime || 0),
  };
  saveStalls(player, { listings: stalls.listings });
  return finish(res, player);
}));

router.post('/action/stall-sell-to-game', wrap('stall-sell-to-game', async (req, res) => {
  const ctx = await actor(req, res); if (!ctx) return;
  const { player, refuse, slotIndex } = ctx;
  const stalls = stallsOf(player);
  const slot = stalls.listings[slotIndex];
  if (!slot || !slot.resource) return refuse(409, 'empty');
  if (stallBlocked(slot.resource)) return refuse(400, 'not-for-trade-stall');
  if (slot.boughtBy) return refuse(409, 'sold');
  if (!slot.sellTime || slot.sellTime > Date.now()) return refuse(409, 'not-ready');
  const money = (slot.amount || 0) * (slot.price || 0);
  econ.grant(player, 'Money', money);
  econ.advanceQuests(player, 'Sell', slot.resource, slot.amount);
  stalls.listings[slotIndex] = emptyListing(slotIndex, slot.locked);
  saveStalls(player, { listings: stalls.listings });
  return finish(res, player, { sold: { type: slot.resource, qty: slot.amount }, money });
}));

router.post('/action/stall-collect', wrap('stall-collect', async (req, res) => {
  const ctx = await actor(req, res); if (!ctx) return;
  const { player, refuse, slotIndex } = ctx;
  const stalls = stallsOf(player);
  const slot = stalls.listings[slotIndex];
  if (!slot || !slot.boughtBy || !slot.boughtFor) return refuse(409, 'nothing-to-collect');
  econ.grant(player, 'Money', slot.boughtFor);
  if (slot.resource) econ.advanceQuests(player, 'Sell', slot.resource, slot.amount);
  stalls.listings[slotIndex] = emptyListing(slotIndex, slot.locked);
  saveStalls(player, { listings: stalls.listings });
  return finish(res, player, { money: slot.boughtFor, sold: { type: slot.resource, qty: slot.amount } });
}));

/**
 * Buy another player's listing. The seller's slot is claimed atomically (only if it still holds
 * the same goods and nobody has bought it); then the buyer pays and receives. The seller collects
 * the Money later with stall-collect.
 */
router.post('/action/stall-buy', wrap('stall-buy', async (req, res) => {
  const ctx = await actor(req, res); if (!ctx) return;
  const { player, refuse, slotIndex } = ctx;
  const sellerId = req.body.sellerPlayerId;
  if (!sellerId || String(sellerId) === String(player._id)) return refuse(400, 'bad-seller');
  const seller = await Player.findById(sellerId).select('tradeStall username').lean();
  const slot = seller?.tradeStall?.[slotIndex];
  if (!slot || !slot.resource || !(slot.amount > 0)) return refuse(409, 'gone');
  if (slot.boughtBy) return refuse(409, 'gone');
  if (stallBlocked(slot.resource)) return refuse(400, 'not-for-trade-stall');
  const total = (slot.amount || 0) * (slot.price || 0);
  if (heldQuantity(player.inventory, player.backpack, 'Money') < total) return refuse(409, 'short-Money');
  const room = econ.roomFor(player, slot.resource, slot.amount);
  if (!room.ok) return refuse(409, room.reason);

  const claimed = await Player.updateOne(
    { _id: sellerId, [`tradeStall.${slotIndex}.resource`]: slot.resource, [`tradeStall.${slotIndex}.amount`]: slot.amount, [`tradeStall.${slotIndex}.boughtBy`]: null },
    { $set: { [`tradeStall.${slotIndex}.boughtBy`]: player.username, [`tradeStall.${slotIndex}.boughtFor`]: total, [`tradeStall.${slotIndex}.sellTime`]: null } },
  );
  if (!claimed.modifiedCount) return refuse(409, 'gone');
  try {
    takeFromHoldings(player.inventory, player.backpack, 'Money', total);
    econ.grant(player, slot.resource, slot.amount);
    player.markModified('inventory'); player.markModified('backpack');
    return await finish(res, player, { bought: { type: slot.resource, qty: slot.amount }, cost: total });
  } catch (err) {
    // the buyer's save failed: give the seller their listing back
    await Player.updateOne({ _id: sellerId }, { $set: { [`tradeStall.${slotIndex}.boughtBy`]: null, [`tradeStall.${slotIndex}.boughtFor`]: null, [`tradeStall.${slotIndex}.sellTime`]: Date.now() } }).catch(() => {});
    throw err;
  }
}));

// ---- Requests -------------------------------------------------------------------------------

router.post('/action/request-unlock', wrap('request-unlock', async (req, res) => {
  const ctx = await actor(req, res); if (!ctx) return;
  const { player, refuse, slotIndex } = ctx;
  const cfg = requestConfig(slotIndex);
  const stalls = stallsOf(player);
  if (!cfg || !stalls.requests[slotIndex]) return refuse(400, 'no-slot');
  if (!stalls.requests[slotIndex].locked) return refuse(409, 'unlocked');
  if (cfg.requiresGoldPass && player.accountStatus !== 'Gold') return refuse(403, 'needs-gold');
  if (!spendCosts({ ingredient1: 'Wood', ingredient1qty: cfg.unlockCost || 0 }, player.inventory, player.backpack)) return refuse(409, 'short-Wood');
  player.markModified('inventory'); player.markModified('backpack');
  stalls.requests[slotIndex] = { ...stalls.requests[slotIndex], locked: false };
  saveStalls(player, { requests: stalls.requests });
  return finish(res, player);
}));

router.post('/action/request-create', wrap('request-create', async (req, res) => {
  const ctx = await actor(req, res); if (!ctx) return;
  const { player, refuse, slotIndex } = ctx;
  const { resource } = req.body;
  const amount = Math.floor(Number(req.body.amount));
  const cfg = requestConfig(slotIndex);
  const stalls = stallsOf(player);
  const slot = stalls.requests[slotIndex];
  const def = econ.resourceDef(resource);
  if (!cfg || !slot) return refuse(400, 'no-slot');
  if (slot.locked) return refuse(409, 'locked');
  if (slot.resource) return refuse(409, 'busy');
  if (!def || isCurrency(resource) || stallBlocked(resource)) return refuse(400, 'not-for-trade-stall');
  if (!(amount > 0) || amount > (cfg.maxAmount || 0)) return refuse(400, 'bad-amount');
  const price = def.maxprice || 0;
  const total = amount * price;
  if (!takeFromHoldings(player.inventory, player.backpack, 'Money', total)) return refuse(409, 'short-Money');
  player.markModified('inventory'); player.markModified('backpack');
  stalls.requests[slotIndex] = { ...emptyRequest(slotIndex, false), resource, amount, price, moneyCommitted: total };
  saveStalls(player, { requests: stalls.requests });
  return finish(res, player);
}));

router.post('/action/request-cancel', wrap('request-cancel', async (req, res) => {
  const ctx = await actor(req, res); if (!ctx) return;
  const { player, refuse, slotIndex } = ctx;
  const stalls = stallsOf(player);
  const slot = stalls.requests[slotIndex];
  if (!slot || !slot.resource) return refuse(409, 'empty');
  econ.grant(player, 'Money', slot.moneyCommitted || 0);
  stalls.requests[slotIndex] = emptyRequest(slotIndex, slot.locked);
  saveStalls(player, { requests: stalls.requests });
  return finish(res, player, { refunded: slot.moneyCommitted || 0 });
}));

/**
 * Fill another player's request: the request is claimed atomically (only if unchanged), the
 * seller hands over the goods and receives the held Money, the buyer's warehouse receives the
 * goods. The buyer's room is the combined warehouse + backpack space (the old route's rule).
 */
router.post('/action/request-fulfill', wrap('request-fulfill', async (req, res) => {
  const ctx = await actor(req, res); if (!ctx) return;
  const { player, refuse, slotIndex } = ctx;
  const buyerId = req.body.buyerPlayerId;
  if (!buyerId || String(buyerId) === String(player._id)) return refuse(400, 'bad-buyer');
  const buyer = await Player.findById(buyerId);
  const request = buyer?.tradeStallRequests?.[slotIndex];
  if (!request || !request.resource || !request.amount || !request.moneyCommitted) return refuse(409, 'gone');
  if (heldQuantity(player.inventory, player.backpack, request.resource) < request.amount) return refuse(409, `short-${request.resource}`);
  const cap = econ.capacityOf(buyer);
  const goods = (list) => (list || []).filter((i) => i && !isCurrency(i.type)).reduce((n, i) => n + (i.quantity || 0), 0);
  if (!isCurrency(request.resource) && goods(buyer.inventory) + goods(buyer.backpack) + request.amount > cap.warehouse + cap.backpack) return refuse(409, 'buyer-full');

  const claimed = await Player.updateOne(
    { _id: buyerId, [`tradeStallRequests.${slotIndex}.resource`]: request.resource, [`tradeStallRequests.${slotIndex}.amount`]: request.amount, [`tradeStallRequests.${slotIndex}.moneyCommitted`]: request.moneyCommitted },
    { $set: { [`tradeStallRequests.${slotIndex}`]: emptyRequest(slotIndex, request.locked) } },
  );
  if (!claimed.modifiedCount) return refuse(409, 'gone');
  try {
    takeFromHoldings(player.inventory, player.backpack, request.resource, request.amount);
    econ.grant(player, 'Money', request.moneyCommitted);
    econ.advanceQuests(player, 'Sell', request.resource, request.amount);
    player.markModified('inventory'); player.markModified('backpack');
    player.lastActive = new Date();
    await player.save();
  } catch (err) {
    await Player.updateOne({ _id: buyerId }, { $set: { [`tradeStallRequests.${slotIndex}`]: request } }).catch(() => {});
    throw err;
  }
  await grantToOther(buyerId, request.resource, request.amount);
  return res.json({ success: true, earned: request.moneyCommitted, resource: request.resource, amount: request.amount, ...answerWith(player) });
}));

module.exports = router;
