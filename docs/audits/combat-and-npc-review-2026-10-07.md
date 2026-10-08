# Combat and NPC review (2026-10-07)

Read-only review of the combat system and NPC movement now that the game is single-player
(docs/refactor-plan.md). Facts carry file:line citations as of commit e64e3804; paths are
relative to `game-client/src/` (client) or `game-server/` (server) unless given in full.
This is the parent document for the **NPC / Combat System overhaul** epic in
docs/backlog.md; the owner picks what to bite off first.

## Owner's framing (2026-10-07)

- Combat stays **casual**. Think a timing game with satisfying feedback, not a hard-core
  action RPG, and not much UI to process. Prefer feedback on the board (flash, lunge, damage
  numbers, a short death) over new panels, meters and indicators.
- **Strong client responsiveness, minimal dependence on the server.** The fight is simulated
  on the client; the server sees outcomes. Single players should not be able to cheat the
  system, but the defence is proportionate to a solo game (stop dev-tools stat editing, not
  bot farms).
- NPC movement should read as **alive**. Longer term, town NPCs should have "brains":
  motives, habits and little stories, in the spirit of SimGame but lighter (Track 5 below).
  Enemies (spiders, bears) get a different, simpler brain. That is a later track inside this
  epic, not the first bite.

## Part 1. Combat as it is

### 1.1 The player's attack

- **Input.** Click or tap only; no keyboard attack (`PlayerMovement.js:290-335` handles
  direction keys only). `PixiRenderer.handleClick` (`Render/PixiRenderer/PixiRenderer.js:1402`)
  finds the NPC by its LOGICAL tile, `Math.floor(npc.position)` (`:1454-1458`). Hostile NPCs
  are never walked up to; only helpers get `walkToNpc` (`:1461-1465`). App.js is not involved
  for enemies.
- **Gates** in `handleNPCClickShared` (`GameFeatures/NPCs/NPCInteractionUtils.js:126-158`):
  other player's homestead → return; then the **global attack cooldown** =
  `0.5 + (speed - 1) * 0.75` s from the PC record's `speed` (`?? 5`). The starter account
  has `baseSpeed` 5 (`tuning/starterAccount.json:12`), so a new player attacks once per
  **3.5 s**. The cooldown is set BEFORE the range, wall and camping checks, so an
  out-of-range click burns it; a click during cooldown returns `false` with no feedback.
  Jab (-2), Flurry (-1), Barrage (-1) and Magic Gloves (-1) can take speed to 0 or below,
  which makes the cooldown zero or negative.
- **The roll** (`GameFeatures/Combat/Combat.js:77-110`): `checkRange` (`:17-48`) compares
  Euclidean distance with `player.attackrange || 1`, so with range 1 a DIAGONAL neighbour
  (1.41) is out of range; camping blocks (string 31); wall check `isWallBlocking` (`:41`);
  hit = `d20 + attackbonus >= target.armorclass` (`:51-66`, no crit, no natural 20/1);
  damage = `player.damage + d6` (`:69-74`).
- **Feedback on a hit, synchronous** (`:101-103`): DOM floating text `- N HP` (1.8 s
  `float-up`, `UI/FloatingText.css:5`), the doober "poof" (`VFX/VFX.js:54-165`, 500 ms),
  SFX `attack_melee`. **No hit flash, no knockback, no attack animation on the player sprite,
  no death animation** (the sprite vanishes on the next NPC render effect,
  `PixiRenderer.js:1015-1024`). `PixiRendererVFX.js:14` still lists damage numbers as
  "Future".
- **Server writes, serial and awaited** (`Combat.js:105-228`): `updateNPC` (POST
  `/save-single-npc`, then `syncReact`, so React/tooltip hp update one round trip later);
  on a kill: "Killed" text only after that hp save, `await removeNPC` (POST
  `/remove-single-npc`), `await /addXP`, `setCurrentPlayer`, "+XP" text after a further
  `setTimeout(800)` (`:138-140`), the drop via `await updateGridResource` (PATCH
  `/update-grid/:gridId`, `:171-180`), Duke Angelo trophy + quest (`:189-225`),
  `trackQuestProgress('Kill')` (`:224-228`).

