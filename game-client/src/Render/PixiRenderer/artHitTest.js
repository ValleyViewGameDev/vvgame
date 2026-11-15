import { Point, Sprite, RenderTexture } from 'pixi.js-legacy';

/**
 * artHitTest - which placed thing's ART is under a screen point (docs/ui-conventions.md §6).
 *
 * Taps and clicks normally resolve to the tile under the finger. Art that stands taller than its
 * footprint (trees, `artSpan` buildings and statues) covers tiles north of it, so a tap on a
 * tree's canopy used to land on the tile behind it. PixiRenderer tags those sprites
 * (`sprite.__artHit = resource`) and asks here first: the frontmost tagged sprite with an
 * opaque pixel at (or within `slackPx` of) the point wins; no hit falls back to the tile.
 *
 * Opacity comes from a per-texture alpha mask, read back from the GPU once per texture (the
 * atlas shares one texture per art file, so a grid costs a handful) and cached until the
 * texture is destroyed. Walls are never tagged: their posts would swallow taps meant for walking.
 */
const masks = new WeakMap();
const MIN_ALPHA = 40;

function alphaMask(renderer, texture) {
  let mask = masks.get(texture);
  if (mask) return mask;
  const probe = new Sprite(texture);
  const b = probe.getLocalBounds();
  const w = Math.max(1, Math.ceil(b.width));
  const h = Math.max(1, Math.ceil(b.height));
  const rt = RenderTexture.create({ width: w, height: h, resolution: 1 });
  probe.position.set(-b.x, -b.y);
  renderer.render(probe, { renderTexture: rt, clear: true });
  const rgba = renderer.extract.pixels(rt);
  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
  rt.destroy(true);
  probe.destroy();
  mask = { alpha, w, h, ox: b.x, oy: b.y };
  masks.set(texture, mask);
  return mask;
}

// opaque at texture-space (tx, ty)?
function opaqueAt(mask, tx, ty) {
  const x = Math.floor(tx - mask.ox); const y = Math.floor(ty - mask.oy);
  if (x < 0 || y < 0 || x >= mask.w || y >= mask.h) return false;
  return mask.alpha[y * mask.w + x] >= MIN_ALPHA;
}

/**
 * The resource whose art is frontmost under board-relative screen point (sx, sy), or null.
 * `sprites` are the board's resource sprites; only those tagged `__artHit` are considered.
 * `slackPx` (screen px) forgives a tap that lands in a gap between needles or just off an edge.
 */
export function findArtAt(sprites, renderer, sx, sy, slackPx = 6) {
  if (!renderer || !sprites?.length) return null;
  const pt = new Point(sx, sy);
  const local = new Point();
  const candidates = [];
  sprites.forEach((s, i) => {
    if (s.__artHit && !s.destroyed && s.visible && s.worldAlpha > 0 && s.texture?.valid) candidates.push({ s, i });
  });
  // frontmost first: the objects layer sorts by zIndex, ties drawn in the order they were added
  candidates.sort((a, b) => (b.s.zIndex - a.s.zIndex) || (b.i - a.i));
  for (const { s } of candidates) {
    if (spriteOpaqueAt(s, renderer, pt, slackPx, local)) return s.__artHit;
  }
  return null;
}

/**
 * Has sprite `s` an opaque pixel at (or within `slackPx` of) stage point `pt`? Also used by dev
 * Edit Mode (Dev/devResourceEditor.js) to pick the art under a click.
 */
