const Frontier = require("../models/frontier"); 
const Player = require("../models/player"); 
const Grid = require("../models/grid"); 
const Resource = require("../models/resource"); 
const globalTuning = require("../tuning/globalTuning.json");
const { levyTax } = require("../controllers/taxController"); 
const masterResources = require("../tuning/resources.json"); 

async function taxScheduler(frontierId) {
    try {
        if (!frontierId) {
            console.warn("⚠️ No frontierId provided to taxScheduler.");
            return;
        }

        const frontier = await Frontier.findById(frontierId);
        if (!frontier) {
            console.warn(`⚠️ Frontier ${frontierId} not found.`);
            return;
        }

        const now = Date.now();
        const taxState = frontier.taxes || {};
        let phase = taxState.phase || globalTuning.taxes.startPhase;
        let endTime = taxState.endTime ? new Date(taxState.endTime).getTime() : 0;

        console.group(`\n🚀 Triggering taxes - Phase: ${phase} (Frontier ${frontierId})`);

        // ✅ If the timer has expired, move to the next phase
        if (now >= endTime) {
            let nextPhase = phase === "taxing" ? "waiting" : "taxing";
            let nextDuration = globalTuning.taxes.phases[nextPhase] * 60 * 1000;
            let nextEndTime = now + nextDuration;

            if (nextPhase === "taxing") {
                console.log(`\n💰💰💰 ===== TAX CYCLE STARTED for Frontier ${frontierId} =====\n`);

                // ✅ Levy Taxes
                console.log(`💰 Checking if taxes should be levied for Frontier ${frontierId}...`);

                try {
                    console.log("⚡ levyTax is being executed...");
                    const taxResult = await levyTax(frontierId);

                    if (taxResult?.success) {
                        console.log(`💰✅ Taxes successfully levied: ${taxResult.totalTaxCollected} collected.`);
                        console.log(`👑 Mayor payouts:`, taxResult.mayorPayouts);
                    } else {
                        console.warn(`⚠️ Tax levy skipped: ${taxResult?.message || "Unknown error"}`);
                    }
                } catch (error) {
                    console.error("❌ Error executing levyTax():", error);
                }

                // ✅ Wait 5 seconds before net worth update
                await delay(5000);

                // ✅ Update Net Worth
                console.group(`\n📊📊📊 ===== UPDATING NET WORTH for Frontier ${frontierId} =====`);
                await updateNetWorthForFrontier(frontierId);
                console.groupEnd();
            } else {
                console.log(`⏳ Taxes in 'waiting' phase. No actions needed.`);
            }

            // ✅ Transition to the next phase
            console.log(`⏳ Transitioning taxes to '${nextPhase}' phase.`);
            const frontier = await Frontier.findById(frontierId);
            if (!frontier) {
                console.warn(`⚠️ Frontier ${frontierId} not found.`);
                return;
            }
            
            // ✅ Preserve all required fields in the update
            frontier.taxes.phase = nextPhase;
            frontier.taxes.endTime = new Date(nextEndTime);
            
            await Frontier.updateOne(
                { _id: frontierId },
                { 
                    $set: { 
                        "taxes.phase": nextPhase,
                        "taxes.endTime": new Date(nextEndTime)
                    }
                }
            );

            console.log(`✅ Taxes transitioned to '${nextPhase}'. Next tax collection scheduled for ${new Date(nextEndTime).toLocaleString()}`);
        
        } else {
            console.log(`⏳ Taxes phase '${phase}' is still active. End time: ${new Date(endTime).toLocaleString()}`);
        }

        console.groupEnd();
    } catch (error) {
        console.error("❌ Error running tax scheduler:", error);
    }
}



// ✅ Simple delay function
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ✅ Function to calculate and update net worth for all players in a frontier
// ✅ Function to calculate and update net worth for all players in a frontier
async function updateNetWorthForFrontier(frontierId) {
    try {
        const players = await Player.find({ frontierId });
        if (players.length === 0) {
            console.warn(`⚠️ No players found for frontier ${frontierId}. Skipping net worth update.`);
            return;
        }
        console.log(`📊📊📊 Updating net worth for ${players.length} players in frontier ${frontierId}...`);

        // ✅ Iterate over players once and calculate their net worth
        for (const player of players) {
            const netWorth = await calculateNetWorth(player); // ✅ Await the async function

            if (isNaN(netWorth) || netWorth === undefined) {
                console.warn(`⚠️ Skipping update for ${player.username}: Net worth is invalid.`);
                continue; // ✅ Skip updating if the net worth calculation fails
            }

            // ✅ Update player's net worth directly in the database
            const updatedPlayer = await Player.findOneAndUpdate(
                { _id: player._id },
                { $set: { netWorth: netWorth } }, // ✅ Ensure a valid number is written
                { new: true } // ✅ Return the updated document
            );

            if (updatedPlayer) {
                console.log(`💰 ${updatedPlayer.username}: Net Worth Updated -> ${updatedPlayer.netWorth}`);
            } else {
                console.warn(`⚠️ Net worth update failed for player ${player.username}`);
            }
        }

        console.log("✅ Net worth update completed for all players in the frontier!");

    } catch (error) {
        console.error(`❌ Error updating net worth for frontier ${frontierId}:`, error);
    }
}

