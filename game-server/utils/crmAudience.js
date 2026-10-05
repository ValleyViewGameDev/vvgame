// crmAudience: the ONE authority on who may receive a marketing email (ported from House).
// TRANSACTIONAL (welcome) needs no consent: gate on canReceiveTransactional. MARKETING
// (Train / Carnival / season announcements) requires consent: gate on isMarketingEligible.
// Never read marketing_consent directly to decide a send.
const crypto = require('crypto');

const BILLING_ONLY_SOURCES = new Set(['stripe']); // an address given to pay a bill is not permission to market
const DEFAULT_WHEN_UNASKED = true;                // soft opt-in for a game the player actively plays; Settings toggle + unsubscribe link

function canReceiveTransactional(player) {
  if (!player || !player.email) return false;
  if (player.email_bounced_at) return false;
  return true;
}

function isMarketingEligible(player) {
  if (!canReceiveTransactional(player)) return false;
  if (player.marketing_consent === true) return true;
  if (player.marketing_consent === false) return false;
  if (!DEFAULT_WHEN_UNASKED) return false;
  return !BILLING_ONLY_SOURCES.has(player.email_source);
}

// The same rule as a Mongo filter (bulk sends, dashboard counts); keep in lockstep with the above.
function marketingAudienceFilter() {
  return {
    email: { $nin: [null, ''] },
    email_bounced_at: null,
    $or: [
      { marketing_consent: true },
      ...(DEFAULT_WHEN_UNASKED ? [{ marketing_consent: null, email_source: { $nin: [...BILLING_ONLY_SOURCES] } }] : []),
    ],
  };
}

function transactionalAudienceFilter() {
  return { email: { $nin: [null, ''] }, email_bounced_at: null };
}

async function ensureUnsubscribeToken(player) {
  if (!player || !player.email) return null;
  if (player.unsubscribe_token) return player.unsubscribe_token;
  player.unsubscribe_token = crypto.randomBytes(24).toString('hex');
  await player.save();
  return player.unsubscribe_token;
}

function setMarketingConsent(player, optedIn) {
  player.marketing_consent = !!optedIn;
  player.marketing_consent_at = new Date();
  return player;
}

module.exports = { BILLING_ONLY_SOURCES, DEFAULT_WHEN_UNASKED, canReceiveTransactional, isMarketingEligible, marketingAudienceFilter, transactionalAudienceFilter, ensureUnsubscribeToken, setMarketingConsent };
