# Refactor plan: Secrets of Elsinore as a single-player game with async multiplayer

Status: **Decisions D1-D5 confirmed by the owner on 2026-10-01**; D7-D9 proceed on the recommendation. Nothing in this plan has been built yet.
Baseline facts come from `audits/` (cited as `audits/<file> §n`) and a read-only count of the
production database taken on 2026-10-01.

## 0. Goals, in priority order

1. Better client performance.
2. A lot less server activity.
3. A single-player game with **asynchronous** multiplayer components (leaderboards, Train, Carnival, elections, market, settlement view).
4. Minimal, purpose-specific use of sockets (chat, notifications).

Non-goals: new gameplay, new art, new content. Player data is preserved where cheap; **Oberon and
moehong are preserved unconditionally** (both are in settlement `684743fab301fcbdbcb77255`).

## 1. Where we are (numbers that justify the plan)

| Measure | Today | Source |
|---|---|---|
| Production data | 11 players, 1,063 grids (73 MB; 1,034 are unowned valley grids), 64 settlements, 1 frontier, DB `test` | DB count 2026-10-01 |
| Client socket surface | 25 emits (21 grid-sync, 9 with no server handler), 21 listeners (16 grid-sync) | `audits/client-sockets-and-grid-state.md` §1 |
| Server socket emits outside `server.js` | 3 (one `player-left-sync`, one `mailbox-badge-update`, one debug) | `audits/server-routes.md` §4 |
| Grid change cost | 10-14 HTTP calls + 6-8 socket emits; destination fetched 5 times | `audits/views-transit-dungeons-ftue.md` §3 |
| Doober harvest cost | 5-7 HTTP calls, 2-3 of them `GET /api/player` | `audits/client-npc-and-rendering.md` §C4 |
| NPC persistence | `POST /save-single-npc` on every state change, positions every 10 s, 2 socket emits per step | §A5 |
| Idle server load | 2,160 Frontier reads/hour per frontier from the scheduler loop; +60/hour per connected client | `audits/schedulers-and-async-features.md` §5 |
| Client re-render cadence | whole-App re-render every 1 s (NPC loop + countdowns), up to 16/s while moving, 20 Hz on mouse move | `audits/client-npc-and-rendering.md` §B3 |
| Render loop waste | VFX layer runs a 60 fps rAF clearing/redrawing Graphics; 4,096 tile sprites drawn with no culling; tile-texture cache grows ~4,096 entries per grid visited | §B2, §B4 |
| Authority | client already authoritative for resources/tiles/inventory/XP (server trusts the payload) | `audits/server-routes.md` §5 |
| Render code | 1 live pipeline (Pixi), 3 dead generations still in the tree | `audits/client-npc-and-rendering.md` §B1 |

Two things make this refactor smaller than it sounds:

- The async features (Train, Carnival, Bank, Courthouse, Mailbox, Trade Stall) already keep their data on `Settlement`/`Frontier`/`Player`. The station on the grid is only a door that opens a panel. Per-player towns keep every door. (`audits/schedulers-and-async-features.md` §4)
- Grids are already materialised lazily, the dungeon reset is already lazy-on-entry, and `gridsVisited` already indexes all 4,096 coords per player. The per-player model is an extension of patterns that exist. (`audits/grid-lifecycle-and-data-model.md` §1, §3)

## 2. Target architecture

### 2.1 World model

```
Frontier (shared)      timers, season log, dungeon TEMPLATE registry keyed by entrance gridCoord
 └─ Settlement (shared) cells {gridCoord, gridType, available, gridId(homesteads only)}, roles, votes, logs, carnival offers
     ├─ Homestead Grid (shared, ownerId = owner)      one document, visible to neighbours as a snapshot
     ├─ Town Grid     (PER PLAYER, ownerId = viewer)   created from town<Dir>.json on first entry
     ├─ Valley Grid   (PER PLAYER, ownerId = viewer)   created from valleyFixedCoord/<coord>.json or a random layout on first entry
     └─ Dungeon Grid  (PER PLAYER, ownerId = viewer)   created from the template registry on first entry; FTUE cave instanced at registration
```

- `Grid` gains `gridCoord: Number`, `templateKey: String`, `seasonNumber: Number`, `resetEpoch: Date`; `ownerId` becomes required for town/valley/dungeon. Unique index `{ownerId, gridCoord}`.
- `Settlement.grids[].gridId` stays meaningful for homesteads only. Town/valley cells keep `gridCoord` + `gridType` as the shared "map"; `gridId` is null or points at an `ownerId: null` **template instance** the editor can inspect.
- `Grid.playersInGrid` is removed. `Player.location` is the only record of where a player is.

### 2.2 Authority

| State | Owner | Persisted | Validated |
|---|---|---|---|
| Player position, camera, timers, VFX | client | `location` on grid change + heartbeat on unload | no |
| NPC AI, positions, states | client (every client is the controller of its own grid) | one NPC snapshot per grid on leave/unload/every few minutes | only facts that pay out (kill, collect) at the transactional call |
| Resources / tiles in the player's own grids | client-authoritative for cosmetics; **server validates economic actions** against the player's own copy | server writes the copy inside the transactional call; cosmetic changes ride the snapshot | yes, inside action routes |
| Inventory, XP, skills, quests, trophies, messages, money | server (one action route per economic event, returns the player delta) | same call | yes |
| Homestead grid | owner's client, same rules as above; neighbours read-only | same | ownerId check on every write |
| Settlement / Frontier shared state (votes, offers, logs, timers) | server | schedulers + existing routes | existing checks, plus mayor/role checks |

The guiding rule: **every economic action is one server call that validates against the player's own grid copy and returns the player delta.** That replaces today's 5-7 calls per harvest with 1, and closes the trusted-delta routes at the same time. Non-economic state is snapshotted.

### 2.3 Networking

- HTTP for all gameplay. One bundle call per grid entry, one call per economic action, one snapshot per grid leave.
- socket.io stays, reduced to: `connect`/`disconnect`, `join-player-room`, `join-chat-rooms` (settlement + frontier scopes only; grid scope dropped), `send-chat-message`/`receive-chat-message`, `chat-badge-update`, `mailbox-badge-update`, `store-badge-update`, `force-refresh` (server-pushed reload for deploys/phase flips). No grid rooms, no controller election, no state sync.
- Phase changes (train arriving, carnival, season end) can be pushed over the player room socket as a `timers-changed` event so the 60 s poll goes away. Optional; the 1 s local countdown already handles it.

### 2.4 Async multiplayer, feature by feature

| Feature | Verdict | Change |
|---|---|---|
| Train | keep | Already per-player (`Player.train`) with a station on the homestead. Remove the town copy of the station or leave both doors. |
| Carnival | keep | Station exists in every town copy. Fix the population source (`Player.countDocuments({'location.s'})` becomes residents by `settlementId`). |
| Bank, Courthouse, elections, taxes | keep | Unchanged; add mayor/role checks on `/update-settlement`. |
| Leaderboard / net worth | keep | Net worth reads the homestead grid only (shared). Add a server `GET /leaderboard/:frontierId` top-N instead of 11 full player fetches. |
| Trade stall | keep | Per-player already. |
| Global market | keep | One `GET /market/:settlementId` route returning all residents' stalls; make the buy atomic. |
| Outpost | **cut** (D5) | Removed entirely. Global Market covers remote selling. |
| Mailbox | keep | Server-only message creation; client stops overwriting `messages[]`. |
| Settlement view | keep | Homestead cards unchanged; town/valley thumbnails resolve to the viewer's own copies; drop the dead `gridStates` payload; optionally show neighbours' homestead tile thumbnails. |
| Visiting a neighbour's homestead | read-only snapshot (D6) | Today it is a live visit (you are written into their grid). Replaced by a read-only snapshot view reached from the settlement screen. |
| Chat | keep | Settlement + frontier scopes. Grid scope dropped. |
| Dungeon timer | keep as a clock | Resets become per-player lazy (`resetEpoch` compare). The "auto-eject everyone" client logic goes. |

