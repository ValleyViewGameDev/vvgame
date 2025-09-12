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
          
          // First, ensure any existing Current Train is properly finalized
          const settlementToUpdate = await Settlement.findById(settlement._id);
          if (settlementToUpdate.trainlog) {
            // Mark any existing Current Train as Departed if not already done
            const currentTrain = settlementToUpdate.trainlog.find(log => log.status === "Current Train");
            if (currentTrain) {
              currentTrain.status = "Departed Train";
              if (currentTrain.alloffersfilled === null) {
                currentTrain.alloffersfilled = false;
                currentTrain.totalwinners = 0;
              }
              console.log(`🔄 Marked existing Current Train as Departed for settlement ${settlement.name}`);
            }
            
            // Then promote Next Train to Current Train
            const nextTrain = settlementToUpdate.trainlog.find(log => log.status === "Next Train");
            if (nextTrain) {
              nextTrain.status = "Current Train";
              console.log(`🔁 Promoted Next Train to Current Train for settlement ${settlement.name}`);
            }
            
            await settlementToUpdate.save();
          }
          
          const seasonConfig = seasonsConfig.find(s => s.seasonType === frontier.seasons?.seasonType);
         const { offers: newTrainOffers, rewards: newTrainRewards, logicString } =
            generateTrainOffersAndRewards(settlement, frontier, seasonConfig);

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
          // Now update settlement's current/next offers
          const result = await Settlement.findOneAndUpdate(
            { _id: settlement._id },
            {
              $set: {
                currentoffers: settlement.nextoffers?.length > 0 ? settlement.nextoffers : newTrainOffers,
                nextoffers: newTrainOffers
              }
            },
            { new: true }
          );

          // Append new log AFTER offers are finalized, with the new train's rewards
          await appendTrainLog(result, logicString, newTrainRewards);

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
        // Fetch fresh settlement data to ensure we have the latest offer status
        const freshSettlement = await Settlement.findById(settlement._id);
        const currentOffers = freshSettlement.currentoffers || [];
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
          // Check if rewards were already sent (look for finalized train log)
          const currentLog = freshSettlement.trainlog?.find(log => log.status === "Current Train");
          if (currentLog && currentLog.alloffersfilled !== null) {
            console.warn(`⚠️ Train rewards already distributed for ${settlement.name}, skipping duplicate distribution`);
          } else if (currentLog && currentLog.rewards) {
            console.log(`🎉 All Train orders filled for ${settlement.name}. Sending rewards...`);
            console.log('DEBUG: Reward distribution - Players:', fulfilledPlayerIds);
            console.log('DEBUG: Rewards from current train log:', currentLog.rewards);
            console.log(`DEBUG: Train #${currentLog.trainnumber || 'unknown'} rewards`);

            for (const playerId of fulfilledPlayerIds) {
              const consolidated = consolidateRewards(currentLog.rewards);
              console.log(`DEBUG: Sending consolidated rewards to ${playerId}:`, consolidated);
              try {
                await sendMailboxMessage(playerId, 101, consolidated);
                console.log(`✅ Rewards sent to player ${playerId}`);
              } catch (error) {
                console.error(`❌ Error sending rewards to player ${playerId}:`, error);
              }
            }
          } else {
            console.error(`❌ No current train log or rewards found for ${settlement.name}`);
          }
        } else {
          console.log(`🚫 Not all train orders were filled for ${settlement.name}. No rewards distributed.`);
        }
        await finalizeTrainLog(freshSettlement._id, fulfilledPlayerIds);
        console.log(`📝 Train log entry updated for ${settlement.name}`);
      }
      
    }
    return {};
  } catch (error) {
    console.error("❌ Error in trainScheduler:", error);
    return {};
  }
}

