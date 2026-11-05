/**
 * The Caravan (code name: Train), server side. The server owns a player's Caravan: it makes the
 * orders and rewards, fills an order (goods out, Money in), and mails each reward tier the moment
 * it is earned; the train scheduler's departure mails any tier a failed send left behind, so no
 * player has to come back for rewards they earned (owner, 2026-11-02). Routes: routes/caravanRoutes.js.
 *
 * Offer and reward generation is the client's former TrainOfferLogic.js + Economy/askSizing.js,
 * ported unchanged (docs/tuning.md, Train; "Effort and ask sizing").
 *
 * Player.train: currentTrainNumber, currentTrainOffers [{ item, quantity, completed, band }],
 * currentTrainRewards [{ item, quantity, tier }], nextTrainOffers / nextTrainRewards (the preview),
 * and two no-double-mail markers: lastBaseRewardTrainNumber (base tier mailed) and
 * lastRewardDeliveryTrainNumber (full tier mailed, or the Caravan closed at departure).
 */
const Player = require('../models/player');
const Settlement = require('../models/settlement');
const masterResources = require('../tuning/resources.json');
const globalTuning = require('../tuning/globalTuning.json');
const XP_THRESHOLDS = require('../tuning/xpLevels.json').map((l) => l.xp);
const offerEligibility = require('./offerEligibility');

const TRAIN_REWARD_MESSAGE_ID = 101;
const TRAIN_LEVEL = masterResources.find((r) => r.type === 'Train')?.level || 1;   // the panel's LevelLock

// ---------- tuning constants (docs/tuning.md, Train) ----------
// A Caravan holds three bands of orders: a couple of basic crops anyone can grow, easy crafts from
// stations the player has had for a while, and a couple of aspirational orders from the newest
// station their level has unlocked (owned or not, skill or not). Filling every order but the
// aspirational ones pays the base reward; filling all of them adds the full reward on top.
const BASIC_CROP_ORDERS = 2;
const ASPIRATIONAL_ORDERS = 2;
const BASIC_CROP_LEAD_LEVELS = 3;   // crops count as basic when their plot unlocked this many levels ago
const EASY_STATION_LEAD_LEVELS = 2; // crafted goods count as easy when their station unlocked this long ago
const FIRST_TIME_CROP_QUANTITY = [5, 20];
const STATION_CATEGORY = 'crafting';

// ---------- helpers ----------
const byType = new Map(masterResources.map((r) => [r.type, r]));
const randomInt = ([min, max]) => Math.floor(Math.random() * (max - min + 1)) + min;
const pickRandom = (list) => list[Math.floor(Math.random() * list.length)];

/** The level a total xp gives (the client's getDerivedLevel). */
function playerLevelOf(player) {
  let level = 1;
  for (let i = 0; i < XP_THRESHOLDS.length && (player?.xp || 0) >= XP_THRESHOLDS[i]; i++) level = i + 2;
  return level;
}

function isACrop(type) {
  if (type === 'Oak Tree' || type === 'Pine Tree') return false;
  return masterResources.some((r) => r.category === 'farmplot' && r.output === type);
}

function areIngredientsUnlocked(resource, playerLevel, depth = 0) {
  if (!resource || depth > 6) return true;
  const ingredients = [resource.ingredient1, resource.ingredient2, resource.ingredient3, resource.ingredient4].filter(Boolean);
  for (const ingredient of ingredients) {
    const ing = byType.get(ingredient);
    if (!ing) continue;
    if (ing.level && ing.level > playerLevel) return false;
    const source = byType.get(ing.source);
    if (source?.level && source.level > playerLevel) return false;
    if (!areIngredientsUnlocked(ing, playerLevel, depth + 1)) return false;
  }
  return true;
}

// ---------- ask sizing (game-client/src/Economy/askSizing.js) ----------
const SIZING_FALLBACK = {
  exponent: 0.4,
  exponentSlow: 0.4,
  spread: 0.25,
  kent: [{ maxLevel: 999, qtyAt1Min: 10, min: 1, max: 20 }],
  train: [{ maxLevel: 999, qtyAt1Min: 40, min: 2, max: 40 }],
  trainBandScale: {},
};
const sizingConfig = () => ({ ...SIZING_FALLBACK, ...(globalTuning.askSizing || {}) });
const levelRow = (table, level) => table.find((row) => level <= row.maxLevel) || table[table.length - 1];

function getAskCenter(resource, playerLevel, kind = 'kent', scale = 1) {
  const config = sizingConfig();
  const row = levelRow(config[kind] || SIZING_FALLBACK[kind], playerLevel);
  const effort = Math.max(0.01, Number(resource?.effort) || 1);
  const exponent = effort > 1 ? (config.exponentSlow ?? config.exponent) : config.exponent;
  const center = row.qtyAt1Min * Math.pow(effort, -exponent) * scale;
  return Math.min(row.max, Math.max(row.min, center));
}

