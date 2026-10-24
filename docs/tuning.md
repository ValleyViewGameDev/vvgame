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
   The Trading Post (level 5, 2026-10-16) is player-to-player: it moves goods, it pays no XP.
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

## 4g. Station level gates

A station's `level` in `resources.json` gates it twice: the Build panel will not build it below
that level, and its panel shows the LevelLock card (`UI/Panels/LevelLock.js`) instead of its
content. Current gates: Trading Post / Trade Stall 5 (2026-10-16; on every homestead from the
start, so a new player sees it locked), Bank 8, Train 9, Carnival 12.

A recipe's own `level` is a lock too, inside a station the player already owns (CraftingStation,
FarmHouse, shops, 2026-10-19): below it the recipe shows "Level N" in red and cannot be made, and
gems never skip it (they may still buy a missing skill or ingredients). So a station's menu opens
level by level; skills are the Money gate on top of that time gate.

**The Inn** (2026-10-19): built in the Valley only (`source: BuildValley`, valley grids), level 17,
500 Wood + 300 Stone + 300 Clay, one per grid (`maxpergrid: 1`, enforced by the Build panel). A
Rest costs `globalTuning.innRest.costMoney` (2,500) and restores full hp at once; then that Inn
rests for `cooldownMinutes` (1,440), kept on the Inn resource as `craftEnd` (POST /api/inn/rest,
which validates the Inn, the cooldown and the Money and sets hp to the server's derived maxhp).
Priced against the healers (50 to 300 Money for 20 to 50 hp): a full Rest from near empty is
cheaper than healing the same with a Surgeon, but once a day per Inn.

**The Post House** (2026-10-19, 📯): the other Valley building (BuildValley), level 18, 600 Wood +
200 Stone, one per grid. Tapping it opens Backpack Management (no panel) in send-home mode: the
backpack's items go to the warehouse by the post, as at home (warehouse capacity applies; special
items stay in the backpack). `GameFeatures/Inventory/BackpackManageModal.js` is that modal, shared
with the Inventory panel (`canSendHome` = at home or at a Post House).

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

