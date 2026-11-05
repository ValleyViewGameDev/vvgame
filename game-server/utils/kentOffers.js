/**
 * Kent, server side (Phase 5, 2026-11-04). The server owns a player's Kent board: it makes the
 * offers, sells one (goods out backpack first, rewards and XP in) and replaces a sold or dismissed
 * card. Routes: routes/kentRoutes.js. The client never writes Player.kentOffers (/update-profile
 * drops it); it keeps only display helpers (calculateKentOfferXP for the card's XP).
 *
 * Offer generation lives only here (docs/tuning.md §4); it began as a rule-for-rule port of the
 * client's KentOfferLogic.js, which now keeps only calculateKentOfferXP (its twin below: change
 * both together).
 *
 * Player.kentOffers: { endTime (always 0: Kent never leaves), offers: [{ item, quantity,
 * items?: [{ item, quantity }], rewards: [{ item, quantity }] }] }. The slot cooldowns
 * (globalTuning.kentCardCooldownSeconds) are the client's, in localStorage (Kent.js).
 */
const masterResources = require('../tuning/resources.json');
const globalTuning = require('../tuning/globalTuning.json');
const offerEligibility = require('./offerEligibility');
const econ = require('./playerEconomy');

// ---------- tuning constants (KentOfferLogic.js, top of file) ----------
const MULTI_ITEM_TARGET_COUNTS = [
  { maxLevel: 5, min: 0, target: 0, max: 0 },
  { maxLevel: 6, min: 1, target: 1, max: 2 },
  { maxLevel: 7, min: 1, target: 2, max: 3 },
  { maxLevel: 9, min: 1, target: 3, max: 4 },
  { maxLevel: Infinity, min: 3, target: 5, max: 6 },
];
const CROP_PERCENTAGE_BY_LEVEL = [
  { maxLevel: 3, percentage: 0.8 },
  { maxLevel: 7, percentage: 0.5 },
  { maxLevel: Infinity, percentage: 0 },
];
const BASIC_CROP_GUARANTEE_MAX_LEVEL = 12;
const BASIC_CROPS = ['Wheat', 'Carrot', 'Corn', 'Sugarcane'];
const MAX_OFFERS_BY_LEVEL = [
  { maxLevel: 7, count: 6 },
  { maxLevel: 8, count: 7 },
  { maxLevel: Infinity, count: 8 },
];
const STATION_CATEGORY = 'crafting';
const VALLEY_BONUS_MIN_LEVEL = 11;
const VALLEY_BONUS_QUANTITY = {
  legendary: { min: 1, max: 1 },
  epic: { min: 1, max: 1 },
  rare: { min: 1, max: 2 },
  uncommon: { min: 1, max: 3 },
  common: { min: 1, max: 3 },
};

const byType = new Map(masterResources.map((r) => [r.type, r]));

// ---------- helpers ----------

/** Utils/ResourceHelpers.js areIngredientsUnlocked: every ingredient (recursively) unlocked at this level. */
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

// Economy/askSizing.js (also copied in utils/caravan.js): change all three together
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

/** askSizing.js getAskCenter (kind 'kent'). */
function getAskCenter(resource, playerLevel, kind = 'kent', scale = 1) {
  const config = sizingConfig();
  const row = levelRow(config[kind] || SIZING_FALLBACK[kind], playerLevel);
  const effort = Math.max(0.01, Number(resource?.effort) || 1);
  const exponent = effort > 1 ? (config.exponentSlow ?? config.exponent) : config.exponent;
  const center = row.qtyAt1Min * Math.pow(effort, -exponent) * scale;
  return Math.min(row.max, Math.max(row.min, center));
}

/** askSizing.js pickAskQuantity (kind 'kent'). */
function pickAskQuantity(resource, playerLevel, kind = 'kent', scale = 1) {
  const config = sizingConfig();
  const row = levelRow(config[kind] || SIZING_FALLBACK[kind], playerLevel);
  const center = getAskCenter(resource, playerLevel, kind, scale);
  const jitter = 1 + (Math.random() * 2 - 1) * config.spread;
  return Math.min(row.max, Math.max(row.min, Math.round(center * jitter)));
}

