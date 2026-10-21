/**
 * PixiRendererWalls: walls and fences that join up.
 *
 * A wall resource is placed one tile at a time (the existing Deco flow), and its look is
 * decided here from its neighbours: a resource whose master row has `wallSet` ("stone",
 * "fence") is drawn as the set's centre post plus one spoke per connected neighbour,
 * composed on a canvas from the atlas pieces `walls/<set>-post.png`, `-n/e/s/w` (spokes to
 * the tile's edges), `-ne/se/sw/nw` (spokes to its corners) and `-run-h/v/d1/d2` (a
 * tile-long run with no post, used when the tile is a straight pass-through), which
 * tools/art/walls.js cuts from one generated junction panel. The neighbour's matching
 * spoke meets it at the shared edge or corner, so any formation reads as one wall.
 *
 * Connection rules (the usual ones for 2D autotiles, plus diagonals):
 * - two walls of the same set connect when they are orthogonal or diagonal neighbours;
 * - a diagonal connection is dropped when either of its two orthogonal companions is
 *   also a wall (the L corner already joins them; a third line would clutter the corner).
 * Textures are cached per (set, mask): at most 256 looks per set, in practice a dozen.
 */
import { Texture } from 'pixi.js-legacy';
import { peekAtlasTexture } from './AtlasTextures';

// a set's piece size comes from its atlas frame: 128 (one tile) or 192 (a 1.5-tile square whose
// bottom and middle tile is the wall's tile; the stone wall stands taller than a tile)
const pieceSize = (set) => peekAtlasTexture('walls', `${set}-post.png`)?.frame?.width || 128;
/** How many tiles wide and tall a set's composed sprite is (1 or 1.5). */
export function wallSpan(set) { return pieceSize(set) / 128; }
const SIDES = ['n', 'e', 's', 'w'];     // bits 1, 2, 4, 8
const DIAGS = ['ne', 'se', 'sw', 'nw']; // bits 16, 32, 64, 128
const OFFSET = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0], ne: [1, -1], se: [1, 1], sw: [-1, 1], nw: [-1, -1] };
const COMPANIONS = { ne: ['n', 'e'], se: ['s', 'e'], sw: ['s', 'w'], nw: ['n', 'w'] };

// masks that are a straight pass-through: n+s, e+w, ne+sw, nw+se
const RUNS = { [1 | 4]: 'run-v', [2 | 8]: 'run-h', [16 | 64]: 'run-d1', [32 | 128]: 'run-d2' };

const cache = new Map(); // `${set}:${mask}` -> Texture

/** True when the atlas has this set's pieces (otherwise the caller draws the plain sprite). */
export function hasWallSet(set) {
  return !!(set && peekAtlasTexture('walls', `${set}-post.png`));
}

/** The wall resources by tile, per set: `"x,y"` -> set. Built once per render pass. */
export function indexWalls(resources, masterResources) {
  const setOf = new Map();
  for (const m of masterResources || []) if (m.wallSet) setOf.set(m.type, m.wallSet);
  const index = new Map();
  for (const r of resources || []) {
    const set = r.wallSet || setOf.get(r.type);
    if (set && (r.size || 1) === 1) index.set(`${r.x},${r.y}`, set);
  }
  return index;
}

/** The 8-neighbour connection mask for the wall at (x, y), with the diagonal rule applied. */
export function wallMask(index, set, x, y) {
  const is = (d) => index.get(`${x + OFFSET[d][0]},${y + OFFSET[d][1]}`) === set;
  let mask = 0;
  SIDES.forEach((d, i) => { if (is(d)) mask |= 1 << i; });
  DIAGS.forEach((d, i) => {
    if (!is(d)) return;
    const [a, b] = COMPANIONS[d];
    if (is(a) || is(b)) return;
    mask |= 1 << (4 + i);
  });
  return mask;
}

function drawPiece(ctx, set, piece) {
  const t = peekAtlasTexture('walls', `${set}-${piece}.png`);
  const source = t?.baseTexture?.resource?.source;
  if (!source) return;
  const f = t.frame;
  ctx.drawImage(source, f.x, f.y, f.width, f.height, 0, 0, f.width, f.height);
}

/** The composed texture for a set and mask (cached). Null when the set's pieces are not in the atlas. */
export function wallTexture(set, mask) {
  if (!hasWallSet(set)) return null;
  const key = `${set}:${mask}`;
  const hit = cache.get(key);
  if (hit && hit.valid !== false && hit.baseTexture?.valid !== false) return hit;
  cache.delete(key);
  const canvas = document.createElement('canvas');
  const size = pieceSize(set);
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  // A straight pass-through (only two opposite neighbours) is one continuous RUN piece with
  // no post, so a wall reads as one wall between its towers; everything else is post + spokes
  // (spokes first, their near ends sit under the post; diagonals before straights).
  const run = RUNS[mask];
  if (run) drawPiece(ctx, set, run);
  else {
    DIAGS.forEach((d, i) => { if (mask & (1 << (4 + i))) drawPiece(ctx, set, d); });
    SIDES.forEach((d, i) => { if (mask & (1 << i)) drawPiece(ctx, set, d); });
    drawPiece(ctx, set, 'post');
  }
  const texture = Texture.from(canvas);
  cache.set(key, texture);
  return texture;
}

export function clearWallTextureCache() {
  for (const t of cache.values()) { try { t.destroy(true); } catch (e) { /* already gone */ } }
  cache.clear();
}
