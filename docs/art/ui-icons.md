# UI icons (nav column + header)

Owner's brief (2026-11-01): replace the emoji-style glyphs with icons in the game's own style,
grown-up whimsy like the buildings, a Shakespearean / literary flavour, front-facing like all the
world art, simple enough to read at 28 px. The header buttons are system-style glyphs (a
shopping bag, the standard gear, the standard share arrow) drawn in the same paint, so they read
as controls rather than props.

## Pipeline

- Style `tools/art/styles/icons/style.json`: a sheet of icons on the icon grid, world-art refs for
  palette and light. Variants are the directions tried: `painted` / `sticker` / `inked` (round 1,
  too cutesy), `props` / `woodcut` / `tavern-sign` / `emblem` (round 2; plaques too noisy, props
  at a 3D angle), `props-front` (round 3, flat-on), **`props-lit`** (round 4, simpler and in full
  daylight: the approved nav rendering), **`system`** (round 6: the approved header rendering,
  with the round-5 Chat bubble as the exemplar).
- Guides `guides/icon-grid-4x3.png` and `icon-grid-3x3.png` (`tools/art/guides.js iconGridGuide`):
  a magenta field cut into cells by thin lines, one icon per cell, in the order the prompt lists.
- Jobs `icons-r1` .. `icons-r6`. Approved: `icons-r4/approved/openai--props-lit-nav-1.png` (nav)
  and `icons-r6/approved/openai--system-header-1.png` (header).
- Splitter `tools/art/icons.js --job J --candidate C --names a,b,c [--cols 4 --rows 3] [--px 256]
  [--out game-client/public/assets/icons]`: cuts the cells, keys the magenta (hue, flood +
  islands), trims each icon to its box, pads it square, writes `icon-<name>.png` + the base64 `.svg`
  wrapper. After it: the hue patch (magenta-hued fringe pixels to wood or alpha 0) and an island
  prune (components under 2 % of the largest), then rewrap the svg; both are inline scripts in the
  session, worth folding into icons.js if the set is ever recut.

## Files (game-client/public/assets/icons)

