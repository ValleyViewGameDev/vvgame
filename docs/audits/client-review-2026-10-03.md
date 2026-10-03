# Client review: architecture, dead code, renderer strategy (2026-10-03)

Read-only review of `game-client/` after Phases 0 to 3 of the single-player refactor landed on `main`.
Prompt: the game feels slow; is it the renderer, player movement, or both; what is dead; what
would we change; and what should the renderer and asset pipeline become before the game goes to
mobile browsers. Builds on `client-npc-and-rendering.md` (2026-10-01); where that audit's finding
still holds it is cited rather than repeated. Every count below was re-run against the working
tree today. Paths are relative to `game-client/src/` unless they start with `public/` or `../`.

**Short answer: both, and the renderer's problem is mostly outside the renderer.** Movement feels
bad because there is no held-key loop, every step commits the whole `App`, and the camera is a
DOM scroll. The renderer is slow because it draws a 2,880 px canvas for the whole grid, rebuilds
the resource layer from scratch on every change, and feeds it 48 MB of SVG rasterised on the main
thread. None of that needs a new renderer. It needs an asset build step, a Pixi-owned camera on a
viewport-sized canvas, and the state churn around `App.js` taken out.

## A benchmark for "feels good" vs "feels bad"

Doober collection is the model interaction and should stay the reference for every other one:
the click removes the sprite, plays the VFX, floating text and SFX **before any await**
(`ResourceClicking.js:339-361`), the server validates in parallel, and the only rollback is a
real conflict (capacity). The player never waits on the network to see the result.

Player movement is the counter-example today: a key press waits on a 20 ms collect timer, an async
validity check, a whole-`App` React commit and a synchronous localStorage write before the camera
moves, and nothing moves at all while a key is merely held. Section 2.2 has the full chain. The
rule going forward (now in `CLAUDE.md`): UI reacts on the input, the server call runs in parallel,
revert only on failure. Section 1.4 lists the interactions that still wait for the round trip.

---

## Part 1: The whole client

### 1.1 Shape of the code

63,761 lines across 278 files. `App.js` is 4,664 lines: 62 `useState`, 50 `useEffect`, 25 `useRef`,
8 `setInterval`s, 165 `console.*` calls, and the JSX for ~45 conditionally rendered panels and
modals (~800 lines, `App.js:3845-4630`). State lives in three places:

1. **`App.js`** owns player, inventory, grid, nine master/tuning tables, timers, zoom and camera
   refs, settlement and frontier data, FTUE, badges, modals, cursor mode.
2. **Module singletons** outside React: `GridState/GridStateNPCs.js`, `GridState/PlayersInGrid.js`,
   `GridState/GlobalGridStateTilesAndResources.js`, `FarmState.js`, `Utils/TuningManager.js`,
   `Utils/GridPrefetch.js`, `Utils/LocationChangeManager.js`, `Utils/QuestCache.js`. Each mirrors
   into a React context through a registered setter, and `App` is the only consumer of those
   contexts, so **every NPC step and every player step is a whole-`App` render**.
3. **Ten contexts** mounted above `App` in `index.js:49-69` (strings, NPC grid state, PC grid state,
   status bar, panel, modal, UI lock, NPC overlay, bulk operation, transition). These are fine.

Props flow down by copying. `PixiRenderer` takes 52 props (`App.js:3644-3790`), nine of them
setters and three inline arrows recreated every render. ~30 panels receive the same 13-prop bundle
(`inventory, setInventory, backpack, setBackpack, currentPlayer, setCurrentPlayer, masterResources,
masterSkills, TILE_SIZE, updateStatus, isDeveloper, globalTuning, masterXPLevels`). `setCurrentPlayer`
is called from 134 sites in 44 files.

Verdict on the architecture: the singletons are the right idea and the Phase 3 `PlayersInGrid`
rewrite shows the target shape (one store, a dirty flag, a timed flush). What is wrong is the
bridge back into React. The contexts should be consumed by the leaf that needs them (the Pixi
NPC layer, the PC layer, a countdown component), not by `App`. Once that is true, `App` stops
rendering on ticks and most of the churn below disappears without touching feature code.

### 1.2 Re-render and network churn (the "feels slow" that is not the renderer)

Measured in code; each item is a whole-`App` commit or a network call on a hot path.

