# Citizens: a living Town (Track 4)

Design for the Citizen kind of NPC (`resource.action` in `quest`, `trade`, `heal`, `worker`),
Track 4 of docs/audits/combat-and-npc-review-2026-10-07.md. Written from the owner's
direction of 2026-10-08; the **Open questions** at the end are what still needs agreeing
before the behaviours are built. Code: `game-client/src/GameFeatures/NPCs/NPCCitizenBehavior.js`
(the shared brain), `VFX/NPCVFX.js` (headline effects), per-type numbers in
`game-server/tuning/resources.json` (ECONOMY sheet).

## 1. What is built today (scaffold, 2026-10-08)

- All four actions route through one brain, `handleCitizenBehavior`. Inside each state the
  citizen still runs its legacy per-action behaviour (quest/trade/heal roam and freeze near
  the player; workers stand still), so nothing visible changed except:
- **The state loop runs.** working → resting → roaming → eating → socializing → working, each
  state's length a per-type field in seconds (`stateWorking`, `stateResting`, `stateRoaming`,
  `stateEating`, `stateSocializing`); 0 means the state is skipped. A citizen with no state
  fields keeps the legacy behaviour and never cycles.
- **Resting shows Zzz** above the head (`NPCVFX.startHeadlineEffect(id, 'Zzz', position)`),
  the first *headline effect*: a looping glyph above an NPC for as long as a state lasts.
  `'emoji'` headlines take any emoji (`{ emoji: '💬' }`); position follows the NPC.
- **Waiting** is in: when the player comes within `range` with line of sight, a quest, trade
  or heal citizen stops where it is, the loop's clock pauses, and it resumes the same state
  with the same time left when the player leaves. Workers never wait.

Current numbers (seconds; the owner's spec for the Lumberjack, copied to the other workers
and placeholders for the talkers until tuned):

| Action | working | resting | roaming | eating | socializing |
|---|---|---|---|---|---|
| worker (Lumberjack, Farm Hand, Rancher, Crafter, Farmer) | 600 | 1800 | 30 | 120 | 0 |
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
**Farm Hand**: work = crop harvesting. **Crafter**: work = any Crafting Station ready to
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

## 3. Open questions (need the owner before building)

1. **Lumberjack work length.** The spec says 10 min in one place and 15 min in another.
   Scaffold has 600 s.
2. **Healers.** Do they socialize like quest/trade (5 min), or only work + wait?
3. **Worker Slot.** Resting routes "back to his designated Worker Slot". Today `Worker Slot`
   is a devonly station (`resources.json`) and workers are placed by the Farm House; is the
   slot the tile the worker was hired at, or a station the player builds? (Needed for the
   resting route and as the home anchor.)
4. **Eating consumes the player's doobers.** "Consume that doober" removes a food item the
   player would otherwise collect. Intended (a running cost of keeping workers), or should
   eating be cosmetic (walk to it, eat animation, doober stays)?
5. **Work is economic.** Chopping, harvesting and crafting-collection go through the same
   client-trusted inventory routes the player uses (refactor plan Phase 5). Fine for now?
   The Warehouse-full failure needs the Warehouse capacity check the Bulk code already does.
6. **Time while away.** The loop runs only while the player is on the grid (client
   simulation). On re-entry: resume the state with the time left, or restart at working?
   And does a 30-min rest count real minutes on the grid only?
7. **Citizen-to-citizen relationships** need a home. The player's relationships live on the
   Player; citizen pairs would need storage (on the grid's NPC records, or a per-grid
   `citizenRelationships` map) and persistence rules. Start with the static
   `RelationshipMatrix.json` ("rival"/"friend"/"love" between types) and no persistence?
8. **Talkers' working length** (900 s placeholder) and the idle leash radius (3 tiles?).
9. **The waiting range**: the existing `range` (3 for most, 12 for Kent and the Shepherd)?
10. **Conversation visuals**: speech bubbles only, no modal (the player can watch); the
    player can still tap either citizen mid-conversation?

## 4. Build order (once agreed)

1. Worker Slot / home anchor + the resting route (all workers); the roaming leash.
2. Lumberjack working (nearest tree → chop → wood → warehouse → repeat; warehouse-full
   failure), then Rancher, Farm Hand, Crafter by swapping the "find work" and "do work" steps.
3. Eating.
4. Talkers: anchored working with the idle leash; waiting polish (face the player).
5. Socializing: partner choice, approach, the conversation through `ConversationManager`,
   relationship storage, the fallbacks.
6. Motives, schedules and little stories (the former "brains" track) on top of this loop.
