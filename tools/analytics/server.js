#!/usr/bin/env node
// Secrets of Elsinore (VVGame) Analytics Dashboard: a READ-ONLY server.
// A copy of House's tools/analytics/server.js adapted to VVGame's schema
// (docs/tools-plan.md section 3, docs/analytics.md). The server never writes
// game data; the only destructive tool is purge-analytics.js.
//
// Runs in two modes from the SAME file, switched entirely by env vars:
//   - Local (default): binds 127.0.0.1, no auth, full per-user detail. Reads
//     MONGODB_URI from game-server/.env (prod Atlas, database "test").
//   - Shared prod (Render): binds 0.0.0.0:$PORT, HTTP Basic auth required, and
//     per-user PII hidden, so it can live at a password-protected public URL.
//
// Env vars (all optional; unset -> local mode):
//   PORT                Render injects this -> bind 0.0.0.0 (only honoured when RENDER is set).
//   ANALYTICS_HOST      Explicit bind host (default 127.0.0.1 locally).
//   ANALYTICS_USER/PASS When BOTH set, every request needs Basic auth. Unset -> open.
//   ANALYTICS_HIDE_PII  Truthy -> anonymize the Users / players / FTUE / winners lists.
//   MONGODB_URI         In prod, set on the service directly (no game-server/.env file).
//
// The client is plain static files (client/index.html + app.js + styles.css),
// so iterating on the UI is edit-and-refresh, no rebuild.
//
// Usage (local):
//   node tools/analytics/server.js              # default port 8771
//   node tools/analytics/server.js --port 9100

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const REPO = path.join(__dirname, '..', '..');
const GAME_SERVER = path.join(REPO, 'game-server');
// Reuse game-server's installed deps (no npm install under tools/). dotenv +
// mongoose resolve from game-server/node_modules. Load game-server/.env only if
// it exists (local dev); in prod MONGODB_URI is injected as service env.
const ENV_PATH = path.join(GAME_SERVER, '.env');
if (fs.existsSync(ENV_PATH)) {
  require(path.join(GAME_SERVER, 'node_modules', 'dotenv')).config({ path: ENV_PATH });
}
const mongoose = require(path.join(GAME_SERVER, 'node_modules', 'mongoose'));
// game-server/config/database.js is dead code (its Mongoose 5 options are
// rejected by Mongoose 8; the game server calls mongoose.connect directly), so
// connect the same way game-server/server.js does.
function connectMongo() {
  if (!process.env.MONGODB_URI) return Promise.reject(new Error('MONGODB_URI is not set'));
  return mongoose.connect(process.env.MONGODB_URI, { maxPoolSize: 5, serverSelectionTimeoutMS: 10000, socketTimeoutMS: 30000, autoIndex: false });
}
const Player = require(path.join(GAME_SERVER, 'models', 'player'));
const Frontier = require(path.join(GAME_SERVER, 'models', 'frontier'));
const Settlement = require(path.join(GAME_SERVER, 'models', 'settlement'));
const Purchase = require(path.join(GAME_SERVER, 'models', 'purchase'));
const AnalyticsActivity = require(path.join(GAME_SERVER, 'models', 'analyticsActivity'));
const AnalyticsPurge = require(path.join(GAME_SERVER, 'models', 'analyticsPurge'));
const AnalyticsPlayer = require(path.join(GAME_SERVER, 'models', 'analyticsPlayer'));
const AnalyticsPageview = require(path.join(GAME_SERVER, 'models', 'analyticsPageview'));
const { dayKeyUTC } = require(path.join(GAME_SERVER, 'utils', 'analytics'));

const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));
// Stringified player ids live in the analytics collections. They are normally
// 24-hex ObjectIds, but a stray non-ObjectId value must never crash a whole
// endpoint: `new ObjectId('dev')` throws. Filter to valid 24-hex ids before
// casting so one bad row is simply ignored. NEVER ids.map(toObjectId).
const HEX24 = /^[0-9a-fA-F]{24}$/;
const toObjectIds = (ids) => [...ids].filter((id) => HEX24.test(String(id))).map(toObjectId);

// ---- Sharing controls (env-driven; all unset -> frictionless local mode) ----
const AUTH_USER = process.env.ANALYTICS_USER || '';
const AUTH_PASS = process.env.ANALYTICS_PASS || '';
const AUTH_ON = !!(AUTH_USER && AUTH_PASS);
const HIDE_PII = /^(1|true|yes|on)$/i.test(process.env.ANALYTICS_HIDE_PII || '');

// HTTP Basic auth. Returns true when no auth is configured (local) or the
// supplied credentials match. Constant-time compare.
function safeEqual(a, b) {
  const ab = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
function checkAuth(req) {
  if (!AUTH_ON) return true;
  const m = /^Basic (.+)$/.exec(req.headers.authorization || '');
  if (!m) return false;
  let decoded = '';
  try { decoded = Buffer.from(m[1], 'base64').toString('utf8'); } catch { return false; }
  const i = decoded.indexOf(':');
  if (i < 0) return false;
  return safeEqual(decoded.slice(0, i), AUTH_USER) && safeEqual(decoded.slice(i + 1), AUTH_PASS);
}

// When HIDE_PII is on (shared build), strip per-user identifiers from the
// people lists: username -> a stable "Player ####" tag (last 4 of the id), and
// the per-user device/acquisition detail dropped. Aggregate charts unaffected.
function redactPerUser(row) {
  if (!HIDE_PII) return row;
  return { ...row, username: `Player ${String(row.playerId).slice(-4)}`, client_info: null, device: null, created_at: null };
}
const redactName = (playerId, username) => (HIDE_PII ? `Player ${String(playerId).slice(-4)}` : username);

const CLIENT_DIR = path.join(__dirname, 'client');
// Reuse the game's favicon so the dashboard tab matches the game.
const FAVICON_PATH = path.join(REPO, 'game-client', 'public', 'favicon.ico');
const RETENTION_NS = [1, 3, 7, 30]; // D1 / D3 / D7 / D30 (series keys d1/d3/d7/d30)
// Window for the rolling retention average. Wide enough to smooth single-cohort
// noise, short enough that a change you shipped still moves the line.
const ROLLING_WINDOW_DAYS = 14;

// ---- Forward-only instrumentation: where the data actually starts ----
// House pins go-live days as constants and bumps them per deploy. VVGame's
// recording all ships in ONE deploy, so instead of a constant the cutoff is
// READ FROM THE DATA: the earliest 'live' analytics_activity row (and, for the
// pageview series, the earliest analytics_pageview row). Before that day the
// flag/series must read as NO DATA (a gap), never as 0. Cached for 60s so every
// endpoint does not re-run the $min.
const startDayCache = { at: 0, activity: null, pageview: null };
async function startDays() {
  if (Date.now() - startDayCache.at < 60000) return startDayCache;
  const [act, pv] = await Promise.all([
    AnalyticsActivity.aggregate([{ $match: { source: 'live' } }, { $group: { _id: null, min: { $min: '$ts' } } }]),
    AnalyticsPageview.aggregate([{ $group: { _id: null, min: { $min: '$ts' } } }]),
  ]);
  startDayCache.activity = act.length ? act[0].min : null;   // an instant, bucketed per request tz
  startDayCache.pageview = pv.length ? pv[0].min : null;
  startDayCache.at = Date.now();
  return startDayCache;
}
// The live-activity start as a LOCAL day in the viewer's tz, or null when no
// live row exists yet (i.e. the recording deploy has not happened).
async function activityStartDay(tz) {
  const s = await startDays();
  return s.activity ? localDay(s.activity, tz) : null;
}
async function pageviewStartDay(tz) {
  const s = await startDays();
  return s.pageview ? localDay(s.pageview, tz) : null;
}

// ---- Tuning read once at boot ----
// FTUE steps drive the Engagement-tab funnel: each step becomes one row, in
// file order, keyed by its `step` number with the `trigger` as the label.
const FTUE_STEPS = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(GAME_SERVER, 'tuning', 'FTUEsteps.json'), 'utf8'))
      .map((s) => ({ step: s.step, trigger: s.trigger || `Step ${s.step}` }))
      .filter((s) => Number.isFinite(s.step))
      .sort((a, b) => a.step - b.step);
  } catch (err) {
    console.warn('[analytics] failed to load FTUEsteps.json:', err.message);
    return [];
  }
})();
// XP thresholds -> level, the same rule the client uses (Utils/playerManagement
// getDerivedLevel): level 1 at 0 xp, +1 for each threshold reached in order.
const XP_THRESHOLDS = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(GAME_SERVER, 'tuning', 'xpLevels.json'), 'utf8')).map((l) => l.xp);
  } catch (err) {
    console.warn('[analytics] failed to load xpLevels.json:', err.message);
    return [];
  }
})();
function levelOf(xp) {
  const v = Number(xp) || 0;
  let level = 1;
  for (let i = 0; i < XP_THRESHOLDS.length; i++) {
    if (v >= XP_THRESHOLDS[i]) level = i + 2; else break;
  }
  return level;
}
// Store offers, for labelling the purchases breakdown by title.
const STORE_OFFERS = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(GAME_SERVER, 'tuning', 'store.json'), 'utf8')); } catch { return []; }
})();
const offerTitle = (id) => { const o = STORE_OFFERS.find((x) => String(x.id) === String(id)); return o ? o.title : `Offer ${id}`; };
// Developer usernames (tuning/developerUsernames.json). Matched case-insensitively.
function developerUsernames() {
  try {
    return JSON.parse(fs.readFileSync(path.join(GAME_SERVER, 'tuning', 'developerUsernames.json'), 'utf8'))
      .map((n) => String(n).toLowerCase());
  } catch { return []; }
}

function parseArgs(argv) {
  const args = { port: 8771 };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--port') args.port = parseInt(argv[++i], 10);
    else if (argv[i] === '-h' || argv[i] === '--help') { printHelp(); process.exit(0); }
  }
  return args;
}
function printHelp() {
  console.log('Secrets of Elsinore Analytics Dashboard\n  node tools/analytics/server.js [--port 8771]');
}

