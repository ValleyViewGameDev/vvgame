# Citizens: a living Town (Track 4)

Design for the Citizen kind of NPC (`resource.action` in `quest`, `trade`, `heal`, `worker`),
Track 4 of docs/audits/combat-and-npc-review-2026-10-07.md. Written from the owner's
direction of 2026-10-08; the **Open questions** at the end are what still needs agreeing
before the behaviours are built. Code: `game-client/src/GameFeatures/NPCs/NPCCitizenBehavior.js`
(the shared brain), `VFX/NPCVFX.js` (headline effects), per-type numbers in
`game-server/tuning/resources.json` (ECONOMY sheet).

## 1. What is built today (2026-10-08)

- **One brain** for the four actions (`NPCCitizenBehavior.js`), the **state loop** with
  per-type lengths, the **waiting** interrupt (quest/trade/heal), **Zzz** while resting
  (`VFX/NPCVFX.js`, the generic headline effect; waiting shows rising "?"s, eating 🍽️).
- **Persistence:** `citizenState`, `citizenStateUntil`, `citizenTask`, `homeX`, `homeY` ride
  on the NPC record (`save-single-npc`; the grid model's NPC sub-schema declares them), so a
  citizen resumes the same state with the time left, like a Farm Animal's `grazeEnd`.
- **Home + per-type slots:** hiring from the Farm House keeps the haybale and turns it into
  the worker's own `<Type> Slot` (`Farm Hand Slot`, `Lumberjack Slot`, `Rancher Slot`,
  `Crafter Slot`, resources.json, drawn as haybales, clickable like the generic slot); the
  worker spawns on it with `homeX/homeY`. Workers hired before this (no slot) take the tile
  they stood on as home. Talkers' home is their template tile.
- **Movement:** `AllNPCsShared.followPath(x, y, …)` walks an A\* path (`Utils/Pathfinding`)
  one step per tick on the NPC's own cadence, using the NPC's own terrain rules (all
  citizens now walk grass/dirt/snow/sand/pavement/etc., not only pavement), never onto the
  player or another NPC; re-plans up to three times then reports blocked.
- **Workers' working:** Lumberjack = nearest tree (any `convertTo` requiring Axe) → chop
  (`handleSourceConversion`) → walk onto the wood and collect it (`handleDooberClick`) →
  walk to the Warehouse → next tree; warehouse full before a chop = FAIL → resting.
  Rancher = nearest ready animal → collect (`handleNPCClick`); none → next state. Farm Hand
  = nearest grown crop doober → collect → replant the same crop on the same tile at once
  (`handleFarmPlotPlacement`, seeds spent as when the player plants; repeatable crops are
  replanted free by `handleDooberClick`; no seeds = the tile stays empty); none → next state. Crafter = nearest crafting
  station with a finished slot → collect (`executeBulkCrafting` for that station); none →
  next state. All through the player's own code paths with the live React context App
  registers each render (`setCitizenContext`).
- **resting** routes onto the slot/home and stands (Zzz). **roaming** is a leashed wander
  (4 tiles of home). **eating** walks to a random food doober (master `hp > 0`), eats it
  (the doober is gone), then straight back to working; an unreachable food is dropped after
  20 s.
- **Talkers' working** = anchored wander within 3 tiles of the template tile.
- **Socializing (2026-10-09):** the citizen picks a partner (one of the three nearest citizens
  with a socializing length that is not waiting on the player, not already in or walking to a
  conversation, and did not change state in the last minute), walks to a tile on the partner's
  row within 3 tiles (2 away on its own side first, then 1, then 3, else any free tile within
  2), pulls the partner into socializing (held at most 60 s, their task says who holds them),
  and the Talk plays through the player's own conversation system
  (`Relationships/Conversation.playNPCConversation`: the same bubbles, the same topic
  resolution with both sides reading their interests from `RelationshipMatrix.json`, the same
  match / rival comparison, the partner reacting to what the initiator shows). The roll is the
  player's Talk rule on a 0.6 base (+0.1 per match, -0.15 per rival topic, +0.15 friends,
  +0.25 love, -0.15 rivals); 👍 / 👎 float over both, the pair's score moves ±8, and both go to
  their next state. Nobody about = wander near home and look again every 5 s; an unreachable
  partner (blocked path, 45 s without arriving, the partner walked off or got taken) is a
  failure and another partner is tried; the third failure abandons the state. The player
  walking into range of either citizen ends the conversation at once (waiting comes first).
- **Citizen-to-citizen relationships** live on the Player as `npcRelationships` (one row per
  unordered pair of NPC types: `a`, `b`, `relscore`, `friend` / `rival` / `love`, `talks`,
  `lastTalkAt`), saved by `POST /api/npc-relationship` (`utils/npcRelationships.js` clamps
  the score to ±100 and keeps the flags in step: friend at ≥ 30, rival at ≤ -30, a seeded love
  lost under 70). A pair with no row reads as the static matrix says (love 80, friend 50,
  rival -50, else 0) and is seeded from that on its first talk
  (`RelationshipUtils.getNPCRelationship` / `updateNPCRelationship`). Nothing shows these to
  the player yet.

Current numbers (seconds; the owner's spec for the Lumberjack, copied to the other workers
and placeholders for the talkers until tuned):

| Action | working | resting | roaming | eating | socializing |
|---|---|---|---|---|---|
| worker (Lumberjack, Farm Hand, Rancher, Crafter) | 600 | 1800 | 30 | 120 | 0 |
| quest, trade | 900 | 0 | 0 | 0 | 300 |
| heal | 900 | 0 | 0 | 0 | 0 |

## 2. The model

