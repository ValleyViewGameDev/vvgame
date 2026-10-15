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
- **Timers.** `kentCardCooldownSeconds` (30) per slot, after a sale or a discard: that slot
  shows a countdown and then flips over to its new offer; the other slots stay open (since
  2026-10-12 there is no panel-wide "Kent is away" pause, so `kentRefreshTimerSeconds` is no
  longer read). The throughput cap is now per slot: at best (slots) x (XP per offer) x
  (3600 / cooldown seconds) XP an hour, several times the old one-sale-per-pause rate.
- **Eligibility.** Doobers only; not `noBank`, not `source: valley`, not epic/legendary
  `scrollchance`, in season (item and ingredients), item level and source level at or below
  the player's, every ingredient (recursively) unlocked at the player's level too
  (`areIngredientsUnlocked`, 2026-10-12: Runic Tunic at 10 needs Ink from 17, the soups and
  Pizza need Olive Oil from the level-22 Winery), enemy outputs gated by the Explore the Valley
  trophy. Owning the source station is NOT required: Kent advertises stations before purchase.
- **Mix by level** (constants at the top of `KentOfferLogic.js`): crop share 80% to level 3,
  50% to level 7, free after; multi-item offers 0 through level 5, usually 1 at level 6,
  usually 2 at 7, 3 at 8 to 9, 5 at 10+. Quantities are sized by effort (§4c, `askSizing.kent`).
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
  sum of the items' `xp` (1 if undefined), plus 2 per item whose quantity is above that good's
  usual ask at this level (the rounded center of its effort-sized ask, §4c). From level 11 a bonus valley
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
  `KentOfferLogic.js` (multi-item target, crop share, board size) and `askSizing` in
  globalTuning (§4c); (c) the
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
- **Quantities** are sized by effort (§4c, `askSizing.train`), the aspirational band at
  `trainBandScale.aspirational` (0.6) of a normal order. First-time users: crops, 5 to 20.
- **Rewards, tiered.** Each order is worth what Kent would pay for the same goods: 2 x the
  good's `xp` per Kent card it equals, where cards = quantity / Kent's usual ask for that good at
  this level (rounded, at least 1). The **base tier**
  (XP of the basic and easy orders) is mailed the moment every order but the aspirational ones
  is filled (6 of 8); the **full tier** (XP of the aspirational orders + 1 to 3 seasonal hearts)
  when all are filled, with the celebration. Money per order on delivery is unchanged
  (`maxprice` x quantity). Markers on `player.train`: `lastBaseRewardTrainNumber`,
  `lastRewardDeliveryTrainNumber` (full; also set at departure). Trains saved before tiers read
  their XP as the base tier and the rest as the full tier. Typical totals (simulated): about 90
  to 110 XP at levels 9 to 11, 140 at 14, 190 at 20 (was a flat 15 to 45 for all eight). To pay
  the Train more, raise `askSizing.train` qtyAt1Min: bigger orders count as more Kent cards.
- **Why tiered:** aspirational orders are a stretch, never a wall; without tiers one unfillable
  order voided the whole Train.

## 4f. Bank (schedulers/bankScheduler.js, Bank.js)

- Each Bank round (`globalTuning.bank`, active 480 min) generates `globalTuning.bankOffers` (3)
  random offers for doobers within ±1 of the season level (not `noBank`), then appends the
  permanent Silver x10 / Diamond Ring x1 / Gold x2 offers unless a random one already took that
  resource. Payout: a price per unit between `minprice` and the min/max midpoint, x qty x 0.9,
  always Money.
- **Variety rule (2026-10-14): no two offers in a round are the same resource.** Picks are drawn
  without replacement. Only if the level's pool is smaller than the number of offers can a
  resource repeat, and then never at the same quantity (`rollDistinctQty`). Before this, picks
  were independent, so two identical offers (Diamond Ring x8 twice) could appear.
- Offers are repeatable for the whole round: a sale puts the card on a short cooldown, it does
  not use the offer up.

## 4c. Effort and ask sizing (2026-10-12)

How many units Kent and the Train ask for. Before this, Kent asked 15 to 35 of any non-crop above
level 20 whatever it cost to make (29 Silk = 580 Mulberry Leaves, paying 260,304), and the
Train halved anything over $2,000. Now every ask is sized by how much production one unit costs.

