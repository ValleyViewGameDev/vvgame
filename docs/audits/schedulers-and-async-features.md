# vvgame: Schedulers and Async-Multiplayer Systems Audit (read-only)

All paths are relative to `/Users/jonathanknight/GameDevelopment/vvgame/`. `S:` = `game-server/`, `C:` = `game-client/src/`. Line numbers are from the files as read on 2026-10-01.

---

## 0. How the scheduler loop works (shared by everything below)

`S:schedulers/mainScheduler.js`

- `initializeTimers()` (L26-44) loads every `Frontier` and calls `scheduleTimedFeature(frontier, key, globalTuning[key])` for nine keys: taxes, seasons, train, carnival, bank, elections, messages, networth, dungeon. Only runs when `NODE_ENV === 'production'` (`S:server.js` L106-110); dev servers run no schedulers at all (`S:server.js` L27).
- `scheduleTimedFeature` (L47-219) is a self-rescheduling `setTimeout` chain, one chain per (frontier, feature):
  - Every tick does `Frontier.findById(frontierId)` (L51). If `state.endTime` is missing it initializes `phase/startTime/endTime` and re-checks in 30 s (L61-79).
  - If `now < endTime` it reschedules in **15 s flat** (L212). The `delayMs` computed at L210 is dead; the comment says "use remaining time until end" but the code ignores it.
  - If `now >= endTime` it "claims" the transition with `Frontier.findOneAndUpdate({_id, [key.endTime]: state.endTime, [key+'Processing']: {$ne:true}}, {$set:{[key+'Processing']:true}})` (L85-103). Note: `taxesProcessing`, `trainProcessing`, etc. are **not in `FrontierSchema`** (`S:models/frontier.js` has no such paths) and the schema is strict (Mongoose 8, `S:package.json` L21). Mongoose strips unknown `$set` paths in strict mode, so the Processing flag is almost certainly a no-op. The real CAS is the `endTime` equality in the filter, which is sufficient for one process; it would also protect against two server instances.
  - Computes the next phase by cycling the keys of `tuning.phases` (L16-24), runs the feature scheduler with `nextPhase`, and writes `phase/startTime/endTime/Processing=false` plus whatever the feature returned (`extraPayload`) in one `$set` (L181-195). Reschedules in 15 s (L198). On error, clears the flag and retries in 60 s (L200-206, L217).
  - Seasons special case (L111-136): when the next phase is `offSeason`, it pre-writes `seasons.phase="offSeason"` and the **next** `seasonType` before running the (slow) season logic, so clients polling see the modal immediately.

Phase durations (`S:tuning/globalTuning.json` L113-179), in minutes:

| feature | phases | cycle |
|---|---|---|
| taxes | waiting 4319.25 / taxing 0.75 | 3 d |
| seasons | onSeason 129585 / offSeason 25 | ~90 d |
| elections | Administration 7200 / Campaigning 1440 / Voting 1439 / Counting 1 | 7 d |
| train | arriving 0.6 / loading 2880 / departing 0.6 | ~48 h |
| carnival | arriving 0.6 / here 2880 / departing 0.6 | ~48 h |
| bank | active 480 / refreshing 0.5 | ~8 h |
| messages | waiting 1439.5 / sending 0.5 | 24 h |
| networth | waiting 719.5 / calculating 0.5 | 12 h |
| dungeon | open 2880 / resetting 0.5 | ~48 h |

`S:utils/scheduleHelpers.js`: `resetAllTimers` (L10-53) rewrites every feature on every frontier to its `startPhase` + duration (exposed at `POST /api/reset-all-timers`, `S:routes/scheduleRoutes.js` L13-22). `activeTimers`/`clearAllTimers` (L5, L56-62) are dead: nothing ever registers a timer in that map, so it clears nothing. `getSeasonLevel` (L65-82) maps elapsed season time into sixths, capped at level 5; used by bank and carnival offer generation.

Dev routes in `S:routes/scheduleRoutes.js`: `GET/POST /tuning` read/write `globalTuning.json` on disk (L28-54; note the running process keeps the `require`d copy, so edits only take effect after restart, except for `initialize-dungeon-timer` which re-reads the file at L66). `POST /force-end-phase` sets `<event>.endTime` to now+60 s (L117-150).

---

## 1. Per-scheduler detail

### 1.1 taxScheduler (`S:schedulers/taxScheduler.js`, `S:controllers/taxController.js`)
- Cadence: runs on the `taxing` transition every ~3 days; `waiting` is a no-op (L14-17).
- Work: `levyTax(frontierId)` (controller L11-179):
  - Reads `Frontier.taxes.endTime` and refuses if it is in the future (L23-34).
  - `Settlement.find({frontierId, population:{$gt:0}})` (L37); skips `taxrate<=0` (L45).
  - For every `Player.find({settlementId})` (L54): takes `floor(Money * taxrate/100)` (Gold accounts pay half, L59), **`player.save()` per player** (L75).
  - Pays mayors `mayorcut`% (`globalTuning.mayorcut`=50, L71) via `Player.findById` + `save` (L88-108).
  - `$push` a `taxlog` entry per settlement with `$slice:-10` (L136-146).
  - Writes `taxes.phase="waiting"` + `endTime` (L160-168). This is immediately overwritten by mainScheduler's own `$set` (`phase:"taxing"`, `endTime: now+45 s`, mainScheduler L183-194), so the controller's phase write is dead; the 45 s "taxing" window then rolls to "waiting" by the normal path.
