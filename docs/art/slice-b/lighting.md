# Dynamic lighting: the board's "3D feel" at runtime (slice B design, 2026-10-19)

Status: DESIGN. No code changed, no money spent. Companion to `../../art-pipeline-plan.md`
§4 ("Warm board, dark grids"), §4b and §7. The reference games the owner toured (Octopath's
HD-2D, Eastward, Sea of Stars, Graveyard Keeper) get their depth from four runtime things, not
from the drawing: one fixed light direction, a contact shadow under every sprite, time-of-day
colour grading, and a glow layer for lanterns and windows. This doc says how to do those four
in PixiJS 7 legacy on a phone, with the art drawn once in neutral warm daylight.

## For the owner to approve

The recommended design, in five bullets:

1. **The art bakes the light direction and the contact shadow** (upper-left light, soft shadow
   to the lower right, already the bible rule). The renderer never draws shadows.
2. **One mechanism does both grading and darkness: a screen-sized light map** (a half-resolution
   RenderTexture cleared to the grid's ambient colour, with soft additive light sprites drawn
   into it) shown through ONE full-viewport sprite in MULTIPLY blend. No ColorMatrixFilter in
   the first build, no BlurFilter ever. Pixi 7 containers have no `tint`, so "tint the world"
   is not an option without touching every sprite.
3. **A grid declares a mood in tuning, not code**: `tuning/lighting.json` (editor sheet) maps
   `gtype` / `region` to a mood row (ambient colour, brightness floor, player light radius,
   tile lights, emissive strength), looked up exactly the way `VFXMap.json` picks ambient VFX.
4. **Emitters are data on the resource row** (`lightRadius`, `lightColor`, `lightFlicker`
   columns in the ECONOMY sheet) plus, for generated art, an emissive mask the generator
   produces for free from a reserved palette swatch. Glow is additive sprites of one radial
   texture, never a filter.
5. **Build it in three slices (~24 to 34 h)**, proof of concept first on dungeon `d001` with its
   193 lava tiles as lights, which needs no new art and no server change.

Decisions needed from the owner:

| # | Decision | Recommendation |
|---|---|---|
| D1 | Where "time of day" comes from: fixed per grid mood, the device clock, or a server day cycle | Fixed per mood first (zero plumbing); device clock as a later per-mood flag |
| D2 | Does night ever darken homesteads and towns (farming readability)? | Yes, but with a brightness floor of 0.45; dungeons 0.12 |
| D3 | Light map over ColorMatrixFilter as the one grading mechanism | Yes; ColorMatrix only later for a grey cave desaturation if a mood needs it |
| D4 | Dynamic shadows | No (section 5) |
| D5 | Emissive mask via a reserved palette swatch extracted in `accept.js` | Yes; it rides on slice B's palette work, one extra swatch pair |
| D6 | PoC grid and light | Dungeon `d001`, lava tiles + the player's radius, hardcoded mood |

## 1. What the art supplies, what the renderer does

| Art (generated once, neutral warm daylight) | Renderer (per grid, per frame) |
|---|---|
| Light from the upper left on every object (bible rule, `art-pipeline-plan.md` §4) | Nothing: the direction is a prompt sentence, locked in `style.json` |
| Soft contact shadow to the lower right, inside the object's own footprint (§5 checker rule) | Nothing: no shadow pass, no skew, no second draw of the sprite |
| Lit top plane, shaded front, dark outline (the Graveyard Keeper recipe) | Nothing |
| Windows, flames, lamps painted in the reserved **emissive swatches** (warm window yellow, flame orange) | Hides or shows the emissive mask by the mood's `emissive` strength; adds a point light |
| Nothing darker for dungeons or night | Grades the whole board with the mood's ambient colour and cuts light holes |

