# Zoo animals and farm animals: the art strategy (BL-16, written 2026-11-08, no art yet)

The second-to-last art pass. Two families that look alike on the board and are nothing alike
underneath, so two tracks. The owner greenlights the sheets; nothing is generated until then.

## What they are today

**Zoo animals** are twelve `category: pet` rows bought in the Pets panel (`source: Zoo`) with
Yellow Hearts, placed on the homestead like a building, and fed an ingredient (the row's
`output`: Milk for the Cat, Bacon for the Poodle ...) to search for a reward over `crafttime`;
the board shows the feeding and reward-ready states with the existing clock and checkmark
overlays (`PixiRenderer.js`, the `pet` branch beside crafting stations). They never move. The
Pet panel shows the animal as a big emoji (`.pet-display`, `PetPanel.js`) and the Pets panel's
buy cards print the emoji through ResourceButton. All twelve draw as Twemoji on the board.

| Pet | Level | `size` today | Note |
|---|---|---|---|
| Cat, Poodle, Monkey, Duck, Owl, Parrot, Eagle, Dodo Bird | 15 to 58 | 1 | one tile |
| Donkey | 20 | 1.6 | the fractional sizes were an emoji font scale, but the footprint loops read them as 2 x 2 |
| Orangutan | 45 | 1.5 | same, 2 x 2 |
| Zebra | 30 | 1.8 | same, 2 x 2 |
| Giraffe | 34 | 3 | 3 x 3 |

**Farm animals** are six `category: npc, action: graze` rows (Cow, Sheep, Brown Cow, Ram, Goat
and the Pig, which already has `npc-pig.svg` from the first style slice) bought in the Buy
panel, that WALK: the NPC renderer tweens each step with a facing flip (`artFacing`) and a bob,
and their grazing / ready states are the NPC headline effects. Five still draw as Twemoji.

## Track 1: the zoo animals as standing props

They do not move, so they take the deco pipeline, not the NPC one: drawn on magenta with the
barrel as the camera reference and the Pig's panel as the ANIMAL reference (slice A's
`animal-pig` prompt: standing, back and side visible, head turned a little toward the viewer),
cut with the silhouette fit, defringed, seated at the square's bottom, approved on grass and
dirt with names. Rules carried over from the deco pass (docs/art/deco.md): big plain shapes
at 45 px, no purples or pinks near the magenta key (the Parrot is red, green, blue and yellow;
no magenta macaw), one contact shadow only, the oak's green for any foliage.

- **Footprints become explicit** (BL-21): everything 1 x 1 except Zebra 2 x 1 and Giraffe 1 x 2,
  with the art rising past the footprint through `artSpan` (Giraffe ~2.6, Zebra ~1.9, Donkey and
  Orangutan ~1.3, the rest ~1.0 to 1.2). The fractional `size` values go; `sizeX` / `sizeY` take
  their place. Anything already placed on a live grid keeps its anchor; the server reads the
  footprint from the master row.
- **Birds get a perch** (Owl, Parrot, Eagle): a short branch stump or a low post, so a bird sits
  on a ground tile without floating. The Duck and the Dodo stand.
- **No state art.** Feeding and ready are the overlays that exist; sleeping (Zzz) is the headline
  effect. Idle is one still drawing. If the owner later wants life, an idle bob is a renderer
  flag, not art.
- **Panels.** `PetPanel.js` shows the animal through ResourceIcon at ~96 px instead of the emoji;
  the Pets panel's cards pick up `filename` through ResourceIcon with no change. The Buy panel's
  farm animal cards do the same.
- **Sheets.** Two jobs, two candidates each, the owner picks per animal:
  `zoo-small` = Cat, Poodle, Duck, Owl, Parrot, Eagle, Dodo Bird, Monkey (eight 1 x 1);
  `zoo-large` = Donkey, Orangutan, Zebra (2 x 1), Giraffe (1 x 2). About 24 generations.
- **Prices and levels unchanged**; the rows gain `filename`, `artSpan`, the footprint fields and
  lose `size`; `npm run build:atlas`; the Twemoji frames for them drop out of the atlas.

## Track 2: the farm animals as walking NPCs

The Pig is the proof: `npc-pig.svg`, `artFacing: right`, drawn on the board by the NPC renderer
with the flip and bob. The other five follow it exactly: one sheet (`farm-animals`), the Pig's
cut as the style reference beside the barrel, each animal standing side-on facing the Pig's way
(`artFacing` set per row from the drawing), cut with the silhouette fit at the Pig's scale (its
artSpan is the band). Sheep and Ram are white, Cow black and white, Brown Cow brown, Goat grey:
all far from the magenta key. Grazing, processing (ready) and the walk need no frames: the
renderer already bobs and flips, the states are headline effects.

- Check first: `PixiRendererNPCs` (the NPC layer in `PixiRenderer.js`) reads `artScale` and
  `artFacing`; a one-tile animal at artSpan ~1 draws at tile size, so the Pig's numbers are the
  band for the others.
- Buy panel cards and the animal's own panel pick up `filename` through ResourceIcon.

## Order and gates

1. Zoo small sheet (eight) -> approve -> rows, panels, atlas.
2. Zoo large sheet (four, the two rectangles) -> approve -> rows.
3. Farm animals (five) -> approve -> rows with `artFacing`.
4. Then BL-17, the avatars, which is the last emoji in the game.

Each step ships on its own commit; the server restarts for the rows locally and a push deploys.