- Then `updateNetWorthForFrontier` (scheduler L33) — see 1.8.
- Emits: nothing (no socket, no mail).
- Grid dependency: none directly; indirectly via net worth (1.8).
- Also callable on demand: `POST /api/levy-tax` (`S:routes/frontierRoutes.js` L499-510), guarded only by the `endTime>now` check.

### 1.2 seasonScheduler (`S:schedulers/seasonScheduler.js`)
- Cadence: `offSeason` transition every ~90 days; `onSeason` transition 25 min later.
- On `offSeason` (L24-34): compute next `seasonType` from `S:tuning/seasons.json` order, then `seasonFinalizer(frontierId, currentType, currentNumber)` then `seasonReset(frontierId, nextType)`. Returns `seasons.seasonType` for mainScheduler to write.
- On `onSeason` (L37-39): `seasonNumber += 1`.
- Full breakdown of finalizer/reset in section 3.

### 1.3 electionScheduler (`S:schedulers/electionScheduler.js`)
- Cadence: only acts on `Counting` (L24); Administration/Campaigning/Voting transitions do nothing server-side.
- Reads `Settlement.find({frontierId, population:{$gt:0}})` (L13); per settlement reads `votes`, `campaignPromises`.
- Writes: `electionlog` `$push` with `$slice:-10` (L103-113); on a winner: `Player.updateMany({role:"Mayor", settlementId}→Citizen)` (L120-123), winner `role="Mayor"` (L126-130), `Settlement.roles` replaced + `votes=[]`, `campaignPromises=[]` (L141-147).
- If there is no winner (no candidates or no votes), **votes and promises are not cleared** (L27-34 `continue`), so they bleed into the next cycle.
- Resolves usernames with one `Player.findById` per candidate (L73) and for the winner (L92).
- Emits: nothing. Mayor learns via `GET /api/get-settlement/:id` on next Courthouse/GovPanel open.
- Grid dependency: none.

### 1.4 trainScheduler (`S:schedulers/trainScheduler.js`)
- Cadence: `arriving` and `departing` transitions, each ~48 h apart.
- Reads `Settlement.find({population:{$gt:0}, frontierId})` (L14), then re-reads each settlement (L24, L79, L115).
- `arriving`: marks `trainlog` "Current Train"→"Departed Train", "Next Train"→"Current Train" (L25-44), then `appendBasicTrainLog` (L76-109) pushes a new "Next Train" entry with `trainnumber = nextTrainNumber++`, trimmed to 8 (L104-106).
- `departing`: `finalizeBasicTrainLog` (L113-133) flips "Current Train" to "Departed Train" with `alloffersfilled=false, totalwinners=0`.
- **No offers, no rewards, no mail, no trophies are generated server-side.** The comment at L47 says "NewTrain handles offers/rewards". The settlement's `currentoffers/nextoffers` fields (`S:models/settlement.js` L49-68) and `POST /update-train-offer/:settlementId` (`S:routes/settlementRoutes.js` L569-623) belong to the old shared Train and are no longer written by any scheduler; only `C:UI/Modals/TownNews.js` L53-54 still reads `settlement.currentoffers`.
- Grid dependency: none. Does not look at `Grid.resources`.

### 1.5 carnivalScheduler (`S:schedulers/carnivalScheduler.js`)
- Cadence: `arriving` and `departing`, ~48 h apart.
- Reads `Settlement.find({population:{$gt:0}, frontierId})` (L22), `Frontier.seasons` for `seasonType` + `getSeasonLevel` (L59, L169), `Player.countDocuments({'location.s': settlement._id, firsttimeuser:{$ne:true}})` (L192-195), `S:tuning/seasons.json` `seasonResources`/`carnivalRewards`, `S:tuning/resources.json`.
- `arriving`: promotes `carnival.carnivallog` statuses (L37-57), generates `ceil(population/4)` offers sized to `baseHoursForCarnival`(default 6)×population×seasonLevel of craft time (L198-204, L245-314) with crop/dead-end composition rules (L238-239), and 3 random rewards + XP (L334-364). Writes `carnival.currentoffers = previous nextoffers || new`, `carnival.nextoffers = new` (L76-85), then `appendCarnivalLog` (L439-478; log trimmed to 8, rewards and a long `logic` string stored per entry L461-469).
- `departing`: if every `currentoffers[].filled` and at least one `claimedBy` (L112-119), sends mailbox message **102** with consolidated rewards to each fulfilling player (L136) and `awardTrophy('Carnivals Completed')` (L140); `finalizeCarnivalLog` (L483-505).
- Emits: mail only (no `io` passed to `sendMailboxMessage`, so no socket badge).
- Grid dependency: none; the Carnival station on the grid is just a door to the panel.
- Note: `population` as used for the `Settlement.find` filter is the stored `Settlement.population` counter (incremented by `/increment-settlement-population`, settlementRoutes L250-275), while the effort calculation uses a live `Player.countDocuments` on `location.s` (players *currently standing* in the settlement, not residents). These two notions disagree.

### 1.6 bankScheduler (`S:schedulers/bankScheduler.js`)
- Cadence: `active` transition every ~8 h; `refreshing` no-op (L17-19).
- Generates `globalTuning.bankOffers` (3) random doober-for-Money offers within ±1 of `seasonLevel` (L77-144) plus 3 permanent offers (Silver, Diamond Ring, Gold; L147-173). Returns `bank.offers` to be written on the **Frontier** (L58-60).
- Writes a `banklog` entry on every settlement with `population>0`, `$slice:-6` (L30-56). This is log-only; offers are frontier-wide.
- Emits: nothing.
- Grid dependency: none.

