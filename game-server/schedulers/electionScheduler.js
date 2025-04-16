const axios = require("axios");
const Settlement = require("../models/settlement");
const Frontier = require("../models/frontier");
const tuningConfig = require("../tuning/globalTuning.json");

async function electionScheduler(frontierId, phase, frontier = null) {

    if (!frontierId) { console.warn("⚠️ No frontierId provided to electionScheduler."); return {}; }

    console.log(`🏛️ ELECTION LOGIC for Frontier ${frontierId}`);

    // ✅ Fetch only settlements in this frontier
    const settlements = await Settlement.find({ frontierId, population: { $gt: 0 } });

    for (const settlement of settlements) {
        if (!settlement.electionState) {
            console.warn(`⚠️ Settlement ${settlement._id} is missing electionState.`);
            continue;
        }

        const { votes, campaignPromises } = settlement.electionState;

        console.log(`🏛️ Processing Settlement: ${settlement.name} (ID: ${settlement._id})`);
        console.log(`   📌 Election Phase: ${phase}`);

        if (phase === "Counting") {
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

        if (phase === "Campaigning") {
            // Handled on client
            return{};
        }

        if (phase === "Voting") {
            // Handled on client
            return{};
        }

        if (phase === "Administration") {
            console.log(`   🧹 Clearing votes and campaignPromises for ${settlement.name}`);
            await Settlement.findByIdAndUpdate(settlement._id, {
              $set: {
                "electionState.votes": [],
                "electionState.campaignPromises": []
              }
            });
            console.log(`   ✅ Election state cleaned.`);
          }
        }
    return {}; // Election scheduler never modifies Frontier fields
}

module.exports = electionScheduler;