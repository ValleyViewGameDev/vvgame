/**
 * NPCCitizenBehavior - the shared brain of every Citizen (quest, trade, heal, worker).
 * Design and decisions: docs/citizens.md (Track 4 of docs/audits/combat-and-npc-review-2026-10-07.md).
 *
 * The loop: working -> resting -> roaming -> eating -> socializing -> working ...
 * Each state's length is a per-type field in resources.json (seconds): stateWorking,
 * stateResting, stateRoaming, stateEating, stateSocializing; 0 = skipped. A citizen with no
 * state fields keeps the legacy behaviour and never cycles.
 *
 * Persistence: citizenState / citizenStateUntil / citizenTask / homeX / homeY ride on the NPC
 * record (save-single-npc) so a citizen picks up where it left off on re-entry, like a Farm
 * Animal's grazeEnd.
 *
 * "waiting" is NOT in the loop: when the player comes within `range` (line of sight), a
 * quest, trade or heal citizen stops where it is and waits, clock paused, until the player
 * leaves. Workers never wait.
 *
 * Workers (docs/citizens.md §2.1):
 *   working  Lumberjack: nearest tree -> chop -> collect the wood -> walk it to the Warehouse
 *            -> next tree, until the clock runs out; warehouse full = the state FAILS -> rest.
 *            Rancher: nearest ready Farm Animal -> collect; none ready -> next state.
 *            Farm Hand: nearest grown crop -> collect -> replant it on the same tile (seeds
 *            spent as when the player plants; repeatable crops replant themselves); none -> next.
 *            Crafter: nearest crafting station with a finished slot -> collect; none -> next.
 *   resting  route onto the worker's own slot (Farm Hand Slot …, the haybale) and stand, Zzz.
 *   roaming  leashed wander around home (Track 3a legs and pauses).
 *   eating   route to a random food doober (hp > 0) and eat it (a running cost); -> working.
 * Talkers (quest / trade / heal): working = anchored wander inside a short leash of their
 * template tile.
 *   socializing (§2.2): pick another citizen with a socializing length (not one that changed
 *            state in the last minute, not one already in a conversation, not one waiting on
 *            the player), walk to a tile on their row within 3 tiles, pull them into
 *            socializing too, and have the Talk conversation through the player's own
 *            conversation system (Relationships/Conversation.playNPCConversation: the same
 *            bubbles, topics and matching). The outcome moves the pair's relationship on the
 *            Player (`npcRelationships`, POST /api/npc-relationship), then both go to their
 *            next state. An unreachable partner is a failure; the third failure abandons the
 *            state. No partner about = wander and look again every few seconds.
 *
 * Work and eating run through the SAME client code the player and the Bulk commands use
 * (ResourceClicking.handleDooberClick / handleSourceConversion, NPCUtils.handleNPCClick,
 * BulkCrafting.executeBulkCrafting), so a citizen needs the live React context App registers
 * every render with setCitizenContext().
 */
import playersInGridManager from '../../GridState/PlayersInGrid';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import FloatingTextManager from '../../UI/FloatingText';
import { calculateDistance } from '../../Utils/worldHelpers';
import { isWallBlocking, updateGridResource } from '../../Utils/GridManagement';
import { hasRoomFor } from '../../Utils/InventoryManagement';
import { isACrop } from '../../Utils/ResourceHelpers';
import { handleDooberClick, handleSourceConversion } from '../../ResourceClicking';
import { handleNPCClick } from './NPCUtils';
import { handleFarmPlotPlacement } from '../Farming/Farming';
import { prepareBulkCraftingData, executeBulkCrafting } from '../FarmHands/BulkCrafting';
import { createCollectEffect } from '../../VFX/VFX';
import { startHeadlineEffect, stopHeadlineEffect } from '../../VFX/NPCVFX';
import { playNPCConversation } from '../Relationships/Conversation';
import ConversationManager from '../Relationships/ConversationManager';
import { getNPCRelationship, updateNPCRelationship } from '../Relationships/RelationshipUtils';
import soundManager from '../../Sound/SoundManager';

