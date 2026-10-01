# vvgame game-server: Route Layer Audit (read-only)

Scope: every `router.*` in `game-server/routes/*.js` plus inline `app.*` routes in `server.js`, and the utils/controllers the routes call into. All routers are mounted at `/api` (`server.js:514-532`); `analyticsRoutes` at `/api/analytics` (`server.js:534`). Caller column is from a grep of `game-client/src` (C) and `game-editor/src` (E); `--` means no caller found in either.

Abbreviations: **P**=Player, **G**=Grid, **S**=Settlement, **F**=Frontier, **Ch**=ChatMessage, **FS**=tuning/layout JSON on disk. **tx** = idempotent transaction guard (`lastTransactionIds` / `activeTransactions` on Player). "trusts" = accepts the client's numbers/objects without checking game state.

---

## 1. Complete route inventory

### auth.js
| Method | Path | file:line | Purpose | R | W | Socket | Validation | Callers |
|---|---|---|---|---|---|---|---|---|
| POST | /register-new-player | auth.js:22 | Create Player from `tuning/starterAccount.json`; spawns in hard-coded FTUE cave grid `695bd5b76545a9be8a36ee22` (auth.js:72) | P | P (save x2) | none | username unique; all stats from server template (good) | C |
| POST | /login | auth.js:160 | bcrypt check, set lastActive, return subset | P | P.lastActive | none | password verified | C |

### chatRoutes.js
| POST/GET | Path | file:line | Purpose | R | W | Socket | Validation | Callers |
|---|---|---|---|---|---|---|---|---|
| GET | /chat/:scope/:scopeId | chatRoutes.js:5 | last-24h messages for grid/settlement/frontier | Ch | - | none | scope enum | C (frontier only) |

### paymentRoutes.js
| Method | Path | file:line | Purpose | R | W | Socket | Validation | Callers |
|---|---|---|---|---|---|---|---|---|
| POST | /create-checkout-session | paymentRoutes.js:13 | Stripe Checkout session for offerId | FS store.json | - | none | offer exists | C |
| POST | /purchase-store-offer | paymentRoutes.js:45 | Grant offer: offerId "1" sets `accountStatus=Gold`; else mailbox msg 201 with offer.rewards | P, FS | P | none (io not passed to sendMailboxMessage) | offer exists, shelflifeDays. **No Stripe/payment verification at all** | C |
| GET | /store-offers | paymentRoutes.js:96 | store.json | FS | - | none | - | C |

### analyticsRoutes.js (mounted at /api/analytics)
| Method | Path | file:line | Purpose | R | W | Socket | Validation | Callers |
|---|---|---|---|---|---|---|---|---|
| GET | /daily-active-users | analyticsRoutes.js:11 | DAU aggregate excluding devs | P, FS | - | none | - | E |
| GET | /ftue-analytics | analyticsRoutes.js:102 | FTUE funnel; returns rawData incl. usernames | P, FS | - | none | - | E |

### scheduleRoutes.js
| Method | Path | file:line | Purpose | R | W | Socket | Validation | Callers |
|---|---|---|---|---|---|---|---|---|
| POST | /reset-all-timers | scheduleRoutes.js:13 | `resetAllTimers()` on all event timers | - | F | none | none, no auth | -- |
| GET | /tuning | scheduleRoutes.js:28 | read globalTuning.json | FS | - | none | - | E (Events.jsx:59) |
| POST | /tuning | scheduleRoutes.js:44 | **Overwrite globalTuning.json with req.body** | - | FS | none | none, no auth | -- |
| POST | /initialize-dungeon-timer | scheduleRoutes.js:62 | set F.dungeon timer (one or all) | FS | F | none | - | -- |
| POST | /force-end-phase | scheduleRoutes.js:117 | set `F.<event>.endTime = now+1min` | F | F | none | event key exists on doc | E |

