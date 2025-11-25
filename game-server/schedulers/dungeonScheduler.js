const Frontier = require("../models/frontier");

async function dungeonScheduler(frontierId, phase, frontier = null) {
    try {
        if (!frontierId || !phase) {
            console.warn("⚠️ Missing frontierId or phase in dungeonScheduler");
            return {};
        }

        console.log(`\n⚔️ DUNGEON SCHEDULER - Frontier: ${frontierId}, Phase: ${phase}`);
 
        switch (phase) {
            case "open":
                console.log("🟢 Dungeons are now OPEN - no action needed");
                break;

            case "resetting":
                console.log("🔄 Dungeons are now RESETTING - marking all for reset");
                
                // Use findByIdAndUpdate to directly update the dungeons in the database
                try {
                    if (!frontier) {
                        frontier = await Frontier.findById(frontierId);
                    }
                    
                    if (!frontier || !frontier.dungeons || frontier.dungeons.size === 0) {
                        console.log("ℹ️ No dungeons found for this frontier");
                        return {};
                    }
                    
                    console.log(`📋 Found ${frontier.dungeons.size} dungeons to mark for reset`);
                    
                    // MongoDB stores Maps as objects, so we need to update using dot notation
                    const updateOperations = {};
                    
                    for (const [dungeonGridId, dungeonData] of frontier.dungeons.entries()) {
                        // Use dot notation to update specific fields in the Map
                        updateOperations[`dungeons.${dungeonGridId}.needsReset`] = true;
                        console.log(`  ✓ Marking dungeon ${dungeonGridId} for reset`);
                    }
                    
                    console.log("📝 Update operations:", updateOperations);
                    
                    // Update the frontier document using $set with dot notation
                    const updateResult = await Frontier.findByIdAndUpdate(
                        frontierId,
                        { $set: updateOperations },
                        { new: true }
                    );
                    
                    if (updateResult) {
                        console.log(`✅ Successfully marked dungeons for reset`);
                        
                        // Verify the update
                        const verifyFrontier = await Frontier.findById(frontierId);
                        if (verifyFrontier && verifyFrontier.dungeons) {
                            for (const [id, data] of verifyFrontier.dungeons.entries()) {
                                console.log(`  🔍 Dungeon ${id}: needsReset = ${data.needsReset}`);
                            }
                        }
                    } else {
                        console.error("❌ Failed to update frontier document");
                    }
                } catch (error) {
                    console.error("❌ Error marking dungeons for reset:", error);
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