### 1.7 messageScheduler (`S:schedulers/messageScheduler.js`)
- Cadence: `sending` transition daily.
- Reads `Player.find({})` — **all players in the DB, not scoped to `frontierId`** (L15). With N frontiers the daily message goes out N times.
- Sends template id **5** ("Just another day in Elsinore", 50 Money + 5 Wood, `S:tuning/messages.json` L18-24) to every player via `sendMailboxMessage(..., io)` (L30), which `$push`es onto `Player.messages` (`S:utils/messageUtils.js` L34-37) and emits `mailbox-badge-update` to the player's socket room (L39-45).
- Then purges messages older than 14 days unless `neverPurge` (L34-43), `player.save()` per changed player.
- Bug: L23 warns if `io` is null but L26-27 dereference `io.sockets` / `io.engine` unconditionally; a null `io` throws before any message is sent.
- Grid dependency: none.

### 1.8 networthScheduler (`S:schedulers/networthScheduler.js`, `S:utils/networthCalc.js`)
- Cadence: `calculating` every 12 h. Also run by taxScheduler (every 3 d) and seasonFinalizer (every season): three entry points for the same full recompute.
- `updateNetWorthForFrontier` (networthCalc L6-43): `Player.find({frontierId})`, per player `calculateNetWorth` (L45-99): sum of `minprice*qty` over inventory+backpack, plus `minprice` of crafting/deco structures on **the player's homestead grid** (`Grid.findById(player.gridId).lean()`, L109; filter at L120-129), plus `minprice` of each skill. One `Player.findOneAndUpdate` per player (L25-29).
- Grid dependency: **yes, reads `Grid.resources` of the homestead grid only** (L102-149). Homesteads stay shared-world so this survives as-is.
- Emits: nothing. Leaderboard reads `Player.netWorth` on demand.

### 1.9 dungeonScheduler (`S:schedulers/dungeonScheduler.js`)
- Cadence: `resetting` every ~48 h; `open` no-op (L13-15).
- `resetting`: sets `frontier.dungeons.<gridId>.needsReset = true` for every entry in the registry (L36-49) and re-reads to verify (L55-60). **It does not reset any grid.** The reset is lazy: the next player entering that dungeon triggers `performGridReset(dungeonGridId,'dungeon',...)` in `S:routes/worldRoutes.js` L3503-3528, which regenerates tiles/resources/NPCs from the template (`S:utils/resetGridLogic.js` L51-368) and clears the flag.
- Client side (`C:App.js` L2552-2577): on local `dungeon.endTime` expiry it flips the phase locally and, if the player is in a dungeon, calls `handleDungeonAutoExit` (L2018-...) to teleport them out.
- Grid dependency: **yes, shared dungeon grids** registered in `Frontier.dungeons` (`S:models/frontier.js` L108-120, keyed by gridId with `templateUsed`, `entranceGrids`).

---

## 2. Per-feature verdicts

Legend: **KEEP** = already async per-player interaction against shared settlement/frontier/player docs; **ADAPT** = depends on shared Town/Valley/Dungeon grids or on other players being present; **CUT/DEFER** = depends on synchronous presence.

How the client learns phases (applies to every timed feature): `C:App.js` `fetchTimersData` (L2434-2487) does `GET /api/get-frontier/:frontierId` (returns the whole Frontier doc with `settlements` populated, `S:routes/frontierRoutes.js` L107-123), copies `phase/endTime` for seasons, elections, train, carnival, taxes, bank, dungeon into state and `localStorage.timers`. It is called on login (L2417-2428), **every 60 s** (L2426, with the comment "DO WE NEED THIS??"), and whenever `checkPhaseTransitions` (1 s tick, L2519-2598) sees a local `endTime` pass. Panels read `localStorage.timers` on their own 1 s tick. **No socket event carries phase changes.** Phase learning latency is bounded by the client-side countdown, so it is effectively instant; the 60 s poll is only a drift guard.

### Train — **KEEP** (per-player data; station already on homestead)
- Data: `Player.train` (`S:models/player.js` L245-270: currentTrainNumber, lastRewardDeliveryTrainNumber, current/next offers+rewards). `Settlement.trainlog`/`nextTrainNumber` (settlement.js L89-105) only carry the train number and phase bookkeeping. Timer on `Frontier.train`.
- Routes: `GET /api/get-settlement/:id` (read trainlog, `C:GameFeatures/Trading/NewTrain.js` L120), `POST /api/update-profile` for every mutation (L239, L279, L415, L469, L582, L647), `GET /api/settlement/:id/trainlog`.
- Offers are generated **on the client** from the player's skills/level/season (`C:GameFeatures/Trading/TrainOfferLogic.js`) and saved with `update-profile`; fulfilment is `spendIngredients` + `gainIngredients` + `update-profile` (L532-592). Rewards are "delivered" by the client appending a `messageId:101` entry to `Player.messages` via `update-profile` (L217-245).
- Phase: localStorage 1 s tick (L58-80); `isLoadingPhaseExpired` (L498-516) is the only departure gate (client-side authority).
- Verdict: already single-player. It needs no other player and no shared grid. The only "shared" part is the global timer (Frontier.train) and the settlement train number. Risks: everything trusts the client (`update-profile` writes arbitrary `train` and `messages`), so rewards are forgeable; `handleGenerateOffers` (L610-674) regenerates offers at will (debug, but reachable).

