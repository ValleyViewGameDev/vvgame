import axios from 'axios';
import { loadMasterResources } from './Utils/TuningManager';
import { updateGridResource } from './Utils/GridManagement';

let farmTimer = null;

class FarmState {
    constructor() {
      this.farmState = [];
      console.log('FarmState instance created. Initial state:', this.farmState);
    }
  
    initializeFarmState(resources = []) {
      this.farmState = resources.filter((res) => res.category === 'farmplot' && res.growEnd);
      console.log('initializeFarmState called. Updated farmState:', this.farmState);
    }
  
    addSeed(seed) {
      this.farmState.push(seed);
      console.log('addSeed called. Updated farmState:', this.farmState);
    }

  /**
   * Process seeds periodically to check for growth completion.
   */
  startSeedTimer({ gridId, setResources, TILE_SIZE, currentPlayer, setCurrentPlayer }) {
    if (farmTimer) clearInterval(farmTimer);
  
    farmTimer = setInterval(async () => {
      //console.log('FarmState timer ticking.');
      //console.log('Current farmState:', this.farmState);
  
      const now = Date.now();
      const completedSeeds = this.farmState.filter((seed) => seed.growEnd <= now);
      //console.log('Completed seeds:', completedSeeds);
  
      if (completedSeeds.length > 0) {

        // Update the Seeds to become Crops

        const masterResources = await loadMasterResources();
        console.log('Loaded masterResources:', masterResources);
  
        for (const seed of completedSeeds) {
          console.log('Processing seed:', seed);
          const newCrop = masterResources.find((res) => res.type === seed.output);
          console.log('Target output (crop) found for seed:', newCrop);
          if (newCrop) {

            try {
              console.log(`Updating grid resource for seed at (${seed.x}, ${seed.y}).`);
              const response = await updateGridResource(
                gridId, 
                { 
                  type: newCrop.type,
                  x: seed.x,
                  y: seed.y,
                },
                setResources,
                true
              );

              console.log('updateGridResource response:', response);
  
              if (response?.success) {
                console.log(`Seed at (${seed.x}, ${seed.y}) converted to doober.`);
  
                // Update local resources

  //!!! Do this in updateGridResource ???
                setResources((prevResources) => {
                  const updatedResources = prevResources.map((res) =>
                    res.x === seed.x && res.y === seed.y
                      ? {
                          type: newCrop.type,
                          symbol: newCrop.symbol,
                          category: 'doober',
                          x: seed.x,
                          y: seed.y,
                        }
                      : res
                  );
                  console.log('Updated resources:', updatedResources);
                  return updatedResources;
                });
              } else {
                console.warn(`Failed to update grid resource for seed at (${seed.x}, ${seed.y}).`);
              }
            } catch (error) {
              console.error(`Error updating grid resource for seed at (${seed.x}, ${seed.y}):`, error);
            }
  
            // Remove processed seed from farmState
            this.farmState = this.farmState.filter((s) => s !== seed);
            console.log('Updated farmState after removing processed seed:', this.farmState);
          } else {
            console.warn(`No target resource found for seed output: ${seed.output}`);
          }
        }
      }
    }, 1000);
  }

  
  /**
   * Stop the seed timer.
   */
  stopSeedTimer() {
    if (farmTimer) clearInterval(farmTimer);
    farmTimer = null;
  }
}

const farmStateInstance = new FarmState();
export default farmStateInstance;