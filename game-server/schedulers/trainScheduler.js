const Frontier = require("../models/frontier");
const Settlement = require("../models/settlement");
const Player = require("../models/player");
const globalTuning = require("../tuning/globalTuning.json");
const masterResources = require("../tuning/resources.json");
const sendMailboxMessage = require("../utils/messageUtils.js");
const { scheduleEvent } = require("../utils/scheduleHelpers");
const seasonsConfig = require("../tuning/seasons.json");

async function trainScheduler(frontierId, phase, frontier = null) {
  try {
    frontier = frontier || await Frontier.findById(frontierId);
    if (!frontier || !frontier.train) {
      console.warn(`⚠️ Frontier ${frontierId} not found or missing train data.`);
      return;
    }

    console.log(`🚂 TRAIN LOGIC for Frontier ${frontierId}; phase =`, phase);

    const settlements = await Settlement.find({ population: { $gt: 0 }, frontierId });

    for (const settlement of settlements) {
      console.log(`  🚉 Settlement ${settlement.name} - Using Frontier Phase: ${phase}`);
      
      if (phase === "departing") {
        // ✅ Check and distribute rewards during departing phase
        const currentOffers = settlement.currentoffers || [];
        console.log('DEBUG: Departing phase - checking offers:', JSON.stringify(currentOffers, null, 2));
        
        const fulfilledPlayerIds = [...new Set(
          currentOffers
            .filter(offer => offer.filled && offer.claimedBy)
            .map(offer => offer.claimedBy.toString())
        )];

        if (fulfilledPlayerIds.length > 0) {
          console.log(`🎉 Some Train orders filled for ${settlement.name}. Sending rewards...`);
          console.log('DEBUG: Reward distribution - Players:', fulfilledPlayerIds);
          console.log('DEBUG: Rewards to distribute:', settlement.trainrewards);

          for (const playerId of fulfilledPlayerIds) {
            const consolidated = consolidateRewards(settlement.trainrewards);
            console.log(`DEBUG: Sending consolidated rewards to ${playerId}:`, consolidated);
            try {
              await sendMailboxMessage(playerId, 101, consolidated);
              console.log(`✅ Rewards sent to player ${playerId}`);
            } catch (error) {
              console.error(`❌ Error sending rewards to player ${playerId}:`, error);
            }
          }
        } else {
          console.log(`🚫 No fulfilled train orders for ${settlement.name}. No rewards sent.`);
        }

        await generateTrainLog(settlement, fulfilledPlayerIds);
        console.log(`📝 Train log entry saved for ${settlement.name}`);
      }
      
      if (phase === "arriving") {
        try {
          // Generate new offers before updating settlement
          const seasonConfig = seasonsConfig.find(s => s.seasonType === frontier.seasons?.seasonType);
          const newTrainOffers = generateTrainOffers(settlement, seasonConfig, frontier);
          const newTrainRewards = generateTrainRewards(settlement, seasonConfig);

          // Verify we have offers before updating
          if (!newTrainOffers || newTrainOffers.length === 0) {
            console.error(`❌ No train offers generated for ${settlement.name}. Using fallback offer.`);
            newTrainOffers.push({
              itemBought: "Wood",
              qtyBought: 5,
              itemGiven: "Money",
              qtyGiven: 250,
              claimedBy: null,
              filled: false
            });
          }

          // Use findOneAndUpdate with validation
          const result = await Settlement.findOneAndUpdate(
            { _id: settlement._id },
            {
              $set: {
                currentoffers: settlement.nextoffers?.length > 0 ? settlement.nextoffers : newTrainOffers,
                nextoffers: newTrainOffers,
                trainrewards: newTrainRewards
              }
            },
            { new: true }
          );

          console.log(`  ✅ Updated settlement ${settlement.name}:`, {
            currentOffersCount: result.currentoffers?.length || 0,
            nextOffersCount: result.nextoffers?.length || 0,
            rewardsCount: result.trainrewards?.length || 0
          });

          // Double-check the update was successful
          if (!result.currentoffers?.length) {
            console.error(`❌ Settlement ${settlement.name} has no current offers after update. Raw result:`, result);
          }
        } catch (error) {
          console.error(`❌ Error updating settlement ${settlement.name}:`, error);
        }
      }
    }

    return {};
  } catch (error) {
    console.error("❌ Error in trainScheduler:", error);
    return {};
  }
}

