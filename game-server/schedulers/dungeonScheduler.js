const Frontier = require("../models/frontier");
const Settlement = require("../models/settlement");
const globalTuning = require("../tuning/globalTuning.json");
const masterResources = require("../tuning/resources.json");

async function dungeonScheduler(frontierId, phase, frontier = null) {
    try {
        if (!frontierId) { console.warn("⚠️ No frontierId provided to dungeonScheduler."); return {}; }
        if (!phase) { console.warn("⚠️ No phase provided to dungeonScheduler."); return {}; }

        console.group(`\n💰 DUNGEON LOGIC for Frontier ${frontierId} — Phase: ${phase}`);
 
        switch (phase) {
            case "open":
                console.log("💤 Open phase — no actions required.");
                break;

            case "resetting":
                console.log("🔄 Dungeon resetting phase — marking all dungeons for reset");
                
                // Get the frontier if not already provided
                if (!frontier) {
                    frontier = await Frontier.findById(frontierId);
                }
                
                if (frontier && frontier.dungeons && frontier.dungeons.size > 0) {
                    console.log(`📋 Found ${frontier.dungeons.size} dungeons to mark for reset`);
                    
                    // Mark all dungeons in this frontier as needing reset
                    for (const [dungeonGridId, dungeonData] of frontier.dungeons.entries()) {
                        console.log(`  - Marking dungeon ${dungeonGridId} for reset`);
                        frontier.dungeons.set(dungeonGridId, {
                            ...dungeonData,
                            needsReset: true
                        });
                    }
                    
                    // Save the frontier with updated dungeon flags
                    await frontier.save();
                    console.log(`✅ Successfully marked ${frontier.dungeons.size} dungeons for reset`);
                } else {
                    console.log("ℹ️ No dungeons found for this frontier");
                }
                break;

            default:
                console.warn(`⚠️ Unknown dungeon phase: ${phase}`);
            }

        return {}; // Default return if no update is needed

    } catch (error) {
        console.error("❌ Error in dungeonScheduler:", error);
        return {};
    } finally {
        console.groupEnd();
    }
}

// Export dungeonScheduler as the default export
module.exports = dungeonScheduler;

