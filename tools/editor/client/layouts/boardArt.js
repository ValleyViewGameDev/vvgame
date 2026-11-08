/**
 * boardArt: the game's own sprite art for the Layouts canvas, drawn the way the game's board draws
 * it (game-client/src/Render/PixiRenderer/PixiRenderer.js), so a layout reads as it will in play.
 *
 * Files come straight from the game's public assets (the editor server's /game-assets/ route, a
 * static mirror of game-client/public/assets: no game-server calls). One Image per file, loaded on
 * first use; `onReady` is called (once per frame at most) when new art arrives so the canvas can
 * redraw. Anything without art keeps the emoji symbol.
 *
 * Mirrors, with the game file named:
 *   - artVariants: the weighted per-cell pick (Utils/artVariants.js, imported as-is)
 *   - the art box: artSpan (any size other than the footprint, a square bottom-centred on it),
 *     a 1 x 1 row's artScale / the 0.9 doober and plot scale (Render/PixiRenderer/boardArt.js),
 *     else the footprint
 *   - NPCs: a tile (x artScale) centred on their tile
 *   - walls and fences (wallSet): post + N/E/S/W spokes, or a straight run, from
 *     assets/walls/<set>-<piece>.png by the 4-neighbour mask (PixiRendererWalls.js)
 */
import { pickArtFile } from '/game-client/artVariants.js';

const ROOT = '/game-assets';
const DOOBER_TILE_SCALE = 0.9;
const images = new Map(); // url -> HTMLImageElement | 'error'
let onReady = null;
let pending = false;

export function setArtReadyHandler(fn) { onReady = fn; }

function notify() {
  if (pending || !onReady) return;
  pending = true;
  requestAnimationFrame(() => { pending = false; onReady?.(); });
}

/** The loaded image for an asset path ('resources/x.svg'), or null while loading / missing. */
export function artImage(rel) {
  if (!rel) return null;
  const url = `${ROOT}/${rel}`;
  const hit = images.get(url);
  if (hit === 'error') return null;
  if (hit) return hit.complete && hit.naturalWidth ? hit : null;
  const img = new Image();
  img.onload = notify;
  img.onerror = () => { images.set(url, 'error'); };
  img.src = url;
  images.set(url, img);
  return null;
}

/** The resource file the board would draw for this row at this cell (artVariants, else filename). */
export function boardFile(row, col, rowIdx) {
  return pickArtFile(row, col, rowIdx);
}

/**
 * Where the art goes, in TILE units relative to the grid's top-left: { x, y, w, h }.
 * (col, row) is the anchor cell (bottom-left of the footprint), fw x fh the footprint.
 */
export function artBox(res, col, row, fw, fh) {
  if (res.category === 'npc') {
    const s = Number(res.artScale) > 0 ? Number(res.artScale) : 1;
    return { x: col + (1 - s) / 2, y: row + (1 - s) / 2, w: s, h: s };
  }
  const span = Number(res.artSpan);
  if (span > 0 && span !== fw) return { x: col - (span - fw) / 2, y: row - (span - 1), w: span, h: span };
  if (fw === 1 && fh === 1) {
    const s = Number(res.artScale) > 0 ? Number(res.artScale)
      : (res.category === 'doober' || res.category === 'farmplot' ? DOOBER_TILE_SCALE : 1);
    return { x: col + (1 - s) / 2, y: row + (1 - s) / 2, w: s, h: s };
  }
  return { x: col, y: row - fh + 1, w: fw, h: fh };
}

const SIDES = ['n', 'e', 's', 'w'];
const OFFSET = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
const RUNS = { [1 | 4]: 'run-v', [2 | 8]: 'run-h' };

/**
 * The pieces of a wall tile, in draw order, plus its span (1 or 1.5 tiles, from the post's width):
 * { pieces: [Image], span } or null when the set's art is not loaded yet.
 * `setAt(col, row)` answers the wallSet standing on a neighbouring cell (or null).
 */
export function wallPieces(set, col, row, setAt) {
  const post = artImage(`walls/${set}-post.png`);
  if (!post) return null;
  let mask = 0;
  SIDES.forEach((d, i) => { if (setAt(col + OFFSET[d][0], row + OFFSET[d][1]) === set) mask |= 1 << i; });
  const names = RUNS[mask] ? [RUNS[mask]]
    : [...SIDES.filter((d, i) => d !== 's' && mask & (1 << i)), 'post', ...(mask & 4 ? ['s'] : [])];
  const pieces = names.map((n) => artImage(`walls/${set}-${n}.png`)).filter(Boolean);
  return { pieces, span: post.naturalWidth / 128 };
}