export const CITIZEN_ACTIONS = ['quest', 'trade', 'heal', 'worker'];
export const CITIZEN_STATES = ['working', 'resting', 'roaming', 'eating', 'socializing'];
const WAITS_FOR_PLAYER = ['quest', 'trade', 'heal'];
const WORKER_SLOT_FOR = { 'Farm Hand': 'Farm Hand Slot', Lumberjack: 'Lumberjack Slot', Rancher: 'Rancher Slot', Crafter: 'Crafter Slot' };
const TALKER_LEASH = 3;   // tiles a quest/trade/heal citizen wanders from its template tile
const ROAM_LEASH = 4;     // tiles a worker wanders from its slot while roaming
const EAT_FAIL_MS = 20000; // give up on a food target you cannot reach after this long
const SOCIAL_RANGE = 3;          // tiles: stand on the partner's row within this many tiles
const SOCIAL_RECENT_MS = 60000;  // skip a partner that changed state this recently (they may walk off)
const SOCIAL_FAILS = 3;          // the third failure abandons socializing
const SOCIAL_RETRY_MS = 5000;    // look for a partner again after this long with none about
const SOCIAL_APPROACH_MS = 45000; // a partner not reached in this long counts as a failure
const SOCIAL_TALK_CAP_MS = 60000; // a partner is never held in a conversation longer than this
const SOCIAL_BASE_CHANCE = 0.6;  // a citizen talk's base chance of going well (the player's Talk: 0.9)
const SOCIAL_SCORE = 8;          // the relationship moves this much either way (the player's Talk: 8)
// the player's Talk, when interactions.json is not loaded: 3 rounds, interest / random / people
const TALK_FALLBACK = { interaction: 'Talk', rounds: 3, chance: 0.9, relscoreresult: 8, playertopic1: 'interest', playertopic2: 'random', playertopic3: 'people', npctopic1: 'interest', npctopic2: 'random', npctopic3: 'people' };

const STATE_FIELD = { working: 'stateWorking', resting: 'stateResting', roaming: 'stateRoaming', eating: 'stateEating', socializing: 'stateSocializing' };
const HEADLINE = { resting: { type: 'Zzz' }, waiting: { type: 'question' }, eating: { type: 'emoji', emoji: '🍽️' } };

// ---------------------------------------------------------------- context from App
let ctx = null; // { currentPlayer, setCurrentPlayer, inventory, setInventory, backpack, setBackpack, resources, setResources, updateStatus, masterResources, masterSkills, masterInteractions, globalTuning, strings, TILE_SIZE, openPanel, masterTrophies }
let ctxWaiters = [];
export function setCitizenContext(next) {
  ctx = next;
  const waiting = ctxWaiters; ctxWaiters = [];
  waiting.forEach((resolve) => resolve());
}
/** Resolves on App's next render (or after `ms`), so ctx then carries any state set before. */
const nextContext = (ms = 500) => new Promise((resolve) => {
  const timer = setTimeout(resolve, ms);
  ctxWaiters.push(() => { clearTimeout(timer); resolve(); });
});
const noop = () => {};

export const isCitizen = (npc) => !!npc && CITIZEN_ACTIONS.includes(npc.action);
/**
 * Does this worker do its job on its own in the working state? The worker panel's
 * "Automatically work?" switch (npc.autoWork, saved on the NPC record). Unset = on, except the
 * Crafter: auto-collecting the stations would undo a player who restarts crafts with Bulk
 * Crafting (owner, 2026-10-09). Switched off, the worker stands by near home while working.
 */
export const workerAutoWorks = (npc) => (typeof npc?.autoWork === 'boolean' ? npc.autoWork : npc?.type !== 'Crafter');
export const stateSeconds = (npc, state) => Math.max(0, Number(npc?.[STATE_FIELD[state]]) || 0);
export const hasStateLoop = (npc) => CITIZEN_STATES.some((s) => stateSeconds(npc, s) > 0);

/** The next state in the loop with a non-zero length (wrapping), or null when none has one. */
export function nextCitizenState(npc, from) {
  const idx = CITIZEN_STATES.indexOf(from);
  // no current state: the loop starts at the first state with a length (working, normally)
  const order = idx < 0 ? CITIZEN_STATES : CITIZEN_STATES.slice(idx + 1).concat(CITIZEN_STATES.slice(0, idx + 1));
  return order.find((s) => stateSeconds(npc, s) > 0) || null;
}

/**
 * The headline the state calls for is up and follows the NPC. Called on every state change
 * AND every tick: a citizen that loads already resting (the state is persisted), or whose
 * grid change cleared every headline, never passes through enterCitizenState, so the tick
 * has to start it. Cheap when it is already up (NPCVFX just moves it).
 */
function setHeadline(npc, state) {
  const h = HEADLINE[state];
  if (h) startHeadlineEffect(npc.id, h.type, npc.position, { emoji: h.emoji });
  else stopHeadlineEffect(npc.id);
}

