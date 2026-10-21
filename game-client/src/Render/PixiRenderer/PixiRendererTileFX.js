/**
 * PixiRendererTileFX: ambient effects on ground tiles (owner, 2026-10-21).
 *
 * Two kinds of effect live here.
 *
 * TILE effects (TILE_FX): a tile deep inside a field of its own kind (every tile within
 * `ring` of it is the same type) may now and then play a short, stylised effect: lava
 * bubbles today, sand later. The look of a field comes from chance, not choreography: each eligible tile rolls
 * `chance` when its cooldown runs out, plays `durationMs` of effect when it wins, and every
 * effect is built from random parts (count, size, place, timing), so no two are the same
 * and a big field bubbles organically rather than in waves.
 *
 * Only tiles in view are rolled (a lava valley is 4,000 lava tiles; the camera shows a few
 * hundred), nothing plays when a tile is smaller than `minTilePx` on screen (the far zooms),
 * and `maxActive` caps the sprites in flight. Add a tile type by adding a TILE_FX entry with
 * a `build` function: it gets a Container at the tile's top-left, a random source and the
 * tile size, and returns { update(elapsedMs) } for the effect's lifetime; the container is
 * destroyed with its children when the effect ends.
 *
 * FIELD effects (FIELD_FX): one GPU filter over the whole field of a type, the water today.
 * The field is a mask sprite (one texel per tile, scaled up hard-edged) and the filter's
 * fragment shader paints, where the mask is set, slow-drifting light reflections (thin
 * caustic-like lines from a few sine fields, blown one way) and sparse twinkling sparkles,
 * all computed in world space from a time uniform, so it costs one pass over the water's
 * screen area whatever the lake's size and never a sprite per tile (owner's references:
 * the pixel-art RPG water shaders, 2026-10-21). No bubbles on water: they would read as
 * something under the surface, and fishing may come later (owner).
 *
 * Layer: `tile-fx`, right above the ground tiles and under everything that stands on them.
 */
import { useEffect, useRef } from 'react';
import { Container, Sprite, Texture, Filter, SCALE_MODES } from 'pixi.js-legacy';
import PixiCamera from './PixiCamera';

const SCHEDULE_EVERY_MS = 200; // how often eligible tiles in view are rolled
const TEX_R = 32;              // radius of the shared soft-disc texture, in px

/** Per tile type: when and how often, and what to draw. Times in ms. */
export const TILE_FX = {
  // lava: bubbles that swell and burst
  l: { ring: 2, chance: 0.25, durationMs: 2400, cooldownMs: [4000, 10000], maxActive: 120, minTilePx: 16, build: buildLavaBubbles },
};

/** Per tile type: a field-wide shader. `fragment` paints the effect where the mask is set. */
export const FIELD_FX = {
  w: { minTilePx: 10, fragment: () => WATER_FRAG },
};

