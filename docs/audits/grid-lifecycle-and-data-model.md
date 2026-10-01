# vvgame game-server: Grid Lifecycle and Data Model Audit (read-only)

Scope: `/Users/jonathanknight/GameDevelopment/vvgame/game-server`. All paths below are relative to that directory unless absolute. Byte figures marked "measured" were produced by running the real encoders over the real layout files; BSON figures are estimates derived from those.

---

## 1. World hierarchy as implemented

### Frontier -> Settlements -> Grids

- **Frontier** (`models/frontier.js:3-122`): `settlements` is an 8x8 2D array of `{settlementId, settlementType, available}` (`frontier.js:7-15`). Also holds all phase timers (taxes/bank/seasons/elections/train/carnival/messages/networth/dungeon), `seasonlog`, and the `dungeons` Map registry (`frontier.js:107-120`).
- **Settlement** (`models/settlement.js:4-161`): `grids` is an 8x8 2D array of cells `{gridId (ObjectId|null), gridCoord (Number), gridType, available}` (`settlement.js:8-26`). The cell `gridType` enum is `homestead|town|valley|valley1|valley2|valley3|reserved` (no `dungeon`). The rest of the doc is settlement economy/politics (roles, votes, offers, train/carnival logs, population).
- **Grid** (`models/grid.js:3-117`): one document per materialised 64x64 map. **Grid has no `gridCoord` field**; the coord lives only in the Settlement cell. Several call sites read `grid.gridCoord` off a Grid doc and get `undefined` (`routes/worldRoutes.js:171`, `:3187`, `:3514`).

### Frontier layout (tier 1) and counts

`layouts/frontierLayouts/frontierTier1/frontierLayout.json` is an 8x8 of settlement types:

```
row0: dungeonSet, homesteadSetN x6, dungeonSet
row1-6: homesteadSetW, 6 valley sets, homesteadSetE
row7: dungeonSet, homesteadSetS x6, dungeonSet
```

- 64 settlements per frontier: 24 homestead sets (N/S/E/W), 36 valley sets (20 `valley1Set`, 12 `valley2Set`, 4 `valley3Set`), 4 `dungeonSet` corners.
- Each settlement has 64 grid cells. Homestead set layout (`layouts/settlementLayouts/homesteadSetN/settlementLayoutN.json`) is 63 `H` + 1 `T` (town at row 7 col 2 for N). Valley sets are 64 `valleyN`. `dungeonSet` is 64 `D`.
- Cell type mapping at frontier creation (`routes/frontierRoutes.js:276-294`): `H` -> homestead, available=true; `T` -> town; `R` -> reserved; `valley1/2/3` -> that type. **`D` has no case and falls through to `reserved`, available=false.** Dungeon grids are therefore not addressable through Settlement cells at all; they live only in `Frontier.dungeons`.
- Totals per frontier: 1512 homestead slots, 24 towns, 2304 valley cells (1280 v1 / 768 v2 / 256 v3), 256 reserved (dungeon corners). 4096 cells total, which is exactly the size of the `gridsVisited` bitmap.
- A settlement is marked `available` in the frontier only if `settlementType.startsWith('homesteadSet')` (`frontierRoutes.js:332`).
- Grids are **already created lazily**: at frontier creation only Settlement docs are written; `gridId` is null until `performGridCreation` runs for that cell (`utils/createGridLogic.js:246-248`). `relocatePlayersHome.js:55` mentions "~882 total" Grid docs in production, i.e. far fewer than 4096 cells.

### gridCoord encoding

`calcGridCoord` (`routes/frontierRoutes.js:21-40`): string concat of `tier.padStart(2)` + `frontierIndex.padStart(2)` + `sRow` + `sCol` + `gRow` + `gCol`, then `parseInt`. For tier 1 / frontier 1 the leading zero is dropped, giving 7-digit numbers like `1011100` = tier 01, frontier 01, settlement (1,1), grid (0,0). The comment in `utils/gridsVisitedUtils.js:7-11` describes it as `TFFSSGG`; the real layout is `TTFFSSGG` with the leading zero lost, but since only `% 10000` is used it does not matter.

`gridCoordToBitIndex` (`gridsVisitedUtils.js:16-41`): `SSGG = coord % 10000`, bit = `(sRow*8+sCol)*64 + (gRow*8+gCol)`, range 0-4095. Note `utils/IDs.js` does **not** encode coords; it only picks the first `available` settlement/grid (`IDs.js:37-39`, `:63-65`) and is used by three debug routes (`worldRoutes.js:13`, `:1051-1095`).