/** Persist the loop's position (state, clock, task, home) on the NPC record. */
function persist(npc, gridId) {
  NPCsInGridManager.updateNPC(gridId, npc.id, {
    citizenState: npc.citizenState, citizenStateUntil: npc.citizenStateUntil, citizenTask: npc.citizenTask || null,
    homeX: npc.homeX, homeY: npc.homeY, position: npc.position, state: npc.state,
  }).catch(() => {});
}

/** Enter a loop state now (resets its clock and task) and persist it. */
export function enterCitizenState(npc, state, gridId, now = Date.now()) {
  npc.citizenState = state;
  npc.citizenStateUntil = now + stateSeconds(npc, state) * 1000;
  npc.citizenStateAt = now; // memory only: "changed state recently" for partner choice
  npc.citizenTask = null;
  npc.path = null;
  setHeadline(npc, state);
  if (gridId) persist(npc, gridId);
}

/** Seconds left in the current loop state (Infinity while waiting / no loop). */
export function citizenSecondsLeft(npc, now = Date.now()) {
  if (!npc?.citizenStateUntil || npc.citizenState === 'waiting') return Infinity;
  return Math.max(0, (npc.citizenStateUntil - now) / 1000);
}

// ---------------------------------------------------------------- helpers
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const nearest = (from, list, pos = (r) => r) => {
  let best = null; let bestD = Infinity;
  for (const item of list) { const p = pos(item); if (!p) continue; const d = Math.hypot(p.x - from.x, p.y - from.y); if (d < bestD) { bestD = d; best = item; } }
  return best;
};
const masterOf = (type) => (ctx?.masterResources || []).find((r) => r.type === type);

/** The worker's home: its own slot on the grid, else the tile it stood on when first seen. */
function ensureHome(npc, gridId) {
  if (Number.isInteger(npc.homeX) && Number.isInteger(npc.homeY)) return { x: npc.homeX, y: npc.homeY };
  const slotType = WORKER_SLOT_FOR[npc.type];
  const resources = GlobalGridStateTilesAndResources.getResources() || [];
  const slot = slotType ? nearest(npc.position, resources.filter((r) => r.type === slotType)) : null;
  npc.homeX = slot ? slot.x : Math.floor(npc.position.x);
  npc.homeY = slot ? slot.y : Math.floor(npc.position.y);
  persist(npc, gridId);
  return { x: npc.homeX, y: npc.homeY };
}

/** Walk one step along a path to (x, y); 'arrived' | 'moving' | 'blocked'. */
function walkTo(npc, x, y, tiles, resources, npcs, { stopShort = false } = {}) {
  return npc.followPath(x, y, tiles, resources, npcs, { stopShort });
}

function setTask(npc, gridId, task) { npc.citizenTask = task; npc.path = null; persist(npc, gridId); }

// ---------------------------------------------------------------- work by worker type

function findTree(npc) {
  const resources = GlobalGridStateTilesAndResources.getResources() || [];
  const trees = resources.filter((r) => r && r.action === 'convertTo' && r.requires === 'Axe');
  return nearest(npc.position, trees);
}
function findReadyAnimal(npc, gridId) {
  const animals = Object.values(NPCsInGridManager.getNPCsInGrid(gridId) || {}).filter((n) => n && n.action === 'graze' && n.state === 'processing');
  return nearest(npc.position, animals, (n) => n.position);
}
function findReadyCrop(npc) {
  const resources = GlobalGridStateTilesAndResources.getResources() || [];
  const crops = resources.filter((r) => r && r.category === 'doober' && isACrop(r.type, ctx?.masterResources || []));
  return nearest(npc.position, crops);
}
function findReadyStation(npc) {
  if (!ctx) return null;
  const hasSkill = (req) => !req || (ctx.currentPlayer?.skills || []).some((s) => s.type === req);
  const stations = prepareBulkCraftingData(ctx.masterResources, ctx.inventory, ctx.backpack, ctx.currentPlayer, hasSkill) || [];
  return nearest(npc.position, stations.filter((s) => s.readySlots?.length));
}
function findFood(npc) {
  const resources = GlobalGridStateTilesAndResources.getResources() || [];
  const food = resources.filter((r) => r && r.category === 'doober' && (masterOf(r.type)?.hp || 0) > 0);
  if (!food.length) return null;
  return food[Math.floor(Math.random() * food.length)];
}
function findWarehouse() {
  const resources = GlobalGridStateTilesAndResources.getResources() || [];
  return resources.find((r) => r && r.type === 'Warehouse') || null;
}

