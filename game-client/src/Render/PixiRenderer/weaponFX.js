/**
 * weaponFX: visual effects that ride on a held weapon (owner 2026-11-14; BL-23, docs/equipment-plan.md).
 *
 * A weapon row names its effect in `heldFx` (resources.json), `<kind>` or `<kind>:<option>`:
 *   glow            a soft halo around the BLADE, breathing slowly (the Glowing Sword): everything
 *                   above the crossguard, found as the widest row in the lower part of the drawing,
 *                   so the hilt and the hand stay unlit (owner 2026-11-14)
 *   glow:#ffd27a    the same in a colour of its own
 *
 * An effect is built as a CHILD of the weapon's sprite (ArmRig.setHeld), so it inherits the weapon's
 * position, rotation, scale and visibility: it travels with the prop through the guard and every
 * swing, thrust and chop with no code of its own for that, and goes when the weapon is put away.
 * A child is in the weapon texture's own pixels, origin at the grip (the sprite's anchor).
 *
 * To add a kind: one entry in KINDS, `build(weapon, option)` returning { update(now), destroy() }.
 * `update` runs every frame the weapon is placed (ArmRig.placeHeld); keep it to a few property sets.
 */
import { Sprite, Texture, BLEND_MODES } from 'pixi.js-legacy';

// ------------------------------------------------------------------------------------------- glow
const GLOW = {
  colour: '#bfe6ff', // a cool white-blue
  blurPx: 26,        // the halo's reach, in the weapon texture's px (512 px = 1.2 tiles); owner: wider
  passes: 3,         // drawn this many times: a denser halo
  alpha: [0.45, 0.85], // it breathes between these
  periodMs: 1800,
};

/**
 * Where the blade ends: the crossguard, the widest row of the drawing's lower part (every weapon is
 * stored upright, point up, grip at the bottom). Rows from there down are the hilt.
 */
function guardRow(ctx, w, h) {
  const a = ctx.getImageData(0, 0, w, h).data;
  let best = h, bestWidth = 0;
  for (let y = Math.floor(h * 0.4); y < h; y++) {
    let left = -1, right = -1;
    for (let x = 0; x < w; x++) if (a[(y * w + x) * 4 + 3] > 40) { if (left < 0) left = x; right = x; }
    const width = left < 0 ? 0 : right - left + 1;
    if (width > bestWidth) { bestWidth = width; best = y; }
  }
  return best;
}

const glowCache = new Map(); // texture url + colour -> the halo texture (one per weapon look, shared)

/** The halo for a weapon drawing: the drawing's silhouette in `colour`, blurred, on a canvas `pad` px larger each side. */
function haloTexture(tex, colour) {
  const src = tex?.baseTexture?.resource?.source;
  const key = `${tex?.baseTexture?.cacheId || src?.src}|${colour}`;
  if (glowCache.has(key)) return glowCache.get(key);
  const w = tex.width, h = tex.height, pad = GLOW.blurPx * 2;
  const shape = document.createElement('canvas');
  shape.width = w; shape.height = h;
  const sc = shape.getContext('2d');
  sc.drawImage(src, 0, 0, w, h);
  sc.clearRect(0, guardRow(sc, w, h), w, h); // the blade only: nothing from the crossguard down
  sc.globalCompositeOperation = 'source-in'; // the silhouette, in the glow's colour
  sc.fillStyle = colour;
  sc.fillRect(0, 0, w, h);
  const halo = document.createElement('canvas');
  halo.width = w + pad * 2; halo.height = h + pad * 2;
  const hc = halo.getContext('2d');
  hc.filter = `blur(${GLOW.blurPx}px)`;
  for (let i = 0; i < GLOW.passes; i++) hc.drawImage(shape, pad, pad);
  const out = { texture: Texture.from(halo), pad };
  glowCache.set(key, out);
  return out;
}

function buildGlow(weapon, option) {
  const colour = option || GLOW.colour;
  const sprite = new Sprite(Texture.EMPTY);
  sprite.blendMode = BLEND_MODES.ADD; // light added to what is under it: an aura, not a coat of paint
  // A sprite's children draw OVER it, so the halo would wash the drawing out (the hilt went white,
  // 2026-11-14): a crisp copy of the weapon is drawn again on top, and only the aura shows around it
  const crisp = new Sprite(weapon.texture);
  crisp.anchor.copyFrom(weapon.anchor);
  weapon.addChild(sprite, crisp);
  const phase = Math.random();
  let ready = false;
  const place = () => {
    const tex = weapon.texture;
    if (!tex?.valid || !tex.baseTexture?.resource?.source) return;
    const { texture, pad } = haloTexture(tex, colour);
    sprite.texture = texture;
    crisp.texture = tex;
    crisp.anchor.copyFrom(weapon.anchor); // the grip, measured once the file loaded (ArmRig.setHeld)
    // line the halo up with the drawing: the weapon's children sit at its anchor (the grip)
    sprite.position.set(-weapon.anchor.x * tex.width - pad, -weapon.anchor.y * tex.height - pad);
    ready = true;
  };
  return {
    update(now) {
      if (!ready) place(); // the weapon's file may still be loading on the first frames
      const [lo, hi] = GLOW.alpha;
      sprite.alpha = lo + (hi - lo) * (0.5 + 0.5 * Math.sin((now / GLOW.periodMs + phase) * Math.PI * 2));
    },
    destroy() { for (const o of [sprite, crisp]) { o.parent?.removeChild(o); o.destroy(); } },
  };
}

const KINDS = { glow: buildGlow };

/**
 * The effect a row's `heldFx` names, as { kind, option, attach(weapon) }, or null for none or an
 * unknown kind. `attach` builds it on a weapon sprite and returns { update(now), destroy() }.
 */
export function weaponFx(spec) {
  if (!spec || typeof spec !== 'string') return null;
  const [kind, ...rest] = spec.split(':');
  const build = KINDS[kind.trim()];
  if (!build) { console.warn(`weaponFX: no effect named "${kind}"`); return null; }
  const option = rest.join(':').trim() || null;
  return { kind, option, attach: (weapon) => build(weapon, option) };
}
