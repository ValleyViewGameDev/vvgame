const Settlement = require("../models/settlement");
const Frontier = require("../models/frontier");
const Player = require("../models/player");
const tuningConfig = require("../tuning/globalTuning.json");
const API_BASE = process.env.API_BASE || 'http://localhost:3001'; // Add API base URL

async function electionScheduler(frontierId, phase, frontier = null) {
    if (!frontierId) { console.warn("⚠️ No frontierId provided to electionScheduler."); return {}; }

    console.log(`🏛️ ELECTION LOGIC for Frontier ${frontierId}, Phase: ${phase}`);

    // ✅ Fetch only settlements in this frontier
    const settlements = await Settlement.find({ frontierId, population: { $gt: 0 } });

    for (const settlement of settlements) {
        const { votes, campaignPromises } = settlement;

        console.log(`🏛️ Processing Settlement: ${settlement.name} (ID: ${settlement._id})`);
        console.log(`📊 Current votes:`, votes);
        console.log(`📢 Campaign promises:`, campaignPromises);

        if (phase === "Counting") {
            console.log(`🔍 Checking election resolution for ${settlement.name}...`);

            if (!campaignPromises?.length) {
                console.warn(`⚠️ No candidates for ${settlement.name}. Skipping election.`);
                continue;
            }

            if (!votes?.length) {
                console.warn(`⚠️ No votes cast for ${settlement.name}. Skipping election.`);
                continue;
            }

            // Count votes
            const voteCounts = votes.reduce((acc, vote) => {
                const candidateId = vote.candidateId.toString();
                acc[candidateId] = (acc[candidateId] || 0) + 1;
                return acc;
            }, {});

            console.log(`📊 Vote counts for ${settlement.name}:`, voteCounts);

            // Find winner
            let winnerId = null;
            let maxVotes = 0;
            Object.entries(voteCounts).forEach(([candidateId, count]) => {
                if (count > maxVotes) {
                    winnerId = candidateId;
                    maxVotes = count;
                }
            });

            if (winnerId) {
                try {
                    console.log(`🏆 Winner found for ${settlement.name}: ${winnerId}`);

                    // First, find and remove Mayor role from any player who has it
                    await Player.updateMany(
                        { role: "Mayor" },
                        { $unset: { role: "" } }
                    );

                    // Then assign Mayor role to the winner
                    await Player.findByIdAndUpdate(winnerId, { role: "Mayor" });

                    // Update settlement roles
                    const updatedRoles = settlement.roles.filter(r => r.roleName !== "Mayor");
                    updatedRoles.push({
                        roleName: "Mayor",
                        playerId: winnerId
                    });

                    // Save changes and clear election data
                    await Settlement.findByIdAndUpdate(settlement._id, {
                        $set: {
                            roles: updatedRoles,
                            votes: [],
                            campaignPromises: []
                        }
                    });

                    console.log(`✅ Mayor role assigned in ${settlement.name}`);
                } catch (error) {
                    console.error(`❌ Error updating mayor for ${settlement.name}:`, error);
                }
            } else {
                console.log(`⚠️ No winner determined for ${settlement.name}`);
            }
        }
    }

    return {};
}

module.exports = electionScheduler;