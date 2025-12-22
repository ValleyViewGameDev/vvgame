import axios from 'axios';
import { animateRemotePC } from './Render/RenderAnimatePosition';
import playersInGridManager from './GridState/PlayersInGrid'; // Correctly use NPCsInGridManager
import GlobalGridStateTilesAndResources from './GridState/GlobalGridStateTilesAndResources';
import FloatingTextManager from "./UI/FloatingText";
import { handleTransitSignpost } from './GameFeatures/Transit/Transit';
// Temporary render-only animation state for interpolated player positions
const renderPositions = {};
let currentAnimationFrame = null;

// Track currently pressed keys for diagonal movement
const pressedKeys = new Set();

// Define modifier keys that should be ignored for movement
const MODIFIER_KEYS = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'NumLock', 'ScrollLock'];

// Clear all pressed keys when window loses focus or visibility
if (typeof window !== 'undefined') {
  window.addEventListener('blur', () => {
    pressedKeys.clear();
  });
  
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pressedKeys.clear();
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
  pressedKeys.add(event.key);
  
  // Process movement immediately (fire and forget - we don't await to keep input responsive)
  processMovement(currentPlayer, TILE_SIZE, masterResources, 
    setCurrentPlayer, setGridId, setGrid, setTileTypes, setResources, 
    updateStatus, closeAllPanels, localPlayerMoveTimestampRef, bulkOperationContext, strings, transitionFadeControl).catch(err => {
      console.error('Error processing movement:', err);
    });
}

// Helper function to handle key release events
export function handleKeyUp(event) {
  // Remove the key from our set of pressed keys
  pressedKeys.delete(event.key);
  
  // Also clear all keys if a modifier is released (failsafe)
  if (MODIFIER_KEYS.includes(event.key)) {
    pressedKeys.clear();
  }
}

