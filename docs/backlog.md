# Backlog

Loose list of work that is agreed but not scheduled. One entry per item: what, why, and
where to start. Items move to `refactor-plan.md` (or a feature doc) when they get a slot.
Keep done items out of here; the git log is the record.

## Launch blockers

Flagged by the owner 2026-11-08: these must be done before the launch (the next ad buy). Each
item keeps its full entry below and carries **LAUNCH BLOCKER** in its heading.

- **BL-2.** Real session auth: built 2026-11-11 (signed session tokens); left: switch
  enforcement on (`SESSION_ENFORCE=on` on Render) once the new client is live.
- **BL-17.** The last emoji characters: the twelve enemies and the quest-giver, relationship
  and speech glyphs (the player avatar and the 34 named NPCs are done and live).
- **BL-24.** Optimize Sprite Sheets: all nine atlas sheets load before the first grid (~9.4 MB,
  ~150 MB of GPU memory on phones); group them by where art is used and load per grid.
- **BL-25.** Test a season reset end to end before launch (it relocates every player and
  rewrites every grid, and has not run since the single-player refactor).

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

- **W-12. More dungeons** (added 2026-10-09). Design and build more dungeon templates (editor
  Dungeons tab, `layouts/gridLayouts/dungeon/`). A future pass, after the valley grids.

Closed 2026-11-11 (owner: the world is good enough for now): W-1, W-3, W-11; W-17 and W-18 done
by the owner.

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

### BL-2: Real session auth in place of the bare `x-player-id` header (LAUNCH BLOCKER)

Added 2026-10-30.

**Built 2026-11-11** (the rules are in CLAUDE.md, "Sessions"): sign-in, a new profile and
`/session/resume` answer with an HMAC-signed session token (`game-server/utils/session.js`); the
client sends it on every request, the beacon and the socket (`game-client/src/Authentication/session.js`);
`x-player-id` is rewritten from the session, so every developer check (admin routes, the
maintenance gate, Mayor edits, delete-player) reads it; a developer account must also have a
password; a request whose `playerId` / `voterId` / `linkPlayerId` is not the session's player
is refused (developers excepted); the editor signs its own developer token. Verified locally with
enforcement on: spoofed header, missing, forged and mismatched tokens refused; a new profile
played, resumed a lost token and recovered from a bad one; the throwaway profile deleted itself.
**Left (owner):** (1) after the push, once the client deploy is live, set `SESSION_ENFORCE=on`
on the Render server (until then refusals are only logged as `🔐` lines; developer rights need a
session from the start); (2) the editor talking to production needs the same `SECRET_KEY` (or a
new `SESSION_SECRET`) in the local `game-server/.env` as on Render, and a restart.
**Not covered, by design or for later:** a passwordless profile is only as private as its name
(`/login` takes the name alone, so `/session/resume` takes the id alone); a Google-linked
profile without a password can still sign in by name; GETs by player id are not guarded
(they read, never write); `save-single-npc` trusts the client (BL-20).

**What (as filed).** Every privileged check on the server (`requireDeveloper` in
`game-server/utils/developerHelpers.js`, `requireDeveloperOrSelf` in `routes/playerRoutes.js`,
the maintenance gate in `utils/serviceMode.js`) trusts the `x-player-id` header, which is only
a player's Mongo id, not a secret. Player ids appear in other API responses, so anyone who
finds a developer's id can call the admin routes. Replace it with a signed session token
(issued at login / silent signup, verified server-side), and derive the caller from it rather
than from the header or a `playerId` in the body. Found while closing the open admin routes
(commit 7df2ac65); flagged as a launch-readiness gap before the next ad buy.

### BL-17: Art pass, the last emoji characters: enemies and glyphs (LAUNCH BLOCKER)

Added 2026-11-07; rewritten 2026-11-10, when the avatar and named-NPC half shipped.

**Done and live (the record is `docs/avatar-plan.md` and the git log):** the parts-based player
avatar, on the board, in the header and the panels, with its editor (Change Avatar and the
FTUE step) for every player; the 34 named NPCs as full figures with head crops; facing, the
turn, the walk, the breath, the blink and the idle foot tap; a default look for every player
who has not made one, so no legacy icon is drawn for the local player any more; paid parts
bought with gems. Santa Claus was cut.

