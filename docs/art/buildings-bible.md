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
  plus `camp` (Adventure Camp), `ruin` (Ancient Temple) and `vehicle` (the Train).
  Banned everywhere: clay or Spanish tile roofs; bracket signs that stick out of the
  footprint.
- **Colour is a function cue.** Each building owns an ACCENT colour carried by its roof
  and its sign, chosen so that from a distance the colour means the building: gold means
  bank, red means inn (health). No two buildings a player must tell apart share an accent.
  The round-2 composite failed this: every building had the same dark blue roof.
- **Town look and valley look.** Only `valley` buildings wear moss and vines, as if grown
  into nature: Inn, Post House, Adventure Camp, Ancient Temple, Shrine. `town` buildings
  (Hospital, Library, Bank, Courthouse, Carnival, the shops and training halls) are
  explicitly clean: no moss, no creeper. `homestead` (the Farm House and the crafting
  stations) is the owner's call, proposed clean with weathered materials.
- **Signage** is a placard flat on the front or a post sign in a front yard, inside the
  footprint, imagery only, never letters; the image names the function (bed, money bag,
  scales). `artSign: none` for buildings whose form is the sign (Carnival, Ancient Temple).
- **Lighting.** The round-2 composite was too dark. Buildings are lit in full daylight from
  the upper left so details pop: bright roof planes, clearly lit front faces, soft shadows
  only in the recesses, the amber window glow as an accent, not the only light.
- **Crafting stations** show the product being made, big, in the open front; their accent
  is the product's colour.

## 2. The proposals, building by building

Town (clean), closed buildings:

| Building | Family | Accent (roof and sign) | Sign | Note |
|---|---|---|---|---|
| Bank | castle | gold | money bag | the owner's example: a strongroom tower |
| Courthouse | tudor | royal purple | scales of justice | 5 x 5 in data |
| Hospital | tudor | white and pale blue | mortar and pestle with a cross | red is the Inn's, so the Hospital is white; QUESTION 1 |
| Library | tudor | navy blue | open book | |
| School | tudor | sunflower yellow | school bell | |
| Academy | tudor | plum | needle and thread over a palette | textiles, artistry, tailoring |
| Laboratory | tudor | copper orange | flask crossed with a whisk | the cooking school |
| Agriculture Center | tudor | leaf green | wheat sheaf | |
| Factory | castle | brick red | gear | brick and chimneys: an industrial castle; QUESTION 2 |
| General Store | cottage | ochre brown | crossed axe and pickaxe | |
| Magic Shop | fantastical | deep violet | crescent moon and star | |
| Guild | fantastical | teal | crest with crossed tools | QUESTION 3 (town or valley) |
| Warrior's Den | castle | iron grey, red banner | crossed swords | |
| Armory | castle | steel silver | shield and helmet | |
| Castle | castle | royal blue and gold | crown | |
| Restaurant | cottage | warm orange | bowl and spoon | |
| Restroom | cottage | slate blue | none | 2 x 2; QUESTION 4 |
| Shiro | castle | black and white | none | a Japanese keep; QUESTION 5 |
| Carnival | fantastical | red and white stripes | none, the tents are the sign | 4 x 4 |
| Train | vehicle | black and brass | none | not a building |

Valley (moss and vines):

| Building | Family | Accent | Sign | Note |
|---|---|---|---|---|
| Inn | tudor | red | bed | the owner's example: red means health |
| Post House | cottage | sky blue | sealed letter | |
| Adventure Camp | camp | canvas tan and forest green | tent over a campfire | |
| Ancient Temple | ruin | weathered stone and moss | none, the ruin is the sign | |
| Shrine | fantastical | jade and white | trident | QUESTION 6 (valley?) |

Homestead:

| Building | Family | Accent | Sign | Note |
|---|---|---|---|---|
| Farm House | cottage | straw and warm wood | none | approved panel `painterly-farmhouse-1`; it HAS ivy; QUESTION 7 |
| Dairy | workshop | cream white | milk churn | the approved station template `dairy-b-1` |
| Oven | workshop | warm orange | loaf of bread | |
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

## 3. Questions for the owner

1. Hospital: white and pale blue with a cross in the sign, since red is the Inn's? Or give
   the Hospital red and move the Inn to another warm colour?
2. Factory as a brick "industrial castle" with chimneys, or tudor like the other training halls?
3. Guild: town (proposed) or valley?
4. Restroom and Shiro: keep as buildings at all? Both are dev-only shops with nothing to sell.
5. Shiro: a Japanese keep in the castle family, black and white; or drop it from the set.
6. Shrine: valley (proposed, it holds the Trident) or town?
7. Farm House: the approved panel has ivy; keep it as the one homestead building that wears
   greenery, or regenerate it clean to match the homestead rule?
8. Any accent that clashes with your colour sense for the character (the Courthouse purple,
   the School yellow, the Academy plum are the least certain).

## 4. What a generation gets from this

The generator reads the four columns and writes them into the prompt: "FAMILY: tudor
(timber framing and stucco, slate roof with a brick chimney). LOOK: town: clean walls, no
moss, no vines. ACCENT: the roof and the sign are navy blue. SIGN: a placard over the door
showing an open book, no letters." plus the lighting sentence from the style. One building
per job subject, two candidates each, judged first at 45 px for the quick read.