/** The player-side calls, handed the live React context (a worker acts for the player). */
async function chopTree(tree, gridId) {
  const c = ctx; if (!c) return false;
  await handleSourceConversion(tree, tree.y, tree.x, GlobalGridStateTilesAndResources.getResources(), c.setResources, c.inventory, c.setInventory, c.backpack, c.setBackpack,
    gridId, FloatingTextManager.addFloatingText, c.TILE_SIZE, c.currentPlayer, c.setCurrentPlayer, c.masterResources, c.masterSkills, noop, noop, c.updateStatus, c.strings);
  return true;
}
async function collectDoober(doober, gridId) {
  const c = ctx; if (!c) return false;
  await handleDooberClick(doober, doober.y, doober.x, GlobalGridStateTilesAndResources.getResources(), c.setResources, c.setInventory, c.setBackpack, c.inventory, c.backpack,
    c.currentPlayer?.skills || [], gridId, FloatingTextManager.addFloatingText, c.TILE_SIZE, c.currentPlayer, c.setCurrentPlayer, c.updateStatus, c.masterResources, c.masterSkills, c.strings, noop, c.globalTuning, c.masterTrophies);
  return true;
}
/**
 * Replant the crop a worker just harvested, on the same tile, through the player's own
 * planting path (Farming.handleFarmPlotPlacement: the seed / ingredient cost is spent, the
 * grow timer starts, the server confirms or it rolls back). A repeatable crop has already
 * been replanted for free by handleDooberClick, so it is skipped. A crop's plot costs that
 * crop, so the one just harvested always pays for it: the replant waits for App's next render
 * so `ctx.inventory` already holds it. Short anyway (the edge case): the replant fails, the
 * tile stays empty and the Farm Hand moves on.
 */
async function replantCrop(crop, gridId) {
  await nextContext();
  const c = ctx; if (!c) return false;
  const master = c.masterResources || [];
  if (crop.repeatable === true || masterOf(crop.type)?.repeatable === true) return true;
  const plot = master.find((r) => r.category === 'farmplot' && r.output === crop.type);
  if (!plot) return false;
  return handleFarmPlotPlacement({
    selectedItem: plot, TILE_SIZE: c.TILE_SIZE, resources: GlobalGridStateTilesAndResources.getResources() || [], setResources: c.setResources,
    currentPlayer: c.currentPlayer, setCurrentPlayer: c.setCurrentPlayer, inventory: c.inventory || [], setInventory: c.setInventory,
    backpack: c.backpack || [], setBackpack: c.setBackpack, gridId, masterResources: master, masterSkills: c.masterSkills,
    updateStatus: c.updateStatus || noop, overridePosition: { x: crop.x, y: crop.y }, strings: c.strings,
  });
}
async function collectAnimal(animal, gridId) {
  const c = ctx; if (!c) return false;
  await handleNPCClick(animal, Math.floor(animal.position.y), Math.floor(animal.position.x), c.setInventory, c.setBackpack, c.setResources, c.currentPlayer, c.setCurrentPlayer,
    c.TILE_SIZE, c.masterResources, c.masterSkills, gridId, noop, noop, c.updateStatus, noop, noop, c.strings, c.masterTrophies, c.globalTuning);
  return true;
}
async function collectStation(station, gridId) {
  const c = ctx; if (!c) return false;
  const selectedSlots = {};
  for (const slot of station.readySlots) selectedSlots[`${station.x}-${station.y}-${slot.slotIndex}`] = { collect: true, restart: false };
  const result = await executeBulkCrafting({
    stationGroups: [station], selectedSlots, hasBulkRestartCraft: false, currentPlayer: c.currentPlayer, setCurrentPlayer: c.setCurrentPlayer,
    inventory: c.inventory, setInventory: c.setInventory, backpack: c.backpack, setBackpack: c.setBackpack, setResources: c.setResources, gridId,
    masterResources: c.masterResources, masterSkills: c.masterSkills, strings: c.strings, updateStatus: c.updateStatus, globalTuning: c.globalTuning,
  });
  return !!result?.success;
}
function warehouseHasRoom(type, qty = 1) {
  const c = ctx; if (!c) return true;
  const resource = masterOf(type); if (!resource) return true;
  return hasRoomFor({ resource, quantity: qty, currentPlayer: c.currentPlayer, inventory: c.inventory, backpack: c.backpack, masterResources: c.masterResources, globalTuning: c.globalTuning });
}

/**
 * One tick of a worker's working state. Returns 'busy' (keep working), 'done' (nothing left:
 * move to the next state) or 'failed' (the warehouse is full: rest).
 */
