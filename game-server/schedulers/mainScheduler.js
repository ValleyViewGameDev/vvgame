const fs = require("fs");
const path = require("path");
const globalTuning = require("../tuning/globalTuning.json");

// Import event-specific schedulers
const { scheduleEvent } = require("../utils/scheduleHelpers"); // Adjust path if needed
const Frontier = require("../models/frontier");

// Stores active timers
let activeTimers = {};

console.log("📆 Main Scheduler Initialized...");

const initializeTimers = async () => {
    try {
      console.log("🔄 Initializing all event timers...");
  
      const frontiers = await Frontier.find();
      if (!frontiers.length) {
        console.warn("⚠️ No frontiers found! Skipping timer initialization.");
        return;
      }
  

      for (const [event, config] of Object.entries(globalTuning)) {
        if (!config.phases) continue;
  
        for (const frontier of frontiers) {
          const now = Date.now();
          const eventState = frontier[event] || {}; // Ensure eventState exists
  
          let currentPhase = eventState.phase || config.startPhase;
          let currentEndTime = eventState.endTime || null;
          let nextPhase, nextDuration;
  
          if (currentEndTime && now < new Date(currentEndTime).getTime()) {
            // Timer is still valid
            nextPhase = currentPhase;
            nextDuration = new Date(currentEndTime).getTime() - now;
          } else {
            // Timer expired or missing → move to next phase
            nextPhase = getNextPhase(event, currentPhase);
            nextDuration = globalTuning[event].phases[nextPhase] * 60 * 1000;
          }
  
          console.log(`🕒 Now: ${new Date(now).toLocaleString()}, Current EndTime: ${currentEndTime}`);
          console.log(`📆 Scheduling nextPhase: ${nextPhase}, for ${nextDuration / 1000}s`);
    
          // ✅ Only update the `event` section of the frontier document
          await Frontier.updateOne(
            { _id: frontier._id },
            { $set: { [`${event}.phase`]: nextPhase, [`${event}.endTime`]: new Date(now + nextDuration) } }
          );
  
          scheduleEvent(event, nextPhase, nextDuration, frontier._id);
        }
      }
    } catch (error) {
      console.error("❌ Error initializing timers:", error);
    }
  };




/**
 * Determines the next phase of an event.
 */
const getNextPhase = (event, currentPhase) => {
  const phases = Object.keys(globalTuning[event].phases);
  const currentIndex = phases.indexOf(currentPhase);
  return currentIndex + 1 < phases.length ? phases[currentIndex + 1] : phases[0]; // Loop back to start
};

/**
 * Resets all timers and forces a restart of event cycles.
 */
const resetAllTimers = async () => {
    console.log("🔄🔄🔄🔄🔄 Resetting ALL event timers... 🔄🔄🔄🔄🔄");
  
    try {
      // ✅ Step 1: Clear all active timers
      console.log("🛑 Clearing active timers...");
      Object.values(activeTimers).forEach(clearTimeout);
      activeTimers = {}; // Reset timer storage
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
          scheduleEvent(event, startPhase, durationMinutes + bufferTime, frontier._id);        }
      }
  
      console.log("\n✅ All timers reset successfully!");
  
    } catch (error) {
      console.error("❌ Error resetting timers:", error);
    }
  };


// Initialize timers when the server starts
initializeTimers();

// Export functions for external access (e.g., API routes)
module.exports = { resetAllTimers };