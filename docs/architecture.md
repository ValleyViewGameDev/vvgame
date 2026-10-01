# Architecture (as-is, 2026-10-01)

This is the baseline the refactor starts from. For the target shape see `refactor-plan.md`.
Deep detail with `file:line` citations lives in `audits/`.

## Processes

| Process | Stack | Where | Notes |
|---|---|---|---|
| `game-server/` | Node 18+, Express 4, Mongoose 8, socket.io 4, Stripe | Render web service `vvgame-server` (`https://vvgame-server.onrender.com`) | One process does HTTP + WebSocket + all schedulers. Schedulers only run when `NODE_ENV=production`. |
| `game-client/` | React 18 (CRA / react-scripts 5), PixiJS 7 legacy, pixi-viewport, socket.io-client, axios | Render static site `vvgame-client` (`https://vvgame.onrender.com`, `www.valleyviewgame.com`, `www.secretsofelsinore.com`) | `REACT_APP_SERVER_URL` selects the API (defaults to `localhost:3001`). The socket URL is **hard-coded to production** in `src/socketManager.js:12`. |
| `game-editor/` | Vite + React 19 + Electron, zustand | Local desktop app | Authors layout JSON straight into `game-server/layouts/` via the filesystem; talks to the production API for players/grids/dungeons/tuning (`src/config.js`), except `FrontierView.jsx` which points at `localhost:3001`. |
| MongoDB Atlas | database name `test` | shared cluster with House/simgame | Collections: `players`, `grids`, `settlements`, `frontiers`, `chatmessages` (TTL 24h), `resources` (empty, legacy). |

## World model

```
Frontier (1 doc)                       timers for taxes/seasons/elections/train/carnival/bank/messages/networth/dungeon,
 └─ settlements[8][8]                  seasonlog, dungeons registry (Map gridId -> template + entrance gridIds)
     └─ Settlement (64 docs)           roles, votes, campaign promises, tax/bank/train/carnival/election logs, population
         └─ grids[8][8] cells          { gridId|null, gridCoord, gridType, available }   <- the only coord -> Grid map
             └─ Grid (lazy, 1 per cell that has been materialised)
                    tiles      base64 string, 4 bits/tile, 64x64 (2.7 KB)
                    resources  V2 encoded arrays [layoutKey, x, y, flags, ...] (15-25 KB JSON, ~40-70 KB BSON)
                    NPCsInGrid Map<id, {type, position, state, hp, maxhp, grazeEnd, ...}>
                    playersInGrid Map<playerId, {position, hp, combat stats, ...}>   <- multiplayer presence
                    ownerId    homesteads only
```

- Frontier layout (tier 1): 24 homestead settlements around a ring, 36 valley settlements inside, 4 dungeon corners. 1,512 homestead slots, 24 towns, 2,304 valley cells.
- `gridCoord` = `TTFFSSGG` parsed as an integer (leading zero lost). `gridCoord % 10000` gives settlement row/col + grid row/col, which indexes the 4,096-bit `Player.gridsVisited` bitmap.
- Grid creation reads a layout from `layouts/gridLayouts/`: homesteads from `homestead/homestead.json`, towns from `town/town<Dir>.json`, valleys from `valleyFixedCoord/<gridCoord>.json` when present (384 files) else a random layout, dungeons from `dungeon/*.json`.
- Every resource or tile write decodes the whole field, edits one cell, re-encodes, and saves the document (serialised per grid by `queue.js`).

## Player document

`Player` holds identity, location (`g`/`s`/`f`/`gridCoord`/`gtype`/`x`/`y`), inventory + backpack + skills + powers (arrays of `{type, quantity}`), quests, trophies, relationships, messages (mailbox), trade stall + requests, train state, Kent offers, settings, `gridsVisited`, homestead pointers (`gridId`, `settlementId`, `homesteadGridCoord`), and two transaction-dedupe maps. Typical size 8-15 KB. It is re-saved wholesale by many routes.

## Authority today (who decides what)

| Thing | Decided by | Persisted by | Synced to other players by |
|---|---|---|---|
| Player movement | client (`PlayerMovement.js`) | `POST /batch-update-pc-positions` every 5 s | socket `update-NPCsInGrid-PCs` on every step |
| NPC AI | the "controller" client for the grid (first socket in the room) | `POST /save-single-npc` per state change, positions batched every 10 s | socket `update-NPCsInGrid-NPCs` + `npc-moved` per step |
| Resources (harvest/plant/build) | client | `PATCH /update-grid/:gridId` (trusted, 202 before write) | socket `update-resource` |
| Tiles (terraform) | client | `PATCH /update-tile/:gridId` | socket `update-tile` |
| Inventory / XP / skills / quests / messages | client | `/update-inventory-delta`, `/addXP`, `/update-profile` (all trusted) | n/a |
| Crafting, bulk harvest, farm-animal collect, trade stall, outpost | server (idempotent `transactionId` guard + state checks) | same route | client re-broadcast |
| Timers / phases | server schedulers on `Frontier` | `Frontier.<feature>` | client polls `GET /get-frontier` every 60 s |

There is no auth middleware. `playerId` in the request body is the identity.

## Client structure

- `src/App.js` (5,034 lines, 65 `useState`, 59 `useEffect`) owns almost all state and the NPC tick loop.
- `src/Render/PixiRenderer/*` is the only live renderer (`usePixiJS = true`). `src/Render/Render*.js`, `RenderTilesCanvas*.js`, `RenderDynamic*.js`, `RenderNPCs*.js`, `RenderPCs*.js`, `NPCComponent.js`, `PCComponent.js`, `autotiling.js`, `CursorTileHighlight.js` are dead generations (DOM, Canvas, CanvasV2).
- `src/GridState/` holds the in-memory grid state: `GridStateNPCs.js` (NPC manager), `PlayersInGrid.js` (PC map), `GlobalGridStateTilesAndResources.js` (tiles/resources singleton read by movement and AI), plus React context mirrors.
- `src/GameFeatures/*` is one folder per feature (Trading, Crafting, Farming, NPCs, Combat, Government, Carnival, Transit, Dungeon, FTUE, ...). Panels talk to the server directly with axios.
- `src/Utils/GridManagement.js` `changePlayerLocation` is the single execution path for every grid change.
- Strings: `src/UI/Strings/strings<LANG>.json`, 10 languages.

## Timed features (all on `Frontier`, driven by `schedulers/mainScheduler.js`)

taxes 3 d, seasons ~90 d (+25 min off-season), elections 7 d, train 48 h, carnival 48 h, bank 8 h, daily message, networth 12 h, dungeon reset 48 h. Each feature chain re-reads the Frontier doc every 15 s regardless of `endTime`.
