# Backlog

Loose list of work that is agreed but not scheduled. One entry per item: what, why, and
where to start. Items move to `refactor-plan.md` (or a feature doc) when they get a slot.
Keep done items out of here; the git log is the record.

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
- **W-6. Make Regions matter more to gameplay.**
- **W-7. Finish all the storyline threads between Citizens.** Related to the NPC / Combat
  epic's Track 4 (Citizens: socializing and motives, docs/citizens.md), which is the behaviour
  side; this is the story side.
- **W-8. Better surface the Quest for Hope** and create more motivations for players to explore.
  (2026-10-24: the "more motivations" half moved to the Onboarding & Early Game epic, OB-3 and
  OB-5.)
  The Quest for Hope UI must let players tap an uncollected item to see what it is (added
  2026-10-09).
  **Built 2026-10-11:** the seven Quest for Hope slots (Player Character and Leaderboard panels,
  `GameFeatures/Social/HopeQuest.js`) show a very faint icon of each uncollected artifact; tapping
  the title or any slot opens `QuestForHopeModal.js` (the seven listed with icon and name, OK
  button), and tapping an uncollected one opens a small "Hint:" modal with a riddle (strings
  200803-200817; EN, DE, ES, FR; the partly translated languages fall back to English). The
  "more motivations to explore" half is still open. Not yet checked in the live game.
- **W-11. Original valley grid templates, made by Claude** (added 2026-10-09). Every valley0-3
  grid now has a template (phase 1, 2026-10-09: the 1,915 that had none). Design doc, phases
  and log: `docs/making-original-grids.md` (§1 phases, §11 log); scripts in `tools/gridgen/`.
  Done: phase 1 (base build), phase 2 mountain ranges (Prospero's Range, the King's Circle north
  bank, The Swoop, the north-south range down column 29 with its pass, seams closed across grid
  edges), phase 6 river and lake banks (2026-10-12), plus the ground passes (slate edges, lava
  islands, the settlement 5_2 dirt, the King's Circle sand beach). **Remaining:**
  - Phase 3, towns and scenarios (mini-towns, sets, the spreadsheet's emoji anchors): only the
    Haunted River's Drowned Scriptorium and ferry landing exist. This is the same work as W-3
    and W-6 (making the grids interesting and Regions matter), so do it under those.
  - Phase 4, roads: a valley-wide pass. Started 2026-10-14 (`roads.py`, `data/roads.json`):
    the Town's south road, the hamlet road through the column-29 pass, a T off the river road in
    1012205. Re-run `roads.py --apply` after any `phase1_build.mjs` rebuild.
  - Phase 5, trees: smooth out repeating tree patterns (doc §8a).
  - Phase 7, enemy balance across the valley (by ring and level).
  - Phase 8, final polish.
- **W-12. More dungeons** (added 2026-10-09). Design and build more dungeon templates (editor
  Dungeons tab, `layouts/gridLayouts/dungeon/`). A future pass, after the valley grids.
- **W-13. A new character with his hut on Hell's Mouth's peninsula** (added 2026-10-09). The
  long skinny peninsula at 1016632, in Hell's Mouth Lake (the devil's grin), is a place the
  owner likes: create a new character and put his hut there. Character to be designed; the hut
  and the character go in with phase 3 (towns and scenarios) of W-11.
- **W-17. Re-do the dungeon templates for the new stone walls** (added 2026-10-21). The stone
  wall rendering has changed: walls and fences now join up (`wallSet` on the resource row,
  post + spokes + runs composed from the N/E/S/W mask by `PixiRendererWalls.js`, no diagonals;
  `docs/walls.md`). The dungeon templates were laid out before that and need re-doing so their
  walls read well with the joined rendering. Start at `game-server/layouts/gridLayouts/dungeon/`
  (editor Dungeons tab) and `docs/walls.md`.

### EPIC: UI Updates ("UI", opened 2026-10-09)

Added 2026-10-09.

**What.** Interface polish across the HUD and panels. Tasks are numbered UI-n (append-only).

UI-1 (HUD timers), UI-2 (Town News revamp) and UI-3 (Discord on How to Play) are done and
verified by the owner (2026-10-14).

- **UI-4. A live gameboard behind the Begin screen** (added 2026-10-15). Today the loading /
  "Begin the Adventure" screen shows a static board. Make it a real gameboard on a custom,
  bespoke grid (homestead type) built for this: a small farm, but still mostly trees. A couple
  of farm workers work it autonomously, so the moment before the player starts feels alive and
  immersive.

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

- **OB-3. End the FTUE on Elbow's first story step, open loops and a glimpse of the Quest for
  Hope** (added 2026-10-24, revised for the story). The FTUE is Act I's opening: Gertrude's spirit
  speaks to the stranger in the sea cave (16019, owner 2026-10-25) and sends them to Elbow, and
  the last beat should hand the player to his chain. Today the FTUE
  ends around L2 (it gives about 20 xp; L3 needs 25), so his first step ("I Do Lean Upon
  Justice", L3) is not on screen when the FTUE ends. Either the last beats carry the player to
  L3 or the step opens at L2; then the last toast names something ready later (crops, Kent's
  orders), a reason to return tomorrow (a day-2 gift) and the seven dark boxes. Build the
  structure here; the narrative pass (P4) writes the words, including the intro (string 16019,
  still the old "evil scourge" tale). Start at the last steps of `FTUEsteps.json` (final toast
  7065), Elbow's quest 115, `HopeQuest.js`.
  **Built 2026-10-24 (structure, with first-draft words):** step 18 (Grower) shows Elbow's new
  line 16521 and adds quest 115 (`addQuests`); toasts 7059 (greet the three, then home) and 7065
  (crops, Elbow's next task, the Quest for Hope) rewritten in EN / DE / ES / FR (the six
  English-only files take the English 7065); `NPCsPanel.js` lets a held, completed quest be
  claimed below its level, since the FTUE ends near L2 (about 20 xp; L3 needs 25) and quest 115's
  15 xp is what brings L3. Not yet played through. Open: P4's re-voice of the toasts (these are
  plain first drafts).
  **Day-2 gift built 2026-10-24** (on top of the daily drip, message 5): a new player who finished
  the FTUE and opens the game on a later calendar day (their own timezone) gets one Mailbox gift,
  message 6 "Welcome back to Elsinore!" (Money 3000, Gem 25, Wood 50; the welcome gift is 500 /
  25 / 5). `utils/returnGift.js`, called from `/api/update-last-active` (the client now sends
  `tzOffset`); `player.returnGift` is false on new accounts, unset (never sent) on older ones;
  the claim is atomic. The last toast (7065) promises it.

- **OB-5. The King's Crown as the first-artifact moment** (added 2026-10-24). Golden Key from
  Helena (L8, friend, 50 Daisy), the Castle in Belmont (1011165), the King's Crown at about
  L10-11. Claiming it plays a story modal at the Castle, then the Oracle mails a message that
  lights box 1 and gives the next artifact's hint. First check that a level 8 player can
  reasonably be Helena's friend; if not, the D7 artifact slips. Start at the Castle and Helena
  in `game-server/tuning/resources.json` / `traders.json` / `questsEN.json`, `story.md` §4,
  `GameFeatures/Social/QuestForHopeModal.js`.
  **Partly built 2026-10-24:** the friendship gate checked (no cooldowns; friend in one visit:
  Greet, a few Talks, Make Friends at 35+). The four Ogres on 1011165 gave way to two Bears and
  the Great Bear (fitted for L10, `artScale` 1.5, a new NPC column); quests: Hotspur's "We Pluck
  This Flower, Safety" (L9, Light Armor + Buckler) and "Exit, Pursued by a Bear" (L10), Helena's
  "Uneasy Lies the Head" (L10, buy the King's Crown; retired in OB-6, Elbow's Find step carries
  it); Helena's friend dialog fixed (it asked for
  Feverfew, the quest wants Daisies) and her interest "Rosesmary" spelled right; the Crown hint
  names Belmont and the bear (`docs/early-game.md` §3).
  **Built 2026-10-24:** the found moment for all seven artifacts (`GameFeatures/Social/HopeFound.js`
  + `POST /api/hope/found`, `player.hopeFound`): a story modal on the find (strings 200830-200836)
  and the Oracle's letter with the next artifact's hint (messages.json 401-407). And no
  friendships before L16: a quest list opens at relationship score 10 (one Greet), every quest at
  L15 and under is ungated (18 quests), Titania's Secret moved to L16, Constable Elbow's Dungeon
  Key needs no friend, and Helena's Greet dialog (16006) now carries the Daisy ask.

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

