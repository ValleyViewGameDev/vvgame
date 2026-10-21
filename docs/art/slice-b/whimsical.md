# The whimsical direction: brief and test (2026-10-20)

Status: the owner's second art direction, started after the round 3 buildings in the
elsinore style read as "too generic and too perfect" with lighting that was not interesting.
Fourteen reference images are in `tools/art/styles/whimsical/` (WebP copies for the API in
`refs/`). The style file is `tools/art/styles/whimsical/style.json`. The elsinore style and
its approved panels stay as they are; nothing is replaced until the owner decides.

## For the owner to approve

1. The brief in section 1 (what unifies the references, and what we impose on them).
2. The rendering: three variants of the same brief on one building, the Farm House at 2 x 2,
   in `tools/art/_candidates/whimsical-test/exploration/openai/` as `*-farmhouse-c-1.png`
   (`strip-camera.png` shows each at 512 px and at 90 and 45 px per tile). Pick painterly,
   inked or rendered, or say what to mix. Then six buildings get drawn in it. The first
   three (`*-farmhouse-1.png`) rotated the building to the references' three-quarter side
   view; the camera rule in the style and an elsinore panel sent as a CAMERA-ONLY reference
   fixed it (the fix is now part of the style: the references are copied for look, never
   for angle).
3. The consequence to be aware of: a building style this different from the elsinore panels
   means the characters, animals, tiles and deco approved so far will eventually be redrawn
   to match, or the board will look like two games. That is a later decision; the six
   buildings come first.

## 1. The brief, unified from the references

What all fourteen share:

- **Silhouette first.** Exaggerated organic shapes: rooflines that swoop and sag, eaves
  that droop and curl, walls that bow outward, chimneys and turrets that lean, upper floors
  that overhang on timber brackets, round or arched doors and windows. Nothing perfectly
  straight, nothing symmetric. (`whimiscal-2`, `whimsical-3`, `whimsical-4`, the castle, the
  overview row.)
- **Hand-shaped, chunky materials.** Scalloped fish-scale shingles or slate, thick thatch
  that curls at the edges, cracked plaster with dark timber framing, rounded mossy
  fieldstone, ivy and moss over every edge, flower boxes, lanterns, barrels. (`magic-shop`,
  `whimsical-house`, `farm-house`, `mossy`, `tudor-style`.)
- **Light as a character.** Amber light glowing from windows and lanterns as if lit from
  inside, a warm key light, cool soft shadows, dusk or golden-hour mood. This is the single
  strongest shared cue and the one the elsinore panels lack. (`overview`, `magic-shop`,
  `whimsical-3`, `whimsical-4`, `helena's-house`.)
- **Colour.** Rich but earthy: terracotta and plum roofs, slate blue, mossy greens, cream
  plaster, warm wood, amber glow as the accent. Not the flat bright green of the elsinore
  board.
- **Rendering varies across the references** (painterly illustration, inked storybook,
  3D-rendered miniature), which is why the test below tries three renderings of one brief.

What we impose that the references do not have:

- **The camera**: top-down three-quarter on a square grid, roof plane and front wall both
  visible. The references are eye level or three-quarter from the side; the model must
  re-cast the look to our camera.
- **The footprint**: walls and ground contact fill the N x N square; roofs, chimneys and
  turrets may rise above it (buildings get headroom in the renderer, like trees).
- **Readability at 45 px**: one strong silhouette per building; the painterly texture must
  not turn to mud at tile size. The strip decides.
- **No text, no letters**, image-only signage as before.

## 2. The test

`tools/art/jobs/whimsical-test.json`: the Farm House at 2 x 2, three variants (painterly,
inked, rendered), one image each, no old drawing sent (a fresh design is the point). Then
the owner picks a rendering and six buildings are drawn in it: Farm House, Magic Shop,
Laboratory, Inn, Bank, Guild, two candidates each.

## 3. Decisions 2026-10-20 and the tile question

- **Rendering: PAINTERLY** (owner). The six buildings: Farm House (2 x 2), Magic Shop,
  Laboratory, Helena's House, Bank, Warrior's Den (3 x 3), two candidates each
  (`tools/art/jobs/whimsical-buildings.json`). Helena's House is a NEW building, an Inn
  functionally, with its own art and name, placed near Helena; its reference is the
  hillside house (`refs/helenas-house.webp`): a round door in a grassy mound.
- **Tiles.** The owner asked why the approved tiles cannot serve this style. Answer: most
  of them can. Tiles are the quietest layer on the board, and the approved grass, dirt and
  sand are already near-flat at 45 px, so what changes between the two styles is TONE and
  RENDERING, not design: the whimsical farmhouse panels sit on a deeper, richer, softly
  mottled grass with no outline, where the elsinore grass is a brighter, flatter green with
  crisp blades. Slate and pavement carry the elsinore recipe's thin outline and lit edge,
  which would read as crisper than a painterly building beside them. So:
  `tools/art/jobs/whimsical-tiles.json` redraws the six approved types with the same
  guides, colours and content rules, with the painterly farmhouse panel attached as the
  ground-rendering reference. Expected outcome: grass, dirt and sand change tone only
  (either set could ship); slate and pavement lose the outline and gain soft mottling. The
  cut-and-atlas step is the same for both styles, so getting tiles into the game soon does
  not wait on this decision: build the cut step now, swap the panels later.

## 4. Approvals and changes (2026-10-20, afternoon)

- APPROVED: `painterly-farmhouse-1` (now the camera and rendering reference for every
  subject in the job) and `painterly-magic-shop-1`.
- Laboratory: the name stays, but the building is a grand COOKING SCHOOL (the skills taught
  there are Chemistry, Baker, Cooking, Creamery, Winemaker), a training hall that must not be
  mistaken for the Bakery, Kitchen or Oven crafting stations. Prompt rewritten as
  `laboratory-b`.
- Helena's House: PAUSED. The mound did not blend into the valley around it. Revisit with a
  ground treatment (the mound's grass must be the board's grass).
- Bank: a stone tower in castle style from the owner's new reference
  (`refs/whimsical-bank.webp`), pushed more whimsical than the reference (leaning, bulging,
  crooked cap). Prompt rewritten as `bank-b`.

## 5. Round 2 review (2026-10-21): nothing approved; the buildings bible

The owner reviewed `composite-r2` (Laboratory, Bank, Warrior's Den) and approved none of
it: every building had the same dark blue roof although they differ in architecture and
function, and the lighting was too dark. The direction that came out of it is the
**buildings bible**, `docs/art/buildings-bible.md`: the art director's brief (assets must
communicate their function at a quick read), one architecture family per building, an
accent colour per building carried by roof and sign, the town-look / valley-look rule for
moss and vines, image-only signage, full daylight. The four values live on each resource
row (`artFamily`, `artLook`, `artAccent`, `artSign`) and the generator prompts from them.
The style preamble's light sentence was rewritten for full daylight. Next: the owner
answers the bible's questions, then one subject per building is generated from the data.
