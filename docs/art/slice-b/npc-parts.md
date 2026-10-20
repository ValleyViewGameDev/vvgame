# Slice B, NPC PARTS lane: the full-body rig and parts as layers (2026-10-19)

Status: PROTOTYPE, nothing approved, nothing wired into the game. Parent plan:
`docs/art-pipeline-plan.md` §6b step 3 (the rig) and step 6 (first parts as layers), §7b
(full-bodied characters). Budget: 6 of the 8 gpt-image-2 images spent (about 48.6k tokens,
401 s of generation), 2 kept in reserve.

## For the owner to approve

Look at these (all under `tools/art/_candidates/slice-b-npc-parts/`, gitignored, regenerable
from the sidecars with `node tools/art/generate.js --job slice-b-npc-parts --style elsinore --models openai`):

1. `layering-strip-tinted.png`: approved Gertrude | base body | robe layer | hair layer tinted
   brown | the three stacked. This is the proof. `layering-strip.png` is the same with the hair
   left grey, `composite-female.png` the stacked figure alone (with alpha, and `.parchment.png`).
2. `sheet.png`: the contact sheet of all six generated panels (two bases, hair alone, robe
   alone, hair worn, robe worn) at 512, 90 and 45 px.
3. `postfit/layering-strip.png`: the fallback route (parts drawn alone, then moved and scaled by
   hand-typed boxes onto the base); cleaner cut-outs, placement by hand.
4. `docs/art/slice-b/_body.v2.json`: the draft full-body rig, numbers only (section 1). It does
   not replace `tools/avatar/recipes/_body.json` until approved.

Decisions needed:

