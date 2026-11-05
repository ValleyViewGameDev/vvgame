/**
 * Action routes (docs/refactor-plan.md Phase 5, "Transaction hardening"; started 2026-11-04).
 *
 * One request per player action. The server checks it, makes every change it implies (the grid,
 * the holdings, quests, trophies) and answers with the player fields it changed, so the client
 * applies the answer (Utils/playerDelta.js) and never refetches the player. The client still
 * reacts on the tap and sends this in parallel; it reverts only when the answer is a refusal.
 * The rules live in utils/playerEconomy.js. Grid and player writes are serialised per grid and
 * per player by utils/gridWriteLock.js and utils/playerWriteLock.js.
 *
 *   POST /action/harvest   collect a doober (or a special) from the board
 *   POST /action/convert   chop / mine a source (a tree, a rock) into what it becomes
 *   POST /action/craft-start / craft-collect      a crafting station's slots
 *   POST /action/gem-craft                        a station recipe made at once, gems for what is missing
 *   POST /action/craft-speedup                    finish a running slot now for gems
 *   POST /action/pet-feed / pet-collect           feed a pet, collect what it found (+ its xp)
 *   POST /action/animal-collect                   a farm animal's product
 *   POST /action/bulk-craft-collect               the Crafter's bulk collect (and restart) over many stations
 *   POST /action/bulk-harvest                     the Farmer's bulk harvest (and replant) of ripe crops
 *   POST /action/buy-skill                        a skill at its master price (or gems for what is missing)
 *   POST /action/farmhand-buy-crop                a crop from a farm hand at 10x its max price
 *   POST /action/buy-item                         a 'special' item at its own recipe price (Skills panel stations)
 *   POST /action/scroll-reveal / scroll-collect   the Ancient Temple (Reveal Scroll)
 */
const express = require('express');
const router = express.Router();
const Player = require('../models/player');
const Grid = require('../models/grid');
const gridResourceManager = require('../utils/GridResourceManager');
const econ = require('../utils/playerEconomy');
const { applyTrophy } = require('../utils/trophyUtils');
const { recordLevelUps } = require('../utils/analytics');
const { isCurrency } = require('../utils/inventoryUtils');
const { getSeasonLevel } = require('../utils/scheduleHelpers');
const holdings = require('../utils/playerHoldings');
const { spendCosts, recipeCosts, heldQuantity } = holdings;

const fail = (res, status, reason, extra = {}) => res.status(status).json({ success: false, error: reason, reason, ...extra });

// Collecting these counts toward a trophy, one per item (the Quest for Hope artifacts)
const COLLECT_TROPHIES = new Set(["King's Crown", 'Trident']);

/**
 * POST /api/action/harvest { playerId, gridId, x, y }
 * → { success, collected: {type, qty}, drop: {type, qty, added} | null,
 *     replant: {type, x, y, growEnd} | null, trophies: [{name, trophy, isNewMilestone}],
 *     player: <playerDelta>, seq }
 * Refusals (nothing changed; the client puts the doober back unless the reason is 'gone'):
 *   409 gone            nothing collectable on that tile any more (already collected: keep it gone)
 *   409 no-backpack | warehouse-full | backpack-full
 *   403 needs-<skill>   a Pickaxe / Better Pickaxe doober without the skill
 */
router.post('/action/harvest', async (req, res) => {
  const { playerId, gridId, x, y } = req.body || {};
  if (!playerId || !gridId || !Number.isInteger(x) || !Number.isInteger(y)) return fail(res, 400, 'bad-request');
  try {
    const [player, grid] = await Promise.all([Player.findById(playerId), Grid.findById(gridId)]);
    if (!player) return fail(res, 404, 'no-player');
    if (!grid) return fail(res, 404, 'no-grid');
    if (!econ.ownsGrid(grid, player)) return fail(res, 403, 'not-your-grid');
    const answer = (status, reason) => fail(res, status, reason, { player: econ.playerDelta(player), seq: econ.nextSeq() });

    const onTile = (gridResourceManager.getResources(grid) || []).find((r) => r && r.x === x && r.y === y);
    const def = onTile && econ.resourceDef(onTile.type);
    if (!def || (def.category !== 'doober' && def.category !== 'special')) return answer(409, 'gone');

    if ((def.requires === 'Pickaxe' || def.requires === 'Better Pickaxe') && !econ.hasSkill(player, def.requires)) {
      return answer(403, `needs-${def.requires}`);
    }

    const atHome = econ.atHomeOn(grid);
    const qty = (onTile.qtycollected || def.qtycollected || 1) * econ.skillMultiplier(player, def.type);
    const room = econ.roomFor(player, def.type, qty, { atHome });
    if (!room.ok) return answer(409, room.reason);

    // 1. The board: the doober goes; a repeatable one is replanted as its farm plot (trees too)
    gridResourceManager.updateResource(grid, { type: null, x, y });
    let replant = null;
    if (def.repeatable === true) {
      const plot = econ.findFarmplotFor(def.type);
      if (plot) {
        replant = { type: plot.type, x, y, growEnd: Date.now() + (plot.growtime || 0) * 1000 };
        gridResourceManager.updateResource(grid, replant);
      }
    }

    // 2. The player: the goods, Collect quests, a crop's bonus tool, collection trophies
    econ.grant(player, def.type, qty, { atHome });
    econ.advanceQuests(player, 'Collect', def.type, qty);

    let drop = null;
    const dropType = econ.rollWarehouseDrop(player, def.type);
    if (dropType) {
      const added = econ.roomFor(player, dropType, 1, { atHome }).ok;
      if (added) {
        econ.grant(player, dropType, 1, { atHome });
        econ.advanceQuests(player, 'Collect', dropType, 1);
      }
      drop = { type: dropType, qty: 1, added };
    }

    const trophies = [];
    if (COLLECT_TROPHIES.has(def.type)) {
      for (let i = 0; i < qty; i++) {
        const t = applyTrophy(player, def.type, 1);
        if (t.success) trophies.push({ name: def.type, trophy: t.trophy, isNewMilestone: t.isNewMilestone });
      }
    }

    player.lastActive = new Date();
    // Grid first: if it fails nothing is granted (never a duplicate); the player save follows
    await grid.save({ validateBeforeSave: false });
    await player.save();

    return res.json({
      success: true,
      collected: { type: def.type, qty },
      drop,
      replant,
      trophies,
      player: econ.playerDelta(player),
      seq: econ.nextSeq(),
    });
  } catch (err) {
    console.error('❌ action/harvest failed:', err);
    return res.status(500).json({ success: false, error: 'harvest-failed', detail: err.message });
  }
});

