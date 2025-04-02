const Frontier = require("../models/frontier");
const globalTuning = require("../tuning/globalTuning.json");
const seasons = require("../tuning/seasons.json");
const seasonFinalizer = require('../utils/seasonFinalizer');
const seasonReset = require('../utils/seasonReset');

async function seasonScheduler(frontierId) {
    
    console.log("🔥 seasonScheduler START - frontierId:", frontierId);
  
    try {
        if (!frontierId) { console.warn("⚠️ No frontierId provided to seasonScheduler."); return {}; }
        const frontier = await Frontier.findById(frontierId);
        if (!frontier) { console.warn(`⚠️ Frontier ${frontierId} not found.`); return {}; }
    
        const { seasons: seasonData } = frontier;  
        const currentPhase = seasonData?.phase;
        const currentSeasonType = seasonData?.seasonType || "Spring";
        const currentSeasonNumber = seasonData?.seasonNumber || 1;

        console.group(`\n🌱 SEASON LOGIC for Frontier ${frontierId}`);
  
        const nextPhase = currentPhase === "onSeason" ? "offSeason" : "onSeason";

        let nextSeasonType = currentSeasonType;
        let nextSeasonNumber = currentSeasonNumber;


        if (nextPhase === "offSeason") {
            const index = seasons.findIndex(s => s.seasonType === currentSeasonType);
            nextSeasonType = index !== -1
                ? seasons[(index + 1) % seasons.length].seasonType
                : "Spring";
            }

            if (nextPhase === "onSeason") {
            nextSeasonNumber += 1;
            }
        
        const now = new Date();

        console.log(`📋 Computed nextPhase: ${nextPhase}`);
        console.log(`🌸 Next seasonType: ${nextSeasonType}, #${nextSeasonNumber}`);
        console.groupEnd();

        // Optional future hooks:
        // if (nextPhase === "offSeason") await seasonFinalizer(frontierId);
        // if (nextPhase === "onSeason") await seasonReset(frontierId);

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