/**
 * Purge of silent accounts that never became players (docs/onboarding-plan.md §5, decision 5).
 *
 * A visitor with no session gets an account and a cave on load. If they leave before signing the
 * Home Deed, the record is dead weight. Candidates: `named: false`, no email, never past FTUE
 * step 3 (the deed is step 4, so no homestead exists), no homestead grid, and not active for
 * PURGE_AFTER_DAYS. Named or emailed accounts are never touched. Each run logs its count to
 * analytics_purge so the dashboard can show "bounced in the cave" for a date range.
 *
 * Used by schedulers/purgeScheduler.js (daily, production) and scripts/purge-unnamed.js (manual).
 */
const Player = require('../models/player');
const Grid = require('../models/grid');
const AnalyticsPurge = require('../models/analyticsPurge');

const PURGE_AFTER_DAYS = 7;
const MAX_FTUE_STEP = 3;

function criteria(now = new Date()) {
  const before = new Date(now.getTime() - PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000);
  return {
    named: false,
    $and: [
      { $or: [{ email: null }, { email: { $exists: false } }, { email: '' }] },
      { $or: [{ ftuestep: null }, { ftuestep: { $lte: MAX_FTUE_STEP } }] },
      { $or: [{ gridId: null }, { gridId: { $exists: false } }] },
      { $or: [{ lastActive: { $lt: before } }, { lastActive: null, created: { $lt: before } }] },
    ],
  };
}

async function findPurgeCandidates(now = new Date()) {
  return Player.find(criteria(now), { username: 1, created: 1, lastActive: 1, ftuestep: 1 }).lean();
}

// apply=false lists; apply=true deletes the players and their per-player grids and logs the count.
async function purgeUnnamed({ apply = false, now = new Date(), log = console.log } = {}) {
  const candidates = await findPurgeCandidates(now);
  log(`🧹 purgeUnnamed: ${candidates.length} unnamed account(s) inactive for ${PURGE_AFTER_DAYS}+ days${apply ? '' : ' (dry run)'}`);
  if (!apply || !candidates.length) {
    if (apply) await AnalyticsPurge.create({ day: now.toISOString().slice(0, 10), ts: now, count: 0, criteria: { days: PURGE_AFTER_DAYS, maxStep: MAX_FTUE_STEP } });
    return { count: candidates.length, candidates, applied: false };
  }
  const ids = candidates.map((c) => c._id);
  const grids = await Grid.deleteMany({ ownerId: { $in: ids }, isTemplate: { $ne: true } });
  const players = await Player.deleteMany({ _id: { $in: ids } });
  await AnalyticsPurge.create({ day: now.toISOString().slice(0, 10), ts: now, count: players.deletedCount || 0, criteria: { days: PURGE_AFTER_DAYS, maxStep: MAX_FTUE_STEP } });
  log(`🧹 purgeUnnamed: deleted ${players.deletedCount} player(s) and ${grids.deletedCount} grid(s)`);
  return { count: players.deletedCount || 0, candidates, applied: true };
}

module.exports = { purgeUnnamed, findPurgeCandidates, PURGE_AFTER_DAYS, MAX_FTUE_STEP };