/**
 * POST /api/action/convert { playerId, gridId, x, y }
 * → { success, converted: { from, to: type | null } }
 * A source with action convertTo becomes its output (a tree into wood, a rock into stone), or
 * goes when it has none. Needs its `requires` skill when that is a skill (Axe, Pickaxe).
 * Refusals: 409 gone (nothing convertible there now), 403 needs-<skill>.
 */
router.post('/action/convert', async (req, res) => {
  const { playerId, gridId, x, y } = req.body || {};
  if (!playerId || !gridId || !Number.isInteger(x) || !Number.isInteger(y)) return fail(res, 400, 'bad-request');
  try {
    const [player, grid] = await Promise.all([Player.findById(playerId), Grid.findById(gridId)]);
    if (!player) return fail(res, 404, 'no-player');
    if (!grid) return fail(res, 404, 'no-grid');
    if (!econ.ownsGrid(grid, player)) return fail(res, 403, 'not-your-grid');

    const onTile = (gridResourceManager.getResources(grid) || []).find((r) => r && r.x === x && r.y === y);
    const def = onTile && econ.resourceDef(onTile.type);
    if (!def || def.action !== 'convertTo') return fail(res, 409, 'gone');
    const needsSkill = def.requires && econ.resourceDef(def.requires)?.category === 'skill';
    if (needsSkill && !econ.hasSkill(player, def.requires)) return fail(res, 403, `needs-${def.requires}`);

    const target = def.output && def.output !== 'null' ? econ.resourceDef(def.output) : null;
    gridResourceManager.updateResource(grid, target ? { type: target.type, x, y } : { type: null, x, y });
    await grid.save({ validateBeforeSave: false });
    return res.json({ success: true, converted: { from: def.type, to: target ? target.type : null } });
  } catch (err) {
    console.error('❌ action/convert failed:', err);
    return res.status(500).json({ success: false, error: 'convert-failed', detail: err.message });
  }
});

// ---- Crafting stations ---------------------------------------------------------------------

/** The station on (x, y) with its slots as an array (a pre-slots station's single craft becomes slot 0). */
function stationOn(grid, x, y) {
  const station = (gridResourceManager.getResources(grid) || []).find((r) => r && r.x === x && r.y === y);
  if (!station) return null;
  let slots = Array.isArray(station.slots) ? [...station.slots] : [];
  if ((station.craftEnd || station.craftedItem) && !station.slots) {
    slots = [{ craftEnd: station.craftEnd, craftedItem: station.craftedItem, qty: station.qty || 1 }];
  }
  return { station, slots, level: station.stationLevel ?? 0 };
}

/** Write a station's slots back (clears the pre-slots fields, keeps its level). */
function writeSlots(grid, x, y, { station, level }, slots) {
  const { craftEnd, craftedItem, qty, ...rest } = station; // the pre-slots fields go
  gridResourceManager.updateResource(grid, { ...rest, x, y, stationLevel: level, slots });
}

const actionContext = async (req, res) => {
  const { playerId, gridId, stationX, stationY } = req.body || {};
  if (!playerId || !gridId || !Number.isInteger(stationX) || !Number.isInteger(stationY)) { fail(res, 400, 'bad-request'); return null; }
  const [player, grid] = await Promise.all([Player.findById(playerId), Grid.findById(gridId)]);
  if (!player) { fail(res, 404, 'no-player'); return null; }
  if (!grid) { fail(res, 404, 'no-grid'); return null; }
  if (!econ.ownsGrid(grid, player)) { fail(res, 403, 'not-your-grid'); return null; }
  const at = stationOn(grid, stationX, stationY);
  if (!at) { fail(res, 404, 'no-station'); return null; }
  const answer = (status, reason, extra = {}) => fail(res, status, reason, { player: econ.playerDelta(player), seq: econ.nextSeq(), slots: at.slots, stationLevel: at.level, ...extra });
  return { player, grid, at, x: stationX, y: stationY, answer };
};


/**
 * Deliver a finished craft to the player (craft-collect, gem-craft). Station rules:
 *   - a crafting station: goods x the station's skill bonus on the slot's qty; an NPC is spawned
 *     by the client at the station;
 *   - a Farm House (category farmhouse): goods x the item's skill bonus on a base of 1; an NPC
 *     takes the first Worker Slot on the grid, which becomes its own '<type> Slot' (its home,
 *     docs/citizens.md), and a worker earns First Farm Worker.
 * Returns { qty, isNPC, home: {x, y} | null, trophies } or { refuse: reason }. Craft quests advance.
 */
function deliverCraft({ player, grid, stationType, item, baseQty, atHome }) {
  const isFarmHouse = econ.resourceDef(stationType)?.category === 'farmhouse';
  const isNPC = item.category === 'npc';
  const trophies = [];
  let home = null;
  let qty;
  if (isNPC) {
    qty = baseQty;
    if (isFarmHouse) {
      const slot = (gridResourceManager.getResources(grid) || []).find((r) => r && r.type === 'Worker Slot');
      if (!slot) return { refuse: 'no-worker-slot' };
      const ownType = econ.resourceDef(`${item.type} Slot`) ? `${item.type} Slot` : 'Worker Slot';
      gridResourceManager.updateResource(grid, { ...slot, type: ownType });
      home = { x: slot.x, y: slot.y };
      if (item.action === 'worker') {
        const t = applyTrophy(player, 'First Farm Worker', 1);
        if (t.success) trophies.push({ name: 'First Farm Worker', trophy: t.trophy, isNewMilestone: t.isNewMilestone });
      }
    }
  } else {
    qty = isFarmHouse ? econ.skillMultiplier(player, item.type) : baseQty * econ.stationMultiplier(player, stationType);
    const room = econ.roomFor(player, item.type, qty, { atHome });
    if (!room.ok) return { refuse: room.reason };
    econ.grant(player, item.type, qty, { atHome });
  }
  econ.advanceQuests(player, 'Craft', item.type, qty);
  return { qty, isNPC, home, trophies };
}

