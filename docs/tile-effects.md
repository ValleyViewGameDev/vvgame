# Ambient tile effects (2026-10-21)

Living ground: effects that play on the tiles themselves, with no gameplay meaning. Built
and approved 2026-10-21 for lava and water; sand (and maybe others) to come. The code is
`game-client/src/Render/PixiRenderer/PixiRendererTileFX.js`, one layer `tile-fx` right
above the ground tiles and under everything that stands on them. The rules are also in
`ui-conventions.md` §8.

## Status

| Tile | Mechanism | Status |
|---|---|---|
| Lava (`l`) | TILE effect: random bubbles per tile | built; the owner wanted it "slightly more realistic" than the first cut, the soft-dome version is in; not yet seen for long by the owner (the lava valley hurts the player) |
| Water (`w`) | FIELD effect: one shader over the whole water body | **APPROVED** by the owner ("I like the water"), with two follow-ups applied: every water tile gets it (edge tiles included, grass stays on top) and it is always on |
| Sand | TILE effect, to design | not started |

## Two mechanisms

**TILE effects (`TILE_FX`)**: per-tile, chance-based, short. A tile is eligible when every
tile within `ring` of it is the same type (interior of a field). Each eligible tile has its
own random cooldown; when it runs out the tile rolls `chance` and, on a win, plays
`durationMs` of effect built from fresh random numbers by the type's `build(container,
textures, TILE_SIZE)` function, which returns `{ update(elapsedMs) }`. Only tiles in the
camera's view are rolled (a lava valley is 4,000 lava tiles), nothing plays under
`minTilePx` on screen (the far zooms), `maxActive` caps effects in flight. The first roll of
each tile lands anywhere inside one cooldown so a field never starts in step. Result: a big
field reads as organic, unpredictable activity, never a wave.

**FIELD effects (`FIELD_FX`)**: one GPU filter over the whole field of a type. The field is a
mask sprite (MASK_PX = 24 texels per tile) built from `drawTileCoverage` in
`PixiRendererTileTextures.js`: every tile of the type, minus the neighbours' corner rounding
and the grass lip, drawn in destination-out exactly as the tile texture draws them, so the
effect never bleeds onto grass. The type's fragment shader paints the effect where the mask
is set, in WORLD space (uniforms: time, the world container's position and scale, the tile
size), so the pattern stays pinned to the board while the camera pans and zooms. Cost: one
pass over the field's screen area whatever the lake's size, no sprite per tile. The mask is
rebuilt when the tile map changes and when the atlas lands (it brings the lip pieces).

Pick TILE for things that are events (a bubble, a puff, a ripple from a point) and FIELD for
things that are a surface (reflections, shimmer, flow).

## Lava: bubbles (TILE)

Decisions: ring 2 (every tile within 2 is lava), 25 % chance, 2.4 s effect, cooldown 4 to
10 s per tile, at most 120 in flight, nothing below 16 px per tile. One to three bubbles per
effect, each a soft dome of hotter lava (gradient disc sprites, no outlines) that swells on
a faint glow with a bright top that leans, flares and thins in about a sixth of a second,
throws three to six tiny droplets that arc and fall back, and leaves a darker cooled spot
that fades. Every number is random per bubble. The owner's first note was "too cartoony,
slightly more realistic": the first cut used outlined rings, which read as cartoon; the
dome version replaced it. The visible bubble (swell + burst) is within ~1.9 s; the cooling
tail is subtle.

## Water: reflections and sparkles (FIELD, approved)

The owner's references were the pixel-art RPG water shaders (a Unity SpriteShape thread and
a Reddit "water shader for my pixel art RPG" post): moving light reflections plus sparkles,
cheap. A first attempt as a TILE effect (a crested wave drifting one way) was rolled back
before it was judged: the owner stopped it ("I don't think this approach is going to look
good") and asked for the shader approach. No bubbles on water: they would suggest something
under the surface, and fishing may come later (owner).

The shader: the reflections are the EDGES of a voronoi cell field whose seed points wander
slowly (`voro`, 3 x 3 neighbourhood, points swing on a sine), so the bright network keeps
folding and reconnecting; the whole field drifts one way with the wind (`vec2(0.86, 0.5)`,
a little south of east); two scales (0.6 and ~1.1 cells per tile) at low opacity (0.2);
a slow large swell of brightness (`patches`, 0.75 to 1.0) so it breathes but never goes
out (owner: always on). Sparkles: a hash grid of 2 cells per tile, 40 % of cells ever
sparkle, each on its own clock, a short diamond twinkle every ~8 s. Faded out below 10 px
per tile. Colour: pale cyan-white lines, white sparkles. Iterations: sine isolines (blobby
closed loops, rejected), dense crisp voronoi at 1.5 cells per tile (read as cracked tile,
rejected), the large soft patchy voronoi (approved), then always-on and full coverage.

## How to test

- Rehearsal: launch `vvgame-server-rehearsal` (3011) and `vvgame-client` (3010). The client
  takes 60 to 120 s to come up on the dev server; a full reload is needed after editing the
  module (Fast Refresh re-runs other renderer components' effects against destroyed Pixi
  objects and shows "Cannot read properties of null (reading 'clear')" overlays).
- Put the test player somewhere with a big field. On the rehearsal server:
  `curl -X POST localhost:3011/api/enter-grid -H 'Content-Type: application/json' -d '{"playerId":"<id>","target":{"type":"coord","gridCoord":1015513}}'`
  (1015513, 1014573: all lava, Acheron; the lava hurts the player, about 5 HP a tick, and
  a demon roams, so the player dies in a minute: revive with gems, it is the rehearsal copy)
  and `1012602` or the other lake grids (all water, Sunflower Lake). `{"type":"home"}` sends
  the player back. Oberon's homestead has water beside grass and pavement for the edges.
- `window.__tileFx()` (dev only) reports eligible tiles, effects in flight, the field types
  built and the FPS. Measure FPS with the console, not while taking screenshots (the
  screenshot capture itself drops the frame rate to ~20).
- Shader gotcha: Pixi declares `inputSize` and `outputFrame` highp in its vertex shader, so a
  fragment shader must declare them `highp` too or the program fails to link ("Precisions of
  uniform 'inputSize' differ").

## Next

- Sand: a TILE effect to design (a drift of grains? heat shimmer would be a FIELD). Decide
  with the owner.
- The lava bubbles have not been watched at length by the owner; tune `TILE_FX.l`
  (sizes, counts, cooldown) if asked.