### valleyFixedCoord mapping

`layouts/gridLayouts/valleyFixedCoord/<gridCoord>.json` (384 files, ~100KB each, full 64x64 `tiles` + `resources` arrays plus distributions). Lookup is by exact file name at `createGridLogic.js:70-76`, `resetGridLogic.js:148-157`, and `plantNewTreesLogic.js:69-89`. E.g. `1011100.json` = settlement (1,1) grid (0,0), the top-left valley1 grid adjacent to the N homestead row. Files exist for settlements 11..16 and 21..27 etc. (rows 1-6, cols 1-7 of the valley block). If the file is absent the grid is generated randomly from `randomValleyGridLayouts.json` (30 entries, `templateUtils.js:19-136`). There is a stray `valleyFixedCoord/undefined.json`.

`layouts/valleyEntryPoints.json` maps a homestead settlement `"row,col"` to the `valleySettlement` + `valleyGrid` the player enters when leaving that settlement (28 entries covering the ring). It is static client/server travel data, not part of grid creation.

---

## 2. Grid document anatomy

Schema (`models/grid.js`):

| Field | Type | Notes |
|---|---|---|
| `gridType` | enum `homestead|town|valley|valley1|valley2|valley3|dungeon|reserved` | `grid.js:5-9` |
| `region` | String/null | editor-set, `worldRoutes.js:3842-3899` |
| `NPCsInGrid` | Map<id, {id,type,position{x,y},state,hp,maxhp,grazeEnd,lastUpdated}> | `grid.js:15-31`; creation also writes armorclass/attackbonus/damage/attackrange/speed and spawner props that are **not in the schema** (`createGridLogic.js:172-185`, `resetGridLogic.js:292-313`); saves use `validateBeforeSave:false` (`resetGridLogic.js:366`) |
| `NPCsInGridLastUpdated` | Date | |
| `playersInGrid` | Map<playerId, {playerId,username,type:'pc',position,icon,hp,maxhp,attackbonus,armorclass,damage,attackrange,speed,iscamping,isinboat,lastUpdated}> | `grid.js:35-64`, icon validated as emoji |
| `playersInGridLastUpdated` | Date | |
| `frontierId`, `settlementId` | ObjectId, required | `/create-dungeon` passes the string `'global'` when absent (`worldRoutes.js:3042-3043`), which would fail the ObjectId cast |
| `ownerId` | ObjectId/null | homestead owner only (`createGridLogic.js:255-271`) |
| `outpostTradeStall` | [ {slotIndex,resource,amount,price,sellTime,boughtBy,boughtFor,sellerUsername,sellerId} ] | sparse; 4 slots; written only by `routes/tradingRoutes.js:445-834` |
| `resources` | [Mixed] | V2 encoded arrays, `grid.js:101-105` |
| `tiles` | String | base64 of 4-bit packed tiles, `grid.js:107-111` |
| `lastOptimized` | Date | |

Indexes: `{frontierId, gridType}` and `{frontierId, gridId}` (`grid.js:120-121`); the second references a field that does not exist. No `timestamps`, so `/grids` returning `createdAt` (`worldRoutes.js:3144`) yields undefined.

### Tiles (`utils/TileEncoder.js`)

- 14 tile types mapped to 4-bit codes (`TileEncoder.js:5-20`): g s d w p l n o x y z c v u.
- 64x64 = 4096 tiles x 4 bits = **2048 bytes**, stored base64 = **2732 chars** (measured). Row-major, y outer (`TileEncoder.js:56-67`, `:154-161`).
- Every tile mutation decodes the whole string, edits, re-encodes (`utils/GridTileManager.js:65-93`).
- `TileEncoder.js.backup` is the old 3-bit V1 where `o/x/y/z` all collided on `0b111`.

### Resources (`utils/ResourceEncoder.js`, V2)

Per resource: `[layoutKey, x, y]` plus optional `[flags, ...values]` (`ResourceEncoder.js:65-114`). `layoutKey` is the 2-char `layoutkey` from `tuning/resources.json` (504 entries). Flags (bit order = `PROPERTY_ORDER`, `ResourceEncoder.js:4-25`): growEnd=1, craftEnd=2, craftedItem=4, qty=8, size=16, occupied=32, stationLevel=64, slots=128. `craftedItem` is stored as a layoutKey; `slots` is stored as a **JSON string** (`ResourceEncoder.js:88-101`). Unknown types fall back to a plain object with `layoutKey:'UNKNOWN'` (`ResourceEncoder.js:49-63`).

