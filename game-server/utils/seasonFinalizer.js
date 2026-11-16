// game-server/utils/seasonFinalizer.js

const { updateNetWorthForFrontier } = require('./networthCalc'); // ⬅️ Now using the new source
const Frontier = require('../models/frontier');

async function seasonFinalizer(frontierId, seasonType, seasonNumber) {
  console.group("🗓️🗓️🗓️🗓️🗓️ Starting SEASON FINALIZER for Frontier", frontierId);

  try {
    // Calculate net worth for all players before determining winners
    console.log("💰 Calculating net worth for all players...");
    await updateNetWorthForFrontier(frontierId);
    console.log("✅ Net worth calculation complete");

    // No season-end rewards (owner 2026-11-16, docs/season-reset.md): net worth only ever grows now
    // that builds survive a season, so the same players would win forever. Competition lives in the
    // Harvest Fair. Net worth is still recalculated above for the Leaderboard.

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
        seasonwinners: [],
        winningsettlement: null,
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
