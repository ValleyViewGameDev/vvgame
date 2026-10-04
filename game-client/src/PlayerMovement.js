import playersInGridManager from './GridState/PlayersInGrid';
import NPCsInGridManager from './GridState/GridStateNPCs';
import GlobalGridStateTilesAndResources from './GridState/GlobalGridStateTilesAndResources';
import FloatingTextManager from "./UI/FloatingText";
import { handleTransitSignpost, canTravel } from './GameFeatures/Transit/Transit';
import { prefetchNeighbour } from './Utils/GridPrefetch';
import PixiCamera from './Render/PixiRenderer/PixiCamera';
import { buildPassability, findPath } from './Utils/Pathfinding';

// Render-only animation state for interpolated player positions (used by rendering components)
const renderPositions = {};

// Track currently pressed keys for diagonal movement
const pressedKeys = new Set();

// Define modifier keys that should be ignored for movement
const MODIFIER_KEYS = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'NumLock', 'ScrollLock'];

// Movement speed: one tile per MOVEMENT_STEP_MS while a direction key is held.
// 90 ms = ~11 tiles/s. Must equal PC_ANIMATION_DURATION_MS (RenderAnimatePosition.js) so
// steps glide into each other. Tune here only.
const MOVEMENT_STEP_MS = 90;
// A tap of a key moves exactly one tile: the second step of a press only comes once the key
// has been held this long (an OS-style initial repeat delay), after which steps run at
// MOVEMENT_STEP_MS. Queued walks (tap-to-walk) are not presses and never wait.
const HOLD_REPEAT_DELAY_MS = 220;

const DIRECTIONS = {
  // Arrow keys
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  // WASD keys
  w: { dx: 0, dy: -1 }, W: { dx: 0, dy: -1 },
  s: { dx: 0, dy: 1 },  S: { dx: 0, dy: 1 },
  a: { dx: -1, dy: 0 }, A: { dx: -1, dy: 0 },
  d: { dx: 1, dy: 0 },  D: { dx: 1, dy: 0 },
  // Numpad cardinal directions (uses event.code)
  Numpad8: { dx: 0, dy: -1 },
  Numpad2: { dx: 0, dy: 1 },
  Numpad4: { dx: -1, dy: 0 },
  Numpad6: { dx: 1, dy: 0 },
  // Numpad diagonals (uses event.code)
  Numpad7: { dx: -1, dy: -1 },
  Numpad9: { dx: 1, dy: -1 },
  Numpad1: { dx: -1, dy: 1 },
  Numpad3: { dx: 1, dy: 1 },
};

/**
 * HELD-KEY MOVEMENT LOOP (docs/audits/client-review-2026-10-03.md §2.2, §2.5 D)
 *
 * The old code stepped once per `keydown` event, so a held key moved once, then waited out
 * the OS key-repeat delay, then moved at the OS repeat rate. Now `keydown` records the key and
 * takes the first step immediately; a requestAnimationFrame loop keeps stepping every
 * MOVEMENT_STEP_MS for as long as any direction key is down, and stops itself when none is.
 * App.js refreshes `movementContext` (player, setters, strings) whenever its state changes so
 * the loop never acts on a stale player.
 */
let movementContext = null;
let loopTimer = null;       // setTimeout handle: timers keep their cadence when rAF is throttled
let moveInFlight = false;
let lastMovementTime = 0;
let keyStepsThisPress = 0;  // keyboard steps since the first direction key went down
const LOOP_POLL_MS = 8;

/**
 * TAP-TO-WALK (docs/audits/client-review-2026-10-03.md §2.5 D)
 * `walkTo(col, row)` plans a path (Utils/Pathfinding.js) and queues its steps; the same
 * loop that serves held keys then takes one queued step per MOVEMENT_STEP_MS. A direction
 * key, a modal, a zoom-out, a grid change or a new tap cancels the walk. A step that is
 * refused mid-walk (an NPC wandered into the way) re-plans once from where the player is.
 */
let pathQueue = [];
let pathGoal = null;
let pathReplanned = false;

