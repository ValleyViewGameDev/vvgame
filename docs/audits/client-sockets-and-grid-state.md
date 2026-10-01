# vvgame client audit: socket + grid-state layer (read-only)

Scope: `game-client/src/` — socketManager.js, GridState/*, Utils/GridManagement.js, Utils/ResourceHelpers.js, Utils/GridStateDebug.js, PlayerMovement.js, AppInit.js, Social/Chat/Farming/AllNPCsShared/Notifications/Mailbox, and grep-targeted blocks of App.js. Server handlers in `game-server/server.js` were grepped only to confirm which client events are actually wired.

All paths below are relative to `/Users/jonathanknight/GameDevelopment/vvgame/game-client/src/` unless they start with `game-server/`.

Legend: **DELETE** = PC sync / NPC sync / tile sync / resource sync / controller election. **KEEP** = chat, mailbox/store badge, notifications, connection. **DECIDE** = ambiguous. **(dead on wire)** = no counterpart on the server at all.

---

## 0. Headline findings

1. The socket layer is almost entirely grid-sync. Of 25 client emits, **21 are DELETE**; of 21 distinct listened events, **16 are DELETE**. Chat + badges + connect/disconnect are the whole KEEP set.
2. **Nine client emits and five client listeners have no counterpart on the server** (section 1.3). They already do nothing; the refactor just formalises that.
3. The "NPC controller" is server-elected (first socket in a grid room) and gated client-side by one line: `App.js:2265`. `GridState/NPCController.js` is a parallel mechanism whose result is only ever read for a console.log. Making every client the controller of its own grid is a one-line change plus deleting ~150 lines.
4. A grid transition makes **~9 HTTP calls + 6 socket emits**, fetching `load-grid-state` three times and `load-grid` twice for the same destination grid (section 4.2).
5. Movement is pushed over the socket **on every step** (full PC object, ~15 fields) and persisted over HTTP every 5s; there is no server-side movement validation (section 5).
6. Eight of the eleven socket-listener `useEffect`s in App.js **do not return their cleanup function**, so handlers accumulate on every `currentPlayer` change (section 8.1). This is a live bug today and will vanish with the refactor only if those effects are deleted rather than kept.
7. `PlayersInGrid.removePC` (called from the `player-left-sync` handler) POSTs `/api/remove-single-pc` for *another* player from a non-owner client (`socketManager.js:113-114` → `GridState/PlayersInGrid.js:645`).

---

## 1. Socket event inventory

### 1.1 Client EMITS

| # | Event | Where (file:line) | Payload | Trigger | Verdict |
|---|---|---|---|---|---|
| E1 | `join-grid` | `App.js:1537`; `Utils/GridManagement.js:277,282`; `socketManager.js:716` | `{ gridId, playerId }` | app init; every grid transition; every socket reconnect | **DELETE** (grid rooms exist only to fan out sync events). Server side: joins room, tracks `connectedPlayersByGrid`, replies `current-grid-players`, `connected-players`, `player-connected`, and elects controller (`game-server/server.js:207-247`). |
| E2 | `player-joined-grid` | `App.js:1563`; `Utils/GridManagement.js:583` | `{ gridId, playerId, username, playerData:{playerId,username,type:'pc',icon,position,hp,maxhp,armorclass,attackbonus,damage,attackrange,speed,iscamping,isinboat,lastUpdated} }` | init; grid transition | **DELETE** |
| E3 | `join-player-room` | `App.js:1570`; `socketManager.js:717` (object) and `App.js:1396` (**bare string, broken**: server destructures `{playerId}` at `game-server/server.js:329`) | `{ playerId }` | init; reconnect | **KEEP** (per-player room for mailbox/store badge + future notifications). Fix 1396. |
| E4 | `set-username` | `App.js:1572`; `socketManager.js:668,719`; `Utils/GridManagement.js:567` | `{ username }` | init; every NPCControllerStatus effect run; reconnect; transition | **DELETE** (server only uses it to label the controller, `game-server/server.js:310-326`). Chat payload already carries username. |
| E5 | `request-npc-controller` | `App.js:1576`; `Utils/GridManagement.js:568`; `GameFeatures/Social/SocialPanel.js:209,275` | `{ gridId }` | init; transition; dev "remove/send home" | **DELETE (dead on wire)** |
| E6 | `relinquish-npc-controller` | `App.js:3389` | `{ gridId }` | 15-min inactivity | **DELETE (dead on wire)** |
| E7 | `join-grid-controller` | `GridState/NPCController.js:57` | `{ gridId, timestamp }` | `joinGrid()` — **never called** | **DELETE (dead on wire + dead caller)** |
| E8 | `leave-grid-controller` | `GridState/NPCController.js:65` | `{ gridId }` | `leaveGrid()` — never called | **DELETE (dead)** |
| E9 | `update-NPCsInGrid-NPCs` | `GridState/GridStateNPCs.js:179` (every NPC step), `:398` (addNPC), `:472` (updateNPC), `:578` (saveGridStateNPCs — dead caller, and wrong flat shape the server rejects) | `{ [gridId]: { npcs:{[npcId]: npc}, NPCsInGridLastUpdated }, emitterId }` | NPC AI tick (controller), spawn, state/hp change, combat | **DELETE**. Relayed as `sync-NPCs` (`game-server/server.js:429-450`). |
| E10 | `remove-NPC` | `GridState/GridStateNPCs.js:522` | `{ gridId, npcId, emitterId }` | NPC death / despawn | **DELETE** |
| E11 | `npc-moved` | `GameFeatures/NPCs/AllNPCsShared.js:296` | `{ gridId, npcId, newPosition, emitterId }` | 1200 ms after every NPC `moveOneTile` | **DELETE**. Relayed as `npc-moved-sync`. Note E9 is *also* emitted for the same step at `GridStateNPCs.js:179`, so each NPC step = 2 socket messages. |
| E12 | `update-NPCsInGrid-PCs` | `GridState/PlayersInGrid.js:566` (updatePC: every player step, every hp/stat change); `:360` (addPlayer — **flat shape, server rejects it**, `game-server/server.js:396-409`) | `{ [gridId]: { pcs:{[playerId]: fullPC}, playersInGridLastUpdated }, emitterId }` | keyboard move, zoom-click move (`App.js:3306`), revive (`App.js:1995`), eat/heal/stat mods | **DELETE** |
| E13 | `request-current-grid-players` | `GridState/PlayersInGrid.js:229`; `GameFeatures/Social/SocialPanel.js:203` | `{ gridId }` | after every `initializePlayersInGrid`; dev remove | **DELETE (dead on wire)** |
| E14 | `player-left-grid` | `Utils/GridManagement.js:206` | `{ gridId, playerId, username }` | transition | **DELETE** |
| E15 | `leave-grid` | `Utils/GridManagement.js:211` (string gridId — correct); `GameFeatures/Social/SocialPanel.js:194` (**object — server does `socket.leave(object)`, no-op**, `game-server/server.js:249`) | `gridId` | transition; dev remove | **DELETE** |
| E16 | `player-moved` | `Utils/GridManagement.js:500` | `{ gridId, playerId, position, username }` | signpost placement after transition | **DELETE (dead on wire)** |
| E17 | `update-resource` | `Utils/GridManagement.js:54` | `{ gridId, updatedResources:[resource or {x,y,type:null}] }` | every `updateGridResource(..., broadcast=true)` (12 call sites, see §4.3) | **DELETE**. Relayed as `resource-sync`. |
| E18 | `update-tile` | `Utils/GridManagement.js:93` | `{ gridId, updatedTiles:[{x,y,type}] }` | terraform (`GameFeatures/Farming/Farming.js:344`) | **DELETE**. Relayed as `tile-sync`. |
| E19 | `player-connected` | `socketManager.js:724` | `{ playerId, gridId }` | socket `connect` | **DELETE (dead on wire** — server only *emits* this name, `game-server/server.js:222`) |
| E20 | `player-disconnected` | `socketManager.js:731` | `{ playerId, gridId }` | socket `disconnect` (emitted while disconnected → buffered, sent on reconnect) | **DELETE (dead on wire)** |
| E21 | `request-connected-players` | `socketManager.js:751` | `{ gridId }` | every PlayerConnectedAndDisconnected effect run | **DELETE** (server replies `connected-players`, `game-server/server.js:147-151`) |
| E22 | `join-chat-rooms` | `GameFeatures/Chat/Chat.js:21` | `{ gridId:null, settlementId:null, frontierId }` | Chat panel mount | **KEEP** |
| E23 | `send-chat-message` | `socketManager.js:814` via `emitChatMessage` (`Chat.js:85`) | `{ playerId, username, message, scope:'frontier', scopeId, emitterId }` | user sends | **KEEP** |
| E24 | `chat-badge-update` | `socketManager.js:804` | `{ playerId:null, username:null, hasUpdate:true }` | inside the *receive* handler, re-broadcast attempt | **DELETE (dead on wire** — server has no `on('chat-badge-update')`; it emits that name itself at `game-server/server.js:373,379`) |
| E25 | `socket.connect()` | `App.js:1522` | — | init (autoConnect:false at `socketManager.js:12-15`) | **KEEP** |

### 1.2 Client LISTENS

| # | Event | Where (file:line) | Handler effect on local state | Verdict |
|---|---|---|---|---|
| L1 | `connect` | `App.js:1399` (re-emit join-player-room, broken string arg); `socketManager.js:734` (`setIsSocketConnected(true)`, re-emit join-grid/join-player-room/set-username/player-connected); `GridState/NPCController.js:34` (log) | connection state; room rejoin | **KEEP** the player-room rejoin + connected flag; **DELETE** grid rejoin. `isSocketConnected` state (`App.js:1361`) is set but never read. |
| L2 | `disconnect` | `socketManager.js:735`; `NPCController.js:38` | `setIsSocketConnected(false)`; emits E20 | **KEEP** (trim) |
| L3 | `player-joined-sync` | `socketManager.js:192` (handler :24-88) | `playersInGridManager.updatePCLocal` + `setPlayersInGrid` insert/overwrite other PC if newer | **DELETE** |
| L4 | `player-left-sync` | `socketManager.js:193` (handler :90-148) | `playersInGridManager.removePC(gridId, otherPlayerId)` → **also POSTs `/api/remove-single-pc` for the other player** (`PlayersInGrid.js:645`); removes from React; clears `controllerUsername` if they were controller | **DELETE** |
| L5 | `current-grid-players` | `socketManager.js:194` (handler :150-189) | full replace of `playersInGrid[gridId].pcs` from the server's Grid doc; clears controller if not in list | **DELETE** |
| L6 | `sync-PCs` | `socketManager.js:335` (handler :212-332) | skip if own player or own emitterId; timestamp-gated merge of one other PC; floating "- N HP" text; `setConnectedPlayers` add; `animateRemotePC`; `playersInGridManager.updatePC` (which re-emits E12 — see §8.2) | **DELETE** |
| L7 | `sync-NPCs` | `socketManager.js:521` (handler :349-440) | rehydrate `new NPC(...)` per incoming NPC into React `NPCsInGrid` AND live `NPCsInGridManager.NPCsInGrid`; null → delete; floating damage text | **DELETE** |
| L8 | `npc-moved-sync` | `socketManager.js:522` (handler :443-500) | `animateRemotePC(npcId, …, 30)`, set position in React + live map | **DELETE** |
| L9 | `remove-NPC` | `socketManager.js:523` (handler :503-518) | delete from React + live map | **DELETE** |
| L10 | `resource-sync` | `socketManager.js:618` (handler :544-615) | `setResources`: remove (`type:null` + collect VFX) or enrich-from-master + replace; rebuilds *all* shadow tiles (duplicate of `AppInit.js:56-77`) | **DELETE** |
| L11 | `tile-sync` | `socketManager.js:651` (handler :635-648) | `setTileTypes(mergeTiles(prev, updatedTiles))` | **DELETE** |
| L12 | `npc-controller-update` | `socketManager.js:671` → `setControllerUsername`; `NPCController.js:23-31` → `controlledGrids` map + forced immediate `npc.update()` pass | the real election signal | **DELETE** |
| L13 | `npc-controller-assigned` / `npc-controller-revoked` | `socketManager.js:675,679`; `NPCController.js:12,17` | log / map set | **DELETE (dead on wire)** |
| L14 | `join-grid-controller-response` | `NPCController.js:43` | log | **DELETE (dead)** |
| L15 | `force-refresh` | `socketManager.js:697` | `window.location.reload()` | **DECIDE** — never emitted by the server today; a server-push "reload now" is a legitimate small-case socket use post-refactor. |
| L16 | `player-connected` / `player-disconnected` / `connected-players` | `socketManager.js:772-775` | `connectedPlayers` Set (`App.js:1362`) → PC opacity in `Render/PixiRenderer/PixiRendererPCs.js:335,346`, base-panel 📡 (`App.js:3888`) | **DELETE** |
| L17 | `receive-chat-message` | `socketManager.js:806` (App-level, `setChatMessages` keyed by scopeId + dead E24); `GameFeatures/Chat/Chat.js:39` (component-level, frontier only) | chat state | **KEEP**, but dedupe: `Chat.js:51` calls `socket.off('receive-chat-message')` with no handler, which removes the App-level listener too. |
| L18 | `mailbox-badge-update`, `store-badge-update`, `chat-badge-update` | `socketManager.js:849-851` | `updateBadge(...)` if playerId/username matches (chat matches everyone) | **KEEP**. Server emits `mailbox-badge-update` from `game-server/utils/messageUtils.js:40-41` and `server.js:204`; never emits `store-badge-update` today. Registered **three times** (`App.js:1834, 2121, 2671`). |

### 1.3 Wire mismatches (confirmed by grepping `game-server/`)

- Client emits, server never listens: `request-npc-controller`, `relinquish-npc-controller`, `join-grid-controller`, `leave-grid-controller`, `player-moved`, `request-current-grid-players`, `player-connected`, `player-disconnected`, `chat-badge-update`.
- Client listens, server never emits: `npc-controller-assigned`, `npc-controller-revoked`, `join-grid-controller-response`, `force-refresh`, `store-badge-update`.
- Server listens, client never emits: `update-mailbox-badge` (`game-server/server.js:198`).
- Shape mismatches that silently no-op: `App.js:1396` (`join-player-room` with a string), `SocialPanel.js:194` (`leave-grid` with an object), `PlayersInGrid.js:360` and `GridStateNPCs.js:578` (flat payloads to handlers that expect `{[gridId]: {...}}`).
- `App.js:43` imports `socketListenForStoreBadgeUpdates`, which `socketManager.js` does not export (undefined import, unused).

---

## 2. NPC controller, end to end

### 2.1 Election (server-side)
- On `join-grid` (`game-server/server.js:231-245`): if `gridControllers` has no entry for the grid, the joining socket becomes controller and `npc-controller-update {gridId, controllerUsername: socket.username}` is broadcast to the room; otherwise the joiner alone is told the current controller.
- `socket.username` is set by `set-username` (`server.js:310-326`), which the client sends *after* `join-grid` (`App.js:1537` then `:1572`), so the first broadcast can carry `undefined`; the `set-username` handler re-broadcasts with the real name.
- On `leave-grid` (`server.js:259-279`) or `disconnect` (`server.js:154-178`): if the leaver was controller, the next socket in the room (Set iteration order) becomes controller; if the room is empty the entry is deleted and `controllerUsername: null` is broadcast.

### 2.2 Client-side gate
- `controllerUsername` React state: `App.js:1360`, set by `socketListenForNPCControllerStatus` (`socketManager.js:671-673`), cleared by `socketManager.js:137,186`, `SocialPanel.js:186,270`.
- **The only functional gate is `App.js:2265`:** `const isController = controllerUsername === currentPlayer?.username;` inside the 1 s NPC loop (`App.js:2259-2299`).
- `GridState/NPCController.js` keeps a parallel `controlledGrids` Map from the same `npc-controller-update` event (`:23-31`) and force-runs one `npc.update()` pass on assignment (`:77-85`). Its `isControllingGrid()` is read exactly once, for a `console.log` (`socketManager.js:373-374`). `joinGrid`/`leaveGrid` are never called.

### 2.3 What the controller does that others don't
- **NPC AI tick**: `App.js:2268-2282` calls `npc.update(Date.now(), NPCsInGrid[gridId], gridId, activeTileSize)` per NPC per second → `AllNPCsShared.js:58-66` throttles per `updateInterval` (default 1000 ms) → `processState` (`:68-115`) dispatches by `action` (graze/quest/trade/worker/heal/attack/spawn).
- **Movement**: `moveOneTile` (`AllNPCsShared.js:252-307`) → `NPCsInGridManager.updateNPCPosition` (`GridStateNPCs.js:151-194`: in-memory + queue for batch + emit E9 + React setState) and, 1200 ms later, emit E11.
- **State/hp changes**: `NPCsInGridManager.updateNPC` (`GridStateNPCs.js:405-487`): `Object.assign`, **immediate** `POST /api/save-single-npc`, emit E9, React setState.
- **Spawning**: spawner behaviour → `spawnNPC` (`GridStateNPCs.js:285-357`): `GET /api/resources` (full master list, every spawn), `addNPC` → `POST /api/save-single-npc` + emit E9.
- **Despawn/kill**: `removeNPC` (`GridStateNPCs.js:493-529`): `POST /api/remove-single-npc` + emit E10.
- After the per-NPC updates the loop calls `setAllNPCs` (`App.js:2286-2288`) to force a React re-render.
- Non-controllers only mirror via L7/L8/L9. **But NPC writes are not controller-gated elsewhere**: any player attacking an NPC calls `updateNPC`/`removeNPC` directly (`GameFeatures/Combat/Combat.js:106,117`), so today two clients can both write the same NPC doc.

### 2.4 Persistence of NPC state (routes + frequency)
| Route | Where | Frequency |
|---|---|---|
| `GET /api/load-grid-state/:gridId` | `GridStateNPCs.js:212` | once per grid entry (plus 3 more times by other callers, §4.2) |
| `POST /api/batch-update-npc-positions` `{gridId, updates:{npcId:{x,y}}, timestamp}` | `GridStateNPCs.js:91` (timer), `:131` (grid leave) | every **10 s** if any NPC moved (`:23,36-38`); forced on leave (`GridManagement.js:187`) |
| `POST /api/save-single-npc` | `GridStateNPCs.js:378` (add), `:452` (update) | **immediately on every state/hp change and every spawn** (unbatched) |
| `POST /api/remove-single-npc` | `GridStateNPCs.js:512` | per kill/despawn |
| `POST /api/save-grid-state-npcs` | `GridStateNPCs.js:572` | never (`saveGridStateNPCs` has no callers) |
| `GET /api/resources` | `GridStateNPCs.js:295` | every spawn (should use cached `loadMasterResources`, as `:226` does) |

### 2.5 When the controller leaves
Server reassigns (§2.1). The new controller's `App.js:2265` flips on the next 1 s tick and it starts ticking from whatever NPC state it last mirrored via L7/L8 plus the DB. Pending position batches on the leaver are flushed at `GridManagement.js:186-189`. If the room empties, `controllerUsername` becomes null and NPCs freeze until someone joins — which is exactly the per-player-grid steady state.

### 2.6 Exact code that becomes "every client is always its own controller"
- `App.js:2265` → `const isController = true;` (or delete the branch).
- Delete: `GridState/NPCController.js` (whole file), `socketListenForNPCControllerStatus` (`socketManager.js:660-689`) and its effect (`App.js:2647-2650`), `controllerUsername` state (`App.js:1360`) and props (`App.js:4856-4857`, `SocialPanel.js:31-32,180-211,266-278`), the inactivity relinquish branch (`App.js:3386-3391`), controller-clearing in `socketManager.js:134-138,181-188`, base-panel display (`App.js:3896-3900`), emits E5/E6/E7/E8, and the `npcController` param of `socketListenForNPCStateChanges` (`socketManager.js:345,373`).
- `GridStateNPCs.startGridTimer/stopGridTimer` (`:592-621`) is an already-written, controller-free 1 s NPC tick with no callers (except `stopGridTimer` at `GridManagement.js:193`). It could replace the App.js loop, but it passes only `(now, NPCsInGrid)` whereas `App.js:2281` passes `(now, NPCsInGrid[gridId], gridId, TILE_SIZE)`; `processState` needs `gridId`.

---

## 3. GridStateNPCs and PlayersInGrid

### 3.1 GridStateNPCs (`GridState/GridStateNPCs.js`)
- **Memory**: `this.NPCsInGrid[gridId] = { npcs: {[npcId]: NPC instance}, NPCsInGridLastUpdated, lastUpdated }` (`:20,251`). React mirror via `setGridStateReact` registered at `App.js:1009` (`GridStateContext.js` holds `{[gridId]: {npcs, NPCsInGridLastUpdated}}`). Note `GridStateContext.js:9-14` `setGridStateExternally` and `GridStateNPCs.js:8,196-198` `externalSetGridState` are two unused parallel registrations; the live one is `registerSetGridState` at `:641-643` (defined twice, `:196` and `:641`; the second wins).
- **NPC instance shape** (`AllNPCsShared.js:23-48`): `id, type, position{x,y}, symbol, hp, maxhp, output, range, action, state, speed, growTime, nextspawn, grazeEnd, lastUpdated, gridId, updateInterval` plus every master-template field via `Object.assign`. Dehydrated save shape (`GridStateNPCs.js:429-448`): `id,type,position,state,hp,maxhp,grazeEnd,lastUpdated,action,gridId` (+ `requires,qtycollected,range,nextspawn` for spawners).
- **Pending**: `pendingPositionUpdates: Map<gridId, Map<npcId,{position,timestamp}>>` (`:21`), flushed every 10 s (`:36-38`) and on grid leave.
- **Timers**: batch-save `setInterval` started in the constructor for every client (`:27,36`), controller or not; `gridTimer` (unused).
- **Routes**: §2.4.
- **Survives?** Yes — this is the natural single-player NPC store. Keep: the map, hydration (`:203-268`), `spawnNPC/addNPC/updateNPC/updateNPCPosition/removeNPC`, the position batch queue. Remove: every `socket.emit` block (`:171-180, 389-399, 463-473, 521-528, 576-583`), `saveGridStateNPCs`, the dead timestamp exports (`:10-16`), `externalSetGridState`. Reconsider: `save-single-npc` on *every* state change is the "transactional moment" the refactor wants to narrow (kill, spawn, graze-complete yes; idle→roam no).

### 3.2 PlayersInGrid (`GridState/PlayersInGrid.js`)
- **Memory**: `this.playersInGrid[gridId] = { pcs: {[playerId]: pc}, playersInGridLastUpdated }` (`:9,178`). React mirror via `registerSetPlayersInGrid` (`App.js:1015`, `GridStatePCContext.js`).
- **PC shape** (`:387-403, 485-501`): `playerId, username, type:'pc', icon, position{x,y}, hp, maxhp, armorclass, attackbonus, damage, attackrange, speed, iscamping, isinboat, lastUpdated`. `addPlayer` (`:266-368`) derives the combat stats from `baseX` + equipped-power modifiers; `addPC`/`updatePCLocal` take them as given with `?? 25/10/0/1` fallbacks.
- **Pending**: `pendingUpdates[`${gridId}-${playerId}`] = {gridId, playerId, pc, lastUpdated}` (`:10,595-601`) — overwritten per key, so only the latest full PC object survives. Flushed every **5 s** (`:12,33-35`) to `POST /api/batch-update-pc-positions` (`:71`; `:129` on grid leave; `:212` synchronous XHR on `beforeunload`).
- **Routes**: `GET /api/load-grid-state` (`:156`), `POST /api/save-single-pc` (`:347,437`; also `GridManagement.js:493`), `POST /api/remove-single-pc` (`:645`; also `GridManagement.js:556`, `SocialPanel.js:165`), `POST /api/batch-update-pc-positions`.
- **Socket**: E12 at `:360,566`; E13 at `:229`.
- **Survives?** Partially. ~40 call sites read `getPlayersInGrid(gridId)?.[myId]` or `getAllPCs(gridId)?.[myId]` (Combat, CombatPanel, Eating, Transit, NPCsPanel, PlayerPanel, FarmHand, ScrollStation, ShopStation, ChangeIcon, ProfilePanel, InventoryManagement, SkillPowerManagement, playerManagement, ResourceHelpers, BuildAndBuy, Mailbox import). The *contract* "my in-grid combat record keyed by gridId/playerId" should survive so those call sites don't churn; the multi-PC map, `addPlayer` vs `addPC` vs `updatePCLocal` triplication, `setAllPCs`, `removePC`-of-others, and the socket emits should go. Position persistence (needed at `App.js:1609-1615` on reload) can drop from 5 s to leave/unload/slow heartbeat.

---

## 4. GridManagement.js: grid load, decode, push, cache

### 4.1 Initial load (App init, `App.js:1521-1604`)
1. `socket.connect()`; wait; emit E1, E2, E3, E4, E5.
2. `initializeGrid` (`AppInit.js:13-125`) → `fetchGridData` (`GridManagement.js:679-702`) → **`GET /api/load-grid/:gridId`** returns `{ tiles, resources, gridType, _id, ownerId, playersInGrid, NPCsInGrid, region }`. `fetchGridData` builds a combined `{pcs,npcs}` that `initializeGrid` ignores.
3. **Decode**: `tiles` is a 2-D array of one-character type codes (`'g','w','l','p','s','x',...`; see `Farming.js:301-315`, lava check `App.js:2335`), used as-is: `tileTypes[y][x]`. Passability = `masterResources.find(r => r.type === code).passable` (`PlayerMovement.js:577-579`). `resources` is a flat list `{type,x,y,growEnd?,craftEnd?,craftedItem?,stationLevel?,slots?}`; each is enriched by spreading the master template *under* the raw record (`AppInit.js:42-47`), and multi-tile resources get synthetic `{type:'shadow', x, y, parentAnchorKey, passable}` entries (`AppInit.js:56-77`; duplicated at `socketManager.js:589-610`).
4. State written three ways: `setGrid`, `setResources`, `setTileTypes` (React) and `GlobalGridStateTilesAndResources.setTiles/setResources` (module singleton, `GridState/GlobalGridStateTilesAndResources.js`) — the latter is what movement/combat/NPC code reads.
5. `farmState.initializeAndProcessCompleted` + `startSeedTimer` (`AppInit.js:91-97`); ambient VFX + music.
6. `NPCsInGridManager.initializeGridState` → **`GET /api/load-grid-state`**; `playersInGridManager.initializePlayersInGrid` → **`GET /api/load-grid-state`** again + E13.

### 4.2 Grid transition (`changePlayerLocation`, `GridManagement.js:105-674`), in order
| Step | Call | Line |
|---|---|---|
| 1 | `GET /api/load-grid-state/{from}` (only to read own PC, which is already in memory) | :181 |
| 2 | `POST batch-update-npc-positions` + `POST batch-update-pc-positions` (flush) | :186-189 |
| 3 | stop NPC timer, PC batch, farm timer, VFX, sound | :193-197 |
| 4 | `POST /api/remove-single-pc` (own PC from `from`) | :203 |
| 5 | emit E14 `player-left-grid`, E15 `leave-grid` | :206-211 |
| 6 | `GET /api/load-grid-state/{to}` | :218 |
| 7 | `GET /api/load-grid/{to}` (validation only; tiles/resources discarded) | :221 |
| 8 | emit E1 `join-grid` | :277 |
| 9 | `POST /api/save-single-pc` (addPC into `to`) | :289 |
| 10 | `POST /api/update-player-location` | :290 |
| 11 | `initializeGrid` → **`GET /api/load-grid/{to}` again** | :327 → `AppInit.js:30` |
| 12 | SVG preload | :338 |
| 13 | `initializeGridState` → **`GET load-grid-state/{to}` again**; `initializePlayersInGrid` → **`GET load-grid-state/{to}` a third time** + E13 | :402-403 |
| 14 | if missing, `addPC` again (`POST save-single-pc`) | :413 |
| 15 | signpost: `updatePC` (E12) + `POST save-single-pc` + E16 | :491-505 |
| 16 | if dead: `POST remove-single-pc` again | :556 |
| 17 | emit E4, E5, E2 | :567-588 |
| 18 | `POST /api/mark-grid-visited` (first visit only) | :634 |

Net: 9-11 HTTP round-trips and 6 socket emits per transition; `load-grid` fetched twice and `load-grid-state` three times for the destination. For per-player grid copies, the sensible shape is one `GET /api/grid-bundle/{to}` returning tiles+resources+npcs+myPC, one `POST /api/enter-grid` that atomically moves the player, and nothing else.

### 4.3 Pushing changes
- **Resources**: `updateGridResource(gridId, resource, broadcast=true)` (`GridManagement.js:22-65`): `PATCH /api/update-grid/:gridId` with `{resource:{type,x,y,growEnd?,craftEnd?,craftedItem?,stationLevel?,slots?}, broadcast}`, then emit E17 (`type:null` = removal). Callers: `ResourceClicking.js:449,621,758,820`; `FarmState.js:96,217,297`; `Utils/ProtectedSelling.js:88`; `GameFeatures/BuildAndBuy.js:262`; `GameFeatures/Combat/Combat.js:170`; `GameFeatures/Farming/Farming.js:172`; `GameFeatures/Farming/CropPanel.js:101`. Local React state is updated by each caller separately, not here.
- **Tiles**: `convertTileType` (`:68-103`): `PATCH /api/update-tile/:gridId {x,y,newType}`, then optimistic `setTileTypes(mergeTiles(...))`, then emit E18. Single caller `Farming.js:344` (which already updated the global singleton optimistically at `:333-339`).
- **Caching**: none. Nothing is retained across grid visits; `GlobalGridStateTilesAndResources` holds only the current grid. Resource `lastUpdated` timestamps are not tracked on the client; the grid is re-fetched wholesale on every entry.

### 4.4 Other helpers
- `getLineOfSightTiles`/`isWallBlocking` (`:747-827`) — pure, keep (NPCEnemyBehavior.js:8 has its own copy of `getLineOfSightTiles`).
- `updateGridStatus` (`:708-744`) — `fetchHomesteadOwner` HTTP on homestead entry; keep.
- `ResourceHelpers.js`: `mergeTiles` (used by L11 and `convertTileType`), `mergeResources` (no callers), `enrichResourceFromMaster` (L10 + BuildAndBuy), `validateTileType` (no callers), `getCurrentTileCoordinates` (Farming/BuildAndBuy).

---

## 5. PlayerMovement.js

- Input: `handleKeyDown` (`:75-146`) tracks pressed keys, 20 ms collect window (`:27`), 60 ms cooldown (`:35`) → max ~16 steps/s. Diagonals clamp to ±1.
- Validation is **entirely client-side** (`isValidMove` `:277-349`, `isTileValidForPlayer` `:552-624`): bounds (0..63, out-of-bounds → `handleTransitSignpost` → full `changePlayerLocation`), tile passable via masterResources, resource passable (doors via `canPassThroughDoor`), impassable NPC. **Other PCs are not collision-checked** (players can overlap).
- Commit (`:267-270`): `playersInGridManager.updatePC(gridId, playerId, {position, lastUpdated})` → `PlayersInGrid.js:525-607`: emit E12 **immediately with the full PC object** (`:557-567`), `animateRemotePC` for the local player too (`:569-578`), React setState, queue for the 5 s batch.
- **Per-step network cost**: 1 socket message of roughly 450-600 bytes (gridId key + 15-field PC + timestamps + emitterId). HTTP: at most one `POST batch-update-pc-positions` per 5 s regardless of step count (dedup by key), carrying the full PC object. The server is never asked to validate a step and `/api/update-player-location` is only hit on grid change (`GridManagement.js:290`).
- Camera helpers: `centerCameraOnPlayer` (used), `centerCameraOnPlayerFast`/`Settlement`/`Frontier` (`:419-550`, no callers), `centerCameraOnPlayerInstant` (`:651-675`, only reachable via `registerCurrentPlayerForCamera` whose callback `PlayersInGrid.onCurrentPlayerMove` is never invoked).

---

## 6. Every periodic loop (read files + App.js)

| # | Where | Interval | Purpose | Network? | Post-refactor |
|---|---|---|---|---|---|
| T1 | `GridState/GridStateNPCs.js:36` | 10 s | flush NPC position batch | `POST batch-update-npc-positions` when non-empty | keep, slow down / flush on leave only |
| T2 | `GridState/PlayersInGrid.js:33` | 5 s | flush own PC position/stats | `POST batch-update-pc-positions` when non-empty | keep at 30-60 s or leave/unload only |
| T3 | `App.js:2259` | 1 s | NPC AI tick (controller only) | indirectly: `save-single-npc` per state change, `npc-moved` + `update-NPCsInGrid-NPCs` per step | keep tick; drop emits; narrow saves |
| T4 | `App.js:2310` | 1 s | death check + lava damage (mutates `playersInGrid[...].hp` in place, bypassing `updatePC`) | none directly | keep (local) |
| T5 | `App.js:2367` | 10 s | homestead passive heal (same in-place mutation) | none | keep (local) |
| T6 | `App.js:349` | 2 s | "server reachable" check — the ping is commented out (`:329`), so it is a no-op try block | none today | delete |
| T7 | `App.js:2426` | 60 s | `fetchTimersData` → `GET /api/get-frontier/:id` | yes | keep but could be push via socket (`force-refresh`-style) |
| T8 | `App.js:2512` | 1 s | countdown string formatting | none | keep |
| T9 | `App.js:2596` | 1 s | phase-transition check; `fetchTimersData` when a phase ends | occasional GET | keep |
| T10 | `App.js:3416` | 60 s | inactivity → relinquish controller (dead emit) / 20-min refresh modal | emit E6 (dead) | delete relinquish branch |
| T11 | `FarmState.js:175` | (interval not shown; seed growth) | convert grown seeds → `updateGridResource` ×N | `PATCH update-grid` per conversion, max 5/tick | keep; becomes local-authoritative + one batched save |
| T12 | `GridState/GridStateNPCs.js:595` `gridTimer` | 1 s | unused NPC tick | — | candidate replacement for T3 |
| T13 | `UI/Modals/TownNews.js:83` | **1 s** | `GET settlement` + `GET get-frontier` **every second while the modal is open** | yes, 2 GETs/s | reduce to once on open |

Other `setInterval`s found repo-wide are UI countdowns in panels (Courthouse, Bank, Kent, Outpost, Train, Carnival, Seasons, Crafting, FarmHouse, Pets, FarmAnimals, CombatPanel, CropPanel, ScrollStation, ProgressModal, CreateAccount, FTUE doinkers, AmbientVFX, SoundManager fades, debug.js) and are not server-facing except `FarmAnimals.js:57` (reads NPC state locally) — not audited line-by-line.

---

## 7. Everything that assumes other PCs may be present

- **Rendering**: `Render/PixiRenderer/PixiRendererPCs.js:318-380` iterates all `pcs`, computes `isCurrentPlayer`, dims non-connected PCs to alpha 0.4 via `connectedPlayers` (`:335,346`), hides others only in the FTUE cave (`:330`). `PixiRenderer.js:310,1616` threads `connectedPlayers`. Legacy DOM/canvas renderers (`Render/RenderPCs.js`, `RenderPCsDOM.js`, `PCComponent.js:113,148,154,198`, `RenderDynamicNew.js:338`) are mostly commented out but `PCComponent.js` still has `other-player` class and hover tooltip for non-current players.
- **Click → SocialPanel**: `App.js:1351-1354 handlePCClick`, `:3955 onPCClick`; `GameFeatures/Social/SocialPanel.js:46-100` fetches `GET /api/player/:id` for *other* players and shows their level/XP/HopeQuest (`:302-356`); dev-only "Remove from GridState" (`:137-224`) and "Send Home" (`:227-290`, `POST /api/send-player-home`).
- **Connected list UI**: base panel lists every PC in the grid with 📡 for connected (`App.js:3880-3901`) and the controller name.
- **NPC AI targets any PC**: `GameFeatures/NPCs/NPCEnemyBehavior.js:102,181,359,378` (`findClosestPC`/`findClosestVisiblePC` over all PCs, target switching `:181-189`), `NPCSpawnerBehavior.js:15-26` (spawn when *any* PC in range), `NPCQuestBehavior.js:32`, `NPCHealBehavior.js:32` (any PC in range).
- **State handlers**: L3-L6, L16 (§1.2); `PlayersInGrid.updatePCLocal/setAllPCs/removePC(other)`; `socketManager.js:259-263, 406-409` floating damage text for *remote* HP drops.
- **Grid transition**: `GridManagement.js:182,229` reads `fromPCs`/`toPCs` from the grid doc (`toPCs` is unused).
- **Combat**: `Combat.js` only attacks NPCs (`handleAttackOnNPC`); there is no PC-vs-PC attack path. Movement does not collide with PCs (§5).
- **Dungeon reset teleport** (`App.js:2565-2575`) is per-player already.

---

## 8. Dead and duplicated code

### 8.1 Live bugs worth knowing before refactoring
- **Listener accumulation**: `App.js:2621-2623, 2626-2629, 2632-2635, 2638-2640, 2643-2645, 2648-2650, 2653-2655, 2657-2660` call `socketListenFor*` but never `return` the cleanup those functions hand back. Every time `currentPlayer` (or `gridId`) changes, a fresh closure is `socket.on`'d and the old one stays. Only `:2664, 2671, 2678` return cleanup. Effect: N copies of `sync-PCs`/`sync-NPCs`/`resource-sync`/`tile-sync` handlers run per event, and `set-username` is emitted on each re-run.
- **`socket.off(event)` without a handler** (`socketManager.js:684-686, 703, 854-856`; `Chat.js:51`) removes *every* listener for that event, including the ones in `NPCController.js` and the App-level chat listener. Closing the Chat panel kills App's `receive-chat-message` handler.
- **`updatePC` on a remote PC re-emits**: L6 calls `playersInGridManager.updatePC(gridId, otherPlayerId, incomingPC)` (`socketManager.js:308`), which emits E12 for the *other* player's state and queues it into this client's batch → `POST batch-update-pc-positions` for a PC this client doesn't own (`PlayersInGrid.js:594-601`). Combined with L4's `removePC` → `POST remove-single-pc` for others, non-owners write other players' records.
- **In-place HP mutation** bypassing the manager: `App.js:2337, 2376` mutate React state objects directly.
- `App.js:1396` emits `join-player-room` with a bare string; server destructures `{playerId}` → room never joined from that path.
- `SocialPanel.js:194` emits `leave-grid` with an object; server calls `socket.leave(object)`.
- `App.js:43` imports non-existent `socketListenForStoreBadgeUpdates`.
- `socketListenForBadgeUpdates` registered three times (`App.js:1834, 2121, 2671`).

### 8.2 Dead code (no callers, or no wire counterpart)
- `GridState/NPCController.js`: `joinGrid`, `leaveGrid`, `retryTimeout`, and the listeners for `npc-controller-assigned/revoked`, `join-grid-controller-response`. Only `isControllingGrid` is called, for a log.
- `GridStateNPCs.js`: `saveGridStateNPCs` (`:535-587`), `startGridTimer`/`gridTimer` (`:7, 592-613`; `stopGridTimer` is called but the timer never starts), `stopGridStateUpdates`' `this.updateInterval` (`:625-629`, never set), `updateLastGridStateTimestamp`/`getLastGridStateTimestamp` (`:10-16`), `externalSetGridState` + first `registerSetGridState` (`:8, 196-198`), the `export const { ... } = NPCsInGridManager` destructure (`:675-686`) which detaches methods from `this` (only `initializeGridState` style named imports would break; nothing imports them).
- `GridStateContext.js:9-14` `setGridStateExternally`.
- `PlayersInGrid.js`: `forceSavePendingUpdates` (`:103`), `onCurrentPlayerMove`/`registerCurrentPlayer` callback never invoked (`:13-14, 24-27`), `getAllPCs` vs `getPlayersInGrid` (identical semantics, both used).
- `PlayerMovement.js`: `centerCameraOnPlayerFast`, `centerCameraOnPlayerSettlement`, `centerCameraOnPlayerFrontier` (`:419-550`), `centerCameraOnPlayerInstant` (`:651-675`, acknowledged unused in its own comment), `window.debugMovementKeys/resetMovementKeys` (debug), `localPlayerMoveTimestampRef` is written (`:263-265`) but never read by any handler.
- `ResourceHelpers.js`: `mergeResources` (`:22-63`), `validateTileType` (`:141-151`), commented `getTileResource`.
- `GridManagement.js`: `fetchGridData`'s combined `NPCsInGrid` (`:690-696`) is computed and ignored; `rollbackState` (`:161-166`) and `toPCs` (`:229`) are built and never used; `updateGridResource`'s `broadcast` flag only ever true except via default.
- `socketManager.js`: `clearChatBadge` (`:861-864`, no callers), the HP-debug loop at `:154-158` (empty body), `handleNPCMoveSync`'s "rehydrate" branch (NPCs in React state are already instances after L7).
- `App.js:1361 isSocketConnected` set, never read.
- `Utils/GridStateDebug.js` — only used from `Utils/debug.js:1423`; fine as dev tooling.
- Server side (for completeness): `update-mailbox-badge` handler (`game-server/server.js:198-205`) has no client emitter.

### 8.3 Duplicated code
- Shadow-tile generation: `AppInit.js:56-77` ≡ `socketManager.js:589-610`.
- NPC rehydration `new NPC(id,type,position,props,gridId)`: `GridStateNPCs.js:237-243`, `socketManager.js:414-420, 463-471`.
- PC-record construction with the same 15 fields and `?? 25/10/0/1` fallbacks: `PlayersInGrid.js:325-341 (addPlayer)`, `:387-403 (addPC)`, `:485-501 (updatePCLocal)`, `App.js:1542-1561`, `GridManagement.js:236-252`.
- "Update React + live map" setState blocks repeated in `GridStateNPCs.js` (`:184-193, 253-261, 477-486, 658-667`) and `PlayersInGrid.js` (`:180-186, 258-263, 408-419, 506-517, 581-592, 628-641`).
- Camera-centering retry loop: `PlayerMovement.js:352-416` ≡ `App.js:1644-1700`.
- Batch flush: `GridStateNPCs.js:74-113` vs `:119-145`; `PlayersInGrid.js:50-100` vs `:108-143` vs the `beforeunload` XHR `:195-221`.
- Grid-leave cleanup appears in both `GridManagement.js:191-199` and `App.js:3320-3334 handleLogout`.
- `getLineOfSightTiles`: `GridManagement.js:747` and `NPCEnemyBehavior.js:8`.
- Direction tables: `AllNPCsShared.js:258-267` ≡ `:310-319`.
- Chat listener: `socketManager.js:785-810` and `Chat.js:36-53` both subscribe to `receive-chat-message`.

---

## 9. Minimal keep-list for the socket after the refactor

`socket.connect()` / `connect` / `disconnect` (connection flag), `join-player-room` (fixed), `join-chat-rooms`, `send-chat-message`, `receive-chat-message` (one subscriber), `mailbox-badge-update`, `store-badge-update`, `chat-badge-update` (one subscriber), and optionally `force-refresh` once the server actually emits it. Everything else in `socketManager.js` (lines 17-782) can be deleted along with `GridState/NPCController.js`, and `GridStateNPCs.js`/`PlayersInGrid.js`/`GridManagement.js`/`AllNPCsShared.js` lose their `socket` imports entirely.
