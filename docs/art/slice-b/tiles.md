# Slice B, the TILES lane: how the ground gets the new look

Status: PROPOSAL for the owner, 2026-10-19; round 2 samples added 2026-10-20. Nothing in the game changed. Companion to
`../../art-pipeline-plan.md` (§4, §4b, §5, §6b) and the ground-tile bullet in `CLAUDE.md`.

## For the owner to approve

**Look at** (all under `tools/art/_candidates/slice-b-tiles/`, gitignored, regenerable from the sidecars):

- **Round 2 (2026-10-20, answers the owner's five notes): `composite-round2.png`**, same layout
  as below, rows `grass-2`, `dirt-2`, `dirt-3`, `slate`, `cobble-2`, `cobble-3`, `pavement`,
  `sand`, plus a last swatch with each sample's mean colour next to today's flat colour. The
  panels themselves are `exploration/openai/flatter-<name>-1.png`. Details in "Round 2" at the
  end. Spent 8 of 10; 2 in reserve.
- Round 1: `composite.png`: one row per sample. Left to right: the full 4 x 4 panel, the same panel at
  90 px per tile (a 2x phone) and at 45 px (desktop), a 6 x 6 board built from the sixteen cut
  tiles shuffled (this is what the game would actually show), the same board at 90 px, one cut
  tile repeated 2 x 2 (the seam test), and today's flat tile colour for comparison. Rows:
  `grass`, `dirt` (came out sand-yellow; keep it as a SAND candidate), `dirt-brown` (the retry,
  real earth), `stone` (flagstone paving), `edge-grass-dirt` (a grass-to-earth boundary).
- `sheet.png`: the standard contact sheet (panel + 90 px + 45 px per sample, both rounds).
- Round 1 spent 5 of 6 images on gpt-image-2 (medium, 1024 px), 36.7k tokens, 42 to 73 s each.

**The one decision: which approach for the ground.** Recommendation: **(c) the hybrid**:
generated raster tiles for the base ground, served from the atlas, with today's procedural
corner rounding kept for transitions (drawn with the neighbour's raster instead of a flat
colour), and generated edge strips only where a drawn contact earns it (grass over earth,
grass over water). Reasons and the build order are at the end. Nothing is approved until the
owner says so; the five panels are samples, not bible panels.

## What exists today, in plain words

**How a tile gets its look.** `game-client/src/UI/Styles/tileColors.js` holds one flat colour per
tile type (14 letters; 11 appear in the layouts: grass 6.3 M cells, dirt 1.7 M, slate 520 k,
water 480 k, lava 160 k, sand 150 k, moss 74 k, pavement 19 k, dungeon 13 k, clay 10 k,
cobblestone 9 k; snow and the two TBD tiles are unused). `Render/PixiRenderer/PixiRendererTileTextures.js`
paints each look onto a 64 x 64 canvas in code: fill the flat colour, then hand-coded details
(grass: three or four dark tufts and sometimes a yellow clump; dirt and sand: specks and a
pebble; slate: Y-shaped cracks; moss: clumps; snow: blotches and sparkles; pavement and
cobblestone: bevelled stone blocks over a grass background). Water, lava, clay and dungeon are
the flat colour and nothing else. Each type has 8 variants (fixed seeds); a cell's variant comes
from its row and column, so the same canvas is reused all over the grid.

**What the rounding signature does.** Organic types (grass, snow, moss, sand, dirt, clay, slate,
lava, water) have a priority order (grass highest, water lowest). For each of a cell's four
corners, if the two edge neighbours at that corner are both the same OTHER type and that type
outranks this cell (or surrounds it diagonally), a quarter-circle of the neighbour's flat
colour (radius 20 % of the tile) is painted into that corner. Net effect: a dirt path through
grass, or a pond, gets rounded corners; grass is never rounded; pavement, cobblestone and
dungeon never round. The signature is four slots (top-left, top-right, bottom-left,
bottom-right), each "nothing" or a neighbour type, and it is part of the texture cache key.

**Budgets.** One grid is 64 x 64 = 4,096 tile sprites, pooled across grid changes. The cache key
is type + variant + signature, so a grid uses ~200 shared 64 px textures (16 KB of GPU memory
each, ~3 MB total), built on the main thread with Canvas 2D the first time each look is needed
and cleared on grid change. Sprites are added grouped by texture; Pixi batches up to 16
textures per draw call, so the ground costs a dozen or so draw calls. `window.__tileStats`
reports sprites, textures and build time in dev.

**Screen sizes.** Close zoom is 45 CSS px per tile (90 device px on a 2x phone, 135 on a 3x
iPhone); closer zoom is 75 (150 / 225); farish 25; far 14. Today's 64 px canvases are already
upscaled on phones at close zoom, which is why the ground looks a little soft there.

**The atlas.** `game-client/scripts/build-atlas.js` packs rasterised SVGs and Twemoji into 2048 px
sheets (slots of 128, 256, 512 or 768 px with a 2 px gutter; frame = slot minus gutter), six
sheets today, 356 frames, ~2.5 MB of WebP to download, and each sheet decodes to 16 MB of GPU
memory (~96 MB already). It accepts SVG sources; a PNG source needs the ten-line pass-through
branch the plan already describes. The last sheet (`world-5`, 147 small frames) has room for
roughly 90 more 128 px slots.

**Phone constraints.** GPU memory is the thing iOS Safari kills tabs over, so every extra
2048 sheet (16 MB) has to be earned; texture uploads on grid change cause hitches; and the
45 px rule: detail drawn at 1024 px is 1/5.7 of its size at 45 px, so anything finer than
about 6 px in the panel is noise on the board.

## What the samples show

- **Grass** holds the bible exactly (it is the same grass the farmhouse and the stump sit on).
  At 45 px it is a near-flat green with faint tufts, which is the Graveyard Keeper board
  look; at 90 px the tufts read. Seam score 1.18 (see below): the cut tiles interchange freely.
  Weakness: the tufts fall into a regular rhythm (two per tile, similar positions), which over a
  big field reads as a faint repeat. Mitigation: use all 16 cuts as variants and rotate them
  (grass has no light direction; 4 rotations x 16 = 64 looks for free).
- **Dirt (first try)** came out sand-yellow with glossy droplet pebbles. Wrong for earth, but a
  plausible SAND tile (the game's sand is `#e0ca24`). Mean colour `#e1b24c`.
- **Dirt-brown (retry)** is real packed earth with matte clods and outlined pebbles, mean
  `#815326`, darker than today's dirt `#c98f59` and darker than the "brighter" grade wants.
  Pebbles become specks at 45 px, fine. A second retry with "lighter, warmer ochre" would likely
  land between the two; that is the reserve image if the owner wants it now.
- **Stone** is good flagstone paving in the farmhouse's chimney grey (mean `#8c867e`): outlined
  stones, lit tops, mortar. Five or six stones per tile means ~8 px stones at 45 px: readable,
  but busy, and at the 25 px farish zoom it is grain. A retry with "three or four stones across
  a tile" is the obvious nudge. The model kept the stones inside each guide cell, so every cut
  tile is a complete slab; seams measure 1.27.
- **Edge** did what was asked: the boundary sits on the guide's column line, the grass side has
  a thin dark outline and overhanging blades, the earth side a narrow shadow. The overhang
  crosses the tile line by a few px, so an edge is a PAIR of tiles (grass-with-right-edge and
  earth-with-left-shadow), not a single transition tile. At 45 px the edge is a crisp dark
  line with a hint of blades; it reads clearly.
- **Seam score** (`seams.json`, computed by the composite script): the colour difference
  across the joint between two cut tiles, divided by the texture's own column-to-column grain.
  1.0 means a seam is no more visible than the texture itself; above ~2 a line shows. Grass
  1.18, stone 1.27, dirt-brown 1.45, sand-dirt 3.3 (its fill is so flat that the thin grid
  line at every edge is the only "grain", so the score overstates it; the 2 x 2 wrap shows the
  truth). The model does NOT make true wrap-around seamless tiles and does not need to: cutting
  on the drawn grid lines gives 16 near-interchangeable tiles, and the thin line hides the rest.
- **Grid lines.** Every panel carries a thin dark line on tile edges because the bible panels
  do. Today's board has none. Keeping them gives the visible build-grid the owner liked in the
  Graveyard Keeper frames; dropping them is one sentence in the prompt. Owner's call; the
  samples keep them.

## The options

### (a) Keep the procedural canvases, restyle them to the palette and the look

Change `tileColors.js` to the palette's grass, earth and stone (the mean colours above are
the starting values), raise the canvas to 128 px, and redraw the details in the bible's
language (tufts as outlined blade clusters with one highlight, pebbles as outlined shapes
with a lit top and a shaded lower-right, flagstones as outlined slabs with mortar).

- Atlas memory: none. Download: none. Draw calls: unchanged (a dozen or so). GPU: ~200
  textures x 64 KB = ~13 MB at 128 px (or stay at 64 px, 3 MB, soft on phones).
- Work: 1 to 2 days of hand-written drawing code per pass over six detailed types; every
  future look change is code again, not a regenerate.
- Honest limit: at 45 px grass is nearly flat either way, so (a) can get close for grass. For
  earth and stone the bible's shapes (outlined clods, slabs with mortar) are what the model
  draws well and code draws badly; and the props are painted on the model's grass, so the
  contact between a stump and procedural grass will never quite match. This option keeps the
  ground outside the pipeline the rest of the art lives in.

### (b) Generated raster tiles through the atlas, transitions generated too

Per type, one 4 x 4 panel (plus a retry) cut into 16 tiles of 256 px, downscaled to 128 px (a
2x shrink also cleans the model's micro-noise), 8 to 16 kept as variants, packed as
`tiles/<type>-<n>` frames. The tile sprite loop stays as it is, with the texture coming from
the atlas instead of a canvas.

- Atlas memory: 11 types x 8 variants = 88 frames at 128 px = 5.6 MB of GPU, which fits in the
  free space of `world-5` (no new sheet); at 256 px it is 22 MB, a sheet and a half. Download:
  ~150 to 300 KB of WebP. Draw calls: ONE for the whole ground if every ground frame sits on one
  sheet, down from a dozen; the 4,096 sprites and the pooling stay.
- Images: ~2 per type for 11 types, ~22 images, a few dollars.
- Transitions are the cost. Generated edges are per PAIR and per orientation: grass next to
  dirt, water, sand, slate, moss, pavement, cobble; dirt next to water, slate, sand; and so on.
  Even the eight pairs that matter are 8 x 4 edges + 8 x 4 outer corners + 8 x 4 inner
  corners = ~100 frames, each needing its own guide and a retry budget, and each one a seam risk
  against both neighbours. Nothing today draws inner corners at all. This is the "autotile"
  road, and for 11 types on a solo project it is too much art for too little gain.
- Work: the PNG branch in `build-atlas.js`, a `tools/art/tiles.js` cut-check-accept step, the
  renderer swap (half a day), then the transition set (days, mostly waiting on generations).

### (c) The hybrid: raster base from the atlas, procedural corners, a few generated edges

Everything in (b) for the base tiles, and the existing corner rounding kept exactly as it is,
except the quarter-circle is clipped and filled with the NEIGHBOUR'S raster tile instead of
its flat colour. That is done inside the existing per-look canvas cache (base = drawImage of
the atlas frame; corner = clip, drawImage of the neighbour's frame), so the cache key, the
signature logic, the sprite pool and the grouping all stay, and `__tileStats` still reports.
Then, as a second step, generated edge PAIRS only for the contacts that deserve a drawn lip:
grass over earth (the sample), grass over water, perhaps grass over sand; everything else
keeps the rounded-corner transition it has today.

- Atlas memory: the 88 base frames (5.6 MB at 128 px) plus ~6 to 12 edge frames. GPU at
  runtime: the ~200 composed looks at 128 px = ~13 MB, like (a) at 128 px, with the option of
  moving to pure atlas sprites later (one draw call) once the corner pieces are cut as frames.
- Draw calls: unchanged in step one (a dozen); one call is reachable in a later step without
  any new art.
- Images: ~22 for the bases, ~2 to 6 for the edges.
- Work: half a day for the base path, half a day for the raster corners, a day for the edge
  pairs including the guide for a corner (not drawn yet; the reserve image is for it).

| | (a) procedural restyle | (b) raster + generated transitions | (c) hybrid |
|---|---|---|---|
| Atlas added | 0 | 5.6 MB GPU (128 px), ~100 extra transition frames | 5.6 MB GPU + ~10 frames |
| Download added | 0 | ~0.3 to 0.6 MB | ~0.2 to 0.3 MB |
| Ground draw calls | ~12 | 1 | ~12 now, 1 later |
| Images | 0 | ~120 | ~30 |
| Code | 1 to 2 days per look change | ~1 day + days of transitions | ~2 days once |
| Matches the props' painted ground | no | yes | yes |

## What the generator needs (built for the samples, to be promoted)

- Guides, in `tools/art/guides.js` (done): `patch4.png`, sixteen identical pale cells at 256 px
  each, which tells the model "one ground type, every square, edge to edge" and makes the cut
  land on the atlas's 256 px slot; `edge4.png`, two green columns and two tan, for a straight
  edge. Still to draw: a corner guide (a 2 x 2 earth block in grass) for outer corners.
- The prompt recipe, in `tools/art/jobs/slice-b-tiles.json` (done): the ground type described
  in the bible's words, "fill ALL sixteen squares", "ground only" (no props, no shadows, no
  characters), "draw the faint grid lines as thin tile edges exactly where the guide has them",
  and the repeat clause ("the left edge must continue into the right edge ... no vignette, no
  lighting gradient, no feature that only appears once"). The model obeys the guide to the
  pixel, which is what makes the cut clean.
- The tiling check (in the scratch composite script, to become `tools/art/tiles.js`): cut on
  the 256 px grid, compute the seam score above, flag anything over 2.0, write a 2 x 2 wrap
  and a shuffled board at 45 and 90 px to the contact sheet, downscale to 128 px, and on accept
  write `public/assets/tiles/<type>-<n>.png` plus the type's mean colour into `tileColors.js`
  (the minimap, the CSS `--tile-*` variables and the editor keep using the flat colour).
- Not yet decided: whether tiles keep the drawn grid line; whether sand reuses the first dirt
  panel; water and lava (flat today; a still raster first, animation is a renderer job later).

## Recommendation and build order

**(c), the hybrid.** The samples show the model paints the ground in the bible's own hand with
almost no prompting, the cut tiles interchange at seam scores near 1, and 88 frames at 128 px
fit in the atlas's existing free space; meanwhile the corner rounding already solves most
transitions and only needs its fill swapped from a colour to a raster. Full generated
transitions (b) multiply the art by the number of type pairs for a difference that the 45 px
strip barely shows, and the restyle (a) keeps the ground outside the pipeline and off the
props' painted grass.

1. **Owner picks** the approach, says keep or drop the grid line, and nudges the three types
   (stone: fewer stones; earth: lighter; sand: keep the first dirt as sand or not). Spend the
   reserve image on whichever nudge matters most, or on the corner guide.
2. **`tools/art/tiles.js`**: cut, score, downscale, contact sheet, accept to
   `public/assets/tiles/`, mean colour into `tileColors.js`. Promote the seam score from the
   scratch script.
3. **`build-atlas.js`**: the PNG pass-through branch and a `tiles/` namespace at 128 px slots.
4. **Renderer, step one**: `generateTileTexture` draws the atlas frame as the base and the
   neighbour's frame into the rounded corners; everything else untouched. Verify with
   `__tileStats` that textures per grid stay ~200 and build time does not rise.
5. **Generate the rest of the types** (slate, water, sand, moss, lava, clay, pavement,
   cobblestone, dungeon), two images each, through the same job file.
6. **Edge pairs**: grass over earth and grass over water, with the corner guide; wire as a
   second layer in the same canvas composer, gated on the signature.
7. Later, with Phase 4: cut the corner pieces as frames and go to pure atlas sprites (one draw
   call), or the one-RenderTexture-per-grid route the client review already lists.

## Round 2 (2026-10-20)

**What was asked** (`art-pipeline-plan.md` §7c): grass with smaller tufts and today's subtle
yellow dots and rare white dots (accents, never flowers); dirt without the big pebbles,
subtler, near today's `#c98f59`; SLATE first, the in-game flat grey `#97968b` with some cracks;
cobblestone kept but with thinner seams (smaller scale impression) and subtle moss; a new
PAVEMENT of large man-made tiles near `#f5bf89`. Budget 10 images.

**What changed in the method.** The pale guide let round 1 pick its own colour (sand for dirt),
so `tools/art/guides.js` now also writes `guides/patch4-<type>.png`: the same 4 x 4 grid
pre-filled with today's `tileColors.js` colour (dirt, slate, cobble, pavement, sand, grass). The
prompt names the hex and says "keep exactly that colour as the base". The model obeyed it every
time: every mean colour below is within a few units of the target. Grass kept the pale guide
because round 1's grass colour was already the bible's. Subjects are in `slice-b-tiles.json`
(`grass-2`, `dirt-2`, `dirt-3`, `slate`, `cobble-2`, `cobble-3`, `pavement`, `sand`; `grass-3`,
an even subtler grass, is written but NOT generated: grass-2 did not overshoot).

**Spent:** 8 images on gpt-image-2 (medium, 1024 px), 59.1k tokens, 59 to 121 s each; one network
failure (`dirt-3`, not billed) was re-run with the same command. 2 images in reserve.

**Per type, against the owner's notes** (mean colour measured from the panel; palette score =
share of the panel's pixels within delta E 10 of one of the 52 palette colours, `--no-key` so
the whole panel counts; the seam score is the round 1 one, 1.0 = invisible, above ~2 a line):

- **Grass (`grass-2`)**, mean `#77ab14`, palette 99.9%, seams 2.45. Tufts are now three or
  four short blades, roughly a third of round 1's size, two or three per tile, and the tiny
  pale yellow-green dots and the rare white dot are there, all small enough that nothing reads
  as a flower. At 45 px the board is a near-flat green with faint flecks, which is today's
  look. The seam score rose from 1.18 because the fill is flatter (less grain to hide the
  thin grid line); the 2 x 2 wrap shows no visible seam. Closest of the eight to its note.
- **Dirt (`dirt-2` and `dirt-3`)**, means `#ca8a49` and `#c98a4f` against `#c98f59`, palette
  99.9% and 99.4%, seams 2.5 and 3.4. Both are the right colour (a hair darker and less pink
  than today; the model keeps a little of the bible's ochre). `dirt-2` still draws its clods
  as small outlined cloud-shaped blobs: subtle, specks at 45 px, but shapes. `dirt-3` asked
  for no outlined shapes at all and got calm trodden earth: grain, soft darker smudges, tiny
  specks, nothing that reads as a stone. `dirt-3` matches the note; `dirt-2` is the fallback.
- **Slate (`slate`)**, mean `#989484` against `#97968b`, palette 99.9%, seams 6.57. A flat
  grey slab per tile with a thin branching Y crack on nine of the sixteen and two or three
  faint specks on the rest: the in-game slate, redrawn in the bible's hand. The seam score is
  high for the same reason as round 1's sand (a flat fill has no grain, so the grid line is
  the only "seam"); the 6 x 6 board shows no joint beyond that line. Four cracks run off a
  tile edge and will stop dead against a neighbour; at 45 px a crack is a one-pixel line and
  it does not show, but the atlas cut should prefer the twelve tiles whose cracks stay inside.
- **Cobblestone (`cobble-2` and `cobble-3`)**, means `#a5a077` and `#a59a72` against
  `#acaa89`, palette 83.1% and 94.8%, seams 1.33 and 1.12. Both have five or six cobbles
  across a tile with hairline seams, so the scale reads smaller than round 1's stone at the
  same cobble size. `cobble-2` has a glossy rim on every cobble and bright yellow-green moss in
  most seams (it is what dragged its palette score down: the moss and the rim are not palette
  colours). `cobble-3` is matte, with muted dusty-green moss in about one seam per tile; at
  45 px it is a fine khaki cobble with the odd green fleck, at 90 px the moss reads as moss.
  `cobble-3` matches "thinner seams, subtle moss"; `cobble-2` is the louder alternative.
- **Pavement (`pavement`)**, mean `#f1b77c` against `#f5bf89`, palette 96.1%, seam score
  46 (meaningless here: the fill is dead flat, so the joint IS the texture, by design). One
  large slab per guide square, eleven of the sixteen; the other five are split once into two
  rectangles, so the shuffled board makes a plausible worked-stone pavement with T-joints.
  Each slab has a thin outline, a lit top edge, a shaded lower-right edge and a hairline chip on
  about one in four: the new type the owner asked for.
- **Sand (`sand`)**, mean `#eccb17` against `#e0ca24`, palette 46.6% (the only poor score: the
  palette has no yellow this saturated because the bible panels have no sand; the two thatch
  yellows are the nearest), seams 3.77. Clearly sand: fine grain, soft wind ripples, tiny light
  specks, no pebbles. The ripples all run left to right, so a rotated variant would break the
  pattern and should not be used. The colour is today's and it is very bright next to the
  grass; if that is a problem the fix is the target hex, not the prompt.

**What I would change next.** Spend the two reserve images only on an owner's nudge, in
this order of likely value: (1) grass-3 if grass-2's tufts still read on the phone (prompt
already written); (2) a sand retry at a less saturated target (`#e0ca24` is the loudest tile on
the board; something like `#e4c75a` would sit with the palette's thatch yellows). Not worth an
image: the slate's four edge-running cracks (cut around them), cobble-2 (cobble-3 supersedes
it). Then the build steps in "Recommendation and build order" stand, with one addition: the
coloured guide becomes the standard for every remaining type (water, lava, moss, clay,
dungeon), each with its `tileColors.js` hex, since it is what fixed the colour drift.

## Built (2026-10-20): the tiles are in the game

Owner's picks: the approved grass, dirt and sand (slice-b-tiles), and the whimsical painterly
slate, cobblestone and pavement (whimsical-tiles). The hybrid, step one, is live:

- `tools/art/tiles.js` cuts each approved 4 x 4 panel into sixteen 128 px tiles at
  `game-client/public/assets/tiles/<type>-<i>.png`, inset by the drawn grid line (pavement is
  cut with no inset: its joints ARE the grid lines, by design). `tiles.json` records sources
  and each type's mean colour; `tileColors.js` adopted those means for g, d, n, s, x, p so the
  minimap, gridlines and the procedural fallback match the art.
- `build-atlas.js` has a `tiles/` namespace (128 px slots) and a PNG pass-through.
- `PixiRendererTileTextures.generateTileTexture` draws the atlas cut as the base when the type
  has one (sixteen cuts picked by a position hash) and the procedural canvas otherwise, so
  types without cut tiles (snow, water, moss, lava, clay, dungeon) are unchanged. The renderer
  re-composes the ground once the sheets land (`atlasTick`), destroying the interim procedural
  textures inside the tile effect, where every pooled sprite is reassigned before a frame
  renders (destroying them earlier left sprites on dead textures for one frame: a Pixi
  `uvsFloat32` crash, found and fixed on the first run).
- Measured on Oberon's homestead (64 x 64, winter): 4,096 sprites, 225 textures, 16 ms.

### The edging strategy (how one type meets another)

The well-known options for a 2D tile game are (1) a full transition tile set per type pair
(Wang or blob tiles, 16 to 47 pieces per pair; the most art, the most control), (2) a
priority "overlay" system where the higher type draws its edge pieces over the lower one
(Stardew, RPG Maker autotiles: a few pieces per TYPE, not per pair), and (3) procedural
corner rounding, which is (2) with the pieces drawn at runtime. The game already has (3),
and it is kept, with these rules:

- **Priority decides who grows over whom.** `CORNER_PRIORITY` in
  `PixiRendererTileTextures.js`: grass 100, snow 90, moss 80, sand 70, dirt 60, clay 50,
  slate 40, lava 30, water 20; pavement, cobblestone and dungeon 0. The higher type always
  wins the corner. **Grass is the top, so grass grows over everything** and its own corners
  are never cut.
- **Only organic types grow.** A corner is filled only when the filler is organic (grass,
  sand, dirt, snow, moss, water and so on). Man-made types never bulge into a neighbour, so
  pavement against cobblestone is a straight joint. New in this change: man-made types now
  RECEIVE organic neighbours (grass rounds into the corners of a pavement square), which the
  old code skipped; "grass grows on top of everything" means on top of the paving too.
- **When a corner is cut.** A cell's corner is filled when both orthogonal neighbours at that
  corner are the same higher-priority organic type, or when that type also holds the
  diagonal (the cell is surrounded). Single-tile contacts along an edge stay straight, which
  reads as the lower ground running under a rounded lobe of the higher one.
- **Corners are rounded** (a quarter circle of radius one fifth of the tile) and filled with
  the neighbour's OWN cut tile, not a flat colour, with a faint shadow along the arc so the
  higher ground reads as sitting on top. Types without cut tiles fill with their flat colour,
  as before.
- **What this does not do yet:** a drawn lip (the grass-over-earth edge pair from round 1)
  and straight-edge transitions along a whole side. Both are the next step if the rounded
  corners alone read as too soft; they slot into the same composer, gated on the signature,
  with no change to the cache key scheme.