export function setMovementContext(context) {
  movementContext = context;
}

function hasDirectionPressed() {
  for (const key of pressedKeys) if (DIRECTIONS[key]) return true;
  return false;
}

function stopLoop() {
  if (loopTimer) clearTimeout(loopTimer);
  loopTimer = null;
}

function clearPath() {
  pathQueue = [];
  pathGoal = null;
  pathReplanned = false;
}

/** Forget every held key and queued walk, stop stepping (modal, zoom out, grid change, blur). */
export function stopMovement() {
  pressedKeys.clear();
  clearPath();
  stopLoop();
  keyStepsThisPress = 0;
  playersInGridManager.flushReactSync();
}

export function isWalking() {
  return pathQueue.length > 0;
}

function currentPosition() {
  const ctx = movementContext;
  if (!ctx?.currentPlayer?._id || !ctx.currentPlayer.location?.g) return null;
  return playersInGridManager.getPlayerPosition(ctx.currentPlayer.location.g, String(ctx.currentPlayer._id));
}

function planPath(goal) {
  const ctx = movementContext;
  const from = currentPosition();
  if (!ctx || !from) return [];
  const gridId = ctx.currentPlayer.location.g;
  const passable = buildPassability({
    tiles: GlobalGridStateTilesAndResources.getTiles(),
    resources: GlobalGridStateTilesAndResources.getResources(),
    npcs: NPCsInGridManager.getNPCsInGrid(gridId),
    masterResources: ctx.masterResources,
    currentPlayer: ctx.currentPlayer,
  });
  return findPath(from, goal, passable);
}

/**
 * Walk to a tile (or next to it when it is blocked). Returns the number of steps queued;
 * 0 means already there or unreachable.
 */
export function walkTo(col, row) {
  const ctx = movementContext;
  if (!ctx?.currentPlayer) return 0;
  if (ctx.currentPlayer.iscamping) {
    const pos = currentPosition();
    if (pos) FloatingTextManager.addFloatingText(32, pos.x, pos.y, ctx.TILE_SIZE);
    return 0;
  }
  pressedKeys.clear(); // a tap replaces any held key
  const goal = { x: col, y: row };
  const path = planPath(goal);
  pathQueue = path;
  pathGoal = path.length ? goal : null;
  pathReplanned = false;
  if (path.length && !loopTimer) loopTick();
  return path.length;
}

/** Next queued step as a unit delta from where the player actually is, or null to abandon. */
function nextPathDelta() {
  const pos = currentPosition();
  const next = pathQueue[0];
  if (!pos || !next) return null;
  const dx = next.x - Math.round(pos.x);
  const dy = next.y - Math.round(pos.y);
  if (dx === 0 && dy === 0) { pathQueue.shift(); return nextPathDelta(); }
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) return null; // desynced (teleport, grid change)
  return { dx, dy };
}

function loopTick() {
  loopTimer = null;
  const keyboard = hasDirectionPressed();
  if (keyboard && pathQueue.length) clearPath(); // keys win over a queued walk
  if (!keyboard && pathQueue.length === 0) {
    // Movement stopped: let React catch up with the final position right away
    pathGoal = null;
    keyStepsThisPress = 0;
    playersInGridManager.flushReactSync();
    return;
  }
  const now = Date.now();
  // The second step of a key press waits for the hold delay; everything else runs at step cadence
  const interval = keyboard && keyStepsThisPress === 1 ? HOLD_REPEAT_DELAY_MS : MOVEMENT_STEP_MS;
  const due = interval - (now - lastMovementTime);
  if (!moveInFlight && movementContext && due <= 0) {
    let forced = null;
    if (!keyboard) {
      forced = nextPathDelta();
      if (!forced) { clearPath(); loopTimer = setTimeout(loopTick, LOOP_POLL_MS); return; }
    }
    lastMovementTime = now;
    moveInFlight = true;
    if (keyboard) keyStepsThisPress += 1;
    const stepTarget = forced ? pathQueue[0] : null;
    processMovement(movementContext, forced)
      .then((moved) => {
        if (!forced) return;
        if (moved) {
          if (pathQueue[0] === stepTarget) pathQueue.shift();
          return;
        }
        // Blocked mid-walk: re-plan once from here, then give up
        if (pathGoal && !pathReplanned) {
          pathReplanned = true;
          pathQueue = planPath(pathGoal);
          if (!pathQueue.length) clearPath();
        } else {
          clearPath();
        }
      })
      .catch((err) => { console.error('Error processing movement:', err); clearPath(); })
      .finally(() => { moveInFlight = false; });
    loopTimer = setTimeout(loopTick, keyboard && keyStepsThisPress === 1 ? HOLD_REPEAT_DELAY_MS : MOVEMENT_STEP_MS);
    return;
  }
  loopTimer = setTimeout(loopTick, Math.max(LOOP_POLL_MS, due));
}