- **D1. Frame size.** The bust frame is 256 x 256. A full body at one tile wide and one and a
  half tiles tall does not fit that at tile scale. Proposed: 256 x 384 (1 x 1.5 tiles at 256 px
  per tile, feet on the tile's bottom edge at y 372, hats up to y 0). Alternative: keep 256 x 256
  and let the tile be 170 px inside it (parts get smaller on disk, nothing else changes).
- **D2. Same height for both bodies, or same scale?** Gertrude and Hotspur were generated at
  different scales (she is 863 px hair-to-feet in her panel, he is 649). Proposed: each body is
  scaled so hair top to feet is the same 352 px in the frame, as the on-tile figures were (one
  tile wide, head half a tile above). Then Hotspur has a bigger head and shorter legs than
  Gertrude by proportion, which is his build. The alternative keeps the panels' relative scale
  and makes him a head shorter on the board.
- **D3. Which base body.** `exploration/openai/baseline-base-female-1.png` (used for the
  layers: closer to the approved size, black background) or `-2` (cleaner, flatter, 5% smaller,
  green background). Neither is "lightest skin tone": both came back in Gertrude's own tone.
- **D4. The undershift.** Both bases wear a white shift. Under the compositor's multiply tint it
  disappears into the skin tone (a doll body), and in the difference key it hid near-white hair
  (section 6). Proposed: regenerate the base with the shift in a muted colour (undyed tan or a
  blue-grey), and keep it as an untinted second file (`file2`) of the body row, or drop it and
  accept a doll body under "No Clothes".
- **D5. The generation route for parts** (section 3): worn-then-subtracted (placement holds,
  edges need cleanup) versus drawn-alone-then-fitted (clean edges, placement by hand). Proposed:
  worn-then-subtracted as the pipeline, with the base fix from D4.
- **D6. Slots** (section 2): add `body`, `bottom`, `shoes`; `top` grows a `coversLegs` flag;
  `hand` stays as the held-item slot. Arms are part of the body, not a slot.
- **D7. The palette becomes relative.** Tintable parts are drawn at the lightest tone (skin) or
  near-white grey (hair), so the lightest swatch must be near white and every other swatch a
  darker multiplier; today's `avatarPalettes.json` hexes are absolute colours and would double
  darken. A data change, no code.

## 1. The full-body rig v2, measured

Method: `tools/art/measure.js` for the figure boxes and head share, then per-row and per-column
colour scans with sharp (skin, outline and parchment classes) and gridded 2x crops to read each
landmark, on `approved/openai--baseline-figure-front-1.png` (Gertrude) and
`openai--baseline-hotspur4-front-1.png` (Hotspur). Panel = 1024 px; frame = the proposed
256 x 384 (D1), each body scaled so hair top lands on y 20 and feet on y 372 (D2). Ranges are
`top..bottom` or `left..right`.

| landmark | Gertrude panel | Hotspur panel | female frame | male frame |
|---|---|---|---|---|
| hat top (crown tip / horn tips) | 60 | 145 | 4 | 11 |
| hair top (hair dome / helmet top) | 100 | 162 | 20 | 20 |
| hair band (crown band / helmet rim) | 190..215 | 265..290 | 57..67 | 76..89 |
| brow | 250 | 300 | 81 | 95 |
| eye line, eye centres x | 290, 462 / 562 | 325, 470 / 555 | 98, 108 / 148 | 108, 105 / 151 |
| mouth | 355 | 380 | 124 | 138 |
| chin | 386 | 400 | 137 | 149 |
| face width x | 410..615 | 420..610 | 86..170 | 78..181 |
| head width x (hair / helmet) | 375..660 | 410..620 | 72..188 | 73..187 |
| neck y, x | 389..425, 480..545 | 402..422, 480..545 | 138..153, 115..142 | 150..161, 111..146 |
| collar top | 426 | 423 | 153 | 162 |
| shoulder line | 445 | 445 | 161 | 174 |
| torso y, x | 445..575, 355..680 | 445..580, 383..647 | 161..214, 64..197 | 174..247, 58..201 |
| belt | 555..595 | 560..600 | 206..222 | 236..258 |
| arms y, left x, right x | 460..640, 318..400, 625..710 | 470..650, 375..440, 600..660 | 167..240, 49..82, 174..209 | 187..285, 54..89, 176..208 |
| hands y, left x, right x | 628..682, 328..398, 648..700 | 598..652, 385..435, 605..652 | 235..257, 53..82, 184..205 | 257..286, 59..86, 178..204 |
| hem (robe / tunic) | 900 | 690 | 346 | 306 |
| legs y, x | 575..905, 330..700 | 580..720, 430..600 | 214..348, 54..205 | 247..323, 84..176 |
| feet y, left x, right x | 905..963, 400..500, 525..625 | 715..811, 410..500, 525..610 | 348..372, 82..123, 133..174 | 320..372, 73..122, 135..181 |
| feet line | 963 | 811 | 372 | 372 |
| contact shadow y, x | 905..985, 320..710 | 760..835, 380..660 | 348..381, 50..209 | 344..385, 56..208 |
| widest point (w at y) | 393 at 610 | 327 at 690 | 160 at 228 | 177 at 306 |
| scale panel to frame | | | 0.408 | 0.542 |
| accept crop of the panel (left, top, w, h) | | | 198, 51, 628, 941 | 276, 125, 472, 708 |

Where they agree: eye line, chin, collar, shoulder line, belt and hands all sit within 35 panel
px of each other (the shoulder line is identical at 445), the face is about 200 px wide on
both, hands hang at the same height just below the belt. Where they differ: the legs. Gertrude's
feet are at 963, Hotspur's at 811, so he is 150 px shorter with the same upper body: 2.7 heads
tall (helmet top to chin 238, body 649) against her 3.0 (hair top to chin 286, body 863).
Hence one female rig and one male rig, with a shared feet line and shared head rules, and the
leg and shoe regions per body. The hair band for Hotspur is his helmet rim; his hair top is
assumed at the helmet top (no bare-headed Hotspur exists).

A caveat on measure.js: it classifies pixels by distance from the parchment, and skin on
parchment is under its threshold (difference 75 against 220), so it sees faces only through
their outlines. The numbers above come from the colour scans, not from its head share.

## 2. Slots and Z order for full bodies

Today (busts): `hairBack, skin, top, eyes, facialHair, hairFront, hat, hand`. Proposed, back to
front (also in `_body.v2.json` `slots` and `zOrder`):

| z | slot | tint | region (rig landmarks) | notes |
|---|---|---|---|---|
| 0 | hairBack | hairColor | head and shoulders, behind the body | hair that hangs behind the arms or back |
| 1 | body | skinTone | the whole figure incl. the contact shadow | replaces `skin`: bald head, face, neck, arms, hands, legs, feet (D4 for the shift) |
| 2 | shoes | none | feet y, feet left / right x | draws over the bare feet |
| 3 | bottom | none | legs y and x; may overlap the shoe tops | trousers, hose, skirts |
| 4 | top | none | collar top to hem, arms left to arms right | a robe runs to the feet and sets `coversLegs` (the bottom is then not drawn), like `hidesHair` for hats |
| 5 | eyes | eyeColor (iris) | eye line, eyes x | unchanged |
| 6 | facialHair | hairColor | mouth to a little under the chin | unchanged |
| 7 | hairFront | hairColor | hair top to shoulder line; long hair to the arms' top | unchanged rules |
| 8 | hat | none | y 0 to the brow; may cross the hair band | unchanged |
| 9 | hand | none | at the right hand (hands right x, hands y) | the held item only: a weapon, a tool, a basket; may extend outside the body; drawn in the armed grid kinds as before |

Arms are not a slot: they are skin and belong to the body; sleeves belong to the top, which is
why the top's region includes the arm columns. The hand slot keeps its meaning (an item held
in the drawn hand) and moves from the bust's bottom-right corner to the rig's right-hand
position. Everything in the compositor, catalogue and modal is slot-agnostic; adding slots is
rows and folders.