// Economy/DropRates.js getRarityChance + selectWeightedRandomItem
const STANDARD_RARITY = { common: 100, uncommon: 50, rare: 20, epic: 5, legendary: 1 };
function getRarityChance(rarity, level = 1) {
  if (typeof rarity === 'number') return rarity * level;
  const base = STANDARD_RARITY[rarity] || STANDARD_RARITY.common;
  return base * Math.pow(level, (100 - base) / 100);
}
function selectWeightedRandomItem(items, level = 1) {
  if (!items || items.length === 0) return null;
  const total = items.reduce((sum, item) => sum + getRarityChance(item.scrollchance, level), 0);
  const roll = Math.random() * total;
  let cumulative = 0;
  for (const item of items) {
    cumulative += getRarityChance(item.scrollchance, level);
    if (roll <= cumulative) return item;
  }
  return items[0];
}

/** The goods a card asks for, either form (legacy single-item or items[]). */
const itemsOf = (offer) => (offer?.items?.length ? offer.items : (offer?.item ? [{ item: offer.item, quantity: offer.quantity }] : []));

/** KentOfferLogic.js getMaxKentOffers */
function getMaxKentOffers(playerLevel) {
  return (MAX_OFFERS_BY_LEVEL.find((band) => playerLevel <= band.maxLevel) || MAX_OFFERS_BY_LEVEL[MAX_OFFERS_BY_LEVEL.length - 1]).count;
}

/** KentOfferLogic.js getNewestStationGoods */
function getNewestStationGoods(eligibleResources, playerLevel) {
  const stations = masterResources
    .filter((r) => r.category === STATION_CATEGORY && r.level && r.level <= playerLevel)
    .sort((a, b) => b.level - a.level);
  for (let i = 0; i < stations.length; i++) {
    const sameLevel = stations.filter((s) => s.level === stations[i].level).map((s) => s.type);
    const goods = eligibleResources.filter((r) => sameLevel.includes(r.source));
    if (goods.length > 0) return new Set(goods.map((r) => r.type));
    i += sameLevel.length - 1;
  }
  return new Set();
}

/** KentOfferLogic.js calculateKentOfferXP: per item 2 x xp (1 if undefined), +2 when above the usual ask. */
function calculateKentOfferXP(offer, playerLevel) {
  let totalXP = 0;
  for (const { item, quantity } of itemsOf(offer)) {
    const resource = byType.get(item);
    let itemXP = resource?.xp || 1;
    if (resource && Number(quantity) > Math.round(getAskCenter(resource, playerLevel, 'kent'))) itemXP += 1;
    totalXP += itemXP;
  }
  return totalXP * 2;
}

/** KentOfferLogic.js pickItemWithQuantity */
function pickItemWithQuantity(availableResources, playerLevel) {
  if (availableResources.length === 0) return null;
  const resource = availableResources[Math.floor(Math.random() * availableResources.length)];
  return { resource, quantity: pickAskQuantity(resource, playerLevel, 'kent') };
}

/** The season Kent's offers are made for: the client's timers.seasons.type (App.js fetchTimersData). */
function seasonFor(player, frontier) {
  const override = player?.settings?.seasonOverride;
  if (override && override !== 'None') return override;
  return frontier?.seasons?.seasonType || 'Unknown';
}

/** KentOfferLogic.js generateNewKentOffers' eligibility filter. */
function isEligible(resource, player, season, playerLevel) {
  if (offerEligibility.blocked(resource, 'kent')) return false;
  if (resource.season && resource.season !== season) return false;
  const ingredients = [resource.ingredient1, resource.ingredient2, resource.ingredient3, resource.ingredient4].filter(Boolean);
  for (const ingredient of ingredients) {
    const ing = byType.get(ingredient);
    if (ing && ing.season && ing.season !== season) return false;
  }
  // Enemy drops wait for the valley trophy and the dropping enemy's home level (offerEligibility.js)
  if (!offerEligibility.enemyDropReady(resource, player, playerLevel)) return false;
  if (resource.level && resource.level > playerLevel) return false;
  const source = byType.get(resource.source);
  if (source && source.level && source.level > playerLevel) return false;
  if (!areIngredientsUnlocked(resource, playerLevel)) return false;
  return true;
}

