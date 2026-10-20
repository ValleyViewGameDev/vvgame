# Slice B, buildings lane (2026-10-19, round 2 2026-10-20)

Status: round 1 reviewed (two approvals, below); round 2 CANDIDATES, nothing new approved. Round 1
spent 10 images, round 2 spent 22 of its 24 (about 190k tokens, gpt-image-2 medium, 55 to 122 s
each; three requests failed on the network with no image and were re-sent by the same command).
Job: `tools/art/jobs/slice-b-buildings.json`; run with
`node tools/art/generate.js --job slice-b-buildings --style elsinore --models openai`, sheet with
`node tools/art/sheet.js --job slice-b-buildings`. Candidates and sidecars live under
`tools/art/_candidates/slice-b-buildings/` (gitignored, regenerable from the sidecars).
Guides: `tools/art/guides/tree.png`; controls `control-{dairy,mill,warriors-den,oak-tree,pine-tree}.png`
(round 1) and `control-{general-store,school,bank,dead-tree}.png` (round 2), all drawn by `guides.js`.

Approved so far (`approved/`): `openai--flatter-dairy-b-1.png` (the 2 x 2 crafting-station
sub-bible panel) and `openai--flatter-oak-tree-1.png` (the Oak Tree).

## For the owner to approve

Everything is in `tools/art/_candidates/slice-b-buildings/exploration/openai/` (`flatter-<key>-1.png`).
Two sheets: `sheet.png` (every candidate, 512 px plus the 90 and 45 px board thumbnails) and
`buildings-round2.png` (the thirteen new 3 x 3 buildings side by side at 512 px, with the panel at
90 px and the building cut to its footprint at 135 px, which is 3 tiles at 45 px, plus round 1's
den-a as the baseline). Details for every file are in "Round 2" at the end of this doc.

**Round 2, 3 x 3 buildings (thirteen explorations; pick two or three to build the sub-bible from)**
- Warrior's Den: `flatter-den-d-1` (stone, slate, hipped roof, corner turret; wall-bracket sign),
  `flatter-den-e-1` (planks, wooden shingles, gable facing the viewer; flat plaque),
  `flatter-den-f-1` (stone, clay tile, two storeys, dormer; sign under the eave)
- General Store: `flatter-store-a-1` (timber framing, clay tile, overhanging upper floor on
  brackets; wall bracket), `flatter-store-b-1` (planks, thatch, gable, propped shop shutter; post sign)
- School: `flatter-school-a-1` (pale plaster, slate, hipped roof, bell cupola; flat plaque),
  `flatter-school-b-1` (stone, clay tile, gable with a dormer and a bell niche; under the eave)
- Inn: `flatter-inn-a-1` (stone below, timber framing above, overhang on brackets, thatch; wall
  bracket), `flatter-inn-b-1` (planks, shingles, gable with a dormer; post sign), `flatter-inn-c-1`
  (timber framing, clay tile, hipped, two chimneys; under the eave)
- Bank: `flatter-bank-a-1` (dressed stone, slate, hipped, corner tower, pediment; flat plaque),
  `flatter-bank-b-1` (plaster with stone corners, clay tile, two storeys; under the eave),
  `flatter-bank-c-1` (dressed stone, shingles, gable, lock-plated doors; wall bracket)
- My picks for the sub-bible: **store-a, bank-a, store-b** (reasons in Round 2 §4).

**Round 2, trees**
- Oak colour variations (recolours of the approved oak, same shape): `flatter-oak-summer-a-1`
  (light yellow-green), `flatter-oak-summer-b-1` (deep green), `flatter-oak-autumn-gold-1`,
  `flatter-oak-autumn-red-1`
- Pine, shorter: `flatter-pine-tree-c-1` (came out about 5% shorter, not 10%; same width)
- Dead Tree: `flatter-dead-tree-brown-1`, `flatter-dead-tree-black-1`

**Round 2, Mill (2 x 2)**: `flatter-mill-b-1` (the previous draft edited: machine moved right,
windmill doubled, at the left end), `flatter-mill-c-1` (fresh draw from the approved Dairy:
machine left, windmill doubled, at the centre). Both now poke the sails above the footprint.

**Round 1 files still open**: `flatter-dairy-a-1` (the other Dairy draw), `flatter-den-a/b/c-1`
(the thatch-template Dens, superseded by round 2), `flatter-oak-tree-b-1` (the 1.7-tile oak),
`flatter-pine-tree-1` and `flatter-pine-tree-b-1` (the pines; b is the one round 2 shortened).

### Round 1 decisions (owner, 2026-10-20 morning)

