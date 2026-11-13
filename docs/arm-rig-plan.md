# Arm rig plan: jointed arms for attacks, held items and gestures

Status: the Zombie (claw) and the Bear (swipe) BUILT 2026-11-12 as SKINNED arms (see §0); not yet seen in a live fight. Owner asked for a foundation for arm animation that
works for enemies, named NPCs and, later, the player's avatar (any outfit), after the Zombie
"grope" built on mesh warping failed. The Zombie is the first slice.

## 0. The method that works: a skeleton driving a skinned arm (2026-11-12)

Read this first; §2 below describes the rigid cut-out pieces that were tried and REPLACED.

Rigid pieces (an upper arm and a forearm cut out of the drawing, each turned about its joint) failed
on the Bear in every variant tried: hard cut lines through the fur, square corners poking out at a bent
elbow, a pinched shoulder where a tapered piece met the body, a bicep hidden under the forearm. The
owner, after four rounds: the motion (the skeleton and the clips) was right, the way the arm art was
segmented and rendered was wrong.

What replaced it is the standard 2D skeletal technique for smooth limbs (Spine's weighted meshes):

- **One arm image, not pieces.** The cut gives the body (arms erased, torso behind painted in, as
  before) and per arm ONE soft-edged image of the whole arm (the union of its `upper` and `fore`
  outlines and the `cap` / `shoulderCap` discs, feathered ~3 px).
- **A fine mesh** (a grid every 1/72 of the square over the arm's box) carries that image.
- **Weights:** each mesh point has a weight for the upper arm (ramping from 0 to 1 across the
  shoulder, along the shoulder -> elbow line) and for the forearm (ramping across the elbow, along the
  elbow -> grip line). The ramps are `blend: [shoulder, elbow]` half-widths on the rig (default 0.05,
  0.04 of the square).
- **Angle blending:** a point turns about the elbow by (forearm weight x elbow angle), then about the
  shoulder by (upper weight x shoulder angle). Turning partway about the joint (instead of averaging
  the positions two bones would give it) keeps a bend round: no collapse, no corners, no seam.
- At rest every weight times angle is 0, so the figure is exactly the drawing.

The rig fields keep their meaning: `upper` + `fore` (+ discs) now only outline the arm image; the
joints `shoulder`, `elbow`, `grip` are the bones. The skeleton, the clips and the CombatFX wiring are
unchanged. For the player's avatar (§4) the same skinning applies to a cut of the outfit's arm.

**Body lean (2026-11-12, the Bear).** A clip may carry a `lean` track ({ t, l }): the whole body
leans toward the target, feet planted, the top of the drawing shifted `l` of the square
(`BreathSprite.lean`, which `pointAt` includes, so the arms ride along). It plays only when the player
stands in another column than the enemy (`CombatFX.enemyWindup` checks the body's cells); in the same
column the arm swipes alone. The Bear's `swipe` has one (a slight lean back in the wind-up, about 0.09
into the blow, back to upright as the swipe ends); the Zombie's `claw` has none.

**Other limbs, and motion the rig plays itself (2026-11-12, the Spider).** `arms` in a rig may hold any
named limbs, not only `L` / `R`: a limb without an `elbow` has one joint (a fang). A limb may give a
`path` (its centre line, root to tip) instead of outlines: the cut then gives every solid pixel outside
the rig's `exclude` ellipses (the body) to the limb whose path is nearest, within `reach`, so legs that
touch each other still separate cleanly (no shared pixels; they stay hard-edged, since two soft edges
meeting would show a seam). Two drivers run without a clip (`ArmRig.autoPose`): `gait` (while the sprite
moved in the last moments: each limb swings about its root and bends its knee, each in its own phase;
the Spider's legs alternate) and `idle` (while it stands: every 0.9 to 2.2 s, per figure, the listed
limbs open and close twice; the Spider's fangs). Both are data in `rigs.json`.

## 1. Why the mesh grope failed (and what mesh warping is still good for)

The grope bent the Zombie's arm inside `BreathSprite`: the arm was a strip of the one drawing,
turned about a hinge. Three things can't be fixed inside that approach:

- **No hidden pixels.** One image has nothing behind the arm. Move the arm and a hole opens
  where it was, or, to avoid the hole, the strip has to stay joined to the body and stretch.
- **One joint.** A whole arm turned about the shoulder reads as a stick, not an arm. Bending
  the strip to keep it attached smeared the upper arm (the owner's screenshot: "barely looks
  like an arm", the hinge far from the body).
- **Cuts are columns.** The mesh cuts each row at one column, so the arm's outline can't be
  followed where it touches the body (the hem, the armpit). Every fix was a new exception.

Mesh warping stays the right tool for SMALL, attached deformations: the breath, the walk's
legs, the foot tap, the Ogre's crouch, wing flaps, the hover bob, the turn. Limbs that travel
need real pieces.

## 2. The first approach: a cut-out puppet of rigid pieces (REPLACED, see §0)

The standard technique of 2D games (Spine, DragonBones, most cut-out animation): the arm is
drawn as separate rigid pieces on a chain of joints, and the body is drawn with that arm
removed and the area behind it painted in.

- **Pieces per arm:** the upper arm (shoulder cap to elbow) and the forearm with the hand (elbow
  to fingertips). A separate hand piece (wrist joint) can come later if gripping needs it.
- **Joints:** shoulder, elbow, and a grip point in the hand (where a held item attaches). Each
  piece is cut with an OVERLAP past its joint, a rounded cap, so turning never opens a gap; the
  elbow overlap hides the crease.
- **Rigid.** Pieces keep their geometry. An optional stretch of at most ~10% along a bone, for a
  snap at the end of a strike, is the only deformation.
- **Underpaint.** The body piece has the arm removed and the torso's side painted in where the
  arm used to cover it. It is only seen mid-swing and small on the board, so an automatic fill
  (extending the torso's edge colours, an inpaint pass in the cut tool) is the first try; a
  hand or AI fix only where it shows.
- **It still breathes and walks.** The body stays a `BreathSprite`. The arms follow the body's
  shoulder point AFTER its deformation (the sprite gets a small "where does this art point land
  now" method), so breath, walk bob, crouch, hover and the turn all carry the arms with them.
- **Z order per arm:** each arm draws in front of the body or behind it, and a clip can switch it
  (the far arm of a swing passes behind).
- **Mirroring:** the actor flips as a whole (as today). Clips are written for the drawing's own
  left or right arm; the attack picks the arm on the target's side.

Runtime shape: an `ArmRig` Pixi container per rigged actor, holding the body `BreathSprite` and,
per arm, `upper` (pivot at the shoulder) with `fore` as its child (pivot at the elbow), plus an
optional held-item sprite as the forearm's child at the grip point. Four to six sprites per rigged
actor; un-rigged actors are untouched.

## 3. Data

- **Rig (per drawing, or per body for avatars):** `game-client/src/Render/PixiRenderer/rigs.json`,
  keyed by the art file (client-only art metadata, so no server route; P4's editor page writes it). Per arm: the two piece outlines as polygons, the shoulder, elbow and grip points
  (fractions of the art square, like `shotFrom` and `wingRoots`), and which side of the body it
  draws on. Keyed by art, not by resource row, because the avatar's rig belongs to the body, not
  to a row.
- **Pieces are cut at runtime, once per drawing** (`ArmRig.js` `cutRig`: the drawing rendered to a
  canvas, each piece clipped by its outline, the body with the arms erased and the `under` area
  painted in from the torso's side). Not baked at atlas build after all: the avatar is composed at
  runtime anyway, so one cutter serves both.
- **Clips:** `armClips.js`: keyframes of joint angles per arm, `{ t, shoulder, elbow, stretch? }`,
  eased, with a `hit` mark so the blow lands on the strike's frame (instead of a fixed
  `WINDUP_MS`). A row names its clip: `attackClip: "claw"`. The same clip set serves the
  player's sword swing, a throw, a wave.

## 4. The player's avatar

Every outfit is drawn on the same base pose per body (female, male; `tools/avatar/figure-rig.json`),
so ONE set of arm outlines per body cuts every outfit's cloth and skin layers at compose time
(`renderLook`). Wide sleeves (the gown) set the outline's size; the check tool flags an outfit
whose sleeve leaves it. The `hand` slot (held weapon) becomes the forearm's child at the grip
point, so a sword swings with the arm. The walk's arm swing can move to the shoulder joint for
rigged figures; the mesh arm swing stays for everyone else.

## 5. Named NPCs

Whole drawings, rigged one by one and only when one needs an arm move, with the same tool.

## 6. Tools

- `tools/art/rigcut.js`: cut a drawing into pieces from its rig, underpaint the body, write the
  pieces for the atlas, and a contact sheet of the pieces with the joints marked.
- Later, an editor Rig page: drag the joints and outline points over the art with a live preview
  of the clips. Phase 1 writes the Zombie's rig by hand.

## 7. Phases

| Phase | Scope | Done when |
|---|---|---|
| P1 Zombie | rig both arms by hand; `rigcut.js` + underpaint; `ArmRig` runtime following the breathing body; one `claw` clip with a hit mark; the enemy attack plays the row's clip | the claw reads as an arm at board size, no holes, no stretching, in a live fight |
| P2 Enemies | other armed enemies case by case (the Ogre's club, a Bear swipe, Duke Angelo) | each has a clip the owner approves |
| P3 Avatar | per-body arm outlines; compose-time cut for every outfit; the `hand` slot on the forearm; a sword-swing clip for the player's melee (with `playerLunge`); the walk arm swing on the shoulder | every outfit swings cleanly, both bodies |
| P4 Rig page | the editor page and clip preview | rigs and clips authored without code |

## 8. What P1 built

- `rigs.json`: the Zombie's two arms, measured on gridded crops (outlines, shoulder, elbow, grip,
  `under`). Arms are named by the IMAGE's side (L = x < 0.5).
- `ArmRig.js`: `cutRig` (cached per texture) and the `ArmRig` class: the arm sprites are children of
  the NPC's `BreathSprite` (so position, scale, mirror, hit pops and the death come free), and
  `BreathSprite.updateTransform` calls `armRig.sync`, which puts each shoulder at
  `BreathSprite.pointAt` (the breath, walk bob, crouch, hover and turn of the last frame) and sets the
  joint angles from the playing clip.
- `armClips.js`: the `claw` clip and the key/ease format. Elbow `+` bends the same way the shoulder
  raises (the hand curls over the head when the arm is up).
- Wiring: `PixiRenderer` draws a rigged NPC's body texture and keeps its rig with `syncArmRig`; the
  row's `attackClip` (resources.json, an editor column) names the clip; `CombatFX.enemyWindup(npcId,
  target)` plays it led by the arm on the target's side and returns the clip's `hit`, which
  `NPCEnemyBehavior` waits for instead of `WINDUP_MS`.
- P2 started 2026-11-12, the Bear: its art was REDRAWN (job enemies-r9, one candidate, the same bear
  with its forelegs hanging free at its sides; the old raised-paws pose hid its chest and could not be
  cut). Rig in `rigs.json` (the right arm the mirror of the left), `walks: true` and `attackClip:
  "swipe"` on its row. New fill: `fill: "clone"` + `cloneStep` copies the fur from further away (the
  Bear's flank from below) instead of smearing the nearest pixel, so fur keeps its texture. Lesson:
  draw each rig's outlines OVER the art before trusting them (outlines read off a grid were inside
  the silhouette and left fur fringes on the body), and list the body's leftover specks.
- Joints are ROUND: each piece carries a disc at the elbow (`cap`, and `shoulderCap` on the upper
  arm), so a bend keeps the arm's full width instead of pinching where two straight cuts meet (owner
  on the first Bear swipe: no elbow articulation, the arm thin when raised). The pieces are built from
  a union MASK (each shape filled on its own); a single clip path let the disc and the outline cancel
  where their windings disagreed and punched a hole at the elbow.
- Pieces have SOFT edges (each mask feathered ~3 px at 512) so a turned arm never ends in a cut line
  or fur spikes; the body is erased with the HARD outlines and the `under` fill closes the cut where
  it runs through the body (an eroded erase left a ghost rim of arm pixels instead). The forearm is
  drawn first and the upper arm over it (a real bicep overlaps the forearm; the other order hid the
  bicep). The upper arm's outline stops at the elbow row; the elbow cap is about as wide as the arm.
- Put the SHOULDER hinge in the middle of the arm's top, with a shoulder cap about as wide as the arm:
  a hinge near the arm's tapered top end left only that taper joining a raised arm to the body (the
  Bear's "pinched" shoulder). End both outlines SHORT of the elbow so only the two round caps meet
  there (outline corners at the elbow row poked out as blocks when it bent). Give the `under` fill a
  curved outer edge like a real flank (a straight one showed as a flat cut when the arm was away).
  Test the arm that actually attacks: the test page only ever swung the other one for a while.
- Art rule for anything that will get an arm rig: arms hang free of the body with a visible gap
  from the armpit down (the Zombie, the new Bear). Arms held in front of the chest can't be cut.
- Not yet: arms drawn BEHIND the body (both of the Zombie's are in front), a held item on the grip,
  the bone stretch.

## 9. Decisions for the owner

1. Rig data in `rigs.json` keyed by art (taken; it moved to the client, see §3).
2. Underpaint automatic first, AI inpaint only where it shows (taken).
3. The attack's hit timing comes from the clip's `hit` mark for rigged enemies (taken), the fixed
   wind-up stays for everyone else.
