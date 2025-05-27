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
      // Log incoming farmplot resources
      console.log('🧪 initializeFarmState input:', resources.filter(r => r.category === 'farmplot'));
      this.farmState = resources.filter((res) => res.category === 'farmplot' && res.growEnd);
      // Log growEnd values and time remaining
      console.log('🌱 Farm state initialized with growEnd values:', this.farmState.map(r => ({
        type: r.type,
        x: r.x,
        y: r.y,
        growEnd: r.growEnd,
        secondsRemaining: (new Date(r.growEnd) - Date.now()) / 1000,
      })));
    }
  
    addSeed(seed) {
      if (!seed.output) {
        console.warn('⚠️ Trying to add a seed without an output! This will break later.', seed);
      }
      this.farmState.push(seed);
      console.log('addSeed called. Updated farmState:', this.farmState);
    }

  /**
   * Process seeds periodically to check for growth completion.
   */
  startSeedTimer({ gridId, setResources, TILE_SIZE, currentPlayer, setCurrentPlayer }) {
    if (farmTimer) clearInterval(farmTimer);
    console.log("🧪 FarmState starting timer with seeds:");
    this.farmState.forEach(seed => {
      const now = Date.now();
      const secondsRemaining = Math.floor((new Date(seed.growEnd) - now) / 1000);
      console.log(`🌱 ${seed.type} → growEnd=${seed.growEnd}, now=${now}, secondsRemaining=${secondsRemaining}`);
    });
  
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
              true
            );
            console.log('updateGridResource response:', response);

            if (response?.success) {
              console.log(`Seed at (${seed.x}, ${seed.y}) converted to doober.`);
              
              const enriched = {
                ...newCrop,
                x: seed.x,
                y: seed.y
              };

              setResources(prev => {
                const filtered = prev.filter(r => !(r.x === seed.x && r.y === seed.y));
                return [...filtered, enriched];
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