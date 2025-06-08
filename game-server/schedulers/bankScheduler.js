const Frontier = require("../models/frontier");
const Settlement = require("../models/settlement");
const globalTuning = require("../tuning/globalTuning.json");
const masterResources = require("../tuning/resources.json");
const { getSeasonLevel } = require("../utils/scheduleHelpers");

// **Bank Scheduler**
async function bankScheduler(frontierId, phase, frontier = null) {
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
                const newOffers = generateBankOffers(frontier);
                console.log(`💰✅ ${newOffers.length} new bank offers generated.`);

                // ✅ Log Bank Offers to All Settlements
                const settlements = await Settlement.find({ frontierId: frontierId });

                for (const settlement of settlements) {
                  const offerSummaries = newOffers.map(o => ({
                    offer: o.itemBought,
                    qty: `${o.qtyBought} for ${o.qtyGiven} ${o.itemGiven}`
                  }));

                  const logEntry = {
                    date: new Date(),
                    offers: offerSummaries
                  };

                  await Settlement.updateOne(
                    { _id: settlement._id },
                    {
                      $push: {
                        banklog: {
                          $each: [logEntry],
                          $slice: -6 // Keep only the last 6 entries
                        }
                      }
                    }
                  );
                }

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
function generateBankOffers(frontier) {
    const offers = [];
    const numOffers = globalTuning.bankOffers || 3;
    
    // Get current season level
    const seasonLevel = getSeasonLevel(
        frontier?.seasons?.onSeasonStart,
        frontier?.seasons?.onSeasonEnd
    );
    
    // Filter resources by both category and level
    const validResources = masterResources.filter(res => {
        // Must be a doober
        if (res.category !== "doober") return false;
        
        // Must be within ±1 of current season level
        const resourceLevel = res.level || 1; // Default to level 1 if not specified
        return Math.abs(resourceLevel - seasonLevel) <= 1;
    });

    console.log(`🎯 Generating offers for season level ${seasonLevel}`);

    for (let i = 0; i < numOffers; i++) {
        if (validResources.length === 0) {
            console.warn("⚠️ No valid resources found for current season level!");
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

// Export bankScheduler as the default export
module.exports = bankScheduler;

// Add generateBankOffers as a property of bankScheduler
bankScheduler.generateBankOffers = generateBankOffers;