function pickAskQuantity(resource, playerLevel, kind = 'kent', scale = 1) {
  const config = sizingConfig();
  const row = levelRow(config[kind] || SIZING_FALLBACK[kind], playerLevel);
  const center = getAskCenter(resource, playerLevel, kind, scale);
  const jitter = 1 + (Math.random() * 2 - 1) * config.spread;
  return Math.min(row.max, Math.max(row.min, Math.round(center * jitter)));
}

const trainBandScale = (band) => Number(sizingConfig().trainBandScale?.[band]) || 1;

// ---------- orders and rewards (the client's TrainOfferLogic.js) ----------
function orderQuantity(resource, band, playerLevel, firstTimeUser) {
  if (firstTimeUser) return randomInt(FIRST_TIME_CROP_QUANTITY);
  return pickAskQuantity(resource, playerLevel, 'train', trainBandScale(band));
}

/** XP one order is worth: what Kent would pay for the same goods (2 x xp per Kent-sized card). */
function trainOrderXP(offer, playerLevel) {
  const resource = byType.get(offer.item);
  const kentAsk = resource ? Math.max(1, getAskCenter(resource, playerLevel, 'kent')) : 1;
  const kentCards = Math.max(1, Math.round((offer.quantity || 0) / kentAsk));
  return (resource?.xp || 1) * 2 * kentCards;
}

/** Filled orders that unlock the base reward: all but the aspirational ones. */
function baseThreshold(offers) {
  const count = offers?.length || 0;
  const aspirational = offers?.some((o) => o.band)
    ? offers.filter((o) => o.band === 'aspirational').length
    : Math.min(ASPIRATIONAL_ORDERS, Math.max(0, count - 1));
  return Math.max(1, count - aspirational);
}

/** Rewards saved before tiers existed: their XP is the base tier and the rest the full tier. */
function splitRewards(rewards) {
  const tierOf = (r) => r.tier || (r.item === 'XP' ? 'base' : 'full');
  return {
    base: (rewards || []).filter((r) => tierOf(r) === 'base'),
    full: (rewards || []).filter((r) => tierOf(r) === 'full'),
  };
}

function isOrderable(resource, season, playerLevel, player) {
  // The static gates (a good with a home source, not noCaravan, not an epic/legendary scroll find)
  // are the shared rule, utils/offerRules.mjs; the rest here depends on the player and the season
  if (offerEligibility.blocked(resource, 'caravan')) return false;
  if (resource.season && resource.season !== season) return false;
  if (resource.level && resource.level > playerLevel) return false;
  const source = byType.get(resource.source);
  if (source?.level && source.level > playerLevel) return false;
  if (!areIngredientsUnlocked(resource, playerLevel)) return false;
  const ingredients = [resource.ingredient1, resource.ingredient2, resource.ingredient3, resource.ingredient4].filter(Boolean);
  for (const ingredient of ingredients) {
    const ing = byType.get(ingredient);
    if (ing?.season && ing.season !== season) return false;
  }
  // Enemy drops wait for the valley trophy and the dropping enemy's home level (offerEligibility.js)
  if (!offerEligibility.enemyDropReady(resource, player, playerLevel)) return false;
  return true;
}

function hasSkillsFor(resource, skillTypes) {
  if (resource.requires && !skillTypes.includes(resource.requires)) return false;
  const source = byType.get(resource.source);
  if (source?.requires && !skillTypes.includes(source.requires)) return false;
  return true;
}

