import gridStateManager from '../../GridState/GridState';
import { calculateDistance } from './NPCHelpers';
import { attachGrazingBehavior } from './NPCGrazing';
import { attachQuestBehavior } from './NPCQuestGiver';
import { attachEnemyBehavior } from './NPCEnemy';
import { attachHealBehavior } from './NPCHeal';
import { attachSpawnBehavior } from './NPCSpawner';

class NPC {
  constructor(id, type, position, properties, gridId) {
    console.log('NPC constructor: properties:', properties);
    console.log(`NPC constructor: ID=${id}, type=${type}, grazeEnd=`, properties.grazeEnd);

    if (!properties || typeof properties !== 'object') {
      console.error(`Invalid properties passed to NPC constructor for type ${type}:`, properties);
      throw new Error('NPC constructor requires valid properties.');
    }

    this.gridId = gridId; // Persist gridId in the instance
    this.updateInterval = properties.updateInterval || 1000; // Default to 1 second updates
    this.id = id;
    this.type = type;
    this.position = {
      x: Math.floor(position.x),
      y: Math.floor(position.y),
    };
    this.symbol = properties.symbol;
    this.hp = properties.hp || 0; // Use hp as hunger
    this.output = properties.output;
    this.maxhp = properties.hp || 0;
    this.range = properties.range;
    this.action = properties.action; // High-level behavioral category (e.g., "graze")
    this.state = 'idle'; // Default state
    this.speed = properties.speed;
    this.growTime = properties.growtime || 0; // Time to fully graze
    this.lastMoveTime = 0; // Initialize lastMoveTime
    this.processingStartTime = undefined;
    this.nextspawn = properties.nextspawn ?? (this.action === 'spawn' ? Date.now() + 5000 : null);
    this.grazeEnd = properties.grazeEnd || null; // this is preserved from gridState

    // Assign additional properties
    Object.assign(this, properties);
  }


/////////////////
// NPC CORE   ///
/////////////////

update(currentTime, gridState, gridId, TILE_SIZE) {

  const timeElapsed = currentTime - this.lastUpdateTime;
  if (timeElapsed < this.updateInterval) {
      return; // Skip update if interval hasn't passed
  }
  //console.log(`NPC ${this.id} processing update.`);
  this.processState(gridState, gridId, TILE_SIZE);
  this.lastUpdateTime = currentTime; // Reset the timer
}

async processState(gridState, gridId, TILE_SIZE) {

  const npcs = Object.values(gridStateManager.getGridState(gridId)?.npcs || {}); 

  try {
    console.log(`NPCprocessState for NPC ${this.id}. action: ${this.action}, Current state: ${this.state}, gridId: ${gridId}`);
    // Call the behavior handler

    switch (this.action) {

      case 'graze':
        await this.handleFarmAnimalBehavior(gridId);
        break;
    
      case 'pester':
        // Future implementation for Pests
        // console.log('Pester behavior not implemented yet.');
        break;
    
      case 'quest':
        await this.handleQuestGiverBehavior(gridId);
        break;
    
      case 'attack':
        await this.handleEnemyBehavior(gridId, TILE_SIZE);
        break;
    
      case 'heal':
        await this.handleHealBehavior(gridId);
        break;
    
      case 'spawn':
        await this.handleSpawnBehavior(gridId);
        break;

      case 'steal':
        // Future implementation for Bandits
        console.log('Steal behavior not implemented yet.');
        break;
    
      case 'work':
        // Future implementation for Farm Hands
        console.log('Work behavior not implemented yet.');
        break;
    
      default:
        console.warn(`Unhandled NPC action: ${this.action}`);
        break;
    }
    } catch (error) {
      console.error(`Error in NPC ${this.id} processState:`, error);
    }
}


//////////////////////////////
// NPC -- SHARED BEHAVIORS //
/////////////////////////////


async handleIdleState(tiles, resources, npcs, idleDuration, onTransition = () => {}) {  // Initialize the idle timer if it doesn't exist
  if (!this.idleTimer) {
    this.idleTimer = 0;
    //console.log(`NPC ${this.id} starting idle timer.`);
  }

  // Increment the idle timer
  this.idleTimer++;

  // Check if the idle timer has reached the threshold
  if (this.idleTimer >= idleDuration) {
    //console.log(`NPC ${this.id} completed IDLE state. Timer reached ${this.idleTimer}.`);

    // Reset the timer
    this.idleTimer = 0;

    // Define all possible directions
    const directions = ['N', 'S', 'E', 'W', 'NE', 'SE', 'SW', 'NW'];

    // Filter valid directions for movement
    const validDirections = directions.filter((direction) => {
      const { x, y } = this.getAdjacentTile(direction);
      return this.isValidTile(x, y, tiles, resources, npcs);
    });

    if (validDirections.length > 0) {
      // Choose a random valid direction
      const randomDirection = validDirections[Math.floor(Math.random() * validDirections.length)];
      //console.log(`NPC ${this.id} attempting to move one tile in direction: ${randomDirection}`);

      // Wait for movement to complete **before transitioning**
      const moved = await this.moveOneTile(randomDirection, tiles, resources, npcs);
      
      if (!moved) {
        // console.warn(`NPC ${this.id} failed to move. Transitioning anyway.`);
      }
    } else {
      // console.warn(`NPC ${this.id} has no valid tiles to move. Staying in current position.`);
    }

  } else {
    //console.log(`NPC ${this.id} is idling. Timer: ${this.idleTimer}/${idleDuration}`);
  }
}


async handleRoamState(tiles, resources, npcs = () => {}) {  //console.log(`NPC ${this.id} is in ROAM state.`);
  // Initialize roam step counter and range
  this.roamSteps = this.roamSteps || 0;
  const range = this.range || 4; // Default roam range

  // If no initial direction is set, choose one at random
  if (!this.currentDirection) {
    const directions = ['N', 'S', 'E', 'W', 'NE', 'SE', 'SW', 'NW'];
    this.currentDirection = directions[Math.floor(Math.random() * directions.length)];
    //console.log(`NPC ${this.id} selected initial roam direction: ${this.currentDirection}`);
  }

  // Define preferred directions based on the initial direction
  const preferredDirectionsMap = {
    N: ['N', 'NE', 'NW'],
    S: ['S', 'SE', 'SW'],
    E: ['E', 'NE', 'SE'],
    W: ['W', 'NW', 'SW'],
    NE: ['NE', 'N', 'E'],
    SE: ['SE', 'S', 'E'],
    SW: ['SW', 'S', 'W'],
    NW: ['NW', 'N', 'W'],
  };

  const preferredDirections = preferredDirectionsMap[this.currentDirection] || [this.currentDirection];

  // Filter valid directions
  const validDirections = preferredDirections.filter((direction) => {
    const { x, y } = this.getAdjacentTile(direction);
    return this.isValidTile(x, y, tiles, resources, npcs);
  });

  if (validDirections.length === 0) {
    //console.warn(`NPC ${this.id} cannot find a valid tile to move in the current direction.`);
    this.currentDirection = null; // Reset direction to choose a new one
    return; // Wait for the next cycle to pick a new direction
  }

  // Pick a valid direction at random from the preferred directions
  const direction = validDirections[Math.floor(Math.random() * validDirections.length)];
  //console.log(`NPC ${this.id} moving one tile in direction: ${direction}`);

  // Move one tile in the chosen direction
  await this.moveOneTile(direction, tiles, resources, npcs);

  //console.log(`NPC ${this.id} successfully moved to (${this.position.x}, ${this.position.y}).`);
  this.roamSteps++;

  // Check if the NPC has completed the roam range
  if (this.roamSteps >= range) {
    //console.log(`NPC ${this.id} completed ${range} roam steps. Transitioning to the next state.`);
    this.roamSteps = 0; // Reset roam steps
    this.currentDirection = null; // Reset direction for the next roam
  }
}

async handlePursueState(playerPosition, tiles, resources, npcs, onAttackTransition) {
  //console.log(`NPC ${this.id} pursuing player...`);

  // Calculate the differences
  const dx = playerPosition.x - this.position.x;
  const dy = playerPosition.y - this.position.y;

  // Determine primary direction to move
  let direction = null;
  if (Math.abs(dx) > Math.abs(dy)) {
    direction = dx > 0 ? 'E' : 'W';
  } else if (dy !== 0) {
    direction = dy > 0 ? 'S' : 'N';
  }

  // Add diagonal movement if applicable
  if (Math.abs(dx) === Math.abs(dy)) {
    if (dx > 0 && dy > 0) direction = 'SE';
    else if (dx > 0 && dy < 0) direction = 'NE';
    else if (dx < 0 && dy > 0) direction = 'SW';
    else if (dx < 0 && dy < 0) direction = 'NW';
  }

  if (!direction) {
    // console.warn(`NPC ${this.id} could not determine a valid direction to pursue.`);
    return;
  }

  // Move one tile in the determined direction
  const moved = await this.moveOneTile(direction, tiles, resources, npcs);
  if (moved) {
    //console.log(`NPC ${this.id} moved one tile in direction: ${direction}`);
  }

  // Check if within attack range and transition to "attack" if true
  const distanceToPlayer = calculateDistance(this.position, playerPosition);
  if (distanceToPlayer <= this.attackrange) {
    //console.log(`NPC ${this.id} is within attack range (${distanceToPlayer} tiles). Transitioning to attack.`);
    this.state = 'attack';
    onAttackTransition(); // Callback if needed for further behavior
  }
}

/////////////////
// NPC UTILITY //
/////////////////

async moveOneTile(direction, tiles, resources, npcs) {

  if (this.action === 'spawn') {
    console.warn(`Spawner ${this.id} cannot move!`);
    return false; // ✅ Prevents spawners from moving at all
}
  const directions = {
      N: { x: 0, y: -1 },
      S: { x: 0, y: 1 },
      E: { x: 1, y: 0 },
      W: { x: -1, y: 0 },
      NE: { x: 1, y: -1 },
      SE: { x: 1, y: 1 },
      SW: { x: -1, y: 1 },
      NW: { x: -1, y: -1 },
  };

  const delta = directions[direction];
  if (!delta) {
      //console.error(`Invalid direction: ${direction}`);
      return false;
  }

  const targetX = Math.floor(this.position.x + delta.x);
  const targetY = Math.floor(this.position.y + delta.y);

  // Validate the tile before moving
  if (!this.isValidTile(targetX, targetY, tiles, resources, npcs)) {
      //console.warn(`NPC ${this.id} cannot move to invalid tile (${targetX}, ${targetY}).`);
      return false;
  }

  const moveDuration = this.speed; // Total time to move one tile (ms)
  const startTime = performance.now(); // Get the start time
  const startX = this.position.x;
  const startY = this.position.y;

  return new Promise((resolve) => {
      const step = () => {
          const currentTime = performance.now();
          const elapsedTime = currentTime - startTime;

          if (elapsedTime >= moveDuration) {
              // Snap to the final position and resolve
              this.position.x = targetX;
              this.position.y = targetY;
              //console.log(`NPC ${this.id} completed move to (${this.position.x}, ${this.position.y}).`);
              resolve(true);
              return;
          }

          // Calculate the fractional progress
          const progress = elapsedTime / moveDuration;
          this.position.x = startX + progress * (targetX - startX);
          this.position.y = startY + progress * (targetY - startY);

          // Request the next frame
          requestAnimationFrame(step);
      };

      requestAnimationFrame(step);
  });
}

getAdjacentTile(direction) {
  const directions = {
      N: { x: 0, y: -1 },
      S: { x: 0, y: 1 },
      E: { x: 1, y: 0 },
      W: { x: -1, y: 0 },
      NE: { x: 1, y: -1 },
      SE: { x: 1, y: 1 },
      SW: { x: -1, y: 1 },
      NW: { x: -1, y: -1 },
  };

  const delta = directions[direction];
  if (!delta) {
      console.error(`Invalid direction: ${direction}`);
      return { x: this.position.x, y: this.position.y };
  }

  //console.log('getAdjacentTile: x = ',this.position.x + delta.x,' y = ',this.position.y + delta.y);
  return {
      x: this.position.x + delta.x,
      y: this.position.y + delta.y,
  };
}

isValidTile(x, y, tiles, resources, npcs) {

    // Round x and y to ensure valid integer indices
    x = Math.floor(x);
    y = Math.floor(y);

  // Check if tiles data is valid
  if (!tiles || !Array.isArray(tiles)) {
    //console.error('isValidTile; Tiles data is invalid.');
    return false;
  }
  if (!resources || !Array.isArray(resources)) {
    //console.error('isValidTile; Resources data is invalid or missing.');
    return false;
}
  // Check if tile is out of bounds
  if (x < 0 || y < 0 || y >= tiles.length || x >= tiles[0].length) {
    //console.error(`Tile (${x}, ${y}) is out of bounds.`);
    return false;
  } else {
    //console.log(`Tile (${x}, ${y}) is in bounds.`);
  }

    // **Step 1: Check if NPC is allowed to step on this tile type**
    const tileType = tiles[y][x]; // Get the tile type at x, y
    //console.log(`Checking tileType: ${tileType} for NPC ${this.id}`);
  
    const canWalkOnTile =
      (tileType === 'g' && this.validong) || 
      (tileType === 'p' && this.validonp) || 
      (tileType === 'w' && this.validonw) || 
      (tileType === 'd' && this.validond) || 
      (tileType === 'l' && this.validonl) || 
      (tileType === 's' && this.validons);
  
    if (!canWalkOnTile) {
    //   console.warn(`NPC ${this.id} cannot step on tile type "${tileType}".`);
      return false;
    }
  
    // **Step 2: Check if there's an impassable resource in this tile**
    const resourceInTile = resources.find((res) => res.x === x && res.y === y);
    if (resourceInTile) {
  
      if (!resourceInTile.passable) {
      //   console.warn(`Tile (${x}, ${y}) is occupied by an impassable resource.`);
        return false;
      }
    }
  
  // Ensure npcs is an array before calling .some()
  if (!Array.isArray(npcs)) {
    console.warn(`NPC list is invalid or undefined. Skipping NPC collision check.`);
    return true;
  }

  // Check if another NPC is occupying the tile
  const npcInTile = npcs.some(npc => Math.floor(npc.position.x) === x && Math.floor(npc.position.y) === y);
  if (npcInTile) {
    //console.warn(`Tile (${x}, ${y}) is already occupied by another NPC.`);
    return false;
  }

  //console.log(`Tile (${x}, ${y}) is valid for movement.`);
  return true;
}



async findTileInRange(tileType, tiles, resources) {
  const range = Math.floor(this.range || 3); // Ensure integer range
  const startX = Math.floor(this.position.x);
  const startY = Math.floor(this.position.y);

  if (!tiles || tiles.length === 0 || !Array.isArray(tiles)) {
    // console.error('Tiles array is invalid or empty.');
    return [];
  }

  const potentialTiles = [];
  for (let dx = -range; dx <= range; dx++) {
    for (let dy = -range; dy <= range; dy++) {
      const x = startX + dx;
      const y = startY + dy;

      if (x < 0 || y < 0 || y >= tiles.length || x >= tiles[y]?.length) continue;

      if (tiles[y][x] === tileType) {
        potentialTiles.push({ x, y });
      }
    }
  }

  console.log(`Found ${potentialTiles.length} potential tiles for type "${tileType}".`);
  return potentialTiles;
}


findNearestResource(targetResource, tiles, resources) {
  //console.log(`Finding nearest ${targetResource} for NPC ${this.id}.`);

  if (!resources || !Array.isArray(resources) || resources.length === 0) {
    //console.error(`Resources are invalid or empty for NPC ${this.id}.`);
    return null;
  }
  const npcPosition = {
    x: Math.floor(this.position.x),
    y: Math.floor(this.position.y),
  };
  const availableResources = resources.filter((res) => {
    return res.category === targetResource && typeof res.x === 'number' && typeof res.y === 'number';
  });
  if (availableResources.length === 0) {
    //console.warn(`No available ${targetResource} found for NPC ${this.id}.`);
    return null;
  }
  availableResources.sort((a, b) => {
    const aPos = { x: Math.floor(a.x), y: Math.floor(a.y) };
    const bPos = { x: Math.floor(b.x), y: Math.floor(b.y) };
    return calculateDistance(npcPosition, aPos) - calculateDistance(npcPosition, bPos);
  });
  const closestResource = availableResources[0];
  //console.log(`NPC ${this.id} selected nearest ${targetResource}:`, closestResource);
  return closestResource;
}


}

// Attach behaviors to the NPC prototype
attachGrazingBehavior(NPC);
attachQuestBehavior(NPC);
attachEnemyBehavior(NPC);
attachHealBehavior(NPC);
attachSpawnBehavior(NPC);

export default NPC;