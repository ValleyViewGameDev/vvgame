# The buildings bible (art direction, 2026-10-21)

Status: the owner's direction, recorded; the per-building table is a PROPOSAL for review.
Companion to `../art-pipeline-plan.md` (§4b lanes) and `slice-b/whimsical.md` (the style).
The data lives on the resource rows (ECONOMY sheet columns `artFamily`, `artLook`,
`artAccent`, `artSign`); this page explains the rules and lists the current values.

## 0. The art director's brief (memorise this)

The job is not only art that is high quality and on-style, with the bible's lighting and
palette. The job is also that each asset **communicates its function** to the player and
is **identified at a quick read** of the scene. That rule is general, not universal: Deco
has no gameplay function, so Deco's goals are to look good, make players want to decorate,
and stay on-style. Buildings, crafting stations and the other stations DO carry function,
and communicate it four ways at once: architecture, roof material, colour scheme, and
signage and props. Whimsical is the style laid over all of it.

## 1. The rules

- **Architecture families.** Every building belongs to one family and never mixes two:
  `tudor` (timber framing and stucco; thatch with no chimney, or slate with a brick
  chimney), `castle` (stone, towers and turrets), `cottage` (rustic wood, straw thatch or
  wooden roof), `fantastical` (a crooked tower, stained glass, a great carved door; for
  the Guild and the magical), `workshop` (the 2 x 2 crafting stations: the open-air
  cut-away template, back wall, partial sides, open front, the product in the middle),
  plus `industrial` (the Factory: brick and chimneys, distinct from the castles),
  `japanese` (Shiro and Shrine: a keep and a shrine in Japanese architecture), `tent`
  (the Carnival: a big tent-like structure, as in the game today), `camp` (Adventure Camp),
  `ruin` (Ancient Temple) and `vehicle` (the Train). Tudor, castle and cottage are the three
  primary styles, not the only ones (owner).
  Banned everywhere: clay or Spanish tile roofs; bracket signs that stick out of the
  footprint.
- **Colour is a function cue.** Each building owns an ACCENT colour carried by its roof
  and its sign, chosen so that from a distance the colour means the building: gold means
  bank, red means inn (health). No two buildings a player must tell apart share an accent.
  The round-2 composite failed this: every building had the same dark blue roof.
- **Town look and valley look.** Only `valley` buildings wear moss and vines, as if grown
  into nature: Inn, Post House, Adventure Camp, Ancient Temple, Shrine. `town` buildings
  (Hospital, Library, Bank, Courthouse, Carnival, the shops and training halls) are
  explicitly clean: no moss, no creeper. `homestead` is a third look for things that exist
  only on the homestead (Farm House, Trading Post, Warehouse, the crafting stations):
  "home-y", farm-like, country; some greenery is fine (the approved Farm House keeps its
  ivy). To be defined further when those are drawn.
- **Signage** is a placard flat on the front or a post sign in a front yard, inside the
  footprint, imagery only, never letters; the image names the function (bed, money bag,
  scales). `artSign: none` for buildings whose form is the sign (Carnival, Ancient Temple).
