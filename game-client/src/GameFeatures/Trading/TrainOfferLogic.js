import { isACrop, areIngredientsUnlocked } from '../../Utils/ResourceHelpers';
import { getDerivedLevel } from '../../Utils/playerManagement';
import { getAskCenter, pickAskQuantity, getTrainBandScale } from '../../Economy/askSizing';

// ============================================================================
// TUNING CONSTANTS (docs/tuning.md, Train) - 2026-10-12
// ============================================================================
// A Train holds three bands of orders: a couple of basic crops anyone can grow, easy crafts from
// stations the player has had for a while, and a couple of aspirational orders from the newest
// station their level has unlocked (owned or not, skill or not). The rewards are tiered so the
// aspirational orders are a stretch, never a wall: filling every order but the aspirational ones
// pays the base reward; filling all of them adds the full reward on top.

const BASIC_CROP_ORDERS = 2;
const ASPIRATIONAL_ORDERS = 2;
// Crops count as basic when their plot unlocked at least this many levels ago (else any crop)
const BASIC_CROP_LEAD_LEVELS = 3;
// Crafted goods count as easy when their station unlocked at least this many levels ago
const EASY_STATION_LEAD_LEVELS = 2;

// Quantities are sized by each good's `effort` with the `askSizing.train` table and
// `trainBandScale` in globalTuning.json (Economy/askSizing.js). First-time users get crops only,
// in this fixed range.
const FIRST_TIME_CROP_QUANTITY = [5, 20];

const STATION_CATEGORY = 'crafting';

// ============================================================================
// HELPERS
// ============================================================================

const randomInt = ([min, max]) => Math.floor(Math.random() * (max - min + 1)) + min;

const pickRandom = (list) => list[Math.floor(Math.random() * list.length)];

function orderQuantity(resource, band, playerLevel, firstTimeUser, globalTuning) {
    if (firstTimeUser) return randomInt(FIRST_TIME_CROP_QUANTITY);
    return pickAskQuantity(resource, playerLevel, globalTuning, 'train', getTrainBandScale(globalTuning, band));
}

/**
 * XP one Train order is worth: what Kent would pay for the same goods. The order counts as
 * quantity / (Kent's usual ask for that good at this level) Kent cards, at least one, each paying
 * 2 x the good's xp.
 */
export function getTrainOrderXP(offer, masterResources, playerLevel, globalTuning) {
    const resource = masterResources.find(r => r.type === offer.item);
    const kentAsk = resource ? Math.max(1, getAskCenter(resource, playerLevel, globalTuning, 'kent')) : 1;
    const kentCards = Math.max(1, Math.round((offer.quantity || 0) / kentAsk));
    return (resource?.xp || 1) * 2 * kentCards;
}

/**
 * How many filled orders unlock the base reward: every order except the aspirational ones
 * (older Trains without bands: all but ASPIRATIONAL_ORDERS).
 */
export function getTrainBaseThreshold(offers) {
    const count = offers?.length || 0;
    const aspirational = offers?.some(o => o.band)
        ? offers.filter(o => o.band === 'aspirational').length
        : Math.min(ASPIRATIONAL_ORDERS, Math.max(0, count - 1));
    return Math.max(1, count - aspirational);
}

/**
 * Splits a Train's rewards into the base tier and the full tier. Rewards saved before tiers
 * existed have no `tier`: their XP is the base reward and the rest the full reward.
 */
export function splitTrainRewards(rewards) {
    const tierOf = (r) => r.tier || (r.item === 'XP' ? 'base' : 'full');
    return {
        base: (rewards || []).filter(r => tierOf(r) === 'base'),
        full: (rewards || []).filter(r => tierOf(r) === 'full')
    };
}

/**
 * Whether a resource can be ordered at all at this level and season (no skill check)
 */
