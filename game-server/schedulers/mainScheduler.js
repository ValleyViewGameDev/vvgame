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
  const frontierId = frontier._id;
  const state = frontier[featureKey] || {};
  const phase = state.phase || tuningData.startPhase;
  const endTime = new Date(state.endTime).getTime();
  const now = Date.now();

  // Debug logging for endTime and phase
  console.log(`🔍 Debug: Frontier ${frontierId}, Feature ${featureKey}`);
  console.log(`   Current Phase: ${phase}`);
  console.log(`   End Time: ${state.endTime} (${endTime})`);
  console.log(`   Now: ${new Date(now).toISOString()} (${now})`);

  if (isNaN(endTime)) {
    console.error(`❌ Invalid endTime for ${featureKey} in Frontier ${frontierId}. Skipping...`);
    return;
  }

  if (now >= endTime) {
    console.log(`⏰ ${featureKey.toUpperCase()} expired for Frontier ${frontierId}. Running logic...`);

    const { nextPhase, durationMs } = getNextPhaseData(phase, tuningData.phases);
    const nextEndTime = new Date(Date.now() + durationMs);
    const startTime = new Date();

    const updatePayload = {
      [`${featureKey}.phase`]: nextPhase,
      [`${featureKey}.startTime`]: startTime,
      [`${featureKey}.endTime`]: nextEndTime,
    };

    // ✅ Save phase update to DB immediately
    await Frontier.updateOne({ _id: frontierId }, { $set: updatePayload });

    console.log(`📦 Updated phase → ${nextPhase} immediately for Frontier ${frontierId}`);

    // ⏳ Then run feature-specific logic
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

    // Save additional fields if needed
    if (Object.keys(extraPayload).length > 0) {
      await Frontier.updateOne(
        { _id: frontierId },
        { $set: extraPayload }
      );
    }

    // Schedule the next check
    setTimeout(() => {
      scheduleTimedFeature(frontier, featureKey, tuningData);
    }, durationMs);

  } else {
    // 🔁 Recheck at correct time
    const delayMs = Math.max(endTime - now, 100); // ✅ Ensure it's never < 0
    console.log(`⏳ ${featureKey} still in '${phase}' for Frontier ${frontierId}. Will check again at ${new Date(endTime).toLocaleString()}`);
    setTimeout(() => {
      scheduleTimedFeature(frontier, featureKey, tuningData);
    }, delayMs);
  }
}

// Initialize timers when the server starts
initializeTimers();
