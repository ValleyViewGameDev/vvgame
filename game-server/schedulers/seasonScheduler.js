const Frontier = require("../models/frontier");
const globalTuning = require("../tuning/globalTuning.json");
const seasons = require("../tuning/seasons.json");
const seasonFinalizer = require('../utils/seasonFinalizer');
const seasonReset = require('../utils/seasonReset');
const { scheduleEvent } = require("../utils/scheduleHelpers"); // Adjust path if needed


async function seasonScheduler(frontierId) {
  console.log("🔥 seasonScheduler START - frontierId:", frontierId);

  try {
    if (!frontierId) {
      console.warn("⚠️ No frontierId provided to seasonScheduler.");
      return;
    }

    const frontier = await Frontier.findById(frontierId);
    if (!frontier) {
      console.warn(`⚠️ Frontier ${frontierId} not found.`);
      return;
    }

    const { seasons: seasonData } = frontier;
    if (!seasonData || !seasonData.endTime) {
      console.warn(`⚠️ Skipping ${frontier.name}: Missing season data or endTime.`);
      return;
    }

    const now = new Date();
    const endTime = new Date(seasonData.endTime);
    const currentPhase = seasonData.phase;
    const currentSeasonType = seasonData.seasonType || "Spring";
    const currentSeasonNumber = seasonData.seasonNumber || 1;

    console.log(`🌱🌱🌱🌱 Season Scheduler | Phase: ${currentPhase} | EndTime: ${endTime.toLocaleString()}`);
    console.log("⏱️ Raw now:", now.getTime(), "| Raw endTime:", endTime.getTime());
    console.log("⏱️ Delta ms:", endTime.getTime() - now.getTime());


    // Only proceed if phase has expired
    if (now >= endTime) {
      console.group(`\n🌱 SEASON PHASE UPDATE for Frontier ${frontierId}`);

      const nextPhase = currentPhase === "onSeason" ? "offSeason" : "onSeason";
      const nextDurationMin = globalTuning.seasons.phases[nextPhase];
      const nextDurationMs = nextDurationMin * 60 * 1000;
      const nextEndTime = new Date(now.getTime() + nextDurationMs);

      // Determine next seasonType if entering offSeason (advance season)
      let nextSeasonType = currentSeasonType;
      let nextSeasonNumber = currentSeasonNumber;

      if (currentPhase === "onSeason" && nextPhase === "offSeason") {
        const currentIndex = seasons.findIndex(s => s.seasonType === currentSeasonType);
        nextSeasonType = currentIndex !== -1
          ? seasons[(currentIndex + 1) % seasons.length].seasonType
          : "Spring";
      }

      if (currentPhase === "offSeason" && nextPhase === "onSeason") {
        // Only increment season number when starting a new onSeason
        nextSeasonNumber += 1;
      }

        console.log("🧪 globalTuning.seasons.phases:", globalTuning.seasons.phases);
        console.log("🧪 Setting new phase:", nextPhase);
        console.log("🧪 Duration in ms:", nextDurationMs);

      // Update the database
      await Frontier.updateOne(
        { _id: frontierId },
        {
          $set: {
            "seasons.phase": nextPhase,
            "seasons.seasonType": nextSeasonType,
            "seasons.startTime": now,
            "seasons.endTime": nextEndTime,
            "seasons.seasonNumber": nextSeasonNumber,
          }
        }
      );
      
      console.log(`🌍 Season updated → Phase: ${nextPhase}, Type: ${nextSeasonType}, #${nextSeasonNumber}`);
      console.log(`⏳ Next Phase Ends At: ${nextEndTime.toLocaleString()} (Duration: ${nextDurationMin} min)`);
      console.groupEnd();

      scheduleEvent("seasons", nextPhase, nextDurationMs, frontierId);
      
      // Optional hooks
      // if (nextPhase === "offSeason") {
      //   console.log("🎯 Running seasonFinalizer...");
      //   await seasonFinalizer(frontierId);
      // }

      // if (nextPhase === "onSeason") {
      //   console.log("🔄 Running seasonReset...");
      //   await seasonReset(frontierId);
      // }

    } else {
      const minutesLeft = Math.round((endTime - now) / 60000);
      console.log(`✅ Season is active | Phase: ${currentPhase} | Ends in: ${minutesLeft} min`);
    }

  } catch (error) {
    console.error("❌ Error in seasonScheduler:", error);
  }
}

module.exports = seasonScheduler;