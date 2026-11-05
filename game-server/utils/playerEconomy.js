/**
 * The player's economy rules, server side (Phase 5, 2026-11-04): the ONE place an action route
 * (routes/actionRoutes.js and the crafting / trading routes as they move over) decides how much a
 * player gets, whether it fits, where it goes, which quests it advances and what the client is
 * told back. Each rule mirrors its client twin, named beside it, so the client's instant
 * prediction and the server's answer agree:
 *
 *   capacityOf        game-client Utils/InventoryManagement.js deriveWarehouseAndBackpackCapacity
 *   roomFor           hasRoomFor (currencies always fit; away from home goods need the Backpack skill)
 *   skillMultiplier   ResourceClicking.js handleDooberClick's buff product
 *   advanceQuests     GameFeatures/Quests/QuestGoalTracker.js trackQuestProgress
 *   isACrop           Utils/ResourceHelpers.js isACrop
 *   rollWarehouseDrop Utils/WarehouseMaterials.js checkAndDropWarehouseIngredient
 *
 * Spending (backpack first, then the warehouse) stays in utils/playerHoldings.js.
 *
 * THE RESPONSE CONTRACT. Every action route answers with `player: playerDelta(player)` and
 * `seq: nextSeq()`. The client applies it with Utils/playerDelta.js applyPlayerDelta, which
 * replaces exactly these fields on currentPlayer (and the inventory / backpack state) and drops
 * an answer older than one it has already applied, so the client never refetches the player
 * after an action.
 */
const fs = require('fs');
const path = require('path');
const masterResources = require('../tuning/resources.json');
const globalTuning = require('../tuning/globalTuning.json');
const { isCurrency } = require('./inventoryUtils');
const { recordQuestCompleted } = require('./analytics');

let masterSkills = null;
function loadMasterSkills() {
  if (!masterSkills) {
    try { masterSkills = JSON.parse(fs.readFileSync(path.join(__dirname, '../tuning/skillsTuning.json'), 'utf-8')); }
    catch (e) { masterSkills = {}; }
  }
  return masterSkills;
}

let questDefs = null;
function loadQuestDefs() {
  if (!questDefs) {
    try { questDefs = JSON.parse(fs.readFileSync(path.join(__dirname, '../tuning/quests/questsEN.json'), 'utf-8')); }
    catch (e) { questDefs = []; }
  }
  return questDefs;
}

const byType = new Map(masterResources.map((r) => [r.type, r]));
const resourceDef = (type) => byType.get(type) || null;

/** The grid belongs to this player: their homestead, or their own copy of a town/valley/dungeon. */
function ownsGrid(grid, player) {
  const pid = String(player._id);
  if (grid.ownerId && String(grid.ownerId) === pid) return true;
  if (grid.gridType === 'homestead' && player.gridId && String(player.gridId) === String(grid._id)) return true;
  return false;
}

/**
 * At home = on a homestead: goods go to the warehouse there, the backpack elsewhere (the client's
 * location.gtype rule). An action on a grid passes `{ atHome }` from the grid it acts on, since
 * the stored location can trail a grid change by a moment.
 */
const isAtHome = (player, opts = {}) => (typeof opts.atHome === 'boolean' ? opts.atHome : player?.location?.gtype === 'homestead');
const atHomeOn = (grid) => grid?.gridType === 'homestead';

const hasSkill = (player, type) => (player.skills || []).some((s) => s && s.type === type && (s.quantity || 0) > 0);

/** { warehouse, backpack } capacity: base + Gold bonus + capacity skills. */
function capacityOf(player) {
  const isGold = player.accountStatus === 'Gold';
  const acc = {
    warehouse: (player.warehouseCapacity || 0) + (isGold ? (globalTuning.warehouseCapacityGold || 100000) : 0),
    backpack: (player.backpackCapacity || 0) + (isGold ? (globalTuning.backpackCapacityGold || 5000) : 0),
  };
  for (const skill of player.skills || []) {
    const def = skill && resourceDef(skill.type);
    if (!def) continue;
    const bonus = def.qtycollected || 0;
    if (def.output === 'warehouseCapacity') acc.warehouse += bonus;
    else if (def.output === 'backpackCapacity') acc.backpack += bonus;
  }
  return acc;
}

