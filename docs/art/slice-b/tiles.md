# Slice B, the TILES lane: how the ground gets the new look

Status: PROPOSAL for the owner, 2026-10-19. Nothing in the game changed. Companion to
`../../art-pipeline-plan.md` (§4, §4b, §5, §6b) and the ground-tile bullet in `CLAUDE.md`.

## For the owner to approve

**Look at** (all under `tools/art/_candidates/slice-b-tiles/`, gitignored, regenerable from the sidecars):

- `composite.png`: one row per sample. Left to right: the full 4 x 4 panel, the same panel at
  90 px per tile (a 2x phone) and at 45 px (desktop), a 6 x 6 board built from the sixteen cut
  tiles shuffled (this is what the game would actually show), the same board at 90 px, one cut
  tile repeated 2 x 2 (the seam test), and today's flat tile colour for comparison. Rows:
  `grass`, `dirt` (came out sand-yellow; keep it as a SAND candidate), `dirt-brown` (the retry,
  real earth), `stone` (flagstone paving), `edge-grass-dirt` (a grass-to-earth boundary).
- `sheet.png`: the standard contact sheet (panel + 90 px + 45 px per sample).
- Spent: 5 of the 6-image budget on gpt-image-2 (medium, 1024 px), 36.7k tokens, 42 to 73 s each.
  One image is still in reserve.

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