## 3. Design decisions

D1-D5 were decided by the owner on 2026-10-01 (marked **DECIDED**). D7-D9 proceed on the recommendation unless revisited.

**D1. Per-player grid storage: full copies vs deltas. DECIDED: full copies.**
Use **full per-player `Grid` documents** (same collection, same shape, `ownerId` + `gridCoord`). Rationale: it is what the current code already does for homesteads, so creation/reset/plantNewTrees/encoders/routes keep working with `gridId` as the handle; random valley layouts need no seeded RNG; the migration is "clone on first entry". Cost: 40-75 KB per visited grid, so a player who has seen 50 grids holds 2-4 MB. At today's scale (11 players) that is nothing; at 1,000 players × 50 grids it is 2-4 GB, which is when the delta/overlay option in `audits/grid-lifecycle-and-data-model.md` §4(c) becomes worth building behind the same `enter-grid` resolver. **Future optimisation note:** design the resolver so the storage format can change without touching the client; the trigger to revisit is `grids` collection size approaching the Atlas tier limit or write latency on harvest exceeding ~200 ms. Until then, full copies.

**D2. Season behaviour for per-player valleys. DECIDED: lazy tree top-up.**
Today the season end only tops up trees on valleys and snows/melts tiles; towns and homesteads keep their resources. Keep that semantics but apply it **lazily**: when a player enters a valley copy whose `seasonNumber < frontier.seasons.seasonNumber`, run `plantNewTrees` + snow/melt on that copy and stamp it. No sweeps. (Rejected alternative: regenerate valley copies from template every season; it would lose player-built valley structures.)

**D3. Dungeons: persistent per-player copy vs fresh run. DECIDED: per-player copy with lazy reset.**
Each player's dungeon copy is **reset lazily** when `grid.resetEpoch < frontier.dungeon.startTime` (the existing `needsReset` pattern with the flag moved onto the copy). The reset exists to prevent grinding: a cleared dungeon stays cleared until the frontier-wide 48 h dungeon clock rolls over, so loot and enemies cannot be farmed by leaving and re-entering. (Rejected alternative: regenerate on every entry, which would make grinding trivial.)

**D4. FTUE cave.** Instance `opening.json` per player at registration (`templateKey: 'ftue-cave'` flag replaces the hard-coded id in 8 files). Required for single-player; no alternative.

**D5. Outpost. DECIDED: cut the feature.**
Remove the Outpost entirely: the `/outpost/*` routes in `tradingRoutes.js`, `Grid.outpostTradeStall`, `GameFeatures/Trading/Outpost.js` and its panel wiring in `App.js`, the Outpost resource in `tuning/resources.json` and any layout placements, and the related strings. Global Market covers remote selling. Any items sitting in a live outpost stall at migration time are returned to the seller's warehouse by the migration script. (Rejected alternative: re-key the stall to a settlement-level document.)

**D6. Visiting neighbours' homesteads. DECIDED: read-only snapshot mode.**
Build a **read-only snapshot mode** reached from the settlement view (new `GET /homestead-snapshot/:gridId`, renderer `viewMode` with movement/clicks/timers disabled). Live entry into another homestead is removed from Transit. Defer to Phase 6; it is polish.

**D7. NPC persistence granularity.** Recommend one snapshot per grid (`saveGridStateNPCs` already serialises the right subset) on leave, on `beforeunload`, and every 2 minutes while in a grid, plus server-side derivation of `grazing/processing` from `grazeEnd` on load. Economic NPC events (farm-animal collect, kill rewards) stay transactional.

**D8. Socket lifetime.** Recommend connect on login and keep alive (one heartbeat per ~25 s is cheap and lets badges/notifications arrive). Alternative: connect only while the Chat panel is open.

**D9. Anti-cheat depth.** Recommend closing the routes that mint value directly (`update-profile` allowlist, inventory/XP/quest routes replaced by action routes, mailbox creation server-only, trade-stall escrow, Stripe verification) and leaving cosmetic trust (tile paint, NPC positions) alone. Full server simulation is out of scope.

## 4. Phases

Each phase is independently shippable and leaves the game playable. Phases 3 and 4 are independent of each other and can interleave. Estimates are in working days for one developer with Claude; they are rough.

### Phase 0: Prep (1-2 days)

- Docs: this plan, `architecture.md`, `known-issues.md`, `audits/`, `CLAUDE.md`. **Done.**
- Backup: `game-server/scripts/backup.js` dumps `players`, `grids`, `settlements`, `frontiers` as EJSON into `game-server/backups/<timestamp>/` (gitignored); `scripts/restore.js --dir --uri --yes` restores a dump into an explicitly named database (never defaults to `.env`, so rehearsals cannot hit production by accident). `mongodump` is not installed locally. Run the backup before every migration. **Built.**
- Dev safety: the socket URL in `socketManager.js:12` is hard-coded to production; route it through `config.js`. Point `game-editor/src/FrontierView.jsx` at the shared `API_BASE`. CORS accepts any `localhost`/`127.0.0.1` origin when `NODE_ENV` is not `production` (HTTP and socket.io share the rule). **Built.**
- **Service status + the two modals** (built here, used through Phase 2). Server env `SERVICE_MODE=normal|notice|maintenance` plus `SERVICE_MESSAGE`; `GET /api/status` returns `{mode, message, version}`. Client: revive the dead `checkServer` loop in `App.js:324-352` as a poll of `/status` at boot and every 60 s, and the server emits `force-refresh` on the player rooms whenever the mode flips so open sessions react within seconds.
  - **`notice` mode (Phases 0 and 1):** a **dismissable** modal that appears on **every app load/refresh** (never remembered in localStorage), shown to developers and non-developers alike, gameplay untouched. Text (English; add to `stringsEN.json`, translate or fall back to English in the other nine files):
    > Thank you for playing Secrets of Elsinore! We are undergoing a major game update. You can still play for now, but soon expect a maintenance window, after which the synchronous play will be removed in favor of a better single-player experience. Asynchronous multiplayer will remain. Thank you for your patience during these updates.
  - **`maintenance` mode (the Phase 2 window):** a **blocking** full-screen modal, no dismiss, no gameplay. Server returns 503 on every gameplay route for non-developer players (login and `/status` stay open) so a modified client cannot play through it. **Developer bypass:** when `isDeveloper` is true (`/check-developer-status`, `tuning/developerUsernames.json`) the modal shows an extra "Ignore (developer)" button that dismisses it, and the server exempts developer usernames from the 503 so devs can play and test the migrated world while everyone else is held at the modal.
  - **`normal` mode:** nothing shown.
  - **Built and verified 2026-10-01:** server booted in each mode; `/api/ping` and `/api/status` open, non-developer gameplay GET/POST 503 with the message, Oberon's id passes via header or body; client preview showed the notice modal with the exact copy (dismiss via X or Continue) and the blocking maintenance modal with no close control. The "Ignore (developer)" button was verified 2026-10-02 against the rehearsal copy as Oberon after a fix: the client now sends `x-player-id` from the stored player at module load (the first player fetch is the request the gate blocks, so the header could not wait for React state). The button appears a few seconds after the modal, once `/check-developer-status` returns.