const goodsCount = (list) => (Array.isArray(list) ? list : [])
  .filter((item) => item && !isCurrency(item.type) && typeof item.quantity === 'number')
  .reduce((n, item) => n + item.quantity, 0);

/**
 * Can the player take qty of type right now? { ok, reason }: reason 'no-backpack' (away from
 * home without the Backpack skill), 'warehouse-full' or 'backpack-full'. `extra` counts goods
 * already promised in the same action (a doober plus its bonus drop).
 */
function roomFor(player, type, qty, { extra = 0, atHome } = {}) {
  if (isCurrency(type)) return { ok: true };
  const home = isAtHome(player, { atHome });
  if (!home && !hasSkill(player, 'Backpack')) return { ok: false, reason: 'no-backpack' };
  const cap = capacityOf(player);
  const used = goodsCount(home ? player.inventory : player.backpack) + extra;
  if (used + qty > (home ? cap.warehouse : cap.backpack)) return { ok: false, reason: home ? 'warehouse-full' : 'backpack-full' };
  return { ok: true };
}

/** Add qty of type where it belongs (currencies and home: warehouse; away: backpack). Room is the caller's check. */
function grant(player, type, qty, { atHome } = {}) {
  if (!(qty > 0)) return null;
  const field = isCurrency(type) || isAtHome(player, { atHome }) ? 'inventory' : 'backpack';
  if (!Array.isArray(player[field])) player[field] = [];
  const list = player[field];
  const item = list.find((i) => i && i.type === type);
  if (item) item.quantity = (item.quantity || 0) + qty;
  else list.push({ type, quantity: qty });
  player.markModified?.(field);
  return field;
}

/** Product of every skill the player holds that buffs collecting this type (skillsTuning.json). */
function skillMultiplier(player, type) {
  const skills = loadMasterSkills();
  let multiplier = 1;
  for (const skill of player.skills || []) {
    if (!skill) continue;
    if (resourceDef(skill.type)?.category !== 'skill') continue;
    const buff = skills?.[skill.type]?.[type] || 1;
    if (buff > 1) multiplier *= buff;
  }
  return multiplier;
}

/**
 * Advance every active quest goal matching (action, item) by qty, completing quests whose goals
 * are all met. Goals are the ones stored on the quest (what the client tracks), else the
 * definition in questsEN.json. Returns true when anything changed.
 */
function advanceQuests(player, action, item, qty = 1) {
  const defs = loadQuestDefs();
  let changed = false;
  for (const quest of player.activeQuests || []) {
    if (!quest || quest.completed || quest.rewardCollected) continue;
    // the goals stored on the quest (what the client tracks), else the definition
    const def = quest.goal1action ? quest : (defs.find((q) => q.title === quest.questId) || quest);
    const progress = { ...(quest.progress || {}) };
    let goals = 0; let done = 0; let touched = false;
    for (let i = 1; i <= 3; i++) {
      const gAction = def[`goal${i}action`]; const gItem = def[`goal${i}item`]; const gQty = def[`goal${i}qty`];
      if (!gAction || !gItem || !gQty) continue;
      goals++;
      if (gAction === action && gItem === item) {
        progress[`goal${i}`] = Math.min((progress[`goal${i}`] || 0) + qty, gQty);
        touched = true;
      }
      if ((progress[`goal${i}`] || 0) >= gQty) done++;
    }
    if (!touched) continue;
    changed = true;
    quest.progress = progress;
    if (goals > 0 && done === goals) {
      quest.completed = true;
      recordQuestCompleted?.(player._id, quest.questId)?.catch?.(() => {});
    }
  }
  if (changed) player.markModified?.('activeQuests');
  return changed;
}

/** The farm plot that grows this type (a repeatable doober is replanted as it). */
const findFarmplotFor = (type) => masterResources.find((r) => r.category === 'farmplot' && r.output === type) || null;

/** A crop: the output of a farm plot (trees excluded). */
function isACrop(type) {
  if (type === 'Oak Tree' || type === 'Pine Tree') return false;
  return masterResources.some((r) => r.category === 'farmplot' && r.output === type);
}

