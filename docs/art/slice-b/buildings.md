# Slice B, buildings lane (2026-10-19)

Status: CANDIDATES, nothing approved. Ten images spent of the fourteen allowed (about 85k tokens,
all gpt-image-2 medium, 45 to 97 s each). Job: `tools/art/jobs/slice-b-buildings.json`; run with
`node tools/art/generate.js --job slice-b-buildings --style elsinore --models openai`, sheet with
`node tools/art/sheet.js --job slice-b-buildings`. Candidates and sidecars live under
`tools/art/_candidates/slice-b-buildings/` (gitignored, regenerable from the sidecars).
New guide: `tools/art/guides/tree.png`; new controls: `tools/art/guides/control-{dairy,mill,warriors-den,oak-tree,pine-tree}.png`
(the old SVGs rendered on parchment, `guides.js`, additive).

## For the owner to approve

Open `tools/art/_candidates/slice-b-buildings/sheet.png` (every candidate at 512 px plus its 90 px
and 45 px board thumbnails). The files, by building:

**Dairy, 2 x 2 open-air crafting station (the template, two draws of the same prompt)**
- `tools/art/_candidates/slice-b-buildings/exploration/openai/flatter-dairy-a-1.png`
- `tools/art/_candidates/slice-b-buildings/exploration/openai/flatter-dairy-b-1.png`

**Mill, 2 x 2, same template (proof it holds across two stations)**
- `tools/art/_candidates/slice-b-buildings/exploration/openai/flatter-mill-1.png`

**Warrior's Den, 3 x 3 closed shop with a hanging picture sign**
- `tools/art/_candidates/slice-b-buildings/exploration/openai/flatter-den-a-1.png` (thatch roof, strict farmhouse materials; my pick)
- `tools/art/_candidates/slice-b-buildings/exploration/openai/flatter-den-b-1.png` (clay-tile roof; grid misread, sits on 2 x 2; reference only)
- `tools/art/_candidates/slice-b-buildings/exploration/openai/flatter-den-c-1.png` (clay-tile roof, grid fixed, retry of b)

**Oak Tree and Pine Tree, 1 x 1 sources with one tile of headroom**
- `tools/art/_candidates/slice-b-buildings/exploration/openai/flatter-oak-tree-1.png` (1.5 tiles tall, fish-scale leaves)
- `tools/art/_candidates/slice-b-buildings/exploration/openai/flatter-oak-tree-b-1.png` (1.7 tiles tall, big clusters; my pick)
- `tools/art/_candidates/slice-b-buildings/exploration/openai/flatter-pine-tree-1.png` (1.4 tiles tall, narrow)
- `tools/art/_candidates/slice-b-buildings/exploration/openai/flatter-pine-tree-b-1.png` (2 tiles tall; my pick)

### Decisions needed

1. **The crafting-station template, as drawn.** Dairy a and b and the Mill all came out the same
   way: a stone back wall with a thatch awning along its top, two stone side walls coming all the
   way forward (not a third of the way, as the prompt asked), no front wall, packed-earth floor with
   flagstones, the product big in the middle. Approve that shape, or say what to change (shorter
   side walls? plaster on the back wall, which only the Mill drew? no awning?). Whichever Dairy you
   approve becomes the sub-bible panel every other station is drawn against.
2. **The sign style.** Proposed: one square plank board on two short chains from a black iron
   bracket, one flat two-tone picture, no letters, same board and bracket on every building.
   Placement needs your call, because "above the right-hand window" collided with that window twice
   (den-b, den-c): proposal is door in the centre, ONE window on the left, the sign on the right
   where the second window would be, hung from the roof's edge. Den-a is the look to approve.
3. **Roof material per building.** Den-a keeps the farmhouse's thatch (strict "one style"); den-c
   swaps in clay tiles and still reads as the same village. Thatch everywhere, or is a roof swap
   allowed as a per-building identity cue? My recommendation: thatch for the first batch, revisit
   when the whole town is on the board.