**The emissive mask.** For every accepted asset whose row has `lightRadius > 0`, `accept.js`
writes `public/assets/resources/emissive/<name>.png`: white where a pixel is within a small
colour distance of an emissive swatch (the palette compliance scorer in `check.js` already
computes exactly that distance), transparent elsewhere, soft-edged by the coverage. It is a
by-product of the palette step in `art-pipeline-plan.md` §6b.2; no second model call, no hand
painting. `scripts/build-atlas.js` gets an `emissive/` namespace (one more `list*Sources`
beside `listResourceSources`, line 72; same slot sizes) and `AtlasTextures.getAtlasTexture('emissive', file)`
serves it. Today's SVG and emoji assets have no mask: they get a point light only, which
already reads as lit. Whether the day asset keeps the yellow window or `accept.js` repaints it
to the "window dark" swatch is a bible call; Graveyard Keeper keeps them yellow.

Real emitters in `game-server/tuning/resources.json` to seed the columns with: Farm House
(`farm-house.svg`, 2 x 2, windows), Oven (`oven.svg`, firebox), Kitchen, Coffee Factory,
Winery, Beverage Station, Lumber Yard, Mill, Magic Shop (`magic-shop.svg`, 3 x 3), Shrine, Bank,
Laboratory, Factory, Ancient Temple, Courthouse (`town-hall.svg`, 5 x 5), **Train** (`wagon.svg`,
2 x 2, headlamp and windows), **Carnival** (`carnival.svg`, 4 x 4, wheel lights), Adventure Camp
(`adventure-camp.svg`, a campfire), Inn and Post House (emoji today, 3 x 3), Hecate's Torch
(🔥 special), Brief Candle (🕯️ doober), Holiday Tree (🎄), Ghost and Phoenix (NPC glow), and the
lava tile (`l`, `tileColors.js` `#c4583d`). Note that dungeons are not dark today: `d001.json`
is 3,785 cobblestone, 193 lava, 70 pavement, 48 slate, all drawn at daylight brightness.

## 2. Time-of-day and per-grid grading

Three ways to grade the whole board in Pixi 7, on the current renderer (viewport-sized canvas,
`resolution: devicePixelRatio`, `antialias: true`, 30 fps cap, `PixiRenderer.js:570-578`).
Numbers are for an iPhone 15 class viewport, 393 x 852 CSS px at DPR 3 = 1,179 x 2,556 device px.

| Option | Extra GPU memory | Extra work per frame | Can it | Verdict |
|---|---|---|---|---|
| A. Tint on the world container | none | none | Nothing: `Container` has no `tint` in Pixi 7 (`@pixi/display` Container.d.ts, 0 matches). Per-sprite tint means writing 4,096 tile + every resource sprite on each mood change and collides with `CombatFX.js:182-219`, which records and restores `obj.tint` for hit flashes | No |
| B. `ColorMatrixFilter` on the world | one full-res RT: 12.1 MB (3.0 Mpx x 4 B) | the world rendered to the RT, then one 3 Mpx fragment pass, every frame | Any grade: tint, brightness, desaturate, contrast | Later, only for desaturation; too much fill rate to run always on phones |
| C. One full-viewport MULTIPLY sprite (`Texture.WHITE`, tinted) | none | 1 draw call, 1 quad | Darken and warm (multiply can only darken) | The slice 1 answer; it is the light map of section 3 with zero lights |

Option C is what slice 1 ships: `lighting` container inside `world`, inserted before `overlays`
(the `PixiRendererPCs.js:247-266` pattern), holding one sprite whose world-space rect covers the
viewport (`x = -world.x / zoom`, `w = viewport.w / zoom`, from `PixiCamera.getViewport()` and
`getZoom()`), `blendMode = BLEND_MODES.MULTIPLY`, `tint = mood.ambient`. Overlays, speech bubbles
and combat text draw above it and stay readable. Multiply on a transparent pixel does nothing,
and the canvas is transparent beyond the grid edge (`backgroundAlpha: 0`, the DOM `.homestead`
grass shows through, `App.css:522`), so slice 1 also makes the canvas opaque in that same grass
colour (`app.renderer.background`), otherwise the world ends at a bright green edge at night.

**How a grid declares its mood.** `game-server/tuning/lighting.json`, shape `array`, one row per
mood, with a `definitions.js` entry so it gets a sheet, validation and CSV import for free:

| Column | Type | Example (homestead day) | Example (dungeon dark) |
|---|---|---|---|
| `mood` | string, immutable id | `day` | `dungeon-dark` |
| `gtypes` | string, comma list, matches `location.gtype` | `homestead,town,valley1,valley2,valley3` | `dungeon` |
| `regions` | string, comma list, matches `location.region`, wins over gtypes | | `Golgotha,Acheron` |
| `ambient` | string, hex | `#ffffff` | `#241c2e` |
| `floor` | number 0..1, the darkest any pixel may get | `1` | `0.12` |
| `playerLight` | number, tiles (0 = none) | `0` | `4` |
| `playerLightColor` | string, hex | | `#ffd9a0` |
| `tileLights` | json, `{ "l": { "radius": 2.5, "color": "#ff7a30", "flicker": 0.4 } }` | `{}` | lava as above |
| `emissive` | number 0..1, strength of the emissive masks | `0` | `1` |
| `followsClock` | boolean (D1; off in slice 1) | `false` | `false` |

Lookup lives beside the two hooks that already receive the location on every grid change:
`AppInit.js:115` (`ambientVFXManager.onGridEnter(player.location, ...)`) and `:123`
(`soundManager.onGridEnter`); `location.gtype` and `location.region` are set in
`GridManagement.js:548-557`. The matching rule is `AmbientVFXManager.getEffectForLocation`
(lines 66-78): region first, then gtype, then a `default` row. The grid change already fades to
black (`UI/TransitionContext.js`), so the mood swaps behind the fade; no cross-fade in slice 1.
Valley dusk and homestead day are two rows; the Carnival window or a season could later pick a
different row by adding a `seasons` column. There is no in-game clock today (seasons only), hence D1.

## 3. Darkness, the player's light radius, point lights

The classic trick, "a dark overlay with holes cut by ERASE sprites", cannot be drawn straight
onto the canvas here: ERASE is `(ZERO, ONE_MINUS_SRC_ALPHA)` and would erase the world pixels
under the hole as well, showing the DOM behind the transparent canvas. The holes have to be cut
in an offscreen texture first, which makes the two approaches the same thing: a light map.

| Approach | Memory | Per frame | Looks | Verdict |
|---|---|---|---|---|
| Per-tile darkness quads: 4,096 black sprites, alpha from distance to lights | 4,096 sprites, 1 draw call (shared `Texture.WHITE`) | 4,096 alpha writes whenever a light or the player moves | Blocky, tile-resolution light | No; it fights the soft look |
| World-space light map, one per grid at 45 px tiles | 2,880 x 2,880 x 4 B = 33 MB at 1x, 298 MB at DPR 3 | redraw on change | Smooth | No; it is the 2026-10-03 canvas mistake again (§2.4 of the audit) |
| **Screen-space light map**, viewport-sized RT at resolution 0.5 | 197 x 426 x 4 B = 0.34 MB (1.34 MB at 1x) | 1 `renderer.render(lightScene, { renderTexture })` of N soft sprites, 1 draw call when they share a texture, plus the 1 multiply quad | Smooth, soft, scales with zoom | **Yes** |

Light sprites live in an off-stage `lightScene` container (not a child of `world`): a dark
backdrop `Graphics` in the ambient colour, then one additive (`BLEND_MODES.ADD`) sprite per
light, all using one 128 px radial-gradient texture drawn on a canvas at boot (no PNG, no
filter). Positions are world base px, so `lightScene` is rendered with
`transform = worldContainer.worldTransform` (scaled by 0.5 for the RT resolution) and the lights
follow the camera and pinch zoom for free. The multiply quad then shows the RT. The player light
reads the PC's render position the way `PixiRendererVFX.js` does (`getPCRenderPosition`), so it
glides with the step tween.

