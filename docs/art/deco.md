# Deco in the whimsical style (2026-10-22)

Deco carries no function (the art director's brief, `buildings-bible.md` §0): it only has
to look good, sit in the painterly style, and make players want to place it. First batch
commissioned and approved 2026-10-22.

## The rules

- **Square-on camera.** Every prop is drawn in the game's camera (top-down three-quarter)
  and SQUARE-ON: its front face parallel to the bottom edge of the image, never turned at a
  diagonal (owner, 2026-10-22: the first hay bale was drawn on the diagonal and re-ordered).
  The sentence is in every deco prompt of `tools/art/jobs/deco-whimsical-r1.json`; keep it in
  every new one.
- **The BARREL is the camera reference for every prop** (owner, 2026-10-24): the game's camera
  drifts between prompts, some props coming out very front-facing and others very top-down.
  The approved barrel (and most of the buildings) is the right angle: mostly from the front, a
  little from above, the top showing as a narrow ellipse. Attach `painterly-barrel-1` as the
  FIRST ref of every prop prompt, and of any building prompt whose props matter (the Mill's
  sacks drifted top-down twice), and say "from the same camera as that barrel". The first
  Sack came out too top-down and was redone (`sack-b`, round 2).
- **A low camera: see the face, not the top.** A prop with a top (a crate, a chest, a box)
  is seen mostly from the front and only a little from above, like the barrel: its front
  face large and square to the viewer, its lid a narrow strip (owner, 2026-10-22: the first
  crate was too top-down). When in doubt, send the approved barrel as the camera reference.
- **Drawn straight on magenta.** Props do not need the grass panel: the guide is
  `guides/building1-cut.png` (magenta, the thin grid, a 1 x 1 box), the camera and rendering
  reference is an approved building panel (the Hospital), and the prompt says the prop stands
  in the box; tall pieces rise to about twice the box's height. One cut-out pass, no second
  redraw, so no drift.
- **Cut with the silhouette fit.** `tools/art/cutout.js --n 1 --fit silhouette --fill f`:
  a prop's whole width is the footprint (a bulging barrel, a leafy plant; the base fit is for
  buildings, whose walls must fill the footprint end to end), scaled by `--fill` so small
  props breathe (0.85 to 0.95; statues 0.75 to 0.85 so the plinth sits inside the tile). The
  tool prints the row's `artSpan`; tall statues land near 2 (a 1 x 2 piece is a size-1 row
  with an artSpan of ~2: the renderer draws the square at the footprint's bottom-centre).
- **Scale as a set** (owner, 2026-10-23, from the in-game review): props are judged next to
  each other and next to a building's own props, so each kind has a band of its tile. Small
  farm props (barrel, crate stack, sack, hay bale) fill about 60 to 75 % of a tile (artSpan
  0.73 to 0.78); plants about 85 % (poppies came down from 1.33 to 1.13; bluebells, fern and
  shrub stayed); garden pieces (birdbath 0.87, fountain 0.98, cactus 1.01) a little under a
  tile; statues rise above (bust and lion ~1.2, the two tall statues ~2); the large fountain
  fills its 2 x 2 (2.15). Air around a prop inside its tile is fine. Set the size with
  `--fill` at cut time: artSpan scales with it, so to shrink a cut prop to k of its size, cut
  once at `--fill 1`, read the artSpan, and cut again with `--fill (target / that)`.
- **Camera for props with a top** (revised 2026-10-23): the first crate was too top-down, the
  second over-corrected to a pure front view; the stack of crates was drawn from the barrel's
  camera, seen from the front and clearly from above, each lid a real top face about a third
  as tall as the front. Send the barrel as the camera reference and say that.
- **Pricing** follows the existing ladder: small props $25 to $50 and 1 gem; a stone bust
  $2,000 / 20 gems, a stone lion $3,000 / 30, the marble statue $5,000 / 50, the Shakespeare
  statue $7,500 / 75 (the Birdbath is $8,000 / 80, the Fountain $10,000 / 100).
- **Names** go in `stringsEN.json`'s 2005xx block (the deco names; other languages fall back
  to English through `getLocalizedString`).
