const Frontier = require("../models/frontier");
const { levyTax } = require("../controllers/taxController");
const { updateNetWorthForFrontier } = require("../utils/networthCalc");

const taxScheduler = async (frontierId) => {

    try {
        if (!frontierId) { console.warn("⚠️ No frontierId provided to taxScheduler."); return {}; }
        const frontier = await Frontier.findById(frontierId);
        if (!frontier) { console.warn(`⚠️ Frontier ${frontierId} not found.`); return {}; }

        console.log(`💰 TAX LOGIC for Frontier ${frontierId}`);

        const phase = frontier.taxes?.phase || "waiting";
        if (phase !== "taxing") { console.log(`⏳ Taxes in '${phase}' phase. No taxing actions performed.`); return {}; }

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

        console.group(`📊📊📊 ===== UPDATING NET WORTH for Frontier ${frontierId} =====`);
        await updateNetWorthForFrontier(frontierId);
        console.groupEnd();
        return {}; 

    } catch (error) {
        console.error("❌ Error running taxScheduler:", error);
        return {}; 
    }
};

module.exports = taxScheduler;