- **Lighting: THE LIGHTING MODEL (approved 2026-10-21).** Full, bright, warm daylight from
  high up and a little to the left. The whole front face clearly and evenly lit: plaster
  pale and sunny, stone and brick light and clean, no deep shadow anywhere on the facing
  wall; shadows soft and only under the eaves, inside the doorway and in the recesses; roof
  planes bright with the sun on them; the window glow a small warm accent, never a light
  source. Vibrant, sunny, cheerful. Two batches were rejected for being too dark (the
  round-2 composite of 2026-10-20, and the first bible round of 2026-10-21: "more daylight
  on the facing, a more vibrant feel"); this wording is what fixed it, and it is in the
  whimsical style preamble so every prompt carries it.
- **Crafting stations** show the product being made, big, in the open front; their accent
  is the product's colour.
- **A relight round keeps the design by sending the building's own panel back as the
  reference** with "the same building, changed in one way only: the lighting" (round 2,
  2026-10-21). Pin the sign's picture in that prompt too, or the model may blank it.
- **No pre-rendered smoke, steam or vapour** (owner, 2026-10-21): nothing comes out of a
  chimney, a vent, a pot, a forge or any other opening in the still art. The buildings will
  later be tagged with the coordinates of their chimneys and openings and the game draws
  animated smoke and steam VFX there at run time; baked-in smoke would sit under or beside
  it and never move. Chimneys and vents themselves are welcome, cold.

## 2. The proposals, building by building

Town (clean), closed buildings:

| Building | Family | Accent (roof and sign) | Sign | Note |
|---|---|---|---|---|
| Bank | castle | gold | money bag | APPROVED 2026-10-21 (r2 bank-1); the owner's example: a strongroom tower |
| Courthouse | tudor, CIVIC scheme | white roof; deep burgundy door and shutters, a gold rim on the clock face | none (the clock tower) | 5 x 5, the biggest building (owner 2026-10-23): THREE storeys plus the roof, a tall central clock tower, a numeral-free dial; the door stays human-sized (about one tile, like every other building's door: people keep their scale across the town); two stone statues of medieval dignitaries in the yard, one each side of the steps; stately and symmetric; follows the civic scheme set by the Library and School |
| Hospital | tudor | red (health, shared with the Inn) | a red cross on a white placard (owner, 2026-10-22; the mortar and pestle read as a soup bowl) | APPROVED 2026-10-21 (r2 hospital-1), the cut redrawn 2026-10-22 with the red-cross sign (`hospital-b-1`); town look: clean |
| Library | tudor, CIVIC scheme | white roof; navy blue on door, shutters and sign | open book | civic group with Courthouse and School (owner 2026-10-23): white slate roofs, cream plaster, walnut timber; the accent only on door, shutters, sign |
| School | tudor, CIVIC scheme | white roof; sunflower yellow on door, shutters and sign | school bell | civic group; bell cupola, its roof white too |
| Academy | tudor | pink (creativity) | none: the PROPS out front are the sign | APPROVED 2026-10-22 (r3 academy-1); owner (2026-10-22): keep the old drawing's concept, an easel and a dressmaker's dummy in the front yard; the painting on the easel is a figure holding a skull and staring into its eyes, the skull facing him (Hamlet); textiles, artistry, tailoring; size 4 |
| Laboratory | cottage, thatched | warm orange (cooking) on door, shutters, window boxes and the sign's frame | a BIG pie on a round placard (owner 2026-10-23; the flask-and-whisk is dropped) | APPROVED 2026-10-23 (r7 laboratory-2); the CULINARY SCHOOL: it is called the Laboratory in data but teaches cooking; cooking props out front (bread oven, copper pots, bread, vegetables, onions); nothing scientific, no flasks |
| Agriculture Center | cottage, barn-like | leaf green | none: hay bales out front (the approved hay bale deco) and a rooster weather vane on the ridge | APPROVED 2026-10-22 (r4 agriculture-center-1): the barn with the open double doors and the loft door |
| Factory | industrial | brick red | gear | APPROVED 2026-10-21 (r2 factory-1); brick and chimneys, distinct from the castles |
| General Store | cottage | ochre brown | crossed axe and pickaxe, large and bold | APPROVED 2026-10-22 (r4 general-store-b-2): no turret, one centred dormer |
| Magic Shop | fantastical | purple | none: the round stained-glass moon window over the door is the sign | APPROVED 2026-10-22 (r4 magic-shop-b-2): three tiles wide, about four tall (size 3, tall artSpan), no door placard |
| Guild | tudor | teal | crest with crossed tools | a very unusual roof shape sets it apart |
| Warrior's Den | castle | iron grey, red banner | crossed swords ON the wide red banner, no placard | APPROVED 2026-10-23 (r5 warriors-den-b-2): taller, the banner carries the icon; replaces r2 warriors-den-1 |
| Armory | castle | steel grey, grey banner | a shield ON the wide grey banner, no placard | APPROVED 2026-10-23 (r5 armory-b-2): the Den's sibling mirrored (tower left), grey shield banner, two standing suits of armour by the door, lighter grey roof |
| Castle | castle | royal blue and gold | crown | |
| Restaurant | cottage | cherry and cream stripes | bowl and spoon | |
| Restroom | cottage | slate blue | none | 2 x 2 |

| Carnival | tent | harlequin, many colours | none, it is a big tent | 4 x 4; keep today's tent idea, in the whimsical style |
| Train | vehicle | black and brass | none | not a building |

Valley (moss and vines):

| Building | Family | Accent | Sign | Note |
|---|---|---|---|---|
| Inn | tudor | red | bed | design approved (r1 inn-1 relit); the bed sign must show; a final Inn ordered 2026-10-21 (`inn-c`); the owner's example: red means health |
| Post House | cottage | sky blue | sealed letter | |
| Adventure Camp | camp | canvas tan and forest green | tent over a campfire, a pictogram on a wooden signpost | NOT a building (owner 2026-10-23): ONE rustic tent set up in the field, a cold campfire with log seats and a cook pot, a stand of leather backpacks (what it sells, with adventuring skills); NO WEAPONS props (owner); valley look |
| Ancient Temple | ruin | weathered stone and moss | none, the ruin is the sign | APPROVED 2026-10-21 (r2 ancient-temple-1); its first cut-out drifted into a cottage, the cut redrawn 2026-10-22 with the ruin spelled out (`ancient-temple-b-1`) |
| Shrine | japanese | classic dark orange (vermilion) | none | Japanese architecture |
| Shiro | japanese | black and white | none | a Japanese keep, valley look, unique architecture |

Homestead:

| Building | Family | Accent | Sign | Note |
|---|---|---|---|---|
| Farm House | cottage | straw and warm wood, some greenery | none | approved panel `painterly-farmhouse-1` |
| Trading Post | cottage | warm wood | none | 1 x 1 |
| Warehouse | cottage | warm wood | none | 1 x 1 |
| Dairy | workshop | cream white | milk churn | the approved station template `dairy-b-1` |
| Oven | workshop | toasted brown | loaf of bread | |
| Kitchen | workshop | tomato red | steaming pot | |
| Mill | workshop | wheat tan | flour sack | machine left, sacks right (owner) |
| Loom | workshop | indigo blue | spool of thread | |
| Lumber Yard | workshop | timber brown | stacked logs | |
| Studio | workshop | terracotta | clay pot | |
| Beverage Station | workshop | tea green | steaming cup | |
| Winery | workshop | burgundy | wine barrel | |
| Coffee Factory | workshop | dark roast brown | coffee bean | |
| Silkery | workshop | silver white | silk cocoon | no drawing yet |

Not tagged: the 1 x 1 slots and props (Beehive, Chicken Coop, Mailbox, Warehouse, Trade
Stall, Trading Post, the worker slots), the Dungeon Entrance and the editor-only landmarks.

## 3. Decisions taken (owner, 2026-10-21) and what is still open

Taken: Hospital and Inn share red (health), the Hospital town-look; Factory is `industrial`
brick; Guild is tudor and town with an unusual roof; the Courthouse has a clock tower, no
sign and several colours; `homestead` is a third look (Farm House with greenery, Trading
Post, Warehouse); Shiro and Shrine are `japanese` and valley, black and white and dark
orange; Laboratory warm orange, Academy pink, Magic Shop purple; the Carnival is a
harlequin big tent in the whimsical style.

Open:

1. **Footprints: the owner set most buildings to size 4 on 2026-10-22** (Magic Shop 3,
   Farm House 3, Castle and Carnival 5, Warehouse and Trading Post 2). The layouts followed:
   `tools/expand-town.py` grew the two valleyTown mini templates and every valley town that
   is one of them stamped (nineteen) by inserting duplicate rows and columns at fixed cut
   lines through each tier and block, each absorbed by deleting the nearest plain row or
   column beyond the compound so roads leaving the grid keep their place; seven hand-built
   towns were re-slotted one at a time; the rotated towns were re-derived from townN; the
   starting homestead and the tutorial cave got one-tile moves. `--check` lists every
   building whose footprint runs into a wall, another building or a prop. Originally
   decided case by case (owner, 2026-10-21). Most 2 x 2 buildings will go 3 x 3, and some 3 x 3 buildings will need
   4 x 4 to carry the detail the new art has. Nothing changes in the game data yet: a
   building's row keeps its current `size` until the owner approves its art and picks the
   footprint, and the owner reworks the town layouts by hand when the sizes change. Each
   building's generation entry notes the footprint it was drawn at.
2. Restroom: keep it in the set at all? It is a dev-only shop with nothing to sell.

## 4. Commissions

| Round | Date | Buildings | Job | Result |
|---|---|---|---|---|
| 1 | 2026-10-21 | Bank, Warrior's Den, Factory, Inn, Hospital, Ancient Temple (all 3 x 3) | `tools/art/jobs/buildings-bible-r1.json`, painterly, two candidates each, camera reference = the approved farmhouse panel | reviewed: every building read its function at a glance; the owner liked the picked candidate of every pair (bank-1, warriors-den-1, factory-2, inn-1, hospital-2, ancient-temple-2) but all six were TOO DARK: "more daylight on the facing, a more vibrant feel" |
| 7 | 2026-10-23 | Courthouse (5 x 5), Adventure Camp, Laboratory | `tools/art/jobs/buildings-bible-r7.json`, `guides/building5.png` added for the 5 x 5: the Courthouse in the civic scheme (white roof, cream plaster, walnut timber) with a tall central clock tower, burgundy door and shutters, a gold-rimmed numeral-free clock, no placard; the Adventure Camp as a camp, not a building (owner: "rustic and tent-like, set up in the field"): a big tan canvas tent with forest-green trim, a smaller tent, a cold campfire with log seats, a weapons rack, a tent-over-campfire pictogram on a signpost, valley look; the Laboratory as the CULINARY SCHOOL (owner: "don't be fooled by the name"): a warm orange cottage with a golden thatched roof, cooking props (bread oven, copper pots, bread basket, vegetable crate, onions), a big pie as the sign | Laboratory APPROVED (laboratory-2, the owner's pick: the pie framed by the thatch). Courthouse: the owner likes courthouse-1 and its scale but wants THREE storeys plus the roof, a door sized like other buildings' doors against the grid (about one tile), and one stone statue each side of the steps, medieval dignitaries, so it reads as government (revision `courthouse-b`, courthouse-1 + the Library as refs). Adventure Camp: both too complicated; ONE tent only, and NO weapons: the camp sells backpacks and adventuring skills, so the gear is medieval camping gear (backpack stand, bedroll, cook pot on a tripod, rope, waterskins, supplies chest) (revision `adventure-camp-b`) |
| 6 | 2026-10-23 | Library, School | `tools/art/jobs/buildings-bible-r6.json`: first pass in their own accents (navy, sunflower yellow); the owner liked the design and geometry but wanted a scheme UNIQUE to civic buildings (Courthouse, Library, School), "maybe white roofs"; revision subjects `library-b` / `school-b`: chalk-white slate roof, cream plaster, walnut timber, limestone footings, the building's accent only on door, shutters and sign | APPROVED 2026-10-23: library-b-2 and school-b-2 (the owner's picks) |
| 5 | 2026-10-23 | Warrior's Den redo, Armory | `tools/art/jobs/buildings-bible-r5.json`: the Den taller (less stubby), its red banner wider and carrying the crossed swords, no placard; the Armory as the Den's sibling with a grey banner and a shield (owner: the banner with the icon is the strong visual signal) | APPROVED: warriors-den-b-2 and, after a revision round (standing armour displays, mirrored so the tower stands left, a lighter grey roof), armory-b-2 |
| 4 | 2026-10-22 | Agriculture Center, General Store, Magic Shop | `tools/art/jobs/buildings-bible-r4.json`; the hay bale deco attached as the prop reference for the barn; revision subjects `magic-shop-b` (3 wide, no placard, right side finished) and `general-store-b` (no turret, dormer centred, sign enlarged) | all three APPROVED: agriculture-center-1, magic-shop-b-2, general-store-b-2 |
| 3 | 2026-10-22 | Academy (4 x 4) | `tools/art/jobs/buildings-bible-r3.json`: the old drawing attached as a CONCEPT reference (easel + dressmaker's dummy out front, nothing of its style), no sign, the easel's painting is Hamlet with the skull; the Hospital panel for camera and rendering; guides/building4.png | APPROVED: candidate 1 (the crooked corner turret, the pinned pink bodice on the dummy, the darker canvas) |
| 2 (APPROVED) | 2026-10-21 | the same six | `tools/art/jobs/buildings-bible-r2.json`: each round-1 pick sent back as its own reference, one change only, full daylight on the facing wall | the relight works: the design holds and the facing lifts. Two lessons: a relight from the building's own panel can still drift (the temple's second candidate became a thatched cottage) and can drop a sign's picture (both inn candidates lost the bed; `inn-b` re-ran with the sign pinned in the prompt). The owner approved all six picks: bank-1, warriors-den-1, factory-1, hospital-1, ancient-temple-1 of round 2 (`_candidates/buildings-bible-r2/approved/`), and ordered one more Inn with the bed sign (`inn-c`) |

## 5. From an approved panel to the game (2026-10-21)

1. **Cut-out pass**: the approved panel is redrawn identically on a pure magenta field
   (`jobs/buildings-bible-cut.json`, guide `guides/building3-cut.png`: magenta, the thin
   grid, the 3 x 3 box outlined). One candidate; re-roll a subject if it drifts from the
   approved design.
2. **`tools/art/cutout.js`** keys the magenta out, crops the art's square (`--span` tiles,
   4 for a 3 x 3 building: the footprint sits at the square's bottom-centre and the top
   row is headroom for the roof) and writes `game-client/public/assets/resources/<file>.png`
   and `<file>.svg` (the PNG wrapped in an SVG, so the panels' `<img>` and the atlas both
   get it). It reports if the art touches the top edge (raise `--span`).
3. The resource row: `filename` = that file, `size` = the footprint, **`artSpan`** = the
   square's tiles (ECONOMY sheet column; the cutter prints it). The footprint is the art's
   BASE width (the widest run among its bottom rows), not its silhouette: a turret or eaves
   wider than the walls must not shrink the building, the walls fill the footprint end to
   end (owner, 2026-10-22). The owner set the six buildings to size 4 (the Inn 3). A
   building with PROPS standing in front of its walls (the Academy's easel and dummy) is
   cut with `--fit silhouette` instead: the props' thin legs are the bottom rows and would
   fool the base measure (the Academy came out at artSpan 6.8 that way, 5.1 by silhouette). The renderer draws a resource whose `artSpan`
   exceeds its `size` as an `artSpan` square anchored at the footprint's bottom-centre, the
   same way it draws the tall wall pieces; without `artSpan` the art is squeezed into the
   footprint square.
4. `npm run build:atlas` in `game-client/`.

The keyer (`lib/key.js`) floods from the image border (`flood: true`, what cutout.js uses):
only the magenta that touches the border is background, so art colours near magenta, the
Magic Shop's purple roofs, the Academy's pink, stay opaque when enclosed by the art. Before
the flood, the hue key made the purples half-transparent and the un-mixing turned them TEAL
in the game (owner, 2026-10-22).

## 6. What a generation gets from this

The generator reads the four columns and writes them into the prompt: "FAMILY: tudor
(timber framing and stucco, slate roof with a brick chimney). LOOK: town: clean walls, no
moss, no vines. ACCENT: the roof and the sign are navy blue. SIGN: a placard over the door
showing an open book, no letters." plus the lighting sentence from the style and the
standing negative: no smoke, steam or vapour from any chimney or opening. One building
per job subject, two candidates each, judged first at 45 px for the quick read.
