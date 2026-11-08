# Backlog

Loose list of work that is agreed but not scheduled. One entry per item: what, why, and
where to start. Items move to `refactor-plan.md` (or a feature doc) when they get a slot.
Keep done items out of here; the git log is the record.

## Launch blockers

Flagged by the owner 2026-11-08: these must be done before the launch (the next ad buy). Each
item keeps its full entry below and carries **LAUNCH BLOCKER** in its heading.

- **BL-2.** Real session auth: today any client can act as any player whose id it knows (delete
  their account through `/delete-player`'s "self" check, spend their holdings on every
  `/action/*` route), and a developer's id opens the admin routes.
- **BL-17.** Final art for the player avatars and every NPC (the enemies, Fairy, Santa Claus,
  The Porter, the Oracle, the quest-giver and speech glyphs).
- **BL-16.** Final art for the twelve Zoo animals (the Zoo panel's pets); the farm animals are
  done (2026-11-08).

## Open

### EPIC: NPC / Combat System overhaul (opened 2026-10-07)

**What.** The combat loop, NPC movement, the server trust model for fights, enemy brains,
citizen brains and a tuning pass. Parent document with file:line findings:
`docs/audits/combat-and-npc-review-2026-10-07.md`. NPC kinds (owner, 2026-10-08): Enemies
(`attack`), Spawners (`spawn`), Citizens (`quest`/`trade`/`heal`/`worker`) and Farm Animals
(`graze`). Tracks: 1 action loop (built), 2 kill route (built), 3a movement feel (built),
3b Enemies with a movable home + leash (built 2026-10-09), 4 Citizens (shared idle/roam, then motives/habits),
5 tuning (done 2026-10-21).

**Owner's framing.** Casual, timing-game combat with strong board feedback and little UI to
process; the fight simulated on the client with one outcome request after a kill; NPCs that
read as alive (per-NPC cadence, pauses, home anchors, A\*); town "brains" (motives, habits,
little stories, lighter than SimGame) as the even-more-future track; enemies get a simpler
brain.

**Next.** The rest of Track 4 (Citizens: motives, schedules, stories). Track 5 (tuning) is done (owner, 2026-10-21).

### EPIC: Build the World ("World", opened 2026-10-09)

Added 2026-10-09.

**What.** Make the world itself the content: finished and more interesting grid templates,
final Regions that matter to play, the Citizens' storylines tied off, and stronger reasons to
explore, with the Quest for Hope as the spine. Tasks are numbered W-n (append-only).

- **W-1. Write `docs/world-design.md`.** The design doc this epic needs: regions, template
  inventory, storylines, exploration motivations. Not written yet.
- **W-3. Iterate on existing templates** to create more interesting scenarios.
- **W-11. Original valley grid templates, made by Claude** (added 2026-10-09). Every valley0-3
  grid now has a template (phase 1, 2026-10-09: the 1,915 that had none). Design doc, phases
  and log: `docs/making-original-grids.md` (§1 phases, §11 log); scripts in `tools/gridgen/`.
  Done: phase 1 (base build), phase 2 mountain ranges (Prospero's Range, the King's Circle north
  bank, The Swoop, the north-south range down column 29 with its pass, seams closed across grid
  edges), phase 6 river and lake banks (2026-10-12), plus the ground passes (slate edges, lava
  islands, the settlement 5_2 dirt, the King's Circle sand beach). **Remaining:**
  - Phase 3, towns and scenarios (mini-towns, sets, the spreadsheet's emoji anchors): only the
    Haunted River's Drowned Scriptorium and ferry landing exist. This is the same work as W-3 (making the grids interesting; W-6, Regions, closed 2026-11-05), so do it there.
  - Phase 4, roads: a valley-wide pass. Started 2026-10-14 (`roads.py`, `data/roads.json`):
    the Town's south road, the hamlet road through the column-29 pass, a T off the river road in
    1012205. Re-run `roads.py --apply` after any `phase1_build.mjs` rebuild.
  - Phase 5, trees: smooth out repeating tree patterns (doc §8a).
  - Phase 7, enemy balance across the valley (by ring and level).
  - Phase 8, final polish.
- **W-12. More dungeons** (added 2026-10-09). Design and build more dungeon templates (editor
  Dungeons tab, `layouts/gridLayouts/dungeon/`). A future pass, after the valley grids.
- **W-17. Re-do the dungeon templates for the new stone walls** (added 2026-10-21). The stone
  wall rendering has changed: walls and fences now join up (`wallSet` on the resource row,
  post + spokes + runs composed from the N/E/S/W mask by `PixiRendererWalls.js`, no diagonals;
  `docs/walls.md`). The dungeon templates were laid out before that and need re-doing so their
  walls read well with the joined rendering. Start at `game-server/layouts/gridLayouts/dungeon/`
  (editor Dungeons tab) and `docs/walls.md`.
- **W-18. Two or three more Mirror Key rooms around the world** (added 2026-11-05). Easter eggs
  for whoever holds the Mirror Key (Leontes trades it, as a friend, for the six Secrets): small
  hidden rooms behind a Mirror (deco, `action: door`, `requires: Mirror Key`), like Duke Angelo's
  bedroom on 1014204 (a bed, books, two Scrolls). Today the Mirrors are Windsor's way to the
  Phoenix (1012276), Angelo's room, and Acheron's fog bypass (1014571); keep those. A room
  rewards with a few precious finds, not a Quest for Hope artifact. Check each with the editor's
  QUEST FOR HOPE tab (Keys and doors).


### EPIC: UI Updates ("UI", opened 2026-10-09)

Added 2026-10-09.

**What.** Interface polish across the HUD and panels. Tasks are numbered UI-n (append-only).

UI-1 (HUD timers), UI-2 (Town News revamp) and UI-3 (Discord on How to Play) are done and
verified by the owner (2026-10-14).
UI-4 (a live gameboard behind the Begin screen) is done (2026-11-08): the login scene,
docs/login-scene-plan.md.

### EPIC: Spells (opened 2026-10-09)

Added 2026-10-09.

**What.** A third kind of combat item after Weapons and Armor: Spells, including consumables.
Related to the NPC / Combat epic (combat loop, `GameFeatures/Combat/Combat.js`). Tasks are
numbered SP-n (append-only).

- **SP-1. Spells as a combat function**, alongside weapons and armor, including consumable
  spells.
- **SP-2. The spells themselves** (the set of spells and what each does).
- **SP-3. Spell VFX.**
- **SP-4. Spells for sale at the Magic Shop.**
- **SP-5. The Porter's potions for Scorpions** (added 2026-11-07). The Porter (Macbeth's porter of
  hell-gate, his stone hut behind a Mirror on the Hell's Mouth spit, 1016632) trades 10 Scorpions
  for 75,000 Money today (`traders.json`). Once consumables exist (SP-1), he also gives potions
  for Scorpions: Scorpion Oil, the Renaissance cure for poison, as a one-fight ward against the
  fire and venom of Demons, Cerberus and Dragons. Scorpions only drop from Demons (L28) and have
  few sinks (54 over a whole account, all one-time), so this is a repeatable one.

### EPIC: Tuning ("T", opened 2026-10-10)

Added 2026-10-10.

**What.** Economy and progression tuning: level gates, recipes, prices, pacing (rules in
`docs/tuning.md`). Combat tuning stays in Track 5 of the NPC / Combat epic. Tasks are numbered
T-n (append-only).

### EPIC: Onboarding & Early Game ("OB", opened 2026-10-24)

Added 2026-10-24.

**What.** Pull a new player from the first session through the early game (L1 to L15) and into
an open mid game, for strong D1 and D7 retention. The canonical design is `docs/early-game.md`:
the phases by level (FTUE L1-3; early game L3-15 split early-early 3-6, mid-early 6-10,
late-early 10-15; mid game 15-30 with early-mid 15-20; late 30-50; elder 50+), what each phase
teaches, and where the first Quest for Hope artifact lands (the King's Crown, about L10-11, day
5-7). Revised 2026-10-24 for the approved story (`story.md` §0, `narrative-pass.md`): the acts sit on the phases (`early-game.md` §1b); Constable Elbow's story chain (L3-55) carries the WHY, one step at a time in the early game; the Shepherd teaches the homestead; the early game ends when the Queen wakes (L14-15); and no friendship is required before L16. It takes over the "more motivations to explore" half of W-8 (the Quest for Hope slots and
hints were built 2026-10-11). The first session's account / email / FTUE mechanics stay in
`docs/onboarding-plan.md`. Tasks are numbered OB-n (append-only).

- **OB-6. Close the quest gaps** (added 2026-10-24, revised for the story). L11 has two quests;
  selling to Kent is taught in the FTUE and then only once (Hotspur's Pelts, L8); and between
  Elbow's L18 and L30 steps the mid game has no story step (L16-30 is where the open goals must
  carry the player). Helena's "Uneasy Lies the Head" (L10, buy the King's Crown) now duplicates
  Elbow's "A Crown for the King" (L10, Find the King's Crown): retire one (the story step is
  Elbow's). Start at `node tools/progression.js --to 35` (quests by level).
  **Quick fixes built 2026-10-24:** Helena's "Uneasy Lies the Head" retired (it was new and
  unshipped), so Elbow's "A Crown for the King" is the Crown's only quest; L11 gains the
  Shepherd's "What, You Egg!" (quest 129: craft 10 Egg in the Chicken Coop, pays 8 Olive, one
  Olive Bread's worth once Baker opens at L11; the Shepherd had nothing from L9 to L15).
  **Kent built 2026-10-24:** a new goal, `Serve Kent` (one per Kent order filled, whatever it
  was, so it is always completable; `Kent.js` tracks it, the editor's goal enum has it), and three
  Shepherd quests on it: "I Earn That I Eat" (L4, 5 orders, Money 400), "Neither a Borrower Nor a
  Lender Be" (L9, 12, Money 2000), "Put Money in Thy Purse" (L21, 30, Money 5000; L21 had none).
  The FTUE's last toast (7065) says "keep selling to Kent" again (the OB-3 rewrite had lost it).
  **Story gap built 2026-10-24** (the L18-30 gap sits in a wider one: L19-29 hold 0-2 quests a
  level): two Elbow `Meet` steps in the post-Queen set (prereq "Be Stone No More", Gem 3 each),
  L21 "A Sad Tale's Best for Winter" (Meet Leontes, 1012276; string 16514) and L27 "This Thing of
  Darkness" (Meet Caliban, 1012265, who knows the way to Hecate at L30; 16515), both naming the
  Oracle. **No quest to meet the Oracle** (owner, 2026-10-24: she IS the Quest for Hope): the
  Quest for Hope modal now opens with where the seven go ("The Oracle, in her Sanctuary deep in
  the Valley, will trade Hope for these seven lost treasures. Find them, then find her.", 200860),
  and other characters should mention her in their own lines (for the narrative pass, P2/P3:
  quests other than Elbow's carry no text yet). Open: the other givers' mid-game quests (L19-29):
  17 drafted in `docs/midgame-quests-draft.md` (not built; revised after the owner's review:
  Hotspur's regional quests become a new `Discover <region>` goal; Helena adds Discover Sunflower
  Lake (L16) and Forest of Arden (L18), the Potion C outposts). Florist checked: measured by
  outposts (Snug + Trading Post; `node tools/progression.js --regions`), 100 Potion C is about a
  week with Ink the long pole, a fair long goal; it stays.
  **Built 2026-10-24:** the `Discover <region>` goal (a state goal: `player.regionsVisited`, added
  in `setPlayerLocation`, seeded once from `gridsVisited` for older accounts in enter-grid,
  `utils/regionsVisited.js`; the client mirrors it on arrival and also counts the region the
  player stands in; editor enum) and the 20 quests (L16-29). Not yet played. Open: Elbow's L27 and
  L30 xp per the draft's reward rule (175 and about 500), if wanted.

- **OB-7. Measure pacing: level timestamps and a pacing view** (added 2026-10-24). Record when a
  player reaches each level (analytics), then add a pacing model to `tools/progression.js`
  (estimated XP per session from Kent, quests and kills) calibrated against those timestamps, so
  the play-time targets in `docs/early-game.md` §1 become measurements. Start at
  `game-server/utils/analytics.js` (`recordActivity`) and the level-up path.
  **Built 2026-10-24:** `analytics_level` (`models/analyticsLevel.js`), one write-once row per
  (player, level), from `recordLevelUps` in `utils/analytics.js`, called by the three XP writes
  (`/api/addXP`, the mailbox collect, a combat kill); the purge tool deletes it too. The pacing
  view: `node tools/progression.js --pacing [--to 20] [--since <day>]`, per level the players
  reaching it, median (p25-p75) hours since first seen, median active days, and the §1 target.
  Forward-only (empty until the deploy). Also fixed `early-game.md` §1's XP column, which read
  `xpLevels.json` one level late (L3 is 25 xp, L15 2,960, L30 81,250). Open: the modelled XP per
  session, only if the measured view leaves questions; a dashboard tab, if wanted.
- **OB-9. A just-in-time lesson for Snug travel** (added 2026-10-24). The mid game's wild crops
  come from outposts: a valley region found once is reached again with Snug, its Trading Post
  ships goods home, and the crops regrow in one to three days (`tuning.md` §4h, `node
  tools/progression.js --regions`; Sunflower Lake is the Potion C outpost). Nothing teaches that.
  The first time a player stands in a valley town they found, show how Snug brings them back,
  and that the Trading Post sends goods home. Start at `GameFeatures/NPCs/SnugTravelModal.js` and
  the region-entry notice in `Utils/GridManagement.js`.
  **Built 2026-11-05** (`GameFeatures/NPCs/useSnugLesson.js`): once per profile, a few seconds
  after a player past the FTUE arrives on a valley grid with Snug, a scrim-forced flow: tap Snug,
  Greet him if they never have (Travel needs "met"), tap "Travel with Snug"; when the Travel
  modal opens, control returns and the `snugLesson` moment is stamped (`Utils/moments.js`,
  `player.moments`, 2026-11-06). A persistent toast (string 17027) explains Snug travel. The
  Trading Post half is not taught yet.
- **OB-11. Re-lay the town so early buildings and characters sit by the entry** (added
  2026-11-05). Re-do the town layout so the lower-level buildings and characters are closest to
  where the player enters town, and the later ones farther in, so a new player meets what they
  can use first. Touch points: `game-server/layouts/gridLayouts/town/townN.json` (townE/S/W are
  derived from it by `tools/rotate-town.py`; `tools/expand-town.py` for footprints), the arrival
  tile from the Map / signpost / Snug travel, and the building and NPC levels in
  `resources.json`.

### BL-2: Real session auth in place of the bare `x-player-id` header (LAUNCH BLOCKER)

Added 2026-10-30.

**What.** Every privileged check on the server (`requireDeveloper` in
`game-server/utils/developerHelpers.js`, `requireDeveloperOrSelf` in `routes/playerRoutes.js`,
the maintenance gate in `utils/serviceMode.js`) trusts the `x-player-id` header, which is only
a player's Mongo id, not a secret. Player ids appear in other API responses, so anyone who
finds a developer's id can call the admin routes. Replace it with a signed session token
(issued at login / silent signup, verified server-side), and derive the caller from it rather
than from the header or a `playerId` in the body. Found while closing the open admin routes
(commit 7df2ac65); flagged as a launch-readiness gap before the next ad buy.

### BL-16: Art pass, Zoo animals (farm animals done) (LAUNCH BLOCKER)

Added 2026-11-07. Strategy written 2026-11-08: docs/art/zoo-animals-plan.md (zoo animals as standing props through the deco pipeline, two sheets; farm animals as walking NPCs after the Pig; footprints explicit, no state art). Farm animals DONE 2026-11-08: six side-on sprites (the Pig redrawn too, so the set matches) at `npc-<name>.svg`, every row `artFacing: right` with a per-animal `artScale` (cows 1.1, ram 1.0, pig and sheep 0.95, goat 0.85); job tools/art/jobs/farm-animals.json. Zoo animals DONE 2026-11-08: style probe (Owl on a stump, Cat sitting, Donkey; tools/art/jobs/zoo-probe.json) then the nine others (zoo-sheet.json), all twelve installed as `pet-<name>.svg` with explicit footprints (Zebra 2 x 1, Giraffe 1 x 2, the rest 1 x 1; fractional `size` gone) and artSpan per animal; PetPanel shows the art through ResourceIcon. BL-16 is complete; only BL-17 (avatars) remains of the emoji project.

**What.** Draw the farm animals (Cow, Sheep, Brown Cow, Ram, Goat, Pig: done 2026-11-08)
and the twelve Zoo pets (Cat, Poodle, Monkey, Duck, Donkey, Owl, Parrot, Eagle, Zebra,
Giraffe, Orangutan, Dodo Bird) in the game's style, on the board and in the Buy / Pets panel
cards, so the last emoji outside the characters are gone. **Why.** The emoji audit
(docs/art/emoji-audit.md) leaves animals and pets to the second-to-last art pass by the
owner's decision: after the story items, the UI chrome, the board's growing plots and
signposts, the power and skill icons and the rich status line, and before the avatars.
**Where to start.** The doober loop in docs/art/doobers.md (a sheet per family, cut with
`tools/art/icons.js`, approved on grass and dirt); animals move, so check PixiRendererNPCs'
facing flip and bob with the Pig first. No animals in any other art (building bible rule).

### BL-17: Art pass, player avatars and NPC avatars (the final one) (LAUNCH BLOCKER)

Added 2026-11-07.

**What.** The last art pass: the parts-based player avatar (docs/avatar-plan.md, scaffolded,
not on the board) in play and in the Profile / Change Icon modals, then every character that
is still an emoji: the twelve enemies (Coyote to Phoenix), the spawners if they stay visible,
Fairy, Santa Claus, The Porter, the Oracle, the RelationshipMatrix glyphs, the quest symbols
(the giver's glyph) and the conversation / speech glyphs. **Why.** Owner's order in
docs/art/emoji-audit.md: characters come last, after BL-16. When this lands the game has no
emoji left and `scripts/build-atlas.js` can drop its Twemoji step. **Where to start.**
docs/avatar-plan.md §0 for what is built; the Citizens with portraits (Kent, Portia, ...) for
the NPC rendering path; PlayerIcons.json for the 28 legacy avatars to retire.

### BL-20: `save-single-npc` trusts whatever NPC state the client sends

Added 2026-11-08.

**What.** `POST /api/save-single-npc` (`game-server/routes/gridRoutes.js`, called by
`NPCsInGridManager.updateNPC` in `GridState/GridStateNPCs.js`) writes the client's NPC record
(state, grazeEnd, hp, position, ...) into the grid as sent. A tampered client can mark a grazing
farm animal `processing` for free, which undercuts the gem price of the new
`/action/graze-speedup` (and any timer the server prices), or rewrite an enemy's hp. **Why.**
Every economic action is meant to be one `/action/*` request that takes its numbers from the
server (CLAUDE.md, Phase 5); this route predates that. Same family as BL-2 (the server trusting
the client). **Where to start.** Make the route refuse the fields an `/action/*` route owns
(e.g. a graze animal's move to `processing` before the server's own `grazeEnd`, hp rises), or
have the server derive graze state from its own `grazeEnd`; check the graze behaviour's
`updateThisNPC` calls in `NPCGrazeBehavior.js` first.

### BL-21: Rectangular footprints for deco (a 1 wide, 2 tall bed)

Added 2026-11-08. **DONE 2026-11-08**: `sizeX` / `sizeY` on a resource row (editor columns),
`game-client/src/Utils/footprint.js` + `game-server/utils/footprint.js`, every site below threaded;
verified with a temporary 1 x 2 Bed (placement highlight, blocking of the upper tile, move).

**What.** A resource's footprint is one number, `size`, and every path treats it as size x
size: the renderer (`PixiRenderer.js` tileSpan), the server's occupancy and move checks
(`worldRoutes.js` sizeOf: x..x+n-1, y-n+1..y), placement, path-blocking, the atlas slot, the
editor, the seed scripts. A bed that is 1 wide and 2 tall cannot be expressed; in the deco pass
it ships as a 1 x 1 row with tall art (artSpan ~1.3, the headboard rising into the tile behind,
like the statues), so a player can walk through the tile its head appears to stand on. **Why.**
Furniture and village pieces (bed, bench, cart, market stall, gatehouse) read better as 2 x 1 /
1 x 2 / 3 x 2. **Where to start.** Add `sizeW` / `sizeH` (default = size) and thread them
through the places above, the client's enrich of shadow tiles (AppInit.enrichGridResources)
first; artSpan stays a square around the footprint's bottom-centre.

### BL-22: More wall sets (castle wall, hedge, sandstone)

Added 2026-11-08.

**What.** The deco pass plan (docs/art/deco-pass-plan.md B1, B3) called for a crenellated
CASTLE WALL set and a clipped HEDGE set (the Green Wall's replacement), each a joining
`wallSet` of seven pieces through the walls pipeline (docs/walls.md: one plus panel + one
lone-post panel, `tools/art/walls.js`), plus a sandstone wall for the valley3 desert where
the Sand Wall stood. The owner parked walls on 2026-11-08 after the castle props landed.
**Why.** The castle set reads as a castle only with its wall; the garden has no edge piece
but the stone wall and the wooden fence. **Where to start.** `tools/art/jobs/walls.json`
(the stone set's prompts and the TALL window), then a `Castle Wall` row with `wallSet:
castle`, `decoGroup: castle;walls`.
