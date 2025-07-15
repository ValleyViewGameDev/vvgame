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
    

      if (phase === "arriving") {
        try {
          console.log(`🚂 Arriving phase for settlement ${settlement.name}. Generating offer & rewards...`);
          
          const seasonConfig = seasonsConfig.find(s => s.seasonType === frontier.seasons?.seasonType);
          const { offers: newTrainOffers, logicString } = generateTrainOffers(settlement, frontier, seasonConfig);
          const { rewards: newTrainRewards, rewardDescriptions } = generateTrainRewards(settlement, seasonConfig, frontier);

          // 📝 Start a fresh train log entry with generated offers & rewards
          await appendTrainLog(settlement, newTrainOffers, newTrainRewards, logicString, rewardDescriptions);

          // Fallback offer if generation failed
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
          if (!result.currentoffers?.length) {
            console.error(`❌ Settlement ${settlement.name} has no current offers after update. Raw result:`, result);
          }

        } catch (error) {
          console.error(`❌ Error updating settlement ${settlement.name}:`, error);
        }
      }

      
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
        await finalizeTrainLog(settlement._id, fulfilledPlayerIds);
        console.log(`📝 Train log entry updated for ${settlement.name}`);
      }
      
    }
    return {};
  } catch (error) {
    console.error("❌ Error in trainScheduler:", error);
    return {};
  }
}

// 🛠️ Generates train offers using season-tuned logic and totalnestedtime
function generateTrainOffers(settlement, frontier, seasonConfig) {
  const offers = [];
  const seasonLevel = getSeasonLevel(frontier?.seasons?.onSeasonStart, frontier?.seasons?.onSeasonEnd);

  // 🎯 Filter master resources to those valid for the current season (from seasons.json)
  const seasonResources = masterResources.filter(res =>
    (seasonConfig.seasonResources || []).includes(res.type)
  );

  // 🪵 Fallback: If no valid seasonal resources, return default Wood offer
  if (seasonResources.length === 0) {
    console.warn(`⚠️ No season resources found for ${settlement.name}. Using fallback resource.`);
    return {
      offers: [{
        itemBought: "Wood",
        qtyBought: 5,
        itemGiven: "Money",
        qtyGiven: 250,
        claimedBy: null,
        filled: false
      }],
      logicString: "Fallback offer due to no seasonal resources."
    };
  }

  const baseHours = globalTuning.baseHoursForTrain || 2.5;
  const basePlayerEffortPerWeek = baseHours * 60 * 60;
  const population = Math.max(1, settlement.population || 1);
  const difficultyMultiplier = seasonLevel; // 1–6

  const totalEffort = Math.ceil(
    basePlayerEffortPerWeek *
    population *
    difficultyMultiplier
  );

  // Calculate number of offers: one per 4 population, rounded up
  const totalOffers = Math.max(1, Math.ceil(population / 4));
  const targetEffortPerOffer = Math.floor(totalEffort / totalOffers);

  for (let i = 0; i < totalOffers; i++) {
    const item = weightedRandomByCraftEffort(seasonResources, seasonLevel);
    const timePerUnit = item.totalnestedtime || item.crafttime || 60;

    // Choose a quantity that approximates the target effort
    const estimatedQty = Math.max(1, Math.round(targetEffortPerOffer / timePerUnit));
    const qtyGiven = Math.floor((item.maxprice || 100) * estimatedQty);

    const offer = {
      itemBought: item.type,
      qtyBought: estimatedQty,
      itemGiven: "Money",
      qtyGiven,
      claimedBy: null,
      filled: false
    };
    offers.push(offer);
    console.log(`  📦 Train Offer (${settlement.name}): ${offer.qtyBought} ${offer.itemBought} → ${offer.qtyGiven} Money`);
  }

  const rewardDescriptions = ""; // empty as no rewards here
  const detailedOfferExplanations = offers.map(o => {
    const itemData = masterResources.find(r => r.type === o.itemBought) || {};
    const timePerUnit = itemData?.totalnestedtime || itemData?.crafttime || 60;
    const unitPrice = itemData?.maxprice || 100;
    const qtyEffort = o.qtyBought * timePerUnit;
    const qtyGivenExpected = Math.floor(unitPrice * o.qtyBought);
    const qtyGivenDisplay = o.qtyGiven !== undefined ? o.qtyGiven : qtyGivenExpected;
    return `${o.qtyBought} ${o.itemBought} @ ${timePerUnit}s each = ${qtyEffort}s effort; × ${unitPrice} price = ${qtyGivenDisplay} Money`;
  }).join(" | ");

  const logicString =
`NUMBER OF OFFERS: ${offers?.length || 0}; determined by population (=${population}) @ 1 per 4 people (rounded up).
OFFER SELECTION: Limit possible offers to the ${frontier?.seasons?.seasonType || 'Unknown'} season as defined in seasons tuning. 
OFFER DIFFICULTY: (a) Adjusted by season progression; current seasonLevel = ${seasonLevel} of 6. Higher seasonLevel = likelihood of more complex crafts (longer totalnestedtime): weight = 1 / (craft time ^ (seasonLevel / 6)).
(b) Total player effort capacity is calculated as: ${population} population × ${baseHours} hours/week × 3600s/hour = ${Math.floor(basePlayerEffortPerWeek)}s/player/week. 
(c) Effort multiplier based on seasonLevel (${seasonLevel}), so total effort pool was ${Math.floor(totalEffort)}s.
(d) Each offer targets approximately (totalEffort / numOffers) effort. 
(e) Items selected using the same seasonLevel-adjusted weighting. 
(f) Money paid per offer is standard (item.maxprice × qty). 
SUMMARY: Here are the offer details: ${detailedOfferExplanations}.
REWARDS: [${rewardDescriptions}].`;

  return { offers, logicString };
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

  const rewardDescriptions = rewards.map(r => `${r.qty} x ${r.item}`).join(", ");

  return { rewards, rewardDescriptions };
}

