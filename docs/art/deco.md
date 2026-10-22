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
| Crate | existing | `crate` | replaced |
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

Candidates and picks: `tools/art/_candidates/deco-whimsical-r1/` (ignored by git), the
owner took the art director's picks for all but the hay bale.
