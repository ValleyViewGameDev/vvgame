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
 *            Farm Hand: nearest grown crop -> collect; none -> next state.
 *            Crafter: nearest crafting station with a finished slot -> collect; none -> next.
 *   resting  route onto the worker's own slot (Farm Hand Slot …, the haybale) and stand, Zzz.
 *   roaming  leashed wander around home (Track 3a legs and pauses).
 *   eating   route to a random food doober (hp > 0) and eat it (a running cost); -> working.
 * Talkers (quest / trade / heal): working = anchored wander inside a short leash of their
 * template tile. Socializing (§2.2) is not built yet: it currently behaves like working.
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
import { prepareBulkCraftingData, executeBulkCrafting } from '../FarmHands/BulkCrafting';
import { createCollectEffect } from '../../VFX/VFX';
import { startHeadlineEffect, stopHeadlineEffect, updateHeadlineEffectPosition } from '../../VFX/NPCVFX';
import soundManager from '../../Sound/SoundManager';

export const CITIZEN_ACTIONS = ['quest', 'trade', 'heal', 'worker'];
export const CITIZEN_STATES = ['working', 'resting', 'roaming', 'eating', 'socializing'];
const WAITS_FOR_PLAYER = ['quest', 'trade', 'heal'];
const WORKER_SLOT_FOR = { 'Farm Hand': 'Farm Hand Slot', Lumberjack: 'Lumberjack Slot', Rancher: 'Rancher Slot', Crafter: 'Crafter Slot', Farmer: 'Farm Hand Slot' };
const TALKER_LEASH = 3;   // tiles a quest/trade/heal citizen wanders from its template tile
const ROAM_LEASH = 4;     // tiles a worker wanders from its slot while roaming
const EAT_FAIL_MS = 20000; // give up on a food target you cannot reach after this long

const STATE_FIELD = { working: 'stateWorking', resting: 'stateResting', roaming: 'stateRoaming', eating: 'stateEating', socializing: 'stateSocializing' };
const HEADLINE = { resting: { type: 'Zzz' }, waiting: { type: 'emoji', emoji: '💬' }, eating: { type: 'emoji', emoji: '🍽️' } };

// ---------------------------------------------------------------- context from App
let ctx = null; // { currentPlayer, setCurrentPlayer, inventory, setInventory, backpack, setBackpack, resources, setResources, updateStatus, masterResources, masterSkills, globalTuning, strings, TILE_SIZE, openPanel, masterTrophies }
export function setCitizenContext(next) { ctx = next; }
const noop = () => {};

export const isCitizen = (npc) => !!npc && CITIZEN_ACTIONS.includes(npc.action);
export const stateSeconds = (npc, state) => Math.max(0, Number(npc?.[STATE_FIELD[state]]) || 0);
export const hasStateLoop = (npc) => CITIZEN_STATES.some((s) => stateSeconds(npc, s) > 0);

/** The next state in the loop with a non-zero length (wrapping), or null when none has one. */
export function nextCitizenState(npc, from) {
  const idx = CITIZEN_STATES.indexOf(from);
  // no current state: the loop starts at the first state with a length (working, normally)
  const order = idx < 0 ? CITIZEN_STATES : CITIZEN_STATES.slice(idx + 1).concat(CITIZEN_STATES.slice(0, idx + 1));
  return order.find((s) => stateSeconds(npc, s) > 0) || null;
}

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
    case 'Farm Hand':
    case 'Farmer': {
      const crop = findReadyCrop(npc);
      if (!crop) return 'done';
      if (!warehouseHasRoom(crop.type, crop.qtycollected || 1)) return 'failed';
      const r = walkTo(npc, crop.x, crop.y, tiles, resources, npcs);
      if (r === 'arrived') await collectDoober(crop, gridId);
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
        this.citizenResume = { state: this.citizenState, remainingMs: Math.max(0, (this.citizenStateUntil || now) - now) };
        this.citizenState = 'waiting';
        this.path = null;
        setHeadline(this, 'waiting');
      }
      updateHeadlineEffectPosition(this.id, this.position);
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
  updateHeadlineEffectPosition(this.id, this.position);

  // ---- inside the state
  switch (this.citizenState) {
    case 'working': {
      if (!isWorker) { // talkers: anchored wander inside a short leash of the template tile
        this.leash = { home, radius: TALKER_LEASH };
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
      // not built yet (docs/citizens.md §2.2): behaves like working for talkers
      this.leash = { home, radius: TALKER_LEASH };
      return this.handleRoamState(tiles, resources, npcs, () => {});
    }
    default:
      return undefined;
  }
}

export function attachCitizenBehavior(NPC) {
  NPC.prototype.handleCitizenBehavior = handleCitizenBehavior;
}
