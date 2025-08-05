const API_BASE = process.env.API_BASE || 'http://localhost:3001'; // Add API base URL

async function networthScheduler(frontierId, phase, frontier = null) {
    
    console.log(`📪 NETWORTH SCHEDULING LOGIC for Frontier ${frontierId}, Phase: ${phase}`);
    if (!frontierId) { console.warn("⚠️ No frontierId provided to networthScheduler."); return {}; }
    if (phase === "waiting") { console.log(`✉️ Phase is 'waiting'. No action taken.`); return {}; }
    if (phase !== "calculating") { console.log(`⏳ Phase '${phase}' is not actionable. Skipping.`); return {}; }

    await updateNetWorthForFrontier(frontierId);

    return {};
}

module.exports = networthScheduler;