| What the player sees on a kill | When |
|---|---|
| "Killed" text, sprite gone | after 1 round trip (an hp save for an NPC about to be deleted) |
| Header XP updates | after 3 round trips (save, remove, addXP) |
| "+XP" text | 3 round trips + 800 ms |
| Loot drop appears | after 3 round trips |
| Quest progress | after 4 or more |

- **Bug.** `Combat.js:171-180` calls `updateGridResource(gridId, res, setResources, true)`
  but the signature is `(gridId, resource, broadcast)` (`Utils/GridManagement.js:19-23`):
  the setter is passed as `broadcast`.
- **Hit-testing vs the tween.** NPC sprites tween over `NPC_ANIMATION_DURATION = 2500` ms
  (cubic ease-out, restarted from the interpolated position on every new target;
  `PixiRenderer.js:521-533, 1118-1132`) on a ~1 s step, so the sprite trails its logical tile
  by 0.3 to 1.3 tiles. Clicking the sprite you see often hits an empty tile, and that click
  walks the player there instead (`:1508-1512`).

### 1.2 The enemy's attack

- **Tick.** `App.js:1856-1889`: one `setInterval(1000)` calls `npc.update(Date.now(), …)`
  for every NPC. The effect depends on `[isAppInitialized, gridId, NPCsInGrid, currentPlayer,
  activeTileSize]`; `NPCsInGrid` is React state that changes on every NPC step (`syncReact`,
  `GridState/GridStateNPCs.js:194-208`), so **the interval is torn down and rebuilt on every
  NPC move**, and the real cadence is 1.0-1.3 s and irregular. Each NPC also gates on
  `updateInterval` (default 1000, unset in all 55 NPC rows; `AllNPCsShared.js:33, 68-76`).
  `processState` is async and not awaited (`:74, 78`). Nothing pauses when the tab is hidden.
- **State machine** (`GameFeatures/NPCs/NPCEnemyBehavior.js:97-341`): `idle` is forced to
  `roam` at the top of every tick (`:106-109`), so the `idle` case (`:129-139`) and the
  "stuck → idle → random step" unstick (`:241-246`) never run. Spotting = PC hp > 0, distance
  ≤ `range` (sight, 15-40), Bresenham line of sight vs `wall`/`door` resources (`:8-88`, a
  copy of `Utils/GridManagement.js:721 isWallBlocking`). On the spotting tick the NPC only
  switches to `pursue` and saves; on the next it switches to `attack` and saves; the first
  roll is on the third. **Sight to first damage ≈ 3 ticks (2-3 s).** Pursuit steps greedily
  along the major axis (`:202-214`), 1 tile per tick, no pathfinding; gives up on lost line
  of sight or beyond 2×range after 5 s. The player moves 1 tile per 90 ms
  (`PlayerMovement.js:22`), about 11 tiles/s: **no enemy can ever close on a moving player.**
- **The roll** (`:257-325`): `d20 + attackbonus >= PC.armorclass` once per tick; damage
  `d6 + this.damage`. Enemy `speed` does nothing to the attack rate: it is used as
  milliseconds in a no-op `setTimeout(() => this.state = 'attack', this.speed)` on a miss
  (`:303-305`).
- **Damage to the PC** (`:307-319`): floating text, SFX `take_damage`, `updatePC({hp})`.
  `updatePC` marks dirty and `flushSoon(2000)` (`GridState/PlayersInGrid.js:520-526,
  274-280`): hits every second keep resetting the 2 s debounce, so **hp is written 2 s after
  combat stops**, on the 30 s interval, or on leave/unload. No PC hit flash.
- **Death.** A 1 s PC loop (`App.js:1894-1931`) sees hp ≤ 0 and opens `RevivalModal` (also
  applies lava damage 2 hp/s). Revive (`App.js:1519-1586`): gems deducted client-side, whole
  inventory sent through `/update-profile`, hp = `floor((baseMaxhp + maxhpModifier) * 0.25)`.
  Accept death → `handlePlayerDeath` (`Utils/playerManagement.js:143-230`): backpack wiped
  except Tent and Boat; hp = hard-coded **40** (free) or `baseMaxhp / 2` (Gold);
  `maxhp = baseMaxhp + maxhpModifier` where **`maxhpModifier` is never defined anywhere**, so
  Fortitude/Stoneheart/Unbreakable maxhp bonuses are dropped and the lower maxhp persisted;
  fallback `baseMaxhp || 990`; then `changePlayerLocation({type:'town'})`. The modal copy
  (5002) says "returned home"; the player respawns in town. Homestead regen +2 hp/s while
  hp ≤ baseMaxhp/2 (`App.js:1950-1964`); `sendPlayerHome` restores full hp
  (`utils/gridResolver.js:202-203`).