// 🛠️ Generates train offers using season-tuned logic and totalnestedtime
function generateTrainOffers(settlement, seasonConfig, frontier) {
  const offers = [];
  
  // 🎯 Filter master resources to those valid for the current season (from seasons.json)
  const seasonResources = masterResources.filter(res =>
    (seasonConfig.seasonResources || []).includes(res.type)
  );

  // 🪵 Fallback: If no valid seasonal resources, return default Wood offer
  if (seasonResources.length === 0) {
    console.warn(`⚠️ No season resources found for ${settlement.name}. Using fallback resource.`);
    return [{
      itemBought: "Wood",
      qtyBought: 5,
      itemGiven: "Money",
      qtyGiven: 250,
      claimedBy: null,
      filled: false
    }];
  }

  // 🥇 Always generate a first offer to ensure at least one train deal
  // Select an item based on weighted random (favoring lower craft time), random qty (1–5), payout based on item price
  const firstItem = weightedRandomByCraftEffort(seasonResources);
  const firstQty = Math.max(1, Math.ceil(Math.random() * 5));
  const firstOffer = {
    itemBought: firstItem.type,
    qtyBought: firstQty,
    itemGiven: "Money",
    qtyGiven: Math.floor((firstItem.maxprice || 100) * firstQty * (seasonConfig.seasonMultiplier || 1)),
    claimedBy: null,
    filled: false
  };
  offers.push(firstOffer);
  console.log(`  📦 First Train Offer (${settlement.name}): ${firstOffer.qtyBought} ${firstOffer.itemBought} → ${firstOffer.qtyGiven} Money`);

  // ➕ Generate additional offers based on total player effort budget for the season
  // Stop if effort runs out or max offers reached
  const baseHours = globalTuning.baseHoursForTrain || 2.5;
  const basePlayerEffortPerWeek = baseHours * 60 * 60;
  const population = Math.max(1, settlement.population || 1);
  const now = Date.now();
  const seasonEnd = new Date(frontier.seasons?.endTime || now);
  const msPerWeek = 1000 * 60 * 60 * 24 * 7;
  let weeksRemaining = Math.ceil((seasonEnd - now) / msPerWeek);
  if (weeksRemaining < 1) weeksRemaining = 1;

  const totalEffort = Math.ceil(
    basePlayerEffortPerWeek *
    population *
    weeksRemaining *
    (seasonConfig.trainOffersQtyMultiplier || 1)
  );
  let remainingEffort = totalEffort;
  const maxAdditionalOffers = 4; // Cap at 5 total offers (1 guaranteed + 4 additional)

  while (remainingEffort > 0 && offers.length < maxAdditionalOffers) {
    const item = weightedRandomByCraftEffort(seasonResources);
    const timePerUnit = item.totalnestedtime || item.crafttime || 60;
    const maxQty = Math.floor(remainingEffort / timePerUnit);
    if (maxQty < 1) break;
    const qtyBought = Math.ceil(Math.random() * maxQty);
    const qtyGiven = Math.floor((item.maxprice || 100) * qtyBought * (seasonConfig.seasonMultiplier || 1));
    const offer = {
      itemBought: item.type,
      qtyBought,
      itemGiven: "Money",
      qtyGiven,
      claimedBy: null,
      filled: false
    };
    offers.push(offer);
    remainingEffort -= qtyBought * timePerUnit;
    console.log(`  📦 Additional Train Offer (${settlement.name}): ${qtyBought} ${item.type} → ${qtyGiven} Money`);
  }
  return offers;
}

// 🎲 Weighted random by inverse sqrt of totalnestedtime
function weightedRandomByCraftEffort(items) {
  const weights = items.map(item => 1 / Math.sqrt(item.totalnestedtime || item.crafttime || 60));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let rand = Math.random() * totalWeight;

  for (let i = 0; i < items.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return items[i];
  }

  return items[items.length - 1]; // fallback
}

function consolidateRewards(rewardsArray) {
  const rewardMap = new Map();
  for (const reward of rewardsArray) {
    if (!reward.item || !reward.qty) continue;
    if (rewardMap.has(reward.item)) {
      rewardMap.set(reward.item, rewardMap.get(reward.item) + reward.qty);
    } else {
      rewardMap.set(reward.item, reward.qty);
    }
  }
  return Array.from(rewardMap.entries()).map(([item, qty]) => ({ item, qty }));
}