1. Crafting-station template APPROVED; `flatter-dairy-b-1` is the sub-bible panel for every 2 x 2
   station (`approved/openai--flatter-dairy-b-1.png`). Side walls all the way forward is fine.
2. Mill: right, but the machine must not sit dead centre and the windmill should be larger (round 2).
3. 3 x 3 buildings: much more exploration needed: imaginative architecture and rooflines, real
   distinction per building (not thatch everywhere), and signs believably attached. The hanging
   board stands; the attachment did not (round 2).
4. Oak `flatter-oak-tree-1` APPROVED (the 1.5-tile one, `approved/openai--flatter-oak-tree-1.png`),
   colour variations wanted, two in autumn colours. Pine `flatter-pine-tree-b-1` close: 10% shorter
   at the same width. Dead Tree wanted, brown and black (round 2).

## 1. The building style guide (rules read off the approved farmhouse)

Source of truth: `tools/art/styles/elsinore/bible/flatter-farmhouse-solo-1.webp` (the Farm House
alone on its 2 x 2). It is the first style ref every request already carries, so the prompts say
"the FIRST attached image" instead of attaching it a second time. These rules describe it; the file
outranks them (once a thing is approved it replaces the prose).

1. **Camera.** Top-down three-quarter: the roof plane and the front wall both visible, verticals
   straight up, nothing isometric. The roof takes roughly the top half of the footprint, the front
   wall the bottom half, seen square-on.
2. **Footprint fill.** The building fills its n x n square edge to edge and nothing spills outside.
   The roof ridge runs along the square's top edge; the foundation sits on the bottom edge. No
   headroom for buildings: nothing rises above the top tile.
3. **Roof plane.** Golden thatch drawn as a few big crisp tufted rows (not hair texture), lit on
   the upper left with one shadow tone on the right, a pegged wooden ridge beam along the top, a
   grey stone chimney at the upper right.
4. **Front wall.** Cream plaster framed by grey field stones at the corners and along the base, on
   a one-stone-high foundation course. Every stone is one outlined shape with one highlight.
5. **Door and window.** Dark brown vertical planks with an iron ring; one shuttered window with a
   blue pane. The farmhouse has the door left of centre; the templates below move it to the centre.
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

Then: "The second-to-last attached image is the game's OLD drawing of the [station]: keep what makes
it recognisable ([cues]) but do NOT copy its closed shape; the template above wins." and the
building2.png guide sentence (fill the tan 2 x 2 entirely, back wall on its top edge, ground
contact on its bottom edge, plain grass around, no props outside the square).

