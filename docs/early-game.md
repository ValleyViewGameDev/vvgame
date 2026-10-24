# Early game: the phases, what each one teaches, and the pull to the next

Owner + Claude, 2026-10-24. The canonical definition of the game's phases by level and the plan
for pulling a new player from the first session through the early game. Backlog: EPIC
"Onboarding & Early Game" (OB-n). Read this before changing the FTUE, quest levels or rewards
below level 20, or where a Quest for Hope artifact can first be reached. Related: the first
session's account / email / FTUE mechanics are in `onboarding-plan.md`; costs, potions and the
level curve in `tuning.md` (§3, §4h, §4i); the story rules in `story.md`.

Goal: strong D1 and D7 retention. D1 comes from the first session (the toy feels good, the
loop pays, it ends on open loops). D7 comes from the early game (always a clear next thing, a
new skill most sessions, a new place every couple of days, and the first Quest for Hope
artifact around day 5 to 7).

## 1. The phases

The XP curve (`xpLevels.json`, 1,000 levels; level N is reached at entry N-1) is gentle to
about L25 (17,740 XP), then jumps about 5-fold to L30 (81,250) and steepens from there
(L40 0.87M, L60 6.8M, L100 45M). The
guided game must end before the curve turns; the late game starts at the kink.

| Phase | Levels | XP to reach the end | Play-time target | Character |
|---|---|---|---|---|
| **FTUE** | 1 to 3 | 25 | session 1, 10 to 15 min | fully scripted |
| **Early game** | 3 to 15 | 2,960 | day 1 to about day 10 | guided: always one clear next thing |
| early-early | 3 to 6 | 200 | sessions 2 and 3 (D1) | skills multiply what you make |
| mid-early | 6 to 10 | 780 | D2 to D5 | Town, the Valley, the first fights |
| late-early | 10 to 15 | 2,960 | D5 to D10 | the first artifact, a production loop, the wider world |
| **Mid game** | 15 to 30 | 81,250 | weeks 2 to 8 | opening up: regions, specialising, choices |
| early-mid | 15 to 20 | 8,590 | weeks 2 and 3 | mid valleys, Potion B, regional shops |
| **Late game** | 30 to 50 | 2.97M | months | the story spine: Hecate, Acheron, Dragons, Prospero |
| **Elder game** | 50 and up | | open-ended | legendary gear, the Phoenix, mastery, collection |

The content already sits on these lines: Potion B in quantity from about L14 and Potion C after
Ink (L17), Florist at L23 (early-mid into mid); Toil and Trouble at L30, the Brief Candle about
L34, the Dragon's home level 40 (late); the Phoenix at 55 and legendary gear to L100 (elder).

**The control gradient.** Early game: chains of quests, the To Do list never empty, one
recommended next step. Mid game: two or three goals in parallel that the player chooses
between. Late and elder game: a sandbox, with the Quest for Hope as the spine.

The play-time targets are targets, not measurements: nothing records when a player reaches a
level yet (OB-7).

## 1b. The story on the phases (approved 2026-10-24)

The tale is canon in `story.md` §0 (a storm of stories; Prospero the antagonist; Gertrude the
statue); the re-voicing is `narrative-pass.md`. Its five acts sit on these phases, and two givers
carry the player through them:

