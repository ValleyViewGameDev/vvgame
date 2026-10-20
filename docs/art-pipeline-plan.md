# The art pipeline: AI-generated, rig-conformant assets (plan, 2026-10-15)

Status: PLAN. Nothing built. Companion to `avatar-plan.md` (the rig and catalogue this
pipeline feeds) and the atlas notes in `CLAUDE.md`. Prices quoted here are what the
vendors published as of this writing; confirm on their pricing pages before the first
batch, they move every few months.

## 0. The problem, and the answer in one paragraph

The avatar system works. The art does not: every part was cut by hand out of a different
NPC drawing, so proportions, line weight and lighting drift from one part to the next, and
nobody on this project can paint. Recraft ($60/mo) makes a decent single picture but cannot
be told "same style as these, inside this outline, hair only, nothing over the face", which
is the whole job. The answer is a small in-repo generator that calls a pay-per-image model
with THREE things every time: a style bible (a few locked reference images), the rig (the
body contract from `_body.json`, drawn as an image with the target slot highlighted), and a
per-slot instruction. It asks for several candidates, runs automated conformance checks
against the rig masks, and shows the survivors in the editor for a one-click pick. The
owner picks; the owner never paints. The same generator, with a different manifest, does
buildings and later the rest of the resource set. Cost is cents per image, no subscription.

## 1. What already exists and stays

- The body contract: `tools/avatar/recipes/_body.json` → `public/assets/avatar/rig.svg`
  and `body.json` (female head, male head, shared neck and bust, eye line, hair band,
  collar, hand slot). This is the thing every generated part must conform to, and it is
  already machine-readable. The generator renders it to the guide images and the checker
  derives its masks from it.
- The catalogue and palettes (`tuning/avatarParts.json`, `avatarPalettes.json`), the Z
  order, `lookFor`, the compositor (multiply tint, blink), the server validation, the Avatar
  Lab tab and `render.js` sheets. None of it cares whether a part is SVG or PNG.
- The atlas (`scripts/build-atlas.js`): `avatar/` already accepts `.png`; `resources/`
  rasterises SVG text through sharp and needs a ten-line branch to pass a PNG straight
  through. Board art is served from the atlas, so raster parts cost nothing at runtime.
- The deconstruct / assemble tools stay for salvage and for the few vector parts worth
  keeping, but they stop being the production path.

## 2. The approach, and the roads not taken

