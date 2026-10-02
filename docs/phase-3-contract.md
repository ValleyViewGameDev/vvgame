# Phase 3 contract, slice 1: player state lives on the Player; settlement 0,1; corner ban

Status: spec for the build (2026-10-03). See `refactor-plan.md` Phase 3 and `phase-2-contract.md`.

## 1. Player state off the grid

Why: `Grid.playersInGrid` existed so other clients could render and hit you. With one player per grid copy it is a one-entry map rewritten on every step batch and every transition, and it holds the only live copy of hp/maxhp. Every "player vanished / stats reset / stuck in the wrong grid" bug came from the remove-from-old-grid / add-to-new-grid handoff.

Model after this slice:

| Data | Lives on | Persisted by |
|---|---|---|
| position | `Player.location.x/y` | `POST /api/player/state` (debounced 30 s, flush on grid leave, arrival, `beforeunload`) and `enter-grid` |
| current hp, maxhp | `Player.hp`, `Player.maxhp` (new) | same |
| derived combat stats (attackbonus, armorclass, damage, attackrange, speed) | computed on the client from `base*` + equipped powers, never persisted | n/a |
| base stats, inventory, skills, powers | `Player` (unchanged) | existing routes |
| NPCs | `Grid.NPCsInGrid` on the player's grid copy (unchanged) | existing routes |

`POST /api/player/state { playerId, x, y, hp, maxhp }` → `{ success: true, location, hp, maxhp }`. x/y integers 0..63; hp/maxhp numbers; the server also bumps `lastActive`. `GET /api/player/:id` and `/login` return `hp`/`maxhp`. `sendPlayerHome` (season end, dungeon/FTUE exits, admin) sets `hp = maxhp`.

Removed (next slice, after the new client is live): `Grid.playersInGrid`, `playersInGrid` in the grid bundle, `POST /save-single-pc`, `/remove-single-pc`, `/batch-update-pc-positions`, the PC half of `GET /load-grid-state`. This slice keeps them mounted so the previous client keeps working between the two deploys.

Client: `PlayersInGrid` stays as the in-memory holder with the same `getPlayersInGrid(gridId)[playerId]` / `getAllPCs` read contract so call sites do not churn. Its record is built from the Player (`location.x/y`, `hp`, `maxhp`, derived stats from base + equipment), not from the grid bundle. `updatePC` marks the record dirty and mirrors `x/y/hp/maxhp` into the localStorage `player`; a 30 s timer, grid leave, grid arrival and `beforeunload` call `/player/state`. No HTTP in `addPC`/`removePC`. Code that mutated the record's hp in place (App.js lava/death and heal loops) goes through `updatePC` so the dirty flag is set.

Migration `scripts/migrate-player-state.js`: for every player, seed `hp`/`maxhp` from the PC record on the grid they are standing in if one exists, else `maxhp = baseMaxhp`, `hp = baseMaxhp`. Idempotent; dry run by default.

## 2. Everyone in settlement 0,1; corner settlements banned

Why: the frontier's four corner settlements (0,0), (0,7), (7,0), (7,7) sit diagonally from the valley block, which is why diagonal signpost travel existed. Settlement (0,1) is directly north of valley (1,1): straight edge walks everywhere.

Migration `scripts/move-players-to-settlement-0-1.js` (dry run by default): for every player whose homestead is not in settlement (0,1): take the first available homestead cell in (0,1), move the homestead Grid's pointer there (source cell freed, target cell claimed, `grid.settlementId`, `grid.gridCoord`, `player.settlementId`, `player.homesteadGridCoord`, `player.location` if standing at home, both `population` counters), delete the player's town copies that belong to the old settlement (they regenerate from the (0,1) town template), and rewrite any dungeon registry entrance that pointed at the old homestead coord. Then mark the four corner settlements `available: false` in `Frontier.settlements` and every homestead cell in them `available: false`.

Server rules: `/create-homestead` first-fit skips settlements whose frontier entry is `available: false`; `/relocate-homestead` refuses a target in such a settlement. Signposts stay as shortcuts for now (Signpost Home / Signpost Town keep working); removing directional signposts is a later content decision.

## 3. Master plan note (not acted on): seamless world

Long term the client should feel like one continuous world: keep the grid-based data (per-player copies, `NPCsInGrid` per grid) but always have the active grid plus its 8 neighbours loaded, scroll seamlessly across edges, and lazily fetch the next ring as the player moves. `playersInGrid` was the blocker; with player state on the Player, the remaining design questions are NPC ticking for the loaded ring (tick only the active grid, freeze neighbours), one `enter-grid` that returns a 3x3 bundle (or a `/grid-ring` fetch), and a renderer that addresses tiles by world coordinate. Recorded here so it shapes Phase 4 decisions (tile layer as render textures per grid, camera in world space); no work scheduled yet.