async function workTick(npc, gridId, tiles, resources, npcs) {
  const task = npc.citizenTask || {};
  switch (npc.type) {
    case 'Lumberjack': {
      if (task.phase === 'toWarehouse') {
        const wh = findWarehouse();
        if (!wh) { setTask(npc, gridId, null); return 'busy'; }
        const r = walkTo(npc, wh.x, wh.y, tiles, resources, npcs);
        if (r === 'arrived' || r === 'blocked') setTask(npc, gridId, null); // next tree
        return 'busy';
      }
      if (task.phase === 'collect') {
        const doober = (GlobalGridStateTilesAndResources.getResources() || []).find((d) => d && d.category === 'doober' && d.x === task.x && d.y === task.y);
        if (!doober) { setTask(npc, gridId, null); return 'busy'; } // someone else took it
        const r = walkTo(npc, doober.x, doober.y, tiles, resources, npcs);
        if (r === 'arrived') { await collectDoober(doober, gridId); setTask(npc, gridId, { phase: 'toWarehouse' }); }
        else if (r === 'blocked') setTask(npc, gridId, null);
        return 'busy';
      }
      // find / walk to a tree
      let tree = task.phase === 'toTree' ? (GlobalGridStateTilesAndResources.getResources() || []).find((t) => t && t.x === task.x && t.y === task.y && t.action === 'convertTo') : null;
      if (!tree) { tree = findTree(npc); if (!tree) return 'busy'; setTask(npc, gridId, { phase: 'toTree', x: tree.x, y: tree.y }); }
      const r = walkTo(npc, tree.x, tree.y, tiles, resources, npcs);
      if (r === 'blocked') { setTask(npc, gridId, null); return 'busy'; }
      if (r !== 'arrived') return 'busy';
      if (!warehouseHasRoom(tree.output || 'Wood', masterOf(tree.output || 'Wood')?.qtycollected || 1)) return 'failed';
      await chopTree(tree, gridId);
      setTask(npc, gridId, { phase: 'collect', x: tree.x, y: tree.y });
      return 'busy';
    }
    case 'Rancher': {
      const animal = findReadyAnimal(npc, gridId);
      if (!animal) return 'done';
      if (!warehouseHasRoom(masterOf(animal.type)?.output)) return 'failed';
      const r = walkTo(npc, Math.floor(animal.position.x), Math.floor(animal.position.y), tiles, resources, npcs, { stopShort: true });
      if (r === 'arrived') await collectAnimal(animal, gridId);
      return 'busy';
    }
    case 'Farm Hand': {
      const crop = findReadyCrop(npc);
      if (!crop) return 'done';
      if (!warehouseHasRoom(crop.type, crop.qtycollected || 1)) return 'failed';
      const r = walkTo(npc, crop.x, crop.y, tiles, resources, npcs);
      if (r === 'arrived') {
        // each harvest is followed at once by a replant of the same crop on the same tile
        const harvested = { x: crop.x, y: crop.y, type: crop.type, repeatable: crop.repeatable };
        await collectDoober(crop, gridId);
        await replantCrop(harvested, gridId);
      }
      else if (r === 'blocked') return 'done';
      return 'busy';
    }
    case 'Crafter': {
      const station = findReadyStation(npc);
      if (!station) return 'done';
      const r = walkTo(npc, station.x, station.y, tiles, resources, npcs, { stopShort: true });
      if (r === 'arrived') { const ok = await collectStation(station, gridId); if (!ok) return 'failed'; }
      else if (r === 'blocked') return 'done';
      return 'busy';
    }
    default:
      return 'busy';
  }
}

async function eatTick(npc, gridId, tiles, resources, npcs, now) {
  const task = npc.citizenTask || {};
  let food = task.x != null ? (GlobalGridStateTilesAndResources.getResources() || []).find((d) => d && d.x === task.x && d.y === task.y && d.category === 'doober') : null;
  if (!food) { food = findFood(npc); if (!food) return 'busy'; setTask(npc, gridId, { x: food.x, y: food.y, since: now }); }
  if (task.since && now - task.since > EAT_FAIL_MS) { setTask(npc, gridId, null); return 'busy'; }
  const r = walkTo(npc, food.x, food.y, tiles, resources, npcs);
  if (r === 'blocked') { setTask(npc, gridId, null); return 'busy'; }
  if (r !== 'arrived') return 'busy';
  // eat it: the doober is gone (a running cost of keeping the citizen)
  createCollectEffect(food.x, food.y, ctx?.TILE_SIZE || 45);
  soundManager.playSFX('collect_crop');
  const remaining = (GlobalGridStateTilesAndResources.getResources() || []).filter((d) => !(d && d.x === food.x && d.y === food.y && d.type === food.type));
  GlobalGridStateTilesAndResources.setResources(remaining);
  if (ctx?.setResources) ctx.setResources((prev) => prev.filter((d) => !(d && d.x === food.x && d.y === food.y && d.type === food.type)));
  updateGridResource(gridId, { type: null, x: food.x, y: food.y }).catch(() => {});
  return 'done';
}

