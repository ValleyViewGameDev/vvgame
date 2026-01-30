import playersInGridManager from './GridState/PlayersInGrid';
import NPCsInGridManager from './GridState/GridStateNPCs';
import GlobalGridStateTilesAndResources from './GridState/GlobalGridStateTilesAndResources';
import FloatingTextManager from "./UI/FloatingText";
import { handleTransitSignpost } from './GameFeatures/Transit/Transit';
import { PLAYER_FIXED_POSITION } from './Render/PixiRenderer/CameraConstants';
import { getPlayerWorldPosition, getScrollPosition } from './Render/PixiRenderer/UnifiedCamera';

// Render-only animation state for interpolated player positions (used by rendering components)
const renderPositions = {};

// Track current registered TILE_SIZE for camera callback
let registeredTileSize = 64;

// Track currently pressed keys for diagonal movement
const pressedKeys = new Set();

// Define modifier keys that should be ignored for movement
const MODIFIER_KEYS = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'NumLock', 'ScrollLock'];

// Track last movement time for rate limiting
let lastMovementTime = 0;

// Pending movement timer - allows collecting simultaneous key presses before processing
let pendingMovementTimer = null;
let pendingMovementArgs = null; // Stores movement function arguments for the pending timer
const SIMULTANEOUS_COLLECT_MS = 20; // Wait this many ms to collect simultaneous key presses

// Movement speed configuration
// Lower values = faster movement, higher values = slower movement
// 100ms = ~10 tiles/sec (very fast, arcade-like)
// 150ms = ~6-7 tiles/sec (recommended default)
// 200ms = ~5 tiles/sec (slower, more deliberate)
// 250ms = ~4 tiles/sec (slow, strategic)
const MOVEMENT_COOLDOWN_MS = 60;

// Clear all pressed keys when window loses focus or visibility
if (typeof window !== 'undefined') {
  window.addEventListener('blur', () => {
    pressedKeys.clear();
    if (pendingMovementTimer) {
      clearTimeout(pendingMovementTimer);
      pendingMovementTimer = null;
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pressedKeys.clear();
      if (pendingMovementTimer) {
        clearTimeout(pendingMovementTimer);
        pendingMovementTimer = null;
      }
    }
  });

  // Debug function to check stuck keys (accessible from console)
  window.debugMovementKeys = () => {
    console.log('Currently pressed keys:', Array.from(pressedKeys));
    return Array.from(pressedKeys);
  };

  // Emergency reset function (accessible from console)
  window.resetMovementKeys = () => {
    pressedKeys.clear();
    if (pendingMovementTimer) {
      clearTimeout(pendingMovementTimer);
      pendingMovementTimer = null;
    }
    console.log('Movement keys reset');
  };
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

  // Add the key to our set of pressed keys
  // Use event.code for numpad keys (consistent regardless of NumLock state)
  // Use event.key for all other keys (handles WASD, arrows, etc.)
  const isNumpadKey = event.code && event.code.startsWith('Numpad');
  const keyToTrack = isNumpadKey ? event.code : event.key;
  pressedKeys.add(keyToTrack);

  // Check cooldown - if in cooldown, just track the key but don't schedule movement
  const now = Date.now();
  if (now - lastMovementTime < MOVEMENT_COOLDOWN_MS) {
    return;
  }

  // Store the movement arguments for when the timer fires
  pendingMovementArgs = {
    currentPlayer, TILE_SIZE, masterResources,
    setCurrentPlayer, setGridId, setGrid, setTileTypes, setResources,
    updateStatus, closeAllPanels, localPlayerMoveTimestampRef, bulkOperationContext,
    strings, transitionFadeControl
  };

  // If there's already a pending timer, let it collect this key too
  if (pendingMovementTimer) {
    return;
  }

  // Start a short timer to collect simultaneous key presses
  pendingMovementTimer = setTimeout(() => {
    pendingMovementTimer = null;

    // Update lastMovementTime before processing
    lastMovementTime = Date.now();

    const args = pendingMovementArgs;
    if (args) {
      // Process movement with all currently pressed keys
      processMovement(
        args.currentPlayer, args.TILE_SIZE, args.masterResources,
        args.setCurrentPlayer, args.setGridId, args.setGrid, args.setTileTypes, args.setResources,
        args.updateStatus, args.closeAllPanels, args.localPlayerMoveTimestampRef,
        args.bulkOperationContext, args.strings, args.transitionFadeControl
      ).catch(err => {
        console.error('Error processing movement:', err);
      });
    }
  }, SIMULTANEOUS_COLLECT_MS);
}