**What is left of this item (the launch blocker).** Every character that is still an emoji:
the twelve enemies (Coyote to Phoenix: "a separate creature lane" in the plan, not started),
and the handful of conversation topics that are still Twemoji in a speech bubble (the
weather, the random and secret topics with no art of their own). Spawners are out of this item
(owner 2026-11-10): they draw as nothing and appear in no panel for a player. Done 2026-11-10:
the named NPCs' glyphs are gone from every panel and modal (quest cards, Level Up modal, Story
modal, hire cards); the player's picture in a bubble is the avatar's head; the feelings, the
relationship outcomes and the quest / trade overlays are painted (docs/art/ui-icons.md,
`icons-r12`). **Why.** Owner's order in docs/art/emoji-audit.md: characters come last. When
this lands the game has no emoji left and `scripts/build-atlas.js` can drop its Twemoji step.
**Where to start.** docs/art/emoji-audit.md for the list; `tools/art/jobs/npcs-r1..r5.json`
for how the named NPCs were prompted and cut; the NPC rows' `symbol` (still emoji, and
`Conversation.js` matches speakers by it) for the glyph half.

**Avatar follow-ups that are NOT launch blockers** (owner 2026-11-10): equipment is BL-23;
the rest is small and listed here so it is not lost.
- Other players' figures on the board, and anything else that still reads `icon` for another
  player; then `PlayerIcons.json`, `playerIcons/` and the `icon` field can go (the plan's
  slice D). No record needs rewriting: a player without a look is drawn in the default one.
- Hair is two styles a body, faces one a body; the skin tone palette is to be iterated (the
  owner found the tones a little strong).
- The Doctor's glasses are partly painted over when he blinks; Falstaff blinks one eye.
- Arm swing is muted (the art has no separate arms; see the plan).

### BL-23: Avatar equipment: the weapon in the hand, armour as the outfit

Added 2026-11-10. Not a launch blocker (owner: "a big task ... come back to that later").

**What.** The equipped weapon drawn in the avatar's hand and the equipped armour drawn in
place of the chosen outfit, as `docs/avatar-plan.md` decided (v1 decisions 3 and 4, v2 D4:
armour rows are outfit rows; weapons draw in the valley, the dungeon and the FTUE opening and
are put away in Town and on the Homestead). **Why.** The gear a player earns should show on
the figure. **Where to start.** The feed already exists and shapes the look: `equipFor` and
`lookFor` in `game-client/src/Avatar/avatarLook.js` read `settings.equippedArmor` /
`equippedWeapon` and the resource rows' `avatarTop` / `avatarHand`, and the `hand` layer is in
`Z_ORDER`; no row names either yet and there is no art. Outfits go through the body pipeline
(`figurecut`, `align`, `fitbody`, `split`), a hand item needs a rig hand position and its own
cut; draw both on the base bodies, two per item (female, male). About seven armours and ten
weapons.

### BL-24: Optimize Sprite Sheets (LAUNCH BLOCKER)

Added 2026-11-10. Launch blocker (owner 2026-11-10).

**Problem.** `AtlasTextures.loadSheets` loads all nine atlas sheets (2048 x 2048 each, ~9.4 MB
of WebP, 727 frames after the 2026-11-10 rebuild) before the first grid draws. The real cost is
memory: ~16 MB of GPU memory per decoded sheet, ~150 MB held for the whole session, the kind of
load that gets an iOS Safari tab killed (the audience is iOS-heavy). Loading fewer sheets does
not help today because `scripts/build-atlas.js` packs by SIZE, not by use: town buildings,
valley trees, NPC figures and pickups are spread over sheets 0-8 and the ground tiles share
sheet 7 with the emoji, so any grid touches 7-8 of the 9. Constraint (owner): no missing icons
that visibly lazy-load (the speech-bubble fallback glyphs of 2026-11-10 were exactly that).

**Plan.**
1. Group sheets by use (build script only): a CORE sheet always loaded (ground tiles, edges,
   walls/fences, overlays, the `icons/` glyphs, NPC head crops, doobers, the avatar parts, the
   conversation and topic emoji: everything that can appear on any grid at any moment), AREA
   sheets (town-only, valley-only, dungeon-only, homestead + everything craftable/placeable,
   derived from `layouts/gridLayouts` and resources.json) and a RARE sheet (one-off story art,
   seasonal).