/**
 * KentOfferLogic.js generateNewKentOffers. `existingOffers` is the board after any removal;
 * targetOfferCount (discard all) generates exactly that many, else the board grows: +1 to
 * replace, +1 more until the level's cap.
 */
function generateNewKentOffers(player, existingOffers, season, targetOfferCount = null) {
  const playerLevel = econ.levelOf(player);
  const eligibleResources = masterResources.filter((r) => isEligible(r, player, season, playerLevel));
  if (eligibleResources.length === 0) return [];

  const newOffers = [];
  const maxOffers = getMaxKentOffers(playerLevel);
  const currentOfferCount = existingOffers.length;

  const multiCfg = MULTI_ITEM_TARGET_COUNTS.find((t) => playerLevel <= t.maxLevel) || { min: 0, target: 0, max: 0 };
  const { min: multiMin, target: multiTarget, max: multiMax } = multiCfg;
  let targetMultiItemCount;
  if (multiMin === multiMax) {
    targetMultiItemCount = multiMin;
  } else {
    const rand1 = Math.floor(Math.random() * (multiMax - multiMin + 1)) + multiMin;
    const rand2 = Math.floor(Math.random() * (multiMax - multiMin + 1)) + multiMin;
    targetMultiItemCount = Math.abs(rand1 - multiTarget) <= Math.abs(rand2 - multiTarget) ? rand1 : rand2;
  }

  let offersToGenerate;
  if (targetOfferCount !== null) {
    offersToGenerate = Math.min(targetOfferCount, maxOffers);
  } else {
    const desiredTotal = Math.min(currentOfferCount + 2, maxOffers);
    offersToGenerate = desiredTotal - currentOfferCount;
  }

  const cropPercentage = (CROP_PERCENTAGE_BY_LEVEL.find((t) => playerLevel <= t.maxLevel) || { percentage: 0 }).percentage;

  let existingCropCount = 0;
  let existingMultiItemCount = 0;
  existingOffers.forEach((offer) => {
    if (cropPercentage > 0 && econ.isACrop(offer.item)) existingCropCount++;
    if (offer.items && offer.items.length > 1) existingMultiItemCount++;
  });

  const totalOffersAfter = currentOfferCount + offersToGenerate;
  const totalCropsWanted = Math.ceil(totalOffersAfter * cropPercentage);
  const cropOffersNeeded = Math.max(0, totalCropsWanted - existingCropCount);
  const multiItemOffersNeeded = Math.max(0, targetMultiItemCount - existingMultiItemCount);
  let multiItemOffersGenerated = 0;
  const nonCropOffersNeeded = offersToGenerate - cropOffersNeeded;

  const isBasicCropOffer = (offer) => {
    const list = itemsOf(offer);
    return list.length === 1 && BASIC_CROPS.includes(list[0].item);
  };
  let basicCropStillNeeded = playerLevel <= BASIC_CROP_GUARANTEE_MAX_LEVEL
    && !existingOffers.some(isBasicCropOffer)
    && eligibleResources.some((r) => BASIC_CROPS.includes(r.type));
  let cropOffersGenerated = 0;

  const newestStationGoods = getNewestStationGoods(eligibleResources, playerLevel);
  const hasStationGood = (offer) => itemsOf(offer).some((it) => newestStationGoods.has(it.item));
  let stationGoodStillNeeded = newestStationGoods.size > 0 && !existingOffers.some(hasStationGood);

  const getAvailableResources = (usedResourceTypes = []) => {
    const all = [...existingOffers, ...newOffers];
    const counts = {};
    all.forEach((offer) => {
      if (offer.items) offer.items.forEach((it) => { counts[it.item] = (counts[it.item] || 0) + 1; });
      else if (offer.item) counts[offer.item] = (counts[offer.item] || 0) + 1;
    });
    usedResourceTypes.forEach((type) => { counts[type] = (counts[type] || 0) + 1; });
    return eligibleResources.filter((r) => {
      const count = counts[r.type] || 0;
      const maxAllowed = (r.level && r.level === playerLevel) ? 1 : 2;
      return count < maxAllowed;
    });
  };

  for (let i = 0; i < offersToGenerate; i++) {
    let availableResources = getAvailableResources();

    if (cropPercentage > 0) {
      const cropOffersStillNeeded = cropOffersNeeded - cropOffersGenerated;
      const nonCropOffersGenerated = i - cropOffersGenerated;
      const nonCropOffersStillNeeded = nonCropOffersNeeded - nonCropOffersGenerated;
      if (cropOffersStillNeeded > 0) {
        const crops = availableResources.filter((r) => econ.isACrop(r.type));
        if (crops.length > 0) availableResources = crops;
      } else if (nonCropOffersStillNeeded > 0) {
        const nonCrops = availableResources.filter((r) => !econ.isACrop(r.type));
        if (nonCrops.length > 0) availableResources = nonCrops;
      }
    }

    const forceBasicCrop = basicCropStillNeeded;
    if (forceBasicCrop) availableResources = eligibleResources.filter((r) => BASIC_CROPS.includes(r.type));

    const forceStationGood = !forceBasicCrop && stationGoodStillNeeded;
    if (forceStationGood) {
      const capped = getAvailableResources().filter((r) => newestStationGoods.has(r.type));
      availableResources = capped.length > 0 ? capped : eligibleResources.filter((r) => newestStationGoods.has(r.type));
    }

    if (availableResources.length === 0) break;

    const multiItemStillNeeded = multiItemOffersNeeded - multiItemOffersGenerated;
    const singleItemStillNeeded = offersToGenerate - i - multiItemStillNeeded;
    let isMultiItem;
    if (forceBasicCrop || forceStationGood) isMultiItem = false;
    else if (multiItemStillNeeded > 0 && singleItemStillNeeded <= 0) isMultiItem = true;
    else if (multiItemStillNeeded <= 0) isMultiItem = false;
    else isMultiItem = Math.random() < (multiItemStillNeeded / (offersToGenerate - i));

    if (!isMultiItem && !forceBasicCrop && !forceStationGood) {
      const singleItemTypes = new Set();
      [...existingOffers, ...newOffers].forEach((offer) => {
        const isSingle = (offer.items && offer.items.length === 1) || (!offer.items && offer.item);
        if (isSingle) singleItemTypes.add(offer.items ? offer.items[0].item : offer.item);
      });
      availableResources = availableResources.filter((r) => !singleItemTypes.has(r.type));
      if (availableResources.length === 0) continue;
    }

    const items = [];
    let totalRewardAmount = 0;
    const firstPick = pickItemWithQuantity(availableResources, playerLevel);
    if (!firstPick) break;
    items.push({ item: firstPick.resource.type, quantity: firstPick.quantity });
    totalRewardAmount += (firstPick.resource.maxprice || firstPick.resource.minprice || 10) * firstPick.quantity;
    if (econ.isACrop(firstPick.resource.type)) cropOffersGenerated++;

    if (isMultiItem) {
      const availableForSecond = getAvailableResources([firstPick.resource.type])
        .filter((r) => r.type !== firstPick.resource.type);
      if (availableForSecond.length > 0) {
        const secondPick = pickItemWithQuantity(availableForSecond, playerLevel);
        if (secondPick) {
          items.push({ item: secondPick.resource.type, quantity: secondPick.quantity });
          totalRewardAmount += (secondPick.resource.maxprice || secondPick.resource.minprice || 10) * secondPick.quantity;
          multiItemOffersGenerated++;
        }
      }
    }

    const rewards = [{ item: 'Money', quantity: totalRewardAmount }];

    if (playerLevel >= VALLEY_BONUS_MIN_LEVEL) {
      const dropRate = globalTuning?.harvestDropRate || 0.1;
      if (Math.random() <= dropRate) {
        const valleyResources = masterResources.filter((r) => r.source === 'valley' && r.scrollchance);
        const picked = valleyResources.length > 0 ? selectWeightedRandomItem(valleyResources, 1) : null;
        if (picked) {
          const range = VALLEY_BONUS_QUANTITY[picked.scrollchance] || VALLEY_BONUS_QUANTITY.common;
          rewards.push({ item: picked.type, quantity: Math.floor(Math.random() * (range.max - range.min + 1)) + range.min });
        }
      }
    }

    newOffers.push({ items, item: items[0].item, quantity: items[0].quantity, rewards });
    if (forceBasicCrop) basicCropStillNeeded = false;
    if (forceStationGood) stationGoodStillNeeded = false;
  }
  return newOffers;
}

