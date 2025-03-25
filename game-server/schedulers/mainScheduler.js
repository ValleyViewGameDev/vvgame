const fs = require("fs");
const path = require("path");
const globalTuning = require("../tuning/globalTuning.json");

// Import event-specific schedulers
const taxScheduler = require("./taxScheduler");
const seasonScheduler = require("./seasonScheduler");
const electionScheduler = require("./electionScheduler");
const trainScheduler = require("./trainScheduler");
const bankScheduler = require("./bankScheduler");
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
 * Schedules an event for a specific frontier.
 */
const scheduleEvent = (event, phase, duration, frontierId) => {
    console.log(`⏳ Scheduling ${event} - Phase: ${phase} (Frontier ${frontierId}) for ${duration / 60000} min...`);

    if (activeTimers[`${event}-${frontierId}`]) { clearTimeout(activeTimers[`${event}-${frontierId}`]); }

    activeTimers[`${event}-${frontierId}`] = setTimeout(async () => {
        console.log(`🚀 Triggering ${event} - Phase: ${phase} (Frontier ${frontierId})`);

        switch (event) {
            case "taxes":
                await taxScheduler(frontierId);
                break;
            case "seasons":
                await seasonScheduler(frontierId);
                break;
            case "elections":
                await electionScheduler(frontierId);
                break;
            case "train":
                await trainScheduler(frontierId);
                break;
            case "bank":
                await bankScheduler(frontierId);
                break;
            default:
                console.warn(`⚠️ No scheduler found for ${event}. Skipping...`);
                return;
        }

        const nextPhase = getNextPhase(event, phase);
        const nextDuration = globalTuning[event].phases[nextPhase] * 60 * 1000;

        await Frontier.updateOne(
            { _id: frontierId },
            event === "bank"
                ? { $set: { [`bank.phase`]: nextPhase, [`bank.endTime`]: Date.now() + nextDuration } }
                : { $set: { [`${event}.phase`]: nextPhase, [`${event}.endTime`]: Date.now() + nextDuration } }
        );

        scheduleEvent(event, nextPhase, nextDuration, frontierId);
    }, duration);
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
  
        console.log(`\n🔄 Resetting timers for '${event}'...`);
  
        const startPhase = config.startPhase;
        const durationMinutes = config.phases[startPhase] * 60 * 1000;
  
        for (const frontier of frontiers) {
          console.log(`📌 Resetting '${event}' in Frontier ${frontier._id} to phase '${startPhase}'...`);
          const bufferTime = 2000; // ✅ Add a 2-second buffer to avoid instant expiration
          // ✅ Update the frontier document to set the event to its initial phase
          await Frontier.updateOne(
            { _id: frontier._id },
            { 
              $set: { 
                [`${event}.phase`]: startPhase, 
                [`${event}.endTime`]: new Date(Date.now() + durationMinutes + bufferTime) 
              }
            }
          ); 
  
          console.log(`✅ '${event}' reset in Frontier ${frontier._id}. New end time: ${new Date(Date.now() + durationMinutes).toLocaleString()}`);
  
          // ✅ Schedule the event
          scheduleEvent(event, startPhase, durationMinutes, frontier._id);
        }
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