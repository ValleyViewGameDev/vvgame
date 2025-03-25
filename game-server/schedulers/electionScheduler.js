const axios = require("axios");
const Settlement = require("../models/settlement");
const Frontier = require("../models/frontier");
const tuningConfig = require("../tuning/globalTuning.json");

// **Election Timer Logic**
async function electionScheduler(frontierId) {
    console.log("📢 Checking election timers...");

    if (!frontierId) {
        console.warn("⚠️ No frontierId provided to electionScheduler.");
        return;
    }

    const now = Date.now();

    // ✅ Fetch only settlements in this frontier
    const settlements = await Settlement.find({ frontierId, population: { $gt: 0 } });

    for (const settlement of settlements) {
        if (!settlement.electionState) {
            console.warn(`⚠️ Settlement ${settlement._id} is missing electionState.`);
            continue;
        }

        let { phase, endTime, votes, campaignPromises } = settlement.electionState;
        endTime = new Date(endTime).getTime(); // Ensure it's a timestamp

        console.log(`🏛️ Processing Settlement: ${settlement.name} (ID: ${settlement._id})`);
        console.log(`   🕒 Current Server Time: ${new Date(now).toLocaleString()}`);
        console.log(`   📌 Current Election Phase: ${phase}`);
        console.log(`   ⏳ Phase End Time: ${new Date(endTime).toLocaleString()}`);

        // ✅ Transition to next phase if current phase has ended
        if (now >= endTime) {
            const phaseOrder = Object.keys(tuningConfig.elections.phases);
            const currentPhaseIndex = phaseOrder.indexOf(phase);
            const nextPhase = currentPhaseIndex + 1 < phaseOrder.length ? phaseOrder[currentPhaseIndex + 1] : phaseOrder[0];
            const nextDuration = tuningConfig.elections.phases[nextPhase] * 60 * 1000;
            const nextEndTime = new Date(now + nextDuration);

            console.log(`   🔄 Transitioning to '${nextPhase}' phase.`);
            
            // ✅ Handle special logic for the Counting phase
            if (nextPhase === "Counting") {
                console.log(`   🏛️ Processing election results for ${settlement.name}...`);

                if (!campaignPromises || campaignPromises.length === 0) {
                    console.warn(`   ⚠️ No candidates. Skipping election.`);
                } else if (!votes || votes.length === 0) {
                    console.warn(`   ⚠️ No votes cast. Skipping election.`);
                } else {
                    console.log(`   🔍 Triggering resolve-election API call...`);
                    try {
                        const response = await axios.post(`${API_BASE}/api/resolve-election`, {
                            settlementId: settlement._id,
                            role: "Mayor",
                        });
                        console.log(`   ✅ resolve-election API Response:`, response.data);
                    } catch (error) {
                        console.error(`   ❌ Error calling resolve-election:`, error?.response?.data || error);
                    }
                }
            }

            // ✅ Handle phase transition & reset election state after Counting phase
            const updateFields = {
                "electionState.phase": nextPhase,
                "electionState.endTime": nextEndTime,
            };

            if (nextPhase === "Administration") {
                updateFields["electionState.votes"] = []; // ✅ Clear votes after counting
                updateFields["electionState.campaignPromises"] = []; // ✅ Clear promises
            }

            await Settlement.findByIdAndUpdate(settlement._id, { $set: updateFields }, { new: true });

            console.log(`   ✅ Updated DB: ${nextPhase} phase set.`);
            console.log(`   ⏳ Next phase '${nextPhase}' ends at ${nextEndTime.toLocaleString()}`);
        }
    }
}

module.exports = electionScheduler;