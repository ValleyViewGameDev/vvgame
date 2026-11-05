/**
 * Kent, the player's side (Phase 5, 2026-11-04). The server owns the board (utils/kentOffers.js):
 * the client never writes Player.kentOffers (/update-profile drops it) and never posts /addXP for
 * a sale. Every answer carries the board and the action-route player delta.
 *
 *   POST /api/action/kent-sync { playerId }
 *        -> { success, kentOffers, player, seq }
 *        An empty board gets the fallback card (Wheat x4); otherwise the board is returned as is.
 *   POST /api/action/kent-sell { playerId, offerIndex, expect? }
 *        -> { success, sold: [{item, quantity}], rewards: [{item, quantity}], xpGained, kentOffers, player, seq }
 *        The card in that slot: its goods leave (all or nothing, backpack first), its rewards and
 *        XP arrive, Sell quests per good and Serve Kent 1 advance, and the slot gets a new card
 *        (plus one growth card until the level's cap). `expect` (the card's items as the client
 *        shows them) guards a stale board.
 *        Refusals (nothing changed): 404 no-offer, 409 stale-offer, 409 short-<item>,
 *        409 no-backpack | warehouse-full | backpack-full, 400 bad-offer.
 *   POST /api/action/kent-dismiss { playerId, offerIndex } | { playerId, all: true }
 *        -> { success, kentOffers, player, seq }
 *        One card: replaced in its slot (plus growth), as a sale does. All: a whole new board of
 *        as many cards as there were (6 for an empty board, the developer refresh).
 * The slot cooldowns are the server's too (player.kentCooldowns, globalTuning.kentCardCooldownSeconds):
 * a sold or dismissed card's slot cannot be sold or dismissed again until its cooldown ends (409
 * cooldown); every answer carries `kentCooldowns` for the client's countdowns. A developer's
 * { all: true, debug: true } refresh skips and clears them.
 */
const express = require('express');
const router = express.Router();
const Player = require('../models/player');
const Frontier = require('../models/frontier');
const econ = require('../utils/playerEconomy');
const kent = require('../utils/kentOffers');
const { spendCosts, heldQuantity } = require('../utils/playerHoldings');
const { recordLevelUps } = require('../utils/analytics');
const globalTuning = require('../tuning/globalTuning.json');
const { isDeveloper } = require('../utils/developerHelpers');

const COOLDOWN_MS = (Number(globalTuning.kentCardCooldownSeconds) || 30) * 1000;
const COOLDOWN_SLACK_MS = 2000; // the client's clock starts the same cooldown on the tap
const cooldownsOf = (player) => ({ ...((player.kentCooldowns && typeof player.kentCooldowns === 'object') ? player.kentCooldowns : {}) });
const coolingDown = (player, index, now = Date.now()) => (Number(cooldownsOf(player)[index]) || 0) - COOLDOWN_SLACK_MS > now;
function startCooldowns(player, indexes, now = Date.now()) {
  const next = {};
  for (const [k, v] of Object.entries(cooldownsOf(player))) if (Number(v) > now) next[k] = v; // drop expired
  for (const i of indexes) next[i] = now + COOLDOWN_MS;
  player.kentCooldowns = next;
  player.markModified('kentCooldowns');
}

const fail = (res, status, reason, extra = {}) => res.status(status).json({ success: false, error: reason, reason, ...extra });

const plainOffers = (player) => {
  const ko = player.kentOffers;
  const offers = ko?.offers ? (typeof ko.offers.toObject === 'function' ? ko.offers.toObject() : ko.offers) : [];
  return JSON.parse(JSON.stringify(offers || []));
};
const boardOf = (player) => ({ endTime: 0, offers: plainOffers(player) });

function setBoard(player, offers) {
  player.kentOffers = { endTime: 0, offers };
  player.markModified('kentOffers');
}

async function loadKent(req, res) {
  const { playerId } = req.body || {};
  if (!playerId) { fail(res, 400, 'bad-request'); return null; }
  const player = await Player.findById(playerId);
  if (!player) { fail(res, 404, 'no-player'); return null; }
  const frontier = player.frontierId ? await Frontier.findById(player.frontierId, 'seasons').lean() : null;
  const season = kent.seasonFor(player, frontier);
  const answer = (status, reason, extra = {}) => fail(res, status, reason, {
    kentOffers: boardOf(player), kentCooldowns: cooldownsOf(player), player: econ.playerDelta(player), seq: econ.nextSeq(), ...extra,
  });
  return { player, season, answer };
}

const sameGoods = (a, b) => a.length === b.length
  && a.every((it, i) => it.item === b[i]?.item && Number(it.quantity) === Number(b[i]?.quantity));

router.post('/action/kent-sync', async (req, res) => {
  try {
    const ctx = await loadKent(req, res);
    if (!ctx) return;
    const { player } = ctx;
    if (plainOffers(player).length === 0) {
      setBoard(player, kent.fallbackOffers());
      await player.save();
    }
    return res.json({ success: true, kentOffers: boardOf(player), kentCooldowns: cooldownsOf(player), player: econ.playerDelta(player), seq: econ.nextSeq() });
  } catch (err) {
    console.error('❌ action/kent-sync failed:', err);
    return res.status(500).json({ success: false, error: 'kent-sync-failed', detail: err.message });
  }
});