// ---------------------------------------------------------------- socializing (docs/citizens.md §2.2)

const liveConversations = new Set(); // { npc, partnerId, control }

/** Another citizen this one could go and talk to right now. */
function canBePartner(me, n, now) {
  if (!n || n.id === me.id || !isCitizen(n) || stateSeconds(n, 'socializing') <= 0) return false;
  if (n.citizenState === 'waiting') return false; // (citizens carry no hp)
  if (n.citizenTask?.partnerId) return false; // already in (or walking to) a conversation
  if (n.citizenStateAt && now - n.citizenStateAt < SOCIAL_RECENT_MS) return false;
  return true;
}

/** A partner: one of the three nearest eligible citizens, not one already tried this state. */
function pickPartner(me, npcs, now, tried = []) {
  const options = npcs.filter((n) => canBePartner(me, n, now) && !tried.includes(n.id))
    .map((n) => ({ n, d: Math.hypot(n.position.x - me.position.x, n.position.y - me.position.y) }))
    .sort((a, b) => a.d - b.d).slice(0, 3);
  return options.length ? options[Math.floor(Math.random() * options.length)].n : null;
}

/** Where to stand to talk: the partner's row, 2 tiles away on my side (then 1, then 3); else any free tile nearby. */
function meetTile(me, partner, tiles, resources, npcs) {
  const px = Math.floor(partner.position.x); const py = Math.floor(partner.position.y);
  const side = Math.sign(Math.floor(me.position.x) - px) || (Math.random() < 0.5 ? -1 : 1);
  const free = (x, y) => me.terrainOpen(x, y, tiles, resources) && !npcs.some((n) => n && n.id !== me.id && Math.floor(n.position?.x) === x && Math.floor(n.position?.y) === y);
  for (const d of [2, 1, 3]) for (const sgn of [side, -side]) { const x = px + sgn * d; if (free(x, py)) return { x, y: py }; }
  for (let r = 1; r <= 2; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (free(px + dx, py + dy)) return { x: px + dx, y: py + dy }; }
  return null;
}

/** In talking position: on the partner's row within range, or right next to them. */
const inTalkRange = (me, partner) => {
  const dx = Math.abs(Math.floor(me.position.x) - Math.floor(partner.position.x));
  const dy = Math.abs(Math.floor(me.position.y) - Math.floor(partner.position.y));
  return (dy === 0 && dx <= SOCIAL_RANGE) || (dx <= 1 && dy <= 1);
};

const faceEachOther = (a, b) => {
  const dx = Math.floor(b.position.x) - Math.floor(a.position.x);
  if (dx) { a.facing = dx > 0 ? 1 : -1; b.facing = dx > 0 ? -1 : 1; }
};

/**
 * Start the conversation: the partner is pulled into socializing (held for the talk, capped),
 * the Talk plays through the conversation system, and the outcome moves the pair's
 * relationship. Resolves when both are free to move on.
 */
function startConversation(me, partner, gridId, now) {
  const c = ctx;
  enterCitizenState(partner, 'socializing', gridId, now);
  partner.citizenStateUntil = now + SOCIAL_TALK_CAP_MS;
  setTask(partner, gridId, { phase: 'partner', partnerId: me.id });
  setTask(me, gridId, { ...(me.citizenTask || {}), phase: 'talk', partnerId: partner.id });
  faceEachOther(me, partner);

  const control = { aborted: false };
  const live = { npc: me, partnerId: partner.id, control };
  liveConversations.add(live);
  const interaction = (c?.masterInteractions || []).find((i) => i.interaction === 'Talk') || TALK_FALLBACK;
  const rel = getNPCRelationship(c?.currentPlayer, me.type, partner.type);
  const promise = playNPCConversation({
    initiatorType: me.type, partnerType: partner.type, initiatorEmoji: me.symbol, partnerEmoji: partner.symbol,
    interaction, masterResources: c?.masterResources, relscore: rel.relscore, control,
  }).then(({ aborted, results }) => {
    liveConversations.delete(live);
    if (aborted || !c?.currentPlayer) return;
    // the roll: the player's Talk rules (matches help, rivals hurt), plus how they already feel
    let chance = SOCIAL_BASE_CHANCE + 0.1 * results.matchingTopics - 0.15 * results.rivalTopics;
    if (rel.love) chance += 0.25; else if (rel.friend) chance += 0.15;
    if (rel.rival) chance -= 0.15;
    const success = Math.random() <= Math.max(0.05, Math.min(1, chance));
    const delta = success ? SOCIAL_SCORE : -SOCIAL_SCORE;
    ConversationManager.showOutcome(me.type, success);
    ConversationManager.showOutcome(partner.type, success);
    updateNPCRelationship(c.currentPlayer, me.type, partner.type, delta).then((r) => {
      if (r.success && r.npcRelationships && c.setCurrentPlayer) c.setCurrentPlayer((prev) => (prev ? { ...prev, npcRelationships: r.npcRelationships } : prev));
    });
  }).catch(() => liveConversations.delete(live));
  live.promise = promise;
  return promise;
}

