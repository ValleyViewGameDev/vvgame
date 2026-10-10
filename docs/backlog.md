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
- **W-5. Region names as persistent floating UI**, not only the toasts shown on entering or
  leaving a Region.
- **W-6. Make Regions matter more to gameplay.**
- **W-7. Finish all the storyline threads between Citizens.** Related to the NPC / Combat
  epic's Track 4 (Citizens: socializing and motives, docs/citizens.md), which is the behaviour
  side; this is the story side.
- **W-8. Better surface the Quest for Hope** and create more motivations for players to explore.
  The Quest for Hope UI must let players tap an uncollected item to see what it is (added
  2026-10-09).
- **W-9. Valley shops stock different goods** (added 2026-10-09). Buildings in the Valley
  (Armory, Magic Shop, ...) currently all sell the same items. Give each its own stock, so that
  finding a new mini-Town in the Valley, D&D style, makes you want to check its shops for new
  and interesting things to buy.
- **W-10. A Region-to-Region transport trader** (added 2026-10-09). A trader who instantly
  transports you to another Region, but only to Regions you have already visited.
- **W-11. Original valley grid templates, made by Claude** (added 2026-10-09). An ongoing
  process: a template for every valley0-3 grid, built in passes (geography everywhere first,
  then tiles / resources / enemies, then sets, mini-towns and regions), following
  `docs/SoE - GRID DESIGN.xlsx` only where no manual template exists (existing work always
  wins). Design doc and log: `docs/making-original-grids.md`; scripts in `tools/gridgen/`.
  Eight phases (doc §1). Done 2026-10-09: the six Haunted River grids (1015166, 1015167,
  1015176, 1015177, 1015260, 1015270) and **phase 1, the base build** (all 1,915 valley grids
  that had no template), with iterations on the Haunted River, Hell's Mouth, Demon Horn Lake
  and Star Lake. Phase 2 (mountain ranges) started: Prospero's Range (the C).
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

Already-built UI items that belong here (built 2026-10-08 on `backlog/bl-2-13`, awaiting a
live check; their entries stay below): BL-2, BL-3, BL-4, BL-9, BL-10, BL-11, BL-12, BL-13.

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

### BL-2: Floating text when collecting Gems on the Trophy panel

Added 2026-10-08. **Built 2026-10-08** on branch `backlog/bl-2-13` (2d3ac89b); not yet checked in the live game.

**What.** Collecting Gems from the Trophy panel should fire the floating-text feedback that
other collections already show, so the reward reads on the spot.

### BL-3: Panel resource buttons stay light after a tap instead of returning to green

Added 2026-10-08. **Built 2026-10-08** on branch `backlog/bl-2-13` (42b48d91); not yet checked in the live game.

**What.** Tapping a green (active) button in a panel, e.g. starting a craft at a
craftingStation, turns it light as tap feedback, but it stays light. If the player still has
the resources for another go, the button should return to green right away so they can tap
again. Inactive is still correct when the resources really are short. Appears to affect all
resource buttons in panels, so the fix probably belongs in the shared button, not per panel.

### BL-4: Turn off hovertips on mobile entirely

Added 2026-10-08. **Built 2026-10-08** on branch `backlog/bl-2-13` (7081033e); not yet checked in the live game.

**What.** No hovertips on mobile. The catch: some buttons (gem buttons among them) carry
critical information, such as the quantity, only in the hovertip, so mobile players would lose
it. That information has to move onto the button itself, which needs some finesse to fit
without crowding. Audit which hovertips hold must-have info before switching them off.

### BL-5: Bears should be faster

Added 2026-10-08. **Built 2026-10-08** on branch `backlog/bl-2-13` (fbda7305); not yet checked in the live game.

**What.** Bears move too slowly; speed them up. A tuning item; it fits Track 5 (tuning) of the
NPC / Combat epic above, so fold it in there if that track starts first.

### BL-6: Bug: exiting a dungeon placed the player on top of a wall

Added 2026-10-08. **Built 2026-10-08** on branch `backlog/bl-2-13` (1b448b76); not yet checked in the live game.

