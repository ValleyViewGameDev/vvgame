/**
 * weaponFX: visual effects that ride on a held weapon (owner 2026-11-14; BL-23, docs/equipment-plan.md).
 *
 * A weapon row names its effect in `heldFx` (resources.json), `<kind>` or `<kind>:<option>`:
 *   glow            a soft halo around the BLADE, breathing slowly (the Glowing Sword): everything
 *                   above the crossguard, found as the widest row in the lower part of the drawing,
 *                   so the hilt and the hand stay unlit (owner 2026-11-14)
 *   glow:#ffd27a    the same in a colour of its own
 *   orb             a round halo (corona) around the weapon's TIP, the head still clearly seen (the Magic Spear, owner 2026-11-14):
 *                   the head is found from the drawing (the top rows wider than the shaft), the orb
 *                   is centred just below the point, one fixed size for every weapon, and breathes; orb:#hex for a colour
 *   fire            flames licking off the BLADE (Demonbane, owner 2026-11-14): small flame puffs born on the
 *                   blade's edges, rising straight UP on screen whatever angle the blade is at, yellow to
 *                   orange to deep red as they shrink and fade; fire:#hex tints the hottest colour
 *
 * An effect is built as a CHILD of the weapon's sprite (ArmRig.setHeld), so it inherits the weapon's
 * position, rotation, scale and visibility: it travels with the prop through the guard and every
 * swing, thrust and chop with no code of its own for that, and goes when the weapon is put away.
 * A child is in the weapon texture's own pixels, origin at the grip (the sprite's anchor).
 *
 * To add a kind: one entry in KINDS, `build(weapon, option)` returning { update(now), destroy() }.
 * `update` runs every frame the weapon is placed (ArmRig.placeHeld); keep it to a few property sets.
 */
import { Container, Sprite, Texture, BLEND_MODES } from 'pixi.js-legacy';

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

// -------------------------------------------------------------------------------------------- orb
const ORB = {
  colour: '#8fe3ff',   // an arcane pale blue
  diameterPx: 290,     // the halo's diameter in weapon texture px (one scale for every weapon, 426.67 px = a tile): the
                       // Magic Spear's size; a fixed size, not the head's, so a halberd's tall head does not swamp the figure
  reachPx: 45,         // its centre: this far below the point, or the head's middle if that is nearer
  alpha: [0.55, 0.95],
  scale: [0.9, 1.08],  // it swells a little as it brightens
  periodMs: 1400,
};

/**
 * The weapon's head: the shaft's width is taken at mid-height, then from the topmost drawn row down,
 * past the head's widest row, to the first row no wider than the shaft. Returns its centre and height in texture px.
 */
function tipOf(tex) {
  const src = tex.baseTexture.resource.source;
  const w = tex.width, h = tex.height;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0, w, h);
  const a = ctx.getImageData(0, 0, w, h).data;
  const span = (y) => { let l = -1, r = -1; for (let x = 0; x < w; x++) if (a[(y * w + x) * 4 + 3] > 40) { if (l < 0) l = x; r = x; } return l < 0 ? null : [l, r]; };
  const mid = span(Math.floor(h / 2));
  const shaft = mid ? mid[1] - mid[0] + 1 : 0;
  let top = 0;
  while (top < h && !span(top)) top++;
  let bottom = top, cx = w / 2, widest = 0;
  for (let y = top; y < h / 2; y++) {
    const s = span(y);
    if (!s) continue;
    const width = s[1] - s[0] + 1;
    if (width > widest) { widest = width; cx = (s[0] + s[1]) / 2; }
    if (widest > shaft + 1 && width <= shaft + 1) { bottom = y; break; } // past the head's widest, back down to the shaft (a point starts narrow too)
    bottom = y;
  }
  // the orb's centre: on the point's line, a spearhead's half-length below the point (or the head's middle if shorter)
  const y = Math.round(top + Math.min((bottom - top) / 2, ORB.reachPx));
  const at = span(y);
  return { x: at ? (at[0] + at[1]) / 2 : cx, y, height: Math.max(8, bottom - top) };
}

const orbCache = new Map(); // colour -> a soft round texture

