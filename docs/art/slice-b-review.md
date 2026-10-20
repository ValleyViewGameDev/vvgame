# Slice B review: what to look at and decide (2026-10-19 overnight run)

Five lanes ran in parallel against the locked bible (`tools/art/styles/elsinore/`, the twelve
approved slice A panels). Each lane wrote its own doc with a "For the owner to approve"
section at the top. This page is the reading order and the decision list. Nothing below is
approved until you say so; every generated file is under `tools/art/_candidates/` (gitignored,
regenerable from its sidecar). Spend tonight: 21 images on gpt-image-2 (buildings 10, tiles 5,
NPC parts 6), roughly $2.50; palette and lighting spent nothing.

## 1. Palette (no spend) `docs/art/slice-b/palette.md`

Look at `tools/art/styles/elsinore/palette-card.png`. 52 colours in 15 material groups,
extracted from the bible; all twelve bible panels score 84 to 98% on-palette, so the palette
describes the art rather than constraining it. The palette has an editor sheet (Sheets, Art
palette) that works with no editor change.

Decide: hard palette for board and deco, soft for characters and animals (recommended);
`#231a18` as the one shared outline colour; prune the 14 greens to 3 grass plus 4 foliage.

## 2. Buildings and trees (10 images) `docs/art/slice-b/buildings.md`

Look at `tools/art/_candidates/slice-b-buildings/sheet.png`, then the picks:
`flatter-dairy-a-1` (the crafting-station template), `flatter-mill-1` (the template held on
a second station), `flatter-den-a-1` (3x3 closed shop, thatch, hanging crossed-swords board),
`flatter-oak-tree-b-1`, `flatter-pine-tree-b-1` (one tile of headroom).

My read: the open-air cut-away template came out stable and recognisable on the first try,
and the Dairy's milk churn, cheese and bottles read at 45 px. The Den is the farmhouse scaled
up with a sign, which is exactly the rule. Two drifts to rule on: the stations' side walls run
the full depth instead of a third, and the Mill's sails and the Den's chimney poke a fifth of a
tile above the footprint, so buildings either get told to stay inside or get the trees'
headroom treatment in the renderer.

Decide: approve the template as drawn or change it (side-wall length, plaster, awning); the
sign style and its placement (door centre, one window left, sign right); thatch everywhere or
roof material per building; tree headroom of one full tile (two tiles tall).

## 3. Tiles (5 images) `docs/art/slice-b/tiles.md`

Look at `tools/art/_candidates/slice-b-tiles/composite.png`: each sample at full size, at 90
px and 45 px per tile, as a shuffled 6x6 board, and the wrap seam test, beside today's flat
colour. Grass matches the bible and reads clean at 45 px; stone is good flagstone but too busy
at 45 px (5 to 6 stones per tile, wants 3 to 4); the first dirt came out sand and is kept as a
sand candidate; the retry is real earth but darker than the bright grade.

Decide: the approach. Recommended: hybrid, generated raster base tiles cut from 4x4 panels and
served from the atlas (88 frames, fits the existing sheets), with today's procedural corner
rounding kept and filled with the neighbour's raster, and drawn edge strips only where a
contact earns it (grass over earth, grass over water). Also: keep or drop the thin grid line
every panel carries.

## 4. NPC parts (6 images) `docs/art/slice-b/npc-parts.md`

Look at `tools/art/_candidates/slice-b-npc-parts/layering-strip-tinted.png`: the approved
Gertrude, her base body, the robe as a layer, the hair as a grey layer tinted brown, and the
three stacked. The layering works. Two facts the lane established: gpt-image-2 refuses
transparent output (only gpt-image-1 has it), so layers are keyed off a flat background, which
the closed dark outlines make clean; and a part drawn alone drifts to frame scale, while a part
drawn WORN on the base and then subtracted keeps its placement within 3%. The rig was measured
from both approved fronts: they agree from eye line to shoulders and belt and differ in leg
length (3.0 heads versus 2.7), so one female and one male rig with a shared feet line
(`docs/art/slice-b/_body.v2.json`, a draft, not yet installed).

Decide (D1 to D7 in the doc): the frame (256 x 384, one by one and a half tiles, recommended);
same height for both bodies; which base body and regenerate it at the lightest skin tone; a
non-white undershift or a doll body; worn-then-subtracted as the part route; the slot list
(body, bottom, shoes, top with coversLegs, hand as the held item); the tint palette becomes
relative to a near-white lightest swatch.

## 5. Dynamic lighting (no spend, no code) `docs/art/slice-b/lighting.md`

One mechanism for both grading and darkness: a half-resolution light map cleared to the
grid's ambient colour, with additive light sprites drawn in, shown through one full-viewport
multiply sprite placed below the overlays so bubbles and text stay readable. Moods live in a
`tuning/lighting.json` sheet keyed by grid kind; emitters are three columns on the resource
row plus an emissive mask the generator extracts from a reserved palette swatch. No dynamic
shadows, no blur filters. 24 to 34 hours over three slices; a six-hour proof of concept on
dungeon `d001` with its 193 lava tiles as lights needs no new art.

Decide (D1 to D6 in the doc): time of day fixed per grid mood first; night darkens homesteads
with a 0.45 floor; the light map over a colour-matrix filter; no dynamic shadows; the emissive
swatch pair; the proof-of-concept grid.

## What happens after your answers

Approvals move into `_candidates/<job>/approved/` with `tools/art/approve.js`, the chosen
Dairy and Den become the sub-bible panels, the palette and tile decisions feed `check.js` and
`tools/art/tiles.js`, and the rig decisions install `_body.v2.json`. The lighting proof of
concept is renderer work and can start independently of the art.