Once a Dairy is approved, its panel is attached as a per-subject ref ("the second-to-last image is
the APPROVED Dairy; build this station the same way") and the paragraph shrinks to the WORK clause.

**What varies per station**: only the WORK on the floor and one or two identity cues carried over
from the old drawing. Walls, awning, floor and materials never vary. Proposals for every 2 x 2
`crafting` row in `game-server/tuning/resources.json` (products = rows whose `source` is the station):

| Station | Old file | Shows being crafted (proposal) |
|---|---|---|
| Mill | mill.svg | a flat millstone on a wooden frame with a hopper, a grain heap, two flour sacks; a small four-sail windmill wheel on a post at the back wall as its identity (drawn; see §5 for the spill) |
| Dairy | dairy.svg | a butter churn, a cheese wheel with a wedge out on a low table, a milk pail; the old drawing's milk bottles in a crate (drawn) |
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

## 3. Closed buildings (3 x 3): the template and the sign

Round 1's template ("the farmhouse built bigger", thatch, one window left, a board on chains from
a bracket under the roof edge right of the door) made den-a/b/c and was retired by the owner: not
enough variety, sign not believably attached. Round 2 (§6) replaces it with a RULES paragraph
(copy the farmhouse's drawing style, not its shape) plus a per-building ARCHITECTURE and a named
SIGN fastening; the wording is in the job file under the round-2 keys. Two things that must stay
in every 3 x 3 prompt: the guide sentence says "a FIVE by FIVE grid, five columns and five rows,
the building fills the central 3 x 3" (den-b drew 4 x 4 without it), and the sign carries ONE flat
picture and NO letters. What may vary per building: wall and roof material, roofline, one prop
against the wall that says what is sold, and the fastening by family (§6.4). Sign pictures for
every 3 x 3 row in resources.json:

| Row (category) | Sign picture (proposal) |
|---|---|
| Warrior's Den (shop) | two crossed swords (drawn) |
| Armory (shop) | a shield with a sword behind it |
| Magic Shop (shop) | a pointed hat with a star |
| Shrine (shop) | a single lit candle |
| Castle (shop) | a crown |
| Shiro (shop) | a folded paper fan |
| Restaurant (shop) | a steaming bowl with a spoon |
| General Store (training) | a tied sack with a coin on it |
| School (training) | an open book |
| Academy (training) | a paint palette and brush |
| Laboratory (training) | a round flask with bubbles |
| Guild (training) | a hammer and chisel crossed |
| Agriculture Center (training) | a wheat sheaf |
| Factory (training) | a cog wheel |
| Adventure Camp (trainingAndShop) | a tent with a small flag |
| Hospital (crafting) | a red cross |
| Library (crafting) | a stack of three books |
| Ancient Temple (crafting) | a sun disc; the building itself is a ruin and may break the template (owner's call) |
| Bank (station) | a coin bag |
| Inn (station) | a bed |
| Post House (station) | a sealed envelope |

Restroom (shop, size 2) is a closed 2 x 2: this template shrunk, one window, a two-figure sign, not
the open-air station template.

## 4. Trees (1 x 1 sources)

**Rule (proposed)**: a tree stands on one tile and rises one full tile above it, so it is two tiles
tall (a person is one and a half); the crown may spread up to a quarter of a tile past each side of
its tile, no more, so neighbouring tiles stay readable. Guide: `tools/art/guides/tree.png` (centre
tile pale, the whole tile above it lighter, a dashed 1 x 2 box around both; `treeGuide()` in
`guides.js`). The old drawing rides along as `control-oak-tree.png` / `control-pine-tree.png` so
the tree keeps its identity (round broad oak, tiered pointed pine, short red-brown trunk).

Wording that worked (oak-b, pine-b): "exactly TWO tiles tall", "the top of the tree TOUCHES the top
edge of the lighter tile"; "no higher than the box's top" gave 1.4 to 1.5 tiles.

Renderer note for whoever wires it: `PixiRenderer.js` draws every resource as a `size x size`
square (a 1 x 1 resource is a 45 px square), so a two-tile-tall tree needs its sprite drawn 1 wide
by 2 tall, anchored on the tile's bottom edge and sorted in front of the tile above. Until that lands
the tree would be squashed into its square.

## 5. What drifted in round 1 (kept short; the fixes are in the round-2 prompts)

- Side walls came all the way forward on every station (prompt said a third); approved as is.
- Plaster vanished on both Dairies; harmless. Sails, chimney and awning poked above the footprint
  by up to a fifth of a tile (buildings get no headroom; see §6.3 for the Mill).
- den-b redrew the 5 x 5 guide as 4 x 4; "FIVE by FIVE, five columns and five rows" fixed it and
  held for all thirteen round-2 buildings. The sign covered the right window twice; round 2 names
  the fastening and "clear of the door and the window" instead of a position.
- Trees undershot the headroom until the prompt said "exactly two tiles" and "touches the top";
  retries planted the trunk a little below the tile edge (a crop, not a redraw). Oak-1 went
  fish-scale (the owner approved that one anyway). No letters on any sign in either round.

## 6. Round 2 (2026-10-20): oak colours, dead trees, the shorter pine, the Mill, thirteen 3 x 3 buildings

**Asked**: colour variations of the approved oak (two summer, two autumn from the palette); the
pine 10% shorter at the same width; a Dead Tree in brown and in black; the Mill with the machine
off-centre and a bigger windmill, drawn against the approved Dairy; and an EXPLORATION of 3 x 3
closed buildings with real architectural variety (roof material, roofline, wall material) and
signs that are visibly fastened in a way that would hold up. Cap 24 images; 22 spent.

**Generated** (job keys, all `flatter`, all gpt-image-2): `oak-summer-a`, `oak-summer-b`,
`oak-autumn-gold`, `oak-autumn-red`, `pine-tree-c`, `dead-tree-brown`, `dead-tree-black`,
`mill-b`, `mill-c`, and the buildings `den-d/e/f`, `store-a/b`, `school-a/b`, `inn-a/b/c`,
`bank-a/b/c`. Five buildings from resources.json at size 3, chosen for different purposes:
Warrior's Den (shop), General Store (training), School (training), Inn (station), Bank (station).
The Inn has no old drawing, so it was drawn from the description alone; the other four carried
their old SVG as the identity control.

### 6.1 The buildings, one by one

The matrix: four roof materials (thatch, clay tile, slate, wooden shingle), six rooflines (gable
facing the viewer, hipped, tower or turret, dormer, two storeys, overhanging upper floor on timber
brackets), three wall materials (field stone or dressed stone, plaster with timber framing,
planks) and four sign attachments (A: board on chains from a bracket bolted to the wall beside the
door; B: board on a post planted by the path; C: shutter-sized plaque nailed flat to the wall;
D: board on chains from a projecting roof beam under the eave). Every building got a distinct
combination; the columns below say what came out. "Fill" is the building's measured width x height
in tiles of its 3 x 3 square (from the non-grass pixels; the ideal is 3.0 x 3.0).

| Key | Walls / roof / roofline (as drawn) | Sign (as drawn) | Fill | Notes |
|---|---|---|---|---|
| den-d | field stone / slate / hipped with a gable and a round corner turret with a conical cap | A, crossed swords: back-plate with two bolts, arm, two chains, clear of door and window | 2.6 x 2.5 | the pilot; everything asked for arrived; arrow slit in the turret |
| den-e | planks on a stone footing / wooden shingles / gable end facing the viewer, crossed timbers at the peak, a round shield in the gable | C, plaque right of the door with nail heads | 2.6 x 3.0 | the shingles read as rounded tiles in wood brown; the shield doubles as a second sign |
| den-f | field stone / clay tile / two storeys with a dormer | D, board above the door on two chains straight into the eave, no beam end drawn | 2.4 x 2.6 | tidy but plain; the sign over the door blocks nothing |
| store-a | plaster with timber framing / clay tile / two storeys, upper floor overhanging on four brackets | A, bracket bolted at the wall's right corner, board hangs just past the wall (0.1 tile outside the square) | 2.9 x 2.8 | green door, tools, potted shrub and a shop window all carried over from the old drawing |
| store-b | planks / thatch / gable end facing the viewer, a serving window with its shutter propped open as an awning | B, post with a cross-arm on a packed-earth strip at the front right, chains, board | 2.4 x 2.9 | the most distinctive building of the set (apples and a sack on the sill, flowers, dirt strip) |
| school-a | pale plaster with stone corners / slate / hipped, bell cupola on the ridge | C, plaque right of the door | 2.6 x 2.7 | apple medallion over the door, two arched windows, three steps; the cupola top touches the square's top edge as asked |
| school-b | field stone / clay tile / gable facing the viewer with a dormer on the right and a bell in a gable niche | D, board at the left end on chains into the eave corner, no beam end | 2.4 x 2.5 | the smallest building of the set; arched windows kept |
| inn-a | field stone below, timber framing above / thatch / two storeys, overhang on brackets, chimney | A, bracket with back-plate right of the door | 2.4 x 2.9 | lantern and window box as asked; the only thatch building that does not look like the farmhouse |
| inn-b | planks / wooden shingles / gable facing the viewer with a round window and a dormer | B, post at the front LEFT, 0.3 tile outside the square | 3.3 x 2.9 | bench, two window boxes, earth strip; reads as a tavern at 45 px |
| inn-c | plaster with timber framing / clay tile / hipped, two chimneys | D, board on chains from a beam that sticks out past the LEFT END of the eave, 0.2 tile outside the square | 3.2 x 2.4 | long and low; lantern and barrel; the one D sign that actually drew a beam, but at the gable end, not under the front eave |
| bank-a | dressed stone / slate / hipped with a square corner tower and a pointed cap, stone pediment on columns over red double doors | C, plaque right of the doors | 2.6 x 2.7 | the civic look; barred arched window; three steps |
| bank-b | pale plaster with dressed-stone corners / clay tile, low pitch / two storeys, pediment, barred windows | D, board above the door on long chains into the eave, no beam end | 2.7 x 2.9 | reads as a town hall as much as a bank |
| bank-c | dressed stone / wooden shingles / gable facing the viewer with a round window, red doors with a big lock plate | A, bracket with back-plate right of the doors | 2.5 x 2.6 | compact strongroom; the shingles again read as brown tiles |

Round 1's den-a measured 2.8 x 3.1 on the same test, so round 2 is a little smaller on average
(2.4 to 2.9 of 3 tiles): the model leaves a margin inside the tan square. Not a style problem; the
asset is cut at its own bounds and scaled to the footprint when accepted, or the prompt says
"touch all four edges of the tan square".

### 6.2 What worked and what drifted

- **Architecture variety worked.** Every roof material, every roofline and every wall material
  asked for was drawn, and all thirteen keep the farmhouse's line, lit-top-shaded-front shading,
  stone and timber colours, contact shadow and camera. The village still reads as one village.
- **Sign attachment A (wall bracket) is the most reliable**: four of four drew the back-plate, the
  bolts, the arm and the chains, and the board hangs where a real one would (den-d, inn-a, bank-c,
  store-a). C (plaque) always reads as fastened, nail heads small. B (post) drew the post, the
  cross-arm and the chains, but puts the post at the plot's edge, outside the square in inn-b.
  D (eave beam) is the weakest: three of four hung the board from the tile edge with no beam end,
  and inn-c moved it to the gable end. If D is wanted, say "a horizontal beam sticks out of the
  wall under the eave, as long as the board is wide".
- **Signs at corners spill**: store-a (right), inn-b and inn-c (left) hang 0.1 to 0.3 tile past
  the square. Fixed by "the sign hangs INSIDE the building's own width" or by the renderer giving
  signs the same tolerance as tree crowns.
- **Wooden shingles read as tiles**: den-e, inn-b and bank-c drew rounded rows in wood brown that
  differ from clay tile by colour only. Either accept that (it still reads as "not thatch, not
  slate") or ask for "flat rectangular shingles with staggered joints".
- **No letters anywhere**, on any of the thirteen signs, the medallions or the plaques.
- **Nothing rose above the top edge** except school-a's cupola, which touches it as asked.

### 6.3 Trees and the Mill

- **Oak recolours**: all four kept the approved oak's exact silhouette, size (1.5 tiles tall, 1.15
  wide, trunk on the tile's bottom edge), leaf pattern and shadow; only the leaf colours changed.
  Palette sets used: summer-a `#aac525 #91b01d #70971a #599324`, summer-b
  `#599324 #518622 #43721e #3f4216`, autumn-gold `#f8c935 #e9b22a #daa025 #ad7620` (the thatch
  yellows plus wood light), autumn-red `#bd7433 #b32216 #9d1b13 #72120a` (cloth brown mid plus the
  cloth reds). The red came out a bright red rather than a russet; if a browner autumn is wanted,
  swap `#b32216` for `#98401b`.
- **Pine `pine-tree-c`**: same width and tiers as pine-b, about 5% shorter (tip half a tile below
  the box top instead of a third), trunk base 0.4 tile below the tile edge (a crop). To hit 10%,
  say "the tip ends two thirds of a tile below the top edge".
- **Dead trees**: both keep the old drawing's forked, twisted bare trunk, with crisp cracks and a
  knot hole. Brown is `#6c481f / #4f381c / #945e1d`, black `#231a18 / #3e3b35 / #58534b`. Brown is
  2.05 tiles tall and 1.1 wide (inside the quarter-tile spread rule); black is 2.3 tall because its
  trunk base sits half a tile below the tile edge (a crop; the drawn tree is about the same size).
  The brown panel's grid rows came out uneven; harmless for the cut.
- **Mill**: both retries moved the millstone off-centre (mill-b: right, with the grain and sacks
  left; mill-c: left, sacks right) and doubled the windmill. mill-b put the wheel at the left end
  of the back wall as asked; mill-c put it in the centre instead of the right end. Both now rise
  above the 2 x 2 footprint (mill-b by half a tile, mill-c by a quarter; round 1 was a fifth): a
  bigger wheel on the back wall cannot fit under the top edge. Either accept the spill (the
  renderer gives the Mill the tree treatment: sprite taller than its footprint, anchored at the
  bottom) or ask for the wheel on a post in the yard's back corner, lower than the awning.

### 6.4 Recommendation: build the 3 x 3 sub-bible from these

1. **store-a** (timber framing, clay tile, overhanging upper floor, wall-bracket sign). The town
   look: the bracket is the most believable fastening and the overhang on brackets gives every
   two-storey shop a silhouette that is not the farmhouse. Reads cleanly at 45 px.
2. **bank-a** (dressed stone, slate, hipped roof, corner tower, pediment, flat plaque). The civic
   look for Bank, Library, Hospital, School, Castle: stone and slate separate it from the shops at
   a glance, the tower is a landmark on the board, and the plaque suits a formal building.
3. **store-b** (planks, thatch, gable, propped shutter, post sign). The rustic look for the
   General Store, Adventure Camp, Agriculture Center, Guild: the open shutter shows goods the way
   the open-air stations show their work, and the post sign stands on its own earth strip.

Together they give three material families (timber frame, stone, planks), three roof materials
(clay, slate, thatch) and three fastenings (bracket, plaque, post), so every other 3 x 3 building
can be assigned to a family and drawn against its panel. den-d is the alternate for the stone
family if the owner prefers field stone and a round turret to dressed stone and a square tower.
Sign pictures: keep one board size and one picture style across all three families; the four
attachment types can stay as the family's own (bracket for timber-frame, plaque for stone, post
for planks) so a player still learns where to look per building type.