/** Release a partner this citizen pulled into a conversation (they go to their next state). */
function releasePartner(me, gridId, npcs, now) {
  const partner = npcs.find((n) => n && n.id === me.citizenTask?.partnerId);
  if (partner && partner.citizenState === 'socializing' && partner.citizenTask?.phase === 'partner' && partner.citizenTask.partnerId === me.id) {
    enterCitizenState(partner, nextCitizenState(partner, 'socializing') || 'working', gridId, now);
  }
}

/** This citizen is done with its conversation, whichever side it was on: free the other one. */
function leaveConversation(me, gridId, npcs, now) {
  for (const live of liveConversations) if (live.npc === me || live.partnerId === me.id) live.control.aborted = true;
  if (me.citizenTask?.phase === 'partner') {
    // I was pulled in: the initiator's conversation is aborted above; it moves on by itself
    ConversationManager.removeSpeech(me.type);
  } else {
    releasePartner(me, gridId, npcs, now);
  }
  me.citizenTask = null;
}

/** Everything off (grid change): no bubbles, no outcomes for citizens that are no longer here. */
export function abortAllConversations() {
  for (const live of liveConversations) live.control.aborted = true;
  liveConversations.clear();
}

/** One tick of socializing; 'busy' or 'done' (talked, or gave up). */
async function socialTick(me, gridId, tiles, resources, npcs, now, home) {
  const task = me.citizenTask || { phase: 'seek', failures: 0, tried: [] };
  const fail = () => {
    const failures = (task.failures || 0) + 1;
    if (failures >= SOCIAL_FAILS) { setTask(me, gridId, null); return 'done'; }
    setTask(me, gridId, { phase: 'seek', failures, tried: [...(task.tried || []), task.partnerId].filter(Boolean), retryAt: now + 1000 });
    return 'busy';
  };
  const partner = task.partnerId ? npcs.find((n) => n && n.id === task.partnerId) : null;

  switch (task.phase) {
    case 'partner': {
      // pulled into someone else's conversation: stand still until they let go (or the cap)
      const initiator = partner;
      if (!initiator || initiator.citizenTask?.partnerId !== me.id) { setTask(me, gridId, null); return 'done'; }
      return 'busy';
    }
    case 'talk': {
      const mine = [...liveConversations].find((l) => l.npc === me);
      if (mine) return 'busy'; // talking
      releasePartner(me, gridId, npcs, now); // the talk ended (or never survived a reload)
      setTask(me, gridId, null);
      return 'done';
    }
    case 'approach': {
      // the partner walked off the board, is waiting on the player, or got taken by someone else
      const lost = !partner || partner.citizenState === 'waiting' || (partner.citizenTask?.partnerId && partner.citizenTask.partnerId !== me.id);
      if (lost) return fail();
      if (now - (task.since || now) > SOCIAL_APPROACH_MS) return fail();
      if (inTalkRange(me, partner)) { startConversation(me, partner, gridId, now); return 'busy'; } // runs on its own; 'talk' waits on it
      const tile = meetTile(me, partner, tiles, resources, npcs);
      if (!tile) return fail();
      const r = walkTo(me, tile.x, tile.y, tiles, resources, npcs);
      if (r === 'blocked') return fail();
      if (r === 'arrived') me.path = null; // they moved since: re-aim next tick
      return 'busy';
    }
    default: { // seek
      if (task.retryAt && now < task.retryAt) { me.leash = { home, radius: TALKER_LEASH }; await me.handleRoamState(tiles, resources, npcs, () => {}); return 'busy'; }
      const pick = pickPartner(me, npcs, now, task.tried || []);
      if (!pick) {
        // nobody about: wander near home and look again in a while
        setTask(me, gridId, { ...task, phase: 'seek', retryAt: now + SOCIAL_RETRY_MS });
        return 'busy';
      }
      setTask(me, gridId, { phase: 'approach', partnerId: pick.id, failures: task.failures || 0, tried: task.tried || [], since: now });
      return 'busy';
    }
  }
}

