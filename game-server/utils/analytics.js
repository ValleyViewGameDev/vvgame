// Records durable analytics activity for the dashboard (tools/analytics/).
// Called fire-and-forget from the request path: callers do
//   recordActivity(playerId).catch(() => {})
// and never await, so a slow or failed analytics write can never delay or break
// a gameplay request. Write-once upserts feed three analytics collections:
//   - analytics_activity: one doc per (player, UTC day) -> DAU + per-day flags
//   - analytics_player:   one doc per player, first seen -> New Users + cohorts
//   - analytics_pageview: one doc per (visitor, UTC day) -> Site Traffic funnel
// Day buckets are UTC midnight; the dashboard re-buckets to the viewer's local
// day at read time. See docs/analytics.md.

const AnalyticsActivity = require('../models/analyticsActivity');
const AnalyticsPlayer = require('../models/analyticsPlayer');
const AnalyticsPageview = require('../models/analyticsPageview');

// Player ids are 24-hex ObjectIds. Several call sites record for ANY request
// carrying `playerId` in the body, so a malformed/junk value (a stray "dev" id
// from a tool, or a bad client) would otherwise be written as a non-ObjectId
// analytics row, which then crashes the dashboard's ObjectId casts. Reject
// anything that isn't a real ObjectId at the source. Keep this guard on every
// record function.
const HEX24 = /^[0-9a-fA-F]{24}$/;

// YYYY-MM-DD in UTC. Exported so the backfill script and the dashboard bucket
// days identically; the day string is the join key across all collections.
function dayKeyUTC(when) {
  return new Date(when).toISOString().slice(0, 10);
}

// opts.username (when known, i.e. from the auth handlers, which hold the player
// doc) is stamped onto the durable analytics_player record so the dashboard can
// still recognize the account after it is deleted.
//
// COHORT REGISTRY RULE: only the auth paths may create an analytics_player row,
// and `username` is how we know we are on one. The heartbeat call sites
// (update-last-active, enter-grid, player/state) pass the id ALONE. They cannot
// tell a real session from a fabricated playerId (HEX24 validates the SHAPE of
// the id, nothing more), so letting them upsert here would let anyone POSTing
// {"playerId":"0000...0000"} mint a permanent phantom account. Don't pass a
// username from a non-auth site.
async function recordActivity(playerId, opts = {}) {
  if (!playerId) return;
  const pid = String(playerId);
  if (!HEX24.test(pid)) return; // ignore non-ObjectId ids (junk/malformed requests)
  const { username = null, when = new Date() } = opts;
  const day = dayKeyUTC(when);
  const writes = [
    AnalyticsActivity.updateOne(
      { _id: `${pid}:${day}` },
      { $setOnInsert: { playerId: pid, day, ts: when } },
      { upsert: true },
    ),
  ];
  if (username) {
    writes.push(AnalyticsPlayer.updateOne(
      { _id: pid },
      { $setOnInsert: { firstSeenDay: day, firstSeenAt: when }, $set: { username } },
      { upsert: true },
    ));
  }
  await Promise.all(writes);
}

// Shared shape for the per-day flags: $set the flag AND $setOnInsert the base
// activity fields, so the write is self-sufficient even if it lands before that
// day's heartbeat (same (player, day) _id, so it shares the row). Idempotent:
// the first event of the day sets the flag, later ones are no-ops.
async function setDayFlag(playerId, update, when) {
  if (!playerId) return;
  const pid = String(playerId);
  if (!HEX24.test(pid)) return; // ignore non-ObjectId ids (junk/malformed requests)
  const day = dayKeyUTC(when);
  await AnalyticsActivity.updateOne(
    { _id: `${pid}:${day}` },
    { ...update, $setOnInsert: { playerId: pid, day, ts: when } },
    { upsert: true },
  );
}

// Flags the player's activity-day row as "actually played today". Set by the
// gameplay writes that constitute playing (bulk-harvest, crafting collect).
// WHY: the activity row is written on login / app boot / grid entry, so merely
// opening the app produces one. Retention measured on activity alone answers
// "did they come back to the tab?", not "did they play?".
async function recordPlayed(playerId, when = new Date()) {
  await setDayFlag(playerId, { $set: { played: true } }, when);
}

// Flags the day as "turned in a quest". Fired from /update-profile when the
// client sends completedQuests.
async function recordQuestCompleted(playerId, when = new Date()) {
  await setDayFlag(playerId, { $set: { quest_completed: true } }, when);
}