### Carnival — **KEEP, light ADAPT**
- Data: `Settlement.carnival.{currentoffers,nextoffers,carnivallog,nextCarnivalNumber}` (settlement.js L106-144). Timer on `Frontier.carnival`.
- Routes: `GET /api/get-settlement/:id` (`C:GameFeatures/Carnival/Carnival.js` L101, on mount L62 and on every phase change L70), `POST /api/update-carnival-offer/:settlementId` (claim L294, fulfil L347; server rejects stolen claims with 409, settlementRoutes L656-665), `GET /api/player/:id` per claimant for usernames (L140), `GET /api/settlement/:id/carnivallog` (L182).
- Phase: localStorage 1 s tick (L75-97). No polling of offers; a claim by another player is only seen on reopen/phase change or a 409.
- Shared-grid dependency: none. Other-player dependency: cooperative by design (all offers must be filled by *anyone* in the settlement; rewards go to all fulfillers). That is asynchronous, so it survives.
- ADAPT points: (a) offer count/effort scale with `Player.countDocuments({'location.s'})` (carnivalScheduler L192) — with per-player towns, "players currently in the settlement" will be a strange number; switch to residents (`settlementId`) or a fixed/tuned count. (b) The Carnival station only exists in town layouts (section 4), so reachability must be decided.

### Leaderboard / net worth — **KEEP**
- Data: `Player.netWorth` (player.js L183), recomputed server-side (1.8).
- Routes: `GET /api/players-by-frontier-with-dev-status/:frontierId` (`S:routes/playerRoutes.js` L1608-1627; returns every player in the frontier, 3 fields) then **10× `GET /api/player/:id` full documents including inventory and backpack** (`C:GameFeatures/Leaderboard/Leaderboard.js` L29-79). On demand only.
- `C:GameFeatures/Seasons/SeasonPanel.js` repeats the same frontier-wide fetch plus `GET /api/settlements` (all settlements, with a Grid region lookup, settlementRoutes L17-61) to compute top-settlement wealth client-side (L75-133).
- Net worth reads the homestead grid only. Homesteads remain shared, so nothing changes. Suggest a server-side `/leaderboard` endpoint returning the top-N projection rather than full player docs.

### Elections / Mayor / Governor — **KEEP** (cooperative async), with caveats
- Data: `Settlement.roles/campaignPromises/votes/electionlog` (settlement.js L30-48, L145-157), `Player.role` (player.js L93). `Frontier.governor` (frontier.js L17) is **never set or read** except `governor:null` at creation (frontierRoutes L189): dead.
- Routes: `GET /api/get-settlement/:id` (Courthouse L222, GovPanel L45, GovUtils L19), `POST /api/save-campaign-promise` (settlementRoutes L476-507), `POST /api/cast-vote` (L509-552, one vote per voter), `POST /api/update-settlement` (mayor sets `taxrate`/`displayName`, L214-248; **unauthenticated: any client can `$set` any settlement field**), `GET /api/settlement/:id/roles`, `GET /api/settlement/:id/electionlog`.
- Phase: localStorage 1 s tick (`C:GameFeatures/Government/Courthouse.js` L147-173); refetch on phase change (L176-183).
- Dead routes: `/election-phase/:settlementId` (L351-370) and `/election-status/:settlementId` (L392-474) read/write `electionPhase`, `campaignStart`, `votingStart`, `votingEnd`, `electionCandidates`, and `votes:{}`; none exist on the schema. Legacy from before the frontier-level timer.
- Verdict: fully asynchronous already. It only requires that *someone* run and *someone* vote; with few players per settlement, elections mostly produce "No candidates". Consider whether a settlement with 1-3 players should still have elections.

### Taxes — **KEEP**
- Data: `Settlement.taxrate/taxlog`, `Player.inventory[Money]`, `Frontier.taxes`. Panels: GovPanel (`GET /api/settlement/:id/taxlog`, GovPanel L76), Courthouse slider (`update-settlement`).
- No grid dependency, no presence dependency. Works unchanged. Mayor's cut requires a mayor, which requires elections.

### Bank — **KEEP**
- Data: `Frontier.bank.offers` (frontier.js L26-39), `Settlement.banklog`.
- Routes: `GET /api/get-frontier/:id` (`C:GameFeatures/Trading/Bank.js` L52, on mount and on phase change L70-73); trade is client-side `spendIngredients`/`gainIngredients` (L95-125) with no bank-specific server validation.
- Panel gate: must be in home settlement (L190). With per-player towns this still holds (your town copy is in your settlement).