const firstFreeSlot = (slots, level) => {
  for (let i = 0; i < level + 1; i++) if (!slots[i] || !slots[i].craftedItem) return i;
  return -1;
};

/**
 * POST /api/action/craft-start { playerId, gridId, stationX, stationY, recipeType }
 * → { success, slotIndex, craftEnd, slots, player, seq }
 * The recipe comes from resources.json (never the payload): it must be made at this station, its
 * skill and level locks must be met, its ingredients are spent backpack first, and its crafttime
 * sets the slot's clock. Refusals: 409 SLOTS_FULL (with the station's real slots), 409 short-<type>,
 * 403 needs-<skill> / level-<n>, 400 not-made-here.
 */
router.post('/action/craft-start', async (req, res) => {
  try {
    const ctx = await actionContext(req, res);
    if (!ctx) return;
    const { player, grid, at, x, y, answer } = ctx;
    const recipe = econ.resourceDef(req.body.recipeType);
    if (!recipe || recipe.source !== at.station.type) return answer(400, 'not-made-here');
    if (recipe.requires && !econ.hasSkillOrPower(player, recipe.requires)) return answer(403, `needs-${recipe.requires}`);
    if (recipe.level && econ.levelOf(player) < Number(recipe.level)) return answer(403, `level-${recipe.level}`);

    const slotIndex = firstFreeSlot(at.slots, at.level);
    if (slotIndex === -1) return answer(409, 'SLOTS_FULL', { code: 'SLOTS_FULL' });
    if (!spendCosts(recipe, player.inventory, player.backpack)) {
      const short = recipeCosts(recipe).find(([type, qty]) => heldQuantity(player.inventory, player.backpack, type) < qty);
      return answer(409, `short-${short ? short[0] : 'ingredients'}`);
    }
    player.markModified('inventory'); player.markModified('backpack');

    const craftEnd = Date.now() + (Number(recipe.crafttime) || 60) * 1000;
    const slots = [...at.slots];
    slots[slotIndex] = { craftEnd, craftedItem: recipe.type, qty: 1 };
    writeSlots(grid, x, y, at, slots);
    player.lastActive = new Date();
    await grid.save({ validateBeforeSave: false });
    await player.save();
    return res.json({ success: true, slotIndex, craftEnd, slots, player: econ.playerDelta(player), seq: econ.nextSeq() });
  } catch (err) {
    console.error('❌ action/craft-start failed:', err);
    return res.status(500).json({ success: false, error: 'craft-start-failed', detail: err.message });
  }
});

/**
 * POST /api/action/craft-collect { playerId, gridId, stationX, stationY, slotIndex }
 * → { success, collected: {type, qty}, isNPC, slots, player, seq }
 * A finished slot: goods are granted with the station's skill bonus (room checked first), an NPC
 * is left for the client to spawn at the station, and Craft quests advance either way.
 * Refusals: 409 empty / not-ready, 409 no-backpack | warehouse-full | backpack-full.
 */
router.post('/action/craft-collect', async (req, res) => {
  try {
    const ctx = await actionContext(req, res);
    if (!ctx) return;
    const { player, grid, at, x, y, answer } = ctx;
    const slotIndex = Number(req.body.slotIndex);
    const slot = at.slots[slotIndex];
    if (!slot || !slot.craftedItem) return answer(409, 'empty');
    if (slot.craftEnd && slot.craftEnd > Date.now()) return answer(409, 'not-ready');
    const item = econ.resourceDef(slot.craftedItem);
    if (!item) return answer(409, 'empty');

    const got = deliverCraft({ player, grid, stationType: at.station.type, item, baseQty: slot.qty || 1, atHome: econ.atHomeOn(grid) });
    if (got.refuse) return answer(409, got.refuse);

    const slots = [...at.slots];
    slots[slotIndex] = { craftEnd: null, craftedItem: null, qty: 1 };
    writeSlots(grid, x, y, at, slots);
    player.lastActive = new Date();
    await grid.save({ validateBeforeSave: false });
    await player.save();
    return res.json({ success: true, collected: { type: item.type, qty: got.qty }, isNPC: got.isNPC, home: got.home, trophies: got.trophies, slots, player: econ.playerDelta(player), seq: econ.nextSeq() });
  } catch (err) {
    console.error('❌ action/craft-collect failed:', err);
    return res.status(500).json({ success: false, error: 'craft-collect-failed', detail: err.message });
  }
});

// ---- The Ancient Temple (Reveal Scroll) ----------------------------------------------------

/**
 * POST /api/action/scroll-reveal { playerId, gridId, stationX, stationY }
 * → { success, reveal: {type, qty}, craftEnd, slots, player, seq }
 * Spends one Scroll, rolls the find ON THE SERVER (scrollRevealOdds) and starts it in slot 0 on
 * the Reveal Scroll's crafttime; advances Spend quests. Refusals: 409 busy, 409 short-Scroll.
 */