// 🎁 Consolidated function to generate train offers and rewards with unified logic string
function generateTrainOffersAndRewards(settlement, frontier, seasonConfig) {
  const offers = [];
  const seasonLevel = getSeasonLevel(frontier?.seasons?.startTime, frontier?.seasons?.endTime);
  const seasonResources = masterResources.filter(res =>
    (seasonConfig.seasonResources || []).includes(res.type)
  );

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
      rewards: [],
      rewardDescriptions: "",
      logicString: "Fallback offer due to no seasonal resources."
    };
  }

  const population = Math.max(1, settlement.population || 1);
  const basePlayerHours = globalTuning.baseHoursForTrain || 6;
  const basePlayerSeconds = basePlayerHours * 60 * 60;
  const difficultyMultiplier = seasonLevel;
  const totalEffort = Math.ceil(basePlayerSeconds * population * difficultyMultiplier);

  const totalOffers = Math.max(1, Math.ceil(population / 4));
  const targetEffortPerOffer = Math.floor(totalEffort / totalOffers);

  const eligibleItems = seasonResources.filter(item => {
    const time = item.totalnestedtime || item.crafttime || 60;
    return time <= totalEffort;
  });

  if (eligibleItems.length === 0) {
    console.warn(`⚠️ No eligible seasonal resources under effort limit for ${settlement.name}. Using fallback resource.`);
    return {
      offers: [{
        itemBought: "Wood",
        qtyBought: 5,
        itemGiven: "Money",
        qtyGiven: 250,
        claimedBy: null,
        filled: false
      }],
      rewards: [],
      rewardDescriptions: "",
      logicString: "Fallback offer due to no eligible seasonal resources under effort limit."
    };
  }

  const effortFlex = Math.floor(targetEffortPerOffer * 0.2); // ±20% tolerance

  for (let i = 0; i < totalOffers; i++) {
    // Build a pool of items within the flexible effort range
    const pool = eligibleItems.filter(item => {
      const time = item.totalnestedtime || item.crafttime || 60;
      const estEffort = time * Math.round(targetEffortPerOffer / time);
      return estEffort >= (targetEffortPerOffer - effortFlex) &&
             estEffort <= (targetEffortPerOffer + effortFlex);
    });

    const selectionPool = pool.length > 0 ? pool : eligibleItems;
    const item = weightedRandomByCraftEffort(selectionPool, seasonLevel);
    const timePerUnit = item.totalnestedtime || item.crafttime || 60;
    const estimatedQty = Math.max(1, Math.round(targetEffortPerOffer / timePerUnit));
    const qtyGiven = Math.floor((item.maxprice || 100) * estimatedQty);

    offers.push({
      itemBought: item.type,
      qtyBought: estimatedQty,
      itemGiven: "Money",
      qtyGiven,
      claimedBy: null,
      filled: false
    });
  }

  const actualTotalEffort = offers.reduce((sum, o) => {
    const itemData = masterResources.find(r => r.type === o.itemBought) || {};
    const timePerUnit = itemData.totalnestedtime || itemData.crafttime || 60;
    return sum + (o.qtyBought * timePerUnit);
  }, 0);

  const detailedOfferExplanations = offers.map(o => {
    const itemData = masterResources.find(r => r.type === o.itemBought) || {};
    const timePerUnit = itemData?.totalnestedtime || itemData?.crafttime || 60;
    const qtyEffort = o.qtyBought * timePerUnit;
    return `${o.qtyBought} ${o.itemBought} @ ${timePerUnit}s ea = ${qtyEffort}s effort `;
  }).join(" | ");

  const rewardItems = seasonConfig.trainRewards || [];
  const rewards = [];
  const numRewards = Math.min(rewardItems.length, 3);

  for (let i = 0; i < numRewards; i++) {
    const item = rewardItems[Math.floor(Math.random() * rewardItems.length)];
    const qty = Math.ceil((population / 10) * seasonLevel);
    rewards.push({ item, qty });
  }

  const rewardDescriptions = rewards.map(r => `${r.qty} x ${r.item}`).join(", ");

  const logicString =
