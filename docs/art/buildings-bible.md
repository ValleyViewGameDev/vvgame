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
| Courthouse | tudor | several colours, a clock tower | none (the clock tower) | 5 x 5 in data |
| Hospital | tudor | red (health, shared with the Inn) | mortar and pestle with a cross | APPROVED 2026-10-21 (r2 hospital-1); town look: clean |
| Library | tudor | navy blue | open book | |
| School | tudor | sunflower yellow | school bell | |
| Academy | tudor | pink (creativity) | needle and thread over a palette | textiles, artistry, tailoring |
| Laboratory | tudor | warm orange (cooking) | flask crossed with a whisk | the cooking school |
| Agriculture Center | tudor | leaf green | wheat sheaf | |
| Factory | industrial | brick red | gear | APPROVED 2026-10-21 (r2 factory-1); brick and chimneys, distinct from the castles |
| General Store | cottage | ochre brown | crossed axe and pickaxe | |
| Magic Shop | fantastical | purple | crescent moon and star | |
| Guild | tudor | teal | crest with crossed tools | a very unusual roof shape sets it apart |
| Warrior's Den | castle | iron grey, red banner | crossed swords | APPROVED 2026-10-21 (r2 warriors-den-1) |
| Armory | castle | steel silver | shield and helmet | |
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
| Adventure Camp | camp | canvas tan and forest green | tent over a campfire | |
| Ancient Temple | ruin | weathered stone and moss | none, the ruin is the sign | APPROVED 2026-10-21 (r2 ancient-temple-1) |
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

1. **Footprints are decided case by case as each building's art is made** (owner,
   2026-10-21). Most 2 x 2 buildings will go 3 x 3, and some 3 x 3 buildings will need
   4 x 4 to carry the detail the new art has. Nothing changes in the game data yet: a
   building's row keeps its current `size` until the owner approves its art and picks the
   footprint, and the owner reworks the town layouts by hand when the sizes change. Each
   building's generation entry notes the footprint it was drawn at.
2. Restroom: keep it in the set at all? It is a dev-only shop with nothing to sell.

## 4. Commissions

| Round | Date | Buildings | Job | Result |
|---|---|---|---|---|
| 1 | 2026-10-21 | Bank, Warrior's Den, Factory, Inn, Hospital, Ancient Temple (all 3 x 3) | `tools/art/jobs/buildings-bible-r1.json`, painterly, two candidates each, camera reference = the approved farmhouse panel | reviewed: every building read its function at a glance; the owner liked the picked candidate of every pair (bank-1, warriors-den-1, factory-2, inn-1, hospital-2, ancient-temple-2) but all six were TOO DARK: "more daylight on the facing, a more vibrant feel" |
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
   square's tiles (ECONOMY sheet column). The renderer draws a resource whose `artSpan`
   exceeds its `size` as an `artSpan` square anchored at the footprint's bottom-centre, the
   same way it draws the tall wall pieces; without `artSpan` the art is squeezed into the
   footprint square.
4. `npm run build:atlas` in `game-client/`.

## 6. What a generation gets from this

The generator reads the four columns and writes them into the prompt: "FAMILY: tudor
(timber framing and stucco, slate roof with a brick chimney). LOOK: town: clean walls, no
moss, no vines. ACCENT: the roof and the sign are navy blue. SIGN: a placard over the door
showing an open book, no letters." plus the lighting sentence from the style and the
standing negative: no smoke, steam or vapour from any chimney or opening. One building
per job subject, two candidates each, judged first at 45 px for the quick read.