router.post('/action/scroll-reveal', async (req, res) => {
  try {
    const ctx = await actionContext(req, res);
    if (!ctx) return;
    const { player, grid, at, x, y, answer } = ctx;
    if (at.slots[0]?.craftedItem) return answer(409, 'busy');
    if (!spendCosts({ ingredient1: 'Scroll', ingredient1qty: 1 }, player.inventory, player.backpack)) return answer(409, 'short-Scroll');
    player.markModified('inventory'); player.markModified('backpack');
    econ.advanceQuests(player, 'Spend', 'Scroll', 1);

    const reveal = econ.rollScrollReveal();
    const craftEnd = Date.now() + (Number(econ.resourceDef('Reveal Scroll')?.crafttime) || 30) * 1000;
    const slots = [...at.slots];
    slots[0] = { craftEnd, craftedItem: reveal.type, qty: reveal.qty };
    writeSlots(grid, x, y, at, slots);
    player.lastActive = new Date();
    await grid.save({ validateBeforeSave: false });
    await player.save();
    return res.json({ success: true, reveal, craftEnd, slots, player: econ.playerDelta(player), seq: econ.nextSeq() });
  } catch (err) {
    console.error('❌ action/scroll-reveal failed:', err);
    return res.status(500).json({ success: false, error: 'scroll-reveal-failed', detail: err.message });
  }
});

/**
 * POST /api/action/scroll-collect { playerId, gridId, stationX, stationY }
 * → { success, collected: {type, qty}, isNPC, alreadyOwned, trophies, slots, player, seq }
 * The temple's finished find (slot 0): goods at their scroll quantity (no station bonus), a skill
 * or power given unless already owned, an NPC left for the client to spawn. Collect quests and
 * the Scroll Revealer trophy. Refusals: 409 empty / not-ready, 409 room reasons.
 */
router.post('/action/scroll-collect', async (req, res) => {
  try {
    const ctx = await actionContext(req, res);
    if (!ctx) return;
    const { player, grid, at, x, y, answer } = ctx;
    const slot = at.slots[0];
    if (!slot || !slot.craftedItem) return answer(409, 'empty');
    if (slot.craftEnd && slot.craftEnd > Date.now()) return answer(409, 'not-ready');
    const item = econ.resourceDef(slot.craftedItem);
    if (!item) return answer(409, 'empty');

    const qty = slot.qty || 1;
    const atHome = econ.atHomeOn(grid);
    const isNPC = item.category === 'npc';
    let alreadyOwned = false;
    const trophies = [];
    if (item.category === 'skill' || item.category === 'power') {
      alreadyOwned = econ.hasSkillOrPower(player, item.type);
      if (!alreadyOwned) {
        const g = econ.grantSkillOrPower(player, item, qty, { applyTrophy });
        if (g.trophy) trophies.push(g.trophy);
      }
    } else if (!isNPC) {
      const room = econ.roomFor(player, item.type, qty, { atHome });
      if (!room.ok) return answer(409, room.reason);
      econ.grant(player, item.type, qty, { atHome });
    }
    econ.advanceQuests(player, 'Collect', item.type, qty);
    const t = applyTrophy(player, 'Scroll Revealer', 1);
    if (t.success) trophies.push({ name: 'Scroll Revealer', trophy: t.trophy, isNewMilestone: t.isNewMilestone });

    const slots = [...at.slots];
    slots[0] = { craftEnd: null, craftedItem: null, qty: 1 };
    writeSlots(grid, x, y, at, slots);
    player.lastActive = new Date();
    await grid.save({ validateBeforeSave: false });
    await player.save();
    return res.json({ success: true, collected: { type: item.type, qty }, isNPC, alreadyOwned, trophies, slots, player: econ.playerDelta(player), seq: econ.nextSeq() });
  } catch (err) {
    console.error('❌ action/scroll-collect failed:', err);
    return res.status(500).json({ success: false, error: 'scroll-collect-failed', detail: err.message });
  }
});

/**
 * POST /api/action/gem-craft { playerId, gridId, stationX, stationY, recipeType }
 * → { success, collected: {type, qty}, isNPC, home, trophies, gems, player, seq }
 * The station's gem button: the recipe (from resources.json, made at this station, level met) is
 * paid with what the player holds plus gems for the rest, and one is granted at once (room first).
 * Craft quests advance. Refusals: 409 room reasons, 409 short-Gem / no-gems-offer, 403 level-<n>.
 */
router.post('/action/gem-craft', async (req, res) => {
  try {
    const ctx = await actionContext(req, res);
    if (!ctx) return;
    const { player, grid, at, answer } = ctx;
    const recipe = econ.resourceDef(req.body.recipeType);
    if (!recipe || recipe.source !== at.station.type) return answer(400, 'not-made-here');
    if (recipe.level && econ.levelOf(player) < Number(recipe.level)) return answer(403, `level-${recipe.level}`);
    const atHome = econ.atHomeOn(grid);
    // room (and a Worker Slot) first, payment second
    if (recipe.category !== 'npc') {
      const room = econ.roomFor(player, recipe.type, 1, { atHome });
      if (!room.ok) return answer(409, room.reason);
    } else if (econ.resourceDef(at.station.type)?.category === 'farmhouse'
      && !(gridResourceManager.getResources(grid) || []).some((r) => r && r.type === 'Worker Slot')) {
      return answer(409, 'no-worker-slot');
    }
    const paid = econ.spendWithGems(player, recipe, holdings);
    if (!paid.ok) return answer(409, paid.reason);
    const got = deliverCraft({ player, grid, stationType: at.station.type, item: recipe, baseQty: 1, atHome });
    if (got.refuse) return answer(409, got.refuse); // not reached: checked above
    player.lastActive = new Date();
    if (got.home) await grid.save({ validateBeforeSave: false });
    await player.save();
    return res.json({ success: true, collected: { type: recipe.type, qty: got.qty }, isNPC: got.isNPC, home: got.home, trophies: got.trophies, gems: paid.gems, player: econ.playerDelta(player), seq: econ.nextSeq() });
  } catch (err) {
    console.error('❌ action/gem-craft failed:', err);
    return res.status(500).json({ success: false, error: 'gem-craft-failed', detail: err.message });
  }
});