// 🎁 Generates train rewards using rewards defined in seasons.json
function generateTrainRewards(settlement, seasonConfig) {
  const rewards = [];
  const rewardItems = seasonConfig.trainRewards || [];
  const population = settlement.population || 1;

  // 🎁 Generate up to 3 rewards from season-configured reward items
  // Qty is based on population (1 reward per 10 people)
  const numRewards = Math.min(rewardItems.length, 3);

  for (let i = 0; i < numRewards; i++) {
    const item = rewardItems[Math.floor(Math.random() * rewardItems.length)];
    const qty = Math.ceil(population / 10);
    rewards.push({ item, qty });
  }

  return rewards;
}

async function generateTrainLog(settlement, fulfilledPlayerIds) {
  if ((settlement.population || 0) <= 0) { return; }

  // Build human-readable logic summary
  const population = settlement.population || 1;
  const offers = settlement.currentoffers || [];
  const rewards = settlement.trainrewards || [];

  const rewardDescriptions = rewards.map(r => `${r.qty} ${r.item}`).join(", ");

  const baseHours = globalTuning.baseHoursForTrain || 2.5;
  const baseEffort = baseHours * 60 * 60;
  const totalEffort = baseEffort * population;

  const now = Date.now();
  const seasonEnd = new Date(settlement.seasonEndTime || now);
  const msPerWeek = 1000 * 60 * 60 * 24 * 7;
  let weeksRemaining = Math.ceil((seasonEnd - now) / msPerWeek);
  if (weeksRemaining < 1) weeksRemaining = 1;

  // Enhanced logic string with detailed per-offer explanation and weighting info
  const detailedOfferExplanations = offers.map(o => {
    const itemData = masterResources.find(r => r.type === o.itemBought);
    const timePerUnit = itemData?.totalnestedtime || itemData?.crafttime || 60;
    const unitPrice = itemData?.maxprice || 100;
    const qtyEffort = o.qtyBought * timePerUnit;
    const qtyGivenExpected = Math.floor(unitPrice * o.qtyBought * ((global.TUNING_SEASON_MULTIPLIER || 1) || 1));
    // Try to use actual qtyGiven from offer for Money, fallback to calculated
    const qtyGivenDisplay = o.qtyGiven !== undefined ? o.qtyGiven : qtyGivenExpected;
    return `${o.qtyBought} ${o.itemBought} @ ${timePerUnit}s each = ${qtyEffort}s effort; × ${unitPrice} price = ${qtyGivenDisplay} Money`;
  }).join(" | ");

  const logicString = `Limit possible offers to the ${settlement.seasonType || 'Unknown'} season as defined in tuning (seasons.json). Filtered candidate items include only those allowed in this season.
Always generate a first offer to ensure there is at least one train deal, using a weighted random selection favoring items with lower crafting time (weight = 1 / sqrt(craft time)). Quantity is random (1–5), payout is based on item maxprice × qty × seasonMultiplier.
Total player effort capacity is calculated as: ${population} population × ${baseHours} hours/week × 3600s/hour = ${Math.floor(baseEffort)}s/player/week. Weeks remaining in the season: ${weeksRemaining}, so total effort pool = ${Math.floor(totalEffort)}s.
Up to 4 additional offers may be generated, each consuming (qty × time per unit) effort until pool is depleted. Items are selected by same weighted logic. Offer reward = qty × item maxprice × seasonMultiplier.
Offer details: ${detailedOfferExplanations}.
Items like Corn and Milk appear frequently because item selection is weighted inversely to sqrt(craft time), favoring quicker crafts.
Rewards based on population (1 reward per 10 pop): [${rewardDescriptions}].`;

  const logEntry = {
    date: new Date(),
    alloffersfilled: (settlement.currentoffers || []).every(o => o.filled),
    totalwinners: fulfilledPlayerIds.length,
    rewards: settlement.trainrewards || [],
    logic: logicString
  };

  const updatedSettlement = await Settlement.findById(settlement._id);
  if (!updatedSettlement.trainlog) updatedSettlement.trainlog = [];
  updatedSettlement.trainlog.push(logEntry);
  if (updatedSettlement.trainlog.length > 8) {
    updatedSettlement.trainlog = updatedSettlement.trainlog.slice(-8);
  }
  await updatedSettlement.save();
}

module.exports = trainScheduler;