// Helper function to handle key release events
export function handleKeyUp(event) {
  // Remove the key from our set of pressed keys
  // Use event.code for numpad keys (consistent regardless of NumLock state)
  const isNumpadKey = event.code && event.code.startsWith('Numpad');
  const keyToRemove = isNumpadKey ? event.code : event.key;
  pressedKeys.delete(keyToRemove);

  // Also clear all keys if a modifier is released (failsafe)
  if (MODIFIER_KEYS.includes(event.key)) {
    pressedKeys.clear();
  }
}

// Process movement based on all currently pressed keys
async function processMovement(currentPlayer, TILE_SIZE, masterResources,
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
  const directions = {
    // Arrow keys
    ArrowUp: { dx: 0, dy: -1 },
    ArrowDown: { dx: 0, dy: 1 },
    ArrowLeft: { dx: -1, dy: 0 },
    ArrowRight: { dx: 1, dy: 0 },
    // WASD keys
    w: { dx: 0, dy: -1 },
    W: { dx: 0, dy: -1 },
    s: { dx: 0, dy: 1 },
    S: { dx: 0, dy: 1 },
    a: { dx: -1, dy: 0 },
    A: { dx: -1, dy: 0 },
    d: { dx: 1, dy: 0 },
    D: { dx: 1, dy: 0 },
    // Numpad cardinal directions (uses event.code)
    Numpad8: { dx: 0, dy: -1 },   // Up (N)
    Numpad2: { dx: 0, dy: 1 },    // Down (S)
    Numpad4: { dx: -1, dy: 0 },   // Left (W)
    Numpad6: { dx: 1, dy: 0 },    // Right (E)
    // Numpad diagonals (uses event.code)
    Numpad7: { dx: -1, dy: -1 },  // NW
    Numpad9: { dx: 1, dy: -1 },   // NE
    Numpad1: { dx: -1, dy: 1 },   // SW
    Numpad3: { dx: 1, dy: 1 },    // SE
  };

  // Calculate combined movement vector from all pressed keys
  let totalDx = 0;
  let totalDy = 0;

  for (const key of pressedKeys) {
    const movement = directions[key];
    if (movement) {
      totalDx += movement.dx;
      totalDy += movement.dy;
    }
  }

  // If no movement, return
  if (totalDx === 0 && totalDy === 0) return;

  // Clamp diagonal movement to -1, 0, or 1
  totalDx = Math.max(-1, Math.min(1, totalDx));
  totalDy = Math.max(-1, Math.min(1, totalDy));

  if (currentPlayer.iscamping) {
    FloatingTextManager.addFloatingText(32, currentPlayer.location.x, currentPlayer.location.y, TILE_SIZE);
    return;
  }

  const playerId = currentPlayer._id.toString();
  const gridId = currentPlayer.location.g;
  const playersInGrid = playersInGridManager.getPlayersInGrid(gridId);
  if (!playersInGrid || !playersInGrid[playerId]) return;

  const currentPosition = playersInGrid[playerId].position;
  const targetX = Math.round(currentPosition.x + totalDx);
  const targetY = Math.round(currentPosition.y + totalDy);

  // Normal movement validation for all players (boats use existing transit logic)
  if (!Array.isArray(masterResources)) {
    console.error('masterResources is not an array:', masterResources);
    return;
  }
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
    console.warn(`⛔ Player blocked from moving to (${targetX}, ${targetY}).`);
    return;
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

  // Note: Camera tethering during animation is not yet implemented for the unified world model.
  // The camera will jump to the final position after the animation completes.
  // For now, we don't call centerCameraOnPlayer here to avoid the jump during animation.
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

    console.log(`📦 Attempting directional travel via: ${direction}`);

    // 🌑 Start fade transition and WAIT for it to complete before continuing
    if (transitionFadeControl?.startTransition) {
      console.log('🌑 [IMMEDIATE FADE] Starting fade transition for boundary crossing');
      await transitionFadeControl.startTransition();
      console.log('🌑 [IMMEDIATE FADE] Fade to black complete, proceeding with travel');
    }

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
    console.warn(`⛔ Movement blocked: Tile (${targetX}, ${targetY}) is not passable.`);
  }
  return canMove;
}