// Water: light reflections and sparkles. Coordinates are in tiles of world space, so the
// pattern stays pinned to the lake while the camera pans and zooms. `edge` fades the effect
// out within half a tile of the water's rim (the ground tiles round their corners there).
const WATER_FRAG = `
precision mediump float;
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform highp vec4 inputSize;   // Pixi declares these highp in its vertex shader; the precisions must match
uniform highp vec4 outputFrame;
uniform float uTime;
uniform vec2 uOrigin;
uniform float uZoom;
uniform float uTile;
uniform float uFade;

float hash(vec2 c) { return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453); }

// the reflections: the edges of a voronoi cell field whose seed points wander slowly, so the
// bright network keeps folding and reconnecting, and the whole field drifts with the wind
float voro(vec2 p, float t) {
  vec2 g = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j));
      vec2 h = vec2(hash(g + o), hash(g + o + 5.3));
      vec2 pt = o + 0.5 + 0.38 * sin(t * 0.45 + 6.2832 * h);
      float d = length(pt - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  return d2 - d1;                                   // 0 on a cell edge
}
float ridges(vec2 p, float t) {
  p += vec2(0.86, 0.5) * t * 0.06;                 // drift with the wind
  return smoothstep(0.30, 0.0, voro(p * 0.6, t));  // large cells, soft edges
}
// a slow, large patchiness so the network comes and goes in places instead of covering the lake
float patches(vec2 p, float t) {
  float n = sin(p.x * 0.55 + t * 0.17) * sin(p.y * 0.47 - t * 0.13) + 0.5 * sin((p.x - p.y) * 0.33 + t * 0.09);
  return smoothstep(-0.35, 0.65, n);
}

// sparse sparkles: a few cells per tile, each twinkling briefly on its own clock
float sparkle(vec2 p, float t) {
  vec2 g = p * 2.0;
  vec2 cell = floor(g);
  float h = hash(cell);
  if (h < 0.6) return 0.0;                          // most cells never sparkle
  vec2 f = fract(g) - 0.5 - (vec2(hash(cell + 7.1), hash(cell + 13.7)) - 0.5) * 0.6;
  float phase = fract(t * 0.12 + h * 7.0);          // one twinkle every ~8 s per cell
  float on = smoothstep(0.0, 0.10, phase) * smoothstep(0.26, 0.14, phase);
  float star = max(0.0, 1.0 - (abs(f.x) + abs(f.y)) * 8.0);
  return star * star * on;
}

void main() {
  vec4 m = texture2D(uSampler, vTextureCoord);
  if (m.a < 0.01 || uFade <= 0.0) { gl_FragColor = vec4(0.0); return; }
  vec2 dt = vec2(uTile * uZoom * 0.5) * inputSize.zw;
  float edge = min(min(texture2D(uSampler, vTextureCoord + vec2(dt.x, 0.0)).a, texture2D(uSampler, vTextureCoord - vec2(dt.x, 0.0)).a),
                   min(texture2D(uSampler, vTextureCoord + vec2(0.0, dt.y)).a, texture2D(uSampler, vTextureCoord - vec2(0.0, dt.y)).a));
  vec2 screen = vTextureCoord * inputSize.xy + outputFrame.xy;
  vec2 p = (screen - uOrigin) / (uZoom * uTile);   // world position in tiles
  float t = uTime;
  float r = (ridges(p, t) * 0.8 + ridges(p * 1.9 + 3.1, t * 1.2) * 0.3) * patches(p, t);
  float s = sparkle(p, t);
  float a = clamp(r * 0.20 + s * 0.8, 0.0, 1.0) * edge * uFade;
  vec3 col = mix(vec3(0.78, 0.93, 1.0), vec3(1.0), s);
  gl_FragColor = vec4(col * a, a);
}
`;

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const easeOut = (p) => 1 - (1 - p) * (1 - p);

/**
 * Lava: one to three bubbles. Each is a soft dome of hotter, brighter lava that swells over
 * most of a second on a faint glow, brightens at the top, then bursts: the dome flares and
 * fades in a sixth of a second, a few tiny droplets fly out and fall back, and a darker
 * cooled spot is left that fades as fresh lava closes over it. Soft gradients only, no
 * outlines (owner: "slightly more realistic", 2026-10-21). Every number is drawn fresh per
 * bubble, so a field never repeats itself.
 */