function isOrderable(resource, masterResources, currentSeason, playerLevel, hasExploreValleyTrophy) {
    if (resource.category !== 'doober') return false;
    if (resource.output === 'noBank') return false;
    if (!resource.source || resource.source === 'valley') return false;
    if (resource.scrollchance === 'epic' || resource.scrollchance === 'legendary') return false;
    if (resource.season && resource.season !== currentSeason) return false;
    if (resource.level && resource.level > playerLevel) return false;

    const sourceResource = masterResources.find(r => r.type === resource.source);
    if (sourceResource?.level && sourceResource.level > playerLevel) return false;
    if (!areIngredientsUnlocked(resource, masterResources, playerLevel)) return false;

    // Ingredients out of season make the good impossible this season
    const ingredients = [resource.ingredient1, resource.ingredient2, resource.ingredient3, resource.ingredient4].filter(Boolean);
    for (const ingredient of ingredients) {
        const ingredientResource = masterResources.find(r => r.type === ingredient);
        if (ingredientResource?.season && ingredientResource.season !== currentSeason) return false;
    }

    // Enemy drops wait for the "Explore the Valley" trophy
    if (!hasExploreValleyTrophy && masterResources.some(r => r.action === 'attack' && r.output === resource.type)) {
        return false;
    }
    return true;
}

/**
 * Whether the player has the skills to make a resource (its own and its source's)
 */
function hasSkillsFor(resource, masterResources, playerSkillTypes) {
    if (resource.requires && !playerSkillTypes.includes(resource.requires)) return false;
    const sourceResource = masterResources.find(r => r.type === resource.source);
    if (sourceResource?.requires && !playerSkillTypes.includes(sourceResource.requires)) return false;
    return true;
}

/**
 * Generates new Train offers in three bands (basic crops, easy crafts, aspirational)
 * @returns {Array} [{ item, quantity, band }]
 */
export function generateNewTrainOffers(currentPlayer, masterResources, globalTuning, currentSeason, masterXPLevels) {
    const playerSkillTypes = (currentPlayer?.skills || []).map(skill => skill.type);
    const playerLevel = getDerivedLevel(currentPlayer, masterXPLevels);
    const firstTimeUser = currentPlayer?.firsttimeuser === true;
    const hasExploreValleyTrophy = currentPlayer?.trophies?.some(trophy => trophy.title === "Explore the Valley");
    const maxOffers = globalTuning?.maxTrainOffers || 8;

    const orderable = masterResources.filter(r => isOrderable(r, masterResources, currentSeason, playerLevel, hasExploreValleyTrophy));
    const makeable = orderable.filter(r => hasSkillsFor(r, masterResources, playerSkillTypes));
    const sourceLevel = (r) => masterResources.find(s => s.type === r.source)?.level || 1;
    const isStationGood = (r) => masterResources.find(s => s.type === r.source)?.category === STATION_CATEGORY;

    const crops = makeable.filter(r => isACrop(r.type, masterResources));
    const basicCrops = crops.filter(r => sourceLevel(r) <= Math.max(1, playerLevel - BASIC_CROP_LEAD_LEVELS));
    const nonCrops = makeable.filter(r => !isACrop(r.type, masterResources));
    const easyGoods = nonCrops.filter(r => !isStationGood(r) || sourceLevel(r) <= playerLevel - EASY_STATION_LEAD_LEVELS);

    // Aspirational: the newest station's goods (level-gated only), else the highest-xp goods the
    // player can already make
    const stations = masterResources
        .filter(s => s.category === STATION_CATEGORY && s.level && s.level <= playerLevel)
        .sort((a, b) => b.level - a.level);
    let newestStationGoods = [];
    for (const station of stations) {
        newestStationGoods = orderable.filter(r => r.source === station.type);
        if (newestStationGoods.length > 0) break;
    }
    const topXPGoods = [...nonCrops].sort((a, b) => (b.xp || 1) - (a.xp || 1)).slice(0, 6);

    const offers = [];
    const used = new Set();
    const take = (pools, band) => {
        for (const pool of pools) {
            const available = pool.filter(r => !used.has(r.type));
            if (available.length === 0) continue;
            const resource = pickRandom(available);
            used.add(resource.type);
            offers.push({ item: resource.type, quantity: orderQuantity(resource, band, playerLevel, firstTimeUser, globalTuning), band });
            return true;
        }
        return false;
    };

    if (firstTimeUser) {
        // First-time users: crops only, no bands beyond basic
        for (let i = 0; i < maxOffers && take([crops], 'basic'); i++);
        return offers;
    }

    const easyCount = Math.max(0, maxOffers - BASIC_CROP_ORDERS - ASPIRATIONAL_ORDERS);
    for (let i = 0; i < BASIC_CROP_ORDERS; i++) take([basicCrops, crops], 'basic');
    for (let i = 0; i < ASPIRATIONAL_ORDERS; i++) take([newestStationGoods, topXPGoods], 'aspirational');
    for (let i = 0; i < easyCount; i++) take([easyGoods, nonCrops, crops], 'easy');

    if (offers.length === 0) console.warn('No eligible resources found for Train offers');

    // Display order: basic, easy, aspirational
    const bandOrder = { basic: 0, easy: 1, aspirational: 2 };
    return offers.sort((a, b) => bandOrder[a.band] - bandOrder[b.band]);
}