/**
 * POST /api/action/craft-speedup { playerId, gridId, stationX, stationY, slotIndex }
 * → { success, gems, slots, player, seq }
 * Finish a running slot now for gems: ceil(minutes left ^ 0.45) (Economy/EconomyUtils.js
 * calculateGemSpeedupCost), priced from the server's own clock. Refusals: 409 not-running, short-Gem.
 */
router.post('/action/craft-speedup', async (req, res) => {
  try {
    const ctx = await actionContext(req, res);
    if (!ctx) return;
    const { player, grid, at, x, y, answer } = ctx;
    const slotIndex = Number(req.body.slotIndex) || 0;
    const slot = at.slots[slotIndex];
    const left = slot?.craftedItem && slot.craftEnd ? slot.craftEnd - Date.now() : 0;
    if (!(left > 0)) return answer(409, 'not-running');
    const gems = Math.ceil((left / 60000) ** 0.45);
    if (!spendCosts({ ingredient1: 'Gem', ingredient1qty: gems }, player.inventory, player.backpack)) return answer(409, 'short-Gem');
    player.markModified('inventory'); player.markModified('backpack');
    const slots = [...at.slots];
    slots[slotIndex] = { ...slot, craftEnd: Date.now() };
    writeSlots(grid, x, y, at, slots);
    await grid.save({ validateBeforeSave: false });
    await player.save();
    return res.json({ success: true, gems, slots, player: econ.playerDelta(player), seq: econ.nextSeq() });
  } catch (err) {
    console.error('❌ action/craft-speedup failed:', err);
    return res.status(500).json({ success: false, error: 'craft-speedup-failed', detail: err.message });
  }
});

// ---- Pets ----------------------------------------------------------------------------------

/**
 * POST /api/action/pet-feed { playerId, gridId, stationX, stationY }   (the pet's tile)
 * → { success, reward: {type, qty, rarity}, craftEnd, slots, player, seq }
 * Spends the pet's food (output x qtycollected), rolls its find on the server at the pet's level
 * and starts it in slot 0 on the pet's crafttime. Feed quests advance.
 * Refusals: 400 not-a-pet, 409 busy, 409 short-<food>.
 */
router.post('/action/pet-feed', async (req, res) => {
  try {
    const ctx = await actionContext(req, res);
    if (!ctx) return;
    const { player, grid, at, x, y, answer } = ctx;
    const pet = econ.resourceDef(at.station.type);
    if (!pet || pet.category !== 'pet') return answer(400, 'not-a-pet');
    if (at.slots[0]?.craftedItem) return answer(409, 'busy');
    const food = pet.output || 'Milk';
    const level = pet.qtycollected || 1;
    if (!spendCosts({ ingredient1: food, ingredient1qty: level }, player.inventory, player.backpack)) return answer(409, `short-${food}`);
    player.markModified('inventory'); player.markModified('backpack');
    const reward = econ.rollPetReward(player, level);
    if (!reward) return answer(409, 'no-reward');
    const craftEnd = Date.now() + (Number(pet.crafttime) || 60) * 1000;
    const slots = [...at.slots];
    slots[0] = { craftEnd, craftedItem: reward.type, qty: reward.qty, rarity: reward.rarity };
    writeSlots(grid, x, y, at, slots);
    econ.advanceQuests(player, 'Feed', pet.type, 1);
    player.lastActive = new Date();
    await grid.save({ validateBeforeSave: false });
    await player.save();
    return res.json({ success: true, reward, craftEnd, slots, player: econ.playerDelta(player), seq: econ.nextSeq() });
  } catch (err) {
    console.error('❌ action/pet-feed failed:', err);
    return res.status(500).json({ success: false, error: 'pet-feed-failed', detail: err.message });
  }
});

/**
 * POST /api/action/pet-collect { playerId, gridId, stationX, stationY }
 * → { success, collected: {type, qty}, xpGained, slots, player, seq }
 * The pet's find (slot 0) at its rolled quantity (room first), the pet's xp, Collect quests.
 */
router.post('/action/pet-collect', async (req, res) => {
  try {
    const ctx = await actionContext(req, res);
    if (!ctx) return;
    const { player, grid, at, x, y, answer } = ctx;
    const pet = econ.resourceDef(at.station.type);
    if (!pet || pet.category !== 'pet') return answer(400, 'not-a-pet');
    const slot = at.slots[0];
    if (!slot || !slot.craftedItem) return answer(409, 'empty');
    if (slot.craftEnd && slot.craftEnd > Date.now()) return answer(409, 'not-ready');
    const qty = slot.qty || 1;
    const atHome = econ.atHomeOn(grid);
    const room = econ.roomFor(player, slot.craftedItem, qty, { atHome });
    if (!room.ok) return answer(409, room.reason);
    econ.grant(player, slot.craftedItem, qty, { atHome });
    econ.advanceQuests(player, 'Collect', slot.craftedItem, qty);
    const xpGained = Number(pet.xp) || 1;
    recordLevelUps(player._id, player.xp || 0, (player.xp || 0) + xpGained).catch(() => {});
    player.xp = (player.xp || 0) + xpGained;
    const slots = [...at.slots];
    slots[0] = { craftEnd: null, craftedItem: null, qty: 1 };
    writeSlots(grid, x, y, at, slots);
    player.lastActive = new Date();
    await grid.save({ validateBeforeSave: false });
    await player.save();
    return res.json({ success: true, collected: { type: slot.craftedItem, qty }, xpGained, slots, player: econ.playerDelta(player), seq: econ.nextSeq() });
  } catch (err) {
    console.error('❌ action/pet-collect failed:', err);
    return res.status(500).json({ success: false, error: 'pet-collect-failed', detail: err.message });
  }
});

// ---- Farm animals --------------------------------------------------------------------------

/** A farm animal's yield: floor(qtycollected x every skill or upgrade buffing its product). */
function animalYield(player, def) {
  const skills = econ.loadMasterSkills();
  let mult = 1;
  for (const s of player.skills || []) {
    const cat = s && econ.resourceDef(s.type)?.category;
    if (cat !== 'skill' && cat !== 'upgrade') continue;
    const boost = skills?.[s.type]?.[def.output] || 1;
    if (boost > 1) mult *= boost;
  }
  return Math.floor((def.qtycollected || 1) * mult);
}

