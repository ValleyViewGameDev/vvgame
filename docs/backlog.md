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
- **W-11. Original valley grid templates, made by Claude** (added 2026-10-09). An ongoing
  process: a template for every valley0-3 grid, built in passes (geography everywhere first,
  then tiles / resources / enemies, then sets, mini-towns and regions), following
  `docs/SoE - GRID DESIGN.xlsx` only where no manual template exists (existing work always
  wins). Design doc and log: `docs/making-original-grids.md`; scripts in `tools/gridgen/`.
  Eight phases (doc §1). Done 2026-10-09: the six Haunted River grids (1015166, 1015167,
  1015176, 1015177, 1015260, 1015270) and **phase 1, the base build** (all 1,915 valley grids
  that had no template), with iterations on the Haunted River, Hell's Mouth, Demon Horn Lake
  and Star Lake. Phase 2 (mountain ranges) in progress: Prospero's Range (the C), the King's
  Circle north bank range (slate, hugging the river), The Swoop (a C on grass), and mountain
  seams closed across grid edges everywhere (a seam only as wide as its range). Ground passes
  (2026-10-09/10): organic slate edges across the south-east (`slate_blend.mjs`); lava islands
  of dirt and stone and the lava run down to the river's north bank in 1015435-1015530
  (`lava_rules.mjs`); the big dirt region between the Haunted River and the King's Circle in
  settlement 5_2, with soft grass patches, coyotes, and slate through the King's Circle gap
  (`ground_regions.mjs`, owner grids painted on request); the oasis sand from 1012562 east
  dropped (`feature_overrides.json`) and a sand beach on the King's Circle's east bank from 1013522
  to 1013554 instead (2026-10-12). Phase 6 (river and lake banks) done 2026-10-12 (`banks.mjs`:
  dirt banks 1-3 tiles, slate near slate, the owner's banks, sand, lava and towns left alone).
  Phases 3-5, 7, 8 not started.
- **W-12. More dungeons** (added 2026-10-09). Design and build more dungeon templates (editor
  Dungeons tab, `layouts/gridLayouts/dungeon/`). A future pass, after the valley grids.
- **W-13. A new character with his hut on Hell's Mouth's peninsula** (added 2026-10-09). The
  long skinny peninsula at 1016632, in Hell's Mouth Lake (the devil's grin), is a place the
  owner likes: create a new character and put his hut there. Character to be designed; the hut
  and the character go in with phase 3 (towns and scenarios) of W-11.
- **W-14. Refine and place the Coyote Dens** (added 2026-10-17). First-stab mini templates
  `coyoteDenEast` and `coyoteDenWest` (`game-server/layouts/gridLayouts/miniTemplates/`, 15x15):
  slate with Rocks to harvest for Stone, Coyotes and 2 Coyote Spawners, small mountains on three
  sides, Pine Trees blocking the entrance that the player cuts through. Owner to hand-edit them,
  then place one immediately next to each town, so every new player faces a small combat
  scenario on first reaching the valley.
- **W-15. Redo the Town template, then make E, S and W variations** (added 2026-10-17). First
  re-do the current Town template; then make three variations of it for the E, S and W towns,
  each with its entrance facing the valley (`game-server/layouts/gridLayouts/town/`, today
  townN / townE / townS / townW).
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

- **T-2. Sort out the gem cost function** (added 2026-10-14). For some items the gem cost to buy
  or finish with gems is astronomical. Find which items and why, and fix the function. Start at
  `game-client/src/Economy/GemCosts.js` (`calculateGemPurchase`, used by ResourceButton's gem
  button) and each resource's `gemcost` in `game-server/tuning/resources.json`.
- **T-4. The Tailor skill costs 100 Potion C** (added 2026-10-16; the rest of the Ink pass was
  done the same day: the Book is now Money + Thread + Cloth, the Library is built from Wood, Stone
  and Thread, Runic Tunic moved to L17, Ghosts drop a Book, and the Long Sword / Flurry quests
  came back to L9 / L13). Tailor (L12) costs 500 Money + 100 Potion C, and each Potion C is a
  Potion B + 12 Sunflower + 2 Ink + 1 Feverfew, so it really opens at Ink's L17 and needs
  hundreds of rare crops. Feste's "Needle and Nobility" (acquire Tailor) sits at L17 because of
  it. Re-cost Tailor (fewer Potion C, or Potion B instead) and bring that quest back toward L12.
  Start at `Tailor`, `Potion C` in `game-server/tuning/resources.json`; re-run the quest level
  check afterwards.
  **Built 2026-10-22:** Tailor (L12) costs 500 Money + 10 Potion A; Potion C cannot exist before
  Ink (L17), so no skill before then asks for it (docs/tuning.md §4i).