Citizens cycle through states like Farm Animals and Enemies do, and inside a state they can
run a richer behaviour. Every citizen has the same five loop states; a type skips any state
whose length is 0.

| State | What it means |
|---|---|
| **working** | the citizen's job (per action below) |
| **resting** | route to the citizen's own Worker Slot (or home tile) and stand still with Zzz |
| **roaming** | wander (Track 3a legs and pauses) inside a leash |
| **eating** | find food and eat it (below) |
| **socializing** | find another citizen and have a conversation (below) |

Plus one interrupt that is not in the loop:

| **waiting** | quest / trade / heal only: the player is within `range`; stop, pause the clock, resume when they leave |

### 2.1 Workers (Lumberjack first)

Workers have 0 socializing. Lengths vary per worker type.

**Lumberjack** (spec): works, then is tired and rests 30 min at his Worker Slot (Zzz), roams
30 s, is hungry for 2 min, then works again.

- **working**: route to the nearest Tree, chop it, collect the Wood doober, route all the way
  to the Warehouse ("as if" bringing the wood back, although it is already collected), route
  to the next nearest tree, repeat for the state's length. **If the Warehouse is full, the
  work state FAILS** and he is pushed into resting; the cycle restarts.
- **eating**: route to a random doober with `hp > 0` (food) and consume it. Reaching it before
  the 2 min is up pushes him straight into working.

**Rancher**: as the Lumberjack, but work = route to the nearest Farm Animal that is ready and
harvest it; if none is ready, forced into the next state (resting).
**Farm Hand**: work = crop harvesting, each harvest followed by a replant (owner, 2026-10-09). **Crafter**: work = any Crafting Station ready to
collect.

The Bulk commands on workers stay for the player; this loop is the idle game that runs while
they do other things on the homestead.

### 2.2 Quest givers and Traders

- **working** = anchored to the tile the grid template gave them, with an idle leash: wander
  a few tiles away and back.
- 0 resting, 0 eating (skipped).
- **socializing (5 min)**: look for another Citizen on the board and go talk to them: get
  within 3 tiles and try to stand on the same row, then start a conversation. That pushes the
  OTHER citizen into socializing too (they stop what they were doing). The conversation uses
  the exact player-to-NPC conversation system (`GameFeatures/Relationships/Conversation.js`,
  `ConversationManager`, `RelationshipMatrix.json`, speech bubbles), so citizens have
  relationships with each other, choose interactions their relationship allows, and the
  outcome can change the relationship over time. When it ends, both go to their next state.
  - When choosing a partner, skip any citizen within 1 min of changing state (they may have
    walked off by the time you arrive).
  - Fallback: if the chosen citizen cannot be reached, fail and pick another; on the 3rd
    failure abandon socializing and move to the next state (working).

### 2.3 Healers

Waiting applies (as to quest and trade). The rest of the healer loop is an open question.

## 3. Decisions (owner, 2026-10-08)

1. **Lumberjack work length: 10 min** (600 s).
2. **Healers: work and wait only.** Every other state is 0 for now.
3. **Worker Slots are per type and stay.** Hiring from the Farm House no longer removes the
   haybale: the slot stays on the grid as that worker's home base, becomes a per-type
   resource (`Farm Hand Slot`, `Lumberjack Slot`, `Rancher Slot`, `Crafter Slot`, all drawn
   as haybales) so each worker targets an object that is uniquely theirs, and a resting
   worker routes ONTO it. One day the player may move them.
4. **Eating is a deliberate running cost.** The food doober is consumed.
5. **Work uses the same client-trusted routes** the player and the Bulk commands use (chop,
   harvest, collect, warehouse). Server validation is Phase 5.
6. **On return, pick up where the citizen left off**: the state and the time remaining in
   it, like a Farm Animal's `grazeEnd`. The state, its end time and any mid-state progress
   are persisted on the NPC record.
7. **Citizen-to-citizen relationships persist with the player's saved state**: storage is
   added now, on the Player document, seeded from the static type-to-type relationships in
   `RelationshipMatrix.json` and changed by conversation outcomes.
   Built 2026-10-09 as `Player.npcRelationships` (see §1).

## 4. Build order (once agreed)

1. Worker Slot / home anchor + the resting route (all workers); the roaming leash.
2. Lumberjack working (nearest tree → chop → wood → warehouse → repeat; warehouse-full
   failure), then Rancher, Farm Hand, Crafter by swapping the "find work" and "do work" steps.
3. Eating.
4. Talkers: anchored working with the idle leash; waiting polish (face the player).
5. Socializing: partner choice, approach, the conversation through `ConversationManager`,
   relationship storage, the fallbacks. (Built 2026-10-09.)
6. Motives, schedules and little stories (the former "brains" track) on top of this loop.

## Showing the state to the player (2026-10-09)

Like a Farm Animal ("Cow is grazing. 3m 2s"), a Citizen tells you what it is doing in two
places, both from `GameFeatures/NPCs/citizenStatus.js` (pure; strings 17501-17513, 17515):

- the board tooltip (hover, or long-press on touch): name, the state line, the time left in
  that state;
- the top of its panel (NPC panel for talkers, Farm Hand panel for workers):
  `CitizenStatusLine.js`, reading the live NPC every second.

Working is told per worker and task (Lumberjack: heading to a tree / collecting the wood /
carrying wood to the Warehouse; Rancher, Farm Hand, Crafter one line each; talkers "is
working."). Waiting reads "is waiting for you." on the board and in the panel. A worker
switched off with its panel's "Automatically work?" box (`npc.autoWork`, saved on the NPC record;
default on, except the Crafter, owner 2026-10-09) stands by near home through its working state:
"is standing by." A citizen with no state loop shows nothing new.