- **Notice channels**: a `notices.json` on the server with a dated list of short player-facing notes; the login/start screen shows the latest one ("What's new"); a new mailbox template id 1002 "Release Notes" in `tuning/messages.json` sent with `/send-mailbox-message-all` after each production push; `TownNews` shows the latest notice too.
- Delete dead code with zero callers (list in `known-issues.md`): the three dead render generations, `ZoomedOut/*` except the minimap, dead server routes/models/layout dirs. Pure deletion, big readability win, no behaviour change. **Built:** 29 client files (~8,650 lines), 46 server routes (~1,500 lines), 6 server files, ~60k lines of dead layout JSON. Kept for a follow-up: `layouts/gridLayouts/valley1|2|3/` because the editor's `FileManager.jsx` still offers them as save targets (drop the three `<option>`s, then `git rm -r`); `scheduleHelpers.resetAllTimers/clearAllTimers` (now export-only).
- Remove the Outpost feature (D5): the five `/outpost/*` routes, `Grid.outpostTradeStall`, `GameFeatures/Trading/Outpost.js` and its App.js wiring, the `Outpost` entry in `tuning/resources.json`, and its single fixed-layout placement (`valleyFixedCoord/1013532.json`). **Built.** `scripts/refund-outposts.js` (dry run by default, `--apply` to write) pays sellers for bought-but-uncollected slots, returns unsold stock to their warehouse, unsets the field, and strips Outpost stations from every grid. Dry run on 2026-10-01: 17 grids with stalls, 29 refund lines (moehong gets 2 Apple Cider, 18 Stone, 35 Mushroom; three sellers are deleted accounts and their money is dropped), 5 stations removed.
- Notice copy for each push lives in `tuning/messages.json` template **1002 "Release Notes"**: edit its `body` on the phase branch, deploy, then `POST /api/send-mailbox-message-all {messageId: 1002}` once. The mailbox renders the template's current text, so the body must describe the latest push only.
- Done when: the client builds, the server boots, the backup script produces a restorable dump, all three service modes work end to end against a local client (notice modal every refresh for everyone; maintenance modal blocks a non-dev account and shows the Ignore button to a dev account; server 503s a non-dev gameplay call and allows a dev one).
- **Ship:** live, no maintenance. Branch `refactor/phase-0`, squash-merge to `main` (Render auto-deploys both services from `main`). Sequence: (1) `node scripts/backup.js`; (2) `node scripts/refund-outposts.js --apply` against production (the old client is still live, so do this right before the deploy); (3) merge, server deploys, then client; (4) set `SERVICE_MODE=notice` on the Render server service (restarts it); (5) `POST /api/send-mailbox-message-all {messageId: 1002}`. Mailbox note 1002: "Outpost retired; Global Market covers remote selling. More changes coming, the game stays up."

### Phase 1: Sockets out, every client is its own controller (3-4 days)

Scope: remove all grid-sync networking while grids are still shared. (With two active players this is safe; they would only conflict if both stood in the same town, and today they would conflict anyway.)

Client:
- `socketManager.js`: delete everything except connect/disconnect, `join-player-room` (fix the bare-string call at `App.js:1396`), chat, badges, `force-refresh`. Register listeners once, keyed on `playerId`, not on every `currentPlayer` change.
- Delete `GridState/NPCController.js`, `controllerUsername` state and props, the relinquish branch, the `set-username`/`request-npc-controller`/`join-grid`/`leave-grid`/`player-joined-grid`/`player-left-grid`/`player-moved` emits. `App.js:2265` becomes unconditional.
- `GridStateNPCs.js`: drop all `socket.emit` blocks and `moveOneTile`'s 1,200 ms promise.
- `PlayersInGrid.js`: collapse to a single-PC store (`addPlayer`/`addPC`/`updatePCLocal` become one constructor; `removePC`-of-others, `setAllPCs`, socket emits go). Keep the `getPlayersInGrid(gridId)[playerId]` read contract so the ~40 call sites do not churn.
- `PixiRendererPCs.js`: render only `currentPlayer`; remove `connectedPlayers`, PC hit-test, PC tooltip, the FTUE-cave hide hack. `SocialPanel` loses its "other player in grid" mode (the Leaderboard remains the way to see others).
- NPC behaviours: `pcs` becomes `[currentPC]` in enemy/quest/heal/spawner scans.
- `GridManagement.changePlayerLocation`: drop the leave/join emits and the `load-grid-state` of the source grid.

Server:
- `server.js`: delete grid rooms, `gridControllers`, `connectedPlayersByGrid`, `cleanupMemoryMaps`, and the sync handlers. Keep `join-player-room`, chat (settlement/frontier only), badges. Add a `force-refresh` emit helper.
- Delete `playerRoutes.js` `/send-player-home`'s socket emit (the route stays for the editor).
- `gridRoutes.js`: `/save-grid-state-pcs`, `/batch-update-pc-positions`, `/remove-single-pc`, `/save-single-pc` become no-ops or are deleted once the client stops calling them; `/load-grid-state` stops returning `playersInGrid`.

Done when: a full play session (homestead, town, valley, dungeon, Train, Carnival, Chat) works with the socket showing only chat/badge traffic in the network tab; `grep -r "socket.emit" game-client/src` lists only the keep-set.

**Built 2026-10-02 on branch `refactor/phase-1-sockets`.** Client: `socketManager.js` 867 → 113 lines (keep-set only, every listener returns `socket.off(event, handler)`); `NPCController.js` deleted; `App.js` lost the controller/connected-players/chat-mirror state and the duplicated socket effects (-270 lines) and the NPC tick runs unconditionally; `PlayersInGrid.js` is a single-PC store with the same read contract (665 → ~400 lines, one `buildPCRecord` helper, `removePC` refuses non-local ids); `GridStateNPCs.js` lost its emits, dead timers and duplicate setters, and `spawnNPC` uses the cached master resources; `AllNPCsShared.moveOneTile` applies positions immediately (no 1,200 ms stagger); enemy AI targets the one local PC; `Combat.handleAttackOnPC` deleted; `GridManagement.changePlayerLocation` no longer fetches the source grid's state or emits anything; `PixiRenderer` dropped `onPCClick`/`connectedPlayers` and `PixiRendererPCs` draws only the local player with a per-instance texture cache destroyed on unmount; `SocialPanel` is now just the player's own profile wrapper (408 → 91 lines); Chat has one subscriber and joins settlement + frontier rooms (grid scope gone). Server: `server.js` socket block reduced to `join-player-room`, `join-chat-rooms` (settlement/frontier), `send-chat-message`; grid rooms, controller election, presence maps and `cleanupMemoryMaps` removed; `/send-player-home` no longer emits; dead `/save-grid-state-pcs` and `/get-multiple-grid-states` deleted; new developer-only `POST /api/force-refresh` broadcasts a reload. Verified 2026-10-02: client lint clean, production build passes (main bundle -9 kB), server boot + curl checks (`force-refresh` 403 for a non-dev, 200 as Oberon), and a smoke session on a throwaway account (created, played, deleted): account creation, cave load, keyboard movement with collision, 5 s position batch, socket connect + player room join, and the NPC tick running every second with no controller (Constable Elbow is a `trade` NPC, a no-op by design, so roaming was not exercised in the cave). Also removed from the NPC loop a per-second `setAllNPCs` block that could never run (`getNPCsInGrid` returns the npc map, not `{npcs}`), so App no longer gets a state bump from that loop. Known gap: Chat.js still displays only frontier-scope messages, so settlement chat only lights the badge.