// ---- Calendar-date string math (tz-independent: adds N days to a
// "YYYY-MM-DD" label; used to build the gap-filled day axis). ----
function addDays(dayStr, n) {
  const d = new Date(`${dayStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(from, to) {
  const out = [];
  for (let cur = from; cur <= to; cur = addDays(cur, 1)) out.push(cur);
  return out;
}
// Local-day string ("YYYY-MM-DD") of an instant in the given IANA timezone.
// Mirrors Mongo's $dateToString({date, timezone}) so server-side bucketing and
// JS-side comparisons agree. en-CA locale yields ISO YYYY-MM-DD.
function localDay(date, tz) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(date));
}
// $dateToString expression bucketing a date field into the viewer's local day.
const localDayExpr = (field, tz) => ({ $dateToString: { format: '%Y-%m-%d', date: field, timezone: tz } });

// Range from query params. The client sends `tz` (IANA) plus `start`/`end`
// (ISO instants = the viewer's local-day bounds) so all buckets land on the
// viewer's wall-clock day, not UTC. `from`/`to` are the local day-string
// labels for the gap-filled axis. Falls back to a UTC last-30-days window.
function rangeFrom(url) {
  const tz = url.searchParams.get('tz') || 'UTC';
  const today = localDay(new Date(), tz);
  const to = url.searchParams.get('to') || today;
  const from = url.searchParams.get('from') || addDays(to, -29);
  const start = url.searchParams.get('start')
    ? new Date(url.searchParams.get('start'))
    : new Date(`${from}T00:00:00.000Z`);
  const end = url.searchParams.get('end')
    ? new Date(url.searchParams.get('end'))
    : new Date(`${to}T23:59:59.999Z`);
  return { from, to, start, end, tz };
}

// ---- Exclusions ----
// playerIds for the developer allow-list: tuning/developerUsernames.json (case-
// insensitive) UNION players carrying isDeveloper:true (the old analytics route
// honoured it) UNION analytics_player usernames (so a dev who deleted their
// account is still recognized). Used by the Hide-Developers toggle to drop dev
// activity from the VIEW only; the underlying rows are never touched.
async function devPlayerIds() {
  const names = developerUsernames();
  const rx = names.map((n) => new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'));
  const q = rx.length ? { $or: [{ username: { $in: rx } }, { isDeveloper: true }] } : { isDeveloper: true };
  const [byPlayer, byAnalytics] = await Promise.all([
    Player.find(q, { _id: 1 }).lean(),
    rx.length ? AnalyticsPlayer.find({ username: { $in: rx } }, { _id: 1 }).lean() : [],
  ]);
  const ids = new Set();
  byPlayer.forEach((d) => ids.add(String(d._id)));
  byAnalytics.forEach((d) => ids.add(String(d._id)));
  return [...ids];
}

// ALWAYS-ON exclusions, applied on EVERY endpoint regardless of the toggle.
// Empty at launch: VVGame's test accounts are all in developerUsernames.json.
// Add a username here for a real account that is not an organic player (a
// friend, a payment-test account), a regex to ABUSE_USERNAME_RES for a
// multi-account farmer, and an _id to NON_PLAYER_IDS when the handle is
// ordinary-looking enough that a regex would swallow real players.
// See docs/analytics.md.
const NON_PLAYER_USERNAMES = [];
const ABUSE_USERNAME_RES = [];
const NON_PLAYER_IDS = [];

async function abuseExcludeIds() {
  const rx = [...ABUSE_USERNAME_RES, ...NON_PLAYER_USERNAMES.map((n) => new RegExp(`^${n}$`, 'i'))];
  const ids = new Set(NON_PLAYER_IDS);
  if (rx.length) {
    const q = { username: { $in: rx } };
    const [players, aplayers] = await Promise.all([
      Player.find(q, { _id: 1 }).lean(),
      AnalyticsPlayer.find(q, { _id: 1 }).lean(),
    ]);
    players.forEach((p) => ids.add(String(p._id)));
    aplayers.forEach((p) => ids.add(String(p._id)));
  }
  return [...ids];
}

// The exclude set for an endpoint: ALWAYS the abuse/non-player accounts, PLUS
// devs when the Hide-Developers toggle is on. Every endpoint routes through
// this so a new always-on exclusion lands everywhere in one place.
async function excludeFor(url) {
  const ids = new Set(await abuseExcludeIds());
  if (url.searchParams.get('hideDevs') === '1') {
    for (const id of await devPlayerIds()) ids.add(id);
  }
  return [...ids];
}
const exActQ = (excludeIds) => (excludeIds.length ? { playerId: { $nin: excludeIds } } : {});
const exApQ = (excludeIds) => (excludeIds.length ? { _id: { $nin: excludeIds } } : {});
const exPlQ = (excludeIds) => (excludeIds.length ? { _id: { $nin: toObjectIds(excludeIds) } } : {});

// Account-creation instant: `created` has a schema default and exists on every
// doc; `createdAt` (Mongoose timestamps) is missing on the oldest ones.
const CREATED_EXPR = { $ifNull: ['$created', { $ifNull: ['$createdAt', { $toDate: '$_id' }] }] };
const createdOf = (p) => p.created || p.createdAt || toObjectId(p._id).getTimestamp();

// ---- DAU + New Users, one row per LOCAL day, gaps filled with 0 ----
// DAU buckets activity by the local day of its timestamp and counts DISTINCT
// players: a player active across a UTC-midnight boundary has two stored
// (player, UTC-day) rows that can fall in the same local day.
async function dauSeries({ from, to, start, end, tz }, excludeIds = []) {
  const [act, nu] = await Promise.all([
    AnalyticsActivity.aggregate([
      { $match: { ts: { $gte: start, $lte: end }, ...exActQ(excludeIds) } },
      { $group: { _id: localDayExpr('$ts', tz), players: { $addToSet: '$playerId' } } },
      { $project: { n: { $size: '$players' } } },
    ]),
    AnalyticsPlayer.aggregate([
      { $match: { firstSeenAt: { $gte: start, $lte: end }, ...exApQ(excludeIds) } },
      { $group: { _id: localDayExpr('$firstSeenAt', tz), n: { $sum: 1 } } },
    ]),
  ]);
  const dauMap = Object.fromEntries(act.map((r) => [r._id, r.n]));
  const nuMap = Object.fromEntries(nu.map((r) => [r._id, r.n]));
  return daysBetween(from, to).map((day) => ({ day, dau: dauMap[day] || 0, newUsers: nuMap[day] || 0 }));
}

// ---- Engagement tab: the legacy "last seen" chart ----
// The retired Electron Analytics tab charted players.lastActive bucketed by day
// and called it DAU. lastActive is ONE overwritten timestamp per player, so the
// chart is really "players whose most recent visit was that day": a floor on
// activity, and the only signal that exists for days before the recording
// deploy. Kept under its honest name; the real DAU is on DAU & Retention.
async function lastSeenSeries({ from, to, start, end, tz }, excludeIds = []) {
  const rows = await Player.aggregate([
    { $match: { lastActive: { $gte: start, $lte: end }, ...exPlQ(excludeIds) } },
    { $group: { _id: localDayExpr('$lastActive', tz), n: { $sum: 1 } } },
  ]);
  const map = Object.fromEntries(rows.map((r) => [r._id, r.n]));
  return daysBetween(from, to).map((day) => ({ day, lastSeen: map[day] || 0 }));
}

// ---- Headline traffic tiles (DAU & Retention tab) ----
async function trafficMetrics({ tz }, excludeIds = []) {
  const today = localDay(new Date(), tz);
  const yesterday = addDays(today, -1);
  const weekAgo = addDays(yesterday, -7);
  const since = new Date(Date.now() - 12 * 24 * 60 * 60 * 1000); // buffer past weekAgo
  const [total_accounts, dauRows, golds] = await Promise.all([
    Player.countDocuments(exPlQ(excludeIds)),
    AnalyticsActivity.aggregate([
      { $match: { ts: { $gte: since }, ...exActQ(excludeIds) } },
      { $group: { _id: localDayExpr('$ts', tz), players: { $addToSet: '$playerId' } } },
      { $project: { n: { $size: '$players' } } },
    ]),
    Player.find({ accountStatus: 'Gold', ...exPlQ(excludeIds) }, { _id: 1 }).lean(),
  ]);
  const dauByDay = Object.fromEntries(dauRows.map((r) => [r._id, r.n]));
  const goldIds = golds.map((s) => String(s._id));
  const goldRows = goldIds.length ? await AnalyticsActivity.aggregate([
    { $match: { ts: { $gte: since }, playerId: { $in: goldIds } } },
    { $group: { _id: localDayExpr('$ts', tz), players: { $addToSet: '$playerId' } } },
    { $project: { n: { $size: '$players' } } },
  ]) : [];
  const goldByDay = Object.fromEntries(goldRows.map((r) => [r._id, r.n]));
  const delta = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);
  const dauY = dauByDay[yesterday] || 0, dauW = dauByDay[weekAgo] || 0;
  const subY = goldByDay[yesterday] || 0, subW = goldByDay[weekAgo] || 0;
  return {
    total_accounts,
    dau_yesterday: dauY, dau_week_ago: dauW, dau_delta_pct: delta(dauY, dauW),
    sub_dau_yesterday: subY, sub_dau_week_ago: subW, sub_dau_delta_pct: delta(subY, subW),
    yesterday, week_ago: weekAgo,
    activity_start_day: await activityStartDay(tz),
  };
}

// ---- Site Traffic (its own tab): the PageView -> AccountCreation funnel ----
// Series per local day: raw page views + unique visitors (analytics_pageview,
// written by the anonymous landing beacon) and accounts created (new users,
// analytics_player). Conversion = accounts / UNIQUE NEW VISITORS. Pageviews
// are anonymous, so Hide-Developers CANNOT filter the view side (the beacon
// skips localhost, which removes most dev traffic); the accounts side uses the
// standard exclusions. View series is forward-only: days before the first
// pageview row return null -> the chart draws a gap, not zeros.
async function siteTrafficForRange({ from, to, start, end, tz }, excludeIds = []) {
  const exPl = exApQ(excludeIds);
  const PV_START = await pageviewStartDay(tz);
  const today = localDay(new Date(), tz);
  const yesterday = addDays(today, -1);
  const weekAgo = addDays(yesterday, -7);
  const tileSince = new Date(Date.now() - 12 * 24 * 60 * 60 * 1000);
  const [pvRange, pvTiles, nuRange, nuTiles, newVisRows] = await Promise.all([
    AnalyticsPageview.aggregate([
      { $match: { ts: { $gte: start, $lte: end } } },
      { $group: { _id: localDayExpr('$ts', tz), views: { $sum: '$views' }, visitors: { $addToSet: '$visitor_id' } } },
      { $project: { views: 1, visitors: { $size: '$visitors' } } },
    ]),
    AnalyticsPageview.aggregate([
      { $match: { ts: { $gte: tileSince } } },
      { $group: { _id: localDayExpr('$ts', tz), views: { $sum: '$views' }, visitors: { $addToSet: '$visitor_id' } } },
      { $project: { views: 1, visitors: { $size: '$visitors' } } },
    ]),
    AnalyticsPlayer.aggregate([
      { $match: { firstSeenAt: { $gte: start, $lte: end }, ...exPl } },
      { $group: { _id: localDayExpr('$firstSeenAt', tz), n: { $sum: 1 } } },
    ]),
    AnalyticsPlayer.aggregate([
      { $match: { firstSeenAt: { $gte: tileSince }, ...exPl } },
      { $group: { _id: localDayExpr('$firstSeenAt', tz), n: { $sum: 1 } } },
    ]),
    // NEW VISITORS per local day: a visitor_id whose FIRST-EVER pageview falls
    // on that day, ranked over the WHOLE collection (no range $match first).
    AnalyticsPageview.aggregate([
      { $group: { _id: '$visitor_id', first: { $min: '$ts' } } },
      { $project: { day: localDayExpr('$first', tz) } },
    ]),
  ]);

  // COHORT CONVERSION: of the visitors who first arrived on day D, how many
  // created an account on day D. Same population both sides, so <= 100%.
  // The join runs through players.client_info.visitor_id, which dies with the
  // player doc; `accounts` (raw signups) is returned alongside for contrast.
  const convFrom = new Date(Math.min(start.getTime(), tileSince.getTime()));
  const apRows = await AnalyticsPlayer.find(
    { firstSeenAt: { $gte: convFrom, $lte: end }, ...exPl }, { _id: 1, firstSeenAt: 1 },
  ).lean();
  const acctDayById = new Map(apRows.map((r) => [String(r._id), localDay(r.firstSeenAt, tz)]));
  const vidRows = await Player.find(
    { _id: { $in: toObjectIds([...acctDayById.keys()]) }, 'client_info.visitor_id': { $ne: null } },
    { _id: 1, 'client_info.visitor_id': 1 },
  ).lean();
  const firstDayByVisitor = new Map(newVisRows.map((r) => [String(r._id), r.day]));
  const convertedByDay = new Map();
  for (const p of vidRows) {
    const acctDay = acctDayById.get(String(p._id));
    const vFirst = firstDayByVisitor.get(String(p.client_info.visitor_id));
    if (acctDay && vFirst === acctDay) convertedByDay.set(acctDay, (convertedByDay.get(acctDay) || 0) + 1);
  }
  // Visits by source (per-visit attribution): one row per (visitor, day).
  // NEW = the visitor's first-ever pageview row; ALL adds returning visits.
  const pvSourceRows = await AnalyticsPageview.aggregate([
    { $setWindowFields: { partitionBy: '$visitor_id', sortBy: { ts: 1 }, output: { seq: { $documentNumber: {} } } } },
    { $match: { ts: { $gte: start, $lte: end } } },
    { $group: {
      _id: { day: localDayExpr('$ts', tz), utm: '$utm_source', ref: '$referrer_host', src: '$source', isNew: { $eq: ['$seq', 1] } },
      n: { $sum: 1 },
    } },
  ]);
  const srcTotals = new Map();
  const srcByDay = { all: new Map(), new: new Map() };
  for (const r of pvSourceRows) {
    // SAME PRECEDENCE AS resolveSource() on the account side: surface (when not
    // plain web), then utm_source, then referrer host, then plain web.
    const surface = normalizeSource(r._id.src);
    const key = (surface && surface !== 'web' ? surface : null)
      || normalizeSource(r._id.utm) || sourceFromReferrer(r._id.ref) || 'web';
    const day = r._id.day;
    for (const mode of r._id.isNew ? ['all', 'new'] : ['all']) {
      if (!srcByDay[mode].has(day)) srcByDay[mode].set(day, new Map());
      const m = srcByDay[mode].get(day);
      m.set(key, (m.get(key) || 0) + r.n);
    }
    srcTotals.set(key, (srcTotals.get(key) || 0) + r.n);
  }
  const visitSources = [...srcTotals.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  const pre = (day) => !PV_START || day < PV_START;
  const bySourceSeries = (mode) => daysBetween(from, to).map((day) => {
    const m = srcByDay[mode].get(day);
    const row = { day };
    visitSources.forEach((s) => { row[s] = pre(day) ? null : ((m && m.get(s)) || 0); });
    return row;
  });

  const pvBy = Object.fromEntries(pvRange.map((r) => [r._id, r]));
  const pvTBy = Object.fromEntries(pvTiles.map((r) => [r._id, r]));
  const nuBy = Object.fromEntries(nuRange.map((r) => [r._id, r.n]));
  const nuTBy = Object.fromEntries(nuTiles.map((r) => [r._id, r.n]));
  const newVisBy = {};
  newVisRows.forEach((r) => { newVisBy[r.day] = (newVisBy[r.day] || 0) + 1; });

  const series = daysBetween(from, to).map((day) => {
    const p = pvBy[day];
    return {
      day,
      views: pre(day) ? null : (p ? p.views : 0),
      visitors: pre(day) ? null : (p ? p.visitors : 0),
      new_visitors: pre(day) ? null : (newVisBy[day] || 0),
      accounts: nuBy[day] || 0,
      converted: pre(day) ? null : (convertedByDay.get(day) || 0),
    };
  });
  const tile = (day) => {
    const p = pvTBy[day] || { views: 0, visitors: 0 };
    const newVisitors = newVisBy[day] || 0;
    const accounts = nuTBy[day] || 0;
    const converted = convertedByDay.get(day) || 0;
    const conversion = newVisitors > 0 ? Math.round((accounts / newVisitors) * 1000) / 10 : null;
    const conversion_cohort = newVisitors > 0 ? Math.round((converted / newVisitors) * 1000) / 10 : null;
    return { views: p.views, visitors: p.visitors, new_visitors: newVisitors, accounts, converted, conversion, conversion_cohort };
  };
  const y = tile(yesterday);
  const w = tile(weekAgo);
  const delta = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);
  return {
    series,
    pageview_start_day: PV_START,
    visit_sources: visitSources,
    visits_by_source: bySourceSeries('all'),
    new_visits_by_source: bySourceSeries('new'),
    metrics: {
      yesterday, week_ago: weekAgo,
      views_yesterday: PV_START ? y.views : null, visitors_yesterday: PV_START ? y.visitors : null,
      views_delta_pct: delta(y.views, w.views),
      new_visitors_yesterday: PV_START ? y.new_visitors : null, new_visitors_delta_pct: delta(y.new_visitors, w.new_visitors),
      accounts_yesterday: y.accounts, accounts_delta_pct: delta(y.accounts, w.accounts),
      conversion_yesterday: y.conversion,
      conversion_cohort_yesterday: y.conversion_cohort,
      conversion_delta_pp: (y.conversion != null && w.conversion != null)
        ? Math.round((y.conversion - w.conversion) * 10) / 10 : null,
    },
  };
}

// ---- Source resolution (shared by Source charts, retention + FTUE filters) ----
function normalizeSource(s) {
  if (!s) return null;
  const k = String(s).toLowerCase().trim();
  const map = {
    fb: 'facebook', 'facebook in-app': 'facebook', 'm.facebook': 'facebook',
    ig: 'instagram', 'instagram in-app': 'instagram',
    tiktok: 'tiktok', 'tiktok in-app': 'tiktok',
    'google app': 'google', 'google-app': 'google',
    itch: 'itch.io',
    'reddit ads': 'redditads', reddit_ads: 'redditads', 'reddit-ads': 'redditads',
    email: 'email', newsletter: 'email', mail: 'email',
  };
  return map[k] || k;
}
function sourceFromReferrer(ref) {
  if (!ref) return null;
  const r = String(ref).toLowerCase();
  if (r.startsWith('android-app://') || r.startsWith('ios-app://')) {
    if (r.includes('reddit')) return 'reddit';
    if (r.includes('pinterest')) return 'pinterest';
    if (r.includes('facebook')) return 'facebook';
    if (r.includes('instagram')) return 'instagram';
    if (r.includes('tiktok') || r.includes('musically')) return 'tiktok';
    return null;
  }
  let host = r;
  try { host = new URL(r.includes('://') ? r : `https://${r}`).hostname.toLowerCase(); } catch { host = r; }
  if (/(?:^|\.)itch\.(io|zone)$/.test(host)) return 'itch.io';
  if (/(?:^|\.)pinterest\.|(?:^|\.)pin\.it$/.test(host)) return 'pinterest';
  if (/(?:^|\.)facebook\.|(?:^|\.)fb\.(com|me)$|(?:^|\.)fb\.watch$/.test(host)) return 'facebook';
  if (/(?:^|\.)instagram\./.test(host)) return 'instagram';
  if (/(?:^|\.)tiktok\./.test(host)) return 'tiktok';
  if (/(?:^|\.)reddit\.|(?:^|\.)redd\.it$/.test(host)) return 'reddit';
  if (/(?:^|\.)(twitter|x)\.com$|(?:^|\.)t\.co$/.test(host)) return 'twitter';
  if (/(?:^|\.)youtube\.|(?:^|\.)youtu\.be$/.test(host)) return 'youtube';
  if (/(?:^|\.)discord\.(com|gg)$/.test(host)) return 'discord';
  if (/(?:^|\.)google\./.test(host)) return 'google';
  if (/(?:^|\.)bing\.|(?:^|\.)duckduckgo\./.test(host)) return 'search';
  // The game's own domains are not a source (an in-site navigation).
  if (/valleyviewgame\.com$|secretsofelsinore\.com$|vvgame\.onrender\.com$/.test(host)) return null;
  return null;
}
// Best-available source for an account, in priority order:
//   1. explicit play surface (in-app browser / ?source= tag)   strong
//   2. utm_source from the landing URL
//   3. referrer host mapping
//   4. 'web'      telemetry fired, real browser, no channel signal
//   5. 'Unknown'  no client_info at all (every pre-deploy account)
function resolveSource(ci) {
  if (!ci || !ci.captured_at) return 'Unknown';
  const surface = normalizeSource(ci.surface);
  if (surface && surface !== 'web') return surface;
  const acq = ci.acquisition || {};
  const utm = normalizeSource(acq.utm_source);
  if (utm) return utm;
  const ref = sourceFromReferrer(acq.referrer_host);
  if (ref) return ref;
  if (surface === 'web') return 'web';
  return 'Unknown';
}

// ---- Source chart (DAU & Retention tab): per-day users split by source ----
// Returns three parallel daily series so the UI toggle flips with NO refetch:
//   all = DISTINCT active players that local day, by source
//   new = accounts whose first-seen instant is that local day, by source
//   returning = all minus new per cell
async function sourceForRange({ from, to, start, end, tz }, excludeIds = []) {
  const [actPairs, newPairs] = await Promise.all([
    AnalyticsActivity.aggregate([
      { $match: { ts: { $gte: start, $lte: end }, ...exActQ(excludeIds) } },
      { $group: { _id: { day: localDayExpr('$ts', tz), pid: '$playerId' } } },
    ]),
    AnalyticsPlayer.aggregate([
      { $match: { firstSeenAt: { $gte: start, $lte: end }, ...exApQ(excludeIds) } },
      { $group: { _id: { day: localDayExpr('$firstSeenAt', tz), pid: '$_id' } } },
    ]),
  ]);
  const allIds = new Set();
  actPairs.forEach((r) => allIds.add(r._id.pid));
  newPairs.forEach((r) => allIds.add(r._id.pid));
  const live = await Player.find({ _id: { $in: toObjectIds(allIds) } }, { _id: 1, client_info: 1 }).lean();
  const sourceById = Object.fromEntries(live.map((p) => [String(p._id), resolveSource(p.client_info)]));
  const srcOf = (pid) => sourceById[pid] || 'Unknown';
  const totals = new Map();
  const tally = (pairs) => {
    const byDay = new Map();
    for (const r of pairs) {
      const day = r._id.day;
      const src = srcOf(r._id.pid);
      if (!byDay.has(day)) byDay.set(day, new Map());
      const m = byDay.get(day);
      m.set(src, (m.get(src) || 0) + 1);
      totals.set(src, (totals.get(src) || 0) + 1);
    }
    return byDay;
  };
  const allByDay = tally(actPairs);
  const newByDay = tally(newPairs);
  const sources = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  const fill = (byDay) => daysBetween(from, to).map((day) => {
    const row = { day };
    const m = byDay.get(day);
    for (const s of sources) row[s] = (m && m.get(s)) || 0;
    return row;
  });
  const allFilled = fill(allByDay);
  const newFilled = fill(newByDay);
  const returningFilled = allFilled.map((row, i) => {
    const out = { day: row.day };
    for (const s of sources) out[s] = Math.max(0, (row[s] || 0) - (newFilled[i][s] || 0));
    return out;
  });
  return { sources, all: allFilled, new: newFilled, returning: returningFilled };
}

// ---- Classic exact-day D1/D3/D7/D30 retention, per join-day cohort ----
// DN = fraction of a day's new-user cohort active on EXACTLY day D+N. A
// cohort's DN is null ("n/a") when D+N is in the future, or the cohort joined
// before LIVE activity recording began (backfill rows are a DAU floor, not
// return data). `sources` optionally restricts the cohort by resolved source.
// `playedOnly` narrows the return test to rows with played:true; before the
// recording deploy that flag never existed, so any target day before the live
// start reports null, never 0.
async function retentionSeries({ from, to, start, end, tz }, excludeIds = [], sources = null, playedOnly = false) {
  const earliestActivityDay = await activityStartDay(tz);
  const today = localDay(new Date(), tz);
  const ap = await AnalyticsPlayer.find(
    { firstSeenAt: { $gte: start, $lte: end }, ...exApQ(excludeIds) }, { _id: 1, firstSeenAt: 1 },
  ).lean();
  const infoById = Object.fromEntries(
    (await Player.find({ _id: { $in: toObjectIds(ap.map((a) => a._id)) } }, { _id: 1, client_info: 1 }).lean())
      .map((p) => [String(p._id), p.client_info || null]),
  );
  let members = ap.map((a) => ({ id: String(a._id), day: localDay(a.firstSeenAt, tz), src: resolveSource(infoById[String(a._id)]) }));
  const srcTotals = new Map();
  members.forEach((m) => srcTotals.set(m.src, (srcTotals.get(m.src) || 0) + 1));
  const available_sources = [...srcTotals.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  if (sources) members = members.filter((m) => sources.has(m.src));
  const byDay = new Map();
  for (const m of members) {
    if (!byDay.has(m.day)) byDay.set(m.day, []);
    byDay.get(m.day).push(m.id);
  }
  const cohorts = [...byDay.entries()].map(([day, players]) => ({ _id: day, players, size: players.length }))
    .sort((a, b) => a._id.localeCompare(b._id));
  if (cohorts.length === 0) return { cohorts: [], available_sources };

  const allPlayers = [...new Set(cohorts.flatMap((c) => c.players))];
  const probeEnd = new Date(end.getTime() + (Math.max(...RETENTION_NS) + 1) * 86400000);
  const actQ = { playerId: { $in: allPlayers }, ts: { $gte: start, $lte: probeEnd } };
  if (playedOnly) actQ.played = true;
  const acts = await AnalyticsActivity.find(actQ, { playerId: 1, ts: 1, _id: 0 }).lean();
  const activeSet = new Set(acts.map((a) => `${a.playerId}:${localDay(a.ts, tz)}`));

  const rows = cohorts.map((c) => {
    const cohortDay = c._id;
    const hasData = earliestActivityDay && cohortDay >= earliestActivityDay;
    const row = { cohortDay, cohortSize: c.size };
    RETENTION_NS.forEach((n) => {
      const target = addDays(cohortDay, n);
      // `>= today`: the target day must be COMPLETE, or the newest cohort reads
      // artificially low. Played mode also needs the target on/after go-live.
      if (!hasData || target >= today || (playedOnly && (!earliestActivityDay || target < earliestActivityDay))) {
        row[`d${n}`] = null; row[`c${n}`] = null; return;
      }
      let count = 0;
      for (const pid of c.players) if (activeSet.has(`${pid}:${target}`)) count++;
      row[`d${n}`] = c.size ? count / c.size : 0;
      row[`c${n}`] = count;
    });
    return row;
  });
  return { cohorts: rows, available_sources };
}

// ---- Cumulative + rolling average retention across cohorts ----
// POOLED (sum(returners) / sum(cohortSize)), not a mean of rates. Cohorts are
// ranked over ALL TIME. The rolling view truncates each lag where it stops
// being fresh (addDays(day, n) >= today), see House's notes on the scissor
// effect; the cumulative view is deliberately exempt.
async function retentionAvgSeries({ from, to, end, tz }, excludeIds = [], sources = null, playedOnly = false) {
  const allTime = { from, to, start: new Date('2020-01-01T00:00:00.000Z'), end, tz };
  const { cohorts } = await retentionSeries(allTime, excludeIds, sources, playedOnly);
  const sorted = [...cohorts].sort((a, b) => a.cohortDay.localeCompare(b.cohortDay));
  const today = localDay(new Date(), tz);
  const build = (windowDays) => daysBetween(from, to).map((day) => {
    const lo = windowDays ? addDays(day, -(windowDays - 1)) : null;
    const row = { day };
    RETENTION_NS.forEach((n) => {
      if (windowDays && addDays(day, n) >= today) {
        row[`d${n}`] = null; row[`pop${n}`] = 0;
        if (n === RETENTION_NS[0]) row.cohorts = 0;
        return;
      }
      let returners = 0, population = 0, cohortCount = 0;
      for (const c of sorted) {
        if (c.cohortDay > day) break;
        if (lo && c.cohortDay < lo) continue;
        if (c[`d${n}`] == null) continue;
        returners += c[`c${n}`] || 0;
        population += c.cohortSize || 0;
        cohortCount++;
      }
      row[`d${n}`] = population > 0 ? returners / population : null;
      if (n === RETENTION_NS[0]) row.cohorts = cohortCount;
      row[`pop${n}`] = population;
    });
    return row;
  });
  return { series: build(null), rolling: build(ROLLING_WINDOW_DAYS) };
}

// ---- Per-user detail carried on Users-tab rows (hover popover) ----
// VVGame's device info lives in ftueFeedback (captured at signup); acquisition
// in client_info (new accounts only). Both are returned so the popover can show
// whichever exists.
function deviceOf(p) {
  const f = p.ftueFeedback || {};
  return {
    browser: f.browser || null, os: f.os || null, is_mobile: f.isMobile ?? null,
    timezone: f.timezone || null, screen: (f.screenWidth && f.screenHeight) ? `${f.screenWidth}x${f.screenHeight}` : null,
    latency_ms: Number.isFinite(f.latency) && f.latency >= 0 ? f.latency : null,
    connection: f.connectionType || null,
  };
}
const PLAYER_ROW_FIELDS = { username: 1, accountStatus: 1, client_info: 1, ftueFeedback: 1, created: 1, createdAt: 1, language: 1 };

// ---- Users tab: the actual people active in a time window ----
async function activeUsers(start, end, excludeIds = []) {
  const q = { ts: { $gte: new Date(start), $lte: new Date(end) } };
  if (excludeIds.length) q.playerId = { $nin: excludeIds };
  const acts = await AnalyticsActivity.find(q, { playerId: 1, ts: 1, played: 1, _id: 0 }).sort({ ts: -1 }).lean();
  const ids = acts.map((a) => a.playerId);
  const [players, aplayers] = await Promise.all([
    Player.find({ _id: { $in: toObjectIds(ids) } }, PLAYER_ROW_FIELDS).lean(),
    AnalyticsPlayer.find({ _id: { $in: ids } }, { username: 1 }).lean(),
  ]);
  const live = Object.fromEntries(players.map((p) => [String(p._id), p]));
  const lastName = Object.fromEntries(aplayers.map((p) => [String(p._id), p.username]));
  return {
    users: acts.map((a) => {
      const p = live[a.playerId];
      return redactPerUser({
        username: (p && p.username) || lastName[a.playerId] || null,
        deleted: !p,
        subscribed: !!p && p.accountStatus === 'Gold',
        played: !!a.played,
        playerId: a.playerId,
        ts: a.ts,
        client_info: p ? (p.client_info || null) : null,
        device: p ? deviceOf(p) : null,
        created_at: p ? createdOf(p) : null,
      });
    }),
  };
}

// ---- Users tab middle column: accounts EXCLUDED from every other number ----
async function ignoredUsers(hideDevs) {
  const rxOf = (n) => new RegExp(`^${String(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  const npRx = NON_PLAYER_USERNAMES.map(rxOf);
  const devNames = developerUsernames();
  const devRx = devNames.map(rxOf);
  const orRx = [...npRx, ...devRx, ...ABUSE_USERNAME_RES];
  const [players, aplayers, flagged, idPlayers, idAplayers] = await Promise.all([
    orRx.length ? Player.find({ username: { $in: orRx } }, { username: 1 }).lean() : [],
    orRx.length ? AnalyticsPlayer.find({ username: { $in: orRx } }, { username: 1 }).lean() : [],
    Player.find({ isDeveloper: true }, { username: 1 }).lean(),
    NON_PLAYER_IDS.length ? Player.find({ _id: { $in: toObjectIds(NON_PLAYER_IDS) } }, { username: 1 }).lean() : [],
    NON_PLAYER_IDS.length ? AnalyticsPlayer.find({ _id: { $in: NON_PLAYER_IDS } }, { username: 1 }).lean() : [],
  ]);
  const livePlayerIds = new Set([...players, ...flagged, ...idPlayers].map((p) => String(p._id)));
  const seen = new Map();
  const add = (id, username, reason) => {
    if (!seen.has(String(id))) seen.set(String(id), { username: username || null, reason });
    else if (!seen.get(String(id)).username) seen.get(String(id)).username = username || null;
  };
  const reasonFor = (name) => {
    if (!name) return null;
    if (npRx.some((r) => r.test(name))) return 'non-player';
    if (ABUSE_USERNAME_RES.some((r) => r.test(name))) return 'abuse-farmer';
    if (devRx.some((r) => r.test(name))) return 'developer';
    return null;
  };
  NON_PLAYER_IDS.forEach((id) => add(id, null, 'non-player'));
  [...idPlayers, ...idAplayers].forEach((p) => add(p._id, p.username, 'non-player'));
  [...players, ...aplayers].forEach((p) => { const r = reasonFor(p.username); if (r && r !== 'developer') add(p._id, p.username, r); });
  [...players, ...aplayers].forEach((p) => { if (reasonFor(p.username) === 'developer') add(p._id, p.username, 'developer'); });
  flagged.forEach((p) => add(p._id, p.username, 'developer'));   // isDeveloper:true on the doc

  const byName = new Map();
  for (const [playerId, v] of seen) {
    const live = livePlayerIds.has(playerId);
    const key = String(v.username || `\u0000${playerId}`).toLowerCase();
    let row = byName.get(key);
    if (!row) { row = { username: v.username, reason: v.reason, accounts: 0, deleted_accounts: 0, playerId, no_account: false }; byName.set(key, row); }
    row.accounts += 1;
    if (live) { row.playerId = playerId; if (v.username) row.username = v.username; }
    else row.deleted_accounts += 1;
  }
  const rows = [...byName.values()].map((r) => redactPerUser({
    ...r, deleted: r.deleted_accounts === r.accounts, applied: r.reason !== 'developer' || hideDevs,
  }));
  const haveNames = new Set(rows.map((r) => String(r.username || '').toLowerCase()));
  devNames.filter((n) => !haveNames.has(n)).forEach((n) => rows.push({
    playerId: null, username: n, reason: 'developer', accounts: 0, deleted_accounts: 0, deleted: false, no_account: true, applied: hideDevs,
  }));
  const ORDER = { 'non-player': 0, 'abuse-farmer': 1, developer: 2 };
  rows.sort((a, b) => (ORDER[a.reason] - ORDER[b.reason])
    || String(a.username || '').localeCompare(String(b.username || ''), undefined, { sensitivity: 'base' }));
  return { rows, hide_devs: hideDevs, counts: rows.reduce((m, r) => { m[r.reason] = (m[r.reason] || 0) + 1; return m; }, {}) };
}

// ---- Users tab right side: all new accounts in [from, to] ----
async function newAccountsInRange({ start, end }, excludeIds = []) {
  const q = { firstSeenAt: { $gte: start, $lte: end } };
  if (excludeIds.length) q._id = { $nin: excludeIds };
  const rows = await AnalyticsPlayer.find(q, { firstSeenAt: 1, firstSeenDay: 1, username: 1 }).sort({ firstSeenAt: -1 }).lean();
  const live = await Player.find({ _id: { $in: toObjectIds(rows.map((r) => r._id)) } }, PLAYER_ROW_FIELDS).lean();
  const liveBy = Object.fromEntries(live.map((p) => [String(p._id), p]));
  return {
    accounts: rows.map((r) => {
      const p = liveBy[r._id];
      return redactPerUser({
        playerId: r._id,
        username: (p && p.username) || r.username || null,
        firstSeenAt: r.firstSeenAt, firstSeenDay: r.firstSeenDay,
        deleted: !p,
        subscribed: !!p && p.accountStatus === 'Gold',
        client_info: p ? (p.client_info || null) : null,
        device: p ? deviceOf(p) : null,
        created_at: p ? createdOf(p) : null,
      });
    }),
  };
}

// ---- Users tab: the players table (live players collection) ----
// One row per CURRENT account: created, last active, level (derived from xp the
// way the client does), xp, net worth, FTUE step, Home Deed (settlementId set
// at purchase), Gold. Sorted most-recently-active first. Capped at 2000 rows.
async function playersTable(excludeIds = []) {
  const rows = await Player.find(exPlQ(excludeIds), {
    username: 1, created: 1, createdAt: 1, lastActive: 1, xp: 1, netWorth: 1, ftuestep: 1, firsttimeuser: 1,
    aspiration: 1, settlementId: 1, accountStatus: 1, language: 1, ftueFeedback: 1, client_info: 1,
  }).sort({ lastActive: -1 }).limit(2000).lean();
  return {
    total: rows.length,
    players: rows.map((p) => redactPerUser({
      playerId: String(p._id),
      username: p.username || null,
      created_at: createdOf(p),
      last_active: p.lastActive || null,
      level: levelOf(p.xp), xp: p.xp || 0,
      net_worth: Number.isFinite(p.netWorth) ? p.netWorth : null,
      ftue_step: p.ftuestep ?? null,
      in_ftue: p.firsttimeuser === true,
      aspiration: p.aspiration ?? null,
      home_deed: !!p.settlementId,
      subscribed: p.accountStatus === 'Gold',
      language: p.language || null,
      source: resolveSource(p.client_info),
      device: deviceOf(p),
      client_info: p.client_info || null,
    })),
  };
}

// ---- Engagement: the FTUE funnel (re-implemented from the retired
// /api/analytics/ftue-analytics, against Mongo directly) ----
// Cohort = players CREATED in the range (players.created), dev-excluded. The
// server returns one lightweight row per player (ftue state + the device fields
// the old filters used); the CLIENT computes the cumulative funnel from the
// rows it has filtered, exactly as the retired editor did, so the filter chips
// and the bars can never disagree. Step rows come from tuning/FTUEsteps.json.
//   "reached step i" = ftuestep >= i OR completed; completed = firsttimeuser false.
// A player with ftuestep null and firsttimeuser false predates the step counter
// (legacy account) and is counted as completed, as the old route did.
async function ftueFunnelForRange({ start, end }, excludeIds = []) {
  const rows = await Player.aggregate([
    { $addFields: { created_at: CREATED_EXPR } },
    { $match: { created_at: { $gte: start, $lte: end }, ...exPlQ(excludeIds) } },
    { $project: {
      username: 1, named: 1, firsttimeuser: 1, ftuestep: 1, aspiration: 1, created_at: 1, lastActive: 1, language: 1,
      settlementId: 1, client_info: 1,
      'ftueFeedback.os': 1, 'ftueFeedback.browser': 1, 'ftueFeedback.timezone': 1, 'ftueFeedback.isMobile': 1,
    } },
    { $sort: { created_at: -1 } },
  ]);
  // Silent accounts purged for bouncing in the cave are gone from `players`; their count comes from
  // the purge log (utils/purgeUnnamed.js), by purge day, so the funnel can say what it no longer sees.
  const purged = await AnalyticsPurge.aggregate([
    { $match: { ts: { $gte: start, $lte: end } } },
    { $group: { _id: null, count: { $sum: '$count' } } },
  ]);
  return {
    steps: FTUE_STEPS,
    cohort_total: rows.length,
    purged_unnamed: purged.length ? purged[0].count : 0,
    players: rows.map((p) => redactPerUser({
      playerId: String(p._id),
      username: p.username || null,
      named: p.named !== false,
      completed: p.firsttimeuser === false || p.firsttimeuser === undefined,
      ftue_step: Number.isFinite(p.ftuestep) ? p.ftuestep : null,
      aspiration: p.aspiration ?? null,
      home_deed: !!p.settlementId,
      created_at: p.created_at,
      last_active: p.lastActive || null,
      language: p.language || null,
      os: (p.ftueFeedback && p.ftueFeedback.os) || null,
      browser: (p.ftueFeedback && p.ftueFeedback.browser) || null,
      timezone: (p.ftueFeedback && p.ftueFeedback.timezone) || null,
      is_mobile: p.ftueFeedback ? (p.ftueFeedback.isMobile ?? null) : null,
      source: resolveSource(p.client_info),
    })),
  };
}

// ---- Engagement: Home Deed ----
// settlementId is set when the Home Deed is bought (worldRoutes create-homestead)
// but carries no timestamp, so two cuts: (a) per signup-day cohort, how many of
// that day's new accounts have a deed today; (b) per day, deeds BOUGHT, from the
// 'Homesteader' trophy's timestamp (awarded at the same purchase). Trophies can
// be cleared by a season reset, so (b) is a floor; (a) is exact for live docs.
async function homeDeedForRange({ from, to, start, end, tz }, excludeIds = []) {
  const [cohort, bought, totals] = await Promise.all([
    Player.aggregate([
      { $addFields: { created_at: CREATED_EXPR } },
      { $match: { created_at: { $gte: start, $lte: end }, ...exPlQ(excludeIds) } },
      { $group: { _id: localDayExpr('$created_at', tz), accounts: { $sum: 1 },
        deeds: { $sum: { $cond: [{ $ifNull: ['$settlementId', false] }, 1, 0] } } } },
    ]),
    Player.aggregate([
      { $match: { 'trophies.name': 'Homesteader', ...exPlQ(excludeIds) } },
      { $unwind: '$trophies' },
      { $match: { 'trophies.name': 'Homesteader', 'trophies.timestamp': { $gte: start, $lte: end } } },
      { $group: { _id: localDayExpr('$trophies.timestamp', tz), n: { $sum: 1 } } },
    ]),
    Player.aggregate([
      { $match: exPlQ(excludeIds) },
      { $group: { _id: null, accounts: { $sum: 1 }, deeds: { $sum: { $cond: [{ $ifNull: ['$settlementId', false] }, 1, 0] } } } },
    ]),
  ]);
  const cBy = Object.fromEntries(cohort.map((r) => [r._id, r]));
  const bBy = Object.fromEntries(bought.map((r) => [r._id, r.n]));
  return {
    series: daysBetween(from, to).map((day) => ({
      day, accounts: cBy[day] ? cBy[day].accounts : 0, deeds: cBy[day] ? cBy[day].deeds : 0, bought: bBy[day] || 0,
    })),
    lifetime: totals.length ? { accounts: totals[0].accounts, deeds: totals[0].deeds } : { accounts: 0, deeds: 0 },
  };
}

// ---- Engagement: quests completed per day ----
// completedQuests[].timestamp is a Number (ms since epoch) written by the client
// at turn-in (NPCsPanel -> /update-profile). Entries without a numeric timestamp
// are skipped (not bucketed to a fake day). Also returns the top quests turned
// in during the range, for the "what are people doing" read.
async function questsForRange({ from, to, start, end, tz }, excludeIds = []) {
  const base = [
    { $match: { 'completedQuests.0': { $exists: true }, ...exPlQ(excludeIds) } },
    { $unwind: '$completedQuests' },
    { $match: { 'completedQuests.timestamp': { $type: 'number', $gte: start.getTime(), $lte: end.getTime() } } },
    { $addFields: { qts: { $toDate: '$completedQuests.timestamp' } } },
  ];
  const [perDay, top] = await Promise.all([
    Player.aggregate([...base,
      { $group: { _id: localDayExpr('$qts', tz), n: { $sum: 1 }, players: { $addToSet: '$_id' } } },
      { $project: { n: 1, players: { $size: '$players' } } },
    ]),
    Player.aggregate([...base,
      { $group: { _id: '$completedQuests.questId', n: { $sum: 1 } } },
      { $sort: { n: -1 } }, { $limit: 15 },
    ]),
  ]);
  const by = Object.fromEntries(perDay.map((r) => [r._id, r]));
  return {
    series: daysBetween(from, to).map((day) => ({ day, completed: by[day] ? by[day].n : 0, players: by[day] ? by[day].players : 0 })),
    top: top.map((r) => ({ quest: r._id || '(unnamed)', count: r.n })),
  };
}

// ---- Engagement: trophies earned per day + the most-earned trophies ----
async function trophiesForRange({ from, to, start, end, tz }, excludeIds = []) {
  const base = [
    { $match: { 'trophies.0': { $exists: true }, ...exPlQ(excludeIds) } },
    { $unwind: '$trophies' },
    { $match: { 'trophies.timestamp': { $gte: start, $lte: end } } },
  ];
  const [perDay, top] = await Promise.all([
    Player.aggregate([...base, { $group: { _id: localDayExpr('$trophies.timestamp', tz), n: { $sum: 1 } } }]),
    Player.aggregate([...base, { $group: { _id: '$trophies.name', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 15 }]),
  ]);
  const by = Object.fromEntries(perDay.map((r) => [r._id, r.n]));
  return {
    series: daysBetween(from, to).map((day) => ({ day, earned: by[day] || 0 })),
    top: top.map((r) => ({ trophy: r._id || '(unnamed)', count: r.n })),
  };
}

// ---- Engagement: grids visited distribution (lifetime) ----
// gridsVisited is a 512-byte bitfield (4096 grid flags). Popcount per player,
// bucketed. Lifetime, not range-scoped: the bitfield carries no timestamps.
const GRID_BUCKETS = [[0, 0, '0'], [1, 5, '1-5'], [6, 10, '6-10'], [11, 20, '11-20'], [21, 50, '21-50'], [51, 100, '51-100'], [101, Infinity, '100+']];
function popcount(buf) {
  if (!buf) return 0;
  const b = Buffer.isBuffer(buf) ? buf : (buf.buffer ? Buffer.from(buf.buffer) : Buffer.from(buf));
  let n = 0;
  for (let i = 0; i < b.length; i++) { let v = b[i]; while (v) { v &= v - 1; n++; } }
  return n;
}
async function gridsVisitedStats(excludeIds = []) {
  const rows = await Player.find(exPlQ(excludeIds), { gridsVisited: 1, firsttimeuser: 1 }).lean();
  const counts = GRID_BUCKETS.map(() => 0);
  let total = 0, sum = 0, max = 0;
  const values = [];
  for (const p of rows) {
    const n = popcount(p.gridsVisited);
    values.push(n); total++; sum += n; if (n > max) max = n;
    const i = GRID_BUCKETS.findIndex(([lo, hi]) => n >= lo && n <= hi);
    if (i >= 0) counts[i]++;
  }
  values.sort((a, b) => a - b);
  const median = values.length ? values[Math.floor(values.length / 2)] : 0;
  return {
    total, mean: total ? Math.round((sum / total) * 10) / 10 : 0, median, max,
    buckets: GRID_BUCKETS.map(([, , label], i) => ({ bucket: label, count: counts[i] })),
  };
}

// ---- Engagement: per-day activity flags from analytics_activity ----
// Of the players active each local day: how many PLAYED (harvest/craft write),
// turned in a quest, bought something, and how many grids were entered. All
// forward-only: days before the first live row return null -> a gap, not 0.
async function activityFlagsForRange({ from, to, start, end, tz }, excludeIds = []) {
  const startDay = await activityStartDay(tz);
  const rows = await AnalyticsActivity.aggregate([
    { $match: { ts: { $gte: start, $lte: end }, source: 'live', ...exActQ(excludeIds) } },
    { $group: {
      _id: { day: localDayExpr('$ts', tz), pid: '$playerId' },
      played: { $max: { $cond: ['$played', 1, 0] } },
      quest: { $max: { $cond: ['$quest_completed', 1, 0] } },
      purchase: { $max: { $cond: ['$purchase', 1, 0] } },
      moves: { $sum: { $ifNull: ['$grids_entered', 0] } },
    } },
    { $group: {
      _id: '$_id.day', dau: { $sum: 1 }, played: { $sum: '$played' }, quest: { $sum: '$quest' },
      purchase: { $sum: '$purchase' }, moves: { $sum: '$moves' }, movers: { $sum: { $cond: [{ $gt: ['$moves', 0] }, 1, 0] } },
    } },
  ]);
  const by = Object.fromEntries(rows.map((r) => [r._id, r]));
  return {
    start_day: startDay,
    series: daysBetween(from, to).map((day) => {
      if (!startDay || day < startDay) return { day, dau: null, played: null, quest: null, purchase: null, moves: null, movers: null };
      const r = by[day] || {};
      return { day, dau: r.dau || 0, played: r.played || 0, quest: r.quest || 0, purchase: r.purchase || 0, moves: r.moves || 0, movers: r.movers || 0 };
    }),
  };
}

// ---- Events tab: the season log (frontiers.seasonlog) ----
// One row per finished season, newest first, with its top-3 by net worth. Not
// range-scoped: a season is ~3 months and the whole log is a few dozen rows.
async function seasonLog(excludeIds = []) {
  const ex = new Set(excludeIds.map(String));
  const frontiers = await Frontier.find({}, { name: 1, seasons: 1, seasonlog: 1 }).lean();
  const seasons = [];
  for (const f of frontiers) {
    for (const s of f.seasonlog || []) {
      seasons.push({
        frontier: f.name, date: s.date, season_number: s.seasonnumber, season_type: s.seasontype,
        winning_settlement: s.winningsettlement, grids_reset: s.gridsreset, players_relocated: s.playersrelocated,
        winners: (s.seasonwinners || []).map((w) => ({
          playerId: w.playerId ? String(w.playerId) : null,
          username: w.playerId ? redactName(w.playerId, w.username) : w.username,
          excluded: !!w.playerId && ex.has(String(w.playerId)),
          net_worth: w.networth,
        })),
      });
    }
  }
  seasons.sort((a, b) => new Date(b.date) - new Date(a.date));
  const current = frontiers.map((f) => ({ frontier: f.name, ...(f.seasons || {}) }));
  return { seasons, current };
}

// ---- Events tab: settlement events (train / carnival / election logs) ----
// Per local day across all settlements: train departures and carnival
// departures, how many had ALL offers filled, and the total winners. From the
// settlement logs, which already exist, so this has history. "Winners" is the
// count the game logged (players who filled their share), not distinct
// players across events.
async function settlementEventsForRange({ from, to, start, end, tz }) {
  const sets = await Settlement.find({}, { name: 1, displayName: 1, trainlog: 1, 'carnival.carnivallog': 1, electionlog: 1, population: 1 }).lean();
  const byDay = new Map();
  const bump = (day, key, n = 1) => {
    if (!byDay.has(day)) byDay.set(day, { train: 0, train_filled: 0, train_winners: 0, carnival: 0, carnival_filled: 0, carnival_winners: 0, elections: 0 });
    byDay.get(day)[key] += n;
  };
  const inRange = (d) => d && new Date(d) >= start && new Date(d) <= end;
  let populated = 0;
  for (const s of sets) {
    if (s.population > 0) populated++;
    for (const t of s.trainlog || []) {
      if (!inRange(t.date) || /next/i.test(t.status || '')) continue;   // "Next Train" rows are schedule, not outcomes
      const day = localDay(t.date, tz);
      bump(day, 'train'); if (t.alloffersfilled) bump(day, 'train_filled'); bump(day, 'train_winners', t.totalwinners || 0);
    }
    for (const c of (s.carnival && s.carnival.carnivallog) || []) {
      if (!inRange(c.date) || /next|current/i.test(c.status || '')) continue;
      const day = localDay(c.date, tz);
      bump(day, 'carnival'); if (c.alloffersfilled) bump(day, 'carnival_filled'); bump(day, 'carnival_winners', c.totalwinners || 0);
    }
    for (const e of s.electionlog || []) {
      if (!inRange(e.date)) continue;
      bump(localDay(e.date, tz), 'elections');
    }
  }
  return {
    settlements: sets.length, populated_settlements: populated,
    series: daysBetween(from, to).map((day) => ({ day, ...(byDay.get(day) || { train: 0, train_filled: 0, train_winners: 0, carnival: 0, carnival_filled: 0, carnival_winners: 0, elections: 0 }) })),
  };
}

// ---- Monetization: the purchases ledger ----
// Revenue (cents), purchase count and distinct buyers per local day, plus the
// breakdown by offer over the range and lifetime totals. The ledger starts with
// the recording deploy; there is no history to backfill (the old route kept no
// record of fulfilled offers). Gold accounts are counted from the live players
// collection (accountStatus 'Gold' is the subscriber tier).
async function purchasesForRange({ from, to, start, end, tz }, excludeIds = []) {
  const exP = excludeIds.length ? { playerId: { $nin: toObjectIds(excludeIds) } } : {};
  const [perDay, byOffer, lifetime, gold, first] = await Promise.all([
    Purchase.aggregate([
      { $match: { ts: { $gte: start, $lte: end }, ...exP } },
      { $group: { _id: localDayExpr('$ts', tz), n: { $sum: 1 }, cents: { $sum: '$amountCents' }, gems: { $sum: '$gems' }, buyers: { $addToSet: '$playerId' } } },
      { $project: { n: 1, cents: 1, gems: 1, buyers: { $size: '$buyers' } } },
    ]),
    Purchase.aggregate([
      { $match: { ts: { $gte: start, $lte: end }, ...exP } },
      { $group: { _id: '$offerId', n: { $sum: 1 }, cents: { $sum: '$amountCents' } } },
      { $sort: { cents: -1, n: -1 } },
    ]),
    Purchase.aggregate([
      { $match: exP },
      { $group: { _id: null, n: { $sum: 1 }, cents: { $sum: '$amountCents' }, buyers: { $addToSet: '$playerId' } } },
      { $project: { n: 1, cents: 1, buyers: { $size: '$buyers' } } },
    ]),
    Player.countDocuments({ accountStatus: 'Gold', ...exPlQ(excludeIds) }),
    Purchase.findOne({}, { ts: 1 }).sort({ ts: 1 }).lean(),
  ]);
  const by = Object.fromEntries(perDay.map((r) => [r._id, r]));
  const today = localDay(new Date(), tz);
  const yesterday = addDays(today, -1);
  const yRow = (await Purchase.aggregate([
    { $match: { ts: { $gte: new Date(Date.now() - 3 * 86400000) }, ...exP } },
    { $addFields: { lday: localDayExpr('$ts', tz) } },
    { $match: { lday: yesterday } },
    { $group: { _id: null, n: { $sum: 1 }, cents: { $sum: '$amountCents' } } },
  ]))[0] || { n: 0, cents: 0 };
  return {
    ledger_start_day: first ? localDay(first.ts, tz) : null,
    series: daysBetween(from, to).map((day) => ({
      day, purchases: by[day] ? by[day].n : 0, cents: by[day] ? by[day].cents : 0, gems: by[day] ? by[day].gems : 0, buyers: by[day] ? by[day].buyers : 0,
    })),
    by_offer: byOffer.map((r) => ({ offerId: r._id, title: offerTitle(r._id), purchases: r.n, cents: r.cents })),
    metrics: {
      gold_accounts: gold,
      lifetime_purchases: lifetime.length ? lifetime[0].n : 0,
      lifetime_cents: lifetime.length ? lifetime[0].cents : 0,
      lifetime_buyers: lifetime.length ? lifetime[0].buyers : 0,
      purchases_yesterday: yRow.n, cents_yesterday: yRow.cents, yesterday,
    },
  };
}

// ---- Monetization: Gold-account DAU ----
// Active Gold accounts per day. accountStatus carries no start date (the Gold
// Pass purchase flips it in place), so the base is "accounts that are Gold
// TODAY" on every day: a lapsed Gold is invisible, and a Gold account's pre-
// purchase activity counts as Gold activity. Purchases of offer 1 (the Gold
// Pass) in the ledger are the forward-only "new Gold per day" series.
async function goldDauSeries({ from, to, start, end, tz }, excludeIds = []) {
  const golds = await Player.find({ accountStatus: 'Gold', ...exPlQ(excludeIds) }, { _id: 1 }).lean();
  const goldIds = golds.map((g) => String(g._id));
  const [acts, newGold] = await Promise.all([
    goldIds.length ? AnalyticsActivity.aggregate([
      { $match: { ts: { $gte: start, $lte: end }, playerId: { $in: goldIds } } },
      { $group: { _id: localDayExpr('$ts', tz), players: { $addToSet: '$playerId' } } },
      { $project: { n: { $size: '$players' } } },
    ]) : [],
    Purchase.aggregate([
      { $match: { ts: { $gte: start, $lte: end }, offerId: '1', ...(excludeIds.length ? { playerId: { $nin: toObjectIds(excludeIds) } } : {}) } },
      { $group: { _id: localDayExpr('$ts', tz), n: { $sum: 1 } } },
    ]),
  ]);
  const by = Object.fromEntries(acts.map((r) => [r._id, r.n]));
  const nb = Object.fromEntries(newGold.map((r) => [r._id, r.n]));
  return daysBetween(from, to).map((day) => ({ day, dau: by[day] || 0, newUsers: nb[day] || 0, subs: goldIds.length }));
}

// ---- Demographics (new accounts in range) ----
// Device / OS / browser / timezone / screen come from ftueFeedback (captured at
// signup by the client, present on most accounts); acquisition from
// client_info (new accounts only). A null field buckets as 'Unknown' except
// screen size, where an unmeasured account is skipped and COVERAGE reported.
const SCREEN_TOP_N = 14;
async function demographicsForRange({ start, end }, excludeIds = []) {
  const rows = await Player.aggregate([
    { $addFields: { created_at: CREATED_EXPR } },
    { $match: { created_at: { $gte: start, $lte: end }, ...exPlQ(excludeIds) } },
    { $project: { ftueFeedback: 1, client_info: 1, language: 1 } },
  ]);
  const counts = { device: new Map(), os: new Map(), browser: new Map(), browserMobile: new Map(), browserDesktop: new Map(), timezone: new Map(), screen: new Map(), connection: new Map() };
  const bump = (map, label) => { const k = label || 'Unknown'; map.set(k, (map.get(k) || 0) + 1); };
  const deviceMatrix = {};
  const sourceTotals = new Map();
  let mobileTotal = 0, mobileMeasured = 0, withClientInfo = 0;
  for (const p of rows) {
    const f = p.ftueFeedback || {};
    const device = f.isMobile === true ? 'Mobile' : f.isMobile === false ? 'Desktop' : 'Unknown';
    const src = resolveSource(p.client_info);
    if (p.client_info && p.client_info.captured_at) withClientInfo++;
    bump(counts.device, device);
    bump(counts.os, f.os);
    bump(counts.browser, f.browser);
    bump(counts.timezone, f.timezone);
    bump(counts.connection, f.connectionType);
    if (device === 'Mobile') bump(counts.browserMobile, f.browser);
    else if (device === 'Desktop') bump(counts.browserDesktop, f.browser);
    if (device === 'Mobile') {
      mobileTotal++;
      if (f.screenWidth && f.screenHeight) {
        mobileMeasured++;
        const w = Math.min(f.screenWidth, f.screenHeight), h = Math.max(f.screenWidth, f.screenHeight);
        bump(counts.screen, `${w}x${h}`);
      }
    }
    if (!deviceMatrix[device]) deviceMatrix[device] = {};
    deviceMatrix[device][src] = (deviceMatrix[device][src] || 0) + 1;
    sourceTotals.set(src, (sourceTotals.get(src) || 0) + 1);
  }
  const asArray = (map) => [...map.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  const screenRows = asArray(counts.screen);
  const screen = screenRows.length > SCREEN_TOP_N + 1
    ? screenRows.slice(0, SCREEN_TOP_N).concat([{ label: `Other (${screenRows.length - SCREEN_TOP_N})`, count: screenRows.slice(SCREEN_TOP_N).reduce((a, r) => a + r.count, 0) }])
    : screenRows;
  return {
    total: rows.length,
    device: asArray(counts.device),
    deviceMatrix,
    deviceSources: [...sourceTotals.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s),
    os: asArray(counts.os), browser: asArray(counts.browser),
    browserMobile: asArray(counts.browserMobile), browserDesktop: asArray(counts.browserDesktop),
    timezone: asArray(counts.timezone), connection: asArray(counts.connection),
    screen,
    screenCoverage: { mobile: mobileTotal, measured: mobileMeasured },
    clientInfoCoverage: { accounts: rows.length, with_client_info: withClientInfo },
  };
}

// ---- Timezone breakdown of YESTERDAY's active users (DAU) ----
// VVGame has no geo-IP; ftueFeedback.timezone is the closest thing to "where
// are players", so it stands in for House's Country-of-DAU chart.
async function timezoneDauYesterday(tz, now, excludeIds = []) {
  const yesterday = addDays(localDay(now, tz), -1);
  const coarseStart = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const rows = await AnalyticsActivity.aggregate([
    { $match: { ts: { $gte: coarseStart, $lte: now }, ...exActQ(excludeIds) } },
    { $addFields: { lday: localDayExpr('$ts', tz) } },
    { $match: { lday: yesterday } },
    { $group: { _id: '$playerId' } },
  ]);
  const ids = rows.map((r) => r._id);
  const live = await Player.find({ _id: { $in: toObjectIds(ids) } }, { _id: 1, 'ftueFeedback.timezone': 1 }).lean();
  const tzById = Object.fromEntries(live.map((p) => [String(p._id), (p.ftueFeedback && p.ftueFeedback.timezone) || null]));
  const counts = new Map();
  for (const id of ids) { const label = tzById[id] || 'Unknown'; counts.set(label, (counts.get(label) || 0) + 1); }
  return { day: yesterday, total: ids.length, timezone: [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count) };
}

// ---- Language chart (Demographics tab): per-day DAU split by language ----
// Keys on players.language (a code such as 'en'). Deleted accounts (activity
// row but no player doc) are skipped, not bucketed as Unknown.
async function languageForRange({ from, to, start, end, tz }, excludeIds = []) {
  const actPairs = await AnalyticsActivity.aggregate([
    { $match: { ts: { $gte: start, $lte: end }, ...exActQ(excludeIds) } },
    { $group: { _id: { day: localDayExpr('$ts', tz), pid: '$playerId' } } },
  ]);
  const allIds = new Set();
  actPairs.forEach((r) => allIds.add(r._id.pid));
  const live = await Player.find({ _id: { $in: toObjectIds(allIds) } }, { _id: 1, language: 1 }).lean();
  const langById = Object.fromEntries(live.map((p) => [String(p._id), (p.language || 'en').toLowerCase()]));
  const totals = new Map();
  const byDay = new Map();
  for (const r of actPairs) {
    const lang = langById[r._id.pid];
    if (!lang) continue;
    const day = r._id.day;
    if (!byDay.has(day)) byDay.set(day, new Map());
    const m = byDay.get(day);
    m.set(lang, (m.get(lang) || 0) + 1);
    totals.set(lang, (totals.get(lang) || 0) + 1);
  }
  const languages = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l);
  const all = daysBetween(from, to).map((day) => {
    const row = { day };
    const m = byDay.get(day);
    for (const l of languages) row[l] = (m && m.get(l)) || 0;
    return row;
  });
  // Lifetime split too, so the chart is not blank before activity recording has data.
  const lifetime = await Player.aggregate([{ $match: exPlQ(excludeIds) }, { $group: { _id: { $toLower: { $ifNull: ['$language', 'en'] } }, n: { $sum: 1 } } }, { $sort: { n: -1 } }]);
  return { languages, all, lifetime: lifetime.map((r) => ({ label: r._id, count: r.n })) };
}

// ---- Static + plumbing ----
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
function serveStatic(pathname, res) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.join(CLIENT_DIR, rel);
  if (!file.startsWith(CLIENT_DIR) || !fs.existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}
function sendJSON(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}
function serveFavicon(res) {
  fs.readFile(FAVICON_PATH, (err, buf) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'image/x-icon', 'Cache-Control': 'max-age=86400' });
    res.end(buf);
  });
}
const sourcesParam = (url) => (url.searchParams.has('sources')
  ? new Set(url.searchParams.get('sources').split(',').filter(Boolean)) : null);

const server = http.createServer(async (req, res) => {
  // Unauthenticated liveness probe (Render health checks hit this).
  if (req.url === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (!checkAuth(req)) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Secrets of Elsinore Analytics", charset="UTF-8"', 'Content-Type': 'text/plain' });
    return res.end('Authentication required.');
  }
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/favicon.ico') return serveFavicon(res);
    const p = url.pathname;
    // Every endpoint: rangeFrom(url) for the window, excludeFor(url) for the
    // exclude set, gap-filled day axis, and { from, to, ...series } back.
    if (p === '/api/dau') {
      const range = rangeFrom(url); const ex = await excludeFor(url);
      return sendJSON(res, 200, { from: range.from, to: range.to, activity_start_day: await activityStartDay(range.tz), series: await dauSeries(range, ex) });
    }
    if (p === '/api/last-seen') {
      const range = rangeFrom(url); const ex = await excludeFor(url);
      return sendJSON(res, 200, { from: range.from, to: range.to, series: await lastSeenSeries(range, ex) });
    }
    if (p === '/api/retention') {
      const range = rangeFrom(url); const ex = await excludeFor(url);
      const played = url.searchParams.get('played') === '1';
      return sendJSON(res, 200, { from: range.from, to: range.to, played, played_start_day: await activityStartDay(range.tz), ...(await retentionSeries(range, ex, sourcesParam(url), played)) });
    }
    if (p === '/api/retention-avg') {
      const range = rangeFrom(url); const ex = await excludeFor(url);
      const played = url.searchParams.get('played') === '1';
      return sendJSON(res, 200, { from: range.from, to: range.to, window_days: ROLLING_WINDOW_DAYS, played, ...(await retentionAvgSeries(range, ex, sourcesParam(url), played)) });
    }
    if (p === '/api/traffic-metrics') {
      const tz = url.searchParams.get('tz') || 'UTC';
      return sendJSON(res, 200, await trafficMetrics({ tz }, await excludeFor(url)));
    }
    if (p === '/api/site-traffic') {
      const range = rangeFrom(url); const ex = await excludeFor(url);
      return sendJSON(res, 200, { from: range.from, to: range.to, ...(await siteTrafficForRange(range, ex)) });
    }
    if (p === '/api/source') {
      const range = rangeFrom(url); const ex = await excludeFor(url);
      return sendJSON(res, 200, { from: range.from, to: range.to, ...(await sourceForRange(range, ex)) });
    }
    if (p === '/api/active-users') {
      const ex = await excludeFor(url);
      const now = new Date();
      const start = url.searchParams.get('start') || `${dayKeyUTC(now)}T00:00:00.000Z`;
      const end = url.searchParams.get('end') || `${dayKeyUTC(now)}T23:59:59.999Z`;
      return sendJSON(res, 200, await activeUsers(start, end, ex));
    }
    if (p === '/api/ignored-users') return sendJSON(res, 200, await ignoredUsers(url.searchParams.get('hideDevs') === '1'));
    if (p === '/api/new-accounts') {
      const range = rangeFrom(url); const ex = await excludeFor(url);
      return sendJSON(res, 200, { from: range.from, to: range.to, ...(await newAccountsInRange(range, ex)) });
    }
    if (p === '/api/players') return sendJSON(res, 200, await playersTable(await excludeFor(url)));
    if (p === '/api/ftue-funnel') {
      const range = rangeFrom(url); const ex = await excludeFor(url);
      return sendJSON(res, 200, { from: range.from, to: range.to, ...(await ftueFunnelForRange(range, ex)) });
    }
    if (p === '/api/home-deed') {
      const range = rangeFrom(url); const ex = await excludeFor(url);
      return sendJSON(res, 200, { from: range.from, to: range.to, ...(await homeDeedForRange(range, ex)) });
    }
    if (p === '/api/quests') {
      const range = rangeFrom(url); const ex = await excludeFor(url);
      return sendJSON(res, 200, { from: range.from, to: range.to, ...(await questsForRange(range, ex)) });
    }
    if (p === '/api/trophies') {
      const range = rangeFrom(url); const ex = await excludeFor(url);
      return sendJSON(res, 200, { from: range.from, to: range.to, ...(await trophiesForRange(range, ex)) });
    }
    if (p === '/api/grids-visited') return sendJSON(res, 200, await gridsVisitedStats(await excludeFor(url)));
    if (p === '/api/activity-flags') {
      const range = rangeFrom(url); const ex = await excludeFor(url);
      return sendJSON(res, 200, { from: range.from, to: range.to, ...(await activityFlagsForRange(range, ex)) });
    }
    if (p === '/api/season-log') return sendJSON(res, 200, await seasonLog(await excludeFor(url)));
    if (p === '/api/settlement-events') {
      const range = rangeFrom(url);
      return sendJSON(res, 200, { from: range.from, to: range.to, ...(await settlementEventsForRange(range)) });
    }
    if (p === '/api/purchases') {
      const range = rangeFrom(url); const ex = await excludeFor(url);
      return sendJSON(res, 200, { from: range.from, to: range.to, ...(await purchasesForRange(range, ex)) });
    }
    if (p === '/api/sub-dau') {
      const range = rangeFrom(url); const ex = await excludeFor(url);
      return sendJSON(res, 200, { from: range.from, to: range.to, series: await goldDauSeries(range, ex) });
    }
    if (p === '/api/demographics') {
      const range = rangeFrom(url); const ex = await excludeFor(url);
      const [demo, tzDau] = await Promise.all([demographicsForRange(range, ex), timezoneDauYesterday(range.tz, new Date(), ex)]);
      return sendJSON(res, 200, { from: range.from, to: range.to, ...demo, timezoneDauYesterday: tzDau });
    }
    if (p === '/api/language') {
      const range = rangeFrom(url); const ex = await excludeFor(url);
      return sendJSON(res, 200, { from: range.from, to: range.to, ...(await languageForRange(range, ex)) });
    }
    return serveStatic(p, res);
  } catch (err) {
    // A 500 with a readable message means an unhandled throw; curl the URL to see it.
    sendJSON(res, 500, { error: err.message });
  }
});

const { port: cliPort } = parseArgs(process.argv);
// Only trust Render's injected PORT when actually on Render (it sets RENDER);
// locally use --port / the 8771 default and bind 127.0.0.1.
const ON_RENDER = !!process.env.RENDER;
const PORT = process.env.ANALYTICS_PORT || (ON_RENDER && process.env.PORT) || cliPort;
const HOST = process.env.ANALYTICS_HOST || (ON_RENDER ? '0.0.0.0' : '127.0.0.1');
connectMongo()
  .then(async () => {
    // game-server runs with autoIndex:false, so ensure the analytics indexes
    // exist here (cheap, idempotent) before serving queries.
    await Promise.all([AnalyticsActivity.createIndexes(), AnalyticsPlayer.createIndexes(), AnalyticsPageview.createIndexes(), Purchase.createIndexes()]);
    server.listen(PORT, HOST, () => {
      console.log('Secrets of Elsinore Analytics Dashboard');
      console.log(`  listening on ${HOST}:${PORT}`);
      console.log(`  auth: ${AUTH_ON ? 'ON (Basic)' : 'off'} / per-user PII: ${HIDE_PII ? 'hidden' : 'shown'}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to Mongo:', err.message);
    process.exit(1);
  });
