# Characters: the full-body avatar and NPC system (plan v2, 2026-11-09)

Status: **PLAN, nothing commissioned.** This section replaces the bust plan of 2026-10-11
where the two disagree; the bust plan is kept below as the Appendix because its code (the
catalogue, `lookFor`, the compositor, the routes, the developer-only Edit Avatar modal, the
Avatar Lab) is art-agnostic and carries straight over. Companion docs:
`docs/art-pipeline-plan.md` (the generator, slice A and B findings), `docs/art/slice-b/npc-parts.md`
(the one experiment in generating parts as layers; its findings shape §6), `docs/art/deco.md`
and `docs/art/zoo-animals-plan.md` (the painterly loop every character must match).

## 0. The answer in one paragraph

One rig, two halves. The **head** is parts (face, eyes, hair, facial hair, hat: tinted,
blinking, exactly the bust system that already exists, with its art regenerated painterly).
The **body** is not parts: every clothing row is ONE painted drawing of the base body wearing
that outfit, with the exposed skin keyed into a tintable layer, so an outfit never has to be
cut out of anything. The figure stands one tile wide and one and a half tall, feet on the
tile's bottom edge, shoulders at its top edge, head in the tile above. It has **one pose**: a
three-quarter view turned a little toward the viewer's right, mirrored for left, unchanged
for up and down (the scheme Cult of the Lamb, Forager and Pixel Knight Online use). It
**moves as a puppet**: a bob, a lean and a foot shuffle computed from the still art, no
frames drawn. **Players** build themselves from parts; **named NPCs** are whole characters
drawn once each on the same rig, split head from body so they blink and walk the same way.
The style is landed first on four whole characters at 45 px on grass beside the barrel and
the cow, and only then are they deconstructed into the first parts.

## 1. The owner's framework, answered point by point

1. **Evolve avatar-plan.md.** Done here; the bust plan is the Appendix.
2. **The dev-only editor.** `AvatarModal` (Player panel, developer accounts) stays the
   picker; it composes through `lookFor` + `renderLook`, which do not care what a part
   looks like. It gains a full-figure preview and the body tab, nothing is thrown away.
3. **Land the style on three or four characters first, then deconstruct.** Agreed, and it
   is also how the model works best: whole characters come out consistent, parts drawn alone
   drift (npc-parts.md §3). Phase 1 is four whole characters; Phase 3 cuts them up.
4. **Not pixel art; match the animals.** The characters are generated with the same
   controls as every animal: the barrel for the camera, the Cow for the rendering, magenta
   for the cut. No game is imitated for the look. Games are cited below only for the
   scheme (pose and motion), never the drawing.
