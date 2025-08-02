const Frontier = require("../models/frontier");
const Settlement = require("../models/settlement");
const Player = require("../models/player");
const { ObjectId } = require("mongodb");
const tuningConfig = require("../tuning/globalTuning.json");

/**
 * Function to levy taxes across all settlements in a frontier.
 * This can be called from both the scheduler and the API.
 */
const levyTax = async (frontierId) => {
  try {
    console.log(`💰 Levying taxes for Frontier ${frontierId}...`);

    // ✅ Step 1: Get the frontier
    const frontier = await Frontier.findById(frontierId);
    if (!frontier) {
      console.warn("⚠️ Frontier not found for tax collection.");
      return { success: false, message: "Frontier not found." };
    }

    // ✅ Step 2: Ensure `nexttax` (or `taxes.endTime`) is valid before proceeding
    const now = Date.now();
    const nextTax = frontier.taxes?.endTime ? new Date(frontier.taxes.endTime).getTime() : null;

    if (!nextTax || isNaN(nextTax)) {
      console.warn("⚠️ Skipping tax levy: Invalid or missing `taxes.endTime`.");
      return { success: false, message: "Taxes endTime is invalid or missing." };
    }

    if (nextTax > now) {
      console.warn("⚠️ Skipping tax levy: Server's next tax cycle is in the future.");
      return { success: false, message: "Taxes not due yet." };
    }

    // ✅ Step 3: Get all settlements with players
    const settlements = await Settlement.find({ frontierId, population: { $gt: 0 } });

    let globalTotalTaxCollected = 0;
    let globalMayorPayouts = {};
    let settlementTaxData = {};

    // ✅ Step 4: Process each settlement
    for (const settlement of settlements) {
      if (!settlement.taxrate || settlement.taxrate <= 0) continue;

      console.log(`🏛️ Taxing settlement ${settlement._id} at ${settlement.taxrate}%`);

      let settlementTaxTotal = 0;
      let settlementMayorPayout = 0;
      const mayorRole = settlement.roles.find(role => role.roleName === "Mayor");

      // ✅ Step 5: Get all players in this settlement
      const players = await Player.find({ settlementId: settlement._id });

      for (const player of players) {
        const moneyItem = player.inventory.find((item) => item.type === "Money");
        // Gold account holders pay half tax
        const effectiveTaxRate = (player.accountStatus === "Gold") ? (settlement.taxrate / 2) : settlement.taxrate;
        if (!moneyItem || moneyItem.quantity <= 0) continue;
        const taxAmount = Math.floor(moneyItem.quantity * (effectiveTaxRate / 100));
        if (taxAmount < 1) continue; // Skip if tax is too low

        // ✅ Step 6: Deduct tax from player
        moneyItem.quantity -= taxAmount;
        settlementTaxTotal += taxAmount;
        globalTotalTaxCollected += taxAmount;

        // ✅ Step 7: Calculate mayor's cut for this tax payment
        if (mayorRole && mayorRole.playerId) {
          const mayorCut = Math.floor(taxAmount * (tuningConfig.mayorcut / 100));
          settlementMayorPayout += mayorCut;
          globalMayorPayouts[mayorRole.playerId] = (globalMayorPayouts[mayorRole.playerId] || 0) + mayorCut;
        }
        await player.save();
      }

      // ✅ Step 8: Store settlement-specific tax data for logging
      settlementTaxData[settlement._id] = {
        totalCollected: settlementTaxTotal,
        mayorId: mayorRole?.playerId,
        mayorPayout: settlementMayorPayout
      };
    }

    // ✅ Step 9: Pay out mayors
    for (const [mayorId, payout] of Object.entries(globalMayorPayouts)) {
      if (payout <= 0) continue;
      try {
        const mayor = await Player.findById(mayorId);
        if (!mayor) {
          console.warn(`⚠️ Mayor with ID ${mayorId} not found. Skipping payout.`);
          continue;
        }
        if (!mayor.inventory) { mayor.inventory = [];}
        let moneyItem = mayor.inventory.find((item) => item.type === "Money");
        if (!moneyItem) {
          mayor.inventory.push({ type: "Money", quantity: payout });
        } else {
          moneyItem.quantity += payout;
        }
        await mayor.save();
        console.log(`👑 Mayor ${mayor.username} received ${payout} in taxes.`);
      } catch (error) {
        console.error(`❌ Error paying mayor (ID: ${mayorId}):`, error);
      }
    }

    // ✅ Step 10: Log tax event for each settlement with correct settlement-specific data
    for (const settlement of settlements) {
      const taxData = settlementTaxData[settlement._id];
      if (!taxData || taxData.totalCollected === 0) continue;

      let currentmayor = "None";
      if (taxData.mayorId) {
        try {
          const mayorPlayer = await Player.findById(taxData.mayorId);
          currentmayor = mayorPlayer?.username || "Unknown";
        } catch (error) {
          console.warn(`⚠️ Could not resolve mayor username for tax log:`, error);
        }
      }

      const taxLogEntry = {
        date: new Date(),
        totalcollected: taxData.totalCollected,
        currentmayor,
        mayortake: taxData.mayorPayout,
      };

      await Settlement.updateOne(
        { _id: settlement._id },
        {
          $push: {
            taxlog: {
              $each: [taxLogEntry],
              $slice: -10
            }
          }
        }
      );

      console.log(`💵 Settlement ${settlement._id}: Collected ${taxData.totalCollected}, Mayor take: ${taxData.mayorPayout}`);
    }

    // ✅ Step 8: Transition to "waiting" phase & schedule next tax collection
    const waitingPhaseDuration = tuningConfig.taxes.phases.waiting * 60 * 1000; // Convert min → ms
    const nextTaxTime = now + waitingPhaseDuration;

    // ✅ Preserve all required fields before updating
    frontier.taxes.phase = "waiting";
    frontier.taxes.endTime = new Date(nextTaxTime);

    await Frontier.updateOne(
      { _id: frontierId },
      { 
          $set: { 
              "taxes.phase": "waiting",
              "taxes.endTime": new Date(nextTaxTime)
          }
      }
    );

    console.log(`✅ Total taxes collected across all settlements: ${globalTotalTaxCollected}`);
    console.log(`⏳ Next tax collection at ${new Date(nextTaxTime).toLocaleString()}`);

    return { success: true, totalTaxCollected: globalTotalTaxCollected, mayorPayouts: globalMayorPayouts, nextTaxCycle: frontier.taxes.endTime };

  } catch (error) {
    console.error("❌ Error levying taxes:", error);
    return { success: false, error: "Internal server error." };
  }
};

module.exports = { levyTax };