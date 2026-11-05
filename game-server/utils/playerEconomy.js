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
  const rate = globalTuning.warehouseDropRate ?? globalTuning.harvestDropRate ?? 0.1;
  if (rand() > rate) return null;
  const group = rarityGroup(player._id);
  const tools = masterResources
    .filter((r) => r.requires === 'Warehouse' && r.scrollchance)
    .map((r) => ({ ...r, scrollchance: RARITY_ROTATION[r.type]?.[group] || 'common' }));
  if (!tools.length) return null;
  return pickTierFirst(tools, globalTuning.warehouseDropOdds, rand)?.type || null;
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
  playerDelta,
  nextSeq,
  loadMasterSkills,
  loadQuestDefs,
};
