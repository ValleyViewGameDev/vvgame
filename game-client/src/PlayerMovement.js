import axios from 'axios';
import { animateRemotePC } from './Render/RenderAnimatePosition';
import playersInGridManager from './GridState/PlayersInGrid'; // Correctly use NPCsInGridManager
import GlobalGridStateTilesAndResources from './GridState/GlobalGridStateTilesAndResources';
import FloatingTextManager from "./UI/FloatingText";
// Temporary render-only animation state for interpolated player positions
export const renderPositions = {};

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

export function handleKeyMovement(event, currentPlayer, TILE_SIZE, masterResources) {

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

  if (!Array.isArray(masterResources)) {
    console.error('masterResources is not an array:', masterResources);
    return;
  }

  if (!isValidMove(targetX, targetY, masterResources)) {
    console.warn(`⛔ Player blocked from moving to (${targetX}, ${targetY}).`);
    return;
  }

  const finalPosition = { x: targetX, y: targetY };
  console.log('➡️ Simple move to:', finalPosition);
  
  const stepCount = 10;
  let step = 0;
  const currentX = currentPosition.x * TILE_SIZE;
  const currentY = currentPosition.y * TILE_SIZE;
  const targetXpx = finalPosition.x * TILE_SIZE;
  const targetYpx = finalPosition.y * TILE_SIZE;

  const now = Date.now();

  playersInGridManager.updatePC(gridId, playerId, {
    position: finalPosition,
    lastUpdated: now,
  });

  centerCameraOnPlayer(finalPosition, TILE_SIZE);


  // function animate() {
  //   if (step >= stepCount) {
  //     const now = Date.now();
  //     console.log(`🦶🦶 Player ${playerId} moved to (${finalPosition.x}, ${finalPosition.y})`);
  //     console.log('🦶🦶 About to call updatePC');
      
  //     playersInGridManager.updatePC(gridId, playerId, {
  //       position: finalPosition,
  //       lastUpdated: now,
  //     });
    
  //     centerCameraOnPlayer(finalPosition, TILE_SIZE);
    
  //     // ⏳ Wait until pc.position has caught up before clearing render override
  //     const waitForFlush = () => {
  //       const confirmedPosition = playersInGridManager.getPlayerPosition(gridId, playerId);
  //       if (
  //         confirmedPosition &&
  //         confirmedPosition.x === finalPosition.x &&
  //         confirmedPosition.y === finalPosition.y
  //       ) {
  //         delete renderPositions[playerId];
  //         console.log(`✅ Cleared render override for ${playerId} after confirmed update`);
  //       } else {
  //         requestAnimationFrame(waitForFlush);
  //       }
  //     };
  //     requestAnimationFrame(waitForFlush);
    
  //     return;
  //   }
    
  //   const interpolatedX = currentX + ((targetXpx - currentX) / stepCount) * step;
  //   const interpolatedY = currentY + ((targetYpx - currentY) / stepCount) * step;
  //   renderPositions[playerId] = {
  //     x: interpolatedX / TILE_SIZE,
  //     y: interpolatedY / TILE_SIZE,
  //   };

  //   step++;
  //   requestAnimationFrame(animate);
  // }
 
  // animate();

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