/**
 * KentOfferLogic.js updateKentOffersAfterTrade with a slot index (the only way Kent.js calls it):
 * the slot's card is removed, the first new card goes into that slot, any growth card at the end.
 * Returns the new offers array. Used for a sale and a dismiss alike.
 */
function replaceSlot(player, offers, slotIndex, season) {
  const without = offers.filter((_, i) => i !== slotIndex);
  const fresh = generateNewKentOffers(player, without, season);
  const updated = [...without];
  if (fresh.length > 0) {
    updated.splice(slotIndex, 0, fresh[0]);
    if (fresh.length > 1) updated.push(...fresh.slice(1));
  }
  return updated;
}

/** Kent.js handleDismissAll / handleDebugRefresh: a whole new board of `count` cards. */
function regenerateAll(player, count, season) {
  return generateNewKentOffers(player, [], season, count);
}

/** Kent.js generateFallbackKentOffer: an empty board gets one Wheat x4 card at Wheat's maxprice. */
function fallbackOffers() {
  const wheatMaxPrice = byType.get('Wheat')?.maxprice || 100;
  return [{ item: 'Wheat', quantity: 4, rewards: [{ item: 'Money', quantity: wheatMaxPrice * 4 }] }];
}

/**
 * What a stored card may pay (offers written by older clients were never checked): Money at most
 * the generator's price for its goods, a non-Money reward only a valley find (with scrollchance)
 * within its rarity's bonus quantity. Legit cards pay exactly what they show.
 */
