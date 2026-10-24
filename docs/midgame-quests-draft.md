# Mid-game quests, L19 to L29: draft for review

**BUILT 2026-10-24** (questsEN.json, 20 quests: the 18 in the table and Helena's two in §3; Florist pays Money 10,000 only, a quest has one reward), after the owner's review. Backlog OB-6: past L18
the quest list nearly runs dry (L19 to L29 held 0 to 2 quests a level). This batch fills it with
20 quests from the specialists (18 in the table, Helena's two in §3), so the open mid game (`early-game.md` §1: regions, specialising,
choices) always offers a next thing beside Kent. Constable Elbow's story steps (L21 Leontes, L27
Caliban) are built; these are the HOW beside his WHY.

**Owner's decisions (2026-10-24):** Hotspur takes the regional quests, and they are "discover the
region", not "buy its item" (late players may not want the items); Florist stays as a long goal,
with its grind checked (§3: measured by outposts, it is fair); Viola stays out of the mid and late
game (she travels as part of the Sebastian quest); rewards are Claude's best guess (§2).

## 1. The quests

| Lvl | Giver | Title (source) | Goal | Reward | Hook |
|---|---|---|---|---|---|
| 19 | Hotspur | The Graves Stood Tenantless (Hamlet 1.1) | Kill 6 Zombie | Money 6000, xp 42 | the slow tank, now beatable |
| 19 | Mistress Quickly | A Good Sherris-Sack (2 Henry IV 4.3) | Build 1 Beverage Station | Money 5000, xp 42 | L18 station |
| 19 | Feste | The Web of Our Life (All's Well 4.3) | Acquire Weaver | Money 8000, xp 42 | L19 skill |
| 20 | Portia | Throw Physic to the Dogs (Macbeth 5.3) | Collect 3 Potion C | Gem 3, xp 47 | Potion C |
| 20 | Hotspur | Lay On, Macduff (Macbeth 5.8) | Discover Dunsinane | Gem 3, xp 47 | a mid-ring region |
| 22 | The Shepherd | Where the Bee Sucks (Tempest 5.1) | Acquire Beekeeper | Honey 12, xp 55 | L22 skill |
| 22 | The Shepherd | Good Wine Needs No Bush (As You Like It, epilogue) | Build 1 Winery | Money 8000, xp 55 | L22 station |
| 23 | Cassio | The Dogs of War (Julius Caesar 3.1) | Kill 5 Ogre | Gem 5, xp 59 | the Ogre's home level |
| 23 | Helena | Sweets to the Sweet (Hamlet 5.1, Gertrude's line) | Acquire Florist | Money 10000, Gem 5, xp 59 | the long goal: about a week of outposts (§3) |
| 24 | Hotspur | A Kind of Merry War (Much Ado 1.1) | Discover Messina | Gem 3, xp 63 | a mid-ring region |
| 24 | Mistress Quickly | A Dish Fit for the Gods (Julius Caesar 2.1) | Craft 10 Queen's Cake | Money 6000, xp 63 | Gertrude trades a Diamond Ring for 10 |
| 25 | Hotspur | The Better Part of Valour (1 Henry IV 5.4) | Discover Windsor | Gem 3, xp 68 | a mid-ring region (Falstaff's town) |
| 26 | The Shepherd | The Greatest of My Pride (As You Like It 3.2) | Acquire Shepherding | Money 12000, xp 100 | L26 skill |
| 26 | Hotspur | Upon the Coast of Bohemia (Winter's Tale 3.3) | Discover Bohemia | Gem 3, xp 100 | a mid-ring region |
| 27 | Hotspur | Light, Seeking Light (Love's Labour's Lost 1.1) | Discover Navarre | Gem 3, xp 175 | a mid-ring region |
| 28 | Cassio | Hell Is Empty (Tempest 1.2) | Kill 5 Demon | Gem 5, xp 270 | the Demon's home level |
| 28 | Mistress Quickly | Toasted Cheese (King Lear 4.6) | Acquire Fromager | Money 15000, xp 270 | L28 skill |
| 29 | Portia | Nature's Infinite Book of Secrecy (Antony and Cleopatra 1.2) | Collect 10 Potion C | Gem 5, xp 380 | Potion C before Hecate |

After it: L19 4, L20 3, L21 2, L22 4, L23 3, L24 2, L25 2, L26 2, L27 2, L28 3, L29 1. Hotspur
gives six (the Zombies and five regions). Titles are new persisted ids, none already used by a
quest or a display title (`questTitles.js`). No friendship gates. Where an ask could mention
the Oracle (the Potion C quests: "the Oracle's own physic"), that waits for quest text (P3.1).

**The new goal, `Discover <region>`** (one small build): done when the player enters a grid of
that region. The client already announces every region crossing ("You are entering ...",
`Utils/GridManagement.js`), so the count goes there. As built today a goal only counts after the
quest is accepted, so a player who has been to Dunsinane before would have to go back; better is
a `player.regionsVisited` list written on enter-grid and read as a state goal (like Meet and
Find), so a past visit counts. Region names are the region types in `resources.json` (the same
`player.location.region` the shops use).

## 2. Rewards: the reasoning

`tuning.md` has no quest-reward rule, so these follow the XP curve and what Kent pays:
- **XP about 3% of the level's step** up to L25 (L20's step to L21 is 1,550, so 47), in line with
  the quests already there (median 30 at L16-20, 55 at L21-30). The curve turns at L26 (the step
  jumps 2,250 to 6,370, then 11,700, 18,010, 25,180), where 3% would be 190 to 750; these take
  about 1.5% (100 to 380), so a quest stays worth doing without becoming the XP clock (Kent stays
  that: `tuning.md` §2). The same rule would lift Elbow's L27 Caliban step from 80 to about 175 and
  his L30 Hecate step from 100 to about 500; worth doing in the same pass.
- **Money** about two or three good Kent orders at the level (5,000 to 15,000), for skills and
  stations, which cost Money.
- **Gems** 3 for a region found (the trip is the cost) and 5 for an elite kill or a long goal, as
  Elbow's treasure steps pay 3 to 5.

## 3. Florist and Potion C: the grind, measured by outposts

**What 100 Potion C is.** Florist (L23) costs Money 10,000, 5 Tulip, 20 Potion B and 100 Potion C.
Broken down through the Apothecary (A = 6 Rosemary + 2 Daisy + 16 Milk; B = A + 4 Mushroom + 4 Tulip
+ 2 Garlic; C = B + 12 Sunflower + 2 Ink + 1 Feverfew): 1,200 Sunflower, 485 Tulip, 480 Mushroom,
240 Garlic, 720 Rosemary, 240 Daisy, 1,920 Milk, 100 Feverfew and 200 Ink (800 Egg + 600 Honey,
4 h of Studio time each).

**Where it comes from (owner's correction, 2026-10-24).** The first pass of this section counted
the valley grids nearest the homestead and concluded Sunflowers barely exist before Florist. That
is the wrong model: the wild crops are concentrated by region, a player who has found a region's
town once travels back with Snug, the town's Trading Post ships goods home, and every wild crop
regrows on the spot in a day to three. A valley region is an outpost. `node tools/progression.js
--regions` measures it (spots, and per day if swept as they regrow):

| Crop | Best outposts | Per day |
|---|---|---|
| Sunflower | Sunflower Lake: 916 spots, 853 of them on four grids (1012507 alone 392) | about 900 |
| Tulip | Forest of Arden 87, Sunflower Lake 76 | about 160 |
| Mushroom | Forest of Arden 1,064, Golgotha 892, Sunflower Lake 772 | plenty |
| Feverfew | Forest of Arden 315 | plenty |
| Garlic | the Garlic Plot at home (Green Thumb, L7) | |

So **Potion C is not walled**: it is gated by finding Sunflower Lake (its shops sell L15-18 items,
so the design already puts it there) and using Snug. With those, Florist's 100 Potion C is about
two days of Sunflowers, three of Tulips, and Ink as the long pole (200 Ink at 4 h each, so the
number of Studios decides it). That is a fair long goal at L23, and Florist's plots then let an
elder do it at home and better. **Florist stays as drafted.**

**What the mid game does need:**
1. **A pull to Sunflower Lake before the Potion C skills** (Creamery L17 asks 15 Potion C, 180
   Sunflowers): one more quest, Helena (the flowers), L16, "Discover Sunflower Lake", the same
   `Discover` goal. Title: "Here's Flowers for You" (The Winter's Tale 4.4, Perdita). Reward Gem 3,
   xp 35. A second at L18, Helena, "Discover Forest of Arden" (the Tulip and Feverfew outpost;
   her Feverfew's Favor is L18), "All the World's a Stage" (As You Like It 2.7), Gem 3, xp 40.
2. **A just-in-time lesson for Snug travel**, the first time a player stands in a valley town
   they found (backlog OB-9): without it the outpost model is invisible.

## 4. Before building

1. Build `Discover`, preferably with `regionsVisited` (§1).
2. Then the 17 quests plus Helena's two (§3), 19 in all, and Elbow's L27 and L30 XP per §2 if
   agreed.
3. The Snug lesson (OB-9) is separate and can follow.