export function centerCameraOnPlayer(position, TILE_SIZE, zoomScale = 1, retryCount = 0, gridPosition = null, settlementPosition = null, instant = false) {
  // Return a Promise so callers can await until camera is actually centered
  return new Promise((resolve) => {
    const gameContainer = document.querySelector(".homestead");
    if (!gameContainer) {
      // Container not ready yet, retry after a short delay (Safari fix)
      console.log(`📷 [CAMERA] No container found, retrying... (attempt ${retryCount + 1})`);
      if (retryCount < 5) {
        requestAnimationFrame(() => {
          centerCameraOnPlayer(position, TILE_SIZE, zoomScale, retryCount + 1, gridPosition, settlementPosition, instant).then(resolve);
        });
      } else {
        console.warn('⚠️ [CAMERA] Container not found after 5 retries');
        resolve(false);
      }
      return;
    }

    // Guard against undefined position during network delays
    if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
      console.warn('⚠️ [CAMERA] Cannot center camera - invalid position:', position);
      resolve(false);
      return;
    }

    // UNIFIED WORLD MODEL: Use getPlayerWorldPosition and getScrollPosition
    // for consistent camera centering that accounts for grid/settlement offsets
    const gridPos = gridPosition || { row: 0, col: 0 };
    const settlementPos = settlementPosition || { row: 0, col: 0 };

    const worldPos = getPlayerWorldPosition(position, gridPos, settlementPos);
    const scroll = getScrollPosition(worldPos, zoomScale, TILE_SIZE, PLAYER_FIXED_POSITION);

    // Clamp to valid scroll bounds (no negative scroll, no scroll past content)
    const maxScrollLeft = Math.max(0, gameContainer.scrollWidth - gameContainer.clientWidth);
    const maxScrollTop = Math.max(0, gameContainer.scrollHeight - gameContainer.clientHeight);

    // Safari fix: If container hasn't laid out yet (scroll dimensions are 0), retry
    if (maxScrollLeft <= 0 && maxScrollTop <= 0 && scroll.x > 0 && retryCount < 10) {
      console.log(`📷 [CAMERA] Container not ready (maxScroll=0), retrying... (attempt ${retryCount + 1})`);
      requestAnimationFrame(() => {
        centerCameraOnPlayer(position, TILE_SIZE, zoomScale, retryCount + 1, gridPosition, settlementPosition, instant).then(resolve);
      });
      return;
    }

    const clampedX = Math.max(0, Math.min(scroll.x, maxScrollLeft));
    const clampedY = Math.max(0, Math.min(scroll.y, maxScrollTop));

    // Use instant scroll for grid transitions (no animation), smooth for regular movement
    if (instant) {
      gameContainer.scrollLeft = clampedX;
      gameContainer.scrollTop = clampedY;
      console.log(`📷 [CAMERA] Scroll set instantly to (${clampedX}, ${clampedY})`);
    } else {
      gameContainer.scrollTo({
        left: clampedX,
        top: clampedY,
        behavior: "smooth",
      });
    }

    resolve(true);
  });
}


