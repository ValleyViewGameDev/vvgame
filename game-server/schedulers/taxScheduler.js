const Frontier = require("../models/frontier");
const { levyTax } = require("../controllers/taxController");
const { updateNetWorthForFrontier } = require("../utils/networthCalc");

// ✅ Delay helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const taxScheduler = async (frontierId) => {
    console.log("📊 Tax scheduler triggered for Frontier:", frontierId);

    try {
        if (!frontierId) { console.warn("⚠️ No frontierId provided to taxScheduler."); return; }
        const frontier = await Frontier.findById(frontierId);
        if (!frontier) { console.warn(`⚠️ Frontier ${frontierId} not found.`); return; }
        const phase = frontier.taxes?.phase || "waiting";
        if (phase !== "taxing") { console.log(`⏳ Taxes in '${phase}' phase. No taxing actions performed.`); return; }

        // ✅ Taxing phase logic
        console.log(`\n💰💰💰 ===== TAX CYCLE STARTED for Frontier ${frontierId} =====`);
        console.log(`💰 Checking if taxes should be levied for Frontier ${frontierId}...`);

        try {
            const taxResult = await levyTax(frontierId);

            if (taxResult?.success) {
                console.log(`💰✅ Taxes levied: ${taxResult.totalTaxCollected}`);
                console.log(`👑 Mayor payouts:`, taxResult.mayorPayouts);
            } else {
                console.warn(`⚠️ Tax levy skipped: ${taxResult?.message || "Unknown reason"}`);
            }
        } catch (error) {
            console.error("❌ Error during levyTax():", error);
        }

        // ✅ Optional pause before net worth update
        await delay(5000);

        console.group(`📊📊📊 ===== UPDATING NET WORTH for Frontier ${frontierId} =====`);
        await updateNetWorthForFrontier(frontierId);
        console.groupEnd();

    } catch (error) {
        console.error("❌ Error running taxScheduler:", error);
    }
};

module.exports = taxScheduler;