- **T-5. Split combat quests into early and late givers** (added 2026-10-16). Cassio's
  quests (kill Coyotes, Bears, Spiders, sell Pelts, then Duke Angelo for the Skeleton Key) are
  early-combat aspiration and motivation, but Cassio sits behind the Golden Key door in Town, so
  he should be the later-stage combat quest giver. Give the early combat quests (Coyotes and
  the like) to an NPC the player meets early, such as Hotspur (behind the Town Door, Town Key),
  and keep Cassio for the late-stage ones. As a stopgap Cassio's quests were pushed to levels
  8-12 on 2026-10-16. Start at the Cassio and Hotspur rows of
  `game-server/tuning/quests/questsEN.json` (quest `title` is a persisted id: move a quest by
  changing its `giver`, never by renaming).
  **Built 2026-10-22:** Hotspur now gives the Coyotes (L8), Pelts (L8) and Bears (L9); Cassio keeps
  the Spiders (moved to L13) and Duke Angelo (L12).

- **T-6. Give Blueberries a real source** (added 2026-10-16). Blueberries appear in no valley
  template (`node tools/wild-crops.js Blueberry`), their plot (`Blueberry Plot`) is
  developer-only with no level, so the only supply is scrolls (uncommon). Yet the Queen's Cake
  needs them and Mistress Quickly pays 10 as a quest reward. Decide where they come from (lay
  them into some valley templates, open the plot at a level, or both), then set price, quest
  asks and level to match their rarity (docs/tuning.md §4h). Start at `Blueberry`,
  `Blueberry Plot`, `Queen's Cake` in `game-server/tuning/resources.json`.
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

- **OB-1. Agree the phases and write `docs/early-game.md`** (added 2026-10-24). **Built
  2026-10-24.**
- **OB-2. Make the game feel instant: trust the client, validate behind it** (added 2026-10-24,
  re-scoped the same day). Movement itself is done: the held-key loop (90 ms a tile, first step
  at once, 220 ms hold delay), the Pixi camera, coalesced React syncs and tap-to-walk were built
  2026-10-03 (`refactor-plan.md` Phase 4 B+D); what is left there is the owner's feel check on a
  phone. The rest of the "laggy" feel is actions that still let a server answer overwrite what
  the client already showed (the optimistic-UI house rule: react on the tap, validate in
  parallel, revert only on a real refusal, then sweep up). Known cases:
  - **Crafting queue collect (owner, 2026-10-24, good connection).** Collect several finished
    crafts in a row and the earlier ones reappear for a beat, then vanish again. Likely shape (to
    confirm in `CraftingStation.js` / `FarmHouse.js`): each collect's response carries the whole
    slot list as the server saw it, and an older response lands after a newer local collect and
    puts the collected slots back until the last response arrives. Fix shape: the client keeps
    its own collected set and ignores (or merges) responses older than its latest action, rather
    than replacing state with each reply.
  - **Still server-first** (audit §1.4, to re-check one by one in the code): craft start, gem
    purchases, Trading Post list / sell / collect, Skills / Buy / Build purchases, pet feed,
    scroll craft, Farm House hire. Quest rewards already react on the tap.
  Where the wait comes from: the owner's hypothesis is the database (Atlas, one US West region)
  rather than the API server; confirm by timing a request's server-side handling against its
  round trip (where Render runs the API vs the Atlas region, and the Mongo time inside a route).
  Out of scope: very poor networks such as airplane Wi-Fi (owner): solve for ordinary mobile
  and home connections. Start at `docs/audits/client-review-2026-10-03.md` §1.4 and the crafting
  collect path.
- **OB-3. End the FTUE on Elbow's first story step, open loops and a glimpse of the Quest for
  Hope** (added 2026-10-24, revised for the story). The FTUE is Act I's opening: Elbow finds the
  stranger in the sea cave and the last beat should hand the player to his chain. Today the FTUE
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