function orbTexture(colour) {
  if (orbCache.has(colour)) return orbCache.get(colour);
  const n = 128, c = document.createElement('canvas');
  c.width = c.height = n;
  const ctx = c.getContext('2d');
  const hex = colour.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.length === 3 ? hex[i / 2] + hex[i / 2] : hex.slice(i, i + 2), 16) || 0);
  const at = (alpha) => `rgba(${r},${g},${b},${alpha})`;
  // a corona, not a ball: the colour only, densest next to the head and fading smoothly outwards (owner 2026-11-14:
  // "a corona/halo rather than a solid orb ... see the blade"); the head itself is drawn again on top (buildOrb)
  const grad = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  grad.addColorStop(0, at(0.75));
  grad.addColorStop(0.3, at(0.55));
  grad.addColorStop(0.65, at(0.2));
  grad.addColorStop(1, at(0));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, n, n);
  const t = Texture.from(c);
  orbCache.set(colour, t);
  return t;
}

function buildOrb(weapon, option) {
  const colour = option || ORB.colour;
  const sprite = new Sprite(orbTexture(colour));
  sprite.anchor.set(0.5);
  sprite.blendMode = BLEND_MODES.ADD;
  // children draw over their parent: a crisp copy of the weapon goes on top so the head shows clearly inside its halo
  const crisp = new Sprite(weapon.texture);
  crisp.anchor.copyFrom(weapon.anchor);
  weapon.addChild(sprite, crisp);
  const phase = Math.random();
  let ready = false, base = 1;
  const place = () => {
    const tex = weapon.texture;
    if (!tex?.valid || !tex.baseTexture?.resource?.source) return;
    const tip = tipOf(tex);
    sprite.position.set(tip.x - weapon.anchor.x * tex.width, tip.y - weapon.anchor.y * tex.height);
    base = ORB.diameterPx / 128;
    crisp.texture = tex;
    crisp.anchor.copyFrom(weapon.anchor);
    ready = true;
  };
  return {
    update(now) {
      if (!ready) place();
      const k = 0.5 + 0.5 * Math.sin((now / ORB.periodMs + phase) * Math.PI * 2);
      sprite.alpha = ORB.alpha[0] + (ORB.alpha[1] - ORB.alpha[0]) * k;
      sprite.scale.set(base * (ORB.scale[0] + (ORB.scale[1] - ORB.scale[0]) * k));
    },
    destroy() { for (const o of [sprite, crisp]) { o.parent?.removeChild(o); o.destroy(); } },
  };
}

// ------------------------------------------------------------------------------------------- fire
const FIRE = {
  count: 56,           // puffs alive at once (a pool: nothing is made or freed while it burns)
  lifeMs: [420, 780],
  sizePx: [44, 80],    // a puff's diameter at birth, weapon texture px (512 px = 1.2 tiles)
  risePx: [120, 220],  // how far a puff climbs over its life
  drift: 22,           // sideways wander, px
  colours: ['#ffe27a', '#ff9a1f', '#f2560c', '#a8200a'], // birth to death
  stretch: 1.7,        // a puff is drawn taller than wide, along "up": a tongue of flame, not a dot
};

const fireDotCache = { tex: null };
function fireDot() {
  if (fireDotCache.tex) return fireDotCache.tex;
  const n = 64, c = document.createElement('canvas');
  c.width = c.height = n;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, n, n);
  fireDotCache.tex = Texture.from(c);
  return fireDotCache.tex;
}

const hexRgb = (hex) => { const h = hex.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0); };
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const toTint = ([r, g, b]) => (r << 16) | (g << 8) | b;

/** Where flames are born: points just inside the blade's left and right edges, every few rows above the crossguard. */
const edgeCache = new Map();
function bladeEdges(tex) {
  const src = tex.baseTexture.resource.source;
  const key = tex.baseTexture.cacheId || src?.src;
  if (edgeCache.has(key)) return edgeCache.get(key);
  const w = tex.width, h = tex.height;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0, w, h);
  const guard = guardRow(ctx, w, h);
  const a = ctx.getImageData(0, 0, w, h).data;
  const pts = [];
  for (let y = 0; y < guard - 6; y += 4) {
    let l = -1, r = -1;
    for (let x = 0; x < w; x++) if (a[(y * w + x) * 4 + 3] > 40) { if (l < 0) l = x; r = x; }
    if (l >= 0) pts.push([l + 3, y], [r - 3, y]);
  }
  edgeCache.set(key, pts);
  return pts;
}

