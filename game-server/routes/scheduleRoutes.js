const express = require("express");
const { resetAllTimers } = require("../utils/scheduleHelpers");

const router = express.Router();

/**
 * ✅ Reset All Timers Endpoint
 * Forces all events (seasons, elections, train, taxes, bank) to reset.
 */
router.post("/reset-all-timers", async (req, res) => {
  try {
    await resetAllTimers();
    console.log("✅ All timers have been reset via API request.");
    res.json({ success: true, message: "All timers reset successfully." });
  } catch (error) {
    console.error("❌ Error resetting all timers via API:", error);
    res.status(500).json({ success: false, message: "Failed to reset timers." });
  }
});

module.exports = router;