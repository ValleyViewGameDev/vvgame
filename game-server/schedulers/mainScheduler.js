const Frontier = require("../models/frontier");
const globalTuning = require("../tuning/globalTuning.json");
const taxScheduler = require("./taxScheduler");
const seasonScheduler = require("./seasonScheduler");
const trainScheduler = require("./trainScheduler");
const bankScheduler = require("./bankScheduler");
const electionScheduler = require("./electionScheduler");
// Add more logic-only schedulers as needed...

// Helper: Wait X ms
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
  const frontiers = await Frontier.find();
  for (const frontier of frontiers) {
    const { _id: frontierId } = frontier;

    // Schedule each system: tax, seasons, etc.
    scheduleTimedFeature(frontier, "taxes", globalTuning.taxes, taxScheduler);
    scheduleTimedFeature(frontier, "seasons", globalTuning.seasons, seasonScheduler);
    scheduleTimedFeature(frontier, "train", globalTuning.train, trainScheduler);
    scheduleTimedFeature(frontier, "bank", globalTuning.bank, bankScheduler);
    scheduleTimedFeature(frontier, "elections", globalTuning.elections, electionScheduler);
    // Add others like trainScheduler, elections, etc.
  }
}

// 🔁 For each timed feature
async function scheduleTimedFeature(frontier, featureKey, tuningData, logicFunction) {
  const frontierId = frontier._id;
  const state = frontier[featureKey] || {};
  const phase = state.phase || tuningData.startPhase;
  const endTime = new Date(state.endTime).getTime();
  const now = Date.now();
  
  if (now >= endTime) {
    console.log(`⏰ ${featureKey.toUpperCase()} expired for Frontier ${frontierId}. Running logic...`);

    const { nextPhase, durationMs } = getNextPhaseData(phase, tuningData.phases);

    let extraPayload = {};

    // ✅ Run feature-specific logic
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
        console.warn(`⚠️ No scheduler found for ${event}. Skipping...`);
    }

    const nextEndTime = new Date(Date.now() + durationMs);
    const startTime = new Date(now);

    const updatePayload = {
      [`${featureKey}.phase`]: nextPhase,
      [`${featureKey}.startTime`]: startTime,
      [`${featureKey}.endTime`]: nextEndTime,
      ...extraPayload
    };

    // ✅ Save to DB
    await Frontier.updateOne(
      { _id: frontierId },
      { $set: updatePayload }
    );

    console.log(`✅ ${featureKey} advanced to '${nextPhase}' for Frontier ${frontierId}. Next end: ${nextEndTime.toLocaleString()}`);

    // ✅ Schedule the next check
    setTimeout(() => {
      scheduleTimedFeature(frontier, featureKey, tuningData, logicFunction);
    }, durationMs);
    
  } else {
    // 🔁 Recheck at correct time
    const delayMs = endTime - now;
    console.log(`⏳ ${featureKey} still in '${phase}' for Frontier ${frontierId}. Will check again at ${new Date(endTime).toLocaleString()}`);
    setTimeout(() => {
      scheduleTimedFeature(frontier, featureKey, tuningData, logicFunction);
    }, delayMs);
  }
}



// Initialize timers when the server starts
initializeTimers();