/**
 * Generates a Train's rewards, tiered. Base tier: XP worth the basic and easy orders. Full tier:
 * XP worth the aspirational orders plus 1 to 3 of the season's train rewards (hearts).
 * Each XP figure is the sum of its orders' getTrainOrderXP, so the panel shows exactly what pays.
 */
export function generateTrainRewards(trainOffers, currentPlayer, masterResources, globalTuning, currentSeason, masterXPLevels) {
    const rewards = [];
    const seasonKey = currentSeason ? currentSeason.toLowerCase() : 'spring';
    const seasonalRewards = globalTuning?.trainRewards?.[seasonKey];

    if (!seasonalRewards || !Array.isArray(seasonalRewards)) {
        console.warn('🚂 No train rewards found for season:', seasonKey, 'in globalTuning');
        return rewards;
    }

    if (seasonalRewards.includes('XP')) {
        const playerLevel = getDerivedLevel(currentPlayer, masterXPLevels);
        const orderXP = (o) => getTrainOrderXP(o, masterResources, playerLevel, globalTuning);
        const threshold = getTrainBaseThreshold(trainOffers);
        const isAspirational = (o, i) => (o.band ? o.band === 'aspirational' : i >= threshold);
        const baseXP = trainOffers.filter((o, i) => !isAspirational(o, i)).reduce((sum, o) => sum + orderXP(o), 0);
        const fullXP = trainOffers.filter((o, i) => isAspirational(o, i)).reduce((sum, o) => sum + orderXP(o), 0);
        if (baseXP > 0) rewards.push({ item: 'XP', quantity: baseXP, tier: 'base' });
        if (fullXP > 0) rewards.push({ item: 'XP', quantity: fullXP, tier: 'full' });
    }

    // 1 to 3 different seasonal items (hearts), full tier
    const pool = seasonalRewards.filter(reward => reward !== 'XP');
    const count = pool.length > 0 ? Math.floor(Math.random() * Math.min(3, pool.length)) + 1 : 0;
    const usedRewards = new Set();
    for (let i = 0; i < count; i++) {
        const available = pool.filter(reward => !usedRewards.has(reward));
        if (available.length === 0) break;
        const reward = pickRandom(available);
        usedRewards.add(reward);
        const quantity = isACrop(reward, masterResources) ? randomInt([1, 10]) : randomInt([1, 3]);
        rewards.push({ item: reward, quantity, tier: 'full' });
    }

    return rewards;
}

/**
 * Generates complete train data for a player (both offers and rewards)
 * @returns {Object} { offers: [], rewards: [] }
 */
export function generateCompleteTrainData(currentPlayer, masterResources, globalTuning, currentSeason, trainNumber, masterXPLevels) {
    const offers = generateNewTrainOffers(currentPlayer, masterResources, globalTuning, currentSeason, masterXPLevels);
    const rewards = generateTrainRewards(offers, currentPlayer, masterResources, globalTuning, currentSeason, masterXPLevels);
    return { offers, rewards };
}
