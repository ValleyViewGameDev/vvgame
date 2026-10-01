# Secrets of Elsinore (vvgame): Project Memory

## What this game is

Secrets of Elsinore (formerly Valley View) is a browser farming / homestead / exploration game. The player owns a homestead in a settlement, farms, crafts, trades, befriends and fights NPCs, travels to the settlement's town and out into valleys and dungeons, and takes part in settlement-wide events: a Train that wants goods, a Carnival, elections for Mayor, taxes, a Bank, seasons with a leaderboard. Ten UI languages. Stripe sells a Gold tier.

It was built as a synchronous MMO (players shared towns, valleys and dungeons and saw each other move). **As of 2026-10-01 it is being refactored into a single-player game with asynchronous multiplayer.** The refactor plan is the governing document for all current work: `@./docs/refactor-plan.md`. Read it before touching networking, grid loading, NPCs, schedulers, or the data model.

Solo project. Scope discipline over completeness: ship the smallest version that proves the loop.

## Current status

- Last real commit before the refactor: 2026-05-06. Commit messages in this repo are historically placeholders; from now on write real ones.
- No active users for a month except **Oberon and moehong** (both in settlement `684743fab301fcbdbcb77255`). Their data must survive every migration. Other players' data is nice-to-have.
- Production DB: 11 players, ~1,060 grids (73 MB), 64 settlements, 1 frontier. Database name is `test`.
- Refactor phase: **0 (prep)**. Docs written; decisions D1-D5 confirmed 2026-10-01 (full per-player grid copies, lazy tree top-up, lazy dungeon reset, Outpost cut, read-only homestead snapshots); no code changed yet. Phase checklist lives in the plan.

## Tech stack

- Server: Node + Express 4 + Mongoose 8 + socket.io 4, `game-server/`. Single process: HTTP, WebSocket, schedulers.
- Client: React 18 (Create React App), PixiJS 7 legacy, socket.io-client, `game-client/`. **PixiJS is the only live renderer**; everything in `src/Render/` outside `PixiRenderer/` is a dead generation (DOM, Canvas, CanvasV2) scheduled for deletion.
- Editor: Vite + React 19 + Electron, `game-editor/`. Writes layout JSON straight into `game-server/layouts/` via the filesystem; uses the production API for players/grids/dungeons.
- Database: MongoDB Atlas, shared cluster with House/simgame, database `test`. Collections `players`, `grids`, `settlements`, `frontiers`, `chatmessages`.
- Payments: Stripe (Checkout). Alerts: nodemailer via Gmail.

## Deployment

- **A push to `main` is a production deploy** (Render auto-deploys both services). Work on `refactor/phase-N` branches, squash-merge when the phase's done-criteria pass. Deploy order: server first, then client. Service modes via `SERVICE_MODE` (`normal` | `notice` = dismissable update modal on every refresh | `maintenance` = blocking modal, developers get an Ignore button and bypass the 503). Only Phase 2 takes the game down (maintenance mode + Winter restart); see `docs/refactor-plan.md` §8.
- Server: Render web service `vvgame-server` → `https://vvgame-server.onrender.com`. `PORT` injected by Render; `NODE_ENV=production` enables the schedulers.
- Client: Render static site `vvgame-client` (`render.yaml`) → `https://vvgame.onrender.com`, also `https://www.valleyviewgame.com` and `https://www.secretsofelsinore.com`. CORS allowlist in `game-server/server.js`.
- Env (names only): `MONGODB_URI`, `SECRET_KEY`, `STRIPE_SECRET_KEY`, `YOUR_DOMAIN`, `ALERT_EMAIL_*`, client `REACT_APP_STRIPE_PUBLISHABLE_KEY`, `REACT_APP_SERVER_URL`.

## Running locally

| Piece | Command | Port |
|---|---|---|
| server | `cd game-server && npm run dev` (nodemon) | 3001 |
| client | `cd game-client && npm start` | 3000 |
| editor | `cd game-editor && npm run electron-dev` | 5173 |

