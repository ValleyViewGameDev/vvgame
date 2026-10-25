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
- **Camera consistency: the barrel is the reference for props** (owner, 2026-10-24): props in a
  building or station (sacks, pots, crates) must sit in the same camera as the deco, mostly from
  the front and a little from above, the tops as narrow ellipses; the model drifts top-down on
  small round things. Attach the approved barrel and say "from the same camera as that barrel"
  whenever props matter (docs/art/deco.md).
- **Whimsy is a deliverable, not a default** (owner, 2026-10-24, the Mill): a revision round
  can drift straight and tidy; when it does, ask for it back by name: sagging, curved rooflines
  that dip in the middle, flared or bowed shapes (sails like petals), nothing ruler-straight.
- **No animals in building or vehicle art** (owner, 2026-10-23): a wagon has no oxen, a barn
  has no cow in the yard. Animals are a separate art style question (the NPC rig) and a
  painted animal in a still sprite would never move. A vehicle shows it moves by its wheels.
- **The sign is never repeated above itself** (owner, 2026-10-23): when a building has a
  placard or crest over the door, no window, rose window, carving or banner directly above
  it may carry the same picture. The model likes to echo the sign in a round window over the
  door (the Guild's Lantern Hall concept did it; an earlier building did too). Say so in the
  prompt whenever a round or stained-glass window sits over a signed door: "the window
  above the sign shows plain glass / a different motif, NOT the sign's picture".
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
| Courthouse | tudor, CIVIC scheme | white roof; deep burgundy door and shutters, a gold rim on the clock face | none (the clock tower) | APPROVED 2026-10-23 (r7 courthouse-b-2); 5 x 5, the biggest building (owner 2026-10-23): THREE storeys plus the roof, a tall central clock tower, a numeral-free dial; the door stays human-sized (about one tile, like every other building's door: people keep their scale across the town); two stone statues of medieval dignitaries in the yard, one each side of the steps; stately and symmetric; follows the civic scheme set by the Library and School |
| Hospital | tudor | red (health, shared with the Inn) | a red cross on a white placard (owner, 2026-10-22; the mortar and pestle read as a soup bowl) | APPROVED 2026-10-21 (r2 hospital-1), the cut redrawn 2026-10-22 with the red-cross sign (`hospital-b-1`); town look: clean |
| Library | tudor, CIVIC scheme | white roof; navy blue on door, shutters and sign | open book | civic group with Courthouse and School (owner 2026-10-23): white slate roofs, cream plaster, walnut timber; the accent only on door, shutters, sign |
| School | tudor, CIVIC scheme | white roof; sunflower yellow on door, shutters and sign | school bell | civic group; bell cupola, its roof white too |
| Academy | tudor | pink (creativity) | none: the PROPS out front are the sign | APPROVED 2026-10-22 (r3 academy-1); owner (2026-10-22): keep the old drawing's concept, an easel and a dressmaker's dummy in the front yard; the painting on the easel is a figure holding a skull and staring into its eyes, the skull facing him (Hamlet); textiles, artistry, tailoring; size 4 |
| Laboratory | cottage, thatched | warm orange (cooking) on door, shutters, window boxes and the sign's frame | a BIG pie on a round placard (owner 2026-10-23; the flask-and-whisk is dropped) | APPROVED 2026-10-23 (r7 laboratory-2); the CULINARY SCHOOL: it is called the Laboratory in data but teaches cooking; cooking props out front (bread oven, copper pots, bread, vegetables, onions); nothing scientific, no flasks |
| Agriculture Center | cottage, barn-like | leaf green | none: hay bales out front (the approved hay bale deco) and a rooster weather vane on the ridge | APPROVED 2026-10-22 (r4 agriculture-center-1): the barn with the open double doors and the loft door |
| Factory | industrial | brick red | gear | APPROVED 2026-10-21 (r2 factory-1); brick and chimneys, distinct from the castles |
| General Store | cottage | ochre brown | crossed axe and pickaxe, large and bold | APPROVED 2026-10-22 (r4 general-store-b-2): no turret, one centred dormer |
| Magic Shop | fantastical | purple | none: the round stained-glass moon window over the door is the sign | APPROVED 2026-10-22 (r4 magic-shop-b-2): three tiles wide, about four tall (size 3, tall artSpan), no door placard |
| Guild | fantastical | teal | crest with crossed tools | APPROVED 2026-10-23 (r9 guild-stack-1, concept A the Stacked Hall): three crooked storeys of open-fronted masters' workshops on a stone ground floor, a teal dome with a cog weathervane, trade pennants; the hall of the late-game master trades |
| Warrior's Den | castle | iron grey, red banner | crossed swords ON the wide red banner, no placard | APPROVED 2026-10-23 (r5 warriors-den-b-2): taller, the banner carries the icon; replaces r2 warriors-den-1 |
| Armory | castle | steel grey, grey banner | a shield ON the wide grey banner, no placard | APPROVED 2026-10-23 (r5 armory-b-2): the Den's sibling mirrored (tower left), grey shield banner, two standing suits of armour by the door, lighter grey roof |
| Castle | castle | royal blue and gold | crown | |
| Restaurant | cottage | cherry and cream stripes | bowl and spoon | |
| Restroom | cottage | slate blue | none | 2 x 2 |
| Warehouse (homestead) | cottage, the Farm House's materials | golden thatch, weathered staves, iron hoops | none | APPROVED 2026-10-25 (homestead-r1 warehouse-silo-1): a round wooden SILO like a giant barrel under a conical thatch, an arched door, sacks, a crate, a ladder; it drew the crate deco before; the store-barn concept was the runner-up |
| Trading Post (homestead) | cottage, the Farm House's materials | golden thatch over warm timber | none | the owner likes today's bare post-and-beam stall; restyled faithfully (homestead-r1 trading-post-b-2 liked), revision `trading-post-c`: the roof HALF as tall so the counter and the shelf under it show, and the counter and shelf EMPTY: the game will LAYER CRATES over this sprite later to show the Trading Post's state (owner 2026-10-25), so the base must stay bare; **APPROVED 2026-10-25: trading-post-c-2** (c-1 came out undersized) |

| Carnival → **the HARVEST FAIR** | fair (open fairground) | harvest colours: straw, pumpkin, apple red, leaf green, cream canvas, many-coloured bunting | none | REPLACED (owner 2026-10-23): the Carnival sat too close to the new Caravan (both visiting, striped, order-taking); the Carnival is the settlement's SHARED effort, so it becomes the settlement's own Harvest Fair that every homestead stocks together; size 5; player-facing rename to follow; APPROVED 2026-10-23: fair-marquee-1 (`tools/art/jobs/harvest-fair-r1.json`, concept B the fair pavilion: one red-and-cream marquee open on the laden table, a bandstand, a maypole, pumpkins, cider, bunting), cut at 5 x 5 with the silhouette fit (artSpan 5.09) into `carnival.png/.svg` (the file keeps its name); player-facing rename done: Harvest Fair / Erntefest / Feria de la Cosecha / Fête des Moissons, symbol 🌾 |
| Train → **the CARAVAN** | vehicle | teal and burgundy stripes, brass | none | REPLACED (owner 2026-10-23): a travelling merchant caravan, a covered wagon with a fold-down trading counter under a striped awning, size 2, ONE state (the game's waiting gap is about a minute, not worth a second sprite); NO ANIMALS (owner: no animal style here, and they would not move) so the WHEELS must be big and obvious; full daylight, cheerful; player-facing rename Train → Caravan in all ten string files, `Train` stays in code; round 1 pick A covered-1, revision `caravan-b`: APPROVED 2026-10-23 caravan-b-2 (no animals, four big wheels, shafts on the ground, full daylight), first cut at 2 x 2, then the owner set it to SIZE 3 (2026-10-23): recut from the same magenta panel at 3 tiles (artSpan 3.05) into `wagon.png/.svg` (the file keeps its name); the Train stands only in the four town layouts (never on a homestead), and a footprint grows up and right from its anchor, so two Crates were moved out of its new 3 x 3 in townE and townS and the 18 live town grids were reset; player-facing rename done: Caravan / Karawane / Caravana / Caravane, symbol 📦 (the train emoji is gone) |

Valley (moss and vines):

| Building | Family | Accent | Sign | Note |
|---|---|---|---|---|
| Inn | tudor | red | bed | design approved (r1 inn-1 relit); the bed sign must show; a final Inn ordered 2026-10-21 (`inn-c`); the owner's example: red means health |
| Post House | cottage | sky blue | sealed letter | |
| Adventure Camp | camp | canvas tan and forest green | tent over a campfire, a pictogram on a wooden signpost | APPROVED 2026-10-23 (r7 adventure-camp-b-1); NOT a building (owner 2026-10-23): ONE rustic tent set up in the field, a cold campfire with log seats and a cook pot, a stand of leather backpacks (what it sells, with adventuring skills); NO WEAPONS props (owner); valley look |
| Ancient Temple | ruin | weathered stone and moss | none, the ruin is the sign | APPROVED 2026-10-21 (r2 ancient-temple-1); its first cut-out drifted into a cottage, the cut redrawn 2026-10-22 with the ruin spelled out (`ancient-temple-b-1`) |
| Shrine | japanese | classic dark orange (vermilion) | none | APPROVED 2026-10-23 (r8 shrine-1): the old drawing's design kept element for element (two-tier vermilion roofs, guardian lions, blossom trees, lanterns), repainted; valley look |
| Shiro → **the ORACLE'S SANCTUARY** | sanctuary (open stone, Greek) | pale limestone, bronze, laurel green | none: the tripod, the cleft and the scroll urns | REPLACED (owner 2026-10-23): the Shiro was only ever a placeholder name from a spare emoji; it is the scroll shop, and the Oracle is now grounded as Apollo's oracle at Delphos (The Winter's Tale), so this is her sanctuary: monolithic standing stones over a glowing cleft, a bronze tripod, laurel, urns of sealed scrolls; the Ancient Temple's sister site (same stone, moss and glyphs) but open and in use, not a ruin; valley look; APPROVED 2026-10-23: sanctuary-cleft-2 (`tools/art/jobs/sanctuary-r1.json`, concept A: five carved standing stones around a glowing cleft, the tripod over it, the altar with sealed scrolls, two laurels); the tholos (B) was the runner-up, set aside as too close to the Temple's columns; first cut 2026-10-23; the owner then found the stone did not match the Temple: two relights followed (`sanctuary-c`: cooler hue, still too grey; `sanctuary-d`: the Temple's near-white sunlit limestone, right hue; `sanctuary-e`: the Temple's SHADOW strength, deep shading on the shadow sides, dark recesses, cast shadows) and **sanctuary-e-1 is the approved panel (2026-10-24)**, recut into `oracle-sanctuary.png/.svg`. Lesson: a sister site must match the sibling's stone in three things, hue, brightness AND shadow depth; send the sibling panel and name all three |

Homestead:

| Building | Family | Accent | Sign | Note |
|---|---|---|---|---|
| Farm House | cottage | straw and warm wood, some greenery | none | approved panel `painterly-farmhouse-1` (`_candidates/whimsical-buildings/approved/`); the owner noticed 2026-10-24 it was never cut into the game; cut 2026-10-24; the owner found it too dark in the game, so it was relit (`tools/art/jobs/farmhouse-lit.json`, the store as the daylight reference, nothing else changed; **farmhouse-lit-1 APPROVED 2026-10-25**) and recut (artSpan 3.77) |
| Trading Post | cottage | warm wood | none | 1 x 1 |
| Warehouse | cottage | warm wood | none | 1 x 1 |
| Dairy | workshop | cream white | milk churn | the approved station template `dairy-b-1` |
| Oven | workshop | toasted brown | loaf of bread | |
| Kitchen | workshop | tomato red | steaming pot | |
| Mill | workshop (the station framework, §2a) | wheat tan | none: the sails and the sacks are the sign | APPROVED 2026-10-24 (stations-r1 mill-e-1, relit as round 6 mill-lit-2); machine left, sacks right (owner) |
| Loom | workshop | indigo blue | spool of thread | |
| Lumber Yard | workshop | timber brown | stacked logs | |
| Studio | workshop | terracotta | clay pot | |
| Beverage Station | workshop | tea green | steaming cup | |
| Winery | workshop | burgundy | wine barrel | |
| Coffee Factory | workshop | dark roast brown | coffee bean | |
| Silkery | workshop | silver white | silk cocoon | no drawing yet |

Not tagged: the 1 x 1 slots and props (Beehive, Chicken Coop, Mailbox, Warehouse, Trade
Stall, Trading Post, the worker slots), the Dungeon Entrance and the editor-only landmarks.

## 2a. Crafting stations (2 x 2): the whimsical framework (owner, 2026-10-24)

The Mill set the template (`tools/art/jobs/stations-r1.json`: three framework options A thatch
and stone, B timber posts and shingles, C stone and canvas; the owner chose B, then two
revision rounds: `mill-d` a shallower roof and pale lattice sails, `mill-e` the whimsy back:
a sagging curved roofline, flared petal-like sails, the sacks from the barrel's camera;
**mill-e-1 APPROVED**). Every 2 x 2 station is built on it:

- an open-air cut-away STALL, never a closed house: four stout honey-timber posts, a plank
  back wall along the top edge, low plank half-walls at the sides, NO front wall, NO roof
  over the front, so the camera looks straight into the workshop;
- a shallow lean-to roof of painted wooden shingles over the BACK part only, in the station's
  ACCENT colour, its ridge and eaves SAGGING in a gentle curve that dips in the middle
  (nothing ruler-straight); a lantern on the right front post;
- a SILHOUETTE piece rising above the roofline: either the station's own machine when it is
  naturally tall (the Mill's sails on a corner tower, the Loom's frame, the Oven's dome) or,
  when the machine is small, an abstract painted wooden SIGN standing on the roof ridge (the
  Dairy's cut-out cow). Owner (2026-10-24): never stretch a prop to make a silhouette ("that
  butter churn makes no sense"); a churn is a churn, the sign does the silhouette work;
- the roof is optional, not essential (owner, 2026-10-24): the Oven has no lean-to, its big
  stone dome fills the stall and is the shape; the Winery is open air under a vine pergola;
  the Kitchen's hearth and chimney are its shape. Use the lean-to only where the concept
  wants it; the stall bones (posts, back wall, low sides, open front, earth floor, lantern)
  and the camera are what make the set read together;
- the floor packed earth with a few flagstones; THE WORK big in the open front: the machine
  at the left, the products at the right, every prop drawn from the barrel's camera (front
  on, a little from above, tops as narrow ellipses);
- people-sized against the 4-wide buildings: posts about as tall as the General Store's
  door (send the store as the scale reference); no people, no animals, no smoke or steam.
- **props at the buildings' absolute scale** (owner, 2026-10-24): a station is only 2 x 2,
  but a sack, jar or pot in it is the same absolute size as the crate and barrel by the
  General Store's door. So a station holds FEWER, BIGGER props, the machine filling most of
  its half; drop minor props rather than shrink them. The model drifts dollhouse-small on a
  2 x 2 (the first Studio, Coffee Factory and Beverage Station); send the store panel and
  say it.

The approved Mill panel is sent as the FIRST reference of every later station ("the
APPROVED Mill, the framework every station is built on; keep its stall, change the props,
the silhouette piece and the roof colour"), with the barrel second for the props' camera.

The plan (proposed to the owner 2026-10-24, awaiting tweaks; the Mill is done):

| Station | Concept | Props (the work in front) | Accent | Silhouette / must-have |
|---|---|---|---|---|
| Mill | grain to flour | millstone on a frame left; sacks of flour, a sugar sack, a grain heap with a scoop right | wheat tan | the windmill sails; APPROVED mill-e-1 |
| Dairy | milk to butter and cheese | a plain butter churn, a big cheese wheel with a wedge cut, a pat of butter, milk bottles in a crate, a tin milk churn, a hanging basket | cream white with a sky-blue band | REJECTED twice (dairy-2: the churn stretched into a silhouette; dairy-b: the cow sign "tacked on, not part of the concept", and "the big roof is not a good template" for it); round 3 tried two concepts without the roof; **APPROVED 2026-10-24: dairy-c-2, the cheese press yard** (low whitewashed stone walls, a tall timber cheese press at the back-left as the natural tall piece, a sky-blue rack of cheese wheels, a plain churn, bottles, pails); D the spring house (a water channel with churns cooling in it, a lattice shade) was the runner-up |
| Oven | baking | a BIG domed stone bread oven with a cold flue filling the left and centre, a peel, loaves and a lattice pie, a bread basket, a flour sack, a flour-dusted board | toasted orange-brown (the dome's warm stone; NO roof) | the dome itself, no lean-to (owner: let the dome be bigger and be the silhouette); APPROVED 2026-10-24 (stations-r2 oven-b-2) |
| Kitchen | cooking | a stone hearth with a cold chimney, a soup pot on a swinging crane over the glow, a rail of copper pans, onions and garlic, a butcher's block with vegetables, a bowl of tomato soup | tomato red woodwork and a checked cloth | the hearth and chimney, no roof; round 3 kitchen-2 liked, revision `kitchen-b`: MIRRORED (hearth at the RIGHT so it is not confused with the Oven's dome at the left) and the chimney in DARK GREY BRICK; **APPROVED 2026-10-24: kitchen-b-1** |
| Loom | thread and cloth | an upright loom with half-woven indigo cloth, a spinning wheel, bobbins, a basket of fleece, bolts of cloth | indigo blue | the loom frame above the wall; APPROVED 2026-10-24 (stations-r2 loom-2) |
| Lumber Yard | logs to lumber | a sawhorse with a half-sawn log and a two-man saw, a stack of planks, a log pile, an axe in a stump | raw pale timber with a green tarp | the stepped log stack rising above the wall, no roof; APPROVED 2026-10-24 (stations-r4 lumber-yard-2) |
| Studio | pottery, furniture, ink, urns | a potter's wheel with a half-thrown pot, a tall shelf of pots and urns, a bench with a chisel and a half-made chair, an ink well and quill | PINK lean-to (the Academy's creativity pink; owner: terracotta made it look like the other stations) over a pale MARBLE floor | the shelf unit rising above the roofline; studio-2 liked, revision `studio-b` (pink roof, marble floor, bigger props); **APPROVED 2026-10-24: studio-b-1** |
| Beverage Station | teas, lemonade, coffees | a tall crooked copper samovar with a teapot on top, a counter of mismatched cups on hooks, lemons, a jug of lemonade, a tea tin, a coffee pot, jars on a shelf | tea green woodwork against copper | the samovar's chimney and finial, no roof; the most whimsical of the set; APPROVED 2026-10-24 (round 6 beverage-station-lit-2) |
| Winery | cider, wine, port, brandy, olive oil | a big grape press with a tall screw over a vat, two barrels on a rack, a row of bottles, a basket of grapes, a tall olive-oil jar | burgundy woodwork | OPEN AIR and ASPIRATIONAL (owner): round 3's press-and-pergola was rejected ("the mechanism is too reminiscent of the other stations", too dark); revision `winery-b`: NO MACHINERY at all, a sunlit vineyard corner: a pergola heavy with daylight-lit vines, lots of well-lit purple grapes hanging and in baskets, barrels on a rack with taps, an upright barrel with bottles and glasses, a crate of bottles; the props are the concept. winery-b-2 liked; revision `winery-c` (owner): the pergola covers only the LEFT half, the right half has a tall lattice WINE RACK of bottles against the back wall, the upright barrel and the crate move forward; **APPROVED 2026-10-24: winery-c-2** |
| Coffee Factory | roasting beans | a drum roaster on a brick base with a crank and a tall dark-brick flue, sacks of green beans, a tray of beans in three roasts, a hand grinder, tin canisters | near-black roast brown with a cream band | the roaster and its flue, no roof; coffee-factory-2 liked, revision `coffee-factory-b` (bigger props); **APPROVED 2026-10-24: coffee-factory-b-2** |
| Silkery | silk | a frame of cocoons on mulberry branches, a reeling wheel with a skein, bolts of pale silk, a mulberry sprig in a pot | silver-white lean-to with pink post caps | the reeling wheel rising above the roof; the sheen on the silk (no silkworms: no animals); APPROVED 2026-10-24 (round 5 silkery-1) |

**Round 6, the relight-and-rescale pass (owner, 2026-10-24, from the in-game comparison of
deco, stations and a building side by side):** every cut station came out DARK (the Kitchen
worst), not inheriting the buildings' daylight, and their props are too small against the
buildings. `tools/art/jobs/stations-r6.json` redraws all ten approved panels with two changes:
the General Store's bright noon daylight, and props at the store's absolute prop size (fewer,
bigger; walls and posts unchanged). Owner: it need not be perfect: 1 x 1 deco may run a little
big and props on the big buildings a little small, but the stations must scale UP to fit the
same game. The relit candidates replace the cut sprites once picked. **Picks APPROVED 2026-10-24 (the owner took
the art director's picks):** loom-lit-2, oven-lit-2, dairy-lit-1, kitchen-lit-1, lumber-yard-lit-2,
studio-lit-1, coffee-factory-lit-2, beverage-station-lit-2, and the new silkery-1 (round 5). Their
magenta cuts replace the seven sprites in the game and add Studio, Beverage and Silkery; then mill-lit-2 and winery-lit-2 once the link recovered. **All eleven stations are in the game
from the relit panels (2026-10-24 evening); round 6 is complete.**

**OPEN (owner, 2026-10-24): a station SCALE pass is owed** (now round 6 above). The owner held the Beverage pick
because its props are still too small, and says the same of a number of the cut stations: on
the board a 2 x 2 station's sacks, pots and jars must match the absolute size of the props by
the buildings' doors, and several do not. When the connection allows, commission scale
revisions (the store panel as the scale reference, fewer and bigger props) for the stations
the owner names, and recut them; do not pick or cut the Beverage Station until then.

Chicken Coop and Beehive are size 1 producers, commissioned in round 5 (owner, 2026-10-24) as
props on the 1 x 1 magenta guide like the deco, at the buildings' absolute prop scale, with NO
animals drawn (no hens, no bees: the coop and the skep hive are the sign). APPROVED: beehive-b-1
(golden, sunlit, a big honey pot) and chicken-coop-e-1 after four scale rounds (b: egg door, no
side box, bigger trough and nest; c: no trough, two big steps, a bigger nest; d: two eggs, fewer
and bigger shingles; e: the two eggs huge, filling the nest). Lesson for 1 x 1 pieces: say
"fewer, bigger" for EVERY element (shingles, steps, eggs), not just the props; the model keeps
miniature detail unless each part is named.

## 2b. Reserved concepts

- **The Living Oak / tree house** (from the Guild round, 2026-10-23): a hall grown into a huge
  living oak, the door in the trunk, rooms with teal shingle roofs in the boughs, a curling
  stair and a rope bridge, hives in the branches. The owner liked it and set it aside for
  something more SECRET in the valley: possibly the Shrine reimagined (Shinto), possibly the
  home of a new character. Candidates: `_candidates/buildings-bible-r9/exploration/openai/painterly-guild-oak-1.png` and `-2.png`.

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
| 9 | 2026-10-23 | Guild | `tools/art/jobs/buildings-bible-r9.json`: the owner asked for creative concepts ("late-stage skills, a little more special than other basic town buildings, on the more whimsical side"): A the Stacked Hall (three crooked storeys, each a master's workshop, a cog weathervane), B the Living Oak (rooms in the boughs of a great oak, the door in the trunk), C the Lantern Hall (a glass lantern cupola, a rose window of the crossed tools, trade pennants); teal, the crest of crossed tools, two candidates each | APPROVED: A, guild-stack-1 (owner). C was rejected for repeating the crest in the rose window above the door (see §1, the sign is never repeated above itself). **B, the Living Oak, is RESERVED** (owner): keep the tree-house concept for something more secret in the valley: possibly the Shinto shrine reimagined, possibly the home of a new character (§2b) |
| 8 | 2026-10-23 | Shrine | `tools/art/jobs/buildings-bible-r8.json`: the owner likes the drawing in the game today ("it just needs to be done in the new art style"); its SVG rasterised as `guides/control-shrine.png` and sent as the CONCEPT reference, every element listed in the prompt, repainted in the whimsical style with the valley look | APPROVED: shrine-1 (taller on its mossy terrace, the fuller eaves) |
| 7 | 2026-10-23 | Courthouse (5 x 5), Adventure Camp, Laboratory | `tools/art/jobs/buildings-bible-r7.json`, `guides/building5.png` added for the 5 x 5: the Courthouse in the civic scheme (white roof, cream plaster, walnut timber) with a tall central clock tower, burgundy door and shutters, a gold-rimmed numeral-free clock, no placard; the Adventure Camp as a camp, not a building (owner: "rustic and tent-like, set up in the field"): a big tan canvas tent with forest-green trim, a smaller tent, a cold campfire with log seats, a weapons rack, a tent-over-campfire pictogram on a signpost, valley look; the Laboratory as the CULINARY SCHOOL (owner: "don't be fooled by the name"): a warm orange cottage with a golden thatched roof, cooking props (bread oven, copper pots, bread basket, vegetable crate, onions), a big pie as the sign | Laboratory APPROVED (laboratory-2, the owner's pick: the pie framed by the thatch). Courthouse: the owner likes courthouse-1 and its scale but wants THREE storeys plus the roof, a door sized like other buildings' doors against the grid (about one tile), and one stone statue each side of the steps, medieval dignitaries, so it reads as government (revision `courthouse-b`, courthouse-1 + the Library as refs). Adventure Camp: both too complicated; ONE tent only, and NO weapons: the camp sells backpacks and adventuring skills, so the gear is medieval camping gear (backpack stand, bedroll, cook pot on a tripod, rope, waterskins, supplies chest) (revision `adventure-camp-b`). Both revisions APPROVED 2026-10-23: courthouse-b-2 (the facade fills the 5 tiles, three storeys, the one-tile door, the magistrate and the alderman in the yard) and adventure-camp-b-1 (one tent, the backpack stand, cook pot over the cold fire) |
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

The keyer (`lib/key.js`) floods from the image border (`flood: true`, what cutout.js uses).
Two switches for art the flood cannot fully key: `--flood islands` also clears every pocket
of FLAT magenta the flood could not reach (under an eave, between a lantern and a roof,
inside a cupola) while keeping pinks and purples (the Shrine, 2026-10-23); `--flood 0` keys
every magenta-hued pixel outright, for art with no pinks or purples at all (the School's
cupola, the Adventure Camp). The flood:
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