function buildFire(weapon, option) {
  const ramp = (option ? [option, ...FIRE.colours.slice(1)] : FIRE.colours).map(hexRgb);
  const layer = new Container();
  // the flames go BEHIND a crisp copy of the weapon (children draw over their parent): the blade stays clear and the
  // fire licks out around its edges and climbs off it
  const crisp = new Sprite(weapon.texture);
  crisp.anchor.copyFrom(weapon.anchor);
  weapon.addChild(layer, crisp);
  const puffs = [];
  for (let i = 0; i < FIRE.count; i++) {
    const p = new Sprite(fireDot());
    p.anchor.set(0.5);
    p.blendMode = BLEND_MODES.NORMAL; // ADD over grass turns orange to yellow-green (2026-11-14): paint it
    p.visible = false;
    layer.addChild(p);
    puffs.push({ sprite: p, born: -1, life: 1, x: 0, y: 0, rise: 0, drift: 0, size: 1 });
  }
  let pts = null, ox = 0, oy = 0;
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const spawn = (q, now) => {
    const [x, y] = pts[Math.floor(Math.random() * pts.length)];
    q.x = x - ox; q.y = y - oy;
    q.born = now - Math.random() * 60;
    q.life = rand(...FIRE.lifeMs);
    q.rise = rand(...FIRE.risePx);
    q.drift = rand(-FIRE.drift, FIRE.drift);
    q.size = rand(...FIRE.sizePx) / 64;
  };
  return {
    update(now) {
      if (!pts) {
        const tex = weapon.texture;
        if (!tex?.valid || !tex.baseTexture?.resource?.source) return;
        pts = bladeEdges(tex);
        ox = weapon.anchor.x * tex.width; oy = weapon.anchor.y * tex.height;
        crisp.texture = tex;
        crisp.anchor.copyFrom(weapon.anchor);
        if (!pts.length) return;
        puffs.forEach((q) => { spawn(q, now); q.born -= Math.random() * q.life; }); // already burning on the first frame
      }
      if (!pts.length) return;
      // "up" on screen, in the weapon's own px: the inverse of its world matrix applied to (0, -1)
      const m = weapon.worldTransform;
      const det = m.a * m.d - m.b * m.c || 1;
      let ux = m.c / det, uy = -m.a / det; // inverse of [a c; b d] times (0, -1)
      const len = Math.hypot(ux, uy) || 1;
      ux /= len; uy /= len;
      const sx = -uy, sy = ux; // sideways, for the wander
      const turn = Math.atan2(uy, ux) + Math.PI / 2; // the puff's long axis along "up"
      for (const q of puffs) {
        let t = (now - q.born) / q.life;
        if (t >= 1 || t < 0) { spawn(q, now); t = 0; }
        const e = t * t * 0.4 + t * 0.6; // speeds up as it rises, as heat does
        const wob = Math.sin((now / 140) + q.drift) * 0.35 + 1;
        q.sprite.position.set(q.x + ux * q.rise * e + sx * q.drift * t * wob, q.y + uy * q.rise * e + sy * q.drift * t * wob);
        const k = q.size * (1 - 0.6 * t);
        q.sprite.rotation = turn;
        q.sprite.scale.set(k, k * FIRE.stretch);
        q.sprite.alpha = 0.85 * (t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88);
        const seg = Math.min(ramp.length - 2, Math.floor(t * (ramp.length - 1)));
        q.sprite.tint = toTint(mix(ramp[seg], ramp[seg + 1], t * (ramp.length - 1) - seg));
        q.sprite.visible = true;
      }
    },
    destroy() {
      for (const o of [layer, crisp]) o.parent?.removeChild(o);
      layer.destroy({ children: true });
      crisp.destroy();
    },
  };
}

const KINDS = { glow: buildGlow, orb: buildOrb, fire: buildFire };

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