### 1.3 Player stats

- PC record built in `PlayersInGrid.initializeForPlayer` (`GridState/PlayersInGrid.js:373-423`):
  each stat = `player.base*` + `powerModifiers` (`:72-96`): magic enhancements
  (`category: 'power'`) count fully; weapons (passable, damage > 0) only when
  `settings.equippedWeapon`; armour (passable, armorclass > 0) only when
  `settings.equippedArmor`; each power contributes `quantity × stat`. hp/maxhp from the
  persisted Player when present (`:395-397`). Starter base: hp 1000, attackrange 1, AC 10,
  attack bonus 10, damage 15, speed 5 (`tuning/starterAccount.json:6-12`).
- Live updates from shops (`GameFeatures/Crafting/ShopStation.js:228-249`), scrolls
  (`ScrollStation.js:435-454`), skills (`Utils/SkillPowerManagement.js:132-140`) and the
  CombatPanel refresh (`GameFeatures/Combat/CombatPanel.js:172-242`).
- **The server validates none of it.** Derived stats are never persisted; `/player/state`
  accepts any finite hp and any positive maxhp (`routes/playerRoutes.js:1746-1762`);
  `/update-profile` accepts `base*`, `powers`, `settings`, `inventory` (`:373-411`).
- Healing: healer NPC panel (`GameFeatures/NPCs/NPCsPanel.js:567-660`, Doctor 20, Surgeon 50,
  Field Nurse 30, Fairy 75 via `qtycollected`, the healer loses 1 hp per heal); food
  (`Eating.js:111-136`, `item.hp × qty`); `NPCHealBehavior` never heals on its own.
- Data: Glowing Sword has `"armorclass": "`"` (a backtick string) in `tuning/resources.json`.

### 1.4 Enemy and gear tables (tuning/resources.json)

| type | maxhp | atk | AC | dmg (+d6) | attack range | sight | speed | xp | drop |
|---|---|---|---|---|---|---|---|---|---|
| Coyote | 100 | 0 | 10 | 10 | 5 | 15 | 5 | 2 | Pelt |
| Bear / Polar Bear | 200 | 6 | 15 | 15 | 9 | 20 | 3 | 5 / 6 | Bear Skin |
| Spider | 100 | 12 | 20 | 15 | 6 | 40 | 3 | 9 | Thread |
| Zombie | 400 | 12 | 20 | 23 | 15 | 30 | 1 | 12 | Potion A |
| Ghost | 200 | 12 | 25 | 38 | 18 | 30 | 1 | 15 | Bones |
| Ogre | 400 | 12 | 30 | 38 | 15 | 30 | 1 | 18 | Magic Mushroom |
| Demon | 650 | 18 | 30 | 38 | 18 | 20 | 1 | 25 | Silver |
| Duke Angelo | 500 | 12 | 20 | 23 | 15 | 30 | 1 | 800 | Portrait |
| Dragon | 1150 | 18 | 30 | 238 | 18 | 18 | 1 | 50 | Scroll |
| Phoenix | 3000 | 22 | 40 | 420 | 20 | 20 | 1 | 2000 | Phoenix Feather |

Spawners (Coyote 4, Bear 6, Spider 10, Zombie 5, Ghost 5, Demon 5, Dragon 3; `speed` =
seconds between spawns, Spider 2 s, others 10 s) spawn on their own tile when any PC is
within `range` with no line-of-sight check (`GameFeatures/NPCs/NPCSpawnerBehavior.js:5-90`);
new NPC ids are `${Date.now()}` (`GridStateNPCs.js:286`), which can collide when two
spawners fire in the same lockstep tick; a client-created spawner starts in state
`'hungry'` (`:306`), which the spawner brain does not handle. Dungeons
(`utils/dungeonUtils.js:27-52`) place enemies from the layout and **ignore the
`enemiesDistribution`** that `d001.json` and `dPhoenix.json` define.

