const Frontier = require("../models/frontier");
const globalTuning = require("../tuning/globalTuning.json");
const seasons = require("../tuning/seasons.json");
const seasonFinalizer = require('../utils/seasonFinalizer');
const seasonReset = require('../utils/seasonReset');

async function seasonScheduler(frontierId) {
  
    try {
        if (!frontierId) { console.warn("⚠️ No frontierId provided to seasonScheduler."); return {}; }
        const frontier = await Frontier.findById(frontierId);
        if (!frontier) { console.warn(`⚠️ Frontier ${frontierId} not found.`); return {}; }
    
        console.log(`🌱 SEASON LOGIC for Frontier ${frontierId}`);

        const { seasons: seasonData } = frontier;  
        const currentPhase = seasonData?.phase;
        const currentSeasonType = seasonData?.seasonType || "Spring";
        const currentSeasonNumber = seasonData?.seasonNumber || 1;

        let nextSeasonType = currentSeasonType;
        let nextSeasonNumber = currentSeasonNumber;

        // ✅ If we're just finishing onSeason, figure out next seasonType
        if (currentPhase === "onSeason") {
            const currentIndex = seasons.findIndex(s => s.seasonType === currentSeasonType);
            nextSeasonType = currentIndex !== -1
            ? seasons[(currentIndex + 1) % seasons.length].seasonType
            : "Spring";
        // Future hooks:
        // await seasonFinalizer(frontierId);
        // await seasonReset(frontierId);
        }

        // ✅ If we're entering onSeason, bump the season number
        if (currentPhase === "offSeason") {
            nextSeasonNumber += 1;
        }
  
        console.log(`🌸 Next seasonType: ${nextSeasonType}, #${nextSeasonNumber}`);

        return {
            "seasons.seasonType": nextSeasonType,
            "seasons.seasonNumber": nextSeasonNumber,
            "seasons.startTime": now
        };

        } catch (error) {
        console.error("❌ Error in seasonScheduler:", error);
        return {}; // Explicit return
        }
    }

module.exports = seasonScheduler;