async function calculateNetWorth(player) {
    let totalWorth = 0;

    console.log(`📊📊 ${player.username}: Calculating Net Worth 📊📊`);

    // ✅ Step 1: Add Money from inventory
    // ✅ Step 2: Add minPrice * qty of all items in inventory & backpack
    console.log(`📦 Adding inventory items to net worth`);
    let inventoryValue = 0; // Track total inventory value separately
    [...(player.inventory || []), ...(player.backpack || [])].forEach(item => {
        const resourceData = masterResources.find(res => res.type === item.type);
        const minPrice = resourceData?.minprice || 0;
        const itemValue = (item.quantity || 0) * minPrice; // Value per item type
        inventoryValue += itemValue; // Increase inventoryValue, not totalWorth
    });
    totalWorth += inventoryValue; // Add to total net worth
    console.log(`✅ Total inventory contribution: ${inventoryValue}`);

    // ✅ Step 3: Fetch built structures and add their value
    console.log(`🏗️ Adding built structures to net worth`);
    let structuresValue = 0; // Track total structure value separately
    if (player.gridId) {
        const playerStructures = await getGridStructures(player.gridId);
        playerStructures.forEach(structure => {
            const resourceData = masterResources.find(res => res.type === structure.type);
            const minPrice = resourceData?.minprice || 0;
            structuresValue += minPrice; // Increase structuresValue, not totalWorth
        });
    }
    totalWorth += structuresValue; // Add to total net worth
    console.log(`✅ Total built structures contribution: ${structuresValue}`);

    // ✅ Step 4: Add minPrice of all skills
    console.log(`🎓 Adding skills to net worth`);
    let skillsValue = 0; // Track total skill value separately
    (player.skills || []).forEach(skill => {
        const resourceData = masterResources.find(res => res.type === skill.type);
        const minPrice = resourceData?.minprice || 0;
        skillsValue += minPrice; // Increase skillsValue, not totalWorth
    });
    totalWorth += skillsValue; // Add to total net worth
    console.log(`✅ Total skills contribution: ${skillsValue}`);

    // ✅ Ensure net worth is always valid
    totalWorth = isNaN(totalWorth) || totalWorth === undefined ? 0 : totalWorth;

    console.log(`📊 FINAL Net Worth for ${player.username}: ${totalWorth}`);
    return totalWorth || 0;
}

// ✅ Fetch a player's built structures (Crafting Stations & Deco)
async function getGridStructures(gridId) {
    try {
        if (!gridId) {
            console.warn("⚠️ No gridId provided to getGridStructures.");
            return [];
        }

        console.log(`🔍 Fetching resources for gridId: ${gridId}...`);

        // ✅ Fetch the grid document
        const grid = await Grid.findById(gridId);
        if (!grid) { console.warn(`⚠️ Grid ${gridId} not found.`); return []; }
        // ✅ Extract resources array from the grid document
        const gridResources = grid.resources || [];
        if (gridResources.length === 0) {
            console.warn(`⚠️ No resources found on grid ${gridId}.`);
            return [];
        }

        // ✅ Log full resource details before filtering
        console.log(`📦 Found ${gridResources.length} resources in grid ${gridId}.`);

        // ✅ Check which resources are failing lookup in masterResources
        gridResources.forEach(resource => {
            const resourceData = masterResources.find(res => res.type === resource.type);
            if (!resourceData) {
                console.warn(`⚠️ No matching resource data for type: ${resource.type}`);
            }
        });

        // ✅ Filter for crafting stations and deco items
        const validStructures = gridResources.filter(resource => {
            const resourceData = masterResources.find(res => res.type === resource.type);
            return resourceData && (resourceData.category === "crafting" || resourceData.category === "deco");
        });

        // ✅ Log which structures passed the filter
        if (validStructures.length > 0) {
            console.log(`✅ Found ${validStructures.length} crafting/deco structures in grid ${gridId}.`);
        } else {
            console.warn(`⚠️ No crafting or deco structures found in grid ${gridId}, but resources exist.`);
        }

        return validStructures;

    } catch (error) {
        console.error(`❌ Error fetching structures for grid ${gridId}:`, error);
        return [];
    }
}

module.exports = taxScheduler;