/**
 * POST /api/action/animal-collect { playerId, gridId, npcId }
 * → { success, collected: {type, qty}, updatedNPC, player, seq }
 * The animal must be 'processing' in the server's copy. Room is checked BEFORE the stall empties
 * (the product used to be lost when the client's later grant found no room); the product is
 * granted here and Collect quests advance. Refusals: 409 not-ready, 409 room reasons.
 */
router.post('/action/animal-collect', async (req, res) => {
  const { playerId, gridId, npcId } = req.body || {};
  if (!playerId || !gridId || !npcId) return fail(res, 400, 'bad-request');
  try {
    const [player, grid] = await Promise.all([Player.findById(playerId), Grid.findById(gridId)]);
    if (!player) return fail(res, 404, 'no-player');
    if (!grid) return fail(res, 404, 'no-grid');
    if (!econ.ownsGrid(grid, player)) return fail(res, 403, 'not-your-grid');
    const answer = (status, reason) => fail(res, status, reason, { player: econ.playerDelta(player), seq: econ.nextSeq() });
    const npcs = grid.NPCsInGrid instanceof Map ? grid.NPCsInGrid : new Map(Object.entries(grid.NPCsInGrid || {}));
    const npc = npcs.get(String(npcId));
    const def = npc && econ.resourceDef(npc.type);
    if (!def || !def.output) return answer(409, 'no-animal');
    if (npc.state !== 'processing') return answer(409, 'not-ready');
    const qty = animalYield(player, def);
    const atHome = econ.atHomeOn(grid);
    const room = econ.roomFor(player, def.output, qty, { atHome });
    if (!room.ok) return answer(409, room.reason);

    npc.state = 'emptystall';
    npc.hp = 0;
    npcs.set(String(npcId), npc);
    grid.NPCsInGrid = npcs;
    grid.markModified('NPCsInGrid');
    econ.grant(player, def.output, qty, { atHome });
    econ.advanceQuests(player, 'Collect', def.output, qty);
    player.lastActive = new Date();
    await grid.save({ validateBeforeSave: false });
    await player.save();
    return res.json({ success: true, collected: { type: def.output, qty }, updatedNPC: npc, player: econ.playerDelta(player), seq: econ.nextSeq() });
  } catch (err) {
    console.error('❌ action/animal-collect failed:', err);
    return res.status(500).json({ success: false, error: 'animal-collect-failed', detail: err.message });
  }
});

/**
 * POST /api/action/bulk-craft-collect { playerId, gridId, stations: [{ x, y, slotIndex, restart }] }
 * → { success, results: [{ x, y, slotIndex, collected: {type, qty} | null, isNPC, restarted,
 *     newCraftEnd, slots, reason }], player, seq }
 * Each finished slot is delivered with craft-collect's rules (room checked per slot, Craft quests);
 * with `restart` the same recipe (from resources.json, made at that station, skill checked) is paid
 * and started again on its master crafttime. A slot that cannot go (not ready, no room) is left as
 * it is and says why; the others still go.
 */
router.post('/action/bulk-craft-collect', async (req, res) => {
  const { playerId, gridId, stations } = req.body || {};
  if (!playerId || !gridId || !Array.isArray(stations) || !stations.length) return fail(res, 400, 'bad-request');
  try {
    const [player, grid] = await Promise.all([Player.findById(playerId), Grid.findById(gridId)]);
    if (!player) return fail(res, 404, 'no-player');
    if (!grid) return fail(res, 404, 'no-grid');
    if (!econ.ownsGrid(grid, player)) return fail(res, 403, 'not-your-grid');
    const atHome = econ.atHomeOn(grid);
    const results = [];
    for (const want of stations.slice(0, 200)) {
      const x = Number(want.x); const y = Number(want.y); const slotIndex = Number(want.slotIndex) || 0;
      const result = { x, y, slotIndex, collected: null, isNPC: false, restarted: false };
      results.push(result);
      const at = stationOn(grid, x, y);
      const slot = at?.slots[slotIndex];
      if (!slot || !slot.craftedItem) { result.reason = 'empty'; continue; }
      if (slot.craftEnd && slot.craftEnd > Date.now()) { result.reason = 'not-ready'; continue; }
      const item = econ.resourceDef(slot.craftedItem);
      if (!item) { result.reason = 'empty'; continue; }
      const got = deliverCraft({ player, grid, stationType: at.station.type, item, baseQty: slot.qty || 1, atHome });
      if (got.refuse) { result.reason = got.refuse; continue; }
      result.collected = { type: item.type, qty: got.qty };
      result.isNPC = got.isNPC;
      const slots = [...at.slots];
      slots[slotIndex] = { craftEnd: null, craftedItem: null, qty: 1 };
      if (want.restart && !got.isNPC && item.source === at.station.type
        && (!item.requires || econ.hasSkillOrPower(player, item.requires))
        && spendCosts(item, player.inventory, player.backpack)) {
        const craftEnd = Date.now() + (Number(item.crafttime) || 60) * 1000;
        slots[slotIndex] = { craftEnd, craftedItem: item.type, qty: 1 };
        result.restarted = true;
        result.newCraftEnd = craftEnd;
        player.markModified('inventory'); player.markModified('backpack');
      }
      writeSlots(grid, x, y, at, slots);
      result.slots = slots;
    }
    player.lastActive = new Date();
    await grid.save({ validateBeforeSave: false });
    await player.save();
    return res.json({ success: true, results, player: econ.playerDelta(player), seq: econ.nextSeq() });
  } catch (err) {
    console.error('❌ action/bulk-craft-collect failed:', err);
    return res.status(500).json({ success: false, error: 'bulk-craft-collect-failed', detail: err.message });
  }
});

