const Frontier = require("../models/frontier");
const Settlement = require("../models/settlement");
const globalTuning = require("../tuning/globalTuning.json");
const masterResources = require("../tuning/resources.json");
const { getSeasonLevel } = require("../utils/scheduleHelpers");
const { isACrop } = require("../utils/worldUtils");

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
                const seasonLevel = getSeasonLevel(frontier?.seasons?.startTime, frontier?.seasons?.endTime);

                // ✅ Generate new offers during "active" phase
                const newOffers = generateBankOffers(seasonLevel);
                console.log(`💰✅ ${newOffers.length} new bank offers generated.`);

                
                // ✅ Log Bank Offers to All Settlements
                const settlements = await Settlement.find({ frontierId: frontierId });

                for (const settlement of settlements) {
                  if (settlement.population <= 0) continue;
                  const offerSummaries = newOffers.map(o => ({
                    offer: o.itemBought,
                    qty: `${o.qtyBought} for ${o.qtyGiven} ${o.itemGiven}`
                  }));

                  const logEntry = {
                    date: new Date(),
                    seasonlevel: seasonLevel,
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
function generateBankOffers(seasonLevel) {
    const offers = [];
    const numOffers = globalTuning.bankOffers || 3;
    console.log(`🎯 Generating offers for season level ${seasonLevel}`);

    // Filter resources by both category and level
    const validResources = masterResources.filter(res => {
        // Must be a doober and not Money
        if (res.category !== "doober" || res.type === "Money") return false;
        
        // Must be within ±1 of current season level
        const resourceLevel = res.level || 1; // Default to level 1 if not specified
        return Math.abs(resourceLevel - seasonLevel) <= 1;
    });

    for (let i = 0; i < numOffers; i++) {
        if (validResources.length === 0) {
            console.warn("⚠️ No valid resources found for current season level!");
            break;
        }

        // ✅ Pick a random resource
        const selectedItem = validResources[Math.floor(Math.random() * validResources.length)];

        // ✅ Generate quantity based on whether it's a crop and its grow time
        let qtyBought;
        if (isACrop(selectedItem.type)) {
            const growTime = selectedItem.crafttime || 0; // grow time in seconds
            const growTimeHours = growTime / 3600; // convert to hours
            
            if (growTimeHours < 2) {
                // Under 2 hours: 20-50
                qtyBought = Math.floor(Math.random() * (50 - 20 + 1)) + 20;
            } else if (growTimeHours < 24) {
                // Under 1 day: 10-20
                qtyBought = Math.floor(Math.random() * (20 - 10 + 1)) + 10;
            } else {
                // 1 day or more: 5-15
                qtyBought = Math.floor(Math.random() * (15 - 5 + 1)) + 5;
            }
        } else {
            // Non-crops: 1-10 (existing logic)
            qtyBought = Math.floor(Math.random() * 10) + 1;
        } 

        // ✅ Always give Money
        const itemGiven = "Money";

        // ✅ Calculate the amount of Money given
        const minprice = selectedItem.minprice || 50;  // Default to 50 if missing
        const maxprice = selectedItem.maxprice || 150; // Default to 150 if missing
        const midpoint = Math.floor((minprice + maxprice) / 2);
        const pricePerUnit = Math.floor(Math.random() * (midpoint - minprice + 1)) + minprice;
        const qtyGiven = Math.floor(pricePerUnit * qtyBought * 0.9); // Total payout with 0.9 multiplier

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
            const midpoint = Math.floor((minprice + maxprice) / 2);
            const pricePerUnit = Math.floor(Math.random() * (midpoint - minprice + 1)) + minprice;
            const qtyGiven = Math.floor(pricePerUnit * offer.qtyBought * 0.9);

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