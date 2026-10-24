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
5-7). It takes over the "more motivations to explore" half of W-8 (the Quest for Hope slots and
hints were built 2026-10-11). The first session's account / email / FTUE mechanics stay in
`docs/onboarding-plan.md`. Tasks are numbered OB-n (append-only).

- **OB-1. Agree the phases and write `docs/early-game.md`** (added 2026-10-24). **Built
  2026-10-24.**
- **OB-2. Make player movement feel instant** (added 2026-10-24). The FTUE's toy: movement is the
  one core action that waits on its round trip, the counter-example to the optimistic-UI rule
  (`docs/audits/client-review-2026-10-03.md` §2.2; Phase 4 movement loop in
  `docs/refactor-plan.md`). Players walk every second of play, so it ranks first for "fun to play
  with". Start at `game-client/src/PlayerMovement.js` and the audit's §2.2.
- **OB-3. End the FTUE on open loops and a first glimpse of the Quest for Hope** (added
  2026-10-24). The last steps name something that will be ready later (crops, Kent's next
  orders), give a reason to return tomorrow (a day-2 gift), and have the Shepherd name the Quest
  for Hope with the seven dark boxes shown. Start at the last steps of
  `game-server/tuning/FTUEsteps.json` (the final toast is string 7065) and
  `GameFeatures/Social/HopeQuest.js`; the day-0 gift learning is in `docs/onboarding-plan.md`
  §4.4.
- **OB-4. A quest that pulls the player into the Valley at L4-5** (added 2026-10-24). Today the
  first valley quest is L8 and the FTUE ends in Town; Misty (L6, 11 quests) never left home and
  Town. Send the player to Helena's grid (1011102, the first valley grid) to forage, past the
  Coyote den, and meet Helena. Start at `game-server/tuning/quests/questsEN.json` (L4-6) and
  `tools/progression.js` (quests by level).
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
  "Uneasy Lies the Head" (L10, buy the King's Crown); Helena's friend dialog fixed (it asked for
  Feverfew, the quest wants Daisies) and her interest "Rosesmary" spelled right; the Crown hint
  names Belmont and the bear (`docs/early-game.md` §3).
  **Built 2026-10-24:** the found moment for all seven artifacts (`GameFeatures/Social/HopeFound.js`
  + `POST /api/hope/found`, `player.hopeFound`): a story modal on the find (strings 200830-200836)
  and the Oracle's letter with the next artifact's hint (messages.json 401-407). And no
  friendships before L16: a quest list opens at relationship score 10 (one Greet), every quest at
  L15 and under is ungated (18 quests), Titania's Secret moved to L16, Constable Elbow's Dungeon
  Key needs no friend, and Helena's Greet dialog (16006) now carries the Daisy ask.

- **OB-6. Close the quest gaps** (added 2026-10-24). Quests that teach selling to Kent after the
  FTUE (none after L8); at least one quest at every level through L15 so the To Do list never
  empties; then story quests for L21-35, where there are 5 quests in L21-30 and 2 above (the
  Hecate and Acheron spine). Start at `node tools/progression.js --to 35` (quests by level).
- **OB-7. Measure pacing: level timestamps and a pacing view** (added 2026-10-24). Record when a
  player reaches each level (analytics), then add a pacing model to `tools/progression.js`
  (estimated XP per session from Kent, quests and kills) calibrated against those timestamps, so
  the play-time targets in `docs/early-game.md` §1 become measurements. Start at
  `game-server/utils/analytics.js` (`recordActivity`) and the level-up path.

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
