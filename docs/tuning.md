# Tuning: principles, levers and goals

Read this before any tuning change (XP, level gates, prices, offer generation, drop rates,
timers, quantities). Like `ui-conventions.md`, it is the standing rule set; add to it when a
tuning decision becomes a rule. Where a rule lives in code or data, the file is named so you
can check the current value rather than trust this page.

## 1. Where tuning lives

- **Data first.** `game-server/tuning/resources.json` is the master table (ECONOMY in the
  editor): per-item `level`, `xp`, `minprice`/`maxprice`, `source`, `season`, ingredients,
  `scrollchance`, `output` (`noBank` = never sold to Kent/Bank). `xpLevels.json` is the level
  curve, `globalTuning.json` the scalar knobs (Kent timers, offer counts, train hours, drop
  rates, scheduler phases), `seasons.json` the season multipliers and crop lists,
  `skillsTuning.json` the skill multipliers, `traders.json`/`quests/questsEN.json` the NPC
  economies. Edit these in the editor's sheet tabs; the game server caches most of them at
  boot (restart or deploy to apply).
- **Code second.** Generation logic with its own constants lives beside the feature:
  `game-client/src/GameFeatures/Trading/KentOfferLogic.js` (Kent), `TrainOfferLogic.js`
  (Train), `Economy/DropRates.js` (rarity weights). Constants in those files are tuning too;
  prefer moving a constant into `globalTuning.json` when it needs to change per deploy without
  a client build.
- **Levels are derived, never stored.** `Utils/playerManagement.js getDerivedLevel`: level =
  2 + the number of `xpLevels` thresholds the player's XP has passed (5 XP = level 2, 25 =
  3, 50 = 4, 100 = 5, 200 = 6, 480 = 7, 600 = 8, ...). Changing a threshold re-levels every
  player instantly, up or down; lowering one is safe, raising one can demote.

## 2. Principles

1. **The core loop is plant, harvest, make, sell to Kent, level up.** Every early-game tuning
   change is judged by whether it keeps that loop turning: a player should always have a Kent
   offer they can work toward with what their level unlocks.
