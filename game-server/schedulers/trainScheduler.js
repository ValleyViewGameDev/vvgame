const Frontier = require("../models/frontier");
const Settlement = require("../models/settlement");
const { sweepDeparture } = require("../utils/caravan");

async function trainScheduler(frontierId, phase, frontier = null) {
  try {
    frontier = frontier || await Frontier.findById(frontierId);
    if (!frontier || !frontier.train) {
      console.warn(`⚠️ Frontier ${frontierId} not found or missing train data.`);
      return;
    }

    console.log(`🚂 SIMPLIFIED TRAIN SCHEDULER for Frontier ${frontierId}; phase =`, phase);

    const settlements = await Settlement.find({ population: { $gt: 0 }, frontierId });

    for (const settlement of settlements) {
      console.log(`  🚉 Settlement ${settlement.name} - Phase: ${phase}`);
    
      if (phase === "arriving") {
        try {
          console.log(`🚂 Arriving phase for settlement ${settlement.name}. Managing train log status...`);
          
          // Manage train log status transitions for NewTrain compatibility
          const settlementToUpdate = await Settlement.findById(settlement._id);
          if (settlementToUpdate.trainlog) {
            // Mark any existing Current Train as Departed
            const currentTrain = settlementToUpdate.trainlog.find(log => log.status === "Current Train");
            if (currentTrain) {
              currentTrain.status = "Departed Train";
              if (currentTrain.alloffersfilled === null) {
                currentTrain.alloffersfilled = false;
                currentTrain.totalwinners = 0;
              }
              console.log(`🔄 Marked existing Current Train as Departed for settlement ${settlement.name}`);
            }
            
            // Promote Next Train to Current Train
            const nextTrain = settlementToUpdate.trainlog.find(log => log.status === "Next Train");
            if (nextTrain) {
              nextTrain.status = "Current Train";
              console.log(`🔁 Promoted Next Train to Current Train for settlement ${settlement.name}`);
            }
            
            await settlementToUpdate.save();
          }
          
          // Create basic log entry for phase tracking (NewTrain handles offers/rewards)
          await appendBasicTrainLog(settlement);

        } catch (error) {
          console.error(`❌ Error updating settlement ${settlement.name}:`, error);
        }
      }

      if (phase === "departing") {
        // Mail any earned Caravan reward a failed send left behind, and close every player's
        // Caravan, before the log stops calling it current (utils/caravan.js)
        const leaving = (settlement.trainlog || []).find(log => log.status === "Current Train");
        if (leaving?.trainnumber) {
          try {
            const mailed = await sweepDeparture(settlement._id, leaving.trainnumber);
            if (mailed) console.log(`📬 Caravan ${leaving.trainnumber}: late rewards mailed to ${mailed} player(s) in ${settlement.name}`);
          } catch (error) {
            console.error(`❌ Caravan departure sweep failed for ${settlement.name}:`, error);
          }
        }
        // Basic log finalization for phase tracking
        await finalizeBasicTrainLog(settlement._id);
        console.log(`📝 Train log entry finalized for ${settlement.name}`);
      }
      
    }
    return {};
  } catch (error) {
    console.error("❌ Error in trainScheduler:", error);
    return {};
  }
}







// 📝 appendBasicTrainLog creates a basic log entry for phase tracking (NewTrain compatibility)
async function appendBasicTrainLog(settlement) {
  console.log(`📝 Appending basic train log for settlement ${settlement.name}`);
  
  const updatedSettlement = await Settlement.findById(settlement._id);
  if (!updatedSettlement.trainlog) updatedSettlement.trainlog = [];

  // Check if we already have a Next Train log (duplicate prevention)
  const existingNextTrainLog = updatedSettlement.trainlog.find(log => log.status === "Next Train");
  if (existingNextTrainLog) {
    console.log(`⚠️ Next Train log already exists for ${settlement.name}, skipping duplicate creation`);
    return;
  }

  // Get the next train number
  const trainNumber = updatedSettlement.nextTrainNumber || 1;
  updatedSettlement.nextTrainNumber = trainNumber + 1;

  // Create basic log entry for phase tracking only
  const logEntry = {
    date: new Date(),
    alloffersfilled: null,
    totalwinners: 0,
    trainnumber: trainNumber,
    status: "Next Train"
  };
  updatedSettlement.trainlog.push(logEntry);

  // Trim logs to latest 8
  if (updatedSettlement.trainlog.length > 8) {
    updatedSettlement.trainlog = updatedSettlement.trainlog.slice(-8);
  }

  await updatedSettlement.save();
}


// 📝 finalizeBasicTrainLog finalizes the latest "Current Train" log entry for phase tracking
async function finalizeBasicTrainLog(settlementId) {
  console.log(`📝 Finalizing basic train log for settlement ${settlementId}`);
  const settlement = await Settlement.findById(settlementId);
  if (!settlement || !settlement.trainlog) return;
  const currentLog = settlement.trainlog.find(log => log.status === "Current Train");

  if (!currentLog) { console.warn(`⚠️ No Current Train log found for settlement ${settlement.name}`); return; }

  // Check if already finalized (duplicate prevention)
  if (currentLog.alloffersfilled !== null) {
    console.warn(`⚠️ Train log already finalized for settlement ${settlement.name}, skipping duplicate finalization`);
    return;
  }

  // Basic finalization for phase tracking
  currentLog.alloffersfilled = false; // NewTrain handles completion tracking
  currentLog.totalwinners = 0;
  currentLog.status = "Departed Train";

  await settlement.save();
}

module.exports = trainScheduler;