// Warehouse tool drops: each third of players finds a different tool rarest (WarehouseMaterials.js)
const RARITY_ROTATION = {
  Saw: ['common', 'uncommon', 'rare'],
  Shovel: ['uncommon', 'rare', 'common'],
  Screwdriver: ['rare', 'common', 'uncommon'],
};
const STANDARD_RARITY = { common: 100, uncommon: 50, rare: 20, epic: 5, legendary: 1 };
function rarityGroup(playerId) {
  let hash = 0;
  for (const ch of String(playerId)) hash += ch.charCodeAt(0);
  return hash % 3;
}
function pickTierFirst(items, odds, rand) {
  const byTier = {};
  for (const item of items) (byTier[item.scrollchance] = byTier[item.scrollchance] || []).push(item);
  const tiers = Object.keys(odds || {}).filter((t) => byTier[t]?.length && odds[t] > 0);
  if (!tiers.length) {
    const total = items.reduce((n, i) => n + (STANDARD_RARITY[i.scrollchance] || 100), 0);
    let roll = rand() * total;
    return items.find((i) => (roll -= (STANDARD_RARITY[i.scrollchance] || 100)) <= 0) || items[items.length - 1];
  }
  const total = tiers.reduce((n, t) => n + odds[t], 0);
  let roll = rand() * total;
  const tier = tiers.find((t) => (roll -= odds[t]) < 0) || tiers[tiers.length - 1];
  const pool = byTier[tier];
  return pool[Math.floor(rand() * pool.length)];
}

/**
 * The bonus tool a crop harvest may drop (never on Wheat): globalTuning.warehouseDropRate, then
 * warehouseDropOdds per tier with the player's personalised rarity. Returns the type or null.
 */
function rollWarehouseDrop(player, cropType, rand = Math.random) {
  if (!isACrop(cropType) || cropType === 'Wheat') return null;
  return rollToolDrop(player, rand);
}

/** One crop's bonus-tool roll (the bulk harvest rolls once per non-Wheat plot). Type or null. */
function rollToolDrop(player, rand = Math.random) {
  const rate = globalTuning.warehouseDropRate ?? globalTuning.harvestDropRate ?? 0.1;
  if (rand() > rate) return null;
  const group = rarityGroup(player._id);
  const tools = masterResources
    .filter((r) => r.requires === 'Warehouse' && r.scrollchance)
    .map((r) => ({ ...r, scrollchance: RARITY_ROTATION[r.type]?.[group] || 'common' }));
  if (!tools.length) return null;
  return pickTierFirst(tools, globalTuning.warehouseDropOdds, rand)?.type || null;
}


// ---- Levels, station bonuses, skills and powers, scroll reveals -------------------------------

const XP_THRESHOLDS = require('../tuning/xpLevels.json').map((l) => l.xp);
/** The player's level from xp (Utils/playerManagement.js getDerivedLevel: index + 2 per threshold met). */
function levelOf(player) {
  const xp = player.xp || 0;
  let level = 1;
  for (let i = 0; i < XP_THRESHOLDS.length; i++) {
    if (xp >= XP_THRESHOLDS[i]) level = i + 2;
    else break;
  }
  return level;
}

/**
 * A crafting station's collect bonus: the product of every skill the player holds whose
 * skillsTuning row buffs this STATION type (InventoryManagement.js calculateSkillMultiplier
 * called with the station type, as CraftingStation's collect does).
 */
function stationMultiplier(player, stationType) {
  const skills = loadMasterSkills();
  let multiplier = 1;
  for (const skill of player.skills || []) {
    const buff = skill && skills?.[skill.type]?.[stationType];
    if (buff && buff > 1) multiplier *= buff;
  }
  return multiplier;
}

const hasSkillOrPower = (player, type) => !type
  || (player.skills || []).some((s) => s && s.type === type)
  || (player.powers || []).some((p) => p && p.type === type);

/**
 * Give a skill or a power (Utils/SkillPowerManagement.js gainSkillOrPower): a skill also advances
 * Acquire quests and the Skill Builder trophy; a power whose output is 'range' raises player.range.
 * Returns { ok, alreadyOwned, trophy } ; `applyTrophy` is passed in to keep this module free of
 * the trophy file.
 */
