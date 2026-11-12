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

- **OB-6. Close the quest gaps** (added 2026-10-24). Built 2026-10-24: the L11 and Kent fixes,
  Elbow's L21 and L27 story steps, the `Discover <region>` goal and the 20 mid-game quests
  (L16-29, drafted in `docs/midgame-quests-draft.md`). Left: play the L16-29 quests through, then
  close. Optional: Elbow's L27 and L30 xp per the draft's reward rule (175 and about 500).

### Closed epics

Build the World (W-n, last W-18), UI Updates (UI-n, last UI-4) and Tuning (T-n, last T-6) hold no
open tasks (closed 2026-11-11). A new task in one of them reopens the epic with the next id.
The tuning rules stay in `docs/tuning.md`; the unbuilt dungeon ideas in `docs/dungeons-plan.md`.

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
(they read, never write). Done the same day: the grid NPC write routes are owner-only, and
BL-20 (an NPC save cannot finish a graze early or change hp / maxhp, `utils/npcSaveRules.js`).

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
**Plan (2026-11-11):** `docs/social-video-plan.md` (eight videos, shot lists, recording and
editing steps); assets go in `ads/` (`ads/README.md`).

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