| Trigger | Cost | Where |
|---|---|---|
| Any `setCurrentPlayer` (after every harvest, craft, gain, spend) | `GET /api/get-frontier/:id`, then `setTimers` tears down and recreates the 1 s countdown and phase intervals | `App.js:2258-2268` (deps `[currentPlayer]`), `2352`, `2436` |
| `setCountdowns` every second | whole-`App` commit, 52 renderer props re-evaluated, ~45 panel branches re-checked | `App.js:2352` |
| Every NPC step | `syncReact` → new context value → whole-`App` commit → Pixi NPC effect re-runs its async texture pass; the NPC tick interval is cleared and recreated because `NPCsInGrid` is in its deps | `GridStateNPCs.js:175-189`, `App.js:2142` |
| Every player step (up to 16/s) | `JSON.stringify` diff per key, whole-`App` commit, full `player` JSON parsed and re-serialised into localStorage | `PlayersInGrid.js:333-335, 252-266` |
| Every `App` render | `JSON.parse(localStorage.timers)` (`App.js:365-372`), `localStorage.getItem('player')` (`1354`), header bar maths ×2 (`3302-3340`), new `pcs` array (`3232`), new `transitionFadeControl` (`236`) | |
| Every gain/spend | `GET /api/player/:id` inside `gainIngredients`/`spendIngredients` **and** from 39 caller sites of `refreshPlayerAfterInventoryUpdate` | `Utils/InventoryManagement.js:333, 435` |
| Opening a panel | 9 panels `GET /api/resources` (the 503-row master table) on mount; 19 files `GET /api/inventory/:id` on mount, although both arrive as props | `BuildPanel.js:97`, `SkillsPanel.js:72`, `TradeStall.js:176`, `BuyPanel.js:171`, `PetsPanel.js:71`, `BuyDecoPanel.js:71`, `FarmingPanel.js:87`, `ToolsPanel.js:102`, `GlobalMarketModal.js:47` |
| Location change | two GETs for `isMayor`, which nothing reads | `App.js:401-418` |
| Death/lava loop 1 s, heal loop 10 s | recreated on every change of `resources, inventory, backpack, playersInGrid, currentPlayer` | `App.js:2150-2200, 2207-2238` |
| Mouse over a resource (20 Hz) | `setHoverTooltip` is `App` state | `App.js:1339` |

