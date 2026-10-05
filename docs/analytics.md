# Analytics: rules and conventions

How Secrets of Elsinore records analytics and how the dashboard reads them.
Read this before touching `game-server/utils/analytics.js`, the analytics
models, the purchases ledger, or anything under `tools/analytics/`. The design
and the golden rules are House's (`house/docs/analytics.md`); this document is
the VVGame edition, with the schema mapping and the places where VVGame's data
differs.

## What the system is

- **Three durable analytics collections, written fire-and-forget from the
  request path** (`game-server/utils/analytics.js`):
  - `analytics_activity`: one doc per `(player, UTC day)`, `_id = "<playerId>:<day>"`.
    Powers DAU and retention. Carries per-day flags: `played` (a harvest or
    craft collection), `quest_completed`, `purchase`, and the counter
    `grids_entered`.
  - `analytics_player`: one doc per player, the first-seen registry. `_id` is
    the stringified player id. Powers New Users and retention cohorts. Stamps
    `username` so a deleted account is still recognizable.
  - `analytics_pageview`: one doc per `(visitor, UTC day)`,
    `_id = "<visitorId>:<day>"`, `views` counter. The PageView to
    AccountCreation funnel's denominator (Site Traffic tab).
- **A purchases ledger** (`purchases`, `game-server/models/purchase.js`): one
  row per fulfilled store offer with `playerId`, `username`, `kind`
  (`stripe` when the offer carries a price, `store_offer` otherwise), `offerId`,
  `title`, `gems`, `amountCents`, `ts`. Durable and never deleted; Monetization
  reads revenue from here, not from the players doc.
- **Acquisition on the player**: `players.client_info` (`visitor_id`, `surface`,
  `acquisition.{utm_source, utm_medium, utm_campaign, referrer_host,
  landing_path}`, `captured_at`), written once at register. Null for every
  account created before this shipped.
- **A read-only dashboard** (`tools/analytics/`): a localhost server
  (`node tools/analytics/server.js`, port 8771, binds `127.0.0.1`) plus a plain
  static client (`client/index.html` + `app.js` + `styles.css`). It reads
  `MONGODB_URI` from `game-server/.env` and reuses `game-server/node_modules`.
  Launch config `vvgame-analytics` in `/Users/jonathanknight/GameDevelopment/.claude/launch.json`.

## Golden rules

1. **The dashboard reads PROD.** `.env` points at the production Atlas cluster,
   database `test`, and local-dev play writes to the same database. Your local
   test accounts land in the same data the dashboard shows.
2. **Read-only means read-only.** The dashboard never writes game data. The only
   destructive tool is `tools/analytics/purge-analytics.js` (see Purges).
3. **A single bad row must never crash an endpoint.** Be defensive on read:
   `toObjectIds(ids)` filters to 24-hex before casting; never `ids.map(toObjectId)`.
4. **Validate ids at the write boundary.** Every record function guards with
   `HEX24.test(pid)` and returns early on a bad id; the beacon drops anything not
   UUID-shaped.
5. **Instrumentation is forward-only.** New metrics start from go-live; there is
   no backfill of events that were never recorded. Show gaps, not fake zeros.
6. **Analytics is durable and deletion-proof.** The analytics collections, with
   stamped usernames, are the source of truth for historical activity; the live
   `players` doc can be deleted.

## The record path (where the calls are)

All calls are `.catch(() => {})` and never awaited in the request path.

