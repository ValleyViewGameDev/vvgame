# vvgame client audit: NPC behaviour + rendering / hot paths

Scope: `/Users/jonathanknight/GameDevelopment/vvgame/game-client/src` (read-only). All paths below are relative to that directory unless absolute. Line numbers are from the current working tree.

Goal of the audit: inform a refactor from synchronous MMO to single-player (NPCs client-authoritative on every client, other PCs never rendered, sockets only for chat/notifications), with better client performance and far less server traffic.

---

## 0. Executive summary

1. **There is exactly one live render pipeline: PixiJS.** `const usePixiJS = true;` is a hard-coded constant (App.js:490). No `player.settings.renderCanvas*` flags exist anywhere in `src`; the only matches are inside fully commented-out legacy files. App.js renders `<PixiRenderer>` only (App.js:3934). Everything else in `Render/` is either 100% commented out or orphaned (section B1).

2. **NPC AI runs on the client already, in a 1 s `setInterval` in App.js (App.js:2259-2302), gated by a server-assigned "controller" username.** Each NPC instance (`AllNPCsShared.js`) runs its own state machine via prototype-attached behaviours. The per-grid timer in `GridStateNPCs.startGridTimer` (GridStateNPCs.js:592-613) is dead (never called). The controller handshake (`NPCController.js`, `request-npc-controller`, `relinquish-npc-controller`, `controllerUsername` state) is the only thing that makes it "not already single-player".

3. **The NPC loop forces a whole-App re-render every second** (`NPCsInGridManager.setAllNPCs` at App.js:2286-2297 bumps `NPCsInGridLastUpdated` even when nothing changed), and the timers effect does the same (`setCountdowns` every 1 s, App.js:2512). Hover tooltips are App-level state (App.js:1357) updated at up to 20 Hz. App.js is a 5034-line component with 65 `useState` / 59 `useEffect`; every one of these re-renders re-evaluates it and, because `pcs` (App.js:3460) and the `gridOffset` object literals in PixiRenderer (PixiRenderer.js:1597-1636) are rebuilt each render, cascades into every Pixi child effect.

4. **PixiRendererVFX runs an unconditional 60 fps `requestAnimationFrame` loop that clears and redraws all range-indicator Graphics every frame** (PixiRendererVFX.js:287-302), defeating the 30 fps ticker cap and the on-demand ticker pattern used everywhere else.

5. **Tile textures are cached per cell (seed = f(row,col)) and never evicted across grid transitions** (PixiRendererTileTextures.js:903-992; PixiRenderer intentionally stays mounted across grid changes per GridManagement.js:299-306). ~4096 `<canvas>` + BaseTextures accumulate per grid visited.

6. **Server traffic is dominated by NPC persistence, redundant player refreshes, and redundant grid-state fetches.** A single doober harvest is 5-7 HTTP calls (two of them `GET /api/player`). A grid transition fetches `/api/load-grid-state/:id` three times and `/api/load-grid/:id` twice. Every NPC state transition is a `POST /api/save-single-npc`; NPC positions are batch-POSTed every 10 s; every NPC step emits two socket events. Full tables in section C.

---

## A. NPC behaviour

### A1. Where the NPC code lives (what each file actually is)

| File | Role |
|---|---|
| `GameFeatures/NPCs/AllNPCsShared.js` (517) | The `NPC` class: constructor, `update()`, `processState()` dispatch, shared `handleIdleState` / `handleRoamState` / `handlePursueState`, `moveOneTile`, `isValidTile`, `findTileInRange`, `findNearestResource`. Behaviours are attached to the prototype at module load (lines 509-516). |
| `NPCGrazeBehavior.js` (497) | Farm animals (`action: 'graze'`). |
| `NPCEnemyBehavior.js` (403) | Enemies (`action: 'attack'`): roam / pursue / attack PCs with line-of-sight. |
| `NPCQuestBehavior.js`, `NPCHealBehavior.js` | Quest givers and healers: roam, freeze when a PC is in range. |
| `NPCSpawnerBehavior.js` | Spawners (`action: 'spawn'`): spawn `requires` NPC type while PCs are nearby. |
| `NPCTraderBehavior.js`, `NPCWorkerBehavior.js` | No-ops (ticked every second anyway). |
| `GridState/GridStateNPCs.js` (688) | `NPCsInGridManager` singleton: in-memory `NPCsInGrid[gridId].npcs`, hydration from server, per-NPC save/remove, position batching, socket emits, React state bridge (`setGridStateReact`). |
| `GridState/NPCController.js` (109) | Controller election socket handlers. |
| `App.js:2255-2302` | **The actual NPC tick loop.** |
| `socketManager.js:420-560` | Inbound NPC sync for non-controllers (`sync-NPCs`, `npc-moved-sync`, `remove-NPC`). |
| `NPCsPanel.js` (1704) | UI panel for quest / heal / trade NPCs. No AI. Makes HTTP calls on user actions only. |
| `NPCUtils.js` (389) | `handleNPCClick` dispatch + protected farm-animal collection (server-validated). |
| `NPCInteractionUtils.js` (246) | Shared click handler with range / wall / attack-cooldown checks; tooltip text. |
| `Render/NPCComponent.js` (370) | **100% commented out. Dead.** |
| `GameFeatures/Combat/Combat.js` (258) | `handleAttackOnNPC` (live) and `handleAttackOnPC` (PvP; **no live caller**, only referenced from commented `RenderDynamic.js`). |
| `GameFeatures/FarmAnimals/FarmAnimals.js` (268) | AnimalPanel: polls `NPCsInGridManager` every 1 s while open (lines 47-69), sells animal via `removeNPC`. |
| `GameFeatures/Pets/PetsPanel.js`, `PetPanel.js` | Pets are **resources** (crafting-station style, `category: 'pet'`), not NPCs. The `case 'pet'` in `processState` (AllNPCsShared.js:79-82) is a stub. |

### A2. Who ticks, how often