## 3. Generating a part as a layer

The two routes were tried, two images each.

**A. Drawn alone** (`hair-long`, `top-robe`): refs = the 4 bible panels, the approved front, the
base body on parchment; prompt "draw ONLY the X ... exactly where it sits on the base body, same
position and scale ... leave the background where the face and body would be". Result: perfect
cut-outs, correct in grey, but drawn as a hero object filling the frame: the hair came back
627 x 815 px (the head is 230 wide), the robe's collar at y 129 (the base's neck is at 413).
The checker caught both (31% of the hair outside the head-and-shoulder band; 27% of the robe
above the chin). `postfit/` shows them moved and scaled onto the base by boxes typed from the
base's landmarks (`_scripts/fit.js`); it composes, but the sleeves and the hair are a guess.

**B. Worn, then subtracted** (`hair-long-worn`, `top-robe-worn`): same refs; prompt "redraw the
base body EXACTLY as it is ... and add ONLY the hair / dress it ONLY in the robe". Result: the
model keeps the figure's placement (both within 3% of the base: scalp y 88..90, feet 944..945)
and the part sits where a worn part sits. `_scripts/diff.js` then keeps every pixel of the
worn image that has no near-match within 3 px in the base (the model redraws the base a pixel
or two off, so a plain pixel difference lit up every outline and both eyes), drops blobs under
1500 px (outline slivers, eye whites) and, for grey tintable parts, keeps only near-neutral
pixels. The robe layer is clean apart from a halo at the hands and feet where the redraw
shifted; the hair layer has holes where near-white hair sat over the white shift (D4) and a
pale rim along the face where the redrawn face outline moved. `composite-female*.png` is
route B stacked body, top, hairFront with the compositor's order and a multiply tint on the
hair (`_scripts/compose.js --tint`).

