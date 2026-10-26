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
| Clay Pit | Clay Pit, Mud Pit | `clay-pit` | a dug pit of wet clay with a spade (`clay-pit-2`); the Clay Pit drew a brick emoji before |
| Cloven Pine | Cloven Pine | `cloven-pine` | the split pine kept GOLD as the game draws it (owner's pick over a green variant): the only gold tree in the valley, so the wood source is easy to spot (`cloven-pine-gold-1`) |
| Snowman | Snowman | `snowman` | the seasonal carrot source, floppy hat (`snowman-2`) |

The eight directional Signposts (N/E/S/W and diagonals) still draw arrow emoji; if wanted, rotate
the town board's arrow per heading from the one approved panel rather than generating eight.

Candidates and picks: `tools/art/_candidates/deco-whimsical-r1/` (ignored by git), the
owner took the art director's picks for all but the hay bale.