`NUMBER OF OFFERS: ${offers?.length || 0}; determined by population (=${population}) @ 1 per 4 people (rounded up).
🚂 OFFER SELECTION: Limit possible offers to the ${frontier?.seasons?.seasonType || 'Unknown'} season as defined in seasons tuning. 
🚂 OFFER DIFFICULTY: (a) Adjusted by season progression; current seasonLevel = ${seasonLevel} of 6. Higher seasonLevel = likelihood of more complex crafts (longer totalnestedtime): weight = 1 / (craft time ^ (seasonLevel / 6)).
(b) Total player effort is calculated as: ${population} population × (${basePlayerHours} hours or ${Math.floor(basePlayerSeconds)} seconds). 
(c) Total effort multiplied by seasonLevel (${seasonLevel}); final Total Effort pool = ${Math.floor(totalEffort)}s.
(d) Each offer targets approximately: ${Math.floor(totalEffort)}s / ${offers?.length || 0} = ${targetEffortPerOffer}. 
(e) Items selected using the same seasonLevel-adjusted weighting. 
(f) Money paid per offer is standard (item.maxprice × qty). 
🚂 FINAL OFFERS: ${detailedOfferExplanations}.
🚂 FINAL TOTAL EFFORT: ${actualTotalEffort}s.
🚂 REWARDS: [${rewardDescriptions}].`;

  return { offers, rewards, logicString };
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


// 📝 appendTrainLog creates a new log entry at the start of a train cycle (phase === "arriving").
// It records minimal info with empty rewards and logic, and marks the log as "Next Train".
async function appendTrainLog(settlement, logicString = "", rewards = []) {

  console.log(`📝 Appending train log for settlement ${settlement.name} with logic:`, logicString);
  
  const updatedSettlement = await Settlement.findById(settlement._id);
  if (!updatedSettlement.trainlog) updatedSettlement.trainlog = [];

  // 1. Check if we already have a Next Train log (duplicate prevention)
  const existingNextTrainLog = updatedSettlement.trainlog.find(log => log.status === "Next Train");
  if (existingNextTrainLog) {
    console.log(`⚠️ Next Train log already exists for ${settlement.name}, skipping duplicate creation`);
    return;
  }

  // 2. Get the next train number
  const trainNumber = updatedSettlement.nextTrainNumber || 1;
  updatedSettlement.nextTrainNumber = trainNumber + 1;

  // 3. Create and append new "Next Train" log
  const logEntry = {
    date: new Date(),
    alloffersfilled: null,
    totalwinners: 0,
    trainnumber: trainNumber,
    rewards,
    logic: logicString,
    status: "Next Train"
  };
  updatedSettlement.trainlog.push(logEntry);

  // 4. Trim logs to latest 8
  if (updatedSettlement.trainlog.length > 8) {
    updatedSettlement.trainlog = updatedSettlement.trainlog.slice(-8);
  }

  await updatedSettlement.save();
}


// 📝 finalizeTrainLog finalizes the latest "Current Train" log entry.

async function finalizeTrainLog(settlementId, fulfilledPlayerIds) {
  console.log(`📝 Finalizing train log for settlement ${settlementId} with fulfilled players:`, fulfilledPlayerIds);
  const settlement = await Settlement.findById(settlementId);
  if (!settlement || !settlement.trainlog) return;
  const currentLog = settlement.trainlog.find(log => log.status === "Current Train");

  if (!currentLog) { console.warn(`⚠️ No Current Train log found for settlement ${settlement.name}`); return; }

  // Check if already finalized (duplicate prevention)
  if (currentLog.alloffersfilled !== null) {
    console.warn(`⚠️ Train log already finalized for settlement ${settlement.name}, skipping duplicate finalization`);
    return;
  }

  const currentOffers = settlement.currentoffers || [];
  const allOffersFilled = currentOffers.every(o => o.filled);

  currentLog.alloffersfilled = allOffersFilled;
  currentLog.totalwinners = fulfilledPlayerIds.length;
  currentLog.status = "Departed Train";

  await settlement.save();
}

module.exports = trainScheduler;