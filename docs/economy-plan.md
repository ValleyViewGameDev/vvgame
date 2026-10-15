# Economy plan: gem costs (T-2) and the Store (T-3)

Status: PROPOSAL (2026-10-14), not built. Read with `docs/tuning.md` and `docs/Hay Day Economy.pdf`.

## 1. What Hay Day does (the GDC 2018 talk in docs/)

- **Time is diamonds.** Every good has a Diamond Value: the sum of its ingredients' values plus
  `T^0.45` for its own production time (T in minutes). Wheat (2 min) = 1, Egg (20 min) = 4, a
  Cookie = 21. The curve is concave: a long wait costs fewer diamonds per minute than a short one.
- **Everything else is a multiple of it.** Coin value = A × DV, XP = B × DV.
- **Orders are generated against a target DV** (1-6 random goods added up to it), then the reward
  is "spiced up".
- **Markets are two-sided**: limited storage, goods that cannot be trashed, and materials handed
  out asymmetrically (each player group gets the three building materials in different odds).

## 2. What we have (measured from tuning/resources.json)

Most of it is already Hay Day, and works:

- **Crafted goods follow the formula exactly**: 71 of 71 crafted doobers have
  `gemcost = Σ(ingredient gemcost × qty) + (crafttime minutes)^0.45`.
- **Sell prices are coins = A × DV with A = 8**: `maxprice / gemcost` has a median of exactly 8.
- **Speed-ups use the same curve**: `Economy/EconomyUtils.js calculateGemSpeedupCost` charges
  `ceil(minutes^0.45)`.
- **Money's own value is consistent with that**: Money `gemcost` 0.125 (1 coin = 1/8 gem).
- **Asymmetric materials already exist**: the warehouse drops (Saw / Shovel / Screwdriver) use a
  per-player rarity (`Utils/WarehouseMaterials.js getPersonalizedWarehouseRarity`).
- **XP is hand-tuned, not B × DV**, deliberately (tuning.md: XP is the clock). Keep it that way.

The formulas themselves are NOT in the repo: `gemcost`, `totalnestedtime`, `maxprice` are
stored numbers exported from the Google Sheet. At runtime (`Economy/GemCosts.js
calculateGemPurchase`) a gem purchase charges `gemcost × missing qty` per missing ingredient,
plus the missing skill's `gemcost`.

## 3. Where gem costs explode, and why

**(a) Rare items valued through a craft chain nobody performs.** Potion A, B and C have recipes
but no station crafts them; players get them from scroll reveals, Zombie kills, quests and the
Store. Their value was still computed through the chain: Potion A = 8 h + 24 Milk + ... (22.5 days
nested), Potion B = 8 Potion A + ..., Potion C = 4 Potion B + ... So Potion C = **19,658 gems**
(≈ $200 at the 1,000-gem pack price), while the $8 Farmer's Pack hands out 20 of them.

**(b) Skills and powers just add their ingredients up.** A skill's gemcost is exactly
`Σ(ingredient gemcost × qty)`, no time term and no compression. With 50-100 Potion C in a recipe,
that is millions: Tailor (L12) 1,965,863; Vintner 2,087,880; Florist 2,058,110; Titan 927,100.
57 items (28 skills, 22 powers) depend on the potions or on Book.

**(c) Book is "craftable" but really a rare.** Library, 3 s, 15,000 Money + Thread + Ink =
3,007 gems; the $8 Adventurer's Pack gives 20. Powers ask for 50-300 Books.

**(d) Deep chains with big multipliers** (Hay Day keeps recipe quantities at 1-3): the coffee
line (6 Coffee Cherry → Green Bean; 10 Green → Light Roast; 5 Medium → Common Coffee ...) reaches
Common Coffee 16,404 and Queen's Coffee 49,410; Silk Dress 3,238. Correct by the formula, but
very high for gem purchase.

**(e) Money in the Store is ~20× cheaper than Money in the game.** Internally 1 coin = 1/8 gem;
the Basic Money Pack sells 100,000 coins for $6 (≈ 600 gems, ~167 coins per gem).

## 4. Proposal (work with what we have, nothing from scratch)

1. **Put the formula in the repo.** A small script (tools/economy/) that recomputes the derived
   columns (`gemcost`, `totalnestedtime`, `maxprice`) from the inputs with today's rules, and a
   `--check` that reports drift. First run must reproduce today's numbers (it does for the 71
   crafted goods), so nothing changes until we change an input.
2. **Hand-rolled "effort" for rares** (the owner's "time isn't obvious" case). A new input,
   `effortMinutes`: the minutes of ordinary play it takes to come by one, at the level it starts
   to matter. Its value goes through the SAME curve: `DV = effortMinutes^0.45`. It replaces the
   chain for items no station makes: Potion A-C, Book (and later Bones, Silver, Gold, Diamond
   Ring, which look hand-set already). Starting guesses, sized to agree with the Store packs:

   | Item | effort | gems (today) |
   |---|---|---|
   | Potion A | 4 h | 12 (520) |
   | Potion B | 1 day | 26 (4,542) |
   | Potion C | 3 days | 43 (19,658) |
   | Book | 2 days | 36 (3,007) |

3. **Skills and powers keep "the recipe is the price"**, but on sane inputs: with step 2 alone the
   median skill/power goes from 9,084 to ~1,500 gems and the maximum from 2.09 M to ~36 k.
   The recipe quantities stay the design dial. Add a guardrail in the `--check`: list any unlock
   above a level ceiling (e.g. 100 × level gems) for review rather than silently capping.
4. **Deep chains**: review the eight crafted goods above 1,000 gems (coffee line, silk) and either
   trim quantities toward Hay Day's 1-3 or accept them as late luxuries.
5. **Money**: keep 1 coin = 1/8 gem in the game (sell prices depend on it); fix the gap on the
   Store side in T-3.
6. **T-3, the Store**: price every pack by the DV of what is in it, so the ratio of value to price
   is a rule, not a guess (e.g. every pack delivers at least 2× its price at the 1,000-gem rate,
   starter packs more). Money packs and the Farmer's / Adventurer's packs get revalued with the
   new potion and Book values.

## 5. Owner decisions

- The `effortMinutes` guesses in step 2 (or how to estimate them).
- The unlock guardrail (ceiling per level), and whether skills / powers may be bought with gems at
  all past some level.
- Money: keep the in-game rate and reprice Money packs (proposed), or the reverse.
- Deep chains: trim or keep.