Nav (Icons.json, same filenames as before so the toast `{icon:icon-farming.svg}` syntax still
works): farming (carrots), tools (pickaxe), buy = Animals (cow), build (cottage), skills (book and
quill), pets = Zoo (monkey), buydeco (topiary), combat (rapiers), gov (sealed scroll), trophy
(laurelled cup), map, inventory (satchel: the left header's Inventory item, in front of the text).

Header: store (bag), inbox (envelope), settings (gear), leaders (laurel and star), chat (bubble),
help (question disc), share (arrow), level (star: the left header's Level item, in front of the
text), profile (silhouette; spare, the nav shows the player's own avatar).

Gems, Money and Health keep the game's existing icons for now (owner). The Level and Inventory
strings (10150, 10103) lost their emoji too; PlayerPanel, Leaderboard and WarehousePanel show them
as plain text.

## Header row

`App.js` renders the seven actions as one `.header-secondary` row of `.header-icon-btn`s at the
header's right (App.css). On a device with a real pointer the `.header-icon-label` slides out
beside the icon while the button is hovered and folds away after; on phones (mobile.css) it is
icons only, 42 x 32 buttons. The old two-column / 3 x 2 grid rules and the phone's emoji-prefix
trick (`headerIcon` / `headerLabel`) are gone, and the emoji prefixes are stripped from the
seven header strings in all ten languages (the Spanish 10100-10108 block was also realigned: it
had been shifted by one id, so the Store button showed "Bandeja de entrada").

## Place icons: Home and Town

`icon-home.svg` (the classic house glyph: red roof, chimney, one door; `icons-r9`) and
`icon-town.svg` (the Courthouse's clock tower with a lower slate gable on each side, three roof
peaks in a row; `icons-r10`), owner 2026-11-07, in the header's `system` style: for buttons and labels too small for the board's Farm House / Town Hall art or the
signposts, which cannot be read under about 48 px. The Map panel's Go Home / Go to Town buttons
(`ZoomedOut/FrontierMiniMap.js`) use them at 1.4em, and at frontier zoom every owned homestead
cell, in the current settlement (`PixiRendererSettlementGrids.js`) and in every other
(`PixiRendererFrontierSettlements.js`), is the Home glyph at 94% of its little cell. The
settlement view one level in keeps the Farm House, drawn at tile size. Alternates on file: a house with a round window (r9), the
town with red side roofs, taller side gables, or a flag (r10).

A four-across sheet whose icons nearly touch is cut with `tools/art/icons-split.js`, which splits
at the empty columns between icons instead of at the guide's cells, then the stray specks
(pieces of a neighbour's eave) are pruned to the main piece.

The first pair (`icons-r8`) failed twice over and is the rule for small icons: a wide landscape
picture (a whole cottage, a row of buildings) is not a glyph; ask for a SQUARE silhouette of three
or four big shapes that reads at 20 px. And when the model draws a sheet four across (as it does
with four subjects), the icons sit lower than a 256 px row: cut with `--cols 4 --rows 2`, or the
bottoms are clipped (that was the "cut off" in r8).

## The padlock

`icon-lock.svg` and `icon-lock-open.svg` (`icons-r11`, owner 2026-11-08): the classic padlock
glyph in the `system` style, turned GRAY (a system mark, not a coloured thing: the owner asked
for monochrome after a brass first cut; the gray is the approved brass art desaturated, with a
touch of blue so it reads as iron). It replaces the 🔒 emoji on a locked crafting slot
(`CraftingStation.js`, 22 px), a locked Trade Stall slot (24 px), the level lock
(`UI/Panels/LevelLock.js`, 64 px) and the bulk-crafting note; each site sizes the `.lock-icon`
img to the glyph it replaced. The Locked Door deco row keeps its 🔒 until the deco pass (BL-18).

## Marks and feelings: what floats over a character's head (`icons-r12`, owner 2026-11-10)

The last emoji over the board's characters, as two 4 x 3 sheets in the header's `system` style
(`tools/art/jobs/icons-r12.json`, one candidate each, both approved as drawn), cut by
`icons.js --prefix mark-` into `public/assets/icons/mark-<name>.png` (+ `.svg`).

- **Marks:** check, question, hand, clock, cross, thumbs-up, thumbs-down, heart, broken-heart,
  gift, handshake. The sheet's ring is not installed: the ring topic and the Propose outcome
  show the Diamond Ring's own doober art.
- **Feelings:** one family of round faces (happy, laughing, blush, kiss, hug, surprised, angry,
  annoyed, mischief, doubtful) plus thanks (pressed hands) and friends (the pair of figures).
- **After the cut** (the steps this file asks for): magenta-hued fringe to alpha 0 (not on
  `mischief`, whose purple shares magenta's hue) and islands under 2 % pruned. The handshake's
  cuff crosses the grid line into the gift's cell, so those two are cut by their own boxes
  (`tools/art/_candidates/icons-r12/recut.js`).
- **Where they show.** `Render/PixiRenderer/speechTopicArt.js` `GLYPH_ART` maps a glyph to its
  picture for the speech bubbles and for the relationship outcome that floats up from a head
  (`PixiRendererSpeech.js`, a sprite now). The four board overlays keep their file names
  (`public/assets/overlays/checkmark.svg`, `question.svg`, `hand.svg`, `clock.svg`) and wear
  the painted check, question, hand and clock, so the quest and trade overlays, the station
  and farm-animal ready marks, the HUD quest badge, the trophy badge and the quest cards' task
  ticks all changed together. The atlas was rebuilt for them.
- **The check and the question, second take (`icons-r13`, owner 2026-11-10).** The r12 check was
  an olive green that sank into the grass and the question mark stood bare. One sheet, two
  takes of each; the owner chose the first of both: the question mark in dark brown on a
  golden disc with a white rim (as the old badge was), and the white check on a rounded square
  of bright emerald, the emoji's green. They replace `mark-question` and `mark-check` and the
  `question.svg` / `checkmark.svg` overlays; the atlas was rebuilt.
