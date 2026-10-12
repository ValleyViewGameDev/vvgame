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
5 tuning.

**Owner's framing.** Casual, timing-game combat with strong board feedback and little UI to
process; the fight simulated on the client with one outcome request after a kill; NPCs that
read as alive (per-NPC cadence, pauses, home anchors, A\*); town "brains" (motives, habits,
little stories, lighter than SimGame) as the even-more-future track; enemies get a simpler
brain.

**Next.** The rest of Track 4 (Citizens: motives, schedules, stories), then Track 5 (tuning).

### EPIC: Build the World ("World", opened 2026-10-09)

Added 2026-10-09.

**What.** Make the world itself the content: finished and more interesting grid templates,
final Regions that matter to play, the Citizens' storylines tied off, and stronger reasons to
explore, with the Quest for Hope as the spine. Tasks are numbered W-n (append-only).

- **W-1. Write `docs/world-design.md`.** The design doc this epic needs: regions, template
  inventory, storylines, exploration motivations. Not written yet.
- **W-2. Finish all the grid templates.** Every grid that still lacks a template gets one.
- **W-3. Iterate on existing templates** to create more interesting scenarios.
- **W-4. Finalize all the Regions.**
- **W-6. Make Regions matter more to gameplay.**
- **W-7. Finish all the storyline threads between Citizens.** Related to the NPC / Combat
  epic's Track 4 (Citizens: socializing and motives, docs/citizens.md), which is the behaviour
  side; this is the story side.
- **W-8. Better surface the Quest for Hope** and create more motivations for players to explore.
  The Quest for Hope UI must let players tap an uncollected item to see what it is (added
  2026-10-09).
  **Built 2026-10-11:** the seven Quest for Hope slots (Player Character and Leaderboard panels,
  `GameFeatures/Social/HopeQuest.js`) show a very faint icon of each uncollected artifact; tapping
  the title or any slot opens `QuestForHopeModal.js` (the seven listed with icon and name, OK
  button), and tapping an uncollected one opens a small "Hint:" modal with a riddle (strings
  200803-200817; EN, DE, ES, FR; the partly translated languages fall back to English). The
  "more motivations to explore" half is still open. Not yet checked in the live game.
- **W-9. Valley shops stock different goods** (added 2026-10-09). Buildings in the Valley
  (Armory, Magic Shop, ...) currently all sell the same items. Give each its own stock, so that
  finding a new mini-Town in the Valley, D&D style, makes you want to check its shops for new
  and interesting things to buy.
- **W-10. A Region-to-Region transport trader** (added 2026-10-09). A trader who instantly
  transports you to another Region, but only to Regions you have already visited.
  **Built 2026-10-12 as "Travel with Snug":** on Snug's NPC panel, once the player has greeted
  him, a "Travel with Snug" button opens `GameFeatures/NPCs/SnugTravelModal.js`: one row per
  visited Region that has a Snug (template layouts, key n13) plus the home Town, never the place
  the player is in, each with its cost and a Travel button. `game-server/routes/snugTravelRoutes.js`
  (GET destinations, POST pay + arrival tile next to Snug in the player's copy of the grid); the
  client moves with `changePlayerLocation`. Cost: `globalTuning.json` `snugTravel` (100 to 2,000,
  linear in straight-line grid distance, full price from 56 grids). Visited Regions come from
  `gridsVisited`, so existing players need no migration. Not yet checked in the live game.
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

### EPIC: UI Updates ("UI", opened 2026-10-09)

Added 2026-10-09.

**What.** Interface polish across the HUD and panels. Tasks are numbered UI-n (append-only).

- **UI-1. Timers and notifications on the HUD buttons** such as Season and Town News.
- **UI-2. Revise the Town News panel to be more interesting:** show goods with their icons, as
  other UIs do, and give the timers a different color. **Built 2026-10-09:** Courthouse / Train / Bank articles,
  goods as icon chips with quantities, countdowns in a dark-red pill; Train goods now come from
  the player's own Train (Player.train), not the settlement's legacy offers.
- **UI-3. Discord button on the How to Play panel, under the Email button;** then remove Email
  and Discord from the Map panel (formerly the base panel).


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

- **T-1. Mill crafts arrive long before anything uses them** (added 2026-10-10). In levels 7-9
  the player makes lots of Flour, Sugar and Cornmeal with nothing to do with them, because the
  Oven only unlocks at level 10. Push some of the Mill crafts back in levels. Today: Mill L4,
  Flour L4, Sugar L4, Cornmeal L5 (Chicken Feed L5), Oven L10 (`game-server/tuning/resources.json`).

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

### BL-6: Bug: exiting a dungeon placed the player on top of a wall

Added 2026-10-08. **Built 2026-10-08** on branch `backlog/bl-2-13` (1b448b76); not yet checked in the live game.

**What.** Leaving a dungeon put the PC avatar on a wall tile. The arrival position after a
dungeon exit needs to land on a passable tile (fall back to the nearest passable one if the
target is blocked).

### BL-15: Kent always offers at least one basic crop, through level 12

Added 2026-10-10. **Built 2026-10-10:** `BASIC_CROP_GUARANTEE_MAX_LEVEL` / `BASIC_CROPS` in KentOfferLogic.js; docs/tuning.md §Kent.

**What.** Around levels 8-10 Kent's offers lean too hard on progression items, so the player
is often left with no Kent offer they can fill. Through level 12, guarantee at least one Kent
offer is a basic crop (Wheat, Carrot, Corn, Sugarcane, ...), so the player can always grow,
sell, earn XP and empty a full warehouse. Above level 12 the rule goes away; the owner will
see how that feels. Touch point: the offer generator in
`game-client/src/GameFeatures/Trading/KentOfferLogic.js`.
