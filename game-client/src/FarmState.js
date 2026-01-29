import { updateGridResource } from './Utils/GridManagement';

let farmTimer = null;

class FarmState {
    constructor() {
      this.farmState = [];
    }
  
    initializeFarmState(resources = [], masterResources = []) {
      // Build a lookup set of farmplot types from masterResources
      const farmplotTypes = new Set();
      for (const mr of masterResources) {
        if (mr.category === 'farmplot' && mr.output) {
          farmplotTypes.add(mr.type);
        }
      }

      // Find farmplots by either category field or type lookup
      this.farmState = resources.filter((res) => {
        if (!res.growEnd) return false;
        return res.category === 'farmplot' || farmplotTypes.has(res.type);
      });
    }

    /**
     * Initialize farm state and immediately process any already-completed farmplots.
     * This handles the case where a player returns to their homestead after farmplots
     * have finished growing while they were away.
     */
    async initializeAndProcessCompleted({ resources, gridId, setResources, masterResources }) {
      // Build a lookup map of farmplot types from masterResources
      // Resources from DB may not have 'category' field, so we look it up by type
      const farmplotMasterMap = new Map();
      for (const mr of masterResources) {
        if (mr.category === 'farmplot' && mr.output) {
          farmplotMasterMap.set(mr.type, mr);
        }
      }

      // Find all farmplots with growEnd by looking up their type in masterResources
      // This handles both enriched resources (with category) and raw DB resources (without)
      const farmplotsWithGrowEnd = [];
      for (const res of resources) {
        if (!res.growEnd) continue;

        // Check if this resource is a farmplot (either by category or by type lookup)
        const isFarmplot = res.category === 'farmplot' || farmplotMasterMap.has(res.type);
        if (isFarmplot) {
          // Enrich with master data if needed (especially 'output' field)
          const masterData = farmplotMasterMap.get(res.type);
          const enrichedRes = masterData ? { ...masterData, ...res } : res;
          farmplotsWithGrowEnd.push(enrichedRes);
        }
      }

      this.farmState = farmplotsWithGrowEnd;
      console.log(`🌾 [FarmState] Found ${this.farmState.length} farmplots with growEnd timers`);

      const now = Date.now();
      const alreadyCompleted = this.farmState.filter((seed) => seed.growEnd <= now);

      if (alreadyCompleted.length > 0) {
        console.log(`🌾 [FarmState] Found ${alreadyCompleted.length} farmplots ready to convert on load`);

        // Process all completed farmplots in parallel for efficiency
        const updatePromises = alreadyCompleted.map(async (seed) => {
          const outputType = seed.output;
          if (!outputType) {
            console.warn(`🌾 [FarmState] Farmplot at (${seed.x}, ${seed.y}) has no output defined`);
            return { seed, success: false };
          }

          const newCrop = masterResources.find((res) => res.type === outputType);

          if (!newCrop) {
            console.warn(`🌾 [FarmState] No target resource found for seed output: ${outputType}`);
            return { seed, success: false };
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
              return {
                seed,
                success: true,
                enriched: { ...newCrop, x: seed.x, y: seed.y }
              };
            }
            return { seed, success: false };
          } catch (error) {
            console.error(`🌾 [FarmState] Error converting farmplot at (${seed.x}, ${seed.y}):`, error);
            return { seed, success: false };
          }
        });

        const results = await Promise.all(updatePromises);
        const successfulConversions = results.filter(r => r.success);

        if (successfulConversions.length > 0) {
          console.log(`🌾 [FarmState] Successfully converted ${successfulConversions.length} farmplots to crops`);

          // Remove converted seeds from farmState
          const convertedPositions = new Set(
            successfulConversions.map(r => `${r.seed.x},${r.seed.y}`)
          );
          this.farmState = this.farmState.filter(s => !convertedPositions.has(`${s.x},${s.y}`));

          // Update UI with converted crops
          setResources(prev => {
            let updated = [...prev];
            for (const { seed, enriched } of successfulConversions) {
              updated = updated.filter(r => !(r.x === seed.x && r.y === seed.y));
              updated.push(enriched);
            }
            return updated;
          });
        }

        // Log any failures for debugging
        const failures = results.filter(r => !r.success);
        if (failures.length > 0) {
          console.warn(`🌾 [FarmState] Failed to convert ${failures.length} farmplots`);
        }
      }
    }
  
    addSeed(seed) {
      if (!seed.output) {
        console.warn('⚠️ Trying to add a seed without an output! This will break later.', seed);
      }
      this.farmState.push(seed);
    }

  /**
   * Process seeds periodically to check for growth completion.
   * Processes seeds in small batches to prevent performance issues on grids with many farmplots.
   */
  startSeedTimer({ gridId, setResources, masterResources }) {
    if (farmTimer) clearInterval(farmTimer);

    // Store the current gridId to check if we're still on the same grid
    const currentGridId = gridId;

    // Guard against concurrent processing
    let isProcessing = false;

    // Maximum seeds to process per timer tick to prevent overwhelming the client/server
    const MAX_SEEDS_PER_TICK = 5;

    farmTimer = setInterval(async () => {
      // Skip if already processing from previous tick
      if (isProcessing) {
        return;
      }

      const now = Date.now();
      const completedSeeds = this.farmState.filter((seed) => seed.growEnd <= now);

      if (completedSeeds.length > 0) {
        isProcessing = true;

        try {
          // Only process a batch of seeds per tick to prevent performance issues
          const seedsToProcess = completedSeeds.slice(0, MAX_SEEDS_PER_TICK);

          // Collect all successful conversions for a single batched UI update
          const successfulConversions = [];
          const seedsToRemove = [];

          for (const seed of seedsToProcess) {
            // First check if this seed still exists in current farmState
            // (it might have been removed by bulk harvest)
            const stillExists = this.farmState.some(s =>
              s.x === seed.x && s.y === seed.y && s.type === seed.type
            );

            if (!stillExists) {
              // Silently skip - no need to log each one
              continue;
            }

            const newCrop = masterResources.find((res) => res.type === seed.output);

            if (!newCrop) {
              console.warn(`No target resource found for seed output: ${seed.output}`);
              // Mark for removal anyway to prevent repeated warnings
              seedsToRemove.push(seed);
              continue;
            }

            try {
              const response = await updateGridResource(
                currentGridId,
                {
                  type: newCrop.type,
                  x: seed.x,
                  y: seed.y,
                },
                true
              );

              if (response?.success) {
                const enriched = {
                  ...newCrop,
                  x: seed.x,
                  y: seed.y
                };

                successfulConversions.push({ seed, enriched });
                seedsToRemove.push(seed);

                // Small delay between server calls to avoid overwhelming the server
                await new Promise(resolve => setTimeout(resolve, 50));
              } else {
                console.warn(`Failed to update grid resource for seed at (${seed.x}, ${seed.y}).`);
              }
            } catch (error) {
              console.error(`Error updating grid resource for seed at (${seed.x}, ${seed.y}):`, error);
            }
          }

          // Batch remove processed seeds from farmState
          if (seedsToRemove.length > 0) {
            this.farmState = this.farmState.filter(s =>
              !seedsToRemove.some(r => r.x === s.x && r.y === s.y && r.type === s.type)
            );
          }

          // Single batched UI update for all successful conversions
          if (successfulConversions.length > 0) {
            setResources(prev => {
              let updated = [...prev];
              for (const { seed, enriched } of successfulConversions) {
                updated = updated.filter(r => !(r.x === seed.x && r.y === seed.y));
                updated.push(enriched);
              }
              return updated;
            });
          }
        } finally {
          isProcessing = false;
        }
      }
    }, 1000);
  }

  
  /**
   * Force process any seeds that are ready to convert
   * This ensures client/server sync before operations like bulk harvest
   */
  async forceProcessPendingSeeds({ gridId, setResources, masterResources }) {
    const now = Date.now();
    const completedSeeds = this.farmState.filter((seed) => seed.growEnd <= now);
    
    if (completedSeeds.length === 0) {
      return true;
    }
    
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
  }
}

const farmStateInstance = new FarmState();
export default farmStateInstance;