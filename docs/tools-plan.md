# Developer tools plan: the Editor and the Analytics dashboard (2026-10-05)

Two local web tools replace the Electron GridEditor (`game-editor/`), built the way House
builds its tools: a single Node server per tool under `tools/<tool>/`, serving a vanilla-JS
client with no build step, reusing `game-server/node_modules` and `game-server/.env`,
launched from `.claude/launch.json` and by hand with `node`. Edit the client, refresh the
page; edit the server, restart it.

| Tool | Path | Port | What it is |
|---|---|---|---|
| Editor | `tools/editor/` | 8770 | Content and world administration: grid layouts, world map, atlas, dungeons, events, players, feedback, and spreadsheet editing of every tuning JSON (ECONOMY, QUESTS, TRADERS, and the rest) |
| Analytics | `tools/analytics/` | 8771 | The House dashboard, adapted to VVGame's data; its own page, independent of the editor |

Inputs: `docs/audits/` has no tool audit; the three surveys behind this plan (Electron editor
inventory, House tool architecture and chart inventory, VVGame analytics data and tuning
JSON shapes) were run on 2026-10-05 and their findings are folded in below.

## 1. Decisions

1. **Vanilla ES modules, no framework, no build.** Matches House (`house/tools/analytics`,
   `house/tools/cardEditor`), keeps the tools trivially runnable, and the owner's edits are
   edit-and-refresh. The grid canvas, the sheet grid and the charts do not need React.
2. **One server per tool, plain `http`** (as House) with a tiny router. Express is available
   from `game-server/node_modules` but the plain server keeps the two tools identical in
   shape to House's. Both bind `127.0.0.1`.
3. **The editor talks to two backends.** Files (`game-server/layouts/**`, `game-server/tuning/*.json`)
   through its own `/api/local/*` routes with validation and read-compare-write; the game
   server through `/api/game/*`, a same-origin proxy to `--game-server` (default the
   production URL, like the Electron editor; `http://localhost:3001` for a local server).
   The page shows which one it is pointed at and confirms before any live write.
4. **Spreadsheet editing is one engine, many definitions.** A sheet definition names the
   file, the row identity, the columns (type, enum, reference target, immutable), the
   category/column-preset rules and the validators. ECONOMY, QUESTS and TRADERS are the three
   first-class tabs; every other tuning file is reachable under a Sheets tab from the same
   engine, so each future export the owner has is a definition, not a feature.
5. **Keys are immutable in place.** `type` and `layoutkey` in `resources.json`, quest `title`
   (it is the persisted `questId`), trader `trader`, trophy `name`: the engine refuses to edit
   them once a row is saved and offers "duplicate row" instead. Renames need a migration.
6. **Writes are safe but simple.** The server reads the file, compares the serialised JSON,
   writes only when different, keeps one `.bak` beside it (overwritten each save), and git
   remains the real undo (as House). Edits to `tuning/*.json` take effect on the next game
   server restart (most files are `require`d at boot), and the editor says so after a save.
7. **Analytics is a copy of House's dashboard** (client shell, helpers, Site Traffic, DAU &
   Retention, Users, Monetization, Demographics tabs, auth, PII hiding, launch recipe) with
   VVGame's schema substituted, plus the server-side recording House has and VVGame lacks:
   a per-day activity record and a first-seen registry. Engagement is scaffolded with the
   VVGame metrics that already exist; Events is dropped.
8. **The Electron app is deleted** once the editor reaches parity, along with its `.env` (it
   holds a live Atlas credential) and the 274 MB of packaged builds.

## 2. The Editor

### 2.1 Shell

```
┌──────┬───────────────┬────────────────────────────────────────┐
│ nav  │ selection     │ editing space                          │
│ col  │ panel         │                                        │
│      │ (per tab)     │ (per tab)                              │
└──────┴───────────────┴────────────────────────────────────────┘
 status line: tool state, game server target, dirty files, last save
```

- `client/index.html` holds the frame; `client/app.js` is the shell: a tab registry, hash
  routing (`#layouts/valleyFixedCoord/1010172`, `#economy?category=doober`), a header with
  the game-server target and a global dirty indicator, and `beforeunload` when anything is dirty.