- The local server uses the **production Atlas database** (`game-server/.env`). There is no separate dev DB. Be careful with writes; never run migrations without the backup script.
- **Never set `NODE_ENV=production` locally**: it starts the schedulers against the live Frontier (season end, taxes, elections).
- Known trap (fix in Phase 0): `game-client/src/socketManager.js:12` hard-codes the production socket URL, and `game-editor/src/config.js` points at production while `FrontierView.jsx` points at `localhost:3001`.
- Dev accounts: usernames in `game-server/tuning/developerUsernames.json` are excluded from analytics/leaderboards and get debug UI.

## Repository layout

```
vvgame/
├── CLAUDE.md                 # this file
├── docs/
│   ├── refactor-plan.md      # THE plan: goals, target architecture, decisions D1-D9, phases 0-6, migration
│   ├── architecture.md       # as-is baseline (world model, authority table, client structure)
│   ├── known-issues.md       # bugs/hazards/dead code found in the audit, independent of the refactor
│   └── audits/               # six deep read-only audits with file:line citations (2026-10-01)
├── game-server/
│   ├── server.js             # Express + socket.io + route mounting (all under /api)
│   ├── routes/               # worldRoutes (grids, crafting, dungeons), playerRoutes, gridRoutes (NPC/PC maps),
│   │                         # settlementRoutes, frontierRoutes, tradingRoutes, auth, chat, payment, schedule, analytics
│   ├── models/               # player, grid, settlement, frontier (+ dead: resource, combat, town)
│   ├── schedulers/           # mainScheduler drives taxes/seasons/elections/train/carnival/bank/messages/networth/dungeon
│   ├── utils/                # createGridLogic, resetGridLogic, TileEncoder, ResourceEncoder, Grid*Manager, seasonReset, ...
│   ├── layouts/              # gridLayouts/{homestead,town,dungeon,valleyFixedCoord,...}, settlementLayouts, frontierLayouts
│   └── tuning/               # resources.json (master resource table, 504 entries), globalTuning.json, seasons, quests, ...
├── game-client/src/
│   ├── App.js                # 5,000-line orchestrator; owns most state + the NPC tick loop (shrink it, don't grow it)
│   ├── socketManager.js      # socket client (being cut to chat + badges)
│   ├── GridState/            # NPCsInGridManager, PlayersInGrid, GlobalGridStateTilesAndResources, contexts
│   ├── Utils/GridManagement.js   # changePlayerLocation: the single execution path for every grid change
│   ├── Render/PixiRenderer/  # the live renderer
│   ├── GameFeatures/         # one folder per feature (Trading, Crafting, Farming, NPCs, Combat, Government, ...)
│   └── UI/Strings/           # strings<LANG>.json, 10 languages
└── game-editor/              # Electron layout/admin editor
```

## Conventions

- **Architecture decisions defer to the refactor plan**, then to what the code already does (same rule as House/simgame: don't invent a second way to do something that exists).
- Player identity is `playerId` in the request body; auth is stateless JSON + localStorage (no sessions, no cookies). Keep it that way; add an allowlist/ownership check per route rather than a session layer.
- Grid coordinates: `gridCoord` (`TTFFSSGG` as a number) is the stable key for a world cell; Grid `_id` is the handle for a specific document (soon: a specific player's copy). Never scan `Settlement.find({})` to map one to the other; use the index.
- Tiles and resources are stored encoded (`utils/TileEncoder.js`, `utils/ResourceEncoder.js`); read/write through `GridTileManager` / `GridResourceManager`, never by hand.
- Master resource data lives in `tuning/resources.json` and is loaded once on the client via `Utils/TuningManager.js`; never fetch `/api/resources` from feature code.
- Economic changes go through a server route that validates and returns the player delta (Phase 5 target). Do not add new client-trusted `update-inventory`/`addXP` call sites.
- New files: small focused modules, 300-500 lines; `App.js` only shrinks.
- Player-facing copy: no em-dashes (the "AI dash"); use commas, colons, or two sentences.
- Commit messages describe the change. End with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Hazards (read before running anything)

- `POST /api/tuning` overwrites `globalTuning.json` on disk; `POST /api/reset-all-timers` and `/force-end-phase` move live timers. None are authenticated.
- `seasonReset` relocates every player and rewrites every grid. It runs 25 min after the season timer ends, only when `NODE_ENV=production`.
- `/delete-player` and `/reset-password` are open routes used by the editor.