// Clear all pressed keys when window loses focus or visibility
if (typeof window !== 'undefined') {
  window.addEventListener('blur', stopMovement);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopMovement(); });

  // Debug helpers (accessible from console)
  window.debugMovementKeys = () => Array.from(pressedKeys);
  window.resetMovementKeys = stopMovement;
}

// Helper function to handle key press events
export function handleKeyDown(event, currentPlayer, TILE_SIZE, masterResources,
  setCurrentPlayer,
  setGridId,
  setGrid,
  setTileTypes,
  setResources,
  updateStatus,
  closeAllPanels,
  localPlayerMoveTimestampRef,
  bulkOperationContext,
  strings = null,
  transitionFadeControl = null)
{
  // Ignore modifier keys
  if (MODIFIER_KEYS.includes(event.key)) {
    return;
  }

  // Use event.code for numpad keys (consistent regardless of NumLock state)
  // Use event.key for all other keys (handles WASD, arrows, etc.)
  const isNumpadKey = event.code && event.code.startsWith('Numpad');
  const keyToTrack = isNumpadKey ? event.code : event.key;

  // Prevent default browser scrolling for numpad navigation keys (when NumLock is off)
  if (isNumpadKey) {
    event.preventDefault();
  }

  // Latest arguments from App.js (also refreshed by setMovementContext on every App state change)
  setMovementContext({
    ...(movementContext || {}), // keep keys only App sets (onEnterTile)
    currentPlayer, TILE_SIZE, masterResources,
    setCurrentPlayer, setGridId, setGrid, setTileTypes, setResources,
    updateStatus, closeAllPanels, localPlayerMoveTimestampRef, bulkOperationContext,
    strings, transitionFadeControl
  });

  // OS auto-repeat: the loop already handles held keys
  if (event.repeat) return;

  pressedKeys.add(keyToTrack);
  if (!DIRECTIONS[keyToTrack]) return;

  // First step right now (if the cooldown allows), then the loop takes over
  if (!loopTimer) loopTick();
}

// Helper function to handle key release events
export function handleKeyUp(event) {
  const isNumpadKey = event.code && event.code.startsWith('Numpad');
  const keyToRemove = isNumpadKey ? event.code : event.key;
  pressedKeys.delete(keyToRemove);

  // Also clear all keys if a modifier is released (failsafe)
  if (MODIFIER_KEYS.includes(event.key)) {
    pressedKeys.clear();
  }
}

