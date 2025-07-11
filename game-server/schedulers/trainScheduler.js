const Frontier = require("../models/frontier");
const Settlement = require("../models/settlement");
const Player = require("../models/player");
const globalTuning = require("../tuning/globalTuning.json");
const masterResources = require("../tuning/resources.json");
const sendMailboxMessage = require("../utils/messageUtils.js");
const seasonsConfig = require("../tuning/seasons.json");
const { getSeasonLevel } = require("../utils/scheduleHelpers");

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
        
        const allOffersFilled = currentOffers.every(offer => offer.filled);
        const fulfilledPlayerIds = allOffersFilled
          ? [...new Set(
              currentOffers
                .filter(offer => offer.filled && offer.claimedBy)
                .map(offer => offer.claimedBy.toString())
            )]
          : [];

        if (allOffersFilled && fulfilledPlayerIds.length > 0) {
          console.log(`🎉 All Train orders filled for ${settlement.name}. Sending rewards...`);
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
          console.log(`🚫 Not all train orders were filled for ${settlement.name}. No rewards distributed.`);
        }
        await generateTrainLog(settlement, fulfilledPlayerIds, frontier);
        console.log(`📝 Train log entry saved for ${settlement.name}`);
      }
      

      if (phase === "arriving") {
        try {
          console.log(`🚂 Arriving phase for settlement ${settlement.name}. Generating offer & rewards...`);
          // Generate new offers before updating settlement
          const seasonConfig = seasonsConfig.find(s => s.seasonType === frontier.seasons?.seasonType);
          const newTrainOffers = generateTrainOffers(settlement, seasonConfig, frontier);
          console.log(`  📦 Generated ${newTrainOffers.length} train offers for ${settlement.name}.`);
          const newTrainRewards = generateTrainRewards(settlement, seasonConfig, frontier);
          console.log(`  🎁 Generated ${newTrainRewards.length} train rewards for ${settlement.name}.`);
          
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
  const seasonLevel = getSeasonLevel(frontier?.seasons?.onSeasonStart, frontier?.seasons?.onSeasonEnd);

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
  const firstItem = weightedRandomByCraftEffort(seasonResources, seasonLevel);
  const firstQty = Math.max(1, Math.ceil(Math.random() * 5));
  const firstOffer = {
    itemBought: firstItem.type,
    qtyBought: firstQty,
    itemGiven: "Money",
    qtyGiven: Math.floor((firstItem.maxprice || 100) * firstQty),
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
  const difficultyMultiplier = seasonLevel; // 1–6

  const totalEffort = Math.ceil(
    basePlayerEffortPerWeek *
    population *
    difficultyMultiplier *
    (seasonConfig.trainOffersQtyMultiplier || 1)
  );
  let remainingEffort = totalEffort;
  const maxAdditionalOffers = 4; // Cap at 5 total offers (1 guaranteed + 4 additional)

  while (remainingEffort > 0 && offers.length < maxAdditionalOffers) {
    const item = weightedRandomByCraftEffort(seasonResources, seasonLevel);
    const timePerUnit = item.totalnestedtime || item.crafttime || 60;
    const maxQty = Math.floor(remainingEffort / timePerUnit);
    if (maxQty < 1) break;
    const qtyBought = Math.ceil(Math.random() * maxQty);
    const qtyGiven = Math.floor((item.maxprice || 100) * qtyBought);
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

// 🎲 Weighted random by inverse sqrt of totalnestedtime, adjusted by seasonLevel
function weightedRandomByCraftEffort(items, seasonLevel = 1) {
  const weights = items.map(item => {
    const baseTime = item.totalnestedtime || item.crafttime || 60;
    const complexityFactor = Math.pow(baseTime, seasonLevel / 6);
    return 1 / complexityFactor;
  });
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let rand = Math.random() * totalWeight;

  for (let i = 0; i < items.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return items[i];
  }

  return items[items.length - 1];
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
function generateTrainRewards(settlement, seasonConfig, frontier) {
  const rewards = [];
  const rewardItems = seasonConfig.trainRewards || [];
  const population = settlement.population || 1;
  const seasonLevel = getSeasonLevel(frontier?.seasons?.onSeasonStart, frontier?.seasons?.onSeasonEnd);

  // 🎁 Generate up to 3 rewards from season-configured reward items
  // Qty is based on population (1 reward per 10 people), scaled by seasonLevel
  const numRewards = Math.min(rewardItems.length, 3);

  for (let i = 0; i < numRewards; i++) {
    const item = rewardItems[Math.floor(Math.random() * rewardItems.length)];
    const qty = Math.ceil((population / 10) * seasonLevel); // Scaled reward
    rewards.push({ item, qty });
  }

  return rewards;
}

async function generateTrainLog(settlement, fulfilledPlayerIds, frontier) {
  if ((settlement.population || 0) <= 0) { return; }

  // Build human-readable logic summary
  const population = settlement.population || 1;
  const offers = Array.isArray(settlement.currentoffers) ? [...settlement.currentoffers] : [];
  const rewards = settlement.trainrewards || [];
  const seasonLevel = getSeasonLevel(frontier?.seasons?.onSeasonStart, frontier?.seasons?.onSeasonEnd);

  console.log("🧾 Log is being generated from these offers:", offers);

  const rewardDescriptions = rewards.map(r => `${r.qty} ${r.item}`).join(", ");

  const baseHours = globalTuning.baseHoursForTrain || 2.5;
  const baseEffort = baseHours * 60 * 60;
  const totalEffort = baseEffort * population;

  // Removed calculation of weeksRemaining as per instructions

  // Enhanced logic string with detailed per-offer explanation and weighting info
  const detailedOfferExplanations = offers.map(o => {
    const itemData = masterResources.find(r => r.type === o.itemBought) || {};
    const timePerUnit = itemData?.totalnestedtime || itemData?.crafttime || 60;
    const unitPrice = itemData?.maxprice || 100;
    const qtyEffort = o.qtyBought * timePerUnit;
    const qtyGivenExpected = Math.floor(unitPrice * o.qtyBought);
    // Try to use actual qtyGiven from offer for Money, fallback to calculated
    const qtyGivenDisplay = o.qtyGiven !== undefined ? o.qtyGiven : qtyGivenExpected;
    return `${o.qtyBought} ${o.itemBought} @ ${timePerUnit}s each = ${qtyEffort}s effort; × ${unitPrice} price = ${qtyGivenDisplay} Money`;
  }).join(" | ");

  const logicString = `OFFERS: Limit possible offers to the ${frontier?.seasons?.seasonType || 'Unknown'} season as defined in seasons tuning. 
Offer complexity adjusted by season progression; current seasonLevel = ${seasonLevel} of 6. Higher seasonLevel = likelihood of more complex crafts (longer totalnestedtime): weight = 1 / (craft time ^ (seasonLevel / 6)).
Always generate a first offer to ensure there is at least one train offer, using weighted random selection. 
Item quantity per offer is random (1–5). 
Total player effort capacity is calculated as: ${population} population × ${baseHours} hours/week × 3600s/hour = ${Math.floor(baseEffort)}s/player/week. Effort multiplier based on seasonLevel (${seasonLevel}), so total effort pool = ${Math.floor(totalEffort)}s.
Up to 4 additional offers may be generated, each consuming (qty × time per unit) effort until pool is depleted. Items are selected using the same seasonLevel-adjusted weighting.
Money paid per offer is standard (item.maxprice × qty). 
Here are the offer details: ${detailedOfferExplanations}.
REWARDS: defined per season (in seasons tuning); quatity of each reward scales with population & season level (qty = Math.ceil((population / 10) * seasonLevel)), producing larger rewards in later parts of the season.
Here are the Rewards: [${rewardDescriptions}].`;

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