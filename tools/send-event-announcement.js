#!/usr/bin/env node
// Event announcement email (docs/onboarding-plan.md §4.6, phase D; ported from House).
//
//   node tools/send-event-announcement.js --event train|carnival|season
//       DRY RUN (default): resolves the current window and copy, prints the audience and who
//       would receive it. Sends nothing, writes nothing.
//   node tools/send-event-announcement.js --event train --send
//       The real campaign: every marketing-eligible player (utils/crmAudience.js is the
//       authority) minus developer accounts, once per player per window (models/emailSend.js;
//       safe to re-run), capped at one marketing email per player per --cap-days (7).
//   node tools/send-event-announcement.js --auto --send
//       CRON MODE (a Render Cron Job runs this daily): announces every window that opened
//       today (Train loading, Carnival here) and the season's last week, once each.
//   node tools/send-event-announcement.js --event train --to-username Oberon --send
//       TEST MODE: that account only (it needs an email); no ledger, no dev exclusion.
//   --lapsed-days N   only players whose lastActive is older than N days (House measured the
//                     lift on lapsed players: 5.5% reactivated by a real dated event).
//
// Env: LOOPS_API_KEY, LOOPS_TID_EVENT_<LANG> (game-server/.env, which points at production).
//
// PARKED (owner, 2026-10-06): the event email is not part of the program yet; it is too much
// email for the current audience. Dry runs and --to-username tests work; a real send or --auto
// refuses unless EVENT_EMAIL_ENABLED=1 is set. Decide the cadence in docs/onboarding-plan.md
// before flipping that.
const path = require('path');
const GAME_SERVER = path.join(__dirname, '..', 'game-server');
require(path.join(GAME_SERVER, 'node_modules', 'dotenv')).config({ path: path.join(GAME_SERVER, '.env') });
const mongoose = require(path.join(GAME_SERVER, 'node_modules', 'mongoose'));
const Player = require(path.join(GAME_SERVER, 'models', 'player'));
const Frontier = require(path.join(GAME_SERVER, 'models', 'frontier'));
const EmailSend = require(path.join(GAME_SERVER, 'models', 'emailSend'));
const A = require(path.join(GAME_SERVER, 'utils', 'crmAudience'));
const { sendEventAnnouncementEmail, signinUrlFor } = require(path.join(GAME_SERVER, 'utils', 'emailNotifications'));
const developerUsernames = require(path.join(GAME_SERVER, 'tuning', 'developerUsernames.json'));

const arg = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; };
const EVENT = arg('--event');
const TO_USERNAME = arg('--to-username');
const SEND = process.argv.includes('--send');
const AUTO = process.argv.includes('--auto');
const LAPSED_DAYS = Number(arg('--lapsed-days') || 0);
const CAP_DAYS = Number(arg('--cap-days') || 7);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pretty = (d) => { const x = new Date(d); return `${MONTHS[x.getUTCMonth()]} ${x.getUTCDate()}`; };
const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Copy per event kind (EN; the Loops template holds the subject and layout). No em-dashes.
const EVENT_COPY = {
  train: { eventName: 'The Train is in', eventHook: 'The Train has pulled into Town and wants goods: fill an order from your warehouse before it departs and it pays in Money you will not get anywhere else.' },
  carnival: { eventName: 'The Carnival is here', eventHook: 'The Carnival has set up in Town. Claim an offer, bring the goods, and collect the reward before it packs up again.' },
  season: { eventName: 'The last week of the season', eventHook: 'The season ends soon. Harvest what is still in the ground, sell to Kent, and check the leaderboard: standings lock when the season turns.' },
};

// The window for a kind, from the frontier's live timers. Null when there is nothing to announce.
function windowFor(kind, f) {
  if (kind === 'train' && f.train?.phase === 'loading') return { opens: f.train.startTime, closes: f.train.endTime, key: `train@${dayKey(f.train.startTime)}` };
  if (kind === 'carnival' && f.carnival?.phase === 'here') return { opens: f.carnival.startTime, closes: f.carnival.endTime, key: `carnival@${dayKey(f.carnival.startTime)}` };
  if (kind === 'season' && f.seasons?.phase === 'onSeason') {
    const daysLeft = (new Date(f.seasons.endTime) - Date.now()) / 86400000;
    if (daysLeft <= 7 && daysLeft > 0) return { opens: new Date(), closes: f.seasons.endTime, key: `season_${String(f.seasons.seasonType).toLowerCase()}${f.seasons.seasonNumber}_lastweek` };
  }
  return null;
}

