// Developer devices: browsers a developer has used (analytics_dev_device). One doc per browser,
// keyed by the anonymous visitor id the client mints once per browser (Utils/pageviewBeacon.js,
// sent on every request as X-Visitor-Id). Written by utils/analytics.recordDevDevice whenever a
// developer session makes a request from a browser (server.js). The analytics dashboard leaves
// out every account first made, or signed in, on one of these browsers, so the owner's throwaway
// test accounts never count (owner 2026-11-16). Per BROWSER, not per physical device: Safari and
// Chrome on one laptop are two entries, and a private window or cleared site data is a new one.
const mongoose = require('mongoose');

const AnalyticsDevDeviceSchema = new mongoose.Schema({
  _id: { type: String },                             // the visitor id (lower-case UUID)
  playerId: { type: String, default: null },         // the developer whose session marked it (latest)
  firstSeenAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
  schema_version: { type: Number, default: 1 },
}, { collection: 'analytics_dev_device', versionKey: false });

module.exports = mongoose.model('AnalyticsDevDevice', AnalyticsDevDeviceSchema);