4. **Tree headroom.** Proposed rule: one full tile above the tile (two tiles tall, taller than a
   person's one and a half), crown up to a quarter tile past each side. Oak-b (1.7 tall, 1.4 wide)
   and pine-b (2.0 tall, 1.0 wide) are the candidates to judge it on. Say yes to the rule, or pick
   half a tile instead (then oak-1 and pine-1 are already close to that).

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
   headroom for buildings: nothing rises above the top tile (chimneys and sails tried to; see §5).
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

**Prompt-ready paragraph** (den-a was made with it, except for the sign placement, updated below
after den-b and den-c put the sign on the window):

> CLOSED-BUILDING TEMPLATE, shared by every 3 x 3 shop in this game: the farmhouse in the FIRST
> attached image built bigger: the same golden thatch roof with its wooden ridge beam, the same stone
> chimney, the same stone-and-plaster front wall on a stone foundation course, the same dark wooden
> door with an iron ring placed in the middle of the front wall, and one shuttered window to the LEFT
> of the door. Same outline, shading, lower-right contact shadow and colours: this building stands in
> the same village. SIGN: a square wooden signboard hangs on two short chains from a black iron
> bracket fixed under the roof's front edge to the RIGHT of the door, where a second window would be,
> covering neither the door nor the window, facing the camera, with ONE simple flat painted picture
> on it and NO letters: [this building's picture].

Then the identity sentence (old drawing, keep its cues, template wins) and the building3.png guide
sentence, which must say "a FIVE by FIVE grid, redraw all five columns and five rows, the building
fills the central 3 x 3" (den-b redrew the guide as 4 x 4 without that; den-c obeyed it).

**Proposed sign style**: one square plank board (grain visible, dark outline), on two short chains
from a black iron bracket, always the same size (about a quarter of the building's width) and the
same place (right of the door, under the roof edge), with one flat two-tone picture. Same board,
same bracket, same spot on every building, so a player learns "look right of the door" once. Never
letters, on any building.

What may vary per building besides the picture: the wall mix (more stone, as the Den), the roof
material if allowed (decision 3), and one prop against the wall (a barrel, a crate) that says what
is sold. Sign pictures for every 3 x 3 row in resources.json:

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
edge of the lighter tile", "FIVE OR SIX big crisp leaf clusters, not many small leaves". The first
wording ("rises up through the lighter tile to no higher than the box's top") gave 1.4 to 1.5 tiles.

Renderer note for whoever wires it: `PixiRenderer.js` draws every resource as a `size x size`
square (a 1 x 1 resource is a 45 px square), so a two-tile-tall tree needs its sprite drawn 1 wide
by 2 tall, anchored on the tile's bottom edge and sorted in front of the tile above. Until that lands
the tree would be squashed into its square.

## 5. What drifted and why

- **Side walls came all the way forward** on all three stations (prompt said a third of the way).
  The model treats the "U" as the natural cut-away. Looks fine and reads at 45 px; keep or fix by
  describing the walls as "waist-high stubs at the back corners".
- **Plaster vanished** on both Dairies (all-stone back wall); the Mill drew it. Harmless, but if the
  farmhouse match matters say "cream plaster between grey stone, as the farmhouse".
- **Things poke above the footprint**: the Mill's sails (about a fifth of a tile), the Den chimney
  (den-a, about the same), the Dairy awning (a hair). Buildings get no headroom, so either the
  prompt says "the chimney top and the sails stay below the square's top edge" or the renderer gives
  buildings the tree treatment. Not a style problem.
- **den-b redrew the 5 x 5 guide as 4 x 4** and put the building on a 2 x 2. Fixed in den-c by
  spelling out "FIVE by FIVE, five columns and five rows". Add that to the 3 x 3 guide sentence.
- **The sign covered the right window** in den-b and den-c; den-a got lucky by hanging it from the
  thatch above the window. Hence the "one window left, sign right" proposal.
- **Trees undershot the headroom** at first (1.4 to 1.5 tiles): "no higher than" reads as a ceiling,
  not a target. The retries used "exactly two tiles" and "touches the top" and got 1.7 and 2.0.
  Both retries also planted the trunk a little below the tile's bottom edge (0.1 to 0.3 tile); the
  asset is cut by its own bounds and anchored at the trunk base, so that is a crop, not a redraw.
- **Oak-1 went fish-scale**: hundreds of small leaves instead of clusters, against the flatter
  rule. Naming a count of clusters fixed it.
- Nothing text-shaped, no letters on any sign. gpt-image-2 held the farmhouse's materials, line and
  shadow across all ten; the identity cues from the old SVGs (milk bottles, sails, sword sign, tree
  shapes) all carried over.
