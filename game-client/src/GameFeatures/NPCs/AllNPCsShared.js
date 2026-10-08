import NPCsInGridManager from '../../GridState/GridStateNPCs';
import playersInGridManager from '../../GridState/PlayersInGrid';
import { calculateDistance } from '../../Utils/worldHelpers';
import { attachGrazingBehavior } from './NPCGrazeBehavior';
import { attachQuestBehavior } from './NPCQuestBehavior';
import { attachEnemyBehavior } from './NPCEnemyBehavior';
import { attachHealBehavior } from './NPCHealBehavior';
import { attachSpawnBehavior } from './NPCSpawnerBehavior';
import { attachFarmerBehavior } from './NPCWorkerBehavior';
import { attachTraderBehavior } from './NPCTraderBehavior';

const DIRECTION_DELTAS = {
  N: { x: 0, y: -1 },
  S: { x: 0, y: 1 },
  E: { x: 1, y: 0 },
  W: { x: -1, y: 0 },
  NE: { x: 1, y: -1 },
  SE: { x: 1, y: 1 },
  SW: { x: -1, y: 1 },
  NW: { x: -1, y: -1 },
};

// Small stable hash for per-NPC jitter (ids are timestamps or ObjectIds)
function hashId(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h >>> 0); }

class NPC {
  constructor(id, type, position, properties, gridId) {
    //console.log('NPC constructor: properties:', properties);
    //console.log('NPC constructor: gridId:', gridId);
    //console.log(`NPC constructor: ID=${id}, type=${type}, grazeEnd=`, properties.grazeEnd);

    if (!properties || typeof properties !== 'object') {
      console.error(`Invalid properties passed to NPC constructor for type ${type}:`, properties);
      throw new Error('NPC constructor requires valid properties.');
    }

    this.id = id;
    this.type = type;
    this.position = {
      x: Math.floor(position.x),
      y: Math.floor(position.y),
    };
    this.symbol = properties.symbol;
    this.hp = properties.hp || 0; // Use hp as hunger
    this.output = properties.output;
    this.maxhp = properties.maxhp || 0;
    this.range = properties.range;
    this.action = properties.action; // High-level behavioral category (e.g., "graze")
    this.state = properties.state || 'idle'; // Use stored state or default to idle
    this.speed = properties.speed; // Keep speed for combat stats, but do not use for movement animation
    this.growTime = properties.growtime || 0; // Time to fully graze
    this.processingStartTime = undefined;
    this.nextspawn = properties.nextspawn ?? (this.action === 'spawn' ? Date.now() + 5000 : null);
    this.grazeEnd = properties.grazeEnd || null; // this is preserved from NPCsInGrid
    this.lastUpdated = Date.now(); // Initialize lastUpdated
    this.gridId = properties.gridId || gridId; // Use the passed gridId or default to the one in properties

    // Assign additional properties BUT preserve critical fields that were already set
    // Remove type, id from properties to prevent overwriting with undefined
    const { type: _type, id: _id, ...safeProperties } = properties;
    Object.assign(this, safeProperties);

    // Cadence (docs/audits/combat-and-npc-review-2026-10-07.md, Track 3a): each NPC steps on
    // its own clock. `movespeed` is tiles per second from resources.json (per kind defaults
    // below); a per-NPC jitter seeded from the id keeps a grid from stepping in lockstep; a
    // diagonal step takes √2 as long (moveOneTile). The App tick is only a 100 ms scheduler.
    const kindDefault = { graze: 0.5, quest: 0.8, trade: 0.8, heal: 0.8, worker: 0.8, attack: 1.2 }[this.action] || 1;
    const movespeed = Number(properties.movespeed) > 0 ? Number(properties.movespeed) : kindDefault;
    this.stepJitter = 0.85 + (hashId(String(this.id)) % 1000) / 1000 * 0.35; // 0.85 … 1.2
    this.stepMs = Math.round((1000 / movespeed) * this.stepJitter);
    this.updateInterval = this.stepMs;
    this.lastStepMs = this.stepMs;          // the renderer tweens exactly this long
    this.nextUpdateAt = Date.now() + Math.floor(Math.random() * this.stepMs); // desync on load
    // +1 right, -1 left (renderer flips the sprite relative to `artFacing`); at rest an NPC
    // shows its native art, so left-facing art starts facing left
    this.facing = (this.artFacing || (this.action === 'graze' || this.action === 'attack' ? 'left' : 'front')) === 'left' ? -1 : 1;

    //console.log(`✅ NPC ${this.id} constructed at position (${this.position.x}, ${this.position.y}) with state: ${this.state}`);
  }


/////////////////
// NPC CORE   ///
/////////////////

update(currentTime, NPCsInGrid, gridId, TILE_SIZE) {
  // Own clock: nothing until the next step is due (moveOneTile pushes it out for diagonals)
  if (currentTime < (this.nextUpdateAt || 0)) return;
  this.nextUpdateAt = currentTime + this.stepMs;
  this.processState(NPCsInGrid, gridId, TILE_SIZE);
  this.lastUpdated = currentTime;
}

async processState(NPCsInGrid, gridId, TILE_SIZE) {
  
  //console.log(`🧪 processState | NPC ${this.id} | state=${this.state} | action=${this.action} | gridId=${gridId}`);
  try {

    switch (this.action) {

      case 'graze':
        await this.handleFarmAnimalBehavior(gridId);
        break;
    
      case 'pet':
        // Future implementation for Pets
        // console.log('Pet behavior not implemented yet.');
        break;
    
      case 'quest':
        await this.handleQuestGiverBehavior(gridId);
        break;
    
      case 'trade':
        await this.handleTraderBehavior(gridId);
        break;

      case 'worker':
        await this.handleWorkerBehavior(gridId);
        break;
    
      case 'heal':
        await this.handleHealBehavior(gridId);
        break;
    
      case 'attack':
        await this.handleEnemyBehavior(gridId, TILE_SIZE);
        break;
    
      case 'spawn':
        await this.handleSpawnBehavior(gridId);
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

// `idleDuration` is in SECONDS (it used to count 1 s ticks; the tick is per-NPC now)
async handleIdleState(tiles, resources, npcs, idleDuration, onTransition = () => {}) {
  const now = Date.now();
  if (!this.idleUntil) this.idleUntil = now + idleDuration * 1000;

  if (now >= this.idleUntil) {
    this.idleUntil = null;

    const directions = ['N', 'S', 'E', 'W', 'NE', 'SE', 'SW', 'NW'];
    const validDirections = directions.filter((dir) => {
      const { x, y } = this.getAdjacentTile(dir);
      return this.isValidTile(x, y, tiles, resources, npcs);
    });

    if (validDirections.length > 0) {
      const randomDirection = validDirections[Math.floor(Math.random() * validDirections.length)];
      const moved = await this.moveOneTile(randomDirection, tiles, resources, npcs);
      // if (moved) console.log(`🚶 NPC ${this.id} moved in idle to (${this.position.x}, ${this.position.y})`);
    }
    onTransition(); // callback to re-evaluate state
    return true; // idle completed
  }
  //console.log(`🐮 NPC ${this.id} is idling. Timer: ${this.idleTimer}/${idleDuration}`);
  return false; // still idling
}


// A roam is `range` steps in all, walked as LEGS of 2-5 steps with a 2-8 s pause between
// them, so an NPC stands still convincingly instead of pacing.
async handleRoamState(tiles, resources, npcs, onTransition = () => {}) {  // Initialize roam step counter and range
  const now = Date.now();
  if (this.pauseUntil && now < this.pauseUntil) return; // resting between legs
  this.pauseUntil = null;
  this.roamSteps = this.roamSteps || 0;
  const range = this.range || 4; // Default roam range

  // If no initial direction is set, choose one at random and the length of this leg
  if (!this.currentDirection) {
    const directions = ['N', 'S', 'E', 'W', 'NE', 'SE', 'SW', 'NW'];
    this.currentDirection = directions[Math.floor(Math.random() * directions.length)];
    this.legSteps = 0;
    this.legLength = 2 + Math.floor(Math.random() * 4);
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
  const validDirections = preferredDirections.filter((direction) => {
    const { x, y } = this.getAdjacentTile(direction);
    return this.isValidTile(x, y, tiles, resources, npcs);
  })
  if (validDirections.length > 0) {
    const direction = validDirections[Math.floor(Math.random() * validDirections.length)];
    await this.moveOneTile(direction, tiles, resources, npcs);
    this.roamSteps++;
    this.legSteps = (this.legSteps || 0) + 1;
  } else {
    this.currentDirection = null;
  }

  // The whole roam is done: hand off
  if (this.roamSteps >= range) {
    this.roamSteps = 0;
    this.currentDirection = null;
    this.pauseUntil = now + 1500 + Math.random() * 3000; // a breath before whatever comes next
    onTransition();
    return;
  }
  // The leg is done (or blocked): rest, sometimes turn, then pick a new heading
  if (validDirections.length === 0 || this.legSteps >= (this.legLength || 3)) {
    this.currentDirection = null;
    this.pauseUntil = now + 2000 + Math.random() * 6000;
  }
}

async handlePursueState(playerPosition, tiles, resources, npcs, pcs, onAttackTransition) {

  const dx = playerPosition.x - this.position.x;
  const dy = playerPosition.y - this.position.y;

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
  
  // Check if already in attack range BEFORE attempting to move
  const distanceToPlayer = calculateDistance(this.position, playerPosition);
  console.log(`🎯 NPC ${this.id} distance to player: ${distanceToPlayer} | range: ${this.attackrange}`);
  if (distanceToPlayer <= this.attackrange) {
    this.state = 'attack';
    await onAttackTransition();
    return;
  }
  
  if (!direction) return;

  const moved = await this.moveOneTile(direction, tiles, resources, npcs);
  if (!moved) {
    // If can't move but already in attack range, attack!
    if (distanceToPlayer <= this.attackrange) {
      console.log(`🎯 NPC ${this.id} blocked but in attack range! Transitioning to attack.`);
      this.state = 'attack';
      await onAttackTransition();
    } else {
      console.warn(`🚫 NPC ${this.id} couldn't move toward target. Stuck? Returning to idle.`);
      this.state = 'idle';
      this.pursueTimerStart = null;
      this.targetPC = null;
    }
    return;
  }

  // Check again after moving
  const newDistanceToPlayer = calculateDistance(this.position, playerPosition);
  console.log(`🎯 NPC ${this.id} NEW distance to player: ${newDistanceToPlayer} | range: ${this.attackrange}`);
  if (newDistanceToPlayer <= this.attackrange) {
    this.state = 'attack';
    await onAttackTransition();
  }
}

/////////////////
// NPC UTILITY //
/////////////////

// Moves the NPC one tile. Async so callers can `await` it (the graze
// behaviour's `isMoving` guard relies on that), but the position is applied
// synchronously; the returned promise settles on the next microtask.
async moveOneTile(direction, tiles, resources, npcs) {

  if (this.action === 'spawn') {
    console.warn(`Spawner ${this.id} cannot move!`);
    return false; // ✅ Prevents spawners from moving at all
  }

  const delta = DIRECTION_DELTAS[direction];
  if (!delta) {
      console.error(`Invalid direction: ${direction}`);
      return false;
  }
  const targetX = Math.floor(this.position.x + delta.x);
  const targetY = Math.floor(this.position.y + delta.y);

  // Validate the tile before moving
  if (!this.isValidTile(targetX, targetY, tiles, resources, npcs)) {
      return false;
  }

  // Set the target position immediately - the renderer animates the transition
  this.position.x = targetX;
  this.position.y = targetY;
  if (delta.x) this.facing = delta.x > 0 ? 1 : -1;
  // A diagonal is √2 as long as a straight step: the tween and the next step both wait for it
  const diagonal = delta.x !== 0 && delta.y !== 0;
  this.lastStepMs = Math.round(this.stepMs * (diagonal ? 1.414 : 1));
  if (diagonal) this.nextUpdateAt = (this.nextUpdateAt || Date.now()) + Math.round(this.stepMs * 0.414);
  this.stepStartedAt = Date.now();

  // Movement-only update (queued for the batch save, not saved immediately)
  NPCsInGridManager.updateNPCPosition(this.gridId, this.id, { x: targetX, y: targetY });

  return true;
}

getAdjacentTile(direction) {
  const delta = DIRECTION_DELTAS[direction];
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

// Terrain + resources only (no NPC / player checks): the part a corner-cut check reuses
terrainOpen(x, y, tiles, resources) {
  if (x < 0 || y < 0 || y >= tiles.length || x >= tiles[0].length) return false;
  if (this[`validon${tiles[y][x]}`] !== true) return false;
  const res = resources.find((r) => r.x === x && r.y === y);
  return !(res && !res.passable);
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
  
    // Dynamically check if NPC can walk on this tile type
    // Property name is 'validon' + tileType (e.g., 'validong' for 'g')
    const validPropertyName = `validon${tileType}`;
    const canWalkOnTile = this[validPropertyName] === true;
  
    if (!canWalkOnTile) {
    //   console.warn(`NPC ${this.id} cannot step on tile type "${tileType}".`);
      return false;
    }
  
    // **Step 2: Check if there's an impassable resource in this tile**
    const resourceInTile = resources.find((res) => res.x === x && res.y === y);
    if (resourceInTile) {
  
      if (!resourceInTile.passable) {
        //console.warn(`Tile (${x}, ${y}) is occupied by an impassable resource.`);
        return false;
      }
    }
  
  // **Step 3: the same rules the player's own pathfinding applies (Utils/Pathfinding.js)**
  // No diagonal corner cutting: both orthogonal neighbours of a diagonal step must be open
  const dx = x - Math.floor(this.position.x); const dy = y - Math.floor(this.position.y);
  if (dx !== 0 && dy !== 0 && Math.abs(dx) === 1 && Math.abs(dy) === 1) {
    if (!this.terrainOpen(x, Math.floor(this.position.y), tiles, resources) || !this.terrainOpen(Math.floor(this.position.x), y, tiles, resources)) return false;
  }
  // Never onto the player's tile
  const me = playersInGridManager.getLocalRecord?.()?.position;
  if (me && Math.round(me.x) === x && Math.round(me.y) === y) return false;

  // Ensure npcs is an array before calling .some()
  if (!Array.isArray(npcs)) {
    return true;
  }

  // Never onto another NPC's tile (farm animals included: no stacking)
  const npcInTile = npcs.find(npc => Math.floor(npc.position.x) === x && Math.floor(npc.position.y) === y && npc.id !== this.id);
  if (npcInTile) return false;

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


findNearestResource(targetResource, tiles, resources, excludePositions = []) {
  //console.log(`Finding nearest ${targetResource} for NPC ${this.id}.`);

  if (!resources || !Array.isArray(resources) || resources.length === 0) {
    //console.error(`Resources are invalid or empty for NPC ${this.id}.`);
    return null;
  }
  const npcPosition = {
    x: Math.floor(this.position.x),
    y: Math.floor(this.position.y),
  };
  
  // Get all NPCs for checking stall occupancy
  const npcs = Object.values(NPCsInGridManager.getNPCsInGrid(this.gridId) || {});
  
  const availableResources = resources.filter((res) => {
    if (res.category !== targetResource || typeof res.x !== 'number' || typeof res.y !== 'number') {
      return false;
    }
    // Exclude positions that have been tried and failed
    const isExcluded = excludePositions.some(pos => pos.x === res.x && pos.y === res.y);
    if (isExcluded) return false;
    
    // For stalls, check if another grazing animal is already there
    if (targetResource === 'stall') {
      const otherAnimalAtStall = npcs.some(npc => 
        npc.id !== this.id &&
        npc.action === 'graze' &&
        Math.floor(npc.position?.x) === res.x &&
        Math.floor(npc.position?.y) === res.y
      );
      if (otherAnimalAtStall) {
        //console.log(`Stall at (${res.x}, ${res.y}) is occupied, skipping`);
        return false;
      }
    }
    
    return true;
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

// Find all resources of a type sorted by distance
findAllResources(targetResource, tiles, resources) {
  if (!resources || !Array.isArray(resources) || resources.length === 0) {
    return [];
  }
  const npcPosition = {
    x: Math.floor(this.position.x),
    y: Math.floor(this.position.y),
  };
  const availableResources = resources.filter((res) => {
    return res.category === targetResource && typeof res.x === 'number' && typeof res.y === 'number';
  });
  availableResources.sort((a, b) => {
    const aPos = { x: Math.floor(a.x), y: Math.floor(a.y) };
    const bPos = { x: Math.floor(b.x), y: Math.floor(b.y) };
    return calculateDistance(npcPosition, aPos) - calculateDistance(npcPosition, bPos);
  });
  return availableResources;
}


}

// Attach behaviors to the NPC prototype
attachGrazingBehavior(NPC);
attachQuestBehavior(NPC);
attachEnemyBehavior(NPC);
attachHealBehavior(NPC);
attachSpawnBehavior(NPC);
attachFarmerBehavior(NPC);
attachTraderBehavior(NPC);

export default NPC;