**Generation by instruction-editing models, constrained by images, verified by code.**
The 2025-26 generation of image models (OpenAI gpt-image, Google's Gemini image models,
Black Forest Labs' Flux Kontext / Flux 2) take several input images plus a text instruction
and edit or compose with them. That is exactly our shape of problem: "image 1 is the style,
image 2 is the head this must fit, draw only the hat, transparent background". They hold a
style across a batch far better than prompt-only tools because the style is an image they
are copying, not an adjective they are interpreting. Conformance is then enforced twice:
by the guide image during generation, and by the checker afterwards (a candidate whose
pixels land in the face mask, or whose hair top is above the hair band, is discarded before
anyone looks at it).

Roads considered and parked:

- **Train a custom model (LoRA) + ControlNet, run locally in ComfyUI.** The classic
  answer and still the best for unlimited free iteration once a style exists, but it needs
  20-50 images IN the style to train on (we have none), a day of setup, and a GPU; on a Mac
  it runs but slowly. Revisit after the style bible exists (section 4): the bible is the
  training set.
- **Midjourney.** Excellent style references, no API, every image is a manual round trip.
  Not a pipeline.
- **Scenario.gg / Layer.ai.** Game-asset services that do style training + ControlNet in a
  web UI, $30-100/mo. The GUI alternative if the script path feels too raw; they solve the
  same problem with a subscription and lock-in. Not first choice because every asset would
  still be exported, renamed and wired by hand.
- **Recraft.** Keep the account only if its vectoriser or its custom-style feature wins the
  bake-off; cancel the subscription otherwise (its API is pay-per-image too, ~$0.04 raster,
  ~$0.08 vector). Its weakness is the one that matters: no multi-image conditioning.
- **Claude drawing the SVGs.** Fine for rigs, masks, guides and salvage; not for faces.

## 3. The bake-off: which model

Run the style test (section 4) through two or three of these and keep one. Rough per-image
prices at ~1024 px:

| Model | Style hold | Rig conformance | Transparent output | ~Price | Notes |
|---|---|---|---|---|---|
| OpenAI gpt-image (edit endpoint, several input images) | strong | strong, follows "only draw X" well | native alpha | $0.04 (medium) to $0.17 (high) | first pick: alpha out of the box means no keying step |
| Google Gemini image ("Nano Banana", Flash and Pro tiers) | strongest consistency across a set | strong | no reliable alpha, needs a keying step | $0.04 (Flash), ~$0.13 (Pro) | second pick; cheapest good one |
| Flux Kontext Pro / Max, Flux 2 | good | good with a reference, no instruction-following subtleties | no alpha | $0.04 to $0.08 | cheap bulk generator once the style is locked |
| Recraft V3 API with a custom style | medium | weak (image-to-image only) | yes, and SVG output | $0.04 to $0.08 | only if vector output turns out to matter |

Transparency: when the winner has no alpha, the generator asks for a flat magenta
background and the post step removes it with a matting model (`@imgly/background-removal`
or BiRefNet; both free, run locally) rather than colour keying, which leaves fringes on
painterly edges.

Rights: the OpenAI and Google terms allow commercial use of outputs; keep the generation
sidecars (prompt, model, seed, date) with every accepted asset so provenance is on file.

## 4. The style: decided direction (2026-10-19), tested before batching

After a reference tour (mobile first; most Switch/PC cozy games turned out to be 3D or
isometric), the owner settled the direction from the frames in `docs/art/moodboard/`:

- **Graveyard Keeper is THE target** (`graveyard-keeper-village.webp`, `GraveyardKeeper2/3/4/6.jpeg`),
  made brighter. Top-down three-quarter view on a square grid; dense props; every object
  has a dark outline, a lit top plane, a shaded front and a soft contact shadow to the
  lower right (light from the upper left); warm ochre paths and soil against slightly
  desaturated grass; buildings show a roof plane and a front wall; small surface detail
  (planks, stones, leaf clusters) drawn as shapes, not texture. What changes for us: NO
  pixel grid (the same colour and shading logic drawn at full resolution, crisp edges),
  and a brighter grade (lift the midtones, more saturated greens, less brown murk; the
  game is dark for its subject, ours is not). The build-mode frames (2, 6) are the closest
  to our board: one object per tile, readable at tile size, on a visible grid.
- **The character constructor frame (`GraveyardKeeperPeople.jpeg`)** is the avatar
  reference: Lazy Bear built every villager from a base body plus swappable head, hair,
  torso and prop parts, drawn to one rig. That is our avatar system; the frame is proof the
  look survives being assembled from parts. Our busts are head-and-shoulders at 256 px, so
  the parts are larger than theirs, same construction.
- `LonesomeVillage.jpeg`, `LonesomeVillage2.jpeg`: the secondary pole, for cleanliness
  only. Judged too cute and too simple as a target; what to borrow is the crisp outline and
  the flat, confident fills. Nothing else.

Rejected on the way, so nobody re-proposes them: pixel art (Stardew, Eastward, Moonlighter),
painterly (Bastion, Spiritfarer, Cozy Grove), isometric or diagonal cameras (Hay Day,
Family Farm Adventure, Bandle Tale), 3D (Echoes of the Plum Grove, The Survivalists, Cult of
the Lamb's angle), abstract (Hidden Through Time).

**Camera, in prompt words:** "top-down three-quarter view, square tiles, front faces
visible, verticals straight up, not isometric". It is what the board already draws.

**Slice A is no longer a tour of styles; it is a test of the recipe.** The same three
subjects (the female face on the rig, a wide-brim hat on that face, the Farm House on one
tile) are rendered in four controlled variants of the Graveyard Keeper recipe, through two
models, each as a 512 px panel AND a 45 px board thumbnail, on one contact sheet:

1. Graveyard, full resolution, brighter: the reference's shading and outline logic with
   crisp edges and the lifted grade. The baseline.
2. Same, flatter: fewer shading steps, less surface detail (one step toward Lonesome
   Village's cleanliness), to see how much detail 45 px can actually hold.
3. Same, heavier outline: a bolder dark line, for board readability on phones.
4. Same, softer: shading blended, a slight rim light, no outline on the lit side (the
   "painted" risk the owner said no to, included once to anchor the scale).

Plus one control: today's best NPC drawing (Gertrude) redrawn in variant 1, so the owner
can see what "the existing art, in the new recipe" looks like.

**The 45 px rule.** Board tiles render at 45 px (90 on a 2x phone). A line that looks right
at 512 px is often too thin or too heavy at 45; the strip decides. Avatar busts render at
256 px and share the recipe, so the board sets the line weight.

**Warm board, dark grids.** Assets are drawn in neutral warm daylight. Dungeons and night
come from the renderer (time-of-day colour grading and a light layer, a Phase 4 job), not
from darker assets, so one set of art serves every grid.

Decision gate: the owner picks a variant and says what to nudge. One narrowing round.
The winning panels become the **style bible**: `tools/art/styles/<name>/*.png` plus a
`style.json` with the prompt preamble the panels were made with. Every later call sends
those images. Changing the look later means a new bible and a regenerate, which is what
"a pipeline that lets me rev" means.

## 4b. The bible has lanes (owner, 2026-10-19)

One style guide, several lanes, each with its own approved reference panels, because each
kind of thing has its own template and the generator must be shown the right one:

- **Characters**: the approved Gertrude and Hotspur fronts, tiles and turnarounds. One tile
  wide, feet on the tile's bottom edge, head up to half a tile above. Enemies come later,
  on the same lane rules, once the creature style exists.
- **Farm animals**: their own lane, their own approved panels, because they will need simple
  animation and the animal style has to land before any of that. First trio done 2026-10-19
  (Cow, Sheep from description; Pig), approved by the owner as the lane's STYLE reference.
  **Facings (owner, 2026-10-19, final for now):** keep the slight three-quarter diagonal
  of the approved panels as the board pose and TRY it moving N/S/E/W: the toward-viewer view
  (approved) mirrored for the other side, plus an away view drawn from it, mirrored. If it
  reads as skating on the board, fall back to the human scheme (side mirrored, front, back).
  Mirroring is fine: animals carry nothing asymmetric (the avatar plan's "no flip" rule
  exists for the weapon hand).
- **Buildings, base style**: the approved farmhouse, redrawn ALONE at its true 2 x 2 size as
  the bible panel; the approved exploration panel keeps its four props, which belong to the
  deco lane instead. All buildings share this style.
  - **Crafting stations (2 x 2)**: a sub-bible. Recognisably functional, mostly OPEN-AIR
    workstations that show the thing being crafted: a back wall, partial side walls, an open
    front, a cut-away workshop. All of them follow that one template.
  - **Shops, training buildings and stations (3 x 3)**: closed buildings with doors and
    windows and SIGNAGE. Signage follows one style across all of them so a player can
    recognise a building from its sign; signs are imagery only, never text, on any building.
    The owner decides the design details and the sign per building.
- **Deco (1 x 1)**: tree stump, bucket, two flower tufts to start (the props from the
  approved farmhouse panel, each redrawn alone on one tile), then the rest.

## 5. The pipeline

```
tools/art/
  styles/<name>/        the style bible: 3-6 reference PNGs + style.json (preamble, rules, sizes)
  guides/               rendered from _body.json: rig with each slot region shaded, the face
                        mask, the jaw mask, the bust footprint, the hair band (PNG, 1024 px)
  jobs/
    avatar-parts.json   one row per part to make: id, slot, label, prompt, tintable, count
    buildings.json      one row per resource: type, prompt, footprint (1 tile), count
  generate.js           reads a job + a style, builds the per-row request (style images +
                        guide + instruction), asks the model for N candidates, writes
                        _candidates/<job>/<id>/<n>.png + <n>.json (prompt, model, seed)
  check.js              per-slot conformance against the guides (see below); writes a
                        verdict into the sidecar and a contact sheet per id
  accept.js             moves a chosen candidate to its home (public/assets/avatar/<slot>/
                        or public/assets/resources/), writes or updates the catalogue /
                        resources row, runs render.js or build:atlas
```

Rules the checker enforces (all derived from `_body.json`, nothing hand-typed twice):

- Face (`skin`): opaque pixels fill the head contour within a tolerance band, nothing
  outside it; drawn at the LIGHTEST skin tone in neutral light (the compositor multiplies
  tones in, and multiply can only darken).
- Hair: the front layer's top sits between the hair band (y 12) and the crown (y 42); no
  opaque pixel inside the face mask below the eye line; optional back layer stays behind
  the head contour. Drawn in a neutral mid-grey with darker grey shading (tintable).
- Facial hair: pixels only on and below the jaw mask, hanging at most a few px under the
  chin; neutral grey.
- Hat: covers the crown line; its brim may cross the hair band; the checker records
  whether it hides the hair (no hair pixels left visible under it in the composite) so
  `hidesHair` is filled in, not guessed.
- Top: pixels only inside the bust footprint (plus a collar tolerance); must cover the
  collar line; full colour (not tinted).
- Buildings: one tile; the silhouette fills at least 70% of the frame height; the ground
  contact sits on the bottom edge; reads at 45 px (a downsampled copy is attached to the
  contact sheet).
- Every part: same lighting direction (top-left, stated in the bible), no flip needed
  (`avatar-plan.md` decision 5), no drop shadow outside its own footprint.

What goes to the model each call: the bible images, the guide for the slot with the base
composite drawn in (face on body, and for hats the default hair too, so the hat sits at
the right height), and an instruction built from a per-slot template plus the row's prompt.
The template is the part that takes iteration; it lives in `style.json`, versioned.

Review: a **Candidates** pane in the Avatar Lab (and an **Art** tab in the editor for
resources) that lists every id with its surviving candidates as thumbnails composited on
the rig, an Accept button each, and Regenerate (with an optional note that is appended to
the prompt: "rounder", "less texture"). Accept calls `accept.js`. The owner's whole job is
looking at contact sheets and clicking.

Revving: everything is a manifest plus a style, so "redo all hats in the new bible" is one
command, and the old files stay in git. Sidecars make any accepted asset reproducible.

## 6. The proof of concept, in slices

| Slice | What | Owner does | Rough cost |
|---|---|---|---|
| A. Recipe test | guides from `_body.json`; `generate.js` with two models; 4 variants × 3 subjects × 2 models + the Gertrude control, 512 px + 45 px contact sheet (section 4) | picks a variant, one narrowing round | ~$5 |
| B. Bible, palette, full-body rig, first conformant parts | see §6b | approves the palette; picks from contact sheets | ~$15 |
| C. The avatar starter set | ~2 faces, 6 hair, 4 facial hair, 5 hats, 6 tops, the bare bust, blink frames; catalogue rows written by `accept.js` | picks; says what to regenerate | $30-60 |
| D. Two buildings | Farm House and Windmill through the same generator; PNG branch in `build-atlas.js`; on the board beside today's art at 45 and 90 px | judges them on the board | ~$5 |
| E. Decide the resource overhaul | a costed manifest for the 121 drawn resources and the ~120 board-visible emoji doobers; batch only after D looks right | go / no-go | $100-300 one-off, if go |

### 6b. Slice B in detail

1. **Lock the bible.** The winning panels (flatter farmhouse, flatter scene, the on-tile
   figures, the Gertrude and Hotspur redraws and turnarounds) become
   `styles/graveyard-bright/bible/*.png`; the style refs switch from the Graveyard Keeper
   screenshots to our own panels, so the look stops being "like that game" and becomes
   "like our game". The preamble is rewritten for the flatter recipe.
2. **The palette, extracted not invented.** Quantize the bible panels to 40-60 colours,
   prune and name them by material (grass, earth, thatch, wood, stone, foliage, water,
   skin base, hair base, metal, cloth accents, one shared outline colour) into
   `styles/<name>/palette.json`; `palette.js` draws a labelled swatch card from it, sent
   with every request ("use only these colours"). The palette gets an editor sheet like the
   other tuning files, so swatches are renamed or nudged there and the card regenerates.
   Three places it must agree with: the procedural ground tiles (`tileColors.js` adopts the
   palette's grass and earth entries, since sprites will sit on the real tiles, not on the
   grass the model painted), the avatar tint palettes (neutral bases live in the art
   palette, the tints stay in `avatarPalettes.json`; review side by side), and the UI
   theme (separate, only must not fight). Enforcement: the card during generation, a
   compliance score in `check.js` (share of opaque pixels within a small colour distance
   of a palette entry; flags, does not reject), and optional snapping on accept: HARD for
   board props and buildings (quantize fills to the palette, leave anti-aliased edge pixels
   alone), SOFT for characters (score only), matching flatter-for-board and
   baseline-for-figures. Night and dungeons stay renderer grading.
3. **The full-body rig** (§7b): `_body.json` grows torso, legs and feet regions and the
   headroom rule (feet on the tile's bottom edge, head up to half a tile above);
   `guides.js` draws the figure guide from it; the Avatar Lab's rig overlay follows.
4. **`check.js`**: per-slot conformance against the rig masks (§5) plus the palette score;
   a contact sheet per id with pass/flag marks.
5. **The Candidates pane** in the Avatar Lab, and `accept.js` writing catalogue rows.
6. **First conformant parts, as layers**: the female and male base bodies (lightest skin
   tone, neutral light), two hairstyles, one hat, one top, each generated ON the base body
   with "draw only the X" and the slot mask, four candidates each, then the first full
   composite in the modal. This is where "parts on a rig" is proven for the new look.

A to D is the proof. It needs an API key for each model in the bake-off (in
`game-server/.env`, never in the client) and a spend cap set on each account before the
first batch. Slice A can start the same day the keys exist.

Division of labour, plainly: the owner looks and chooses. Claude Code writes and runs the
generator, the checker, the Lab pane and the manifests, runs every batch, pre-ranks
candidates by reading the contact sheets, and wires accepted art into the catalogue and the
atlas. The model paints.

## 7. Gotchas

- **Multiply tint needs neutral bases.** Tintable parts (skin, hair, facial hair) are drawn
  grey or at the lightest tone, or the palette will not work. Non-tintable parts (hats,
  tops) are drawn in colour, which means a top with two colourways is two parts.
- **Consistency is a property of the batch, not the model.** Lock the bible, the lighting
  sentence, the output size and the guide before slice C; change any of them and parts
  stop matching across slots.
- **Hair under hats** is the hard slot: the generator makes the hat with the default hair
  present; `underHat` drawings for long hair are a second, cheaper pass later.
- **Hands and weapons** (`hand` slot) wait for the bible; each weapon is one drawing plus
  duplicates by catalogue row.
- **Citizens on the rig** (avatar-plan decision 9) become a manifest of npc-only parts,
  the same way; the 30 drawn NPCs are regenerated, not re-cut.
- **The 45 px floor** can veto a style the owner loves at 512 px. Test early, in slice A.
- **Emoji doobers** (119 board-visible) are a bigger visual change than the buildings;
  they are what the board mostly shows. Slice E should start with the twenty most common.
- **Keying and fringes**: if the winner has no alpha, budget a day for the matting step
  before judging edge quality.

## 7a. Slice A results (run 2026-10-19)

35 panels, `tools/art/_candidates/slice-a/` (sheet.jpg, strip-45px.png; regenerable from
the sidecars). Token use: gpt-image-2 ~10k tokens per image (about 130k total), Gemini
3 Pro Image ~3.5k per image (about 54k total). Findings:

- **gpt-image-2 is the primary model.** It held the recipe across all four variants on
  the board subjects (outline, lit roof plane, shaded front, lower-right shadow, props as
  crisp shapes, bright) and re-rendered Gertrude in it while keeping her likeness. 50 to
  165 s per image.
- **gemini-3-pro-image follows the layout guide more literally but drifts in style**:
  sketchier line, cartoonier shapes, one shadow on the wrong side, one figure turned
  three-quarter unasked, one green braid, one 503. 40 to 150 s. Keep it as the backup for
  layout-strict jobs and for cheap bulk once a bible exists.
- **Characters must start from a drawing or a constructor-style reference.** The generic
  "young woman" faces went realistic-storybook on gpt-image-2; the Gertrude redraws and
  the full-body figures, which had a source drawing and the constructor frame, stayed in
  the game's register.
- **Proportion is a prompt rule, not a style property.** "About three and a half heads"
  produced five-head figures; "two and a half heads, a big head, short legs, barely taller
  than one and a half times its width" plus the footprint guide produced ~3-head figures
  that stand in one tile with the crown half a tile above it (the owner's rule). The
  footprint guide (`guides/figure.png`) is the one to keep.
- **Turnaround sheets work** (front, side, back in one panel at one scale on gpt-image-2),
  which is the seed of the animation pipeline: pose guides per frame, one call per frame.
- **Second round (same day): the scene and the male character.** The Farm House drawn into
  a 2 x 2 footprint (`size: 2` in resources.json, `guides/scene.png`) beside Gertrude on
  her own tile composed correctly in both baseline and flatter. Hotspur (from
  `npc-hotspur.svg`: horned helmet, fur collar, purple cloak, green tunic, skull clasp)
  redrew, stood on a tile at the right proportion, and turned around consistently, from
  a description of the drawing plus the drawing itself. Two characters of opposite build
  from one recipe: the character construction is proven.

**Owner's decisions after slice A (2026-10-19):** gpt-image-2 primary, Gemini backup
only. **Two approved panels, and only two, seed the bible:** `flatter-farmhouse-1` for the
board and `baseline-figure-front-1` for characters (both gpt-image-2;
`_candidates/slice-a/approved/`, everything else filed under `exploration/`). Everything
from here is matched to those two files, not to the combined scene panels. The character
proportion is the approved Gertrude's: about four heads from the top of the hair to the
feet (the crown adds more), roughly two and a quarter times as tall as wide across the
sleeves, a large head on an ADULT build. The "two and a half heads" rule from the first
round made figures stubby and childlike and is retired; the approved figure itself is now
sent as the proportion reference, which is the general rule: **once a thing is approved,
it replaces the prose that described it.** Hotspur and the on-tile Gertrude were
regenerated against it.

**The approved set, slice A closed (2026-10-19), all gpt-image-2, in
`_candidates/slice-a/approved/`** (`node tools/art/approve.js --job slice-a --list`):
- Buildings: `flatter-farmhouse-solo-1`, the Farm House alone at its true 2 x 2 on plain
  grass (it replaced the first approved panel, whose four props now live in the deco lane).
- Characters: `baseline-figure-front-1` (Gertrude front, THE proportion reference),
  `baseline-hotspur4-front-1` (Hotspur front, drawn from his approved on-tile figure;
  that tile panel's image file later went missing from disk, only its sidecar remains),
  `composed-gertrude-turnaround`, `composed-hotspur-turnaround` (front = the approved file
  itself; side and back drawn singly in the front's frame and slid to its feet line by
  `tools/art/turnaround.js`, heights checked by `tools/art/measure.js`).
- Farm animals (style reference, three-quarter view): `flatter-animal-cow-1`,
  `flatter-animal-sheep-1`, `flatter-animal-pig-1`.
- Deco (fill ~nine tenths of the tile): `flatter-deco-stump-full-1`,
  `flatter-deco-bucket-full-1`, `flatter-deco-flowers-white-full-1`,
  `flatter-deco-flowers-yellow-full-1`.

Lessons: a turnaround drawn as one three-figure image shrinks and squashes the figures;
draw side and back singly in the front's own frame and compose. A deco item must be told
to fill its tile. A character or animal drawn from a description alone drifts unless a
strong style panel is attached; once one is approved it becomes the reference for the rest.
These files are the bible seed for slice B. Open: the palette (below).

## 7c. Slice B decisions so far (owner, 2026-10-20 morning)

The overnight lanes are reviewed in `docs/art/slice-b-review.md`. Decided:

- **Crafting-station architecture (open-air cut-away) APPROVED**; `flatter-dairy-b-1` is the
  sub-bible panel for every 2 x 2 station. The Mill is right but its machine must not sit
  dead centre and the windmill should be larger.
- **Oak Tree `flatter-oak-tree-1` APPROVED** (the 1.5-tile one), with colour variations to be
  drawn from it for random use, including two in autumn colours from the palette. Pine
  `flatter-pine-tree-b-1` is close: 10% shorter at the same width. Dead Tree wanted, one brown
  and one black.
- **Tiles, per type:** grass tufts smaller and less pronounced, with the very subtle yellow
  dots and the occasional white dot of today's tiles, accents that read as part of the grass
  and never as flowers; dirt without the big round pebbles, subtler, and in a colour near
  today's `#c98f59` (the light sample was sand, the dark one too dark); SLATE first, the
  in-game grey stone (`#97968b`), a flat stone with some cracks; cobblestone kept but with
  thinner seams so the scale reads smaller and more real, with subtle moss; a PAVEMENT of
  large man-made tiles near today's `#f5bf89` in the palette.
- **Tiles APPROVED (round 2):** `grass-2`, `dirt-2`, `slate`, `cobble-3`, `pavement`, `sand`
  (`tools/art/_candidates/slice-b-tiles/approved/`). The thin grid line the panels carry
  is NOT to be seen on the board: it exists because the guide shows cell edges; the cut step
  (`tools/art/tiles.js`, to build) crops each 256 px cell inset by the line's width and
  resamples to the atlas size, so grass, dirt, slate, cobble and sand tile edge to edge
  with no seam. Pavement keeps its drawn seams, they are the slab design. Later base tiles
  are generated from a guide without lines.
- **Trees APPROVED (round 2):** the four oak recolours (`oak-summer-a`, `oak-summer-b`,
  `oak-autumn-gold`, `oak-autumn-red`) for random use beside the approved oak, the shorter
  pine `pine-tree-c`, and the dead trees `dead-tree-brown` and `dead-tree-black`
  (`tools/art/_candidates/slice-b-buildings/approved/`). Tree rule stands: one tile of
  headroom; the renderer needs a 1 x 2 sprite for trees (today it draws size x size).
- **3 x 3 buildings need much more exploration:** more imaginative architecture and
  rooflines, real distinction between buildings (not thatch everywhere), and signs that are
  believably attached to the building. The hanging board idea stands; the attachment did not.

## 7b. Direction change 2026-10-19: full-bodied characters

Once the art is this solid, a head-and-shoulders bust floating on a tile stops working for
people; the owner wants **full-bodied people and creatures**, and accepts that this means
basic sprite-frame animation later (walk cycles, a facing per direction). Decided during
slice A, before any part was generated, so it costs nothing now. Consequences, to be
designed once the style and the sprite pipeline are proven (slices A-B):

- The body contract (`_body.json`) becomes a full-body rig: a base body (female, male, and
  creature rigs later) with a head region that keeps today's face / hair / hat / facial
  hair rules, plus torso, legs and feet regions for tops, bottoms and shoes. The slot list
  in `avatar-plan.md` §2.2 grows accordingly; the compositor, catalogue and modal are
  slot-agnostic and stay.
- Equipment stays as planned (armour as the top, weapon in a hand slot), now on a body.
- Animation is frames per part, generated the same way as parts (a pose guide per frame):
  not in scope until the standing figure is right. No skeletal rig, no runtime bones.
- Slice A grows two subjects to test it: Gertrude full-body front view, and a one-panel
  turnaround (front, side, back), both against the Graveyard Keeper constructor frame
  with "more detail than the reference".

## 8. What slice A needs from the owner

1. API keys for the two bake-off models (suggested: OpenAI gpt-image and Google Gemini
   image) in `game-server/.env` as `OPENAI_API_KEY` and `GEMINI_API_KEY`, with a spend cap
   set on each account first. Flux joins only if the two disagree on price vs quality.
2. ~~A yes on roughly $60-100 total for slices A-D.~~ Approved 2026-10-19.
3. ~~More mood board frames.~~ Six Graveyard Keeper frames and two Lonesome Village frames
   are in `docs/art/moodboard/` (2026-10-19). Still useful later: a Graveyard Keeper
   interior or night frame, for the dark-grid grading reference.
4. Characters: the Graveyard Keeper constructor frame answers it. Human busts, dark outline,
   stepped shading, the same light as the board.
5. Whether the Recraft subscription gets cancelled at the end of slice A.

**Getting the two API keys** (the owner asked for this written down):

- OpenAI: platform.openai.com, sign in, Settings, Billing: add a payment method and buy a
  small prepaid credit ($10 is plenty for slices A-B), then Limits: set a monthly budget
  ($30) so a runaway script cannot spend more. Then Dashboard, API keys, "Create new secret
  key" (name it `vvgame-art`); the key starts with `sk-` and is shown ONCE, copy it then.
- Google: aistudio.google.com, sign in, "Get API key", "Create API key" (it makes or
  picks a Google Cloud project; the key starts with `AIza`). Image generation needs the
  paid tier: in console.cloud.google.com, Billing, link a billing account to that project,
  then Billing, Budgets and alerts: a $30 budget with email alerts (Google has no hard
  cap; the alert is the guard).
- Put both in `game-server/.env`, one per line, no quotes, and never paste them into chat
  or a commit (`.env` is gitignored):

```
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AIza...
```
