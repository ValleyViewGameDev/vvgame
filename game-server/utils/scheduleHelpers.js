// /utils/scheduleHelpers.js
const Frontier = require("../models/frontier");
const globalTuning = require("../tuning/globalTuning.json");

let activeTimers = {};

/**
 * Resets all timers and forces a restart of event cycles.
 */
const resetAllTimers = async () => {
    console.log("🔄🔄🔄🔄🔄 Resetting ALL event timers... 🔄🔄🔄🔄🔄");
  
    try {
      // ✅ Step 1: Clear all active timers
      console.log("🛑 Clearing active timers...");
      Object.values(activeTimers).forEach(clearTimeout);
      clearAllTimers();
      console.log("✅ Active timers cleared.");
  
      // ✅ Step 2: Fetch all frontiers
      console.log("📡 Fetching all frontiers from database...");
      const frontiers = await Frontier.find();
      if (!frontiers.length) {
        console.warn("⚠️ No frontiers found! Skipping timer reset.");
        return;
      }
      console.log(`✅ Found ${frontiers.length} frontiers. Proceeding with reset.`);
  
      // ✅ Step 3: Reset each event timer for every frontier
      for (const [event, config] of Object.entries(globalTuning)) {
        if (!config.phases) continue;
      
        let startPhase = config.startPhase;
        let durationMinutes = config.phases[startPhase] * 60 * 1000;
      
        // // Special case override for seasons only
        // if (event === "seasons") {
        //   startPhase = "onSeason";
        //   durationMinutes = config.phases["onSeason"] * 60 * 1000;
      
        //   // Optional: reset to Spring for extra safety
        //   for (const frontier of frontiers) {
        //     await Frontier.updateOne(
        //       { _id: frontier._id },
        //       {
        //         $set: {
        //           "seasons.phase": startPhase,
        //           "seasons.seasonType": "Spring",
        //           "seasons.endTime": new Date(Date.now() + durationMinutes),
        //           "seasons.startTime": Date.now(),
        //           "seasons.seasonNumber": 1,
        //         },
        //       }
        //     );
        //   }
        //   console.log(`🌱 Season timer reset to ${startPhase} with duration ${durationMinutes / 60000} min`);
        //   continue; // Skip general timer scheduler for 'seasons'
        // }
      
        // General case for other events
        for (const frontier of frontiers) {
          const bufferTime = 2000;
          await Frontier.updateOne(
            { _id: frontier._id },
            {
              $set: {
                [`${event}.phase`]: startPhase,
                [`${event}.endTime`]: new Date(Date.now() + durationMinutes + bufferTime),
              },
            }
          );
        }
      }
  
      console.log("\n✅ All timers reset successfully!");
  
    } catch (error) {
      console.error("❌ Error resetting timers:", error);
    }
  };


function clearAllTimers() {
Object.values(activeTimers).forEach(clearTimeout);
for (const key in activeTimers) {
    delete activeTimers[key];
}
console.log("✅ Active timers cleared.");
}


module.exports = {
  resetAllTimers,
}