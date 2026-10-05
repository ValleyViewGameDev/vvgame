const Frontier = require("../models/frontier");
const globalTuning = require("../tuning/globalTuning.json");

const taxScheduler = require("./taxScheduler");
const seasonScheduler = require("./seasonScheduler");
const trainScheduler = require("./trainScheduler");
const carnivalScheduler = require("./carnivalScheduler");
const bankScheduler = require("./bankScheduler"); 
const electionScheduler = require("./electionScheduler");
const messageScheduler = require("./messageScheduler");
const networthScheduler = require("./networthScheduler");
const dungeonScheduler = require("./dungeonScheduler");
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
  require('./purgeScheduler').start(); // unnamed silent accounts, daily (docs/onboarding-plan.md §5)
  const frontiers = await Frontier.find();
  for (const frontier of frontiers) {
    const { _id: frontierId } = frontier;

    // Schedule each system: tax, seasons, etc.
    scheduleTimedFeature(frontier, "taxes", globalTuning.taxes);
    scheduleTimedFeature(frontier, "seasons", globalTuning.seasons);
    scheduleTimedFeature(frontier, "train", globalTuning.train);
    scheduleTimedFeature(frontier, "carnival", globalTuning.carnival);
    scheduleTimedFeature(frontier, "bank", globalTuning.bank);
    scheduleTimedFeature(frontier, "elections", globalTuning.elections);
    scheduleTimedFeature(frontier, "messages", globalTuning.messages);
    scheduleTimedFeature(frontier, "networth", globalTuning.networth);
    scheduleTimedFeature(frontier, "dungeon", globalTuning.dungeon);
    // Add others 
  }
}

