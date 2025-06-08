// game-server/utils/seasonFinalizer.js

const { updateNetWorthForFrontier } = require('./networthCalc'); // ⬅️ Now using the new source
const Player = require('../models/player');
const Settlement = require('../models/settlement');
const sendMailboxMessage = require('../utils/messageUtils');
const Frontier = require('../models/frontier');

async function seasonFinalizer(frontierId) {
  console.group("🗓️🗓️🗓️🗓️🗓️ Starting SEASON FINALIZER for Frontier", frontierId);
 
  try {
    console.log("📊 Recalculating final net worth...");
    await updateNetWorthForFrontier(frontierId);

    console.log("📊 Fetching top 3 players by net worth...");
    const topPlayers = await Player.find({ frontierId }).sort({ netWorth: -1 }).limit(3);

    console.log("📊 Fetching top settlement by combined net worth...");
    const winningSettlement = await Settlement.findOne({ frontierId }).sort({ combinedNetWorth: -1 });

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
    console.log("📝 Checking Frontier document for season metadata: ",frontierDoc);

    if (frontierDoc?.seasons?.seasonNumber !== undefined && frontierDoc.seasons.seasonType) {
      console.log("📝 Writing season log entry to Frontier document...");
      const seasonLogEntry = {
        date: new Date(),
        seasonnumber: frontierDoc.seasons.seasonNumber,
        seasontype: frontierDoc.seasons.seasonType,
        seasonwinners: topPlayers.map(player => ({
          playerId: player._id,
          username: player.username,
          networth: player.netWorth || 0
        })),
        winningsettlement: winningSettlement?.displayName || 'Unknown',
        gridsreset: 0, // Will be filled in by seasonReset
        playersrelocated: 0 // Will be filled in by seasonReset
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