Light sources, in order of registration: the player (mood `playerLight`), tiles (the tile effect,
`PixiRenderer.js:786-830`, sees `tileTypes[row][col]`; a mood `tileLights` key adds a light per
cell), resources (`placeResources`, `PixiRenderer.js:876-960`, reads `lightRadius` off the master
row), NPCs (same columns on the npc row, position from `getNPCRenderPosition`). Budget: `d001`
has 193 lava cells and a town has about 40 lit buildings; at far zoom (14 px tiles,
`globalTuning.json:67-72`) the whole grid is on screen, so 200 to 250 light sprites is the
working ceiling and it is one draw call. The RT is re-rendered only when something changed
(camera transform, a light's position, a flicker tick at 8 Hz), not every frame; the quad is
drawn every frame regardless, which is one quad.

`floor` is applied by clearing the backdrop to `ambient * floor` and letting lights add up to
`ambient`; a homestead at night then never drops below 45% brightness (D2), a dungeon does.

## 4. Glow for emitters

Glow is the same radial texture drawn a second time ABOVE the light map, in `world` (a `glow`
container after `lighting`, before `overlays`), ADD blend, the emitter's colour, 1.2 to 2 tiles
wide, alpha = `mood.emissive * flicker(t)`. Plus, for generated assets, the emissive mask sprite
from the `emissive/` atlas namespace drawn in NORMAL blend at the resource's exact rect, alpha
`mood.emissive`, so a window reads as a lit window and not just a blob. No `BlurFilter`: the
2026-10-03 incident was iOS Safari rasterising 7,200 px DOM glow blurs (`PixiRenderer.js:1890`
comment, audit §2.4), and a Pixi blur is a two-pass full-rect filter per sprite; a pre-drawn
gradient texture costs nothing. Flicker is a slow noise (2 to 4 Hz, +-15%) so it still reads at
the 30 fps cap; a fast flicker strobes at that rate.

## 5. Dynamic shadows: no

- The contact shadow is in the art (bible rule), which is where every reference game has it too;
  Octopath's and Graveyard Keeper's shadows do not rotate with the time of day.
- A runtime shadow in 2D is a second draw of every resource sprite, skewed and tinted black:
  the resource layer's draw calls double, and the skewed copy fights the baked shadow and spills
  over the tile below (the bible forbids a shadow outside the footprint for a reason: tiles
  are packed one object each).
- Night is already "shadow everywhere"; the light map gives the depth cue.
- One allowed exception if the generated full-body figures lack a ground contact: a shared soft
  ellipse sprite under PCs and NPCs (one texture, one sprite each, y-sorted with the body). Decide
  when the first figures stand on the board; not part of this design's slices.

## 6. Camera zoom and the DOM overlays

| Zoom (px per tile, `globalTuning.json`) | What the lighting layer does |
|---|---|
| closer 75, close 45, farish 25, far 14 | On. The light scene renders through `worldContainer.worldTransform`, so radii scale with the tiles; the RT stays viewport-sized |
| settlement 2, frontier 0.25 | Off (alpha 0 over 200 ms, driven by `isSettlementZoom` / `isFrontierZoom`, `PixiRenderer.js:382-383`). The previews are DOM above the canvas and would not be graded anyway |

The DOM overlay `.pixi-world-container` (zIndex 2, `PixiRenderer.js:1869`) sits above the canvas
and is never graded: `UI/FloatingText.js`, `VFX/VFX.js` collect, swipe and plant-grow particles
(emoji divs and a raw `<img>` SVG), `VFX/NPCVFX.js` headline glyphs, the FTUE doinker, the
settlement and frontier previews. In practice: a collect sparkle at full brightness over a dark
dungeon is fine (it is a glow), the plant-grow SVG at full daylight on a night homestead is the
one visible oddity. Fix is not in this lane: the audit's §2.5 C already moves VFX.js into Pixi,
and once those sprites live in `world` under `lighting` they are graded like everything else.
Pinch zoom and `PixiCamera.panBy` move `worldContainer` only; the multiply quad is re-fitted to
the viewport in the same ticker that re-renders the RT, so there is no DOM read and no round
trip between an input and the visual. `PixiCamera.resizeToHost` (orientation change) must also
resize or recreate the RT; it is the one place a new allocation happens after boot.

## 7. Build order, effort, proof of concept

| Slice | What | Files | Hours |
|---|---|---|---|
| L1 Grading | `lighting.json` + `definitions.js` entry; `PixiRendererLighting.js` singleton (attach / onGridEnter / detach, the `CombatFX.js:79-100` shape); the multiply quad; opaque canvas background; off at settlement and frontier zoom | `PixiRenderer.js:598-664` (attach beside CombatFX), `AppInit.js:115`, `tools/editor/sheets/definitions.js` | 6 to 8 |
| L2 Light map | the RT + `lightScene`; radial texture; player light; tile lights from the tile effect; resource and NPC lights from new ECONOMY columns `lightRadius`, `lightColor`, `lightFlicker`; change-driven re-render; RT resize | `PixiRenderer.js:786-830` and `:876-960`, `PixiRendererVFX.js` position helpers, `definitions.js` ECONOMY columns | 10 to 14 |
| L3 Emissive + glow | emissive swatches in `palette.json`; mask extraction in `accept.js`; `emissive/` namespace in `build-atlas.js`; glow container; mask sprites; flicker | `tools/art/accept.js`, `check.js`, `game-client/scripts/build-atlas.js:72`, `AtlasTextures.js` | 8 to 12 |

**Proof of concept (do first, inside L2, about 6 h, no tuning file yet):** hardcode the
`dungeon-dark` mood for `gtype === 'dungeon'`, give the player a 4-tile warm light and every
lava tile a 2.5-tile orange flickering light, and walk `d001` on an iPhone. It proves the three
things that matter before any art is generated: that one half-resolution RT plus a multiply quad
holds 30 fps on iOS Safari with ~200 lights and no context loss; that a daylight-drawn
cobblestone floor becomes a convincing dark dungeon with no darker tiles; and that the hole cut
by the player's light, moving with the step tween, feels like the reference games. If it fails on
fill rate, the fallback is already in the design (RT at 0.25, lights clustered per 2 x 2 cells).

Sketch of the core, so the shape is clear (not final code):

```js
// PixiRendererLighting.js (singleton; attach() from PixiRenderer's initPixi, next to CombatFX)
const rt = RenderTexture.create({ width: vw, height: vh, resolution: 0.5 });
const scene = new Container();                       // off-stage: backdrop + ADD lights
const backdrop = new Graphics(); scene.addChild(backdrop);
const quad = new Sprite(rt); quad.blendMode = BLEND_MODES.MULTIPLY;
world.addChildAt(layer, world.children.findIndex((c) => c.name === 'overlays'));
function addLight(x, y, radiusTiles, color, flicker) { /* Sprite(radialTex), ADD, scene.addChild */ }
function tick() {                                    // app.ticker; skips when nothing changed
  const z = PixiCamera.getZoom(), v = PixiCamera.getViewport();
  backdrop.clear().beginFill(mulColor(mood.ambient, mood.floor)).drawRect(0, 0, vw, vh).endFill();
  app.renderer.render(scene, { renderTexture: rt, clear: true, transform: world.worldTransform });
  quad.position.set(-world.x / z, -world.y / z); quad.width = v.width / z; quad.height = v.height / z;
}
```

## 8. Risks

| Risk | Why it matters here | Mitigation |
|---|---|---|
| iOS Safari texture memory and WebGL context loss | the renderer answers context loss with a page reload (`PixiRenderer.js:668-690`) | one RT, resolution 0.5, recreated only on resize; measured in the PoC |
| Night readability (doobers, crops, NPC states) | the loop is farming and collecting; dark grids hide the payload | `floor` per mood (D2), never below 0.45 on homestead and town; emissive doobers (candle) get their own light |
| Premultiplied alpha and MULTIPLY on transparent pixels | the world ends at a bright edge | opaque canvas background in L1; lights clear to alpha 1 |
| Canvas2D fallback renderer (`pixi.js-legacy`) | `multiply` and `lighter` exist in Canvas2D but the RT render is slow there | the fallback is a fallback; lighting turns itself off when `renderer.type !== WEBGL` |
| `antialias: true` + `preferWebGLVersion: 1` | WebGL1 has no multisampled RTs, which is fine; MSAA on the main buffer costs fill rate on top of the new quad | the audit already recommends `antialias: false`; do it in L1 |
| Flicker at 30 fps | fast flicker strobes | 2 to 4 Hz noise, +-15% |
| DOM VFX stays daylight at night | section 6 | accepted until VFX.js moves into Pixi |
| Per-grid tuning drift | 64 settlements, regions, valleys | moods are a handful of rows; grids select, they never define colours |
| Mood change mid combat flash | `CombatFX` restores `obj.tint` | no per-sprite tint in this design, so no interaction |
