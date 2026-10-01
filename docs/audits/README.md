# Code audits (2026-10-01)

Six read-only audits of the codebase, written as the baseline for the single-player refactor
(see `../refactor-plan.md`). Every claim cites `file:line` as of 2026-10-01. Line numbers will
drift as the refactor lands; the structural findings will not.

| File | Covers | Headline |
|---|---|---|
| `server-routes.md` | Every Express route, which collections it touches, socket emits, validation | ~130 routes; only 3 server-side socket emits outside `server.js`; the client is already trusted for resources, tiles, inventory, XP, profile |
| `client-sockets-and-grid-state.md` | `socketManager.js`, `GridState/*`, `GridManagement.js`, `PlayerMovement.js` | 21 of 25 client emits and 16 of 21 listeners are grid-sync; 9 emits have no server handler; the NPC-controller gate is one line (`App.js:2265`); a grid change costs 10-14 HTTP calls |
| `grid-lifecycle-and-data-model.md` | Models, encoders, grid creation/reset/season, layouts, storage sizing | Grids are already lazy; a 64x64 grid is 40-75 KB BSON (90% resources); 4,096 coords per frontier = the `gridsVisited` bitmap; three per-player storage options costed |
| `schedulers-and-async-features.md` | All schedulers, Train/Carnival/Bank/Elections/Taxes/Seasons/Market/Outpost/Mailbox | Stations are doors, data lives on Settlement/Frontier/Player, so async features survive per-player towns; scheduler loop re-reads the Frontier doc 2,160 times/hour at idle |
| `client-npc-and-rendering.md` | NPC state machines, every NPC server call, render pipelines, hot paths, perf wins | Only Pixi is live (10+ dead render files); App re-renders every second; VFX runs a 60 fps rAF; tile-texture cache leaks ~4,096 entries per grid visited; top-10 perf list |
| `views-transit-dungeons-ftue.md` | Settlement/frontier views, every grid-change path, dungeons, FTUE, editor coupling | One execution choke point (`changePlayerLocation`) but ~10 places decide *which* Grid doc to load; dungeons and the FTUE cave are shared per-frontier instances |
