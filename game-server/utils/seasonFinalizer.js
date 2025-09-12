// game-server/utils/seasonFinalizer.js

const { updateNetWorthForFrontier } = require('./networthCalc'); // ⬅️ Now using the new source
const Player = require('../models/player');
const Settlement = require('../models/settlement');
const sendMailboxMessage = require('../utils/messageUtils');
const Frontier = require('../models/frontier');
const { isDeveloper } = require('./developerHelpers');

async function seasonFinalizer(frontierId, seasonType, seasonNumber) {
  console.group("🗓️🗓️🗓️🗓️🗓️ Starting SEASON FINALIZER for Frontier", frontierId);
 
  try {
    console.log("📊 Recalculating final net worth...");
    await updateNetWorthForFrontier(frontierId);

    console.log("📊 Fetching top 3 players by net worth (excluding developers)...");
    // Get all players, then filter out developers
    const allPlayers = await Player.find({ frontierId }).sort({ netWorth: -1 });
    const topPlayers = allPlayers
      .filter(player => !isDeveloper(player.username))
      .slice(0, 3);

    console.log("📊 Calculating top settlement by combined net worth (excluding developers)...");
    // Get all settlements and calculate combined net worth excluding developers
    const settlements = await Settlement.find({ frontierId });
    let winningSettlement = null;
    let highestNetWorth = 0;
    
    for (const settlement of settlements) {
      const players = await Player.find({ settlementId: settlement._id });
      const combinedNetWorth = players
        .filter(player => !isDeveloper(player.username))
        .reduce((sum, player) => sum + (player.netWorth || 0), 0);
      
      if (combinedNetWorth > highestNetWorth) {
        highestNetWorth = combinedNetWorth;
        winningSettlement = settlement;
      }
    }

    if (topPlayers.length > 0) {
      console.log("🏆 Top Players:", topPlayers.map(p => p.username));
      for (const player of topPlayers) {
        try {
          await sendMailboxMessage(player._id, 301); // Message ID 301 = Top Player Reward
          console.log(`📬 Reward sent to top player ${player.username}`);
        } catch (error) {
          console.error(`❌ Failed to send top player reward to ${player.username}`, error);
        }
      }
    }

    if (winningSettlement) {
      console.log("🏅 Winning Settlement:", winningSettlement.name);
      const winningPlayers = await Player.find({ settlementId: winningSettlement._id });
      for (const player of winningPlayers) {
        // Skip developers from receiving rewards
        if (isDeveloper(player.username)) {
          console.log(`⚠️ Skipping developer ${player.username} from top settlement rewards`);
          continue;
        }
        try {
          await sendMailboxMessage(player._id, 302); // Message ID 302 = Top Settlement Reward
          console.log(`📬 Reward sent to ${player.username} in top settlement`);
        } catch (error) {
          console.error(`❌ Failed to send top settlement reward to ${player.username}`, error);
        }
      } 
    }

    console.log("✅ Season finalization complete!");

    ///////////////////////////////
    //// Log season entry on the Frontier document

    const frontierDoc = await Frontier.findById(frontierId);
    console.log("📝 Checking Frontier document for season metadata: ",frontierDoc.seasons);

    if (seasonNumber !== undefined && seasonType) {
      console.log("📝 Writing season log entry to Frontier document...");
      const seasonLogEntry = {
        date: new Date(),
        seasonnumber: seasonNumber,
        seasontype: seasonType,
        seasonwinners: topPlayers.map(player => ({
          playerId: player._id,
          username: player.username,
          networth: player.netWorth || 0
        })),
        winningsettlement: winningSettlement?.displayName || winningSettlement?.name || 'Unknown',
        gridsreset: 0, // filled in by seasonReset
        playersrelocated: 0 // filled in by seasonReset
      };
      console.log("📝 Saving season log entry:", seasonLogEntry);
      await Frontier.updateOne(
        { _id: frontierId },
        { $push: { seasonlog: { $each: [seasonLogEntry], $slice: -10 } } }
      );

      console.log("📝 Season log entry saved to Frontier document.");
    } else {
      console.warn("⚠️ Could not write season log: Missing season metadata on frontier document.");
    }
  } catch (error) {
    console.error("❌ Error during season finalization:", error);
  }

  console.log("🏁🏁🏁 Finished SEASON FINALIZER");
  
  console.groupEnd();
}

module.exports = seasonFinalizer;