5. **Full body, toes to shoulders in the tile, head above.** The frame is 256 x 384
   (1 x 1.5 tiles): feet line at y 372, shoulder line at y ~128 (the tile's top edge), hair
   top near y 20, hats up to y 0. The rig is measured from the approved four (§3).
6. **Future requirements shape the style.** Three rules go into the Phase 1 prompts because
   they cannot be added later: the three-quarter pose (so one drawing serves four
   directions), the feet standing slightly apart on a flat ground line (so a foot can be cut
   and shuffled), and a plain closed silhouette with no trailing cloth or props outside the
   body (so the mirror flip and the puppet cuts stay clean).
7. **Skin tone, gender, hair style, face types, facial hair, eye colour, clothing.** All
   seven are slots or palettes in §4. Gender is the `body` choice (female or male), which
   picks the base body, the face set and the outfit cut; face types are two to three face
   rows per body. The pipeline per slot is §6; assembly is the existing compositor plus one
   new actor container on the board (§5).
8. **Eyes blink.** The head is its own sprite, so a blink is a texture swap of the head
   alone (two cached canvases per look, as the bust plan said). Whole-character NPCs get a
   lids overlay drawn at the rig's eye boxes, so they blink too.
9. **Walking without turning.** Yes, it looks fine, provided the motion is a puppet motion
   and the pose is three-quarter rather than dead-front. Forager and Cult of the Lamb both
   ship a single facing that mirrors, with a bob and lean instead of a walk cycle, and
   nobody reads it as sliding; Pixel Knight does the same with frames. What reads as
   sliding is a static picture translating with nothing moving on it, which is what we
   have today. So: no side or back views, ever, for parts; the rotation multiplier is 1.
10. **The feet-shuffle idea.** It is the second step of the puppet (§5, v2): the rig knows
    where the feet are, the build step cuts each outfit into torso, left foot and right foot
    (or left leg and right leg, from the knee, for trousers), and the renderer alternates
    them a few pixels while walking. Gowns set `feet: hidden` and sway instead. Trousers
    work because the cut is the lower leg, not the foot; at 45 px a two-position leg swing
    reads as walking (Stardew's whole walk cycle is four frames at 16 x 32).
11. **Forty unique characters instead of parts.** Half yes. The named NPCs (the 35 Citizens,
    Fairy, Santa, Porter, Oracle) ARE that lane: one whole drawing each, cheapest and most
    faithful, no parts budget spent on Caliban's build or the Mermaid's tail. Players still
    get parts, because the owner wants customisation and the head is the part of a figure
    that varies most and is cheapest to layer. The two lanes share the rig, the actor and
    the motion, so the board shows one kind of character.
12. **The Pixel Knight scheme.** Adopted (§2 D1), minus their frames: our frames are a
    puppet. Their one asymmetry (the weapon changes hands when you walk left) is accepted;
    every game with this scheme has it and nobody minds.

## 2. Decisions this plan proposes (owner to confirm)

- **D1. One pose, mirrored.** Three-quarter front, turned slightly to the viewer's right;
  left = `scale.x = -1`; up and down use the same drawing. This retires v1 decision 5 (no
  flip) and the `artFacing: 'front'` rule for busts. Every character is drawn right-turned
  so the flip rule is one line.
- **D2. The frame.** 256 x 384, one tile wide, one and a half tall; feet line y 372, the
  tile's top edge (shoulders) y 128. Atlas slot 384 square (the figure centred
  horizontally), anchored at the feet like `artSpan` art. Big builds (Caliban, the Bear
  enemies later) may use `artScale` above 1 on the same frame.
- **D3. Head and body are separate layers on one rig,** split at the neck socket (a line and
  a width the rig fixes per body). The head composes at 256 px for the DOM (header, Profile,
  Leaderboard) and is placed on the body at the socket on the board.
- **D4. The body is the outfit.** A clothing row's art is the whole dressed body below the
  socket (arms, hands, legs, feet included), drawn once per body (female and male). No
  "skin" body layer under it; "No Clothes" is the base body in its shift. Exposed skin in
  the drawing is keyed into a second file tinted by `skinTone` (`file2` / `tint2`, which the
  catalogue already has). Armour rows are outfit rows (`avatarTop` on the weapon/armour row
  as before).
- **D5. Two lanes, one rig.** Players: parts. Named NPCs: whole characters (a resource row
  keeps `filename`, pointing at a figure drawn on the rig, plus `headFile` for the blinking
  head or a `faceBox` for the lids overlay). Enemies are a third lane, creatures, drawn
  side-on like the farm animals, outside this plan.
- **D6. Motion is a puppet, in two steps.** v1: bob and lean computed from the existing
  step tween (the NPC bob exists; the PC gets the same). v2: foot or lower-leg pieces cut
  by the rig boxes at atlas-build time, alternated while walking. Generated walk frames are
  not planned; §8 says what would make us reach for them.
- **D7. Two bodies, outfits per body, faces per body.** Female and male base bodies; an
  outfit is two drawings (one per body) or is marked for one body only; two face types per
  body at launch (round, long), each face naming its eyes as today.
- **D8. Blink by head swap.** Parts heads: the open and closed head canvases. Whole NPCs: a
  lids overlay generated once per character, placed by the rig's eye boxes.
- **D9. Style = the animals' loop.** Barrel camera, Cow rendering, painterly whimsical, full
  daylight, magenta cut, `finish.py` seat and defringe; the proportion reference is the
  approved slice A Gertrude (about four heads, adult build, big head) redrawn in this
  rendering. The first approved character replaces that prose as the reference (the
  pipeline's standing rule).
- **D10. The v1 scaffolding stays; the salvage tools retire.** Keep `avatarLook.js`,
  `avatarCompositor.js`, `AvatarModal.js`, the two tuning sheets, the routes, the Lab,
  `render.js`. Retire `deconstruct.js`, `assemble.js` and the recipes (parts cut from the
  flat Citizen busts), and the 18 prototype parts they produced, once the first painterly
  parts exist. The 29 legacy `pc-*.svg` icons and `PlayerIcons.json` go in Phase 5 as v1
  §3 D said.

## 3. The rig v3

Measured, not designed: once the four Phase 1 characters are approved, `tools/art/measure.js`
and colour scans (the method of npc-parts.md §1) give per-body landmarks, written to
`tools/avatar/recipes/_body.json` v3 (the v2 draft in `docs/art/slice-b/_body.v2.json` is the
template; its numbers came from the elsinore-style figures and will move):

| landmark | used by |
|---|---|
| feet line, feet boxes (left, right), lower-leg boxes | anchor, the foot shuffle cut, the check |
| shoulder line = the tile's top edge, torso box, arm columns | the outfit mask, the check |
| hand boxes (left, right) | the `hand` slot (held weapon), drawn at the right hand |
| neck socket (y, x range) | the head/body split; the head's placement |
| chin, jaw outline, eye line and eye boxes, brow, hair band, crown | face/eyes/beard/hair/hat masks, the lids overlay, the blink |
| contact shadow box | part of the body drawing, kept |

From it (`tools/avatar/figure-rig.json`, done 2026-11-09, §7b), `tools/art/guides.js` draws the pose guide for generation: the magenta field, the
1 x 1 tile box with the half-tile headroom marked, and (once a base body exists) a faint
ghost of it, so a whole character or an outfit lands at the right size and place. The rig is
one JSON; the guides, the masks, the cut boxes and the Lab overlay are all drawn from it.

## 4. Slots and z order (v3)

Back to front. "Group" says which composite the layer belongs to.

| z | slot | group | tint | art | notes |
|---|---|---|---|---|---|
| 0 | hairBack | head | hairColor | per hair row, optional | hair behind the shoulders, drawn behind the body |
| 1 | body | body | file2 = skinTone | one drawing per outfit row per body | the outfit IS the body; `feet: hidden` for gowns; armour rows live here |
| 2 | hand | body | none | per weapon family | the held item at the right hand box; armed grid kinds only (v1 decision 3) |
| 3 | face | head | skinTone | per face row per body | the bald head and neck down to the socket; names its eyes |
| 4 | eyes | head | eyeColor (iris) | per face | open; `blinkFile` = the lids |
| 5 | facialHair | head | hairColor | per beard row | cut to the jaw of the body it is drawn on; `fileMale` as today |
| 6 | hairFront | head | hairColor | per hair row | `underHat` variant as today |
| 7 | hat | head | none | per hat row | `hidesHair` as today |

The spec (`player.avatar`) keeps v1's keys and adds `body` (female / male, replacing the
skin row's implicit body) and `outfit` (replacing `top`). `lookFor` returns two layer lists,
`head` and `body`, plus their blink variant; `renderLook` draws each; the actor places them.
Slot folders: `public/assets/avatar/<slot>/`, PNG with alpha (the atlas `avatar/` namespace
already takes PNG). Palettes stay `avatarPalettes.json`; the tint rule stays multiply, so
faces are drawn at the lightest tone and hair in near-white grey (npc-parts.md §4, D7: the
palette becomes relative).

## 5. Runtime: the actor

One Pixi `Container` per character (the PC and every Citizen; enemies keep their path):

- children: `body` sprite (later: `torso`, `footL`, `footR`), `head` sprite, optional
  `hand`; the container's pivot is the feet line, placed at the tile's bottom-centre;
  `zIndex = actorZ(feetRow)` as today.
- facing: `container.scale.x = facing < 0 ? -1 : 1` on a horizontal step (the NPC renderer's
  flip, now applied to the PC too, with the art always drawn right-turned).
- walking: from the step tween's `progress` (both renderers have it): `y` bob
  `sin(progress * PI) * TILE * 0.06` (exists), a lean of 3 to 4 degrees into the direction
  of travel that eases out on arrival, and in v2 the foot pieces alternating ±2 px with a
  tiny rotation; standing still: nothing moves except the blink.
- blink: one shared timer; each actor has a seeded phase (the NPC step jitter's seed), closes
  for ~120 ms every 3 to 6 s by swapping the head texture; whole NPCs draw the lids overlay
  sprite instead.
- states: dead, camping and boat stay whole-icon swaps (v1 decision 6); low health tints the
  container green through `CombatFX`'s rest-tint rule (v1 §2.5); the lunge and hit flash act
  on the container, so `CombatFX.registerPC` is unchanged.
- textures: the compositor's canvases, cached per look (one body canvas, two head canvases);
  raise `MAX_CACHED` to cover a town of 20 Citizens plus the PC. Whole NPCs come from the
  atlas directly (`resources/<file>` as today) with the head cut by the socket at atlas
  build, so they blink without a compositor pass.
- DOM: `AvatarImage` shows the head composite at 256 (header, Profile, Player and Combat
  panels, Leaderboard, Market, settlement cell) and the full figure in the picker.

## 6. The pipeline per kind of art

All through `tools/art/generate.js` with the whimsical style, `cutout.js` and `finish.py`;
new scripts are named where needed. Every call attaches the barrel (camera), the Cow
(rendering), the pose guide (placement) and, for anything after Phase 1, the approved
character it must match.

- **Whole character** (Phase 1 prototypes, every named NPC): one image, two candidates,
  magenta, cut, finished, presented on grass at 45 px beside the barrel and the Cow. Proven
  on both styles (slice A Gertrude and Hotspur; the farm animals and zoo for this
  rendering).
- **Base bodies** (one per body): "the same person, bald, in a plain sleeveless shift in
  undyed tan, the lightest skin tone, bare feet, same size and place" from an approved
  character. Proven (npc-parts.md: two of two landed within 3 % of the source). The shift is
  not white, so near-white hair can be told from it (that experiment's D4).
- **Faces**: the base body's head, cut at the socket (deterministic, no generation); a
  second face type per body by "the same head, rounder / longer face" worn on the base.
  Eyes: the iris keyed out of the face into `file2`; the lids drawn once per face ("the same
  head with eyes closed") and diffed inside the eye boxes only.
- **Outfits and armour**: "the base body wearing X" drawn on the base body (proven: the robe
  came back in place). Then: head removed at the socket, skin pixels keyed by the base
  tone's hue into `file2` (the defringe keyer's hue test, restricted to the rig's skin-
  plausible boxes: hands, neck, lower legs, so tan leather on the torso survives). No
  subtraction. Two drawings per outfit (female, male). Probe first (§7, P3).
- **Hair, facial hair, hats**: worn-then-subtracted at HEAD scale (the head region of the
  base body cropped and sent at 1024 px, which gives the model three times the pixels it
  had for the whole figure in the experiment): "redraw this head exactly and add only the
  hair, in near-white grey". Diff with the 3 px tolerance, drop small blobs, erode 1 px
  where the layer touches skin (the halo fix the experiment named). Alternative probed in
  P3: a mannequin head whose scalp is flat green in the guide, keyed like the background.
  `underHat` and `hidesHair` rules as in v1 §2.3.
- **Hands (held weapons)**: one drawing per weapon family at the right hand box, on the
  base body, subtracted; ~10 drawings for 20 weapon rows.
- **Checks** (`tools/art/check.js`, from the rig): head top and feet line within 3 % of the
  base; outfit pixels inside the body footprint plus a collar tolerance and covering the
  socket line; hair inside the hair band to shoulder band and nothing in the face below the
  eye line; beard on and under the jaw only; every layer's same lighting (stated, not
  measured). A failed candidate never reaches the sheet.

Budget (gpt-image-2 medium, two candidates each unless noted): 4 prototypes (8) + 2 bases
(6) + 4 faces (8) + 10 hair (20) + 4 beards (8) + 6 hats (12) + 8 outfits x 2 bodies (32) +
7 armours x 2 (28) + 10 hands (20) + 39 named NPCs (78) + lids and probes (~20) = about 240
images, around $15 to $25 at current prices, spread over five phases. Money is not the
constraint; **review rounds are**: each gate is one grass sheet the owner looks at, and the
plan is ordered so each gate unblocks the most art.

## 7. Phases and gates

| phase | what | images | gate |
|---|---|---|---|
| P1 Style lock | Four whole characters, right-turned three-quarter, on the rig frame: a peasant woman and a peasant man (the two starter looks), Gertrude (an NPC port, to see a known face survive the rendering), Kent (beard and hat). The peasant woman also dead-front, as the one A/B for D1. | ~10 | the owner picks a rendering, a pose and a proportion; the winners become the character bible |
| P2 Rig v3 | measure the four, write `_body.json` v3, draw the pose guide and the masks, the Lab overlay | 0 | none (a doc and a JSON) |
| P3 Bases and probes | the two base bodies; the skin-key probe (one outfit through D4); the hair probe both routes (head-scale subtraction vs green-scalp mannequin); faces cut; lids | ~20 | the owner approves the bases and the two probe results on a sheet; the losing hair route is dropped |
| P4 Starter parts set | 10 hair, 4 beards, 6 hats, 8 outfits x 2, 7 armours x 2, 10 hands, 2nd face per body | ~130 | one sheet per slot, composited on the base body; picks and regenerates |
| P5 Runtime and release | the actor container; `lookFor` two groups; `AvatarModal` to players (Profile, Player panel, FTUE beat); routes and per-part entitlement (v1 §2.6-2.7); migration (v1 §6); retire `PlayerIcons.json`, `pc-*.svg`, the salvage tools | 0 | ships |
| P6 Named NPCs | 39 whole characters, one at a time, oldest emoji first (Fairy, Santa, Porter, Oracle), then the Citizens; each row switches `filename` to its figure and gains `headFile` | ~80 | per batch of ~8 on grass |
| P7 Foot shuffle | the cut at atlas build, the alternation in the actor; gowns sway | 0 | a short screen recording |

P1 can start the day the owner confirms D1 and D9. P2 to P4 follow in order; P5 can be
written in parallel with P4 (it needs only the bases and one outfit). P6 is independent of
P4 and P5 and can run whenever the owner wants to spend review time on it.

### 7a. Phase 1 run (2026-11-09)

`tools/art/jobs/characters-r1.json`: ten panels, all gpt-image-2 medium, about 30 s each
(`tools/art/_candidates/characters-r1/`; sheets `characters-r1-grass.jpg` at 45 px,
`-grass-2x.jpg` at 90 px, `-panels.jpg` at full size, beside the Cow and the barrel). New
tooling: `guides/figure-cut.png` (the 1 x 1 box with a dashed half-tile headroom box, on
magenta) and `tools/art/figurecut.js` (key, drop the redrawn guide specks and the magenta
pockets between arm and body, fit the art's own box to the 1 x 1.5 frame, feet on the tile
bottom, 512 square at artSpan 1.5). Findings before the owner's review:

- **The rendering landed first time**: all ten match the animals' painterly look and each
  other (the Cow as rendering reference does for characters what it did for the zoo).
- **The model ignores the box for scale**, as it does for buildings: every figure came back
  2.2 to 2.7 tiles tall in the panel. The cut fits by the art's height instead, so the figure
  is always 1.5 tiles tall and its width follows (0.51 to 0.69 tiles across the sleeves).
  Kent's top hat is part of that height, so his body stands shorter; a hat rule for the rig
  (hats above the headroom allowed, or figures measured hair-to-feet) is a P2 decision.
- **The three-quarter turn is faint.** Asked for a body turned to the viewer's right, the
  model turned the head and eyes a little and left the shoulders nearly square; the two
  dead-front A/B panels are hard to tell from the three-quarter ones. For the mirror scheme
  a faint turn is still a turn (the eyes and the near foot give the direction), and it
  keeps up and down walking honest; a stronger turn ("the left shoulder forward, 30
  degrees") is one prompt change if the owner wants it.

### 7b. Phase 1 closed, Phase 2 done (2026-11-09)

**The character bible** (`node tools/art/approve.js --job <job> --list`): Gertrude
`characters-r1 painterly-gertrude-1` (the owner's pick for build: "bigger heads and a little
cuter", about three heads tall; the round 1 figures read too realistically proportioned,
"a bit dead"), the peasant woman `characters-r2 painterly-peasant-woman-2`, the peasant man
`characters-r3 painterly-peasant-man-2` and Kent `characters-r3 painterly-kent-2` (round 2's
men came back as boys; round 3 asked for grown adults in the same doll proportion, with the
approved woman as a second adult reference, and landed). Faint three-quarter turn kept
(D1). Once a thing is approved it replaces the prose that described it: every later
character call attaches the approved figure of its body as the character reference.

**The rig** is `tools/avatar/figure-rig.json`: frame 256 x 384 (tile y 128..384, headroom
above), feet line 377, per body (female from Gertrude and the woman, male from the man and
Kent): hair top, brow, eye line and eye centres, face and head x ranges, mouth, chin, neck
box (the socket), collar, shoulder line and width, torso, arms, hands, widest row, hem,
legs (male) and feet boxes. Measured by eye on gridded read-outs (`node
tools/avatar/figure-rig.js --grid --in <dir>`) after an automatic pixel-class pass
(skin / sclera / dark) proved unreliable on painterly art (the apron, the beard and the
boots all passed for skin); the overlay (`--overlay`) draws the rig over any figure square
for the check, `tools/art/_candidates/rig-v3/rig-v3-overlays.jpg` is the four approved
figures under it. Findings: the women's chin sits at y 118 and the men's at 110, the
shoulder line lands on the tile's top edge (y 130 / 126) as D2 wanted, hands hang at y
227..250 (female) and 240..275 (male), feet fill y 358..378; the figures stand 0.5 to 0.6
tiles wide at the shoulders. `recipes/_body.json` (the bust rig) stays untouched until the
bust tools retire (D10). Next: P3, the base bodies from the approved woman and man.

### 7c. Phase 3 run (2026-11-09): bases and probes

Board scale: the figure avatars ship at **artSpan 1.8** (owner: "fill the tile a little more");
the rig's frame units are unchanged, only the on-board multiplier moved from 1.5 to 1.8.

**Base bodies** (`tools/art/jobs/bases-r1.json`, three each from the approved woman and man:
bald, clean-shaven, tan undershift, lightest tone, bare feet, "same size and place"): all six
landed within a few units of their source (`figurecut.js --like <source sidecar>` cuts the base
with the source's exact transform, and a ghost overlay checks it). Picked female-3 and male-2
(`bases-r1/approved`). The tan shift was the right call: it never confuses the grey-hair diff.

**Probes** (`probes-r1.json`, `probes-r1b.json`), with the findings that decide the pipeline:

- **Everything hinges on alignment, not on the prompt.** Asked to redraw the base "exactly,
  pixel for pixel" and add one thing, gpt-image-2 keeps the drawing but moves it: head crops
  came back 0.88 to 1.07 times the size and up to 70 px off, full figures up to 80 px off.
  Half the candidates failed extraction for that reason alone. An alignment step (find the two
  pupils in the redraw and in the base, scale and translate the redraw so they coincide) rescued
  every one of them whose eyes were found: 7 of 9. So the pipeline gets an `align` step before
  any diff or key, and a candidate whose eyes cannot be found is rejected automatically. The
  prototype pupil finder (dark blobs on one row) misread one panel; the production step should
  template-match the base's head instead, which is deterministic and cannot pick a brow.
- **Hair: head-scale worn-then-subtract WINS.** The 1024 px crop of the base's head and
  shoulders, "redraw exactly and add only the hair in near-white grey", keyed, aligned, diffed
  against the base (3 px tolerance, neutral-grey pixels only), specks dropped: three of four
  candidates gave a clean hair layer that tints to brown, blonde and black on the bald base with
  no halo and no holes (the fourth redrew a different head shape and is a reject). The
  **green-scalp mannequin route is dropped**: the model painted hair over the whole green mask
  every time, so no green survived to key and the layer came from the same diff anyway.
- **Lids: solved.** "The same head with the eyes closed", cropped to the rig's eye boxes
  (widened 1.3 x 1.6), composites as a blink with no visible seam; the layer is skin and takes
  the skin tint. Both candidates usable.
- **Outfits: the body-is-the-outfit route works, with one rule.** Without the figure guide the
  building-style preamble made the model draw a HOUSE beside a tiny figure (two of two): every
  character call attaches `guides/figure-cut.png` and says "one figure only". With it, the
  worn figure came back in place; after alignment the head above the collar is dropped, the
  skin inside the rig's hand (and, female, foot) boxes is keyed to a neutral `skin` layer and
  the rest is the `cloth` layer. Female-1 and male-1 composite with the base's head at three
  skin tones with the hands and face matching; female-2 (eye finder misread) and male-2 (the
  model drew it 20 % bigger, eyes not found) are rejects. Skin keying inside the rig boxes
  caught no cloth: the tan apron and brown belt survived untouched.
- **Rejection rate**: 4 of 12 extraction candidates, all for drift. Two candidates per part
  is the right budget; the checker rejects, the owner sees only survivors.

**Decisions taken (within D1 to D10):** hair / beard / hat by head-scale subtraction with
alignment; outfits worn and split; lids per face; the green mannequin dropped; the figure guide
on every character call. **For the owner:** the review sheet (`phase3-review.jpg`): the two
bases, one hair in three tints, the blink pair, the two outfits at three skin tones. If the
bases and the composites pass, P4 (the starter set) can start, with `tools/art/parts.js`
promoted from the probe scripts (`align`, `diff`, `split`, `lids`) first.

### 7d. Phase 4 started (2026-11-09), reordered: NPCs first

Owner's direction on approving the bases and the composites: **the skin tones are too strong
and will be iterated later** (the tint palette, `avatarPalettes.json`, is data; the probe
multiplied a flat swatch into an already-peach base, and the production face base is
neutralised first, so expect the whole scale to shift lighter). **Update the game as we go
when it is real work, never a demo.** **Start the content with the named NPCs**, so the
cast is covered, then choose the player parts from what they needed; the current busts are
a starting point, not a constraint; variety in hair colour and skin tone, no racial
stereotypes. The casting table and batch order are `docs/art/npc-casting.md`.

Done the same day, all in game: the player figure **mirrors when the player last moved left**
(`PixiRendererPCs.js`, D1; busts and emoji never flip); **NPC rows take `artSpan`** (the square
stands on its tile through the sprite anchor, `anchor.y = 1 - 0.5 / span`, so the tween, the
z-sort and CombatFX are untouched); **Kent and Gertrude stand in the Town as their approved
figures** (`npc-figure-kent.svg`, `npc-figure-gertrude.svg`, `artSpan 1.8`, `artFacing right`,
with the bust kept in `iconFile` for panels and quest cards until the head crop replaces it).
That is the install pattern for every NPC from here: approve, `figurecut.js`, copy to
`resources/npc-figure-<name>.{png,svg}`, three row fields, `build:atlas`.

Batch 1 (`npcs-r1.json`): Portia, Juliet, Hotspur, Falstaff, Prospero, Helena, Feste, the
Doctor, two each, cast per the table; refs = the Cow, the approved farm woman or man for the
body, the rasterised bust for likeness, the figure guide.

### 7e. The named cast is complete (2026-11-09)

Four NPC batches in one day (`npcs-r1` to `npcs-r5`, docs/art/npc-casting.md): all 34 named
NPCs stand on the board as whole figures at `artSpan 1.8` (the Fairy 1.2), `artFacing right`,
busts kept in `iconFile` for panels. Santa Claus was removed from the resource list. Lessons
that go into the parts phase: one candidate per subject is enough once the references are
right (one API failure in 43 calls, zero style misses, only taste redraws); the figure guide
and "one figure only" are mandatory; profession costumes are written in fairy-tale terms;
purples survive the keyer when asked as bluish; a figure may spill past its tile
(`figurecut.js --fit height`).

What the NPC lane still owes: **head crops** (the socket cut of each figure) so panels, quest
cards and speech bubbles show the new faces instead of the old busts, which lands with P5's
actor work (the same cut feeds the blink). **Next:** P4b, the player parts set, choosing the
slots from what the cast needed (hair 10, beards 4, hats 6, outfits 8 x 2, armour 7 x 2,
hands), with `tools/art/parts.js` promoted from the Phase 3 probe scripts first, and the
skin-tone palette iterated on the neutralised base (owner's note).

### 7f. The cast in the panels, and three board fixes (2026-11-09)

- **Head crops**: `tools/art/headcrop.js --all` cuts a 256 px head-and-shoulders portrait
  (`npc-head-<name>.{png,svg}`) out of every figure square (a square of 236 px centred on the
  head's opaque centre over the top 170 rows, so a hat or the faint turn does not pull it off
  the face). Every figure row's `iconFile` is its head crop, so the NPC panel title, the story
  modal, quest cards, the relationship chips (`NPCConnections.js`, the other character's head
  instead of the matrix glyph), the clues modal title, the FTUE sprites, the Snug lesson toast
  and the start-screen map all show the new faces; the six "X's Secret" items took the heads
  too. **The 30 old bust files are deleted**; the farm animals keep theirs. The NPC rows keep
  their emoji `symbol` for now: `Conversation.js` still matches NPCs by symbol in the Talk
  round and the quest files carry the giver's glyph, so the symbols go when those read the
  type instead (a P5 item).
- **Facing** is one shared value in `PlayerMovement.js` (`getPlayerFacing`, `setPlayerFacing`,
  `facePlayerToward`): every horizontal step sets it (a blocked step too), tapping an NPC or
  arriving at one through a walk-up turns the player toward it, and the PC renderer only
  reads it. The flicker came from guessing facing out of render-position deltas: at the start
  of every step the logical tile jumps ahead of the tween, so the delta flipped sign for one
  frame.
- **Headline glyphs and speech bubbles** ride above a figure's head: `NPCVFX.setHeadlineSpan`
  (registered by the renderer per NPC) lifts Zzz / ?? to span - 0.35 tiles above the centre;
  `PixiRendererSpeech` lifts bubbles and outcome badges by (span - 1) tiles for NPCs and for
  the player's figure icon (`playerIconSpan`).
- **Taps hit the whole figure**: `findNpcAtScreen` tests every NPC's rendered square (span
  tall, up to 1.2 wide, nearest feet win) before the tile under the finger, for clicks, hover
  tooltips and the long-press tooltip; enemies keep their half-tile slack box.

### 7g. P4b: the starter catalogue composes in the editor (2026-11-09)

Owner: "much smaller to start, a couple of options per part per gender". The catalogue
(`tuning/avatarParts.json`, 20 rows): two bodies (the faces `face-f-01` / `face-m-01`, each
naming its lids row as the blink), hair bun + long wavy (f) and short + swept back (m), one full
beard, a straw hat (f) and a flat cap (m), the shift (No Clothes) plus two outfits per body
(peasant dress and blue gown; green tunic and vest with shirt). Ten new images
(`jobs/parts-r1.json`, one each) plus what the Phase 3 probes had already made. Stubble was
tried and is too faint for the diff. Palettes are now RELATIVE (`tuning/avatarPalettes.json`:
the lightest tone is #FFFFFF, the art as drawn), six skin tones, six hair colours.

**The v1 schema fit without a code change to `lookFor`**: a `skin` row is the face above the
collar (tinted), its `eyes` row carries only `blinkFile` (the lids, skin-tinted), a `top` row is
the outfit as `file` (cloth) + `file2` (the exposed skin, `tint2: skinTone`), hair / beard / hat
rows as before; every file is a 512 px figure square (artSpan 1.5 frame), head parts pasted
back into it from the head-crop frame. What changed: parts carry `body`, and `partsFor` /
`bodyOf` / `withEyes` (client) and the server's default spec keep every slot on the chosen
face's body (switching the face to Man swaps the dress for the male shift and the bun for the
short hair). The dev-only Edit Avatar modal composes it all, with the blink, and Save
validates on the server.

**`tools/art/parts.js` lessons**: the grey-only filter in `diff` killed silver hair with a warm
tint (and the old prototype's white shift problem never came back with the tan shift); the
right tools are a morphological opening (`--open 1`, erode then dilate: a redraw's 1 to 2 px
outline slivers along the face and shoulders vanish, the hair mass stays) and an edge
defringe (`--defringe`: skin-coloured pixels on the layer's own edge, the peach line where
the hairline moved). The skin layer of an outfit keeps the base's own peach (not neutralised):
one skinTone multiplier then lands the face and the hands on the same colour.

**Editor review (owner 2026-11-10), all done.** The Body tab shows the female and male signs
(both previews used to draw the CURRENT body); every other tab shows a close-up crop of the
composed figure wearing that part (`CROP` in `AvatarModal.js`: the head for hair, facial hair,
hat and eyes; below the neck for clothes); the Eyes tab has one head close-up; the stage is
half as wide, 128 x 256, since a figure is about 1 x 2. **Asset repairs, both in `parts.js`
`diff`:** `--fill` fills holes fully enclosed by the layer and under 12 % of its area from the
redraw (the diff drops a part's pixels wherever they match the base within tolerance: straw
against skin, a hair highlight against the scalp; the short male hair and the straw hat were
see-through in patches), and `--faceclear <body>` removes the forehead a redraw shades under a
brim (inside the rig's head column from the hairline to the chin: bright peach always, every
skin-hued pixel when the hat's own dominant hue is not orange-brown), which would otherwise
stay light on a dark face because hats are not tinted. Order matters: fill, then face clear.

**An outfit never changes the figure's height (owner 2026-11-10).** The first green tunic
made the man taller: aligned at the head, its body ran about 55 px (11 %) past the frame
bottom, boots clipped. It was the one outfit from the early probe, drawn WITHOUT the figure
guide, and the model gave it longer legs; the three drawn with the guide were within 3 %.
Two fixes: the tunic was redrawn with the guide (`jobs/parts-r2.json`), and `parts.js fitbody`
is now a step of every outfit: `align --overflow 160` keeps the rows a longer body needs, then
`fitbody` copies the rows above the collar and resamples collar .. the redraw's lowest opaque
row onto collar .. the base body's lowest row (vertical only: shoulders and hands keep matching
the head and the rig boxes). All six bodies (two shifts, four outfits) now share one top and
one bottom row. Pipeline for an outfit: `figurecut` → `align --overflow` → `fitbody` → `split`.

**Eye colour works (owner 2026-11-10).** The eyes are painted into the face, so
`parts.js iris` lifts the coloured ring around each pupil into its own layer
(`eyes/iris-<body>-01.png`): the pupils come from `findEyes` (the rig's eye boxes sit a few
units off on a base body), the iris radius is the largest ring that is at least 45 % iris-like
(not the black pupil or lash line, not the white of the eye or the highlight, not skin), both
eyes share the larger radius (the far eye of a turned face is clipped by its outline), and the
ring is neutralised to grey with gamma 0.6 so a multiply does not turn every colour murky.
The eyes row carries it as `file` with `tint: eyeColor` (drawn over the face; the blink frame
still replaces it with the lids). Six eye colours in `avatarPalettes.json`: blue, green, brown,
hazel, grey, amber. No generation needed: a new face gets its iris by running the command.

**Idle breathing (owner 2026-11-10).** Standing figures breathe; walking ones do not (they
have the bob). The established ways are two: squash and stretch about the ground contact for a
single sprite, and a rig's breath deformer on the upper body (Live2D's ParamBreath cycling
0..1, Character Animator's Breathe scaling the chest). The first pass was the single-sprite
stretch alone; the owner's review: "a little too much vertical stretch, and not enough
horizontal chest expansion; these need to happen at the same time". So the breath is now a
real deformation with two parts on one curve (`Render/PixiRenderer/breathing.js`, `BREATH`:
3.6 s, inhale 40 %, exhale 45 %, a pause; each figure its own phase and a period within 12 %):
the figure RISES 1.2 % of its height (75 % of the first pass), a stretch pivoted at the feet,
and the CHEST EXPANDS 5.5 % of its width (first 3 %; owner: "go bigger") through a bell weight (`breathBell`: centred 0.44 down
the figure square, spread 0.12, so the shoulders get about half and the head, knees and feet
nothing). The feet never move in either direction.

How it is drawn: `BreathSprite.js` is a Pixi Sprite whose quad becomes a strip of 16 rows while
`breath` is above 0. Pixi's batch renderer draws whatever `vertexData`, `uvs` and `indices` an
element hands it, so the deformation lives entirely in `calculateVertices` (rows lifted from the
square's bottom edge, widened about its centre line); position, scale, anchor, tint, the facing
flip and CombatFX are untouched, and at `breath` 0 it is exactly a Sprite. NPC sprites and the
player's pooled sprite are BreathSprites; one ticker per renderer sets `breath =
breathLevel(now, seed)` for standing figures and 0 for walking ones; enemies never breathe
(CombatFX owns them). The Edit Avatar stage (`BreathingFigure` in AvatarModal.js) draws the same
strips on a canvas from the same constants. Measured live: at full inhale the head rises 1.2 %,
the chest row widens 3 %, the feet row's width and position are constant to the hundredth of
a pixel. `prefers-reduced-motion` turns it off; the legacy canvas renderer ignores vertexData,
so there a figure stands still.

**Breath, third pass, and blinking (owner 2026-11-10).** "The chest expansion more noticeable,
not stretching more vertically, and the head doesn't change size at all." The bell reached up
into the jaw (at chest 5.5 % the chin was widening about 1.5 %), and the feet-pivoted stretch
lengthened the head with everything else. Now `breathing.js breathDeform(x, v, L, top)` is the
one function both drawers call: above `top` (the figure's `breathTop`: where its head and neck
end) a point is only carried up by the rise of the shoulders under it, so the head is rigid;
below it the body stretches from the feet at the same 1.2 % rate, and the chest widens 9 % by a
bump that is zero at the top of the shoulders, peaks about 0.38 of the way down a span of 0.3 of
the square, and is zero again at the hips. `breathTop` is per figure, because a hat pushes a
head down: `parts.js eyes` derives it from the eye line and the gap between the eyes
(`eyeY + 1.6 gap`: these faces share one proportion) and it is stored on every figure row and
player figure icon (0.30 to 0.45; the editor uses 0.345 / 0.294 for the two bodies).
BreathSprite puts one strip row exactly on it. Numeric check at full inhale: head 0 % wider and
unchanged in height, chest peak +9 %, hips, knees and feet 0 %.

**Blinking.** Each figure's eyes close for 130 ms every 2.8 to 6.2 s, at a different moment in
each cycle (`breathing.js isBlinking`). The closed frame is made from the figure's own art by
`parts.js blink`: each eye an ellipse (sized from the eye gap) painted in the skin sampled
around it, feathered, with a lid arc in the eye's lash colour; so the lid matches the face on
every figure whatever its tone (Portia, the Oracle's blue, Caliban's green), and the avatar
faces' lids LAYER (`--layer`) takes the skin tint exactly as the face does. Eyes are found
automatically for 22 of 34 NPC figures; `tools/art/blink-eyes.json` places the other twelve
(and the farm man) by hand. Rows carry `blinkFile`, player icons `blinkFilename`; the tickers
swap textures.

**Next (P5)**: the board draws `player.avatar` (the PC renderer composes the look at 512 and
swaps the blink texture; the figure icons stay as the fallback), then the Change Avatar modal
becomes the editor for everyone, then the hand slot and armour.

## 8. Risks, and what would change the plan

- **The three-quarter pose reads no better than front at 45 px.** P1's A/B decides; if front
  wins, D1 becomes front with no flip and the weapon hand problem vanishes.
- **Skin keying misfires** on tan and leather clothes. Fallback: the rig's hand boxes get a
  tinted `hands` part per body (two small drawings) and outfits are prompted long-sleeved
  with hose or boots, so the only exposed skin is the hands and the neck.
- **Head-scale subtraction still halos.** Then the green-scalp mannequin, and failing that
  the slower route of generating each hair as a whole head (face included) and keying the
  face out by the rig's face mask, which is coarse but deterministic.
- **The puppet looks cheap.** v2 (foot pieces) is the answer before any frame is drawn. The
  only case for generated frames is a hero animation (a swing, a dig) and those would be
  per body, not per outfit, so still a small set.
- **Outfits per body double the clothing budget.** Accepted; it is what makes gender a real
  choice. An outfit may be single-body.
- **Mirror flip exposes asymmetry** (a parting, a shoulder bag). Accepted (point 12), and the
  prompts ask for symmetric clothing.
- **Memory.** Up to ~25 actors x 3 or 4 sprites and ~50 cached canvases at 256 to 384 px:
  well inside what the board holds today; the atlas sheets grow by one.

## 9. Not in scope

Side and back views; generated walk cycles; body shapes beyond the two bodies; expressions
and mouths; eye shapes; the enemy creatures (their own lane, side-on); the share image.

## 10. Next steps

1. The owner confirms D1 to D10, or marks the ones to change (D1 the flip and D5 the two
   lanes are the ones that reshape the work).
2. P1 job `tools/art/jobs/characters-r1.json` with the five subjects above, two candidates
   each, and a grass presentation at 45 px beside the barrel and the Cow. One review round,
   then P2 at once.

---

# Appendix: the bust plan of 2026-10-11 (v1), kept for what it built

Where the text below contradicts v2 (busts, the 256 square frame, no flip, the `skin` body
layer, `top`), v2 wins. Its §0 (what is built), §1 (the emoji icon code paths), §2.4 to §2.7
(compositor, equipment feed, picker, server), §3 D (retirement) and §6 (migration) stand.

## Parts-based avatar system: PLAN (2026-10-11)

The player avatar stops being one emoji picked from a list and becomes a head-and-shoulders
bust built from parts (skin tone, hair style, hair colour, eye colour, hat, clothes), in the
same look as the Citizen busts (`npc-kent.svg`, `npc-portia.svg` …). Equipment feeds it:
armour changes the clothes, an equipped weapon shows as a hand holding it, and weapons are
put away in Town and on the Homestead and drawn in the Valley.

Status: **slices 0 and 1 built 2026-10-12** (§3); nothing player-facing yet. The art pipeline
proper is a separate pass after the scaffolding (§9, decision 7); slice 1's prototype parts
come out of the existing Citizen busts.

### 0. What is built today (2026-10-12)

- **Assets**: `game-client/public/assets/avatar/` with `rig.svg` (guides), one folder per
  slot (`skin`, `hairBack`, `hairFront`, `facialHair`, `eyes`, `hat`, `top`, `hand`, `npc`),
  placeholder parts drawn to the rig (`*-01`), prototype parts assembled from the Citizen
  busts (`*-02`, `hair-03`), and `_lab/` (scratch: deconstruction candidates and render
  output, never committed, never atlased).
- **Catalogue**: `tuning/avatarParts.json` and `tuning/avatarPalettes.json`, editor sheets
  AVATAR PARTS and AVATAR COLOURS (§2.2); ECONOMY has `avatarTop` / `avatarHand` (empty).
- **Code**: `src/Avatar/avatarLook.js` (pure: z order, `defaultSpec`, `validateSpec`,
  `lookFor`, `equipFor`), `src/Avatar/avatarCompositor.js` (canvas + multiply tint, cached
  per look), `scripts/build-atlas.js` `avatar/` namespace, `Player.avatar` +
  `Player.avatarParts`, `utils/avatarCatalogue.js`, `POST /api/player/avatar`,
  `POST /api/player/avatar-part`. No client code calls any of it yet.
- **In-game developer preview (2026-10-14)**: the Player Character panel shows an **Edit
  Avatar** button under Change Avatar for developer accounts only
  (`GameFeatures/Social/PlayerPanel.js`). It opens `src/Avatar/AvatarModal.js`: the composed
  bust (blinking), a tab per slot with thumbnails of the current bust wearing each part, the
  swatches, the equipment line (the equipped weapon and armour, a grid-kind picker for the
  put-away rule), Starter look, Copy spec and Save (`POST /api/player/avatar`; the catalogue
  comes from `GET /api/avatar-catalogue` through `TuningManager.loadAvatarCatalogue`). The
  board does not draw the saved spec yet (slice 2).
- **Tools**: the editor's **Avatar Lab** tab (`tools/editor/client/tabs/avatarlab.js`;
  preview: launch `vvgame-editor-lab`, port 8772, or your own editor on 8770 after a
  restart) composes a bust from the sheets exactly as the game will; `tools/avatar/render.js`
  renders a spec, `--sheet` (every tone / colour / hair / hat / beard, open and blink) or
  `--parts` (every file alone over the rig) to PNG; `tools/avatar/deconstruct.js npc-x`
  splits a traced bust into colour groups (`_lab/npc-x/NN-hex.svg`, `groups.json`,
  `sheet.png`, `--zoom x,y,w,h` for a region); `tools/avatar/assemble.js --all` builds
  parts from `tools/avatar/recipes/*.json` (groups, region, maxArea, clip / clipEllipse /
  clipPath in source units, clipRig in rig units, mirror, offset, a per-include `source`,
  recolour keep / white / black / grey / lum, fit, under / extra).
- **Prototype set (slice 1, revised 2026-10-14)**: ONE face and ONE pair of eyes. The
  head is a traced outline of Gertrude's face (`tools/avatar/recipes/_head.json`: chin at
  source y 141, cheeks x 50..150, crown y 28; `skin-03`: that outline, a short neck, ears,
  her nose and mouth lines tinted with the skin, her chin shadow on the NECK only);
  `eyes-03` is her clean right eye mirrored (whites, lashes, brows as drawn; iris tinted;
  a blink frame). Hair: Juliet's bob with its crown filled in (`hair-02`), Gertrude's long
  hair (`hair-05`). Beard: Kent's beard mass cut to the base face's own jaw (`beard-03`,
  `clipRig` = the head outline, a curved top edge under the mouth, hanging a little below
  the chin). Clothes: Cassio's tunic (`top-02`, the base to perfect). Hats: Angelo's crown
  (`hat-02`) and Gertrude's tiara (`hat-03`, its shadow blob dropped so hair shows through
  the cut-outs), both paid. Hair, facial hair and hat have a None; face, eyes and clothes
  always have something. The starter look is the second-lightest skin tone. Hands stay
  placeholders (no weapon art in the busts).
- **Tools**: the editor's **Avatar Lab** tab (`tools/editor/client/tabs/avatarlab.js`;
  preview: launch `vvgame-editor-lab`, port 8772, or your own editor on 8770 after a
  restart) composes a bust from the sheets exactly as the game will; `tools/avatar/render.js`
  renders a spec, `--sheet` (every tone / colour / hair / hat / beard, open and blink) or
  `--parts` (every file alone over the rig) to PNG; `tools/avatar/deconstruct.js npc-x`
  splits a traced bust into colour groups (`_lab/npc-x/NN-hex.svg`, `groups.json`,
  `sheet.png`, `--zoom x,y,w,h` for a region); `tools/avatar/assemble.js --all` builds
  parts from `tools/avatar/recipes/*.json` (groups, region, clip / clipEllipse, mirror,
  recolour keep / white / black / grey / lum, fit, under / extra).
- **Prototype set (slice 1, revised 2026-10-14)**: ONE face and ONE pair of eyes, from
  Gertrude (`skin-03`: the head cut out of her silhouette as a bald head with ears and
  neck, her face lines tinted with it, six tones; `eyes-03`: her clean right eye mirrored,
  whites and lashes as drawn, brows, the iris tinted, a blink frame); hair: Juliet's bob
  (`hair-02`), Helena's leafy hair (`hair-03`), Gertrude's long hair (`hair-05`); Kent's
  beard clipped to a chin beard (`beard-02`); Cassio's tunic (`top-02`) and Gertrude's robe
  (`top-03`); Angelo's crown (`hat-02`) and Gertrude's tiara (`hat-03`), both paid. Hair,
  facial hair and hat have a None; face, eyes and clothes always have something. Hands stay placeholders (no weapon art in the busts).

### 1. What exists today (file:line)

| Piece | Where | Notes |
|---|---|---|
| Avatar field | `game-server/models/player.js:51` `icon: String`, default 😀; `avatarsUnlocked` (:114) | one emoji |
| Icon table | `game-client/src/Authentication/PlayerIcons.json` | 27 entries in `free` / `paid` / `platinum`, each `{ label, value (emoji), filename (pc-*.svg) }`; **Bunny points at `pc-octopus.svg`** (bug) |
| Art | `public/assets/playerIcons/pc-*.svg` (200×202), `public/assets/resources/npc-*.svg` (200×200) | busts fill the frame; atlas slot 256 px (`scripts/build-atlas.js:90-100`, namespace `playerIcons/`) |
| Picker | `UI/Modals/ChangeIconModal.js` | grid of emoji, 200 gems unlocks `paid` (`avatarsUnlocked`, Gold grandfathered :103), `freeOnly` for the FTUE beat (`FTUE.js:411`, `modalType: "icon"`); opened from `ProfilePanel.js:648` and `PlayerPanel.js:437` |
| Save | `Authentication/ChangeIcon.js` → `POST /update-profile { icon }` | the server accepts any string; only signup checks the free list (`routes/auth.js:55`) |
| Board render | `Render/PixiRenderer/PixiRendererPCs.js` | ONE pooled Sprite, texture = atlas `playerIcons/<file>` else Twemoji frame, `TILE_SIZE * 0.9`, anchor centre, **no facing flip**; state swaps the whole icon: 💀 dead, 🤢 hp < 100, 🏕️ camping, 🛶 boat (:72-76) |
| Combat hooks | `CombatFX.registerPC` (`PixiRendererPCs.js:268`) hands the display object to `playerLunge` / `playerHit` (tint flash) | works on any display object |
| Equip | `settings.equippedWeapon` / `settings.equippedArmor` (type strings), set by `Combat/CombatPanel.js:38-115` through `/update-profile { settings }` | weapon = `damage > 0`, armour = `armorclass > 0` (`utils/combatStats.js:14-15`, mirrored in `PlayersInGrid`) |
| Weapons / armour | `tuning/resources.json`, category `power` | 20 weapons (`ranged` flag), 9 "armours" of which **Sword of Song and Titania's Bow count as both** (they carry `armorclass`) |
| Grid kind | `currentPlayer.location.gtype` | `homestead` / `town` / `valley` / `dungeon` (the FTUE cave is a dungeon) |

Everything else that shows the avatar reads `icon` as TEXT:

- header avatar `<img>` from the svg map (`App.js:3159`, `:3392`)
- `ProfilePanel.js:106-203` (a free-text icon field in the profile form), `PlayerPanel.js:437`
- `CombatPanel.js:231` (`finalStats.icon`)
- `FTUE.js:429` (StoryModal symbol falls back to the player's icon)
- conversations: `Relationships/Conversation.js` `playerIcon` is the `player` topic (Greet shows it), drawn as a Pixi `Text` bubble by `PixiRendererSpeech.js`
- other players: `Leaderboard.js:120` (`{player.icon}`), `GlobalMarketModal.js:263,327`, from `/players` (`playerRoutes.js:1428` select)
- settlement / frontier view: `PixiRendererFrontierSettlements.js:116` (the "you are here" cell)
- chat stores no icon (nothing to do)

### 2. Target

#### 2.1 Data

```
player.avatar = {
  v: 1,
  skin:      'skin',            // one tintable art; the TONE is a palette id
  skinTone:  'tone-3',
  hair:      'hair-bob',        // style id (catalogue)
  hairColor: 'hair-auburn',     // palette id
  eyes:      'eyes-round',      // style id
  eyeColor:  'eye-green',       // palette id
  facialHair: null | 'beard-full', // own layer, takes hairColor
  hat:       null | 'hat-straw',
  top:       'top-tunic-blue',  // the clothes when no armour is equipped
}
player.avatarParts = ['hat-straw', …]   // paid parts this player has bought (per-part pricing)
```

- Part and colour values are **catalogue ids, never file names or hex**: the server can
  validate them, the editor can rename art, and colours stay on the palette.
- `icon` stays for one release as the legacy fallback (a player who never opens the new
  picker still shows their emoji) and is then retired (§6).
- Equipment is NOT in `avatar`: the look is derived at render time from `avatar` +
  `settings.equippedArmor` + `settings.equippedWeapon` + the grid kind.
- **Citizens use the same spec.** An NPC row in resources.json may carry an `avatar` spec
  (a JSON column, or `avatar*` columns on the ECONOMY sheet) instead of a `filename`; the
  renderer composes it exactly as the PC. Parts with `tier: 'npc'` exist for them (Kent's
  hat, Portia's robe) and never appear in the player's picker.

#### 2.2 Catalogue (tuning, editor sheet)

`game-server/tuning/avatarParts.json`, one row per part, edited in the VVGame Editor through
a definition in `tools/editor/sheets/definitions.js` (free sheet, validation, CSV import):

| column | meaning |
|---|---|
| `id` | persisted identifier (never renamed in place) |
| `slot` | `skin` / `hairBack` / `hairFront` / `facialHair` / `eyes` / `hat` / `top` / `hand` |
| `file`, `tint` | the drawing under `public/assets/avatar/<folder>/` and the palette slot multiplied into it (`skinTone` / `hairColor` / `eyeColor`, blank = drawn as is) |
| `fileMale` | a cut of `file` for the male body (the beard follows the male jaw) |
| `file2`, `tint2` | a second drawing over the first with its own tint (an iris over the eye whites, a skin-toned fist under a weapon) |
| `backFile` | hair only: the hairBack drawing (hair is ONE row: `file` = hairFront) |
| `underHat` | hair only: the hairFront drawing under a hat that `hidesHair` (blank = that hat covers the hair) |
| `body`, `eyes` | skin only: which body this face is (female / male) and the eyes part it always wears |
| `hidesHair` | hat only: true for a cap or hood that covers the head; false for a tiara or crown, which sits on the full hair |
| `blinkFile`, `blinkTint` | eyes only: the closed-lids drawing, replacing `file` + `file2` on the blink frame |
| `tier` | `free` / `paid` / `npc` (`npc` = Citizens only, never offered to players) |
| `gemcost` | paid parts: the price of THIS part (bought once, stored in `player.avatarParts`) |
| `label` | picker label (string key) |

`avatarPalettes.json`: named swatches per colour slot (`skinTone`, `hairColor`, `eyeColor`),
`{ id, hex, tier, gemcost }`. Facial hair takes `hairColor`.

Equipment mapping lives on the ECONOMY sheet (resources.json), two new columns:
`avatarTop` (armour → a `top` part id) and `avatarHand` (weapon → a `hand` part id). One hand
art per weapon FAMILY (sword, knife, bow, crossbow, spear, halberd, axe, darts) with a
per-weapon override when a weapon deserves its own (Dragonslayer, Titania's Bow).

#### 2.3 The rig and the art

- **The body contract** (`tools/avatar/recipes/_body.json`, 2026-10-14). One 256×256 frame.
  The BODY is one female head (traced from Gertrude), one male head (the shared crown with
  the Crafter's angled jaw, rounded corners, a slightly square chin), and the shared neck and
  bust (the tunic's outline, measured from its drawing). Every attachment conforms to these
  contours: hair covers the band from y 12 (Waves' top) to the crown at y ~42, hats sit on
  that band, clothes fill the bust's footprint and draw over the neck, beards are cut to the
  jaw, eyes sit on the eye line (y 122, x 96 / 160). `tools/avatar/rig.js` draws `rig.svg`
  (guides to draw over) and `public/assets/avatar/body.json` (the Lab's guides) from that
  file; `assemble.js` recipes read the same contours (`clipRig`). Edit `_body.json`, run
  `rig.js`, re-assemble: nothing else knows the numbers. The 200 px busts are fitted by
  `fit` (scale 1.28, `dy` per source so their eye line lands on y 122).
- **The skin part IS the body**: head, neck and bust in one skin-tinted drawing, so No
  Clothes shows the bare bust and every top covers the same footprint. A skin row names its
  `body` (female / male) and its `eyes`: the eyes follow the face (the Eyes tab is colour
  only). A part may carry `fileMale`, a cut of its main drawing for the male jaw (the beard).
- **Z order** (back to front): `hairBack` → `skin` (head and neck) → `top` (torso and
  collar, drawn OVER the neck) → `eyes` → `facialHair` → `hairFront` → `hat` → `hand`
  (bottom right, in front of the shoulder).
- **Look**: front-facing, storybook (the Citizen busts are the reference); no facing flip,
  ever, for any bust on this rig.
- **Colour by tint.** Tintable parts (skin, hair, iris) are drawn with WHITE fills, BLACK
  line work and grey shading. A multiply tint keeps black lines black, turns white into the
  swatch and greys into darker swatch: one hair drawing serves every hair colour, one skin
  drawing every tone. Hats and clothes are full-colour art (no tint), as armour will be.
- **Hair band.** No hair tops out above Waves (`hair-02`, rig y 12) and none ends above the
  head's own crown (rig y ~44), so every hairFront covers y 12..44 and hats are fitted to
  that band (Angelo's crown rim sits on it).
- **Two bodies**, Female (Gertrude's head; her nose and mouth) and Male (the Crafter's jaw;
  the Rancher's smile with teeth in an untinted `file2`, Gertrude's nose borrowed through an
  include's `source`); both wear the Rancher's ear lines on ellipse ears. Each names its eyes.
- **Hats over hair.** A hat draws over `hairFront`. A hat that covers the head (`hidesHair`)
  shows the hair's `underHat` variant (flattened) or hides the hair; a tiara or crown sits on
  the full hair. This is the one cross-part dependency and it is data, not code.
- **Mouth / expression** stays part of the skin drawing (one friendly expression); no eye
  shapes: eyes are one drawing per catalogue row with a colour from the palette.
- Atlas: `build-atlas.js` gets an `avatar/` namespace (`avatar/<slot>/<file>`, slot 256 px);
  the parts land in the committed sheets like everything else. **Never a per-combination
  frame**: the combinations are composed at runtime (§2.4).

Art budget for v1: skin 1 drawing + 6 tones; hair 8 to 10 styles (× a few `underHat`);
facial hair 4; eyes 1 open + 1 closed drawing, 5 colours; hats 6; tops 6 free + a few paid;
armour tops 7 (Padding, Light, Chainmail, Plate, Heavy, Mystic, Caliban's Breastplate);
hands: one row per weapon (20), many sharing a drawing (every short sword one file), so ~10
drawings. Then the Citizens' own parts as they move onto the rig. **The art itself is a
later pass** (decision 7): the scaffolding ships with a handful of placeholder parts drawn
to the rig so every path can be verified.

#### 2.4 The compositor (one module, two consumers)

`game-client/src/Avatar/avatarCompositor.js`:

- `lookFor(avatar, { equippedArmor, equippedWeapon, gtype })` → the resolved layer list
  `[ { frame, tint } … ]` and a **look key** (a short string of every input). Written for
  ANY bust: the PC and a Citizen go through the same call.
- `renderAvatar(look, size)` → a cached HTML canvas (256 px): draws each layer's atlas frame
  (or the raw svg before the atlas is built) in z order, tinted through an offscreen
  `multiply` pass. Cache by look key; a handful of canvases live at once.
- **Blinking**: every look renders TWO canvases, eyes open and eyes closed (`blinkFile`,
  lids in the skin tone). The board sprite shows the closed one for ~120 ms every 3 to 6 s
  (per-bust jitter, seeded like the NPC step cadence) from one shared timer in the renderer;
  DOM images never blink. Two cached textures per look, no per-frame drawing.
- Pixi: `PixiRendererPCs` keeps its ONE pooled sprite and sets `Texture.from(canvas)` (cached
  by look key, released on unmount like the svg cache today). `CombatFX.registerPC`, the
  lunge and the hit flash do not change. The NPC path in `PixiRenderer.js` uses the same
  textures for a Citizen whose resource row has an `avatar` spec.
- DOM: `<AvatarImage avatar equip size />` (`src/Avatar/AvatarImage.js`) draws the same
  canvas to a data URL for the header, Profile, Player panel, Combat panel, FTUE modal,
  Leaderboard, Global Market and the settlement cell. Other players are rendered from THEIR
  spec, so `/players` and the leaderboard payloads carry `avatar` next to `icon`.
- Speech bubbles: `PixiRendererSpeech` accepts a texture topic as well as an emoji, so the
  `player` topic (Greet) shows the player's own bust.

#### 2.5 Equipment feed and the put-away rule

- Clothes = `avatar.top` unless `settings.equippedArmor` maps to an `avatarTop`; then the
  armour's top replaces it, on every grid kind (decision 3).
- Hand = the equipped weapon's `avatarHand`, drawn only when the grid kind is in the ARMED
  set: `valley` and `dungeon` (the FTUE cave included) yes, `homestead` and `town` no.
- Changing equipment or grid kind changes the look key, so the sprite swaps on the next
  render; no extra state.
- States: dead / camping / boat keep today's whole-icon swap (💀 🏕️ 🛶 as Twemoji frames).
  **Low health is a green tint on the bust**, the same mechanism as the red combat flash
  (`CombatFX.playerHit` sets `obj.tint`): the resting tint becomes green while hp is under
  the threshold, and `restTint` reads that resting value so the red flash restores to green,
  not white.

#### 2.6 The picker

`ChangeIconModal` grows into `AvatarModal` (same mount points: Profile, Player panel, the
FTUE avatar beat with `freeOnly`):

- a live preview (`AvatarImage`) at the top, the slot tabs below (Skin, Hair, Eyes, Hat,
  Clothes); each tab a swatch or thumbnail grid (`AvatarImage` of just that layer on the
  current bust, so you see the hat ON your head);
- paid parts show a lock with their gem price; tapping buys THAT part (`gemcost`, spent
  through the one holdings rule, backpack first) and adds it to `player.avatarParts`.
  Players who already hold `avatarsUnlocked` (the old 200-gem unlock) or Gold get the v1
  launch set of paid parts written into `avatarParts` by the migration, so nothing they paid
  for is lost; parts added later are priced for everyone;
- Save → `POST /api/player/avatar { playerId, avatar }`: the server validates every id
  against the catalogue and the palettes and the tier against the player's entitlement,
  stores it, answers through `publicPlayer()`. `/update-profile` stops accepting `icon`
  and never accepts `avatar` (today anyone can POST any `icon`, including paid ones).
- The profile form's free-text icon field goes.
- Mobile: phone layout rules in `docs/ui-conventions.md` apply (full-screen panel box);
  the modal is a portal to `document.body` like every modal.

#### 2.7 Server

- `avatar` on the Player schema (object with the fields above) and `avatarParts: [String]`,
  default = the starter look (first free part of every slot, tone 3) and no bought parts.
- `POST /api/player/avatar-part { playerId, partId }`: buys one part (validates the id, the
  tier, the price, spends the gems server-side, appends to `avatarParts`).
- `utils/avatarCatalogue.js`: loads `avatarParts.json` + `avatarPalettes.json` at boot,
  `validateAvatar(spec, player)` (ids exist, slot matches, tier allowed).
- `POST /api/player/avatar` (above). `createPlayerAccount` gives the starter look.
- `/players`, leaderboard and market selects include `avatar`.

### 3. Build order (slices; each ships on its own)

(Re-cut 2026-10-12 into slices 0 to 6, see the session plan; 0 and 1 are built, §0.)

- **A. Rig + catalogue + compositor + board render.** Parts folders, `rig.svg`, the two JSON
  files and their editor sheet, the atlas namespace, `avatarCompositor.js` (any bust, two
  canvases per look), `PixiRendererPCs` drawing a default spec for everyone (legacy `icon`
  still shown when `avatar` is absent), blinking, the green low-health tint, the equipment
  feed and the put-away rule, placeholder parts drawn to the rig (a few per slot) so every
  path can be seen. Verifiable on the rehearsal copy with hand-edited specs.
- **B. The picker + routes + validation.** `AvatarModal`, `/player/avatar`,
  `/player/avatar-part`, per-part entitlement, FTUE beat switched to it.
- **C. The other surfaces.** `AvatarImage` in the header, Profile, Player and Combat panels,
  FTUE modal, Leaderboard, Market, settlement cell; speech-bubble textures; payloads carry
  `avatar`.
- **D. Retire the emoji.** Migration gives every player a look and writes the launch paid set
  into `avatarParts` for `avatarsUnlocked` / Gold players; `icon` leaves the render paths,
  `PlayerIcons.json` and `playerIcons/` go, the atlas drops the namespace.
- **E. The art pass** (decision 7): the real parts in the storybook look, drawn to the rig,
  with the tint convention for skin, hair, facial hair and lids; then the Citizens' busts
  rebuilt as specs with their `npc` parts, one Citizen at a time (a resource row switches
  from `filename` to `avatar`; both work meanwhile). Every later batch is a data drop: svg +
  a sheet row + `npm run build:atlas`.

### 4. Gotchas (found while scoping)

1. **Two items are weapon AND armour.** `isArmor` = `armorclass > 0`, so Sword of Song and
   Titania's Bow can be equipped as armour (`CombatPanel` lists them in both). With an
   `avatarTop` column they would need a "top" that is a sword. Decide whether they keep
   their `armorclass` as a stat but are never listed as armour (an `isWeapon` first rule).
2. **The bust never flips** (decision 5). Citizens are front-facing art (`artFacing:
   'front'`), so a weapon hand on one side is fine; the renderer's facing flip must stay off
   for any bust on the rig.
3. **Hat × hair** is the only art dependency; it is handled by `underHat` data, but every new
   hair style must be checked under every hat shape (a checklist in the editor sheet).
4. **Tint needs white-and-black line art.** The Citizen busts are hand-coloured with
   coloured shading; tintable parts must be drawn the other way (white fill, black line, grey
   shade). Full-colour parts (hats, tops, armour) are drawn as the busts are.
5. **Every emoji text site becomes an image.** Leaderboard and Market render OTHER players'
   busts client-side from their spec; the speech bubble and the FTUE modal need a texture or
   `<img>` path; `findNPCTypeFromSymbol` in `Conversation.js` matches emoji strings and must
   not be fed the player's bust.
6. **Anyone can set a paid icon today** (`/update-profile` takes any `icon`). The avatar gets
   its own validated routes; `/update-profile` drops `icon`. Per-part gems are spent
   server-side (no new client-trusted `update-inventory` site).
7. **Twemoji fallbacks stay for states** (💀 🏕️ 🛶, decision 6).
8. **Atlas growth**: ~60 to 100 parts at 256 px is one more sheet; fine. Never bake
   combinations.
9. **iOS memory**: the compositor keeps a few 256 px canvases and textures, released on
   unmount like today's per-instance svg cache; no per-frame canvas work.
10. **`PlayerIcons.json` Bunny → `pc-octopus.svg`** is a live bug; fix in D or now.
11. **Localisation**: part labels are string keys; the picker copy gets `_touch` siblings if
    it says "click".

### 5. Not in scope

Body shapes, expressions / mouths, eye shapes, the share image, chat avatars.

### 6. Migration

One script (`game-server/scripts/`), backup first, run before the slice-D commit deploys:
every player without `avatar` gets the starter look; `avatarsUnlocked` and Gold players
get the launch paid set in `avatarParts` (no refund needed: they keep equivalent value);
`icon` is left in place untouched (read by nothing after D).

### 7. Numbers (for docs/tuning.md once decided)

| knob | today | plan |
|---|---|---|
| premium unlock | 200 gems, all paid icons; Gold grandfathered | per part (`gemcost` on the sheet); the old unlock and Gold map to the launch paid set |
| starter look | 😀 | first free part per slot, tone 3 |
| bust size on board | `TILE_SIZE * 0.9` | same |

### 8. Design questions

All answered 2026-10-11; see §9. New questions go here as they come up.

### 9. Decisions (owner, 2026-10-11)

1. **Legacy emoji avatars are retired.** Everyone gets a parts bust; the old 200-gem unlock
   and Gold map to the launch paid set (§6).
2. **Price per part.** Each paid part (and paid swatch) has its own `gemcost`; bought once
   into `player.avatarParts`.
3. **Armour is visible everywhere. Weapons draw in valley, dungeon and the FTUE cave**, and
   are put away in Town and on the Homestead.
4. **Hand art per weapon row**, duplicates allowed: every weapon names its `avatarHand`,
   and many name the same drawing.
5. **No facing flip**, for the PC or any bust on the rig.
6. **Low health = a green tint on the bust**, the red combat flash's mechanism. **Death,
   camping and boat stay emoji swaps** for now.
7. **No art source yet.** Front-facing storybook look; the art pipeline (drawing the parts,
   rebuilding the Citizen busts) is a pass after the scaffolding, with Claude's help.
8. **One extra slot: facial hair** (its own layer, `hairColor`). No expressions, no eye
   shapes. **Eye blinking is a feature** (§2.4).
9. **Citizens move onto the same rig**, with `npc`-tier parts players never get. The
   compositor and the catalogue are written for any bust from slice A.
10. `player.avatar`, `player.avatarParts`, `POST /api/player/avatar`,
    `POST /api/player/avatar-part`; `icon` goes after slice D.
