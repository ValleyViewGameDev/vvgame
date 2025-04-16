const Frontier = require("../models/frontier");
const globalTuning = require("../tuning/globalTuning.json");
const seasons = require("../tuning/seasons.json");
const seasonFinalizer = require('../utils/seasonFinalizer');
const seasonReset = require('../utils/seasonReset');

async function seasonScheduler(frontierId, phase, frontier = null) {
  
    try {
        if (!frontierId) { console.warn("⚠️ No frontierId provided to seasonScheduler."); return {}; }
        frontier = frontier || await Frontier.findById(frontierId);
        if (!frontier) { console.warn(`⚠️ Frontier ${frontierId} not found.`); return {}; }
    
        console.log(`🌱 SEASON LOGIC for Frontier ${frontierId}; phase = `,phase);

        const { seasons: seasonData } = frontier;  
        const currentSeasonType = seasonData?.seasonType || "Spring";
        const currentSeasonNumber = seasonData?.seasonNumber || 1;

        let nextSeasonType = currentSeasonType;
        let nextSeasonNumber = currentSeasonNumber;

        // ✅ If we're just finishing onSeason, figure out next seasonType
        if (phase === "offSeason") {
            const currentIndex = seasons.findIndex(s => s.seasonType === currentSeasonType);
            nextSeasonType = currentIndex !== -1
            ? seasons[(currentIndex + 1) % seasons.length].seasonType
            : "Spring";

            // DEBUG: Temporarily disable these to test if they're causing the delay
             await seasonFinalizer(frontierId);
            // await seasonReset(frontierId);  
            
            console.log('🏁🏁🏁 FINISHED SEASON LOGIC (phase transition only)');
        }

        // ✅ If we're entering onSeason, bump the season number
        if (phase === "onSeason") {
            nextSeasonNumber += 1;
        }
  
        console.log(`🌸 Next seasonType: ${nextSeasonType}, #${nextSeasonNumber}`);

        return {
            "seasons.seasonType": nextSeasonType,
            "seasons.seasonNumber": nextSeasonNumber,
        };

        } catch (error) {
        console.error("❌ Error in seasonScheduler:", error);
        return {}; // Explicit return
        }
    }

module.exports = seasonScheduler;