async function runCampaign(kind, frontier) {
  const copy = EVENT_COPY[kind];
  if (!copy) { console.error(`✗ unknown event "${kind}" (train|carnival|season)`); return; }
  const win = windowFor(kind, frontier);
  if (!win) { console.log(`· ${kind}: no open window right now; nothing to announce.`); return; }
  const base = { eventName: copy.eventName, eventHook: copy.eventHook, eventDates: `${pretty(win.opens)} to ${pretty(win.closes)}`, eventCloses: pretty(win.closes) };
  const varsFor = (p) => ({ ...base, ctaUrl: signinUrlFor(p, win.key) });
  console.log(`campaign:  ${win.key}   dates: ${base.eventDates}`);
  if (!process.env.LOOPS_TID_EVENT_EN) console.warn('⚠ LOOPS_TID_EVENT_EN is unset: sends will be skipped until the template id is in .env');

  if (TO_USERNAME) {
    const player = await Player.findOne({ username: TO_USERNAME });
    if (!player) { console.error(`No player "${TO_USERNAME}"`); return; }
    if (!player.email) { console.error(`"${TO_USERNAME}" has no email on file.`); return; }
    console.log(`test recipient: ${player.username} <${player.email}>  marketing-eligible: ${A.isMarketingEligible(player)}`);
    if (!SEND) { console.log('DRY RUN: pass --send to email this account.'); return; }
    const ok = await sendEventAnnouncementEmail(player, varsFor(player));
    console.log(ok ? '✓ sent (no ledger entry in test mode)' : '✗ refused or failed (see above)');
    return;
  }

  const filter = { ...A.marketingAudienceFilter(), username: { $nin: developerUsernames } };
  if (LAPSED_DAYS > 0) filter.lastActive = { $lt: new Date(Date.now() - LAPSED_DAYS * 86400000) };
  const audience = await Player.find(filter);
  const sentThisCampaign = new Set((await EmailSend.find({ campaign_key: win.key }).select('player_id')).map((r) => String(r.player_id)));
  const capSince = new Date(Date.now() - CAP_DAYS * 86400000);
  const recentlyMailed = new Set((await EmailSend.find({ sent_at: { $gte: capSince } }).select('player_id')).map((r) => String(r.player_id)));
  const toSend = audience.filter((p) => !sentThisCampaign.has(String(p._id)) && !recentlyMailed.has(String(p._id)));
  console.log(`audience:  ${audience.length} eligible${LAPSED_DAYS ? ` (lapsed ${LAPSED_DAYS}+ days)` : ''} · ${sentThisCampaign.size} already sent · ${audience.length - toSend.length - sentThisCampaign.size} inside the ${CAP_DAYS}-day cap · ${toSend.length} to send`);
  if (!SEND) {
    for (const p of toSend.slice(0, 10)) console.log(`  would send → ${p.username} <${p.email}>`);
    if (toSend.length > 10) console.log(`  … and ${toSend.length - 10} more`);
    console.log('DRY RUN: pass --send to run the campaign.');
    return;
  }
  let sent = 0, failed = 0;
  for (const p of toSend) {
    try { await EmailSend.create({ player_id: p._id, campaign_key: win.key }); }
    catch (e) { if (e && e.code === 11000) continue; throw e; }
    const ok = await sendEventAnnouncementEmail(p, varsFor(p));
    if (ok) sent += 1;
    else { failed += 1; await EmailSend.deleteOne({ player_id: p._id, campaign_key: win.key }).catch(() => {}); console.warn(`  ✗ ${p.username}: refused or failed, claim released`); }
    await sleep(150);
  }
  console.log(`done: ${sent} sent, ${failed} failed, ${sentThisCampaign.size} previously sent.`);
}

(async () => {
  if (!AUTO && !EVENT) { console.error('Usage: --event train|carnival|season [--send] [--to-username X] [--lapsed-days N] [--cap-days N] | --auto [--send]'); process.exit(1); }
  if (SEND && !TO_USERNAME && process.env.EVENT_EMAIL_ENABLED !== '1') {
    console.error('✗ Event emails are parked: set EVENT_EMAIL_ENABLED=1 to send a real campaign (see the header of this file).');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  const frontier = await Frontier.findOne({}).lean();
  if (!frontier) { console.error('No frontier'); process.exit(1); }
  if (AUTO) {
    const today = dayKey(new Date());
    const kinds = [];
    const t = windowFor('train', frontier); if (t && dayKey(t.opens) === today) kinds.push('train');
    const c = windowFor('carnival', frontier); if (c && dayKey(c.opens) === today) kinds.push('carnival');
    if (windowFor('season', frontier)) kinds.push('season'); // once per season via the ledger key
    if (!kinds.length) console.log(`[auto] ${today}: nothing opening today.`);
    for (const k of kinds) await runCampaign(k, frontier);
  } else {
    await runCampaign(EVENT, frontier);
  }
  await mongoose.disconnect();
})().catch((err) => { console.error(err); process.exit(1); });