router.post('/action/kent-sell', async (req, res) => {
  try {
    const ctx = await loadKent(req, res);
    if (!ctx) return;
    const { player, season, answer } = ctx;
    const index = Number(req.body.offerIndex);
    const offers = plainOffers(player);
    if (!Number.isInteger(index) || index < 0 || index >= offers.length) return answer(404, 'no-offer');
    if (coolingDown(player, index)) return answer(409, 'cooldown');
    const offer = offers[index];
    if (!kent.validGoods(offer)) return answer(400, 'bad-offer');
    const goods = kent.itemsOf(offer).map(({ item, quantity }) => ({ item, quantity: Number(quantity) }));
    if (Array.isArray(req.body.expect) && !sameGoods(req.body.expect, goods)) return answer(409, 'stale-offer');

    // The cost as a recipe, all or nothing, backpack first
    const recipe = {};
    goods.forEach(({ item, quantity }, i) => { recipe[`ingredient${i + 1}`] = item; recipe[`ingredient${i + 1}qty`] = quantity; });
    const short = goods.find(({ item, quantity }) => heldQuantity(player.inventory, player.backpack, item) < quantity);
    if (short) return answer(409, `short-${short.item}`);

    // Room for the rewards, counted after the goods have left (the client spent first, then gained)
    const rewards = kent.trustedRewards(offer);
    const shadow = {
      inventory: JSON.parse(JSON.stringify(player.inventory || [])),
      backpack: JSON.parse(JSON.stringify(player.backpack || [])),
      skills: player.skills, location: player.location, accountStatus: player.accountStatus,
      warehouseCapacity: player.warehouseCapacity, backpackCapacity: player.backpackCapacity,
    };
    spendCosts(recipe, shadow.inventory, shadow.backpack);
    let extra = 0;
    for (const { item, quantity } of rewards) {
      const room = econ.roomFor(shadow, item, quantity, { extra });
      if (!room.ok) return answer(409, room.reason);
      if (item !== 'Money') extra += quantity;
    }

    if (!spendCosts(recipe, player.inventory, player.backpack)) return answer(409, 'short');
    player.markModified('inventory'); player.markModified('backpack');
    for (const { item, quantity } of rewards) econ.grant(player, item, quantity);

    // The slot's new card is made at the level before this sale's XP, as the client made it
    // (Kent.js replaceSoldOffer read the pre-sale player)
    setBoard(player, kent.replaceSlot(player, offers, index, season));
    startCooldowns(player, [index]);

    const xpGained = kent.calculateKentOfferXP(offer, econ.levelOf(player));
    recordLevelUps(player._id, player.xp || 0, (player.xp || 0) + xpGained).catch(() => {});
    player.xp = (player.xp || 0) + xpGained;

    for (const { item, quantity } of goods) econ.advanceQuests(player, 'Sell', item, quantity);
    econ.advanceQuests(player, 'Serve', 'Kent', 1);

    player.lastActive = new Date();
    await player.save();
    return res.json({
      success: true, sold: goods, rewards, xpGained,
      kentOffers: boardOf(player), kentCooldowns: cooldownsOf(player), player: econ.playerDelta(player), seq: econ.nextSeq(),
    });
  } catch (err) {
    console.error('❌ action/kent-sell failed:', err);
    return res.status(500).json({ success: false, error: 'kent-sell-failed', detail: err.message });
  }
});

router.post('/action/kent-dismiss', async (req, res) => {
  try {
    const ctx = await loadKent(req, res);
    if (!ctx) return;
    const { player, season, answer } = ctx;
    const offers = plainOffers(player);
    if (req.body.all === true) {
      const debug = req.body.debug === true && isDeveloper(player.username);
      if (!debug && offers.some((_, i) => coolingDown(player, i))) return answer(409, 'cooldown');
      const board = kent.regenerateAll(player, offers.length || 6, season);
      setBoard(player, board);
      if (debug) { player.kentCooldowns = {}; player.markModified('kentCooldowns'); }
      else startCooldowns(player, board.map((_, i) => i));
    } else {
      const index = Number(req.body.offerIndex);
      if (!Number.isInteger(index) || index < 0 || index >= offers.length) return answer(404, 'no-offer');
      if (coolingDown(player, index)) return answer(409, 'cooldown');
      setBoard(player, kent.replaceSlot(player, offers, index, season));
      startCooldowns(player, [index]);
    }
    await player.save();
    return res.json({ success: true, kentOffers: boardOf(player), kentCooldowns: cooldownsOf(player), player: econ.playerDelta(player), seq: econ.nextSeq() });
  } catch (err) {
    console.error('❌ action/kent-dismiss failed:', err);
    return res.status(500).json({ success: false, error: 'kent-dismiss-failed', detail: err.message });
  }
});

module.exports = router;
