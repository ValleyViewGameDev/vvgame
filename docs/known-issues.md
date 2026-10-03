# Known issues found during the 2026-10-01 audit

Bugs and hazards that are **independent of the refactor** (they exist today and would exist after it).
Fix opportunistically, or fold into the phase that touches the file. Sourced from `audits/`.

## Security / data exposure (fix before any marketing push)

- No auth middleware anywhere; `playerId` in the body is the identity. Admin routes are open to anyone: `/reset-password` (sets password to `temp`), `/delete-player`, `/send-mailbox-message-all`, `/update-settlement`, `/update-settlement-role`, `POST /tuning` (rewrites `globalTuning.json`), `/reset-all-timers`, `/force-end-phase`, `/levy-tax`, `/create-frontier`, `/remove-homestead`, `/reset-grid`, `/manual-grid-reset`.
- `GET /player/:id`, `/get-player-by-username/:u`, `/get-players-by-frontier/:f` return the full document **including the bcrypt password hash**. `/get-players-by-settlement` accepts a client-supplied projection.
- ~~`/api/save-layout` and `/api/load-layout` in `server.js` take `directory`/`fileName` unsanitised (path traversal).~~ Deleted in Phase 0.
- `/purchase-store-offer` grants Gold with no Stripe verification (no webhook, no session check).
- `/update-profile` `$set`s any field (inventory, xp, accountStatus, role, gridId). 42 client call sites. Needs a field allowlist.

## Correctness