export function spriteOpaqueAt(s, renderer, pt, slackPx = 6, local = new Point()) {
  if (!renderer || !s || s.destroyed || !s.texture?.valid || !s.anchor) return false;
  // toLocal brings the sprite's transform up to date first. worldTransform alone is only
  // refreshed by a rendered frame: every resource change re-adds all the sprites, and until
  // the next frame each sat at identity (scale 1, at 0,0), so a building's 764 px texture
  // covered most of a phone's board and a tap on a tree opened a far-off station's panel.
  s.toLocal(pt, undefined, local);
  const tw = s.texture.orig.width; const th = s.texture.orig.height;
  const tx = local.x + s.anchor.x * tw; const ty = local.y + s.anchor.y * th;
  const r = slackPx / Math.max(1e-6, Math.abs(s.worldTransform.a)); // slack in texture px
  if (tx < -r || ty < -r || tx > tw + r || ty > th + r) return false;
  const mask = alphaMask(renderer, s.texture);
  return opaqueAt(mask, tx, ty) || opaqueAt(mask, tx - r, ty) || opaqueAt(mask, tx + r, ty)
      || opaqueAt(mask, tx, ty - r) || opaqueAt(mask, tx, ty + r);
}

const tops = new WeakMap();
/**
 * Where a texture's art starts: its topmost opaque row, as a fraction of the texture's full
 * height (0 = the very top). Read once per texture from the same alpha mask; 0 without a renderer.
 * Used to put an NPC's status overlay just above its head (npcHeadTops.js).
 */
export function opaqueTopFraction(renderer, texture) {
  if (!renderer || !texture?.valid) return 0;
  if (tops.has(texture)) return tops.get(texture);
  let frac = 0;
  try {
    const mask = alphaMask(renderer, texture);
    const h = texture.orig?.height || mask.h;
    outer: for (let y = 0; y < mask.h; y++) {
      for (let x = 0; x < mask.w; x++) {
        if (mask.alpha[y * mask.w + x] >= MIN_ALPHA) { frac = Math.max(0, (mask.oy + y) / h); break outer; }
      }
    }
  } catch (e) { frac = 0; }
  tops.set(texture, frac);
  return frac;
}

const feet = new WeakMap();
const FEET_BAND = 0.06; // of the art's height: the rows just above its lowest opaque row that count as its feet
/**
 * Where a texture's art stands: { bottom, left, right, minX, maxX } as fractions of the texture's
 * full size. `bottom` is just under its lowest opaque row; `left` and `right` are how far the art
 * reaches in the rows just above that (its feet, a gown's hem, all four hooves); `minX` and `maxX`
 * are how far the whole drawing reaches (a hovering figure has no feet on the ground). Read once per texture from
 * the same alpha mask; null without a renderer or for empty art. Used to lay a figure's ground
 * shadow under its feet (actorShadows.js).
 */
export function opaqueFeet(renderer, texture) {
  if (!renderer || !texture?.valid) return null;
  if (feet.has(texture)) return feet.get(texture);
  let out = null;
  try {
    const mask = alphaMask(renderer, texture);
    const W = texture.orig?.width || mask.w, H = texture.orig?.height || mask.h;
    const rowHas = (y) => { for (let x = 0; x < mask.w; x++) if (mask.alpha[y * mask.w + x] >= MIN_ALPHA) return true; return false; };
    let yb = mask.h - 1;
    while (yb >= 0 && !rowHas(yb)) yb--;
    if (yb >= 0) {
      let x0 = mask.w, x1 = -1, all0 = mask.w, all1 = -1;
      const feetFrom = Math.max(0, yb - Math.max(2, Math.round(H * FEET_BAND)));
      for (let y = 0; y <= yb; y++) {
        for (let x = 0; x < mask.w; x++) {
          if (mask.alpha[y * mask.w + x] < MIN_ALPHA) continue;
          if (x < all0) all0 = x; if (x > all1) all1 = x;
          if (y >= feetFrom) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
        }
      }
      out = { bottom: (mask.oy + yb + 1) / H, left: (mask.ox + x0) / W, right: (mask.ox + x1 + 1) / W, minX: (mask.ox + all0) / W, maxX: (mask.ox + all1 + 1) / W };
    }
  } catch (e) { out = null; }
  feet.set(texture, out);
  return out;
}