- **Effort** (`effort` column in ECONOMY, minutes per unit, read-only, derived): production time
  through the whole recipe chain, the way a player actually produces it:
  `effort = crafttime / 60 / (yield x parallel) + sum(ingredient qty x ingredient effort)`.
  `crafttime` is the good's own cycle (grow time, animal or tree cycle, craft time); `yield` is
  the farm animal's `qtycollected` for animal products, 1 for crafted goods, the good's own
  `qtycollected` otherwise; `parallel` is the producer's column (below). Math:
  `tools/editor/sheets/economy.js`. The editor recomputes it live and on every ECONOMY save;
  after a hand edit outside the editor run `node tools/derive-economy.js --write`.
  `totalnestedtime` (hand-entered, end-to-end sum, used by the Carnival) is left as it was.
- **parallel** (ECONOMY column on producer rows: plots, trees, animals, stations): how many of
  that producer a typical player runs at once. Without it a chain sums every step end to end
  and 20 Mulberry Leaves count as 20 x 96 h. Seeded 2026-10-12 from the production backup:
  the median count per producer over homesteads of players level 5+ (Oberon, moehong,
  Entropoly, Sheyona, Fiona, Mobile, Dreamerr), where at least 3 players own one. Measured:
  Cow 11, Sheep 6, Pig 2, Brown Cow 3; Olive Tree 16, Lemon Tree 18, Apple Tree 33, Coconut
  Tree 4, Grape Vine 30; Mill 6, Dairy 5, Loom 3, Chicken Coop 10, Oven 5, Beehive 10, Kitchen
  5, Lumber Yard 8, Studio 4, Beverage Station 3, Winery 1. Fallbacks where too few own one:
  every crop plot 18 (plots are interchangeable, so one value; the per-crop medians were 16 to
  20), other trees 15, other animals 4, other stations 1. Re-measure as the player base grows.
- **Check:** effort ranks goods in nearly the same order as `maxprice` (Spearman 0.80 over the
  118 sellable goods; the old `totalnestedtime` 0.78, a good's own `crafttime` 0.08). The goods
  that disagree most are price problems, not effort problems: the coffee chain (Coffee Latte
  145,000 effort-minutes for $10,526), Silk Dress ($2,590 from $28,176 of inputs), Olive.
- **Ask sizing** (`Economy/askSizing.js`, knobs in globalTuning `askSizing`, the globalTuning
  sheet): `center = qtyAt1Min(level) x effort ^ -exponent`, then a random `spread` (±25%) and
  the level's `[min, max]`. Separate level tables for `kent` and `train`; `trainBandScale`
  multiplies a Train band. `exponent` 0.4 is Hay Day's boat-crate curve (below): ten times the
  effort asks for about 2.5 times fewer units, so slow goods come in a handful and quick ones in
  dozens, but a slow-good ask is still the bigger job.
- **Hay Day (research, 2026-10-12).** Supercell sizes boat crates by the item's production time,
  not by player level: Wheat (2 min) 50 to 101 a crate, Soybean (20 min) 24 to 47, Pumpkin (3 h)
  9 to 15, Cherry (27 h) 5 to 7; that is quantity ~ 100 x minutes ^ -0.4. Its prices are
  ingredients' value plus a value for the production time, and its XP is close to a fixed share
  of price (about price / 8.4 across Bread 21/3, Cheese 122/15, Blanket 1,098/131, Chocolate Roll
  604/72), so a good's XP and money rise together. Ours set `xp` by hand (the crafted-goods
  ladder in §4); an XP-from-price rule is a possible next step, not adopted. Sources: Hay Day
  wiki Boat and Crops List pages; the shootingspeed.com goods list.

## 4e. Gem prices (2026-10-14, backlog T-2)

What a good costs in gems (`gemcost`, ECONOMY, read-only, derived). Background and the before
numbers: docs/economy-plan.md.

