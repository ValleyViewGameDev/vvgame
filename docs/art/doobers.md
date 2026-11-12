# Doobers: the painted pickups (2026-11-05 to 2026-11-07)

Every pickup on the board (`category: doober` in `game-server/tuning/resources.json`, 135 rows)
now has painted art in the game's own style, replacing the Twemoji glyphs. The owner approved
the whole set sheet by sheet, nine items at a time, on grass and dirt with names underneath.

## The rules (owner's decisions)

- **Style: Lined.** Outlined, painted, daylight; the same rendering as the world art but drawn
  as an icon, not a prop. The approved control is `tools/art/_candidates/doobers-r1/approved/openai--lined-sample-1`
  (carrot, wheat, pumpkin, log, stone, blueberries, egg, milk jug, cheese); its `.small.jpg` is
  the FIRST ref of every later sheet, with "match it EXACTLY" in the prompt, so all sheets are one set.
- **Growing plots draw the same way** (emoji audit pass 3, 2026-11-07): a farmplot's `filename`
  (one sprout, the young vine, shrub, sapling) is a plant alone in this style, drawn at the doober
  scale, so the growing state is never bigger than the pickup. `plot-sprouts.svg` is a SINGLE
  sprout (the owner's call: the left one of the Sprouts C pair, `doobers-r14`), no variants.
  `plot-shrub.svg` (the young bush) is for crops that grow on a bush: the Coffee Plant, the
  Blueberry Plot and the Rosemary Plot; `plot-sapling.svg` only for the Oak Tree Plot.
- **`artScale` on a 1 x 1 resource row** draws its art that many tiles wide, centred, instead of
  the doober or full-tile default: the Gem is 0.65 and the XP star (OneKXP) 0.62, so the two read
  the same size (owner: the gem was far too big, the star a little big).
  Same field the NPC rows use for the Great Bear; `boardArt.js boardArtScale` reads it.
- **A plot never pops into its crop.** Planting grows the plot in from nothing
  (`VFX.js createPlantGrowEffect`); when its `growEnd` passes, `FarmState.js` crossfades the plot
  into the crop (`createRipenEffect`: the plant fades out while the crop fades in and swells from
  0.6 to full size, 900 ms) before the state swap, so the sprite never changes under the player's
  eyes. Both overlays sit in the box the sprite is drawn in (`Render/PixiRenderer/boardArt.js`
  `boardArtScale`: 0.9 for pickups and plots, 1 for trees). Conversions on load (plots that
  finished while the player was away) do not animate.
- **The Tent and the Boat are also the avatar.** A camping player wears `item-tent.svg` and a
  player afloat `item-boat.svg` (`PixiRendererPCs.js getStateArt`, the `resources:` texture
  name; the 🏕️ 🛶 emoji stay only as the text fallback while the texture loads). Both pictures
  were brightened on 2026-11-07 to the other pickups' value (boat x1.28, tent x1.10 in HSV V).
- **`noGrow` on a farmplot row** (the Grape Vine): the plot lands at full size when planted and
  stands back up at full size after a harvest, with no grow-in; it still crossfades into its crop
  when ripe. Trees (`source: tree`) never grew in either.
- **Oversized: 0.9 of a tile.** A pickup should read bigger than a prop of the same footprint.
  `DOOBER_TILE_SCALE` in `Render/PixiRenderer/PixiRenderer.js` draws a doober's art 0.9 tile
  wide, centred on its tile (the atlas gives it a 128 px slot, `DOOBER_CELL` in
  `scripts/build-atlas.js`, instead of the 256 px a size-1 resource gets).
- **Straight on first** (owner, 2026-11-06, after the first Magic Mushroom and Bacon came out
  at an angle): every item is seen flat from the front, "as if it stood on a shelf at eye level",
  no three-quarter turn, no top-down tilt; the smallest tip only where a pure front view would
  hide what the thing is (the soups' surface, a heap of beans). The camera paragraph sits in every
  sheet prompt from `doobers-r4b` on, together with a keep-clear-of-the-grid-line clause (`r8`+).
- **Pieces match their sources**: Stone and Clay are little pieces in the Rocks' grey and the
  Clay Pit's red (Stone's grey was nudged at cut time toward the Rocks' tone); Wood is a pile of
  three logs; bottles carry a plain label.
- **No animals in the art, nothing cutesy, no glow** unless the thing glows (potions, the orb).
- The owner approves EVERY item; nothing ships from a sheet they have not seen on grass and dirt.

## Pipeline

1. Style `tools/art/styles/doobers/style.json` (variants `painted` / `lined` / `glossy`; `lined`
   won). Jobs `tools/art/jobs/doobers-r1.json` .. `doobers-r10.json`, one 3 x 3 sheet per subject
   on `guides/icon-grid-3x3.png`, generated with
   `node tools/art/generate.js --job doobers-rN --style doobers --models openai`.
2. Split with `node tools/art/icons.js --job doobers-rN --candidate lined-<subject>-1 --names a,b,c,... --cols 3 --rows 3 --prefix d- --out <dir>`
   (keys the magenta, trims each cell, pads square, 256 px).
3. Present on grass and dirt with names (a small PIL script over `public/assets/tiles/g-15.png`
   and `d-15.png`, 58 px icons on 64 px tiles) and wait for the owner's verdict.
4. Finish and assemble (a PIL pass): island prune (components under 0.6 % of the main piece go;
   0.5 for the three whose neighbours crossed the grid line: Amulet, Screwdriver, Shovel), a
   magenta-fringe patch on edge pixels only (hue 0.72 to 0.95: NOT inside the art, which would
   darken the Grapes and the Orb), the Stone / Clay tone nudge, re-centre, 256 px, then
   `game-client/public/assets/resources/doober-<slug>.png` + `.svg` (the usual base64 wrapper).
5. `filename: doober-<slug>.svg` on the row; `npm run build:atlas`.

## Which sheet each item came from

| Job / subject | Items (the ones that shipped) |
|---|---|
| r1 sample (the control) | Carrot, Wheat, Pumpkin, Blueberry, Egg, Milk, Cheese (its Log and Stone were redone in r3) |
| r2 crops | Corn, Lettuce, Strawberry, Apple, Mushroom, Tulip, Rosemary, Sunflower, Grapes |
| r2 crafted | Silk, Bread, Flour, Lumber (Clay, Wool, Honey, Coffee Beans, Wine redone later) |
| r2 hard | Sugar, Cornmeal, Goat Cheese, Pottery (the rest redone later) |
| r3 fixes | Wood (three logs), Wine (plain label), Stone, Clay, Wool, Potato, Onion, Garlic, Pepper |
| r3 crops2 | Sugarcane, Ginger, Olive, Lemon, Orange, Peach, Pear, Tomato, Cherry |
| r4b wild (straight on) | Feverfew, Daisy, Magic Mushroom, Mulberry Leaf, Coffee Cherry, Beans, Oyster, Meat, Fish |
| r4b animal | Goat Milk, Bacon, Chicken Feed, Green Coffee Bean, Butter, Cream, Cornbread, Thread; Pepper Cheese is the r4 wedge (the owner preferred it) |
| r5 oven1 | Pumpkin Pie, Lemon Cookie, Ginger Cookie, Olive Bread, Garlic Bread, Apple Pie, Strawberry Pie, Peach Pie, Cherry Pie |
| r5 oven2 | Queen's Cake, Warden Pie, Honey, Corn Chowder, Carrot Soup, Pumpkin Soup, Omelette, Potato Bake, Mixed Salad |
| r6 kitchen2 | Sandwich, Pizza, Tomato Soup, Poached Pear, Lemonade, Coconut Milk, Belmont Tea, Apple Cider, Olive Oil |
| r6 wineloom | Port, Brandy, Aged Wine, Cloth, Sweater, Runic Tunic, Jacket, Heavy Jacket, Silk Dress |
| r7 studio | Furniture, Ink, Urns, Shovel, Screwdriver, Light / Medium / Dark Roast Coffee Bean (Saw redone in r8) |
| r7 coffee | Common Coffee, Coffee Elsinore, Coffee Latte, Queen's Coffee, Amulet, Fan, Potion A, Potion B (Trumpet redone in r8) |
| r8 story1 | Saw (vertical, green handle), Trumpet (compact), Potion C, Book, Pelt, Bear Skin, Bones, Silver, Gold |
| r8 story2 | Scorpion, Diamond Ring, King's Crown, Portrait, Trident, Phoenix Feather, Brief Candle, Brass Bell, Prospero's Orb |
| r9 last | Vampire's Blood (the drop), Scroll (the open parchment), Ancient Coin, Money (the coin stack; the header uses it too) |
| r10 | Coconut (missed by the sheets because its row carried the tree's filename) |
| r15 | Bear Skin redrawn 2026-11-12: no head (body, arms and legs only), and its fur matched to the Bear enemy's (the cut's fur hue shifted 7 degrees toward orange and darkened to the Bear's value) |

Two items were recoloured after approval rather than redrawn (owner, 2026-11-07): the Runic
Tunic's blue brightened (HSV value x1.5, saturation x1.3), and the Thread spool's cream thread
recoloured to that same blue. `Trash` (🤮, used nowhere, held by no player) was removed from
resources.json instead of drawn.

## The fruit trees are NOT doobers on the board

Olive, Apple, Lemon, Orange, Peach, Pear, Cherry, Coconut and Mulberry Leaf are doober rows,
but on the board they ARE the tree's ready state: their `filename` is `tree-<fruit>.svg` with the
tree's `artSpan`, and collecting them turns the cell back into the bare tree. That stays (owner,
2026-11-07: "they should not turn into the doober when ready"). Their painted fruit lives in
`iconFile` instead, which the panels prefer over `filename` (`UI/Icons/ResourceIcon.js`,
`ResourceModalSmall.js`, `QuestButton.js`); the atlas keeps their full 256 px slot (a doober row
with `artSpan` above 1 is not given the small slot) and does not pack `iconFile`.

## Story items and currencies (pass 1 of the emoji audit, 2026-11-07)

The `special` rows got the same treatment from `tools/art/jobs/doobers-r11.json`, shipped as
`item-<slug>.png/.svg` (they are not pickups, so not `doober-`): see docs/art/emoji-audit.md
"Status". The keys are the one family drawn on the diagonal (owner); everything else is straight on.

## In the DOM

`game-client/src/UI/Icons/ResourceIcon.js` is the one way to show a resource's picture in a
panel, modal or button: `<ResourceIcon type="Wheat" />` (or `resource={row}`, `symbol="💰"`),
1.25 em inline, baseline-aligned, art when the row has `iconFile` / `filename`, the emoji glyph
otherwise; `resourceIconHtml(type)` is the same for the few `dangerouslySetInnerHTML` lists.
`UI/Buttons/ResourceButton.js` resolves its card picture through it (explicit `filename`, else
the `resource` row, else `resourceType`, else `symbol`). The header's Money button shows the
Money doober; the Gem keeps its glyph (owner: "keep using the game icons" for gem, heart, money
until they are redrawn; Money is now redrawn).

## What is left

- Plain-string contexts still carry the emoji `symbol`: status toasts and float-ups, chat and
  conversation lines and `title` attributes (mail bodies and the "Grown on {res:Wheat Plot}" sentences now render tokens, UI/Icons/RichText.js) in
  `Utils/resourceSource.js`. They need a rich toast / rich line before they can carry an <img>.
- Non-doober rows without art (a few NPC symbols, 🐦‍🔥 and 🪉 that Twemoji lacks) still fall back
  to the glyph on the board and in panels.
- The island prune and fringe patch live in the assembly pass, not yet in `tools/art/icons.js`.
