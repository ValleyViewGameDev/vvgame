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
        if (settlement.population <= 0) { continue; }

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

            // Find winner with tie handling
            let winnerId = null;
            let maxVotes = 0;
            let tiedCandidates = [];

            Object.entries(voteCounts).forEach(([candidateId, count]) => {
                if (count > maxVotes) {
                    maxVotes = count;
                    tiedCandidates = [candidateId];
                } else if (count === maxVotes) {
                    tiedCandidates.push(candidateId);
                }
            });

            if (tiedCandidates.length === 1) {
                winnerId = tiedCandidates[0];
            } else if (tiedCandidates.length > 1) {
                console.warn(`⚠️ Tie detected between ${tiedCandidates.length} candidates. Picking randomly.`);
                winnerId = tiedCandidates[Math.floor(Math.random() * tiedCandidates.length)];
            }

            // Prepare candidates array for election log
            const candidates = [];
            for (const candidatePromise of campaignPromises) {
                const candidateIdStr = candidatePromise.playerId ? candidatePromise.playerId.toString() : null;
                const votesForCandidate = candidateIdStr && voteCounts[candidateIdStr] ? voteCounts[candidateIdStr] : 0;
                let username = "Unknown";
                try {
                    if (candidateIdStr) {
                        const player = await Player.findById(candidateIdStr);
                        if (player) {
                            username = player.username;
                        }
                    }
                } catch (error) {
                    console.warn(`⚠️ Could not resolve username for candidate ${candidateIdStr}:`, error);
                }
                candidates.push({
                    playerId: candidateIdStr,
                    username,
                    votes: votesForCandidate
                });
            }

            // LOG THE ELECTION RESULTS
            let electedMayorUsername = "None";
            if (winnerId) {
                try {
                    const winnerPlayer = await Player.findById(winnerId);
                    electedMayorUsername = winnerPlayer?.username || "Unknown";
                } catch (error) {
                    console.warn(`⚠️ Could not resolve elected mayor username:`, error);
                }
            }
            const electionLogEntry = {
                date: new Date(),
                candidates,
                electedmayor: electedMayorUsername,
            };
            await Settlement.updateOne(
                { _id: settlement._id },
                {
                    $push: {
                        electionlog: {
                            $each: [electionLogEntry],
                            $slice: -10
                        }
                    }
                }
            );

            if (winnerId) {
                try {
                    console.log(`🏆 Winner found for ${settlement.name}: ${winnerId}`);

                    // First, reset all Mayors in this settlement back to Citizen
                    await Player.updateMany(
                        { role: "Mayor", settlementId: settlement._id },
                        { $set: { role: "Citizen" } }
                    );

                    // Then assign Mayor role to the winner
                    const updatedWinner = await Player.findByIdAndUpdate(
                        winnerId, 
                        { $set: { role: "Mayor" } },
                        { new: true }
                    );
                    console.log(`✅ Player ${updatedWinner.username} role updated to: ${updatedWinner.role}`);

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

                    console.log(`📝 Election log entry added for ${settlement.name}`);

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