// Process movement based on all currently pressed keys
async function processMovement({ currentPlayer, TILE_SIZE, masterResources,
  setCurrentPlayer,
  setGridId,
  setGrid,
  setTileTypes,
  setResources,
  updateStatus,
  closeAllPanels,
  localPlayerMoveTimestampRef,
  bulkOperationContext,
  strings = null,
  transitionFadeControl = null,
  onEnterTile = null }, forcedDelta = null)
{
  const directions = DIRECTIONS;

  // Movement vector: a queued walk step, or the sum of all pressed keys
  let totalDx = 0;
  let totalDy = 0;

  if (forcedDelta) {
    totalDx = forcedDelta.dx;
    totalDy = forcedDelta.dy;
  } else {
    for (const key of pressedKeys) {
      const movement = directions[key];
      if (movement) {
        totalDx += movement.dx;
        totalDy += movement.dy;
      }
    }
  }

  // If no movement, return
  if (totalDx === 0 && totalDy === 0) return false;

  // Clamp diagonal movement to -1, 0, or 1
  totalDx = Math.max(-1, Math.min(1, totalDx));
  totalDy = Math.max(-1, Math.min(1, totalDy));

  if (currentPlayer.iscamping) {
    FloatingTextManager.addFloatingText(32, currentPlayer.location.x, currentPlayer.location.y, TILE_SIZE);
    stopMovement();
    return false;
  }

  const playerId = currentPlayer._id.toString();
  const gridId = currentPlayer.location.g;
  const playersInGrid = playersInGridManager.getPlayersInGrid(gridId);
  if (!playersInGrid || !playersInGrid[playerId]) {
    // Mid grid-change (the record lives on another grid now): stop until the next key press
    stopMovement();
    return false;
  }

  const currentPosition = playersInGrid[playerId].position;
  const targetX = Math.round(currentPosition.x + totalDx);
  const targetY = Math.round(currentPosition.y + totalDy);

  // Normal movement validation for all players (boats use existing transit logic)
  if (!Array.isArray(masterResources)) {
    console.error('masterResources is not an array:', masterResources);
    return false;
  }
  // Edge crossings (isValidMove triggers them) must not keep stepping while the grid changes
  if (targetX < 0 || targetY < 0 || targetX > 63 || targetY > 63) stopMovement();

  if (!(await isValidMove(targetX, targetY, masterResources,
    currentPlayer,
    setCurrentPlayer,
    setGridId,
    setGrid,
    setTileTypes,
    setResources,
    updateStatus,
    TILE_SIZE,
    closeAllPanels,
    bulkOperationContext,
    strings,
    transitionFadeControl
  ))) {
    return false;
  }

  const finalPosition = { x: targetX, y: targetY };
  const timestamp = Date.now();

  // Update the local player movement timestamp to prevent our own broadcasts from overriding
  if (localPlayerMoveTimestampRef) {
    localPlayerMoveTimestampRef.current = timestamp;
  }

  playersInGridManager.updatePC(gridId, playerId, {
    position: finalPosition,
    lastUpdated: timestamp,
  });

  maybePrefetchAcrossEdge(currentPlayer, playerId, finalPosition);
  // The camera follows the animated position from PixiRendererPCs (PixiCamera.follow).

  // Walking onto a doober collects it exactly as a click on that tile would
  // (App.js routes onEnterTile through handleTileClick, so inventory, VFX, feedback,
  // quests and the server call are the same code path).
  if (onEnterTile) {
    const here = GlobalGridStateTilesAndResources.getResources()?.find(
      (r) => r && r.category === 'doober' && r.x === targetX && r.y === targetY
    );
    if (here) onEnterTile(targetY, targetX, here);
  }
  return true;
}

// Prefetch the neighbour's bundle when the player is this close to an edge
// (docs/phase-3-contract.md §4.3). GridPrefetch dedupes: a cached, in-flight
// or refused coord is a no-op, so repeated steps along an edge do not refetch.
const EDGE_PREFETCH_TILES = 2;

function maybePrefetchAcrossEdge(currentPlayer, playerId, position) {
  const gridCoord = currentPlayer.location?.gridCoord ?? GlobalGridStateTilesAndResources.getGridMeta()?.gridCoord;
  if (gridCoord == null) return; // dungeons / FTUE cave: no neighbours
  // Edge travel needs a Horse; do not create grid copies for players who cannot cross yet
  if (!currentPlayer.skills?.some((item) => item.type === 'Horse' && item.quantity > 0)) return;

  const directions = [];
  if (position.x <= EDGE_PREFETCH_TILES) directions.push('W');
  if (position.x >= 63 - EDGE_PREFETCH_TILES) directions.push('E');
  if (position.y <= EDGE_PREFETCH_TILES) directions.push('N');
  if (position.y >= 63 - EDGE_PREFETCH_TILES) directions.push('S');

  for (const direction of directions) {
    const travel = canTravel(gridCoord, direction);
    if (travel.ok) prefetchNeighbour(playerId, travel.gridCoord);
  }
}

