import axios from 'axios';
import gridStateManager from './GridState/GridState'; // Correctly use gridStateManager
import GlobalGridState from './GridState/GlobalGridState';
import FloatingTextManager from "./UI/FloatingText";

let isAnimating = false; 
let currentAnimationFrame = null; 


// ✅ Function to check if movement is valid
function isValidMove(targetX, targetY, masterResources) {
  const tiles = GlobalGridState.getTiles();
  const resources = GlobalGridState.getResources();

  // ✅ Prevent crash if resources is malformed
  if (!Array.isArray(resources)) {
    console.warn('⛔ Movement blocked: resources is not an array yet.', resources);
    return false;
  }
  
  // 1️⃣ **Check if the target is out of bounds**
  if (targetX < 0 || targetY < 0 || targetX > 63 || targetY > 63) {
    console.warn(`⛔ Movement blocked: (${targetX}, ${targetY}) is out of bounds.`);
    return false;
  }

  // 2️⃣ **Check if tile is valid for movement (using existing isValidTile function)**
  const canMove = isTileValidForPlayer(targetX, targetY, tiles, resources, masterResources, []);
  if (!canMove) {
    console.warn(`⛔ Movement blocked: Tile (${targetX}, ${targetY}) is not passable.`);
  }
  return canMove;
}

/**
 * Handles key inputs for player movement and triggers smooth movement.
 */
export function handleKeyMovement(event, currentPlayer, TILE_SIZE, masterResources) {
  if (isAnimating) {
    console.warn('Movement in progress, input ignored.');
    return;
  }
  const directions = {
    ArrowUp: { dx: 0, dy: -1 },
    w: { dx: 0, dy: -1 },
    ArrowDown: { dx: 0, dy: 1 },
    s: { dx: 0, dy: 1 },
    ArrowLeft: { dx: -1, dy: 0 },
    a: { dx: -1, dy: 0 },
    ArrowRight: { dx: 1, dy: 0 },
    d: { dx: 1, dy: 0 },
  };

  const movement = directions[event.key];
  if (!movement) return;

  if (currentPlayer.iscamping) { 
    FloatingTextManager.addFloatingText(32, currentPlayer.location.x * TILE_SIZE, currentPlayer.location.y * TILE_SIZE + 25);
    return;
  }

  // Convert currentPlayer._id to string to match gridState.pcs keys
  const playerId = currentPlayer._id.toString();
  const gridId = currentPlayer.location.g;
  const gridState = gridStateManager.getGridState(gridId);
  
  if (!gridState || !gridState.pcs[playerId]) {
    console.error('Player not found in gridState.');
    return;
  }

  const playerPosition = gridState.pcs[playerId].position;
  console.log('playerPosition from gridState = ',playerPosition);
  const targetX = Math.round(playerPosition.x + movement.dx);  // Ensure integer target
  const targetY = Math.round(playerPosition.y + movement.dy);  // Ensure integer target

  // ✅ **Check if movement is allowed using `isValidMove`**
  if (!isValidMove(targetX, targetY, masterResources)) {
    console.warn(`⛔ Player blocked from moving to (${targetX}, ${targetY}).`);
    return;
  }

  movePlayerSmoothly(playerId, { x: targetX, y: targetY }, gridState, gridId, TILE_SIZE);
}

/**
 * Smoothly moves the player to a new position and updates the grid state.
 */
function movePlayerSmoothly(playerId, target, gridState, gridId, TILE_SIZE) {
  if (isAnimating) return; 


  console.log("movePlayerSmoothly:  target: ",target);
  console.log("movePlayerSmoothly:  playerId: ",playerId);
  console.log('gridState before movement:', gridState);

  // Update position
  const currentPosition = gridState.pcs[playerId].position;
  const currentX = currentPosition.x * TILE_SIZE;
  const currentY = currentPosition.y * TILE_SIZE;
  const targetX = target.x * TILE_SIZE;
  const targetY = target.y * TILE_SIZE;
  const stepCount = 10;
  let step = 0;

  function animate() {
    if (step >= stepCount) {
      isAnimating = false;
      currentAnimationFrame = null;

      // Round the final position to ensure it's on an integer tile
      const finalPosition = {
        x: Math.round(target.x),
        y: Math.round(target.y),
      };

      console.log('Final player position (rounded):', finalPosition);

      // Update local grid state with the final position
      gridState.pcs[playerId].position = finalPosition;
      // Save updated grid state to the server
      gridStateManager.saveGridState(gridId);

      // ✅ Center camera on player after final position is set
      centerCameraOnPlayer(finalPosition, TILE_SIZE);

      return;
    }

    // Interpolate positions smoothly for rendering purposes only
    const interpolatedX = currentX + ((targetX - currentX) / stepCount) * step;
    const interpolatedY = currentY + ((targetY - currentY) / stepCount) * step;

    // Update local grid state for animation (but do not save these intermediate values)
    gridState.pcs[playerId].position = {
      x: interpolatedX / TILE_SIZE,
      y: interpolatedY / TILE_SIZE,
    };

    step++;
    currentAnimationFrame = requestAnimationFrame(animate);
  }

  animate();
}

export function centerCameraOnPlayer(position, TILE_SIZE) {
  const gameContainer = document.querySelector(".homestead"); // Adjust this if needed
  if (!gameContainer) return;

  // Calculate the center position
  const centerX = position.x * TILE_SIZE - window.innerWidth / 2;
  const centerY = position.y * TILE_SIZE - window.innerHeight / 2;

  gameContainer.scrollTo({
    left: centerX,
    top: centerY,
    behavior: "smooth", // Smooth scrolling effect
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
  if (!tileType) {
    console.warn(`⛔ Invalid tile at (${x}, ${y}) - No tileType found.`);
    return false;
  }


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