- A tab is a module exporting `{ id, label, icon, mount(selectionEl, editorEl, ctx), unmount() }`.
  `ctx` gives it the API client, the resources index, the world store, toasts, modals and
  the dirty registry. Tabs never touch each other's DOM; cross-tab actions (World → open a
  layout in Layouts) go through `ctx.navigate()`.
- Shared modules in `client/core/`: `api.js` (local + game, with a `written[]` contract on
  saves), `resources.js` (master resources loaded once, indexed by type and layoutkey, with
  tile/npc/enemy/region/placeable lists), `world.js` (frontiers, settlements, grid map by
  gridCoord), `dirty.js` (per-file dirty flags, the status line, beforeunload), `history.js`
  (undo/redo stack with a cap, used by layouts and sheets), `ui.js` (modal, confirm, toast,
  tabs, split panes, keyboard shortcuts), `dom.js` (element helpers).

### 2.2 Tabs and parity with the Electron editor

| Tab | Selection panel | Editing space | Replaces |
|---|---|---|---|
| Layouts | Directory list (valleyFixedCoord, homestead, town, dungeon, miniTemplates) with search; New / Duplicate / Delete | Canvas grid editor: tile and resource painting, brush size/shape/scatter, keyboard tile letters, undo/redo, copy/paste resource, mini-template stamping, distribution sliders, clump settings, generate tiles/resources/enemies, delete-by-type, template presets from `randomValleyGridLayouts.json`, Quick Generate | `GridEditor.jsx`, `Tile.jsx`, `FileManager.jsx` |
| World | Frontier/settlement picker, filters (layouts exist, DB-backed, regions) | 64×64 cell map; select/drag; Create/Load layout (→ Layouts), Create Grid (live), Reset Grid (live), bulk create/reset, region assignment | `FrontierView.jsx` |
| Atlas | Frontier picker, options (resources dots, template outlines) | Canvas minimap 2 px/tile from live grids + fixed layouts, pan/zoom | `AtlasView.jsx` |
| Dungeons | Template instances list | Create from template, delete, reset, entrances with validation, save config | `Dungeons.jsx` |
| Events | Frontier timers (live countdowns) | End phase (live), phase durations (writes `globalTuning.json` locally), settlement logs | `Events.jsx`, `ShowLogs.jsx` |
| Players | Sortable, filterable player table | Inspector: stats, wallet/inventory/skills/powers edits, send home, reset password, migrate FTUE, delete, bulk delete with preview | `Players.jsx` |
| Feedback | Date range | FTUE feedback aggregation and detail table | `Feedback.jsx` |
| Economy | Category chips, column presets, search | Sheet engine over `tuning/resources.json` | the Google Sheet export |
| Quests | Giver chips, search | Sheet engine over `tuning/quests/questsEN.json` | manual JSON |
| Traders | Trader chips, search | Sheet engine over `tuning/traders.json` | manual JSON |
| Sheets | Every other tuning file (store, trophies, skillsTuning, xpLevels, seasons, interactions, FTUEsteps, messages, warehouse, globalTuning, randomValleyGridLayouts) | Sheet engine with the file's definition | manual JSON |

The Electron Analytics tab moves to the Analytics tool.

### 2.3 The grid canvas

One `<canvas>` for the 64×64 grid (tile colours from `resources.json` via the shared
`tileColors` once its four wrong keys are fixed, emoji resources with `fillText`, multi-tile
resources anchored bottom-left as today), rulers drawn in-canvas, selection and brush
preview as overlays, tile size 10 to 50 px. All mutations are pure functions in
`client/layouts/model.js` over `{tiles, resources}` matrices and go through `history.js`;
Quick Generate composes the same functions instead of duplicating them. The random
generation (clumps, `validon*` placement, enemies) stays a client-side preview of what
`utils/worldUtils.js` does on the server.

### 2.4 The sheet engine

`client/sheet/Sheet.js` renders a definition over an array of row objects:

