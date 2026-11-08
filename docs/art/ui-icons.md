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

`icon-home.svg` (the classic house glyph: red roof, chimney, one door) and `icon-town.svg` (the
Courthouse's clock tower as a glyph), `icons-r9` (owner, 2026-11-07), in the header's `system`
style: for buttons and labels too small for the board's Farm House / Town Hall art or the
signposts, which cannot be read under about 48 px. The Map panel's Go Home / Go to Town buttons
(`ZoomedOut/FrontierMiniMap.js`) use them at 1.4em. The zoomed-out boards (settlement and
frontier views) keep the full building art, which is drawn at tile size there. Alternates on
file in the approved sheet: a house with a round window, the tower with a red flag.

The first pair (`icons-r8`) failed twice over and is the rule for small icons: a wide landscape
picture (a whole cottage, a row of buildings) is not a glyph; ask for a SQUARE silhouette of three
or four big shapes that reads at 20 px. And when the model draws a sheet four across (as it does
with four subjects), the icons sit lower than a 256 px row: cut with `--cols 4 --rows 2`, or the
bottoms are clipped (that was the "cut off" in r8).
