const express = require("express");
const fs = require("fs");
const path = require("path");
const { resetAllTimers } = require("../utils/scheduleHelpers");
const Frontier = require("../models/frontier");

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
 * ✅ Initialize Dungeon Timer
 * Sets up the dungeon timer on existing frontiers that don't have it yet.
 * POST /api/initialize-dungeon-timer
 * Body: { frontierId: "abc123" } (optional - if not provided, updates all frontiers)
 */
router.post("/initialize-dungeon-timer", async (req, res) => {
  try {
    const { frontierId } = req.body;
    const tuningPath = path.join(__dirname, "../tuning/globalTuning.json");
    const tuningConfig = JSON.parse(fs.readFileSync(tuningPath, "utf-8"));

    const now = new Date();
    const dungeonDuration = tuningConfig.dungeon.phases[tuningConfig.dungeon.startPhase] * 60000;
    const dungeonEnd = new Date(now.getTime() + dungeonDuration);

    const dungeonTimer = {
      phase: tuningConfig.dungeon.startPhase,
      startTime: now,
      endTime: dungeonEnd,
    };

    let result;
    if (frontierId) {
      // Update specific frontier
      result = await Frontier.findByIdAndUpdate(
        frontierId,
        { $set: { dungeon: dungeonTimer } },
        { new: true }
      );
      if (!result) {
        return res.status(404).json({ success: false, message: "Frontier not found" });
      }
      console.log(`✅ Initialized dungeon timer for frontier ${frontierId}`);
    } else {
      // Update all frontiers that don't have dungeon timer
      result = await Frontier.updateMany(
        { dungeon: { $exists: false } },
        { $set: { dungeon: dungeonTimer } }
      );
      console.log(`✅ Initialized dungeon timer for ${result.modifiedCount} frontier(s)`);
    }

    res.json({
      success: true,
      message: frontierId
        ? `Dungeon timer initialized for frontier ${frontierId}`
        : `Dungeon timer initialized for ${result.modifiedCount} frontier(s)`
    });
  } catch (error) {
    console.error("❌ Error initializing dungeon timer:", error);
    res.status(500).json({ success: false, message: "Failed to initialize dungeon timer" });
  }
});

/**
 * ✅ Force End Phase for a Given Event
 * Updates the endTime of the specified event on the frontier document to 1 minute from now.
 * POST /api/force-end-phase
 * Body: { frontierId: "abc123", event: "bank" }
 */
router.post("/force-end-phase", async (req, res) => {
  const { frontierId, event } = req.body;
  console.log("🛬 Raw request body:", req.body);
  if (!frontierId || !event) {
    return res.status(400).json({ success: false, message: "Missing frontierId or event" });
  }

  try {
    console.log(`📥 Received request to force-end phase:`, { frontierId, event });

    const frontier = await Frontier.findById(frontierId);
    if (!frontier) {
      return res.status(404).json({ success: false, message: "Frontier not found" });
    }
    console.log(`🔍 Loaded frontier: ${frontier?.name || '[Unnamed]'} (${frontier._id})`);

    const now = new Date();
    const newEndTime = new Date(now.getTime() + 60 * 1000); // 1 minute from now
    console.log(`⏳ Setting ${event}.endTime to ${newEndTime.toISOString()}`);

    if (!frontier.toObject().hasOwnProperty(event)) {
      return res.status(400).json({ success: false, message: `Event "${event}" not found on frontier` });
    }

    frontier.set(`${event}.endTime`, newEndTime);
    await frontier.save();

    console.log(`⏳ Force-ended phase for ${event} on frontier ${frontierId}`);
    res.json({ success: true, message: `End time for ${event} set to 1 minute from now.` });
  } catch (error) {
    console.error("❌ Error force-ending phase:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});


module.exports = router;