**Ship:** live, no maintenance; `SERVICE_MODE` stays `notice` (the dismissable update modal keeps appearing on every refresh). The old client against the new server is harmless (its grid-sync emits are ignored), so deploy server first, then client, then emit `force-refresh` so any open session reloads onto the new client. Mailbox 1002: "Other players no longer appear in your town or valleys. Chat still works. Smoother NPCs."

### Phase 2: Per-player Towns, Valleys, Dungeons (5-7 days)

Scope: the data model change and the single resolver. This is the heart of the refactor.

Server:
- Schema: add `gridCoord`, `templateKey`, `seasonNumber`, `resetEpoch` to `Grid`; unique index `{ownerId, gridCoord}`; drop `playersInGrid`. Add `isTemplate` (or treat `ownerId: null` + non-homestead as the template instance).
- New `POST /api/enter-grid { playerId, target }` where `target` is `{gridCoord}` | `'home'` | `'town'` | `{dungeonEntranceGridCoord}` | `'exit-dungeon'`. It: resolves the player's copy (find by `{ownerId, gridCoord}`, else create from template via `performGridCreation`), applies lazy season/reset catch-up (D2, D3), computes the spawn position (signpost/entrance/exit), writes `Player.location`, and returns one bundle `{ grid: {tiles, resources (enriched), npcs, gridType, region, ownerId}, location, spawn }`. This single route replaces `/load-grid`, `/load-grid-state`, `/update-player-location`, `/enter-dungeon`, `/exit-dungeon`, `/get-settlement-by-coords` + Transit math, `/homestead-gridcoord`, and the settlement scans.
- `templateUtils`/`createGridLogic`: cache the 384 fixed layouts + random layouts at boot (today each create re-reads JSON). `performGridReset` for dungeons takes the template name as a parameter instead of reading `frontier.dungeons`.
- `Frontier.dungeons` becomes a template registry keyed by **entrance gridCoord** (`{templateUsed}`); `entranceGrids` as gridIds goes away.
- Registration creates the FTUE cave instance (D4). `exit-dungeon` logic keys on `templateKey === 'ftue-cave'`.
- `/grids-tiles` (settlement thumbnails) resolves `(viewerId, gridCoord)`; `/get-settlement-bundle` drops `gridStates`.
- `seasonReset`: STEP 1 becomes `Player.updateMany` location=home + HP restore; STEP 2/2.5 become lazy stamps (D2); homestead snow/melt sweep stays (12 docs today). `dungeonScheduler` becomes a no-op (the timer's `startTime` is the epoch).
- Net worth: unchanged (homestead only).
- Editor: `/api/grids` and the Dungeons tab filter to template instances; `/create-grid` / `/reset-grid` / `/update-grid-region` target the template instance; region moves to the Settlement cell or template. `AtlasView` thumbnails read template instances.

Client:
- `changePlayerLocation` takes the bundle from `enter-grid`. Transit.js, `playerManagement.js` (death respawn), `Dungeon.js`, `FrontierMiniMap` Home/Town buttons, and the dev click handler shrink to "compute the target and call enter-grid". The five `gridCoord` parsers collapse into one helper.
- `AppInit.initializeGrid` consumes the bundle (no second `load-grid`, no `load-grid-state` fetches).
- Settlement/frontier views: no change except the resolver on the server side.

Migration (one-time script, `game-server/scripts/migrate-per-player-grids.js`, run after the backup):
1. For every player: set `location` to their homestead signpost (everyone goes home; both active players are mid-session in town/homestead and will re-enter on next login).
2. For Oberon and moehong (and any player with `location.gtype === 'town'`): clone their settlement's current town Grid as their personal copy (`ownerId`, `gridCoord`, `templateKey`) so anything built in town survives. Towns for everyone else are created lazily from the template on first entry.
3. Mark existing shared town/valley/dungeon Grid docs `isTemplate: true` (`ownerId: null`). Optionally delete the 1,034 valley docs (they regenerate from layouts; ~70 MB reclaimed) after a week of soak.
4. Drop `playersInGrid` and `outpostTradeStall` from all grids (returning any stocked outpost items to their sellers' warehouses first); drop the empty `resources` collection; create the `{ownerId, gridCoord}` index.
5. Create each existing player's FTUE cave instance only if `firsttimeuser` is still true.

Done when: two accounts can be in "the same" town at once with independent state; a fresh account runs the full FTUE in its own cave and town; `grids` count equals homesteads + templates + per-player copies; settlement view shows the viewer's own valley thumbnails; the editor still lists and edits templates.

**Server built 2026-10-02 on branch `refactor/phase-2-per-player-grids`** (contract: `docs/phase-2-contract.md`): `Grid` gains `gridCoord`, `isTemplate`, `templateKey`, `seasonNumber`, `resetEpoch` + indexes; `utils/gridResolver.js` (cell lookup from the frontier/settlement arrays, per-player copy find-or-create, lazy season catch-up, lazy dungeon reset, grid payload builder, `sendPlayerHome`); `utils/dungeonUtils.js` (template instance / per-player copy creation and reset); `utils/seasonTiles.js`; `routes/enterGridRoutes.js` (`POST /enter-grid` with targets coord/home/town/enter-dungeon/exit-dungeon/current); `performGridCreation` takes `ownerId`/`perPlayer` and stamps `templateKey`; `performGridReset` takes an explicit dungeon template; registration creates a per-player FTUE cave; `/grids-tiles` resolves the viewer's copies; `/get-settlement-bundle` lost `gridStates`; `/grids` lists templates only; `/create-dungeon` makes template instances; `/update-dungeon-config` takes `entranceGridCoords`; `Frontier.dungeons[*].entranceGrids` are gridCoords; `/enter-dungeon` and `/exit-dungeon` deleted; season reset sends players home by writing `location` and sweeps snow/melt over shared grids only (trees/snow on copies catch up lazily); `dungeonScheduler` is a no-op clock; `/relocate-homestead` moves `gridCoord` with the homestead; `/delete-player` removes the player's copies; `tuning.dungeon.phases.open` = 480 min. `scripts/migrate-per-player-grids.js` dry run on 2026-10-02: 1,045 cells stamped, 1,033 town/valley docs + 6 dungeons become templates, all 7+4+1+3+2 registry entrances converted to gridCoords (one orphan dropped), all 11 players sent home (none without a homestead).

**Client built 2026-10-02:** `changePlayerLocation(currentPlayer, target, …, arrival)` is the one executor over `POST /enter-grid` (leave-side flush, resolver call BEFORE removing the own PC so a refused move leaves the player in place, bundle seeding via `seedGridFromBundle` / `initializeFromData`, arrival = server `spawn` > `findSignpost` + offset > fallback); Transit computes neighbour coords and passes targets (no more settlement/grid lookups), Home/Town go through `{type:'home'|'town'}`, death respawn through `town`, dungeons through `enter-dungeon`/`exit-dungeon`, boot through `current`; the FTUE cave is a grid flag (`getGridMeta().isFTUECave`), the hard-coded id is gone from the client; one `parseGridCoord`; the dev settlement click travels by gridCoord; settlement thumbnails request the viewer's own copies; the editor maps dungeon entrances by gridCoord and never lists per-player copies. **Rehearsal 2026-10-02:** production dumped (`backups/2026-10-02T13-53-10-383Z`), restored into a scratch `vvgame_rehearsal` database on the same cluster, migrated with `--apply`, and the full client run against it as Oberon's copy: homestead boot via `current`, town trip creates `town/townNW` copy (ownerId Oberon, gridCoord 1010077), valley copy created once and reused, dungeon d001 copy created from his homestead's entrance with its NPCs and reused without reset, exit lands next to the entrance, a neighbour's homestead refused with 403, `home` returns correctly. Lint clean, production build passes (main bundle −3 kB).

**Ship: the one maintenance window (see §8.3).** Rehearsed (above); re-run the rehearsal if the migration script changes. Target under 2 hours of downtime; the season restart adds the existing 25-minute off-season modal on top.

### Phase 3: Server activity diet (3-4 days)

**Slice 1 (built 2026-10-03, branch `refactor/phase-3a-player-state`, contract `docs/phase-3-contract.md`):** player state off the grid. `Player.hp`/`Player.maxhp` added (seeded at registration and by `scripts/migrate-player-state.js`); `POST /api/player/state {playerId,x,y,hp,maxhp}` validates and clamps; `sendPlayerHome` restores hp; the client's `PlayersInGrid` record is built from the Player and persisted by the state route (30 s when dirty, grid leave/arrival, unload) with a localStorage mirror; `Grid.playersInGrid` and the four PC routes stay mounted this slice and are deleted in the next one, after the new client is live. Same slice: `scripts/move-players-to-settlement-0-1.js` moves every homestead into settlement (0,1) (directly north of valley (1,1), so edge walks never need diagonals), rewrites dungeon entrances that pointed at a moved homestead, deletes town copies from the old settlement, and closes the four corner settlements; `/create-homestead` skips closed settlements and `/relocate-homestead` refuses them. Both scripts rehearsed on the refreshed `vvgame_rehearsal` copy: 11 players seeded (10 from grid records, 1 from baseMaxhp); 10 homesteads moved into (0,1) (Entropoly already there), Oberon's d001 entrance moved 1010056 → 1010101; corners closed (one orphan homestead cell in (0,0) stays occupied). Seamless-world master plan recorded in the contract §3; not scheduled. **Client built and verified 2026-10-03** on the rehearsal copy as Oberon: boot via `current` with no state call (not dirty), three steps → localStorage mirror → `player/state` at the 30 s tick, town trip → flush on leave and after arrival, server shows the arrival position and hp; the new town copy has zero `playersInGrid` entries. Lint clean, production build passes.

**Slice 2 (built 2026-10-03, same branch, contract §4):** grid travel. Server: `GET /api/world-map/:frontierId?playerId=` (compact per-cell map, ~10 KB, closed = homestead settlement with `available:false`), `enter-grid` accepts `leave {fromGridId, npcPositions, state}` and applies it before resolving (owner-checked NPC batch, validated player state), `POST /api/grid-prefetch {playerId, gridCoord}` resolves/creates the copy without moving the player, `frontier-bundle` omits closed corners, the move script also deletes orphan homesteads in closed corners (one found in production: a deleted account's grid at 1010036). Client: validate with `canTravel` before the fade, one awaited request per crossing, fire-and-forget arrival flush, neighbour prefetch within 2 tiles of an edge, no-fade crossing when the bundle is cached (server commit sent without awaiting, revert on refusal), frontier view draws houses only where a grid exists and closed homestead settlements as empty. Verified 2026-10-03 on the rehearsal copy as Oberon: standing two tiles from the town's south edge, one sideways step fired `grid-prefetch` for the valley below; walking off the edge landed in the valley with no fade and a single deferred `enter-grid` (200), no errors. Server-side: `world-map` marks exactly the two closed corners, `grid-prefetch` creates a copy without moving the player and refuses a foreign homestead, `leave` moves an existing NPC and updates hp/position in the same request, and the cached crossing keeps a fade for now (marked TEMPORARY until seamless travel); a blocked direction shows "You can't go that way." (string 10021, EN/FR/ES/DE) with no fade; a `$set` on an unknown NPC id is now ignored (an earlier test with a bogus id had created a junk entry; the client hydration also skips malformed NPC entries).

**Ship (live, two deploys):** (1) merge → server deploys first with the new route and the old PC routes still mounted → run `node scripts/migrate-player-state.js --apply` → run `node scripts/move-players-to-settlement-0-1.js --apply` (backup first; players standing in a corner town are not an issue, everyone resolves via `current` on next load) → client deploys → `force-refresh`. (2) Next slice deletes `Grid.playersInGrid`, `playersInGrid` from the bundle and the four PC routes.


- Scheduler: `mainScheduler` sleeps until `endTime` (+ a 5-minute resync) instead of polling every 15 s. Idle load drops from 2,160 reads/hour to ~12.
- NPC persistence: replace `save-single-npc` per transition and the 10 s position batch with the per-grid snapshot (D7). Server derives `grazing/processing` from `grazeEnd` on load. `spawnNPC` uses the cached master resources.
- Player refresh: action routes return the updated inventory/backpack/xp slice; `refreshPlayerAfterInventoryUpdate`'s `GET /api/player` after every gain/spend goes away. `GET /api/player` stays for login and panel opens only.
- Timers: client polls `get-frontier` only on phase expiry (and on a `timers-changed` socket push if built); add `GET /api/timers/:frontierId` returning the nine `{phase,endTime}` pairs instead of the full Frontier doc with populated settlements.
- `TownNews` fetches once on open, not every second. `checkServer` 2 s interval deleted. FarmState maturation writes batch into one `PATCH` per tick.
- Leaderboard, Global Market, Season panel: single server routes with projections (see §2.4).
- Done when: an idle client makes zero HTTP calls per minute; a 10-minute play session shows under ~60 HTTP calls; the server log at idle shows one scheduler read per phase expiry.
- **Ship:** live, in slices. Each slice adds the new route, deploys server, deploys client, then deletes the old route in the next slice. Never remove a route the live client still calls. Mailbox 1002 once at the end of the phase, not per slice.

### Phase 4: Client performance (4-6 days, interleaves with Phase 3)

**Feel benchmark (2026-10-03).** Doober collection is the reference for "feels good": the click removes the sprite, plays VFX, floating text and SFX before any await, the server validates in parallel, and only a real conflict rolls back (`ResourceClicking.js:339-361`). Player movement is the reference for "feels bad": no held-key loop (each step needs a fresh `keydown`, so the OS key-repeat delay is the first thing the player feels), one whole-`App` commit plus a synchronous localStorage write per step, and a camera that scrolls a 368,640 px DOM container. Every interaction touched in this phase should be measured against the doober.

**Updated plan: `audits/client-review-2026-10-03.md`** supersedes the list below for the renderer (its §2.5 A-E: build-time SVG/emoji atlas, Pixi-owned viewport camera, diffed layers, held-key movement loop + touch, slim React boundary) and adds the App-level churn fixes (its §1.7: timers provider, store subscriptions in the Pixi layers, panel mount fetches, redundant player refresh GET, dev tooling and strings out of the main chunk). Do the atlas first (visible on day one, no camera risk), then camera + movement loop together (fixes feel, unblocks phones). **A (atlas) built 2026-10-03:** `scripts/build-atlas.js` + `AtlasTextures.js`; 327 frames (130 SVGs + 197 Twemoji emoji) on six 2048 px sheets, 2.3 MB WebP on the wire instead of 48 MB of SVG, zero per-file rasterisation and no `PIXI.Text` in the world layer (four emoji newer than Twemoji 15 still fall back to text). Emoji policy decided: Option 1, Twemoji, **as a stopgap**. Owner's direction (2026-10-03): the game board will eventually use sprites for ALL art, no emoji at all; emoji stay only in UI panels. That needs an art pipeline, not just an atlas: a source folder per asset (SVG or PNG master), a naming convention tied to `resources.json` `filename`, the atlas script as the only way art reaches the client, a `check:atlas` gate before deploy, and a way to add or replace one asset without hand-editing sheets. Track as Phase 4 item A2 ("art pipeline"): design doc `docs/art-pipeline.md` (to write), then replace the ~200 Twemoji frames with commissioned sprites in batches by category (doobers and crops first, they are the most visible).

**B + D (camera and movement loop) built 2026-10-03:** `Render/PixiRenderer/PixiCamera.js` owns the camera: the canvas is the size of the visible board, `worldContainer` is scaled and positioned so the player sits at the board's centre, zoom is a 220 ms time-based ease on `worldContainer.scale`, and one DOM overlay (`.pixi-world-container`, laid out in base px with the current grid at the origin) gets the same CSS transform so floating text, DOM VFX, the FTUE doinker and the settlement/frontier previews follow for free. The 368,640 px scroll container, the 256 padding divs, the per-frame DOM writes and three of the four `centerCameraOnPlayer*` variants are gone. Movement: `PlayerMovement.js` steps every `MOVEMENT_STEP_MS` (90 ms) from a timer loop while a direction key is held, first step immediate, OS auto-repeat ignored; `PlayersInGrid.updatePC` coalesces position-only React syncs to one per 150 ms and the localStorage mirror to one per second, and the PC/range layers read the store directly. Verified in the rehearsal preview: 8 tiles per 700 ms hold, all four zoom levels, settlement and frontier previews in place, click hit-testing through `PixiCamera.screenToTile` (collected a doober). Not yet verified in-browser: a grid change (needs a Horse; the preview pane was hidden before Oberon could be used). Grid change verified later the same day with Oberon's rehearsal copy (edge travel east, camera centred on arrival). **Touch built 2026-10-03:** tap-to-walk (`Utils/Pathfinding.js` A*, 8 directions, no corner cutting, blocked goals end adjacent; `PlayerMovement.walkTo` queues the steps through the same 90 ms loop; keys, modals, zoom-out, grid change or a new tap cancel it; one re-plan when blocked mid-walk), applied to empty tiles and to out-of-range resources and helper NPCs (enemies keep the plain click; cursor modes, the own-homestead dirt shortcut and dev teleport keep priority), long-press (450 ms) for the tooltip, pinch to step zoom in/out (ratio 1.25 per step), viewport meta locked against browser pinch. Verified: tap walked 63,31 → 57,31; long-press on an empty tile showed nothing and the following tap still walked; pinch out → "closer", pinch in → back. Previews are still HTML; moving them into Pixi is the seamless-world step. **Phone layout built 2026-10-03:** `game-client/src/UI/Styles/mobile.css` (one `@media (max-width: 767px)` block, imported last from App.js) re-arranges the existing elements: header = two horizontally scrollable rows (numbers, then actions; `.header-secondary` wrapper added in App.js), status bar full width under it, the board fills everything down to a bottom bar made of the same nav buttons, panels and chat become full-screen sheets, modals fit the viewport, zoom is two round buttons on the board, the base panel is hidden (its content, the season countdown, Town News and How to Play, needs a home for phones: a "Home" sheet from the 👸 button is the obvious one). The fade overlay now reads the board's rect at fade time. Landscape phones get a one-row header. index.html carries the home-screen metas. NOT yet verified on a device or in the preview (the in-app browser pane was hidden when the work landed); first thing to check is the header rows and the bottom bar on a 390 px viewport. **Same day, two follow-ups:** the board can be looked around again (the old DOM scroll gave this for free): `PixiCamera.panBy` moves the view by screen px from the trackpad / wheel (native non-passive listener in PixiRenderer) or a one-finger drag; it clamps so the viewport centre stays inside the grid, or the settlement / padded frontier when zoomed out (`setPanBounds`), and resets the moment the player moves or the zoom changes. Verified: wheel deltas pan, the clamp holds at both grid edges, the first step snaps back. The "Unsupported Device" modal that blocked every mobile user agent is gone; `isMobile()` in appUtils is now unused by App. The phone layout itself is still unverified (the preview pane kept hiding), though the measured rects at 375 px were right for header, board and bottom bar; the status bar needed the stylesheet moved to the end of the import order (now in index.js). **Then (owner requests):** a pan eases back to the player over 350 ms when movement starts while the view is panned away (`PixiCamera.startPanReturn`, cancelled by a new pan or a zoom; the step itself is not delayed), and walking onto a doober collects it through the very same click path (`PlayerMovement.processMovement` calls App's `onEnterTile`, which is `handleTileClick(row, col)` unless a placement cursor is active, so inventory, VFX, feedback, quests and the server call are unchanged). Both are unverified in the preview (pane hidden); the build passes. **2026-10-04, phone layout verified in the preview at 375x812** (header rows 58 px, status bar full width, board 375x678, bottom bar, round zoom buttons) and the base panel got its phone home: the 👸 bottom-bar button toggles it as a full-screen "Home" sheet (`isHomeSheetOpen` in App.js, `.base-panel--open` in mobile.css, close button only on phones, any panel opening closes it); sheets sit above the zoom buttons; the Ko-fi widget is hidden on phones because it covered the first bottom-bar button. **2026-10-04 bug pass (owner):** (1) position persistence: the unload save used a synchronous XHR, which browsers no longer deliver during page dismissal, so a refresh after walking lost the position; now `navigator.sendBeacon` on pagehide / beforeunload / hidden tab (the gate accepts `playerId` in the body), a 2 s settle flush after the last step, and `flushAfterTransaction()` at NPC kill, quest reward, NPC trade, heal, craft collect and store purchase; (2) the phone stylesheet forks by orientation (shared / portrait / landscape, see CLAUDE.md); (3) portrait notifications could not be dismissed because the zoom buttons sat over the dismiss button: zoom buttons moved to the board's bottom-right in portrait and the notification container now stacks above them; (4) Ko-fi stays hidden on phones in both orientations. **Then (owner, same day):** phones get the floating tab bar from SimGame: a rounded pill over the board (bottom in portrait, left in landscape) detached from the panels, and panels, Home sheet and chat become one box docked at the left (58vw in portrait, 44vw in landscape, capped at 400 px) that slides in from the left in both orientations and slides out on close, so the board stays playable beside an open panel. The board now runs the full height under the pill. Unverified in the preview (pane hidden); build passes. **Then (owner, 2026-10-04 afternoon):** a board tap closes an open panel or the Home sheet on phones (`onBoardTap` from PixiRenderer; the tap still acts); the phone header is three rows in both orientations: the stats (name, level, health, inventory, gems, money) laid out by a 5-column grid with their fill bars under level, health and inventory, then the secondary commands as icons only (App.js `headerLabel` keeps the leading emoji on phones; order Store, Inbox, Settings, Leaders, Chat, Language, Share; centred in portrait, left in landscape); zoom buttons float at the board's top-left in both orientations with the landscape pill starting below them; landscape keeps `env(safe-area-inset-left)` clear with a black strip for the iPhone camera housing; a board tap also scrolls the document 1 px (kept 1 px taller than the viewport) as a best-effort nudge for Safari to collapse its bars. The Add-to-Home-Screen FTUE prompt is backlog item BL-1 (`docs/backlog.md`). All unverified in the preview (pane hidden); build passes. **Then:** a relationship action (Talk, Joke, ...) with the NPC panel open reveals the avatar in the board region right of the panel: `PixiCamera.revealPlayerIn(region)` eases the pan so the avatar sits at that region's centre when it is covered or off-screen, via `PlayerMovement.revealPlayerBesidePanels()` from the non-instant `centerCameraOnPlayer` the NPC panel already calls; grid arrival still snaps. **Then:** the panel slide-out finally plays on every close path: panels unmount through several states, so `UI/Panels/panelExitGhost.js` watches the DOM and leaves a static clone (`.panel-ghost`) behind to play the exit before removing it (PanelContext closes immediately again). And edge transit without keys: a tap in the green beyond an edge walks to the nearest edge tile and takes one crossing step in the overshoot direction (`walkTo` clamps the goal and remembers `pathCrossDelta`), so the Horse / closed-settlement / can't-go-that-way rules apply as with keyboard.

From `audits/client-npc-and-rendering.md` §B5, in order of payoff:
1. Stop re-rendering `App` every second: NPC loop writes only to `NPCsInGridManager`; Pixi's NPC layer subscribes to the manager; `setCountdowns` moves into a leaf component.
2. `PixiRendererVFX`: on-demand ticker like the PC layer; pre-drawn range circles.
3. Memoise `pcs` and the five `gridOffset` literals (`gridOffset` is always `{0,0}`).
4. Tile layer: one `RenderTexture` + one sprite per grid (1 draw call instead of 4,096 display objects); clear `tileTextureCache` on grid change.
5. Resource layer: diff by `"x,y"` key, pool `Text`, stop bumping `animationVersion` for grow VFX.
6. Collapse `App.js` intervals to one with `[]` deps reading managers through refs; depend on `playerId` not `currentPlayer` for listener/keyboard effects.
7. Tooltip/hovered-tile state out of `App` (ref + leaf component).
8. Unmount the hidden settlement/frontier DOM (~16.6k nodes) when not zoomed out; collapse `PixiRendererPadding` (256 divs) to one gradient; drop `SVGAssetManager.preloadResourceSVGs` from the grid-change path.
9. Index world lookups: `Map<"x,y", resource>` and `Map<type, masterResource>` used by movement, AI, LOS, hit-tests.
10. Strip `console.log` from per-tick/per-step paths.
- Done when: React DevTools shows no `App` commits while idle; grid-change fade is under ~300 ms on a mid phone; memory is flat across 20 grid changes.
- **Ship:** live, client-only pushes, one perf item per merge so a regression is bisectable. Players notice this phase most; say so in the notice.

### Phase 5: Transaction hardening (4-6 days, incremental)

Introduce action routes that do the grid mutation and the player reward in one validated step, each with the existing `transactionId` idempotency guard, and retire the trusted routes behind them:

| New route | Replaces | Validates |
|---|---|---|
| `POST /action/harvest {gridId, x, y}` | `update-grid` + `update-inventory-delta` + `addXP` + quest progress | resource exists in the player's copy and is harvestable; yield from master resources + skills; capacity |
| `POST /action/place {gridId, x, y, type}` | `update-grid` (build/buy/plant/deco) | cost from master resources; placement rules; limits from `globalTuning` |
| `POST /action/terraform {gridId, x, y, tile}` | `update-tile` | cost |
| `POST /action/npc-kill {gridId, npcId}` | `remove-single-npc` + `addXP` + drops | NPC existed with hp ≤ 0 in the snapshot or the server's last known state |
| existing `/crafting/*`, `/bulk-harvest`, `/farm-animal/collect` | keep; make them grant the item server-side (today they leave the grant to the client) and look up recipes/yield from master data instead of the payload | |
| `update-profile` | keep with a field **allowlist** (settings, language, icon, ftuestep, aspiration, feedback) | |
| mailbox | message creation server-only; delete `/update-player-messages` and `customRewards` | |
| trade stall / requests | deduct stock on list, escrow `moneyCommitted` on request, atomic buy | |
| store | verify the Stripe Checkout session server-side before granting | |
| settlement | mayor/role checks on `/update-settlement`, `/update-settlement-role` | |

Done when: `grep` finds no client call to `update-inventory-delta`, `update-inventory`, `addXP`, `update-skills`, `update-player-quests`, `update-player-messages`; a tampered client cannot mint money or items through any route in `audits/server-routes.md` §5.

**Ship:** live, route by route, same add-then-remove rule as Phase 3. No player-visible change, so no notice unless a bug slips.

### Phase 6: Async multiplayer polish (2-4 days)

- Read-only homestead snapshot view from the settlement screen (D6).
- Homestead tile thumbnails for neighbours in settlement view.
- Carnival population source. Global Market single route + atomic buy. Leaderboard top-N route.
- Optional `timers-changed` socket push.
- **Ship:** live. Mailbox 1002: "You can now visit your neighbours' homesteads from the settlement view."

## 5. API after the refactor (shape, not the full list)

Kept as-is: auth, tuning/content GETs, trade stall, crafting, bulk harvest, farm-animal collect, mailbox collect, trophies, relationships, settlement/frontier reads, elections, carnival offers, payments (with verification), analytics, editor routes (re-pointed at templates).

New: `POST /enter-grid`, `POST /grid-snapshot` (NPC + cosmetic state on leave), `POST /action/*`, `GET /timers/:frontierId`, `GET /leaderboard/:frontierId`, `GET /market/:settlementId`, `GET /homestead-snapshot/:gridId`.

Deleted: every `gridRoutes.js` PC/NPC route except `load-grid-state` (folded into `enter-grid`), `update-player-location`, `enter-dungeon`, `exit-dungeon`, `load-grid` (client; editor keeps it), `update-grid`, `update-tile`, `update-inventory*`, `addXP`, `update-skills`, `update-powers`, `update-player-quests`, `update-player-messages`, `send-player-home` socket emit, all dead routes in `known-issues.md`.

## 6. Socket contract after the refactor

| Direction | Event | Payload | Purpose |
|---|---|---|---|
| client → server | `join-player-room` | `{playerId}` | private notifications |
| client → server | `join-chat-rooms` | `{settlementId, frontierId}` | chat scopes |
| client → server | `send-chat-message` | `{playerId, username, message, scope, scopeId}` | chat |
| server → room | `receive-chat-message` | message | chat |
| server → room | `chat-badge-update` | `{hasUpdate}` | badge |
| server → player | `mailbox-badge-update`, `store-badge-update` | `{playerId}` | badges |
| server → player/all | `force-refresh` | `{reason}` | deploy / season flip |
| server → player (optional) | `timers-changed` | `{feature, phase, endTime}` | replaces the 60 s poll |

## 7. Risks

- **Scope creep inside Phase 2.** The resolver touches Transit, dungeons, FTUE, settlement view, season reset, and the editor at once. Mitigation: land the schema + resolver first with the old routes still mounted, switch callers one at a time, delete routes last.
- **Template drift.** Per-player copies freeze the template at creation. Editor fixes to a town layout will not reach existing copies. Mitigation: `templateKey` + a `templateVersion` stamp; offer a "regenerate my town" dev action; accept the drift for valleys (they are consumable).
- **Storage growth** (D1). Measured, not a problem until ~1,000 active players; the resolver isolates a later switch to deltas.
- **Client-side trust remains between Phases 2 and 5.** No worse than today. Phase 5 closes it.
- **Data loss for inactive players.** Everyone is sent home in the migration; only town copies of players standing in town are cloned. Acceptable per the brief; backup first.
- **Hard-coded production URLs** in the client socket and the editor mean local testing has been hitting production. Fix in Phase 0 before anything else.
- **`NODE_ENV=production` locally** would run the schedulers against the live Frontier. Never set it locally.

## 8. Delivery: branches, deploys, the maintenance window, communication

### 8.1 Branching and commits

- `main` is production. Render auto-deploys both services from it, so **a push to `main` is a deploy**. Never push work in progress to `main`.
- One branch per phase (`refactor/phase-1-sockets`, `refactor/phase-2-per-player-grids`, ...). Commit often on the branch with real messages (the history to date is placeholders). Squash-merge to `main` when the phase's done-criteria pass locally against production data, then tag `v2.<phase>`.
- Phases 3-5 ship as several merges each (one route or one perf item per merge). Phase 2 ships as one merge inside the maintenance window.
- Server and client are separate Render services. Deploy order is always **server first, then client**, and every server change must tolerate the previous client for the few minutes between (keep old routes mounted until the new client is live).

### 8.2 Keeping the game live

Only Phase 2 needs downtime, because it changes the Grid schema and runs a migration. Everything else is additive or deletes code the live client no longer calls. The rule for live phases: a change is safe to push if the current production client keeps working against the new server. Verify that locally by running the new server against the built old client before merging.

For the two active players: `force-refresh` after each client deploy reloads any open session onto the new build. A mailbox note (template 1002) after each phase tells them what changed, and from the Phase 0 deploy until the maintenance window the dismissable update notice greets every refresh so nobody is surprised by the downtime.

### 8.3 The maintenance window (Phase 2) and the Winter restart

Pre-window, on the branch:
1. Rehearse: run the backup script against production, restore it into a local database, run the migration against the restore, play through as Oberon's clone and a fresh account. Fix, repeat until clean.
2. Draft the notices: login-screen banner 48 h ahead ("Maintenance <date> <time> ET, about 2 hours. Fall ends; Winter starts fresh."), mailbox 1002 to all with the same text.

Window (target under 2 hours):
1. Set `SERVICE_MODE=maintenance` on the Render server service; emit `force-refresh`. Non-developer clients show the blocking maintenance modal and their gameplay routes return 503; developer accounts get the "Ignore (developer)" button and keep full access for testing.
2. Run the backup script (keep the file).
3. Merge `refactor/phase-2-*` to `main`; wait for both Render deploys.
4. Run `node scripts/migrate-per-player-grids.js` (dry run, read the plan) then `node scripts/migrate-per-player-grids.js --apply` against production: stamps gridCoords, marks templates, converts dungeon entrances to gridCoords, clones the town for anyone standing in one, sends everyone home, creates FTUE caves for players without a homestead, syncs indexes.
5. Smoke test with a developer account (Ignore the modal; dev usernames bypass the 503): homestead, town, valley, dungeon, Train, Carnival, chat; then FTUE on a brand-new account temporarily added to `developerUsernames.json`.
6. **Winter restart:** `POST /api/force-end-phase {frontierId: '684743fab301fcbdbcb77253', event: 'seasons'}` (send a developer `x-player-id` header or body `playerId` while maintenance mode is on). The season chain runs `seasonFinalizer` (Fall rewards mailed, season log written) and the Phase 2 `seasonReset` (everyone home, lazy stamps), then 25 minutes later flips to `onSeason` as season 38, Winter. The off-season modal covers that gap for anyone who logs in early. Season 37 was Fall and would otherwise run to 2026-11-27, so no tuning change is needed to land on Winter.
7. Set `SERVICE_MODE=normal`; emit `force-refresh`. Mailbox 1002 to all: "We're back. Winter has begun. Towns and valleys are now yours alone; neighbours are still next door."

Rollback: if step 5 fails, redeploy the previous `main` tag to both services, restore the backup (players, grids, settlements, frontiers), set `SERVICE_MODE=notice`. The migration script writes only the four collections the backup covers.

### 8.4 Communication plan

| Channel | Exists today | Use |
|---|---|---|
| Mailbox to all (`/send-mailbox-message-all`, template 1002 "Release Notes") | templates 1000/1001 exist; 1002 added in Phase 0 | after every production push with a player-visible change |
| Login/start screen notice (`notices.json`) | new in Phase 0 | upcoming maintenance 48 h ahead; "what's new" after each phase |
| Update notice modal (`/api/status` mode `notice`, dismissable, every refresh, everyone) | new in Phase 0 | from the Phase 0 deploy until the Phase 2 window opens |
| Maintenance modal (`/api/status` mode `maintenance`, blocking for non-devs, Ignore button for devs) | new in Phase 0 | during the Phase 2 window only |
| Town News modal | exists | mirrors the latest notice |
| Website (`secretsofelsinore.com` landing) | exists | one line: "Winter season live, the game is now single-player with shared settlements" |

Players have no email on file, so in-game and the website are the only channels.

## 9. How we will know it worked

| Metric | Before | Target |
|---|---|---|
| HTTP calls per grid change | 10-14 | 2 (`enter-grid` + the previous grid's snapshot) |
| HTTP calls per harvest | 5-7 | 1 |
| HTTP calls per idle minute (client) | ~1 + NPC saves | 0 |
| Frontier reads per idle hour (server) | 2,160 | ~12 |
| Socket events per NPC step | 2 | 0 |
| `App` re-renders at idle | 1/s | 0 |
| Dead render files in `src/Render` | ~15 | 0 |
| Routes that trust a client-supplied inventory/XP delta | 8 | 0 |
| Grid documents | 1,063 shared | homesteads + templates + per-player copies |