export function centerCameraOnPlayerFast(position, TILE_SIZE, zoomScale = 1, retryCount = 0) {
  const gameContainer = document.querySelector(".homestead");
  if (!gameContainer) {
    // Container not ready yet, retry after a short delay (Safari fix)
    console.log(`📷 [CAMERA FAST] No container found, retrying... (attempt ${retryCount + 1})`);
    if (retryCount < 5) {
      requestAnimationFrame(() => centerCameraOnPlayerFast(position, TILE_SIZE, zoomScale, retryCount + 1));
    }
    return;
  }

  // Guard against undefined position during network delays
  if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
    console.warn('⚠️ [CAMERA FAST] Cannot center camera - invalid position:', position);
    return;
  }

  // UNIFIED WORLD MODEL: Use PLAYER_FIXED_POSITION for consistent camera centering
  // This matches the formula used in App.js scroll effect (getScrollPosition)
  const playerWorldX = position.x * TILE_SIZE * zoomScale;
  const playerWorldY = position.y * TILE_SIZE * zoomScale;
  const scrollX = playerWorldX - PLAYER_FIXED_POSITION.x;
  const scrollY = playerWorldY - PLAYER_FIXED_POSITION.y;

  // Clamp to valid scroll bounds
  const maxScrollLeft = Math.max(0, gameContainer.scrollWidth - gameContainer.clientWidth);
  const maxScrollTop = Math.max(0, gameContainer.scrollHeight - gameContainer.clientHeight);

  // Safari fix: If container hasn't laid out yet (scroll dimensions are 0), retry
  if (maxScrollLeft <= 0 && maxScrollTop <= 0 && scrollX > 0 && retryCount < 10) {
    console.log(`📷 [CAMERA FAST] Container not ready (maxScroll=0), retrying... (attempt ${retryCount + 1})`);
    requestAnimationFrame(() => centerCameraOnPlayerFast(position, TILE_SIZE, zoomScale, retryCount + 1));
    return;
  }

  const clampedX = Math.max(0, Math.min(scrollX, maxScrollLeft));
  const clampedY = Math.max(0, Math.min(scrollY, maxScrollTop));

  gameContainer.scrollTo({
    left: clampedX,
    top: clampedY,
  });
}

/**
 * Center camera for settlement zoom level (512×512 tile world = 8×8 grids)
 * Position should be in settlement coordinates (gridCol * 64 + playerX, gridRow * 64 + playerY)
 */
export function centerCameraOnPlayerSettlement(position, TILE_SIZE, zoomScale = 1, retryCount = 0) {
  const gameContainer = document.querySelector(".homestead");
  if (!gameContainer) {
    if (retryCount < 5) {
      requestAnimationFrame(() => centerCameraOnPlayerSettlement(position, TILE_SIZE, zoomScale, retryCount + 1));
    }
    return;
  }

  // Guard against undefined position
  if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
    console.warn('⚠️ [CAMERA SETTLEMENT] Cannot center camera - invalid position:', position);
    return;
  }

  // UNIFIED WORLD MODEL: Use PLAYER_FIXED_POSITION for consistent camera centering
  // This matches the formula used in App.js scroll effect (getScrollPosition)
  const playerWorldX = position.x * TILE_SIZE * zoomScale;
  const playerWorldY = position.y * TILE_SIZE * zoomScale;
  const scrollX = playerWorldX - PLAYER_FIXED_POSITION.x;
  const scrollY = playerWorldY - PLAYER_FIXED_POSITION.y;

  // Clamp to valid scroll bounds
  const maxScrollLeft = Math.max(0, gameContainer.scrollWidth - gameContainer.clientWidth);
  const maxScrollTop = Math.max(0, gameContainer.scrollHeight - gameContainer.clientHeight);

  // If container hasn't laid out yet, retry
  if (maxScrollLeft <= 0 && maxScrollTop <= 0 && scrollX > 0 && retryCount < 10) {
    requestAnimationFrame(() => centerCameraOnPlayerSettlement(position, TILE_SIZE, zoomScale, retryCount + 1));
    return;
  }

  const clampedX = Math.max(0, Math.min(scrollX, maxScrollLeft));
  const clampedY = Math.max(0, Math.min(scrollY, maxScrollTop));

  gameContainer.scrollTo({
    left: clampedX,
    top: clampedY,
  });
}

