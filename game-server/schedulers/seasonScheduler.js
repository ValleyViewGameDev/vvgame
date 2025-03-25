const Frontier = require("../models/frontier"); 
const globalTuning = require("../tuning/globalTuning.json");
const seasons = require("../tuning/seasons.json"); // ✅ Import seasons.json

async function seasonScheduler(frontierId) {
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
        if (!frontier.seasons || !frontier.seasons.endTime) {
            console.warn(`⚠️ Skipping ${frontier.name}: Missing seasons or endTime.`);
            return;
        }
        
        const now = Date.now();
        let { phase, endTime, seasonType, seasonNumber } = frontier.seasons;
        endTime = new Date(endTime); // Ensure valid Date object

        console.log('🌱🌱🌱🌱 Season Scheduler; Current EndTime =', endTime.toLocaleString());

        // ✅ If the season phase has ended, update to the next phase
        if (now >= endTime) {
            console.group(`\n🌱 SEASON PHASE UPDATE for Frontier ${frontierId}`);

            // Determine next phase: Toggle between "onSeason" and "offSeason"
            const nextPhase = (phase === "onSeason") ? "offSeason" : "onSeason";
            const nextDuration = globalTuning.seasons.phases[nextPhase] * 60 * 1000;

            // ✅ Ensure `seasons.json` is correctly loaded
            if (!Array.isArray(seasons) || seasons.length === 0) {
                console.error("❌ ERROR: seasons.json is empty or not loaded correctly.");
                return;
            }

            // ✅ Determine next seasonType when entering "onSeason"
            let nextSeasonType = seasonType || "Spring"; // Default if undefined
            if (nextPhase === "onSeason") {
                const seasonIndex = seasons.findIndex(s => s.seasonType === seasonType);
                if (seasonIndex === -1) {
                    console.warn(`⚠️ Unknown seasonType: ${seasonType}. Defaulting to Spring.`);
                    nextSeasonType = "Spring";
                } else {
                    nextSeasonType = seasons[(seasonIndex + 1) % seasons.length].seasonType;
                }
            }

            // ✅ Calculate new season end time
            const nextSeasonEnd = new Date(now + nextDuration);

            // ✅ Update Database & Fetch Updated Document
            const updatedFrontier = await Frontier.findByIdAndUpdate(
                frontierId,
                {
                    "seasons.phase": nextPhase,
                    "seasons.seasonType": nextSeasonType,
                    "seasons.endTime": nextSeasonEnd,
                    "seasons.startTime": now,
                    $inc: { "seasons.seasonNumber": (phase === "offSeason" ? 1 : 0) } // Increment only after offSeason
                },
                { new: true } // ✅ Return updated document
            );

            console.log(`🌍 Updated Season: ${updatedFrontier.name} → ${nextPhase} | Type: ${nextSeasonType}`);
            console.log(`⏳ Next Season Phase Ends: ${nextSeasonEnd.toLocaleString()} (Duration: ${nextDuration / 60000} min)`);
            console.groupEnd();
        } else {
            console.log(`✅ Season is active. Phase: ${phase}, Ends in: ${Math.round((endTime - now) / 60000)} min`);
        }

    } catch (error) {
        console.error("❌ Error in seasonScheduler:", error);
    }
}

module.exports = seasonScheduler;