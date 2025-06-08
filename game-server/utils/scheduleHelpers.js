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


function getSeasonLevel(onSeasonStart, onSeasonEnd, now = new Date()) {
    // If we're in offSeason, return 1
    if (!onSeasonStart || !onSeasonEnd || now < onSeasonStart || now > onSeasonEnd) {
        return 1;
    }

    // Calculate total season duration and elapsed time
    const totalDuration = onSeasonEnd - onSeasonStart;
    const elapsedTime = now - onSeasonStart;
    
    // Calculate which sixth of the season we're in
    const sixthLength = totalDuration / 6;
    const currentSixth = Math.floor(elapsedTime / sixthLength) + 1;

    // Map sixths to levels (5th and 6th sixths both return level 5)
    if (currentSixth >= 5) return 5;
    return currentSixth;
}

module.exports = {
  resetAllTimers,
  getSeasonLevel
};