Examples (measured): `["OT",18,39]` (plain Oak Tree), `["OT",3,4,1,1760000000000]` (with growEnd).

**Gotcha:** `anchorKey` and `passable`, added at creation for multi-tile resources (`createGridLogic.js:151-162`, `resetGridLogic.js:264-275`, `worldRoutes.js:3016-3024`), are **not** in `PROPERTY_ORDER` and are silently dropped on encode. Only the UNKNOWN fallback preserves them. The comment says shadows are client-generated, so this is wasted work rather than data loss.

Every resource mutation decodes the whole array, edits one entry, re-encodes the whole array (`utils/GridResourceManager.js:116-148`), serialised per grid through `queue.js` (`worldRoutes.js:524-525`).

### Measured sizes (JSON of the encoded form; BSON is roughly 2.5-3x for these tiny nested arrays because each element carries a type byte, a string index key, and a 4-byte inner length)

| Grid | resources | encoded JSON | est. BSON resources | tiles |
|---|---|---|---|---|
| homestead at creation | 29 static + seasonHomesteadCrops (1700 Oak Tree, 10 Money, ~65 crops; `tuning/seasons.json`, applied at `createGridLogic.js:110-112`) ~1800 | ~23 KB | ~60 KB | 2.7 KB |
| townN | 1310 | 16.8 KB | ~45 KB | 2.7 KB |
| dungeon d001 | 1051 | 13.3 KB | ~37 KB | 2.7 KB |
| valleyFixed 1011100 | 1875 | 23.8 KB | ~65 KB | 2.7 KB |
| valleyFixed 1012333 | 2002 | 25.5 KB | ~70 KB | 2.7 KB |
| random valley1 | 1845 | 23.4 KB | ~65 KB | 2.7 KB |

NPC entry ~193 B JSON (~250 B BSON); PC entry ~278 B JSON. A valley has 6-12 enemies from `enemiesDistribution`; a town/homestead has a handful of static NPCs. **Typical 64x64 grid document: 40-75 KB BSON, dominated (>90%) by resources.** Homesteads shrink as the owner clears trees.

Dungeon note: `generateEnemies` runs only for non-fixed layouts (`createGridLogic.js:192-197`, `resetGridLogic.js:325-330`), and dungeons are always fixed, so the `enemiesDistribution` in `dungeon/d001.json` is ignored; dungeon NPCs come only from `npc` layoutkeys in the template's `resources` array.

### The separate `Resource` collection

`models/resource.js` defines `{gridId, x, y, type, growEnd, craftEnd, craftedItem, qty, size, stationLevel, occupied, slots[]}`. **Nothing requires it** (grep for `models/resource` returns zero hits outside the model). It is the pre-V2 per-resource document model; all of those fields now live inline in the encoded `Grid.resources` entries. Crafting slots, `craftEnd`, `growEnd`, `stationLevel` are read/written via `gridResourceManager.updateResource` in `worldRoutes.js` (`/update-grid` `:503-646`; crafting `:1410-1498`, `:1585-1732`, `:2628-2734`; farm plots `:2516-2524`). The collection can be dropped.

### Per-grid "world state" vs structural

| Field | Class | Why |
|---|---|---|
| `gridType`, `frontierId`, `settlementId`, `region` | structural | identical for every player |
| `tiles` | structural, but mutable | changed by `/update-tile` (`worldRoutes.js:649-686`), season snow/melt sweep (`utils/seasonReset.js:113-194`), `/make-it-snow`, `/melt-the-snow`. Snow is derivable from `frontier.seasons.seasonType` and need not be stored per player |
| `resources` | **world state** | harvest/plant/craft state, timers, player-built structures |
| `NPCsInGrid` + `LastUpdated` | **world state** | hp/position/state/grazeEnd |
| `playersInGrid` + `LastUpdated` | multiplayer presence | disappears in single-player except as a "who is home" signal for homestead snapshots |
| `outpostTradeStall` | shared economy | cross-player trading on a valley grid; needs a product decision (keep shared, or move to a player-keyed stall) |
| `ownerId` | homestead only | stays shared |
| `lastOptimized` | bookkeeping | |

---

## 3. Grid lifecycle

### Frontier + settlement creation

