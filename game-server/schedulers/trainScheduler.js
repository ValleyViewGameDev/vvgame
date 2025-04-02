const Frontier = require("../models/frontier");
const Settlement = require("../models/settlement");
const Player = require("../models/player");
const globalTuning = require("../tuning/globalTuning.json");
const masterResources = require("../tuning/resources.json");
const sendMailboxMessage = require("../utils/messageUtils.js");
const { scheduleEvent } = require("../utils/scheduleHelpers");

async function trainScheduler(frontierId) {
  console.group(`\n🚂 TRAIN SCHEDULER initiated for Frontier ${frontierId}`);

  try {
    const frontier = await Frontier.findById(frontierId);
    if (!frontier || !frontier.train) {
      console.warn(`⚠️ Frontier ${frontierId} not found or missing train data.`);
      return;
    }

    const currentPhase = frontier.train.phase;
    console.log(`Frontier Phase: ${currentPhase}`);

    const settlements = await Settlement.find({ population: { $gt: 0 }, frontierId });

    for (const settlement of settlements) {
      console.log(`  🚉 Settlement ${settlement.name} - Using Frontier Phase: ${currentPhase}`);

      if (currentPhase === "loading") {
        // ✅ 1. Check if all current offers were filled
        if (settlement.currnetoffers.every(o => o.filled)) {
          console.log(`🎉 All Train orders filled for ${settlement.name}. Sending rewards...`);
      
          const fulfilledPlayerIds = settlement.currnetoffers
            .filter(offer => offer.claimedBy)
            .map(offer => offer.claimedBy.toString());
      
          const uniquePlayerIds = [...new Set(fulfilledPlayerIds)];
      
          console.log('settlement.trainrewards = ',settlement.trainrewards);
          
          for (const playerId of uniquePlayerIds) {
            const consolidated = consolidateRewards(settlement.trainrewards);
            await sendMailboxMessage(playerId, 101, consolidated);
          }
      
          console.log(`📬 Rewards sent to ${uniquePlayerIds.length} player(s).`);
        } else {
          console.log(`🚫 Not all train orders were filled for ${settlement.name}. No rewards sent.`);
        }
      }
      
      if (currentPhase === "arriving") {

        // ✅ 1. Promote nextoffers → currnetoffers
        settlement.currnetoffers = [...(settlement.nextoffers || [])];

        // ✅ 2. Generate new nextoffers and rewards
        const currentSeasonType = frontier.seasons?.seasonType;
        const seasonsConfig = require("../tuning/seasons.json");
        const seasonConfig = seasonsConfig.find(s => s.seasonType === currentSeasonType);

        if (!seasonConfig) {
          console.warn(`⚠️ No season config found for ${currentSeasonType}`);
          continue;
        }

        const newNextOffers = generateTrainOffers(settlement, seasonConfig, frontier);
        const newRewards = generateTrainRewards(settlement, seasonConfig);

        settlement.nextoffers = newNextOffers;
        settlement.trainrewards = newRewards;

        await settlement.save();

        console.log(`  ✅ ${settlement.currnetoffers.length} currnetoffers promoted.`);
        console.log(`  📦 ${newNextOffers.length} nextoffers generated.`);
        console.log(`  🎁 ${newRewards.length} train rewards generated.`);
      }

      // Future: handle other train phases if needed
    }

  } catch (error) {
    console.error("❌ Error in trainScheduler:", error);
  }

  console.groupEnd();
}


// 🛠️ Generates train offers using season-tuned logic and totalnestedtime
function generateTrainOffers(settlement, seasonConfig, frontier) {
  const offers = [];

  const baseHours = globalTuning.baseHoursForTrain || 2.5;
  const basePlayerEffortPerWeek = baseHours * 60 * 60; // convert hours to seconds

  const population = settlement.population || 1;
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

  const seasonResources = masterResources.filter(res =>
    (seasonConfig.seasonResources || []).includes(res.type)
  );

  let remainingEffort = totalEffort;

  while (remainingEffort > 0 && seasonResources.length > 0) {
    const item = weightedRandomByCraftEffort(seasonResources);
    const timePerUnit = item.totalnestedtime || item.crafttime || 60;
    const maxQty = Math.floor(remainingEffort / timePerUnit);
    if (maxQty < 1) break;

    const qtyBought = Math.ceil(Math.random() * maxQty);
    const qtyGiven = Math.floor((item.maxprice || 100) * qtyBought * (seasonConfig.seasonMultiplier || 1));

    offers.push({
      itemBought: item.type,
      qtyBought,
      itemGiven: "Money",
      qtyGiven,
      claimedBy: null,
      filled: false,
    });

    remainingEffort -= qtyBought * timePerUnit;

    console.log(`  📦 Train Offer (${settlement.name}): ${qtyBought} ${item.type} → ${qtyGiven} Money`);
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
  const numRewards = Math.min(rewardItems.length, 3);

  for (let i = 0; i < numRewards; i++) {
    const item = rewardItems[Math.floor(Math.random() * rewardItems.length)];
    const qty = Math.ceil(population / 10);
    rewards.push({ item, qty });
  }

  return rewards;
}

module.exports = trainScheduler;