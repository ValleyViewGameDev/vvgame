// Durable per-(visitor, UTC day) landing-page view record: the top-of-funnel
// DENOMINATOR for the PageView -> AccountCreation funnel (analytics dashboard,
// Site Traffic tab). Written by utils/analytics.recordPageview from the
// anonymous client beacon (POST /api/analytics/pageview, fired once per day per
// browser from the login screen; localhost loads skip it).
//
// The visitor_id is an ANONYMOUS random UUID minted client-side and persisted
// in localStorage (no PII, first-party only). The same id is stamped onto
// players.client_info.visitor_id at register, which lets the funnel join a page
// view to the account it became. Durable, deletion-proof, forward-only.
const mongoose = require('mongoose');

const AnalyticsPageviewSchema = new mongoose.Schema({
  // "<visitorId>:<YYYY-MM-DD>": the visitor's first view of the day inserts,
  // later views that day are cheap $inc no-ops on the same row.
  _id: { type: String },
  visitor_id: { type: String, required: true, index: true }, // anonymous UUID (client-minted)
  day: { type: String, required: true, index: true },        // YYYY-MM-DD (UTC)
  ts: { type: Date, default: Date.now },                     // first view instant that day
  views: { type: Number, default: 1 },                       // raw views this (visitor, day)
  // First-touch attribution for the day, $setOnInsert only (utm_source from the
  // landing URL; referrer hostname as the organic backstop). Length-capped and
  // sanitized at the write boundary.
  utm_source: { type: String, default: null },
  referrer_host: { type: String, default: null },
  // Play surface at the time of the visit (plain web / in-app browser / a
  // ?source= tracking link): the visit-level twin of client_info.surface.
  source: { type: String, default: null },
  // True when the row was RECONSTRUCTED at register (ensurePageview) because the
  // visitor created an account but their beacon never landed.
  backfilled: { type: Boolean, default: false },
  schema_version: { type: Number, default: 1 },
}, { collection: 'analytics_pageview', versionKey: false });

module.exports = mongoose.model('AnalyticsPageview', AnalyticsPageviewSchema);
