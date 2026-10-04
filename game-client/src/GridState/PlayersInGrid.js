import API_BASE from '../config';
import axios from 'axios';
import { animateRemotePC } from '../Render/RenderAnimatePosition';
import { loadMasterResources } from '../Utils/TuningManager';

/**
 * Single-PC store (docs/phase-3-contract.md §1).
 *
 * Only the local player ever lives in this map. The read contract is unchanged
 * for the ~40 call sites: `getPlayersInGrid(gridId)` / `getAllPCs(gridId)`
 * return `{ [playerId]: pc }` keyed by gridId, containing one record.
 *
 * The record is built from the Player document (`location.x/y`, `hp`, `maxhp`,
 * derived combat stats from `base*` + equipped powers), never from the grid
 * bundle. Position + hp/maxhp persist to `POST /api/player/state`:
 *   - every PERSIST_INTERVAL_MS while dirty
 *   - `flushState()` on grid leave and right after arrival
 *   - a synchronous XHR on `beforeunload`
 * `updatePC` also mirrors x/y/hp/maxhp into the localStorage `player`.
 */

const PERSIST_INTERVAL_MS = 30000;
// After the last step of a movement burst, persist this soon (one POST per burst, so a
// refresh a few seconds after walking somewhere finds the player where they stopped)
const SETTLE_FLUSH_MS = 2000;
const GRID_MAX_COORD = 63;
// While a key is held the store changes every ~90 ms. React (App.js) and localStorage only
// need to catch up every so often; the renderer reads the store directly (PixiRendererPCs).
const REACT_SYNC_THROTTLE_MS = 150;
const LOCALSTORAGE_MIRROR_DEBOUNCE_MS = 1000;

const DEFAULT_PC_RECORD_FIELDS = {
  hp: 25,
  maxhp: 25,
  armorclass: 10,
  attackbonus: 0,
  damage: 1,
  attackrange: 1,
  speed: 1,
};

const COMBAT_ATTRIBUTES = ['hp', 'maxhp', 'damage', 'armorclass', 'attackbonus', 'attackrange', 'speed'];

/**
 * Build the in-grid PC record from whatever shape the caller has
 * (a Player document, a previous PC record, or a hand-built payload).
 */
function buildPCRecord(playerId, pcData = {}, now = Date.now()) {
  return {
    playerId: String(pcData.playerId || playerId),
    username: pcData.username,
    type: 'pc',
    icon: pcData.icon,
    position: pcData.position || { x: 0, y: 0 },
    hp: pcData.hp ?? DEFAULT_PC_RECORD_FIELDS.hp,
    maxhp: pcData.maxhp ?? DEFAULT_PC_RECORD_FIELDS.maxhp,
    armorclass: pcData.armorclass ?? DEFAULT_PC_RECORD_FIELDS.armorclass,
    attackbonus: pcData.attackbonus ?? DEFAULT_PC_RECORD_FIELDS.attackbonus,
    damage: pcData.damage ?? DEFAULT_PC_RECORD_FIELDS.damage,
    attackrange: pcData.attackrange ?? DEFAULT_PC_RECORD_FIELDS.attackrange,
    speed: pcData.speed ?? DEFAULT_PC_RECORD_FIELDS.speed,
    iscamping: pcData.iscamping || false,
    isinboat: pcData.isinboat || false,
    lastUpdated: pcData.lastUpdated || now,
  };
}

/**
 * Combat-stat modifiers from powers: equipped weapon/armor + every magic
 * enhancement. Returns `{ [attr]: total }`.
 */
function powerModifiers(player, masterResources) {
  const modifiers = {};
  const equippedWeapon = player.settings?.equippedWeapon || null;
  const equippedArmor = player.settings?.equippedArmor || null;

  const isWeapon = (resource) => resource.passable === true && typeof resource.damage === 'number' && resource.damage > 0;
  const isArmor = (resource) => resource.passable === true && typeof resource.armorclass === 'number' && resource.armorclass > 0;
  const isMagicEnhancement = (resource) => !isWeapon(resource) && !isArmor(resource);

  (player.powers || []).forEach((power) => {
    const resource = masterResources.find((r) => r.type === power.type);
    if (!resource || resource.category !== 'power') return;
    const powerQty = power.quantity || 0;
    const shouldCount = isMagicEnhancement(resource) ||
      (isWeapon(resource) && power.type === equippedWeapon) ||
      (isArmor(resource) && power.type === equippedArmor);
    if (!shouldCount) return;
    COMBAT_ATTRIBUTES.forEach((attr) => {
      if (typeof resource[attr] === 'number') {
        modifiers[attr] = (modifiers[attr] || 0) + powerQty * resource[attr];
      }
    });
  });
  return modifiers;
}