// ---------------------------------------------------------------- the brain
async function handleCitizenBehavior(gridId, TILE_SIZE) {
  const now = Date.now();
  const tiles = GlobalGridStateTilesAndResources.getTiles();
  const resources = GlobalGridStateTilesAndResources.getResources();
  const npcs = Object.values(NPCsInGridManager.getNPCsInGrid(gridId) || {});
  if (!tiles || !resources) return;
  const isWorker = this.action === 'worker';

  // ---- waiting: the player is near a quest/trade/heal citizen
  if (WAITS_FOR_PLAYER.includes(this.action)) {
    const pc = Object.values(playersInGridManager.getPlayersInGrid(gridId) || {})[0];
    const near = !!pc && pc.hp > 0 && calculateDistance(pc.position, this.position) <= (this.range || 3) && !isWallBlocking(this.position, pc.position, { trees: true });
    if (near) {
      if (this.citizenState !== 'waiting') {
        if (this.citizenState === 'socializing') leaveConversation(this, gridId, npcs, now); // the player comes first
        this.citizenResume = { state: this.citizenState, remainingMs: Math.max(0, (this.citizenStateUntil || now) - now) };
        this.citizenState = 'waiting';
        this.path = null;
        setHeadline(this, 'waiting');
      }
      setHeadline(this, 'waiting');
      return;
    }
    if (this.citizenState === 'waiting') {
      const r = this.citizenResume || {};
      if (r.state && hasStateLoop(this)) {
        this.citizenState = r.state;
        this.citizenStateUntil = now + (r.remainingMs || 0);
        setHeadline(this, r.state);
      } else {
        this.citizenState = null;
        stopHeadlineEffect(this.id);
      }
      this.citizenResume = null;
    }
  }

  // ---- no loop defined for this type: legacy behaviour
  if (!hasStateLoop(this)) {
    switch (this.action) {
      case 'quest': return this.handleQuestGiverBehavior(gridId);
      case 'trade': return this.handleTraderBehavior(gridId);
      case 'heal': return this.handleHealBehavior(gridId);
      default: return undefined;
    }
  }

  // ---- the loop's clock
  const home = ensureHome(this, gridId);
  if (!this.citizenState || !CITIZEN_STATES.includes(this.citizenState) || now >= (this.citizenStateUntil || 0)) {
    enterCitizenState(this, nextCitizenState(this, this.citizenState) || 'working', gridId, now);
  }
  setHeadline(this, this.citizenState); // started here too: a resumed state never entered via enterCitizenState

  // ---- inside the state
  switch (this.citizenState) {
    case 'working': {
      if (!isWorker) { // talkers: anchored wander inside a short leash of the template tile
        this.leash = { home, radius: TALKER_LEASH };
        return this.handleRoamState(tiles, resources, npcs, () => {});
      }
      if (!workerAutoWorks(this)) { // switched off in its panel: stand by near home
        this.leash = { home, radius: ROAM_LEASH };
        return this.handleRoamState(tiles, resources, npcs, () => {});
      }
      const result = await workTick(this, gridId, tiles, resources, npcs);
      if (result === 'failed') { enterCitizenState(this, 'resting', gridId, now); return undefined; }
      if (result === 'done') { enterCitizenState(this, nextCitizenState(this, 'working') || 'working', gridId, now); }
      return undefined;
    }
    case 'resting': {
      // route onto the slot / home tile, then stand (Zzz)
      if (cheb(this.position, home) === 0) return undefined;
      walkTo(this, home.x, home.y, tiles, resources, npcs);
      return undefined;
    }
    case 'roaming': {
      this.leash = { home, radius: ROAM_LEASH };
      return this.handleRoamState(tiles, resources, npcs, () => {});
    }
    case 'eating': {
      const result = await eatTick(this, gridId, tiles, resources, npcs, now);
      if (result === 'done') enterCitizenState(this, 'working', gridId, now); // fed early: straight back to work
      return undefined;
    }
    case 'socializing': {
      const result = await socialTick(this, gridId, tiles, resources, npcs, now, home);
      if (result === 'done') enterCitizenState(this, nextCitizenState(this, 'socializing') || 'working', gridId, now);
      return undefined;
    }
    default:
      return undefined;
  }
}

export function attachCitizenBehavior(NPC) {
  NPC.prototype.handleCitizenBehavior = handleCitizenBehavior;
}