2. Load per grid (client): the manifest (`world.json`) already maps every frame to its sheet.
   On a grid change (`changePlayerLocation`, the one path) list the frames of what is actually
   on the grid (resources, NPCs, the player) and await their sheets behind the existing
   transition fade, so nothing on screen arrives late; after the first frame, idle-load the rest
   one at a time; the edge prefetch (`maybePrefetchAcrossEdge`) also prefetches the next grid's
   sheets. A frame still asked for before its sheet is in awaits that sheet (as
   `getAtlasTexture` already can) rather than drawing a fallback glyph.
3. Optionally release area sheets for areas the player has left (back to ~50-70 MB on phones);
   decide after measuring on an iPhone.

**Safety.** `check:atlas` fails when a board-visible frame is in no sheet; a dev hook reports
time-to-first-grid and GPU memory before and after; ship in two steps: the regrouping first
with everything still loaded up front (no visible change, proves the groups), then turn on
per-grid loading and the idle loader.

**Cheap wins either way.** Content-hash the sheet file names and serve `/assets/atlas/*` with
`Cache-Control: public, max-age=31536000, immutable` in `render.yaml` (today only `/static/*`
has it). A 0.75x sheet set for small or low-memory screens roughly halves GPU memory with no
visible loss at board zoom.

**Size.** About a day: half for the regrouping in `build-atlas.js`, half for the awaiting, idle
loading and release in `AtlasTextures.js` and the grid change.

### BL-25: Test a season reset (LAUNCH BLOCKER)

Added 2026-11-10. Launch blocker (owner 2026-11-10).

**What.** Run a full season end and reset and check the game comes out of it whole. The reset
(`game-server/utils/seasonReset.js`, with `seasonFinalizer.js` and `seasonTiles.js`) runs 25
minutes after the season timer ends, only with `NODE_ENV=production`, relocates every player and
rewrites every grid; the world model changed under it in the single-player refactor (per-player
grid copies caught up lazily by `seasonNumber` / `resetEpoch`, docs/phase-2-contract.md), so it
has to be proven before an ad buy brings players in. **Where to start.** Never against the live
data without the backup script (`game-server/scripts/backup.js`) first; check winners and
rewards (test accounts excluded), relocation, the template grids, a player's copies catching up
on next entry, and the client across the boundary.

### BL-26: Three gameplay videos for social media

Added 2026-11-10. Not a launch blocker.

**What.** Claude makes three short gameplay videos for promotional social media posts. **Where
to start.** Pick three moments that sell the game (farming and Kent, a town and its characters
talking, exploring a valley or a fight), record them from a clean test account (ftuetester,
never Oberon), and cut them to the platforms' formats (vertical for Reels / TikTok).

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

### BL-22: A hedge wall set

Added 2026-11-08; narrowed to the hedge 2026-11-11 (owner: no more stone or sandstone walls).

**What.** A clipped HEDGE wall set (the Green Wall's replacement; docs/art/deco-pass-plan.md
B3): a joining `wallSet` of seven pieces through the walls pipeline (docs/walls.md: one plus
panel + one lone-post panel, `tools/art/walls.js`). **Why.** The garden has no green edge piece,
only the stone wall and the wooden fence. **Where to start.** `tools/art/jobs/walls.json` (the
stone set's prompts and the TALL window), then a `Hedge` row with `wallSet: hedge` and a deco
group for walls.

### BL-27: Review the combat animations

Added 2026-11-11. Not a blocker.

**What.** A separate pass over how combat moves on the board. The owner dropped the squash from
the login scene's Lumberjack as unrealistic (2026-11-11) but kept it on enemies for now, to be
judged together with the rest. **In scope.** The enemy windup before a swing (squash and spring,
`CombatFX.enemyWindup`), the leap's crouch-squash and in-air stretch (`enemyLeapCharge` /
`enemyLeapArc`), the hit pop and knockback (`hitEnemy`), the death pop and fade (`killEnemy`), and
the player's lunge and hit (`playerLunge` / `playerHit`). **Where to start.**
`game-client/src/Render/PixiRenderer/CombatFX.js` (all of them, timings in its `FX` table);
callers in `GameFeatures/NPCs/NPCEnemyBehavior.js`. Combat stays casual (CLAUDE.md, Combat).