### gridRoutes.js
| Method | Path | file:line | Purpose | R | W | Socket | Validation | Callers |
|---|---|---|---|---|---|---|---|---|
| POST | /save-grid-state-pcs | gridRoutes.js:10 | **Full replace** `G.playersInGrid = pcs`, doc save | G | G | none | trusts | -- |
| POST | /save-single-pc | gridRoutes.js:40 | `$set playersInGrid.<playerId> = pc` (atomic) | - | G | none | date format only; trusts pc stats | C |
| POST | /remove-single-pc | gridRoutes.js:99 | `$unset playersInGrid.<playerId>` | - | G | none | none (can remove any player) | C |
| POST | /save-grid-state-npcs | gridRoutes.js:137 | **Full replace** `G.NPCsInGrid = npcs`, doc save | G | G | none | trusts | C (GridStateNPCs.js) |
| GET | /load-grid-state/:gridId | gridRoutes.js:164 | NPCsInGrid + playersInGrid maps | G | - | none | - | C |
| POST | /get-multiple-grid-states | gridRoutes.js:191 | same for N grids | G | - | none | - | -- |
| POST | /save-single-npc | gridRoutes.js:229 | `$set NPCsInGrid.<npcId> = npc` (atomic) | - | G | none | trusts whole NPC object (type/hp/state/pos) | C |
| POST | /remove-single-npc | gridRoutes.js:263 | load doc, Map.delete, `save({validateBeforeSave:false})` | G | G | none | trusts | C |
| POST | /batch-update-npc-positions | gridRoutes.js:295 | `$set NPCsInGrid.<id>.position` per entry | - | G | none | numeric x/y only | C |
| POST | /batch-update-pc-positions | gridRoutes.js:354 | `$set playersInGrid.<id>.{position,hp,maxhp,armorclass,attackbonus,damage,attackrange,speed,iscamping,isinboat}` | - | G | none | field allowlist; values trusted (any player can set any player's hp) | C |
| GET | /grid-has-resource | gridRoutes.js:426 | decode resources (ResourceEncoder) and test for type | G | - | none | - | E |

### frontierRoutes.js
| Method | Path | file:line | Purpose | R | W | Socket | Validation | Callers |
|---|---|---|---|---|---|---|---|---|
| GET | /global-tuning | frontierRoutes.js:47 | cached `require`'d globalTuning (stale after POST /tuning) | FS(cached) | - | none | - | C |
| GET | /frontiers-by-name | frontierRoutes.js:61 | F by name/tier, populate settlements | F | - | none | - | C (CreateAccount) |
| GET | /get-players-by-frontier/:frontierId | frontierRoutes.js:81 | **full Player docs (incl. password hash)** for a frontier | P | - | none | - | -- |
| GET | /frontiers | frontierRoutes.js:95 | all frontiers | F | - | none | - | E |
| GET | /get-frontier/:frontierId | frontierRoutes.js:107 | one frontier populated | F | - | none | - | C, E |
| GET | /get-frontier-grid/:frontierId | frontierRoutes.js:126 | F.settlements 2D | F | - | none | - | -- |
| POST | /create-frontier | frontierRoutes.js:147 | build Frontier + 64 Settlement docs from layout templates | F | F, S | none | none, no auth | C (1 ref) |
| GET | /get-transit-map | frontierRoutes.js:361 | layouts/transitMap.json | FS | - | none | - | -- |
| GET | /frontiers/:frontierId | frontierRoutes.js:373 | F lean | F | - | none | - | -- |
| GET | /layouts/homestead, /layouts/settlement, /layouts/frontier | frontierRoutes.js:389,394,399 | sendFile layout JSON | FS | - | none | - | -- |
| POST | /reset-season | frontierRoutes.js:409 | `Frontier.findOne()` (first doc!) and writes legacy fields `seasons.seasonPhase/seasonStart/seasonEnd` (schema elsewhere uses `phase/startTime/endTime`) | F | F | none | none | -- (dead/legacy) |
| GET | /get-season | frontierRoutes.js:441 | first frontier's seasons | F | - | none | - | -- |
| GET | /get-tuning | frontierRoutes.js:454 | legacy `onSeasonLength/offSeasonLength` keys | FS | - | none | - | -- |
| GET | /tuning/seasons | frontierRoutes.js:467 | seasons.json | FS | - | none | - | C |
| GET | /get-global-season-phase | frontierRoutes.js:476 | `Frontier.findOne({})` phase/type/endTime | F | - | none | - | C |
| POST | /levy-tax | frontierRoutes.js:499 | `levyTax(frontierId)` (taxController.js:11): deduct Money from every player in frontier, pay mayors, push S.taxlog, set F.taxes | F, S, P | P (all), S, F | none | guarded by `taxes.endTime <= now` only; no auth | -- (scheduler path) |
| GET | /frontier/:frontierId/seasonlog | frontierRoutes.js:516 | F.seasonlog | F | - | none | - | C |
| GET | /frontier-bundle/:frontierId | frontierRoutes.js:535 | frontier 2D + settlement grids that have claimed homesteads | F, S | - | none | - | C |
| GET | /homestead-gridcoord/:gridId | frontierRoutes.js:581 | **scans every Settlement** to find a gridId | S (all) | - | none | - | C |

### settlementRoutes.js
| Method | Path | file:line | Purpose | R | W | Socket | Validation | Callers |
|---|---|---|---|---|---|---|---|---|
| GET | /settlements | settlementRoutes.js:17 | all settlements + grid regions | S, G.region | - | none | - | C, E |
| GET | /get-settlement-by-grid/:gridId | settlementRoutes.js:65 | settlementId containing a grid | S | - | none | - | -- |
| GET | /get-settlement/:settlementId | settlementRoutes.js:94 | full settlement doc | S | - | none | ObjectId | C, E |
| GET | /get-settlement-grid/:settlementId | settlementRoutes.js:124 | grids 2D enriched with G.ownerId | S, G | - | none | - | -- |
| GET | /get-settlement-by-coords/:row/:col | settlementRoutes.js:169 | S by name `Settlement_r_c` | S | - | none | - | C |
| GET | /players-in-settlement?settlementId | settlementRoutes.js:197 | players whose `location.s` matches | P | - | none | - | C (GlobalMarketModal) |
| POST | /update-settlement | settlementRoutes.js:214 | **`$set` arbitrary `updates` on S** (name->displayName) | - | S | none | none, no auth (taxrate, population, roles, votes...) | C (Courthouse.js) |
| POST | /increment-settlement-population | settlementRoutes.js:250 | `$inc population` | - | S | none | ObjectId | -- |
| POST | /update-settlement-role | settlementRoutes.js:283 | replace `roles[]` so playerId holds roleName | S | S | none | ObjectIds; no auth (anyone can crown anyone Mayor) | C (ProfilePanel) |
| GET | /settlement/:id/roles | settlementRoutes.js:330 | roles with usernames | S, P | - | none | - | C/E |
| GET | /election-phase/:settlementId | settlementRoutes.js:351 | S.electionPhase | S | - | none | - | -- |
| POST | /reset-election-votes | settlementRoutes.js:372 | votes=[], campaignPromises=[] | - | S | none | none | -- |
| GET | /election-status/:settlementId | settlementRoutes.js:392 | compute phase from legacy `campaignStart/votingStart/votingEnd`; **auto-writes a new cycle** on read | S | S (sometimes) | none | - | -- (legacy) |
| POST | /save-campaign-promise | settlementRoutes.js:476 | push {playerId, username, text} | S | S | none | ObjectIds only; no membership check; text unsanitized; duplicates allowed | C |
| POST | /cast-vote | settlementRoutes.js:509 | push {voterId, candidateId} | S | S | none | candidate in promises; one vote per voterId (voterId unauthenticated) | C |
| GET | /get-train | settlementRoutes.js:559 | calls **undefined `getTrainDataFromDB`** -> always 500 | - | - | none | - | -- (broken) |
| POST | /update-train-offer/:settlementId | settlementRoutes.js:569 | claim/fill `S.currentoffers[_id]` | S | S | none | 409 if claimed by other; `filled` trusted | -- |
| POST | /update-carnival-offer/:settlementId | settlementRoutes.js:625 | same on `S.carnival.currentoffers` | S | S | none | same | C |
| GET | /settlement/:id/taxlog, /banklog, /trainlog, /carnivallog, /electionlog | settlementRoutes.js:691,712,733,753,773 | log arrays | S | - | none | ObjectId | C, E |
| POST | /get-players-by-settlement | settlementRoutes.js:796 | players by `location.s` with **client-supplied projection `fields`** (could request `password`) | P | - | none | - | -- |
| POST | /get-settlement-bundle | settlementRoutes.js:819 | settlement grid + ownerIds + `playersInGrid` of occupied homesteads + owner summaries (username role netWorth tradeStall) | S, G, P | - | none | ObjectId | C (App.js) |

### playerRoutes.js
| Method | Path | file:line | Purpose | R | W | Socket | Validation | Callers |
|---|---|---|---|---|---|---|---|---|
| POST | /send-player-home | playerRoutes.js:21 | `relocateOnePlayerHome` (moves PC entry between grids, resets hp/pos, sets P.location) | P, G, S | G (x2), P | **`io.to(currentGridId).emit('player-left-sync', {gridId, playerId, username, emitterId:null})`** playerRoutes.js:60 | none, no auth | C, E |
| GET | /quests | playerRoutes.js:88 | questsEN.json | FS | - | none | - | C |
| POST | /add-player-quest | playerRoutes.js:100 | push quest (details from file) with client `progress` | P, FS | P | none | quest exists, not active; **progress trusted** (can pre-complete) | C |
| POST | /clear-quest-history | playerRoutes.js:179 | wipe active+completed | - | P | none | - | C |
| POST | /complete-quest | playerRoutes.js:205 | move to completed, add **client-supplied `reward` {type,quantity}** to inventory | P | P | none | requires `activeQuests[i].completed` (client-settable) | -- |
| POST | /update-player-quests | playerRoutes.js:255 | **replace `activeQuests` wholesale** | P | P | none | trusts (incl. `completed:true`) | C |
| POST | /earn-trophy | playerRoutes.js:284 | `awardTrophy` | P, FS | P.trophies | none | trophy exists; name+increment trusted | C |
| GET | /player/:playerId/trophies | playerRoutes.js:308 | trophies | P | - | none | - | C |
| POST | /collect-trophy-reward | playerRoutes.js:330 | mark collected; add Gems from trophies.json | P, FS | P | none | not already collected; reward from server file (good) | C |
| GET | /player/:playerId | playerRoutes.js:395 | **full Player doc incl. password hash** | P | - | none | ObjectId | C |
| GET | /get-player-by-username/:username | playerRoutes.js:418 | full doc incl. hash | P | - | none | - | C |
| POST | /update-profile | playerRoutes.js:435 | **`$set` arbitrary `updates` on P** (username uniqueness, password hashed) | P | P | none | none otherwise: inventory, xp, accountStatus, role, gridId all settable | C (42 call sites), E |
| POST | /update-settings | playerRoutes.js:467 | merge settings | P | P | none | - | -- |
| GET | /get-players-by-settlement/:settlementId | playerRoutes.js:488 | players by `settlementId` (_id username role netWorth tradeStall) | P | - | none | - | -- |
| GET | /inventory/:playerId | playerRoutes.js:524 | inventory/backpack/capacities | P | - | none | ObjectId | C |
| POST | /update-inventory | playerRoutes.js:553 | **full replace** inventory and/or backpack; queued per player (`queue.enqueueByKey`) | P | P | none | trusts entirely | C (10) |
| POST | /update-inventory-delta | playerRoutes.js:588 | bulkWrite `$inc` per item, `$pull` qty<=0 | - | P | none | trusts any +/- delta | C |
| POST | /update-capacity | playerRoutes.js:667 | `$set` warehouse/backpack capacity | - | P | none | trusts | -- |
| POST | /add-relationship | playerRoutes.js:705 | push {name, relscore} | P | P | none | no dup | C |
| POST | /update-relationship | playerRoutes.js:744 | relscore += delta, clamp +-100 | P | P | none | delta trusted | C |
| POST | /add-or-update-relationship-status | playerRoutes.js:781 | `relationship[status] = value` (arbitrary key) | P | P | none | trusts | C |
| GET | /player-position/:username | playerRoutes.js:824 | P.location | P | - | none | - | -- |
| POST | /update-player-position | playerRoutes.js:840 | replace P.location | P | P | none | shape | -- |
| POST | /update-player-location | playerRoutes.js:872 | `$set location` + gridCoord lookup (**scans all S**) + G.region | S (all), G | P | none | shape only | C |
| GET | /skills/:playerId | playerRoutes.js:970 | skills | P | - | none | - | C |
| GET | /skills-tuning, /interactions, /xp-levels | playerRoutes.js:995,1006,1018 | tuning JSON | FS | - | none | - | C |
| POST | /addXP | playerRoutes.js:1035 | `$inc xp` by client amount | - | P | none | number; **amount trusted** | C (6) |
| POST | /update-skills | playerRoutes.js:1070 | **replace skills[]** | P | P | none | trusts | C (6) |
| POST | /update-powers | playerRoutes.js:1099 | replace powers[] | - | P | none | trusts | C |
| POST | /delete-player | playerRoutes.js:1124 | `$unset` PC from current grid; relocate others in homestead; free S cell + population--; delete G; delete P | P, G, S | G, S, P | none | none, no auth | C, E |
| POST | /reset-password | playerRoutes.js:1222 | set password to `'temp'` | P | P | none | **none, no auth** | E |
| POST | /send-mailbox-message | playerRoutes.js:1259 | `sendMailboxMessage(playerId, messageId, customRewards, io)` | P | P.messages | **`io.to(playerId).emit('mailbox-badge-update', {playerId, hasNewMail:true})`** (messageUtils.js:41) | **customRewards trusted** | C (3) |
| POST | /send-mailbox-message-all | playerRoutes.js:1282 | same to every player | P (all) | P (all) | same emit per player | none, no auth | C (1) |
| GET | /messages | playerRoutes.js:1310 | messages.json | FS | - | none | - | C |
| POST | /update-player-messages | playerRoutes.js:1321 | **replace messages[] wholesale** | - | P | none | trusts (can inject messages with rewards) | C |
| POST | /mailbox/collect-rewards | playerRoutes.js:1338 | tx; apply rewards from message/template to inventory/backpack/skills/powers/relocations/xp; splice message | P, FS | P | none | tx idempotent; rewards come from stored message (which client can forge via the two routes above) | C |
| GET | /check-developer-status/:username | playerRoutes.js:1506 | developerUsernames.json | FS | - | none | - | C |
| POST | /update-last-active | playerRoutes.js:1523 | lastActive=now | - | P | none | - | C |
| GET | /players | playerRoutes.js:1543 | all players (wide projection incl. inventory) | P | - | none | - | E |
| GET | /feedback-data | playerRoutes.js:1558 | FTUE feedback | P | - | none | - | E |
| GET | /ftue-steps | playerRoutes.js:1597 | FTUEsteps.json | FS | - | none | - | C |
| GET | /players-by-frontier-with-dev-status/:frontierId | playerRoutes.js:1608 | username settlementId netWorth + isDeveloper | P, FS | - | none | - | C |
| POST | /migrate-warehouse-levels | playerRoutes.js:1630 | set warehouseLevel=0 where missing | P | P (all) | none | none | -- |
| POST | /migrate-grid-resources | playerRoutes.js:1682 | encode legacy object resources via `ResourceEncoder` (`$set resources`) | G | G | none | none | -- |
| POST | /transfer-inventory | playerRoutes.js:1765 | warehouse<->backpack; validates source qty and target capacity (Gold bonus + skill bonuses) | P, FS | P | none | good | C |
| POST | /mark-grid-visited | playerRoutes.js:1899 | bitset `gridsVisited` | P | P | none | gridCoord numeric | C |
| POST | /grids-tiles | playerRoutes.js:1951 | encoded tiles string for gridCoords in a settlement | S, G.tiles | - | none | - | C |
| POST | /set-all-grids-visited | playerRoutes.js:1997 | debug: all bits set | P | P | none | none | C |

### tradingRoutes.js
| Method | Path | file:line | Purpose | R | W | Socket | Validation | Callers |
|---|---|---|---|---|---|---|---|---|
| POST | /trade-stall/collect-payment | tradingRoutes.js:134 | tx; Money += `slot.boughtFor`; clear slot | P | P | none | slot has boughtBy/boughtFor | C |
| POST | /trade-stall/sell-to-game | tradingRoutes.js:212 | tx; Money += amount*price; clear slot | P | P | none | sellTime elapsed, not bought; **price was client-set** | C |
| POST | /update-player-trade-stall | tradingRoutes.js:299 | replace slot fields (resource, amount, price, sellTime, boughtBy, boughtFor, locked) | P | P | none | **no inventory deduction, no price check, boughtBy/boughtFor settable** | C (4) |
| GET | /player-trade-stall | tradingRoutes.js:355 | read (+lazy migration save) | P | P | none | - | C |
| POST | /sell-items | tradingRoutes.js:410 | Money += client `totalMoney`; tradeStall=[] | P | P | none | **trusts totalMoney** | -- (dead) |
| POST | /outpost/initialize | tradingRoutes.js:449 | `G.outpostTradeStall` = 4 empty slots | G | G | none | none | -- |
| POST | /outpost/add-item | tradingRoutes.js:485 | tx(seller); check backpack qty; deduct; fill grid slot | G, P | G, P | none | qty check; price/sellTime trusted | C |
| POST | /outpost/buy-item | tradingRoutes.js:598 | tx(buyer); funds + capacity check; deduct Money; add item; mark slot | G, P | G, P | none | good | C |
| POST | /outpost/collect-payment | tradingRoutes.js:689 | tx; `slot.sellerId === playerId`; Money += boughtFor; clear | G, P | G, P | none | good | C |
| POST | /outpost/sell-to-game | tradingRoutes.js:765 | tx; seller + sellTime check; Money += amount*price | G, P | G, P | none | price was client-set at add-item | C |
| GET | /player-trade-stall-requests | tradingRoutes.js:853 | read (+lazy migration) | P | P | none | - | C |
| POST | /update-player-trade-stall-requests | tradingRoutes.js:904 | replace request slots incl. `moneyCommitted` | P | P | none | **money never deducted server-side** | C |
| POST | /trade-stall/fulfill-request | tradingRoutes.js:956 | tx(seller); seller qty + buyer capacity; seller gets `moneyCommitted`, buyer gets items | P x2 | P x2 | none | item side good; **money side mints from un-escrowed `moneyCommitted`** | C |

### worldRoutes.js
| Method | Path | file:line | Purpose | R | W | Socket | Validation | Callers |
|---|---|---|---|---|---|---|---|---|
| POST | /create-grid | worldRoutes.js:101 | `performGridCreation` (createGridLogic.js:16): new Grid doc (encoded), S cell updated | FS, S | G, S | none | none, no auth | C, E |
| POST | /reset-grid | worldRoutes.js:115 | `performGridReset` (resetGridLogic.js:51): replace resources/tiles/NPCsInGrid, `save({validateBeforeSave:false})` | G, FS | G | none | none | C, E |
| POST | /plant-new-trees/:gridId | worldRoutes.js:134 | `plantNewTrees`: decode, add trees, `encodeResourcesV2`, save | G | G | none | none | C |
| POST | /remove-homestead | worldRoutes.js:155 | relocate all `playersInGrid` home, delete G, free S cell | G, S, P | G, S, P | none | none, no owner check | C |
| POST | /delete-orphaned-grid | worldRoutes.js:244 | delete ownerless grid, free S cell | G, S | G, S | none | ownerId must be null | C |
| POST | /claim-homestead/:gridId | worldRoutes.js:324 | set `G.ownerId` if homestead and unclaimed | G | G | none | type/unclaimed; playerId trusted | -- |
| POST | /create-homestead | worldRoutes.js:363 | verify Home Deed in inv/backpack; find first available homestead slot in frontier; create grid; claim; atomic P update (`gridId:null` guard); S population++ | P, F, S | G, S, P | none | good (Home Deed checked; race guarded) | C |
| PATCH | /update-grid/:gridId | worldRoutes.js:503 | queued per gridId (`enqueueByKey`); add/update/remove ONE resource at (x,y) via `gridResourceManager.updateResource`; responds **202 before write** | G | G.resources | none | coords numeric; **type/growEnd/craftEnd/craftedItem/stationLevel/slots trusted** | C (GridManagement.js:49) |
| PATCH | /update-tile/:gridId | worldRoutes.js:649 | `gridTileManager.updateTile` then save | G | G.tiles | none | coords 0-63, tile type valid; no cost check | C (GridManagement.js:73) |
| GET | /load-grid/:gridId | worldRoutes.js:690 | decode resources+tiles, enrich with masterResources, populate owner username; **may write** (strips `growEnd` from doobers) | G, P | G (cleanup) | none | - | C, E |
| POST | /load-neighbor-grids | worldRoutes.js:800 | tiles+resources for <=9 grids | G | - | none | - | -- |
| PATCH | /update-grid-availability/:gridId | worldRoutes.js:864 | S cell `.available` | S | S | none | none | -- |
| GET | /resources, /traders, /trophies, /warehouse | worldRoutes.js:916,930,945,959 | tuning JSON | FS | - | none | - | C |
| GET | /get-resource/:gridId/:col/:row | worldRoutes.js:974 | one resource type | G | - | none | - | C |
| GET | /get-tile/:gridId/:x/:y | worldRoutes.js:1008 | one tile | G | - | none | - | C |
| GET | /get-frontier-id, /get-settlement-id, /get-homestead-id | worldRoutes.js:1051,1062,1077 | utils/IDs defaults | F/S/G | - | none | - | -- |
| POST | /api/generate-tiles | worldRoutes.js:1096 | effective path **`/api/api/generate-tiles`** (double prefix); layout -> `generateGrid` | FS | - | none | - | -- |
| POST | /api/generate-resources | worldRoutes.js:1120 | same, **`/api/api/...`** | FS | - | none | - | -- |
| POST | /debug/refresh-bank-offers/:frontierId | worldRoutes.js:1143 | regenerate `F.bank.offers` | F | F | none | none | -- |
| POST | /relocate-homestead | worldRoutes.js:1173 | scan all S; clear source cell, fill target; population +-; `G.settlementId`; P.settlementId/homesteadGridCoord/location; `relocations--` | S (all), G, P | S, G, P | none | homestead-type checks only; **does not require `relocations>0`**; assigns undeclared `updated` (:1197,:1207) | C |
| POST | /get-grids-by-id-array | worldRoutes.js:1315 | grids + owner username/netWorth/role/tradeStall | G, P | - | none | - | -- |
| POST | /crafting/collect-item | worldRoutes.js:1350 | tx; validate station at (x,y), slot item match, craftEnd elapsed; clear slot; **does not grant item** (client does) | G, P | G.resources, P(tx) | none | good on grid side; grant is client-side | C |
| POST | /crafting/start-craft | worldRoutes.js:1525 | tx; free slot (<= stationLevel+1); check+deduct ingredients; set slot craftEnd | G, P | G.resources, P | none | **`recipe` object (ingredients, crafttime, type) supplied by client, not looked up** | C (5) |
| POST | /crafting/upgrade-station | worldRoutes.js:1759 | tx; cost from `globalTuning.craftingStationSlotCosts`; level bounds; deduct | G, P | G.resources, P | none | good | C |
| POST | /farm-animal/collect | worldRoutes.js:1926 | tx; NPC exists & `state==='processing'`; set `emptystall`, hp 0 (`markModified('NPCsInGrid')`, full save); computes qty with skills but **does not grant** | G, P, FS | G.NPCsInGrid, P(tx) | none | state check good; grant client-side | C |
| POST | /sell-for-refund | worldRoutes.js:2088 | tx; station at (x,y) with type; refund ingredients from masterResources to inventory; **does not remove station** (comment :2193: left to client "for socket broadcasting") | G, P, FS | P | none | refund amount server-derived; removal not enforced (double-refund possible) | C |
| POST | /bulk-harvest | worldRoutes.js:2234 | tx; capacity check; remove crops/ready farmplots; inventory += **client `expectedYield`**; replant consumes seeds; add farmplots | G, P, FS | G.resources, P | none | positions verified; **yield trusted** (:2349-2351) | C |
| POST | /crafting/collect-bulk | worldRoutes.js:2585 | **no tx guard**; per station: slot ready check; optional restart using client `restartRecipe` (skill + afford check); clear/refill slots | G, P | G.resources, P | none | recipe trusted; no idempotency | C |
| POST | /make-it-snow/:gridId, /melt-the-snow/:gridId | worldRoutes.js:2843,2894 | `TileEncoder` decode all, swap g<->o, encode, save | G | G.tiles | none | none | C (dev) |
| POST | /create-dungeon | worldRoutes.js:2945 | new Grid from dungeon template (`TileEncoder`, `ResourceEncoder`, NPC map); add to `F.dungeons` | FS, F | G, F | none | template exists | E |
| GET | /grids | worldRoutes.js:3102 | list grids (+templateUsed for dungeons) | G, F | - | none | - | E |
| POST | /reset-dungeon | worldRoutes.js:3163 | `performGridReset`; update F.dungeons entry | G, F | G, F | none | gridType dungeon | E |
| DELETE | /delete-dungeon/:gridId | worldRoutes.js:3220 | delete dungeon grid; remove from F.dungeons | G, F | G, F | none | gridType dungeon | E |
| POST | /exit-dungeon | worldRoutes.js:3260 | compute exit position (FTUE cave hard-coded -> homestead Signpost Town; else `sourceGridBeforeDungeon` -> Dungeon Entrance); `$unset sourceGridBeforeDungeon` | P, G, S | P | none | - | C |
| POST | /enter-dungeon | worldRoutes.js:3454 | find dungeon via `F.dungeons[*].entranceGrids`; **if `needsReset`, resets the shared dungeon grid**; set P.sourceGridBeforeDungeon; return Dungeon Exit pos | F, G | G (reset), F, P | none | - | C |
| POST | /update-dungeon-config | worldRoutes.js:3594 | validate entrance grids contain `Dungeon Entrance` (ResourceEncoder decode); `$set F.dungeons.<id>.{templateUsed,entranceGrids}` | G, F | F | none | - | E |
| GET | /diagnose-undefined-resources | worldRoutes.js:3683 | scan all grids for bad encoded resources | G (all) | - | none | - | -- |
| POST | /manual-grid-reset | worldRoutes.js:3779 | `performGridReset` on any grid type | G, S | G | none | none | -- |
| POST | /update-grid-region | worldRoutes.js:3842 | `G.region` | G | G | none | - | E |
| POST | /bulk-update-grid-regions | worldRoutes.js:3874 | `updateMany region` | - | G | none | - | E |

### server.js inline routes
| Method | Path | file:line | Purpose | R | W | Socket | Validation | Callers |
|---|---|---|---|---|---|---|---|---|
| GET | /api/stripe-test | server.js:538 | Stripe balance | - | - | none | - | -- |
| GET | / | server.js:549 | health text | - | - | none | - | -- |
| GET | /api/ping | server.js:560 | pong | - | - | none | - | C |
| POST | /api/save-layout | server.js:567 | write `layouts/gridLayouts/<directory>/<fileName>.json` from body | - | FS | none | **no path sanitization** (directory/fileName traversal) | -- |
| GET | /api/load-layout | server.js:642 | read same | FS | - | none | same | -- |

---

## 2. Grouping

**(a) Player-profile transactions (inventory, skills, quests, xp, money, store, gems, mailbox, trophies, relationships)**
playerRoutes: /add-player-quest, /clear-quest-history, /complete-quest, /update-player-quests, /earn-trophy, /collect-trophy-reward, /update-profile, /update-settings, /update-inventory, /update-inventory-delta, /update-capacity, /add-relationship, /update-relationship, /add-or-update-relationship-status, /addXP, /update-skills, /update-powers, /send-mailbox-message, /send-mailbox-message-all, /update-player-messages, /mailbox/collect-rewards, /transfer-inventory, /mark-grid-visited, /set-all-grids-visited, /update-last-active, /update-player-location, /update-player-position, /delete-player, /reset-password.
tradingRoutes (player-side): /trade-stall/collect-payment, /trade-stall/sell-to-game, /update-player-trade-stall, /sell-items, /update-player-trade-stall-requests, /trade-stall/fulfill-request.
paymentRoutes: /purchase-store-offer, /create-checkout-session.
worldRoutes (player-side effects): /sell-for-refund (P only), /create-homestead (P + G + S), /relocate-homestead, /enter-dungeon, /exit-dungeon.

**(b) Grid-state mutations (resources, tiles, NPCs, PCs in grid)**
gridRoutes: all 9 POST routes. worldRoutes: /create-grid, /reset-grid, /plant-new-trees, /remove-homestead, /delete-orphaned-grid, /claim-homestead, /create-homestead, /update-grid, /update-tile, /load-grid (cleanup write), /crafting/collect-item, /crafting/start-craft, /crafting/upgrade-station, /farm-animal/collect, /bulk-harvest, /crafting/collect-bulk, /make-it-snow, /melt-the-snow, /create-dungeon, /reset-dungeon, /delete-dungeon, /enter-dungeon (reset), /manual-grid-reset, /update-grid-region, /bulk-update-grid-regions. playerRoutes: /migrate-grid-resources, /delete-player ($unset PC), /send-player-home (via relocateOnePlayerHome). tradingRoutes: /outpost/* (G.outpostTradeStall).

**(c) Settlement / frontier shared state**
settlementRoutes: /update-settlement, /increment-settlement-population, /update-settlement-role, /reset-election-votes, /election-status (writes), /save-campaign-promise, /cast-vote, /update-train-offer, /update-carnival-offer, plus all GETs. frontierRoutes: /create-frontier, /reset-season, /levy-tax (+taxController), /frontier-bundle, /homestead-gridcoord. worldRoutes: /update-grid-availability, /debug/refresh-bank-offers, /update-dungeon-config, /create-dungeon & /delete-dungeon (F.dungeons). scheduleRoutes: /reset-all-timers, /initialize-dungeon-timer, /force-end-phase. Global market = `/players-in-settlement` + `/get-players-by-settlement/:id` + trade-stall data on Player (no dedicated route).

**(d) Auth / payment / analytics / editor / misc**
auth.js both; paymentRoutes all; analyticsRoutes all; chatRoutes; scheduleRoutes GET/POST /tuning; all FS read-only routes (/resources, /traders, /trophies, /warehouse, /quests, /skills-tuning, /interactions, /xp-levels, /messages, /ftue-steps, /store-offers, /global-tuning, /tuning/seasons, /layouts/*, /get-transit-map); editor: /players, /feedback-data, /settlements, /frontiers, /grids, /grid-has-resource, /diagnose-undefined-resources, /api/api/generate-*, /save-layout, /load-layout.

---

## 3. Routes that mutate Grid.resources / tiles / NPCsInGrid / playersInGrid

Encoders: `utils/ResourceEncoder.js` (`UltraCompactResourceEncoder`, array-per-resource), `utils/TileEncoder.js` (base64 string for 64x64). Managers: `utils/GridResourceManager.js` (singleton; `getResources` decodes whole array; `updateResource` = decode all -> splice/replace by (x,y) -> re-encode all, GridResourceManager.js:116-148; **never a targeted $set**), `utils/GridTileManager.js` (`updateTile` = decode whole string -> set cell -> re-encode, GridTileManager.js:65-93).

Every resources/tiles write below is therefore **whole-field rewrite via `grid.save()`** on a loaded document (Mongoose versioned save, so concurrent writers to the same grid race/VersionError). Only the gridRoutes PC/NPC routes marked "atomic" use dot-notation `$set`/`$unset`.

| Route | Field | Payload | Write style | Encoder/Manager |
|---|---|---|---|---|
| PATCH /update-grid/:gridId (worldRoutes.js:503) | resources | `{resource:{type,x,y,growEnd?,craftEnd?,craftedItem?,stationLevel?,slots?}}`; `type:null/undefined` = remove; `null` on an attr deletes it | queued per grid (`queue.enqueueByKey`), findById -> `updateResource` -> `grid.save()`; HTTP 202 returned before the write; errors swallowed (worldRoutes.js:639) | GridResourceManager |
| PATCH /update-tile/:gridId (:649) | tiles | `{x,y,newType}` | findById -> `updateTile` -> save | GridTileManager |
| GET /load-grid/:gridId (:690) | resources | - | side-effect: strips `growEnd` from doober resources and saves (`encodeResourcesV2`, :747) | GridResourceManager |
| POST /plant-new-trees/:gridId (:134) | resources | `{gridCoord}` | plantNewTreesLogic.js:170 `encodeResourcesV2` + save | GridResourceManager |
| POST /crafting/collect-item (:1350) | resources | `{playerId,gridId,stationX,stationY,craftedItem,slotIndex,transactionId,transactionKey}` | `updateResource` (slot cleared, stationLevel preserved) -> save | GridResourceManager |
| POST /crafting/start-craft (:1525) | resources | `{... recipe:{type,ingredient1..4,ingredient1qty..,crafttime}, qty?, rarity?}` | `updateResource` with new slots -> save | GridResourceManager |
| POST /crafting/upgrade-station (:1759) | resources | `{... targetLevel}` | `updateResource({...station, stationLevel})` -> save | GridResourceManager |
| POST /bulk-harvest (:2234) | resources | `{playerId,gridId,operations:[{cropType,positions:[{x,y}],replant,freeReplant,expectedYield}],tx...}` | N x `updateResource` (remove crop, add farmplot) then one save | GridResourceManager |
| POST /crafting/collect-bulk (:2585) | resources | `{playerId,gridId,stations:[{x,y,craftedItem,slotIndex,transactionId,shouldRestart,restartRecipe}]}` | N x `updateResource` then one save | GridResourceManager |
| POST /make-it-snow, /melt-the-snow (:2843,:2894) | tiles | - | `TileEncoder.decode/encode` directly -> save | TileEncoder |
| POST /create-grid (:101) / /create-homestead (:363) | all | `{gridCoord,gridType,settlementId,frontierId}` / `{playerId}` | `new Grid({resources: encoded[], tiles: encoded, NPCsInGrid: Map})` (createGridLogic.js:231-244) | ResourceEncoder, TileEncoder directly |
| POST /reset-grid (:115), /reset-dungeon (:3163), /manual-grid-reset (:3779), /enter-dungeon (:3454 when needsReset) | resources, tiles, NPCsInGrid | `{gridId,gridType,gridCoord}` | resetGridLogic.js:346-366: replace all three fields, `save({validateBeforeSave:false})`; playersInGrid untouched | ResourceEncoder, TileEncoder directly |
| POST /create-dungeon (:2945) | all | `{templateFilename,settlementId?,frontierId?}` | `new Grid` with NPCs Map built from template | ResourceEncoder, TileEncoder directly |
| POST /migrate-grid-resources (playerRoutes.js:1682) | resources | `{gridIds?}` | `updateOne $set resources` | ResourceEncoder directly |
| POST /farm-animal/collect (worldRoutes.js:1926) | NPCsInGrid | `{playerId,gridId,npcId,npcPosition,tx...}` | Map.set + `markModified('NPCsInGrid')` + save (whole map rewritten) | none |
| POST /save-grid-state-npcs (gridRoutes.js:137) | NPCsInGrid | `{gridId,npcs:{[npcId]:npc},NPCsInGridLastUpdated}` | **full replace** + save | none |
| POST /save-single-npc (:229) | NPCsInGrid | `{gridId,npcId,npc,lastUpdated}` | atomic `$set NPCsInGrid.<id>` | none |
| POST /remove-single-npc (:263) | NPCsInGrid | `{gridId,npcId}` | load, Map.delete, `save({validateBeforeSave:false})` (full map) | none |
| POST /batch-update-npc-positions (:295) | NPCsInGrid | `{gridId,updates:{[npcId]:{x,y}},timestamp}` | atomic `$set .position/.lastUpdated` | none |
| POST /save-grid-state-pcs (:10) | playersInGrid | `{gridId,pcs,playersInGridLastUpdated}` | **full replace** + save | none |
| POST /save-single-pc (:40) | playersInGrid | `{gridId,playerId,pc,lastUpdated}` | atomic `$set` | none |
| POST /remove-single-pc (:99) | playersInGrid | `{gridId,playerId}` | atomic `$unset` | none |
| POST /batch-update-pc-positions (:354) | playersInGrid | `{gridId,updates:{[playerId]:{position,hp,...}},timestamp}` | atomic `$set` per field | none |
| POST /delete-player (playerRoutes.js:1124) | playersInGrid | `{playerId}` | atomic `$unset` on current grid; then `relocateOnePlayerHome` for others in homestead | none |
| POST /send-player-home (:21), /remove-homestead (worldRoutes.js:155), /delete-player | playersInGrid (2 grids) | - | relocatePlayersHome.js:195-408: load both grids, Map delete/set, two `grid.save()` + `player.save()` | GridResourceManager (read, to find Signpost Town) |
| POST /outpost/* (tradingRoutes.js:449-846) | outpostTradeStall | slot ops | load + mutate array + `grid.save()` | none |

---

## 4. Server -> client socket emits in routes/utils

Only three sites exist outside `server.js`:

1. `routes/playerRoutes.js:60` (POST /send-player-home): `io.to(currentGridId).emit('player-left-sync', { gridId, playerId, username, emitterId: null })` via `getSocketIO()` (socketInstance.js). Room = grid id. **Delete** in the refactor (no other PCs displayed).
2. `utils/messageUtils.js:41` (`sendMailboxMessage`, when `io` passed): `io.to(playerId).emit('mailbox-badge-update', { playerId, hasNewMail: true })`. Room = player id. Callers that pass io: `/send-mailbox-message` (playerRoutes.js:1271), `/send-mailbox-message-all` (:1292). `/purchase-store-offer` (paymentRoutes.js:84) calls it **without** io, so store purchases never badge. **Keep** (notification).
3. `routes/playerRoutes.js:1292-1296`: `req.app.get('socketio')` fetched and logged (rooms, client count) in /send-mailbox-message-all; debug only.

No scheduler or other util emits (`grep emit( schedulers utils` -> only messageUtils). `worldRoutes.js:2194` is a comment explaining why `/sell-for-refund` leaves the station in place ("ensures proper socket broadcasting to other players"): that is a shared-grid assumption, not an emit.

For reference, every other emit lives in `server.js` socket handlers: `connected-players`, `player-connected`, `player-disconnected`, `current-grid-players`, `npc-controller-update`, `player-joined-sync`, `player-left-sync`, `sync-PCs`, `sync-NPCs`, `npc-moved-sync`, `remove-NPC`, `tile-sync`, `resource-sync`, `receive-chat-message`, `chat-badge-update`, `mailbox-badge-update`. The `update-tile` / `update-resource` socket handlers (server.js:472-495) **only rebroadcast; they never persist** - persistence is the PATCH routes above. Keepers after refactor: `receive-chat-message`, `chat-badge-update`, `mailbox-badge-update`. Everything else is grid-sync and goes.

---

## 5. Anti-cheat: what exists, what is open

**Existing server-side validation (keep these as the "transactional moment" templates):**
- Idempotent tx guard (`lastTransactionIds` + `activeTransactions`, 30s stale window): `/crafting/collect-item`, `/crafting/start-craft`, `/crafting/upgrade-station`, `/farm-animal/collect`, `/sell-for-refund`, `/bulk-harvest`, `/mailbox/collect-rewards`, all `/trade-stall/*` and `/outpost/*` (TransactionManager, tradingRoutes.js:12-71). Note two divergent formats: tradingRoutes/mailbox store a string id; worldRoutes stores `{id,timestamp}` (worldRoutes.js:1485) and runs `cleanupTransactionIds` (:37).
- Game-state checks: craft slot ready (`craftEnd <= now`, item match) :1443; free slot <= stationLevel+1 :1604; upgrade cost from `globalTuning` :1824; farm animal `state==='processing'` :1984; station exists + type match :2139; Home Deed required + atomic `gridId:null` guard :391,:459; outpost funds/capacity/seller checks tradingRoutes.js:633,639,715,791; fulfill-request seller qty + buyer capacity :996,:1002; transfer-inventory capacity (Gold + skill bonus) playerRoutes.js:1808-1846; trophy reward from file :357; train/carnival claim conflict 409 settlementRoutes.js:597; one vote per voter :532; `relocate-homestead` cell-type guards worldRoutes.js:1189,1200.

**Gaps (ordered by how directly they mint value):**
1. `POST /update-profile` (playerRoutes.js:455) `$set`s any field: inventory, xp, accountStatus:'Gold', role, gridId, relocations. 42 client call sites, so it cannot simply be removed; it needs a field allowlist.
2. `POST /update-inventory` (:553) full replace; `POST /update-inventory-delta` (:588) arbitrary `$inc`; `/addXP` (:1035); `/update-skills` (:1070); `/update-powers` (:1099); `/update-capacity` (:667); `/update-player-quests` (:255, lets client mark `completed:true`); `/complete-quest` (:205, reward object from client). All trust the client outright.
3. Mailbox forgery loop: `/send-mailbox-message` accepts `customRewards` (:1260) and `/update-player-messages` replaces `messages[]` (:1321); `/mailbox/collect-rewards` then applies whatever is stored. The collect route is sound only if message creation is server-only.
4. Trade stall: `/update-player-trade-stall` (tradingRoutes.js:299) sets `boughtBy`/`boughtFor` and `price` without deducting stock; `/trade-stall/collect-payment` then pays `boughtFor`. `/update-player-trade-stall-requests` sets `moneyCommitted` without escrow; `/trade-stall/fulfill-request` pays it out. `/sell-items` (:410) adds client `totalMoney` (dead, but live).
5. `/purchase-store-offer` (paymentRoutes.js:45) grants Gold / rewards with no Stripe webhook or session verification; success_url query params are the only "proof".
6. `/bulk-harvest` trusts `expectedYield` (worldRoutes.js:2349-2351); `/crafting/start-craft` and `/crafting/collect-bulk` trust the client `recipe`/`restartRecipe` (ingredients, crafttime, type) instead of looking it up in `masterResources`.
7. `/crafting/collect-item` and `/farm-animal/collect` deliberately do NOT grant the item ("let client handle with gainIngredients", :1462, :2036); the client then calls the trusted inventory routes. The transactional guard protects the grid slot, not the reward.
8. `/sell-for-refund` refunds but leaves the station (:2193); re-calling with a new transactionId refunds again until the client removes it via `/update-grid`.
9. `PATCH /update-grid` (:503) lets the client place any resource type with any `growEnd`/`slots`/`stationLevel` (free buildings, instantly-grown crops, unlocked slots); `PATCH /update-tile` any tile. These are the primary "client is authoritative" paths today.
10. No authentication/authorization anywhere: no session/token middleware (server.js:87 is a no-op), `playerId` in body is the identity. Admin routes exposed to anyone: `/reset-password` (sets `'temp'`), `/delete-player`, `/send-mailbox-message-all`, `/update-settlement`, `/update-settlement-role`, `POST /tuning` (rewrites globalTuning.json), `/reset-all-timers`, `/force-end-phase`, `/levy-tax`, `/create-frontier`, `/remove-homestead`, `/reset-grid`, `/manual-grid-reset`, `/make-it-snow`, `/set-all-grids-visited`, `/save-layout` (path traversal via `directory`/`fileName`, server.js:591).
11. Data exposure: `GET /player/:id`, `/get-player-by-username`, `/get-players-by-frontier` return full docs including `password` hash; `/get-players-by-settlement` (settlementRoutes.js:796) accepts a client projection.
12. Grid PC/NPC routes let any client overwrite any other player's `hp/damage/armorclass` (`/batch-update-pc-positions` allowlist :387) or remove them (`/remove-single-pc`). Moot once grids are per-player, but note `/save-single-npc` still lets a client create arbitrary NPCs (e.g. fully-processed farm animals, dead bosses) in its own grid, which `/farm-animal/collect` then honors.

---

## 6. Dead code, duplication, suspicious patterns, editor usage

**Broken / dead routes (no client or editor caller found):**
- `GET /get-train` (settlementRoutes.js:559) references undefined `getTrainDataFromDB` -> always throws.
- `POST /api/generate-tiles`, `/api/generate-resources` (worldRoutes.js:1096,1120) are mounted under `/api` so they resolve at `/api/api/...`; nothing calls them.
- `POST /reset-season` (frontierRoutes.js:409) writes field names that do not exist in the current seasons schema; `GET /election-status` (settlementRoutes.js:392) uses legacy `campaignStart/votingStart/votingEnd` and `tuningConfig.termLength` etc.
- No callers: /save-grid-state-pcs, /get-multiple-grid-states, /load-neighbor-grids, /get-grids-by-id-array, /update-grid-availability, /claim-homestead, /get-frontier-id, /get-settlement-id, /get-homestead-id, /debug/refresh-bank-offers, /sell-items, /outpost/initialize, /get-season, /get-tuning, /levy-tax, /get-players-by-frontier, /get-frontier-grid, /get-transit-map, /frontiers/:id, /layouts/*, /reset-all-timers, /initialize-dungeon-timer, /get-settlement-by-grid, /get-settlement-grid, /increment-settlement-population, /election-phase, /reset-election-votes, /update-train-offer, GET and POST /get-players-by-settlement, /player-position, /update-player-position, /update-settings, /complete-quest, /update-capacity, /migrate-warehouse-levels, /migrate-grid-resources, /diagnose-undefined-resources, /manual-grid-reset, POST /tuning, /save-layout, /load-layout, /stripe-test.
- `utils/inventoryUtils.js` `loadInventory/saveInventory/initializeInventory` (file-based `playerInventory.json`) are unused; only `isCurrency` is imported.
- `worldRoutes.js:591` `if (false) { ... }` block; `worldRoutes.js:93` a `require` placed after a function body; `tradingRoutes.js` TransactionManager is re-implemented inline in `/mailbox/collect-rewards` (playerRoutes.js:1347-1375, with the comment admitting it) and again inline six times in worldRoutes (:1359-1388, :1534-1563, :1767-1795, :1935-1964, :2097-2126, :2243-2272).
- Capacity calculation (Gold bonus + skill bonus) is copy-pasted three times: `checkWarehouseCapacity` tradingRoutes.js:76, `/transfer-inventory` playerRoutes.js:1808, `/bulk-harvest` worldRoutes.js:2292.
- Legacy crafting `craftEnd/craftedItem -> slots[]` migration pasted three times (worldRoutes.js:1408, :1583, :2626).
- Settlement cell free-up loop pasted in `/remove-homestead` (:199), `/delete-orphaned-grid` (:277), `/delete-player` (playerRoutes.js:1180, which loads **all** settlements), `/relocate-homestead` (:1184, all settlements).
- "Find gridCoord by scanning every Settlement" appears in `/homestead-gridcoord` (frontierRoutes.js:596), `/update-player-location` (playerRoutes.js:900), `/relocate-homestead`, `/delete-player`.

**Suspicious:**
- `/relocate-homestead` assigns to undeclared `updated` (worldRoutes.js:1197,1207): implicit global in sloppy mode, would throw under `'use strict'`.
- `PATCH /update-grid` responds 202 then swallows save errors (:639-645); client never learns a write failed.
- `GET /load-grid` performs a write (crop cleanup, :743-755) on a read route.
- `/enter-dungeon` resets a **shared** dungeon grid for everyone when `needsReset` is set (:3503-3535).
- `/get-global-season-phase`, `/get-season`, `/reset-season` use `Frontier.findOne()` (first frontier in the collection, not the player's).
- `tuningConfig` is `require`'d at load in frontierRoutes/settlementRoutes/worldRoutes/taxController, so `POST /tuning` changes on disk are not seen until restart; `GET /global-tuning` serves the stale copy.
- `express.json({limit:'10mb'})` and no rate limiting on any route.
- taxController.js:54-76 saves each Player doc one at a time inside a loop (N round trips per settlement).

**Routes the game-editor uses (keep for the editor regardless of refactor):** `/api/settlements`, `/api/settlement/:id/*logs`, `/api/get-settlement/:id`, `/api/get-frontier/:id`, `/api/frontiers`, `/api/frontier/:id/seasonlog`, `/api/players`, `/api/feedback-data`, `/api/update-profile`, `/api/reset-password`, `/api/delete-player`, `/api/send-player-home`, `/api/resources`, `/api/xp-levels`, `/api/tuning` (GET), `/api/force-end-phase`, `/api/create-grid`, `/api/reset-grid`, `/api/load-grid/:id`, `/api/grids`, `/api/grid-has-resource`, `/api/create-dungeon`, `/api/reset-dungeon`, `/api/delete-dungeon/:id`, `/api/update-dungeon-config`, `/api/update-grid-region`, `/api/bulk-update-grid-regions`, `/api/analytics/*`.

---

## 7. Hard-coded shared-grid assumptions

- **PC maps on Grid**: `Grid.playersInGrid` is a Map of all players standing in a grid (models/grid.js:35-65). Written by `/save-single-pc`, `/remove-single-pc`, `/batch-update-pc-positions`, `/save-grid-state-pcs`, `/delete-player` (playerRoutes.js:1148), `relocateOnePlayerHome` (relocatePlayersHome.js:221-226 even searches `Grid.findOne({'playersInGrid.<id>': {$exists}})` to find where a player is). Read by `/load-grid-state`, `/get-multiple-grid-states`, `/get-settlement-bundle` (settlementRoutes.js:850-853 returns other players' `playersInGrid` to the settlement view), `/remove-homestead` (worldRoutes.js:174-190 relocates "all players in this grid"), `/delete-player` (:1162-1175 "send other players in this grid home").
- **Socket room = gridId** and emitterId filtering: `/send-player-home` broadcast (playerRoutes.js:45-72) exists only to tell *other* players in the grid that this one left.
- **"Let the client handle it so it broadcasts"**: `/sell-for-refund` comment worldRoutes.js:2193-2194; `/crafting/collect-item` :1459-1462 and `/farm-animal/collect` :2036-2037 leave inventory grants to the client, which then also socket-syncs the grid.
- **Shared NPC state**: `Grid.NPCsInGrid` is global per grid; `/farm-animal/collect` mutates it for everyone; `/save-grid-state-npcs` lets whichever client is "NPC controller" overwrite the whole map; `/batch-update-npc-positions` is the controller's heartbeat.
- **Shared dungeon lifecycle**: `Frontier.dungeons[id].needsReset/lastReset` and `/enter-dungeon`'s reset-on-entry (:3503), `/reset-dungeon`, scheduleRoutes `/initialize-dungeon-timer`, `F.dungeon` phase timer: all assume one dungeon instance per frontier shared by all players, with `sourceGridBeforeDungeon` on Player to get back. FTUE cave is a single shared grid id hard-coded in auth.js:72 and worldRoutes.js:3265.
- **Shared Town/Valley resources**: `/bulk-harvest`, `/update-grid`, `/plant-new-trees`, `/reset-grid`, `/make-it-snow` write the one Grid doc for a town/valley coordinate; `performGridReset` is scheduler-driven for valleys. There is no notion of per-player copies anywhere in the route layer; `gridId` is the only key.
- **Ownership checks** (`Grid.ownerId`): `/claim-homestead` (:346), `/delete-orphaned-grid` (:260), `/get-settlement-grid` and `/get-settlement-bundle` (owner enrichment), `/load-grid` populates owner username, `/get-grids-by-id-array` populates owner netWorth/role/tradeStall for settlement snapshots. These are the pieces that survive into "homesteads remain shared-world".
- **Population counts**: `Settlement.population` incremented in `/create-homestead` (:482), `/increment-settlement-population`, decremented in `/delete-player` (:1195), moved in `/relocate-homestead` (:1234-1250); `levyTax` filters `population > 0` (taxController.js:37).
- **Outpost trade stall on Grid** (`outpostTradeStall`, models/grid.js:84): a shared marketplace keyed by the grid the outpost sits on; per-player grids would need this moved to Settlement or its own collection.
- **Chat scopes** `grid|settlement|frontier` (chatRoutes.js:8): the `grid` scope presumes co-located players.
- **`Player.location.g`** is treated as a globally meaningful grid id for presence (`/players-in-settlement` filters `location.s`; `/get-players-by-settlement` same).