- **Never for gems** (`nogems`, ECONOMY tick box, owner 2026-10-15): some things are earned, not
  bought, whatever their derived price. A `nogems` item gets no gem button and no gem speed-up,
  and neither does any recipe whose MISSING ingredients include one (Economy/GemCosts.js
  `calculateGemPurchase`). Ticked: the Oracle's artifacts (Trident, King's Crown, Prospero's
  Orb, Brass Bell, Phoenix Feather, Vampire's Blood; not the Scroll, an ordinary pet find), Hope,
  the Home Deed, the keys (Skeleton, Golden, Town, Dungeon, Mirror) and the seven Secrets. An
  ingredient or skill with no `gemcost` at all is also not gem-buyable (it used to fall back to
  1 gem, which sold the Shrine's Trident for 1 gem by skipping the Skeleton Key). `output:
  noBank` is a different thing: it only keeps an item off Kent, the Train and the Bank.
  Trader (NPC) trades never offer a gem buy-through; the healer's heal is the one NPC gem button.

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

## 4h. Wild crops: rarity comes from the valley templates (owner, 2026-10-16)

Tulip, Mushroom, Sunflower, Daisy, Rosemary, Feverfew (and Garlic) are not only plot crops or
scroll finds: they are laid out in the hand-made valley templates
(`layouts/gridLayouts/valleyFixedCoord/*.json`, fixed cells + `resourceDistribution`), which
re-seed every season, and every one that is picked replants itself on the spot and grows back (it is `repeatable`: picking it plants its plot there, `ResourceClicking.handleReplant`; Rosemary and Daisy 48 h, Tulip and Feverfew 72 h, Mushroom 18 h, Sunflower 24 h). A valley grid is a renewable patch, so its supply is a rate. Their rarity, and so their price, their quest asks and the level at which
asking for them is fair, depends on WHICH valleys hold them. A crop's `level` or plot level alone
says nothing about that. Re-measure with `node tools/wild-crops.js` after editing templates.

**Where the valleys are** (frontierTier1): homesteads ring the frontier's edge; valley1 is the
ring next to them (1,280 grids, the near valleys), valley2 the next ring in (768), valley3 the
centre (256, the farthest from home, reached later).

Measured 2026-10-16, average laid out per valley grid per season (share of templates with any):

| Crop | valley1 (near) | valley2 (mid) | valley3 (far) | Rarity for an early player |
|---|---|---|---|---|
| Rosemary | 38.7 (63%) | 11.8 (42%) | 83.5 (99%) | common |
| Daisy | 9.6 (39%) | 33.1 (50%) | 23.6 (99%) | common |
| Mushroom | 0.6 (13%) | 16.3 (36%) | 31.4 (99%) | uncommon near, common mid/far |
| Tulip | 0.5 (13%) | 6.2 (31%) | 10.7 (98%) | uncommon (rare near) |
| Feverfew | 0.1 (2%) | 2.9 (33%) | 40.5 (99%) | rare near, common far |
| Garlic | ~0 | 0.6 (11%) | 1.5 (9%) | rare |
| Sunflower | ~0 | 1.2 (1%) | ~0 | very rare (a handful of templates) |
| Blueberry | none | none | none | scroll / plot only |

**How to use it.** An ask of N of a wild crop is fair at the level when the player can reach the
valleys that hold enough of it. Near-valley crops (Rosemary, Daisy) suit early asks; Tulip and
Mushroom asks belong with mid-valley access; Feverfew in quantity is a far-valley crop; wild
Sunflowers barely exist, so Sunflower asks wait for the Florist plot (L23). Helena follows this
since 2026-10-16: the Golden Key for 50 Daisy at L8 (it was 50 Feverfew, which a near-valley
player could hardly find), then repeatable Tulip L9, Rosemary L10, Mushroom L12, Feverfew L14 and
Sunflower L23 (25). Prices should follow the same order (a valley1-common crop is cheap;
Feverfew, Garlic and Sunflower are not).

## 4i. The level 4-16 pinch: tools/progression.js (2026-10-22)

`node tools/progression.js [--to 16] [--player Mobile] [--anchor <homestead coord>] [--grids 10,20,40]`
prints three views: DEMAND (every skill and station up to a level in raw goods, potions broken
down through the Apothecary's trades), SUPPLY (the wild-crop, Rocks and Clay Pit spots on the N
nearest valley grids to a homestead, or on the grids a player has visited: the first sweep, and
what they give back per day once picked, since each regrows on the spot, §4h) and QUESTS by level.
Re-run it after changing a skill cost, a potion recipe, a valley template or a quest level.

**The potion ladder follows the valley rings (owner, 2026-10-22).** Potion A (Rosemary, Daisy,
Milk) is a near-valley good and may be asked for from L6. Potion B (Tulip, Mushroom) is a
mid-valley good: an average mid-valley grid holds about 6 Tulips and 16 Mushrooms, a near one
about half of one of each, and the mid valleys start 15 grids from home (the near ones 7). So
before about L14 Potion B appears only as a single-potion taste; asks for it in quantity, and
Tulip or Mushroom quests in quantity, start at L13-14. Potion C needs Ink (L17), so no skill
before then asks for it. Measured from Mobile (L10, 22 near grids explored): about 2.7 Tulips and
11 Mushrooms a day at best, if it re-walks every grid as they regrow.

Applied 2026-10-22: Potion A takes 16 Milk (was 24). Baker (L11) 6 Potion A + 1 Potion B (was 5 +
5). Artistry L14 with 5 Potion B (was L10 with 10). Keeper L14 (was L13). Tailor (L12) 10 Potion A
(was 100 Potion C). Better Pickaxe L9 (was L10, a level before the Oven). Helena's Tulips L14 x30
(was L9 x50), Mushrooms L13 x30 (was L12 x50) and Feverfew L18 (was L14; a far-valley crop). Titania's Ghosts L17 (was L5) and Ogres L22 (was
L9); Cassio's Spiders L13 (was L10); Hotspur takes the Coyotes, Pelts and Bears (backlog T-5).
New guide quests: Portia's "A Draught of Rosemary" (L7, a first Potion A) and "Physic for the
Town" (L11, 5 Potion A); Mistress Quickly's "Clay Beneath the Hill" (L9, 30 Clay, before her Oven
quest); Helena's "Where the Mushrooms Grow Thick" (L12, 12 Mushrooms, pays 4 Tulips: the Potion B
for Baker). "Baker's Bible" moved to L11 with Baker, the Lemon Cookies to L12, Feste's Artistry
quest to L14.

## 4j. Scroll reveals: tier first (owner, 2026-10-23)

The Ancient Temple's Reveal Scroll (`GameFeatures/Crafting/ScrollReveal.js`) rolls a TIER at fixed
odds, then picks evenly among the items whose `scrollchance` is that tier
(`selectTierFirstItem`, `Economy/DropRates.js`). The odds are `globalTuning.scrollRevealOdds`,
in percent:

| Common | Uncommon | Rare | Epic | Legendary |
|---|---|---|---|---|
| 38 | 28 | 22 | 8 | 4 |

Before this the reveal was one weighted draw over every item (Common 100, Uncommon 50, Rare 20,
Epic 5, Legendary 1 per ITEM), so a tier's share came from how many items it held: with 27
Legendary items the whole tier got 1.9 % and Epic 2.1 %, one particular Legendary about 1 in
1,400 reveals. Now adding an item to a tier never moves the tier odds; it only splits that
tier's share more ways (one Legendary of 27 is about 1 in 675, one Epic of 6 about 1 in 75).
A tier with no items is skipped and the rest renormalised. Scroll (Epic) and Gem (Legendary)
are scroll-reveal items too, so raising those tiers also pays out more of them. Pets and the
warehouse materials still use the per-item weighting (`selectWeightedRandomItem`).

## 4d. Trophies

- **Skill Builder** milestones `[1, 5, 10, 15, 20, 30, 40, 50, 75, 100]` (2026-10-12; 75 and
  100 added 2026-10-13; was 3, 5, 10, 50, 100). It counts skills only (not powers): with 56
  skills in the game, 75 and 100 wait for more skills (owner's call). Milestones fire on an
  exact count, so a change never pays retroactively.
## 5. Combat (globalTuning `combat`, Combat.js, NPCEnemyBehavior.js, CombatFX.js)

- **Swing cooldown**: `attackCooldownMinMs` (400) + `(speed - 1) × attackCooldownPerSpeedMs`
  (100), clamped to `attackCooldownMaxMs` (800). Speed 1 → 0.4 s, speed 5 (starter) → 0.8 s;
  speed-reducing powers (Jab, Flurry, Barrage, Magic Gloves) make swings faster, never
  below the minimum. The cooldown starts only on a valid swing (never on a refused click).
- **Reach is Chebyshev** (board distance): the eight neighbours are 1 away for both the
  player's `attackrange` and an enemy's. Sight (`range`) stays larger than reach so there is an
  approach. The numbers are in §5a. An enemy beyond reach 1 shows a projectile in its
  `projectile` look unless that is `none` (a melee enemy with reach, the Ogre). For the player,
  melee vs ranged is the equipped weapon's `ranged` flag (ECONOMY column `ranged`): bows,
  crossbows and Darts show an arrow; swords, spears and halberds are melee, and a spear or a
  halberd's +1 reach is a longer swing, not a shot.
- **Rolls** are unchanged: d20 + attack bonus vs armour class; damage = stat + d6. Enemies
  roll when they come into reach (after a 300 ms wind-up), then every `attackinterval` seconds
  (ECONOMY column, 5d); an enemy without one still swings once per movement step.
- **Ground that hurts** (`globalTuning.tileHazards`, keyed by tile letter; lava `l`: 5 hp every
  1,000 ms; `GameFeatures/Combat/tileHazards.js`, 2026-10-19). A burn on a clock: every interval
  spent on the hazard costs the damage, walking or standing still. Each movement step
  (keyboard and tap-to-walk, `PlayerMovement.movePlayer`) and App's 1 s loop both advance the
  clock, so a held arrow key across lava is charged for the time it takes (a 64-tile run at 90 ms a
  step is about 6 s, so about 30 hp). A moment off the lava does not reset it; it cools down after a
  full interval off. It used to be a once-a-second sample of where React thought the player stood,
  which a fast crossing never hit; a per-tile charge that followed was too punishing.
- **Death**: `respawnHpFree` (40) for free accounts, `respawnHpGoldFraction` (0.5) of the
  derived max hp for Gold; max hp is re-derived from base + maxhp powers
  (`PlayersInGrid.derivedMaxhp`) so no bonus is lost on death or revive.


### 5a. Reach and sniping (owner, 2026-10-15)

**Philosophy.** Reach decides how a fight is fought. A player who out-ranges an enemy can
"snipe" it: hit it from tiles it cannot answer from. Reach was generous (bows at +6 to +12), so
most fights were won from a distance and the close engagements the enemies are built for never
happened. Reach is now short: players engage closely, and out-ranging a strong enemy is
something a player BUILDS toward (the right weapon plus the reach magic items), not the
default. Weapons and magic items will increasingly be tuned around specific enemies and
scenarios; keep each new one honest against this table: what can it snipe, and what must it
face up close?

**How reach adds up** (`utils/combatStats.js`, mirrored by the client's `powerModifiers`):
base 1 + the EQUIPPED weapon's `attackrange` + every reach magic item owned (Focus +1,
Precision +1, Horizon Eye +1, legendary). A player out-ranges an enemy when their reach is
greater than the enemy's `attackrange`.

| Weapon | attackrange | reach alone | with all 3 magic items |
|---|---|---|---|
| Spear, Halberd, Magic Halberd (melee) | +1 | 2 | 5 |
| Darts | +2 | 3 | 6 |
| Magic Spear (melee, attack bonus +5) | +2 | 3 | 6 |
| Short Bow | +3 | 4 | 7 |
| Crossbow | +4 | 5 | 8 |
| Long Bow | +5 | 6 | 9 |
| Magic Crossbow (legendary) | +6 | 7 | 10 |
| Legendary Crossbow (legendary) | +8 | 9 | 12 |
| Titania's Bow (legendary) | +9 | 10 | 13 |

| Enemy | attackrange | out-ranged by |
|---|---|---|
| Ogre | 2 (melee, `projectile: none`; damage 65, attack bonus 23 since 5d; leaps) | Darts and up |
| Spider | 3 (faster: `movespeed` 2.4, was 1.8 with reach 4) | Short Bow and up |
| Demon | 7 (`projectile: fireball-small`) | Crossbow + all 3 magic items; Long Bow + 2; Magic Crossbow + 1; the legendary bows alone |
| Dragon | 9 (`projectile: fireball`) | Magic Crossbow + all 3 magic items; Legendary Crossbow + 1; Titania's Bow alone |

So a Dragon is sniped only with legendary gear: the Magic Crossbow needs all three reach items,
the Legendary Crossbow one, and Titania's Bow none (it is the rarest find; revisit if that is
too easy).

**Enemy shot looks** (`projectile`, ECONOMY column, CombatFX.drawShot): `arrow` (default),
`fireball` (Dragon: large, ember trail, a little slower so it reads), `fireball-small` (Demon),
`blob` (Spider: an elongated black spit, no point), `none` (melee at any reach).

**The leap** (`leapcooldown` seconds, ECONOMY column; today the Ogre at 5): an enemy chasing a
player 3 to 10 tiles away, with a straight line clear of walls, doors and trees to a free tile
beside the player, stops, vibrates for 1 s, then leaps there in 0.28 s; not again until the
cooldown has passed after landing (NPCEnemyBehavior.js `tryLeap`). It lets a slow melee enemy
close the gap a sniper relies on.

**Books are the combat currency** (owner, 2026-10-16): 23 weapons, armours and combat powers
cost Books (Enchanted Pack L4 up to Titan L47, 300 Books), so Books must be reachable when
combat starts to matter, not when the Studio opens. A Book is 15,000 Money + 6 Thread + 2 Cloth
(2 h at the Library, L7; the Library is built from Money, Wood, Stone and Thread). It never takes
Ink (L17) again: that once gated the whole combat tree at L17. Books also come from fighting:
Ghosts drop one, and combat quests pay them (backlog T-5 moves the early ones to an early giver).

### 5b. The shop catalogue: shared and regional (owner, 2026-10-17)

**Two catalogues.** The Armory, Warrior's Den and Magic Shop sell every item whose `source` is
their type. An item with a `shopregion` (ECONOMY column; a region type from resources.json) is
sold only by shops standing on a grid of that region (`player.location.region`, set per grid in
the editor's World tab), listed first with "Only sold in {region}" (string 10202). Items without
one are the **shared catalogue**: every shop of the type, the main town included (it has no
region). ShopStation.js `soldHere`. The shop list is client-side; the server does not check where
a power was bought.

**Who the enemies are tuned against.** The **baseline** player owns the best shared armour and
weapon at their level plus every shared magic item at or below it. Regional items and scroll
finds (`Only Found in Scrolls`) are bonuses ON TOP, like scrolls: a player who travels gets a
real edge, and adding a regional item never forces an enemy retune. Weapons and armour take
one slot each, so a new one only raises the curve if it beats the slot; magic items have no
slot and all stack, so every shared magic item lifts the baseline for good. Keep new magic items
small (+1 to +3) and priced as Money/Book sinks.

**Rules for new items**
- A shared item stays a notch below the scroll-only item near its level (Knight's Plate AC 16
  at L33 vs Mystic Armor AC 16 at L29).
- A regional item is a notch above the shared item at its level, or a sidegrade with a
  trade-off the shared list does not have (Fen Leathers: AC 12 and faster; Dunmorrow Bastion:
  AC 17 but speed +2; Witches' Charm: attack +2, max hp -50).
- Near-ring towns (valley1) sell items for L8 to L24, mid-ring towns (valley2) for L20 to L50;
  each region pays in a good it is known for (Belmont Gold, Setebos Pelt, Sunflower Lake
  Sunflowers, Sycorax Fen Mushrooms, Mantua Potion A, Windsor Port, Lethe Wharf Potion C).
- No new weapon passes Long Bow's reach (+5), so the sniping table in 5a still holds.
- gemcost is derived (4e); a new row needs `gemcost: 0` once to opt in, then the editor prices it.

**Shared catalogue added 2026-10-17** (fills the gaps: no armour from L11 to L19, no melee
upgrade after L17, no magic AC before L21, flat hp until L36, nothing after L36 but Titan):

| Lvl | Item | Shop | Stats |
|---|---|---|---|
| 8 | Warding Charm | Magic | AC +2 |
| 13 | Broadsword | Den | damage 16 |
| 14 | Vigor | Magic | max hp +150 |
| 15 | Scale Mail | Armory | AC 11 |
| 16 | Iron Skin | Magic | AC +3 |
| 21 | War Hammer | Den | damage 20, speed +1 |
| 22 | Recurve Bow | Den | ranged, damage 8, attack +2, reach +5 |
| 28 | Endurance | Magic | max hp +300 (needs Stoneheart) |
| 33 | Knight's Plate | Armory | AC 16 |
| 34 | Bastard Sword | Den | damage 21, attack +1 |
| 40 | Bulwark | Magic | AC +3 |
| 42 | Heavy Crossbow | Den | ranged, damage 11, attack +4, reach +5 |
| 42 | Fury | Magic | attack +3 (needs Unerring) |
| 45 | Executioner's Axe | Den | damage 22, attack +1, speed +1 |
| 48 | Gilded Plate | Armory | AC 17 |
| 55 | Colossus | Magic | max hp +600 (needs Unbreakable) |

**Regional catalogue** (one item per shop each region has; the region map is in the database,
re-read it with a grids query on `isTemplate: true`):

| Region (ring) | Armory | Warrior's Den | Magic Shop |
|---|---|---|---|
| Setebos Rise (1) | Setebos Hide L8, AC 9 | Stone Maul L14, dmg 17, spd +1 | Rock Totem L12, hp +100 |
| Belmont (1) | Belmont Brigandine L12, AC 11 | Portia's Rapier L10, dmg 13, atk +2 | Lead Casket L9, AC +1, hp +50 |
| Strathmoore (1) |  | Highland Longbow L16, ranged 7, atk +1, reach +5 | Thistle Brooch L10, AC +1, atk +1 |
| Sunflower Lake (1) | Sunwoven Mail L16, AC 12 | Lakeside Spear L18, dmg 8, atk +2, reach +2 | Sunflower Crown L15, AC +1, hp +100 |
| Mantua (1) |  | Mantuan Dagger L16, dmg 12, spd -1 | Apothecary's Vial L20, hp +150 |
| Dunsinane (1) |  | Macbeth's Claymore L20, dmg 19, spd +1 | Witches' Charm L18, atk +2, hp -50 |
| Sycorax Fen (1) | Fen Leathers L21, AC 12, spd -1 | Fen Hook L22, dmg 18, atk +2 | Sycorax's Hex L24, dmg +2 |
| Avondale (2) | Avon Scale L22, AC 14 | Bard's Blade L21, dmg 19, atk +1 | Swan Feather L20, atk +2 |
| Messina (2) | Don Pedro's Mail L23, AC 14 | Messina Saber L24, dmg 20, atk +1 |  |
| Windsor (2) | Garter Plate L27, AC 15, hp +100 | Herne's Bow L26, ranged 9, atk +3, reach +5 | Falstaff's Flagon L25, hp +250, spd +1 |
| Bohemia (2) | Bearskin Mantle L26, AC 14, hp +150 | Boar Spear L27, dmg 13, atk +2, reach +2 | Hermione's Grace L29, AC +1, hp +200 |
| Navarre (2) |  | Courtier's Rapier L28, dmg 17, atk +3, spd -1 | Academe Tome L27, atk +2 |
| Dunmorrow (2) | Dunmorrow Bastion L30, AC 17, spd +2 | Morrow Glaive L32, dmg 14, atk +2, reach +2 | Morrow Ward L30, AC +2 |
| Harfleur (2) | Breach Plate L34, AC 17, hp +100 | Agincourt Longbow L35, ranged 11, atk +4, reach +5 | Crispin's Banner L33, dmg +3, atk +1 |
| Valdoria (2) | Valdorian Mail L38, AC 17 |  | Valdorian Signet L36, dmg +3 |
| Lethe Wharf (2) | Ferryman's Shroud L40, AC 17, hp +200 | Lethe Scythe L42, dmg 23, atk +1, spd +1 | Draught of Lethe L40, hp +400 |
| Acheron (2) | Ashen Plate L46, AC 18, spd +1 | Demonbane L50, dmg 25, atk +2, spd +1 | Charon's Obol L45, AC +2, hp +300 |

Player power by level under the equip rules is in 5c.

### 5c. Equip slots: hands, shields and magic slots (owner, 2026-10-17)

**What counts** (`game-client/src/GameFeatures/Combat/combatGear.js`, mirrored by
`game-server/utils/combatStats.js`; the Combat panel equips, `player.settings` stores):

| Slot | Holds | Rule |
|---|---|---|
| Weapon | 1 (`equippedWeapon`) | `hands` (ECONOMY column): 1 or 2; shown as 🤚 / 🤚🤚 in the Combat panel and on shop cards |
| Shield | 1 (`equippedShield`) | `shield: true` rows in the Armory; counts only beside a one-handed weapon (or none). Equipping a two-hander takes it off; the Shields list greys out |
| Armor | 1 (`equippedArmor`) | never a weapon or a shield (Titania's Bow AC +1 is a weapon) |
| Magic | `magicSlots` (`equippedMagic`) | `globalTuning.combat.magicSlotsBase` 5; more for gems |

- A player who has never chosen (no `equippedMagic`) wears their 5 highest-level magic items,
  so nobody drops to zero when the rule lands. A newly bought or found magic item goes on by
  itself while a slot is free.
- Extra magic slots: `globalTuning.combat.magicSlotGemCosts` [250, 500, 1000, 1750, 2500] for
  the 6th to 10th (about $2.50 to $25 each at the 500-gem pack price), bought through
  `POST /api/player/buy-magic-slot`; `magicSlots` is developer-only on `/update-profile`.
- Magic slots make magic items a CHOICE: the baseline no longer stacks every item it owns.
  Small items (+1 to +3) still matter, because slots are scarce early and players swap for
  the fight ahead (reach and speed against Spiders, AC and hp against Ogres).

**Two-handed vs one-handed.** Two-handed: every bow and crossbow, great swords, claymores, mauls,
hammers, axes, halberds, glaives, scythes and the long spears (Lakeside, Boar). One-handed:
knives, daggers, swords, rapiers, sabers, the Spear, the Magic Spear and the legendary swords
(Sword of Song, Glowing Sword, Legendary Sword). A two-hander is about +3 damage over the best
one-hander at its level; a shield is +2 to +7 AC. Shared one-handers keep that path alive after
the Broadsword: **Arming Sword** L24 (damage 18) and **Falchion** L38 (damage 20, attack +1).

**Shields** (Armory, shared catalogue):

| Lvl | Shield | Stats |
|---|---|---|
| 5 | Buckler | AC +2 |
| 14 | Kite Shield | AC +3 |
| 24 | Heater Shield | AC +4 |
| 36 | Tower Shield | AC +6, speed +1 |
| 52 | Aegis | AC +7, max hp +100 |

**Player power by level** (baseline = shared catalogue; best armour, best melee weapon of the
build, best shield for one-handers, the 5 magic items worth most; base AC 10, attack 10,
damage 15, hp 1000, speed 5).

| Lvl | Sword and shield AC / atk / dmg / hp | Two-hander AC / atk / dmg / hp |
|---|---|---|
| 8 | 22 / 10 / 22 / 1100 | 20 / 10 / 15 / 1100 (no two-handed melee before L14) |
| 12 | 24 / 14 / 30 / 1000 | 22 / 14 / 15 / 1000 |
| 16 | 24 / 14 / 34 / 1000 | 21 / 14 / 18 / 1000 |
| 20 | 25 / 18 / 31 / 1000 | 22 / 19 / 33 / 1000 |
| 22 | 30 / 22 / 31 / 1200 | 27 / 23 / 33 / 1200 |
| 26 | 34 / 23 / 33 / 1200 | 30 / 23 / 33 / 1200 |
| 30 | 39 / 19 / 33 / 1200 | 35 / 20 / 30 / 1200 |
| 34 | 40 / 15 / 38 / 1200 | 36 / 16 / 41 / 1200 |
| 42 | 40 / 12 / 40 / 1700 | 36 / 12 / 41 / 1700 |
| 50 | 41 / 12 / 48 / 1700 | 37 / 12 / 49 / 1700 |

(Attack drops after L30 in this table only because the 5 slots fill with AC, damage and hp items
ahead of Steady Hand and Pinpoint; a player facing high-AC enemies would swap them back.)

Blessed Veil moved from L22 to L27 (2026-10-17) so Stoneheart's +5 at L21 and the Veil's +5 no
longer land together. The enemy stat table is fitted to these two columns (5d).

### 5d. Fitting enemies: the method (owner, 2026-10-17)

Enemy stats are not hand-picked; they are FITTED to the baseline player at the level where the
enemy lives. Re-fit whenever the shared catalogue, the equip rules or the base stats change.

**1. The baseline player at level L** (5c): base AC 10, attack +10, damage 15, hp 1000, speed 5
(starterAccount.json); plus the best shared armour, the best shared melee weapon of the build,
a shield for the one-handed build, and the 5 magic items worth most to a player gearing for a
fight (AC and attack first, then damage, then hp; speed counts, lower is faster). Regional items
and scroll finds are NOT in the baseline (5b). Two builds: sword and shield, two-hander.

**2. Each enemy's targets** (its home level is where players meet it; its role sets the rest):

| Enemy | Home | Role | Kill takes | One fight costs |
|---|---|---|---|---|
| Coyote | L3 | pack trash, valley1 | 3 s | 2% hp |
| Bear | L6 | trash, valley1 | 6 s | 5% |
| Spider | L12 | pack trash, reach 3, valley2 | 2 s | 2% |
| Zombie | L14 | slow tank, valley2 | 9 s | 7% |
| Ghost | L17 | reach 5, valley2 | 6 s | 7% |
| Ogre | L22 | elite, leaps, valley2 and 3 | 14 s | 15% |
| Demon | L28 | elite, reach 7, valley2 and dungeons | 15 s | 15% |
| Dragon | L40 | boss, reach 9, valley3 and dungeons | 40 s | 50% |
| Phoenix | L55 | boss, dungeon | 75 s | 70% |
| Great Bear | L10 | mini-boss, guards Leontes' castle in Belmont (1011165) | 20 s | 25% |
| Cerberus | L34 | boss, three quick bites, the Pit of Acheron | 30 s | 40% |

**3. The formulas** (hit when d20 + attack >= AC, so hit chance = (21 - (AC - attack)) / 20,
clamped 5% to 95%; damage = stat + d6, average stat + 3.5; player swing = 0.4 s + 0.1 s per speed
point above 1, at most 0.8 s):
- enemy **attack** = player AC - 12: it hits the sword-and-shield build 45% (the two-hander,
  about 3 AC lower, 55% to 60%);
- enemy **AC** = player attack + 8: the player hits it 65%;
- enemy **hp** = kill time x player damage per second (65% x (player damage + 3.5) / swing);
- enemy **damage** = cost x player hp x attackinterval / (its hit chance x kill time) - 3.5;
- **attackinterval** sets the feel (Spider 0.9 s, quick and light; Ogre 2.4 s, slow and heavy).
  It is its own ECONOMY column: enemies no longer attack once per movement step
  (NPCEnemyBehavior `performAttack`), so `movespeed` is chase speed only.

**Late enemies are fitted to a lighter loadout** (owner, 2026-10-19). From the Ogre on (home L22+),
the baseline player in step 1 wears only ONE AC magic item (the best: Stoneheart) and fills the
other slots with attack, damage and hp. A player who slots for offence should still be able to
fight a Demon; one who stacks AC magic (Stoneheart + Blessed Veil + the scroll helms and gloves)
is rewarded with cheap fights instead of being the only one who can fight at all. Each +5 AC
magic item moves an enemy's hit chance 25 points, so fitting to the AC-first player made every
other loadout miserable (Oberon at AC 32, no AC magic: a Demon hit 80%, now 55%).

**4. The fitted table** (2026-10-17, late enemies re-fitted 2026-10-19; the Zombie's damage is
53, +50% over the fit's 35 (owner): it is so slow that reaching one is rare, so a Zombie that
does catch you should hurt. Its Spawner allows 10 Zombies on a grid, was 5):

| Enemy | Attack | AC | Damage | Max hp | Attacks every |
|---|---|---|---|---|---|
| Coyote | 3 | 18 | 11 | 60 | 1.0 s |
| Bear, Polar Bear | 8 | 18 | 26 | 170 | 1.6 s |
| Spider | 12 | 22 | 19 | 70 | 0.9 s |
| Zombie | 13 | 22 | 53 | 440 | 2.2 s |
| Ghost | 17 | 22 | 38 | 240 | 1.6 s |
| Ogre | 18 | 30 | 65 | 520 | 2.4 s |
| Demon | 22 | 31 | 45 | 490 | 1.8 s |
| Dragon | 25 | 32 | 115 | 1250 | 2.5 s |
| Phoenix | 27 | 24 | 96 | 2830 | 2.0 s |
| Great Bear (2026-10-24; `artScale` 1.5) | 10 | 18 | 52 | 730 | 1.8 s |
| Cerberus (2026-10-19; boss, home L34, melee) | 23 | 31 | 29 | 1010 | 0.9 s |

**5. Check the window.** An enemy should matter for about 12 levels: costly 6 levels below its
home, on target at home, cheap 6 levels above (the d20 covers 20 points, the player's AC grows
about 30 over the game, so every enemy fades; harder zones carry the curve on). HP lost per
fight with the table above, sword and shield / two-hander:

| Enemy | home - 6 | home | home + 6 |
|---|---|---|---|
| Coyote x3 | 15% / 16% | 11% / 16% | 1% / 5% |
| Bear | 14% / 15% | 5% / 9% | 2% / 4% |
| Spider x3 | 36% / 57% | 12% / 26% | 5% / 8% |
| Zombie (damage 53) | 32% / 51% | 10% / 25% | 6% / 9% |
| Ghost | 16% / 33% | 7% / 8% | 5% / 6% |
| Ogre (1 AC item) | 47% / 104% | 15% / 19% | 9% / 15% |
| Demon (1 AC item; AC-first 7% at home) | 21% / 25% | 15% / 21% | 13% / 17% |
| Dragon (1 AC item; AC-first 32% at home) | 87% / 102% | 50% / 81% | 50% / 74% |

**Drops that make a hard enemy worth it.** Demons drop a Scorpion (2026-10-19): sells for 3,500
to 5,000 (about twice a Silver), never bought with gems; Hecate's Torch costs 12 and Acheron's
gear (Ashen Plate, Demonbane, Charon's Obol) is priced in them, so Demon kills pay toward things
a player wants (docs/story.md §6, the Brief Candle).

**Levers that are not enemy stats.**
- **Weapon attack by tier** (2026-10-17): every weapon has at least attack +1 from L17, +2 from
  L27, +3 from L40, so attack grows with gear and not only through the 5 magic slots.
- **Placement**: an enemy met far below its home level is the real killer (an Ogre met at L16 is
  half your hp, more with a two-hander). Valley2 still holds Ogres (0.9 per grid) and Demons
  (0.27 per grid) beside the Spiders; the grid plan's enemy-balance phase should move them to the
  inner half of valley2 and to valley3.
- **Packs**: three enemies at once already cost about three times one (they all swing on their
  own clocks); there is no extra gang-up bonus. Revisit after play.

