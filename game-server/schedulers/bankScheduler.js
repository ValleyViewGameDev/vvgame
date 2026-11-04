const Frontier = require("../models/frontier");
const Settlement = require("../models/settlement");
const globalTuning = require("../tuning/globalTuning.json");
const masterResources = require("../tuning/resources.json");
const { getSeasonLevel } = require("../utils/scheduleHelpers");
const { isACrop } = require("../utils/worldUtils");
const offerEligibility = require("../utils/offerEligibility");

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
                const valleyOffers = generateValleyBankOffers();
                console.log(`💰✅ ${newOffers.length} new bank offers, ${valleyOffers.length} valley offers generated.`);

                
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
                    "bank.offers": newOffers,
                    "bank.valleyOffers": valleyOffers
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

// A quantity no other offer for the same resource already uses: step up (then down) from the roll
function rollDistinctQty(qty, takenQtys) {
    if (!takenQtys.includes(qty)) return qty;
    for (let d = 1; d < 100; d++) {
        if (!takenQtys.includes(qty + d)) return qty + d;
        if (qty - d >= 1 && !takenQtys.includes(qty - d)) return qty - d;
    }
    return qty;
}

// ✅ Function to generate offers based on `masterResources`
function generateBankOffers(seasonLevel) {
    const offers = [];
    const numOffers = globalTuning.bankOffers || 3;
    console.log(`🎯 Generating offers for season level ${seasonLevel}`);

    // Filter resources by both category and level
    const validResources = masterResources.filter(res => {
        // The static gates (a good, not Money, not noBank) are the shared rule: utils/offerRules.mjs
        if (offerEligibility.blocked(res, 'bank')) return false;
        
        // Must be within ±1 of current season level
        const resourceLevel = res.level || 1; // Default to level 1 if not specified
        return Math.abs(resourceLevel - seasonLevel) <= 1;
    });

    // Variety (docs/tuning.md, Bank): every offer in a round is a different resource. Picks are
    // drawn WITHOUT replacement; only when the level's pool is smaller than the number of offers
    // does a resource come up twice, and then never at the same quantity (rollDistinctQty).
    let pool = [];
    for (let i = 0; i < numOffers; i++) {
        if (validResources.length === 0) {
            console.warn("⚠️ No valid resources found for current season level!");
            break;
        }

        // ✅ Pick a random resource not yet offered this round (refill the bag only if it runs dry)
        if (pool.length === 0) pool = [...validResources];
        const selectedItem = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];

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
        qtyBought = rollDistinctQty(qtyBought, offers.filter((o) => o.itemBought === selectedItem.type).map((o) => o.qtyBought));

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
        { itemBought: "Gold", qtyBought: 2 }
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

// Counting Houses in the valleys (owner, 2026-11-02): always the same resources
// (globalTuning.valleyBankOffers: Wood, Stone, Clay, Silver, Diamond Ring, Gold), ignoring the
// season level and the noBank flag; only the quantity (qtyMin..qtyMax) and the price vary per round.
// The price per unit is drawn like the town Bank's (minprice to the min/max midpoint) but not
// floored per unit, so cheap goods such as Wood still pay something.
function generateValleyBankOffers() {
    const offers = [];
    for (const spec of globalTuning.valleyBankOffers || []) {
        const resourceData = masterResources.find(res => res.type === spec.itemBought);
        if (!resourceData) { console.warn(`⚠️ Valley bank offer for unknown resource ${spec.itemBought}`); continue; }
        const qtyMin = spec.qtyMin || 1;
        const qtyMax = Math.max(qtyMin, spec.qtyMax || qtyMin);
        const qtyBought = Math.floor(Math.random() * (qtyMax - qtyMin + 1)) + qtyMin;
        const minprice = resourceData.minprice || 0;
        const maxprice = resourceData.maxprice || minprice;
        const midpoint = (minprice + maxprice) / 2;
        const pricePerUnit = minprice + Math.random() * (midpoint - minprice);
        const qtyGiven = Math.max(1, Math.floor(pricePerUnit * qtyBought * 0.9));
        offers.push({ itemBought: spec.itemBought, qtyBought, itemGiven: "Money", qtyGiven });
    }
    return offers;
}

// Export bankScheduler as the default export
module.exports = bankScheduler;

// Add generateBankOffers as a property of bankScheduler
bankScheduler.generateBankOffers = generateBankOffers;
bankScheduler.generateValleyBankOffers = generateValleyBankOffers;