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
isometric), the owner settled the direction from two frames, kept in
`docs/art/moodboard/`:

- `lonesome-village-plaza.jpg` (Lonesome Village): THE target. Top-down three-quarter
  view on a visible square tile grid; thick dark-brown outlines; flat fills with one darker
  shadow tone and one lighter highlight patch; no texture, no gradients; rounded, chunky
  shapes; a soft contact shadow under every object; warm, saturated palette; buildings show
  a roof plane and a front wall.
- `graveyard-keeper-village.webp` (Graveyard Keeper): the density and warmth pole. Same
  camera. What to borrow: prop density, warm ochre paths against slightly desaturated
  grass, upper-left light with lower-right contact shadows, roof plus front wall at a fixed
  tilt. What to leave: the pixel grid, the brush texture, the dark overall grade.

Rejected on the way, so nobody re-proposes them: pixel art (Stardew, Eastward, Moonlighter),
painterly (Bastion, Spiritfarer, Cozy Grove), isometric or diagonal cameras (Hay Day,
Family Farm Adventure, Bandle Tale), 3D (Echoes of the Plum Grove, The Survivalists, Cult of
the Lamb's angle), abstract (Hidden Through Time).

**Camera, in prompt words:** "top-down three-quarter view, square tiles, front faces
visible, verticals straight up, not isometric". It is what the board already draws.

**Slice A is no longer a tour of styles; it is a test of the recipe.** The same three
subjects (the female face on the rig, a wide-brim hat on that face, the Farm House on one
tile) are rendered in four controlled variants of the Lonesome Village recipe, through two
models, each as a 512 px panel AND a 45 px board thumbnail, on one contact sheet:

1. As the reference: thick brown line, flat fill, one shadow tone, one highlight.
2. Thinner line, same fills (the "does the line survive 45 px" question answered both ways).
3. Softer shading: the shadow tone blended, a slight rim light (one step towards Graveyard's
   solidity, still no texture).
4. Graveyard density: variant 1 with more small props and surface detail per tile.

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
| B. Bible + first conformant parts | lock the bible; female and male face, two hairstyles, one hat, one top, 4 candidates each; `check.js`; Candidates pane in the Lab | picks from contact sheets | ~$10 |
| C. The avatar starter set | ~2 faces, 6 hair, 4 facial hair, 5 hats, 6 tops, the bare bust, blink frames; catalogue rows written by `accept.js` | picks; says what to regenerate | $30-60 |
| D. Two buildings | Farm House and Windmill through the same generator; PNG branch in `build-atlas.js`; on the board beside today's art at 45 and 90 px | judges them on the board | ~$5 |
| E. Decide the resource overhaul | a costed manifest for the 121 drawn resources and the ~120 board-visible emoji doobers; batch only after D looks right | go / no-go | $100-300 one-off, if go |

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

## 8. What slice A needs from the owner

1. API keys for the two bake-off models (suggested: OpenAI gpt-image and Google Gemini
   image) in `game-server/.env` as `OPENAI_API_KEY` and `GEMINI_API_KEY`, with a spend cap
   set on each account first. Flux joins only if the two disagree on price vs quality.
2. A yes on roughly $60-100 total for slices A-D.
3. Two or three more Lonesome Village frames for the mood board: a character close-up, an
   interior or night scene, and a building other than the plaza ones. The generator copies
   what it is shown; one frame is a thin bible.
4. A call on characters: Lonesome Village's cast are animals with the same line treatment.
   Our avatars are human busts. Assume the same outline and flat shading on human faces
   unless told otherwise.
5. Whether the Recraft subscription gets cancelled at the end of slice A.
