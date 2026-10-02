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