/**
 * Resolve the local player's id: an explicit argument wins, otherwise the
 * `player` record in localStorage (the same source App.js / index.js use).
 */
function resolveLocalPlayerId(playerId) {
  if (playerId) return String(playerId);
  try {
    const stored = JSON.parse(localStorage.getItem('player') || 'null');
    const id = stored?._id || stored?.playerId;
    return id ? String(id) : null;
  } catch (err) {
    return null;
  }
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clampCoord = (v) => Math.max(0, Math.min(GRID_MAX_COORD, Math.round(v)));

class GridStatePCManager {
  constructor() {
    this.playersInGrid = {}; // { [gridId]: { pcs: { [playerId]: pc }, playersInGridLastUpdated } }
    this.localPlayerId = null;
    this.dirty = false;
    this.persistInterval = null;
    this.inflightFlush = null;
    this.unloadListenerAdded = false;
    this.lastReactSync = 0;
    this.reactSyncTimer = null;
    this.mirrorTimer = null;
    this.pendingMirror = null;
    this.settleTimer = null;
  }

  registerSetPlayersInGrid(setter) {
    this.setPlayersInGridReact = setter;
  }

  registerTileSize(tileSize) {
    this.tileSize = tileSize;
  }

  // ---------------------------------------------------------------------------
  // React mirror
  // ---------------------------------------------------------------------------

  /** Position-only updates come at step rate; coalesce them for React. */
  syncReactThrottled(gridId) {
    const now = Date.now();
    const elapsed = now - this.lastReactSync;
    if (elapsed >= REACT_SYNC_THROTTLE_MS) {
      if (this.reactSyncTimer) { clearTimeout(this.reactSyncTimer); this.reactSyncTimer = null; }
      this.syncReact(gridId);
      return;
    }
    if (this.reactSyncTimer) return;
    this.reactSyncTimer = setTimeout(() => {
      this.reactSyncTimer = null;
      this.syncReact(gridId);
    }, REACT_SYNC_THROTTLE_MS - elapsed);
  }

  /** Push any coalesced position update to React now (movement stopped, grid about to change). */
  flushReactSync() {
    if (!this.reactSyncTimer) return;
    clearTimeout(this.reactSyncTimer);
    this.reactSyncTimer = null;
    for (const gridId of Object.keys(this.playersInGrid)) this.syncReact(gridId);
  }

  syncReact(gridId, { replace = false } = {}) {
    if (!this.setPlayersInGridReact) return;
    this.lastReactSync = Date.now();
    const pcs = { ...(this.playersInGrid[gridId]?.pcs || {}) };
    const entry = { pcs, playersInGridLastUpdated: Date.now() };
    this.setPlayersInGridReact((prev) => (
      replace
        ? { [gridId]: entry }
        : { ...prev, [gridId]: { ...(prev[gridId] || {}), ...entry } }
    ));
  }

  ensureGridEntry(gridId) {
    if (!this.playersInGrid[gridId]) {
      this.playersInGrid[gridId] = {
        pcs: {},
        playersInGridLastUpdated: Date.now(),
      };
    }
    return this.playersInGrid[gridId];
  }

  /** The local player's live record (whichever grid holds it), or null. */
  getLocalRecord() {
    const id = this.localPlayerId;
    if (!id) return null;
    for (const entry of Object.values(this.playersInGrid)) {
      if (entry?.pcs?.[id]) return entry.pcs[id];
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Persistence: POST /api/player/state { playerId, x, y, hp, maxhp }
  // ---------------------------------------------------------------------------

  buildStatePayload() {
    const pc = this.getLocalRecord();
    if (!pc) return null;
    const x = pc.position?.x;
    const y = pc.position?.y;
    if (!isNum(x) || !isNum(y)) return null;
    return {
      playerId: pc.playerId,
      x: clampCoord(x),
      y: clampCoord(y),
      hp: Number(pc.hp) || 0,
      maxhp: Number(pc.maxhp) || 0,
    };
  }

  /**
   * Persist position + hp/maxhp when dirty. Never throws; on failure the
   * record stays dirty so the next tick / flush retries.
   */
  async flushState() {
    if (!this.dirty) return;
    if (this.inflightFlush) return this.inflightFlush;

    const payload = this.buildStatePayload();
    if (!payload) return;

    this.dirty = false;
    this.inflightFlush = (async () => {
      try {
        await axios.post(`${API_BASE}/api/player/state`, payload);
      } catch (error) {
        this.dirty = true;
        console.error('❌ Failed to persist player state:', error?.response?.data || error.message);
      } finally {
        this.inflightFlush = null;
      }
    })();
    return this.inflightFlush;
  }

  /**
   * The local record's `{ x, y, hp, maxhp }` for `enter-grid`'s `leave.state`
   * (docs/phase-3-contract.md §4.2). Clears the dirty flag; returns the
   * current values even when nothing is dirty. Null when there is no record.
   */
  takeDirtyState() {
    this.flushReactSync();
    if (this.mirrorTimer) {
      clearTimeout(this.mirrorTimer); this.mirrorTimer = null;
      const pending = this.pendingMirror; this.pendingMirror = null;
      if (pending) this.mirrorToLocalStorage(this.getLocalRecord() || pending.pc, pending.changedKeys);
    }
    const payload = this.buildStatePayload();
    if (!payload) return null;
    this.dirty = false;
    return { x: payload.x, y: payload.y, hp: payload.hp, maxhp: payload.maxhp };
  }

  /** Re-arm the dirty flag (a leave the server never applied). */
  markDirty() {
    if (!this.getLocalRecord()) return;
    this.dirty = true;
    this.startPersistence();
  }

  startPersistence() {
    if (this.persistInterval) return;
    this.persistInterval = setInterval(() => { this.flushState(); }, PERSIST_INTERVAL_MS);
  }

  /** Persist shortly after the position stops changing (debounced). */
  flushSoon(delayMs = SETTLE_FLUSH_MS) {
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      this.flushState();
    }, delayMs);
  }

  /**
   * Transactional moments (an NPC killed, a quest reward, a trade, a craft collected, a
   * purchase) persist the position right away, off the timer. Fire-and-forget.
   */
  flushAfterTransaction() {
    if (this.settleTimer) { clearTimeout(this.settleTimer); this.settleTimer = null; }
    this.flushState();
  }

  /**
   * Page dismissal: `navigator.sendBeacon` is the only request a browser is guaranteed to
   * deliver from pagehide / a hidden tab (synchronous XHR is blocked there now, which is why
   * a refresh after walking used to lose the position). The payload carries playerId, which
   * the maintenance gate accepts in place of the x-player-id header a beacon cannot set.
   */
  sendBeaconState() {
    if (!this.dirty) return;
    const payload = this.buildStatePayload();
    if (!payload) return;
    const url = `${API_BASE}/api/player/state`;
    const body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))) {
        this.dirty = false;
        return;
      }
    } catch (err) { /* fall through */ }
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, false);
      xhr.setRequestHeader('Content-Type', 'application/json');
      if (this.localPlayerId) xhr.setRequestHeader('x-player-id', String(this.localPlayerId));
      xhr.send(body);
      this.dirty = false;
    } catch (err) {
      // page is going away; nothing else to do
    }
  }

  ensureUnloadFlush() {
    if (this.unloadListenerAdded) return;
    const onLeave = () => this.sendBeaconState();
    window.addEventListener('pagehide', onLeave);
    window.addEventListener('beforeunload', onLeave);
    document.addEventListener('visibilitychange', () => { if (document.hidden) onLeave(); });
    this.unloadListenerAdded = true;
  }

  /** Debounced localStorage mirror: one JSON parse/serialise per second at most while moving. */
  mirrorToLocalStorageDebounced(pc, changedKeys) {
    const prev = this.pendingMirror;
    this.pendingMirror = { pc, changedKeys: [...new Set([...(prev?.changedKeys || []), ...changedKeys])] };
    if (this.mirrorTimer) return;
    this.mirrorTimer = setTimeout(() => {
      this.mirrorTimer = null;
      const pending = this.pendingMirror;
      this.pendingMirror = null;
      const latest = this.getLocalRecord() || pending.pc;
      this.mirrorToLocalStorage(latest, pending.changedKeys);
    }, LOCALSTORAGE_MIRROR_DEBOUNCE_MS);
  }

  /** Merge x/y/hp/maxhp into the localStorage `player` without clobbering other fields. */
  mirrorToLocalStorage(pc, changedKeys) {
    try {
      const stored = JSON.parse(localStorage.getItem('player') || 'null');
      if (!stored || typeof stored !== 'object') return;
      let touched = false;
      if (changedKeys.includes('position') && pc.position && isNum(pc.position.x) && isNum(pc.position.y)) {
        stored.location = { ...(stored.location || {}), x: pc.position.x, y: pc.position.y };
        touched = true;
      }
      if (changedKeys.includes('hp')) { stored.hp = pc.hp; touched = true; }
      if (changedKeys.includes('maxhp')) { stored.maxhp = pc.maxhp; touched = true; }
      if (touched) localStorage.setItem('player', JSON.stringify(stored));
    } catch (err) {
      // localStorage unavailable; the server flush is the source of truth
    }
  }

  // ---------------------------------------------------------------------------
  // Hydration
  // ---------------------------------------------------------------------------

  /**
   * Build the local player's record for `gridId` from the Player document:
   * position = `player.location.x/y` (or `opts.position`), hp/maxhp from the
   * Player (falling back to base + power modifiers), combat stats derived from
   * `base*` + equipped powers. Replaces any record held for another grid.
   * No HTTP; starts the persistence timer + unload flush.
   */
  async initializeForPlayer(gridId, player, opts = {}) {
    if (!gridId) {
      console.error('initializeForPlayer: gridId is undefined.');
      return null;
    }
    const playerId = resolveLocalPlayerId(player?._id || player?.playerId);
    if (!playerId) {
      console.error('initializeForPlayer: no player id.');
      return null;
    }
    this.localPlayerId = playerId;

    const masterResources = await loadMasterResources();
    const modifiers = powerModifiers(player, masterResources);
    const getStat = (baseKey, modKey) => (player[baseKey] || 0) + (modifiers[modKey] || 0);

    const position = (opts.position && isNum(opts.position.x) && isNum(opts.position.y))
      ? { x: opts.position.x, y: opts.position.y }
      : (isNum(player.location?.x) && isNum(player.location?.y))
        ? { x: player.location.x, y: player.location.y }
        : { x: 0, y: 0 };

    const derivedMaxhp = getStat('baseMaxhp', 'maxhp');
    const maxhp = isNum(player.maxhp) ? player.maxhp : derivedMaxhp;
    const hp = isNum(player.hp) ? player.hp : getStat('baseHp', 'hp');

    const pc = buildPCRecord(playerId, {
      username: player.username,
      icon: player.icon,
      position,
      hp,
      maxhp,
      armorclass: getStat('baseArmorclass', 'armorclass'),
      attackbonus: getStat('baseAttackbonus', 'attackbonus'),
      damage: getStat('baseDamage', 'damage'),
      attackrange: getStat('baseAttackrange', 'attackrange'),
      speed: getStat('baseSpeed', 'speed'),
      iscamping: player.iscamping,
      isinboat: player.isinboat,
    });

    // Single-PC store: only the current grid holds a record
    this.playersInGrid = {
      [gridId]: { pcs: { [playerId]: pc }, playersInGridLastUpdated: Date.now() },
    };
    this.syncReact(gridId, { replace: true });

    this.startPersistence();
    this.ensureUnloadFlush();
    return pc;
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  getPlayersInGrid(gridId) {
    const playersInGrid = this.playersInGrid[gridId];
    if (!playersInGrid) {
      console.warn(`⚠️ No PC state found for gridId: ${gridId}`);
      return {};
    }
    return playersInGrid.pcs;
  }

  getAllPCs(gridId) {
    return this.playersInGrid?.[gridId]?.pcs || {};
  }

  getPlayerPosition(gridId, playerId) {
    return this.playersInGrid?.[gridId]?.pcs?.[playerId]?.position || null;
  }

  // ---------------------------------------------------------------------------
  // Writes (all local; the server is reached only through flushState)
  // ---------------------------------------------------------------------------

  /**
   * Add the local player from a Player document (derives combat stats from
   * base stats + equipped powers). `pcData.position` overrides location.x/y.
   */
  async addPlayer(gridId, playerId, pcData) {
    const pc = await this.initializeForPlayer(gridId, { ...pcData, _id: pcData._id || playerId }, { position: pcData.position });
    if (pc) this.dirty = true;
    return pc;
  }

  /** Add the local player to a grid from an already-built PC record. */
  addPC(gridId, playerId, pcData) {
    this.ensureGridEntry(gridId);
    const newPC = buildPCRecord(playerId, pcData, Date.now());
    this.localPlayerId = newPC.playerId;
    this.playersInGrid[gridId].pcs[newPC.playerId] = newPC;
    this.syncReact(gridId);
    this.dirty = true;
    this.startPersistence();
    this.ensureUnloadFlush();
    return newPC;
  }

  /**
   * Update the local PC's record. Position changes animate (unless
   * `opts.animate === false`, e.g. grid arrival); x/y/hp/maxhp changes mark
   * the record dirty and mirror into localStorage `player`.
   */
  updatePC(gridId, playerId, newProperties, opts = {}) {
    const gridPCs = this.playersInGrid[gridId]?.pcs;
    if (!gridPCs || !gridPCs[playerId]) {
      console.error(`Cannot update PC ${playerId}. No PC found for gridId: ${gridId}`);
      return;
    }

    const currentData = gridPCs[playerId];
    const changedKeys = Object.keys(newProperties).filter((key) => {
      if (key === 'lastUpdated') return false;
      const a = currentData[key];
      const b = newProperties[key];
      if (key === 'position') return !a || !b || a.x !== b.x || a.y !== b.y;
      return a !== b;
    });
    if (changedKeys.length === 0) return;

    const oldPosition = currentData.position;
    const updatedPC = {
      ...currentData,
      ...newProperties,
      lastUpdated: Date.now(),
    };
    const newPosition = updatedPC.position;

    gridPCs[playerId] = updatedPC;

    if (
      opts.animate !== false &&
      this.tileSize &&
      oldPosition &&
      newPosition &&
      (oldPosition.x !== newPosition.x || oldPosition.y !== newPosition.y)
    ) {
      // 60 ms default matches MOVEMENT_COOLDOWN_MS for smooth continuous movement
      animateRemotePC(playerId, oldPosition, newPosition, this.tileSize);
    }

    const positionOnly = changedKeys.length === 1 && changedKeys[0] === 'position';
    if (positionOnly) this.syncReactThrottled(gridId);
    else this.syncReact(gridId);

    if (changedKeys.some((key) => key === 'position' || key === 'hp' || key === 'maxhp')) {
      this.dirty = true;
      if (positionOnly) this.mirrorToLocalStorageDebounced(updatedPC, changedKeys);
      else this.mirrorToLocalStorage(updatedPC, changedKeys);
      this.startPersistence();
      this.flushSoon(); // settle flush: a couple of seconds after the last change
    }
  }

  /** Clear the local player's record for a grid (local only). Refuses any other id. */
  removePC(gridId, playerId) {
    const id = String(playerId);
    const localId = this.localPlayerId || resolveLocalPlayerId(null);
    if (localId && id !== localId) {
      console.warn(`⚠️ removePC ignored for non-local player ${id} (local is ${localId}).`);
      return;
    }
    if (!this.playersInGrid[gridId]?.pcs?.[id]) return;
    delete this.playersInGrid[gridId].pcs[id];
    this.syncReact(gridId);
  }
}

const playersInGridManager = new GridStatePCManager();
export default playersInGridManager;