// Flags the day as "made a store purchase". The per-purchase rows live in the
// purchases ledger (models/purchase.js); this is the per-day reach flag.
async function recordPurchase(playerId, when = new Date()) {
  await setDayFlag(playerId, { $set: { purchase: true } }, when);
}

// Increments the day's grid-entry COUNTER (enter-grid). A player travels many
// times a day, so this is $inc, not a boolean.
async function recordGridEntered(playerId, when = new Date()) {
  await setDayFlag(playerId, { $inc: { grids_entered: 1 } }, when);
}

// Anonymous visitor ids are client-minted UUIDs (crypto.randomUUID shape).
// Same validate-at-the-write-boundary rule as HEX24: the beacon endpoint is
// unauthenticated, so anything not UUID-shaped is dropped here rather than
// stored as a junk row.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v, n) => (typeof v === 'string' && v ? v.slice(0, n) : null);

// Records one landing-page view for an anonymous visitor: upserts the
// (visitor, UTC day) row, $inc-ing views so repeat loads that day are cheap
// increments. First-touch attribution (utm_source / referrer host / source) is
// $setOnInsert only. Powers the Site Traffic tab's PageView -> AccountCreation
// funnel (the denominator); the visitor_id is later stamped on client_info at
// register (the join).
async function recordPageview(visitorId, opts = {}) {
  if (!visitorId) return;
  const vid = String(visitorId).toLowerCase();
  if (!UUID_RE.test(vid)) return; // ignore junk/malformed ids (unauthenticated endpoint)
  const when = opts.when || new Date();
  const day = dayKeyUTC(when);
  await AnalyticsPageview.updateOne(
    { _id: `${vid}:${day}` },
    {
      $inc: { views: 1 },
      $setOnInsert: {
        visitor_id: vid, day, ts: when,
        utm_source: str(opts.utm_source, 64),
        referrer_host: str(opts.referrer_host, 128),
        source: str(opts.source, 64),
      },
    },
    { upsert: true },
  );
}

// Guarantee a pageview row exists for a visitor who DEMONSTRABLY visited: they
// just created an account carrying this visitor_id. The beacon is a
// fire-and-forget POST, so a content blocker, a dropped connection, or a signup
// that outruns it loses the request while the signup still succeeds; the account
// would then sit in the funnel's NUMERATOR with nothing in the DENOMINATOR, which
// is how a daily conversion rate goes over 100%.
//
// $setOnInsert ONLY, never $inc: if the beacon did land this must be a total
// no-op. `backfilled: true` marks the row as reconstructed so the beacon's loss
// rate stays measurable. Idempotent; safe to call on every register.
async function ensurePageview(visitorId, opts = {}) {
  if (!visitorId) return;
  const vid = String(visitorId).toLowerCase();
  if (!UUID_RE.test(vid)) return; // same guard as recordPageview
  const when = opts.when || new Date();
  const day = dayKeyUTC(when);
  await AnalyticsPageview.updateOne(
    { _id: `${vid}:${day}` },
    {
      $setOnInsert: {
        visitor_id: vid, day, ts: when, views: 1,
        utm_source: str(opts.utm_source, 64),
        referrer_host: str(opts.referrer_host, 128),
        source: str(opts.source, 64),
        backfilled: true,
      },
    },
    { upsert: true },
  );
}

// Sanitize the optional acquisition object a client sends at register into the
// players.client_info subdocument. Every field is length-capped and coerced to a
// string-or-null so a hostile body cannot store arbitrary structure. Returns
// null when nothing usable was sent, so legacy clients (which send nothing)
// leave client_info null exactly as the schema default.
function sanitizeClientInfo(body) {
  if (!body || typeof body !== 'object') return null;
  const acq = body.acquisition && typeof body.acquisition === 'object' ? body.acquisition : body;
  const vid = str(body.visitor_id || acq.visitor_id, 36);
  const out = {
    visitor_id: vid && UUID_RE.test(vid) ? vid.toLowerCase() : null,
    surface: str(body.surface || acq.surface, 64),
    acquisition: {
      utm_source: str(acq.utm_source, 64),
      utm_medium: str(acq.utm_medium, 64),
      utm_campaign: str(acq.utm_campaign, 128),
      referrer_host: str(acq.referrer_host, 128),
      landing_path: str(acq.landing_path, 256),
    },
    captured_at: new Date(),
  };
  const any = out.visitor_id || out.surface
    || Object.values(out.acquisition).some((v) => v != null);
  return any ? out : null;
}

module.exports = {
  recordActivity, recordPlayed, recordQuestCompleted, recordPurchase, recordGridEntered,
  recordPageview, ensurePageview, sanitizeClientInfo, dayKeyUTC, HEX24,
};
