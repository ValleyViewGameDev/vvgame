import axios from 'axios';
import { animateRemotePC } from './Render/RenderAnimatePosition';
import playersInGridManager from './GridState/PlayersInGrid'; // Correctly use NPCsInGridManager
import GlobalGridStateTilesAndResources from './GridState/GlobalGridStateTilesAndResources';
import FloatingTextManager from "./UI/FloatingText";
import { handleTransitSignpost } from './GameFeatures/Transit/Transit';
// Temporary render-only animation state for interpolated player positions
export const renderPositions = {};
let currentAnimationFrame = null; 

export function handleKeyMovement(event, currentPlayer, TILE_SIZE, masterResources, 
  setCurrentPlayer, 
  setGridId, 
  setGrid, 
  setTileTypes, 
  setResources, 
  updateStatus, 
  closeAllPanels) 
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

  const movement = directions[event.key];
  if (!movement) return;

  if (currentPlayer.iscamping) {
    FloatingTextManager.addFloatingText(32, currentPlayer.location.x, currentPlayer.location.y, TILE_SIZE);
    return;
  }

  const playerId = currentPlayer._id.toString();
  const gridId = currentPlayer.location.g;
  const playersInGrid = playersInGridManager.getPlayersInGrid(gridId);
  if (!playersInGrid || !playersInGrid[playerId]) return;

  const currentPosition = playersInGrid[playerId].position;
  const targetX = Math.round(currentPosition.x + movement.dx);
  const targetY = Math.round(currentPosition.y + movement.dy);

  // Check if player is in boat and restrict movement to water tiles only
  if (currentPlayer.isinboat) {
    const tiles = GlobalGridStateTilesAndResources.getTiles();
    const targetTileType = tiles?.[targetY]?.[targetX];
    if (targetTileType !== 'w') {
      FloatingTextManager.addFloatingText("Can only move to water while in boat.", currentPlayer.location.x, currentPlayer.location.y, TILE_SIZE);
      return;
    }
    // For boat users moving to water, skip the normal isValidMove check
  } else {
    // Normal movement validation for non-boat users
    if (!Array.isArray(masterResources)) {
      console.error('masterResources is not an array:', masterResources);
      return;
    }
    if (!isValidMove(targetX, targetY, masterResources,
      currentPlayer,
      setCurrentPlayer,
      setGridId,
      setGrid,
      setTileTypes,
      setResources,
      updateStatus,
      TILE_SIZE,
      closeAllPanels,
    )) {
      console.warn(`⛔ Player blocked from moving to (${targetX}, ${targetY}).`);
      return;
    }
  }

  const finalPosition = { x: targetX, y: targetY };
  console.log('➡️ Simple move to:', finalPosition);

  const now = Date.now();

  playersInGridManager.updatePC(gridId, playerId, {
    position: finalPosition,
    lastUpdated: now,
  });

  centerCameraOnPlayer(finalPosition, TILE_SIZE);

}

function isValidMove(targetX, targetY, masterResources,
  currentPlayer,
  setCurrentPlayer,
  setGridId,
  setGrid,
  setTileTypes,
  setResources,
  updateStatus,
  TILE_SIZE,
  closeAllPanels,
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
      closeAllPanels
    );
    return false; // Prevent normal movement handling
  };

  // 2️⃣ **Check if tile is valid for movement (using existing isValidTile function)**
  const canMove = isTileValidForPlayer(targetX, targetY, tiles, resources, masterResources, []);
  if (!canMove) {
    console.warn(`⛔ Movement blocked: Tile (${targetX}, ${targetY}) is not passable.`);
  }
  return canMove;
}


export function centerCameraOnPlayer(position, TILE_SIZE) {
  const gameContainer = document.querySelector(".homestead");
  if (!gameContainer) return;

  const LEFT_PANEL_WIDTH = 300;  // Scaled with zoom level
  const HEADER_HEIGHT = 200;     // Same

  const centerX = position.x * TILE_SIZE - (window.innerWidth - LEFT_PANEL_WIDTH) / 2;
  const centerY = position.y * TILE_SIZE - (window.innerHeight - HEADER_HEIGHT) / 2;

  // Clamp scroll positions so we don't scroll beyond the container's bounds
  const maxScrollLeft = gameContainer.scrollWidth - gameContainer.clientWidth;
  const maxScrollTop = gameContainer.scrollHeight - gameContainer.clientHeight;

  const clampedX = Math.max(0, Math.min(centerX, maxScrollLeft));
  const clampedY = Math.max(0, Math.min(centerY, maxScrollTop));

  gameContainer.scrollTo({
    left: clampedX,
    top: clampedY,
    behavior: "smooth",
  });

  console.log(`📷 Camera centered on player at (${position.x}, ${position.y})`);
}


export function isTileValidForPlayer(x, y, tiles, resources, masterResources) {
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

  // **Step 1: Check if tile itself is passable using masterResources**
  const tileResource = masterResources.find(resource => resource.type === tileType);

  if (!tileResource || !tileResource.passable) {
    console.warn(`⛔ Tile (${x}, ${y}) is not passable according to masterResources.`);
    return false;
  }
  // **Step 2: Check for an impassable resource in this tile**
  const resourceInTile = resources.find(res => res.x === x && res.y === y);
  if (resourceInTile) {
    if (!resourceInTile.passable) {
      console.warn(`⛔ Tile (${x}, ${y}) contains an impassable resource (${resourceInTile.type}).`);
      return false;
    }
  }
  // ✅ If all checks pass, movement is allowed
  return true;
}