- `worldRoutes.js` `/relocate-homestead` assigns to an undeclared `updated` (sloppy-mode global; throws under strict/ESM).
- `Grid` has no `gridCoord` field, yet `worldRoutes.js` reads `grid.gridCoord` in three places (undefined).
- `/create-dungeon` writes the string `'global'` into ObjectId `frontierId`/`settlementId` when absent.
- `/exit-dungeon` early-returns without clearing `sourceGridBeforeDungeon` when the entrance resource is missing.
- `/enter-dungeon` resets the shared dungeon grid for everyone when `needsReset` is set (goes away with per-player dungeons).
- `/get-global-season-phase`, `/get-season`, `/reset-season` use `Frontier.findOne()` (first frontier, not the player's).
- `GET /load-grid` performs a write (strips `growEnd` from doobers) on a read route.
- `PATCH /update-grid` responds 202 and swallows save errors; the client never learns a write failed.
- `/sell-for-refund` refunds but leaves the station; re-calling with a new transactionId refunds again.
- `messageScheduler` dereferences `io` unconditionally (crashes when null) and sends the daily message to **every player in the DB**, once per frontier.
- `seasonReset` snow/melt sweep includes dungeon grids (no `gridType` exclusion, unlike `resetGridLogic`).
- `electionScheduler` leaves stale `votes`/`campaignPromises` when there is no winner.
- `mainScheduler` `*Processing` lock fields are not in the schema and are stripped under strict mode; only the `endTime` compare-and-set protects transitions.
- `mainScheduler` computes `delayMs` to the real `endTime` and then ignores it, polling every 15 s.
- `templateUtils.getTownLayoutFile` falls back to `town/town_default.json`, which does not exist.
- `tuningConfig` is `require`d at boot in four files, so `POST /tuning` edits are invisible until restart.
- ~~Client: eight socket `useEffect`s in `App.js` never return their cleanup, so handlers accumulate on every `currentPlayer` change.~~ Deleted in Phase 1.
- ~~Client: `socket.off(event)` without a handler removes every listener for that event.~~ Fixed in Phase 1 (named handlers everywhere).
- ~~Client: `App.js:1396` emits `join-player-room` with a bare string.~~ Fixed in Phase 1.
- Client: `Transit.js` returns on three error paths without `endTransition()` (screen stays black).
- ~~Client: `NPCEnemyBehavior.js:277` wrong `this`; `NPCHealBehavior.js:33` uses `pc.range`.~~ Fixed in Phase 1.
- ~~Client: `App.js:329` server ping is commented out, so the "server down" modal can never fire and the 2 s interval is a no-op.~~ Replaced in Phase 0 by the `/api/status` poll (`ServiceStatusModal`).
- Client: `gridType` enums disagree (`valley` vs `valley0`) between models and client checks.

## Unbounded growth

- `Player.messages` entries with `neverPurge:true` (welcome, store, season mail) accumulate forever.
- `Player.lastTransactionIds` / `activeTransactions` maps are never pruned.
- `Player.trophies` only grows (by design, but note it).

## Dead code worth deleting (zero callers confirmed by grep)

Server: ~~`utils/TileEncoder.js.backup`, `models/resource.js`, `models/combat.js`, `models/town.js`, `utils/inventoryUtils.js` (all but `isCurrency`), `utils/fileUtils.js` layout loaders, `routes/playground-2.mongodb.js`, `utils/IDs.js`, and 46 routes with no client or editor caller~~ (deleted in Phase 0). Still present: `Settlement.currentoffers/nextoffers` (schema fields, read only by TownNews), `Frontier.governor`, `scheduleHelpers.resetAllTimers/clearAllTimers/activeTimers` (export-only), `gridLayouts/valley1|2|3/` (editor FileManager offers them as save targets; drop the options, then delete).

Client: ~~every `Render/*.js` outside `Render/PixiRenderer/` except `RenderAnimatePosition.js`, `RenderDynamicElements.js` (keep the three tooltip helpers, drop the component), `SVGAssetManager.js` (only used to warm a cache Pixi never reads); `ZoomedOut/*` except `FrontierMiniMap.js`~~ (deleted in Phase 0: 29 files, ~8,650 lines); `GridState/NPCController.js` (Phase 1); `Combat.handleAttackOnPC`; `PlayerMovement.js` camera helpers (`centerCameraOnPlayerFast/Settlement/Frontier/Instant`); `ResourceHelpers.mergeResources/validateTileType`; `GridStateNPCs.saveGridStateNPCs/startGridTimer` (reconsider: the snapshot save is the right shape for Phase 3).

Root: `translate.js`, `testFileUtils.js`, top-level `package.json` (openai dep, unused by either app).

## Found 2026-10-03 while testing Phase 3 (fixed on `refactor/phase-3a-player-state`)

- Badges set or cleared by panels (`Mailbox`, `Store`, `Chat` call `updateBadge` with a no-op setter) never reached App state; the header dot and the mailbox overlay only changed through the old socket echo. `updateBadge` now dispatches `vv-badge-change`, which App subscribes to.
- The Kent overlay (`checkKentNPCStatus`) ignored Kent's timer and the per-card cooldowns, so the checkmark stayed after a purchase. It now reads `kentOffers.endTime` and the `kentCardCooldowns_<playerId>` localStorage entry, and NPC overlays re-evaluate every 10 s so time-based states expire visibly.


## Found 2026-10-03 in the client review (not yet fixed; details in `audits/client-review-2026-10-03.md`)

- `game-client/src/App.js:4623` has a stray `)}` after the TradeStall block. It parses and renders as literal text in the panel area.
- The inactivity effect (`App.js:3121-3195`) adds a `visibilitychange` listener on every run (deps `[currentPlayer, gridId]`) and never removes it.
- `let isProcessing` (`App.js:2619`) and `let isInitializing` (`App.js:1309`) are render-body variables, so the double-click and double-init guards reset on every render and never block.
- The timers effect (`App.js:2258-2268`) depends on the whole `currentPlayer`, so every `setCurrentPlayer` fires `GET /api/get-frontier/:id` and recreates the 1 s countdown and phase intervals.
- `TransitionContext.js:13-14` fades an overlay at `top: 85px; left: 300px`; the board starts at `84px / 240px` (`App.css:383-387`), so a 60 px strip of board never fades.
- `SoundManager` references `sfx_success.mp3` and `sfx_heal2.mp3`; the files are `sfx_succes.mp3` and `sfx_heal.mp3`.
- `Modal.js:11` only ever applies `modal-small`; `modal-medium/large/xlarge` in `Modal.css:68-89` are unreachable and every other modal inherits `min-width: 400px`.
- `isMayor` state (`App.js:401-418`) is set and never read; computing it costs two GETs per location change.
- Six of the ten `UI/Strings/strings*.json` (FI, IT, NO, PT, RU, SV) are byte-identical English stubs, and all ten are statically imported into the main bundle.
- `public/sound/music/homestead2.mp3` is byte-identical to `homestead.mp3` (7 MB each).
- Dev tooling (`Utils/debug.js`, 1,435 lines, 30 calls to admin endpoints) is a static import and ships to every player.