// 📝 appendTrainLog creates a new log entry at the start of a train cycle (phase === "arriving").
// It records minimal info with empty rewards and logic, and marks the log as "in progress".
async function appendTrainLog(settlement, offers, rewards, logicString, rewardDescriptions) {
  const existingInProgress = settlement.trainlog?.find(log => log.inprogress);
  if (existingInProgress) {
    console.warn(`⚠️ Skipping log append: settlement ${settlement.name} already has an in-progress log.`);
    return;
  }

  const logEntry = {
    date: new Date(),
    alloffersfilled: null,
    totalwinners: 0,
    rewards: rewards || [],
    rewardDescriptions: rewardDescriptions || "",
    logic: logicString || "",
    inprogress: true
  };

  const updatedSettlement = await Settlement.findById(settlement._id);
  if (!updatedSettlement.trainlog) updatedSettlement.trainlog = [];
  updatedSettlement.trainlog.push(logEntry);
  if (updatedSettlement.trainlog.length > 8) {
    updatedSettlement.trainlog = updatedSettlement.trainlog.slice(-8);
  }
  await updatedSettlement.save();
}

// 📝 updateTrainLog updates the latest in-progress log entry with provided logic and/or rewards.

async function updateTrainLog(settlementId, updates) {
  const settlement = await Settlement.findById(settlementId);
  if (!settlement || !settlement.trainlog) return;
  const latestLog = settlement.trainlog.find(log => log.inprogress);
  if (!latestLog) return;

  if (updates.logic !== undefined) {
    latestLog.logic = updates.logic;
  }
  if (updates.rewards !== undefined) {
    latestLog.rewards = updates.rewards;
  }
  if (updates.rewardDescriptions !== undefined) {
    latestLog.rewardDescriptions = updates.rewardDescriptions;
  }

  await settlement.save();
}

// 📝 finalizeTrainLog finalizes the latest log entry (previously marked as "inprogress").

async function finalizeTrainLog(settlementId, fulfilledPlayerIds) {
  const settlement = await Settlement.findById(settlementId);
  if (!settlement || !settlement.trainlog) return;
  const latestLog = settlement.trainlog.find(log => log.inprogress);

  if (!latestLog) return;

  const currentOffers = settlement.currentoffers || [];
  const allOffersFilled = currentOffers.every(o => o.filled);

  latestLog.alloffersfilled = allOffersFilled;
  latestLog.totalwinners = fulfilledPlayerIds.length;
  latestLog.inprogress = false;

  await settlement.save();
}

module.exports = trainScheduler;