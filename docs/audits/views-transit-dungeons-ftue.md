# vvgame audit: zoomed-out views, transit, dungeons, FTUE, editor coupling

Read-only audit for the "single-player world + shared homesteads" refactor. All paths are relative to `/Users/jonathanknight/GameDevelopment/vvgame/`. `C:` = game-client/src, `S:` = game-server.

Key data-model facts that everything below depends on:

- `Settlement.grids[row][col]` = `{ gridId, gridCoord, gridType, available }` (S:models/settlement.js:8-26). This 8x8 array is the ONLY map from a world cell to a Grid document. Every transit, snapshot, visited-tiles and homestead-coord lookup walks it.
- `Grid` has `gridType, region, NPCsInGrid, playersInGrid, frontierId, settlementId, ownerId, tiles (base64, 4 bits/tile), resources (encoded)` (S:models/grid.js:3-117). It has NO `gridCoord` field (code such as S:routes/worldRoutes.js:3188 reads `grid.gridCoord` and gets `undefined`).
- `Player` carries `location {g,s,f,gridCoord,gtype,x,y,region}`, `gridId` (homestead), `settlementId`, `homesteadGridCoord`, `sourceGridBeforeDungeon`, `gridsVisited` (512-byte bitset, 1 bit per SSGG cell) (S:models/player.js:46, 154-159).
- `gridCoord` format `TTIISSGG` (tier, index, settlement row/col, grid row/col) is parsed independently in at least 5 places (C:GameFeatures/Transit/Transit.js:538-548, C:ZoomedOut/FrontierMiniMap.js:41-52 and 78-89, C:Utils/gridsVisitedUtils.js:16-41, C:Render/PixiRenderer/PixiRendererFrontierSettlements.js:97, plus `parseGridCoord` used by App.js).

---

## 1. Settlement view today

### Trigger and data fetched
- `zoomLevel` goes `far -> settlement -> frontier` via `zoomOut` (C:App.js:2729-2750) and back via `zoomIn` (C:App.js:2683-2725). Entering settlement zoom from frontier shows status 12; zooming back into a grid calls `fetchHomesteadOwner` (C:Utils/worldHelpers.js:60-91: two round trips, `/api/load-grid/:g` then `/api/player/:ownerId`) only to print a status line (C:App.js:2697-2712).
- `visibleSettlementId` is just `currentPlayer.location.s` (C:App.js:813-819).
- Fetch #1, on every entry to settlement zoom (deps `[zoomLevel, usePixiJS, visibleSettlementId]`, C:App.js:828-857): `POST /api/get-settlement-bundle {settlementId}`.
  - Server S:routes/settlementRoutes.js:819-873: `Settlement.findById`; `Grid.find({_id in 64 gridIds}, {ownerId})`; a SECOND `Grid.find` pulling `playersInGrid` for every occupied homestead into `gridStates` (845-852); `Player.find(ownerIds, 'username role netWorth tradeStall')`.
  - Payload: 64 cells x `{gridCoord, gridType, gridId, available, ownerId}` + one player record per owner (username, role, netWorth, full `tradeStall` array) + `gridStates` (full PC maps of every occupied homestead). **The client never reads `gridStates`** (C:App.js:840 destructures only `players, settlement`), so that query and payload are dead weight.
- Fetch #2, when settlement data lands (C:App.js:860-897): computes `visited SSGG ∩ settlement cells with gridId`, then `POST /api/grids-tiles {settlementId, gridCoords}` -> S:routes/playerRoutes.js:1951-1995 maps gridCoord -> gridId via `settlement.grids`, `Grid.find(...).select('tiles')`, returns `tilesMap[gridCoord] = tiles` (base64 string, 64x64x4 bits = 2048 B raw, ~2.7 KB each; worst case 63 grids ~170 KB).
- Refresh cadence: no polling. Data lives until the next zoom-in/out cycle re-runs the effect, or until relocation clears it (C:App.js:4105-4112). The tile snapshot bitmap cache `gridSnapshotCache` is keyed by gridId and only cleared when Pixi re-initialises (C:Render/PixiRenderer/PixiRendererSettlementGrids.js:37, 88-119; C:Render/PixiRenderer/PixiRenderer.js:494), so a thumbnail never updates within a session even if the grid's tiles change.

### How it renders (C:Render/PixiRenderer/PixiRendererSettlementGrids.js:434-590)
- The current grid is skipped (live Pixi canvas) and gets a gold glow (`CurrentGridGlow`, 179-194, 629-634).
- Valley/town cell:
  - visited (tiles present in `visitedGridTiles`) -> `SnapshotGridCell`: a 64x64 canvas with one pixel per tile coloured via `getTileColor` (499-521, 88-112). Tiles only; no resources, no NPCs, no PCs.
  - unvisited -> `EmptyGridCell` solid grass with the `gridType` string as label (523-535).