### Seasons — **ADAPT** (see section 3)
- Data: `Frontier.seasons/seasonlog`. Client: `C:GameFeatures/Seasons/SeasonPanel.js` (localStorage timer L50-61, `GET /api/tuning/seasons` L39, frontier-wide player list L75, `GET /api/settlements` L78, `GET /api/frontier/:id/seasonlog` L206), `OffSeasonModal`, and `C:App.js` L2604-2614 forces a full reload when offSeason ends, L354-379 confirms offSeason with `GET /api/get-global-season-phase` on boot (that route uses `Frontier.findOne({})`, i.e. **the first frontier in the DB, not the player's**, frontierRoutes L476-491).

### Trade Stall (personal) — **KEEP**
- Data: `Player.tradeStall` (6 slots, player.js L98) and `Player.tradeStallRequests` (3 slots, L114).
- Routes (`S:routes/tradingRoutes.js`): `GET /player-trade-stall` (L355-408), `POST /update-player-trade-stall` (L299-353, **whole-array overwrite from client**), `POST /trade-stall/sell-to-game` (L212-292) and `/trade-stall/collect-payment` (L134-209) with `TransactionManager` idempotency (L12-71), `GET/POST ...trade-stall-requests` (L853-953), `POST /trade-stall/fulfill-request` (L956-1072). `POST /sell-items` (L410-442) wipes the stall to `[]`: legacy/dead.
- Station is placed on the homestead (`layoutkey "TS"`, homestead layouts) — per-player already.

### Global Market — **KEEP** (data) / ADAPT (query shape)
- Not a document; it is a view over every player in `location.s` (`GET /api/players-in-settlement`, settlementRoutes L197-212) followed by **2 requests per player** (`player-trade-stall`, `player-trade-stall-requests`, `C:GameFeatures/Trading/GlobalMarketModal.js` L51-92). O(N) round trips per open.
- Buying from another player has **no server route**: `C:GameFeatures/Trading/TradeStall.js` `handleGlobalMarketBuy` (L~300-360) debits the buyer via `gainIngredients`/`update-inventory` and then overwrites the seller's stall with `POST /update-player-trade-stall` (L349) carrying `boughtBy/boughtFor`. Two writers can race on the same slot; there is no atomic check-and-set. `fulfill-request` (L956) is atomic by contrast.
- ADAPT: the player set is "players currently in this settlement" (`location.s`). With per-player towns that still works since `location.s` is set on travel, but you probably want residents (`settlementId`) instead, and a single `GET /market/:settlementId` route that returns all stalls in one query.

### Outpost trade stall — **ADAPT or CUT**
- Data: `Grid.outpostTradeStall` (4 slots) on the **valley grid that holds the Outpost resource** (`S:models/grid.js` L84; routes tradingRoutes L449-846, all `TransactionManager`-protected). Client loads it through `GET /api/load-grid/:gridId` (`C:GameFeatures/Trading/Outpost.js` L75).
- Valley grids become per-player copies, so a stall stored on a grid document is no longer shared. Either (a) move the stall to a settlement- or frontier-level document keyed by the outpost's `gridCoord` (the routes already take `gridId`; swap for `outpostKey`), or (b) cut it and let Global Market cover remote selling.

### Mailbox — **KEEP** (needs one fix)
- Data: `Player.messages` (player.js L185). Templates in `S:tuning/messages.json`.
- Server writers: `sendMailboxMessage` (`S:utils/messageUtils.js` L18-50; used by carnival 102, seasonFinalizer 301/302, messageScheduler 5, store purchases 201), `POST /send-mailbox-message[-all]` (playerRoutes L1259, L1282). Client: `GET /api/player/:id` (`C:GameFeatures/Mailbox/Mailbox.js` L50), `POST /mailbox/collect-rewards` (L83, protected), `POST /update-player-messages` (L59, L171, whole-array overwrite).
- The `mailbox-badge-update` socket emit (messageUtils L41) has **no listener in the client** (grep of `C:App.js` finds none). Mail arrival is discovered only by reopening the mailbox. Template 303 (top player) is defined (messages.json L66-72) but never sent (seasonFinalizer sends 301 to all top 3).
- Race: NewTrain.js delivers train rewards by reading `currentPlayer.messages`, appending, and overwriting via `update-profile` (L231-245). A server-side `$push` (carnival, daily message) landing between the read and the write is lost.

### Dungeon schedule — **ADAPT**
- Shared dungeon grids and the `needsReset` registry assume one physical grid per dungeon. With per-player dungeon copies, the frontier timer can stay (it is just a clock), but "reset" becomes "mark the player's copy stale; regenerate on next entry" per player, i.e. store `lastResetSeen` on the player (or on the per-player grid copy) and compare against `Frontier.dungeon.startTime`. The lazy-reset pattern in worldRoutes L3503-3528 already fits this; only the flag location changes. The client auto-exit on reset (App.js L2566-2577) can be dropped entirely once copies are per-player: no one else is inside your copy.

---

## 3. Season end, step by step

Trigger: mainScheduler L111-136 writes `seasons.phase="offSeason"`, `seasons.seasonType=<next>`, `endTime=now+25 min`, then calls `seasonScheduler(frontierId,"offSeason")` (L147), which runs:

### 3a. `seasonFinalizer` (`S:utils/seasonFinalizer.js`)
1. `updateNetWorthForFrontier` (L17) — full recompute, reads every homestead grid.
2. `Player.find({frontierId}).sort({netWorth:-1})`, drop developers, top 3 (L22-25).
3. For each settlement, `Player.find({settlementId})` and sum non-dev netWorth; highest wins (L29-43).
4. Mail 301 + trophies `Season Champion` (1st) / `Season Winner` (top 3) (L45-72).
5. Mail 302 to every non-dev player with `settlementId` = winning settlement (L74-90).
6. `$push` `Frontier.seasonlog` entry (`$slice:-10`) with winners, settlement, `gridsreset:0`, `playersrelocated:0` placeholders (L97-124).

### 3b. `seasonReset(frontierId, nextSeasonType)` (`S:utils/seasonReset.js`)
1. **STEP 1 relocatePlayersHome** (L27 → `S:utils/relocatePlayersHome.js` L8-192): loads all players and settlements of the frontier; `Grid.find({frontierId, playersInGrid non-empty})` (L43-52); in batches of 10 loads `playersInGrid` + `resources` (L67-70); for each PC not on their home grid, moves the PC entry into the home grid's `playersInGrid` at Signpost Town +1, restores HP, removes it from the current grid, writes `player.location` (L124-184). Players already home get HP + position reset (L99-122). Then patches `seasonlog[...].playersrelocated` (L31-45).
2. **STEP 2 plantNewTrees** on every `gridType:/^valley/` grid (L56-91 → `S:utils/plantNewTreesLogic.js`): removes Wood doobers and tops up Oak/Pine to layout targets. Not a full regen. Writes `seasonlog[...].gridsreset = #valley grids` (L97-110).
3. **STEP 2.5 snow/melt** (L113-193): `Grid.find({frontierId}, {tiles,gridType})` — **every grid in the frontier: homesteads, towns, valleys, and dungeons** (no `gridType` exclusion; contrast `S:utils/resetGridLogic.js` L238 which excludes dungeons from snow). Winter: `g→o`; Spring: `o→g`; other seasons no-op. Batches of 5 with 100 ms sleeps, `grid.save()` per modified grid.
4. **STEP 3** Gold → Free for all players (L198-220, `bulkWrite`). Payment-tier reset every season.
5. **STEP 4** wipe `activeQuests` and `completedQuests` for all players (L228-243).

Explicitly **not** done any more (comments L47-51): no town or homestead resource reset. `seasonTownCrops`/`seasonHomesteadCrops` in `S:tuning/seasons.json` are applied only inside `performGridReset` (resetGridLogic L184-201), which the season flow never calls; they are effectively dead for the automatic season cycle.

### 3c. 25 minutes later
mainScheduler transitions to `onSeason`; seasonScheduler bumps `seasonNumber` (L37-39). Clients: `C:App.js` L2604-2614 sees `offSeason→onSeason` and `window.location.reload()`.

### 3d. Conflicts with per-player grid copies
- **STEP 1** is built on shared `Grid.playersInGrid` maps. With a per-player Town/Valley/Dungeon copy, there is exactly one PC per copy; "relocate everyone home" collapses to "set `player.location` to homestead" — one `Player.updateMany` instead of a grid scan. Keep the HP restore; drop the grid writes.
- **STEP 2** (tree replanting) must run against each player's valley copies, or (better) be replaced by regenerating the copy lazily when the player next enters a valley grid whose `copyCreatedSeason < current season` (same lazy pattern the dungeon reset already uses). Running `plantNewTrees` over players × valley grids at season end would be O(P×V) grid writes in one batch.
- **STEP 2.5** snow/melt: homesteads stay shared, so that part survives as-is. For per-player Town/Valley copies, apply tile swaps lazily on next load, or simply regenerate the copy. Add the missing dungeon exclusion either way.
- **STEP 3/4** (Gold reset, quest wipe) are player-level and unaffected.
- `seasonlog.gridsreset` becomes meaningless once grids are per-player; redefine or drop.
- `seasonFinalizer` is grid-free except via net worth (homestead only): unaffected.
- The `get-global-season-phase` route (frontierRoutes L476) reading `Frontier.findOne({})` will give the wrong answer with more than one frontier; use the player's `frontierId`.

---

## 4. Where the Train and Carnival physically live, and how to keep them reachable

- Both are `category:"station"`, `action:"openUI"` resources in `S:tuning/resources.json`: **Train** `layoutkey "TR"`, level 9 (L7819-7847); **Carnival** `layoutkey "Cv"`, level 12 (L7848-7876). Both are `requires:"devonly"`, so players cannot build them; they come from layouts.
- Layout placement (grep of `S:layouts/gridLayouts/`):
  - `"TR"` appears once in **every town layout** (`town/townN.json` resource at x=28,y=25) **and once in every seasonal homestead layout** (`homestead/homesteadSpring.json`, `Summer`, `Fall`, `Winter` at x=1,y=32; not in the unseasoned `homestead.json`). So **the Train is already on the player's own homestead**.
  - `"Cv"` appears once in every town layout (`townN.json` at x=3,y=28) and nowhere else. **The Carnival lives only on the shared Town grid.**
  - Neither appears in valley layouts (`randomValleyGridLayouts.json`, `valleyFixedCoord/*`).
- Reachability: clicking the station dispatches `openPanel('NewTrainPanel')` / `openPanel('CarnivalPanel')` (`C:App.js` L3216-3220). The panels do not read the grid at all; they read `Settlement`/`Frontier`/`Player` documents and gate on `location.s === settlementId` (NewTrain L792, Carnival L524). Travel to Town is `Signpost Town` → first `gridType:"town"` cell of the settlement (`C:GameFeatures/Transit/Transit.js` L209-295); the train is not a transport mechanism.
- Proposal: because the panels are already decoupled from grid state, the shared Train/Carnival survive automatically as long as the *station resource* exists on whatever grid the player can reach. Concretely:
  1. Train: nothing to do; the homestead station is per-player and the panel talks to `Player.train` + `Settlement.trainlog`. Consider removing the town copy to avoid two doors.
  2. Carnival: either (a) add `"Cv"` to the homestead layouts next to `"TR"` (simplest; one 4×4 footprint), or (b) keep it on the player's **own Town copy**: since the per-player town is generated from the same `town*.json`, the `Cv` resource is present in every copy and the panel still reads the shared `Settlement.carnival`. (b) needs no content change at all. Either way the cooperative data stays in `Settlement.carnival` and the timer in `Frontier.carnival`.
  3. Same reasoning covers Bank (`"Bk"`? layoutkey not checked; town-only) and Courthouse: the station is a door, the data is in Frontier/Settlement. A per-player Town copy keeps every door.
  4. If you would rather not depend on grid doors at all, a "Settlement" tab/menu that opens NewTrainPanel/CarnivalPanel/BankPanel/Courthouse directly (gated on `location.s === settlementId` as now) removes the grid dependency entirely and is a ~10-line change in `C:App.js`'s panel switch.

---

## 5. Baseline (0 players) vs per-player activity

### Server, scheduler-driven, per frontier, at idle
- Polling: 9 feature chains × `Frontier.findById` every 15 s = **36 reads/min = 2,160 reads/h** (mainScheduler L51, L212). Each read returns the whole Frontier doc (settlements array, bank offers, seasonlog, dungeons map). This is the dominant idle load and is pure waste: the chain already knows `endTime` and could sleep until then (the `delayMs` at L210 was meant for this).
- Phase work per hour (averaged): bank 1/8 h; networth 1/12 h; messages 1/24 h; taxes 1/72 h; train 2/48 h; carnival 2/48 h; dungeon 2/48 h; elections 4/168 h; seasons 2/2160 h. Roughly **0.5 transitions/hour**. Cost of each scales with player count (networth: 1 Grid read + 1 Player write per player; messages: 1 write + possibly 1 save per player across the whole DB; carnival/train/bank/tax: 1-4 settlement reads/writes per populated settlement).
- Other server timers: `cleanupMemoryMaps` every 10 min (`S:server.js` L131-133); `memoryManagement.setupMemoryMonitoring` 5 min and `setupMemoryWarnings` 30 s if wired (`S:utils/memoryManagement.js` L16, L54).

### Client, per connected player
- `GET /api/get-frontier/:frontierId` every **60 s** (`C:App.js` L2426) = 60 req/h, plus one per phase expiry. Full Frontier doc with `.populate('settlements')` each time.
- `checkServer` every 2 s (L349) does **no network call** (L329 commented out); dead interval that only ever closes a modal.
- Local 1 s ticks with no network: countdowns (L2512), phase transitions (L2596), NPC loop (L2259), PC death/lava (L2310); 10 s heal (L2367); 60 s staleness (L3416).
- `C:UI/Modals/TownNews.js` L83: while that modal is open, **every 1 s**: `get-settlement` + (`get-settlement` + `GET /api/player/:mayorId` inside `getMayorUsername`) + `get-frontier` = **4 requests/s**.
- Panels while open (1 s local ticks reading `localStorage.timers`, no network): NewTrain L78, Carnival L95, Bank L79, Courthouse L171, SeasonPanel L59, OffSeasonModal L47/L53. Bank and Courthouse refetch on phase change only.
- On-demand bursts: Leaderboard = 1 + 10 requests; SeasonPanel = 3 requests; GlobalMarket = 2 + 2N requests (N players in settlement); Carnival = 1 + #claimants.

Net: with zero players the server still performs ~2,160 Frontier reads per frontier per hour from the scheduler loop and nothing else of note. Every connected client adds 60 Frontier reads per hour at rest.

---

## 6. Dead code, duplication, and risks

### Dead / legacy
- `S:utils/scheduleHelpers.js` L5, L16-17, L56-62: `activeTimers`/`clearAllTimers` never populated.
- `S:schedulers/mainScheduler.js` L210 `delayMs` computed and ignored.
- `S:controllers/taxController.js` L152-168: phase/endTime write overwritten by mainScheduler.
- `S:routes/settlementRoutes.js` L351-370 `/election-phase`, L392-474 `/election-status`: reference non-schema fields (`electionPhase`, `campaignStart`, `votingStart`, `votingEnd`, `electionCandidates`, `votes:{}`); L372-389 `/reset-election-votes` unused by client.
- `S:routes/settlementRoutes.js` L559-567 `/get-train` calls undefined `getTrainDataFromDB` (would 500); L569-623 `/update-train-offer` and `Settlement.currentoffers/nextoffers` (settlement.js L49-68) belong to the removed shared Train; only TownNews.js L53-54 still reads them (always empty now).
- `S:routes/tradingRoutes.js` L410-442 `/sell-items` (wipes stall) unused by client.
- `Frontier.governor` (frontier.js L17) never used.
- `S:tuning/messages.json` id 303 never sent. `globalTuning.trainRewards` (L180-185) and `baseHoursForTrain` (L66) are consumed only by the client-side TrainOfferLogic, not by any scheduler.
- `S:schedulers/networthScheduler.js` L1, `electionScheduler.js` L5, `messageScheduler.js` L1: unused `API_BASE` constants. `electionScheduler.js` L4, `messageScheduler.js` L2-4: unused imports.
- `S:utils/emailUtils.js` is ESM (`import`/`export`) in a CommonJS server; only usable if something imports it dynamically. Sends a Gmail alert on new accounts; unrelated to schedulers.
- Client: `C:App.js` L349 `checkServer` interval with the request commented out; `C:GameFeatures/Trading/NewTrain.js` L297-360 `checkAndDeliverPreviousTrainRewards` duplicates L202-295.
- `C:App.js` L2426 60 s `fetchTimersData` poll flagged by the owner as questionable; the 1 s local transition check already refetches on expiry, so the poll only guards against drift and server-side `force-end-phase`.

### Duplicated logic
- Net worth recompute runs from three places (tax L33, networth L11, seasonFinalizer L17).
- Train/carnival log promotion/finalization is near-identical code (trainScheduler L24-44/L113-133 vs carnivalScheduler L37-57/L483-505).
- Bank and TrainOfferLogic both filter `category==='doober' && output!=='noBank'` with their own copies.
- Top-3 / top-settlement computation exists server-side (seasonFinalizer L22-43) and is re-implemented client-side in SeasonPanel L86-131 and Leaderboard L33-36 over the full player list.
- Settlement population: `Settlement.population` counter vs `calculateSettlementPopulation(settlement)` on the client (GovPanel L51, Courthouse L242, SeasonPanel L113) vs `Player.countDocuments({'location.s'})` in carnivalScheduler L192. Three definitions.
- `getMayorUsername` (GovUtils L11-36) fetches the whole settlement and then the whole player document just for a username; called by TownNews every second.

### Risks
- **Unbounded arrays**: `Player.messages` grows by one daily message per player (messageScheduler L30) plus mail; purge after 14 d exists (L34-43) but skips `neverPurge` (welcome 1, store 201, season 301/302/303 are all `neverPurge:true`), so those accumulate forever. `Player.trophies` only grows. Settlement logs are all `$slice`d (taxlog -10, banklog -6, trainlog 8, carnivallog 8, electionlog -10) and `Frontier.seasonlog` -10: bounded. `Player.lastTransactionIds`/`activeTransactions` maps (tradingRoutes L18, L38, L53) grow by one key per unique `transactionKey-slot` and are never pruned.
- **Client-trusted writes**: `POST /update-profile` accepts arbitrary `train` and `messages` (NewTrain L239-245, L415, L582), `POST /update-player-messages` and `/update-player-trade-stall` overwrite whole arrays, `/update-settlement` `$set`s any field without checking the caller is mayor (settlementRoutes L231-235). Train rewards and mail are forgeable; a stale client overwrite drops server-pushed mail.
- **Lost-update races**: Train reward delivery read-modify-write on `messages` (NewTrain L231-245) vs server `$push`; Global Market buy writes the seller's entire stall array (TradeStall L349) with no CAS; TownNews re-reads at 1 Hz but Carnival claims rely on a 409 only.
- **messageScheduler** L26-27 null-`io` crash; `Player.find({})` is DB-wide not frontier-wide (L15), so the daily message is sent once per frontier.
- **seasonReset STEP 2.5** snows dungeon grids (L119-122, no exclusion).
- **Scheduler lock** `*Processing` fields are not in the schema and are stripped under Mongoose strict mode (mainScheduler L86-97, L187); only the `endTime` CAS protects transitions. Works, but the flag is illusory.
- **15 s polling of full Frontier docs per feature** (mainScheduler L212) is the largest idle cost; replace with `setTimeout(endTime - now)` plus a periodic resync.
- `get-global-season-phase` (frontierRoutes L476-491) uses `Frontier.findOne({})`: wrong with >1 frontier.
- `generateCarnivalOffersAndRewards` can select an item whose `estimatedQty` is derived from `remainingEffort` going negative after an over-sized earlier pick (L287-302 relies on `Math.max(1, ...)`), yielding 1-qty offers paid at `maxprice` (L304); minor economy leak.
- `electionScheduler` leaves stale `votes`/`campaignPromises` when there is no winner (L27-34).
- `taxController` saves each player sequentially (L75) with no transaction; a crash mid-loop leaves partial taxation and no log.
- `relocatePlayersHome` mutates `grid.playersInGrid` while another server path may be writing the same map for a live player; the 25-minute offSeason window is the only guard (clients are shown the modal but not disconnected).

---

## Summary table

| Feature | Data home | Shared-grid dep | Needs others present | Verdict |
|---|---|---|---|---|
| Train | Player.train + Settlement.trainlog + Frontier.train | none (station on homestead) | no | KEEP |
| Carnival | Settlement.carnival + Frontier.carnival | station on Town grid only | cooperative, async | KEEP (fix population source; keep door via town copy or homestead) |
| Leaderboard / networth | Player.netWorth (homestead grid read) | homestead only (stays shared) | no | KEEP (add server top-N route) |
| Elections | Settlement.roles/votes/promises, Player.role | none | cooperative, async | KEEP (clear stale votes; dead routes) |
| Taxes | Settlement.taxrate/taxlog, Player.inventory | none | no | KEEP |
| Bank | Frontier.bank.offers, Settlement.banklog | none | no | KEEP |
| Seasons | Frontier.seasons/seasonlog + all grids | yes (relocate, trees, snow) | no | ADAPT (section 3d) |
| Trade Stall | Player.tradeStall/Requests | none | no | KEEP |
| Global Market | view over players in location.s | none | async | KEEP; ADAPT query to residents + single route; add atomic buy |
| Outpost | Grid.outpostTradeStall (valley grid) | yes | async | ADAPT (move off grid) or CUT |
| Mailbox | Player.messages | none | no | KEEP (client never listens to badge socket; overwrite race) |
| Dungeon schedule | Frontier.dungeon + Frontier.dungeons registry + dungeon grids | yes | no | ADAPT (per-player lazy reset; drop auto-exit) |
