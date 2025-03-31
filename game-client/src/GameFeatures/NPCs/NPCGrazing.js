import axios from 'axios';
import GlobalGridState from '../../GridState/GlobalGridState';
import gridStateManager from '../../GridState/GridState';
import { calculateDistance } from './NPCHelpers';

// Behavior handler for farm animals (e.g., cows)
async function handleFarmAnimalBehavior(gridId) {
    const tiles = GlobalGridState.getTiles();
    const resources = GlobalGridState.getResources();
    const npcs = Object.values(gridStateManager.getGridState(gridId)?.npcs || {}); 

    gridId = gridId || this.gridId; // Fallback to npc.gridId if not provided

    //console.log(`handleFarmAnimalBehavior: gridId: ${gridId}; NPC ${this.id} is in state: ${this.state}`);

    if (!tiles || !resources) {
        console.error(`Tiles or resources are missing for NPC ${this.id}.`);
        return;
    }

    switch (this.state) {
        case 'idle': {
            const idleCompleted = await this.handleIdleState(tiles, resources, npcs, 4, () => {
              console.log(`🔁 Retrying stall for NPC ${this.id}`);
              this.state = 'stall';
              gridStateManager.saveGridState(gridId);
            });
          
            if (!idleCompleted) {
              // Don't continue state processing if we're still idling
              return;
            }
          
            // If idle completed and `onTransition` fired, the state is now "stall"
            break;
          }

        case 'hungry': {
            //console.log(`NPC ${this.id} is in HUNGRY state.`);
            console.log('entering HUNGRY: grazeEnd = ', this.grazeEnd);
            const fullGridState = gridStateManager.getGridState(gridId);

            const currentTime = Date.now();
            if (this.grazeEnd && currentTime >= this.grazeEnd) {
                console.log(`⏳ Grazing already done — NPC ${this.id} skipping hungry.`);
                this.state = 'stall';
                await gridStateManager.saveGridState(gridId);
                break;
            }

            console.log("this.targetGrassTile = ", this.targetGrassTile);

            // Find the target grass tile if not already set
            if (!this.targetGrassTile) {
                console.log(`NPC ${this.id} finding nearest grass tile.`);
                
                // Find all grass tiles within range
                const grassTiles = await this.findTileInRange('g', tiles, resources);
        
                if (!Array.isArray(grassTiles) || grassTiles.length === 0) {
                    console.warn(`No grass tiles found for NPC ${this.id}. Transitioning to idle.`);
                    this.state = 'idle'; // Fallback to idle if no valid tiles
                    break;
                }
        
                // Filter out occupied grass tiles
                const unoccupiedGrassTiles = grassTiles.filter(
                    (tile) => !resources.some((res) => res.x === tile.x && res.y === tile.y)
                );
        
                if (unoccupiedGrassTiles.length === 0) {
                    console.warn(`No unoccupied grass tiles found for NPC ${this.id}. Transitioning to idle.`);
                    this.state = 'idle'; // Fallback to idle if no valid tiles
                    break;
                }
        
                // Sort tiles by distance and select the closest
                unoccupiedGrassTiles.sort(
                    (a, b) => calculateDistance(this.position, a) - calculateDistance(this.position, b)
                );
                this.targetGrassTile = unoccupiedGrassTiles[0];
                //console.log(`NPC ${this.id} selected grass tile at (${this.targetGrassTile.x}, ${this.targetGrassTile.y}).`);
            }
        
            // Attempt to move toward the target grass tile
            if (this.targetGrassTile) {
                const dx = this.targetGrassTile.x - Math.floor(this.position.x);
                const dy = this.targetGrassTile.y - Math.floor(this.position.y);
                //console.log(`NPC ${this.id} movement vector: dx=${dx}, dy=${dy}, current position=(${this.position.x}, ${this.position.y}), target=(${this.targetGrassTile.x}, ${this.targetGrassTile.y})`);
        
                let direction = null;
        
                // Explicitly handle when dx and dy are both 0 (already at the target)
                if (dx === 0 && dy === 0) {
                   // console.log(`NPC ${this.id} is already at the target grass tile. Transitioning to grazing.`);
                    this.state = 'grazing'; // Transition to grazing
                    this.targetGrassTile = null; // Clear the target
                    await gridStateManager.saveGridState(gridId); // Save after transition
                    break;
                }
        
                // Prioritize diagonal movement if dx and dy are both non-zero
                if (dx > 0 && dy > 0) direction = 'SE';
                else if (dx > 0 && dy < 0) direction = 'NE';
                else if (dx < 0 && dy > 0) direction = 'SW';
                else if (dx < 0 && dy < 0) direction = 'NW';
                else if (dx > 0) direction = 'E';
                else if (dx < 0) direction = 'W';
                else if (dy > 0) direction = 'S';
                else if (dy < 0) direction = 'N';
        
                console.log(`NPC ${this.id} determined direction: ${direction}`);
        
                if (!direction) {
                    console.warn(`NPC ${this.id} could not determine direction to grass tile.`);
                    this.state = 'idle';
                    this.targetGrassTile = null;
                    break;
                }
        
                if (!this.isMoving) {
                    //console.log(`NPC ${this.id} moving one tile toward grass tile at (${this.targetGrassTile.x}, ${this.targetGrassTile.y}).`);
                    this.isMoving = true;
        
                    // Move one tile in the determined direction
                    await this.moveOneTile(direction, tiles, resources, npcs);
        
                    // Ensure position snaps to integers after movement
                    this.position.x = Math.floor(this.position.x);
                    this.position.y = Math.floor(this.position.y);
                    //console.log(`NPC ${this.id} snapped to position (${this.position.x}, ${this.position.y}).`);
        
                    this.isMoving = false;
                }
        
                // Check if NPC has reached the grass tile
                if (
                    Math.floor(this.position.x) === this.targetGrassTile.x &&
                    Math.floor(this.position.y) === this.targetGrassTile.y
                ) {
                    //console.log(`NPC ${this.id} has reached the grass tile at (${this.targetGrassTile.x}, ${this.targetGrassTile.y}). Transitioning to grazing.`);
                    this.state = 'grazing'; // Transition to grazing
                    this.targetGrassTile = null; // Clear the target
                }
            }
            break;
        }
 
          
        case 'grazing': {
            console.log('entering GRAZING: grazeEnd = ', this.grazeEnd);
            const fullGridState = gridStateManager.getGridState(gridId);

            const currentTime = Date.now();
        
            console.log(`grazeEnd: ${this.grazeEnd}, growTime: ${this.growTime}, type: ${this.type}`);

            if (!this.grazeEnd) {
                this.grazeEnd = currentTime + (this.growTime * 1000); // Calculate grazing end time
                console.log('in state = grazing; setting grazeEnd: ',this.grazeEnd);
                await gridStateManager.saveGridState(gridId);
            }
            
            // ✅ Check if grazing is complete
            if (currentTime >= this.grazeEnd) {
                console.log(`🐄 NPC ${this.id} finished grazing. Moving to stall.`);
                
                // ✅ Transition to stall
                this.state = 'stall';
        
                await gridStateManager.saveGridState(gridId);
            }
            break;
        }


            case 'stall': {
                console.log('entering STALL: grazeEnd = ', this.grazeEnd);
                const fullGridState = gridStateManager.getGridState(gridId);
        
                // Step 1: If no stall is currently assigned, find the nearest available stall
                if (!this.targetStall) {
                    //console.log(`NPC ${this.id} finding nearest stall.`);
                    this.targetStall = this.findNearestResource('stall', tiles, resources);
                    if (!this.targetStall) {
                        console.log('No availalbe stall, returning to idle.');
                        this.state = 'idle';
                        break;
                    }
                }
            
                // Step 5: Confirm the stall is still valid before proceeding
                const stallResource = resources.find(
                    (res) => res.x === this.targetStall.x && res.y === this.targetStall.y
                );
                if (!stallResource) {
                    console.warn(`Target stall at (${this.targetStall.x}, ${this.targetStall.y}) is no longer valid. Transitioning to idle.`);
                    this.state = 'idle';
                    this.targetStall = null;
                    break;
                }
            
                // Step 6: Calculate movement direction towards the stall
                const dx = this.targetStall.x - Math.floor(this.position.x);
                const dy = this.targetStall.y - Math.floor(this.position.y);
                let direction = null;
            
                // ✅ Prefer diagonals if both dx and dy are non-zero
                if (dx !== 0 && dy !== 0) {
                    if (dx > 0 && dy > 0) direction = 'SE';
                    else if (dx > 0 && dy < 0) direction = 'NE';
                    else if (dx < 0 && dy > 0) direction = 'SW';
                    else if (dx < 0 && dy < 0) direction = 'NW';
                } else if (dx !== 0) {
                    direction = dx > 0 ? 'E' : 'W';
                } else if (dy !== 0) {
                    direction = dy > 0 ? 'S' : 'N';
                }
            
                // Step 7: If a valid movement direction isn't determined, revert to idle state
                if (!direction &&
                    (   Math.floor(this.position.x) != this.targetStall.x &&
                        Math.floor(this.position.y) != this.targetStall.y )
                ) 
                {
                    console.warn(`NPC ${this.id} could not determine direction to stall.`);
                    this.state = 'idle';
                    this.targetStall = null;
                    break;
                }
            
                // Step 8: Move the NPC one tile towards the stall
                if (!this.isMoving) {
                    this.isMoving = true;
                    const moved = await this.moveOneTile(direction, tiles, resources, npcs);
                    this.position.x = Math.floor(this.position.x);
                    this.position.y = Math.floor(this.position.y);
                    this.isMoving = false;
                  
                    if (!moved) {
                      console.warn(`NPC ${this.id} is stuck and cannot move toward the stall. Switching to idle.`);
                      this.targetStall = null;
                      this.state = 'idle';
                      this.triedStall = true;
                      await gridStateManager.saveGridState(gridId); // ✅ Save failure state
                      break;
                    }
                  
                    await gridStateManager.saveGridState(gridId); // ✅ Save successful movement
                  }
            
                // Step 9: If NPC reaches the stall, transition to processing state
                if (Math.floor(this.position.x) === this.targetStall.x &&
                    Math.floor(this.position.y) === this.targetStall.y) {
                
                    console.log(`🐮 NPC ${this.id} reached stall. Clearing grazeEnd and transitioning to processing.`);
                    
                    // ✅ Now safe to clear grazeEnd
                    delete this.grazeEnd;
                    const gridState = gridStateManager.getGridState(gridId);
                    if (gridState?.npcs?.[this.id]) {
                        delete gridState.npcs[this.id].grazeEnd;
                    }
                    
                    this.state = 'processing';
                    await gridStateManager.saveGridState(gridId);
                    }

                break;
            }

        case 'processing': {
                // awaiting handleNPCClick
        break;
        }

        case 'emptystall': {
            this.targetStall = null;
            this.state = 'roam'; // Transition to roam state
            await gridStateManager.saveGridState(gridId); // Save after transition
            break;
        }
         
        case 'roam': {

            await this.handleRoamState(tiles, resources, npcs, async () => {
                // ✅ This is your onTransition logic
                if (!this.grazeEnd) {
                  console.log(`🌱 NPC ${this.id} has no grazeEnd, transitioning to hungry.`);
                  this.state = 'hungry';
                } else if (Date.now() >= this.grazeEnd) {
                  console.log(`⏰ Grazing is done — NPC ${this.id} going to stall.`);
                  this.state = 'stall';
                } else {
                  console.log(`😐 NPC ${this.id} completed roam but grazing NOT done. Going idle.`);
                  this.state = 'idle';
                }
                await gridStateManager.saveGridState(gridId);
              });

            break;
          }

        default:
            console.warn(`NPC ${this.id} is in an unhandled state: ${this.state}`);
            break;
    }
}

// Export a function to attach the behavior to the NPC class
export function attachGrazingBehavior(NPC) {
    NPC.prototype.handleFarmAnimalBehavior = handleFarmAnimalBehavior;
}