async function isValidMove(targetX, targetY, masterResources,
  currentPlayer,
  setCurrentPlayer,
  setGridId,
  setGrid,
  setTileTypes,
  setResources,
  updateStatus,
  TILE_SIZE,
  closeAllPanels,
  bulkOperationContext,
  strings = null,
  transitionFadeControl = null
 ) {  // Function to check if movement is valid
  const tiles = GlobalGridStateTilesAndResources.getTiles();
  const resources = GlobalGridStateTilesAndResources.getResources();
  

  if (!Array.isArray(resources)) {
    console.warn('⛔ Movement blocked: resources is not an array yet.', resources);
    return false;
  }

  // 1️⃣ **Check if the target is out of bounds**
  if (targetX < 0 || targetY < 0 || targetX > 63 || targetY > 63) {
//  console.warn(`⛔ Movement blocked: (${targetX}, ${targetY}) is out of bounds.`);
    const direction =
      targetX < 0 ? "Signpost W" :
      targetX > 63 ? "Signpost E" :
      targetY < 0 ? "Signpost N" :
      targetY > 63 ? "Signpost S" :
      null;
    if (!direction) { console.warn(`⛔ Invalid movement direction from (${targetX}, ${targetY}).`); return false; }

    // §4.1: validate the crossing BEFORE any fade or request. A refusal shows
    // the status and the player simply stays on the tile.
    const gridCoord = currentPlayer.location?.gridCoord ?? GlobalGridStateTilesAndResources.getGridMeta()?.gridCoord;
    if (gridCoord == null) {
      if (updateStatus) updateStatus(105);
      return false;
    }
    const travel = canTravel(gridCoord, direction.replace('Signpost ', ''));
    if (!travel.ok) {
      if (updateStatus) updateStatus(travel.reason);
      return false;
    }

    // No fade here: changePlayerLocation starts it (or skips it when the
    // neighbour's bundle is prefetched).
    const skills = currentPlayer.skills;

    handleTransitSignpost(
      currentPlayer,
      direction,
      setCurrentPlayer,
      setGridId,
      setGrid,
      setTileTypes,
      setResources,
      updateStatus,
      TILE_SIZE,
      skills,
      closeAllPanels,
      bulkOperationContext,
      null, // masterResources not available
      strings,
      null,  // masterTrophies not available in PlayerMovement
      transitionFadeControl
    );
    return false; // Prevent normal movement handling
  };

  // 2️⃣ **Check if tile is valid for movement (using existing isValidTile function)**
  const canMove = await isTileValidForPlayer(targetX, targetY, tiles, resources, masterResources, currentPlayer, updateStatus, strings, TILE_SIZE);
  if (!canMove) {
  }
  return canMove;
}


/**
 * Put the camera on the player immediately (grid arrival, panel "go to" buttons).
 * The camera itself lives in Render/PixiRenderer/PixiCamera.js; the extra arguments are
 * accepted for the existing call sites and ignored.
 */
export function centerCameraOnPlayer(position, TILE_SIZE, zoomScale, retryCount, gridPosition, settlementPosition, instant = false) {
  if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
    console.warn('⚠️ [CAMERA] Cannot center camera - invalid position:', position);
    return Promise.resolve(false);
  }
  if (instant) {
    // Grid arrival: snap, no look-around pan
    PixiCamera.resetPan();
    PixiCamera.follow(position.x, position.y);
    return Promise.resolve(true);
  }
  // Panel buttons (a conversation is about to play at the avatar): make sure the avatar is
  // visible in the part of the board no panel covers, easing the camera there if needed.
  revealPlayerBesidePanels();
  return Promise.resolve(true);
}

/**
 * The board minus whatever panel, Home sheet or chat is covering its left side (phones), as a
 * region in host px; then PixiCamera.revealPlayerIn. On desktop panels sit beside the board,
 * so the region is the whole board and this only recentres a panned-away view.
 */