- Columns from the definition; cells typed (`string`, `number`, `boolean`, `enum`, `ref`
  to another sheet's key, `json` for arrays/objects with a popover editor); immutable
  columns locked after the row exists; sparse semantics preserved (an empty cell is an
  absent key, not `""` or `null`; numbers stay numbers).
- Row operations: add (at the end or after the selection), duplicate, delete, reorder by drag
  where order is meaningful; column operations: sort, text filter, chip filters on a
  category column, column presets (for ECONOMY: the columns a category uses, as the survey
  found them), show/hide, resize.
- Editing: click-to-edit cells, Tab/Enter navigation, paste a block from the Google Sheet
  (TSV) into the grid, undo/redo, dirty row highlighting against the ORIG snapshot.
- Validation on every change and before save: unique keys, references resolve (quest
  givers and trader names are NPC types, goal items and rewards are resource types, skill
  tuning keys are resource types, seasons crops are resource types), enum membership,
  number ranges; problems appear in a panel and in the cell; saving with errors is blocked,
  warnings are not.
- Import/export: CSV/TSV import (to bring the Google Sheet in once, mapping header names to
  keys), CSV export, and a Diff modal (before/after, per row) before Save.
- Save: `PUT /api/local/tuning/<file>` with the whole array; the server validates against the
  same definition (shared file `tools/editor/sheets/definitions.js`), writes read-compare-
  write, returns `written[]`.

Definitions live in `tools/editor/sheets/definitions.js` (one object per file), used by both
server and client. Adding a new export = adding a definition.

### 2.5 Server API (`tools/editor/server.js`)

```
GET  /                               the client
GET  /api/local/layouts              {dirs: {valleyFixedCoord:[...], homestead:[...], town:[...], dungeon:[...], miniTemplates:[...]}}
GET  /api/local/layouts/:dir/:name   one layout
PUT  /api/local/layouts/:dir/:name   validated write (64x64, known tile and resource keys)
DELETE /api/local/layouts/:dir/:name
GET  /api/local/random-valley        randomValleyGridLayouts.json
GET  /api/local/resources            tuning/resources.json (so the editor never needs prod for static tables)
GET  /api/local/tuning               list of sheet definitions + file stats
GET  /api/local/tuning/:file         the file
PUT  /api/local/tuning/:file         validated write
PATCH /api/local/tuning/globalTuning/phase {event, phase, minutes}
GET  /api/local/settlement-layouts, /frontier-layouts   read-only for now
ALL  /api/game/*                     proxy to --game-server (default https://vvgame-server.onrender.com)
GET  /healthz
```
Args: `--port` (8770), `--game-server <url>`. No auth (local only). SIGINT drains sockets.

## 3. The Analytics dashboard

### 3.1 What is copied from House

`tools/analytics/server.js` (plain http, Basic auth when `ANALYTICS_USER`/`ANALYTICS_PASS`
are set, `ANALYTICS_HIDE_PII`, `/healthz`, date helpers, exclusions, DAU/retention/source/
site-traffic/users/demographics/monetization queries), `client/index.html`, `client/app.js`,
`client/styles.css`, and the two scripts `purge-analytics.js` and `backfill-firstseen.js`.
Chart.js from the CDN as House.

### 3.2 What VVGame needs on the server first

VVGame has no activity history (`players.lastActive` is one overwritten timestamp), no
acquisition fields and no purchase ledger. The dashboard gets:

- `game-server/models/analyticsActivity.js` (`{player, day, played, ...}` one row per player
  per UTC day) and `analyticsPlayer.js` (first-seen registry), copied from House; plus
  `models/analyticsPageview.js` for the site-traffic tab, with a client beacon on the login
  screen.
- `game-server/utils/analytics.js` with `recordActivity(playerId)` called from the four
  places that write `lastActive` today (login, `update-last-active`, `enter-grid`,
  `player/state`) and `recordPlayed` from the first harvest/craft/kill of the day.
- Acquisition capture at signup (`utm_*`, referrer, surface) into `players.client_info`, so
  the Source charts stop reading Unknown for new accounts.
- A `purchases` ledger written by `/purchase-store-offer` (and later a Stripe webhook).
- `backfill-firstseen.js` seeds cohorts from `players.createdAt` so retention has history
  from day one even though activity starts at deploy.

### 3.3 Tabs

Site Traffic, DAU & Retention, Users, Demographics, Monetization as House (field names
mapped: `accountStatus` Gold for subscribers, `ftueFeedback.*` for device until
`client_info` exists, `language` names). **Engagement**: scaffolded with what the data
supports today: FTUE funnel from `ftuestep`/`firsttimeuser`/`aspiration`, Home Deed bought
(`settlementId` set), quests completed per day (`completedQuests[].timestamp`), grids
visited distribution, trophies earned, season leaderboard from `frontiers.seasonlog`,
settlement event participation from the settlement logs. Owner to add the rest.

## 4a. Build log

- **2026-10-05, slice 1 (skeleton + sheets), commit 85c3c839.** As designed, with these
  deviations: errors a file already has on disk (the duplicate `Angelo's Keep` type and the
  `armorclass: "`"` cell in resources.json) are demoted to warnings marked "pre-existing" so an
  old defect never blocks an unrelated save (`errorSignatures` + `validateRows(..., baseline)`);
  the server compares saves semantically (parsed JSON) so a no-op save never rewrites a file;
  `trader` and quest `giver` references warn rather than block (Shiro is category `shop`, not
  `npc`); `output` accepts the sentinels `noBank`, `hp`, `noRel`, `Buy`, `backpackCapacity`,
  `range`. Every sheet file on disk is already 2-space JSON, so a real save diffs only the
  changed rows.
- **2026-10-05, slice 2 (Layouts), commit d97714ab.** Tile colours come from the client's own
  `game-client/src/UI/Styles/tileColors.js`, served by the tool at `/game-client/tileColors.js`
  and keyed by the tile's single-letter `type`, so the stale two-letter map in that file is
  bypassed rather than fixed. Model + generation in `client/layouts/GridModel.js`
  (`model.js` in the design); every layout on disk round-trips unchanged except two valley
  grids holding layoutkey `CT`, which no longer exists in resources.json (the Electron editor
  dropped it the same way). Grid type for templates is a toolbar select, or `?type=` on the
  route from the World tab.

- **2026-10-05, slices 3-5 (live tabs, analytics, retirement).** World, Atlas, Dungeons, Events,
  Players and Feedback ported at parity over the proxy, with these corrections to the Electron
  behaviour: World maps town/homestead loads to their real layout directories (the old code
  pushed every grid to `valleyFixedCoord/`), both World and Atlas derive the frontier's 3-digit
  coord prefix from its settlements instead of hard-coding `101`, bulk create/reset act on the
  eligible subset of a selection, Dungeons refuses to create without a frontier (the old code
  sent `'global'` and 500'd), Events edits phase durations in the local globalTuning.json
  (minutes, as the scheduler reads them) and only shows the live server's values, Players'
  "Delete Unstarted" uses the 7 days its code always used. `core/world.js` is the shared
  frontier/settlement cache. The proxy takes `--dev-player-id` so the editor passes the
  maintenance gate. Analytics as designed; `config/database.js` turned out to be dead
  (Mongoose 5 options), so the tools connect with `mongoose.connect` like server.js; the Stripe
  success path is client-side, so `/purchase-store-offer` is the single ledger point (webhook =
  TODO in docs/analytics.md). `game-editor/` deleted, with its `.env` credential and builds.

- **2026-10-05, Atlas folded into World.** Per-player grid copies made a "current state" atlas
  meaningless (whose copy?). The World tab now has two sub-views: Grid view (the FrontierView
  port) and Tile view (`client/world/tileView.js`), which draws the frontier tile by tile from
  the template layouts on disk only (valleyFixedCoord files, `town<POS>.json`, homestead) and
  hatches valley grids that have no file (random at creation). No `/load-grid` calls at all;
  the only game-server reads are frontiers and settlements for the cell structure. `#atlas`
  links redirect to `#world/tiles`.

## 4. Delivery slices (each a commit, each runnable)

1. **Skeleton + sheets.** Editor server, client shell, core modules, the sheet engine and the
   definitions for resources (ECONOMY), questsEN (QUESTS), traders (TRADERS) and the other
   tuning files; validators; CSV import. Launch config `vvgame-editor`.
2. **Layouts.** Canvas grid editor at full parity with `GridEditor.jsx`, plus redo and a
   fixed tile-colour map.
3. **World, Atlas, Dungeons, Events, Players, Feedback** over the game-server proxy, with
   confirmations on live writes.
4. **Analytics.** Server-side recording models and calls; the dashboard tool; `docs/analytics.md`;
   launch config `vvgame-analytics`.
5. **Retire `game-editor/`**; update CLAUDE.md and the repository layout; remove the Electron
   deps and the `.env`.

Done when: every row of the parity table works against a local game server; ECONOMY round-
trips `resources.json` byte-for-byte when nothing changed and preserves sparsity when
something did; a Google Sheet CSV export imports cleanly; the dashboard renders every tab with
VVGame data and the Engagement scaffold shows the FTUE funnel.
