import axios from 'axios';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import { calculateDistance } from '../../Utils/worldHelpers';

// Behavior handler for farm animals (e.g., cows)
async function handleFarmAnimalBehavior(gridId) {
    // Helper for updating just this NPC
    const updateThisNPC = async () => {
        // console.log(`[SAVE] NPC ${this.id}: Updating state to '${this.state}' at position (${this.position.x}, ${this.position.y})`);
        await NPCsInGridManager.updateNPC(gridId, this.id, {
            state: this.state,
            grazeEnd: this.grazeEnd,
            position: this.position,
      });
    };
    const tiles = GlobalGridStateTilesAndResources.getTiles();
    const resources = GlobalGridStateTilesAndResources.getResources();
    const npcs = Object.values(NPCsInGridManager.getNPCsInGrid(gridId) || {}); 

    gridId = gridId || this.gridId; // Fallback to npc.gridId if not provided

    //console.log(`handleFarmAnimalBehavior: gridId: ${gridId}; NPC ${this.id} is in state: ${this.state}`);

    if (!tiles || !resources) {
        console.error(`Tiles or resources are missing for NPC ${this.id}.`);
        return;
    }
    
    // IMPORTANT: If NPC is in processing state, don't allow any state transitions except to emptystall
    if (this.state === 'processing') {
        // Only log periodically to avoid spam
        if (!this.lastProcessingLog || Date.now() - this.lastProcessingLog > 5000) {
            //console.log(`🐮 NPC ${this.id} is in processing state, waiting for collection. GrazeEnd: ${this.grazeEnd}`);
            this.lastProcessingLog = Date.now();
        }
        return; // Exit early, don't process any state transitions
    }

    switch (this.state) {
        case 'idle': {
//            console.log(`🐮 [STATE] NPC ${this.id} entering state: ${this.state}`);
            const idleCompleted = await this.handleIdleState(tiles, resources, npcs, 4, async () => {
//              console.log(`🔁 Retrying after idle for NPC ${this.id}`);
              // Check if we have grazeEnd to determine next state
              if (this.grazeEnd && Date.now() >= this.grazeEnd) {
                this.state = 'stall';
              } else {
                this.state = 'hungry';
              }
              await updateThisNPC();
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
            //console.log(`🐮 [STATE] NPC ${this.id} entering state: ${this.state} grazeEnd: ${this.grazeEnd}`);

            const currentTime = Date.now();
            if (this.grazeEnd && currentTime >= this.grazeEnd) {
                console.log(`⏳ Grazing already done — NPC ${this.id} skipping hungry.`);
                this.state = 'stall';
                await updateThisNPC();
                break;
            }

            //console.log("this.targetGrassTile = ", this.targetGrassTile);

            // Find the target grass tile if not already set
            if (!this.targetGrassTile) {
                //console.log(`NPC ${this.id} finding nearest grass tile.`);
                
                // Determine which tile type to look for based on NPC type
                const targetTileType = this.type === 'Pig' ? 'd' : 'g'; // Pigs graze on dirt, others on grass
                
                // Find all grass/dirt tiles within range
                const grassTiles = await this.findTileInRange(targetTileType, tiles, resources);
        
                if (!Array.isArray(grassTiles) || grassTiles.length === 0) {
                    const tileTypeName = targetTileType === 'd' ? 'dirt' : 'grass';
                    console.warn(`No ${tileTypeName} tiles found for NPC ${this.id}. Transitioning to idle.`);
                    this.state = 'idle'; // Fallback to idle if no valid tiles
                    break;
                }
        
                // Filter out occupied grass tiles (by resources or other grazing animals)
                const unoccupiedGrassTiles = grassTiles.filter((tile) => {
                    // Check if occupied by a resource
                    if (resources.some((res) => res.x === tile.x && res.y === tile.y)) {
                        return false;
                    }
                    // Check if occupied by another grazing animal
                    const otherAnimalOnTile = npcs.some(npc => 
                        npc.id !== this.id &&
                        npc.action === 'graze' &&
                        Math.floor(npc.position?.x) === tile.x &&
                        Math.floor(npc.position?.y) === tile.y
                    );
                    if (otherAnimalOnTile) {
                        //console.log(`Grass tile at (${tile.x}, ${tile.y}) is occupied by another animal, skipping`);
                        return false;
                    }
                    return true;
                });
        
                if (unoccupiedGrassTiles.length === 0) {
                    const tileTypeName = targetTileType === 'd' ? 'dirt' : 'grass';
                    console.warn(`No unoccupied ${tileTypeName} tiles found for NPC ${this.id}. Transitioning to idle.`);
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
            if (this.targetGrassTile && 
                typeof this.targetGrassTile.x === 'number' && 
                typeof this.targetGrassTile.y === 'number') 
            {
                const dx = this.targetGrassTile.x - Math.floor(this.position.x);
                const dy = this.targetGrassTile.y - Math.floor(this.position.y);
                //console.log(`NPC ${this.id} movement vector: dx=${dx}, dy=${dy}, current position=(${this.position.x}, ${this.position.y}), target=(${this.targetGrassTile.x}, ${this.targetGrassTile.y})`);
        
                let direction = null;
        
                // Explicitly handle when dx and dy are both 0 (already at the target)
                if (dx === 0 && dy === 0) {
                    // Before transitioning to grazing, check if another animal has moved onto our target
                    const otherAnimalOnTile = npcs.some(npc => 
                        npc.id !== this.id &&
                        npc.action === 'graze' &&
                        Math.floor(npc.position?.x) === this.targetGrassTile.x &&
                        Math.floor(npc.position?.y) === this.targetGrassTile.y
                    );
                    if (otherAnimalOnTile) {
                        console.warn(`Another animal took our target grass tile! Finding new one.`);
                        this.targetGrassTile = null;
                        break; // Stay in hungry state and find new tile next update
                    }
                   // console.log(`NPC ${this.id} is already at the target grazing tile. Transitioning to grazing.`);
                    this.state = 'grazing'; // Transition to grazing
                    this.targetGrassTile = null; // Clear the target
                    await updateThisNPC(); // Save after transition
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
        
                //console.log(`NPC ${this.id} determined direction: ${direction}`);
        
                if (!direction) {
                    console.warn(`NPC ${this.id} could not determine direction to grass tile.`);
                    this.state = 'idle';
                    this.targetGrassTile = null;
                    break;
                }
        
                if (!this.isMoving) {
                    //console.log(`NPC ${this.id} moving one tile toward grass tile at (${this.targetGrassTile.x}, ${this.targetGrassTile.y}).`);
                    this.isMoving = true;
                    const moved = await this.moveOneTile(direction, tiles, resources, npcs);
        
                    // Ensure position snaps to integers after movement
                    this.position.x = Math.floor(this.position.x);
                    this.position.y = Math.floor(this.position.y);
                    this.isMoving = false;
                    if (!moved) {
                        console.warn(`NPC ${this.id} is stuck and cannot move toward the grass. Switching to idle.`);
                        this.targetGrassTile = null;
                        this.state = 'idle';
                        await updateThisNPC(); // ✅ Save failure state
                        break;
                      }
                }
        
                // Check if NPC has reached the grass tile
                if (
                    this.targetGrassTile &&
                    Math.floor(this.position.x) === this.targetGrassTile.x &&
                    Math.floor(this.position.y) === this.targetGrassTile.y
                ) {
                    // Before transitioning to grazing, check if another animal has moved onto our target
                    const otherAnimalOnTile = npcs.some(npc => 
                        npc.id !== this.id &&
                        npc.action === 'graze' &&
                        Math.floor(npc.position?.x) === this.targetGrassTile.x &&
                        Math.floor(npc.position?.y) === this.targetGrassTile.y
                    );
                    if (otherAnimalOnTile) {
                        console.warn(`Another animal took our target grass tile! Finding new one.`);
                        this.targetGrassTile = null;
                        // Don't transition to grazing, stay hungry and find new tile
                    } else {
                        //console.log(`NPC ${this.id} has reached the grass tile at (${this.targetGrassTile.x}, ${this.targetGrassTile.y}). Transitioning to grazing.`);
                        this.state = 'grazing'; // Transition to grazing
                        this.targetGrassTile = null; // Clear the target
                        await updateThisNPC(); // Save after transition
                    }
                }
            }
            else {
                    console.warn(`🐄 [Hungry] NPC ${this.id} has invalid targetGrassTile. Roaming to unstuck.`);
                    this.targetGrassTile = null;
                    this.state = 'roam';
                    await updateThisNPC();
                    break;
            }
            break;
        }
 
          
        case 'grazing': {
            //console.log(`🐮 [STATE] NPC ${this.id} entering state: ${this.state} grazeEnd: ${this.grazeEnd}`);
            const currentTime = Date.now();
        
            //console.log(`grazeEnd: ${this.grazeEnd}, growTime: ${this.growTime}, type: ${this.type}`);

            if (!this.grazeEnd) {
                this.grazeEnd = currentTime + (this.growTime * 1000); // Calculate grazing end time
                //console.log('in state = grazing; setting grazeEnd: ',this.grazeEnd);
                await updateThisNPC();
            }
            
            // ✅ Check if grazing is complete
            if (currentTime >= this.grazeEnd) {
                //console.log(`🐄 NPC ${this.id} finished grazing. Moving to stall.`);
                // ✅ Transition to stall
                this.state = 'stall';
                await updateThisNPC();
            }
            break;
        }


        case 'stall': {
            //console.log(`🐮 [STATE] NPC ${this.id} entering state: ${this.state} grazeEnd: ${this.grazeEnd}`);
            const fullGridState = NPCsInGridManager.getNPCsInGrid(gridId);
            
            // Initialize retry counter and failed stalls list
            if (!this.stallRetries) this.stallRetries = 0;
            if (!this.failedStalls) this.failedStalls = [];
    
            // Step 1: If no stall is currently assigned, find the nearest available stall
            if (!this.targetStall) {
                //console.log(`NPC ${this.id} finding nearest stall.`);
                this.targetStall = this.findNearestResource('stall', tiles, resources, this.failedStalls);
                if (!this.targetStall) {
                    console.log('No availalbe stall, returning to idle.');
                    this.state = 'idle';
                    this.stallRetries = 0;
                    this.failedStalls = [];
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
                (   Math.floor(this.position.x) !== this.targetStall.x &&
                    Math.floor(this.position.y) !== this.targetStall.y )
                ) {
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
                    this.stallRetries++;
                    
                    if (this.stallRetries < 5) {
                        // Try a different direction or wait
                        //console.log(`NPC ${this.id} blocked, retry ${this.stallRetries}/5`);
                    } else {
                        // Add this stall to failed list and try another
                        console.warn(`NPC ${this.id} cannot reach stall at (${this.targetStall.x}, ${this.targetStall.y}). Trying alternative.`);
                        if (!this.failedStalls) this.failedStalls = [];
                        this.failedStalls.push({ x: this.targetStall.x, y: this.targetStall.y });
                        this.targetStall = null;
                        this.stallRetries = 0;
                        
                        // Try to find another stall
                        const alternativeStall = this.findNearestResource('stall', tiles, resources, this.failedStalls);
                        if (!alternativeStall) {
                            //console.log('No alternative stalls available, returning to idle.');
                            this.state = 'idle';
                            this.failedStalls = [];
                            this.triedStall = true;
                        }
                    }
                    await updateThisNPC(); // ✅ Save state
                    break;
                }
                
                await updateThisNPC(); // ✅ Save successful movement
                }
        
            // Step 9: If NPC reaches the stall, transition to processing state
            const atStall = Math.floor(this.position.x) === this.targetStall.x &&
                           Math.floor(this.position.y) === this.targetStall.y;
            const nearStall = Math.abs(Math.floor(this.position.x) - this.targetStall.x) <= 1 &&
                             Math.abs(Math.floor(this.position.y) - this.targetStall.y) <= 1;
            
            // Accept being adjacent to stall if we've tried multiple times
            if (atStall || (nearStall && this.stallRetries > 2)) {
            
                // Check if another animal is already at this position
                const otherNPCsAtStall = Object.values(fullGridState || {}).filter(otherNpc => 
                    otherNpc.id !== this.id &&
                    Math.floor(otherNpc.position?.x) === this.targetStall.x &&
                    Math.floor(otherNpc.position?.y) === this.targetStall.y &&
                    otherNpc.action === 'graze'
                );
                
                console.log(`🐮 NPC ${this.id} reached stall at (${this.targetStall.x}, ${this.targetStall.y}). Other animals at same position: ${otherNPCsAtStall.length}`);
                
                if (otherNPCsAtStall.length > 0) {
                    console.log(`🐮 Stall is occupied! Adding to failed list and trying another.`);
                    if (!this.failedStalls) this.failedStalls = [];
                    this.failedStalls.push({ x: this.targetStall.x, y: this.targetStall.y });
                    this.targetStall = null;
                    this.stallRetries = 0;
                    // Don't transition to processing - stay in stall state to find another
                    await updateThisNPC();
                    break;
                }
                
                // ✅ Keep grazeEnd for server validation - it will be cleared after successful collection
                // Allow multiple animals to be in processing state at the same stall
                this.state = 'processing';
                console.log(`🐮✅ NPC ${this.id} transitioning to processing state. GrazeEnd: ${this.grazeEnd}`);
                
                // Save the state change immediately and wait for confirmation
                try {
                    await updateThisNPC();
                    console.log(`🐮✅ NPC ${this.id} state update to 'processing' sent to server`);
                    
                    // Wait longer for the update to propagate to the server
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    // Verify the update was successful
                    const updatedNPC = NPCsInGridManager.getNPCsInGrid(gridId)?.[this.id];
                    if (updatedNPC && updatedNPC.state !== 'processing') {
                        console.error(`❌ State update verification failed! NPC ${this.id} state is ${updatedNPC.state} instead of 'processing'`);
                        // Try to update again with longer wait
                        this.state = 'processing';
                        await updateThisNPC();
                        console.log(`🐮🔄 Retried state update for NPC ${this.id}`);
                        await new Promise(resolve => setTimeout(resolve, 500));
                    } else {
                        console.log(`🐮✅ Verified NPC ${this.id} is in processing state`);
                    }
                } catch (error) {
                    console.error(`❌ Failed to update NPC ${this.id} to processing state:`, error);
                }
                }

            break;
        }
 
        case 'processing': {
            // awaiting handleNPCClick
            // console.log(`🐮 [STATE] NPC ${this.id} entering state: ${this.state}`);
            // console.log('Awaiting handleNPCClick');
            // IMPORTANT: Don't transition out of processing state unless explicitly collected
            if (this.grazeEnd && Date.now() >= this.grazeEnd) {
                console.log(`🐮 NPC ${this.id} is in processing state and ready for collection. GrazeEnd: ${this.grazeEnd}`);
                
                // Check if the animal has been stuck in processing for too long (e.g., over 1 hour past grazeEnd)
                const timeSinceGrazeEnd = Date.now() - this.grazeEnd;
                if (timeSinceGrazeEnd > 3600000) { // 1 hour in milliseconds
                    console.warn(`⚠️ NPC ${this.id} has been in processing state for ${Math.floor(timeSinceGrazeEnd / 1000)} seconds. Resetting to emptystall.`);
                    this.state = 'emptystall';
                    await updateThisNPC();
                }
            }
        break;
        }

        case 'emptystall': {
            // console.log(`🐮 [STATE] NPC ${this.id} entering state: ${this.state}`);
            this.targetStall = null;
            this.grazeEnd = null; // Clear grazeEnd so cow will go hungry after roaming
            this.state = 'roam'; // Transition to roam state
            await updateThisNPC(); // Save after transition
            break;
        }
         
        case 'roam': {

            // console.log(`🐮 [STATE] NPC ${this.id} entering state: ${this.state}`);
            await this.handleRoamState(tiles, resources, npcs, async () => {
                // ✅ This is your onTransition logic
                if (!this.grazeEnd) {
                  console.log(`🌱 NPC ${this.id} has no grazeEnd, transitioning to hungry.`);
                  this.state = 'hungry';
                } else {
                  console.log(`😐 NPC ${this.id} completed roam but grazing NOT done. Going idle.`);
                  this.state = 'idle';
                }
                await updateThisNPC();
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