`POST /create-frontier` (`routes/frontierRoutes.js:147-358`): names the frontier "Valley View N", seeds all timer windows from `tuning/globalTuning.json`, loads `frontierTier1` via `getTemplate('frontierLayouts', ...)` (`:242`), then for each cell loads `getTemplate('settlementLayouts', settlementType)` (`:262`). `getTemplate` (`utils/templateUtils.js:144-188`) picks a **random file** from the type directory; every referenced directory has exactly one file so this is deterministic in practice. Settlement docs are saved with `taxrate: 2` and empty roles (`:317-324`).

### Grid creation: `performGridCreation` (`utils/createGridLogic.js:16-251`)

1. Resolve settlement (falls back to scanning all settlements for the coord, `:22-32`) and the target cell (`:37-38`).
2. Layout selection:
   - homestead: always `homestead/homestead.json` (`templateUtils.js:195-199`); tiles are 80% g / 20% d wildcards with a fixed pavement core (measured: 3865 `**`, 176 PA, 30 GR, 25 DI) and 81 static resource keys.
   - town: `town<N|S|E|W|NE|NW|SE|SW>.json` chosen from the settlementType suffix (`createGridLogic.js:47-64`, `templateUtils.js:200-221`). The fallback `town_default.json` **does not exist** in `layouts/gridLayouts/town/`, so a town in a settlement with no position suffix would throw "Invalid layout".
   - valley: `valleyFixedCoord/<coord>.json` if present, else `getRandomValleyLayout(gridType)` (`:69-92`). Random layouts omit `tiles`/`resources` and supply only distributions; `worldUtils.generateGrid` fills a 64x64 wildcard grid with deposit-tile clumping for valleys (`utils/worldUtils.js:182-332`).
3. `resourceDistribution` for town/homestead is replaced by `seasonTownCrops` / `seasonHomesteadCrops` from `tuning/seasons.json` (`:103-119`).
4. Tiles: `generateFixedGrid` or `generateGrid` -> type chars; Winter converts g->o (`:131-143`).
5. Resources: `generateFixedResources` (exact placement) or `generateResources` (statics first, then distribution placed on tiles the resource is `validon<tile>` for; `worldUtils.js:334-464`). `Stub` entries are removed (`:200-204`).
6. NPCs: static `npc` layoutkeys in `layout.resources` (`:166-189`) plus `generateEnemies` for random layouts (`:192-197`).
7. Encode, `new Grid(...)`, save; set cell `available=false`, `gridId` (`:231-248`).

`miniTemplates/` (dungeon rooms/halls, roads) has **no server references**; it is editor-only authoring data.

Dungeons are created separately by `POST /create-dungeon` (`worldRoutes.js:2945-3099`): fixed template from `layouts/gridLayouts/dungeon/<name>.json`, static NPCs only, then registered in `frontier.dungeons` (`:3058-3076`).

### Homestead assignment

`POST /create-homestead` (`worldRoutes.js:363-500`), called when the player buys the Home Deed:
- Requires `Home Deed` in inventory/backpack (`:390-396`).
- **Slot pick is first-fit, row-major over `frontier.settlements`, then row-major over `settlement.grids`, first cell with `available === true && gridType === 'homestead'`** (`:407-429`). No randomisation, no "near friends"; settlement (0,1) fills first.
- `performGridCreation` for that coord (`:439-444`), `claimHomestead` sets `ownerId` (`createGridLogic.js:255-271`), then `Player.findOneAndUpdate({_id, gridId:null}, {gridId, settlementId, homesteadGridCoord})` as the race guard (`:458-466`), then `population +1` (`:482-485`).
- Registration (`routes/auth.js:19-148`) does **not** create a homestead; new players spawn in the shared FTUE cave dungeon `695bd5b76545a9be8a36ee22` (`auth.js:123-132`, `worldRoutes.js:3265`).

Homestead relocation `POST /relocate-homestead` (`worldRoutes.js:1173-1308`): moves the `gridId` pointer from one settlement cell to another (source `available=true`, target `available=false`), updates `grid.settlementId`, `player.settlementId`, `player.homesteadGridCoord`, population counts, and decrements `player.relocations`. The Grid document content is untouched. Bug: `updated = true` at `:1197` and `:1207` assigns an undeclared variable.

Removal: `POST /remove-homestead` (`:155-241`) relocates occupants home, deletes the Grid, frees the cell. `POST /delete-player` (`routes/playerRoutes.js:1124-1200+`) does the same plus `population -1`.

Player relocation home (`utils/relocatePlayersHome.js`): `relocatePlayersHome(frontierId)` (`:8-192`) scans grids with non-empty `playersInGrid`, moves each PC entry to its home grid, restores HP, spawns at `Signpost Town` x+1 (`:105-110`), rewrites `player.location`. `relocateOnePlayerHome` (`:195-408`) is the single-player version used by `/send-player-home` (`playerRoutes.js:21-80`) and homestead removal. Both are pure `playersInGrid` bookkeeping and go away in a single-player design.