| Event | Call | Site |
|---|---|---|
| Register | `recordActivity(id, { username })` + `ensurePageview(visitor_id, ...)` | `routes/auth.js` `/register-new-player` |
| Login | `recordActivity(id, { username })` | `routes/auth.js` `/login` |
| App boot | `recordActivity(id)` | `routes/playerRoutes.js` `/update-last-active` |
| Position save | `recordActivity(id)` | `routes/playerRoutes.js` `/player/state` |
| Grid change | `recordActivity(id)` + `recordGridEntered(id)` | `routes/enterGridRoutes.js` `/enter-grid` |
| Played | `recordPlayed(id)` | `routes/worldRoutes.js` `/bulk-harvest` and `/crafting/collect-item` |
| Quest turn-in | `recordQuestCompleted(id)` | `routes/playerRoutes.js` `/update-profile` when the body carries `completedQuests` |
| Purchase | `Purchase.create(...)` + `recordPurchase(id)` | `routes/paymentRoutes.js` `/purchase-store-offer` (`logPurchase`) |
| Landing view | `recordPageview(visitor_id, ...)` | `routes/analyticsRoutes.js` `POST /api/analytics/pageview` |

These are exactly the places that already wrote `players.lastActive` (plus the
gameplay and purchase routes), so the heartbeat costs nothing new.

### Who may create a cohort row (`analytics_player`)

**Only the auth paths.** `recordActivity(id, { username })` writes the
`analytics_player` row only when a username is supplied, and register and
login are the only callers that hold the player doc and pass one. The
heartbeat sites (`update-last-active`, `enter-grid`, `player/state`) pass the id
alone, deliberately: they cannot verify the id belongs to a real player
(`HEX24` validates the shape of the id and nothing else), so they must never be
able to mint an account. Don't "helpfully" pass a username there. A bogus id can
still leave a stray `analytics_activity` row (+1 DAU for a day); that is what
the purge tool is for.

### "Opened" vs "Played"

An activity row means the client made an authed call: a login, the app-boot
`update-last-active`, a grid entry or a position save. That is "opened the
game", not "played". `analytics_activity.played` is set only by
`recordPlayed`, from the two clearest gameplay writes: `/bulk-harvest` and
`/crafting/collect-item`. The retention charts' Opened / Played toggle narrows
the return test to rows with `played: true`. Combat kills and farm-animal
collections do not set the flag yet; add a call site there if "played" needs to
include them, and keep it idempotent (same `(player, day)` row).

## The pageview funnel (Site Traffic tab)

- **Anonymous visitor id.** `game-client/src/Utils/pageviewBeacon.js` mints a
  random UUID once per browser (`vv_visitor_id` in localStorage; no PII,
  first-party only). Private-mode visitors get no id and are not counted.
- **The beacon (denominator).** `sendPageviewBeacon()` fires once per browser
  per UTC day from the login screen (`Authentication/LoginPanel.js` mount) and
  POSTs `{ visitor_id, utm_source, referrer_host, source }` to
  `/api/analytics/pageview`. It skips localhost so dev loads never pollute a
  denominator that cannot be filtered afterwards. The route drops obvious bot
  user agents and anything not UUID-shaped, and always answers 204.
- **The join (numerator link).** `gatherClientInfo()` sends the same
  `visitor_id` plus the landing `utm_*`, referrer host and play surface as
  `clientInfo` in the register payload (`Authentication/CreateAccount.js`);
  `routes/auth.js` sanitizes it (`sanitizeClientInfo`, every field length-capped)
  into `players.client_info`. Register also calls `ensurePageview`, which
  reconstructs the visitor's pageview row (`backfilled: true`) if the beacon was
  lost, so the numerator can never outrun the denominator.
- **Reading it.** Conversion = accounts divided by unique NEW visitors. The
  same-day cohort rate keys both sides on the visitor's first view and is
  bounded by 100%. Expect the numbers not to match an ad platform's own
  landing-page counts.

## The dashboard

`node tools/analytics/server.js [--port 8771]`, then open `http://127.0.0.1:8771`.
Tabs and the endpoints each one reads:

