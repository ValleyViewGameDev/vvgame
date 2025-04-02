const Player = require("../models/player");
const Grid = require("../models/grid");
const masterResources = require("../tuning/resources.json");

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

module.exports = {
    updateNetWorthForFrontier,
    calculateNetWorth
  };