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

    // ✅ Step 3: Iterate through all settlements with players
    const settlements = await Settlement.find({ frontierId, population: { $gt: 0 } });

    let totalTaxCollected = 0;
    let mayorPayouts = {};

    for (const settlement of settlements) {
      if (!settlement.taxrate || settlement.taxrate <= 0) continue;

      console.log(`🏛️ Taxing settlement ${settlement._id} at ${settlement.taxrate}%`);

      // ✅ Step 4: Get all players in this settlement
      const players = await Player.find({ settlementId: settlement._id });

      for (const player of players) {
        const moneyItem = player.inventory.find((item) => item.type === "Money");

        if (!moneyItem || moneyItem.quantity <= 0) continue;

        const taxAmount = Math.floor(moneyItem.quantity * (settlement.taxrate / 100));

        if (taxAmount < 1) continue; // Skip if tax is too low

        console.log(`💸 Player ${player.username} taxed ${taxAmount}`);

        // ✅ Step 5: Deduct tax from player
        moneyItem.quantity -= taxAmount;
        totalTaxCollected += taxAmount;

        // ✅ Step 6: Allocate tax to mayor if applicable
        const mayorRole = settlement.roles.find(role => role.roleName === "Mayor");

        if (mayorRole && mayorRole.playerId) {
          const mayorCut = Math.floor(taxAmount * (tuningConfig.mayorcut / 100));
          mayorPayouts[mayorRole.playerId] = (mayorPayouts[mayorRole.playerId] || 0) + mayorCut;
        }

        await player.save();
      }
    }

    // ✅ Step 7: Pay out mayors
    for (const [mayorId, payout] of Object.entries(mayorPayouts)) {
      if (payout <= 0) continue; // ✅ Skip if payout is 0

      try {
        const mayor = await Player.findById(mayorId);
        if (!mayor) {
          console.warn(`⚠️ Mayor with ID ${mayorId} not found. Skipping payout.`);
          continue;
        }

        console.log(`👑 Allocating ${payout} to Mayor ${mayor.username}...`);

        // ✅ Ensure the inventory exists
        if (!mayor.inventory) { mayor.inventory = [];}

        // ✅ Find the Money item in the mayor's inventory
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

    // ✅ Step 7.5: Log tax event in each settlement
    for (const settlement of settlements) {
      const mayorRole = settlement.roles.find(role => role.roleName === "Mayor");
      let currentmayor = "None";
      let mayortake = 0;

      if (mayorRole && mayorRole.playerId && mayorPayouts[mayorRole.playerId]) {
        try {
          const mayorPlayer = await Player.findById(mayorRole.playerId);
          currentmayor = mayorPlayer?.username || "Unknown";
          mayortake = mayorPayouts[mayorRole.playerId];
        } catch (error) {
          console.warn(`⚠️ Could not resolve mayor username for tax log:`, error);
        }
      }

      const taxLogEntry = {
        date: new Date(),
        totalcollected: totalTaxCollected,
        currentmayor,
        mayortake,
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

    console.log(`✅ Taxes collected: ${totalTaxCollected}`);
    console.log(`⏳ Next tax collection at ${new Date(nextTaxTime).toLocaleString()}`);

    return { success: true, totalTaxCollected, mayorPayouts, nextTaxCycle: frontier.taxes.endTime };

  } catch (error) {
    console.error("❌ Error levying taxes:", error);
    return { success: false, error: "Internal server error." };
  }
};

module.exports = { levyTax };