function generateOffers(player, season) {
  const skillTypes = (player.skills || []).map((s) => s.type);
  const playerLevel = playerLevelOf(player);
  const firstTimeUser = player.firsttimeuser === true;
  const maxOffers = globalTuning.maxTrainOffers || 8;

  const orderable = masterResources.filter((r) => isOrderable(r, season, playerLevel, player));
  const makeable = orderable.filter((r) => hasSkillsFor(r, skillTypes));
  const sourceLevel = (r) => byType.get(r.source)?.level || 1;
  const isStationGood = (r) => byType.get(r.source)?.category === STATION_CATEGORY;

  const crops = makeable.filter((r) => isACrop(r.type));
  const basicCrops = crops.filter((r) => sourceLevel(r) <= Math.max(1, playerLevel - BASIC_CROP_LEAD_LEVELS));
  const nonCrops = makeable.filter((r) => !isACrop(r.type));
  const easyGoods = nonCrops.filter((r) => !isStationGood(r) || sourceLevel(r) <= playerLevel - EASY_STATION_LEAD_LEVELS);

  // Aspirational: the newest station's goods (level-gated only), else the highest-xp goods
  const stations = masterResources
    .filter((s) => s.category === STATION_CATEGORY && s.level && s.level <= playerLevel)
    .sort((a, b) => b.level - a.level);
  let newestStationGoods = [];
  for (const station of stations) {
    newestStationGoods = orderable.filter((r) => r.source === station.type);
    if (newestStationGoods.length > 0) break;
  }
  const topXPGoods = [...nonCrops].sort((a, b) => (b.xp || 1) - (a.xp || 1)).slice(0, 6);

  const offers = [];
  const used = new Set();
  const take = (pools, band) => {
    for (const pool of pools) {
      const available = pool.filter((r) => !used.has(r.type));
      if (available.length === 0) continue;
      const resource = pickRandom(available);
      used.add(resource.type);
      offers.push({ item: resource.type, quantity: orderQuantity(resource, band, playerLevel, firstTimeUser), completed: false, band });
      return true;
    }
    return false;
  };

  if (firstTimeUser) {
    for (let i = 0; i < maxOffers && take([crops], 'basic'); i++);
    return offers;
  }
  const easyCount = Math.max(0, maxOffers - BASIC_CROP_ORDERS - ASPIRATIONAL_ORDERS);
  for (let i = 0; i < BASIC_CROP_ORDERS; i++) take([basicCrops, crops], 'basic');
  for (let i = 0; i < ASPIRATIONAL_ORDERS; i++) take([newestStationGoods, topXPGoods], 'aspirational');
  for (let i = 0; i < easyCount; i++) take([easyGoods, nonCrops, crops], 'easy');
  const bandOrder = { basic: 0, easy: 1, aspirational: 2 };
  return offers.sort((a, b) => bandOrder[a.band] - bandOrder[b.band]);
}

/** Base tier: XP worth the basic and easy orders. Full tier: the aspirational XP + 1-3 seasonal items. */
function generateRewards(offers, player, season) {
  const rewards = [];
  const seasonal = globalTuning.trainRewards?.[(season || 'Spring').toLowerCase()];
  if (!Array.isArray(seasonal)) return rewards;

  if (seasonal.includes('XP')) {
    const playerLevel = playerLevelOf(player);
    const threshold = baseThreshold(offers);
    const isAspirational = (o, i) => (o.band ? o.band === 'aspirational' : i >= threshold);
    const baseXP = offers.filter((o, i) => !isAspirational(o, i)).reduce((sum, o) => sum + trainOrderXP(o, playerLevel), 0);
    const fullXP = offers.filter((o, i) => isAspirational(o, i)).reduce((sum, o) => sum + trainOrderXP(o, playerLevel), 0);
    if (baseXP > 0) rewards.push({ item: 'XP', quantity: baseXP, tier: 'base' });
    if (fullXP > 0) rewards.push({ item: 'XP', quantity: fullXP, tier: 'full' });
  }
  const pool = seasonal.filter((r) => r !== 'XP');
  const count = pool.length > 0 ? Math.floor(Math.random() * Math.min(3, pool.length)) + 1 : 0;
  const usedRewards = new Set();
  for (let i = 0; i < count; i++) {
    const available = pool.filter((r) => !usedRewards.has(r));
    if (available.length === 0) break;
    const reward = pickRandom(available);
    usedRewards.add(reward);
    rewards.push({ item: reward, quantity: isACrop(reward) ? randomInt([1, 10]) : randomInt([1, 3]), tier: 'full' });
  }
  return rewards;
}

function generateTrain(player, season) {
  const offers = generateOffers(player, season);
  return { offers, rewards: generateRewards(offers, player, season) };
}

/** Money one order pays: the good's maxprice x quantity (as the panel shows it). */
const orderMoney = (offer) => (byType.get(offer.item)?.maxprice || 100) * offer.quantity;

// ---------- the Caravan on a player document ----------

/** The season a player's Caravan is made for: the developer override, else the frontier's. */
const seasonFor = (player, frontier) => player.settings?.seasonOverride || frontier?.seasons?.seasonType || 'Spring';

/**
 * The settlement's Caravan number: the "Current Train" log, else (between departing and the next
 * arrival, when none is current) the newest one.
 */
function settlementTrainNumber(settlement) {
  const log = settlement?.trainlog || [];
  const current = log.find((l) => l.status === 'Current Train');
  if (current) return current.trainnumber || 1;
  const departed = log.filter((l) => l.status === 'Departed Train').map((l) => l.trainnumber || 0);
  return departed.length ? Math.max(...departed) : 1;
}

const plain = (doc) => (doc && doc.toObject ? doc.toObject() : doc);

