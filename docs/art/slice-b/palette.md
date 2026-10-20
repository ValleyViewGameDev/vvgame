# Slice B, palette lane: the art palette extracted from the bible (2026-10-19)

Status: BUILT, awaiting the owner's approval. Plan reference: `docs/art-pipeline-plan.md` §6b
step 2. Nothing in this lane spent money; no image was generated.

## For the owner to approve

**Look at:** `tools/art/styles/elsinore/palette-card.png` (1024 px wide, 52 swatches in 15
material groups, each with its hex and its share of the bible's pixels). The data behind it
is `tools/art/styles/elsinore/palette.json`, editable in the editor under Sheets > Art palette.

**Decisions needed:**

1. **Hard or soft palette, per lane.** The plan proposes HARD for board props and buildings
   (on accept, fills are snapped to the nearest palette colour; anti-aliased edge pixels are
   left alone) and SOFT for characters (score only, nothing snapped). The bible agrees with
   that split: the board panels score 90 to 98% on-palette as they are, the two Hotspur
   panels 84% (his cloak and fur use colours nothing else uses). Recommendation: as the plan
   says, hard for board and deco, soft for characters and animals. Say yes, or change a lane.
2. **The outline colour.** The darks split into two: `#231a18` (a near-neutral dark, 2.85% of
   pixels: the line on every board panel and on Hotspur) and `#421a07` (a warm red-brown,
   1.75%: Gertrude's dress has it as its deepest shade and her line is drawn in it). The
   recommendation is `#231a18` as THE shared outline colour (it is what 10 of 12 panels draw
   their lines with), and `#421a07` kept as a red-cloth deepest tone, renamed in the sheet.
   Alternative: one warm outline for everything, which would mean regenerating the board set.
3. **How many greens.** The extraction found 14: 3 grass (the ground: light tufts `#8db425`,
   base `#79a826`, a dark `#3e6619` that is the grid line's edge, 0.15%), 7 foliage (leaves on
   the stump, the flower tufts, the bucket's grass), 4 cloth green (Hotspur's tunic). That is
   a lot of green for a palette whose job is to keep things consistent. Options: keep all 14
   (safest, the bible really uses them), or prune foliage to 4 (light, mid, dark, deep) and
   let the compliance score tolerate the rest. Recommendation: prune foliage to 4 and keep
   the 3 grass as they are, since the ground tiles will adopt them (section 4).

A fourth, smaller item: the group names are a first pass by hue and origin, so a few swatches
sit in the wrong family and want renaming in the sheet (noted in section 3). Renaming is a
cell edit; the card redraws with `node tools/art/palette.js card`.

## 1. How the palette was extracted

`node tools/art/palette.js extract` (deterministic: the same panels give the same palette).

- **Input:** the twelve approved panels in `tools/art/styles/elsinore/bible/`. When the
  lossless master exists in `tools/art/_candidates/slice-a/approved/` it is read instead of
  the WebP copy (all twelve did this run).
- **Background removal.** Each panel's border ring says what its background is: green means
  grass (8 board panels), anything else parchment (the 4 character panels and, as it turns
  out, the pig, which was drawn on cream). The background is then everything reachable from
  the border through pixels close in colour to the border's tones: a flood fill, so the
  parchment vignette on the Hotspur panels is followed and a subject inside its dark outline
  is never entered. Grid lines are found as whole dark columns and rows and dropped.
- **Weighting.** Board and character lanes each count for half, and inside a lane every
  panel weighs the same (so the two 3072 px turnarounds do not outvote the fronts).
- **Three passes.** The grass entries come from the board backgrounds alone (k-means, 4
  tones, merged to 3). The darks (Lab lightness under 20) become the outline entries (2 when
  they split cleanly, which they did). Everything else, the subject pixels, is quantized by
  weighted k-means in CIE Lab (seeded k-means++), near-duplicates closer than delta E 6 are
  merged, and clusters under 0.03% of pixels are dropped as noise. The budget is adjusted
  until the total lands in the 40 to 60 range: 52 this run.
- **Naming** is by Lab hue, chroma and lightness plus provenance: which lane holds most of
  the cluster's pixels (a grey on a character is metal, shared with the board it is stone), the
  top panel (yellow on the farmhouse is thatch, on a flower it is an accent) and the height on
  a character panel (brown in the top 42% is hair, lower down a belt or boot).
- **Share** is the percentage of counted bible pixels (subject + grass + outline, with the
  lane weighting). Grass is 72% because the board panels are mostly ground; that is a fact
  about the panels, not a bug.

## 2. The groups

| Group | Count | Entries (light to dark) | Note |
|---|---|---|---|
| outline | 2 | `#421a07` `#231a18` | see decision 2 |
| grass | 3 | `#8db425` `#79a826` `#3e6619` | from the board backgrounds |
| foliage | 7 | `#aac525` `#91b01d` `#70971a` `#599324` `#518622` `#43721e` `#3f4216` | see decision 3 |
| earth | 1 | `#7a6648` | the farmhouse's soil line and the figure's ground shadow; the bible has almost no bare earth |
| wood | 4 | `#ad7620` `#945e1d` `#6c481f` `#4f381c` | stump, bucket, door, beams |
| thatch | 3 | `#f8c935` `#e9b22a` `#daa025` | the farmhouse roof (the yellow flowers share the light one) |
| stone | 2 | `#58534b` `#3e3b35` | dark greys shared by the board and Hotspur's helmet |
| metal | 7 | `#efd06c` `#e6b64f` `#dc9b54` `#a1a09a` `#cd9432` `#ac8d4d` `#787570` | gold trim and the crown's silver, plus two greys |
| skin | 3 | `#f9b093` `#e99275` `#c86c55` | all three are the pig; the human faces merged into "hair light" |
| hair | 3 | `#efbe7a` `#8c4c16` `#743d10` | light = Hotspur's blonde AND Gertrude's face |
| cloth red | 5 | `#b32216` `#98401b` `#9d1b13` `#8d170f` `#72120a` | Gertrude's dress |
| cloth green | 4 | `#6e6f27` `#446d32` `#32561f` `#254116` | Hotspur's tunic |
| cloth purple | 1 | `#552b4d` | Hotspur's cloak |
| cloth cream | 4 | `#f7eaca` `#e1e0d7` `#eed9a6` `#c8b082` | sheep wool, cow white, the farmhouse plaster, petals |
| cloth brown | 3 | `#a18963` `#bd7433` `#5c2f0c` | belts, boots, the pig's hooves |

Renames worth doing in the sheet before the card is sent anywhere: `hair-1` is really "skin,
light (faces)"; `metal-4` `#a1a09a` and `metal-7` `#787570` are the farmhouse chimney and
wall greys as much as the helmet (the tiles lane measured the chimney at `#8c867e`, between
the two) and belong in stone; `cloth-cream-1` `#f7eaca` is the plaster wall; `stone-2`
`#3e3b35` is the cow's black patches and the helmet's shadow. None of this changes the
colours, only which family the card lists them under.

## 3. What the compliance score is

`node tools/art/palette.js score <png> [...]` prints, per image, the share of opaque,
non-background pixels whose nearest palette entry is within **delta E 10** (CIE76, in Lab;
2.3 is a just-noticeable difference, 10 is "the same flat fill under the model's own soft
shading"; anti-aliased edge pixels sit above it, which is why 100% is never expected). It
also prints the shares within 6 and 14, the mean distance, and the five commonest
off-palette colours, so a flagged candidate says what is off. Background: transparent pixels
never count; a fully opaque image gets the same border-and-flood keying as extraction, and
`--no-key` turns that off. `scoreImage()` is exported for `check.js` (flags, never rejects).

## 4. The ground tiles: what `tileColors.js` would adopt

Tiles are procedural canvases: `tileColors.js` holds ONE flat colour per type, and
`PixiRendererTileTextures.js` fills the tile with it and paints detail on top in hard-coded
semi-transparent colours (grass clumps `rgba(45,140,55,.5)`, blades `rgba(100,180,80,.4)`,
yellow blobs `rgba(180,200,50,.55)`, dirt dots `rgba(60,35,20,.35)`, and so on). So adopting
the palette means changing the base hex per type, and ideally the overlay colours too, since
they are tints of the old base. Proposal (nearest palette entry by delta E; a proposed hex is
only given where the bible actually contains that material):

| Key | Tile | Current | Proposed | Palette entry | Why |
|---|---|---|---|---|---|
| g | Grass | `#82bb4d` | `#79a826` | grass-2 (mid) | the bible's ground; the light tufts become grass-1 `#8db425`, the clump overlay `#599324` (foliage-4) |
| d | Dirt | `#c98f59` | `#7a6648` or keep | earth | the only bare-earth tone in the bible is a dark soil line; the tiles lane's generated dirt tile averaged `#815326`. Decide after a dirt tile panel exists |
| s | Slate | `#97968b` | `#a1a09a` | metal-4 (rename to stone) | delta E 5 from today; the chimney grey |
| x | Cobblestone | `#acaa89` | `#c8b082` | cloth-cream-4 | the farmhouse's wall stones; delta E 12 |
| p | Pavement | `#f5bf89` | `#eed9a6` | cloth-cream-3 | the plaster tone, keeps pavement lighter than cobble |
| n | Sand | `#e0ca24` | `#f8c935` | thatch-1 | the nearest yellow; the bible has no sand |
| o | Snow | `#ffffff` | `#e1e0d7` or keep | cloth-cream-2 | the bible's brightest white (cow, petals); snow may stay pure white by design |
| z | Moss | `#3f7449` | `#446d32` | cloth-green-2 | delta E 10; a bluer green than any foliage entry |
| y | Dungeon | `#000000` | `#231a18` | outline-2 | the dungeon floor becomes the line colour; keep black if dungeons want to vanish |
| w | Water | `#58a0d8` | keep | none | no blue anywhere in the bible (nearest entry is delta E 39); needs a water panel |
| l | Lava | `#c4583d` | keep | none | no lava in the bible |
| c | Clay | `#6c3b3b` | keep | none | nearest is delta E 19; no clay in the bible |
| v, u | TBD tiles | `#44551d` `#1b712c` | keep | none | placeholders, no use yet |

Not done in this lane: `tileColors.js` is untouched (game-client source is out of scope here
and the tiles lane owns the tile look). The numbers above are the hand-off.

## 5. The avatar tint palettes

`game-server/tuning/avatarPalettes.json` holds tints multiplied into tintable parts (skin,
hair, eyes); the art palette holds what is drawn. The neutral bases the plan asks for do not
exist yet (no part has been generated in the new style). From the bible:

- **Skin base:** the two human faces came out as `#efbe7a` (listed as hair-1), a warm light
  tan; the lightest avatar tone `tone-1 #F6DCC8` is delta E 8 from the bible's cream `#f7eaca`.
  A face drawn at the bible's face colour and multiplied by tone-1 would go darker than the
  bible, so the base for generated faces should be asked for lighter than `#efbe7a`, at or
  above `#f6dcc8`. The pig's pinks (`#f9b093`, `#e99275`, `#c86c55`) are skin in the animal sense.
- **Hair base:** the plan says neutral mid-grey; the palette's greys `#a1a09a`, `#787570`,
  `#58534b` are the candidates for the drawn grey, with `#a1a09a` the base and the two darker
  ones the shading steps. The tint rows map onto bible colours well: blonde `#E3C27A` is delta
  E 7 from `#efbe7a`, chestnut `#8B4A2B` is 10 from hair-3 `#743d10`, brown `#5B3A21` is 6 from
  wood-4, black `#262129` is 8 from the outline. Only teal (paid) has nothing near it, as expected.
- **Eyes:** blue `#5AA7E8` and green `#5BB37A` are 29 to 43 from anything in the palette; the
  bible's eyes are too few pixels to register. Nothing to change; eyes are tinted, not drawn.

So: the tints stay in `avatarPalettes.json` unchanged; the art palette gets the neutral bases
once slice B step 6 generates the first faces and hair, and they are added as rows there.

## 6. Compliance of the bible panels (sanity check)

Scored against the extracted palette at delta E 10, background keyed:

| Panel | On-palette | Mean dE | Main off-palette colours |
|---|---|---|---|
| flatter-deco-stump-full-1 | 97.6% | 4.6 | deep brown shadow |
| flatter-deco-flowers-white-full-1 | 96.1% | 5.0 | pale yellow-green highlights |
| flatter-deco-bucket-full-1 | 94.2% | 5.7 | near-black shadow under the rim |
| flatter-animal-sheep-1 | 94.2% | 5.8 | dark olive |
| composed-gertrude-turnaround | 94.2% | 4.5 | the darkest maroon of the dress |
| flatter-animal-pig-1 | 94.1% | 3.0 | dark pink-brown |
| flatter-farmhouse-solo-1 | 93.5% | 5.6 | near-black under the eaves |
| baseline-figure-front-1 | 93.3% | 4.9 | the darkest maroon of the dress |
| flatter-deco-flowers-yellow-full-1 | 91.1% | 6.2 | olive shadows in the leaves |
| flatter-animal-cow-1 | 90.2% | 6.2 | dark olive, the bell's orange |
| baseline-hotspur4-front-1 | 83.8% | 6.6 | pure black (fur collar), the cloak's purple-black |
| composed-hotspur-turnaround | 83.8% | 6.5 | pure black, the cloak's purple-black |

All twelve pass a flag threshold of 80%; the Hotspur pair are the floor, and their misses are
one material (black fur) plus the dark side of a one-off cloak. A generated candidate scoring
under 80% is worth a look; under 70% something is off.

## 7. Files, commands, the editor sheet

- `tools/art/palette.js`: `extract`, `card`, `score`. Node, CommonJS, sharp from `lib/common.js`.
- `tools/art/styles/elsinore/palette.json`: 52 rows `{id, name, hex, group, share}`.
- `tools/art/styles/elsinore/palette-card.png`: the swatch card (regenerate after any edit).
- Editor: one appended entry `artPalette` in `tools/editor/sheets/definitions.js`, listed under
  Sheets as "Art palette". Sheet files resolve against `game-server/`, so the entry's path is
  `../tools/art/styles/elsinore/palette.json`; the editor's path join accepts it without any
  change to the editor (verified: list, load and a validating save round-trip all work). `id`
  is immutable, `group` is an enum of the material groups, `share` is informational.
- Next, outside this lane: `check.js` imports `scoreImage`; `generate.js` attaches the card;
  the tiles lane adopts section 4; `accept.js` snaps hard-lane fills (decision 1).