/**
 * Fixed Player Position Camera Model for Frontier Zoom
 *
 * CONCEPT: The player is ALWAYS at pixel position (200, 200) within the .homestead container.
 * The world scrolls to maintain this position, regardless of where the player is in the frontier.
 *
 * Position should be in frontier coordinates:
 * (settlementCol * 512 + gridCol * 64 + playerX, settlementRow * 512 + gridRow * 64 + playerY)
 *
 * NO CLAMPING: We allow unconstrained scrolling. Spillover content (padding settlements)
 * uses negative positioning to extend beyond the 8×8 frontier, ensuring there's always
 * visible content at the player's fixed screen position.
 */
export function centerCameraOnPlayerFrontier(position, TILE_SIZE, zoomScale = 1, retryCount = 0) {
  const gameContainer = document.querySelector(".homestead");
  if (!gameContainer) {
    if (retryCount < 5) {
      requestAnimationFrame(() => centerCameraOnPlayerFrontier(position, TILE_SIZE, zoomScale, retryCount + 1));
    }
    return;
  }

  // Guard against undefined position
  if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
    console.warn('⚠️ [CAMERA FRONTIER] Cannot center camera - invalid position:', position);
    return;
  }

  // Player's world position in scaled pixels
  const playerWorldX = position.x * TILE_SIZE * zoomScale;
  const playerWorldY = position.y * TILE_SIZE * zoomScale;

  // Scroll = player world position - fixed screen position (from CameraConstants)
  // NO padding offset needed - spillover uses negative positioning
  const scrollX = playerWorldX - PLAYER_FIXED_POSITION.x;
  const scrollY = playerWorldY - PLAYER_FIXED_POSITION.y;

  // NO CLAMPING - spillover content handles edge cases
  gameContainer.scrollTo({
    left: scrollX,
    top: scrollY,
  });
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

/**
 * Register the current player for camera tethering during movement animation.
 * This should be called from App.js when the player is initialized.
 * @param {string} playerId - The current player's ID
 * @param {number} tileSize - The current TILE_SIZE
 */
export function registerCurrentPlayerForCamera(playerId, tileSize) {
  registeredTileSize = tileSize;

  // Create a camera callback that will be called on each animation frame
  const cameraCallback = (interpolatedPosition) => {
    // Use instant camera update (not smooth) since we're already animating frame-by-frame
    centerCameraOnPlayerInstant(interpolatedPosition, registeredTileSize);
  };

  // Register with PlayersInGrid manager
  playersInGridManager.registerCurrentPlayer(playerId, cameraCallback);
}

/**
 * Instantly center the camera on a position without smooth scrolling.
 * NOTE: This function uses a simplified formula that doesn't account for the
 * unified world model (grid/settlement offsets). It's currently unused but
 * kept for future camera tethering implementation.
 */
function centerCameraOnPlayerInstant(position, TILE_SIZE, zoomScale = 1) {
  const gameContainer = document.querySelector(".homestead");
  if (!gameContainer) return;

  // Guard against undefined position
  if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
    return;
  }

  // Simple formula - doesn't account for unified world model offsets
  const playerWorldX = position.x * TILE_SIZE * zoomScale;
  const playerWorldY = position.y * TILE_SIZE * zoomScale;
  const scrollX = playerWorldX - PLAYER_FIXED_POSITION.x;
  const scrollY = playerWorldY - PLAYER_FIXED_POSITION.y;

  // Clamp to valid scroll bounds
  const maxScrollLeft = Math.max(0, gameContainer.scrollWidth - gameContainer.clientWidth);
  const maxScrollTop = Math.max(0, gameContainer.scrollHeight - gameContainer.clientHeight);
  const clampedX = Math.max(0, Math.min(scrollX, maxScrollLeft));
  const clampedY = Math.max(0, Math.min(scrollY, maxScrollTop));

  // Use instant scroll (no behavior or behavior: 'instant')
  gameContainer.scrollLeft = clampedX;
  gameContainer.scrollTop = clampedY;
}

// Export renderPositions at the end to avoid initialization issues
export { renderPositions };