- **Tick source:** `useEffect` in App.js:2255-2302 creates `setInterval(..., 1000)`. Each tick, **only if** `controllerUsername === currentPlayer?.username` (App.js:2265), it calls `npc.update(Date.now(), NPCsInGrid[gridId], gridId, activeTileSize)` for every NPC in the React copy of the grid (App.js:2267-2282), then calls `NPCsInGridManager.setAllNPCs(gridId, ...)` (App.js:2286-2297) which **always** pushes a new object with a fresh timestamp into React state, re-rendering App every second whether or not anything moved.
- **Effect deps** are `[isAppInitialized, gridId, NPCsInGrid, currentPlayer, activeTileSize, controllerUsername]` (App.js:2302). Because `NPCsInGrid` changes every tick (see above) and `currentPlayer` changes on every server refresh, the interval is cleared and recreated essentially every second.
- **Per-NPC cadence:** `NPC.update()` (AllNPCsShared.js:58-66) skips unless `now - lastUpdated >= updateInterval` (default 1000 ms, overridable by the resource template's `updateInterval`). `processState` is `async` but **not awaited**; `lastUpdated` is set immediately, so a behaviour whose `moveOneTile` is still pending (it resolves after a fixed 1200 ms `setTimeout`, AllNPCsShared.js:283-306) will be re-entered on the next tick. Only graze guards against this with `this.isMoving` (NPCGrazeBehavior.js:199-215, 343-348).
- **Dead timer:** `GridStateNPCs.startGridTimer` (GridStateNPCs.js:592-613) is never called anywhere; `stopGridTimer` is called in GridManagement.js:193 and is a no-op.
- **Controller bootstrap bug (harmless):** `NPCController.setAsController` reads `NPCsInGridManager.getNPCsInGrid(gridId)?.npcs` (NPCController.js:78-79) but `getNPCsInGrid` already returns the `npcs` map (GridStateNPCs.js:273-280), so the "immediate update" never runs.
- **Controller lifecycle:** `request-npc-controller` emitted at init (App.js:1576) and on every grid change (GridManagement.js:568); `npc-controller-update` sets `controllerUsername` (socketManager.js:671-673); inactivity >15 min emits `relinquish-npc-controller` (App.js:3387-3390); controller cleared when that player leaves (socketManager.js:134-138, 175-182).

### A3. State machines

All NPCs share: `state` (string), `position {x,y}` (integers), `hp/maxhp`, `range`, `attackrange/attackbonus/damage/speed` (enemies), `grazeEnd`, `nextspawn`, `lastUpdated`, `gridId`, plus the whole resource template merged in via `Object.assign(this, safeProperties)` (AllNPCsShared.js:47-48), which is why `validon<tiletype>` flags (AllNPCsShared.js:363-364) and `passable` live on the instance.

**graze (farm animals)** - NPCGrazeBehavior.js
```
idle --(4 idle ticks, random step)--> hungry | processing (if grazeEnd passed)
hungry --(walk to nearest 'g' tile, 'd' for Pig; range=this.range||3)--> grazing
grazing --(set grazeEnd = now + growtime*1000 once; wait)--> processing   [SKIP_STALL_AFTER_GRAZING = true, line 12]
                                                        \-> stall (dead path; stall-walking code lines 282-441 is unreachable)
processing --(wait for player click; >1 h past grazeEnd auto-reset)--> emptystall
emptystall --> roam --(range steps)--> hungry (no grazeEnd) | idle
```
Collection is `handleProtectedFarmAnimalCollection` (NPCUtils.js:21-223): optimistic VFX, then `POST /api/farm-animal/collect`; server returns `updatedNPC` which is written back with `updateNPC` (another `POST /api/save-single-npc`). The server validates `state === 'processing'` and `grazeEnd` (comment at NPCUtils.js:81-82, error parsing 192-206). This is why `grazeEnd` and `state` are persisted eagerly, and why the stall-state code sleeps 500 ms twice and re-reads its own state to "verify the update reached the server" (NPCGrazeBehavior.js:415-437).

**attack (enemies)** - NPCEnemyBehavior.js
```
(entry) idle|undefined --> roam (POST save)
every tick: scan ALL pcs for hp>0 && dist<=range && canSeeTarget (Bresenham LOS vs walls/doors, lines 8-88)
roam --(PC visible)--> pursue (random visible PC, line 120)
pursue --(in attackrange && LOS)--> attack
pursue --(lost LOS | too far >5 s)--> roam ; --(3 failed moves)--> idle (unstick) --> roam
pursue: switches target to a closer visible PC if >=2 tiles closer (lines 181-189)
attack --(target dead/camping)--> roam ; --(out of range | LOS lost)--> pursue
attack: d20 + attackbonus vs targetPC.armorclass; damage 1d6 + this.damage applied via playersInGridManager.updatePC(hp) (lines 302-336)
```
Note: `updateThisNPC.call(gridId)` at line 277 passes the wrong `this` (would throw inside `updateNPC` because `this.id` is undefined on a string). Also `setTimeout(() => this.state='attack', this.speed)` at 316-318 is a no-op (state is already 'attack').

**quest / heal** - NPCQuestBehavior.js, NPCHealBehavior.js: forced to `roam` once (POST save on first tick if persisted state differs), then each tick: if any PC with hp>0 is within range and not wall-blocked, do nothing; else `handleRoamState`. Heal uses `pc.range || 3` (NPCHealBehavior.js:33) which is a bug (PCs have no `range`); quest uses `this.range || 3`.

**spawn** - NPCSpawnerBehavior.js: `idle` -> `spawn` when any PC within `this.range`; in `spawn`, if fewer than `qtycollected` NPCs of type `requires` exist and `now >= nextspawn`, `spawnNPC` then `nextspawn = now + speed*1000`; back to `idle` when no PCs in range. Every transition and every spawn is a `POST /api/save-single-npc`.

**trade / worker / pet**: no behaviour. `NPCWorkerBehavior.js` defines an `updateThisNPC` helper that is never called and a bogus `clearInterval(this.updateInterval)` (it is a number of ms, not a timer id).

### A4. How NPC AI reads the world

- Tiles and resources: `GlobalGridStateTilesAndResources.getTiles()/getResources()` (plain module singleton, GridState/GlobalGridStateTilesAndResources.js), kept in sync with React `resources` by App.js:439-485.
- Other NPCs: `NPCsInGridManager.getNPCsInGrid(gridId)` (in-memory map).
- PCs: `playersInGridManager.getPlayersInGrid(gridId)` (in-memory map of **all** PCs on the grid, including remote players).
- All lookups are **linear scans of the resources array**: `isValidTile` does `resources.find` per candidate tile (AllNPCsShared.js:372) and is called 8x per idle step and 3x per roam step; `canSeeTarget` does `resources.find` per LOS tile per PC per tick (NPCEnemyBehavior.js:71-88); `isWallBlocking` same (GridManagement.js:810-827); `findTileInRange` is O(range^2) (AllNPCsShared.js:404-430). With a few hundred resources and ~10-30 NPCs this is thousands of comparisons per second but not the main cost; it would be trivial to replace with a `Map<"x,y", resource>` rebuilt when `resources` changes.

### A5. Every server call the NPC code path makes

| Trigger | Call | File:line | Payload | Frequency |
|---|---|---|---|---|
| Grid hydrate | `GET /api/load-grid-state/:gridId` | GridStateNPCs.js:212 | - | once per grid enter (plus 2 more fetches of the same URL by PlayersInGrid.js:156 and GridManagement.js:218) |
| Grid hydrate | `GET /api/resources` via `loadMasterResources` | GridStateNPCs.js:226 | - | cached after first (TuningManager.js:34-47) |
| NPC moves one tile | `socket.emit('update-NPCsInGrid-NPCs', {[gridId]:{npcs:{[id]: {...fullNPC, position}}}})` | GridStateNPCs.js:171-180 | the **entire NPC instance** (template + state) | every NPC step (~1/s per moving NPC) |
| NPC moves one tile | `socket.emit('npc-moved', {gridId,npcId,newPosition,emitterId})` | AllNPCsShared.js:294-303 | small | 1.2 s after every step |
| NPC positions batch | `POST /api/batch-update-npc-positions` | GridStateNPCs.js:91, 131 | `{gridId, updates:{[npcId]:{x,y}}}` | every 10 s if any NPC moved (timer starts at module load, GridStateNPCs.js:27, 36-38); also on grid leave |
| Any state transition (graze, enemy, quest/heal first tick, spawner, combat hit, heal count, collect writeback) | `POST /api/save-single-npc` | GridStateNPCs.js:452 | `{gridId,npcId,npc:{id,type,position,state,hp,maxhp,grazeEnd,lastUpdated,action,gridId[,requires,qtycollected,range,nextspawn]}}` + `socket.emit('update-NPCsInGrid-NPCs')` with the full instance (463-473) | per transition; a cow does ~5-7 per graze cycle; an enemy POSTs on every roam<->pursue<->attack flip |
| Spawn | `GET /api/resources` (**uncached**, bypasses TuningManager) then `POST /api/save-single-npc` (addNPC) + emit; then spawner's own `updateNPC` POST | GridStateNPCs.js:295, 378; NPCSpawnerBehavior.js:56-63 | | 3 HTTP per spawn |
| Remove (kill, sell, healer exhausted, dev sell) | `POST /api/remove-single-npc` + `socket.emit('remove-NPC')` | GridStateNPCs.js:512, 522 | | per removal |
| Farm animal collect | `POST /api/farm-animal/collect` then `gainIngredients` (`POST /api/update-inventory-delta` + `GET /api/player`) then `updateNPC` POST then `POST /api/update-player-quests` (if active quests) | NPCUtils.js:93, 106, 130, 140 | | per collect: 4-5 HTTP |
| Attack NPC (hit) | `updateNPC` POST (hp) | Combat.js:106 | | per hit |
| Attack NPC (kill) | `removeNPC` POST, `POST /api/addXP`, `PATCH /api/update-grid/:gridId` (drop output), `POST /api/update-player-quests`, sometimes `POST /api/add-player-quest` | Combat.js:117, 124, 170, 205, 223 | | per kill: 4-5 HTTP |
| Enemy damages a PC | `playersInGridManager.updatePC(hp)` -> `socket.emit('update-NPCsInGrid-PCs')` + queued `POST /api/batch-update-pc-positions` (5 s) | NPCEnemyBehavior.js:329; PlayersInGrid.js:557-606 | full PC object | per hit |
| Quest accept / reward | `POST /api/add-player-quest`; reward: `gainIngredients`(2) + `earnTrophy`(?) + `POST /api/update-player-quests` + `POST /api/addXP` + `POST /api/update-profile` | NPCsPanel.js:350, 404, 471, 476, 513 | | per click |
| Trade | `spendIngredients`(POST delta + GET player) + `gainIngredients`(POST delta + GET player) + quests + `POST /api/addXP` [+ `POST /api/create-homestead`, trophies] | NPCsPanel.js:702, 719, 743, 752, 799 | | per trade: ~6 HTTP |
| Heal | `spendIngredients`(2) + `refreshPlayerAfterInventoryUpdate` (GET player) + `modifyPlayerStatsInGridState` + `updateNPC` POST / `removeNPC` POST | NPCsPanel.js:601, 616, 623, 638, 643 | | per heal: ~5 HTTP |
| `saveGridStateNPCs` (`POST /api/save-grid-state-npcs`) | GridStateNPCs.js:535-587 | | **never called** (dead) |

Inbound (non-controller clients only; all become dead in single-player): `sync-NPCs` rehydrates incoming NPCs into both the React state and the live map (socketManager.js:420-510); `npc-moved-sync` animates via `animateRemotePC` (socketManager.js:512-560); `remove-NPC` (562-580). Note `handleNPCSync` writes `prevState.npcs` at the **top level** of the NPCsInGrid context, not under `[gridId]` (socketManager.js ~437-500), while App reads `NPCsInGrid[gridId].npcs` (App.js:3454) - the React copy on non-controllers is only kept coherent via the parallel write into `liveGrid.npcs`.

### A6. What is persisted about NPCs and why

Persisted per NPC (`save-single-npc` payload, GridStateNPCs.js:429-448): `id, type, position, state, hp, maxhp, grazeEnd, lastUpdated, action, gridId`, and for spawners `requires, qtycollected, range, nextspawn`. Positions separately via the 10 s batch.

Reasons it is persisted today:
1. **Multi-client consistency**: the next controller / other viewers hydrate from `load-grid-state` and must see the same cows, enemies, spawned wolves and their states.
2. **Survive reload / return to grid**: `grazeEnd` (cow timers), `nextspawn` (spawner cadence), `hp` (enemy damage, healer "heals remaining" - NPCsPanel.js:587-591, 631-645), `state === 'processing'` (ready to collect).
3. **Server-side validation** of farm-animal collection (NPCUtils.js:81-82) and presumably anti-cheat for kills/drops.
4. `lastUpdated` is used as a last-writer-wins clock in the socket sync (socketManager.js:446-451).

What can be dropped or made local-only when the client is sole authority:
- **All NPC socket traffic** (`update-NPCsInGrid-NPCs`, `npc-moved`, `remove-NPC` emits; `sync-NPCs`, `npc-moved-sync`, `remove-NPC` listeners; the whole controller protocol and `GridState/NPCController.js`; `controllerUsername` state and gating at App.js:2265; the relinquish-on-inactivity branch App.js:3386-3390). `moveOneTile` no longer needs its 1200 ms promise (AllNPCsShared.js:292-306); it can return synchronously.
- **`batch-update-npc-positions`** entirely. Positions are cosmetic; regenerate or keep last known position in a single grid snapshot.
- **`save-single-npc` on every transition.** Replace with timer-derived state: on load, derive `grazing/processing` from `grazeEnd` vs now and `spawn` readiness from `nextspawn`; persist only when a *durable* fact changes (grazeEnd set, animal collected, enemy hp changed/killed, spawn occurred), ideally as one debounced per-grid snapshot (`saveGridStateNPCs` already exists and is unused) on grid leave / `beforeunload` / every N minutes.
- **The stall-verification sleeps** (NPCGrazeBehavior.js:415-437) and the server `state` echo in `farm-animal/collect` (the server could just check `grazeEnd <= now` or trust the client in single-player).
- **`GET /api/resources` in `spawnNPC`** (GridStateNPCs.js:295) -> use `loadMasterResources()`.
- The unreachable `stall` path and `findNearestResource('stall')` if `SKIP_STALL_AFTER_GRAZING` is now permanent.
- The React bridge (`setGridStateReact` on every `updateNPC`/`updateNPCPosition`, GridStateNPCs.js:184-193, 477-486) if the renderer subscribes to the manager directly (see B4).

### A7. Multi-PC assumptions to remove

- `NPCEnemyBehavior.js:102` collects **all** PCs; `111-127` picks a random visible PC; `181-189` retargets to a closer PC; `270-271, 280` reads `targetPC.hp/iscamping`; `329` damages `targetPC` which may be a remote player (the controller client is authoritative for other players' HP via socket). In single-player: target is always the local PC; `pcs` becomes `[currentPC]`.
- `NPCQuestBehavior.js:32-36`, `NPCHealBehavior.js:32-36`, `NPCSpawnerBehavior.js:25, 68`: `.some(pc => ...)` over all PCs.
- `Combat.js:233-259 handleAttackOnPC` (PvP): no live caller; delete.
- `PlayersInGrid.js`: `addPlayer/addPC/updatePC/removePC` all emit `update-NPCsInGrid-PCs` and POST `save-single-pc` / `remove-single-pc` / `batch-update-pc-positions`; `initializePlayersInGrid` also emits `request-current-grid-players` (PlayersInGrid.js:229). `updatePCLocal` exists solely for socket sync.
- `socketManager.js` PC handlers: `player-joined-sync`, `player-left-sync`, `current-grid-players`, `sync-PCs`, `player-connected/disconnected`, `connected-players`; emits `player-joined-grid`, `player-left-grid`, `player-moved`, `join-grid`, `leave-grid`, `set-username`, `request-connected-players`.
- `GridManagement.changePlayerLocation`: fetches the **from** grid's `load-grid-state` only to read the player's own combat stats (GridManagement.js:181-184, which the in-memory manager already has), `removePC` POST (198), `addPC` POST (289), `save-single-pc` after signpost placement (493-505), `player-joined-grid` emit (583).
- Renderer: `PixiRendererPCs` renders every PC with `connectedPlayers` alpha (PixiRendererPCs.js:335, 346) and the FTUE-cave "only me" hack (330-332); `PixiRenderer.handleClick` PC hit-test -> `onPCClick` -> SocialPanel (PixiRenderer.js:1335-1344; App.js:1351-1355); `handleMouseMove` PC tooltip (1429-1444); `PixiRendererSpeech.findEntityPosition` PC lookup (54-77); `PixiRendererVFX` `pcs.find` (200-202). App.js death/lava loop (2310-2345) and heal loop (2367-2381) read `playersInGrid[gridId].pcs[playerId]` - fine, but could read the manager directly.
- `NPCInteractionUtils.handleNPCClickShared` and `ResourceClicking.handleResourceClick` block interaction on *another player's* homestead (NPCInteractionUtils.js:125-129; ResourceClicking.js:66) - keep or simplify.

---

## B. Rendering and client hot paths

### B1. Render pipelines: ACTIVE vs DEAD

**Default production path:** PixiJS, unconditionally. `usePixiJS = true` (App.js:490); the only `<...Renderer>` in the JSX is `<PixiRenderer ...>` at App.js:3934. There are no `settings.renderCanvas*` / `useCanvas*` flags in live code (grep: only in commented-out files).

| Status | Files | Evidence |
|---|---|---|
| **ACTIVE** | `Render/PixiRenderer/*` (PixiRenderer.js, PixiRendererPCs, PixiRendererNPCOverlays, PixiRendererSpeech, PixiRendererVFX, PixiRendererCursor, PixiRendererDoinker, PixiRendererPadding, PixiRendererSettlementGrids, PixiRendererFrontierSettlements, PixiRendererTileTextures, UnifiedCamera, CameraConstants, index) | App.js:23, 3934; PixiRenderer.js:1510-1652 |
| **ACTIVE (partially)** | `Render/RenderDynamicElements.js` - only the exported helpers `generateResourceTooltip/generateNPCTooltip/generatePCTooltip` (PixiRenderer.js:5) and `checkQuestNPCStatus/checkTradeNPCStatus/checkKentNPCStatus` (PixiRendererNPCOverlays.js:3). The `RenderDynamicElements` component (lines 279-427) is unused, but because the module is imported it drags `RenderDynamicElementsCanvas.js` (741 lines) and `SVGAssetManager.js` into the bundle. | grep of importers |
| **ACTIVE** | `Render/RenderAnimatePosition.js` (PC step interpolation, 60 ms), `PlayerMovement.js` (`renderPositions`), `VFX/VFX.js` (DOM particle effects), `VFX/AmbientVFX.js` + `AmbientVFXManager.js` (Pixi ambient layer, 20 fps `setInterval`), `UI/FloatingText.js` (React portal) | |
| **ACTIVE but redundant** | `Render/SVGAssetManager.js`: `preloadResourceSVGs` is awaited during every grid change (GridManagement.js:339-343) to warm the **old canvas renderer's** bitmap cache. PixiRenderer has its own independent SVG texture cache (PixiRenderer.js:35-242) and never reads SVGAssetManager. This is pure wasted work and latency in the fade-to-black. | |
| **DEAD - fully commented out** | `Render/Render.js`, `RenderTilesCanvas.js` (811), `RenderTilesCanvasV2.js` (1138), `RenderDynamic.js` (1019), `RenderDynamicNew.js` (360), `RenderNPCsCanvas.js` (713), `RenderNPCsDOM.js`, `RenderPCs.js`, `RenderPCsCanvas.js`, `RenderPCsDOM.js`, `NPCComponent.js` | first lines are all `//` |
| **DEAD - live code with no importer on the active path** | `RenderNPCs.js` (imports the commented `RenderNPCsCanvas` - would throw if mounted), `RenderResources.js`, `RenderResourcesCanvas.js` (348, registers `registerForceRender` - conflicts with PixiRenderer's registration if ever mounted), `RenderResourcesDOM.js`, `RenderDynamicElementsDOM.js`, `PCComponent.js` (only imported by commented files), `autotiling.js` (no importer at all), `CursorTileHighlight.js` (imported at App.js:24, **never rendered**: 0 JSX occurrences; superseded by `PixiRendererCursor`) | grep of importers; App.js JSX |

Generations, for the record: (1) DOM (`RenderDynamic`, `NPCComponent`, `PCComponent`, `*DOM.js`), (2) Canvas (`RenderTilesCanvas`, `RenderNPCsCanvas`, `RenderResourcesCanvas`, `RenderDynamicElementsCanvas`), (3) CanvasV2 autotiling (`RenderTilesCanvasV2`, `autotiling.js`), (4) Pixi (current). `PixiRendererTileTextures.js` is a port of V2's procedural tile art (file header lines 1-8).

### B2. What PixiRenderer does, and when

Setup (once): `Application` 64x64 tiles x `TILE_SIZE` (= `globalTuning.closeZoom`, App.js:508), `resolution: devicePixelRatio`, `antialias: true`, WebGL1 preferred, **ticker.maxFPS = 29.97** (PixiRenderer.js:46-50, 533), ticker stopped when tab hidden (644-662). Zoom is a CSS `transform: scale()` on the canvas element (668-695); the surrounding DOM "world" is `WORLD_SIZE_TILES (8192) x TILE_SIZE x zoomScale` pixels square (PixiRenderer.js:1471, UnifiedCamera.js:33, 95-97) - at zoom 1 with TILE_SIZE 40 that is a **327,680 px** scroll container.

Layer effects (each is a `useEffect`):
- **Tiles** (704-737): deps `[grid, tileTypes, TILE_SIZE]`. `removeChildren()` then creates 4096 `Sprite`s from `generateTileTexture`. Runs on grid load and on any `tileTypes` change (terraform, `tile-sync`).
- **Resources** (740-841): deps `[resources, masterResources, animationVersion]`. **Full rebuild**: `removeChildren()`, parallel `loadSVGTexture` for *every* resource, then new `Sprite` or new `Text` (emoji, `resolution = 2`, which rasterizes a canvas per Text) for each. Runs on every harvest, plant, build, seed maturation (FarmState every 1 s when something matures), socket `resource-sync`, and VFX grow-animation start/end (`animationVersion` bumps twice per plant, VFX.js:336, 414).
- **NPCs** (907-1042): deps include `npcs` (new array every second, App.js:3452-3458). Pooled display objects keyed by id (good), animation via on-demand ticker (847-902, good). Still awaits `loadSVGTexture` for every NPC every run (cache hit, but still a microtask per NPC) and re-assigns texture/size/text each run.
- **Resource + NPC overlays** (1062-1259): deps `[resources, npcs, computedCraftingStatus, computedTradingStatus, badgeState, electionPhase, currentPlayer, gridOffsetX, gridOffsetY]`. Runs **every second** (npcs) and on every `currentPlayer` change. Serial `for..of` with `await loadSVGTexture` inside per overlay (1154, 1219).
- **Click/mousemove** (1262-1448): mousemove throttled to 20 Hz, but each event does `setHoveredTile` (PixiRenderer state -> PixiRenderer re-render) and `setHoverTooltip` (**App state**, App.js:1357 -> whole-App re-render), after linear `npcs.find` / `resources.find` / `pcs.find`.
- Children: `PixiRendererPCs` (pooled, rAF animation on-demand), `PixiRendererVFX` (**see B3 #2**), `PixiRendererSpeech` (subscribes to ConversationManager; redraws Graphics bubbles on every effect run; deps include `npcs`, `pcs`, `currentPlayer`, `gridOffset`), `PixiRendererNPCOverlays` (per quest NPC `await checkQuestNPCStatus` -> `questCache.getQuests()` + filter; its status cache is **cleared in the effect cleanup** (386-388), and the effect re-runs every second, so the cache never survives), `PixiRendererCursor`, `PixiRendererDoinker` (500 ms `setInterval` poll while FTUE doinker visible, 100-117), `PixiRendererPadding` (**256 absolutely-positioned divs always mounted**, `isActive={true}` at 1526), `PixiRendererSettlementGrids` (up to 63 divs, kept mounted with `visibility:hidden`, 622-625), `PixiRendererFrontierSettlements` (16x16 = 256 settlement cells each containing 64 child divs plus a span = **~16.6k DOM nodes**, kept mounted with `visibility:hidden` once frontier data has loaded, 350-353).

Per-frame work at idle (nothing moving):
- Pixi ticker at ~30 fps renders the scene (4096 tile sprites + resources + NPCs + overlays). No culling: all 4096 tiles are always on stage even though the viewport shows ~20x15 tiles.
- `PixiRendererVFX` rAF at 60 fps: `pcs.find`, `npcs.filter`, `Graphics.clear()` x3+, `drawCircle` + dashed-circle `arc` loops for the player and every attack NPC (PixiRendererVFX.js:176-302). Pixi v7 `Graphics` rebuilds geometry on every draw.
- Ambient VFX `setInterval` 50 ms per active effect (AmbientVFX.js:195, 422, 647): 16 cloud containers or 16 packs x 2-5 butterflies, each with `getChildByName` lookups per frame (269-270, 718-719).
- App.js: NPC loop 1 s (`setAllNPCs` -> App re-render), `updateCountdowns` 1 s (`setCountdowns` -> App re-render), `checkPhaseTransitions` 1 s (local), `checkServer` 2 s (the axios ping is commented out, App.js:329, so it is a no-op that still schedules), death/lava loop 1 s, heal loop 10 s, staleness 60 s, FarmState 1 s, PC batch 5 s, NPC batch 10 s.

### B3. React re-render triggers on hot paths

**Player movement** (PlayerMovement.js): key -> 20 ms collect timer -> `processMovement` -> `isValidMove` (linear `masterResources.find` + `resources.find` + NPC scan, 552-624; dynamic `import()` of Doors on door tiles) -> `playersInGridManager.updatePC` (PlayersInGrid.js:525-607): JSON.stringify compare, `socket.emit('update-NPCsInGrid-PCs')` with the full PC, `animateRemotePC` (60 ms rAF), `setPlayersInGridReact` (**new object -> App re-render**), queue for the 5 s batch POST. Movement cooldown is 60 ms (PlayerMovement.js:35), so holding a key yields up to ~16 **full App re-renders per second**, each of which:
  - recomputes `pcs = Object.values(...)` (App.js:3460, not memoized) -> new prop -> `PixiRendererPCs.renderPCs`, `PixiRendererVFX.renderRangeIndicators`, `PixiRendererSpeech` effect, `PixiRenderer.handleClick/handleMouseMove` callbacks all rebuild;
  - rebuilds the `gridOffset={{x,y}}` literals passed to Cursor/VFX/PCs/Speech/NPCOverlays (PixiRenderer.js:1597, 1607, 1617, 1627, 1636) -> every child `useCallback`/`useEffect` with `gridOffset` in deps re-runs, including `PixiRendererNPCOverlays`' full async overlay pass;
  - re-runs the camera effect (App.js:1036-1127) and tears down / recreates the camera rAF loop (1131-1179), the death/lava and heal intervals (2302, 2345-2360, 2381-2396 have `playersInGrid` in deps), and the zoom-animation effect's closure.
  Note the comment at PlayerMovement.js:272-274: camera tethering during the step is **not** implemented; the camera effect at App.js:1036 moves the scroll only after the React re-render.

**NPC tick**: `setAllNPCs` every second (App.js:2286-2297) -> App re-render -> new `npcs` array -> NPC effect, overlay effect, NPCOverlays effect (with cache wipe), Speech effect, VFX render, plus the NPC-loop effect itself re-creating its interval. Each `updateNPC`/`updateNPCPosition` also calls `setGridStateReact` (GridStateNPCs.js:184-193, 477-486), so a grid with N moving NPCs produces N additional App re-renders per second on the controller.

**currentPlayer churn**: `setCurrentPlayer` is called 141 times across `src` (8 in App.js). `refreshPlayerAfterInventoryUpdate` (InventoryManagement.js:196-244) replaces the whole object from `GET /api/player` after every gain/spend. A new `currentPlayer` reference re-runs ~20 App effects including **re-subscribing socket listeners** (App.js:2622, 2626, 2648, 2657, 2669, 2676), re-binding the window keydown/keyup handlers (2765-2832), recreating the NPC loop interval, and the Pixi overlay effect.

**Resource timers**: FarmState (1 s) calls `setResources` when seeds mature -> App re-render -> `memoizedResources` changes -> Pixi resources layer **full rebuild** + overlay pass + `GlobalGridStateTilesAndResources.setResources` effect (App.js:439-485, which scans all resources and may `setResources` again).

**Tooltips**: `hoverTooltip` is App state (App.js:1357); `PixiRenderer.handleMouseMove` sets it at up to 20 Hz (1401, 1420, 1438, 1447) -> App re-render per mouse move over any NPC/resource/PC.

### B4. Memory / texture handling

- **SVG textures** (PixiRenderer.js:105-242): fixed 128 px (overlays 64 px) x DPR canvases -> `Texture.from(canvas)`, cached by filename, destroyed with `texture.destroy(true)` on unmount or context loss. Sound. `PixiRendererPCs` has a *separate* cache at 512 px (PixiRendererPCs.js:26, 105) that is never destroyed; `PixiRendererNPCOverlays` has a third cache keyed by size (18-112), destroyed on unmount.
- **Tile textures** (PixiRendererTileTextures.js:14-17, 903-992): 64 px canvas per entry; cache key = `${type}-${variation}-${seed}[-${8 neighbours}]` where `seed = (row*127 + col*53) % 10000` is effectively unique per cell, so a 64x64 grid creates ~4096 cache entries (each a retained `<canvas>` + BaseTexture). `clearTileTextureCache()` is only called in `initPixi` and on unmount (PixiRenderer.js:493, 638), and `changePlayerLocation` deliberately keeps `tileTypes` non-empty so PixiRenderer never unmounts (GridManagement.js:299-306). Result: the cache grows by ~4096 textures per distinct grid visited in a session. At 64x64x4 bytes = 16 KB each that is ~64 MB GPU + ~64 MB canvas backing store per grid.
- **Tile sprites**: 4096 `Sprite`s recreated on every tile effect run; `removeChildren()` does not destroy them (GC'd, but the old sprites hold texture refs until collected).
- **Resource layer**: recreated objects on every change (see B2); `Text` objects each own a canvas (`resolution = 2`) and are not pooled; the overlay pool (1082-1101) is the only pooled part.
- **DOM**: VFX.js appends 11 DOM nodes per collect, 11 per source conversion, 1 per plant; cleaned by timeouts. FloatingText portal re-renders its own component only. The settlement/frontier preview DOM (B2) is retained hidden.
- **WebGL context loss** -> forced `window.location.reload()` after 500 ms (PixiRenderer.js:584-599).
- Grid snapshot data-URL cache for settlement previews is a module Map cleared only in `initPixi` (PixiRendererSettlementGrids.js:37, 117-119, PixiRenderer.js:494).

### B5. Top 10 concrete client-performance wins

1. **Stop re-rendering App every second.** Remove `NPCsInGridManager.setAllNPCs` from the NPC loop (App.js:2286-2297) and have `updateNPC`/`updateNPCPosition` stop calling `setGridStateReact`; expose a `subscribe()` on `NPCsInGridManager` and let PixiRenderer (or a tiny `NPCLayer` component) read `getNPCsInGrid()` directly. Same for `setCountdowns` (App.js:2500-2514) - move the countdown display into a leaf component with its own 1 s interval. This alone removes two whole-App renders per second plus all the cascaded Pixi effects.
2. **Make `PixiRendererVFX` on-demand.** Replace the unconditional rAF loop (PixiRendererVFX.js:287-302) with the same "start ticker only while `renderPositions`/`npcAnimations` has activity, stop after N idle frames" pattern used in PixiRendererPCs (396-436) and NPCOverlays (394-465). Cache the dashed circle as a pre-drawn `Graphics` per radius and just move it.
3. **Memoize `pcs` and the `gridOffset` literals.** `const pcs = useMemo(() => Object.values(...), [playersInGrid, gridId])` (App.js:3460) and a single `const GRID_ORIGIN = {x:0,y:0}` constant (gridOffset is always `{0,0}` now, PixiRenderer.js:700-701) instead of five fresh object literals per render (1597-1636). This stops every Pixi child effect re-running on unrelated renders.
4. **Fix the tile-texture cache growth.** Either clear `tileTextureCache` at the start of the tile effect when `grid` identity changes, or key the cache by `(type, variation, neighbourMask)` with `variation = getVariation(row,col,4)` and drop `seed` from the key (keep seed only inside the detail drawing by deriving it from `variation`), which collapses ~4096 entries to a few hundred shared ones. Better still, render the whole 64x64 grid into one `RenderTexture` and use a single sprite - 1 draw call instead of 4096 sprites, and Pixi stops iterating 4096 display objects per frame.
5. **Diff the resource layer instead of rebuilding it** (PixiRenderer.js:740-841): keep a `Map<"x,y", displayObject>` like the NPC layer does; on `resources` change add/remove/update only changed keys; pool `Text` objects. Also stop bumping `animationVersion` for plant-grow (hide the one sprite via `visible=false` instead).
6. **Collapse the App.js intervals and fix their deps.** The NPC loop (2302), death/lava loop (2345-2360) and heal loop (2381-2396) list 6-13 deps and are recreated on nearly every render. Read `playersInGridManager`/`NPCsInGridManager` directly inside a single interval created once (`[]` deps) and keep mutable inputs in refs. Delete the `checkServer` 2 s interval (its request is commented out, App.js:329).
7. **Move tooltip and hovered-tile state out of App.** `hoverTooltip` (App.js:1357) and `hoveredTile` (PixiRenderer.js:358) should live in a tooltip component fed by a ref/subscription from `handleMouseMove`, so a 20 Hz mouse stream never re-renders the 5000-line App or PixiRenderer.
8. **Stop re-subscribing socket listeners and key handlers on every `currentPlayer` change** (App.js:2622-2680, 2765-2832): depend on `currentPlayer?._id` / `gridId` only and read the latest player from a ref. In the single-player target most of these effects disappear anyway (keep chat + badges).
9. **Drop the hidden DOM.** Unmount `PixiRendererFrontierSettlements` / `PixiRendererSettlementGrids` content when not active instead of `visibility:hidden` (currently ~16.6k + 63 nodes retained after one frontier zoom), and make `PixiRendererPadding` (256 divs, `isActive={true}` at PixiRenderer.js:1526) a single background div or a CSS gradient. Also stop awaiting `SVGAssetManager.preloadResourceSVGs` on grid change (GridManagement.js:339-343): PixiRenderer never uses that cache.
10. **Replace linear world scans with indexed lookups.** Build `resourceByTile: Map<"x,y", resource>` whenever `resources` changes (App.js:439-485 already iterates them) and use it in `isValidTile` (AllNPCsShared.js:372), `canSeeTarget` (NPCEnemyBehavior.js:78-81), `isWallBlocking` (GridManagement.js:816-819), `isTileValidForPlayer` (PlayerMovement.js:585), `handleMouseMove` (PixiRenderer.js:1410-1416) and the click hit-tests. Cache `masterResources` as a `Map` by type (it is `.find`-scanned dozens of times per click, e.g. PixiRenderer.js:247-261 per resource per render).

Honourable mentions: `console.log` volume is very high on hot paths (e.g. `Processed NPC updates` every second App.js:2290, per-animation logs RenderAnimatePosition.js:67, 103, per-move logs NPCEnemyBehavior.js:207, 230); `FarmState.initializeAndProcessCompleted` fires one `PATCH /api/update-grid` per matured seed in parallel on grid load (FarmState.js:81-121); `AmbientVFX` per-frame `getChildByName` string lookups.

---

## C. HTTP calls from the client, by situation

Routes are as called; `API_BASE` = `REACT_APP_SERVER_URL` (config.js). Socket emits are listed where they travel with the HTTP call.

### C1. App boot (cold load with a stored player)

| # | Call | File:line |
|---|---|---|
| 1-9 | `GET /api/skills-tuning`, `/api/resources`, `/api/global-tuning`, `/api/interactions`, `/api/traders`, `/api/trophies`, `/api/warehouse`, `/api/xp-levels`, `/api/ftue-steps` (parallel, cached in module scope) | App.js:1428; TuningManager.js:19-165 |
| 10 | `GET /api/player/:playerId` | App.js:1466 |
| 11 | `POST /api/update-last-active` | App.js:1477 |
| 12 | `GET /api/load-grid/:gridId` (initializeGrid -> fetchGridData) | AppInit.js:30; GridManagement.js:684 |
| 13.. | `PATCH /api/update-grid/:gridId` x (matured farmplots) | FarmState.js:96 |
| 14 | `GET /api/load-grid-state/:gridId` (NPCs) | GridStateNPCs.js:212 |
| 15 | `GET /api/load-grid-state/:gridId` **again** (PCs) | PlayersInGrid.js:156 |
| 16? | `POST /api/save-single-pc` if the player is missing from the grid state (`addPlayer`) | App.js ~1700; PlayersInGrid.js:347 |
| 17? | `GET /api/homestead-gridcoord/:gridId` if not cached on the player | App.js:1765 |
| 18? | `POST /api/mark-grid-visited` on first visit | App.js:1786 |
| 19? | `POST /api/update-profile` to clear `settings.hasDied` | App.js:1814 |
| 20 | `GET /api/get-frontier/:frontierId` (timers) | App.js:2438 |
| 21? | `GET /api/get-global-season-phase` if local phase was offSeason | App.js:369 |
| 22 | `GET /api/quests` (first quest-NPC overlay; cached 5 min) | RenderDynamicElements.js:189; QuestCache.js:26 |
| 23 | static `GET /assets/resources/*.svg`, `/assets/overlays/*.svg`, `/assets/playerIcons/*.svg` (Pixi caches) **plus** the same resource SVGs again via `SVGAssetManager` on later grid changes | PixiRenderer.js:137; PixiRendererPCs.js:97; SVGAssetManager.js:36 |

Socket: `connect`, `join-grid`, `player-joined-grid` (full PC), `join-player-room`, `set-username`, `request-npc-controller`, `request-current-grid-players`, `request-connected-players`, `join-chat-rooms` (App.js:1557-1576; PlayersInGrid.js:229; socketManager.js:769).

### C2. Grid transition (`changePlayerLocation`, GridManagement.js:105-676)

| # | Call | File:line |
|---|---|---|
| 1 | `GET /api/load-grid-state/:fromGrid` (only to read own stats already held in memory) | GridManagement.js:181 |
| 2-3 | `POST /api/batch-update-npc-positions`, `POST /api/batch-update-pc-positions` (flush, if pending) | GridStateNPCs.js:131; PlayersInGrid.js:129 |
| 4 | `POST /api/remove-single-pc` | PlayersInGrid.js:645 |
| 5 | `GET /api/load-grid-state/:toGrid` | GridManagement.js:218 |
| 6 | `GET /api/load-grid/:toGrid` | GridManagement.js:221 |
| 7 | `POST /api/save-single-pc` (addPC) | PlayersInGrid.js:437 |
| 8 | `POST /api/update-player-location` | GridManagement.js:290 |
| 9 | `GET /api/load-grid/:toGrid` **again** (initializeGrid -> fetchGridData) | GridManagement.js:327 -> 684 |
| 10.. | `PATCH /api/update-grid/:toGrid` x matured seeds | FarmState.js:96 |
| 11 | static SVG re-fetch via `SVGAssetManager.preloadResourceSVGs` (unused by Pixi) | GridManagement.js:339 |
| 12 | `GET /api/load-grid-state/:toGrid` **again** (NPC hydrate) | GridStateNPCs.js:212 |
| 13 | `GET /api/load-grid-state/:toGrid` **a third time** (PC hydrate) | PlayersInGrid.js:156 |
| 14? | `POST /api/save-single-pc` (findSignpost placement) | GridManagement.js:493 |
| 15? | `POST /api/remove-single-pc` (dead-player cleanup) | GridManagement.js:556 |
| 16? | `POST /api/mark-grid-visited` | GridManagement.js:634 |
| pre | Transit.js may add `GET /api/inventory/:id`, `GET /api/homestead-gridcoord/:id`, `GET /api/get-settlement/:id`, `GET /api/load-grid/:id` before calling `changePlayerLocation` | Transit.js:57, 96, 141, 217, 312, 395, 445 |

Typical: **10-14 HTTP calls**, with `/api/load-grid-state/:toGrid` x3 and `/api/load-grid/:toGrid` x2. Socket: `player-left-grid`, `leave-grid`, `join-grid`, `player-moved`?, `set-username`, `request-npc-controller`, `player-joined-grid`, `request-current-grid-players`.

Zooming out adds: `POST /api/get-settlement-bundle` (App.js:835), `POST /api/grids-tiles` (App.js:882), `GET /api/frontier-bundle/:f` (App.js:942).

### C3. Per player step

**0 HTTP calls per step.** `processMovement` -> `playersInGridManager.updatePC` (PlayerMovement.js:267) -> `socket.emit('update-NPCsInGrid-PCs', fullPC)` (PlayersInGrid.js:557-567) + queued into `pendingUpdates`; `POST /api/batch-update-pc-positions` fires every 5 s if anything is pending (PlayersInGrid.js:33-35, 71) and synchronously on `beforeunload` (211-218). Crossing a grid edge triggers C2. Walking onto a door does a dynamic `import('./GameFeatures/Doors/Doors')` (PlayerMovement.js:594).

### C4. Per resource click / harvest

Doober (crop/drop) collect, `ResourceClicking.handleDooberClick` (181-548):

| # | Call | File:line |
|---|---|---|
| 1 | `POST /api/update-inventory-delta` | InventoryManagement.js:321 (gainIngredients) |
| 2 | `GET /api/player/:id` (refreshPlayerAfterInventoryUpdate inside gainIngredients) | InventoryManagement.js:345 -> 198 |
| 3 | `PATCH /api/update-grid/:gridId` (remove doober) + `socket.emit('update-resource')` | ResourceClicking.js:449; GridManagement.js:48-57 |
| 4? | `POST /api/update-player-quests` if any active quest | QuestGoalTracker.js:56 |
| 5? | warehouse-ingredient drop -> another `gainIngredients` (= +2 calls) | ResourceClicking.js:464 |
| 6? | trophy `earnTrophy` for special items | ResourceClicking.js:496, 505 |
| 7 | `GET /api/player/:id` **again** | ResourceClicking.js:517 |
| 8? | `PATCH /api/update-grid/:gridId` (replant farmplot) + emit | ResourceClicking.js:621 |

Typical harvest: **5-7 HTTP calls, 2-3 of them `GET /api/player`.**

Source conversion (chop tree / mine): `PATCH /api/update-grid` (ResourceClicking.js:758 or 820) + `GET /api/player` (840) = 2.
Farm animal collect: see A5 (4-5). NPC trade: ~6. Heal: ~5. Attack hit: 1 (`save-single-npc`); kill: 4-5. Build/plant/craft panels add their own (`BuildAndBuy`, `Farming`, crafting `start-craft`/`collect-item`, PetPanel.js:212, 287 + `addXP` 333).

### C5. Idle, per minute (nothing happening, tab visible)

| Source | Call | Interval | File:line |
|---|---|---|---|
| Timers | `GET /api/get-frontier/:frontierId` | 60 s | App.js:2426, 2438 |
| NPC positions | `POST /api/batch-update-npc-positions` | every 10 s **if any NPC moved** (on the controller; roaming quest/heal/enemy NPCs move constantly, so effectively 6/min) | GridStateNPCs.js:36-38, 91 |
| NPC transitions | `POST /api/save-single-npc` | per transition; a grid with a few cows and an enemy or two produces several per minute | GridStateNPCs.js:452 |
| PC positions | `POST /api/batch-update-pc-positions` | every 5 s only if the player moved | PlayersInGrid.js:33-35 |
| FarmState | `PATCH /api/update-grid/:gridId` | when a seed matures (max 5 per tick, 1 s) | FarmState.js:175-270 |
| checkServer | none (ping commented out) | 2 s timer still runs | App.js:329, 349 |
| Open panels | `AnimalPanel` 1 s local poll; `TownNews` 1 s **local** (reads localStorage, no HTTP); `CombatPanel` 500 ms local; `PetPanel`/`CraftingStation`/etc. 1 s local countdowns; `AnimalPanel`/`AnimalStall`/`PetsPanel` each do `GET /api/inventory/:id` on open and on every `currentPlayer` change (FarmAnimals.js:104; AnimalStall.js:46; PetsPanel.js:69 + `GET /api/resources` 71) | | |
| Socket keepalive | socket.io heartbeats | ~25 s | socketManager.js:12 (hard-coded `https://vvgame-server.onrender.com`) |

So an idle controller client with roaming NPCs sends roughly **1 GET + ~6 batch POSTs + N transition POSTs per minute**, plus 2 socket emits per NPC step (one full-object `update-NPCsInGrid-NPCs` and one `npc-moved`). A non-controller idle client sends ~1 GET/min and receives all of that.

---

## D. Suggested shape for the single-player refactor (derived from the above)

1. **NPC runtime = `NPCsInGridManager` + behaviours, no React state.** Keep `AllNPCsShared.js` and the behaviour files (they are already client-side logic); delete `NPCController.js`, all NPC socket emits/listeners, `controllerUsername`, `updateNPCPosition`'s socket/React bridge, `moveOneTile`'s 1200 ms promise, the stall path, the `GET /api/resources` in `spawnNPC`. Tick from one `setInterval` (or the Pixi ticker at 1 Hz) that reads the manager, and have the renderer subscribe to the manager (a version counter + `useSyncExternalStore` or a plain callback that pokes the NPC layer).
2. **Persistence = one grid-NPC snapshot** (`saveGridStateNPCs` already serialises the right subset) on grid leave / unload / every few minutes, plus server-side timestamp validation for the few economy-relevant events (animal collect, kill drop, spawn count) if cheating matters. Everything else derives from `grazeEnd`/`nextspawn` at load.
3. **PCs**: render only `currentPlayer` from a local position ref; drop `playersInGrid` context, PC socket sync, `save-single-pc`/`remove-single-pc`/`batch-update-pc-positions`; carry position on `update-player-location` and an occasional heartbeat.
4. **One grid-enter bundle** (`load-grid` + grid state + matured-seed resolution server-side) instead of 5 fetches, and one "player action" endpoint that returns the player delta so `GET /api/player` stops being called 2-3 times per click.
5. **Renderer**: apply B5 #1-#5, #7, #9 regardless of the MMO->SP change; they are independent of networking.

## E. Notable latent bugs seen while reading (not perf)

- `NPCEnemyBehavior.js:277` `updateThisNPC.call(gridId)` - wrong `this`, will throw when an attack target vanishes.
- `NPCHealBehavior.js:33` uses `pc.range` (undefined) instead of `this.range`.
- `NPCController.js:78-79` reads `.npcs` on a map that is already `npcs` - immediate update never runs.
- `socketManager.js` `handleNPCSync`/`handleNPCMoveSync` write `prevState.npcs` at the context root rather than `prevState[gridId].npcs`.
- `NPCWorkerBehavior.js:13-16` `clearInterval(this.updateInterval)` on a millisecond number.
- `RenderNPCs.js` imports a fully commented module and would throw if ever rendered.
- `App.js:329` server-reachability ping is commented out, so the 2 s "server down" modal logic can never trigger, yet `serverPreviouslyDown` reload logic remains.
- `CursorTileHighlight` is imported (App.js:24) but never rendered; `PixiRendererCursor` replaced it.