function buildLavaBubbles(container, tex, T) {
  const bubbles = [];
  const n = 1 + Math.floor(Math.random() * 3);
  const soft = (tint, alpha = 1) => { const sp = new Sprite(tex.soft); sp.anchor.set(0.5); sp.tint = tint; sp.alpha = alpha; sp.visible = false; container.addChild(sp); return sp; };
  for (let i = 0; i < n; i++) {
    const r = T * rand(0.09, 0.2);
    const life = rand(650, 950), pop = rand(140, 220), cool = rand(450, 700);
    const start = rand(0, Math.max(0, TILE_FX.l.durationMs - life - pop - cool)); // the whole bubble fits the effect
    const x = T * rand(0.22, 0.78), y = T * rand(0.22, 0.78);
    const spot = soft(0x7a2a18);          // the cooled spot, under everything
    const glow = soft(0xff7a30);          // a faint warm glow around the dome
    const dome = soft(0xff9a3c);          // the swelling dome
    const core = soft(0xffe09a);          // its hot top
    const drops = [];
    const nd = 3 + Math.floor(Math.random() * 4);
    for (let k = 0; k < nd; k++) {
      const a = rand(0, Math.PI * 2), v = r * rand(1.2, 2.6);
      drops.push({ sp: soft(0xffc060), vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - r * rand(0.8, 1.6), size: rand(0.08, 0.16) * T, t: rand(220, 360) });
    }
    for (const sp of [spot, glow, dome, core]) { sp.x = x; sp.y = y; }
    bubbles.push({ spot, glow, dome, core, drops, r, x, y, start, life, pop, cool, lean: rand(-0.3, 0.3) });
  }
  const hideAll = (b) => { b.spot.visible = b.glow.visible = b.dome.visible = b.core.visible = false; for (const d of b.drops) d.sp.visible = false; };
  return {
    update(e) {
      for (const b of bubbles) {
        const t = e - b.start;
        if (t < 0 || t >= b.life + b.pop + b.cool) { hideAll(b); continue; }
        if (t < b.life) {
          // swelling: the dome grows with an ease-out, the glow spreads under it, the hot top
          // brightens and creeps a little to one side as the bubble leans
          const p = t / b.life, s = b.r * (0.25 + 0.75 * easeOut(p));
          b.spot.visible = false; for (const d of b.drops) d.sp.visible = false;
          b.glow.visible = b.dome.visible = b.core.visible = true;
          b.glow.scale.set((s * 2.2) / TEX_R); b.glow.alpha = 0.18 + 0.17 * p;
          b.dome.scale.set(s / TEX_R); b.dome.alpha = 0.55 + 0.4 * p;
          b.core.scale.set((s * 0.5) / TEX_R); b.core.alpha = 0.25 + 0.65 * p * p;
          b.core.x = b.x + b.lean * s * p; b.core.y = b.y - s * 0.22 * p;
        } else if (t < b.life + b.pop) {
          // the burst: the dome flares out and thins, the core flashes, the droplets leave
          const q = (t - b.life) / b.pop;
          b.glow.visible = false;
          b.dome.visible = b.core.visible = b.spot.visible = true;
          b.dome.scale.set((b.r * (1 + 0.9 * q)) / TEX_R); b.dome.alpha = 0.9 * (1 - q);
          b.core.scale.set((b.r * 0.7 * (1 + q)) / TEX_R); b.core.alpha = 1 - q; b.core.x = b.x; b.core.y = b.y;
          b.spot.scale.set((b.r * 0.9) / TEX_R); b.spot.alpha = 0.3 * q;
          for (const d of b.drops) { d.sp.visible = true; const u = ((t - b.life) / d.t); d.sp.x = b.x + d.vx * u; d.sp.y = b.y + d.vy * u + b.r * 2.2 * u * u; d.sp.scale.set(d.size / TEX_R); d.sp.alpha = Math.max(0, 1 - u); }
        } else {
          // cooling: the dark spot fades as the surface closes over it; the last droplets land
          const c = (t - b.life - b.pop) / b.cool;
          b.dome.visible = b.core.visible = b.glow.visible = false; b.spot.visible = true;
          b.spot.scale.set((b.r * (0.9 + 0.2 * c)) / TEX_R); b.spot.alpha = 0.3 * (1 - c);
          for (const d of b.drops) { const u = (t - b.life) / d.t; if (u >= 1) { d.sp.visible = false; continue; } d.sp.x = b.x + d.vx * u; d.sp.y = b.y + d.vy * u + b.r * 2.2 * u * u; d.sp.alpha = Math.max(0, 1 - u); }
        }
      }
    },
  };
}