| Act | Phase | What happens | Ends with |
|---|---|---|---|
| I, washed ashore | FTUE + early-early (L1-6) | the sea cave, Constable Elbow, the Home Deed, the Shepherd, Kent, the Town | the Town cast met (Elbow's first step, L3) |
| II, the stranded cast | mid-early + late-early (L6-15) | the Valley (Helena, L7), combat (Cassio, L10), the first treasure (the King's Crown, L11), the Trident as a stretch | **the Queen wakes** (Gertrude, L14-15): the end of the early game |
| III, the Valley and its dangers | mid game (L15-30) | more treasures (Vampire's Blood L16, Brass Bell L18), regions, Potion B | |
| IV, the witch and the underworld | late game (L30-36) | Hecate, Toil and Trouble, Acheron, the Brief Candle | |
| V, Prospero's Peak, then the Oracle | late into elder (L40-55) | the dragons, the Orb, the Phoenix, Hope | |

- **Constable Elbow gives the story** (questsEN 115-127, `prereq` chained, his words played as a
  StoryModal on accept). Early, one story step at a time (the control gradient's "one clear next
  thing"); after the Queen wakes, the rest open as a set (the open mid and late game). His steps
  are the WHY and point at a person or a treasure; the other givers' quests are the HOW.
- **The Shepherd** is the homestead specialist: farming, animals, building, the workers.
- Story goals: `Meet <NPC>` (greeted) and `Find <item>` (held, or ever found:
  `player.hopeFound`, shared with the found moment in §3).
- **Friendship is never an early-game gate** (owner, 2026-10-24): nothing before L16 asks for
  more than a Greet (§3).

## 2. What each phase must do

### FTUE (session 1, L1 to L3)

Teaches the core loop: plant, harvest, sell to Kent (generate resources, turn them into
money), then Town and a first skill (Grower). Today: 19 steps in `FTUEsteps.json`, from the
cave and Constable Elbow to the Home Deed, the Mailbox, 3 Wheat, Kent, planting, the Shepherd's
To Do list, the Town Key and the Agriculture Center.

Two separate goals:
- **Fun to play with (the toy).** Every core action answers the input at once with board
  feedback: tap, walk, collect, plant, chop, Kent's sale burst, the level-up. Doobers already
  feel good, and movement was fixed on 2026-10-03 (held-key loop, Pixi camera). **The weak spot
  now is actions where a late server reply undoes what the client showed**, e.g. collecting
  several finished crafts in a row makes the earlier ones flash back (OB-2).
- **Fun to play (the loop).** The first sale pays visibly, the first skill changes what you
  can plant, and the session ends on open loops: crops growing, Kent's next orders, something
  promised for tomorrow, and a first glimpse of the Quest for Hope (OB-3).
- **The hand-off (built 2026-10-24, OB-3).** At the Grower step (18) Elbow's modal (16521)
  congratulates the first skill and asks the player to greet Portia, Mistress Quickly and
  Hotspur, and the FTUE adds his first story step ("I Do Lean Upon Justice", quest 115) to the
  Quests panel; its toast (7059) says greet them, then go home. The player is about L2 here (the
  FTUE gives about 20 xp; L3 is 25), so a held, done quest is now claimable below its level, and
  its 15 xp lifts the player to L3. The last toast (7065) names the open loops: crops growing,
  a gift tomorrow (the day-2 gift, message 6, `utils/returnGift.js`; bigger than the daily drip),
  Elbow's next task, the seven treasures of the Quest for Hope.

### One new concept per level, to L7 (owner, 2026-10-25)

Until about L7 each level introduces ONE new system while the player masters the core loop
(plant, harvest, sell to Kent, level up). Practice with a system already met (another crop, a
second animal, Kent orders) may sit beside it. A concept is one quest where it can be: the
Husbandry quest is the model (Acquire Husbandry, Buy 1 Cow, Collect 30 Milk; the two quests
merged into it are `retired`, still claimable by anyone who holds one). From L8 a level may carry
more than one. **Combat starts at L10** (owner): combat quests and the first weapons, armour and
combat magic all unlock there; a player may still fight before with the Knife and Padding.

| Lvl | New concept | Quests |
|---|---|---|
| 1 | farming and Kent (FTUE) | Plant Wheat |
| 2 | skills | Grower; Earth's Bounty; Elbow's first story step (from the FTUE) |
| 3 | animals | The Gentle Art (Husbandry + Cow + 30 Milk) |
| 4 | wood | Wood Master (Axe), Saw You Not That? (24 Wood); I Earn That I Eat (Kent, practice) |
| 5 | building | Foundations of Stone (Builder), Mill by Moonlight; Fleecy Fellowship (Sheep, practice) |
| 6 | new crops | Our Bodies Are Our Gardens (Green Thumb + 10 Potato); Sweet Harvest (practice) |
| 7 | the Valley | Backpack; Sermons in Stones (Pickaxe + 20 Stone: Rocks are Valley-only); Elbow's More Things in Heaven and Earth (Helena); her Daisies for the Door (the Golden Key); Cook's Harvest (practice) |
| 8 | stone builds | Master Mason, Dairy to Dream, Cheddar Ambitions; Mechanics; Coop Dreams |
| 9 | potions, cloth | Helena's Rosemary, Portia's Potion A, Chemistry; Loom and Cloth; Dairy Delights; Lumberjack; Serve Kent 12; the Clay |
| 10 | combat begins | Hotspur's Focus, Long Blade, kit and Coyotes / Pelts; Elbow's Cassio step |
| 11 | the Crown | Bears, the Great Bear, Elbow's A Crown for the King; Farm Hand, Rancher, Fortitude |
| 12 | | Duke Angelo; Politics and Vote (elections run on their own clock); Textiles |

The XP the moved quests carried was put back on the concept quests (`tuning.md` §2: XP is the
clock), so quest XP per level stays near what it was (L4 25, L5 65, L6 60, L7 80).

### Late-early (L10 to L15): the first artifact, then the Queen

- **The King's Crown** (§3), at about L11, day 5 to 7.
- **The Oven and Baker loop**: the Clay quest (L9), the Oven (L10), Baker (L11, now 6 Potion A
  and 1 Potion B).
- **The Trident** as the first stretch goal: Cassio, Duke Angelo and the Skeleton Key (L12+).
- **The first mid-valley trip**, L12 to L14: Helena's Mushrooms (L12 to L13), then Tulips (L14).
- **The Queen wakes, L14-15**: Helena's "Rosemary, for Remembrance", Feste's "If Music Be the Food
  of Love", the statue and Feste's song (`story.md` §0), closed by Elbow's "Be Stone No More".
  It is the early game's exit: the first proof the storm can be undone, and the moment the story
  opens up into the mid game. The Queen mails a gift on the first waking (messages.json 7,
  Money 10000 + Gem 25, OB-8).

### Early-mid (L15 to L20): the world opens

Potion B, the regional shops, Books and the Library, the Studio and Ink, the Vampire's Blood
(L14+). The shift: the player chooses between two or three goals instead of following one
chain.

## 3. The Quest for Hope in the early game

The seven boxes are pinned on the To Do list from day 1. The early game should light the first
one, so the rest of the game is a promise, not a mystery.

- **Glimpse at the end of the FTUE**: the Shepherd's last line names the Quest for Hope and the
  seven dark boxes are shown (OB-3).
- **The designed first artifact is the King's Crown, at about L11** (built 2026-10-24,
  OB-5, moved a level 2026-10-25 when combat moved to L10; Elbow's "A Crown for the King" (L11, Find) is the story step that asks for it). Leontes' castle stands in **Belmont** (1011165, a near-valley town about 13 grids from
  home, with its own regional shop items); the only land route to it is a strip from the west,
  watched by two Bears and, on the cobbled road in front of the gates, the **Great Bear** (a
  mini-boss fitted for L10, `tuning.md` §5d; it replaced four Ogres, which are L22 enemies). The
  quests spell the path out:

  | Level | Giver | Quest | Goal | Why |
  |---|---|---|---|---|
  | 7 | Helena | Daisies for the Door | 50 Daisy, pays the Golden Key | the key to the castle |
  | 10 | Hotspur | The Long Blade | own a Long Sword | the weapon |
  | 10 | Hotspur | We Pluck This Flower, Safety | own Light Armor and a Buckler | the armour |
  | 11 | Hotspur | Exit, Pursued by a Bear | kill the Great Bear | clear the road |
  | 11 | Constable Elbow | A Crown for the King | find the King's Crown at the Castle (the Golden Key) | the first artifact |

  With that kit (Long Sword, Light Armor, Buckler) a level 10 player kills the Great Bear in
  about 20 s for a quarter of their hp; with a Knife and no armour it kills them. Helena's first
  dialog (16006, played on the Greet) asks for the Daisies, names the castle in Belmont and warns
  of the bear; the Crown's hint (200812) names Belmont and the bear.

- **The found moment** (built 2026-10-24, for all seven artifacts). When an artifact turns up in
  the player's holdings (`GameFeatures/Social/HopeFound.js`, mounted in App), its story modal
  plays at once (strings 200830-200836: a famous line re-aimed, then "one of the seven
  treasures the Oracle asks for in exchange for Hope"), and `POST /api/hope/found` records it in
  `player.hopeFound` and mails the Oracle's letter (messages.json 401-407, `hopeArtifact`), which
  points to the next artifact: Crown, Trident, Vampire's Blood, Brass Bell, Phoenix Feather,
  Brief Candle, Prospero's Orb, then "bring the seven to me on Hope Mountain". The box lights
  from the holdings (`HopeQuest.js`). Accounts from before 2026-10-24 have no `hopeFound`; the
  first call records what they hold silently, so old finds never replay.
- **The Trident** is the stretch goal for L12 to L15.
- The other five (Vampire's Blood L14+, Brass Bell via Portia's Secret L16+ at marriage, the
  Phoenix Feather, the Brief Candle about L34, Prospero's Orb last) are mid game and later. That
  is fine: the lit box and the hint promise them.

**No friendships in the early game** (owner, 2026-10-24): building a friendship is grindy, so
nothing in the FTUE or the early game (L1-15) asks for more than a Greet. A quest list opens at
relationship score 10 (one Greet; it was 14); every quest at L15 and under has no `rel` /
`relscore`, and Constable Elbow's Dungeon Key no friend gate. Trust gates (friend, love, married,
Secrets) start at L16 (`story.md` §3); Titania's Secret moved from L15 to L16.

## 4. Where the game stands

Re-measured 2026-10-24 after the story chain:

| System | First taught by a quest | Note |
|---|---|---|
| Farming, Skills, Animals | L1 to L3 | the Shepherd |
| **Story** | **L3** | Elbow's chain (was L8) |
| Crafting stations | L5 | the Mill; stone stations L8 |
| **The Valley** | **L7** | Elbow sends the player to Helena, with the Pickaxe for Stone; her Golden Key |
| Combat | L10 | Hotspur's kit and Coyotes; the first weapons and armour unlock at L10 |
| Kent / selling | L8 | taught in the FTUE, then once (Hotspur's Pelts) |
| Potions | L7 | Portia |
| The Queen | L14-15 | Helena, Feste, Elbow |

Quests per level band: L1 to 3: 8, L4 to 6: 12, L7 to 10: 23, L11 to 15: 22, L16 to 20: 17,
L21 to 30: 5, L31+: 2. The structure falls away after L20, where the story spine (Hecate,
Acheron) needs it most.

Two players, not statistics (the game changed a great deal since last year's players and has
one or two active now):
- **Misty (MintyB)**: L6, 11 quests completed, but only 2 grids explored (home and Town); she
  never set foot in the Valley. Played Oct 13, then Oct 23. The gap in the table above in one
  player: the game never told her the world was bigger.
- **moehong**: a year in, L27, 573 grids, 46 skills, 2 of the 7 artifacts (King's Crown, Brass
  Bell), still back about weekly. A deep sandbox with long goals holds a player once she is
  through the early game.

## 5. Retention: what each window needs

- **D1 (sessions 1 and 2)**: the toy feels good (movement first), the first session ends on open
  loops, and there is a reason to come back tomorrow (a day-2 gift, ripe crops, Kent's fresh
  orders).
- **D2 to D7**: never an empty To Do list; about one new skill per session; a new place every
  couple of days (the Valley D2 to D3, a first fight D3, Belmont and the Crown D5 to D7).
- **D7 onward**: the Quest for Hope at one of seven with a hint to the next; the regional shops
  and the gear catalogue; parallel goals in the mid game.

## 6. Measuring it

`tools/progression.js` shows what each level costs, what the valleys give back and where quests
teach each system. Since the 2026-10-24 build the server records when each player first reaches
each level (`analytics_level`, `docs/analytics.md`), and `node tools/progression.js --pacing
[--since <day>]` sets the measurements beside the §1 targets: per level, how many reached it,
the median (p25-p75) time since first seen, and the median active days by then. It is
forward-only, so read a level only from players who joined after the deploy. Until a few dozen
new players have come through, the targets in §1 are still design targets; a modelled estimate
(XP per session from Kent, quests and kills) is worth building only if the measurements leave a
question they cannot answer.