- Homestead cell:
  - owner found in `players` map -> `HomesteadGridCell` (228-405): text block "Homestead owned by:", username, role (yellow if Mayor), net worth, and unsold trade-stall item emoji (272-281). At frontier zoom it collapses to a 🏠 (232-257). **Never tiles or resources, even if visited.**
  - no owner -> dirt "Unoccupied" (555-569).
- Clicks are only enabled in developer mode (travel) or relocation mode at frontier zoom (460-478, 609-610). Developer click handler is C:App.js:3980-4055 (resolves spawn via signpost helpers, then `changePlayerLocation`).

### What "visited" already means
Town/valley thumbnails are already gated per player by the `gridsVisited` bitset (C:App.js:872-877). Only the *tile data* behind the thumbnail is shared.

### Minimal snapshot data after the refactor
- Homesteads: unchanged. The bundle already derives everything from `Settlement.grids[].available/gridId`, `Grid.ownerId`, and `Player{username, role, netWorth, tradeStall}`. Optionally add the homestead `tiles` string so the cell can show a real thumbnail of the neighbour's homestead (the renderer already has the code path; only `HomesteadGridCell` needs a `dataUrl` branch).
- Towns/valleys: the settlement cell list (`gridCoord`, `gridType`) stays shared (the Settlement doc is effectively the world template). The `tiles` must come from the *requesting player's copy*: `/api/grids-tiles` (S:routes/playerRoutes.js:1963-1972) must resolve `(playerId, gridCoord) -> Grid` instead of `settlement.grids[].gridId`. For never-generated copies, return the template's tiles or nothing (the client already treats missing tiles as "unvisited grass").
- Drop `gridStates` from the bundle; drop the `netWorth`-less duplicate fields on `HomesteadGridCell` (it checks four spellings, 268).

---

## 2. Frontier view and minimap

### Frontier zoom (C:App.js:931-955)
- On every entry to frontier zoom: `GET /api/frontier-bundle/:frontierId?playerSettlementId=:s` -> S:routes/frontierRoutes.js:535-578.
  - `Frontier.findById` (8x8 `settlements[]` of `{settlementId, settlementType, available}`), `Settlement.find` for all 64, then for every settlement that has at least one claimed homestead OR is the player's settlement, returns its full 64-cell `grids` array (`settlementGrids[settlementId] = {grid}`), 557-570.
  - Payload: up to 64 x 64 = 4096 cell objects (~400 KB JSON at scale). No tiles. Fetched afresh each time; cleared on relocation.
- Render C:Render/PixiRenderer/PixiRendererFrontierSettlements.js:81-150 (`renderMiniGrid`): per cell 8x8 inside each settlement: player's current grid -> player icon; homestead with `available=false` -> 🏠; town -> 🏛️; valley -> tree emoji only if NOT in the player's `gridsVisited` (visited valleys render empty, with the comment "the trees have been cleared", 110-114). Padding settlements render grey (257-275). Current settlement is rendered by `PixiRendererSettlementGrids` with `isFrontierZoom` (text hidden, borders off).
- Relocation clicks come through here (`onGridClick`, 121-128) to C:App.js:4064-4116.

### Base-panel minimap (C:ZoomedOut/FrontierMiniMap.js)
- Pure derivation from `currentPlayer.location.gridCoord` (32-66) and `currentPlayer.homesteadGridCoord` (69-98); no fetch. 64x64 DOM cells (229-255) with player cell + homestead cell only.
- Title logic 145-187 (dungeon / region / "Your Homestead" / "Your Town" / valley / Map). Hard-codes `FTUE_CAVE_GRID_ID` (6, 147, 290).
- Home and Town buttons call `handleTransitSignpost("Signpost Home" | "Signpost Town Home")` (203-220, 262-279).
- Dungeon countdown from `countdowns.dungeon` (290-308), which App.js builds from `GET /api/get-frontier/:id` (C:App.js:2438-2477; note `get-frontier` does `.populate("settlements")` on an array of plain objects, S:routes/frontierRoutes.js:113).

### Minimal data after the refactor
Nothing in the frontier view touches town/valley Grid docs. It needs only `Frontier.settlements`, each `Settlement.grids` (type + `available` of homestead cells) and the viewer's own `gridsVisited`. `frontier-bundle` can stay as is. If you want neighbours' valley "clearedness" to reflect *their* world you would need per-player data, but the current semantics (my visited bits) are already per player and are the right semantics for a single-player world.

---

## 3. Transit