Transaction shapes are long: a doober is 5 sequential calls after the optimistic part
(`update-inventory-delta` + GET player, `update-grid-resource`, `update-player-quests`, GET player,
replant's `update-grid-resource`); an NPC trade is 6 to 7 round trips before the SFX
(`NPCsPanel.js:701-811`); a Trade Stall listing is 4 (`TradeStall.js:510-528`). Phase 5's
action routes returning the player delta are the fix; until then the redundant refresh GET
(`InventoryManagement.js:333, 435`) can simply be removed, because the server already returns
`inventory`/`backpack` on those routes.

### 1.3 Dead code (every item grepped; zero importers unless stated)

**Files to delete**

- `Utils/CooldownUtils.js`, `Utils/CursorUtils.js`, `UI/StatusBar/StatusBarManager.js`,
  `UI/RouteKeyInput.js`, `UI/TransitionOverlay.css`, `Utils/CONVERSION_TRACKING_SETUP.md`,
  `index.css` (0 bytes).
- `GameFeatures/Government/Taxes.js` (0 lines), `GameFeatures/Social/Camping.js` (0 lines),
  `GameFeatures/Seasons/SeasonManager.js` (4 lines), `GameFeatures/Relationships/Relationships.js`
  (only its `.css` is imported), `GameFeatures/Crafting/WorkerPlacement.json`.
- `public/assets/reference/` (936 KB of dev bug screenshots and a WindowServer crash log),
  `public/assets/images/ValleyViewKeyArt6.png` (2.6 MB, unreferenced), `public/favicon_old.ico`,
  `public/sound/music/homestead2.mp3` (byte-identical to `homestead.mp3`, 7 MB),
  orphan SVGs `iago, ninja, oak-tree-2, outpost, pc-main-icon, wood` in `public/assets/resources/`,
  orphan SFX `sfx-ouch, sfx-swoosh, sfx-sword, sfx_heal, sfx_succes`.
- Six of the ten `UI/Strings/strings*.json` (FI, IT, NO, PT, RU, SV) are byte-identical English
  stubs (48,611 B each) and all ten are statically imported into the main bundle
  (`UI/StringsContext.js:2-11`).

**Dependencies to drop**: `pixi-viewport` (a comment at `PixiRenderer.js:26` says it needs Pixi 8),
`@pixi/particle-emitter`, `react-router-dom` (never imported). `pixi.js-legacy` can become
`pixi.js` (no target needs the Canvas2D fallback; it pulls `@pixi/canvas-*` into the bundle).

**Unused exports** (safe to un-export or delete): `ResourceHelpers.mergeResources`,
`playerManagement.modifyPlayerStatsInPlayer` / `isAGridStateStat`, `TuningManager.clearTuningCache`,
`conversionTracking.trackTutorialComplete` / `trackFirstPurchase`, `DropRates.selectRandomRarity` /
`RARITY_TABLE`, `ResourceLockManager.isResourceLocked` (the lock is written in `ResourceClicking`
and never read), `GridStateNPCs.saveGridStateNPCs` (the D7 snapshot, no caller yet) and
`flushGridPositionUpdates`, `PlayersInGrid.addPlayer/addPC/removePC`, `AppInit.logoutPlayer`,
`Doors.checkDoorAccess`, `BulkAnimalCollect.prepareBulkAnimalData`,
`NPCInteractionUtils.generateNPCTooltipContent` / `setGlobalAttackCooldown`, `NPCUtils.loadNPCDefinitions`,
`Conversation.getTopicSymbol`, `KentOfferLogic.removeCompletedOffer`,
`TrainOfferLogic.generateNewTrainOffers` / `generateTrainRewards`, `Transit.computeNeighbourGridCoord`,
`transitConfig.getOppositeEntryPosition`. In `PlayerMovement.js`, `centerCameraOnPlayerFast`,
`centerCameraOnPlayerSettlement` and `centerCameraOnPlayerFrontier` have no callers (only
`centerCameraOnPlayer` is used, from three sites).

**Unused state and imports in `App.js`**: imports `act`, `memo` (line 10), `questCache` (26),
`getLineOfSightTiles` (139); state `isMayor` (set, never read, costs two GETs), `hoveredTile` (1182),
`showTimers`/`showStats` (3200-3201), `isMasterResourcesReady`, `isLoginPanelOpen`, `playerPosition`
(995), `appInstanceId` (186, `Math.random()` per render); `memoizedGrid/TileTypes/Resources`
(1292-1295) are `useMemo(() => x, [x])` identity no-ops; `grid` and `tileTypes` are the same array
stored twice (`AppInit.js:86-88`); `usePixiJS = true` (481) and its `|| !usePixiJS` guards.

**Leftover MMO paths**: dungeon auto-eject (`App.js:1861-1935`, `2405-2416`; D3 replaced it with
the lazy per-player reset); "someone else's homestead" guards (`App.js:2819-2831` with an
`isFriend = false` placeholder, seven nav buttons at `3473-3530`, `zoomIn`'s owner fetch at
`2470-2490`, `GridManagement.js:685-700`), unreachable since D6; `localPlayerMoveTimestampRef`
(`App.js:2528`, guards a broadcast that no longer exists); teleport-on-click writing
`currentPlayer.position`, which nothing reads (`3060-3080`); the duplicate `join-player-room` emit
(`App.js:1504`; `socketManager.js:19-24` already emits it on connect); per-event
`POST /save-single-npc` on every `updateNPC`/`addNPC` plus the 10 s batch (`GridStateNPCs.js:302,
365, 397`) and the 500 ms sleep-and-verify loop in `NPCGrazeBehavior.js:421-433`, all of which D7's
snapshot replaces. `socketManager.js` itself is already the 112-line keep-set.

**Developer tooling shipped to every player**: `Utils/debug.js` (1,435 lines, 30 axios calls to
27 admin endpoints), `Utils/WorldGeneration.js`, `Utils/GridStateDebug.js` and
`debugTravelShortcuts.json` are reachable only from the developer panel but are static imports
(`App.js:74`, rendered at `3950`), so CRA bundles them for everyone. A `React.lazy` gated on
`isDeveloper` removes ~1,900 lines from the main chunk.

**Duplicated logic**: `handleGemPurchase` exists ten times (`PetsPanel.js:108`, `NPCsPanel.js:548`,
`BuyDecoPanel.js:108`, `WarehousePanel.js:85`, `SkillsPanel.js:129`, `CraftingStation.js:578`,
`FarmHouse.js:531`, `BuildPanel.js:225`, `ShopStation.js:146`, `BuyPanel.js:246`), same
spend → gain → quest → refresh body. Capacity maths is reimplemented inline in `InventoryPanel.js:19-34`
and `WarehousePanel.js:172` although `deriveWarehouseAndBackpackCapacity`/`hasRoomFor` exist.
The backpack-skill check is written out three times in the doober path alone. Legacy single-slot
station shims (`craftEnd` on the station vs `slots[]`) repeat in five files. Five panels run their
own 1 s countdown over `localStorage.timers` while `App` keeps `countdowns` for the same timers.

**Bugs found while reading** (also in `known-issues.md`):
- `App.js:4623` has a stray `)}` after the TradeStall block; it parses and is emitted as literal
  text in the panel area.
- The inactivity effect (`App.js:3121-3195`) adds a `visibilitychange` listener on every run
  (deps `[currentPlayer, gridId]`) and never removes it.
- `let isProcessing` at `App.js:2619` is a render-body variable, so the double-click guard on
  tile clicks resets every render and never blocks; `let isInitializing` at `1309` is the same.
- `TransitionContext.js:13-14` fades an overlay at `top: 85px`; the board starts at `84px` (the
  `left: 300px` is right: app-container 60 + homestead margin 240). One pixel; fixed 2026-10-03.
- `SoundManager` references `sfx_success.mp3` and `sfx_heal2.mp3`; the files on disk are
  `sfx_succes.mp3` and `sfx_heal.mp3`.
- `Modal.js:11` only ever applies `modal-small`, so `modal-medium/large/xlarge` in `Modal.css:68-89`
  are unreachable and every other modal inherits `min-width: 400px`.

### 1.4 Interactions that still wait for the server (doober-pattern candidates)

Already client-first: doober collect, source conversion (axe/pickaxe), planting, melee attack,
farm-animal collect, crafting collect-slot. Still server-first, in order of how often players hit them:

1. **Craft start** (`CraftingStation.js:317-351`): nothing happens until `POST /crafting/start-craft`
   returns, then an extra GET player although the response carries inventory. Flip to: mark the slot
   busy and play "Added" on tap, revert on 409.
2. **NPC trade, quest reward, healer** (`NPCsPanel.js:601-616, 701-811`): SFX, floating text and the
   local inventory delta first; one server action validates.
3. **Gem purchases** (all ten copies): deduct and show immediately.
4. **Trade Stall list/sell/collect** (`TradeStall.js:510-528, 544, 611`): update `tradeSlots` first.
5. **Skills / Buy / Build purchases** (`SkillsPanel.js:220`, `BuildAndBuy.js`): cost is known
   client-side; place or unlock immediately.
6. Pet feed, scroll craft, Farm House hire: same shape.

Each of these becomes one call once Phase 5's action routes return the delta; the optimistic UI
can be done first and independently.

### 1.5 Build and payload

Production build (today): one chunk, `main.*.js` 2.10 MB raw / **618 KB gzipped**, three dynamic
chunks totalling 3 KB. No `React.lazy` anywhere; the ~20 `await import()` calls do not split
because the same modules are also statically imported. Composition by unminified bytes:
`@pixi/core` 542 KB, `App.js` 184 KB, react-dom 131 KB, `@pixi/events` 126 KB, `@pixi/graphics`
115 KB, `@pixi/assets` 112 KB, axios 100 KB, `@pixi/text` 84 KB, `@pixi/text-bitmap` 71 KB,
`@pixi/canvas-renderer` 56 KB, `@pixi/compressed-textures` 52 KB, socket.io-client 93 KB,
`Utils/debug.js` 50 KB. String tables are roughly 25 to 30 % of the gzipped payload (185 KB gz
for ten files; EN alone is 22 KB).

`public/index.html` loads five Google font families (only Berkshire Swash and Lora are used),
a synchronous Ko-fi script in `<head>`, GA and a Reddit pixel; `manifest.json` is the untouched
CRA default; there is no service worker; the viewport meta has no `viewport-fit=cover` or
`maximum-scale`, so iOS pinch will fight the game's own zoom. Source maps (6.7 MB) ship in `build/`.

Audio: 33 MB, of which music is 32 MB (seven mp3s, 3 to 7 MB each, one duplicate). `SoundManager`
uses `HTMLAudioElement` only: a new `Audio()` per SFX play, no pool, no preload, and iOS ignores
`volume`, so the fades, the 0.3/0.5 levels and `mute()` do nothing on iPhone. SFX fired after an
axios response have no gesture context on iOS and fail silently.

### 1.6 Mobile-readiness blockers outside the renderer

*(2026-10-03: the chrome, modal, `100vh`, viewport-meta and fade-overlay items below are addressed by `UI/Styles/mobile.css` and the touch work; audio, ambient dark clouds and the Ko-fi widget remain.)*

- Fixed desktop chrome in pixels: 60 px nav, 220 px base panel, 240 px slide-in panels, board at
  `left: 240px; top: 84px` (`App.css:383-387`, `theme.css:29-31`, `Panel.css:16-20`). On a 390 px
  screen the board is ~90 px wide. **No `@media` query exists in `App.css` or `src/UI/`** (four
  exist in feature CSS). Panels need to become bottom sheets or full-screen overlays.
- `min-width: 400px` on every non-small modal (`Modal.css:49`).
- `100vh` layout (`App.css:36, 385`) breaks under the iOS URL bar; use `dvh`/`svh`.
- Hardcoded geometry: keyart 1100×900 (`App.css:495-506`), login canvas 800×600
  (`LoginScreenButterflies.js:25-26`), `StartScreenAnimation` bounds 240 to 950 px, notifications
  animate `left` (layout, not transform) at `left: 310px`.
- Three touch handlers in the whole client; movement is keyboard only; timers are hover tooltips.
- Audio needs Web Audio with an explicit first-touch unlock; music needs re-encoding
  (64 to 96 kbps, shorter loops).
- Ambient dark clouds (~240 overlapping translucent circles updated by `setInterval`, `AmbientVFX.js`)
  should be capped or disabled below a width/DPR threshold.
- The Ko-fi floating widget and the 60 px `.base-panel-buffer` assume a desktop corner.

### 1.7 Ranked changes for Part 1

| # | Change | Impact | Effort |
|---|---|---|---|
| 1 | Pixi NPC and PC layers subscribe to their stores directly; drop `NPCsInGrid`/`playersInGrid`/`currentPlayer` from `App` effect deps (`App.js:1111, 1163, 2142, 2150, 2207`). No `App` commit per NPC or player step. | perf, very high | M |
| 2 | Timers: key the effect on `currentPlayer?.frontierId`, move countdowns into a `TimersProvider` with one 1 s tick and a leaf component. Removes a frontier GET per player mutation and the per-second `App` commit. | perf, high | M |
| 3 | Delete the nine `/api/resources` and nineteen `/api/inventory` mount fetches; use the props. Panels open with zero network calls. | perf, high | S |
| 4 | Remove the redundant `GET /api/player` after every write (`InventoryManagement.js:333, 435` and the 39 callers); apply the returned delta. | perf + server load, high | M |
| 5 | Lazy-load dev tooling and strings per language; drop `pixi-viewport`, `particle-emitter`, `react-router-dom`, the Canvas2D fallback. ~250 KB gz off the bundle. | size, high | S |
| 6 | One `purchaseWithGems()` helper replacing ten copies; make craft start, NPC trade/quest/heal, gem purchases, Trade Stall and Buy/Build optimistic (section 1.4). | feel, high | M |
| 7 | Delete the dead files, exports, MMO leftovers and unused `App` state in 1.3; fix the six bugs. | maintainability, high | S |
| 8 | Per-step cost: shallow compare in `PlayersInGrid.updatePC`, mirror to localStorage on flush/leave only, strip `console.log` from per-tick and per-step paths (775 `console.log` in `src`; `ResourceClicking.js:204-205` logs the whole player per click). | perf on phones, medium | S |
| 9 | Per-render cost: memoise `seasonData`, `pcs`, `transitionFadeControl`, the three inline renderer callbacks and the header bar maths; fix the `visibilitychange` leak and the inert click guards. | perf, medium | S |
| 10 | Split `App.js` along its seams: boot → `AppInit.js` (exists), camera → the renderer, panels → a `PanelHost` taking one `gameContext` object, tick loops → the singletons. Unlocks `React.memo` on the renderer. | maintainability, high | L |

---

## Part 2: The renderer, movement feel, and the asset pipeline

### 2.1 What the renderer is today

One PixiJS 7 (`pixi.js-legacy`) `Application` whose canvas is the **whole 64×64 grid** at the
"close" tile size (45 px): 2,880 CSS px square, `resolution: devicePixelRatio`, `antialias: true`,
ticker capped at 30 fps. Zoom is a CSS `transform: scale()` on that canvas. The camera is not a
Pixi camera: the canvas sits inside a DOM "world" div sized `8192 tiles × 45 px × zoom`
(368,640 px square at close zoom) and the player is held at a fixed pixel position by writing
`scrollLeft/scrollTop` on the `.homestead` scroll container (`UnifiedCamera.js`,
`App.js:1020-1160`). Settlement and frontier views are HTML divs positioned in that same world
(`PixiRendererSettlementGrids.js`, `PixiRendererFrontierSettlements.js`, plus 256 always-mounted
padding divs in `PixiRendererPadding.js`). Inside the canvas: 4,096 tile sprites, one sprite or
`Text` per resource, pooled NPC display objects, an overlay pool, one PC sprite, range-indicator
`Graphics`, speech bubbles.

The repo history shows three generations (DOM, Canvas2D, Pixi; 25 deleted render files in
`git log --diff-filter=D -- src/Render`). Each solved the previous one's limit. Pixi 7 is the
right layer for a tile game on mobile WebGL and should stay. What needs to change is everything
around it.

### 2.2 Why movement feels bad

The chain for one step:

1. `keydown` arrives. `handleKeyDown` (`PlayerMovement.js:76-144`) adds the key to `pressedKeys`,
   then waits a 20 ms "collect simultaneous keys" timer.
2. The 60 ms `MOVEMENT_COOLDOWN_MS` is checked.
3. `processMovement` awaits `isValidMove` → `isTileValidForPlayer` (async; dynamically
   `import()`s the Doors module on door tiles).
4. `playersInGridManager.updatePC` (`PlayersInGrid.js:393-438`): `JSON.stringify` diff per key,
   a 60 ms linear tween in `animateRemotePC`, `syncReact` (new context value → whole-`App`
   commit), `mirrorToLocalStorage` (parse and re-serialise the entire `player` JSON).
5. The `App` commit rebuilds the 52-prop `PixiRenderer` element and the five `gridOffset={{x,y}}`
   literals (`PixiRenderer.js:1597-1636`), so every Pixi child effect re-runs; the camera effect
   (`App.js:1020`) defers to the tethering effect (`App.js:1116`), which is torn down and
   recreated on every `currentPlayer` or `playersInGrid` change.
6. The camera moves by writing `scrollLeft/scrollTop` on the 368,640 px DOM container each frame.

Three things in that chain are the feel problem:

- **No held-key loop.** Nothing moves the player while a key is held; each step needs a fresh
  `keydown`. After the first step the OS key-repeat delay (250 to 500 ms) passes before repeats
  arrive, then steps come at the OS repeat rate throttled by the 60 ms cooldown and the 20 ms
  collect timer. That initial hitch and the OS-controlled cadence afterwards is "sluggish". The
  `pressedKeys` set already exists; it is only read inside the keydown-triggered timer.
- **One `App` commit per step** (up to 16/s) with a synchronous localStorage write of the full
  player record each time. On a phone that is the whole frame budget.
- **The DOM scroll camera.** Scrolling an overflow container that large, with a CSS-transformed
  2,880 px canvas inside it, is layout plus compositor work every frame; on touch devices the same
  container is finger-scrollable (`touch-action: pan-x pan-y`, `App.css:393`), so the player can
  drag the camera off the character.

The fix is small and independent of the big refactor: a per-frame loop while keys are held
(first step immediate, then a tuned 80 to 120 ms per tile), the camera as `worldContainer.position`
inside Pixi instead of a DOM scroll, and no `App` commit per step (the PC layer reads
`playersInGridManager` directly; the localStorage mirror waits for the 30 s persist tick). The
server contract is untouched: position still persists through `POST /api/player/state`.

### 2.3 The asset pipeline is the other half of "slow"

Every resource with a `filename` in `../game-server/tuning/resources.json` is an SVG in
`public/assets/resources/` (116 referenced, 108 on disk plus 6 orphans, **48.5 MB**). They are not
icon-sized vectors: `factory.svg` is 2.7 MB, `academy.svg` 2.1 MB, eight files exceed 1.3 MB,
32 exceed 500 KB, `pine-tree.svg` is 897 KB. None embed rasters; they are auto-traced path soup
(`matrix(0.364964 …)` transforms, thousands of nodes) exported from an illustration tool.

At runtime (`PixiRenderer.js:105-242`) each file is fetched, parsed with `DOMParser`,
re-serialised, loaded into an `<img>`, drawn to a 128 px × DPR canvas and uploaded as a texture.
A town that uses 40 distinct SVGs downloads and rasterises tens of megabytes of XML on the main
thread before its resource layer can appear. There is no sprite sheet, no atlas, no build step.
`PixiRendererPCs.js` keeps a second cache at 512 px; `PixiRendererNPCOverlays.js` a third.

The emoji side of the catalogue (347 of 503 resource types have no SVG) renders as `PIXI.Text`
with `resolution = 2`. Each `Text` owns its own canvas and texture; two instances of the same emoji
share nothing; the glyph comes from the platform emoji font, so iOS, Android and desktop show
different art.

Grid census from the 2026-10-03 backup, decoded with `../game-server/utils/ResourceEncoder.js`:

| Grid | Resources | SVG sprites | Distinct SVG files | Emoji `Text` objects |
|---|---|---|---|---|
| valley2 (typical) | 2,259 | 2,209 | 3 | 50 |
| valley3 (dense) | 3,197 | 2,988 | 7 | 209 |
| town | 901 | 872 | 40 | 29 |
| largest homestead | 3,051 | 1,658 | 21 | 1,393 |

Add the 4,096 tile sprites, each with its own 64 px canvas texture because the cache key includes
a per-cell seed (`PixiRendererTileTextures.js:903-921`) and the cache is never cleared across
grids, and a valley is 6,000 to 7,000 display objects with ~4,100 unique textures, all on stage,
none culled, walked by Pixi 30 times a second, while the resource layer is thrown away and
rebuilt from scratch (`removeChildren()` then every sprite anew, `PixiRenderer.js:740-841`) on
every harvest, plant, seed maturation and twice per plant-grow VFX.

Other per-frame costs still present from the 2026-10-01 audit: `PixiRendererVFX.js:286-303`
runs an unconditional 60 fps rAF that clears and redraws all range-indicator `Graphics`;
`AmbientVFX.js` runs its own 50 ms `setInterval` per effect (three unsynchronised clocks: Pixi
ticker, VFX interval, rAF fades), updates every object whether on screen or not, and the dark
clouds variant is ~240 overlapping translucent circles of up to 240 px. `VFX.js` (collect, swipe,
plant-grow) is DOM, not Pixi: emoji `<div>`s with CSS transitions appended to the world container,
with forced reflows at `VFX.js:227, 288`.

### 2.4 Mobile blockers that are specific to this renderer

- **Canvas size.** 64 tiles × 45 px = 2,880 CSS px at `resolution: devicePixelRatio`: a 5,760 px
  square drawing buffer on a 2× phone (127 MB) and 8,640 px on a 3× iPhone (285 MB). That exceeds
  what mobile Safari will allocate for one canvas on most devices (it silently shrinks or blanks
  the context) and invites WebGL context loss under memory pressure, which this code answers with
  a full page reload (`PixiRenderer.js:584-599`). On its own this makes the current renderer a
  non-starter on phones. It has to become a viewport-sized canvas with a Pixi camera.
- **The DOM world.** A 368,640 px scroll container, hidden settlement/frontier preview trees
  (~16.6k nodes after one frontier zoom), 256 padding divs, and a finger-scrollable camera.
- **MSAA on.** `antialias: true` buys nothing for axis-aligned sprites and costs fill rate on tile
  GPUs.
- **No touch input model.** Movement is keyboard only; tooltips are hover only.
- **First-visit payload.** Tens of MB of SVG XML parsed on the main thread, plus 3 to 7 MB of
  music per grid change.

### 2.5 Strategic recommendation

Keep PixiJS 7 (move to plain `pixi.js`). Rebuild the four things around it, in this order.

**A. Assets: pre-rasterise at build time into atlases; settle the emoji question.** *(Built 2026-10-03: `scripts/build-atlas.js`, `Render/PixiRenderer/AtlasTextures.js`, `Utils/emojiKey.js`; six 2048 px sheets, 2.3 MB WebP; emoji = Option 1 with Twemoji.)*
- A one-off script (`game-client/scripts/build-atlas.js`, sharp or resvg plus a packer) renders
  each SVG at 128 px (256 px for `size >= 2` buildings) into a few 2048 px PNG/WebP sheets with a
  JSON frame map keyed by `filename`. The client loads the sheets once with `Assets.load`;
  `loadSVGTexture` becomes a frame lookup. First-visit payload drops from ~48 MB of XML to
  2 to 4 MB of compressed sheets; texture count per grid drops from hundreds to a handful; Pixi
  batches the resource layer into a few draw calls.
- Decide the emoji policy once. **Option 1**: render the emoji catalogue into the same atlas at
  build time with one chosen font (Noto Color Emoji or Twemoji) so every platform shows the same
  art and `Text` disappears from the world layer. **Option 2**: commission or convert SVGs for the
  ~150 world-visible emoji resources (doobers, crops, walls, deco) and keep emoji only in UI
  panels. Option 1 is a day of work and removes a platform-dependence bug class; Option 2 is the
  art-direction decision and can follow. The mix is what hurts, not either choice.
- The SVG sources belong in the editor's asset pipeline rather than hand-copied files; six are
  already orphaned on disk.

**B. Camera: viewport-sized canvas, Pixi owns the camera.** *(Built 2026-10-03: `PixiCamera.js`; previews stay HTML inside the camera-mirrored overlay for now.)*
- Size the canvas to the visible game area, keep `worldContainer` in Pixi and move it to follow
  the player (`position = screenCentre - playerPixel × scale`). Zoom becomes `worldContainer.scale`
  with the same lerp `App.js:555-739` runs on the DOM today, minus the writes to `scrollLeft`, the
  canvas transform, the padding container and the world div.
- Delete the DOM world: `PixiRendererPadding`, the `.pixi-world-container` sizing, the
  `.homestead` scroll logic, the four `centerCameraOnPlayer*` variants. Settlement and frontier
  previews move into Pixi as one sprite per neighbour grid from the existing 64 px snapshot
  canvases (`PixiRendererSettlementGrids.js:84-112` already generates them) and a tinted rect per
  settlement at frontier zoom.
- Cull: with a real camera, the 4,096 tiles become one `RenderTexture` sprite (one draw call) and
  resources outside the camera rect plus a margin get `visible = false`. This is the step the
  seamless-world plan (`../phase-3-contract.md` §3) depends on, so none of it is throwaway.

**C. Scene management: diff, do not rebuild.**
- Resource layer keyed by `"x,y"` with add/update/remove (the NPC layer already works this way).
  Pool `Text` and `Sprite`. Stop bumping `animationVersion` for the grow VFX; hide the one sprite.
- Tiles: one `RenderTexture` per grid, redrawn only for the changed cell and its eight neighbours
  on terraform. Clear the per-cell texture cache on grid change or drop the seed from its key.
- `PixiRendererVFX`: on-demand ticker like the PC layer; pre-drawn range circles.
- Ambient VFX on `app.ticker` with delta time, culled to the camera rect, dark clouds capped at
  ~16. Collect/swipe/grow VFX as Pixi sprites in the world layer instead of DOM.
- `antialias: false`, `resolution: Math.min(devicePixelRatio, 2)`,
  `powerPreference: 'high-performance'` on mobile.

**D. Input: a movement loop and touch.** *(Built 2026-10-03: 90 ms timer-driven loop, tap-to-walk via `Utils/Pathfinding.js`, long-press tooltip, pinch zoom steps. A virtual d-pad was not needed.)*
- Per-frame held-key loop (first step immediate, then a tuned repeat), camera inside Pixi, no
  `App` commit per step, localStorage mirror debounced.
- Touch: tap-to-move with a short A* over the passable grid (the `isTileValidForPlayer` rules
  already define passability), long-press for the tooltip, pinch for zoom through the same lerp.
  A virtual d-pad is the fallback, not the plan.

**E. React boundary.** After A to D the renderer needs: `grid/tileTypes`, `resources`, `npcs`,
the local player's id, icon, hp and state flags, `masterResources`, zoom level, cursor mode, and
one click callback. The other ~40 props on `<PixiRenderer>` are interaction-handler plumbing for
NPC clicks that belongs in a thin `GameActions` context. Wrap `PixiRenderer` in `React.memo` once
its props are stable.

**Effort**: A 2 to 3 days, B 3 to 4 days, C 2 to 3 days, D 2 days, E 1 day. Do A first: it is the
change players notice on day one (first grid load) and it carries no risk to the camera. B and D
together are what fixes movement feel and unblocks phones. This replaces Phase 4 items 2 to 5 and
8 in `../refactor-plan.md`; Part 1's items 1 to 5 are Phase 4 items 1, 6, 7 and 10 restated with
today's numbers.

### 2.6 Transition latencies worth cutting now

These are tuning constants and account for a visible share of "slow" between actions:
fade-to-black 600 ms and fade-from-black 900 ms (`UI/TransitionContext.js:6-7`; the TEMPORARY
fade on prefetched crossings keeps both), swipe VFX 1,000 ms (comment says "was 400"), plant-grow
1,500 ms (`VFX/VFX.js`), ambient fade 1,000 ms on every grid change (`VFX/AmbientVFXManager.js:124-131`),
music transition 2 s out + fetch + 2 s in (`Sound/SoundManager.js:116-127, 177-181`). Halving each
is a one-line change with no architectural cost.