- **Rule** (Hay Day's "time is diamonds"): `gemcost = ceil(Money x 0.01 + smooth(sum(other
  ingredient qty x ingredient gemcost) + (crafttime minutes) ^ 0.45))`, each ingredient priced
  the same way first. Skills, powers, buildings and goods all use it. Math: `tools/editor/sheets/economy.js computeGemcost`;
  the editor recomputes it on every ECONOMY save, `node tools/derive-economy.js --write` after a
  hand edit.
- **smooth**: unchanged up to 250 gems, then `250 x (x / 250) ^ 0.35`. Below 250 (most goods)
  prices are the plain sum; above it a deep chain or a big unlock still costs more, just not
  absurdly more: 1,000 raw = 407, 10,000 = 910, 100,000 = 2,036. It applies at every step of a
  chain (each ingredient is already smoothed), so real prices end lower still.
- **Money is 100 coins a gem, never smoothed** (Money `gemOverride` 0.01; it was 0.125, 8 coins a
  gem). Smoothed, a big coin shortfall bought with gems undercut the Store's Money packs (a
  missing 2.5M cost less than the $90 pack). Linear, every Money pack beats buying coins with
  gems. Money-only items are now cheap in gems (Horse 30, Builder 10) and the coin-heavy
  buildings dear (Coffee Factory 5,927, Silkery 4,538, Boat 10,001 for its 1M coins).
  `GEM_PRICE` in economy.js; `game-client/src/Economy/gemPricing.js` holds the same numbers and
  `Economy/GemCosts.js` applies them to what a gem purchase charges (the missing Money flat, the
  other missing ingredients smoothed), so buying the shortfall never costs more than the derived
  price says.
  Keep the two copies in step.
- **rare** (ECONOMY checkbox): the scroll-find crops (Blueberry, Rosemary, Feverfew, Mushroom,
  Daisy, Tulip, Sunflower, Garlic). Priced on their **effort** (grow time over 18 parallel plots),
  not their wall-clock grow: `ceil(effort ^ 0.45)`. Tulip 72 h grow = 240 effort-minutes = 12 gems
  (was 44). They were what made the potions expensive.
- **gemOverride** (ECONOMY): a hand price that wins over the rule. Set on Money (0.01) and the
  four rows whose sheet price never followed the rule (Honey 37, Cow 67, Doctor 24, Invisible
  Wall 3). Rows with no
  recipe and no crafttime (Money 0.125, gems, specials) keep their stored `gemcost`; since the
  column is read-only in the editor, change those through gemOverride too.
- **Potions** are Apothecary trades (traders.json), so their ECONOMY recipe is the trade:
  Potion A = 6 Rosemary + 2 Daisy + 24 Milk; B = 1 A + 4 Mushroom + 4 Tulip + 2 Garlic;
  C = 1 B + 12 Sunflower + 2 Ink + 1 Feverfew; no crafttime. Change a trade, change the row.
- **Result** (2026-10-14): Potion A 520 -> 176, B 4,542 -> 258, C 19,658 -> 393, Book 3,007 ->
  581, Silk Dress 3,238 -> 458, Common Coffee 16,404 -> 599, Queen's Coffee 49,410 -> 845 (the
  coffee and silk lines stay the dearest goods, as late luxuries); Tailor 1,965,863 -> 1,473,
  Long Sword 9,084 -> 487, Titan 927,100 -> 4,413. Skills and powers median 651. Goods without
  Money in their chain are unchanged at or under 250 gems except the rares and their dishes.
- **Store Money packs** (T-3, same prices): $6 = 100,000, $12 = 250,000 (was 500,000), $90 =
  2,500,000 (was 5,000,000). At 100 coins a gem and the 1,000-gem pack's 1 cent a gem that is
  1.7x, 2.1x and 2.8x the price in value: the bigger pack is the better deal, like the gem packs.
  The item packs (Farmer's, Adventurer's, starters) were left generous on purpose (~10-20x).
- `maxprice` (sell price, ~8 x gemcost) was NOT rederived: coin prices stay as they were.

## 4d. Trophies

- **Skill Builder** milestones `[1, 5, 10, 15, 20, 30, 40, 50, 75, 100]` (2026-10-12; 75 and
  100 added 2026-10-13; was 3, 5, 10, 50, 100). It counts skills only (not powers): with 56
  skills in the game, 75 and 100 wait for more skills (owner's call). Milestones fire on an
  exact count, so a change never pays retroactively.
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
