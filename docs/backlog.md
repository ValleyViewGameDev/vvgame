# Backlog

Loose list of work that is agreed but not scheduled. One entry per item: what, why, and
where to start. Items move to `refactor-plan.md` (or a feature doc) when they get a slot.
Keep done items out of here; the git log is the record.

## Launch blockers

Flagged by the owner 2026-11-08: these must be done before the launch (the next ad buy). Each
item keeps its full entry below and carries **LAUNCH BLOCKER** in its heading.

- **BL-2.** Real session auth: built 2026-11-11 (signed session tokens); left: switch
  enforcement on (`SESSION_ENFORCE=on` on Render) once the new client is live.
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

BL-17 (the art pass on the last emoji characters) closed 2026-11-12: the player avatar, the 34
named NPCs and every enemy are painted. Conversation topics with no game art of their own (the
weather, the random and secret topics) STAY emoji by the owner's decision: a bubble shows the
NPC's painted head, the painted doober for a thing, and an emoji for the rest; no more icon art
is to be made for them, so `scripts/build-atlas.js` keeps its Twemoji step.

BL-27 (review the combat animations) closed 2026-11-13 with the enemies' visuals (owner: "close
out any enemy-visual-related items"): every enemy is painted, the Zombie, the Bear and the Ogre
attack with rigged arms (the Ogre swings a club), the Coyote lurches, the Spider crawls, the
fliers hover and flap, and the Ogre's leap crouches from the legs. What was left of BL-27, the
player's own lunge, is part of BL-23 (`docs/equipment-plan.md` §3.4).

### BL-2: Real session auth in place of the bare `x-player-id` header (LAUNCH BLOCKER)

Added 2026-10-30.

**Built 2026-11-11** (the rules are in CLAUDE.md, "Sessions"): sign-in, a new profile and
`/session/resume` answer with an HMAC-signed session token (`game-server/utils/session.js`); the
client sends it on every request, the beacon and the socket (`game-client/src/Authentication/session.js`);
`x-player-id` is rewritten from the session, so every developer check (admin routes, the
maintenance gate, Mayor edits, delete-player) reads it; a developer account must also have a
password; a request whose `playerId` / `voterId` / `linkPlayerId` is not the session's player
is refused (developers excepted); the editor signs in with a developer's name and password
(2026-11-12; it had signed its own token with the local `.env` secret, which production refused). Verified locally with
enforcement on: spoofed header, missing, forged and mismatched tokens refused; a new profile
played, resumed a lost token and recovered from a bad one; the throwaway profile deleted itself.
**Left (owner):** (1) after the push, once the client deploy is live, set `SESSION_ENFORCE=on`
on the Render server (until then refusals are only logged as `🔐` lines; developer rights need a
session from the start).
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

### BL-23: Avatar equipment: the weapon in the hand, armour as the outfit

Added 2026-11-10. Not a launch blocker (owner: "a big task ... come back to that later").
**Plan written 2026-11-13: `docs/equipment-plan.md`** (hand-held weapons first). **A first prototype is
in the game the same day** (a `weaponClass` column on the weapon rows; six categories with a drawing each, sword / dagger / spear /
polearm / axe / hammer, and three attacks, slash / thrust / chop, each an arm clip with the body's move;
follows the Combat panel's weapon slot; out only while an enemy is on the grid; an arm rig for every outfit; great swords, polearms, axes and hammers held and swung in both hands: every melee weapon now has its category and its attack; the bows shoot: the Short Bow and a longbow drawing for the six other bows, crossbows and Darts still to do): the plan's "The prototype" section says what is
and is not built. Checked on offline renders only; the owner's look in a live fight decides what next.

**What.** The equipped weapon drawn in the avatar's hand, held up in an en garde stance and swung
when the player attacks, then armour and helmets as overlays (armour rows are outfit rows, helmets
are hats: `docs/avatar-plan.md` v2 D4). **Why.** The gear a player earns should show on the
figure. **Where it stands.** The Ogre's club proved the arm (three joints, the weapon on the wrist:
docs/arm-rig-plan.md §0a). Two probes on the avatar's existing art: the arm on the side the figure
faces is the far arm and too thin when lifted (rejected by the owner), the NEAR arm is whole and
works, so the sword goes in the near hand, crossing the body, and the swing comes over and across
it (the plan's §2). A few weapon drawings per category with tints and lengths; no two-handed
animation yet. The plan's P1 is a prototype outside the game (one sword, one outfit a body, a fist
piece, the guard and a slash) for the owner to approve. The player's body move is part
of each weapon category's attack clip (`CombatFX.playerAttack`), so the old "review the combat
animations" item (BL-27) has no player half left. The feed exists: `equipFor` / `lookFor` in
`game-client/src/Avatar/avatarLook.js` read `settings.equippedWeapon` and the rows' `avatarHand`.

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

### BL-28: Avatar follow-ups (not launch blockers)

Carried over from BL-17 when it closed (2026-11-12); listed by the owner 2026-11-10 so they are
not lost. Equipment on the figure is BL-23.
- The last readers of the old `icon` emoji, then `PlayerIcons.json`, `playerIcons/` and the
  `icon` field can go (the plan's slice D). Done 2026-11-12: other players (none is drawn on the
  board; the Leaderboard and the Global Market show avatar heads, owner verified); every avatar
  face falls back to ONE thing while it loads, the smiling face emoji (`AvatarFace.js`
  `AVATAR_FALLBACK`, the speech bubble too), never the old `icon`; the "you are here" picture on
  the frontier map is gone (the yellow outline marks the tile); `PlayerAvatarFace` is deleted.
  What still reads `icon`: the board's fallback for the local player
  (`PixiRendererPCs.js getDisplayIcon`, `PlayersInGrid.js`), the old Profile panel's icon field,
  `RelationshipCard.js`, and `speechTopicArt.js` for an old figure emoji. No record needs
  rewriting: a player without a look is drawn in the default one.
- Hair is two styles a body, faces one a body; the skin tone palette is to be iterated (the
  owner found the tones a little strong).
- Arm swing is muted (the art has no separate arms; see the plan).

### BL-29: Four Dragons have no room for their 3 x 3 body

Carried over from BL-17 when it closed (found 2026-11-12, when the Dragon became 3 x 3). Of
the 15 Dragons placed in layouts, 4 stand in dense forest with no 3 x 3 clearing within eight
tiles (valley layouts 1012274 at 54,59 and 1013320 at 6,31 / 5,37 / 11,44), so they cannot
settle or move (`AllNPCsShared.settleBody` looks three tiles) and sit over the trees. Clear a
patch at each spot or move them.