function trustedRewards(offer) {
  const goods = itemsOf(offer);
  const maxMoney = goods.reduce((n, { item, quantity }) => {
    const def = byType.get(item);
    return n + (def ? (def.maxprice || def.minprice || 10) : 0) * (Number(quantity) || 0);
  }, 0);
  const out = [];
  for (const reward of offer?.rewards || []) {
    const qty = Math.floor(Number(reward?.quantity) || 0);
    if (!(qty > 0)) continue;
    if (reward.item === 'Money') { out.push({ item: 'Money', quantity: Math.min(qty, maxMoney) }); continue; }
    const def = byType.get(reward.item);
    if (!def || def.source !== 'valley' || !def.scrollchance) continue;
    const range = VALLEY_BONUS_QUANTITY[def.scrollchance] || VALLEY_BONUS_QUANTITY.common;
    out.push({ item: reward.item, quantity: Math.min(qty, range.max) });
  }
  return out;
}

/** A stored card's goods are a real sale: known goods, positive whole quantities. */
function validGoods(offer) {
  const goods = itemsOf(offer);
  return goods.length > 0 && goods.every(({ item, quantity }) => byType.has(item) && Number.isInteger(Number(quantity)) && Number(quantity) > 0);
}

module.exports = {
  BASIC_CROPS,
  getMaxKentOffers,
  calculateKentOfferXP,
  generateNewKentOffers,
  replaceSlot,
  regenerateAll,
  fallbackOffers,
  trustedRewards,
  validGoods,
  itemsOf,
  seasonFor,
};