| Tab | Endpoints | Source collections |
|---|---|---|
| Site Traffic | `/api/site-traffic` | `analytics_pageview`, `analytics_player`, `players.client_info.visitor_id` |
| DAU & Retention | `/api/dau`, `/api/traffic-metrics`, `/api/source`, `/api/retention`, `/api/retention-avg` | `analytics_activity`, `analytics_player`, `players` |
| Users | `/api/active-users`, `/api/ignored-users`, `/api/new-accounts`, `/api/players` | `analytics_activity`, `analytics_player`, `players` |
| Engagement | `/api/last-seen`, `/api/dau`, `/api/activity-flags`, `/api/ftue-funnel`, `/api/home-deed`, `/api/quests`, `/api/trophies`, `/api/grids-visited` | `players` (lastActive, ftuestep, firsttimeuser, aspiration, settlementId, trophies, completedQuests, gridsVisited), `analytics_activity` |
| Events | `/api/settlement-events`, `/api/season-log` | `settlements` (trainlog, carnival.carnivallog, electionlog), `frontiers.seasonlog` |
| Monetization | `/api/purchases`, `/api/sub-dau` | `purchases`, `players.accountStatus`, `analytics_activity` |
| Demographics | `/api/demographics`, `/api/language` | `players.ftueFeedback`, `players.client_info`, `players.language`, `analytics_activity` |

Schema mapping from House: subscriber = `accountStatus === 'Gold'`; device,
browser, OS, timezone, screen and connection = `ftueFeedback.*` (captured at
signup, present on most accounts); acquisition = `client_info.acquisition`
(new accounts only; everything older reads Unknown); language =
`players.language` (a code such as `en`); level = derived from `xp` with the
client's own rule (`Utils/playerManagement.getDerivedLevel`); Home Deed =
`settlementId` set; country = none (no geo-IP), so the browser timezone stands in.

Engagement scaffold, what each metric is backed by:

- **Players last seen vs DAU**: the retired editor's "DAU" chart under its
  honest name. `lastActive` is one overwritten timestamp per player, so bars are
  "players whose most recent visit was that day" (a floor); the line is real DAU
  from the deploy onward.
- **What active players did**: `analytics_activity` flags, forward-only.
- **FTUE funnel**: the retired `/api/analytics/ftue-analytics` logic
  re-implemented against Mongo. Cohort = accounts created in range; "reached
  step i" = `ftuestep >= i` or completed (`firsttimeuser === false`); a legacy
  account with no step counter and `firsttimeuser` false counts as completed,
  as the old route did. Filter chips (OS, browser, timezone, language,
  aspiration, source) filter client-side and recompute, as the editor did.
- **Home Deed**: deeds bought per day from the `Homesteader` trophy timestamp
  (a floor: a season reset can clear trophies); plus, per signup day, the share
  of that cohort holding a deed today (`settlementId`, no timestamp).
- **Quests**: `completedQuests[].timestamp` (a Number, ms) per day; entries
  without a timestamp are skipped. Has history.
- **Trophies**: `trophies[].timestamp` per day. Has history.
- **Grids visited**: popcount of the 512-byte `gridsVisited` bitfield,
  lifetime (no timestamps).

## Forward-only: where the data starts

House pins go-live days as constants in its server and bumps them per deploy.
VVGame's recording all ships in one deploy, so the dashboard reads the cutoff
from the data instead: the earliest `source: 'live'` row in
`analytics_activity` (DAU, retention, activity flags, Played mode) and the
earliest row in `analytics_pageview` (the view series). Before that day every
affected series returns `null` and the client draws a gap. Until **the deploy
that ships this** goes out, those series are entirely gaps, the notes at the
top of each tab say so, and the only charts with history are the ones backed
by the live `players`, `settlements` and `frontiers` collections (last seen,
FTUE, Home Deed, quests, trophies, grids, Events, Gold accounts, demographics,
language). `backfill-firstseen.js` seeds `analytics_player` and a day-0
`analytics_activity` row (`source: 'backfill'`) from `players.created`, so New
Users and cohorts have history from the first run; retention ignores backfill
rows when deciding which cohorts have real data.

## Monetization caveats

- Every offer in `tuning/store.json` is Stripe-paid. Stripe Checkout redirects
  the client back with `?purchase=success&playerId&offerId`, and the CLIENT then
  calls `POST /api/purchase-store-offer`, which fulfils the offer and writes the
  ledger row. **There is no Stripe webhook**, so a ledger row means "the server
  fulfilled an offer the client reported as paid", not "Stripe confirmed
  payment". Also note the route is callable without proof of payment (a
  pre-existing gap, not introduced here).
