const Frontier = require("../models/frontier");
const globalTuning = require("../tuning/globalTuning.json");
const masterResources = require("../tuning/resources.json"); // ✅ Load masterResources

// **Bank Scheduler**
async function bankScheduler(frontierId, phase) {
    try {
        if (!frontierId) { console.warn("⚠️ No frontierId provided to bankScheduler."); return {}; }
        if (!phase) { console.warn("⚠️ No phase provided to bankScheduler."); return {}; }

        console.group(`\n💰 BANK LOGIC for Frontier ${frontierId} — Phase: ${phase}`);

        switch (phase) {
            case "refreshing":
                console.log("💤 Refreshing phase — no actions required.");
                break;

            case "active":
                // ✅ Generate new offers during "active" phase
                const newOffers = generateBankOffers();
                console.log(`💰✅ ${newOffers.length} new bank offers generated.`);

                return {
                    "bank.offers": newOffers
                };

            default:
                console.warn(`⚠️ Unknown bank phase: ${phase}`);
            }

        return {}; // Default return if no update is needed

    } catch (error) {
        console.error("❌ Error in bankScheduler:", error);
        return {};
    } finally {
        console.groupEnd();
    }
}

// ✅ Function to generate offers based on `masterResources`
function generateBankOffers() {
    const offers = [];
    const numOffers = globalTuning.bankOffers || 3;
    
    // ✅ Filter only resources of category "doober"
    const validResources = masterResources.filter(res => res.category === "doober");

    for (let i = 0; i < numOffers; i++) {
        if (validResources.length === 0) {
            console.warn("⚠️ No valid 'doober' resources found!");
            break;
        }

        // ✅ Pick a random resource
        const selectedItem = validResources[Math.floor(Math.random() * validResources.length)];

        // ✅ Generate random quantity between 1-10
        const qtyBought = Math.floor(Math.random() * 10) + 1; 

        // ✅ Always give Money
        const itemGiven = "Money";

        // ✅ Calculate the amount of Money given
        const minprice = selectedItem.minprice || 50;  // Default to 50 if missing
        const maxprice = selectedItem.maxprice || 150; // Default to 150 if missing
        const pricePerUnit = Math.floor(Math.random() * (maxprice - minprice + 1)) + minprice;
        const qtyGiven = pricePerUnit * qtyBought; // Total payout

        console.log(`📌 Bank Offer: Buying ${qtyBought}x ${selectedItem.type} → Paying ${qtyGiven} Money`);

        // ✅ Push to the offers list
        offers.push({
            itemBought: selectedItem.type,
            qtyBought,
            itemGiven,
            qtyGiven,
        });
    }

    // ✅ Append 3 Permanent Offers
    const permanentOffers = [
        { itemBought: "Silver", qtyBought: 10 },
        { itemBought: "Diamond Ring", qtyBought: 1 },
        { itemBought: "Gold", qtyBought: 1 }
    ];

    // ✅ Ensure we don't add duplicate permanent offers
    permanentOffers.forEach(offer => {
        const exists = offers.some(o => o.itemBought === offer.itemBought);
        if (!exists) {
            const resourceData = masterResources.find(res => res.type === offer.itemBought);
            const minprice = resourceData?.minprice || 500;  
            const maxprice = resourceData?.maxprice || 2000;  
            const pricePerUnit = Math.floor(Math.random() * (maxprice - minprice + 1)) + minprice;
            const qtyGiven = pricePerUnit * offer.qtyBought;

            console.log(`📌 Permanent Offer: Buying ${offer.qtyBought}x ${offer.itemBought} → Paying ${qtyGiven} Money`);

            offers.push({
                itemBought: offer.itemBought,
                qtyBought: offer.qtyBought,
                itemGiven: "Money",
                qtyGiven
            });
        }
    });

    return offers;
}


module.exports = bankScheduler;