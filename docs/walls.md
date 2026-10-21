# Walls and fences that join up (2026-10-20)

Walls and fences are placed one tile at a time through the Deco panel, as before, and
decide their look from their neighbours at render time, so a row reads as one wall, a
corner turns, a junction forks, and a diagonal line joins corner to corner. Nothing changed
in how they are stored, bought, path-blocked or sight-blocked: a wall is still a one-tile
resource with `action: 'wall'`, `passable: false`.

## The data

- A resource row joins a **set** with `wallSet` (ECONOMY sheet column): `Stone Wall` is
  `stone`, `Wooden Fence` is `fence`. Rows without `wallSet` (the coloured walls, the 2 x 2
  `Stone Wall Large`) draw as before. Two different sets never connect to each other.
- `filename` stays the Deco panel's cursor and button image: `wall-stone.svg`,
  `fence-wood.png` (a composed straight run, made by the cutter).

## The art: a post, eight spokes, four runs

Each set is thirteen pieces in `game-client/public/assets/walls/<set>-<piece>.png` (128 px,
atlas namespace `walls/`): `post`, spokes `n e s w` from the tile's centre to its edges,
spokes `ne se sw nw` from the centre to its corners, and RUNS `run-h run-v run-d1 run-d2`,
a tile-long straight piece with no post. A tile whose only neighbours are two opposite
ones (a straight pass-through, orthogonal or diagonal) draws its run; every other tile (an
end, a corner, a T, a cross) draws the post plus one spoke per connected neighbour. So a
wall is continuous, top and bottom, between its towers, and a tower stands only where the
wall ends, turns or meets another (owner, 2026-10-21). The neighbour's matching piece
meets it at the shared edge or corner.

`tools/art/walls.js` cuts them from two generated panels per set (`tools/art/jobs/walls.json`,
style `whimsical`, on the magenta mask guides `guides/wall-plus.png` and `wall-cross.png`):
a PLUS (post + four straight spokes) and a CROSS (post + four diagonals), the spokes one and
three quarter tiles long. Spokes 90 degrees apart overlap only at the post, so each cuts
clean as a quarter wedge around its direction; a run is the window one tile out along a
spoke (no post, no end cap in it); the post is an ellipse from the plus panel, sized per set
(`--post dy,rx,ry`) to cover the drawn tower, its top above the wall's line and its face.
The stone wall is drawn TALL (its face about twice the width of its top) and the fence's two
rails run the full length with a wide gap (owner's notes on the first pass).
(An eight-spoke panel was tried first: within ~85 px of the post every spoke overlaps its
neighbours and no partition can hand each spoke only its own pixels.) The keyer (`lib/key.js`,
`hue: true`) treats the shadow the model paints onto the magenta as background.

To make a new set: add two subjects to `jobs/walls.json` with the set's description,
generate, `node tools/art/walls.js --set <name> --plus <panel> --cross <panel>`, add the row
with `wallSet`, `npm run build:atlas`.

## The rules (`Render/PixiRenderer/PixiRendererWalls.js`)

- Two tiles of the same set connect when they are orthogonal or diagonal neighbours.
- A diagonal connection is dropped when either of its two orthogonal companions is also a
  wall: the L corner already joins them, and a third line would clutter the corner.
- The composed look is cached per (set, 8-bit mask): at most 256 per set, a dozen in use.
- The whole resource layer re-renders when a resource changes, so placing or removing one
  wall updates its neighbours' looks by itself.

Tested on the rehearsal homestead with a rectangle with a gap, a T, an L, a diagonal line,
a lone wall, a fence ring and a fence zigzag.