- **The safety filter.** OpenAI refused "Venus de Milo" by name three ways (sexual), even
  fully draped. "An ancient Greek marble statue of a robed woman, arms lost to time" passed
  and reads as her. Describe classical nudes by what they wear, never by the famous name.

## The set (approved 2026-10-22, all in `game-client/public/assets/resources/`)

| Prop | Row | Art | Note |
|---|---|---|---|
| Barrel | existing | `barrel` | replaced |
| Crate | existing | `crate` | replaced; re-ordered from a lower camera (`crate-b-1`): the first was too top-down, the owner wants the FRONT FACE seen, like the barrel |
| Sack | existing | `sack` | replaced |
| Potted Plant | existing | `potted-plant` | replaced |
| Haybale | existing | `haybale` | replaced; re-ordered square-on (`haybale-b-1`) |
| Poppies | new `pop` | `poppies` | flower a |
| Bluebells | new `blu` | `bluebells` | flower b |
| Fern | new `frn` | `fern` | plant, not potted |
| Flowering Shrub | new `shr` | `flowering-shrub` | plant, not potted |
| Stone Bust | new `bst` | `stone-bust` | 1 x 1 statue |
| Stone Lion | new `lio` | `stone-lion` | 1 x 1 statue |
| Marble Statue | new `ven` | `marble-statue` | 1 x 2, the Venus by description |
| Shakespeare Statue | new `shk` | `shakespeare-statue` | 1 x 2, full length |

## Round 2 (2026-10-23, `tools/art/jobs/deco-whimsical-r2.json`)

| Prop | Row | Art | Note |
|---|---|---|---|
| Crate | existing | `crate` | now a STACK OF THREE crates (`crate-stack-1`), drawn from the barrel's camera; the single crate was over-corrected and too big |
| Cactus | existing | `cactus` | repainted in the game's palette (`cactus-1`): the old one was off-palette |
| Fountain | existing | `fountain` | redone in the style at a modest one-tile scale (`fountain-1`) |
| Fountain Large | existing (2 x 2) | `fountain-large` | redone: octagonal pool, two bowls, a fish finial, four spouts (`fountain-large-2`) |
| Birdbath | existing | `bird-bath` | redone (`birdbath-1`), the songbird on the rim |
| Sack | existing | `sack` | redone from the barrel's camera (`sack-b-2`, approved 2026-10-24): the first was too top-down; cut at the 75 % size (artSpan 0.73) |

Recuts the same day for scale: barrel 60 %, hay bale 80 %, sack 75 %, poppies 85 %.

## Homestead props (2026-10-25, `tools/art/jobs/homestead-r2.json`)

| Prop | Row | Art | Note |
|---|---|---|---|
| Signpost Town | existing | `signpost-town` | today's board-on-a-post restyled in the Trading Post's wood (the cut Trading Post attached as the wood reference); `signpost-town-1`, mirrored after the cut so the arrow points LEFT (owner) |
| Signpost Home | existing | `signpost-home` | the same post with the house pictogram (`signpost-home-2`) |
| Mailbox | existing | `mailbox` | plank box with a pitched lid on a braced post, red flag up (`mailbox-1`) |

## Sources (2026-10-26, `tools/art/jobs/sources.json`)