// 🔁 For each timed feature
async function scheduleTimedFeature(frontierOrId, featureKey, tuningData) {
  try {
    // Extract frontierId and fetch fresh frontier document
    const frontierId = frontierOrId._id || frontierOrId;
    const frontier = await Frontier.findById(frontierId);

    if (!frontier || !frontier._id) {
      console.error(`❌ scheduleTimedFeature: Invalid frontier for ${featureKey}:`, frontierId);
      return;
    }
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
      // Reschedule with initialized state - pass only ID to avoid memory leak
      setTimeout(() => scheduleTimedFeature(frontierId, featureKey, tuningData), 30000);
      return;
    }
    const endTime = new Date(state.endTime).getTime();
    const now = Date.now();


    if (now >= endTime) {
      // Use atomic findOneAndUpdate to claim processing rights
      const processingKey = `${featureKey}Processing`;
      const claimResult = await Frontier.findOneAndUpdate(
        { 
          _id: frontierId,
          [`${featureKey}.endTime`]: state.endTime,
          [`${processingKey}`]: { $ne: true }
        },
        { 
          $set: { [`${processingKey}`]: true }
        },
        { new: true }
      );
      
      if (!claimResult) {
        console.log(`⚠️ Another process is already handling ${featureKey} for frontier ${frontierId}`);
        setTimeout(() => scheduleTimedFeature(frontierId, featureKey, tuningData), 30000);
        return;
      }
      
      try {
        const { nextPhase, durationMs } = getNextPhaseData(phase, tuningData.phases);
        const startTime = new Date();
        const nextEndTime = new Date(Date.now() + durationMs);

        // ✅ For seasons: Update phase to "offSeason" IMMEDIATELY so clients see the modal
        if (featureKey === "seasons" && nextPhase === "offSeason") {
          console.log("🕓 Updating phase to offSeason BEFORE running season logic (for client modal)...");

          // Calculate next season type for accurate modal display
          const seasons = require('../tuning/seasons.json');
          const currentSeasonType = frontier.seasons?.seasonType || "Spring";
          const currentIndex = seasons.findIndex(s => s.seasonType === currentSeasonType);
          const nextSeasonType = currentIndex !== -1
            ? seasons[(currentIndex + 1) % seasons.length].seasonType
            : "Spring";

          console.log(`🌸 Transitioning from ${currentSeasonType} to ${nextSeasonType}`);

          await Frontier.updateOne(
            { _id: frontierId },
            {
              $set: {
                "seasons.phase": "offSeason",
                "seasons.startTime": startTime,
                "seasons.endTime": nextEndTime,
                "seasons.seasonType": nextSeasonType // ✅ Update seasonType immediately
              }
            }
          );
          console.log("✅ Phase and seasonType updated - clients should now see correct transition");
        }

        // Run feature-specific logic
        let extraPayload = {};
        switch (featureKey) {
          case "taxes":
            console.log("💰 Triggering taxScheduler...");
            extraPayload = await taxScheduler(frontierId, nextPhase, frontier);
            break;
          case "seasons":
            console.log("🗓️ Triggering seasonScheduler...");
            extraPayload = await seasonScheduler(frontierId, nextPhase, frontier);
            break;
          case "elections":
            console.log("🏛️ Triggering electionsScheduler...");
            extraPayload = await electionScheduler(frontierId, nextPhase, frontier);
            break;
          case "train":
            console.log("🚂 Triggering trainScheduler...");
            extraPayload = await trainScheduler(frontierId, nextPhase, frontier);
            break;
          case "carnival":
            console.log("🎡 Triggering carnivalScheduler...");
            extraPayload = await carnivalScheduler(frontierId, nextPhase, frontier);
            break;
          case "bank":
            console.log("🏦 Triggering bankScheduler...");
            extraPayload = await bankScheduler(frontierId, nextPhase, frontier);
            break;
          case "messages":
            console.log("📪 Triggering messageScheduler...");
            extraPayload = await messageScheduler(frontierId, nextPhase, frontier);
            break;
          case "networth":
            console.log("💰 Triggering networthScheduler...");
            extraPayload = await networthScheduler(frontierId, nextPhase, frontier);
            break;
          case "dungeon":
            console.log("⚔️ Triggering dungeonScheduler...");
            extraPayload = await dungeonScheduler(frontierId, nextPhase, frontier);
            break;
          default:
            console.warn(`⚠️ No scheduler found for ${featureKey}. Skipping...`);
        }

        // Merge scheduler result with timer update and clear processing flag
        const processingKey = `${featureKey}Processing`;
        const updatePayload = {
          [`${featureKey}.phase`]: nextPhase,
          [`${featureKey}.startTime`]: startTime,
          [`${featureKey}.endTime`]: nextEndTime,
          [`${processingKey}`]: false,
          ...extraPayload, // may be empty
        };

        const updateResult = await Frontier.updateOne(
          { _id: frontierId },
          { $set: updatePayload }
        );
        console.log(`   💾 DB Update result: ${JSON.stringify(updateResult)}`);

        // Schedule next check - pass only ID to avoid memory leak
        setTimeout(() => scheduleTimedFeature(frontierId, featureKey, tuningData), 15000);
      } catch (error) {
        // If error occurs, clear the processing flag
        const processingKey = `${featureKey}Processing`;
        await Frontier.updateOne(
          { _id: frontierId },
          { $set: { [`${processingKey}`]: false } }
        );
        throw error;
      }
    } else {
      // When continuing an existing phase, use remaining time until end
      const delayMs = Math.max(endTime - now, 1000); // Minimum 1 second delay
      console.log(`⏳ Next ${featureKey} check in ${Math.floor(delayMs / 1000)}s`);
      setTimeout(() => scheduleTimedFeature(frontierId, featureKey, tuningData), 15000);
    }
  } catch (error) {
    console.error(`❌ Error in scheduleTimedFeature for ${featureKey}:`, error);
    // Retry after 1 minute on error - pass only ID to avoid memory leak
    setTimeout(() => scheduleTimedFeature(frontierId, featureKey, tuningData), 60000);
  }
}

// ✅ Don't initialize timers immediately - let server.js call this after MongoDB connects
// initializeTimers();

module.exports = { initializeTimers };
