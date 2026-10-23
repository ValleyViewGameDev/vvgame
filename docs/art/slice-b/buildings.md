# Slice B, buildings lane (2026-10-19; round 2 and round 3 2026-10-20)

Status: round 3 CANDIDATES (the owner's family rules applied), nothing new approved. Spend so far:
round 1 10 images, round 2 22, round 3 18 of its 22 (gpt-image-2 medium, 35 to 43 s each, about
170k tokens; five requests failed on the network with no image and were re-sent by the same
command). Job: `tools/art/jobs/slice-b-buildings.json`; run with
`node tools/art/generate.js --job slice-b-buildings --style elsinore --models openai [--subjects a,b]`,
sheet with `node tools/art/sheet.js --job slice-b-buildings`. Candidates and sidecars live under
`tools/art/_candidates/slice-b-buildings/` (gitignored, regenerable from the sidecars). Guides:
`tools/art/guides/tree.png`; controls `control-{dairy,mill,warriors-den,oak-tree,pine-tree}.png`
(round 1), `control-{general-store,school,bank,dead-tree}.png` (round 2),
`control-{academy,laboratory,courthouse,armory,adventure-camp,guild}.png` (round 3), all from `guides.js`.

Approved (`approved/`): the Dairy `flatter-dairy-b-1` (the 2 x 2 crafting-station panel), the Oak
`flatter-oak-tree-1` and its four recolours, the Pine `flatter-pine-tree-c-1`, the Dead Trees
`flatter-dead-tree-brown-1` / `-black-1`.

## For the owner to approve

Everything is in `tools/art/_candidates/slice-b-buildings/exploration/openai/` (`flatter-<key>-1.png`).
Sheets: `sheet.png` (every candidate at 512 px plus 90 and 45 px thumbnails) and
`buildings-round3.png` (round 3 grouped by family, one labelled row per family, each panel at 512 px
with the building cut to its 3 x 3 footprint at 135 px, the two Mills and the two store-a redos in
their own row). Details for every file are in "Round 3" at the end of this doc.

**Round 3 (2026-10-20 afternoon): the family test, 18 images**
- Mill (2 x 2, the owner's swap): `flatter-mill-d-1` (swap, wheel as in mill-b), `flatter-mill-e-1`
  (swap, wheel lowered so the sails stay inside the footprint)
- General Store redo as pure Tudor: `flatter-store-c-1` (store-a edited: thatch, no chimney, post
  sign in a yard), `flatter-store-d-1` (fresh draw: gable end, jetty, thatch, post sign)
- TUDOR: `flatter-school-c-1` (thatch, ochre door, open book), `flatter-academy-a-1` (green slate,
  palette board), `flatter-laboratory-a-1` (plum slate, flask), `flatter-courthouse-a-1` (grey slate,
  jetty, scales; drawn 3 x 3 for the test)
- CASTLE: `flatter-bank-d-1` (dressed stone, square tower, red doors, coin bag), `flatter-den-g-1`
  (den-d with a flat placard), `flatter-armory-a-1` (battlements, right-hand turret, shield)
- COTTAGE: `flatter-inn-d-1` (inn-b with the post inside the square), `flatter-store-e-1` (store-b
  filled to the edges), `flatter-camp-a-1` (log cabin, canvas awning, campfire, tent signpost)
- FANTASTICAL, the Guild: `flatter-guild-a-1` (crooked tower), `flatter-guild-b-1` (grown from an
  oak), `flatter-guild-c-1` (stage hall with mask beam-ends and a rose window), `flatter-guild-d-1`
  (the crooked tower again with the camera named)
- My seed picks per family (reasons in Round 3 §7.6): **Tudor academy-a, Castle bank-d, Cottage
  camp-a, Fantastical guild-c**; Mill **mill-e**; Tudor General Store **store-c**.

**Round 2 files still open** (superseded in part by the family rules): Warrior's Den `den-d/e/f`,
General Store `store-a/b`, School `school-a/b`, Inn `inn-a/b/c`, Bank `bank-a/b/c`; Mill `mill-b/c`.
Round 1: `dairy-a`, `den-a/b/c`, `oak-tree-b`, `pine-tree`, `pine-tree-b`.

### Decisions so far (owner, 2026-10-20)

1. Crafting-station template APPROVED; `flatter-dairy-b-1` is the panel for every 2 x 2 station.
2. Mill: right, but swap the floor: the millstone LEFT, lined up under the windmill it is connected
   to (one machine), sacks of flour and sugar RIGHT (round 3).
3. 3 x 3 buildings: round 1 too uniform; round 2 had the variety but mixed styles (store-a: Tudor
   framing under clay tile with a castle chimney; den-a: castle stone under cottage thatch) and
   signs on brackets. Replaced by the FOUR FAMILIES and the signage rule
   (`docs/art-pipeline-plan.md` §7c; prompt-ready paragraphs in Round 3 §7.2).
4. Trees: the oak, its recolours, the shorter pine and the dead trees APPROVED (round 2).
   In the game since 2026-10-23: Oak Tree, Pine Tree, Dead Tree, Big/Huge Dead Tree (`artSpan`
   rows). The oak is ONE resource with three canopies picked per cell (owner: cosmetic only):
   `artVariants` on the row, `oak-tree.svg=2;oak-tree-autumn-gold.svg=1;oak-tree-autumn-red.svg=1`
   (summer 50 %, autumn gold 25 %, autumn red 25 %, a stable hash of the cell so a tree never
   changes its look; `game-client/src/Utils/artVariants.js`). The autumn panels are the
   `trees-cut` job's `oak-autumn-gold` / `oak-autumn-red` (recolours of the approved oak, cut
   with the silhouette fit, fill 1.25, 384 px).

## 1. The building style guide (rules read off the approved farmhouse)

Source of truth: `tools/art/styles/elsinore/bible/flatter-farmhouse-solo-1.webp` (the Farm House
alone on its 2 x 2). It is the first style ref every request already carries, so the prompts say
"the FIRST attached image" instead of attaching it a second time. The file outranks the prose.

1. **Camera.** Top-down three-quarter: the roof plane and the front wall both visible, verticals
   straight up, nothing isometric. The roof takes roughly the top half of the footprint, the front
   wall the bottom half, seen square-on.
2. **Footprint fill.** The building fills its n x n square edge to edge and nothing spills outside.
   The roof ridge runs along the square's top edge; the foundation sits on the bottom edge. No
   headroom for buildings: nothing rises above the top tile.
3. **Roof plane.** Golden thatch drawn as a few big crisp tufted rows (not hair texture), lit on
   the upper left with one shadow tone on the right, a pegged wooden ridge beam along the top.
4. **Front wall.** Cream plaster framed by grey field stones at the corners and along the base, on
   a one-stone-high foundation course. Every stone is one outlined shape with one highlight.
5. **Door and window.** Dark brown vertical planks with an iron ring; one shuttered window with a
   blue pane.
6. **Line, shading, shadow.** One dark outline around every object and every part; one shadow tone
   and one highlight per colour ("flatter"); a soft contact shadow on the grass to the lower right,
   light from the upper left.
7. **Ground.** The grass and tile edges in a panel are context only; the renderer draws the real
   tiles. The asset is the building plus its contact shadow, cut from the panel at its footprint.

## 2. Crafting stations (2 x 2): the template

**Prompt-ready paragraph** (copied verbatim into every station's prompt; only the WORK clause and
the identity cues change):

> CRAFTING-STATION TEMPLATE, shared by every 2 x 2 crafting station in this game: an open-air,
> cut-away workshop, NOT a closed house. A back wall of the farmhouse's stone-and-plaster runs along
> the back (top) edge of the footprint; two short side walls of the same stone come forward from its
> ends about a third of the way; there is NO front wall and NO roof over the front, so the camera
> looks straight into the workshop. A narrow strip of the farmhouse's golden thatch with its wooden
> ridge beam sits along the top of the back wall only, like an awning. The floor inside is packed
> ochre earth with a few flagstones. On that open floor stands the WORK, drawn big and obvious so a
> player recognises the station at a glance: [what this station makes]. Materials, outline, shading,
> the lower-right contact shadow and the colours are copied from the farmhouse in the FIRST attached
> image: this station stands in the same village.

Now that the Dairy is approved, its panel is attached as a per-subject ref ("the APPROVED Dairy, the
template every 2 x 2 station is built on") and the paragraph shrinks to the WORK clause, plus the
building2.png guide sentence (fill the tan 2 x 2 entirely, back wall on its top edge, ground contact
on its bottom edge, side walls to the left and right edges, plain grass around). Side walls all the
way forward are fine (approved as drawn).

| Station | Old file | Shows being crafted (proposal) |
|---|---|---|
| Mill | mill.svg | millstone on a wooden frame under the windmill wheel at the LEFT end of the back wall (one machine), sacks of flour and sugar and a grain heap RIGHT (drawn, round 3) |
| Dairy | dairy.svg | a butter churn, a cheese wheel with a wedge out on a low table, a milk pail, milk bottles in a crate (approved) |
| Loom | loom.svg | a wooden hand loom with a half-woven cloth on it, a basket of thread spools, a folded bolt of cloth |
| Oven | oven.svg | a domed brick bread oven with a glowing mouth against the back wall, a wooden peel, loaves and a pie cooling on a board |
| Kitchen | kitchen.svg | a hearth with a steaming cook-pot, a chopping table with vegetables, a stack of bowls |
| Lumber Yard | lumber-yard.svg | a sawhorse with a half-cut log and a big hand saw, a stack of planks, an axe in a stump |
| Studio | studio.svg | a potter's wheel with a half-made pot, a shelf of urns, an ink pot and brush |
| Beverage Station | beverage-station.svg | a wooden counter with a kettle over a small fire, jugs and cups, a lemon pile and a coffee pot |
| Winery | winery.svg | a grape press with juice running into a tub, two oak barrels on their sides, a row of bottles |
| Coffee Factory | coffee-factory.svg | a round drum roaster over a fire, a sack of green beans beside a sack of dark roasted beans, a scoop |
| Silkery | (none) | a rack of silkworm trays on the back wall, a reel winding white silk thread, a basket of mulberry leaves |

Chicken Coop and Beehive are `crafting` rows with no size: 1 x 1 props, not this template. Hospital,
Library and Ancient Temple are `crafting` rows at size 3: closed buildings, §3.

## 3. Closed buildings (3 x 3): families and the sign

Round 1's single template and round 2's free exploration are both retired; a 3 x 3 building now
belongs to ONE of the four families in Round 3 §7.2 and carries a sign under the signage rule there.
Two things that must stay in every 3 x 3 prompt: the guide sentence says "a FIVE by FIVE grid, five
columns and five rows, the building fills the central 3 x 3" (den-b drew 4 x 4 without it), and the
sign carries ONE flat picture and NO letters. Family assignment (owner, §7c of the plan): Tudor for
the Agriculture Center, Courthouse, Academy, Laboratory, Magic Shop, School; Castle for the Bank,
Warrior's Den, Armory; Cottage for the Inn, General Store and the humbler shops; Fantastical for the
Guild and the like. Sign pictures for every 3 x 3 row in resources.json:

| Row (category) | Sign picture (proposal) |
|---|---|
| Warrior's Den (shop) | two crossed swords (drawn) |
| Armory (shop) | a round shield with a sword behind it (drawn) |
| Magic Shop (shop) | a pointed hat with a star |
| Shrine (shop) | a single lit candle |
| Castle (shop) | a crown |
| Shiro (shop) | a folded paper fan |
| Restaurant (shop) | a steaming bowl with a spoon |
| General Store (training) | a tied sack with a coin on it (drawn) |
| School (training) | an open book (drawn) |
| Academy (training) | a paint palette and brush (drawn) |
| Laboratory (training) | a round flask with bubbles (drawn) |
| Guild (training) | a hammer and chisel crossed (drawn) |
| Agriculture Center (training) | a wheat sheaf |
| Factory (training) | a cog wheel |
| Adventure Camp (trainingAndShop) | a tent with a small flag (drawn) |
| Hospital (crafting) | a red cross |
| Library (crafting) | a stack of three books |
| Ancient Temple (crafting) | a sun disc; the building itself is a ruin and may break the template (owner's call) |
| Bank (station) | a coin bag (drawn) |
| Inn (station) | a bed (drawn) |
| Post House (station) | a sealed envelope |
| Courthouse (station, size 5) | a pair of balance scales (drawn at 3 x 3 for the family test) |

Restroom (shop, size 2) is a closed 2 x 2: a Cottage shrunk, one window, a two-figure sign, not the
open-air station template.

## 4. Trees (1 x 1 sources)

**Rule**: a tree stands on one tile and rises one full tile above it, so it is two tiles tall (a
person is one and a half); the crown may spread up to a quarter of a tile past each side of its tile.
Guide: `tools/art/guides/tree.png` (`treeGuide()` in `guides.js`). Wording that worked: "exactly TWO
tiles tall", "the top of the tree TOUCHES the top edge of the lighter tile". Approved: the oak
(1.5 tiles tall, 1.15 wide) and its recolours (summer-a `#aac525 #91b01d #70971a #599324`, summer-b
`#599324 #518622 #43721e #3f4216`, autumn-gold `#f8c935 #e9b22a #daa025 #ad7620`, autumn-red
`#bd7433 #b32216 #9d1b13 #72120a`), the pine `pine-tree-c` (5% shorter than pine-b), the dead trees
(brown `#6c481f / #4f381c / #945e1d`, black `#231a18 / #3e3b35 / #58534b`). Renderer note:
`PixiRenderer.js` draws every resource as a `size x size` square, so a two-tile-tall tree needs its
sprite drawn 1 wide by 2 tall, anchored on the tile's bottom edge and sorted in front of the tile above.

## 5. What drifted in rounds 1 and 2 (short)

- Stations: side walls came all the way forward (approved as is); plaster vanished (harmless); the
  Mill's bigger wheel rose above the 2 x 2 by a quarter to half a tile in round 2 (fixed in round 3
  by mill-e's "hub level with the awning").
- 3 x 3: "FIVE by FIVE, five columns and five rows" fixed the 4 x 4 redraw and has held since. Signs
  at corners spilled 0.1 to 0.3 tile outside the square (store-a, inn-b, inn-c); wooden shingles read
  as brown tiles unless asked for "flat rectangular shingles in staggered rows"; the eave-beam sign
  (D) never drew a beam. No letters on any sign in any round.
- Trees undershot the headroom until the prompt said "exactly two tiles" and "touches the top".

## 6. Round 2 (2026-10-20): thirteen 3 x 3 explorations

Asked: real architectural variety and signs that are visibly fastened; four roof materials, six
rooflines, three wall materials and four sign attachments (A wall bracket, B post by the path,
C plaque nailed flat, D board under the eave) were spread over thirteen buildings. "Fill" is the
building's measured width x height in tiles of its 3 x 3 square (ideal 3.0 x 3.0).

| Key | Walls / roof / roofline (as drawn) | Sign | Fill | Verdict under the families |
|---|---|---|---|---|
| den-d | field stone / slate / hipped with a gable and a round corner turret | A, crossed swords | 2.6 x 2.5 | the CASTLE family reference; sign bracket now banned (den-g fixes it) |
| den-e | planks / wooden shingles / gable facing the viewer, shield in the gable | C | 2.6 x 3.0 | cottage look; shingles read as tiles |
| den-f | field stone / clay tile / two storeys, dormer | D | 2.4 x 2.6 | clay tile banned |
| store-a | timber framing / clay tile / jettied upper floor on brackets | A | 2.9 x 2.8 | "close but mixed": redone as store-c/d |
| store-b | planks / thatch / gable, propped shutter | B, post in a yard | 2.4 x 2.9 | the COTTAGE yard-sign reference; refilled as store-e |
| school-a | pale plaster, stone corners / slate / hipped, bell cupola | C | 2.6 x 2.7 | no family (plaster without framing) |
| school-b | field stone / clay tile / gable, dormer, bell niche | D | 2.4 x 2.5 | clay tile banned |
| inn-a | stone below, framing above / thatch / jetty, chimney | A | 2.4 x 2.9 | mixed (stone + Tudor), thatch with a chimney |
| inn-b | planks / wooden shingles / gable, round window, dormer | B, post 0.3 outside | 3.3 x 2.9 | the COTTAGE family reference; refilled as inn-d |
| inn-c | timber framing / clay tile / hipped, two chimneys | D, beam at the gable end | 3.2 x 2.4 | clay tile banned (the owner's example) |
| bank-a | dressed stone / slate / hipped, square tower, pediment | C | 2.6 x 2.7 | castle already; redrawn as bank-d with the sign in the pediment |
| bank-b | plaster, stone corners / clay tile / two storeys | D | 2.7 x 2.9 | clay tile banned |
| bank-c | dressed stone / wooden shingles / gable, lock-plated doors | A | 2.5 x 2.6 | castle walls under a cottage roof: mixed |

What held: every material and roofline asked for was drawn in the farmhouse's line and shading, and
the village read as one village. What failed (the owner's verdict): styles mixed inside one building,
thatch and clay tile everywhere, signs on brackets. The families fix it.

## 7. Round 3 (2026-10-20 afternoon): the families, the Mill fix, the store-a redo

### 7.1 What was asked

The owner's rules in `docs/art-pipeline-plan.md` §7c: four families, never mixed within a building;
clay tile, mixed families and bracket signs banned; every sign a placard on the front or a post sign
in a front yard, inside the 3 x 3, imagery only; buildings fill their square to the edges. Draw: the
Mill with the floor swapped (2), store-a redone as pure Tudor (2), Tudor School / Academy /
Laboratory / Courthouse (4), Castle Bank / Warrior's Den / Armory (3), Cottage Inn / General Store /
Adventure Camp (3), the Guild in the new Fantastical family (3), one retry (guild-d). 18 of the 22
spent; 4 left for the owner's retries. New controls: academy, laboratory, courthouse (town-hall.svg),
armory, adventure-camp, guild (drawn by `guides.js`; the Guild's was not attached, the old pointed
house would have anchored the model). Family references attached per subject: den-d for Castle,
inn-b and store-b for Cottage, the approved Dairy plus mill-b for the Mill, store-a plus store-b for
the Tudor store redo, the approved oak for guild-b.

### 7.2 The family rules, prompt-ready (these become the sub-bible prompts; copied verbatim per key)

> **TUDOR FAMILY** (this building belongs to it and uses nothing from the other families): walls of
> cream stucco (#f7eaca) divided by dark timber framing (#4f381c): upright posts, a horizontal rail at
> each floor, diagonal braces at the corners, every stucco panel flat with one shadow tone, standing
> on the farmhouse's grey stone foundation course. Small windows with leaded panes in the farmhouse's
> blue glass, framed in dark timber, with wooden shutters. The roof is ONE of two kinds, named below:
> STRAW THATCH (the farmhouse's golden thatch, #f8c935 lit, #e9b22a, #daa025 in shade, a few big
> crisp tufted rows, a pegged wooden ridge beam) with NO chimney at all; or SLATE (crisp overlapping
> rows of flat rectangles) with ONE BRICK chimney (bricks #98401b with #bd7433 lit edges and a grey
> stone cap) and no thatch anywhere. Every Tudor building has its own roof colour, named below, so
> the buildings tell apart at a glance, and its DOOR IS PAINTED to match that roof colour, with black
> iron hinges and a ring. No towers, no turrets, no battlements, no plank or log walls, no bare stone
> walls above the foundation.

> **CASTLE FAMILY** (this building belongs to it and uses nothing from the other families): walls
> entirely of grey stone, either FIELD STONE (irregular rounded stones like the farmhouse's corners,
> each stone one outlined shape with one highlight, #787570 lit, #58534b in shade, #3e3b35 in the
> joints) or DRESSED STONE (squared blocks laid in straight courses, the same greys), on a heavier
> foundation course. Small deep-set windows, arched or arrow slits, with black iron bars or wooden
> shutters. Roofs of grey SLATE (crisp overlapping rows of flat rectangles, #787570 lit, #58534b in
> shade, a #3e3b35 ridge) or of flat grey stone slabs; round towers, square towers, turrets with
> conical slate caps and battlements are all allowed as long as nothing rises above the square's top
> edge. Doors are heavy dark oak (#4f381c) with black iron bands and studs, set in a stone arch. No
> thatch, no timber framing, no stucco, no planks, no logs, no clay tile.

> **COTTAGE FAMILY** (this building belongs to it and uses nothing from the other families): rustic
> wood. Walls of horizontal wooden PLANKS (#ad7620 lit, #945e1d in shade, #6c481f in the gaps, a row
> of nail heads at the plank ends) or of round stacked LOGS with notched, crossed ends at the corners,
> on the farmhouse's low stone foundation course; simple square windows with wooden shutters and
> leaded panes. Roof of golden STRAW THATCH (the farmhouse's: #f8c935 lit, #e9b22a, #daa025 in shade,
> big crisp tufted rows, a pegged wooden ridge beam) or of WOODEN SHINGLES (flat rectangular shingles
> in staggered rows, #945e1d lit, #6c481f in shade, a wooden ridge board). Plank doors with an iron
> ring, sometimes painted. A cottage has a small FRONT YARD of packed ochre earth along the front of
> its plot, inside its square, where its signpost stands; benches, barrels, window boxes and tools
> lean against its walls. No stone walls above the foundation, no timber framing with stucco, no
> slate, no clay tile, no towers.

> **FANTASTICAL FAMILY** (this building belongs to it; it is the village's one family of impossible
> buildings): imaginative Shakespearean fantasy, a building from a stage play rather than a real
> street. It may lean, twist, stack or grow; it may be built into a living tree; it may have
> STAINED-GLASS windows in jewel colours (#9d1b13 red, #446d32 green, #552b4d purple, #e6b64f gold,
> black leading), a GREAT CARVED DOOR with scrollwork and figures, hanging lanterns, crooked chimneys
> and crooked roof caps. But it is built of this village's own materials (grey stone, dark oak
> timber, cream stucco, golden thatch, grey slate, black iron, living oak) and drawn in the bible's
> exact style: the same dark outline, flat fills with one shadow and one highlight per colour, the
> same camera, the same lower-right contact shadow. Not generic fantasy: no glowing runes, no floating
> parts, no crystals, no magic mist, no clay tile. Everything stays inside its square.

Three shared sentences follow every family paragraph (verbatim in the job file): **BANS** ("clay,
terracotta or Spanish tile roofs of any kind; mixing in the materials of another family; signs on
brackets, arms or poles that stick out from a wall; letters, numbers or writing anywhere"), the
**SIGNAGE RULE** ("a PLACARD fixed FLAT against the building's front: a board over the door, a plaque
nailed to the wall beside the door, or a board lying flat under the eave; or a signboard hanging from
a short cross-arm on a wooden post planted in a small front yard of packed earth that belongs to the
building's own plot; never sticks out from the wall, never crosses outside the square; ONE flat
painted picture and NO letters") and the **GUIDE** sentence ("FIVE by FIVE grid ... the building
TOUCHES ALL FOUR EDGES of the tan square: the roof's highest point touches the top edge and NOTHING
rises above it, the ground contact sits on the bottom edge, the left and right ends reach the left
and right edges"). Then a per-building ARCHITECTURE paragraph names the roofline, the roof colour,
the door colour, the props and the sign.

### 7.3 The buildings, one by one

"Fill" is the measured non-grass extent in tiles (contact shadow included, so right and bottom read
a little large); "spill" is how far past the square's edge it goes. Measured by a scratch script,
same method as round 2 (guild-b by eye: its foliage reads as grass to the script).

| Key | Family | Walls / roof (as drawn) | Door | Sign (as drawn) | Fill (w x h) | Drift |
|---|---|---|---|---|---|---|
| school-c | Tudor | framing + stucco / thatch, no chimney; single storey, thatched porch with a bell | ochre #cd9432 | open book, placard over the door inside the porch | 3.35 x 2.6; sides spill 0.17, bottom gap 0.35 | wide and low: a one-storey building cannot fill 3 tiles of height; otherwise exact |
| academy-a | Tudor | framing + stucco / green slate, hipped, dormer, brick chimney | green #446d32 | palette and brush, board under the eave over the door | 2.75 x 3.11; chimney cap 0.28 above the top edge | easel and pots as asked; nothing else drifted |
| laboratory-a | Tudor | framing + stucco / plum slate, steep gable end, round window, brick chimney | plum #552b4d | round flask, placard over the door | 2.78 x 3.18; chimney 0.22 above | copper still, crate and bottle row all there |
| courthouse-a | Tudor | framing + stucco, herringbone braces / grey-blue slate, hipped, jetty on six brackets, brick chimney | grey-blue #787570 | balance scales, placard over the double door | 2.75 x 3.17; chimney 0.24 above | the grey door reads unpainted at 45 px; a red door would help if the owner allows one exception |
| store-c | Tudor | store-a's framing / thatch, no chimney; the jetty flattened to a ledge | green | sack and coin, post sign in the yard at the front right | 2.69 x 3.41; ridge 0.30 above, yard 0.11 below | the jetty mostly gone (two storeys stay); sides 0.15 in |
| store-d | Tudor | framing + stucco / thatch, gable end facing, jetty on brackets, no chimney | green | sack and coin, post sign at the front right | 2.59 x 3.72; peak 0.56 above, yard 0.16 below | the tallest miss: a gable end plus a yard does not fit 3 tiles of height |
| bank-d | Castle | dressed stone / slate, hipped, square corner tower right, pediment on columns | red #9d1b13 double doors, lock plate | coin bag, placard inside the pediment | 2.94 x 3.09; tower cap 0.10 above | the best 3 x 3 fill of the round; barred window, three steps |
| den-g | Castle | den-d's field stone / slate, hipped with gable, round turret left | dark oak, banded | crossed swords, big placard over the door | 3.05 x 2.92; within 0.03 | shield and spear added as asked; the placard is large and reads at 45 px |
| armory-a | Castle | dressed stone / low slate behind battlements, round turret right | dark oak, arched, studs | round shield with a sword, placard over the arch | 2.91 x 2.9; cap 0.09 above, bottom gap 0.2 | spear rack and barred window as asked; nothing drifted |
| inn-d | Cottage | planks with log ends at the corners / wooden shingles, gable end, dormer | plank, iron ring | bed, post sign at the front left INSIDE the square | 3.16 x 3.21; spills 0.08 to 0.13 all round | a SECOND bed placard appeared in the gable; the shingles still read as rounded rows |
| store-e | Cottage | store-b's planks / thatch, gable end, propped shutter | green | sack and coin, post sign at the front right | 2.69 x 3.27; peak 0.17 above, yard 0.10 below | identical to store-b otherwise; sides 0.15 in |
| camp-a | Cottage | logs with notched ends / wooden shingles, ridge along the top, canvas awning | plank, iron ring | tent with a flag, post sign at the front right | 2.98 x 3.01; within 0.04 | exact: firewood, rope, lantern, campfire ring in the yard, all inside the square |
| guild-a | Fantastical | field-stone ground storey, two timber-framed storeys leaning left then right, slate cap, tiny chimney | great carved oak double door, wreath | hammer and chisel, placard over the door | 2.99 x 3.83; cap 0.55 above, yard 0.28 below | CAMERA drifted to a front elevation (no roof plane seen from above); stained glass and lantern good |
| guild-b | Fantastical | a great oak trunk with two timber-framed rooms under little thatch roofs in the boughs, a curling stair | great carved oak door in the trunk | hammer and chisel, placard on the trunk | about 3.0 x 3.1 (by eye); crown 0.25 below the top edge, yard 0.3 below the bottom | the one take that could only be this family; the crown is the roof, the camera holds |
| guild-c | Fantastical | framing + stucco on a stone base / swooping slate roof with curled eaves, mask beam-ends, brick chimney | great carved oak double door | hammer and chisel, placard over the door under the rose window | 3.09 x 3.23; chimney 0.22 above | the masks, rose window, side windows and lanterns all arrived; the camera holds |
| guild-d | Fantastical | guild-a retried with the camera named: field-stone base, two leaning timber storeys, slate cap, crooked chimney | great carved oak double door | hammer and chisel, placard over the door | 3.01 x 3.62; cap 0.41 above, yard 0.21 below | CAMERA FIXED (every roof plane seen from above); still too tall for the square, a scale fix at the cut |

### 7.4 The Mill (2 x 2)

Both candidates do the owner's swap: the millstone LEFT, directly under the wheel, with the post
running down into the stone's frame (one machine), the sacks RIGHT (two flour, one open sugar sack
with a scoop, the grain heap beside them). `mill-d` keeps mill-b's wheel height and still pokes
0.13 tile above the footprint (the ridge pegs and the top sail); `mill-e` ("the hub level with the
thatch awning") brings everything inside: 2.0 x 1.95 tiles, top spill 0.02. The hopper above the
stone did not survive in either (the post passes through the stone instead); if the owner wants it
back, say "a wooden hopper sits on top of the millstone beside the post".

### 7.5 What held and what drifted

- **Families held in every panel**: no clay tile anywhere, no building mixes two families, every
  Tudor door is painted to its roof colour, every Castle wall is stone, every Cottage is wood.
- **Signs held**: 15 placards or post signs, all flat or planted, all inside the square, no letters.
  Post signs in yards landed inside the square every time once the prompt said "inside the square"
  (inn-d, store-c/d/e, camp-a).
- **Fill**: round 3 averages 2.9 wide x 3.2 tall against round 2's 2.6 x 2.7. "Touch all four edges"
  works, but two-storey buildings with a yard overshoot the TOP by 0.2 to 0.6 tile (store-d worst)
  and the Tudor chimney caps cross it by about 0.25 even when told to touch it. The asset is cut at
  its own bounds and scaled to the footprint, so this is a scale question, not a redraw: say "the
  building is a little shorter than the square" or let the renderer give 3 x 3 buildings the tree
  treatment (a sprite taller than its footprint, anchored at the bottom).
- **Camera** drifted once (guild-a, a front elevation); naming it in guild-d fixed it. A second sign appeared once
  (inn-d's gable); say "ONE sign only".

### 7.6 Recommendation: the panel that seeds each family's sub-bible

- **Tudor: academy-a.** It shows every Tudor rule at once (framing, stucco, slate in a named colour,
  the one brick chimney, the matching painted door, a flat board under the eave) and nothing drifted.
  school-c is the thatch variant to attach beside it when a thatched Tudor is drawn.
- **Castle: bank-d.** Dressed stone, slate, a tower, a pediment, the sign inside the building's own
  front, and the best fill of the round. den-g stays the field-stone variant (owner's den-d, fixed).
- **Cottage: camp-a.** Exact fill, logs and shingles, the yard with its post sign and props all inside
  the square. inn-d is the plank-and-dormer variant; store-e the thatch variant.
- **Fantastical: guild-c.** Shakespearean (masks, rose window, curled eaves, a great carved door) with
  the bible's camera intact; guild-b is the stronger idea but is a one-off (a tree-building cannot
  seed other buildings); guild-d (the crooked tower with the camera fixed) is the runner-up if the owner wants the tower look to seed the family.
- **Mill: mill-e** (the swap plus the sails inside the footprint). **Tudor General Store: store-c**
  (the owner's "close" store-a with the three fixes; store-d if the gable end is preferred).

## Trees in the game (2026-10-23)

The owner put the approved trees in: the summer oak (`oak-summer-a-1`) as the Oak Tree, the
pine (`pine-tree-c-1`), the brown dead tree (`dead-tree-brown-1`) as the Dead Tree and the
black dead tree (`dead-tree-black-1`) as `dead-tree-large.svg`, the file the Big (2 x 2) and
Huge (4 x 4) Dead Trees share. Each was redrawn on magenta from its own panel
(`tools/art/jobs/trees-cut.json`, guide `building1-cut.png`) and cut by `tools/art/cutout.js`
with the silhouette fit and `--fill` above 1 (1.25 oak, 1.5 the others) so the canopy
overhangs its tile as the panels intended; `artSpan` carries the two-tile height (the Big
and Huge Dead Trees scale it by their size). The autumn oaks (`oak-autumn-gold/red`) and
the second summer oak are approved but not placed: no resource row and no seasons
mechanism for tree art yet.
