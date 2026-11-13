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
swap textures. Two more hand fields in that file (2026-11-12): `cheek`, where a face's bare skin
is sampled when what lies under the eye is not skin (Falstaff: his moustache starts there and
his lid was painted moustache brown), and `keepRings`, spectacle rims that cross the eyes and
are drawn back over the lid (the Doctor's glasses were partly painted over).

**The board draws the saved avatar (2026-11-10).** `PixiRendererPCs` composes `player.avatar`
(`lookFor` + `renderLook` at 512 px, the parts' own square) into two Pixi textures, eyes open
and the blink frame, rebuilt only when the spec changes, and draws them INSTEAD of the icon at
1.8 tiles, with the flip, the breath (`breathTop` 0.345 / 0.294 by body) and the blink. The
icon still shows for a player who never saved a look (`avatar` defaults to null, so no live
player changes), for a spec whose face id an older catalogue had, and in the states with their
own picture (dead, sick, camping, afloat). **The last thing picked is what shows**: saving in
Edit Avatar puts the look on the board, and choosing an icon in Change Avatar clears it
(`POST /api/player/avatar` now accepts `avatar: null`). Still icon-based: the header, panels and
other DOM surfaces.

**The saved avatar's head in the DOM (2026-11-10).** `Avatar/AvatarFace.js` shows a SAVED
look as a profile picture: the look composed once at 256 px by the shared compositor (cached
per look) and cropped to the head with CSS (the figure square's head box, x 156, y 0, size 200
of 512, which holds both bodies' heads), in a circle; without a `size` it fills its container.
It draws only a saved look and otherwise renders `fallback`, the site's own picture, so no
site changes for a player without one. Sites: the header's round avatar button and the phone
header's name row (`App.js`), the Player panel's greeting, the FTUE story modal when the player
speaks (`StoryModal` gained `symbolNode`), the Leaderboard rows and the Global Market's player
list (other players' looks: the Leaderboard row carries `avatar` from `/api/player/:id`,
`/players-in-settlement` selects it). Not yet: the Pixi speech bubble's player topic and the
settlement map cell, which still use the icon.

**The head cut moved up (owner 2026-11-10).** The face part was the base figure above the
`collar` row (female 130, male 124), which left the base's bare shoulders and shift straps in
the head layer: they showed above every outfit. The split is now the rig's `headCut`, a flat row
just under the jaw where the base's silhouette is narrowest (measured on the base bodies: female
115.5, male 109.5; the shoulders and every outfit's cloth start below it). `parts.js face` cuts
the face part there, and `parts.js split` starts the outfit there, so an outfit now owns its own
neck. That neck has to follow the skin tone, so `split` grows the skin layer from the neck under
the cut through the chest an open neckline shows; a colour step of more than 8 between
neighbours stops the growth (it holds at the cream blouse, the gown's white trim and the vest's
shirt; 12 and 16 leaked into all three), then the anti-aliased rim is soaked in. This also tints
the chest in an open neckline, which the old split left in the cloth layer. The shift
(`--bare`) keeps the whole band from the cut to the collar as skin, as the face part did: the
shift is skin-coloured and no step stops the growth there. `collar` stays as `fitbody`'s anchor.
Both faces and all six tops were rebuilt from the fitted intermediates; no art was commissioned.
The atlas's copies of the avatar parts are not drawn by any code and refresh at the next
`build:atlas`. The limit seen here at the darkest tone (bare arms and legs untinted, hands
tinted in patches, the shift's whole band tinted) is fixed by the next paragraph, which also
replaces this paragraph's neck rule and its `--bare` band.

**Skin by colour model (2026-11-10).** Until now the skin layer was the neck plus whatever
passed a hue / saturation test inside the rig's hand and foot boxes. At any tone but the
lightest that left the shift's arms and legs and the vest's forearms peach, tinted hands in
patches (shaded skin is more saturated than the test's ceiling), showed the hand boxes as
rectangles on bare arms and tinted the shift's straps. A hue / saturation box cannot fix it:
skin, the shift and a cream blouse overlap (skin h 26..32 s 0.43..0.69, shift h 32..36 s 0.5,
cream h 36..38 s 0.37). What does separate them is the SHAPE of skin's colours in RGB: the
base body's skin is a thin cigar that gets redder as it darkens, where linen and cream only
get greyer. So each body now has a colour model, `tools/avatar/skin-model.json`: the mean and
covariance of its bare skin and of its shift, measured from sample boxes placed by hand on the
base figure (`parts.js skinmodel --in <base figure> --body <body> [--preview <png>]`; about
ten boxes a body, the only hand-authored part, and the preview paints the result for a look).
A pixel is judged by its distance to the skin cloud (Mahalanobis, squared: `d2`). Measured on
the four outfits: skin is under 6 everywhere, a cream sleeve sits at 6..20 with stray specks
under 6, the apron above 12, the rest far away.

`parts.js split` uses it two ways:

- **A worn outfit** (`outfitSkin`): the core is every pixel under d2 6, opened by a pixel so
  the sleeve's specks fall away. Of the core's connected masses only real body parts count:
  the neck under the head cut, and whatever holds a share of a hand or foot box. The boxes
  now only say where to look; they never clip, so a bare forearm comes with its hand, an open
  neckline with the neck, the instep in a slipper with the foot, and no box edge can show.
  From there the mask grows through pixels under d2 12 no more than 8 from the neighbour they
  are reached from (the old step rule: without it the vest's shaded shirt leaks in at the
  neck), then small walled-off pockets, pinholes, the anti-aliased rim and lit finger ends are
  taken. A hand the redraw painted a shade off the base (the peasant's far hand, d2 4..10) is
  asked for again a little looser; feet are asked once, so a tan shoe never passes for a foot.
- **The shift** (`--bare`, `shiftMask`): each pixel goes to the nearer of the two models (its
  colour averaged over 2 px, which irons out the linen's grain; plain distance, because a
  likelihood hands the pale highlight on a shoulder to the tighter shift model). The shift is
  the largest connected mass of that answer; its edge is then settled on each pixel's own
  colour, and the hem's cast shadow on the thighs (a dark orange neither model reaches) is
  peeled off by saturation (0.68; shaded linen stops at 0.66). Everything else is skin.

The ideas weighed against it: a hand-painted cloth mask per base body would have fixed the
two shifts only; growing from the hands with the step rule alone (the old `skinish` test)
needs a box to stop it and cannot tell a cream cuff from a wrist; a per-outfit "bare forearms"
hint is one more thing to author for every outfit. The model needs no per-outfit input.

All six tops were rebuilt from the same sources (`_candidates/bases-r1/cut` for the shifts,
`_candidates/parts-fitted` for the outfits); cloth plus skin is pixel for pixel the same
drawing as before, so the lightest tone is unchanged, and no art was commissioned. Skin pixels:
shift-f 4,533 to 18,750, shift-m 4,737 to 28,837, peasant 1,566 to 2,491, gown 3,197 to 3,696,
tunic 3,197 to 5,494, vest 3,651 to 10,329. Checked by composing each top with its face at
tone-1, tone-4 and tone-6 (the compositor's multiply) and looking, whole and at 4x to 8x.
What is left, all a pixel or two and invisible at board size: a few pale specks on the man's
shoulder where his strap meets it (the strap's top and the shoulder's highlight are the same
colour); the man's hem line, which goes with the skin where it touches a leg; an orange skirt
or tan vest gives two edge pixels to the hand or neck beside it (they read as its contact
shadow); a thin pale rim above the gown's far instep. The peasant's insteps are not skin by
the model (d2 16..60) and stay cloth: they read as stockings. Separate, and not touched: the
peasant's and the tunic's fitted art carries a few magenta key pixels beside the hands, in
the cloth layer at every tone; that is the key step's to fix, not the split's. A new body
needs its own entry in `skin-model.json`; a new outfit needs nothing but `split`, and a look
at tone-6.

**The eyes keep their own colour (owner 2026-11-10).** The face part is multiplied by the skin
tone and the eyes are painted into the face, so a darker tone turned the whites and the
highlights brown. `tools/art/eyeballs.js` lifts each eyeball (the white, the iris, the pupil and
its highlight) out of the face into `skin/eyeballs-<f|m>-01.png`, the face row's `file2`, which
`lookFor` draws UNTINTED straight over the face in open-eyed frames only (the blink's lids are
painted over the tinted face). It finds an eyeball from the face alone: the pupil's centre, the
white joined to it, then row by row everything between the outermost white and the iris's
chord; the anti-aliased rim against the lashes stays in the face. The same tool now writes the
iris layer (`--irisout`, tinted by eyeColor): the old one, rings grown around the pupil, stopped
short and left the lower third of each iris in its painted blue or brown, which only showed
once the eyeball stopped taking the skin tone. A new face needs one run of this tool after
`parts.js face`.

**The eyebrows follow Hair Color (owner 2026-11-13).** The brows were painted into the face too,
so they took the skin tone and stayed brown under any hair colour. `tools/art/brows.js` lifts
the two brows (the two largest masses of darker pixels above the eyeballs) into a grey layer,
`skin/brows-<f|m>-01.png`, the face row's `file3` with `tint3: hairColor`, which `lookFor` draws
over the face in both the open and the blink frames; it paints skin back into the face where
the brows were (interpolated down each column), so a light hair colour leaves no dark ghost.
The brow's grey is lifted so its median sits at 185: a little darker than the hair parts, as
brows are. A new face needs one run of this tool after `eyeballs.js`.

**Change Avatar is the editor, for everyone (owner 2026-11-10).** `AvatarModal` is no longer a
developer preview: the Player panel's Change Avatar button and the FTUE's avatar step (step 6,
`modalType: icon`, with its intro line) open it, and the icon chooser is gone
(`UI/Modals/ChangeIconModal`, `Authentication/ChangeIcon.js`; the Profile panel only held dead
code for it). Saving writes `player.avatar`, which the board, the header and the panels draw.
Nothing was migrated: a player who never saves a look keeps their `icon` everywhere, as the v1
plan's "one release as the fallback" says, but can no longer pick a different icon. For
players the modal shows its title, the six tabs, pictures without names (only the two bodies
carry a word), the colour rows, Reset (the starter look of the body being edited) and Save;
all of it from `UI/Strings` 4130 to 4145, in ten languages. Developers still see the
equipment line, the catalogue names and Copy spec. On a phone the figure is 80 x 160 above the
tabs and the modal needs no scroll. Fixed on the way: a save while standing on the board
destroyed the old composed textures while the sprite and the breath ticker still held them
(`retireAvatarTex` now hands the sprite the new pair first). Not done here: buying a paid part
from the modal (the catalogue has none yet; `/player/avatar-part` exists), the old premium
unlock (`avatarsUnlocked`, `/action/unlock-avatars`) mapping to a paid set, and the surfaces
that still draw the icon (the speech bubble's player picture, the settlement map cell, other
players' figures on the board).

**Facing an NPC, both ways (owner 2026-11-10).** The player's figure turned to a tapped NPC
only some of the time, for two reasons. `facePlayerToward` measured from the player record's
`location.x`, which is the last SAVED tile, not where the player stands, so after any walk it
could judge the wrong side or call it the same column; it now reads the live tile
(`getPlayerTile`). And a turn made while standing still moves nothing, so no render pass
followed it and the sprite stayed as it was until something unrelated redrew it; the PC
renderer now hears `onPlayerFacingChange` and mirrors the sprite at once. The NPC turns too:
`turnToEachOther` (PixiRenderer, at the tap on an NPC in reach and at the arrival of the walk a
tap on a distant one starts) sets the NPC's `facing` toward the player as a client-only mark
(`NPCsInGridManager.markLocal`), which the NPC pass mirrors relative to `artFacing`; it holds
until the NPC next takes a horizontal step. Enemies and farm animals keep their own facing, and
nothing turns when the two stand in one column.

**Turning (owner 2026-11-10, animation 1).** A figure that reverses its facing no longer snaps
to its mirror image: its width eases down through edge-on and out the other side in 200 ms, the
paper turn of a mirrored 2D character, with no new art. It lives in `BreathSprite`, which every
figure on the board already is (the player and the NPCs): the renderers still set the sign of
`scale.x` the moment the facing changes, and the sprite notices the sign change when it next
computes its vertices and plays the turn there, so no renderer changed. A turn reversed in
flight carries on from where it was; a sprite that was not being drawn takes the new facing as
it is; reduced motion gets the snap. **Never thinner than `minWidth` (owner, same day):**
narrowing all the way to a line is what made the figure read as a paper cutout, so it now
narrows only to 0.6 of its width, flips to the mirror image there (a small pop) and widens
again. Tunables are `TURN` in `breathing.js`: `ms`, `minWidth` (0 = the paper turn, 1 = the old
snap) and `lead`, the time the head leads the feet (0 = one piece, the default; 30 to 50 twists
the body after the head with the feet planted; by 100 the middle frames pinch into an
hourglass, judged on offline film strips, not in motion).

**Walking (owner 2026-11-10, animation 2: "content agnostic and all procedural").** A figure
is one drawing, so its walk is a deformation of that drawing, as its breath is, and nothing is
authored per figure (this replaces P7's "cut at atlas build" and the rig's foot boxes for the
board). `walking.js`:
- **Where the legs are is read from the drawing's own silhouette**, once per texture
  (`legsOf`, on a 192 px grid of the figure's square; any texture, the composed avatar
  included). From the feet up, a gap that runs between two feet means LEGS: from the top of
  that gap (the crotch, or a hem with two shoes under it) the drawing is cut along the gap into
  two halves that move on their own. No gap (a gown to the ground, a tail) means a HEM, which
  sways in one piece. Of the 34 NPC figures, 32 read as legs (17 of them only shoes under a
  robe) and two as hems (Juliet, Viola).
- **The cycle** (`walkLegs`): a foot lifts (its leg shortens from the hip) and swings forward
  while it is in the air, then stands and slides back while the other swings; the body bobs
  once per footfall and a standing foot stays on the ground. A foot never lifts more than 55 %
  of its own leg, so shoes under a hem only shuffle. A hem sways side to side and tips up on
  the stepping side. Forward is the way the drawing faces, so the facing flip mirrors it.
- **`BreathSprite` plays it**: its mesh is now two cells per row, left and right of the column
  the legs part at, sharing that edge above the legs and split below, with a row exactly where
  the legs begin. The renderers only set `sprite.walking` (the player while it glides between
  tiles, an NPC while its step animates) and `walkCycleMs`; the walk fades in over 90 ms and
  settles over 140 ms, back to the exact drawing. Reduced motion: no walk.
- Tunables are `WALK`: `cycleMs` 420 (the player, about five footfalls a second, since it
  crosses a tile in 90 ms), `npcCycleMs` 760, `lift` 0.07 and `stride` 0.05 of the figure
  square (the owner's numbers, after 0.065 and a stride of 0.07 that was too much), `bob` 0.01, and the hem's span, sway and tip.
- **Hinged at the hip (owner, same day: the first walk "feels hinged at the lower part of the
  leg" on trousers, though it "looks good for gowns").** The top of the gap between two legs is
  the crotch, or a tunic's hem: hinged there, only shins and feet moved. A figure with real legs
  (a gap of 0.12 of the square or more) now has its `hinge` above the gap by `hipRise` 0.3 of
  the leg that shows (the trousered cast: hinge 0.63 to 0.72 where the gap tops out at 0.71 to
  0.78). Between hinge and gap the drawing is one piece: its sides go with their own leg and
  its middle with the mean, so the hips turn and tip and a tunic's skirt flexes without a tear;
  the mesh has a row at the hinge and one where the legs part. Shoes under a robe (a gap under
  0.06) keep their hinge at the hem and their stride is capped at 1.2 of the shoe's height, so
  gowns walk as they did. Also fixed: a one-pixel nick between two toes was taken for the gap
  and the climb died there, so the bare-legged base bodies read as hems; a nick is now skipped
  and a climb that dies at once restarts higher.
Checked offline, not in motion: the leg finder on a contact sheet of all 34 figures, and the
sprite's real vertex code run against a stub and rasterised (standing, six frames of a cycle,
settled) for a legged figure, shoes under a robe and a hem. Known limits: the cut is one
straight column, so legs that cross it would be sliced (none of the cast's do); the feet slide
rather than grip the ground, as any short-legged walk at this speed does; the stride is
sideways even when the figure walks up or down the board; arms do not swing.

**Which way it walks, and arm swing (owner 2026-11-10, animation 3).** The walk now knows its
direction (`sprite.walkSideways`: the player's last step, `isPlayerWalkingSideways`; an NPC's
step animation's start and target), eased over 120 ms when it changes:
- **Going up or down the board the feet only step**: each foot lifts in turn, with no stride
  and no arm swing. Going left or right it strides as before, and the arms swing.
- **Arms are read from the silhouette too, but not as the legs are.** The cast's arms are
  drawn against the body: a gap between arm and body is rare (a gap finder found six partial
  arms in forty figures). So an arm is the STRIP along the silhouette's flank (`armWidth`
  0.075 of the square, following the flank row by row, so it follows a slanted arm) from the
  shoulder (`breathTop`) down to where the flank STEPS BACK toward the body, a hand hanging
  clear of what is under it (`findArms`; the step must lie 0.42 to 0.66 of the way from the
  shoulder to the feet, or it is a hem, a prop or hair). Of the 34 NPC figures and the six
  avatar outfits: 24 have both arms, 8 one (the other holds something or lies on a skirt) and
  8 none (cloaks, gowns whose sleeves lie on the skirt), and those stay as drawn.
- **An arm swings from the shoulder against its own side's leg** (`armSwing` 0.03 of the
  square at the hand). The strip is its own cell of the mesh, drawn over the body: swinging in
  it passes in front of the body, swinging out the body's edge follows it so the cut never
  opens. The strip rides with the hip it hangs against, and under the hand's end it eases back
  into the body over `ARM_TAIL`. Three earlier forms were rejected on the offline frames: a
  hard end at the hand (a seam across the hip), not drawing that band (a hairline through the
  body), and letting the arm leave the body (a crack of background along the cut).
- The mesh is now four cells across per row (arm strip, body left and right of the legs' gap,
  arm strip) with rows on every line that matters and no two rows further apart than 0.045.
**Muted (owner, same day).** The strip under a hand takes a little of the trousers or dress
with it, because in the art the hands barely stand clear of the lower body, and that shows as a
seam where the strip ends. There is no fix without cutting arms as their own parts, which the
owner does not want to reopen, so `armSwing` is 0.015, half of what it was, to mute it.
In a view this close to the front, both hands move toward the body's middle and away together:
that is what arms swinging in opposition look like from here, not a bug. Checked offline as
before (real vertex code, rasterised, sideways and up-and-down, four figures).

**The idle foot tap (owner 2026-11-10, animation 4).** A figure that has stood still for four
seconds taps one foot three times, now and then: "occasional and not stressful, just to show a
little more life". `walking.js` `TAP` and `tapAt`: each figure has its own interval (10 to 24
seconds, from its seed; first 15 to 35, then "a little more frequent"), the run lands at a
different moment inside every interval, so a crowd never taps in step. **Which foot, and how
(the owner's third pass; a squash, then a shear about the heel, did not read):** always the
foot on the side the figure faces, the drawing's RIGHT foot (mirrored, the left one on screen),
because that one is drawn nearly in profile and the other points at the viewer. The WHOLE foot
moves as one rigid piece hinged at the ANKLE: everything of that foot under the ankle row (the
bottom 0.09 of the square) turns about the back of the ankle (`legs.ankleBackU`, the right edge
of the gap between the legs on that row) by the angle that brings the toe (`footEndsOf`) up
0.04 of the square. In the mesh the foot has its own copy of the ankle row, the band between
the two is not drawn for that half, and the standing leg is drawn a little further down under
the foot's top (`LAP`), so the foot laps over the shin and no line shows at the ankle. Under a
robe the shoe taps by less than half its own height. Only a figure with two feet to tell apart taps (the same reading
as the walk's legs), so a hem or a tail never does. `BreathSprite` keeps the clock itself: it
knows it is a figure because a renderer tells it every tick whether it walks, and the wait
starts over whenever it walks, turns or is not being drawn; no renderer changed. Reduced motion:
no tap. Checked offline: two minutes of standing run through the real sprite code (a run about
every 20 seconds, alternating feet; the gowned figure with no feet showing never taps) and the
frames of one run rasterised.

**Edit Avatar polish and eight more head parts (owner 2026-11-10, content 1).**
- **The modal.** Copy spec and the equipment line are gone (the equipment FEED still shapes the
  look; only its read-out went). The tabs are the shared `.tab-button` row, text with an
  underline, as the Buy Deco catalogue's sub-sorts are. Every font comes from its role's tokens
  (ui-conventions §9): tabs and buttons Lora, a colour row's label title-3, what is read
  Philosopher. The Eyes tab shows one thumbnail per eye COLOUR, the size of every other tab's
  and framed on the eyes alone (`CROP.eyes`); it has no swatch row.
- **Colours.** Eye colours are blue, green and brown; auburn hair is cut and red is a little
  brighter and more orange (#C9582B). `lookFor` gives a colour id the palette no longer has the
  first colour of its kind, so a saved look never draws an untinted part.
- **Parts** (job `parts-r3`, one candidate each, all eight used): hats f flower ring and tiara,
  m gold head band, crown and farmer's straw hat (all sit on the hair: `hidesHair` false);
  facial hair m moustache, goatee with moustache, mutton chops (tinted by hair colour). Each
  subject's `extract` in the job file is how it was cut. What the cutting taught:
  - `align` could not find the pupils on four of the eight redraws; it now tries the
    pupil-pair finder after the first one and takes `--eyes x1,y1,x2,y2` when both fail.
  - **A skin-hued hat needs `--skinclear`.** The hue rules of `--faceclear` cannot tell a straw
    brim from the forehead it shades. The body's skin colour model can, but applied everywhere
    it riddled the straw with holes, so it PEELS: in each column of the head it removes skin
    from the layer's top and bottom edges and stops at the first pixel that is not skin.
  - **Gold against skin is cut by hand.** The head band has skin's hue, its highlights pass for
    skin and skin's shadows pass for gold: `diff` at any tolerance, a hue gate and a blue-ratio
    test all failed. `parts.js mask` cuts it by a twenty-point outline kept in
    `tools/art/part-masks.json`. Ask for a contrasting trim next time a thin metal part is drawn.
- The catalogue is 28 rows. Clothing is next: the owner asked for recommendations (three more
  per body) before any is drawn.

**Headwear art direction (owner 2026-11-10). Rules for every hat, crown, band and wreath:**
1. **It reads at a distance.** A figure on the board is about a hundred pixels tall, its
   headwear a fifth of that. A piece is a few LARGE, bold, simple shapes with strong contrast
   against skin and hair: one big gem, not five small ones; about seven big flowers, not a
   garland of tiny ones; a band clearly thicker than a finger. The first tiara (a thin wire with
   three small gems) and the first flower ring (small blossoms) were redrawn for this.
2. **A symmetrical piece is DRAWN turned with the head: its centre over the NOSE, its ends on
   the head's outline (owner, revised the same day).** The faces are in a three-quarter view,
   turned a little to the viewer's right, so the face's centre line (the rig's `noseX`: female
   141, male 139) is right of the skull's middle (128) and more of the head shows on the left.
   The model draws a crown or a tiara from the front, centred on the skull: the first tiara's
   gem sat 10 units left of the nose, the crown's 13. The first fix slid the finished piece
   onto the nose line (`parts.js seat --axis top`), and that is WRONG: a frontal crown moved
   sideways hangs out into the air on the far side of the head. The piece has to be drawn in
   the head's own view: front centre exactly above the nose, the band wrapping the skull and
   meeting the head's outline on both sides, the near half longer and the far half
   foreshortened. Then it needs no moving. A piece with no centre to see (a plain band, a hat, a
   wreath) only has to sit on the head.
3. **A circlet is a little wider than the bald head.** Crowns, tiaras and bands are worn over
   hair, which is wider than the scalp they are drawn on: ask for it to stand very slightly
   proud of the scalp at the sides, or widen a finished piece by about 7 % about its centre
   (`seat --axis none --widen 1.07`, the head band). A modest amount: much more looks wrong on a
   bald head. A wreath that already sits at the head's width (the flower ring) is left alone.
4. **Headwear is drawn on the TEAL MANNEQUIN, never on the skin-coloured head.** `parts.js
   mannequin` turns every warm pixel of the bald base head (skin, lips, brows, the undershift
   and their brown outlines) teal and leaves the eyes; the model redraws that mannequin wearing
   the piece; the piece is then whatever is not the mannequin: `diff` against the keyed
   mannequin, `--drophue 140,186` for what is left of its shading (not up to 200: a sky-blue
   gem is hue 190 to 205), `tidy` for a one-piece item. Cut against skin, every rule failed on
   something: cream petals are the colour of shaded skin (the wreath lost its daisies), orange
   flowers and warm silver have skin's hue (the hue rule took them), straw and gold highlights
   sit inside the skin colour model (it riddled them), gold against skin had to be cut by
   hand, and wherever the redraw's head was a pixel off the base's, strands of its brown
   outline stayed on the piece. On the mannequin the outline is teal too, and three pieces
   (wreath, tiara, crown) cut clean first time.
The prompt wording for 1 to 4 is in `tools/art/jobs/parts-r7.json` (the `THE VIEW MATTERS`
text and the mannequin text); each subject's `extract` is how it was cut.

**Four outfits, the tiara and the flower ring redrawn, brighter eyes (owner 2026-11-10, content
2).** Job `parts-r4`, one candidate each, all six used: f Adventurer (rust tunic, trousers,
boots) and Court gown (crimson and gold); m Noble doublet (royal blue and gold) and Scholar's
robe (bluish lavender); the catalogue is 32 rows, five tops a body. The crown and the head band
were re-seated by the first form of rule 2 and by rule 3, the new tiara by rule 2. **Corrected
the same day:** the owner found the tiara and the flower ring partly transparent (a clearing
pass had taken their pale parts for lit skin) and the crown and tiara hanging off the far side
of the head (see rule 2). The tiara and the crown were redrawn in the head's three-quarter view
and the flower ring redrawn, all three on the teal mannequin (jobs `parts-r5`, superseded,
`parts-r6`, `parts-r7`; rule 4), and the lit-skin pass was removed. A hat layer is now always
checked ALONE on a contrasting ground as well as on heads: holes do not show over skin of the
same colour. Blue and green eyes are a little more vivid (#2F8FF2, #36B84C). What the cutting
taught:
- **`fitbody --xscale`.** The doublet's redraw had a smaller head than the base, so `align`
  enlarged it 1.147 to match the eyes, body and all; `fitbody` put the height right and left it
  that much too wide. `--xscale` (one over the align scale) narrows the body about the centre
  line, not at all at the head cut and fully from the collar down. Use it when `align` reports
  a scale more than about 8 % from 1.
- **`--faceclear` alone is only for a hat of one cool colour.** Its hue rule dropped the new
  tiara's silver band (warm reflections) and the wreath's orange flowers as skin. `--skinclear`
  is now the default for anything else: it peels skin from the layer's top and bottom edges by
  the body's colour model, and also removes LIT skin shut inside the piece (the scalp seen
  through a tiara), which no silver, straw or petal is.
- `seat` first drops what is not the piece (specks, and any mass that begins under the brow): a
  sliver the cut left on a shoulder sat unseen where it was drawn and showed as a line in the
  air once it moved with the crown.

**Default look, paid parts, Random, and no figures zoomed out (owner 2026-11-10, release 2).**
- **Every player has a look: the DEFAULT one until they make their own.** The "migration"
  from the old icons rewrites no record: `avatarLook.specFor(avatar, data)` gives the saved
  look, or the default look when there is none (or its face is gone from the catalogue), and
  the board, `AvatarFace` (header, panels, Leaderboard, Market, the FTUE speaker) and the
  editor all ask it. The default is the man, No Clothes, the short hair, brown hair, green
  eyes: the rows marked `default` in the tuning files (face-m-01; tone-2, hair-brown,
  eye-green), every other slot the first free part of that face's body, a None where there is
  one (`defaultSpec`, mirrored by the server's). The FTUE's avatar step starts from it. The
  old icon now only stands in while the catalogue loads; the one player who had bought the
  premium icons is not compensated (owner).
- **Paid parts, bought one by one with gems.** Tiers (owner): every skin tone, hair colour,
  hair style, facial hair and eye colour is free; of the hats and of the clothes, the last two
  in each body's list are paid, 30 gems each (`tier: paid`, `gemcost: 30` on the flower ring,
  tiara, gold head band, crown, Adventurer, Court gown, Noble doublet, Scholar's robe). In the
  editor a paid part shows its price until it is owned and can be tried on freely; while the
  look holds parts the player does not own, Save becomes the gold "Buy for N" button, asks
  (`GemSpendConfirm`), and `POST /api/player/avatar` with `buy: true` buys them and saves the
  look in ONE write: never charged for a look that was not saved, never wearing what was not
  paid for; without `buy` such a look is refused (422). A part a player was ALREADY WEARING
  when it got its price is theirs (`ownedBy`, client and server; written to `avatarParts` at
  their next save). The developer bypass is gone, so the flow can be tested on a developer
  account. The server now also refuses a part drawn for the other body. Tested by running the
  real route handler against a stand-in player: refused without `buy`, charged once, charged
  only for what is missing, refused when the gems run short, the worn tiara kept.
- **The editor.** No captions on parts (a body is its sign, every other part its picture); a
  slot's None (no hair, no beard, no hat, and No Clothes, the rows with no drawing or marked
  `none`) is the no-entry sign, not a picture of the figure without it; **Random** (left of
  Reset) draws a look from the FREE parts and colours, either body, never bald or undressed
  (`randomSpec`).
- **Zoomed out to the Settlement or the Frontier, the player and every NPC are not drawn**,
  nor speech or NPC status marks (`actorsHidden` in `PixiRenderer`): figures are specks at
  that size and they are the only things that animate.
- **The FTUE doinker over a figure NPC** sits above its head: it is lifted by `artSpan - 0.5`
  tiles from the tile's centre, where it used to point across the face.

**NPC faces instead of NPC emoji in the panels; the price chip (owner 2026-11-10).**
- **The sweep.** Every DOM surface that named an NPC was checked for its emoji. Changed: the
  Level Up modal's quest givers (the giver's head crop, `ResourceIcon type={giver}`); the quest
  cards (`QuestButton.js`: the head is found by the giver's NAME now, not by matching the
  quest's emoji to a row, which printed the emoji for all nineteen of Mistress Quickly's quests
  because her quests carry a different skin tone of the glyph than her row); the Story modal
  (a named speaker shows its head crop: the Oracle's finale, the twins' scene and Gertrude's
  waking were handing it the whole board figure, a speck at 64 px); the Farm House's hire
  cards (the worker's head, not its figure). Already faces before this pass: the NPC panel,
  the Clues modal, NPC Connections, the giver info modal, the speech bubbles
  (`speechTopicArt.js`), the FTUE speakers.
- **What still shows an emoji, and why.** The twelve enemies and the spawners (no art exists:
  BL-17); the board's quest / trade overlays and the relationship outcome marks (status
  glyphs, not characters); the player's own picture in a speech bubble (the old icon's face,
  BL-17). The NPC rows keep `symbol`: `Conversation.js` compares topics by it.
- **A paid part's price is the gem chip** (`.gem-button`) centred on the thumbnail's bottom
  edge, half over it, as a crafting station's slot wears its price; the grid's rows stand a
  little further apart for it.

**Over the heads: the player's own face, painted feelings and marks (owner 2026-11-10).**
- **The player's picture in a speech bubble is the avatar's head.** The topic was the player's
  old `icon` emoji; it is now a token (`Relationships/topicTokens.js` `PLAYER_FACE`) that
  `speechTopicArt.js` draws as the saved look's head, the default look's when there is none
  (`setSpeechPlayer`, fed by `PixiRendererSpeech`). The token also ends two mix-ups: the old
  fallback (the smiling face) was the "blush" feeling's glyph, and an icon that was also an
  NPC's glyph was read as that NPC by `compareTopics`. In a talk between two citizens `player`
  now means the initiator and `npc` the partner, as in the player's own talk.
- **Feelings, marks and outcomes are painted** (`icons-r12`, docs/art/ui-icons.md): the bubble
  topics, the outcome that floats up when an interaction lands, and the quest / trade overlays.
  Taunt's first topic had no glyph in the map and showed a question mark; it is the mischief
  face now.
- **Still Twemoji in a bubble:** the weather, the random and secret topics without art of their
  own (train, sprout, dragon, ghost, unicorn, genie, strength, the song) and the fallback
  interests a character without interests shows. The twelve enemies are the other half of BL-17.

**The woman's straw hat: forehead left in the layer (owner 2026-11-10).** The first straw hat
(parts-r1, cut before the teal mannequin was the rule) kept a crescent of the forehead the
redraw shaded under its brim; it sat over the hair and kept its own tone on every skin. The
column peel of `--skinclear` could not reach it (the brim comes round under the face), and the
skin colour model does not know skin that dark. `parts.js unskin --in <layer> --face <the
body's face part> --body female --shade 23,27.6,0.885` peels from the face opening itself,
through pixels on the head that are skin by the model or by the given shaded-skin window, and
stops at the straw and the band. Rule 4 stands: new headwear is drawn on the teal mannequin
and never needs this.

**Four more outfits and two hair styles (owner 2026-11-11, content 3).** Job `parts-r8`, one
candidate each, all six used; the catalogue is 38 rows. Male: Black leathers (a long black
leather coat with a fur mantle, no armour) and King's crimson (gold-embroidered doublet), both
paid at 30 gems; the Noble doublet is now FREE. Female: Black queen's coat (paid, 30) and a
Green adventurer (free). Hair, both free: f Short spiky, m Shoulder length. The owner gave
television costumes as the direction; the reference pictures did not reach the session, so the
four were drawn from the description. The paid rule is now simply each row's `tier`: "the last
two of each list" no longer holds (male clothes: three free, three paid). What the cutting taught:
- **Cloth above the head cut: `split --rise 48 --face <face part>`.** An outfit starts at the
  cut, a flat row under the jaw, so the fur mantle and two standing collars came out sliced
  level. `--rise` takes back what stands above the cut: from the cloth on the cut row, up
  through the redraw's pixels that lie clear of the face part's silhouette, then the two-pixel
  seam against the jaw where it is not skin. The cloth layer draws over the face, so nothing
  gaps. Use it on every outfit; it adds nothing to one that stops at the neck.
- **`split --dekey`.** The key left pink beside two hands: pure key pink anywhere, the
  pink-red blend on the figure's edge, and a half-keyed pocket between sleeve and hand (bright
  pink-red, bluer than crimson cloth, no larger than a fingertip). Crimson velvet is untouched.
- **A neck in deep shade needs a looser skin growth** (`--grow 30 --step 14`, the queen's
  coat): the shaded half of her neck sat past the model's usual reach and stayed peach on a
  dark tone. Safe there because black cloth is nowhere near skin; not a new default.
- **Hair that is not neutral grey is NOT cut with `diff --grey`.** Both redraws came back in a
  warm cream, whose shadows the grey filter takes for skin: it shredded them. Cut with the plain
  diff, then two small steps kept beside the fitted intermediates
  (`tools/art/_candidates/parts-fitted/`): `hair-clean.py` drops what is warm AND saturated
  (the redraw's shoulders, which move a few pixels and leave skin slivers), key pink and specks;
  `hair-gapfill.py` closes the hairline where the redraw's face was a pixel or two wider than
  the base's (transparent pixels caught between hair and the bald head take the hair's colour).
- **Tall hair must fit the headroom.** The spikes stood about 45 rows above the top of the
  head-crop frame. The redraw and the base were padded on top so the cut kept them, then the
  rows above the brow were squashed 0.78 so the top lands inside the frame. Ask for hair that
  "stays close to the head" when it is meant to stand up.
- `align` missed the pupils on the king and the spiky hair; `--eyes` from a dark-blob search.

**The owner's order from here (2026-11-10):** 1 more logic, 2 more animation, 3 more parts
content, 4 equipment (the hand slot and armour). Retiring `icon` (v1 §6 migration) follows a
wider catalogue.

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
