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
