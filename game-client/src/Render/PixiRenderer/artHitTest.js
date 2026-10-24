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
    s.worldTransform.applyInverse(pt, local);
    const tw = s.texture.orig.width; const th = s.texture.orig.height;
    const tx = local.x + s.anchor.x * tw; const ty = local.y + s.anchor.y * th;
    const r = slackPx / Math.max(1e-6, Math.abs(s.worldTransform.a)); // slack in texture px
    if (tx < -r || ty < -r || tx > tw + r || ty > th + r) continue;
    const mask = alphaMask(renderer, s.texture);
    if (opaqueAt(mask, tx, ty) || opaqueAt(mask, tx - r, ty) || opaqueAt(mask, tx + r, ty)
        || opaqueAt(mask, tx, ty - r) || opaqueAt(mask, tx, ty + r)) {
      return s.__artHit;
    }
  }
  return null;
}