### Grid reset: `performGridReset` (`utils/resetGridLogic.js:51-368`)

Same layout selection as creation (homestead `:66-71`, town `:73-93`, dungeon from `frontier.dungeons.get(gridId).templateUsed` `:95-138`, valley `:140-175`), regenerates tiles/resources/NPCs and overwrites `resources`, `tiles`, `NPCsInGrid` in place (`:346-366`). **Preserved:** `_id`, `gridType`, `frontierId`, `settlementId`, `ownerId`, `region`, `playersInGrid`, `outpostTradeStall`. Callers: `/reset-grid` (`worldRoutes.js:115-132`), `/reset-dungeon` (`:3163-3218`), `/enter-dungeon` when `needsReset` (`:3503-3535`), `/manual-grid-reset` (`:3779-3840`). **Season reset no longer calls it** (`utils/seasonReset.js:48-51`).

### Season end: `seasonScheduler` -> `seasonFinalizer` -> `seasonReset`

Driven by `schedulers/mainScheduler.js:26-44, 47-200` per-frontier timers; `onSeason` = 129585 min (~90 days), `offSeason` = 25 min (`tuning/globalTuning.json`). On transition to `offSeason` (`schedulers/seasonScheduler.js:24-34`):

1. `seasonFinalizer` (`utils/seasonFinalizer.js:11-132`): recompute net worth for all players (`utils/networthCalc.js:6-43`; structures counted from the player's homestead `resources`, `:102-149`), pick top 3 players and top settlement excluding developers, mail rewards 301/302, award trophies, push a `seasonlog` entry (`$slice: -10`).
2. `seasonReset` (`utils/seasonReset.js:14-250`):
   - STEP 1 `relocatePlayersHome` (`:27`).
   - STEP 2 `plantNewTrees` on every `valley*` grid (`:56-93`) via `utils/plantNewTreesLogic.js:33-185`: drop all `Wood` doobers, top up `Oak Tree`/`Pine Tree` to the target count (counted from the fixedCoord file if it exists, else `r1qty`/`r2qty` of the `variant === 1` random layout, `:69-109`), placed on empty `validon` tiles. Nothing else regrows.
   - STEP 2.5 snow/melt tile sweep over **all** grids incl. homesteads, batches of 5 with 100 ms pauses (`:113-194`).
   - STEP 3 Gold -> Free (`:197-220`). STEP 4 wipe `activeQuests`/`completedQuests` (`:223-243`).
   - Homesteads and towns keep their resources across seasons (comment `:48-51`).

### Dungeon registry

`Frontier.dungeons` Map keyed by dungeon gridId: `{gridId, templateUsed, createdAt, needsReset, lastReset, sourceValleyGrid, entranceGrids[]}` (`models/frontier.js:107-120`). `schedulers/dungeonScheduler.js:17-67` sets `needsReset=true` on every dungeon when the `dungeon` phase flips to `resetting` (open 2880 min = 48 h, resetting 0.5 min). `/enter-dungeon` (`worldRoutes.js:3454-3591`) finds the dungeon whose `entranceGrids` includes the source grid, lazily resets it if `needsReset` (`:3503-3535`), stores `player.sourceGridBeforeDungeon` (`:3569-3571`). `/exit-dungeon` (`:3260-3453`) returns the player to `sourceGridBeforeDungeon`, special-casing the FTUE cave -> homestead. `/update-dungeon-config` (`:3594`) edits template/entrances.

### What becomes per-player in the refactor

| Behaviour today (shared) | In per-player design |
|---|---|
| valley/town/dungeon `resources` mutated by anyone | per-player copy or delta |
| `NPCsInGrid` combat/graze state | per-player (or ephemeral client-side, persisted only hp/dead flags) |
| dungeon `needsReset` per frontier, lazy reset on entry | per-player `lastResetAt` vs a frontier-wide reset epoch; same lazy pattern works |
| `plantNewTrees` season sweep across all valley grids | per-player regrowth, best done lazily at load (see option (c) in section 4) rather than a sweep over every player's copies |
| snow/melt sweep | derive at read time from `frontier.seasons.seasonType`, do not store |
| `relocatePlayersHome` at season end | just reset `player.location` to the homestead |
| `playersInGrid` + socket rooms + grid controllers (`server.js:137-520`) | removed; homestead "who is home" can be a boolean on the owner |
| `outpostTradeStall` on a shared valley grid | decide: keep as the one shared valley artefact (then the valley's Outpost resource must exist in every player's copy at a fixed position, which fixed-coord layouts guarantee), or move stalls to a Settlement/Player-keyed collection |
| homestead grid, `ownerId`, settlement cell assignment, net worth | stays shared |

---

## 4. Player document and per-player grid storage options

### What is on `Player` (`models/player.js`)

Identity/auth (`:4-10`), `ftueFeedback` diagnostics (`:11-31`), combat base stats (`:37-45`), `location {x,y,g,s,f,gridCoord,gtype,region}` (`:46-55`; `g` is typed `ref:'Homestead'`, a model that does not exist), `inventory`/`backpack`/`skills`/`powers` arrays of `{type, quantity}` (`:56-83`), capacities, `accountStatus`, `role`, `tradeStall[6]`, `tradeStallRequests[3]` (`:98-127`), quests (`:129-152`), **home pointers** `frontierId`, `settlementId`, `gridId` (homestead), `homesteadGridCoord`, `sourceGridBeforeDungeon` (`:154-158`), `gridsVisited` Buffer(512) (`:159`), `settings` (`:161-178`), `relocations`, `netWorth`, `messages[]`, `relationships[]`, `trophies[]`, `kentOffers`, `train` (`:180-277`), `lastActive`, and two Maps `activeTransactions` / `lastTransactionIds` (`:289-304`) that can grow unbounded. Timestamps on (`:307`).

Estimated size: scalars ~1.5 KB; `gridsVisited` 512 B + BinData overhead; inventory+backpack 50-150 entries x ~40 B = 2-6 KB; skills+powers ~2-4 KB; relationships/trophies/messages ~1-5 KB; trade/train/quests ~1-2 KB. **Typical 8-15 KB, heavy accounts 25-35 KB**, well under the 16 MB cap but already a wide document that is re-saved on many routes.

### `gridsVisited`

512-byte bit buffer, bit index = `(sRow*8+sCol)*64 + (gRow*8+gCol)` from `gridCoord % 10000` (`utils/gridsVisitedUtils.js:16-41`). Set by `POST /mark-grid-visited` (`routes/playerRoutes.js:1900-1948`, needs `markModified('gridsVisited')` `:1934`). Consumed by the client to decide which settlement cells get a tile thumbnail (`game-client/src/App.js:860-897`) and by the frontier map (`PixiRendererFrontierSettlements.js:86-98`). Frontier tier/index are discarded, so the bitmap is per frontier only. In a per-player grid design "visited" and "materialised" become the same predicate; the same 0-4095 index is a natural key for per-player grid state.

### New per-player data the design adds

Per (player, gridCoord): resource state (diff or full), NPC state, regrowth timers / last-harvest times, `lastVisitedAt`, `lastResetAt` (dungeons), optionally a layout seed for random valleys, and a `templateVersion` so template edits can be detected. Per player: nothing else beyond what exists (`location`, `gridsVisited`).

### Storage options

**(a) `PlayerGridState` delta documents, keyed `{playerId, gridCoord}` (or `{playerId, bitIndex}`), base = template**

```
{ playerId, gridCoord, templateKey: 'valleyFixedCoord/1011100' | 'random:valley1:seed',
  templateVersion, visitedAt, lastLoadedAt, resetAt,
  removed: [ cellIndex (y*64+x) ... ],              // int32 each
  changed: [ [layoutKey,x,y,flags,...] ... ],       // same V2 encoding, overrides base at (x,y)
  npcs: { id: {hp, position, state, grazeEnd} },    // only non-template deviations
}
```
- Size: untouched visited grid ~150 B. Heavily harvested valley (500 removals, 30 planted/crafted cells, 10 NPCs) ~500 x 7 B + 30 x 35 B + 10 x 120 B ≈ **6 KB BSON**. Town with 50 player-built stations ≈ 3 KB.
- Bytes/player for N visited grids: ~N x 1-6 KB; **N=50 -> 50-300 KB, N=200 -> 0.2-1.2 MB**.
- Pros: tiny; template fixes propagate; reset = delete doc; dungeon reset = delete doc when `resetAt < frontier reset epoch`; one compound index `{playerId, gridCoord}` unique.
- Cons: random valley layouts must become reproducible (store the seed and make `generateGrid`/`generateResources`/`generateEnemies` take a seeded RNG; `worldUtils.js:626-631` and `templateUtils.js:74` use `Math.random`) or snapshot the generated base once per player (which is option (b) for those grids). Read path = decode template + apply diff; write path = server recomputes the merged resource set to validate the op. Current routes assume a Grid doc by `_id`; every `Grid.findById(gridId)` in `worldRoutes.js` (dozens of sites) needs a `(playerId, gridCoord)` resolver.
- Anti-cheat: strongest. The server owns the base; a client can only submit ops against known cells, and the diff size bounds abuse.

**(b) Full per-player `Grid` documents**

Copy the existing Grid shape, add `ownerId = playerId` and `gridCoord`, index `{ownerId, gridCoord}`. Homesteads already work this way.
- Size: 40-75 KB per grid (section 2). **N=50 -> 2-4 MB per player, N=200 -> 8-15 MB.** 1000 active players x 50 grids ≈ 2-4 GB on Atlas.
- Pros: almost no route changes (`gridId` stays the handle; `performGridCreation`/`performGridReset`/`plantNewTrees` work unchanged per copy); random layouts need no seeding; migration is "clone on first entry".
- Cons: storage and write amplification (every harvest rewrites a 60 KB array, today's behaviour but now x players); template fixes do not propagate; season sweeps (`seasonReset.js:56-93`, `:113-194`) become O(players x grids) and must be made lazy; orphan cleanup when players churn.
- Anti-cheat: same as today; server validates each op against the stored copy.

**(c) Delta + lazy regrowth (recommended hybrid)**

Option (a) with `removed` stored as `{cell, at}` pairs and a per-resource-type `regrowMs` in `tuning/resources.json`. On load the server drops any `removed` entry older than `regrowMs` (trees come back by themselves), and dungeons/valleys get a `resetEpoch` compare instead of a `needsReset` flag. Keep (b) for the player's own homestead (already the case) and optionally for towns if towns are meant to accumulate player-built structures.
- Size: as (a) plus 8 B per removal; **N=50 -> 100-400 KB per player**.
- Pros: no scheduled sweeps at all; `plantNewTrees`, `dungeonScheduler`, snow/melt all become read-time derivations; cheap to reset a single grid type globally by bumping an epoch on the Frontier.
- Cons: the most new code (merge, seeded generation, epoch logic); timestamps must be server-set to prevent clock games.
- Anti-cheat: as (a).

Query cost comparison: (a)/(c) read = 1 small doc + in-memory template (cache the 384 fixed layouts and 30 random layouts at boot; today they are `readJSON`ed on every create/reset). (b) read = 1 x 60 KB doc, same as today. Writes: (a)/(c) `$addToSet`/`$push` on small arrays and can be atomic; (b) full-array rewrite through `queue.js` as today.

---

## 5. Homestead snapshot in settlement view

What the client fetches at settlement zoom today (`game-client/src/App.js:828-897`):

1. `POST /api/get-settlement-bundle` (`routes/settlementRoutes.js:819-874`) returns
   - `settlement.grids`: the 8x8 cells `{gridCoord, gridType, available, gridId, ownerId}` (ownerId joined from `Grid.find({_id:{$in}}, {ownerId:1})`, `:834-845`);
   - `gridStates[gridId].playersInGrid` for every occupied cell (`:847-854`), i.e. who is physically on each homestead;
   - `players`: owners projected to `username role netWorth tradeStall` (`:857`).
2. `POST /api/grids-tiles` (`routes/playerRoutes.js:1951-1994`) returns the raw base64 `tiles` string for each **visited** gridCoord in the settlement; the client decodes it into a 64x64 thumbnail (`game-client/src/Render/PixiRenderer/PixiRendererSettlementGrids.js:52-103`).
3. The renderer draws, per homestead cell, the owner card (username, role with Mayor highlight, netWorth, trade stall item symbols) at `PixiRendererSettlementGrids.js:223-400`, and the tile thumbnail if visited (`:412-590`).

Related: `GET /get-settlement-grid/:id` (`settlementRoutes.js:124-167`, same ownerId join), `GET /frontier-bundle/:id` (`frontierRoutes.js:535-578`, includes a settlement's grids only if it has claimed homesteads or is the viewer's), `GET /homestead-gridcoord/:gridId` (`:581-630`, scans every settlement to find a coord).

**Minimum another player needs to render your homestead:** the settlement cell (`gridCoord`, `available=false`, `ownerId`), owner summary (`username`, `role`, `netWorth`, `tradeStall` symbols), and the 2.7 KB `tiles` string. Resources are not drawn at this zoom today. If the snapshot should show buildings, add the encoded `resources` array (20-60 KB) or, better, a server-rendered thumbnail/"structures list" cached on the homestead Grid and refreshed on save. `gridStates.playersInGrid` can be replaced by an `ownerIsHome` boolean. Because homesteads stay shared Grid docs with `ownerId`, this view needs no change beyond dropping `playersInGrid`.

---

## 6. `utils/memoryManagement.js`

Wired in `server.js:11-13` and `:131-133`. It (1) logs `process.memoryUsage()` at startup and every 5 min, calling `global.gc()` if `--expose-gc` is set (it is not: `package.json` start is `node --max-old-space-size=2048 server.js`), (2) every 30 s warns when `heapUsed/heapTotal > 0.8` (noisy: V8 grows heapTotal on demand, so this ratio is often high without being a problem), and (3) every 10 min deletes empty Sets from `io.connectedPlayersByGrid` (`memoryManagement.js:32-48`), a socket.io bookkeeping map populated in `server.js:141-283`.

Still needed? Only the logging has value, and only as a diagnostic. `cleanupMemoryMaps` exists solely for the socket presence maps and is dead once sockets go. The GC branch never runs. Recommend reducing it to a single periodic memory log line (or an env-gated one) or deleting it.

---

## 7. Dead code, stale files, migrations

Confirmed unreferenced (grep over all `.js` outside `node_modules`):

- `utils/TileEncoder.js.backup`: 3-bit V1 encoder with colliding codes for o/x/y/z. Delete.
- `models/resource.js`: no requires anywhere. Delete (and drop the `resources` collection if it still exists in Atlas).
- `models/combat.js`: no requires anywhere. Delete.
- `models/town.js`: **empty file**, but it is required by `routes/worldRoutes.js:10` and `routes/settlementRoutes.js:10` (`Town` evaluates to `{}` and is never used). Remove the requires and the file.
- `utils/IDs.js`: still required (`worldRoutes.js:13`) by debug routes `/get-frontier-id`, `/get-settlement-id`, `/get-homestead-id` (`:1051-1095`); hard-codes frontier name `'Valley View 1'` (`IDs.js:9`). Removable with those routes.
- `utils/fileUtils.js:27-60`: `loadFrontierLayout/loadSettlementLayout/loadHomesteadLayout` reference files that do not exist (`layouts/frontierLayout.json`, `homsesteadLayout.json`) and are overwritten by the second `module.exports` at `:62-65`. Only `readJSON`/`writeJSON` are live.
- `routes/frontierRoutes.js:389-405`: `/layouts/homestead|settlement|frontier` serve non-existent `../layouts/homesteadLayout.json` etc.
- Layout directories with no code references: `layouts/gridLayouts/valley1/`, `valley2/`, `valley3/` (superseded by `randomValleyGridLayouts.json`), `_oldGrids/`, `layouts/fromEditor/`, `miniTemplates/` (editor-only), `settlementLayouts/homesteadSet/{topRow,bottomRow,leftCol,rightCol}.json` (frontier layout never uses plain `homesteadSet`), `homestead/homestead{Spring,Summer,Fall,Winter}.json` (`getHomesteadLayoutFile` always returns `homestead.json`, `templateUtils.js:195-199`), `town/townN_bk.json`, `townN_current.json`, `townOLD.json`, `valleyFixedCoord/undefined.json`. Missing but referenced: `town/town_default.json` (`templateUtils.js:220`).
- `createGridLogic.js:9` and `resetGridLogic.js:9` import `getTemplate` and never use it.
- `models/grid.js:122` index on non-existent `gridId`; `grid.js:7` enum still accepts legacy `valley`.
- `migrations/`: directory exists and is **empty**. There are no migration scripts; the V1 -> V2 tile/resource migration was done out of band (the "dual-path"/"legacy format" branches in `GridResourceManager.js:55-68` and the `lastOptimized` field are its only remnants).
- Small live bugs noticed in passing: undeclared `updated` in `/relocate-homestead` (`worldRoutes.js:1197`, `:1207`); `grid.gridCoord` read from Grid docs (`:171`, `:3187`, `:3514`); `/create-dungeon` default `'global'` for required ObjectId refs (`:3042-3043`); `/grids` reports `createdAt` that Grid does not have (`:3144`).
- Git: the repo's `game-server/` tree is untracked at the top level (`?? vvgame/` in status) and commit history is placeholder messages, so "what changed when" cannot be reconstructed from git.
