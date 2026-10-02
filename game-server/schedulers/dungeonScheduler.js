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
                // Phase 2: dungeons are per-player copies. Each copy resets lazily on the player's next
                // entry when its resetEpoch predates frontier.dungeon.startTime (utils/gridResolver).
                console.log("🔄 Dungeon clock rolled over; per-player copies reset on next entry");
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