| Source | Rows | Art | Note |
|---|---|---|---|
| Rocks | Rocks, Rock Pit | `rocks` | three boulders with a sunlit top (`rocks-1`) |
| Clay Pit | Clay Pit, Mud Pit | `clay-pit` | a RAW deposit, no tools (owner 2026-10-26: it is found wild in the valley and clicking turns it to brick, so no spade): a low mound of wet clay with a puddle in the hollow (`clay-pit-b-1`); the Clay Pit drew a brick emoji before |
| Cloven Pine | Cloven Pine | `cloven-pine` | the split pine kept GOLD as the game draws it (owner's pick over a green variant): the only gold tree in the valley, so the wood source is easy to spot (`cloven-pine-gold-1`) |
| Rock Pit (cooldown) | Rock Pit | `rock-pit` | the tile's state while stone grows back after a collection (the farmplot the replant places, docs: ResourceClicking handleReplant): a flat blotch of gravel in the Rocks' footprint, the BASE the boulders stood on (`rock-pit-1`, owner 2026-10-30) |
| Mud Pit (cooldown) | Mud Pit | `mud-pit` | the same for clay: a flattened splotch of wet clay in the Clay Pit's footprint (`mud-pit-1`) |
| Snowman | Snowman | `snowman` | the seasonal carrot source, floppy hat (`snowman-2`) |

The eight directional Signposts (N/E/S/W and diagonals) still draw arrow emoji; if wanted, rotate
the town board's arrow per heading from the one approved panel rather than generating eight.

Candidates and picks: `tools/art/_candidates/deco-whimsical-r1/` (ignored by git), the
owner took the art director's picks for all but the hay bale.

## Pass A of the deco pass (2026-11-08, `tools/art/jobs/deco-pass-a.json`, `-a2`, `-a3`)

The plan is docs/art/deco-pass-plan.md. The rows that still drew emoji, drawn or cut; the barrel
is the camera reference, every prop cut with the silhouette fit and defringed (the keyer leaves
magenta in thin gaps: harp strings, under a chair's arms; a hue pass clears it).

| Prop | Art | artSpan | Note |
|---|---|---|---|
| Stack of Books | `stack-of-books` | 0.93 | leather tomes, the top one open (`a`, candidate 2) |
| Chair | `chair` | 1.12 | a PLAIN oak chair with a red cushion (`a2`, candidate 1): the first, carved, was too detailed for the game's scale (owner) |
| Bed | `bed` | 1.28 | a plain bed frame, cream blanket, one pillow, foot toward the viewer (`a2`, candidate 2); the canopied first try was too detailed. A 1 x 1 row with tall art until BL-21 (rectangular footprints) |
| Harp | `harp` | 1.3 | gilded concert harp (`a`, candidate 2) |
| Plant / Red Plant | `plant`, `plant-red` | 0.87 | generic leafy plants, no flowers, no pot (`a3`: plant 2, red plant 1), replacing the off-style originals |
| Black Fog | `black-fog` | 1.15 | the story barrier (Hecate's step, docs/story.md): a block of dark mist with violet curls (`a`, candidate 1) |
| Black Wall | `black-wall` | 1.19 | the level-design void block, kept as a system wall (`a`, candidate 2) |

**The scale rule, restated by the owner on this pass:** a prop is seen 45 px wide beside the
barrel, so big plain shapes and flat colour; no carving, engraving or ornament. Put that sentence
in every prop prompt.

Cut (resources.json, with `game-server/scripts/remove-cut-deco.js` run on the live grids first):
Toilet, Teddy Bear, Slide, White Dove, Green / Blue / Orange / Sand Wall, Holiday Tree.

Scale tweak (owner, 2026-11-08): the chair (1.44 -> 1.12), the sack (0.73 -> 0.58) and the harp
(1.65 -> 1.3) filled too much of their tile; a prop wants buffer around it. Lower the artSpan,
no recut.

## Rectangular footprints (BL-21, 2026-11-08)

A deco row may be `sizeX` x `sizeY` tiles instead of square (CLAUDE.md "A resource's
footprint"). The art stays a SQUARE cut with an `artSpan` of at least the taller side: the
renderer anchors that square at the footprint's bottom-centre, so a 1 x 2 bed cut at artSpan
1.75 stands 1 wide and 1.75 tall over its two tiles. Draw it on the matching guide
(`guides/building1x2-cut.png`, `building2x1-cut.png`, `building3x2-cut.png`; `tools/art/guides.js`
buildingCutGuideRect) and cut with `cutout.js --n <width> --fit silhouette` as usual. Rows made
rectangular on 2026-11-08: the Bed (1 x 2, redrawn taller and skinnier on the 1 x 2 guide,
`deco-bed-1x2`), the Large Decorative Palm Tree (1 x 2 instead of 2 x 2, its 2 x 2 art kept at
artSpan 2, so the fronds overhang a one-tile trunk) and the Marble Statue (1 x 2, art unchanged).

## Pass B1: the castle set (2026-11-08, `tools/art/jobs/deco-castle.json`, `-2`, `-3`, `-4`)

| Prop | Footprint | Art | artSpan | Price | Note |
|---|---|---|---|---|---|
| Round Tower | 1 x 2 | `round-tower` | 3.08 | 15,000 | first drawn on the 2 x 2 guide (too big a scale), then redrawn on the 1 x 2 guide (`deco-castle-5`): the stone body fills the two tiles and the slate roof rises into a third, one tile wide |
| Gatehouse | 3 x 2 | `gatehouse` | 3.13 | 25,000 | twin towers over a portcullis arch, candidate 1 |
| Heraldic Banner | 1 x 1 | `heraldic-banner` | 1.54 | 300 | |
| Brazier | 1 x 1 | `brazier` | 1.13 | 200 | |
| Knight Statue | 1 x 1 | `knight-statue` | 2.01 | 5,000 | |
| Throne | 1 x 1 | `throne` | 1.58 | 2,000 | |
| Gargoyle | 1 x 1 | `gargoyle` | 1.27 | 2,500 | added at the owner's ask; candidate 2 |
| Royal Bed | 1 x 2 | `royal-bed` | 2.12 | 12,000 | furniture group; a purple canopy that may overhang the frame. Took three tries: a "purple" canopy comes out pink-leaning (hue ~0.88), next to the magenta key, and the keyer un-mixes it to TEAL; ask for a BLUISH indigo violet (`deco-castle-4`) |
| Oak Table | 2 x 1 | `oak-table` | 1.45 | 1,500 | furniture group, the plain oak of the chair; the first 2 x 1 row. Cut at 2.08 (filling its two tiles) it was too big next to the chair (owner): a table wants the chair's height, so the span came down to 1.45 with buffer in the footprint |

The Cannon was drawn and CUT from the list (owner: no guns in the game). The castle wall set is
next, through the walls pipeline (docs/walls.md).

**Keyer rule learned here:** any cloth, roof or flower meant to be purple must be asked for as a
bluish violet; a red-purple or pink-purple sits within the magenta key's reach.

## Statue unification (2026-11-08, `tools/art/jobs/deco-statues.json`)

From the owner's screenshot of the six statues on cobblestone: three stones, three plinths.
Shakespeare redrawn in the Marble Statue's white marble on its round stepped plinth (artSpan
2.09); the Stone Bust in the Lion's warm sandstone on the Lion's square carved plinth (1.5); the
Gargoyle in the Knight's grey stone on the Knight's tall stepped plinth (1.29), which is what
keeps its base from vanishing on a cobblestone floor. The reference statue's cut PNG is sent as
the THIRD ref ("match its stone exactly, and the same plinth"): that is the way to keep a
family of props on one material. The rows: marble = Marble Statue, Shakespeare; sandstone =
Lion, Bust; grey = Knight, Gargoyle.

A deco row may carry several groups, `decoGroup: "castle;statuary"`, and lists under each tab
(Knight Statue and Gargoyle: castle + statuary; Royal Bed and Throne: furniture + castle).

## Pass B2: three farm props (2026-11-08, `tools/art/jobs/deco-farm.json`)

The plan's village set, trimmed by the owner: no cottages (a fake building that does nothing
confuses), no market stall (the Trade Stall is gameplay), no dovecote. Three props under the
Farm tab: Stone Well (`stone-well`, 1 x 1, artSpan 1.24, 1,000) and Hand Cart (`hand-cart`,
2 x 1, cut 1.83 and set to 1.65 for buffer, 600). The Woodpile was drawn and then cut the same
day (owner: it could confuse, like a source). The cart's cut kept the panel's contact shadow as
near-empty rows under the wheels, so it floated in its footprint: the rows under 60 alpha were
dropped and the art re-seated at the square's bottom (a pass worth running on any cut that
floats).
`cutout.js` now clamps its padding at zero: an art drawn edge to edge in its panel (the wide
cart) used to throw on a negative pad.

## Pass B3: greenery (2026-11-08, `tools/art/jobs/deco-greenery.json`)

Six plants under the Garden tab, the oak's green as the colour reference (`guides/control-oak-tree.png`
as the third ref), purples asked for as bluish violet: Rose Bush (`rose-bush`, artSpan 0.87, 60),
Lavender (`lavender`, 0.93, 40), Topiary Ball (`topiary-ball`, 1.34, 150), Topiary Cone
(`topiary-cone`, 1.79, 150), Ivy Trellis (`ivy-trellis`, 0.98, 120) and the Wildflower Patch
(`wildflower-patch`, 0.97, 30; PASSABLE, the first floor deco: a character walks over it). The
hedge wall set is parked in BL-22. Every cut is seated at its square's bottom after the defringe
(the cart lesson).

