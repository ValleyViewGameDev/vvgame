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
 *   POST /action/graze-speedup                    a grazing farm animal ready now, for gems
 *   POST /action/grow-speedup                     a growing crop ripe now, for gems
 *   POST /action/bulk-craft-collect               the Crafter's bulk collect (and restart) over many stations
 *   POST /action/bulk-harvest                     the Farmer's bulk harvest (and replant) of ripe crops
 *   POST /action/buy-skill                        a skill at its master price (or gems for what is missing)
 *   POST /action/farmhand-buy-crop                a crop from a farm hand at 10x its max price
 *   POST /action/buy-item                         a 'special' item at its own recipe price (Skills panel stations)
 *   POST /action/npc-trade                        an NPC's trader offer (relationship bonus, xp, trophies)
 *   POST /action/shop-buy                         a shop's trader offer
 *   POST /action/quest-reward                     hand in a completed quest
 *   POST /action/heal-pay                         pay a healer; the heal is applied on the server
 *   POST /action/eat                              eat food for hp
 *   POST /action/respawn                          after a death: respawn hp, the backpack lost (Tent and Boat kept)
 *   POST /action/bank-sell                        sell to the Bank / a valley Counting House at this round's price
 *   POST /action/quests-refresh                   bring the state goals (Acquire / Meet / Find / Discover) up to date
 *   POST /action/place                            build / buy / place a deco, a station, a farm animal or a pet
 *   POST /action/plant                            plant a farm plot (or a tree) on a free tile it may grow on
 *   POST /action/terraform                        lay a ground tile from the Tools panel
 *   POST /action/ripen                            a grown farm plot becomes its crop (FarmState's timer)
 *   POST /action/remove                           clear something off the player's own grid (no refund)
 *   POST /action/warehouse-upgrade                the next warehouse level (tuning/warehouse.json)
 *   POST /action/unlock-avatars                   the premium avatars, for gems
 *   POST /action/animal-sell                      sell a farm animal back (its price at purchase)
 *   POST /action/pitch-tent                       camp: a Tent is used, the player is camping (Adventurer)
 *   POST /action/discard                          throw goods away (warehouse or backpack; only ever less)
 *   POST /action/send-home                        backpack goods to the warehouse (at home, or by a Post House)
 *   POST /action/discard-power                    throw away a weapon / armour / magic item (removal only)
 *   POST /action/mail-read / mail-delete          the Mailbox marks messages read and deletes one (never writes rewards)
 *   POST /action/scroll-reveal / scroll-collect   the Ancient Temple (Reveal Scroll)
 */
const express = require('express');
const router = express.Router();
const Player = require('../models/player');
const Grid = require('../models/grid');
const Frontier = require('../models/frontier');
const globalTuning = require('../tuning/globalTuning.json');
const Settlement = require('../models/settlement');
const { isDeveloper } = require('../utils/developerHelpers');
const gridResourceManager = require('../utils/GridResourceManager');
const gridTileManager = require('../utils/GridTileManager');
const econ = require('../utils/playerEconomy');
const { applyTrophy } = require('../utils/trophyUtils');
const { recordLevelUps } = require('../utils/analytics');
const { isCurrency } = require('../utils/inventoryUtils');
const { getSeasonLevel } = require('../utils/scheduleHelpers');
const { hopeArtifacts } = require('../utils/hopeArtifacts');
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
 * POST /api/action/graze-speedup { playerId, gridId, npcId }
 * → { success, gems, updatedNPC, player, seq }
 * AnimalPanel's gem button: a grazing farm animal finishes now and is ready to collect. Priced
 * like craft-speedup, ceil(minutes left ^ 0.45) (Economy/EconomyUtils.js calculateGemSpeedupCost),
 * from the server's own copy of grazeEnd and its own clock. Refusals: 409 not-grazing, short-Gem.
 */
router.post('/action/graze-speedup', async (req, res) => {
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
    if (!def || def.action !== 'graze') return answer(409, 'no-animal');
    const left = npc.state === 'grazing' && npc.grazeEnd ? npc.grazeEnd - Date.now() : 0;
    if (!(left > 0)) return answer(409, 'not-grazing');
    const gems = Math.ceil((left / 60000) ** 0.45);
    if (!spendCosts({ ingredient1: 'Gem', ingredient1qty: gems }, player.inventory, player.backpack)) return answer(409, 'short-Gem');
    player.markModified('inventory'); player.markModified('backpack');
    npc.state = 'processing';
    npc.grazeEnd = Date.now();
    npc.lastUpdated = Date.now();
    npcs.set(String(npcId), npc);
    grid.NPCsInGrid = npcs;
    grid.markModified('NPCsInGrid');
    await grid.save({ validateBeforeSave: false });
    await player.save();
    return res.json({ success: true, gems, updatedNPC: npc, player: econ.playerDelta(player), seq: econ.nextSeq() });
  } catch (err) {
    console.error('❌ action/graze-speedup failed:', err);
    return res.status(500).json({ success: false, error: 'graze-speedup-failed', detail: err.message });
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
    // a regional crop (its farm plot has a growregion) is grown in its region, never sold here
    if (econ.isRegionalCrop(crop.type)) return answer(400, 'not-offered');
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

// ---- Trading with NPCs and shops, quests, healers -------------------------------------------

const TRADE_TROPHIES = { 'Home Deed': 'Homesteader', 'Brass Bell': 'Brass Bell', Hope: 'Hope' };
const SHOP_TROPHIES = { Boat: 'Mariner', "King's Crown": "King's Crown", Trident: 'Trident' };
const QUEST_COUNT_TROPHIES = new Set(["Prospero's Orb", 'Skeleton Key', 'Golden Key']);

/** An offer as a recipe: the trader row (traders.json) when it has an index, else the item's own recipe sold by that trader. */
function offerFor(trader, index, gives) {
  if (index !== undefined && index !== null && index !== '') return econ.traderOffer(trader, index);
  const def = econ.resourceDef(gives);
  if (!def || def.source !== trader) return null;
  return { offer: { trader, gives: def.type, givesqty: def.qtycollected || 1, xp: def.xp }, recipe: def, def };
}

/** Pay for an offer: its costs, or gems for what is missing. */
function payFor(player, recipe, { useGems }) {
  if (useGems) return econ.spendWithGems(player, recipe, holdings);
  if (!spendCosts(recipe, player.inventory, player.backpack)) {
    const short = recipeCosts(recipe).find(([type, q]) => heldQuantity(player.inventory, player.backpack, type) < q);
    return { ok: false, reason: `short-${short ? short[0] : 'ingredients'}` };
  }
  player.markModified('inventory'); player.markModified('backpack');
  return { ok: true, gems: 0 };
}

const giveXP = (player, amount) => {
  const xp = Number(amount) || 0;
  if (!xp) return 0;
  recordLevelUps(player._id, player.xp || 0, (player.xp || 0) + xp).catch(() => {});
  player.xp = (player.xp || 0) + xp;
  return xp;
};

/**
 * POST /api/action/npc-trade { playerId, trader, index, gives?, useGems? }
 * → { success, collected: {type, qty}, skill, xpGained, trophies, player, seq }
 * The offer comes from traders.json (never the payload). Its relationship gate and level lock
 * apply; goods are floor(givesqty x relationship bonus) (room first), a skill joins the skills
 * (no bonus, no xp). XP is the offer's, else the NPC's, else 1. Collect quests; Home Deed / Brass
 * Bell / Hope trophies. (A minigame offer is opened by winning it on the client, then paid as usual.)
 */
router.post('/action/npc-trade', async (req, res) => {
  try {
    const ctx = await loadPlayer(req, res);
    if (!ctx) return;
    const { player, answer } = ctx;
    const { trader, index, gives, useGems } = req.body;
    const found = offerFor(trader, index, gives);
    if (!found) return answer(400, 'no-offer');
    const { offer, recipe, def } = found;
    if (!econ.meetsRelationship(player, trader, offer.rel)) return answer(403, `needs-${offer.rel}`);
    if (def?.level && econ.levelOf(player) < Number(def.level)) return answer(403, `level-${def.level}`);
    // A trade with a clue (traders.json `clueKey`, e.g. Caliban's Yorick's Skull) is recorded on the
    // relationship as `trade:<gives>` (the Clues modal lists it; NPCsPanel plays its story). A
    // one-time one stays done once recorded, even after the item is spent (handed to Hecate).
    const clueTag = offer.clueKey ? `trade:${offer.gives}` : null;
    const rel = clueTag ? (player.relationships || []).find((r) => r.name === trader) : null;
    if (clueTag && offer.repeat === false && (rel?.clues || []).includes(clueTag)) return answer(409, 'owned');
    const isSkill = def?.category === 'skill';
    const qty = isSkill ? 1 : Math.floor((offer.givesqty || 1) * econ.relationshipMultiplier(player, trader));
    if (!isSkill) {
      const room = econ.roomFor(player, offer.gives, qty);
      if (!room.ok) return answer(409, room.reason);
    }
    const paid = payFor(player, recipe, { useGems });
    if (!paid.ok) return answer(409, paid.reason);

    const trophies = [];
    let xpGained = 0;
    if (isSkill) {
      const g = econ.grantSkillOrPower(player, def, 1, { applyTrophy });
      if (g.trophy) trophies.push(g.trophy);
    } else {
      econ.grant(player, offer.gives, qty);
      econ.advanceQuests(player, 'Collect', offer.gives, qty);
      const tName = TRADE_TROPHIES[offer.gives];
      if (tName) {
        const t = applyTrophy(player, tName, 1);
        if (t.success) trophies.push({ name: tName, trophy: t.trophy, isNewMilestone: t.isNewMilestone });
      }
      const npcDef = econ.resourceDef(trader);
      xpGained = giveXP(player, offer.xp ?? (npcDef?.category === 'npc' ? npcDef.xp : undefined) ?? 1);
    }
    if (clueTag) {
      if (rel) rel.clues = [...new Set([...(rel.clues || []), clueTag])];
      else player.relationships.push({ name: trader, relscore: 0, clues: [clueTag] });
      player.markModified('relationships');
    }
    player.lastActive = new Date();
    await player.save();
    return res.json({
      success: true, collected: { type: offer.gives, qty }, skill: isSkill, xpGained, trophies, gems: paid.gems || 0,
      ...(clueTag ? { clueKey: offer.clueKey, relationships: player.relationships.map((r) => (r.toObject ? r.toObject() : r)) } : {}),
      player: econ.playerDelta(player), seq: econ.nextSeq(),
    });
  } catch (err) {
    console.error('❌ action/npc-trade failed:', err);
    return res.status(500).json({ success: false, error: 'npc-trade-failed', detail: err.message });
  }
});

/**
 * POST /api/action/shop-buy { playerId, trader, index, gives?, useGems? }
 * → { success, collected: {type, qty}, kind: 'goods' | 'power' | 'skill', trophies, player, seq }
 * A shop's offer (traders.json; a shop with no offers sells the items whose source it is). A power
 * or skill joins the player's own (a power already owned is refused); goods are givesqty (room
 * first). Buy quests advance by one; Boat / King's Crown / Trident trophies.
 */
router.post('/action/shop-buy', async (req, res) => {
  try {
    const ctx = await loadPlayer(req, res);
    if (!ctx) return;
    const { player, answer } = ctx;
    const { trader, index, gives, useGems } = req.body;
    const found = offerFor(trader, index, gives);
    if (!found) return answer(400, 'no-offer');
    const { offer, recipe, def } = found;
    if (def?.level && econ.levelOf(player) < Number(def.level)) return answer(403, `level-${def.level}`);
    const kind = def?.category === 'power' ? 'power' : def?.category === 'skill' ? 'skill' : 'goods';
    if (kind === 'power' && (player.powers || []).some((p) => p && p.type === def.type)) return answer(409, 'owned');
    if (hopeArtifacts().has(offer.gives) && heldQuantity(player.inventory, player.backpack, offer.gives) > 0) return answer(409, 'owned');
    const qty = kind === 'goods' ? (offer.givesqty || 1) : 1;
    if (kind === 'goods') {
      const room = econ.roomFor(player, offer.gives, qty);
      if (!room.ok) return answer(409, room.reason);
    }
    const paid = payFor(player, recipe, { useGems });
    if (!paid.ok) return answer(409, paid.reason);
    const trophies = [];
    if (kind === 'goods') econ.grant(player, offer.gives, qty);
    else {
      const g = econ.grantSkillOrPower(player, def, 1, { applyTrophy });
      if (g.trophy) trophies.push(g.trophy);
    }
    econ.advanceQuests(player, 'Buy', offer.gives, 1);
    const tName = SHOP_TROPHIES[offer.gives];
    if (tName) {
      const t = applyTrophy(player, tName, 1);
      if (t.success) trophies.push({ name: tName, trophy: t.trophy, isNewMilestone: t.isNewMilestone });
    }
    player.lastActive = new Date();
    await player.save();
    return res.json({ success: true, collected: { type: offer.gives, qty }, kind, trophies, gems: paid.gems || 0, player: econ.playerDelta(player), seq: econ.nextSeq() });
  } catch (err) {
    console.error('❌ action/shop-buy failed:', err);
    return res.status(500).json({ success: false, error: 'shop-buy-failed', detail: err.message });
  }
});

/**
 * POST /api/action/quest-reward { playerId, questId, npcType }
 * → { success, collected: {type, qty}, xpGained, trophies, repeatable, player, seq }
 * The quest must be the player's, completed and not yet rewarded. Reward, quantity and xp come
 * from questsEN.json; a one-of-a-kind reward (a Secret, a Hope artifact, a skill, power or NPC) is
 * never multiplied, anything else takes the giver's relationship bonus. A skill or power joins the
 * player's own; goods need room (refused, quest kept, when there is none). Collect quests, the
 * Orb / key count trophies; the quest moves to completedQuests (rewardCollected).
 */
router.post('/action/quest-reward', async (req, res) => {
  try {
    const ctx = await loadPlayer(req, res);
    if (!ctx) return;
    const { player, answer } = ctx;
    const { questId, npcType } = req.body;
    econ.refreshStateGoals(player); // a state goal (owns, has met, holds) may have come true since
    const active = (player.activeQuests || []).find((q) => q && q.questId === questId);
    if (!active) return answer(409, 'not-active');
    if (!active.completed) return answer(409, 'not-complete');
    if (active.rewardCollected) return answer(409, 'collected');
    const def = econ.loadQuestDefs().find((q) => q.title === questId);
    if (!def) return answer(400, 'no-quest');
    const giver = npcType || def.giver;
    const rewardDef = econ.resourceDef(def.reward);
    const oneOfAKind = /'s Secret$/.test(def.reward || '') || hopeArtifacts().has(def.reward)
      || ['skill', 'power', 'npc'].includes(rewardDef?.category);
    const qty = Math.floor((def.rewardqty || 1) * (oneOfAKind ? 1 : econ.relationshipMultiplier(player, giver)));
    const trophies = [];
    if (rewardDef && (rewardDef.category === 'skill' || rewardDef.category === 'power')) {
      if (!econ.hasSkillOrPower(player, rewardDef.type)) {
        const g = econ.grantSkillOrPower(player, rewardDef, 1, { applyTrophy });
        if (g.trophy) trophies.push(g.trophy);
      }
    } else if (def.reward) {
      const room = econ.roomFor(player, def.reward, qty);
      if (!room.ok) return answer(409, room.reason);
      econ.grant(player, def.reward, qty);
      econ.advanceQuests(player, 'Collect', def.reward, qty);
      if (QUEST_COUNT_TROPHIES.has(def.reward)) {
        for (let i = 0; i < qty; i++) {
          const t = applyTrophy(player, def.reward, 1);
          if (t.success) trophies.push({ name: def.reward, trophy: t.trophy, isNewMilestone: t.isNewMilestone });
        }
      }
    }
    const giverDef = econ.resourceDef(giver);
    const xpGained = giveXP(player, def.xp ?? (giverDef?.category === 'npc' ? giverDef.xp : undefined) ?? 1);

    if (!Array.isArray(player.completedQuests)) player.completedQuests = [];
    const done = player.completedQuests.find((q) => q && q.questId === questId);
    if (done) done.rewardCollected = true;
    else player.completedQuests.push({ questId, rewardCollected: true, timestamp: Date.now() });
    player.activeQuests = (player.activeQuests || []).filter((q) => q && q.questId !== questId);
    player.markModified('completedQuests'); player.markModified('activeQuests');
    player.lastActive = new Date();
    await player.save();
    const repeatable = def.repeatable === true || def.repeatable === 'true';
    return res.json({ success: true, collected: { type: def.reward, qty }, xpGained, trophies, repeatable, player: econ.playerDelta(player), seq: econ.nextSeq() });
  } catch (err) {
    console.error('❌ action/quest-reward failed:', err);
    return res.status(500).json({ success: false, error: 'quest-reward-failed', detail: err.message });
  }
});

/**
 * POST /api/action/heal-pay { playerId, healerType, useGems? }
 * → { success, amount, player, seq }
 * A healer's price is its own recipe in resources.json; the heal (its qtycollected, capped at the
 * derived maxhp) is applied here and answered as `hp` (/player/state never raises hp itself).
 */
router.post('/action/heal-pay', async (req, res) => {
  try {
    const ctx = await loadPlayer(req, res);
    if (!ctx) return;
    const { player, answer } = ctx;
    const healer = econ.resourceDef(req.body.healerType);
    if (!healer || healer.action !== 'heal') return answer(400, 'not-a-healer');
    const stored = Number.isFinite(player.hp) ? player.hp : econ.derivedMaxhp(player);
    if (healer.output === 'hp' && stored >= econ.derivedMaxhp(player)) return answer(409, 'full-hp');
    const paid = payFor(player, healer, { useGems: req.body.useGems });
    if (!paid.ok) return answer(409, paid.reason);
    const healed = econ.healBy(player, healer.qtycollected || 0); // the heal itself is the server's
    await player.save();
    return res.json({ success: true, amount: healed.healed, hp: healed.hp, maxhp: healed.maxhp, gems: paid.gems || 0, player: econ.playerDelta(player), seq: econ.nextSeq() });
  } catch (err) {
    console.error('❌ action/heal-pay failed:', err);
    return res.status(500).json({ success: false, error: 'heal-pay-failed', detail: err.message });
  }
});

// ---- The Bank ----------------------------------------------------------------------------------

/**
 * POST /api/action/bank-sell { playerId, offerIndex }
 * → { success, sold: {type, qty}, paid: {type, qty}, player, seq }
 * The offer is this round's, from the frontier (bankScheduler): the valley Counting Houses' list
 * when the player is in a valley (until its first round, the town list), else the town Bank's.
 * Only while the Bank is active. Spends the goods (backpack first), pays (room first), Sell quests.
 */
router.post('/action/bank-sell', async (req, res) => {
  try {
    const ctx = await loadPlayer(req, res);
    if (!ctx) return;
    const { player, answer } = ctx;
    const frontier = await Frontier.findById(player.frontierId).select('bank').lean();
    const bank = frontier?.bank;
    if (!bank || bank.phase !== 'active') return answer(409, 'closed');
    const inValley = String(player.location?.gtype || '').startsWith('valley');
    const list = inValley && (bank.valleyOffers || []).length ? bank.valleyOffers : (bank.offers || []);
    const offer = list[Number(req.body.offerIndex)];
    if (!offer) return answer(409, 'no-offer');
    const room = econ.roomFor(player, offer.itemGiven, offer.qtyGiven);
    if (!room.ok) return answer(409, room.reason);
    if (!spendCosts({ ingredient1: offer.itemBought, ingredient1qty: offer.qtyBought }, player.inventory, player.backpack)) return answer(409, `short-${offer.itemBought}`);
    econ.grant(player, offer.itemGiven, offer.qtyGiven);
    econ.advanceQuests(player, 'Sell', offer.itemBought, offer.qtyBought);
    player.markModified('inventory'); player.markModified('backpack');
    player.lastActive = new Date();
    await player.save();
    return res.json({ success: true, sold: { type: offer.itemBought, qty: offer.qtyBought }, paid: { type: offer.itemGiven, qty: offer.qtyGiven }, player: econ.playerDelta(player), seq: econ.nextSeq() });
  } catch (err) {
    console.error('❌ action/bank-sell failed:', err);
    return res.status(500).json({ success: false, error: 'bank-sell-failed', detail: err.message });
  }
});

/**
 * POST /api/action/quests-refresh { playerId }
 * → { success, changed, player, seq }
 * The To Do panel and the giver's panel ask this instead of saving activeQuests themselves.
 */
router.post('/action/quests-refresh', async (req, res) => {
  try {
    const ctx = await loadPlayer(req, res);
    if (!ctx) return;
    const { player } = ctx;
    const changed = econ.refreshStateGoals(player);
    if (changed) await player.save();
    return res.json({ success: true, changed, player: econ.playerDelta(player), seq: econ.nextSeq() });
  } catch (err) {
    console.error('❌ action/quests-refresh failed:', err);
    return res.status(500).json({ success: false, error: 'quests-refresh-failed', detail: err.message });
  }
});

// ---- Building and buying things onto the board ---------------------------------------------

const PLACE_SOURCES = new Set(['Build', 'BuildTown', 'BuildValley', 'Buy', 'Deco', 'Zoo']);

/** Every tile a resource covers: its anchor and, for size > 1, the square up and to the right. */
function footprint(x, y, size = 1) {
  const tiles = [];
  for (let dx = 0; dx < size; dx++) for (let dy = 0; dy < size; dy++) tiles.push(`${x + dx},${y - dy}`);
  return tiles;
}

/**
 * POST /api/action/place { playerId, gridId, x, y, type, useGems? }
 * → { success, placed: {type, x, y}, isNPC, player, seq }
 * The Build / Buy / Deco / Zoo panels' purchase (BuildAndBuy.js handleConstruction). The item must
 * be sold where the player is (Build anywhere they own, BuildTown in a town by its Mayor, BuildValley
 * in a valley), its footprint free, and the globalTuning limits met (farm animals, town buildings,
 * stations per type), and a regional animal's region (growregion). The price is its resources.json recipe (gems for what is missing). A building
 * is written to the grid (a station at level 0, a pet too); an NPC (a farm animal) is spawned by the
 * client. Build + Buy quests (an NPC: Buy).
 */
router.post('/action/place', async (req, res) => {
  const { playerId, gridId, x, y, type, useGems } = req.body || {};
  if (!playerId || !gridId || !Number.isInteger(x) || !Number.isInteger(y) || !type) return fail(res, 400, 'bad-request');
  try {
    const [player, grid] = await Promise.all([Player.findById(playerId), Grid.findById(gridId)]);
    if (!player) return fail(res, 404, 'no-player');
    if (!grid) return fail(res, 404, 'no-grid');
    if (!econ.ownsGrid(grid, player)) return fail(res, 403, 'not-your-grid');
    const answer = (status, reason) => fail(res, status, reason, { player: econ.playerDelta(player), seq: econ.nextSeq() });
    const def = econ.resourceDef(type);
    if (!def || !PLACE_SOURCES.has(def.source)) return answer(400, 'not-for-sale');
    const dev = isDeveloper(player.username);
    const gtype = String(grid.gridType || '');
    if (def.source === 'BuildValley' && !gtype.startsWith('valley')) return answer(403, 'not-here');
    if (def.source === 'BuildTown') {
      if (gtype !== 'town') return answer(403, 'not-here');
      if (!dev) {
        const settlement = await Settlement.findById(grid.settlementId).select('roles').lean();
        const isMayor = (settlement?.roles || []).some((r) => r.roleName === 'Mayor' && String(r.playerId) === String(player._id));
        if (!isMayor) return answer(403, 'mayor-only');
      }
    }
    if (def.level && !dev && econ.levelOf(player) < Number(def.level)) return answer(403, `level-${def.level}`);
    // a regional farm animal (resources.json growregion, e.g. the Goat: Bohemia) lives only on a grid of its region
    if (!econ.growsInRegion(def, grid.region)) return answer(403, `region-${def.growregion}`);

    const isNPC = def.category === 'npc'; // a pet is a board resource (its panel works on its tile)
    const onGrid = gridResourceManager.getResources(grid) || [];
    if (!isNPC) {
      const taken = new Set();
      for (const r of onGrid) {
        if (!r) continue;
        const size = Number(r.size || econ.resourceDef(r.type)?.size || 1);
        for (const t of footprint(r.x, r.y, size)) taken.add(t);
      }
      if (footprint(x, y, Number(def.size || 1)).some((t) => taken.has(t))) return answer(409, 'occupied');
    }
    const limit = (key, fallback) => Number(globalTuning[key] ?? fallback);
    if (def.action === 'graze') {
      const npcs = grid.NPCsInGrid instanceof Map ? [...grid.NPCsInGrid.values()] : Object.values(grid.NPCsInGrid || {});
      const animals = npcs.filter((n) => n && econ.resourceDef(n.type)?.action === 'graze').length;
      if (animals >= limit('maxFarmAnimals', 10)) return answer(409, 'limit');
    }
    if (def.source === 'BuildTown' && gtype !== 'homestead') {
      const townBuildings = onGrid.filter((r) => r && econ.resourceDef(r.type)?.source === 'BuildTown').length;
      if (townBuildings >= limit('maxTownBuildings', 500)) return answer(409, 'limit');
    }
    if (def.category === 'crafting' && onGrid.filter((r) => r && r.type === def.type).length >= limit('maxCraftingStationsPerType', 4)) return answer(409, 'limit');

    // a grazing animal's Money price rises with each one of its type already owned (animalPricing.js)
    const price = def.action === 'graze' ? econ.withScaledAnimalCost(def, econ.countAnimalsOfType(grid, def.type)) : def;
    const paid = payFor(player, price, { useGems });
    if (!paid.ok) return answer(409, paid.reason);
    if (!isNPC) {
      const placed = { type: def.type, x, y };
      if (def.category === 'crafting') placed.stationLevel = 0;
      gridResourceManager.updateResource(grid, placed);
      await grid.save({ validateBeforeSave: false });
      econ.advanceQuests(player, 'Build', def.type, 1);
    }
    econ.advanceQuests(player, 'Buy', def.type, 1);
    player.lastActive = new Date();
    await player.save();
    return res.json({ success: true, placed: { type: def.type, x, y }, isNPC, gems: paid.gems || 0, player: econ.playerDelta(player), seq: econ.nextSeq() });
  } catch (err) {
    console.error('❌ action/place failed:', err);
    return res.status(500).json({ success: false, error: 'place-failed', detail: err.message });
  }
});

/**
 * POST /api/action/plant { playerId, gridId, x, y, type }
 * → { success, planted: {type, x, y, growEnd}, player, seq }
 * Farming.js handleFarmPlotPlacement: a farm plot on a free tile whose type it allows
 * (validon<tile>), its `requires` skill held, its seeds spent, growEnd from its growtime.
 * Plant quests advance for its crop. Refusals: occupied, bad-tile, region-<region> (its growregion is
 * not this grid's region), limit (its maxpergrid reached on this grid), needs-<skill>, short-<seed>.
 */
router.post('/action/plant', async (req, res) => {
  const { playerId, gridId, x, y, type } = req.body || {};
  if (!playerId || !gridId || !Number.isInteger(x) || !Number.isInteger(y) || !type) return fail(res, 400, 'bad-request');
  try {
    const [player, grid] = await Promise.all([Player.findById(playerId), Grid.findById(gridId)]);
    if (!player) return fail(res, 404, 'no-player');
    if (!grid) return fail(res, 404, 'no-grid');
    if (!econ.ownsGrid(grid, player)) return fail(res, 403, 'not-your-grid');
    const answer = (status, reason) => fail(res, status, reason, { player: econ.playerDelta(player), seq: econ.nextSeq() });
    const def = econ.resourceDef(type);
    if (!def || def.category !== 'farmplot') return answer(400, 'not-plantable');
    if ((gridResourceManager.getResources(grid) || []).some((r) => r && r.x === x && r.y === y)) return answer(409, 'occupied');
    const tile = gridTileManager.getTile(grid, x, y);
    if (!tile || def[`validon${tile}`] !== true) return answer(409, 'bad-tile');
    if (!econ.growsInRegion(def, grid.region)) return answer(409, `region-${def.growregion}`);
    if (econ.cropCapReached(def, gridResourceManager.getResources(grid))) return answer(409, 'limit');
    if (def.requires && econ.resourceDef(def.requires)?.category === 'skill' && !econ.hasSkill(player, def.requires)) return answer(403, `needs-${def.requires}`);
    if (!spendCosts(def, player.inventory, player.backpack)) {
      const short = recipeCosts(def).find(([t, q]) => heldQuantity(player.inventory, player.backpack, t) < q);
      return answer(409, `short-${short ? short[0] : 'ingredients'}`);
    }
    player.markModified('inventory'); player.markModified('backpack');
    const growEnd = Date.now() + (Number(def.growtime) || 0) * 1000;
    gridResourceManager.updateResource(grid, { type: def.type, x, y, growEnd });
    econ.advanceQuests(player, 'Plant', def.output || def.type, 1);
    player.lastActive = new Date();
    await grid.save({ validateBeforeSave: false });
    await player.save();
    return res.json({ success: true, planted: { type: def.type, x, y, growEnd }, player: econ.playerDelta(player), seq: econ.nextSeq() });
  } catch (err) {
    console.error('❌ action/plant failed:', err);
    return res.status(500).json({ success: false, error: 'plant-failed', detail: err.message });
  }
});

/**
 * POST /api/action/terraform { playerId, gridId, x, y, tileType }
 * → { success, tile: {x, y, type} }
 * The Tools panel (Farming.js handleTerraform): the new ground is a `category: 'tile'` row of
 * resources.json whose skill and level locks the player meets (devonly: developers); water and
 * lava cannot be changed except by a developer. Free, as before.
 */
router.post('/action/terraform', async (req, res) => {
  const { playerId, gridId, x, y, tileType } = req.body || {};
  if (!playerId || !gridId || !Number.isInteger(x) || !Number.isInteger(y) || !tileType) return fail(res, 400, 'bad-request');
  try {
    const [player, grid] = await Promise.all([Player.findById(playerId), Grid.findById(gridId)]);
    if (!player) return fail(res, 404, 'no-player');
    if (!grid) return fail(res, 404, 'no-grid');
    if (!econ.ownsGrid(grid, player)) return fail(res, 403, 'not-your-grid');
    const def = econ.resourceDef(tileType);
    if (!def || def.category !== 'tile') return fail(res, 400, 'not-a-tile');
    const dev = isDeveloper(player.username);
    if (def.requires === 'devonly' && !dev) return fail(res, 403, 'devonly');
    if (def.requires && def.requires !== 'devonly' && !econ.hasSkillOrPower(player, def.requires)) return fail(res, 403, `needs-${def.requires}`);
    if (def.level && !dev && econ.levelOf(player) < Number(def.level)) return fail(res, 403, `level-${def.level}`);
    const before = gridTileManager.getTile(grid, x, y);
    if (!before) return fail(res, 400, 'no-tile');
    if ((before === 'w' || before === 'l') && !dev) return fail(res, 403, 'cannot-change');
    gridTileManager.updateTile(grid, x, y, tileType);
    await grid.save({ validateBeforeSave: false });
    return res.json({ success: true, tile: { x, y, type: tileType } });
  } catch (err) {
    console.error('❌ action/terraform failed:', err);
    return res.status(500).json({ success: false, error: 'terraform-failed', detail: err.message });
  }
});

const RIPEN_EARLY_MS = 30000; // client clocks run a little ahead; ripening seconds early is harmless

/**
 * POST /api/action/ripen { playerId, gridId, x, y }
 * → { success, ripened: {type, x, y} }
 * FarmState's grow timer: the farm plot on (x, y) becomes its output once its own growEnd has
 * passed (by the server's clock, a little slack allowed). Refusals: 409 not-ready (with growEnd),
 * 409 gone (no plot there: already ripened or harvested).
 */
router.post('/action/ripen', async (req, res) => {
  const { playerId, gridId, x, y } = req.body || {};
  if (!playerId || !gridId || !Number.isInteger(x) || !Number.isInteger(y)) return fail(res, 400, 'bad-request');
  try {
    const [player, grid] = await Promise.all([Player.findById(playerId).select('_id gridId').lean(), Grid.findById(gridId)]);
    if (!player) return fail(res, 404, 'no-player');
    if (!grid) return fail(res, 404, 'no-grid');
    if (!econ.ownsGrid(grid, player)) return fail(res, 403, 'not-your-grid');
    const plot = (gridResourceManager.getResources(grid) || []).find((r) => r && r.x === x && r.y === y);
    const def = plot && econ.resourceDef(plot.type);
    if (!def || def.category !== 'farmplot') return fail(res, 409, 'gone');
    const growEnd = plot.growEnd ? new Date(plot.growEnd).getTime() : 0;
    if (growEnd && growEnd - RIPEN_EARLY_MS > Date.now()) return fail(res, 409, 'not-ready', { growEnd });
    const crop = econ.resourceDef(def.output);
    if (!crop) return fail(res, 400, 'no-output');
    gridResourceManager.updateResource(grid, { type: crop.type, x, y });
    await grid.save({ validateBeforeSave: false });
    return res.json({ success: true, ripened: { type: crop.type, x, y } });
  } catch (err) {
    console.error('❌ action/ripen failed:', err);
    return res.status(500).json({ success: false, error: 'ripen-failed', detail: err.message });
  }
});

/**
 * POST /api/action/grow-speedup { playerId, gridId, x, y }
 * → { success, gems, ripened: {type, x, y}, player, seq }
 * CropPanel's gem chip: a growing farm plot becomes its crop now. Priced like craft-speedup,
 * ceil(minutes left ^ 0.45), from the server's own growEnd and clock. Refusals: 409 not-growing
 * (no plot, or already ripe: the farm timer ripens it), short-Gem.
 */
router.post('/action/grow-speedup', async (req, res) => {
  const { playerId, gridId, x, y } = req.body || {};
  if (!playerId || !gridId || !Number.isInteger(x) || !Number.isInteger(y)) return fail(res, 400, 'bad-request');
  try {
    const [player, grid] = await Promise.all([Player.findById(playerId), Grid.findById(gridId)]);
    if (!player) return fail(res, 404, 'no-player');
    if (!grid) return fail(res, 404, 'no-grid');
    if (!econ.ownsGrid(grid, player)) return fail(res, 403, 'not-your-grid');
    const answer = (status, reason) => fail(res, status, reason, { player: econ.playerDelta(player), seq: econ.nextSeq() });
    const plot = (gridResourceManager.getResources(grid) || []).find((r) => r && r.x === x && r.y === y);
    const def = plot && econ.resourceDef(plot.type);
    if (!def || def.category !== 'farmplot') return answer(409, 'not-growing');
    const left = plot.growEnd ? new Date(plot.growEnd).getTime() - Date.now() : 0;
    if (!(left > 0)) return answer(409, 'not-growing');
    const crop = econ.resourceDef(def.output);
    if (!crop) return answer(400, 'no-output');
    const gems = Math.ceil((left / 60000) ** 0.45);
    if (!spendCosts({ ingredient1: 'Gem', ingredient1qty: gems }, player.inventory, player.backpack)) return answer(409, 'short-Gem');
    player.markModified('inventory'); player.markModified('backpack');
    gridResourceManager.updateResource(grid, { type: crop.type, x, y });
    await grid.save({ validateBeforeSave: false });
    await player.save();
    return res.json({ success: true, gems, ripened: { type: crop.type, x, y }, player: econ.playerDelta(player), seq: econ.nextSeq() });
  } catch (err) {
    console.error('❌ action/grow-speedup failed:', err);
    return res.status(500).json({ success: false, error: 'grow-speedup-failed', detail: err.message });
  }
});

/**
 * POST /api/action/remove { playerId, gridId, x, y }
 * → { success, removed: type | null }
 * Clearing a thing off the player's OWN grid with no refund (a crop, a training building, a
 * doober a citizen eats, a station after its sell-for-refund). Nothing is granted, so ownership
 * of the grid is the whole check. A tile already empty answers success (removed: null).
 */
router.post('/action/remove', async (req, res) => {
  const { playerId, gridId, x, y } = req.body || {};
  if (!playerId || !gridId || !Number.isInteger(x) || !Number.isInteger(y)) return fail(res, 400, 'bad-request');
  try {
    const [player, grid] = await Promise.all([Player.findById(playerId).select('_id gridId').lean(), Grid.findById(gridId)]);
    if (!player) return fail(res, 404, 'no-player');
    if (!grid) return fail(res, 404, 'no-grid');
    if (!econ.ownsGrid(grid, player)) return fail(res, 403, 'not-your-grid');
    const onTile = (gridResourceManager.getResources(grid) || []).find((r) => r && r.x === x && r.y === y);
    if (!onTile) return res.json({ success: true, removed: null });
    gridResourceManager.updateResource(grid, { type: null, x, y });
    await grid.save({ validateBeforeSave: false });
    return res.json({ success: true, removed: onTile.type });
  } catch (err) {
    console.error('❌ action/remove failed:', err);
    return res.status(500).json({ success: false, error: 'remove-failed', detail: err.message });
  }
});

// ---- Upgrades ----------------------------------------------------------------------------------

const warehouseLevels = require('../tuning/warehouse.json');
const PREMIUM_AVATAR_GEM_COST = 200; // UI/Modals/ChangeIconModal.js shows the same price

/**
 * POST /api/action/warehouse-upgrade { playerId, useGems? }
 * → { success, warehouseLevel, warehouseCapacity, player, seq }
 * The level after the player's (none stored = 0) from warehouse.json: its ingredients spent (gems
 * for what is missing), capacity + its `add`. Refusals: 409 max, short-<type>.
 */
router.post('/action/warehouse-upgrade', async (req, res) => {
  try {
    const ctx = await loadPlayer(req, res);
    if (!ctx) return;
    const { player, answer } = ctx;
    const level = Number.isInteger(player.warehouseLevel) ? player.warehouseLevel : 0;
    const next = warehouseLevels[level + 1];
    if (!next) return answer(409, 'max');
    const paid = payFor(player, next, { useGems: req.body.useGems });
    if (!paid.ok) return answer(409, paid.reason);
    player.warehouseCapacity = (player.warehouseCapacity || 1000) + (Number(next.add) || 0);
    player.warehouseLevel = next.Level;
    await player.save();
    return res.json({ success: true, warehouseLevel: player.warehouseLevel, warehouseCapacity: player.warehouseCapacity, player: econ.playerDelta(player), seq: econ.nextSeq() });
  } catch (err) {
    console.error('❌ action/warehouse-upgrade failed:', err);
    return res.status(500).json({ success: false, error: 'warehouse-upgrade-failed', detail: err.message });
  }
});

/** POST /api/action/unlock-avatars { playerId } → { success, avatarsUnlocked, player, seq } */
router.post('/action/unlock-avatars', async (req, res) => {
  try {
    const ctx = await loadPlayer(req, res);
    if (!ctx) return;
    const { player, answer } = ctx;
    if (player.avatarsUnlocked) return res.json({ success: true, avatarsUnlocked: true, player: econ.playerDelta(player), seq: econ.nextSeq() });
    if (!spendCosts({ ingredient1: 'Gem', ingredient1qty: PREMIUM_AVATAR_GEM_COST }, player.inventory, player.backpack)) return answer(409, 'short-Gem');
    player.markModified('inventory'); player.markModified('backpack');
    player.avatarsUnlocked = true;
    await player.save();
    return res.json({ success: true, avatarsUnlocked: true, player: econ.playerDelta(player), seq: econ.nextSeq() });
  } catch (err) {
    console.error('❌ action/unlock-avatars failed:', err);
    return res.status(500).json({ success: false, error: 'unlock-avatars-failed', detail: err.message });
  }
});

/**
 * POST /api/action/animal-sell { playerId, gridId, npcId }
 * → { success, refund: [{type, qty}], player, seq }
 * FarmAnimals.js handleSellStation, on the homestead: the animal's own recipe back, its Money at
 * the price it cost (scaled by the herd of its type minus itself). The animal leaves the grid.
 */
router.post('/action/animal-sell', async (req, res) => {
  const { playerId, gridId, npcId } = req.body || {};
  if (!playerId || !gridId || !npcId) return fail(res, 400, 'bad-request');
  try {
    const [player, grid] = await Promise.all([Player.findById(playerId), Grid.findById(gridId)]);
    if (!player) return fail(res, 404, 'no-player');
    if (!grid) return fail(res, 404, 'no-grid');
    if (!econ.ownsGrid(grid, player) || grid.gridType !== 'homestead') return fail(res, 403, 'not-your-homestead');
    const answer = (status, reason) => fail(res, status, reason, { player: econ.playerDelta(player), seq: econ.nextSeq() });
    const npcs = grid.NPCsInGrid instanceof Map ? grid.NPCsInGrid : new Map(Object.entries(grid.NPCsInGrid || {}));
    const npc = npcs.get(String(npcId));
    const def = npc && econ.resourceDef(npc.type);
    if (!def || def.action !== 'graze') return answer(409, 'gone');
    const paidFor = econ.withScaledAnimalCost(def, Math.max(0, econ.countAnimalsOfType(grid, def.type) - 1));
    const refund = recipeCosts(paidFor).map(([type, qty]) => ({ type, qty }));
    npcs.delete(String(npcId));
    grid.NPCsInGrid = npcs;
    grid.markModified('NPCsInGrid');
    for (const r of refund) econ.grant(player, r.type, r.qty, { atHome: true });
    await grid.save({ validateBeforeSave: false });
    await player.save();
    return res.json({ success: true, refund, player: econ.playerDelta(player), seq: econ.nextSeq() });
  } catch (err) {
    console.error('❌ action/animal-sell failed:', err);
    return res.status(500).json({ success: false, error: 'animal-sell-failed', detail: err.message });
  }
});

/** POST /api/action/pitch-tent { playerId } → { success, trophies, player, seq }: one Tent, iscamping, Adventurer. */
router.post('/action/pitch-tent', async (req, res) => {
  try {
    const ctx = await loadPlayer(req, res);
    if (!ctx) return;
    const { player, answer } = ctx;
    if (!spendCosts({ ingredient1: 'Tent', ingredient1qty: 1 }, player.inventory, player.backpack)) return answer(409, 'short-Tent');
    player.markModified('inventory'); player.markModified('backpack');
    player.iscamping = true;
    const trophies = [];
    const t = applyTrophy(player, 'Adventurer', 1);
    if (t.success) trophies.push({ name: 'Adventurer', trophy: t.trophy, isNewMilestone: t.isNewMilestone });
    await player.save();
    return res.json({ success: true, trophies, player: econ.playerDelta(player), seq: econ.nextSeq() });
  } catch (err) {
    console.error('❌ action/pitch-tent failed:', err);
    return res.status(500).json({ success: false, error: 'pitch-tent-failed', detail: err.message });
  }
});

// ---- Managing the holdings ---------------------------------------------------------------------

const isSpecialType = (type) => econ.resourceDef(type)?.category === 'special';
/** The [type, qty] pairs asked for, capped at what the list holds (`all`: everything but specials). */
function pickFrom(list, { items, all, keepSpecial = false }) {
  const held = new Map();
  for (const i of list || []) if (i && i.type) held.set(i.type, (held.get(i.type) || 0) + (i.quantity || 0));
  if (all) return [...held].filter(([type, q]) => q > 0 && !(keepSpecial && isSpecialType(type)));
  return (Array.isArray(items) ? items : [])
    .map((i) => [i?.type, Math.min(Math.floor(Number(i?.qty) || 0), held.get(i?.type) || 0)])
    .filter(([type, q]) => type && q > 0 && !(keepSpecial && isSpecialType(type)));
}
function takeAll(list, pairs) {
  for (const [type, qty] of pairs) {
    let rest = qty;
    for (let i = list.length - 1; i >= 0 && rest > 0; i--) {
      if (!list[i] || list[i].type !== type) continue;
      const t = Math.min(list[i].quantity || 0, rest);
      list[i].quantity -= t; rest -= t;
      if (list[i].quantity <= 0) list.splice(i, 1);
    }
  }
}

/**
 * POST /api/action/discard { playerId, from: 'inventory' | 'backpack', items?: [{type, qty}], all? }
 * → { success, discarded: [{type, qty}], player, seq }
 * Throwing goods away can only ever lower the holdings (the old update-inventory wrote whatever
 * list the client sent). `all` from the backpack keeps the special items, as the panel does.
 */
router.post('/action/discard', async (req, res) => {
  try {
    const ctx = await loadPlayer(req, res);
    if (!ctx) return;
    const { player } = ctx;
    const field = req.body.from === 'backpack' ? 'backpack' : 'inventory';
    if (!Array.isArray(player[field])) player[field] = [];
    const pairs = pickFrom(player[field], { items: req.body.items, all: !!req.body.all, keepSpecial: field === 'backpack' && !!req.body.all });
    takeAll(player[field], pairs);
    player.markModified(field);
    await player.save();
    return res.json({ success: true, discarded: pairs.map(([type, qty]) => ({ type, qty })), player: econ.playerDelta(player), seq: econ.nextSeq() });
  } catch (err) {
    console.error('❌ action/discard failed:', err);
    return res.status(500).json({ success: false, error: 'discard-failed', detail: err.message });
  }
});

/**
 * POST /api/action/send-home { playerId, items?: [{type, qty}], all? }
 * → { success, moved: [{type, qty}], player, seq }
 * Backpack goods into the warehouse: on the homestead, or anywhere with a Post House on the grid
 * (BackpackManageModal's canSendHome). Special items stay in the backpack. Warehouse room first.
 */
router.post('/action/send-home', async (req, res) => {
  try {
    const ctx = await loadPlayer(req, res);
    if (!ctx) return;
    const { player, answer } = ctx;
    const here = player.location?.g ? await Grid.findById(player.location.g).select('gridType resources ownerId').lean() : null;
    const atHome = player.location?.gtype === 'homestead';
    const byPostHouse = here && (gridResourceManager.getResources(here) || []).some((r) => r && r.type === 'Post House');
    if (!atHome && !byPostHouse) return answer(403, 'not-here');
    const pairs = pickFrom(player.backpack, { items: req.body.items, all: !!req.body.all, keepSpecial: true });
    const moving = pairs.reduce((n, [type, q]) => n + (isCurrency(type) ? 0 : q), 0);
    const goods = (list) => (list || []).filter((i) => i && !isCurrency(i.type)).reduce((n, i) => n + (i.quantity || 0), 0);
    if (goods(player.inventory) + moving > econ.capacityOf(player).warehouse) return answer(409, 'warehouse-full');
    takeAll(player.backpack, pairs);
    for (const [type, qty] of pairs) econ.grant(player, type, qty, { atHome: true });
    player.markModified('inventory'); player.markModified('backpack');
    await player.save();
    return res.json({ success: true, moved: pairs.map(([type, qty]) => ({ type, qty })), player: econ.playerDelta(player), seq: econ.nextSeq() });
  } catch (err) {
    console.error('❌ action/send-home failed:', err);
    return res.status(500).json({ success: false, error: 'send-home-failed', detail: err.message });
  }
});

/** POST /api/action/discard-power { playerId, type } → { success, player, seq }: the Combat panel's Discard (removal only). */
router.post('/action/discard-power', async (req, res) => {
  try {
    const ctx = await loadPlayer(req, res);
    if (!ctx) return;
    const { player } = ctx;
    player.powers = (player.powers || []).filter((p) => p && p.type !== req.body.type);
    player.markModified('powers');
    await player.save();
    return res.json({ success: true, player: econ.playerDelta(player), seq: econ.nextSeq() });
  } catch (err) {
    console.error('❌ action/discard-power failed:', err);
    return res.status(500).json({ success: false, error: 'discard-power-failed', detail: err.message });
  }
});

// ---- The Mailbox ------------------------------------------------------------------------------
// Messages carry their rewards, so the client never writes the message list: it can mark them
// read and delete one; only the server creates messages (sendMailboxMessage, the schedulers).

router.post('/action/mail-read', async (req, res) => {
  try {
    const ctx = await loadPlayer(req, res);
    if (!ctx) return;
    const { player } = ctx;
    let changed = 0;
    for (const m of player.messages || []) if (m && !m.read) { m.read = true; changed++; }
    if (changed) { player.markModified('messages'); await player.save(); }
    return res.json({ success: true, marked: changed, messages: player.messages });
  } catch (err) {
    console.error('❌ action/mail-read failed:', err);
    return res.status(500).json({ success: false, error: 'mail-read-failed', detail: err.message });
  }
});

/** POST /api/action/mail-delete { playerId, messageIndex, messageId? } (messageId, when given, must match). */
router.post('/action/mail-delete', async (req, res) => {
  try {
    const ctx = await loadPlayer(req, res);
    if (!ctx) return;
    const { player, answer } = ctx;
    const i = Number(req.body.messageIndex);
    const msg = (player.messages || [])[i];
    if (!msg) return answer(409, 'gone');
    if (req.body.messageId !== undefined && req.body.messageId !== null && String(msg.messageId) !== String(req.body.messageId)) return answer(409, 'gone');
    player.messages.splice(i, 1);
    player.markModified('messages');
    await player.save();
    return res.json({ success: true, messages: player.messages });
  } catch (err) {
    console.error('❌ action/mail-delete failed:', err);
    return res.status(500).json({ success: false, error: 'mail-delete-failed', detail: err.message });
  }
});

// ---- Hit points: eating and respawning -------------------------------------------------------

/**
 * POST /api/action/eat { playerId, type, qty, from: 'inventory' | 'backpack' }
 * → { success, eaten: {type, qty}, hp, maxhp, player, seq }
 * GameFeatures/Eating/Eating.js: food with an `hp` in resources.json, at most what fills the hp
 * up (as the panel caps it), taken from the list it was picked from (the food used to stay in
 * the holdings: nothing saved the removal).
 */
router.post('/action/eat', async (req, res) => {
  try {
    const ctx = await loadPlayer(req, res);
    if (!ctx) return;
    const { player, answer } = ctx;
    const def = econ.resourceDef(req.body.type);
    if (!def || !(def.hp > 0)) return answer(400, 'not-food');
    const field = req.body.from === 'inventory' ? 'inventory' : 'backpack';
    const held = (player[field] || []).filter((i) => i && i.type === def.type).reduce((n, i) => n + (i.quantity || 0), 0);
    const maxhp = econ.derivedMaxhp(player);
    const stored = Number.isFinite(player.hp) ? player.hp : maxhp;
    const fills = Math.max(1, Math.floor((maxhp - stored) / def.hp));
    const qty = Math.min(Math.floor(Number(req.body.qty) || 0), held, fills);
    if (!(qty > 0)) return answer(409, stored >= maxhp ? 'full-hp' : `short-${def.type}`);
    takeAll(player[field], [[def.type, qty]]);
    player.markModified(field);
    const healed = econ.healBy(player, qty * def.hp);
    await player.save();
    return res.json({ success: true, eaten: { type: def.type, qty }, hp: healed.hp, maxhp: healed.maxhp, player: econ.playerDelta(player), seq: econ.nextSeq() });
  } catch (err) {
    console.error('❌ action/eat failed:', err);
    return res.status(500).json({ success: false, error: 'eat-failed', detail: err.message });
  }
});

/**
 * POST /api/action/respawn { playerId }
 * → { success, hp, maxhp, player, seq }
 * playerManagement.js handlePlayerDeath: the respawn hp from globalTuning.combat (a flat value, a
 * share of max hp for Gold) and the backpack emptied except the Tent and the Boat. The client then
 * moves the player to town as before. Never raises hp above the respawn value.
 */
router.post('/action/respawn', async (req, res) => {
  try {
    const ctx = await loadPlayer(req, res);
    if (!ctx) return;
    const { player } = ctx;
    const combat = globalTuning.combat || {};
    const maxhp = econ.derivedMaxhp(player);
    const respawnHp = player.accountStatus === 'Gold' ? Math.floor(maxhp * (combat.respawnHpGoldFraction ?? 0.5)) : (combat.respawnHpFree ?? 40);
    player.backpack = (player.backpack || []).filter((i) => i && (i.type === 'Tent' || i.type === 'Boat'));
    player.markModified('backpack');
    player.hp = Math.min(respawnHp, maxhp);
    player.maxhp = maxhp;
    player.hpSavedAt = new Date();
    await player.save();
    return res.json({ success: true, hp: player.hp, maxhp, player: econ.playerDelta(player), seq: econ.nextSeq() });
  } catch (err) {
    console.error('❌ action/respawn failed:', err);
    return res.status(500).json({ success: false, error: 'respawn-failed', detail: err.message });
  }
});

module.exports = router;
