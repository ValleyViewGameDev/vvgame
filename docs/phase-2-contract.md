# Phase 2 contract: per-player grids and the `enter-grid` resolver

Status: spec for the Phase 2 build (2026-10-02). Server and client are built against this; update it if the shape changes.

## Grid document additions

| Field | Type | Meaning |
|---|---|---|
| `gridCoord` | Number or null | world cell (`TTFFSSGG`); null for dungeons |
| `ownerId` | ObjectId or null | homestead owner, or the player who owns this town/valley/dungeon copy; null for template instances |
| `isTemplate` | Boolean | true for the one shared instance per town/valley cell and per dungeon template that the editor edits; players never load these |
| `templateKey` | String | what the copy was generated from: `homestead`, `town/townN`, `valleyFixedCoord/1011100`, `random:valley1`, `dungeon:d001`, `ftue-cave` |
| `seasonNumber` | Number | season the copy was last brought up to date (valleys: tree top-up + snow/melt; towns: snow/melt) |
| `resetEpoch` | Date | dungeons only: when the copy was last reset from its template |

Indexes: `{ownerId, gridCoord}` (partial, gridCoord not null), `{ownerId, templateKey}`.
`Settlement.grids[].gridId` keeps pointing at the homestead (owned) or the template instance (town/valley). `playersInGrid` stays for now (one entry per copy); Phase 3 moves position persistence to `Player.location`.

## `POST /api/enter-grid`

Request: `{ playerId, target }` where `target` is one of

| target | Resolves to |
|---|---|
| `{ type: 'coord', gridCoord }` | the cell at `gridCoord`: the player's own homestead (403 `{reason:'not-your-homestead'}` for any other homestead), or the player's copy of that town/valley (created from the template on first visit) |
| `{ type: 'home' }` | the player's homestead (`player.gridId`); 404 if they have none yet |
| `{ type: 'town' }` | the player's copy of the first town cell in their home settlement |
| `{ type: 'enter-dungeon', fromGridId }` | the dungeon template registered for the entrance cell the player is standing in (`Frontier.dungeons[*].entranceGrids` now holds gridCoords); the player's copy is created from the template on first visit and reset when `resetEpoch < Frontier.dungeon.startTime`; sets `player.sourceGridBeforeDungeon = fromGridId` |
| `{ type: 'exit-dungeon' }` | `player.sourceGridBeforeDungeon` (their own valley copy), spawn next to its `Dungeon Entrance`; for the FTUE cave: their homestead next to `Signpost Town`; clears `sourceGridBeforeDungeon` |
| `{ type: 'current' }` | re-enter wherever `player.location` says (used at app boot); if that no longer resolves (e.g. a template id from before the migration) falls back to `home` |

Optional `target.x` / `target.y`: the arrival position to store in `player.location` when the client already knows it. Otherwise the server stores the spawn it computed (dungeon exit / home fallbacks) or leaves x,y unchanged for the client to set after it resolves a signpost.

Response `200`:
```json
{
  "grid": {
    "_id": "...", "gridType": "town", "gridCoord": 1011172, "templateKey": "town/townN",
    "ownerId": "...", "region": "Belmont", "settlementId": "...", "frontierId": "...",
    "isFTUECave": false,
    "tiles": [[ "g", ... ] ...],            // 64x64 decoded, same shape as GET /load-grid
    "resources": [ { "type": "Oak Tree", "x": 3, "y": 4, ... } ],   // decoded + enriched, same as GET /load-grid
    "NPCsInGrid": { "<npcId>": { ... } },   // same shape as GET /load-grid-state
    "playersInGrid": { "<playerId>": { ... } }  // only this player's record, if any
  },
  "location": { "g": "...", "s": "...", "f": "...", "gridCoord": 1011172, "gtype": "town", "region": "Belmont", "x": 10, "y": 20 },
  "spawn": { "x": 10, "y": 20 } | null,     // set when the server computed the arrival spot (dungeon exit, FTUE exit, home fallback)
  "ownerUsername": "Oberon" | null          // homesteads only
}
```
Errors: 400 bad target, 403 `not-your-homestead`, 404 `no-homestead` / `no-dungeon-here` / `no-source-grid`, 503 maintenance.

The server also writes `player.location` (g, s, f, gridCoord, gtype, region, and x/y when known) and marks `gridsVisited` for the coord, so the client no longer calls `/update-player-location`, `/mark-grid-visited`, `/load-grid`, `/load-grid-state`, `/enter-dungeon`, `/exit-dungeon`, `/get-settlement-by-coords`, or `/homestead-gridcoord` on a grid change.

## Client flow

`changePlayerLocation(currentPlayer, target, …setters, arrival)`:
1. leave: flush position batches, stop timers, remove own PC from the old grid (existing HTTP).
2. `POST /enter-grid`.
3. seed tiles/resources/NPCs/PC from the bundle (`initializeGrid` and the two managers take data instead of fetching).
4. arrival position: `response.spawn` if present, else `arrival.findSignpost` (existing signpost + offset logic) with `arrival.fallback {x,y}`, else `target.x/y`.
5. save own PC into the new grid (existing `save-single-pc`), camera, FTUE, status.

Transit math (neighbour gridCoord from direction) stays on the client; everything that chose a Grid document id (`Settlement.grids[].gridId`, `/get-settlement-by-coords`, `/load-grid` of the destination) goes. Walking off the edge into a neighbour's homestead is blocked client-side with a status message (server also 403s).

## Other route changes

- `POST /grids-tiles { playerId, settlementId, gridCoords }`: tiles come from the viewer's own copies for town/valley cells and from the owned grid for homestead cells; unvisited copies are simply absent.
- `POST /get-settlement-bundle`: `gridStates` removed from the payload.
- `GET /grids?gridType=dungeon`: template instances only.
- `POST /update-dungeon-config { frontierId, dungeonGridId, templateUsed, entranceGridCoords }` (gridCoords, not grid ids).
- `POST /send-player-home { playerId }`: sets `location` to the homestead spawn (no PC map edits).
- `GET /load-grid/:gridId` stays for the editor.
- FTUE cave: created per player at registration (`templateKey: 'ftue-cave'`); the client checks `grid.isFTUECave`, never a hard-coded id.
- Tuning: `dungeon.phases.open` = 480 minutes (8 h reset cadence).
