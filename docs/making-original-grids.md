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

## 10. Edge contracts (water crossing tiles, for the next grids to meet)

Tile ranges are inclusive, 0-63, along that edge of the named grid.

| Grid | Edge | Water tiles | Joins |
|---|---|---|---|
| 1015166 | W | rows 15-23 | 1015165 (Haunted River upstream, not built) |
| 1015166 | S | cols 29-38 | 1015176 |
| 1015176 | E | rows 34-43 | 1015177 |
| 1015177 | S | cols 22-33 | 1016107 (Haunted River downstream, not built) |

Roads: Landing Lane leaves 1015167 westward into 1015166 near row 31 and ends at the Old
Ferry Landing on the river; Ferry Road runs from the town in 1015167 south across the
1015167/1015177 edge (cols ~24-26) to the causeway. No road leaves the block yet.

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