### Every way a player changes grid
| # | Mechanism | Entry point | Where the destination Grid doc id is decided |
|---|---|---|---|
| 1 | Edge-walk (keyboard off the 64x64 edge) | C:PlayerMovement.js:301-338 -> `handleTransitSignpost(direction)` | Transit.js:406 (see #2) |
| 2 | Directional signpost click (`category: travel`) | C:App.js:3117-3135 -> C:GameFeatures/Transit/Transit.js:297-530 | `GET /api/get-settlement/:s` (312), find current cell by gridId (328), `decodeCoord` (360), neighbour math (362-391), `GET /api/get-settlement-by-coords/:row/:col` (395), **`targetGrid = targetSettlement.grids[newGRow][newGCol]` -> `targetGrid.gridId` (406-418, 504)**. Then `GET /api/load-grid/:target` just to find the opposite signpost (445). |
| 3 | Signpost Home / minimap 🏠 | Transit.js:81-206 | `g = currentPlayer.gridId` (155); needs Home Deed, Horse, and `gridId` (83-123); spawn via `fetchHomesteadSignpostPosition` -> `/api/load-grid` (C:Utils/worldHelpers.js:10-30); `homesteadGridCoord` fallback via `GET /api/homestead-gridcoord/:g` (141). |
| 4 | Signpost Town / Signpost Town Home / minimap 🏛️ | Transit.js:209-295 | `GET /api/get-settlement/:id` (217), **`settlement.grids.flat().find(gridType==='town' && gridId)` (228)**; spawn via `fetchTownSignpostPosition` -> `/api/load-grid` (worldHelpers.js:38-58). |
| 5 | Dungeon Entrance | C:App.js:3054-3096 -> C:GameFeatures/Dungeon/Dungeon.js:11-142 | Server: `POST /api/enter-dungeon` (Dungeon.js:56) -> S:routes/worldRoutes.js:3474-3496 picks the dungeon whose `entranceGrids` contains `sourceGridId`. |
| 6 | Dungeon Exit | C:App.js:3097-3115 -> Dungeon.js:144-254 | Server: `POST /api/exit-dungeon` -> S:worldRoutes.js:3288-3357 (FTUE cave -> `player.gridId`) or 3362-3447 (`player.sourceGridBeforeDungeon`). |
| 7 | Dungeon auto-eject on phase flip | C:App.js:2551-2575 -> `handleDungeonAutoExit` 2018-2088 | #6, falling back to #3. |
| 8 | Death respawn | C:Utils/playerManagement.js:143-276 | `GET /api/get-settlement/:settlementId`, first town cell with gridId (163-172). Also writes location directly via `/api/update-profile` (228-237) before `changePlayerLocation`. |
| 9 | Developer click at settlement zoom | C:App.js:3980-4055 | `gridData.gridId` from the settlement bundle. |
| 10 | Homestead relocation | C:App.js:4064-4116 -> C:Utils/Relocation.js:4-35 -> `POST /api/relocate-homestead` | S:worldRoutes.js:1173-1304: scans ALL settlements, moves the Grid reference between two Settlement cells, updates `grid.settlementId`, `player.settlementId/homesteadGridCoord`, and `player.location.s/gridCoord` only if the player is standing at home. The player is NOT moved; client re-fetches `/api/player/:id`, clears all zoom caches and sets zoom to `close`. |
| 11 | Server-side "send home" | `POST /api/send-player-home` S:routes/playerRoutes.js:21-86 (SocialPanel debug button C:GameFeatures/Social/SocialPanel.js:248; editor Players.jsx:468); `POST /api/remove-homestead` S:worldRoutes.js:155-242; season reset `relocatePlayersHome` S:utils/seasonReset.js:26-27 | S:utils/relocatePlayersHome.js:8-192 / 195-408 edit `playersInGrid` maps and `player.location` directly; the client discovers it on next load (stale-gridId check C:App.js:1485-1492). |
| 12 | Initial load | C:App.js:1513 `initialGridId = DBPlayerData.location.g ?? parsedPlayer.location.g ?? localStorage.gridId` | Whatever `player.location.g` says. |
| 13 | Account creation | C:Authentication/CreateAccount.js:193-286 | Server hard-codes the FTUE cave (S:routes/auth.js:66-121); client then `POST /api/save-single-pc` into that grid (CreateAccount.js:241-269). |
| 14 | Boat | not a transit; `isinboat` is only a movement state (C:App.js:3718-3771, C:Utils/playerManagement.js:137) | n/a |

### The choke point: `changePlayerLocation` (C:Utils/GridManagement.js:105-676)
Every mechanism in rows 1-9 ends here with an already-resolved `toLocation = {x,y,g,s,f,gtype,gridCoord}`. Exact sequence:

Leave old grid
1. `transitionFadeControl.startTransition()` (124); abort if bulk op active (129-134); `locationChangeManager.requestLocationChange` lock (143-149, C:Utils/LocationChangeManager.js:26-46); `closeAllPanels()` (155).
2. `GET /api/load-grid-state/:from` to recover combat stats (181-183).
3. Flush pending NPC/PC position batches (186-189) (`POST /api/batch-update-*-positions`), stop NPC timer, PC batch saver, farm timer, VFX, music (193-199).
4. `playersInGridManager.removePC(from)` -> `POST /api/remove-single-pc` (203; C:GridState/PlayersInGrid.js:611-650; S:routes/gridRoutes.js:99-134 `$unset playersInGrid.<id>`).
5. Socket `player-left-grid` and `leave-grid` (206-211). Server re-elects NPC controller for that room (S:server.js:249-283).

Enter new grid
6. `GET /api/load-grid-state/:to` (218) and `GET /api/load-grid/:to` (221; S:routes/worldRoutes.js:690-793 returns full doc + decoded tiles + enriched resources + populated owner username; may also mutate the doc to strip corrupted crops, 731-754).
7. Build `playerData`, validate (227-266).
8. Socket `join-grid` (277-287; server joins room, sends `current-grid-players`, assigns NPC controller if none, S:server.js:207-247).
9. `playersInGridManager.addPC(to)` -> `POST /api/save-single-pc` (288; PlayersInGrid.js:372-440; S:gridRoutes.js:40-96).
10. `POST /api/update-player-location` (290-297) -> S:routes/playerRoutes.js:872-963: requires `location.s` (884); if `gridCoord` missing, **scans every Settlement in the DB** to find it (896-920); reads `Grid.region` (923-933); `$set location`.
11. Clear grid/resources state, `setGridId`, `setCurrentPlayer` (309-325), `initializeGrid` (329), SVG preload (334-345).
12. Valley trophy (348-374), region-change notifications (377-394).
13. `NPCsInGridManager.initializeGridState(to)` and `playersInGridManager.initializePlayersInGrid(to)` (406-407) -> each does `GET /api/load-grid-state/:to` again (C:GridState/GridStateNPCs.js:212, C:GridState/PlayersInGrid.js:156). So `load-grid-state` for the destination is fetched three times per transit.
14. Optional `findSignpost` placement -> `POST /api/save-single-pc` + socket `player-moved` (455-515).
15. Camera centre from `gridCoord` (517-548); dead-player cleanup (553-562).
16. Socket `set-username`, `request-npc-controller`, `player-joined-grid` (567-588); `updateGridStatus` (590-592).
17. Wait 3 frames, `endTransition` (598-614), `completeLocationChange` (617-622), then `POST /api/mark-grid-visited` if the bit is unset (626-664).

### Where "load MY copy of this town" must be wired
`changePlayerLocation` is a single choke point for *executing* a move but NOT for *choosing* the document. Choice happens in N places: Transit.js:228, Transit.js:406, Transit.js:155, playerManagement.js:172, App.js:3980-4055, worldRoutes.js:3474-3496 (enter-dungeon), worldRoutes.js:3288-3447 (exit-dungeon), relocatePlayersHome.js:96/214, auth.js:66, plus every server helper that maps gridCoord<->gridId through `Settlement.grids` (`/api/grids-tiles` playerRoutes.js:1963-1972, `/api/homestead-gridcoord` frontierRoutes.js:596-619, `/api/update-player-location` playerRoutes.js:896-920, exit-dungeon gridCoord lookup worldRoutes.js:3312-3325 and 3376-3410).

Recommended shape:
- Add `gridCoord` (and for per-player copies `ownerId` + `templateKey`) to the Grid schema, with an index on `{ownerId, gridCoord}`. This single change removes most of the Settlement scans.
- Make `/api/update-player-location` (or a new `/api/resolve-grid`) the one server-side resolver: client sends `{gridCoord | 'home' | 'town'}` and the server returns `{g, s, gtype, gridCoord, spawn}` after creating the player's copy from the template on first visit. Then `changePlayerLocation` takes `toLocation.g` from that response and the four client-side resolvers (Transit.js x3, playerManagement.js) shrink to "compute target gridCoord".
- `Settlement.grids[].gridId` for town/valley cells becomes the template/canonical doc id (or null), and `available` stays meaningful only for homestead cells.
- Keep the camera/visited logic as-is: both key on `gridCoord`, not on the document id.

### Transit bugs observed on the way
- Transit.js:353, 388-391, 399-403 return on error without `endTransition()`: screen stays black (`startTransition` was called at line 40).
- Edge-walk (PlayerMovement.js:315-317) awaits `startTransition` and then Transit.js:40 starts it again; harmless but duplicated.
- Transit.js:56-57 refetches skills from `/api/inventory` when `currentPlayer.skills` is empty, on every directional move.
- `LocationChangeManager` deliberately drops queued moves (C:Utils/LocationChangeManager.js:61-77).

---

## 4. Dungeons

### Registry and lifecycle
- Registry: `Frontier.dungeons` Map keyed by dungeon gridId -> `{gridId, templateUsed, createdAt, needsReset, lastReset, sourceValleyGrid (never set), entranceGrids[] (gridIds)}` (S:models/frontier.js:107-120). Phase timer `frontier.dungeon {phase, startTime, endTime}` (82-86) driven by `mainScheduler` (S:schedulers/mainScheduler.js:41, 173-175) with `globalTuning.dungeon`.
- Create: `POST /api/create-dungeon {templateFilename, settlementId, frontierId}` S:routes/worldRoutes.js:2945-3100 (editor Dungeons.jsx:128). Builds a `gridType:'dungeon'` Grid from `S:layouts/gridLayouts/dungeon/<template>.json` (templates present: d001-d004_bears, dPhoenix, opening), seeds NPCs from the layout (2990-3014), registers in the frontier map (3053-3078). Note it will pass the string `'global'` for `frontierId/settlementId` when none is given (3047-3048) which violates the ObjectId schema (3022-3024 of grid.js:67-76).
- Map entrances: `POST /api/update-dungeon-config {frontierId, dungeonGridId, templateUsed, entranceGrids}` (3594-3681), validating each entrance grid has a `Dungeon Entrance` resource.
- Scheduler: on phase `resetting`, `dungeonScheduler` sets `needsReset=true` for every registry entry (S:schedulers/dungeonScheduler.js:17-67). Nothing resets immediately.
- Enter (3454-3592): find registry entry with `entranceGrids.includes(sourceGridId)`; if `needsReset`, lazily `performGridReset(gridId,'dungeon')` (S:utils/resetGridLogic.js:95-138 reads `templateUsed` from the registry) and clear the flag; find `Dungeon Exit`; `player.sourceGridBeforeDungeon = sourceGridId`; return entry position.
- Exit (3260-3447): FTUE cave -> player's homestead next to Signpost Town (404 if no `player.gridId`, 3298-3302); otherwise -> `sourceGridBeforeDungeon` at the Dungeon Entrance. Bug: when the entrance resource is missing it returns early *without* `$unset sourceGridBeforeDungeon` (3400-3410 vs 3413-3415).
- Manual tools: `POST /api/reset-dungeon` (3163-3218), `DELETE /api/delete-dungeon/:gridId` (3220-3258), both editor-only.
- Client: phase/timers from `get-frontier` (C:App.js:2474-2477); entrance click computes "actual phase" from the local clock (3064-3076); auto-eject when the local timer flips to `resetting` (2551-2575, skipping the FTUE cave).

### Per-player or per-settlement today?
Neither: dungeons are **per-frontier shared instances**. One Grid doc per registry entry; all players entering through any mapped entrance share its `NPCsInGrid`, `playersInGrid`, resources and the frontier-wide open/resetting timer. NPC AI runs on whichever socket is the room's controller (S:server.js:231-247; C:App.js:2258-2302).

### The FTUE cave is the extreme case
`695bd5b76545a9be8a36ee22` is hard-coded in S:routes/auth.js:66, S:routes/worldRoutes.js:3265, C:App.js:172, C:GameFeatures/Dungeon/Dungeon.js:9, C:ZoomedOut/FrontierMiniMap.js:6, C:ResourceClicking.js:25, C:Render/PixiRenderer/PixiRendererPCs.js:7 (and a commented copy in C:Render/RenderPCsDOM.js:5). Every new account is written into the same grid's `playersInGrid` (CreateAccount.js:241-269); other PCs are merely hidden client-side (PixiRendererPCs.js:330); Constable Elbow and the cave resources are shared; it is excluded from the reset timer, so it never resets.

### What per-player dungeons need
1. Registry becomes a template registry keyed by entrance: `{entranceGridCoord -> templateFilename}` (entranceGrids must switch from valley gridIds to gridCoords, since valley gridIds become per-player).
2. `enter-dungeon`: find-or-create `Grid{gridType:'dungeon', ownerId:playerId, templateKey}`; reset it on entry if `needsReset` is per-player (store `lastReset` on the player's instance or on `Player`), or simply regenerate on every entry and delete on exit if dungeons are meant to be fresh runs.
3. `performGridReset` for dungeons must take the template name as an argument rather than reading `frontier.dungeons.get(gridId)` (S:utils/resetGridLogic.js:106-136).
4. The frontier `dungeon` phase can stay as a global "open window" if desired, but the `needsReset` fan-out in `dungeonScheduler` becomes a no-op.
5. FTUE cave: create a per-player instance from `opening.json` at registration (auth.js:66-121 currently sets location to the shared id) and mark it (`templateKey:'opening'` or `isFTUE:true`). Replace the eight hard-coded id checks with a flag on `location`/grid. `exit-dungeon`'s FTUE branch keys on that flag.
6. Editor Dungeons tab (`/api/grids?gridType=dungeon`, Dungeons.jsx:42) must filter out per-player instances (e.g. `ownerId:null` or a `isTemplate` flag) or it will list thousands of docs.
7. NPC controller election becomes trivial (one socket per room) but the code path still works unchanged.

---

## 5. FTUE

Steps live in S:tuning/FTUEsteps.json (served by `GET /api/ftue-steps`, S:routes/playerRoutes.js:1597). Advancement is purely client-driven through `tryAdvanceFTUEByTrigger`/`incrementFTUEStep` -> `POST /api/update-profile {ftuestep}` (C:GameFeatures/FTUE/FTUEutils.js:30-89). The FTUE component shows a StoryModal or auto-advances `showModal:false` steps (C:GameFeatures/FTUE/FTUE.js:107-116, 396-413) and App.js shows it once the grid has loaded (C:App.js:2128-2181). Doinker targets are derived from the current step (C:App.js:2183-2202) and resolved by polling the in-memory resources / NPC maps every 500 ms (C:GameFeatures/FTUE/FTUEDoinker.js:34-107) or DOM selectors for button doinkers (110-153).

| Step | Trigger | Fires from | Depends on |
|---|---|---|---|
| 1 | StartedFTUE | modal on load | nothing |
| 2 | ContinuedFromStep1 | doinker on NPC "Constable Elbow" | the shared FTUE cave's `NPCsInGrid` containing Elbow; NPC position comes from the Grid doc (loaded by `load-grid-state`), movement from the room's NPC controller (sockets) |
| 3 | ClickedConstableElbow | C:App.js:1319-1322 `handleNPCPanel` | same NPC; opens NPCPanel and doinks the trade button |
| 4 | BoughtHomeDeed | C:GameFeatures/NPCs/NPCsPanel.js:747-779: `POST /api/create-homestead` then trophy then trigger | **Server starter-homestead flow** S:routes/worldRoutes.js:363-520: verifies Home Deed (387-393), walks every settlement of the frontier for the first `available` homestead cell (396-425), `performGridCreation` from `homestead.json` (S:utils/createGridLogic.js:16-250, S:utils/templateUtils.js:195-198), `claimHomestead` (createGridLogic.js:254-271), atomic `Player.findOneAndUpdate({gridId:null})` setting `gridId/settlementId/homesteadGridCoord` (470-480), `population++` (497-500). Doinker -> "Signpost Home" resource in the cave. Signpost Home travel requires Home Deed + Horse skill + `gridId` (Transit.js:83-123). |
| 5 | HomesteadVisit | Transit.js:191-194 (only via Signpost Home / minimap) | own homestead |
| 6 | SoldToKent | Kent panel | own homestead NPC Kent; shows feedback modal (FTUE.js:242-250) |
| 7 | PlantedFirstCrop | farming | own homestead; doinker on NPC "The Shepherd" |
| 8 | CollectedQuest | quests | adds quest 7 |
| 9 | FirstTownVisit | Transit.js:274-283, only when `TraveledToTown` trophy is absent | the settlement's **shared town grid** (Transit.js:228); doinker on Constable Elbow in town (shared NPC) |
| 10 | AcquiredTownKey | NPC trade | town |
| 11 | ClickedAgricultureCenter | C:App.js:3144-3146 | town resource "Agriculture Center" |
| 12 | AcquiredGrower | panel | town; doinker Signpost Home |
| 13 | HomesteadVisit | Transit.js:191-194 | own homestead; doinker Mailbox |
| 14 | ClickedMailbox | C:App.js:3205-3207 | own homestead; `completeTutorial` (FTUEutils.js:168-230) flips `firsttimeuser` and injects a completed Wizard quest |

Shared-world dependencies to break: steps 2-4 (shared cave: NPC, resources, PC map), steps 9-12 (shared town grid, shared Elbow). Sockets are only needed for NPC movement; nothing in FTUE itself emits or listens. The town steps simply need the player's own town copy to be generated from the town template (`townE.json`/`town_default.json`, S:utils/templateUtils.js:209-220 picks by settlement position) which already contains Elbow and the Agriculture Center as static layout resources (createGridLogic.js:165+).

Registration (S:routes/auth.js:22-156) creates no homestead; `location = {g: cave, s: null, f, gridCoord: null, gtype:'dungeon'}` (111-119). Because `/api/update-player-location` rejects `s` null (S:routes/playerRoutes.js:884), nothing can move the player until a homestead exists; today that is guaranteed by step 4 preceding Signpost Home.

---

## 6. Visiting another player's homestead

Supported today, and it is a full "enter the grid" visit, not a view:
- You can walk/signpost into any neighbouring homestead cell (Transit.js:406 returns whatever cell is there, including occupied homesteads) or dev-click it (C:App.js:3980). Status line shows the owner (C:Utils/GridManagement.js:708; C:App.js:2697-2712).
- You are written into that grid's `playersInGrid`, join its socket room, can be elected NPC controller for the owner's animals, and share the grid-scoped chat room (S:server.js:385-394; S:routes/chatRoutes.js:8).
- Interaction gating is client-only: C:App.js:3001-3014 blocks clicks on another homestead unless the resource is `npc` or `travel`, always blocks Mailbox / Trade Stall / Warehouse, has an `isFriend = false` placeholder; keyboard panel shortcuts are blocked too (3719-3771). Range checks are skipped on your own homestead (3025-3031; C:ResourceClicking.js:65-70). There is no server-side owner check on resource mutation routes (e.g. `PATCH /update-grid/:gridId` S:routes/worldRoutes.js:523-662 has none), so a modified client could harvest anything.
- Clicking a PC opens SocialPanel (C:App.js:1351-1355) which fetches `/api/player/:id` (C:GameFeatures/Social/SocialPanel.js:77) and has a debug "send home" (248).
- The settlement-view `HomesteadGridCell` is not clickable outside dev/relocation mode, so there is no "view" affordance today.

What a read-only snapshot mode needs:
- Server: a read-only `GET /api/homestead-snapshot/:gridId` (or reuse `/api/load-grid/:gridId`, which is already read-only apart from the corrupted-crop cleanup, worldRoutes.js:731-754) returning tiles, enriched resources, static NPC positions and owner info; no `playersInGrid`, no `join-grid`, no `save-single-pc`, no `update-player-location`.
- Client: a `viewMode` for PixiRenderer that mounts tiles/resources/NPC sprites from a transient store (not `GlobalGridStateTilesAndResources`, not `NPCsInGridManager`) with `handleTileClick`, movement, timers, VFX, chat and socket joins disabled, and leaves `currentPlayer.location` untouched; an explicit "back" that restores the live grid without running `changePlayerLocation`. The simplest wiring is a click on `HomesteadGridCell` at settlement zoom (PixiRendererSettlementGrids.js:542-553 already threads `onClick`).
- Keep the existing "walk onto a neighbour's homestead" path out of the single-player world entirely (reject homestead cells in Transit.js:406 unless `targetGrid.gridId === currentPlayer.gridId`) so that live co-presence on homesteads disappears cleanly.

---

## 7. Game editor coupling

- Base URL: `game-editor/src/config.js:1` points at production `https://vvgame-server.onrender.com`; `FrontierView.jsx:10` separately hard-codes `http://localhost:3001`, so grid create/reset/region edits go to a different server than everything else.
- Server endpoints used: `/api/frontiers`, `/api/settlements` (App.jsx:44,56); `/api/resources`, `/api/update-grid-region`, `/api/bulk-update-grid-regions`, `/api/create-grid`, `/api/reset-grid` (FrontierView.jsx:44,73,131,370-413,483,537-643); `/api/load-grid/:id` for every grid in a frontier, batched 10 at a time (AtlasView.jsx:86-110); `/api/grids?gridType=dungeon`, `/api/get-frontier/:id`, `/api/create-dungeon`, `/api/delete-dungeon/:id`, `/api/reset-dungeon`, `/api/grid-has-resource`, `/api/update-dungeon-config` (Dungeons.jsx:42-261); `/api/players`, `/api/xp-levels`, `/api/update-profile`, `/api/delete-player`, `/api/send-player-home`, `/api/reset-password` (Players.jsx:151-722); settlement/frontier log routes (components/ShowLogs.jsx); `/api/tuning`, `/api/force-end-phase` (Events.jsx:59,106); analytics and feedback routes.
- Layout save/load is **filesystem only**: Electron `fs` writes/reads `game-server/layouts/gridLayouts/<directory>/<fileName>.json` (GridEditor.jsx:728-862), with `projectRoot` derived from `__dirname`/`app.getAppPath()` (FrontierView.jsx:158-162). There is no `save-layout`/`load-layout` endpoint. Template authoring is therefore unaffected by the refactor.
- Risks:
  1. FrontierView and AtlasView assume `Settlement.grids[].gridId` is the one live grid for a cell ("Create Grid", "Reset Grid", thumbnail). With per-player towns/valleys these must target the canonical template copy (or a chosen player's copy) and `/api/create-grid`/`/api/reset-grid` need an owner parameter.
  2. `/api/update-grid-region` keys region by gridId (S:worldRoutes.js:3842); region should move to the Settlement cell or the template, else every per-player copy needs it.
  3. Dungeons tab edits `Frontier.dungeons[gridId].entranceGrids` as valley gridIds (Dungeons.jsx:209, 261); both become invalid once dungeons/valleys are per-player (see §4).
  4. `/api/grids` listing and AtlasView's per-grid `load-grid` fan-out scale with number of players, not number of cells.
  5. `send-player-home` relies on `relocateOnePlayerHome` finding the player by scanning Grid docs for `playersInGrid.<id>` (S:utils/relocatePlayersHome.js:221-226), which still works but gets slower with many per-player docs.

---

## 8. Dead code, duplication, risks

Dead or unreferenced
- C:ZoomedOut/ZoomedOut.js (`getGridBackgroundColor`, `ZoomOut`), SettlementTile.json, FrontierTile.json, SettlementView.css, FrontierView.css, ZoomedOut.css and RenderVisitedGrid.js are not imported anywhere outside the folder (only FrontierMiniMap.js is used, C:App.js:60; commented imports at C:App.js:58-59 and the "LEGACY" note at 4171).
- Server routes with no client or editor caller: `get-settlement-grid` (settlementRoutes.js:124), `get-settlement-by-grid` (65), `get-frontier-grid` (frontierRoutes.js:126), `get-transit-map` (361), `get-grids-by-id-array` (worldRoutes.js:1315), `update-grid-availability` (worldRoutes.js:864), `claim-homestead` route (324; the util is used), `load-neighbor-grids` (800; the "MultiGridManager" it mentions does not exist in the client).
- `get-settlement-bundle.gridStates` (settlementRoutes.js:845-852) is computed and never read.
- `transitConfig.getOppositeEntryPosition` (C:GameFeatures/Transit/transitConfig.js:29-32) appears unused.
- C:Utils/WorldGeneration.js is dev tooling that drives `/api/create-grid` from the client (town/valley generation); it assumes one Grid per cell.

Duplication
- Two base64 tile decoders: C:ZoomedOut/RenderVisitedGrid.js:16-70 and C:Render/PixiRenderer/PixiRendererSettlementGrids.js:42-83.
- Signpost spawn-offset tables: Transit.js:454-463 and GridManagement.js:476-486; opposite-direction maps: Transit.js:432-437 and transitConfig.js:14-23.
- gridCoord parsing in 5+ places (see top of document); FrontierMiniMap.js parses it twice (41-52, 78-89).
- `isOnOwnHomestead` recomputed in C:App.js:2845, 3430 and C:ResourceClicking.js:66.
- Three fetches of `load-grid-state` per transit (GridManagement.js:218; GridStateNPCs.js:212; PlayersInGrid.js:156).

Risks / correctness
- Full-collection `Settlement.find({})` scans on hot paths: `/api/update-player-location` whenever `gridCoord` is absent (playerRoutes.js:896-920; every dungeon enter/exit), `/api/homestead-gridcoord` (frontierRoutes.js:596-619), `/api/relocate-homestead` (worldRoutes.js:1181). Adding `gridCoord` to the Grid schema removes all three.
- `/api/relocate-homestead` assigns to an undeclared `updated` variable (worldRoutes.js:1196, 1206); sloppy-mode global, but a `'use strict'` or ESM move would throw.
- `/api/exit-dungeon` early return leaves `sourceGridBeforeDungeon` set when the entrance is missing (worldRoutes.js:3400-3410).
- Fade-to-black is never ended on three Transit.js error paths (353, 388-391, 399-403).
- `gridType` enums disagree: Grid allows `valley` but no `valley0`; Settlement likewise; the client checks `valley0` everywhere (FrontierMiniMap.js:179, App.js:2699, ZoomedOut.js:21).
- `create-dungeon` can write the string `'global'` into ObjectId fields (worldRoutes.js:3047-3048).
- `gridSnapshotCache` is never invalidated per grid; in a per-player world the player's own valley tiles can change and the thumbnail will be stale until reload (PixiRendererSettlementGrids.js:37, 117-119).
- `frontier-bundle` returns a settlement's full 64-cell grid as soon as one homestead is claimed; payload grows linearly with populated settlements.
- `get-frontier` does `.populate("settlements")` on a nested array of plain subdocuments (frontierRoutes.js:113); harmless today but wasteful, and it ships the whole frontier (dungeons map, logs) just to read timers (C:App.js:2438).
- Ownership of homestead resources is enforced only in the client (App.js:3001-3014).
- Hard-coded FTUE cave id in 8 files.
- Season reset (S:utils/seasonReset.js:26-27, 47-97) still relocates every player home and replants every valley grid in the frontier; with per-player valleys this must iterate per-player copies or be replaced by lazy per-player regeneration.

---

## Short list of refactor anchors

1. Grid schema: add `gridCoord`, `templateKey`, keep `ownerId`; index `{ownerId, gridCoord}`; towns/valleys/dungeons get `ownerId = playerId`.
2. One server resolver (`resolve (playerId, gridCoord|home|town) -> Grid`) used by `update-player-location`, `grids-tiles`, `enter/exit-dungeon`, death respawn and Transit; `changePlayerLocation` (C:Utils/GridManagement.js:105) stays the single execution choke point.
3. Settlement view: drop `gridStates`; `grids-tiles` resolves per player; optional homestead thumbnails.
4. Frontier view: unchanged.
5. Dungeons: registry -> template map keyed by entrance gridCoord; per-player instance on entry; FTUE cave instanced at registration; replace the hard-coded id with a flag.
6. Homestead visiting: new read-only snapshot route + `viewMode` in PixiRenderer; block live entry into other homesteads in Transit.js:406.
7. Editor: fix FrontierView base URL, re-point grid/dungeon tools at template copies, and switch `entranceGrids` to gridCoords.