Backgrounds: gpt-image-2 refuses `background: 'transparent'` (HTTP 400 "Transparent background
is not supported for this model", no image billed; gpt-image-1 supports it). Asked for flat pure
green, it returned flat pure black once and green five times; `_scripts/key.js` keys whichever
flat colour the corners hold (black by brightness with a floor, since the outlines are dark
brown, never black; green by excess green with a despill). The plan's matting-model step was not
needed: the style's closed dark outline keys cleanly.

Checks run on each layer (`_scripts/check.js`, the seed of `tools/art/check.js`, rules from
`_body.v2.json`): opaque bounding box; hair: no opaque pixels inside the face ellipse below the
eye line, none outside the hair-top-to-arms band, top not below the hair top; top: none above
the chin, the collar line covered, the hem position (waist or `coversLegs`), nothing below the
feet; body: head top and feet within 3% of the approved front. One known gap: the prototype
checker used the approved panel's landmarks, and the base body sits 35 px higher, so its
face-overlap flag on the hair is partly the offset (the base's own landmarks are in
`_body.v2.json` `prototype`); the real checker must measure the base it was given.

## 4. The tint rule

Multiply can only darken, so: body drawn at the LIGHTEST skin tone in neutral light (what came
back is Gertrude's tone, one step too dark; D3), hair and facial hair in near-white grey with
one mid-grey shadow tone and a dark outline (what came back: a warm light grey, fine), the iris
light grey. Shoes, bottoms, tops, hats and held items in full colour. Then the palette must be
relative (D7). The white undershift on the body is the one tinted thing that should not be
tinted (D4). The two grey hair panels show the rule holds through generation: the model drew
grey hair when asked, twice.

## 5. What animation frames would mean for parts, later

Each frame is a pose guide drawn from the rig (feet line, hip and shoulder lines moved per
frame), and every part is generated per frame with the worn route against the base body in
that pose. The body's own frames come first, because every part layer is subtracted from the
base in the same pose. A part that passes the standing check needs the same check per frame
with per-frame masks. Long hair and robes swing, so their frames differ even when the body's
change is small. The catalogue row grows a frame count, not a new slot. Side and back views are
the same pipeline with the turnaround fronts as the base bodies.

## 6. What did not work, honestly

- `background: 'transparent'` on gpt-image-2: refused (section 3). The job file now says so.
- The flat key colour is not reliably obeyed: one black, five green from the same sentence.
- Parts drawn alone drift to frame scale every time (two of two). Placement is a property of
  the whole figure, not of the part.
- Near-white tintable hair over a white shift is invisible to a difference key; the hair layer
  has holes there. Fix is a non-white shift on the base (D4), not a darker hair base (a
  mid-grey base cannot be tinted to a light blonde by multiply).
- The redrawn base shifts by a pixel or two, leaving a halo around hands, feet and the face
  outline in the subtracted layers; the 3 px tolerance removes most of it, not all. A later
  pass could erode the layer by 1 px where it touches skin.
- The base bodies are not at the lightest tone and are 2 to 5% smaller than the approved front.
- `measure.js` cannot see skin against parchment and `--n` is per job, not per subject
  (two runs were needed for 2 bases + 1 of each layer).
- The contact sheet (`sheet.js`) shows the black-background base as a black panel; it does not
  flatten keyed layers, and the exploration folder holds the raw images only.

## 7. Files

- Job: `tools/art/jobs/slice-b-npc-parts.json` (6 subjects, all baseline; the note records the
  transparency finding). Raw panels and sidecars: `_candidates/slice-b-npc-parts/exploration/openai/`.
- Keyed layers: `_candidates/slice-b-npc-parts/layers/` (`*.png` with alpha, `*.parchment.png`
  for viewing, `*-worn-1.keyed.png` the worn figures before subtraction).
- Prototype scripts, to be promoted into `tools/art/` if the route is approved:
  `_candidates/slice-b-npc-parts/_scripts/{key,diff,fit,check,compose}.js`.
- Rig draft: `docs/art/slice-b/_body.v2.json`.
