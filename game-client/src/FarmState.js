import axios from 'axios';
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
  startSeedTimer({ gridId, setResources, masterResources }) {
    if (farmTimer) clearInterval(farmTimer);
    
    // Store the current gridId to check if we're still on the same grid
    const currentGridId = gridId;
    
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
        console.log('Using provided masterResources');
  
        // Process all completed seeds in parallel instead of sequentially
        const updatePromises = completedSeeds.map(async (seed) => {
          // First check if this seed still exists in current farmState
          // (it might have been removed by bulk harvest)
          const stillExists = this.farmState.some(s => 
            s.x === seed.x && s.y === seed.y && s.type === seed.type
          );
          
          if (!stillExists) {
            console.log(`Seed at (${seed.x}, ${seed.y}) no longer exists in farmState, skipping conversion.`);
            return null;
          }
          
          console.log('Processing seed:', seed);
          const newCrop = masterResources.find((res) => res.type === seed.output);
          console.log('Target output (crop) found for seed:', newCrop);
          
          if (!newCrop) {
            console.warn(`No target resource found for seed output: ${seed.output}`);
            return null;
          }

          try {
            console.log(`Updating grid resource for seed at (${seed.x}, ${seed.y}).`);
            const response = await updateGridResource(
              currentGridId, 
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

              return { seed, enriched };
            } else {
              console.warn(`Failed to update grid resource for seed at (${seed.x}, ${seed.y}).`);
              return null;
            }
          } catch (error) {
            console.error(`Error updating grid resource for seed at (${seed.x}, ${seed.y}):`, error);
            return null;
          }
        });

        // Wait for all updates to complete
        const results = await Promise.all(updatePromises);
        
        // Filter out failed updates
        const successfulUpdates = results.filter(result => result !== null);
        
        // Update the UI state all at once
        if (successfulUpdates.length > 0) {
          setResources(prev => {
            // Remove all successfully updated seeds
            const seedPositions = successfulUpdates.map(({ seed }) => `${seed.x},${seed.y}`);
            const filtered = prev.filter(r => !seedPositions.includes(`${r.x},${r.y}`));
            
            // Add all new crops
            const newCrops = successfulUpdates.map(({ enriched }) => enriched);
            return [...filtered, ...newCrops];
          });
          
          // Remove processed seeds from farmState
          const processedSeeds = successfulUpdates.map(({ seed }) => seed);
          this.farmState = this.farmState.filter(s => !processedSeeds.includes(s));
          console.log('Updated farmState after removing processed seeds:', this.farmState);
        }
      }
    }, 1000);
  }

  
  /**
   * Force process any seeds that are ready to convert
   * This ensures client/server sync before operations like bulk harvest
   */
  async forceProcessPendingSeeds({ gridId, setResources, masterResources }) {
    console.log('🔄 Force processing pending seeds for sync...');
    
    const now = Date.now();
    const completedSeeds = this.farmState.filter((seed) => seed.growEnd <= now);
    
    if (completedSeeds.length === 0) {
      console.log('✅ No pending seeds to process');
      return true;
    }
    
    console.log(`⏳ Processing ${completedSeeds.length} completed seeds before bulk operation...`);
    
    try {
      // Process all completed seeds
      const updatePromises = completedSeeds.map(async (seed) => {
        const newCrop = masterResources.find((res) => res.type === seed.output);
        
        if (!newCrop) {
          console.warn(`No target resource found for seed output: ${seed.output}`);
          return null;
        }

        try {
          const response = await updateGridResource(
            gridId, 
            { 
              type: newCrop.type,
              x: seed.x,
              y: seed.y,
            },
            true
          );

          if (response?.success) {
            console.log(`✅ Seed at (${seed.x}, ${seed.y}) synced to server as ${newCrop.type}`);
            return { seed, enriched: { ...newCrop, x: seed.x, y: seed.y } };
          }
          return null;
        } catch (error) {
          console.error(`Error syncing seed at (${seed.x}, ${seed.y}):`, error);
          return null;
        }
      });

      // Wait for all updates
      const results = await Promise.all(updatePromises);
      const successfulUpdates = results.filter(result => result !== null);
      
      // Update local state
      if (successfulUpdates.length > 0) {
        setResources(prev => {
          const seedPositions = successfulUpdates.map(({ seed }) => `${seed.x},${seed.y}`);
          const filtered = prev.filter(r => !seedPositions.includes(`${r.x},${r.y}`));
          const newCrops = successfulUpdates.map(({ enriched }) => enriched);
          return [...filtered, ...newCrops];
        });
        
        // Remove from farmState
        const processedSeeds = successfulUpdates.map(({ seed }) => seed);
        this.farmState = this.farmState.filter(s => !processedSeeds.includes(s));
      }
      
      console.log(`✅ Sync complete: ${successfulUpdates.length}/${completedSeeds.length} seeds processed`);
      return true;
    } catch (error) {
      console.error('❌ Error during force sync:', error);
      return false;
    }
  }
  
  /**
   * Stop the seed timer.
   */
  stopSeedTimer() {
    if (farmTimer) clearInterval(farmTimer);
    farmTimer = null;
    // Clear farmState when stopping to prevent stale data
    this.farmState = [];
    console.log('🛑 FarmState timer stopped and state cleared');
  }
}

const farmStateInstance = new FarmState();
export default farmStateInstance;