function grantSkillOrPower(player, def, qty = 1, { applyTrophy } = {}) {
  if (!def || (def.category !== 'skill' && def.category !== 'power')) return { ok: false };
  const field = def.category === 'skill' ? 'skills' : 'powers';
  if (!Array.isArray(player[field])) player[field] = [];
  const list = player[field];
  const owned = list.find((s) => s && s.type === def.type);
  if (owned) owned.quantity = (owned.quantity || 1) + qty;
  else list.push({ type: def.type, quantity: qty });
  player.markModified?.(field);
  let trophy = null;
  if (def.category === 'skill') {
    advanceQuests(player, 'Acquire', def.type, qty);
    if (applyTrophy) {
      const t = applyTrophy(player, 'Skill Builder', 1);
      if (t.success) trophy = { name: 'Skill Builder', trophy: t.trophy, isNewMilestone: t.isNewMilestone };
    }
  } else if (def.output === 'range' && typeof def.qtycollected === 'number') {
    player.range = (player.range || 0) + def.qtycollected;
  }
  return { ok: true, alreadyOwned: !!owned, trophy };
}

const DEFAULT_SCROLL_REVEAL_ODDS = { common: 38, uncommon: 28, rare: 22, epic: 8, legendary: 4 };
/** A Reveal Scroll's find (GameFeatures/Crafting/ScrollReveal.js getRandomScrollReveal): { type, qty }. */
function rollScrollReveal(rand = Math.random) {
  const items = masterResources.filter((r) => r.scrollchance);
  if (!items.length) return { type: 'Wood', qty: 10 };
  const picked = pickTierFirst(items, globalTuning.scrollRevealOdds || DEFAULT_SCROLL_REVEAL_ODDS, rand) || items[0];
  return { type: picked.type, qty: picked.scrollqty || 1 };
}


// ---- Gems for what is missing (Economy/GemCosts.js calculateGemPurchase) ------------------

const GEM_PRICE = { knee: 250, power: 0.35, linear: 'Money' }; // Economy/gemPricing.js
const smoothGems = (x) => (x <= GEM_PRICE.knee ? x : GEM_PRICE.knee * (x / GEM_PRICE.knee) ** GEM_PRICE.power);
const isGemBuyable = (def) => !!def && def.nogems !== true && typeof def.gemcost === 'number';
const heldOf = (player, type) => [...(player.inventory || []), ...(player.backpack || [])]
  .reduce((n, i) => (i && i.type === type ? n + (i.quantity || 0) : n), 0);

/**
 * The gems that stand in for whatever the player is short of on this recipe: each missing
 * ingredient at its gemcost (Money at its flat rate, the rest smoothed), a missing `requires`
 * skill at its gemcost (the skill is bypassed, not given). null when the recipe cannot be bought
 * with gems (nogems, or a missing piece that is not gem-buyable).
 */
function gemTopUpCost(player, recipe) {
  if (!recipe || recipe.nogems === true) return null;
  let smooth = 0; let flat = 0;
  for (let i = 1; i <= 10; i++) {
    const type = recipe[`ingredient${i}`]; const qty = Number(recipe[`ingredient${i}qty`]);
    if (!type || !(qty > 0)) continue;
    const missing = Math.max(0, qty - heldOf(player, type));
    if (!missing) continue;
    const def = resourceDef(type);
    if (!isGemBuyable(def)) return null;
    if (type === GEM_PRICE.linear) flat += def.gemcost * missing;
    else smooth += def.gemcost * missing;
  }
  if (recipe.requires && !(player.skills || []).some((s) => s && s.type === recipe.requires)) {
    const skillDef = resourceDef(recipe.requires);
    if (!isGemBuyable(skillDef)) return null;
    smooth += skillDef.gemcost;
  }
  let gems = Math.ceil(flat + smoothGems(smooth));
  if (gems === 0 && flat + smooth > 0) gems = 1;
  return gems;
}

/**
 * Pay for a recipe with what the player holds plus gems for the rest (backpack first, through
 * playerHoldings). { ok, gems } or { ok: false, reason: 'no-gems-offer' | 'short-Gem' }.
 */