### BL-2: Real session auth in place of the bare `x-player-id` header

Added 2026-10-30.

**What.** Every privileged check on the server (`requireDeveloper` in
`game-server/utils/developerHelpers.js`, `requireDeveloperOrSelf` in `routes/playerRoutes.js`,
the maintenance gate in `utils/serviceMode.js`) trusts the `x-player-id` header, which is only
a player's Mongo id, not a secret. Player ids appear in other API responses, so anyone who
finds a developer's id can call the admin routes. Replace it with a signed session token
(issued at login / silent signup, verified server-side), and derive the caller from it rather
than from the header or a `playerId` in the body. Found while closing the open admin routes
(commit 7df2ac65); flagged as a launch-readiness gap before the next ad buy.

### BL-3: Walk-over collects lost on a slow connection

Added 2026-11-03.

**What.** On a slow connection (owner, hotspotting through a phone) the owner walked over 12
Rosemary doobers in ftuetester's Town; every one vanished from the board, but only 8 reached the
server, so Helena's "Rosemary, for Remembrance" counted 8. Waiting a long time never caught it up.
The client saw all 12 collects; it should keep each one until the server confirms it, retry the
ones that failed or timed out, and eventually credit every collect the player made, the
backpack, quest progress and xp included.

**Where to start.** Walk-over collection goes through `handleTileClick` (App's `onEnterTile`)
into `ResourceClicking.js` `handleDooberClick`, which since Phase 5 (2026-11-04) is ONE request,
`POST /api/action/harvest`. A request with no answer at all (`postAction` status 0) currently
keeps the doober gone and the predicted count without retrying: give those calls a durable retry
queue (the server answers 'gone' for a tile already collected, so a retry can never grant twice).
A phone hotspot is an ordinary mobile connection; airplane-grade networks are out of scope.