/**
 * POST /api/action/bulk-harvest { playerId, gridId, operations: [{ cropType, positions: [{x, y}], replant }] }
 * → { success, results: { harvested: {type: {count, quantity, positions}}, replanted: {type: {farmplotType,
 *     count, growtime, positions}}, failed: [...], seedsUsed, drops: [{type, qty}] }, player, seq }
 * Only ripe crops on the named tiles are taken (the crop doober, or its farm plot once grown). The
 * yield is the server's: floor(qtycollected x skills) per crop, never the client's expectedYield.
 * Room is the warehouse and backpack together (the bulk rule) and the goods go to the warehouse.
 * Replanting charges the farm plot's seeds unless the crop is repeatable. Each non-Wheat crop rolls
 * the bonus tool. Collect quests advance for crops and tools, Spend quests for seeds.
 */
router.post('/action/bulk-harvest', async (req, res) => {
  const { playerId, gridId, operations } = req.body || {};
  if (!playerId || !gridId || !Array.isArray(operations) || !operations.length) return fail(res, 400, 'bad-request');
  try {
    const [player, grid] = await Promise.all([Player.findById(playerId), Grid.findById(gridId)]);
    if (!player) return fail(res, 404, 'no-player');
    if (!grid) return fail(res, 404, 'no-grid');
    if (!econ.ownsGrid(grid, player)) return fail(res, 403, 'not-your-grid');

    const cap = econ.capacityOf(player);
    const goods = (list) => (list || []).filter((i) => i && !isCurrency(i.type)).reduce((n, i) => n + (i.quantity || 0), 0);
    let space = cap.warehouse + cap.backpack - goods(player.inventory) - goods(player.backpack);
    const results = { harvested: {}, replanted: {}, failed: [], seedsUsed: {}, drops: [] };
    const now = Date.now();
    let dropRolls = 0;

    for (const op of operations) {
      const crop = econ.resourceDef(op?.cropType);
      const positions = Array.isArray(op?.positions) ? op.positions : [];
      if (!crop || !positions.length) { results.failed.push({ cropType: op?.cropType, reason: 'Invalid operation data' }); continue; }
      const plot = econ.findFarmplotFor(crop.type);
      const perCrop = Math.floor((crop.qtycollected || 1) * econ.skillMultiplier(player, crop.type));
      const onGrid = gridResourceManager.getResources(grid) || [];
      const ripe = positions.filter((p) => onGrid.some((r) => r && r.x === p.x && r.y === p.y
        && (r.type === crop.type || (plot && r.type === plot.type && (!r.growEnd || new Date(r.growEnd).getTime() <= now)))));
      if (!ripe.length) continue;
      const quantity = ripe.length * perCrop;
      if (quantity > space) { results.failed.push({ cropType: crop.type, reason: 'Not enough inventory space', needed: quantity, available: space }); continue; }

      for (const p of ripe) gridResourceManager.updateResource(grid, { type: null, x: p.x, y: p.y });
      econ.grant(player, crop.type, quantity, { atHome: true });
      econ.advanceQuests(player, 'Collect', crop.type, quantity);
      space -= quantity;
      results.harvested[crop.type] = { count: ripe.length, quantity, positions: ripe };
      if (crop.type !== 'Wheat' && econ.isACrop(crop.type)) dropRolls += ripe.length;

      if (op.replant && plot) {
        const seeds = crop.repeatable === true ? [] : recipeCosts(plot).map(([type, qty]) => [type, qty * ripe.length]);
        const short = seeds.find(([type, need]) => heldQuantity(player.inventory, player.backpack, type) < need);
        if (short) {
          results.failed.push({ cropType: crop.type, reason: `Not enough ${short[0]} for replanting`, needed: short[1], has: heldQuantity(player.inventory, player.backpack, short[0]) });
        } else {
          for (const [type, need] of seeds) {
            holdings.takeFromHoldings(player.inventory, player.backpack, type, need);
            results.seedsUsed[type] = (results.seedsUsed[type] || 0) + need;
            econ.advanceQuests(player, 'Spend', type, need);
          }
          const seasonLevel = getSeasonLevel();
          for (const p of ripe) {
            gridResourceManager.updateResource(grid, {
              type: plot.type, x: p.x, y: p.y, growEnd: now + (plot.growtime || 0) * 1000,
              state: 'growingtimer', passable: true, seasonLevel, output: plot.output,
            });
          }
          results.replanted[crop.type] = { farmplotType: plot.type, count: ripe.length, growtime: plot.growtime, positions: ripe };
        }
      }
    }

    // Bonus tools: one roll per non-Wheat crop plot, granted while there is room
    for (let i = 0; i < dropRolls; i++) {
      const tool = econ.rollToolDrop(player);
      if (!tool || space < 1) continue;
      econ.grant(player, tool, 1, { atHome: true });
      econ.advanceQuests(player, 'Collect', tool, 1);
      space -= 1;
      const seen = results.drops.find((d) => d.type === tool);
      if (seen) seen.qty += 1; else results.drops.push({ type: tool, qty: 1 });
    }

    player.markModified('inventory'); player.markModified('backpack');
    player.lastActive = new Date();
    await grid.save({ validateBeforeSave: false });
    await player.save();
    return res.json({ success: true, results, player: econ.playerDelta(player), seq: econ.nextSeq() });
  } catch (err) {
    console.error('❌ action/bulk-harvest failed:', err);
    return res.status(500).json({ success: false, error: 'bulk-harvest-failed', detail: err.message });
  }
});

// ---- Buying ----------------------------------------------------------------------------------

const loadPlayer = async (req, res) => {
  const { playerId } = req.body || {};
  if (!playerId) { fail(res, 400, 'bad-request'); return null; }
  const player = await Player.findById(playerId);
  if (!player) { fail(res, 404, 'no-player'); return null; }
  const answer = (status, reason, extra = {}) => fail(res, status, reason, { player: econ.playerDelta(player), seq: econ.nextSeq(), ...extra });
  return { player, answer };
};

const trophyList = (...ts) => ts.filter(Boolean);

