import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import playersInGridManager from '../../GridState/PlayersInGrid';
import FloatingTextManager from "../../UI/FloatingText";
import soundManager from '../../Sound/SoundManager';

/** Helper to get tiles in line of sight between two points using Bresenham's algorithm **/
function getLineOfSightTiles(start, end) {
    const tiles = [];
    let x0 = Math.floor(start.x);
    let y0 = Math.floor(start.y);
    const x1 = Math.floor(end.x);
    const y1 = Math.floor(end.y);

    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    let prevX = x0;
    let prevY = y0;

    while (true) {
        // Don't include the start or end positions
        if ((x0 !== Math.floor(start.x) || y0 !== Math.floor(start.y)) &&
            (x0 !== x1 || y0 !== y1)) {
            tiles.push({ x: x0, y: y0 });

            // Check if we moved diagonally - if so, add the two adjacent tiles
            // to prevent line of sight going through corners
            if (prevX !== x0 && prevY !== y0) {
                tiles.push({ x: prevX, y: y0 }); // Vertical neighbor of previous position
                tiles.push({ x: x0, y: prevY }); // Horizontal neighbor of current position
            }
        }

        if (x0 === x1 && y0 === y1) break;

        prevX = x0;
        prevY = y0;

        const e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            x0 += sx;
        }
        if (e2 < dx) {
            err += dx;
            y0 += sy;
        }
    }

    return tiles;
}

/** Helper to check if a position falls within a wall's footprint **/
function isWithinWallFootprint(x, y, wall) {
    const tileSpan = wall.size || 1;
    // For walls with size > 1, check if (x, y) falls within the footprint
    // Wall footprint extends from anchor (wall.x, wall.y) down and right
    return (
        x >= wall.x &&
        x < wall.x + tileSpan &&
        y >= wall.y &&
        y < wall.y + tileSpan
    );
}

/** Helper to check if NPC can see the target (no walls blocking) **/
function canSeeTarget(npcPosition, targetPosition) {
    const resources = GlobalGridStateTilesAndResources.getResources();
    const lineOfSightTiles = getLineOfSightTiles(npcPosition, targetPosition);

    // Check each tile in the line of sight for walls or doors
    for (const tile of lineOfSightTiles) {
        // Check if this tile is blocked by any wall (including large walls)
        const wall = resources.find(res =>
            (res.action === 'wall' || res.action === 'door') &&
            isWithinWallFootprint(tile.x, tile.y, res)
        );
        if (wall) {
            return false; // Wall or door found blocking the view
        }
    }

    return true; // Clear line of sight
}

const updateThisNPC = async function(gridId) {
  await NPCsInGridManager.updateNPC(gridId, this.id, {
    state: this.state,
    position: this.position,
  });
};