2. **XP comes from selling and doing, not from collecting.** Harvesting and gathering give no
   XP; Kent trades (2x the items' `xp`), quest turn-ins, combat kills and pets do. So the
   pace of levelling is set by what Kent asks for and how often he can be served, until the
   Train (level 9) and Bank (level 8) open.
3. **Scale through gameplay levers, not multipliers.** Raise a level's pace by giving the
   player richer things to sell (unlocks, multi-item offers, quantities), by shortening a
   wait, or by fixing the curve; never by a hidden global XP multiplier. The visible
   "🔷 XP" on each Kent card must stay honest: it is exactly what the trade pays.
4. **Unlocks drive offers.** Kent only asks for doobers whose own `level` and whose source's
   `level` are at or below the player's. A level with few new unlocks is a level with few new
   offers. When a level feels empty, look at what it unlocks before touching the offer code.
5. **No dead ends.** An offer must be completable with the player's current unlocks and the
   current season (seasonal crops and seasonal ingredients are filtered out), must not require
   valley-only or epic/legendary items, and must not ask for the output of an enemy before
   the player has the "Explore the Valley" trophy.
6. **Money is cheap, XP is the clock.** Trading Post / Global Market move money without XP.
   Price changes affect pacing far less than XP and timer changes; treat `xp` per item and
   the Kent timers as the primary pacing knobs, prices as the secondary.
7. **Change one knob at a time and say why.** A tuning commit names the symptom (e.g. "level
   6 to 7 takes too long"), the knob, the old and new values, and the expected effect. If it
   touches a persisted identifier or a stored offer format, it is not a tuning change: see
   the compatibility rules below.
8. **Measure, then tune again.** The analytics dashboard (`tools/analytics`, Users tab: level
   and XP per player; Engagement: FTUE funnel) is the check. Forward-only data: note the
   deploy date with the change.

## 3. The level curve (xpLevels.json)

XP needed to advance (thresholds in `xpLevels.json`: row `lvl N` holds the XP that reaches
level N+1), as of 2026-10-10:

| To level | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Threshold | 25 | 50 | 100 | 200 | 330 | 480 | 600 | 780 | 990 | 1280 | 1700 | 2260 | 2960 |
| XP gap | 20 | 25 | 50 | 100 | 130 | 150 | 120 | 180 | 210 | 290 | 420 | 560 | 700 |

Rule: the gap should grow smoothly with what the player can earn per hour at that level.
Before 2026-10-05 the 6 to 7 step was 280 (480 threshold), nearly three times the previous
step and more than double the next, at a level where the only XP outlet is Kent; levels 7 to
11 were lowered to 330/480/640/810/990 so the gaps climb 130 to 180 and rejoin the old curve
at level 12 (1280). **Changing a threshold never demotes anyone as long as the new value is
at or below the old one** (levels are derived from XP); every value in that change was lower,
checked against every production player before the commit. A player who crosses a lowered
threshold simply sees the level-up modal on their next session.

2026-10-10 (owner: "level 8 is a little too long"): the level 8 to 9 step went 160 to 120 XP
(threshold 640 to 600) and the 9 to 10 threshold 810 to 780, so the next step is 180 rather
than 210; from level 10 the curve is unchanged. Level 8 is the Bank's first level and still
has only Kent and the Bank as XP outlets, so it had read as a wait. Both values are lower:
nobody is demoted (one production player in range, 693 XP, stays level 9).

## 4. Kent (KentOfferLogic.js, Kent.js, globalTuning.json)

- **Slots and growth.** The board size depends on level (`MAX_OFFERS_BY_LEVEL` in
  `KentOfferLogic.js`, 2026-10-12; replaced `maxKentOffers`): 6 through level 7, 7 at level 8, 8
  from level 9, so the two guaranteed cards below never crowd out the random ones. Completing a
  trade replaces the offer in place and adds one more slot until the cap. Discard-all
  regenerates a full set.
- **Timers.** `kentRefreshTimerSeconds` (20) after a trade before Kent trades again;
  `kentCardCooldownSeconds` (30) per discarded card. These are the throughput cap: a level's
  XP per hour is roughly (XP per offer) x (3600 / refresh seconds) at best.
- **Eligibility.** Doobers only; not `noBank`, not `source: valley`, not epic/legendary
  `scrollchance`, in season (item and ingredients), item level and source level at or below
  the player's, every ingredient (recursively) unlocked at the player's level too
  (`areIngredientsUnlocked`, 2026-10-12: Runic Tunic at 10 needs Ink from 17, the soups and
  Pizza need Olive Oil from the level-22 Winery), enemy outputs gated by the Explore the Valley
  trophy. Owning the source station is NOT required: Kent advertises stations before purchase.
- **Mix by level** (constants at the top of `KentOfferLogic.js`): crop share 80% to level 3,
  50% to level 7, free after; multi-item offers 0 through level 5, usually 1 at level 6,
  usually 2 at 7, 3 at 8 to 9, 5 at 10+; crop quantities and non-crop quantities step up per
  level band (level 6: crops 3 to 10, non-crops 2 to 4).
- **Basic-crop guarantee** (BL-15, 2026-10-10): through level 12
  (`BASIC_CROP_GUARANTEE_MAX_LEVEL`) the board always holds at least one single-item offer for a
  basic crop (`BASIC_CROPS`: Wheat, Carrot, Corn, Sugarcane), so a player can always grow, sell
  and earn XP, and empty a full warehouse, while multi-item offers take over levels 8 to 12. When
  the last one is traded, its replacement is a basic crop. Off from level 13; the owner is
  watching how that feels.
- **Newest-station guarantee** (2026-10-12): the board always holds one single-item offer for a
  good from the newest crafting station the player's level has unlocked (the highest-level
  `category: crafting` station at or below the level with an eligible good: Mill from 4, Dairy
  6, Loom 7, Chicken Coop 8, Oven 10, Beehive 13, Kitchen 14, ...), owned or not. It is the
  card that sells the station. When it is traded, its replacement is another one. Generated
  after the basic-crop card when both are missing.
- **Duplicates.** An item appears in at most 2 offers (1 if it is a new unlock at the player's
  exact level), never twice as a single-item offer, and never twice on one two-item card.
- **Reward.** Money = sum of `maxprice` x quantity over the items (`minprice` or 10 as
  fallback). XP (`calculateKentOfferXP`, the one function for the card and the award) = 2 x the
  sum of the items' `xp` (1 if undefined), plus 2 per item whose quantity is in the top half of
  the player's quantity band for that kind of item (crop or not). From level 11 a bonus valley
  item rolls at `harvestDropRate` (10%), weighted by rarity.
- **Level 6 tuning (2026-10-05).** Besides the curve: Butter `xp` 3 to 4 and Cheese 3 to 5
  (two- and four-Milk Dairy products deserved more than raw Milk's 2; Cornmeal, the Mill
  equivalent, was already 4), and `MULTI_ITEM_TARGET_COUNTS` level 6 is min 1 (was 0), so a
  level-6 board always carries at least one two-item offer, which pays double XP. Expected
  effect: the 6 to 7 stretch drops from 280 XP at about 5 XP per offer to 130 XP at about 7,
  roughly a quarter of the trades. Measure in the dashboard's Users tab (level, xp) before
  touching it again.
- **Skill-tier XP (2026-10-12).** Kent ignores quantity and skill, so a crop's `xp` is the only
  thing that makes a harder offer pay more; gated crops should sit above the tier below. Fruit
  Fingers fruit (Apple, Lemon, Peach, Pear, Tomato, Cherry) 4 to 5 and Orange already 5, so a
  fruit offer pays 10 XP instead of 8; Strawberry 3 to 5; Grapes 2 to 4; Mulberry Leaf 5 to 4.
  Olive stays at 5 (Green Thumb, but the slow grow earns it the top of the tier). Ladder in
  Kent XP: Wheat 2, Grower 4, Green Thumb 4 to 10 (mostly 6 to 8), Fruit Fingers 10. Watch the
  level 10+ pace in the Users tab; if it runs fast, raise the xpLevels.json thresholds rather
  than lowering the fruit again.
- **Crafted-goods XP ladder (2026-10-12).** A crafted good's `xp` = the highest of its old
  value, its station's base, and its top ingredient's `xp` + 1, so selling the pie always beats
  selling the pumpkin and a newer station's goods pay more than an older one's. Station bases:
  Mill 3, Dairy / Loom / Chicken Coop 4, Oven / Beehive 6, Kitchen / Lumber Yard 7, Studio /
  Beverage Station 8, Winery / Coffee Factory 9, Silkery 10. Examples: Bread 4 to 6, Corn
  Chowder 3 to 7, Olive Oil 3 to 9; recipes with a late ingredient sit higher (Runic Tunic 12
  from Ink 11). Keep the rule when adding a recipe. Watch levels 10+ in the Users tab; slow the
  curve (xpLevels.json) before lowering these.
- **Where to intervene for pacing.** In order of safety: (a) item `xp` values and level gates
  in resources.json (data only, no format change); (b) the per-level constants in
  `KentOfferLogic.js` (multi-item target, quantity bands, crop share, board size); (c) the
  timers in globalTuning; (d) the reward formula. Anything that changes the stored offer shape
  (`kentOffers.offers[].items/rewards`) must keep reading the legacy single-item form and
  must not invalidate offers already on players.

## 4b. Train (TrainOfferLogic.js, NewTrain.js, 2026-10-12)

- **Shape.** `maxTrainOffers` (8) orders per Train in three bands, stored on each order as
  `band`: 2 **basic** crops (plots unlocked 3+ levels ago when there are any), 4 **easy** goods
  (non-crops the player has the skills for; crafted goods only from stations unlocked 2+ levels
  ago), 2 **aspirational** (⭐ in the panel) from the newest station the player's level has
  unlocked, owned or not, skill or not; fallback the highest-`xp` goods they can already make.
  First-time users get crops only. Same eligibility as Kent otherwise (season, levels,
  ingredients unlocked, no valley / epic / noBank).
- **Quantities** (`QUANTITY_BY_LEVEL`): to level 12 basic 10-20, easy 3-8, aspirational 2-4;
  to 19 basic 15-30, easy 5-10, aspirational 3-5; then 20-40, 8-15, 4-6. Goods with `maxprice`
  of 2,000 or more are asked for in half (rounded up).
- **Rewards, tiered.** Each order is worth `xp` x 2 x ceil(quantity / 5) XP. The **base tier**
  (XP of the basic and easy orders) is mailed the moment every order but the aspirational ones
  is filled (6 of 8); the **full tier** (XP of the aspirational orders + 1 to 3 seasonal hearts)
  when all are filled, with the celebration. Money per order on delivery is unchanged
  (`maxprice` x quantity). Markers on `player.train`: `lastBaseRewardTrainNumber`,
  `lastRewardDeliveryTrainNumber` (full; also set at departure). Trains saved before tiers read
  their XP as the base tier and the rest as the full tier. Typical totals: about 80 XP at level
  9 to 10, 100 at 11, 200 at 14, 240 at 20 (was a flat 15 to 45 for all eight).
- **Why tiered:** aspirational orders are a stretch, never a wall; without tiers one unfillable
  order voided the whole Train.

## 4c. Trophies

- **Skill Builder** milestones `[1, 5, 10, 15, 20, 30, 40, 50]` (2026-10-12; was 3, 5, 10, 50,
  100 with 56 skills in the game). Milestones fire on an exact count, so a change never pays
  retroactively.
- **Swing cooldown**: `attackCooldownMinMs` (400) + `(speed - 1) × attackCooldownPerSpeedMs`
  (100), clamped to `attackCooldownMaxMs` (800). Speed 1 → 0.4 s, speed 5 (starter) → 0.8 s;
  speed-reducing powers (Jab, Flurry, Barrage, Magic Gloves) make swings faster, never
  below the minimum. The cooldown starts only on a valid swing (never on a refused click).
- **Reach is Chebyshev** (board distance): the eight neighbours are 1 away for both the
  player's `attackrange` and an enemy's. Enemy `attackrange` in resources.json is now 1 for
  melee beasts (Coyote, Bear, Polar Bear, Zombie), 2 Ogre / Duke Angelo, 3 Demon, 4 Spider /
  Dragon, 5 Ghost / Phoenix. Sight (`range`) stays larger so there is an approach. Anything
  beyond reach 1 is a ranged attack for an ENEMY and shows a projectile. For the player,
  melee vs ranged is the equipped weapon's `ranged` flag (resources.json, ECONOMY sheet column
  `ranged`): bows, crossbows and Darts are ranged (they keep their `attackrange` bonus and show a
  projectile); swords, axes, spears and halberds are melee and their `attackrange` is 0.
  Reach-adding powers (Horizon Eye and the like) still extend a melee swing. Owner note
  2026-10-08: reconsider that once the melee/ranged split settles (a sword with reach 3 is odd).
- **Rolls** are unchanged: d20 + attack bonus vs armour class; damage = stat + d6. Enemies
  roll on the tick they come into reach (after a 300 ms wind-up) and once per tick after;
  enemy `speed` still does not set the attack rate (a per-type interval is open work).
- **Death**: `respawnHpFree` (40) for free accounts, `respawnHpGoldFraction` (0.5) of the
  derived max hp for Gold; max hp is re-derived from base + maxhp powers
  (`PlayersInGrid.derivedMaxhp`) so no bonus is lost on death or revive.