Gear (`category: 'power'`, Warrior's Den / Armory / Magic Shop): weapons give damage 1-38
and attack range +1 to +2 (Short Sword 7 dmg for 8,000 Money at level 2; Long Sword 15 for
500 at level 9; Great Sword 18 for 1,000 at level 17); armour AC 5-18; magic enhancements add
attack bonus, maxhp (Fortitude 100, Stoneheart 200, Unbreakable 500) or reduce speed.

**Range mismatch.** Player reach is 1 tile (+1 to +2 from weapons), Euclidean, so diagonals
are out of range; enemies attack from 5-20 tiles. **Damage spread.** A starter has 1,000 hp
against a Coyote's d6+10 (long, dull early fights); Dragon d6+238 and Phoenix d6+420 are
one-shot machines against a 1,000-1,800 hp player.

### 1.5 Server trust

No combat-related route authenticates the caller or checks grid ownership:

| Route | Validates |
|---|---|
| `POST /save-single-npc` (`routes/gridRoutes.js:161-193`) | presence of fields; `$set` any shape on any grid |
| `POST /remove-single-npc` (`:195-225`) | presence; read-modify-write `save()` of the whole map |
| `POST /batch-update-npc-positions` (`:227-284`) | x/y numeric |
| `POST /addXP` (`routes/playerRoutes.js:887-916`) | `$inc` any number, negative included |
| `PATCH /update-grid/:gridId` (`routes/worldRoutes.js:465+`) | ObjectId + numeric x/y; any resource type |
| `POST /player/state` (`:1746`) | clamps hp to the maxhp the client sent |
| `POST /update-profile` (`:376`) | strips identity only; base stats, powers, inventory writable |
| `/update-player-quests`, `/add-player-quest`, `/earn-trophy` | replace/accept client values |

A page script can therefore remove any NPC on any grid, `POST /addXP {xpAmount: 1e6}`, PATCH
a Phoenix Feather onto a tile and walk over it, or simply `POST /update-profile {baseDamage:
9999}`. Every one of these is also a round trip the client waits on during a fight: the
current design is maximum server dependence AND zero protection.

### 1.6 UI

`CombatPanel.js`: HP, MaxHP, AC, attack bonus, damage, attack range, speed as total
(base + modifier) (`:244-280`); a "Fix Combat Stats" button (`:283`); armour/weapon equip
checkboxes (`:287-394`) and read-only magic enhancements (`:396-448`); **polls the PC store
every 500 ms** (`:123-132`); equipping sends the whole `settings` through `/update-profile`
then recomputes after a `setTimeout(100)` (`:38-120`). On the board: no target indicator, no
hp bars (`PixiRendererNPCOverlays.js:7-15` draws quest/trade/Kent markers only), enemy hp only
in the hover/long-press tooltip (`Render/RenderDynamicElements.js:151-158`), optional range
circles when `settings.rangeOn` (`PixiRendererVFX.js:185-280`, rAF loop every frame forever
at `:261, 291-305`), no cooldown indicator (the cooldown cursor code is dead,
`Utils/CursorUtils.js:12`).

## Part 2. NPC movement as it is

- **Lockstep.** All NPCs are built in one `initializeFromData` with `lastUpdated = Date.now()`
  (`AllNPCsShared.js:52`; `GridStateNPCs.js:230-246`) and driven by the one interval: every
  NPC on the grid steps in the same frame, once a second, no stagger, no jitter.
- **Primitive** (`AllNPCsShared.js:265-294 moveOneTile`): eight-way (`:11-20`), one-tile
  teleport in logic then a queued position save; `isValidTile` (`:310-376`) checks bounds,
  `validon<tile>` flags, impassable resources on the exact tile (multi-tile buildings via
  shadow tiles from `AppInit.js:28-44`), other NPCs (grazer-on-grazer allowed, so cows stack
  on one tile). **The player is never checked**, so NPCs walk through the player's tile.
  **No corner-cutting check**, which the player's A* forbids (`Utils/Pathfinding.js:9-10`).
  `Utils/Pathfinding.js` is used only by `PlayerMovement.js`; NPCs step greedily.
- **Speed.** No speed stat is used for movement (comment `AllNPCsShared.js:47`). Every NPC
  type moves 1 tile per tick (~1 tile/s); diagonals take the same time, so they look 41%
  faster.
- **Roam** (`AllNPCsShared.js:158-201`): pick one of 8 headings, each step choose randomly
  among {heading, ±45°} filtered to valid tiles (a wobbling zig-zag), after `range` steps
  hand off with no pause; blocked → drop the heading and pick a new random one next tick
  (reads as bouncing off walls).
- **Graze** (`NPCGrazeBehavior.js`): idle 4 ticks → one random step → hungry → nearest grass
  (`d` for Pig) within `range` → grazing (`grazeEnd = now + growtime`, Cow 720 s, Sheep
  14,400 s, others 28,800 s) → processing until collected (`SKIP_STALL_AFTER_GRAZING = true`,
  `:12`) → emptystall → roam `range` steps → hungry. Net: farm animals stand still for hours
  and walk only in a burst after each collection. The stall branch (`:282-441`) with its
  500 ms sleep-and-verify (`:416-437`) is unreachable; the processing one-hour reset
  (`:443-460`) is unreachable behind the early return at `:38-46`.
- **Quest / heal NPCs** (`NPCQuestBehavior.js`, `NPCHealBehavior.js`): forced to roam, freeze
  entirely while a PC is within `range` with no wall between (3 for most; Kent and The
  Shepherd 12), otherwise roam endlessly. **No home anchor or leash**, and positions persist,
  so quest givers drift anywhere on the grid over time. They never pause on their own and
  never face the player. Trader / worker: no behaviour.
- **Rendering** (`PixiRenderer.js:521-524, 964-971, 1073-1104`): 2,500 ms cubic ease-out
  tween restarted on every new target; each 1 s covers 78% of the remaining distance, so the
  sprite trails by ~0.28 tiles in steady state, velocity throbs 1.5 → 0.55 tiles/s every
  second, and on stopping it glides ~1.3 tiles over 2.5 s. The PC animator deliberately
  avoids this ("no ease-out which causes choppiness on chaining",
  `Render/RenderAnimatePosition.js:22`; PC tween 90 ms linear). No facing/flip, walk cycle,
  bob or shadow; no `sortableChildren` or y-sort anywhere, so NPCs always draw over trees and
  buildings and under the player. Speech bubbles (`PixiRendererSpeech.js:64-67`) and the
  farm-animal ready overlay (`PixiRenderer.js:1292-1312`) are pinned to the logical tile and
  run ahead of the sprite; status overlays and range circles follow the tween.
- **Persistence** (`GridStateNPCs.js`): moves queued and flushed every 10 s to
  `/batch-update-npc-positions` (`:11, 21-29, 62-101`), drained into `leave.npcPositions` on
  grid change (`:109-120`; server applies known ids only, `routes/enterGridRoutes.js`); state,
  grazeEnd, position and hp through `save-single-npc` on every transition (`:399-433`). **No
  pagehide/sendBeacon flush for NPC positions** (only PlayersInGrid has one): a reload loses
  up to 10 s and NPCs jump back. `stopGridStateUpdates` (logout) stops the batch timer and
  nothing restarts it (`:519-528`). On re-entry NPCs rebuild from saved state/position/
  grazeEnd (absolute timestamps keep running while away); in-memory fields (idle timer, roam
  steps, heading, targets, stuck counter) reset; a saved `pursue`/`attack` falls back to
  roam on its first tick. There is no server-side derivation of grazing/processing from
  `grazeEnd` (the plan's D7 asks for one); the client derives it.
- **Fields.** `range` is overloaded (graze search radius, roam steps per heading, enemy
  aggro radius, quest/heal freeze radius, spawner trigger); `speed` means three things (quest
  NPCs 1000 unused, enemies 1-5 as a miss-retry ms, spawners seconds between spawns);
  `passable` only decides whether the PLAYER is blocked by the NPC (`PlayerMovement.js:664-675`).

## Part 3. Opportunities, as tracks

The tracks are independent enough to ship separately. Track 1 and the kill route from
Track 2 are the recommended first bite (Part 4).

### Track 1. A casual action loop that lives on the client

**BUILT 2026-10-07** (commit "Combat Track 1"): items 1-5 and 7-9 as described, with the
owner's same-day notes folded in (pop around the sprite's centre, hp bar destroyed on kill,
the death beat slowed and staggered, projectiles for ranged attacks on both sides).
**Iterated 2026-10-08:** no skull, "+XP" rises from the tile once the body is gone and the
drop is there; a dark-red chunk burst on death (`deathVfx` per template, one variant so far)
and a soft impact poof on every hit (both sides); the drop lands on the nearest free tile and
the sell route matches a station by type AND tile (a drop sharing a crate's tile broke
"sell"); an explicit `ranged` weapon flag (melee weapons lost their attackrange bonus; range
powers still apply to melee, to be reconsidered). Item 6
is partial: enemies swing on the tick they come into reach after a 300 ms wind-up, but the
attack rate is still once per tick (a per-type interval needs a sub-second NPC tick, Track 3).

Everything here is client code; nothing needs the server during a fight.

1. **Attack rate.** Replace the speed-derived 0.5-3.5 s cooldown with a weapon-speed rate of
   roughly 0.4-0.8 s, set only AFTER a valid swing (range + wall pass), with a small cooldown
   ring on the player sprite as the only indicator. Clamp the stacked speed modifiers so the
   rate never reaches zero.
2. **Attack input.** A keyboard key / tap-and-hold attacks toward the facing direction (or
   the nearest enemy in reach), so you do not have to click a moving sprite. Hit-test the
   RENDERED sprite, not the logical tile (or make NPC tweens finish within their step, Track 3).
3. **Reach.** Melee range 1 includes diagonals (Chebyshev distance); bows 3-5 tiles; enemy
   attack ranges down to 1-3 for melee types and 4-6 for Spider and Ghost. Sight range stays
   larger than attack range so there is an approach.
4. **Board feedback, no new UI.** A ~100 ms lunge on the player sprite toward the target; a
   white flash and a few px of knockback on the enemy; Pixi damage numbers (replace the DOM
   floating text + doober poof); a ~300 ms death fade/shrink; a short red flash on the PC
   when hit. Enemy hp as a thin bar only while engaged (fades out), no permanent bars.
5. **Instant local kill.** Resolve the kill on the client: sprite dies, XP and loot appear,
   quest ticks, all at once; one outcome request afterwards (Track 2). Drop the pre-kill hp
   save and the serial chain in `Combat.js:105-228`.
6. **Enemy reaction.** Roll on the same tick the enemy enters `attack` (no two dead ticks), a
   short telegraph (wind-up) before the swing instead, and a per-type attack interval rather
   than once per tick; enemy `speed` becomes that interval or is removed.
7. **PC hp persistence.** Write hp at transactional moments (kill, flee, death) through
   `flushAfterTransaction`, not only the 2 s settle.
8. **Death.** Fix `maxhpModifier` (use `powerModifiers.maxhp`), make the respawn hp a tuning
   value, and make the copy match where the player lands.
9. **Hover tip (desktop).** The enemy hover tip sits in the way during a fight: it hides on
   click but returns on the next mouse move. Rule (owner, 2026-10-07): offset the tip
   up-and-right of the cursor for enemies, as a general rule, so the sprite and the swing stay
   visible.

### Track 2. Trust model: outcomes, not state

**BUILT 2026-10-08 (the kill route):** `POST /api/action/npc-kill { playerId, gridId, npcId,
dropAt? }` (`game-server/routes/combatRoutes.js`) checks grid ownership, that the NPC exists
there and is hostile, and a kill-rate bound from the server's OWN derived stats
(`utils/combatStats.js`: base + equipped weapon/armour + enhancements, the client's
`powerModifiers` mirrored): a kill may not land sooner than `(ceil(maxhp / (damage + 6)) - 1)`
swings at the tuning's fastest cooldown. It then removes the NPC, grants the template `xp`,
places the drop on the nearest free tile (the client's suggestion when free) and advances
Kill quests, in one write; the client reconciles xp, quests and the drop tile from the answer.
Combat no longer calls `/addXP`, `/update-grid`, `/remove-single-npc` or `/save-single-npc`
(a wound stays client-side; an enemy is back at full hp on re-entry). `/player/state` now sets
maxhp to the derived value and clamps hp to it; `/update-profile` drops `base*` stats, `hp`
and `maxhp` from non-developers. Still open from the list below: `/addXP`, `/update-grid`,
`/update-player-quests`, `/earn-trophy` and the `powers` / `inventory` fields of
`/update-profile` stay client-trusted for quests, trades and purchases (refactor plan Phase 5).

Target shape (matches docs/refactor-plan.md D9): the client simulates, the server checks a
few outcomes it can reason about, and the free-form value routes close.

- `POST /action/npc-kill { playerId, gridId, npcId, hits }` → server checks grid ownership
  (`grid.ownerId` or the player's homestead), that the NPC exists in the grid's stored map,
  computes the player's derived stats itself from the Player document (powers + equipment,
  the same `powerModifiers` logic moved server-side), bounds the claimed damage over elapsed
  time against those stats, then removes the NPC, grants `xp` and the `output` drop from the
  template, advances Kill quests, and returns the player delta. One round trip per kill,
  after the fact.
- `POST /action/npc-hit` is NOT needed for a casual game: hp between kills can stay
  client-side (the NPC snapshot on leave carries it, plan D7).
- Close or dev-gate: `/addXP`, `/update-grid` as a drop path, `/update-profile` for `base*`
  / `powers` / `inventory`, `/save-single-npc` and `/remove-single-npc` from the combat path,
  client-supplied quest progress and trophies. `/player/state` validates hp against a
  server-computed maxhp.
- Spawning becomes deterministic from the spawner template (count, interval) so the server
  can accept a spawned NPC id it has not seen if it fits the spawner's budget.
- A plausibility bound is enough: this stops dev-tools stat editing, which is the realistic
  threat for a solo game.

### Track 3. NPC movement that reads as alive

In rough priority order; the first two are small and transform the look.

1. **Tween = step, linear** (as the PC animator does), or tick = tween; removes the throb and
   the 1.3-tile glide. Pin speech bubbles and the ready overlay to the render position.
2. **Per-NPC cadence.** Randomised step interval with jitter (e.g. 700-1,600 ms seeded per
   NPC) to break the lockstep; a real per-type `movespeed`; diagonals at √2 of a step.
3. **Idle inside roam.** Walk 2-5 steps, pause 2-8 s, sometimes turn in place. Stillness done
   well is most of "alive".
4. **Home anchor + leash + A\*.** Each NPC gets a home tile (its spawn/layout position) and a
   leash radius; roam picks a destination inside the leash and walks it with `findPath`
   (`Utils/Pathfinding.js`). Fixes drifting quest givers and the zig-zag together. Enemy
   pursuit uses the same A\* at a speed that can close on the player.
5. **Collision parity with the player:** no walking through the player's tile, no diagonal
   corner cuts, no stacking grazers (offset within the tile when they share one).
6. **Look:** `scale.x` flip from the horizontal step direction, a small walk bob while a
   tween is active, y-sort (`sortableChildren`, zIndex = y) for NPCs, the PC and tall
   resources so NPCs pass behind trees.
7. **Loop hygiene:** key the tick effect on `isAppInitialized` + `gridId` only (read state
   through refs); pause the tick while the tab is hidden and snap tweens deliberately on
   return; flush NPC positions on pagehide with `sendBeacon`; restart the batch timer after
   logout.
8. **Fields:** split `range` into `aggro`, `roamSteps`/`leash`, `interactRange`; give `speed`
   one meaning.

### Track 4. Tuning pass (after the loop exists)

Starter hp 1,000 vs Coyote d6+10; Dragon d6+238 / Phoenix d6+420 vs a 1,000-1,800 hp
player; the weapon price/damage ladder (Short Sword 7 dmg / 8,000 Money at L2, Long Sword
15 / 500 at L9, Great Sword 18 / 1,000 at L17); AC values that make a +10 starter hit a
Phoenix (AC 40) on a 20 only. Dungeon `enemiesDistribution` should either drive placement
or be deleted. Follow docs/tuning.md.

### Track 5 (future). NPC brains: motives, habits, little stories

Owner's direction: town NPCs should feel like they have brains, motivations and habits, in
the spirit of SimGame but lighter. Enemies get a different, simpler brain. Not scheduled;
recorded here so Tracks 1-3 do not design against it.

- **Reference.** SimGame models this as needs/motives that decay, a set of interactions as
  goal nodes with rewards (`simgame/game-server/lifegoals/goals-motives.json`,
  `simgame/game-server/interactions/int-*.json`), and townies with schedules
  (`simgame/game-server/townies/`). The vvgame version should be a subset: a handful of
  motives (rest, food, work, social, worship), a daily schedule by in-game hour (the frontier
  already has day/season timers), and a small set of "spots" per town (home, work station,
  tavern, chapel, market) that NPCs walk between with the Track 3 A\*.
- **Two brain kinds.** `brain: 'townie'` (motive-driven: pick the most pressing motive, go
  to the spot that satisfies it, dwell, emit a speech line, repeat) and `brain: 'creature'`
  (the Track 3 roam/leash plus enemy pursue/attack). Farm animals are creatures with a
  graze motive. The brain is a field on the NPC template in resources.json, replacing the
  `action`-keyed switch in `AllNPCsShared.js`.
- **Stories.** Habits (the Chef is at the Oven at noon, the Doctor walks to the chapel at
  dusk) plus relationship state already in `RelationshipMatrix.json` give "little stories"
  without authored scripts; a few authored vignettes (two NPCs meet at the well at 8) can
  layer on top as scheduled interactions.
- **Constraints from this review.** Keep it client-simulated (no server tick), deterministic
  from the frontier clock so it looks the same on re-entry, and cheap: a motive pick once per
  NPC per in-game hour, not per tick.
- **Scope guard.** This is the "even-more-future" track; it must not pull Track 1 toward
  more UI or more systems. Casual first.

## Part 4. Recommended sequence

1. **Track 1** (client action loop): cooldown, reach, hit-testing, board feedback, instant
   local kill, same-tick enemy roll, death fixes.
2. **The kill route from Track 2** right behind it, because the instant local kill wants one
   outcome request to replace the serial chain, and that is the moment to close the
   free-form value routes.
3. **Track 3** as its own pass: tween and cadence first (small, transformative), then anchor
   + leash + A\*, then collision parity and look.
4. **Track 4** once the loop exists to tune against.
5. **Track 5** when the town needs it.

## Cleanup to fold into whichever track touches the file

- Server routes with no caller: `save-single-pc`, `remove-single-pc`, `save-grid-state-npcs`,
  `load-grid-state` (still returns `playersInGrid`), `batch-update-pc-positions`
  (`routes/gridRoutes.js:10, 69, 107, 134, 286`).
- `NPCInteractionUtils.js`: `setGlobalAttackCooldown` (`:245`), `getNPCCursorClass` (`:231`),
  `generateNPCTooltipContent` (`:17`) have no callers; "DOM / Canvas modes" comments; shadowed
  `playersInGrid` parameter (`:141`); unused imports. `Utils/CursorUtils.js:12` likewise.
- `AllNPCsShared.js`: `handlePursueState` (`:203-256`), `findAllResources` (`:463-480`),
  `processingStartTime` (`:49`) unused; `NPCGrazeBehavior.js` stall branch + verify loop
  (`:282-441`), `triedStall` (`:370`), processing case (`:443-460`); `NPCEnemyBehavior.js`
  idle case (`:129-139`) and the "in range but can't see" branches (`:171, 226`); duplicated
  line-of-sight code (`:7-88` vs `Utils/GridManagement.js:721`); per-tick `console.log` in
  pursue (`:195, 218`).
- `NPCWorkerBehavior.js:13-16`: `clearInterval(this.updateInterval)` on the 1000 ms number
  (could clear an unrelated timer id). Unused `axios`/`calculateDistance` imports in
  `NPCGrazeBehavior.js`, `NPCWorkerBehavior.js`, `NPCTraderBehavior.js`.
- `Combat.js:8` unused `getLineOfSightTiles`; the `updateGridResource` arity bug (`:171-180`);
  `GridManagement.updateGridResource`'s `broadcast` parameter.
- `PlayersInGrid.js`: `animateRemotePC` naming (`:3, 513`), stale XHR comment (`:18`);
  `PlayerMovement.js:437-439` broadcast-era `localPlayerMoveTimestampRef`;
  `playerManagement.handlePlayerDeath` unused `offerRevival`; undefined `maxhpModifier`
  (`App.js:1534`, `playerManagement.js:168`); `App.js:1866-1867` bare `{ }` block.
- `tuning/resources.json`: Glowing Sword `armorclass` backtick; `enemiesDistribution` in
  dungeon layouts unused.