- TODO: add a Stripe `checkout.session.completed` webhook that writes the
  `stripe` ledger row (with the session id) and let `purchase-store-offer`
  verify against it; until then treat revenue here as fulfilment, not receipts.
- Gold (`accountStatus`) has no start or end date; a Gold account is Gold
  forever, so "% of Gold active" uses today's Gold set on every day.

## Dev / test data

- Local-dev play and your own dev accounts write to the same prod database.
  **Hide it from the view, don't delete it.**
- The **"Hide developers"** toggle (`hideDevs=1` -> `devPlayerIds()`) filters
  dev accounts out of the view only. It matches `tuning/developerUsernames.json`
  case-insensitively against both the live `players` collection and
  `analytics_player.username` (so a dev who deleted their account is still
  recognized), plus any player doc carrying `isDeveloper: true`.
- Always-on exclusions live in `tools/analytics/server.js`:
  `NON_PLAYER_USERNAMES`, `ABUSE_USERNAME_RES`, `NON_PLAYER_IDS`, all empty at
  launch. They are applied through `excludeFor(url)` on every endpoint
  regardless of the toggle. Add a real-but-not-organic account (a friend, a
  payment-test account) by username; a multi-account farmer by regex; and pin
  by `_id` whenever the handle is ordinary enough that a regex would swallow
  real players. Pageviews are anonymous and cannot be filtered either way.
- **When a metric reads zero, check the dev filter first**, then the go-live
  gap (see above), then whether the metric is even possible for that population.

## Purges and data cleanup

Analytics purges are irreversible. Follow House's rules exactly:

- Only purge for usernames the user explicitly names. Never speculatively.
- Always `--dry` first; print exactly which rows will be deleted.
- Keep exactly one record per username; purge the rest. If an active account
  exists keep that one (it is never an orphan, so an orphan-targeted purge
  cannot touch it). If every instance is deleted, keep the most recent
  (highest `firstSeenAt`). Never leave zero.
- Synthetic junk (a row whose id is not a valid ObjectId) is the one clear-cut
  case to remove.
- The purchases ledger is never purged.

```bash
node tools/analytics/purge-analytics.js --list-orphans
node tools/analytics/purge-analytics.js --player <id> [--player <id> ...] --dry
node tools/analytics/purge-analytics.js --player <id> [--player <id> ...]
```

## Timezone and day bucketing

The client sends `tz` (IANA), `start`/`end` (ISO instants for the viewer's
local-day bounds) and `from`/`to` (local day labels for the gap-filled axis).
The server buckets with `$dateToString({ date, timezone: tz })`. Stored `ts`
is UTC; `completedQuests[].timestamp` is a Number and is converted with
`$toDate` before bucketing.

## Working on the dashboard

- Don't preview or screenshot the dashboard from the coding tool; make the
  change, `node --check` it, `curl` an endpoint to check a server change's JSON
  shape, and report. The dev verifies visually.
- Static client = edit-and-refresh. Server changes need a restart. Game-server
  recording changes need a game-server restart/deploy.
- Adding an endpoint: mirror the existing shape (`rangeFrom(url)`,
  `excludeFor(url)`, `toObjectIds()`, `daysBetween(from, to)`, return
  `{ from, to, ...series }`), and gap (`null`) any series that cannot exist
  before its instrumentation shipped.
- Sharing it: the same server runs on Render with `ANALYTICS_USER` +
  `ANALYTICS_PASS` (Basic auth; `/healthz` stays open) and
  `ANALYTICS_HIDE_PII=1` (usernames become `Player ####`, per-user device and
  acquisition detail dropped). Set `MONGODB_URI` on the service; there is no
  `.env` in prod. Build `cd game-server && npm install`, start
  `node tools/analytics/server.js`.