// Main movement handler that processes diagonal movement
export async function handleKeyMovement(event, currentPlayer, TILE_SIZE, masterResources, 
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
  // For backward compatibility, treat this as a key press
  handleKeyDown(event, currentPlayer, TILE_SIZE, masterResources, 
    setCurrentPlayer, setGridId, setGrid, setTileTypes, setResources, 
    updateStatus, closeAllPanels, localPlayerMoveTimestampRef, bulkOperationContext, strings, transitionFadeControl);
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
    ArrowUp: { dx: 0, dy: -1 },
    w: { dx: 0, dy: -1 },
    W: { dx: 0, dy: -1 },
    ArrowDown: { dx: 0, dy: 1 },
    s: { dx: 0, dy: 1 },
    S: { dx: 0, dy: 1 },
    ArrowLeft: { dx: -1, dy: 0 },
    a: { dx: -1, dy: 0 },
    A: { dx: -1, dy: 0 },
    ArrowRight: { dx: 1, dy: 0 },
    d: { dx: 1, dy: 0 },
    D: { dx: 1, dy: 0 },
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
  const now = Date.now();
  
  // Update the local player movement timestamp to prevent our own broadcasts from overriding
  if (localPlayerMoveTimestampRef) {
    localPlayerMoveTimestampRef.current = now;
  }

  playersInGridManager.updatePC(gridId, playerId, {
    position: finalPosition,
    lastUpdated: now,
  });

  centerCameraOnPlayer(finalPosition, TILE_SIZE);
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
    
    // 🌑 Start fade transition IMMEDIATELY for responsive feel
    if (transitionFadeControl?.startTransition) {
      console.log('🌑 [IMMEDIATE FADE] Starting fade transition for boundary crossing');
      transitionFadeControl.startTransition();
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


export function centerCameraOnPlayer(position, TILE_SIZE, retryCount = 0) {
  const gameContainer = document.querySelector(".homestead");
  if (!gameContainer) {
    // Container not ready yet, retry after a short delay (Safari fix)
    if (retryCount < 5) {
      requestAnimationFrame(() => centerCameraOnPlayer(position, TILE_SIZE, retryCount + 1));
    }
    return;
  }

  // Guard against undefined position during network delays
  if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
    console.warn('⚠️ [CAMERA] Cannot center camera - invalid position:', position);
    return;
  }

  const LEFT_PANEL_WIDTH = 300;  // Scaled with zoom level
  const HEADER_HEIGHT = 200;     // Same

  const centerX = position.x * TILE_SIZE - (window.innerWidth - LEFT_PANEL_WIDTH) / 2;
  const centerY = position.y * TILE_SIZE - (window.innerHeight - HEADER_HEIGHT) / 2;

  // Clamp scroll positions so we don't scroll beyond the container's bounds
  const maxScrollLeft = gameContainer.scrollWidth - gameContainer.clientWidth;
  const maxScrollTop = gameContainer.scrollHeight - gameContainer.clientHeight;

  // Safari fix: If container hasn't laid out yet (scroll dimensions are 0), retry
  if (maxScrollLeft <= 0 && maxScrollTop <= 0 && centerX > 0 && retryCount < 10) {
    console.log(`📷 [CAMERA] Container not ready, retrying... (attempt ${retryCount + 1})`);
    requestAnimationFrame(() => centerCameraOnPlayer(position, TILE_SIZE, retryCount + 1));
    return;
  }

  const clampedX = Math.max(0, Math.min(centerX, maxScrollLeft));
  const clampedY = Math.max(0, Math.min(centerY, maxScrollTop));

  gameContainer.scrollTo({
    left: clampedX,
    top: clampedY,
    behavior: "smooth",
  });

  //console.log(`📷 Camera centered on player at (${position.x}, ${position.y})`);
}


export function centerCameraOnPlayerFast(position, TILE_SIZE, retryCount = 0) {
  const gameContainer = document.querySelector(".homestead");
  if (!gameContainer) {
    // Container not ready yet, retry after a short delay (Safari fix)
    if (retryCount < 5) {
      requestAnimationFrame(() => centerCameraOnPlayerFast(position, TILE_SIZE, retryCount + 1));
    }
    return;
  }

  // Guard against undefined position during network delays
  if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
    console.warn('⚠️ [CAMERA FAST] Cannot center camera - invalid position:', position);
    return;
  }

  const LEFT_PANEL_WIDTH = 300;  // Scaled with zoom level
  const HEADER_HEIGHT = 200;     // Same

  const centerX = position.x * TILE_SIZE - (window.innerWidth - LEFT_PANEL_WIDTH) / 2;
  const centerY = position.y * TILE_SIZE - (window.innerHeight - HEADER_HEIGHT) / 2;

  // Clamp scroll positions so we don't scroll beyond the container's bounds
  const maxScrollLeft = gameContainer.scrollWidth - gameContainer.clientWidth;
  const maxScrollTop = gameContainer.scrollHeight - gameContainer.clientHeight;

  // Safari fix: If container hasn't laid out yet (scroll dimensions are 0), retry
  if (maxScrollLeft <= 0 && maxScrollTop <= 0 && centerX > 0 && retryCount < 10) {
    console.log(`📷 [CAMERA FAST] Container not ready, retrying... (attempt ${retryCount + 1})`);
    requestAnimationFrame(() => centerCameraOnPlayerFast(position, TILE_SIZE, retryCount + 1));
    return;
  }

  const clampedX = Math.max(0, Math.min(centerX, maxScrollLeft));
  const clampedY = Math.max(0, Math.min(centerY, maxScrollTop));

  gameContainer.scrollTo({
    left: clampedX,
    top: clampedY,
  });

  console.log(`📷 Camera centered on player at (${position.x}, ${position.y})`);
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
  // ✅ If all checks pass, movement is allowed
  return true;
}

// Export renderPositions at the end to avoid initialization issues
export { renderPositions };