- **OB-4. Make the walk to Helena a real first trip into the Valley** (added 2026-10-24,
  revised for the story). Elbow's "More Things in Heaven and Earth" (L5, Meet Helena) now carries
  the pull (the first valley quest was L8). Reaching her is easy: she stands one grid south of
  town (copies of her will stand on every grid south of a town, for when settlements fill with
  players; for tuning, treat her as one grid south of town), so no wayfinding work is needed. What
  it lacks is something for her to give on arrival: her first quest is the Golden Key at L8, so a
  player who meets her at L5 finds nothing to do for three levels. Add a short Helena starter at
  L5-6 that teaches foraging (Rosemary and Daisy, the Potion A herbs, leading into Portia's L7
  potion), and check the wild crops and enemies on her grid suit an L5 player. Start at
  `questsEN.json` (Helena, quest 116) and her grid's layout.
  **Built 2026-10-24**: Helena's "I Know a Bank Where the Wild Thyme Blows" (quest 128, L5):
  collect 6 Rosemary (17 on her grid), reward 2 Daisy, so with 16 Milk the player can make the
  Potion A Portia asks for at L7; her ask (string 16520) teaches that wild herbs grow back where
  picked. Checked: her grid's Coyotes are L3-fitted, fine at L5; Rosemary has no level gate.
  Open: her grid has 1 Daisy, so her L8 Daisy quest (50) leans on the wider Valley.

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
- **OB-8. The Queen's waking as the early game's finale** (added 2026-10-24). Gertrude wakes at
  L14-15 (Helena's "Rosemary, for Remembrance", Feste's "If Music Be the Food of Love", Elbow's
  "Be Stone No More"; `story.md` §0): Act II's end and the exit from the early game. Check it
  lands as a finale: reachable about day 10, rewarded like a milestone, and followed by the mid
  game opening up (Elbow's later steps open as a set). Also the live migration for players who
  already passed it (`scripts/wake-gertrude-for-friends.js`, `narrative-pass.md` §6). Start at
  `GameFeatures/Story/gertrudeWaking.js` and `utils/storyState.js`.
  **Partly built 2026-10-24.** Checked: reachable at L15, not earlier (Feste's quest is L15;
  Helena's L14 step is 12 Rosemary, Feste's is 5 Thread from the L7 Loom, both easy), and Elbow's
  later steps open on "Be Stone No More" (L15, which also needs the Crown, so the Crown and the
  Queen together unlock the mid game). Built: the Queen's gift, mailed once on the first waking
  (messages.json 7 "A Gift from the Queen", Money 10000 + Gem 25, neverPurge;
  `routes/storyRoutes.js`); its note says the rest of the story opens and Elbow has more to ask.
  The migration (`wake-gertrude-for-friends.js`) sets the flag directly, so players it wakes get
  no gift. Open: "about day 10" needs OB-7's level timestamps (L15 is 2,960 xp).
- **OB-9. A just-in-time lesson for Snug travel** (added 2026-10-24). The mid game's wild crops
  come from outposts: a valley region found once is reached again with Snug, its Trading Post
  ships goods home, and the crops regrow in one to three days (`tuning.md` §4h, `node
  tools/progression.js --regions`; Sunflower Lake is the Potion C outpost). Nothing teaches that.
  The first time a player stands in a valley town they found, show how Snug brings them back,
  and that the Trading Post sends goods home. Start at `GameFeatures/NPCs/SnugTravelModal.js` and
  the region-entry notice in `Utils/GridManagement.js`.

### BL-1: "Add to Home Screen" prompt in the FTUE (iOS and Android)

**DONE 2026-10-06** as `UI/Modals/InstallPromptModal.js` (docs/onboarding-plan.md phase D): not an FTUE step but the crop harvest after the email ask, phone browsers only, never inside the installed app, "Not now" remembered per device in localStorage; iOS gets the Share → Add to Home Screen text, Android the captured `beforeinstallprompt`. The standalone-fetch retry posture from House was not ported.

**What.** A step in the first-time-user flow that invites the player to install the game on
their home screen, surfaced once, at a moment of earned goodwill (after the first homestead
visit or the first harvest, not on the login screen), with "later" remembered so it never
nags. On iOS the prompt is instructional (Share → Add to Home Screen, with the two icons);
on Android/Chrome it calls the `beforeinstallprompt` event that was captured earlier.

**Why.** A page cannot hide the browser's own bars; in landscape on iPhone a tap at the top
edge brings Safari's toolbar back and takes a strip of the board (owner, 2026-10-04). The
installed app runs without browser chrome in both orientations, gets the full screen, keeps
its orientation, and is the only route to iOS web push later. Everything the install needs
is already in place: `game-client/public/manifest.json` (name, icons, `display: fullscreen`,
`orientation: any`, green theme) and the `apple-mobile-web-app-capable` /
`apple-mobile-web-app-status-bar-style` / `apple-touch-icon` tags in `public/index.html`.

**Leverage House.** House already runs as a standalone PWA on iOS and learned the hard
lessons: `house/game-client/index.html` (the "Add-to-Home-Screen / PWA chrome" block),
`house/game-client/api.js` (fetch behaviour that differs inside the iOS standalone PWA: a
dropped request every so often, retried with backoff in `app.js` around the card fetch), and
`house/docs/crm.md` §"iOS PWA install prompt" (rule: surface the prompt only after a real
first success, never before; expect a single-digit install rate, so it is a quality-of-life
step, not a growth lever). Reuse the detection (`window.matchMedia('(display-mode:
standalone)')` / `navigator.standalone`) so the prompt never shows inside the installed app,
and copy the retry posture for `axios` calls when running standalone.

**Where to start.** `game-client/src/GameFeatures/FTUE/FTUE.js` and
`game-server/tuning/FTUEsteps.json` (a new step type `installPrompt` with its own modal in
`UI/Modals/`), a `dismissedInstallPrompt` flag on the Player (or localStorage, since it is
per device), and `App.js` to capture `beforeinstallprompt` into a ref at boot. Copy in
`UI/Strings/*.json` for all ten languages (the six English stubs just need the English).

**Done when.** On a phone browser the prompt appears once at the chosen FTUE step with the
right instructions for the platform; inside the installed app it never appears; "later" is
remembered; the installed app launches straight into the game full-screen in both
orientations.