export function revealPlayerBesidePanels() {
  const host = document.querySelector('.pixi-container');
  if (!host) return false;
  const h = host.getBoundingClientRect();
  const region = { left: 0, top: 0, right: h.width, bottom: h.height };
  const covers = document.querySelectorAll('.panel-container, .base-panel.base-panel--open, .chat-panel-slideout');
  covers.forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const overlapX = Math.min(r.right, h.right) - Math.max(r.left, h.left);
    const overlapY = Math.min(r.bottom, h.bottom) - Math.max(r.top, h.top);
    if (overlapX <= 0 || overlapY <= 0) return; // beside the board (desktop)
    // Panels dock at the left: the clear region starts at the panel's right edge
    region.left = Math.max(region.left, r.right - h.left);
  });
  if (region.right - region.left < 80) { region.left = 0; } // no room beside it: use the whole board
  return PixiCamera.revealPlayerIn(region);
}

export async function isTileValidForPlayer(x, y, tiles, resources, masterResources, currentPlayer = null, updateStatus = null, strings = null, TILE_SIZE = null) {
  x = Math.floor(x);
  y = Math.floor(y);
  // Check if tile is out of bounds
  if (x < 0 || y < 0 || y >= tiles.length || x >= tiles[0].length) {
    console.warn(`⛔ Tile (${x}, ${y}) is out of bounds.`);
    return false;
  }
  // Get the tile type
  const tileType = tiles[y][x];
  // Ensure the tile type exists
  if (!tileType) { console.warn(`⛔ Invalid tile at (${x}, ${y}) - No tileType found.`); return false; }

  // **Special case: If player is in boat, they can only move on water tiles**
  if (currentPlayer?.isinboat) {
    if (tileType === 'w') {
      console.log(`🚤 Boat player can move to water tile (${x}, ${y})`);
      return true;
    } else {
      console.warn(`⛔ Boat player cannot move to non-water tile (${x}, ${y}): ${tileType}`);
      return false;
    }
  }

  // **Step 1: Check if tile itself is passable using masterResources (normal players)**
  const tileResource = masterResources.find(resource => resource.type === tileType);

  if (!tileResource || !tileResource.passable) {
    console.warn(`⛔ Tile (${x}, ${y}) is not passable according to masterResources.`);
    return false;
  }
  // **Step 2: Check for an impassable resource in this tile**
  
  const resourceInTile = resources.find(res => res.x === x && res.y === y);
  
  
  if (resourceInTile) {
    // Check if passable is explicitly false (not just falsy)
    if (resourceInTile.passable === false) {
      // Check if it's a door
      if (resourceInTile.action === 'door') {
        // Import the canPassThroughDoor function dynamically
        const { canPassThroughDoor } = await import('./GameFeatures/Doors/Doors');
        if (canPassThroughDoor(resourceInTile, currentPlayer, updateStatus, strings, TILE_SIZE)) {
          console.log(`✅ Player has access - allowing passage through door at (${x}, ${y})`);
          return true;
        }
        // If canPassThroughDoor returned false, it already showed the message
        return false;
      }

      console.warn(`⛔ Tile (${x}, ${y}) contains an impassable resource (${resourceInTile.type}).`);
      return false;
    }
  }

  // **Step 3: Check if there's an impassable NPC in this tile**
  if (currentPlayer?.location?.g) {
    const npcsInGrid = NPCsInGridManager.getNPCsInGrid(currentPlayer.location.g);
    if (npcsInGrid) {
      const npcInTile = Object.values(npcsInGrid).find(npc =>
        Math.floor(npc.position?.x) === x && Math.floor(npc.position?.y) === y
      );
      if (npcInTile && npcInTile.passable === false) {
        console.warn(`⛔ Tile (${x}, ${y}) contains an impassable NPC (${npcInTile.type}).`);
        return false;
      }
    }
  }

  // ✅ If all checks pass, movement is allowed
  return true;
}

// Export renderPositions at the end to avoid initialization issues
export { renderPositions };