import axios from 'axios';
import gridStatePCManager from './GridState/GridStatePCs'; // Correctly use gridStateManager
import GlobalGridStateTilesAndResources from './GridState/GlobalGridStateTilesAndResources';
import FloatingTextManager from "./UI/FloatingText";
// Temporary render-only animation state for interpolated player positions
export const renderPositions = {};

let isAnimating = false; 
let currentAnimationFrame = null; 

function isValidMove(targetX, targetY, masterResources) {  // Function to check if movement is valid
  const tiles = GlobalGridStateTilesAndResources.getTiles();
  const resources = GlobalGridStateTilesAndResources.getResources();

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
export function handleKeyMovement(event, currentPlayer, setGridStatePCs, TILE_SIZE, masterResources) {
  if (isAnimating) { console.warn('Movement in progress, input ignored.'); return; }

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
  // Convert currentPlayer._id to string to match gridStatePCs keys
  const playerId = currentPlayer._id.toString();
  const gridId = currentPlayer.location.g;
  const gridStatePCs = gridStatePCManager.getGridStatePCs(gridId);
  if (!gridStatePCs || !gridStatePCs[playerId]) {
    console.error('Player not found in gridStatePCs.');
    return;
  }
  const playerPosition = gridStatePCs[playerId].position;
  console.log('playerPosition from gridStatePCs = ', playerPosition);
  const targetX = Math.round(playerPosition.x + movement.dx);  // Ensure integer target
  const targetY = Math.round(playerPosition.y + movement.dy);  // Ensure integer target

  // ✅ **Check if movement is allowed using `isValidMove`**
  if (!isValidMove(targetX, targetY, masterResources)) {
    console.warn(`⛔ Player blocked from moving to (${targetX}, ${targetY}).`);
    return;
  }
  movePlayerSmoothly(playerId, { x: targetX, y: targetY }, gridStatePCs, setGridStatePCs, gridId, TILE_SIZE);
}

/**
 * Smoothly moves the player to a new position and updates the grid state.
 */
function movePlayerSmoothly(playerId, target, gridStatePCs, setGridStatePCs, gridId, TILE_SIZE) {
  if (isAnimating) return;

  console.log("movePlayerSmoothly:  target: ", target, "; playerId: ", playerId);
  console.log('gridStatePCs before movement:', gridStatePCs);
  console.log("Known gridStatePCs keys:", Object.keys(gridStatePCs));

  // Get current position
  const currentPosition = gridStatePCs?.[playerId]?.position;
  if (!currentPosition) {
    console.error(`❌ Could not find position for playerId ${playerId} in gridStatePCs.`);
    return;
  }
  const currentX = currentPosition.x * TILE_SIZE;
  const currentY = currentPosition.y * TILE_SIZE;
  const targetX = target.x * TILE_SIZE;
  const targetY = target.y * TILE_SIZE;
  console.log(`Initial pixel position: (${currentX}, ${currentY})`);
  console.log(`Target pixel position: (${targetX}, ${targetY})`);
  const stepCount = 10;
  let step = 0;

  function animate() {
    // Logging before interpolation
    console.log(`🌀 Animating step ${step}/${stepCount}`);
    console.log('renderPositions before update:', renderPositions);
    if (step >= stepCount) {
      isAnimating = false;
      currentAnimationFrame = null;

      const finalPosition = { x: Math.round(target.x), y: Math.round(target.y) };
      console.log('Final player position (rounded):', finalPosition);

      gridStatePCManager.updatePC(gridId, playerId, { position: finalPosition });
      setGridStatePCs(prev => ({
        ...prev,
        [gridId]: {
          ...prev[gridId],
          [playerId]: {
            ...prev[gridId]?.[playerId],
            position: finalPosition,
            lastUpdated: Date.now(),
          },
        },
      }));

      centerCameraOnPlayer(finalPosition, TILE_SIZE);

      // Delay clearing renderPositions until after final frame renders, with an extra frame delay
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          delete renderPositions[playerId];
        });
      });

      return;
    }

    const interpolatedX = currentX + ((targetX - currentX) / stepCount) * step;
    const interpolatedY = currentY + ((targetY - currentY) / stepCount) * step;
    renderPositions[playerId] = {
      x: interpolatedX / TILE_SIZE,
      y: interpolatedY / TILE_SIZE,
    };
    // Logging after update
    console.log('renderPositions after update:', renderPositions[playerId]);

    step++;
    // Logging before queuing next frame
    console.log(`🔁 Queuing next animation frame: step ${step}`);
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