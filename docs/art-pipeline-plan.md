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

## 4. The style question first

"Hand-drawn storybook, not sure" is the right amount of sure for a test, not for a batch.
The first thing the generator does is a **style test**: the same three subjects (the female
face on the rig, a wide-brim hat on that face, the Farm House) in five candidate styles,
each as a 512 px panel AND as a 45 px board thumbnail, on one contact sheet:

1. Storybook ink and wash: dark ink line, soft watercolour fill, paper grain.
2. Flat storybook: ink line, flat colour, one shadow tone (closest to today's best NPCs).
3. Gouache: painterly, no outline, chunky shapes.
4. Pencil and wash: soft graphite line, pale wash, hand-lettered feel.
5. Cel: bold line, two-tone cel shading, saturated (the "cartoon" risk, included to anchor
   the scale).

**The 45 px rule.** Board tiles render at 45 px (90 on a 2x phone). Watercolour texture and
thin pencil lines turn to mush at that size; silhouettes and a bold line survive. Whatever
wins must read in the 45 px strip, not only in the 512 px panel. Avatar busts render at
256 px and can carry more texture, but they share the style, so the board sets the floor.

Decision gate: the owner picks a style from the sheet. Then two more rounds narrow it
(line weight, palette warmth, how much texture). The three or four winning panels become
the **style bible**: `tools/art/styles/<name>/*.png` plus a `style.json` with the prompt
preamble the panels were made with. Every later call sends those images. Changing the look
later means a new bible and a regenerate, which is what "a pipeline that lets me rev" means.

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
| A. Style test | guides from `_body.json`; `generate.js` with two models; 5 styles × 3 subjects × 2 models, 512 px + 45 px contact sheet | picks a style, two narrowing rounds | ~$5 |
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

## 8. Open questions for the owner

1. Which two models for the bake-off? Suggested: gpt-image and Gemini; add Flux if the
   first two disagree on price vs quality.
2. Is $60-100 total for A-D an acceptable spend, with a hard cap on each account?
3. Does the Recraft subscription get cancelled at the end of slice A?
4. For the board look (slice E): one style for everything, or a softer variant for
   buildings and tiles than for characters? The test sheet can include both.
