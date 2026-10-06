// Player-facing emails (ported from House): distinct from emailUtils.js, which alerts the OWNER.
// Each resolves a hosted Loops template by the player's language (EN fallback) and sends via
// mailer.js. Transactional sends are stamped at most once per player with an ATOMIC claim on
// a Player Date field; the marketing send is gated on crmAudience and carries the unsubscribe
// link. The audience stays in Mongo; Loops never holds a contact list. docs/onboarding-plan.md §4.6.
//
// Env (Loops template ids): LOOPS_TID_WELCOME_<EN|ES|FR|DE>, LOOPS_TID_EVENT_<EN|ES|FR|DE>,
// YOUR_DOMAIN (client base for sign-in links), PUBLIC_SERVER_URL (unsubscribe links).
const { sendTemplateEmail } = require('./mailer');
const Player = require('../models/player');
const { isMarketingEligible, ensureUnsubscribeToken } = require('./crmAudience');

const LANGS = ['EN', 'ES', 'FR', 'DE'];
const TEMPLATES = {
  welcome: Object.fromEntries(LANGS.map((l) => [l, process.env[`LOOPS_TID_WELCOME_${l}`]])),
  event_announce: Object.fromEntries(LANGS.map((l) => [l, process.env[`LOOPS_TID_EVENT_${l}`]])),
  sub_thanks: Object.fromEntries(LANGS.map((l) => [l, process.env[`LOOPS_TID_SUB_THANKS_${l}`]])),
};

function templateFor(kind, language) {
  const byLang = TEMPLATES[kind] || {};
  return byLang[String(language || 'en').toUpperCase()] || byLang.EN || null;
}

// Claim the stamp atomically BEFORE sending so duplicate triggers can't both send; release it
// if the send fails so a later attempt can retry.
async function sendOnce(player, flag, buildAndSend) {
  if (!player || !player.email) return false;
  if (player[flag]) return false;
  const claim = await Player.updateOne({ _id: player._id, [flag]: null }, { $set: { [flag]: new Date() } });
  if (!claim.modifiedCount) return false;
  const ok = await buildAndSend();
  if (!ok) await Player.updateOne({ _id: player._id }, { $unset: { [flag]: '' } }).catch(() => {});
  return ok;
}

// "Come back to YOUR profile": App.js reads signin=1 (open the sign-in form when no session) and
// u=<name> (prefilled; most profiles are passwordless so it is one tap). A username is public.
function signinUrlFor(player, campaign = 'welcome') {
  const base = (process.env.YOUR_DOMAIN || 'https://www.secretsofelsinore.com').trim().replace(/\/$/, '');
  const q = new URLSearchParams({ utm_source: 'email', utm_medium: 'email', utm_campaign: campaign, signin: '1', u: player.username || '' });
  return `${base}/?${q.toString()}`;
}

// Welcome: once per player, when an email is first saved (routes/auth.js /player/email).
async function sendWelcomeEmail(player) {
  return sendOnce(player, 'welcome_email_sent_at', () => sendTemplateEmail({
    to: player.email,
    transactionalId: templateFor('welcome', player.language),
    dataVariables: { username: player.username, signinUrl: signinUrlFor(player) },
  }));
}

// "Thanks for the Gold Pass": once, when the Gold upgrade is recorded (routes/paymentRoutes.js).
async function sendSubscriptionThanksEmail(player) {
  return sendOnce(player, 'subscription_thanks_email_sent_at', () => sendTemplateEmail({
    to: player.email,
    transactionalId: templateFor('sub_thanks', player.language),
    dataVariables: { username: player.username, signinUrl: signinUrlFor(player, 'gold') },
  }));
}

// Event announcement (marketing; phase D runner owns per-campaign idempotency via models/emailSend.js).
async function sendEventAnnouncementEmail(player, { eventName, eventDates, eventCloses, eventHook, ctaUrl }) {
  if (!player || !player.email) return false;
  if (!isMarketingEligible(player)) return false;
  const token = await ensureUnsubscribeToken(player);
  if (!token) return false;
  const base = (process.env.PUBLIC_SERVER_URL || 'https://vvgame-server.onrender.com').replace(/\/$/, '');
  return sendTemplateEmail({
    to: player.email,
    transactionalId: templateFor('event_announce', player.language),
    dataVariables: { username: player.username, eventName, eventDates, eventCloses, eventHook, ctaUrl, unsubscribeUrl: `${base}/api/unsubscribe?token=${token}` },
  });
}

module.exports = { sendWelcomeEmail, sendSubscriptionThanksEmail, sendEventAnnouncementEmail, signinUrlFor };
