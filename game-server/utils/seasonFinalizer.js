// game-server/utils/seasonFinalizer.js
const updateNetWorthForFrontier = require('../schedulers/taxScheduler').updateNetWorthForFrontier;
const seasonReset = require('./seasonReset');

async function seasonFinalizer(frontierId) {
  console.group("🗓️🗓️🗓️🗓️🗓️ Starting SEASON FINALIZER for Frontier", frontierId);

  try {
    console.log("📊 Recalculating final net worth...");
    await updateNetWorthForFrontier(frontierId);

    console.log("🧹 Triggering world reset...");
    await seasonReset(frontierId);

    console.log("✅ Season finalization complete!");
  } catch (error) {
    console.error("❌ Error during season finalization:", error);
  }

  console.groupEnd();
}

module.exports = seasonFinalizer;