/**
 * POST /api/action/buy-skill { playerId, skillType, useGems? }
 * → { success, skill, trophies, gems, player, seq }
 * Any skill seller (Skills panel stations, farm hands, the Courthouse): the price is the skill's
 * own ingredients in resources.json, its level and `requires` locks apply (gems may stand in for a
 * missing ingredient or requirement with useGems). Acquire quests, Skill Builder trophy.
 * Refusals: 409 owned, 409 short-<type> / short-Gem, 403 level-<n> / needs-<skill>, 400 not-a-skill.
 */
router.post('/action/buy-skill', async (req, res) => {
  try {
    const ctx = await loadPlayer(req, res);
    if (!ctx) return;
    const { player, answer } = ctx;
    const def = econ.resourceDef(req.body.skillType);
    if (!def || (def.category !== 'skill' && def.category !== 'upgrade')) return answer(400, 'not-a-skill');
    if ((player.skills || []).some((s) => s && s.type === def.type)) return answer(409, 'owned');
    if (def.level && econ.levelOf(player) < Number(def.level)) return answer(403, `level-${def.level}`);
    let gems = 0;
    if (req.body.useGems) {
      const paid = econ.spendWithGems(player, def, holdings);
      if (!paid.ok) return answer(409, paid.reason);
      gems = paid.gems;
    } else {
      if (def.requires && !econ.hasSkillOrPower(player, def.requires) && def.requires !== 'devonly') return answer(403, `needs-${def.requires}`);
      if (!spendCosts(def, player.inventory, player.backpack)) {
        const short = recipeCosts(def).find(([type, qty]) => heldQuantity(player.inventory, player.backpack, type) < qty);
        return answer(409, `short-${short ? short[0] : 'ingredients'}`);
      }
      player.markModified('inventory'); player.markModified('backpack');
    }
    const g = econ.grantSkillOrPower(player, { ...def, category: 'skill' }, 1, { applyTrophy });
    player.lastActive = new Date();
    await player.save();
    return res.json({ success: true, skill: def.type, trophies: trophyList(g.trophy), gems, player: econ.playerDelta(player), seq: econ.nextSeq() });
  } catch (err) {
    console.error('❌ action/buy-skill failed:', err);
    return res.status(500).json({ success: false, error: 'buy-skill-failed', detail: err.message });
  }
});

/**
 * POST /api/action/farmhand-buy-crop { playerId, cropType }
 * → { success, collected: {type, qty: 1}, cost, player, seq }
 * A farm hand's safety-net offer: one crop for maxprice x 10 Money, only for a crop (a farm
 * plot's output) at or below the player's level, while they hold 9 or fewer. Room first.
 */
router.post('/action/farmhand-buy-crop', async (req, res) => {
  try {
    const ctx = await loadPlayer(req, res);
    if (!ctx) return;
    const { player, answer } = ctx;
    const crop = econ.resourceDef(req.body.cropType);
    if (!crop || !econ.isACrop(crop.type) || crop.requires === 'devonly') return answer(400, 'not-offered');
    if (crop.level && econ.levelOf(player) < Number(crop.level)) return answer(403, `level-${crop.level}`);
    if (heldQuantity(player.inventory, player.backpack, crop.type) > 9) return answer(409, 'not-offered');
    const room = econ.roomFor(player, crop.type, 1);
    if (!room.ok) return answer(409, room.reason);
    const cost = (crop.maxprice || 100) * 10;
    if (!spendCosts({ ingredient1: 'Money', ingredient1qty: cost }, player.inventory, player.backpack)) return answer(409, 'short-Money');
    econ.grant(player, crop.type, 1);
    player.markModified('inventory'); player.markModified('backpack');
    await player.save();
    return res.json({ success: true, collected: { type: crop.type, qty: 1 }, cost, player: econ.playerDelta(player), seq: econ.nextSeq() });
  } catch (err) {
    console.error('❌ action/farmhand-buy-crop failed:', err);
    return res.status(500).json({ success: false, error: 'farmhand-buy-crop-failed', detail: err.message });
  }
});

/**
 * POST /api/action/buy-item { playerId, itemType, useGems? }
 * → { success, collected: {type, qty}, gems, player, seq }
 * A 'special' item sold at a station at its own resources.json recipe, qtycollected of it (room
 * first). Buy quests advance by one. Refusals: 409 room reasons, short-<type> / short-Gem.
 */
router.post('/action/buy-item', async (req, res) => {
  try {
    const ctx = await loadPlayer(req, res);
    if (!ctx) return;
    const { player, answer } = ctx;
    const def = econ.resourceDef(req.body.itemType);
    if (!def || def.category !== 'special' || !recipeCosts(def).length) return answer(400, 'not-for-sale');
    if (def.level && econ.levelOf(player) < Number(def.level)) return answer(403, `level-${def.level}`);
    const qty = def.qtycollected || 1;
    const room = econ.roomFor(player, def.type, qty);
    if (!room.ok) return answer(409, room.reason);
    let gems = 0;
    if (req.body.useGems) {
      const paid = econ.spendWithGems(player, def, holdings);
      if (!paid.ok) return answer(409, paid.reason);
      gems = paid.gems;
    } else if (!spendCosts(def, player.inventory, player.backpack)) {
      const short = recipeCosts(def).find(([type, q]) => heldQuantity(player.inventory, player.backpack, type) < q);
      return answer(409, `short-${short ? short[0] : 'ingredients'}`);
    }
    econ.grant(player, def.type, qty);
    econ.advanceQuests(player, 'Buy', def.type, 1);
    player.markModified('inventory'); player.markModified('backpack');
    await player.save();
    return res.json({ success: true, collected: { type: def.type, qty }, gems, player: econ.playerDelta(player), seq: econ.nextSeq() });
  } catch (err) {
    console.error('❌ action/buy-item failed:', err);
    return res.status(500).json({ success: false, error: 'buy-item-failed', detail: err.message });
  }
});

module.exports = router;