function spendWithGems(player, recipe, { takeFromHoldings }) {
  const gems = gemTopUpCost(player, recipe);
  if (gems === null) return { ok: false, reason: 'no-gems-offer' };
  // the held part of each ingredient, then the gems (the recipe's own Gem line is part of the held part)
  const held = [];
  let gemNeed = gems;
  for (let i = 1; i <= 10; i++) {
    const type = recipe[`ingredient${i}`]; const qty = Number(recipe[`ingredient${i}qty`]);
    if (!type || !(qty > 0)) continue;
    const take = Math.min(qty, heldOf(player, type));
    if (type === 'Gem') gemNeed += take;
    else if (take > 0) held.push([type, take]);
  }
  if (heldOf(player, 'Gem') < gemNeed) return { ok: false, reason: 'short-Gem' };
  for (const [type, take] of held) takeFromHoldings(player.inventory, player.backpack, type, take);
  takeFromHoldings(player.inventory, player.backpack, 'Gem', gemNeed);
  player.markModified?.('inventory'); player.markModified?.('backpack');
  return { ok: true, gems };
}


// ---- Pets (GameFeatures/Pets/PetPanel.js getRandomPetReward, Economy/DropRates.js) ---------

/** DropRates.getRarityChance: a named rarity's weight, compressed toward even at higher levels. */
function rarityChance(rarity, level = 1) {
  if (typeof rarity === 'number') return rarity * level;
  const base = STANDARD_RARITY[rarity] || STANDARD_RARITY.common;
  return base * Math.pow(level, (100 - base) / 100);
}
const DROP_QTY = { common: [2, 3], uncommon: [2, 3], rare: [2, 3], epic: [1, 1], legendary: [1, 1] };

/**
 * What a fed pet brings back: one of the `source: pets` finds (the warehouse tools at the
 * player's personalised rarity), weighted at the pet's level (its qtycollected), with the drop
 * quantity for its rarity. { type, qty, rarity } or null.
 */
function rollPetReward(player, level = 1, rand = Math.random) {
  const group = rarityGroup(player._id);
  const items = masterResources.filter((r) => r.source === 'pets')
    .map((r) => (r.requires === 'Warehouse' ? { ...r, scrollchance: RARITY_ROTATION[r.type]?.[group] || 'common' } : r));
  if (!items.length) return null;
  const total = items.reduce((n, i) => n + rarityChance(i.scrollchance, level), 0);
  const roll = rand() * total;
  let cumulative = 0;
  let picked = items[0];
  for (const item of items) {
    cumulative += rarityChance(item.scrollchance, level);
    if (roll <= cumulative) { picked = item; break; }
  }
  const rarity = picked.scrollchance || 'common';
  const [min, max] = DROP_QTY[rarity] || DROP_QTY.common;
  return { type: picked.type, qty: Math.floor(rand() * (max - min + 1)) + min, rarity };
}

// Answers are numbered so the client can drop one that arrives after a newer one (one process)
let seqCounter = Date.now();
const nextSeq = () => ++seqCounter;

const plain = (v) => (v && typeof v.toObject === 'function' ? v.toObject() : v);
const plainList = (list) => (Array.isArray(list) ? list.map(plain) : []);

/**
 * The player fields an action may change, as the client stores them. The client replaces exactly
 * these (Utils/playerDelta.js); anything else it keeps.
 */
function playerDelta(player) {
  return {
    inventory: plainList(player.inventory),
    backpack: plainList(player.backpack),
    activeQuests: plainList(player.activeQuests),
    trophies: plainList(player.trophies),
    skills: plainList(player.skills),
    powers: plainList(player.powers),
    xp: player.xp || 0,
    range: player.range || 0,
  };
}

module.exports = {
  resourceDef,
  ownsGrid,
  isAtHome,
  atHomeOn,
  hasSkill,
  capacityOf,
  roomFor,
  grant,
  skillMultiplier,
  advanceQuests,
  isACrop,
  findFarmplotFor,
  rollWarehouseDrop,
  rollToolDrop,
  levelOf,
  stationMultiplier,
  hasSkillOrPower,
  grantSkillOrPower,
  rollScrollReveal,
  gemTopUpCost,
  rollPetReward,
  spendWithGems,
  playerDelta,
  nextSeq,
  loadMasterSkills,
  loadQuestDefs,
};
