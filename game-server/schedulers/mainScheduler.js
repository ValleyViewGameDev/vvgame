const Frontier = require("../models/frontier");
const globalTuning = require("../tuning/globalTuning.json");
const taxScheduler = require("./taxScheduler");
const seasonScheduler = require("./seasonScheduler");
const trainScheduler = require("./trainScheduler");
const bankScheduler = require("./bankScheduler");
const electionScheduler = require("./electionScheduler");
// Add more logic-only schedulers as needed...

// Helper: Advance to the next phase for a given system
const getNextPhaseData = (currentPhase, phases) => {
  const keys = Object.keys(phases);
  const currentIndex = keys.indexOf(currentPhase);
  const nextIndex = (currentIndex + 1) % keys.length;
  const nextPhase = keys[nextIndex];
  // durationMs: The full intended duration of the next phase
  const durationMs = phases[nextPhase] * 60 * 1000;
  return { nextPhase, durationMs };
};

async function initializeTimers() {
  console.log("⏰ INITIALIZING TIMERS...");
  const frontiers = await Frontier.find();
  for (const frontier of frontiers) {
    const { _id: frontierId } = frontier;

    // Schedule each system: tax, seasons, etc.
    scheduleTimedFeature(frontier, "taxes", globalTuning.taxes);
    scheduleTimedFeature(frontier, "seasons", globalTuning.seasons);
    scheduleTimedFeature(frontier, "train", globalTuning.train);
    scheduleTimedFeature(frontier, "bank", globalTuning.bank);
    scheduleTimedFeature(frontier, "elections", globalTuning.elections);
    // Add others like trainScheduler, elections, etc.
  }
}

// 🔁 For each timed feature
async function scheduleTimedFeature(frontier, featureKey, tuningData) {
  try {
    // Refresh frontier document to get latest state
    frontier = await Frontier.findById(frontier._id);
    if (!frontier) {
      console.error(`❌ Frontier ${frontier._id} not found. Stopping scheduler for ${featureKey}`);
      return;
    }

    const frontierId = frontier._id;
    const state = frontier[featureKey] || {};
    const phase = state.phase || tuningData.startPhase;

    // If no endTime exists, initialize it
    if (!state.endTime) {
      const durationMs = tuningData.phases[phase] * 60 * 1000;
      const startTime = new Date();
      const endTime = new Date(Date.now() + durationMs);

      await Frontier.updateOne(
        { _id: frontierId },
        {
          $set: {
            [`${featureKey}.phase`]: phase,
            [`${featureKey}.startTime`]: startTime,
            [`${featureKey}.endTime`]: endTime
          }
        }
      );

      // Reschedule with initialized state
      setTimeout(() => scheduleTimedFeature(frontier, featureKey, tuningData), durationMs);
      return;
    }

    const endTime = new Date(state.endTime).getTime();
    const now = Date.now();

    console.log(`🔍 Debug: ${featureKey} check for Frontier ${frontierId}`);
    console.log(`   Phase: ${phase}, Current Time: ${new Date(now).toISOString()}`);
    console.log(`   End Time: ${new Date(endTime).toISOString()}`);
    console.log(`   Time Remaining: ${Math.floor((endTime - now) / 1000)}s`);

    if (now >= endTime) {
      console.log(`⏰ Phase change triggered for ${featureKey}`);
      // When starting a new phase, use the full duration from tuning
      const { nextPhase, durationMs } = getNextPhaseData(phase, tuningData.phases);
      const nextEndTime = new Date(Date.now() + durationMs);
      const startTime = new Date();

      const updatePayload = {
        [`${featureKey}.phase`]: nextPhase,
        [`${featureKey}.startTime`]: startTime,
        [`${featureKey}.endTime`]: nextEndTime,
      };

      await Frontier.updateOne({ _id: frontierId }, { $set: updatePayload });

      // Run feature-specific logic
      let extraPayload = {};
      switch (featureKey) {
        case "taxes":
          console.log("💰 Triggering taxScheduler...");
          extraPayload = await taxScheduler(frontierId, nextPhase);
          break;
        case "seasons":
          console.log("🗓️ Triggering seasonScheduler...");
          extraPayload = await seasonScheduler(frontierId, nextPhase);
          break;
        case "elections":
          console.log("🏛️ Triggering electionsScheduler...");
          extraPayload = await electionScheduler(frontierId, nextPhase);
          break;
        case "train":
          console.log("🚂 Triggering trainScheduler...");
          extraPayload = await trainScheduler(frontierId, nextPhase);
          break;
        case "bank":
          console.log("🏦 Triggering bankScheduler...");
          extraPayload = await bankScheduler(frontierId, nextPhase);
          break;
        default:
          console.warn(`⚠️ No scheduler found for ${featureKey}. Skipping...`);
      }

      if (Object.keys(extraPayload).length > 0) {
        await Frontier.updateOne({ _id: frontierId }, { $set: extraPayload });
      }

      // Schedule next check with fresh duration
      setTimeout(() => scheduleTimedFeature(frontier, featureKey, tuningData), durationMs);
    } else {
      // Calculate next check time with more frequent checks near the end
      const timeRemaining = endTime - now;
      let delayMs;
      
      if (timeRemaining <= 5000) { // Last 5 seconds
          delayMs = Math.max(100, Math.min(1000, timeRemaining)); // Check every 0.1-1 seconds
      } else if (timeRemaining <= 30000) { // Last 30 seconds
          delayMs = Math.max(1000, Math.min(5000, timeRemaining)); // Check every 1-5 seconds
      } else {
          delayMs = Math.max(5000, Math.min(30000, timeRemaining)); // Check every 5-30 seconds
      }

      console.log(`⏳ Next ${featureKey} check in ${Math.floor(delayMs / 1000)}s (${timeRemaining/1000}s remaining)`);
      setTimeout(() => scheduleTimedFeature(frontier, featureKey, tuningData), delayMs);
    }
  } catch (error) {
    console.error(`❌ Error in scheduleTimedFeature for ${featureKey}:`, error);
    // Retry after 1 minute on error
    setTimeout(() => scheduleTimedFeature(frontier, featureKey, tuningData), 60000);
  }
}

// Initialize timers when the server starts
initializeTimers();
