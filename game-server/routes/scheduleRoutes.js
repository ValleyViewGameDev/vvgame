const express = require("express");
const fs = require("fs");
const path = require("path");
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

/**
 * ✅ Get Global Tuning Settings
 * Reads the tuning config file and returns the data.
 */
router.get("/tuning", (req, res) => {
  const tuningPath = path.join(__dirname, "../tuning/globalTuning.json");
  try {
    const data = fs.readFileSync(tuningPath, "utf-8");
    const json = JSON.parse(data);
    res.json(json);
  } catch (error) {
    console.error("❌ Error reading globalTuning.json:", error);
    res.status(500).json({ success: false, message: "Failed to read tuning file." });
  }
});

/**
 * ✅ Update Global Tuning Settings
 * Overwrites the tuning config file with posted data.
 */
router.post("/tuning", (req, res) => {
  const tuningPath = path.join(__dirname, "../tuning/globalTuning.json");
  try {
    const newTuning = req.body;
    fs.writeFileSync(tuningPath, JSON.stringify(newTuning, null, 2), "utf-8");
    res.json({ success: true, message: "Tuning file updated successfully." });
  } catch (error) {
    console.error("❌ Error writing to globalTuning.json:", error);
    res.status(500).json({ success: false, message: "Failed to update tuning file." });
  }
});


/**
 * ✅ Update a Single Phase Duration for an Event
 * Example: POST /api/schedule/update-phase
 * Body: { event: "taxes", phase: "waiting", duration: 123 }
 */
router.post("/update-phase", (req, res) => {
  const tuningPath = path.join(__dirname, "../tuning/globalTuning.json");
  console.log("🔁 API:  tuningPath:", tuningPath);
  const { event, phase, duration } = req.body;
  console.log("🔁 API:  Updating phase duration:", { event, phase, duration });

  if (!event || !phase || typeof duration !== "number") {
    return res.status(400).json({ success: false, message: "Invalid payload. Expected event, phase, and duration." });
  }

  try {
    const data = fs.readFileSync(tuningPath, "utf-8");
    console.log("🔁 API:  Read tuning config:", data);
    const config = JSON.parse(data);
    console.log("🔁 API:  Parsed tuning config:", config);
    
    if (!config[event] || !config[event].phases || !(phase in config[event].phases)) {
      return res.status(404).json({ success: false, message: "Event or phase not found in tuning config." });
    }

    config[event].phases[phase] = duration;

    fs.writeFileSync(tuningPath, JSON.stringify(config, null, 2), "utf-8");
    res.json({ success: true, message: `Phase "${phase}" for "${event}" updated to ${duration} minutes.` });
  } catch (error) {
    console.error("❌ Error updating phase duration:", error);
    res.status(500).json({ success: false, message: "Failed to update phase duration." });
  }
});

module.exports = router;