/**
 * actorShadows: a soft shadow on the ground under every figure on the board (owner 2026-11-15): the
 * player, citizens, farm animals and enemies, hovering ones too. The Phoenix, the Demon, the Dragon
 * and the Fairy used to carry a shadow painted into their art; it was taken out of the drawings so
 * that every figure's shadow is this one, made to look as those did (near-black, a flat soft-edged
 * ellipse, about 40% dark).
 *
 * One small sprite per figure, all of ONE shared texture (a pre-blurred ellipse drawn once on a
 * canvas: never a blur filter), in the y-sorted `objects` layer just under its figure, so it lies on
 * whatever the figure stands on (the ground, a rug) and behind anything further south.
 *
 * The renderers only say WHICH figures have one (`trackShadow` / `untrackShadow`); one ticker pass a
 * frame, after the frame's moves and before the draw, puts each blob under its figure:
 *   - where the art's FEET are (artHitTest.opaqueFeet: the lowest opaque row and how wide the art is
 *     just above it), so a cow's is long, a zombie's small and a 2 x 2 beast's big, with no tuning.
 *     A HOVERING figure (a row's `hover`) has no feet down: its blob lies along the bottom edge of its
 *     art square, the ground it was drawn floating over, as wide as a share of the whole drawing;
 *   - at the figure's position, which is the ground: an attack's lunge, a hit's knockback and the
 *     walk are pivot and vertex moves (CombatFX, BreathSprite), so the shadow stays put under them.
 *     An NPC's step bob lifts its sprite; the renderer notes it as `__bob` and the blob ignores it;
 *   - fading and shrinking with the figure (the death beat), hidden when it is, gone when it is.
 */
import { Sprite, Texture } from 'pixi.js-legacy';

export const SHADOW = {
  colour: '7, 5, 3', // the painted shadows' own near-black
  alpha: 0.4,        // at its darkest
  core: 0.55,        // the share of the radius that is evenly dark; it fades out from there to the rim
  widen: 1.3,        // how much wider than the feet the blob is
  minW: 0.5,         // tiles: never narrower (a figure standing with its feet together)
  flat: 4.5,         // its width over its height
  sink: 0.15,        // the share of its height its centre sits ABOVE the lowest point of the feet
  hoverShare: 0.42,  // a hovering figure's blob, of the whole drawing's width (what the painted ones were)
  hoverMinW: 0.28,   // tiles: the Fairy is small
  hoverFlat: 6,      // a shadow cast from the air is flatter (the painted ones' shape)
  under: 0.02,       // how far under its figure it sorts (zIndex)
};
const DEFAULT_FEET = { bottom: 0.94, left: 0.22, right: 0.78, minX: 0.1, maxX: 0.9 }; // art that could not be measured (an emoji)

let texture = null;
/** The one shadow texture: a soft ellipse, 128 x 128 (the sprite is scaled flat). */
export function shadowTexture() {
  if (texture && texture.baseTexture && !texture.baseTexture.destroyed) return texture;
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d'), grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, `rgba(${SHADOW.colour}, ${SHADOW.alpha})`);
  grad.addColorStop(SHADOW.core, `rgba(${SHADOW.colour}, ${SHADOW.alpha * 0.96})`);
  grad.addColorStop(SHADOW.core + (1 - SHADOW.core) * 0.55, `rgba(${SHADOW.colour}, ${SHADOW.alpha * 0.5})`);
  grad.addColorStop(1, `rgba(${SHADOW.colour}, 0)`);
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  texture = Texture.from(c);
  return texture;
}

/**
 * Where the blob lies for a figure drawn as a `size` px square anchored at (0.5, anchorY), whose feet
 * are `feet` (artHitTest.opaqueFeet: fractions of the square). Px from the figure's position, for a
 * figure facing as drawn: { dx, dy (the blob's centre), w, h }. `hover`: the figure floats.
 */
export function shadowBox(feet, size, anchorY, tile, hover = false) {
  const f = feet || DEFAULT_FEET;
  if (hover) {
    const w = Math.max(SHADOW.hoverMinW * tile, (f.maxX - f.minX) * size * SHADOW.hoverShare), h = w / SHADOW.hoverFlat;
    return { dx: ((f.minX + f.maxX) / 2 - 0.5) * size, dy: (1 - anchorY) * size - h / 2, w, h };
  }
  const w = Math.max(SHADOW.minW * tile, (f.right - f.left) * size * SHADOW.widen), h = w / SHADOW.flat;
  return { dx: ((f.left + f.right) / 2 - 0.5) * size, dy: (f.bottom - anchorY) * size - h * SHADOW.sink, w, h };
}

const tracked = new Map(); // figure display object -> { shadow, layer, box }
let ticker = null;

/** Start placing shadows each frame on this app's ticker (after the frame's moves, before the draw). */
export function attach(app) {
  detach();
  ticker = app.ticker;
  ticker.add(sync, null, -20); // under NORMAL (the NPC and player animators), over LOW (the draw)
}

export function detach() {
  if (ticker) { try { ticker.remove(sync); } catch (e) { /* the ticker is gone */ } ticker = null; }
  for (const obj of [...tracked.keys()]) untrackShadow(obj);
}

/**
 * Give `obj` (a figure's sprite in `layer`) a shadow, or update the one it has. `opts`: { feet
 * (artHitTest.opaqueFeet of its art, or null), size (the art square, px), anchorY, tile (px), hover }.
 */
export function trackShadow(obj, layer, opts) {
  if (!obj || obj.destroyed || !layer) return;
  let t = tracked.get(obj);
  if (!t) { t = { shadow: null, layer, box: null }; tracked.set(obj, t); }
  t.layer = layer;
  t.box = shadowBox(opts.feet, opts.size, opts.anchorY, opts.tile, !!opts.hover);
  place(obj, t);
}

/** Take a figure's shadow away (the player in a boat or a tent). */
export function untrackShadow(obj) {
  const t = obj && tracked.get(obj);
  if (!t) return;
  if (t.shadow && !t.shadow.destroyed) { t.shadow.parent?.removeChild(t.shadow); t.shadow.destroy(); }
  tracked.delete(obj);
}

function place(obj, t) {
  if (!t.shadow || t.shadow.destroyed) {
    t.shadow = new Sprite(shadowTexture());
    t.shadow.anchor.set(0.5);
    t.shadow.eventMode = 'none';
  }
  const s = t.shadow, { box } = t;
  if (s.parent !== t.layer && !t.layer.destroyed) t.layer.addChild(s);
  // how much of the figure is left: the death beat shrinks it out and fades it; a hit's pop does not grow the shadow
  const rest = obj.__restScale ? obj.__restScale.y : 0, left = rest ? Math.min(1, Math.abs(obj.scale.y) / rest) : 1;
  s.visible = obj.visible && obj.alpha > 0;
  s.alpha = obj.alpha;
  s.width = box.w * left; s.height = box.h * left;
  s.position.set(obj.x + (obj.scale.x < 0 ? -1 : 1) * box.dx, obj.y + (obj.__bob || 0) + box.dy);
  if (obj.parent === t.layer) s.zIndex = obj.zIndex - SHADOW.under;
}

function sync() {
  for (const [obj, t] of tracked) {
    if (obj.destroyed || !obj.parent || t.layer.destroyed) untrackShadow(obj); // the figure left the board
    else place(obj, t);
  }
}