## Tweaks after B3 (2026-11-08, `tools/art/jobs/deco-tweaks.json`)

- **Wildflower Patch** redrawn with NO green mat: flowers and a few single blades over flat
  magenta, so the real grass tile shows through and the patch blends (owner).
- **Mulberry Tree, ready state** (`tree-mulberry`, the Mulberry Leaf row's board art): the same
  tree dotted with small WHITE FLOWERS, so ready reads at a glance; the purple-leaved ready
  state could not be told from the growing one. Not realistic, by the owner's choice.
- **Black Fog** redrawn as a CLOUD, black and dark grey with feathered edges, no cube; artSpan
  1.15 -> 1.4 so it bleeds past its tile and a row of them overlaps into one bank. Still
  impassable, still the story door. Not seated at the square's bottom (a cloud floats).

The six door rows (Town Door, Dungeon Door, Mirror, Locked Door, Arena Door, Black Fog) are in
the Buy Deco catalogue under Walls and Fences for DEVELOPERS only (`source: Deco`, `requires:
devonly`, 2026-11-08), so a layout can be dressed in game; players never see them.

## Pass B4: art pieces (2026-11-08, `tools/art/jobs/deco-art.json`)

In the Lion's sandstone (its cut as the third ref): Sundial (`sundial`, artSpan 1.11, 1,500,
statuary + garden), Stone Urn (`stone-urn`, 0.96, 800, statuary + garden), Obelisk (`obelisk`,
1.93, 3,000, statuary; made 2 x 3 at artSpan 4.5 and 8,000 Gold the same day: the owner wanted it much bigger, overflowing the top of its footprint); and the Maypole (`maypole`, 2.03, 1,200, garden), ribbons in red, yellow
and blue (no pink or purple near the key). The Gargoyle came with the castle set.