**What.** Leaving a dungeon put the PC avatar on a wall tile. The arrival position after a
dungeon exit needs to land on a passable tile (fall back to the nearest passable one if the
target is blocked).

### BL-7: Signposts passable; walking onto one triggers the grid transition

Added 2026-10-08. **Built 2026-10-08** on branch `backlog/bl-2-13` (7a76fd7d); not yet checked in the live game.

**What.** Signposts should not block movement. Walking the avatar onto a signpost should
simply trigger its grid transition, with no separate interaction step.

### BL-8: Editor Layouts tab: clicking a tile should select it, not change its tileType

Added 2026-10-08. **Built 2026-10-08** on branch `backlog/bl-2-13` (68430a94); not yet checked in the live game.

**What.** In the Editor's Layouts tab with a layout loaded, clicking a tile currently changes
its tileType. A click should only select the tile; changing the type should be a deliberate
separate action.

### BL-9: Trade Stall panel: Locked cards aren't centered

Added 2026-10-08. **Built 2026-10-08** on branch `backlog/bl-2-13` (e1eea14f); not yet checked in the live game.

**What.** In the Trade Stall panel, the Locked cards are not centered the way the unlocked
cards are. Match their alignment.

### BL-10: Inventory buttons on the Warehouse and Player Character panels; Profile links become buttons

Added 2026-10-08. **Built 2026-10-08** on branch `backlog/bl-2-13` (2c1bcea4); not yet checked in the live game.

**What.** Three changes:
- Add an Inventory button to the Warehouse panel (the one that opens when you click the
  warehouse resource on the grid).
- Add an Inventory button to the Player Character panel, below the Eat button.
- Both Inventory buttons open the InventoryPanel.
- On the player profile, turn the Skills and Combat links into buttons.

### BL-11: Town News moves off the Map panel into a floating button below the Season button

Added 2026-10-08. **Built 2026-10-08** on branch `backlog/bl-2-13` (03625525); not yet checked in the live game.

**What.** Remove the "Read the Town News" button from the Map panel. Replace it with a
floating button just below the Season button that opens the Town News in a right panel.

### BL-12: Settings panel header says "Profile"; change to "Settings"

Added 2026-10-08. **Built 2026-10-08** on branch `backlog/bl-2-13` (fea78339); not yet checked in the live game.

**What.** The Settings panel's header reads "Profile". Change it to "Settings" (all ten
languages).

### BL-13: Refresh the How to Play text for single-player; add Email Us at the top

Added 2026-10-08. **Built 2026-10-08** on branch `backlog/bl-2-13` (6f148538); not yet checked in the live game.

**What.** The How to Play text predates the single-player refactor. Rewrite it to reflect the
gameplay changes since then (all ten languages). Also put a copy of the Email Us button at the
top of the How to Play panel.

### BL-14: How to Play text, second pass to match the new gameplay

Added 2026-10-10. Follow-up to BL-13 (built 2026-10-08).

**What.** Update the How to Play text again so it better matches the game as it plays now
(all ten languages). BL-13 rewrote it for single-player; gameplay has moved on since (workers
with "Automatically work?", Town News, HUD timers, the Farmer removed in favour of the Farm
Hand, and so on).

### BL-15: Kent always offers at least one basic crop, through level 12

Added 2026-10-10. **Built 2026-10-10:** `BASIC_CROP_GUARANTEE_MAX_LEVEL` / `BASIC_CROPS` in KentOfferLogic.js; docs/tuning.md §Kent.

**What.** Around levels 8-10 Kent's offers lean too hard on progression items, so the player
is often left with no Kent offer they can fill. Through level 12, guarantee at least one Kent
offer is a basic crop (Wheat, Carrot, Corn, Sugarcane, ...), so the player can always grow,
sell, earn XP and empty a full warehouse. Above level 12 the rule goes away; the owner will
see how that feels. Touch point: the offer generator in
`game-client/src/GameFeatures/Trading/KentOfferLogic.js`.