async function handleEnemyBehavior(gridId, TILE_SIZE) {
  //console.log(`🐺 NPC ${this.id} handling enemy behavior on grid ${gridId}.`);
  const tiles = GlobalGridStateTilesAndResources.getTiles();
  const resources = GlobalGridStateTilesAndResources.getResources();
  const npcs = Object.values(NPCsInGridManager.getNPCsInGrid(gridId) || {});
  // Single-PC store: the only PC on the grid is the local player (if present)
  const localPC = Object.values(playersInGridManager.getPlayersInGrid(gridId) || {})[0] || null;

  // Force initial state to roam if not set
  if (!this.state || this.state === 'idle') {
    this.state = 'roam';
    await updateThisNPC.call(this, gridId);
  }
 
  // Check whether the PC is visible at the start of any state (immediate reaction)
  const pcVisibleInRange = !!localPC &&
    localPC.hp > 0 &&
    getDistance(this.position, localPC.position) <= this.range &&
    canSeeTarget(this.position, localPC.position);

  // If we see the PC and we're not already pursuing/attacking, immediately react
  if (pcVisibleInRange && this.state === 'roam') {
    console.log(`⚡ NPC ${this.id} spotted PC ${localPC.username}! Entering pursue state.`);
    this.targetPC = localPC;
    this.state = 'pursue';
    this.pursueTimerStart = null;
    await updateThisNPC.call(this, gridId);
    return; // Skip the rest of the state processing
  }
 
  switch (this.state) {

    case 'idle': {
      // Idle is ONLY used to get unstuck - always transitions to roam, never back to idle
      this.pursueTimerStart = null; // Clear pursuit timer
      await this.handleIdleState(tiles, resources, npcs, 2, async () => {
        // After idle, always go to roam (never back to idle)
        this.state = 'roam';
        this.targetPC = null;
        await updateThisNPC.call(this, gridId);
      });
      break;
    }

    case 'pursue': {
      this.targetPC = refreshTarget(this.targetPC, localPC); // Refresh position from latest state
      if (!this.targetPC) {
        //console.warn(`NPC ${this.id} lost its target. Returning to roam state.`);
        this.state = 'roam';
        this.pursueTimerStart = null;
        await updateThisNPC.call(this, gridId); // Save after transition
        break;
      }
      
      // First check if we can still see the target at all
      const canStillSeeTarget = canSeeTarget(this.position, this.targetPC.position);
      if (!canStillSeeTarget) {
        console.log(`👁️ NPC ${this.id} lost sight of ${this.targetPC?.username} during pursuit. Returning to roam.`);
        this.state = 'roam';
        this.pursueTimerStart = null;
        this.targetPC = null;
        await updateThisNPC.call(this, gridId);
        break;
      }
      
      // Check if already in attack range AND can see target before pursuing
      const currentDistance = getDistance(this.position, this.targetPC.position);
      if (currentDistance <= this.attackrange) {
        // Verify line of sight before switching to attack
        if (canSeeTarget(this.position, this.targetPC.position)) {
          console.log(`NPC ${this.id} is already in attack range (${currentDistance} <= ${this.attackrange}) and can see target. Switching to attack!`);
          this.state = 'attack';
          await updateThisNPC.call(this, gridId);
          break;
        } else {
          console.log(`NPC ${this.id} is in range but can't see ${this.targetPC.username} due to walls. Continuing pursuit.`);
        }
      }
      if (!this.pursueTimerStart) this.pursueTimerStart = Date.now();
      const timeSincePursueStart = Date.now() - this.pursueTimerStart;
      const distance = getDistance(this.position, this.targetPC?.position);
      // Give up if: 
      // 1. Target is too far AND we've been chasing for a while, OR
      // 2. We can't see the target anymore (behind wall)
      const canSeeTargetNow = canSeeTarget(this.position, this.targetPC.position);
      
      if ((distance > this.range * 2 && timeSincePursueStart > 5000) || !canSeeTargetNow) {
        if (!canSeeTargetNow) {
          console.log(`👁️ NPC ${this.id} lost sight of ${this.targetPC?.username} (wall blocking). Giving up pursuit.`);
        } else {
          console.log(`🐺 NPC ${this.id} gave up chasing ${this.targetPC?.username} (too far).`);
        }
        this.state = 'roam';
        this.pursueTimerStart = null;
        this.targetPC = null;
        await updateThisNPC.call(this, gridId);
        break;
      }
      console.log(`NPC ${this.id} is pursuing PC ${this.targetPC.username}.`);
      
      // Use a custom pursue handler that checks line of sight
      const handlePursueWithLineOfSight = async () => {
        const dx = this.targetPC.position.x - this.position.x;
        const dy = this.targetPC.position.y - this.position.y;

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
        
        // Check if already in attack range AND can see target BEFORE attempting to move
        const distanceToPlayer = getDistance(this.position, this.targetPC.position);
        console.log(`🎯 NPC ${this.id} distance to player: ${distanceToPlayer} | range: ${this.attackrange}`);
        
        if (distanceToPlayer <= this.attackrange) {
          if (canSeeTarget(this.position, this.targetPC.position)) {
            console.log(`NPC ${this.id} can see and attack ${this.targetPC.username}. Transitioning to attack!`);
            this.state = 'attack';
            await updateThisNPC.call(this, gridId);
            return;
          } else {
            console.log(`NPC ${this.id} is in range but can't see ${this.targetPC.username} due to walls. Continuing pursuit.`);
          }
        }
        
        if (!direction) return;

        const moved = await this.moveOneTile(direction, tiles, resources, npcs);
        if (!moved) {
          console.log(`NPC ${this.id} could not move in direction ${direction}.`);
          
          // If we're stuck, use idle state to pick a random direction
          if (!this.stuckCounter) this.stuckCounter = 0;
          this.stuckCounter++;
          
          if (this.stuckCounter >= 3) {
            console.log(`NPC ${this.id} appears stuck after ${this.stuckCounter} failed moves. Using idle to unstick.`);
            this.state = 'idle';
            this.stuckCounter = 0;
            await updateThisNPC.call(this, gridId);
          }
        } else {
          // Reset stuck counter on successful move
          this.stuckCounter = 0;
        }
      };
      
      await handlePursueWithLineOfSight();
      break;
    }

    case 'attack': {
      this.targetPC = refreshTarget(this.targetPC, localPC); // Refresh position from latest state

      if (!this.targetPC) {
        //console.warn(`NPC ${this.id} lost its target. Returning to roam state.`);
        this.pursueTimerStart = null;
        this.state = 'roam';
        await updateThisNPC.call(this, gridId); // Save after transition
        break;
      }
      if (this.targetPC.hp <= 0 || this.targetPC.iscamping) {
        this.state = 'roam';
        await updateThisNPC.call(this, gridId);
        break; // ✅ Skip PCs that are dead or camping
      }
      const distanceToTarget = getDistance(this.position, this.targetPC.position);
      if (distanceToTarget > this.attackrange) {
        //console.log(`PC ${this.targetPC.username} moved out of attack range. Returning to 'pursue' state.`);
        this.state = 'pursue';
        await updateThisNPC.call(this, gridId); // Save after transition
        break;
      }
      
      // Check line of sight before attacking
      if (!canSeeTarget(this.position, this.targetPC.position)) {
        console.log(`NPC ${this.id} lost sight of ${this.targetPC.username} due to walls. Returning to 'pursue' state.`);
        this.state = 'pursue';
        await updateThisNPC.call(this, gridId);
        break;
      }
 
      // Perform the attack
      const attackRoll = Math.floor(Math.random() * 20) + 1;
      const hitRoll = attackRoll + this.attackbonus;
      const isAHit = hitRoll >= this.targetPC.armorclass;

      // console.log('attackRoll = ', attackRoll);
      // console.log('this.attackBonus = ', this.attackbonus)
      // console.log('this.targetPC = ',this.targetPC);
      // console.log('this.targetPC.armorclass = ',this.targetPC.armorclass);
      // console.log('hitRoll = ', hitRoll);
      // console.log('isAHit = ', isAHit);

      if (!isAHit) {
        //console.log(`NPC ${this.id} missed the attack on ${this.targetPC.username}.`);
        FloatingTextManager.addFloatingText(503, this.targetPC.position.x, this.targetPC.position.y, TILE_SIZE);
        setTimeout(() => {
          this.state = 'attack'; // Retry attack after waiting
        }, this.speed);
      } else {
        // apply damage
        const damage = Math.floor(Math.random() * 6) + 1 + this.damage;
        // Define the stat and amount to modify before calling modifyPlayerStats
        const amountToMod = -damage;  // Damage is negative
        
        try {
          const newHP = Math.max(0, this.targetPC.hp + amountToMod);
          FloatingTextManager.addFloatingText(`- ${damage} ❤️‍🩹 HP`, this.targetPC.position.x, this.targetPC.position.y, TILE_SIZE );
          soundManager.playSFX('take_damage');
          playersInGridManager.updatePC(gridId, this.targetPC.playerId, {
            hp: newHP,
            lastUpdated: Date.now()
          });
        } catch (error) {
          console.error(`Error applying damage to player ${this.targetPC.username}:`, error);
        }
      }
      break;
    }

    case 'roam': {
      this.pursueTimerStart = null;
      await this.handleRoamState(tiles, resources, npcs, () => {
        // Don't change state - stay in roam
        // This callback is called after roam completes, but we just continue roaming
      });
      break;
    }

    default: {
      console.warn(`Unhandled state: ${this.state}`);
      break;
    }
  }
}

/**
 * Re-read the current target from the store so position/hp are fresh.
 * Returns null if the target is no longer the PC on this grid.
 */
function refreshTarget(targetPC, localPC) {
  if (!targetPC || !localPC) return null;
  return localPC.playerId === targetPC.playerId ? localPC : null;
}

/**
 * Calculates the Euclidean distance between two points.
 */
function getDistance(pos1, pos2) {
  return Math.sqrt((pos1.x - pos2.x) ** 2 + (pos1.y - pos2.y) ** 2);
}


export function attachEnemyBehavior(NPC) {
  NPC.prototype.handleEnemyBehavior = handleEnemyBehavior;
}