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

/**
 * Region-locked resources (resources.json `growregion`, a region type; docs/tuning.md 4m): a farm
 * plot with one is planted, and a farm animal with one is bought, only on a grid of that region (Grid.region, set in the editor). The
 * client mirror is game-client Utils/ResourceHelpers.js growsInRegion.
 */
const growsInRegion = (def, region) => !def?.growregion || def.growregion === region;

/**
 * Per-crop cap (resources.json `maxpergrid` on a farm plot, trees included; docs/tuning.md 4n):
 * its plots plus its ripe output on the grid, against the plot's maxpergrid. Client mirror:
 * game-client Utils/ResourceHelpers.js cropCountOnGrid / cropCapReached.
 */
const cropCountOnGrid = (def, gridResources) => (gridResources || [])
  .filter((r) => r && (r.type === def.type || (def.output && r.type === def.output))).length;
const cropCapReached = (def, gridResources) => {
  const max = Number(def?.maxpergrid) || 0;
  return max > 0 && cropCountOnGrid(def, gridResources) >= max;
};

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

/** A crop whose farm plot is locked to a region (growregion): grown there, never sold by a farm hand. */
function isRegionalCrop(type) {
  return masterResources.some((r) => r.category === 'farmplot' && r.output === type && r.growregion);
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


// ---- Trader offers and relationships -----------------------------------------------------

let relationshipMatrix = null;
function loadRelationshipMatrix() {
  if (!relationshipMatrix) {
    // the client owns this table (GameFeatures/Relationships/RelationshipMatrix.json); the whole
    // repo is deployed, as auth.js reads PlayerIcons.json from the client too
    try { relationshipMatrix = JSON.parse(fs.readFileSync(path.join(__dirname, '../../game-client/src/GameFeatures/Relationships/RelationshipMatrix.json'), 'utf-8')); }
    catch (e) { relationshipMatrix = []; }
  }
  return relationshipMatrix;
}

/** RelationshipUtils.getRelationshipMultiplier: married, then love, then friend buff; else 1. */
function relationshipMultiplier(player, npcType) {
  const entry = loadRelationshipMatrix().find((e) => e.type === npcType);
  if (!entry) return 1;
  const rel = (player.relationships || []).find((r) => r && r.name === npcType);
  if (!rel) return 1;
  if (rel.married === true && entry.buff4marriage) return entry.buff4marriage;
  if (rel.love === true && entry.buff4love) return entry.buff4love;
  if (rel.friend === true && entry.buff4friend) return entry.buff4friend;
  return 1;
}

/** A relationship gate on an offer ('friend' / 'love'): met by that status or a closer one. */
function meetsRelationship(player, npcType, need) {
  if (!need) return true;
  const rel = (player.relationships || []).find((r) => r && r.name === npcType);
  if (!rel) return false;
  if (need === 'friend') return !!(rel.friend || rel.love || rel.married);
  if (need === 'love') return !!(rel.love || rel.married);
  return !!rel[need];
}

const traders = require('../tuning/traders.json');
/** The offer `index` of `trader` as a recipe: type = gives, ingredientN = requiresN (qty default 1). */
function traderOffer(trader, index) {
  const offer = traders.find((t) => t.trader === trader && Number(t.index) === Number(index));
  if (!offer || offer.retired) return null;
  const def = resourceDef(offer.gives);
  const recipe = { type: offer.gives, requires: def?.requires, level: def?.level, nogems: def?.nogems };
  let n = 1;
  for (let i = 1; i <= 7; i++) {
    const type = offer[`requires${i}`];
    if (!type) continue;
    recipe[`ingredient${n}`] = type;
    recipe[`ingredient${n}qty`] = Number(offer[`requires${i}qty`]) || 1;
    n++;
  }
  return { offer, recipe, def };
}


// ---- Quests: state goals and adding a quest (GameFeatures/Quests/stateGoals.js) -------------

const STATE_GOALS = ['Acquire', 'Meet', 'Find', 'Discover'];
const holdsAny = (list, item) => (list || []).some((i) => i && i.type === item && (i.quantity || 0) > 0);
/** stateGoalMet: a goal that is a fact about the player (owns, has met, holds / found, has discovered). */
function stateGoalMet(action, item, player) {
  if (!player || !item) return false;
  switch (action) {
    case 'Acquire': return !!((player.skills || []).some((s) => s && s.type === item) || (player.powers || []).some((p) => p && p.type === item));
    case 'Meet': return !!(player.relationships || []).some((r) => r && r.name === item && r.met);
    case 'Find': return holdsAny(player.inventory, item) || holdsAny(player.backpack, item)
      || (Array.isArray(player.hopeFound) && player.hopeFound.includes(item));
    case 'Discover': return !!((player.regionsVisited || []).includes(item) || player.location?.region === item);
    default: return false;
  }
}

/** applyStateGoals over every active quest; true when anything changed (marks activeQuests). */
function refreshStateGoals(player) {
  let changed = false;
  for (const quest of player.activeQuests || []) {
    if (!quest || quest.completed || quest.rewardCollected) continue;
    const progress = { ...(quest.progress || {}) };
    let total = 0; let met = 0; let touched = false;
    for (let i = 1; i <= 3; i++) {
      const action = quest[`goal${i}action`]; const item = quest[`goal${i}item`]; const qty = quest[`goal${i}qty`];
      if (!action || !item || !qty) continue;
      total++;
      if (STATE_GOALS.includes(action) && stateGoalMet(action, item, player) && (progress[`goal${i}`] || 0) < qty) {
        progress[`goal${i}`] = qty;
        touched = true;
      }
      if ((progress[`goal${i}`] || 0) >= qty) met++;
    }
    const completed = total > 0 && met === total;
    if (touched || completed) {
      quest.progress = progress;
      if (completed && !quest.completed) recordQuestCompleted?.(player._id, quest.questId)?.catch?.(() => {});
      quest.completed = completed;
      changed = true;
    }
  }
  if (changed) player.markModified?.('activeQuests');
  return changed;
}

/**
 * Add a quest to the player's activeQuests from questsEN.json (never the client's progress):
 * state goals already true start done, and a Craft goal starts done when that NPC already lives
 * on the homestead (`homesteadNPCTypes`). Returns the quest, or null when unknown or already active.
 */
function addQuest(player, questId, { homesteadNPCTypes = [], startTime = Date.now() } = {}) {
  const def = loadQuestDefs().find((q) => q.title === questId);
  if (!def) return null;
  if (!Array.isArray(player.activeQuests)) player.activeQuests = [];
  if (player.activeQuests.some((q) => q && q.questId === questId)) return null;
  const progress = { goal1: 0, goal2: 0, goal3: 0 };
  let total = 0; let met = 0;
  for (let i = 1; i <= 3; i++) {
    const action = def[`goal${i}action`]; const item = def[`goal${i}item`]; const qty = def[`goal${i}qty`];
    if (!action || !item || !qty) continue;
    total++;
    const done = STATE_GOALS.includes(action) ? stateGoalMet(action, item, player)
      : action === 'Craft' ? homesteadNPCTypes.includes(item) : false;
    if (done) progress[`goal${i}`] = STATE_GOALS.includes(action) ? qty : 1; // the Craft check counts one, as the client did
    if ((progress[`goal${i}`] || 0) >= qty) met++;
  }
  const quest = { ...def, questId, startTime, progress, completed: total > 0 && met === total, rewardCollected: false };
  player.activeQuests.push(quest);
  player.markModified?.('activeQuests');
  return quest;
}


// ---- Farm animal prices (GameFeatures/FarmAnimals/animalPricing.js) ----------------------

const npcList = (grid) => (grid?.NPCsInGrid instanceof Map ? [...grid.NPCsInGrid.values()] : Object.values(grid?.NPCsInGrid || {}));
/** countAnimalsOfType: grazing animals of this type on the grid. */
const countAnimalsOfType = (grid, type) => npcList(grid).filter((n) => n && n.type === type && resourceDef(n.type)?.action === 'graze').length;
/** scaledAnimalMoneyCost: each animal of a type you own raises the next one's Money price. */
function scaledAnimalMoneyCost(baseCost, count, inflation = globalTuning.farmAnimalInflation ?? 0.1) {
  if (!count) return baseCost;
  return Math.ceil((baseCost * Math.pow(1 + inflation, count)) / 50) * 50;
}
/** withScaledAnimalCost: a grazing animal's recipe with its Money scaled by `count` of its type. */
function withScaledAnimalCost(def, count) {
  if (!def?.passable || def.action !== 'graze') return def;
  const scaled = { ...def };
  for (let i = 1; i <= 4; i++) {
    if (scaled[`ingredient${i}`] === 'Money' && scaled[`ingredient${i}qty`]) scaled[`ingredient${i}qty`] = scaledAnimalMoneyCost(scaled[`ingredient${i}qty`], count);
  }
  return scaled;
}


// ---- Hit points (Phase 5, 2026-11-04) ---------------------------------------------------------
//
// hp is reported by the client (combat is simulated there) through /player/state and enter-grid.
// The server takes a report only as far as it can be true: damage is always accepted; a rise is
// accepted only as the homestead's slow regen (App.js: +2 every 10 s while at or under half the
// base max hp). Every other heal is made on the server by the action that pays for it (heal-pay,
// eat, respawn, revive, the Inn), which writes hp itself. maxhp is always the server's own.

const REGEN_HP = 2;
const REGEN_EVERY_MS = 10000;

function derivedMaxhp(player) {
  const { derivedStats } = require('./combatStats'); // lazy: combatStats loads the tuning files
  return derivedStats(player).maxhp;
}

/**
 * The hp to store for a report: { hp, maxhp }. `player` needs hp, hpSavedAt, baseMaxhp, powers,
 * settings and location (a document or a lean object).
 */
function acceptReportedHp(player, reported, now = Date.now()) {
  const maxhp = derivedMaxhp(player);
  const stored = Number.isFinite(player.hp) ? player.hp : maxhp; // a new record starts full
  const wanted = Math.max(0, Math.min(Number(reported), maxhp));
  if (!Number.isFinite(wanted)) return { hp: Math.min(stored, maxhp), maxhp };
  if (wanted <= stored) return { hp: wanted, maxhp };
  // a rise: only the homestead regen, from the last accepted save
  if (player.location?.gtype !== 'homestead') return { hp: Math.min(stored, maxhp), maxhp };
  const since = player.hpSavedAt ? now - new Date(player.hpSavedAt).getTime() : REGEN_EVERY_MS;
  const allowance = (Math.floor(Math.max(0, since) / REGEN_EVERY_MS) + 1) * REGEN_HP;
  const regenCeiling = Math.floor((player.baseMaxhp || maxhp) / 2) + REGEN_HP;
  const hp = Math.min(wanted, stored + allowance, Math.max(stored, regenCeiling), maxhp);
  return { hp, maxhp };
}

/** A server-made heal: hp + amount, capped at the derived maxhp. Returns { hp, maxhp, healed }. */
function healBy(player, amount) {
  const maxhp = derivedMaxhp(player);
  const stored = Number.isFinite(player.hp) ? player.hp : maxhp;
  const hp = Math.max(0, Math.min(maxhp, stored + Math.max(0, Number(amount) || 0)));
  player.hp = hp;
  player.maxhp = maxhp;
  player.hpSavedAt = new Date();
  return { hp, maxhp, healed: hp - stored };
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
    completedQuests: plainList(player.completedQuests),
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
  growsInRegion,
  cropCountOnGrid,
  cropCapReached,
  capacityOf,
  roomFor,
  grant,
  skillMultiplier,
  advanceQuests,
  isACrop,
  isRegionalCrop,
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
  relationshipMultiplier,
  meetsRelationship,
  traderOffer,
  STATE_GOALS,
  stateGoalMet,
  refreshStateGoals,
  addQuest,
  acceptReportedHp,
  healBy,
  derivedMaxhp,
  countAnimalsOfType,
  withScaledAnimalCost,
  spendWithGems,
  playerDelta,
  nextSeq,
  loadMasterSkills,
  loadQuestDefs,
};
