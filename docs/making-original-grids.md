# Making original grids

Living design doc for hand-authored valley grid templates (World epic, task W-11). Started
2026-10-09. Update it every pass: the edge contracts and the log at the bottom are what the
next pass builds on.

## 1. Goal

Every valley grid (valley0, 1, 2, 3) gets its own template file. Runtime random generation of
valley grids is retired as content; the random generator stays only as a drafting aid in the
editor (Quick Generate) to jump-start a grid. A template can be edited or reset, and a player's
copy refreshes from it when the season turns.

Work in **phases across the whole valley**, not grid by grid to completion (owner, 2026-10-09):

1. **Base build.** Every valley grid that has no template gets one: geography (rivers, lakes,
   sand, lava, slate plains, the region's biome) plus the basic random elements from Quick
   Generate. No roads, towns or scenarios.
2. **Mountain ranges** across the whole valley.
3. **Towns and scenarios** (mini-towns, sets, the spreadsheet's emoji anchors).
4. **Roads**: a pavement pass across the whole valley.
5. **Trees**: smooth out repeating patterns (section 8a).
6. **River banks** across the whole valley (section 8b).
7. **Enemy balance** across the valley.
8. **Final polish.**

## 2. The one rule that overrides everything

**Existing manual template work wins.** If a grid already has a template in
`game-server/layouts/gridLayouts/valleyFixedCoord/`, its geography, mini-towns and sets stay as
they are, even where they disagree with the design spreadsheet. The spreadsheet only directs
grids that have no template yet. New work joins the existing work at its edges, never the
other way round. Never overwrite a template file without the owner asking for that grid.

## 3. Sources

- **`docs/SoE - GRID DESIGN.xlsx`** (also `.numbers`), the high-level design:
  - *OverviewLayout*: one cell per grid of the frontier, named by feature (`hauntedriver12`,
    `deadzone30`, `kingscircle101`, `🪦GraveYard1`, ...). **Sheet row − 3 = frontier row,
    sheet column − 3 = frontier column** (0-63 each). The embedded image is the master map:
    Valley Creek, Deep Woods River, King's Circle River (the ring), Sunflower Lake + Oasis,
    Troll Bridge, Fairyland, Dragon Keep, Halloween, Inferno, Demon Horn Lake, Hell's Mouth
    Lake, Haunted River; bears and wolves in the outer valley.
  - *GRIDLIST*: all 4,096 grids: `gridCoord`, type (`H` homestead, `V0`-`V3`), the anchor
    name from the overview, `Created?`, and a free-text description.
- **The existing templates.** Study them before drawing: Deep Woods River (frontier rows 18-23,
  cols 8-15, e.g. 1012135-1012154), Belmont, the abandoned Dairy island (1012336), the
  Coffee Plantation (1014204).
- **`randomValleyGridLayouts.json`**: the rarity ladder (section 7).
- **`layouts/gridLayouts/miniTemplates/`**: stamps (`valleyTown01`, `valleyTown02`,
  `demonFort01/02`, `demonPod01/02`, `BearAndHoney`, `ancientTemple01`, `volcano01`, roads,
  dungeon rooms). A stamp is a 64x64 file whose non-blank cells sit at the top-left; it is
  placed with its top-left at the chosen tile.

## 4. Coordinates

`gridCoord` = `TT FF SS GG` as a number: frontier tier, frontier index, settlement row/col
(0-7), grid row/col inside the settlement (0-7). Elsinore is `0101....`, so 1015166 is
settlement (5,1), grid (6,6). Frontier row = settlement row × 8 + grid row; frontier column =
settlement col × 8 + grid col. Rows grow south, columns east. One parser on the client:
`Utils/gridsVisitedUtils.parseGridCoord`.

## 5. How a template becomes a grid (what the files must satisfy)

- File: `valleyFixedCoord/<gridCoord>.json` = `{ tiles[64][64], resources[64][64],
  tileDistribution, resourceDistribution, enemiesDistribution? }`, the editor's `toLayout()`
  shape. `tiles[row][col]` and `resources[row][col]` hold layout keys (`GR`, `WA`, `OT`, `nB`,
  ...; `**` = none). Row is y, column is x.
- `utils/createGridLogic.js`: a fixed file is used verbatim. **Every tree, rock, doober and
  enemy must be drawn**: nothing is filled in at runtime, and `enemiesDistribution` is NOT
  spawned for fixed layouts (it and the other distributions are bookkeeping for the editor).
  NPCs (enemies, spawners, citizens) are read from `resources` by their `npc` category.
- A player's copy is made from the file on their **first entry** to that cell
  (`utils/gridResolver.resolveCellGrid`), and caught up at the season turn. A new or changed
  file therefore reaches a player only for cells they have not entered yet, or after a reset
  / season turn. In Winter the creation turns grass to snow.
- The server reads the files from disk: a template is live on the production site only after
  it is committed and pushed to `main` (the deploy). Locally, the dev server reads it at once.
- **Validity.** A resource may only sit on tiles its `validon<letter>` flags allow
  (`tuning/resources.json`). The ones that bite: Rocks and Stone only on slate; Clay Pit only
  on clay; Mushroom and Tulip only on moss (`ZZ`), so a grid that should have them needs moss
  patches; Daisy on grass; Bones not on grass; Spiders not on grass; Ghosts may cross water.
- **Footprints.** Buildings and big props have a `size` (Library 3, Fountain Large 2, Big Dead
  Tree 2, Mountain 3, Mountain Large 4, Volcano 8, Big Statue 7). The anchor tile is the
  **bottom-left** of the footprint; the cells up and to the right must stay empty. The editor
  may put `Stub` (`xx`) on those cells; the game strips Stubs at creation.
- Regions are set per grid in the editor's World tab, on the template instance in the
  database; per-player copies inherit them. A cell with no template instance gets no region.

## 6. The editor (VVGame Editor, `tools/editor`, port 8770)

- **Layouts**: open or create a file in `valleyFixedCoord` / `miniTemplates` / `town` /
  `dungeon` / `homestead`. Brush tiles and resources, ⚡ Quick Generate (a random row of
  `randomValleyGridLayouts.json`: keeps water and pavement, regenerates the rest),
  distribution sliders with Generate (blanks only / overwrite all), resource Regenerate / Add,
  Populate random enemies, and "Place mini template…" (stamps at the selected tile, top-left).
  Saves go through `/api/local/*` (validated, one `.bak`).
- **World**: the frontier as a grid of cells. ✅ marks cells with a saved layout, yellow cells
  exist in the database, red tint = has a region. Select one or many (shift-click, drag) to
  open its layout, create or reset the live grid, or assign a region. Every live write asks
  first. Tile view shows the template layouts stitched together, which is the quickest way to
  check edges.
- **Dungeons**: dungeon templates and their entrances (`layouts/gridLayouts/dungeon`). More
  dungeons are a separate World task (W-12).

## 7. Rarity ladder (from the random layouts)

Deeper valley = rarer, richer doobers. Per grid, roughly:

| | valley1 | valley2 | valley3 |
|---|---|---|---|
| Trees | Oak 1500 + Pine 300 (~45% cover) | Oak 1300 + Pine 900 (~55%) | Pine 2000-2500 + Oak 300-400 |
| Ground | grass 73, dirt 22, slate 5, clay ~1 | grass 80, dirt 15, moss 3, slate 1-2, clay 1 | grass 93, dirt 3, moss 4 |
| Rocks / Stone | Rocks 20-40; Stone heavy only in stone grids | Rocks 5-15 | none |
| Rosemary | 10-20 (100 in the coyote grid) | 5-30 | 25-50 |
| Daisy | 1-5 (30 in the daisy grid) | 20-25 (50 in the daisy grid) | 6-30 |
| Mushroom / Tulip | 1-2 each, themed grids only | 10-30 / 8-12 | 8-20 / 1-10 |
| Feverfew | none | 3-5 | 16-30 |
| Precious | none | Honey 3-6, Silver 2-4, Garlic 2-3, Ancient Coin 1 (rare) | Silver 5-10, Gold 1-2, Aged Wine 3, Ancient Coin 1 |
| Enemies | Coyote 4-12, Bear 2-12 (+ spawners) | Ogre, Ghost, Zombie, Spider (+ spawners) | Ogre (rare) |

The spreadsheet adds "fields": mother lodes of potion herbs that move every season; not in
the templates (a later system).

## 8. Style, learned from the owner's grids

- Rivers meander, 7-12 tiles wide, continuous across grid edges, with the odd island; banks
  carry slate patches and a few dead trees. Lakes cover whole grids where the map says so.
- Roads are single-tile pavement (`PA`), slightly wobbly, linking towns, crossings and edges.
- Ground is grass with a speckle of single dirt tiles (~20%), slate and moss in clumps.
- Forest is dense with organic clearings; dead trees mark sad or haunted places.
- A **set** is a small place with a story built from existing pieces: the abandoned Dairy on a
  lake island (Dairy, Cow, Animal Stall, Cheese, a hidden Gem), the Coffee Plantation.
  Sets reward the explorer with a few precious doobers, and sit apart (an island, a clearing).
- Mini-towns are the `valleyTown` stamps with a road to them.

### 8a. Known problem: tree patterns (phase 5)

Quick Generate's placement can leave visible lines: a long row of trees with no break next to a
long row with no trees, which reads as a straight seam. In phase 5, scan every template for long
straight runs of solid trees or of open ground (rows, columns, diagonals) and break them up
(thin the run, add a clearing or a stray tree) so the forest reads as organic. Record what was
changed per grid.

### 8b. River banks (phase 6)

Every river and lake needs banks: a river running straight through grass looks wrong. Banks are
sometimes dirt, sometimes sand, sometimes slate, and should change organically along the river
(a sandy stretch giving way to slate, then dirt), a few tiles wide and ragged, not a uniform
stripe. Done once across the whole valley in phase 6. **Leave alone** any bank where a town, a
landing, a causeway, any other man-made structure or a scenario touches the water.

### 8c. Randomness across neighbours

Quick Generate rows must be well spread: no row repeated in edge-adjacent grids (and avoided in
diagonal neighbours where the choice allows), and overall usage kept balanced across a valley
type, so the same outcome never runs several grids in a row.

### 8d. Mountain ranges (phase 2)

Owner's rules (2026-10-09):

- Ranges **block travel completely**: no way through, not even by boat (a hot-air balloon may come
  one day). Every tile of a range's band is covered by a mountain footprint; because players may
  step diagonally between two blockers, a band with a gap at a corner is a door.
- **Mix 'Mountain' (3x3) and 'Mountain Large' (4x4)**: large ones in the middle of a thick range,
  small ones along the edges. Organic, not perfect (1011153 is a good example).
- Mountains stand on **dirt or slate, or a mixture**: dirt in grassy country, slate in
  slate-heavy country (the Inferno, Halloween), or slate where the owner asks (the King's Circle
  north bank range). A ragged fringe of the same ground round them. A range along a river may run
  right down to the water (`fillToWaterTiles`).
- Ranges **funnel** players into a few access points, above all towards the Oracle in the centre
  of the continent.

How (`tools/gridgen/mountains.mjs`, ranges in `data/mountains.json`): each range is a crest line
with a half-width that tapers to the tips; large mountains pack the core, small ones the band, then
a seal pass covers every band tile left (footprints may overlap; no footprint swallows another
anchor; every footprint stays inside its own grid, so each side of an edge seals itself; never on
water). Generated grids get ranges inside `phase1_build.mjs`, so rebuilds keep them. An owner grid
is only extended on request, with `phase2_owner_patch.mjs`: new footprints only on grass, dirt,
slate, moss or clay, clearing only trees; his mountains, doobers, NPCs and buildings stay.
`check_ranges.py` proves each range sealed (a search across the band in 8 directions, tips
excluded) plus any `checks` boxes in `data/mountains.json`.

**Seams (owner, 2026-10-09).** Where a range continues from one grid into the next, the mountains
and their ground run on across the shared edge: no strip of grass and resources at the seam.
`mountains.mjs` lines every grid edge the band reaches with mountains first and lays the ground
solid within 4 tiles of an edge; `seam_fix.mjs` then reconciles both sides of every edge (a
mountain covering one side's edge tile gets a partner on the other side). Only each grid's
mountains **as built** drive a fill, never another seam fill, and placements that overhang the
other side's edge are penalised, so a seam is exactly as wide as the range (owner: the mountains run
for the width of the range, not along the whole seam). `phase1_build.mjs` runs it for generated grids on every `--write`; owner grids get it from
`node tools/gridgen/seam_fix.mjs --owner --loose-owner` (trees, rocks, doobers may go; never water,
roads, cobbles or snow; sand and lava keep their ground), to be re-run after any owner grid is
restored or re-patched. A range of the owner's that genuinely ends at a grid edge (nothing on the
other side) is left alone. `check_seams.py` lists every edge still covered on one side only.
Placement only ever clears tiles no mountain covered yet, so overlapping footprints never erase an
anchor.

## 9. Method (how Claude builds a section)

The basics of every grid (deposit clumps of slate, clay and moss, the tile mix, resource
quantities, enemies) come from **the editor's own Quick Generate**, not from a hand-rolled
generator (owner, 2026-10-09). Quick Generate keeps water and pavement and regenerates
everything else, so the order is:

1. **Pick the section.** List the cells from the spreadsheet, confirm their types against the
   live settlements, check which already have templates (they win; join their edges), and
   check nobody has entered the cells yet (a player's copy would hide a new template).
2. **Geography first, on one canvas.** `tools/gridgen/<section>_geo.py` draws the whole section
   (several grids wide) and writes, per grid, a base of **water and pavement only**, plus the
   hand-made overlays (towns, sets, landings: forced tiles and resources) and named areas.
   Rivers and roads are seamless across grid edges by construction.
3. **Quick Generate.** `tools/gridgen/<section>_qg.mjs` imports
   `tools/editor/client/layouts/GridModel.js` and runs its real `quickGenerate()` on each base:
   a `randomValleyGridLayouts.json` row for the grid's valley type sets the clumps, tile mix,
   resource quantities and enemies, exactly as the Layouts tab button does. The row is random
   among the valley type, unless a set wants its themed row (spider row under a spider set).
4. **Re-stamp the sets** on top, clearing what Quick Generate put in their footprints. Template
   resources may be **moved** into a set (Honey into a bee meadow, Thread into the webs), never
   added; counts stay the template's. Set loot (scrolls, a coin) is the set's own addition.
5. **Enemies.** Fixed templates spawn nothing at runtime, so what is drawn is what the player
   meets. Per the brief, template enemies are kept only in the grids meant to have enemies
   (moved into the set's area there) and dropped elsewhere.
6. **Flavour, lightly.** Count-neutral touches only (e.g. some riverbank trees become Dead
   Trees on a haunted river).
7. **Validate and dry-run.** Every placement against `validon` and footprints; the files through
   `generateFixedGrid` / `generateFixedResources` and the encoders. Scripts are seeded, so they
   regenerate their files exactly.
8. **Render** (`mosaic.py <row0> <row1> <col0> <col1> out.png [scale] [dir]` in frontier
   rows/cols, `render.py`, `ascii.py <file> [r0 r1 c0 c1]`), record the edge contract
   (section 10) and the log, then write only files that do not exist yet.
9. The owner plays them; feedback lands in the log.

## 10. Rivers and edges

Rivers through generated grids are drawn once, valley-wide, from `tools/gridgen/data/rivers.json`
(segments: `spline` with an optional slow wobble, `meander` = a Kinoshita curve fitted between two
points, irregular in sweep and pace; `oxbows` placed automatically beside a meander segment with
at least 10 tiles of land between them and the channel; `terminal` = the small pond-and-creeks
system a river ends in). Seams cannot occur between generated grids because they share one
drawing. Where a generated grid meets an owner's template, the 2-3 tiles at the edge copy his
edge exactly and lakes lean towards his water and away from his land.

**Rule for regenerating**: a generated file is Claude's only while it is byte-identical to what
was written (sha1 in `data/phase1-manifest.json`). As soon as the owner saves it (editor, any
change) it is his: marked `ownerEdited` and never regenerated (first case: 1012544, edited
2026-10-09). Quick Generate rows are pinned in the manifest so a rebuild changes only the grids
whose geography changed.

## 11. Log

### 2026-10-09: first pass, Haunted River (South-West), six grids

Frontier rows 46-47, cols 14-16 (settlements (5,1) and (5,2)). Scripts
`tools/gridgen/haunted_river_02_geo.py` then `haunted_river_02_qg.mjs`. A first version built
with a hand-rolled generator was replaced the same day by the Quick Generate method (section 9).

| gridCoord | Type | Template row | Contents |
|---|---|---|---|
| 1015166 | valley1 | valley1LayoutClay | Haunted River enters from the west and bends south; dead trees on the banks; the Old Ferry Landing (sand, crates, barrels, sacks, a flag) at the end of Landing Lane. 12 Coyotes dropped |
| 1015167 | valley1 | valley1LayoutBear | The town: `valleyTown02` in a clearing, Landing Lane west and Ferry Road south. 16 bears / spawners dropped |
| 1015260 | valley2 | valley2Layout2 (chosen) | Bee meadow: a clearing round two old hollow trees (Big Dead Trees) with the row's 6 Honey and 15 of its Daisies moved in; moss herbs in the woods |
| 1015176 | valley1 | valley1LayoutDaisy | The river's long bend, dead trees on the banks, the row's 30 Daisies. 12 Bears dropped |
| 1015177 | valley1 | valley1LayoutClay | **The Drowned Scriptorium** (new set): the river widens into a mere; on its island a ruined cloister (broken stone walls, cobbled floor, the cloister well) with Stacks of Books, a monk's Bed and Chairs, Scrolls, Ink, Books and the abbot's Ancient Coin; the monks' graveyard on the island's east tip (3 tombstones = Ghost Spawners, 3 Ghosts, Bones). A stone causeway from Ferry Road; Garlic by the causeway as a hint. 12 Coyotes dropped |
| 1015270 | valley2 | valley2LayoutSpider2 (chosen) | Spider hollow: a dirt and dead-tree clearing holding the row's 10 Spider Spawners, 8 Spiders and its Thread (17 placed) |

Enemies: only 1015177 (the set's ghosts) and 1015270 (the spider row's spiders, all in the
hollow). Ghosts are a valley2-level enemy in a valley1 grid on purpose (the river is haunted);
they can cross the water.

Open for the owner's evaluation: ghost difficulty at that depth; dropping template enemies outside the set grids (the brief) vs keeping them; 18 spider NPCs in one hollow; whether the town should be
`valleyTown01` / a smaller bespoke hamlet; forest density; regions (none assigned: these cells
have no template instance in the database yet).

### 2026-10-09: phase 1, base build of the whole valley (1,915 grids)

Every valley cell that had no template now has one: 1,127 valley1, 535 valley2, 253 valley3
(2,304 valley templates in all, 389 of them pre-existing and untouched). Script
`tools/gridgen/phase1_build.mjs` (seeded; reads `data/live-cells-2026-10-09.json`,
`data/overview-labels.json`, `data/rivers.json`); per-grid record in
`tools/gridgen/data/phase1-manifest.json` (feature, Quick Generate row, water, enemies). Map:
`tools/gridgen/valley-after-phase1.png` (1 px per tile; regenerate with `valley_map.py`).

What it did and the calls made:

- **Live types are the truth.** The spreadsheet's 64 "V0" cells are valley1 in the live
  settlements and 64 of its "V3" cells are valley2; the live type picked the Quick Generate rows.
- **Rivers.** Valley Creek, Deep Woods River and King's Circle River already live in the owner's
  templates and none of them leaves a water edge open towards an empty cell, so they were not
  redrawn (a first attempt that followed the spreadsheet's King's Circle cells drew a second ring
  beside the owner's). Only the **Haunted River** was built: hand-set control path
  (`data/rivers.json`) from the valley's west edge into 1015166 and from 1015177 on to the
  south edge, pinned exactly to the pass-1 grids.
- **Lakes** (Demon Horn, Hell's Mouth, Sunflower): smooth fields, not cell rectangles; the
  shore leans towards the owner's water and away from his land along shared edges. The 6 new
  Sunflower Lake cells sit behind a shore the owner closed, so they were not flooded (his shore
  wins).
- **Biomes**: Oasis sand (a few palms), Inferno lava with slate rims, slate plains with Rocks,
  all as smooth fields that run across cell edges and copy the owner's lava/sand edge for two
  tiles. Several Inferno grids are solid lava, as the owner's own Inferno core grids are.
- **Halloween dead zone** (valley2 cells labelled deadzone): Graveyard / Zombie / Spider rows only,
  a third of trees dead. Ghosts/GraveYard anchors take the Graveyard row. Elsewhere in valley2 the
  undead rows (Graveyard, Zombie1, Zombie2) are not used, so ghosts and zombies stay in Halloween.
- **Randomness (§8c)**: no two edge-adjacent grids share a row (0), diagonal repeats 3 of 1,915;
  usage balanced (each valley1 row ~140, valley2 ~56, valley3 ~25).
- **Enemies**: kept as the rows place them (13,911 NPCs valley-wide); balance is phase 7.
- Edges: water meets the owner's edges exactly (2-3 tile band; 58 tiles corrected); 8 small
  water runs on template edges with nothing to continue got a natural cove.
- Not done (later phases): mountains, roads, towns, scenarios (the emoji anchors, Sunflower
  fields), banks, tree patterns, regions.

Notes for the owner: three of these cells already had player copies from the old random
generation (1011121, 1011136, 1011241); those players see the new template after a reset or the
season turn. The template folder is now ~120 MB (each new file ~41 KB minified).

### 2026-10-09: phase 1 iteration, the Haunted River

Owner's notes: wider (the widest river in Elsinore, much wider than Deep Woods River); not ruler
-diagonal; must not cut off the south-west homesteads (nobody should need a boat to explore the
valley); turn north near 1016267, then east and down, ending around 1016355 in a little water
system like 1012304 (a town goes there later, not yet); two meandering stretches like Deep Woods
River (1012152, 1012153); one or two oxbow lakes.

Done: width 18-28 tiles (Deep Woods ~8-12), narrowing to 12 at the end; enters from the west
edge at 1015100, meanders twice (rows 41-43 and 49-51), runs through the pass-1 grids, turns north
at 1016267, then east and down into a pond with five creeks and a small island in 1016355. It no
longer reaches the south edge, so the south-west can be walked round its east end. Oxbows at row
41.1 / col 9.7 and row 48.9 / col 17.4 (separate water bodies, checked). The six pass-1 grids were
rebuilt on the wider river (town, causeway and Scriptorium kept; the Old Ferry Landing moved to
the new east bank). 1012544, edited by the owner after the commit, was restored and is protected.

### 2026-10-09: phase 1 iteration, Hell's Mouth Lake

Owner's note: zoomed out, the lake should read as a devil's grin, corner to corner; organic,
not perfect; the footprint across the grids was about right.

Done: Hell's Mouth is now a drawn shape (`shapes` in `data/rivers.json`, replacing the generic
lake fill for its cells): water between an upper and a deeper lower lip that pinch to pointed tips
curling up towards the owner's thin band in row 50 (his upper lip), opening into his water on the
right where it already crossed down, with two triangular land fangs hanging from the upper lip;
3-tile ragged banks. The owner's cells (row 50 cols 40-50, row 51 cols 42-46) are untouched; 22
generated grids changed.

### 2026-10-09: phase 1 iteration, Demon Horn Lake

Owner's note: shaped roughly like a demon: a couple of horns at the top, a head and body, and a
tail wandering off at the bottom with a barb on the end; same footprint, recognisable without
being precise. (He liked the grin, especially the long skinny peninsula at 1016632: backlog W-13,
a new character's hut there.)

Done: Demon Horn Lake is a `parts` shape in `data/rivers.json` (ellipses, tapered strokes and
polygons, minus land islands): two tapered horns curving up and out, a round head with two
slanted land islands for eyes, a narrow neck, shoulders and a body tapering into the owner's own
pointed water at 1015663 (46,51), and a tail that leaves the lower right of the body, sweeps down
and curls back to an arrowhead barb near row 48.5. The body is kept off the owner's slate cells at
(42,48-49) so no shore runs straight along their edge. Owner cells untouched; 51 generated grids
changed.

### 2026-10-09: phase 1 iteration, Star Lake and the Haunted River's east fork

Owner's note: balloon the Haunted River where it crosses the corner of 1015154 (with 1015144,
1015145, 1015155) into a big lake with a roughly star-shaped island in the middle; plain valley1
trees and resources for now, a scenario later. Fork a second branch off the lake's south-east
that heads east, meandering, and ends at 1015241 with much smaller tributaries, like 1011203.

Done: Star Lake is a `parts` shape (about 110 tiles across, ragged shore) with a five-pointed star
island (outer radius 24 tiles, inner 10) centred on the corner at row 45, col 13; islands now clear
water even where the main channel was drawn first. The east fork is a second river in
`data/rivers.json` (10-14 tiles wide, narrowing to 5): out of the south-east shore, a meander east,
then a small pool in 1015241 that fans into seven thin rivulets, most of them forking again half-
way (terminal style `rivulets`). The main Haunted River runs on unchanged (pilot water identical).
12 generated grids changed; owner cells untouched. Scenario for the star island: phase 3.

### 2026-10-09: phase 2 starts, Prospero's Range (the C)

Owner's brief: extend the range that rings Prospero's home (1013320) north-east for many grids,
curving east, and south-west for many grids, curving south, into a big C with Prospero at its
centre, ending at 1013305 (east tip) and 1013266 (south tip), so players must go round it one way
or the other.

Done: two arms in `data/mountains.json` (half-width 12 tiles in the middle, 4 at the tips, dirt
ground), across 14 generated grids. 1013320 is the owner's: with his go-ahead to extend his range,
`phase2_owner_patch.mjs` filled the margin between his ring and the grid's east and south edges
(9 large + 70 small mountains on trees only; his snow clearing, Prospero, his own mountains,
doobers and NPCs untouched; his committed file is the fallback). Checks: both arms sealed, and no
path crosses Prospero's grid from north-west to south-east; Prospero is still reached from outside
the C through his west entrance, not from inside.

### 2026-10-09: phase 2, King's Circle north bank range

Owner's brief: a range along the north bank of King's Circle River from 1015321, hugging the river
closely, to 1015337, ending on the north bank above the little town; organic, with mountains
bleeding further inland in a couple of places.

Done: the crest was traced from the real north bank (about 10 tiles inland of the northmost water,
every quarter grid), half-width 3-7 tiles on dirt, leaving a ragged 2-4 tile strip of bank along
the water; two inland spurs (near col 26 and col 29.3). The river runs through the owner's grids,
so with his go-ahead `phase2_owner_patch.mjs` extended nine of them (1015320-1015322,
1015332-1015337: trees cleared, nothing else of his changed; the town in 1015336 sits inside the
river loop, south of the water, untouched). 7 generated grids changed. All ranges re-checked:
sealed. `data/mountains.json` now lists `ownerPatched` grids; the patch refuses to run twice on one.

Iteration (same day): owner asked to hug the river even closer and use slate, not dirt, under the
mountains. The crest now sits about 8.5 tiles inland of the northmost water and the range has
`fillToWaterTiles: 3` (`mountains.mjs`): land within 3 tiles of both the band and the water joins
the band, so the mountains run right down to the river with no walkable strip (this also closed a
gap by the town's loop that the seal check caught). Ground SL for the range and both spurs. The
nine owner grids were restored to his committed versions and re-patched (1,096 new mountain
anchors, all on slate; nothing of his but trees changed); all ranges re-checked sealed.

### 2026-10-09: phase 2, The Swoop (a second C)

Owner's brief: another C, lower-left tip at 1014337, heading east, then curving up and north-east to
end at 1014403; a swooping C, not a diagonal; grass under the mountains (no dirt or slate).

Done: `data/mountains.json` "The Swoop" (half-width 12 tiles in the middle, 4 at the tips, ground GR),
all in generated grids; it opens to the west and passes east of the spreadsheet's 🫅 anchor at
(33,34), which stays free for its scenario. Sealed.

### 2026-10-09: phase 2, seams between grids

Owner: wherever a range continues between two grids (e.g. 1015333 / 1015334), the edge must not be
grass with resources and no mountains; mountains and their dirt or slate continue across. Fix it
everywhere in the frontier.

Done: frontier-wide, mismatched edge tiles went from 694 (91 grid edges) to 234 (40 edges), of which
216 are 26 places where one of the owner's own ranges genuinely ends at a grid edge (left alone,
listed by `seam_fix.mjs`) and 18 are single tiles where the only possible mountain would stand on a
road, water or something that must stay. All ranges re-checked sealed. Owner grids touched by the
seam pass: the ten already opened to Claude's ranges plus 23 more (`data/mountains.json`
`seamFixed`); in them only trees, rocks and doobers were cleared (146 non-tree items: Daisies,
Mushrooms, Rosemary, Rocks, Stone, Bones, a few Clay Pits, Honey, a Silver and a Potion A).

### 2026-10-09: the east fork kept out of the pilot grids

Owner: the east fork's water ended at the bottom of 1015157 and 1015250 without continuing into
the grids south of them (the pilot grids 1015167 town and 1015260 bee meadow, made earlier and not
redrawn); leave those alone and contain the river in 1015157 and 1015250.

Done: the fork starts a quarter grid further north and its meander wavelength went from 170 to
200 tiles (same 108 degree sweep), found by a search over shapes; all its water now stays at least
14 tiles above row 46. No fork water falls in 1015167 or 1015260 (checked against
`pilot-water.json`), so the pilot grids need no rebuild.

### 2026-10-09: seams as wide as the range

Owner: at 1014337 | 1014430 the range crosses at its own width, but at the border mountains ran the
whole length of the grid edge. Cause: the seam pass cascaded (each seam mountain covered a tile or
two past the range, which the next round matched on the other side, and so on along the edge).
Fixed in `seam_fix.mjs`: fills are driven only by the mountains as built, and the placement that
matches the other side's edge exactly is preferred. Rebuilt cleanly (owner grids from their
committed versions, re-patched, re-seamed). 1014337 | 1014430 now covers rows 28-49 on both sides.
Frontier-wide: 7 stray tiles left, plus the owner's 10 genuine range ends.

### 2026-10-09: organic slate edges in the south-east

Owner: in the bottom of settlement 4_5 and much of 5_5, large slate regions end in straight lines
(grid edges, grid-sized steps) with no transition into grass or dirt; make them organic like the
SW of 5_5. The hard edges where water canals separate slate from lava are intentional: leave them.

Done with `tools/gridgen/slate_blend.mjs` (frontier rows/cols 30-55):
- Every tile is classed slate / land by a 7x7 majority (grass is flecked with slate, so single
  tiles say nothing); water, lava, sand, roads and snow are neither, so a canal is never an edge.
- A boundary is straight where 15 of 21 tiles along it sit within 2 tiles of one line; runs of 24+
  tiles become lines (29 lines, 1737 tiles of edge). Already organic edges (the SW of 5_5) are left.
- Near a line (30 tiles, tapering 14 past its ends) the class field is domain-warped by noise up to
  22 tiles: slate pushes into the grass and grass into the slate. New ground takes the region's own
  resource mix (grass ~50% oak/pine and a few herbs, slate ~5% Rocks and ~2% Stone). Slate is never
  pulled across water or lava; tiles holding anything but a tree, rock or doober are never changed.
- 14,694 tiles changed in 67 grids, 27 of them the owner's: only slate/grass/dirt swapped, only
  trees, rocks and doobers replaced (audited against the phase-1 commit).
- The class field and lines are stored (`data/slate_class.bin.gz`, `data/slate_seams.json`), so
  `phase1_build.mjs --write` re-applies the same blend to Claude's grids; a second rebuild changes
  nothing. Ranges re-checked sealed; mountain seams unchanged (163).

A first, gentler version of this blend (straight grid-edge seams only) went out in commit 581fa588;
this replaces it. A first attempt at a frontier-wide detector caught texture as edges (1.5M tiles)
and was rolled back before anything was committed.

### 2026-10-10: lava islands of dirt and stone; lava down to the river

Owner: in 1014571, 1015511 and 1015427 the land surrounded by lava has no grass: all dirt and
stone. Keep the rule that lava always meets the land through stone, then dirt (not grass) inside.
In the lower part of the lava field, 1015435 to 1015530, the lava must reach the river's north bank
with a little stone between lava and water.

Done with `tools/gridgen/lava_rules.mjs` (re-applied by `phase1_build.mjs --write` to Claude's
grids after the slate blend; the owner's grids keep what was written once):
- River: per column from 1015435 to 1015530, land between the lava field and the first water below
  becomes lava (ragged top where it cuts under land, ragged west end); new lava within 2 tiles of
  water becomes stone (the shore); a 2-tile stone rim spreads from the new lava through land only.
  The peninsula in 1015427 is now cut off from the bank and became the third island.
- Islands: land wholly enclosed by lava that touches the three grids: within 2 tiles of lava stone,
  the rest dirt (grass, moss and clay become dirt; trees kept, grass-only doobers redrawn).
- The owner's river grids changed: 1015434 (56 tiles), 1015435 (2314), 1015436 (1264), 1015437
  (1206), 1015530 (1393), 1015531 (6). Eight of his NPCs stood on the new lava and were moved to the
  nearest free land tile of their own grid: 1015435 Ogres (11,24)->(0,38), (13,22)->(32,40), Bears
  (15,31)->(28,43), (16,29)->(30,43), (18,33)->(27,44); 1015437 Spider (23,6)->(7,20), Spider Spawner
  (56,15)->(52,19); 1015530 Spider (62,13)->(34,40).
- Where a meander's inner strand runs north into the new lava, the land beside it became a thin
  stone shore too (the stone-between-lava-and-water rule).
- Ranges sealed, seams 163, rebuild is a fixed point (second rebuild changes nothing).

### 2026-10-10: the settlement 5_2 dirt between the rivers, slate at the King's Circle gap

Owner, in two steps the same day: (1) from 1015241 north-east, the gap between the Haunted River and
the King's Circle should be a natural slate region over most of settlement 5_2, a land bridge
leading into the King's Circle gap at 1014276; then flow it through his grids too, all the way to
1014267 ("my grids have awkward seams"). (2) Then change the concept: the frontier lacks a big dirt
region, so the whole region between the rivers is dirt with some grass here and there, turning to
slate at the gap so that the areas just north and south of it are fully slate; leave the vampire
grid (1014265) alone and blend back into the grassier grids above.

Done with `tools/gridgen/ground_regions.mjs` and `data/ground_regions.json` (two regions, the slate
one lying over the dirt one; `phase1_build.mjs --write` re-applies them to Claude's grids, the owner's
grids are painted once with `--owner`; a second rebuild changes nothing):
- Dirt between the rivers: corridor from the Haunted River's east-fork terminus in 1015241 to the
  gap, swelling to two grids half-width, plus six blobs over most of 5_2 and the land west of the
  King's Circle river; grass islands deep inside; a speckled 10-tile transition into the grass.
- Slate at the gap: from fr41 (the top of the owner's old strip) through 1014276 to 1014266 and
  1014267, a smaller wobble, a few dirt patches; it fades into the dirt to the south and into the
  grass of fr37 to the north.
- Deep inside a region trees and bare ground are redrawn from the region's own mix (dirt ~48% oak
  and pine; slate ~5% Rocks, ~2% Stone, ~1% dead trees), so the field has one texture whatever each
  grid's base had.
- Owner grids painted (open ground only; NPCs, buildings, water, roads untouched; audited):
  1015205, 1015206, 1015207, 1015216, 1015217, 1015226, 1015227, 1015236, 1015246 (dirt, the old
  straight slate strip with its dirt margins gone back to the region or to grass), 1014275,
  1014276, 1014277, 1014266, 1014267 (slate; leftover straight slate blocks in 1014266/1014267
  outside the region went back to grass). The vampire grid 1014265 and every other owner grid are
  untouched; next to them the regions keep 8-30 tiles off the seam unless the owner's edge already
  shows the region's ground.
- 56 of Claude's grids carry the regions. Ranges sealed, seams 163.
- Follow-up (owner: 1014267's southern transition was a straight slate line): the owner's slate rim
  on the north shore of the King's Circle lake (1014277, 1014370) filled the top row of those grids
  while 1014267 and 1014360 above were grass. A third, small slate region now bulges north from the
  rim across that seam into 1014267 and 1014360, tapering at both ends.
- Follow-up (owner: the grass patches looked like a golf course, too manicured): islands and patches
  are now soft. Their edge is ragged (a finer noise on top), grass fades into dirt over a ramp
  instead of a cut line, ~18% dirt is speckled through the grass and ~4% grass flecks the dirt.
