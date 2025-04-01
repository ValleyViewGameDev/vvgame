// /utils/scheduleHelpers.js
const { taxScheduler } = require('../schedulers/taxScheduler'); // Adjust path as needed
const seasonScheduler = require('../schedulers/seasonScheduler');
const trainScheduler = require('../schedulers/trainScheduler');
const electionScheduler = require('../schedulers/electionScheduler');
const bankScheduler = require('../schedulers/bankScheduler');

// Optional: shared activeTimers object if needed (not required unless you want cancel/clear support)
const activeTimers = {};

const scheduleEvent = (event, phase, duration, frontierId) => {
    console.log(`⏳ Scheduling ${event} - Phase: ${phase} (Frontier ${frontierId}) for ${duration / 60000} min...`);

    if (activeTimers[`${event}-${frontierId}`]) {
        clearTimeout(activeTimers[`${event}-${frontierId}`]);
    }

    activeTimers[`${event}-${frontierId}`] = setTimeout(async () => {
        console.log(`🚀 Triggering ${event} - Phase: ${phase} (Frontier ${frontierId})`);

        switch (event) {
            case "taxes":
                console.log("💰 Triggering taxScheduler...");
                await taxScheduler(frontierId);
                break;
            case "seasons":
                console.log("🗓️ Triggering seasonScheduler...");
                await seasonScheduler(frontierId);
                break;
            case "elections":
                console.log("🏛️ Triggering electionsScheduler...");
                await electionScheduler(frontierId);
                break;
            case "train":
                console.log("🚂 Triggering trainScheduler...");
                await trainScheduler(frontierId);
                break;
            case "bank":
                console.log("🏦 Triggering bankScheduler...");
                await bankScheduler(frontierId);
                break;
            default:
                console.warn(`⚠️ No scheduler found for ${event}. Skipping...`);
        }
    }, duration);
};

module.exports = { scheduleEvent };