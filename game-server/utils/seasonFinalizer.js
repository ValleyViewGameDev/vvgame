// game-server/utils/seasonFinalizer.js

const { updateNetWorthForFrontier } = require('./networthCalc'); // ⬅️ Now using the new source

async function seasonFinalizer(frontierId) {
  console.group("🗓️🗓️🗓️🗓️🗓️ Starting SEASON FINALIZER for Frontier", frontierId);
 
  try {
    console.log("📊 Recalculating final net worth...");
    await updateNetWorthForFrontier(frontierId);

// Here we need to send Inbox rewards to the top players
// We need to fetch the top players based on net worth -- get top 3 players across the whole frontier
// Also, we need to fetch the winning settlement for the frontier; this will be based upon the settlement with the highest combined net worth 

// The top 3 players in the entire frontier get message id 301 sent to their inbox
// All players in the top settlement get message id 302 sent to their inbox

    // const topPlayers = await Player.find({ frontierId })
    //   .sort({ netWorth: -1 })
    //   .limit(3);
    // const winningSettlement = await Settlement.findOne({ frontierId })
    //   .sort({ combinedNetWorth: -1 });

    // if (topPlayers.length > 0) {
    //   console.log("🏆 Top Players:", topPlayers.map(p => p.username));
    // }
    
    // if (winningSettlement) {
    //   console.log("🏅 Winning Settlement:", winningSettlement.name);
    // }

// console.log("📬 Sending Inbox rewards to top players...")
    ;

    console.log("✅ Season finalization complete!");
  } catch (error) {
    console.error("❌ Error during season finalization:", error);
  }

  console.log("🏁🏁🏁 Finished SEASON FINALIZER");
  
  console.groupEnd();
}

module.exports = seasonFinalizer;