/** Every tile whose `ring` neighbourhood is all its own type, with a TILE_FX entry. */
function findEligible(tileTypes) {
  const out = [];
  if (!tileTypes?.length) return out;
  const rows = tileTypes.length, cols = tileTypes[0]?.length || 0;
  const now = performance.now();
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const type = tileTypes[row][col];
      const cfg = TILE_FX[type];
      if (!cfg) continue;
      let ok = true;
      for (let dr = -cfg.ring; ok && dr <= cfg.ring; dr++) {
        for (let dc = -cfg.ring; dc <= cfg.ring; dc++) {
          if (tileTypes[row + dr]?.[col + dc] !== type) { ok = false; break; }
        }
      }
      // the first roll lands anywhere in one cooldown, so a field never starts in step
      if (ok) out.push({ row, col, cfg, nextRollAt: now + rand(0, cfg.cooldownMs[1]) });
    }
  }
  return out;
}

const PixiRendererTileFX = ({ app, tileTypes, TILE_SIZE }) => {
  const layerRef = useRef(null);
  const texRef = useRef(null);
  const eligibleRef = useRef([]);
  const activeRef = useRef([]);
  const fieldsRef = useRef([]); // { type, sprite, filter, cfg }
  const tileTypesRef = useRef(null);

  // The layer and the shared textures, once per app
  useEffect(() => {
    if (!app?.stage || !app.renderer) return;
    const world = app.stage.children.find((c) => c.name === 'world');
    if (!world) return;
    let layer = world.children.find((c) => c.name === 'tile-fx');
    if (!layer) {
      layer = new Container();
      layer.name = 'tile-fx';
      const tilesIndex = world.children.findIndex((c) => c.name === 'tiles');
      world.addChildAt(layer, tilesIndex >= 0 ? tilesIndex + 1 : 0);
    }
    layerRef.current = layer;
    // one shared texture: a soft disc (white, opaque at the centre, clear at the rim), tinted
    // and scaled per part, so every effect is gradients and nothing has an outline
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = TEX_R * 2;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(TEX_R, TEX_R, 0, TEX_R, TEX_R, TEX_R);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, TEX_R * 2, TEX_R * 2);
    texRef.current = { soft: Texture.from(canvas) };

    // the field shaders, rebuilt from the tile map (a new grid, or a converted tile)
    const buildFields = () => {
      for (const f of fieldsRef.current) { try { f.sprite.destroy({ texture: true, baseTexture: true }); } catch (_) { /* gone */ } }
      fieldsRef.current = [];
      const tileTypes = tileTypesRef.current;
      if (!tileTypes?.length) return;
      const rows = tileTypes.length, cols = tileTypes[0]?.length || 0;
      for (const [type, cfg] of Object.entries(FIELD_FX)) {
        const canvas = document.createElement('canvas');
        canvas.width = cols; canvas.height = rows;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        let any = false;
        for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) if (tileTypes[row][col] === type) { ctx.fillRect(col, row, 1, 1); any = true; }
        if (!any) continue;
        const sprite = new Sprite(Texture.from(canvas, { scaleMode: SCALE_MODES.NEAREST }));
        sprite.width = cols * TILE_SIZE; sprite.height = rows * TILE_SIZE;
        const filter = new Filter(undefined, cfg.fragment(), { uTime: 0, uOrigin: [0, 0], uZoom: 1, uTile: TILE_SIZE, uFade: 1 });
        filter.padding = 0;
        sprite.filters = [filter];
        layer.addChild(sprite);
        fieldsRef.current.push({ type, sprite, filter, cfg });
      }
    };
    buildFields();
    layerRef.current.__buildFields = buildFields;

    let lastSchedule = 0;
    const tick = () => {
      const now = performance.now();
      // 0. the field shaders follow the camera and the clock
      if (fieldsRef.current.length) {
        const zoom = world.scale.x, tilePx = TILE_SIZE * zoom;
        for (const f of fieldsRef.current) {
          const u = f.filter.uniforms;
          u.uTime = now / 1000; u.uOrigin[0] = world.x; u.uOrigin[1] = world.y; u.uZoom = zoom;
          u.uFade = Math.max(0, Math.min(1, (tilePx - f.cfg.minTilePx) / 8));
          f.sprite.visible = u.uFade > 0;
        }
      }
      // 1. advance the effects in flight
      const active = activeRef.current;
      for (let i = active.length - 1; i >= 0; i--) {
        const fx = active[i];
        const e = now - fx.t0;
        if (e >= fx.dur) { fx.container.destroy({ children: true }); active.splice(i, 1); }
        else fx.impl.update(e);
      }
      // 2. every SCHEDULE_EVERY_MS, roll the eligible tiles in view
      if (now - lastSchedule < SCHEDULE_EVERY_MS) return;
      lastSchedule = now;
      const eligible = eligibleRef.current;
      if (!eligible.length || !PixiCamera.isAttached()) return;
      const tilePx = TILE_SIZE * PixiCamera.getZoom();
      const a = PixiCamera.screenToTile(0, 0), b = PixiCamera.screenToTile(app.screen.width, app.screen.height);
      const r0 = Math.min(a.row, b.row) - 1, r1 = Math.max(a.row, b.row) + 1, c0 = Math.min(a.col, b.col) - 1, c1 = Math.max(a.col, b.col) + 1;
      for (const t of eligible) {
        if (t.nextRollAt > now || t.row < r0 || t.row > r1 || t.col < c0 || t.col > c1) continue;
        const cfg = t.cfg;
        t.nextRollAt = now + rand(cfg.cooldownMs[0], cfg.cooldownMs[1]);
        if (tilePx < cfg.minTilePx || active.length >= cfg.maxActive || Math.random() >= cfg.chance) continue;
        const container = new Container();
        container.x = t.col * TILE_SIZE; container.y = t.row * TILE_SIZE;
        layer.addChild(container);
        active.push({ container, impl: cfg.build(container, texRef.current, TILE_SIZE), t0: now, dur: cfg.durationMs });
        t.nextRollAt += cfg.durationMs; // the cooldown starts when the effect ends
      }
    };
    app.ticker.add(tick);
    if (process.env.NODE_ENV !== 'production') window.__tileFx = () => ({ eligible: eligibleRef.current.length, active: activeRef.current.length, fields: fieldsRef.current.map((f) => f.type), fps: Math.round(app.ticker.FPS) }); // dev hook

    return () => {
      try { app.ticker.remove(tick); } catch (_) { /* app gone */ }
      for (const fx of activeRef.current) { try { fx.container.destroy({ children: true }); } catch (_) { /* gone */ } }
      activeRef.current = [];
      for (const f of fieldsRef.current) { try { f.sprite.destroy({ texture: true, baseTexture: true }); } catch (_) { /* gone */ } }
      fieldsRef.current = [];
      const tex = texRef.current; texRef.current = null;
      if (tex) { try { tex.soft.destroy(true); } catch (_) { /* gone */ } }
      layerRef.current = null;
    };
  }, [app, TILE_SIZE]);

  // A new grid (or a converted tile): the eligible set is rebuilt and nothing in flight carries over
  useEffect(() => {
    for (const fx of activeRef.current) { try { fx.container.destroy({ children: true }); } catch (_) { /* gone */ } }
    activeRef.current = [];
    eligibleRef.current = findEligible(tileTypes);
    tileTypesRef.current = tileTypes;
    layerRef.current?.__buildFields?.();
  }, [tileTypes]);

  return null;
};

export default PixiRendererTileFX;