/**
 * Mails every reward tier this Caravan has earned and not yet mailed, by mutating `player`
 * (messages + markers; the caller saves). Returns the rewards mailed, [{ item, quantity }].
 */
function mailEarnedTiers(player) {
  const train = player.train || {};
  const n = train.currentTrainNumber || 0;
  const offers = train.currentTrainOffers || [];
  if (!n || offers.length === 0) return [];
  const filled = offers.filter((o) => o.completed === true).length;
  const { base, full } = splitRewards(plain(train.currentTrainRewards) || []);
  const fullDone = (train.lastRewardDeliveryTrainNumber || 0) >= n;
  const baseDone = fullDone || (train.lastBaseRewardTrainNumber || 0) >= n;
  const delivered = [];
  const mail = (rewards) => {
    if (rewards.length === 0) return;
    player.messages.push({
      messageId: TRAIN_REWARD_MESSAGE_ID, receivedAt: new Date(), collected: false, neverPurge: false,
      rewards: rewards.map((r) => ({ item: r.item, qty: r.quantity })),
    });
    delivered.push(...rewards.map((r) => ({ item: r.item, quantity: r.quantity })));
  };
  if (!baseDone && filled >= baseThreshold(offers)) {
    mail(base);
    player.train.lastBaseRewardTrainNumber = n;
  }
  if (!fullDone && filled === offers.length) {
    mail(full);
    player.train.lastRewardDeliveryTrainNumber = n;
  }
  if (delivered.length || !baseDone || !fullDone) player.markModified('train');
  return delivered;
}

/**
 * Brings a player's Caravan up to the settlement's: a player behind moves on (the earned tiers of
 * the old one mailed first; the preview becomes the current Caravan), a player with none gets one.
 * Mutates `player`; returns { changed, delivered }.
 */
function catchUp(player, settlementNumber, season) {
  if (!player.train) player.train = {};
  const train = player.train;
  const mine = train.currentTrainNumber || 0;
  let changed = false;
  let delivered = [];

  if (mine < settlementNumber) {
    delivered = mailEarnedTiers(player);
    const next = plain(train.nextTrainOffers) || [];
    const fresh = next.length > 0
      ? { offers: next, rewards: plain(train.nextTrainRewards) || [] }
      : generateTrain(player, season);
    const preview = generateTrain(player, season);
    train.currentTrainNumber = settlementNumber;
    train.currentTrainOffers = fresh.offers;
    train.currentTrainRewards = fresh.rewards;
    train.nextTrainOffers = preview.offers;
    train.nextTrainRewards = preview.rewards;
    changed = true;
  } else if ((train.currentTrainOffers || []).length === 0) {
    const fresh = generateTrain(player, season);
    const preview = generateTrain(player, season);
    train.currentTrainNumber = settlementNumber;
    train.currentTrainOffers = fresh.offers;
    train.currentTrainRewards = fresh.rewards;
    train.nextTrainOffers = preview.offers;
    train.nextTrainRewards = preview.rewards;
    changed = true;
  }
  if (changed) player.markModified('train');
  return { changed, delivered };
}

/**
 * Departure (schedulers/trainScheduler.js, phase "departing"): every player of the settlement
 * whose Caravan is still open gets any earned tier a failed send left behind, and the Caravan is
 * closed. Tiers are normally mailed on the order that earns them, so this is the safety net that
 * needs no login. Returns how many players were mailed something.
 */
async function sweepDeparture(settlementId, trainNumber) {
  const players = await Player.find({
    settlementId,
    'train.currentTrainNumber': { $gt: 0, $lte: trainNumber },
  });
  let mailed = 0;
  for (const player of players) {
    const train = player.train || {};
    if ((train.lastRewardDeliveryTrainNumber || 0) >= (train.currentTrainNumber || 0)) continue;
    try {
      const delivered = mailEarnedTiers(player);
      player.train.lastRewardDeliveryTrainNumber = train.currentTrainNumber; // closed: nothing more can be earned
      player.markModified('train');
      await player.save();
      if (delivered.length) mailed++;
    } catch (err) {
      console.error(`❌ Caravan departure sweep failed for ${player.username}:`, err.message);
    }
  }
  return mailed;
}

/** The settlement a player belongs to, with its trainlog. */
const homeSettlement = (player) => (player.settlementId ? Settlement.findById(player.settlementId, 'trainlog').lean() : null);

module.exports = {
  TRAIN_REWARD_MESSAGE_ID, TRAIN_LEVEL, playerLevelOf,
  generateTrain, mailEarnedTiers, catchUp, sweepDeparture,
  settlementTrainNumber, seasonFor, orderMoney, baseThreshold, homeSettlement,
};