## The deco pass is done (2026-11-08)

Pass A (the emoji rows), B1 castle, B2 farm, B3 greenery and B4 art pieces shipped; B5
furniture was skipped by the owner (the Chair, Bed, Royal Bed, Oak Table, Stack of Books and
Harp stand for furniture). No deco row draws an emoji. Parked: the wall sets (BL-22). Next art
passes: BL-16 animals and pets (strategy in docs/art/zoo-animals-plan.md), then BL-17 avatars.

## Mountains redrawn as slab blocks (2026-11-08)

The three-peak massifs (board-r5) read as dozens of small rock columns, completely out of scale at
3 to 4 tiles. Rule learned: a big prop is seen ZOOMED IN, so its parts must be tile-sized; the
barrel on magenta is the scale control ("each chunk as big as that barrel"), and the prompt caps
the shape count (nine or ten slabs). Silhouette: ONE centre summit, shoulders left and right at
slightly different heights rising high and wide so the block nearly fills its square. Three
constructions were offered (boulders, slabs, ledges: tools/art/jobs/mountain-r6.json); the owner
chose slabs, refined in mountain-r7 (fuller upper portion). Installed: `mountain-large.svg` (r7 3,
4 x 4, artSpan 4.08), `mountain.svg` (slabs-small 2, 3 x 3, artSpan 3.06, six or seven of the
SAME slabs); the Enormous Mountain is the large art at artSpan 20.4, unchanged.
