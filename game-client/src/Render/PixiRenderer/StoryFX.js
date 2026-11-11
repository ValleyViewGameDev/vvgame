/**
 * StoryFX - board effects for scripted story moments (the Quest for Hope's finale,
 * GameFeatures/Story/hopeFinale.js; Peter Quince's chopping). Client-only, on the Pixi ticker,
 * in their own layer above the board ('story-fx', like CombatFX's 'combat-fx'):
 *
 *   doveFlight(x, y)        the Oracle's dove rises from tile (x, y) and flies slowly north off the map
 *   fadeResource(x, y, ms)  the board's own sprite of the resource anchored at (x, y) fades to
 *                           nothing (the Enormous Mountain); kept invisible until clearFade()
 *   gemFall(x, y)           a gem falls from the sky with a trail of magic dust, bounces and settles
 *   woodChip(x, y)          a log pops off a tree and vanishes (Peter Quince's wood goes nowhere)
 *   treeHit(x, y, side)     one axe stroke: wood chips fly off toward `side` and the tree shivers
 *
 * PixiRenderer attaches the app, the world container and an accessor for the resource sprites
 * (each tagged `__res` with its resource). Every call is a no-op until attached.
 */
import { Container, Graphics, Sprite, Text } from 'pixi.js-legacy';
import { getAtlasTexture } from './AtlasTextures';
import { emojiKey } from '../../Utils/emojiKey';

let app = null;
let fxContainer = null;
let TILE = 45;
let getResourceSprites = () => [];

const effects = [];
let tickerFn = null;
const fades = new Map(); // "x,y" -> { start, ms, done }

const easeIn = (t) => t * t;
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export function attach(opts) {
  app = opts.app;
  TILE = opts.TILE_SIZE || TILE;
  getResourceSprites = opts.getResourceSprites || getResourceSprites;
  const world = opts.worldContainer;
  fxContainer = world.children.find((c) => c.name === 'story-fx');
  if (!fxContainer) {
    fxContainer = new Container();
    fxContainer.name = 'story-fx';
    world.addChild(fxContainer);
  }
}

export function detach() {
  stopTicker();
  effects.length = 0;
  fxContainer = null;
  app = null;
}

const ready = () => !!(app?.ticker && fxContainer && !fxContainer.destroyed);

function startTicker() {
  if (tickerFn || !app?.ticker) return;
  tickerFn = () => {
    const now = Date.now();
    for (let i = effects.length - 1; i >= 0; i--) {
      let alive = false;
      try { alive = effects[i].update(now); } catch (_) { alive = false; }
      if (!alive) effects.splice(i, 1);
    }
    tickFades(now);
    if (!effects.length && !fades.size) stopTicker();
  };
  app.ticker.add(tickerFn);
}
function stopTicker() {
  if (tickerFn && app?.ticker) { try { app.ticker.remove(tickerFn); } catch (_) { /* destroyed */ } }
  tickerFn = null;
}
function run(effect) { effects.push(effect); startTicker(); }

/** A sprite for an emoji: the atlas frame when it has one, else a Pixi Text glyph. */
async function emojiSprite(symbol, size) {
  const key = emojiKey(symbol);
  const texture = key ? await getAtlasTexture('emoji', key) : null;
  if (texture) { const s = new Sprite(texture); s.width = size; s.height = size; return s; }
  const t = new Text(symbol, { fontSize: size * 0.85, fontFamily: 'sans-serif' });
  t.resolution = 2;
  return t;
}

/** A fading speck of magic dust at world px (x, y). */
function dust(x, y, { color = 0xbfe6ff, r = TILE * 0.06, ms = 650, drift = 0.25 } = {}) {
  const g = new Graphics();
  g.beginFill(color, 1); g.drawCircle(0, 0, r * (0.6 + Math.random() * 0.8)); g.endFill();
  g.x = x + (Math.random() - 0.5) * TILE * 0.25; g.y = y + (Math.random() - 0.5) * TILE * 0.15;
  fxContainer.addChild(g);
  const start = Date.now();
  const vx = (Math.random() - 0.5) * drift;
  run({
    update(now) {
      if (g.destroyed) return false;
      const p = Math.min(1, (now - start) / ms);
      g.alpha = 1 - p; g.scale.set(1 - 0.5 * p); g.x += vx; g.y += 0.15;
      if (p >= 1) { fxContainer.removeChild(g); g.destroy(); return false; }
      return true;
    },
  });
}
const DUST_COLORS = [0xbfe6ff, 0x8fd3ff, 0xfff4b8, 0xffffff, 0xd6c8ff];

// ---------------------------------------------------------------- the dove

/** The Oracle's dove rises from tile (x, y) and flies slowly north until it leaves the map. Resolves when gone. */
export function doveFlight(x, y, { ms = 9000 } = {}) {
  return new Promise(async (resolve) => {
    if (!ready()) { resolve(); return; }
    const size = TILE * 1.1;
    const bird = await emojiSprite('🕊️', size);
    if (!ready()) { resolve(); return; }
    bird.anchor?.set?.(0.5, 0.5);
    const x0 = (x + 0.5) * TILE; const y0 = (y + 0.5) * TILE;
    const yEnd = -6 * TILE; // well past the north edge
    bird.x = x0; bird.y = y0; bird.alpha = 0;
    fxContainer.addChild(bird);
    const bw = bird.scale.x; const bh = bird.scale.y;
    const start = Date.now();
    let lastDust = 0;
    run({
      update(now) {
        if (bird.destroyed) { resolve(); return false; }
        const e = now - start; const p = Math.min(1, e / ms);
        const k = easeInOut(p);
        bird.y = y0 + (yEnd - y0) * k;
        bird.x = x0 + Math.sin(e / 700) * TILE * 0.6 * Math.min(1, p * 4); // a lazy sway once aloft
        const flap = 1 + Math.sin(e / 90) * 0.12;
        const grow = 1 + 0.35 * Math.min(1, p * 3); // it lifts toward the eye, then away
        bird.scale.set(bw * grow, bh * grow * flap);
        bird.alpha = p < 0.06 ? p / 0.06 : p > 0.8 ? Math.max(0, (1 - p) / 0.2) : 1;
        if (e - lastDust > 70) { lastDust = e; dust(bird.x, bird.y + size * 0.3, { color: DUST_COLORS[Math.floor(Math.random() * DUST_COLORS.length)], ms: 900 }); }
        if (p >= 1) { fxContainer.removeChild(bird); bird.destroy(); resolve(); return false; }
        return true;
      },
    });
  });
}

// ---------------------------------------------------------------- fading a resource

function tickFades(now) {
  if (!fades.size) return;
  const sprites = getResourceSprites() || [];
  for (const s of sprites) {
    const r = s.__res; if (!r) continue;
    const f = fades.get(`${r.x},${r.y}`); if (!f) continue;
    const p = Math.min(1, (now - f.start) / f.ms);
    s.alpha = 1 - easeInOut(p);
  }
  for (const f of fades.values()) {
    if (!f.done && now - f.start >= f.ms) { f.done = true; f.resolve(); }
  }
}

/** Fade the board's sprite of the resource anchored at (x, y) out over `ms`; resolves when invisible. Call clearFade(x, y) once it is gone from the board. */
export function fadeResource(x, y, ms = 4000) {
  return new Promise((resolve) => {
    if (!ready()) { resolve(); return; }
    fades.set(`${x},${y}`, { start: Date.now(), ms, done: false, resolve });
    startTicker();
  });
}
export function clearFade(x, y) { fades.delete(`${x},${y}`); }

// ---------------------------------------------------------------- a gem from the sky

/**
 * A gem falls onto tile (x, y) from far above, shedding magic dust, bounces and settles; the board's
 * own sprite takes over after `onLanded` (the caller holds that tile's sprite hidden until then).
 */
export function gemFall(x, y, { symbol = '💎', filename = null, fallMs = 1700, onLanded } = {}) {
  return new Promise(async (resolve) => {
    // `remove` takes the landed sprite away: the caller calls it once the board's own sprite is
    // drawn underneath (identical size and place), so the hand-over cannot be seen
    let gem = null;
    const remove = () => { if (gem && !gem.destroyed) { gem.parent?.removeChild(gem); gem.destroy(); } };
    const done = () => { try { onLanded?.(remove); } catch (_) { remove(); } resolve(); };
    if (!ready()) { done(); return; }
    // the same frame the board will show: resource art fills the tile, an emoji is 0.7 of it
    const art = filename ? await getAtlasTexture('resources', filename) : null;
    const size = art ? TILE : TILE * 0.7;
    gem = art ? new Sprite(art) : await emojiSprite(symbol, size);
    if (art) { gem.width = size; gem.height = size; }
    if (!ready()) { done(); return; }
    gem.anchor?.set?.(0.5, 1); // the squash happens from the feet
    const cx = (x + 0.5) * TILE;
    const ground = art ? (y + 1) * TILE : (y + 0.5) * TILE + size / 2;
    const height = TILE * (9 + Math.random() * 4);
    const drift = (Math.random() - 0.5) * TILE * 2;
    gem.x = cx + drift; gem.y = ground - height; gem.alpha = 0;
    fxContainer.addChild(gem);
    const bw = gem.scale.x; const bh = gem.scale.y;
    const up = TILE * 0.5;
    // the landing: [t, dy, sx, sy]
    const K = [[0, 0, 1, 1], [0.15, 0, 1.25, 0.72], [0.4, -up, 0.94, 1.08], [0.62, 0, 1.1, 0.88], [0.8, -up * 0.25, 1, 1], [1, 0, 1, 1]];
    const BOUNCE_MS = 700;
    const start = Date.now();
    let lastDust = 0;
    run({
      update(now) {
        if (gem.destroyed) { done(); return false; }
        const e = now - start;
        if (e < fallMs) {
          const p = e / fallMs;
          const k = easeIn(p) * 0.85 + p * 0.15; // slow, then gathering speed
          gem.y = ground - height * (1 - k);
          gem.x = cx + drift * (1 - k);
          gem.alpha = Math.min(1, p * 5);
          gem.rotation = Math.sin(e / 160) * 0.25 * (1 - p);
          if (e - lastDust > 35) { lastDust = e; dust(gem.x, gem.y - size * 0.4, { color: DUST_COLORS[Math.floor(Math.random() * DUST_COLORS.length)] }); }
          return true;
        }
        gem.rotation = 0;
        const p = Math.min(1, (e - fallMs) / BOUNCE_MS);
        let i = 1; while (i < K.length - 1 && K[i][0] < p) i++;
        const a = K[i - 1]; const b = K[i];
        let t = (p - a[0]) / (b[0] - a[0] || 1);
        t = b[1] < a[1] ? easeOut(t) : easeIn(t);
        gem.y = ground + a[1] + (b[1] - a[1]) * t;
        gem.x = cx;
        gem.scale.set(bw * (a[2] + (b[2] - a[2]) * t), bh * (a[3] + (b[3] - a[3]) * t));
        if (p === 1 || e - fallMs < 20) { if (e - fallMs < 20) for (let d = 0; d < 6; d++) dust(cx, ground - size * 0.2, { r: TILE * 0.05, ms: 500, drift: 1.2 }); }
        if (p >= 1) { // at rest exactly where the board draws it; it stays until the caller removes it
          gem.x = cx; gem.y = ground; gem.rotation = 0; gem.alpha = 1; gem.scale.set(bw, bh);
          done();
          return false;
        }
        return true;
      },
    });
  });
}

// ---------------------------------------------------------------- Peter Quince's wood

/** A log pops off the tree at (x, y), spins up and vanishes. */
export async function woodChip(x, y) {
  if (!ready()) return;
  const size = TILE * 0.6;
  const log = await emojiSprite('🪵', size);
  if (!ready()) return;
  log.anchor?.set?.(0.5, 0.5);
  const x0 = (x + 0.5) * TILE; const y0 = (y + 0.3) * TILE;
  log.x = x0; log.y = y0;
  fxContainer.addChild(log);
  const side = Math.random() < 0.5 ? -1 : 1;
  const start = Date.now(); const ms = 900;
  run({
    update(now) {
      if (log.destroyed) return false;
      const p = Math.min(1, (now - start) / ms);
      log.x = x0 + side * TILE * 0.6 * p;
      log.y = y0 - TILE * 0.9 * Math.sin(p * Math.PI * 0.8);
      log.rotation = side * p * 3;
      log.alpha = p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4;
      if (p >= 1) { fxContainer.removeChild(log); log.destroy(); return false; }
      return true;
    },
  });
}

// ---------------------------------------------------------------- an axe stroke

const CHIP_COLORS = [0xc8955a, 0xe2b77c, 0x9a6a3c, 0xf0d6a8];
const shaking = new WeakMap(); // sprite -> its resting x while it shivers (a stroke mid-shake keeps the first)

/** One axe stroke on the tree at (x, y) (owner 2026-11-11): a few wood chips fly off toward
 *  `side` (-1 left, 1 right: the axeman's side) and fall, and the tree gives a short damped shiver. */
export function treeHit(x, y, side = 1) {
  if (!ready()) return;
  // the chips: small pale-wood flakes, out and up, then down under gravity, fading
  const n = 3 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) {
    const g = new Graphics();
    const w = TILE * (0.05 + Math.random() * 0.05); const h = w * (0.5 + Math.random() * 0.4);
    g.beginFill(CHIP_COLORS[i % CHIP_COLORS.length], 1); g.drawRect(-w / 2, -h / 2, w, h); g.endFill();
    const x0 = (x + 0.5 + side * 0.18) * TILE; const y0 = (y + 0.55 + (Math.random() - 0.5) * 0.12) * TILE;
    g.x = x0; g.y = y0; g.rotation = Math.random() * Math.PI;
    fxContainer.addChild(g);
    const vx = side * TILE * (0.4 + Math.random() * 0.5); // px over the flight
    const up = TILE * (0.25 + Math.random() * 0.3);
    const spin = (Math.random() - 0.5) * 8;
    const start = Date.now(); const ms = 450 + Math.random() * 200;
    run({
      update(now) {
        if (g.destroyed) return false;
        const p = Math.min(1, (now - start) / ms);
        g.x = x0 + vx * p;
        g.y = y0 - up * 4 * p * (1 - p) + TILE * 0.3 * p * p; // a hop, then down past the start
        g.rotation += spin * 0.016;
        g.alpha = p < 0.65 ? 1 : 1 - (p - 0.65) / 0.35;
        if (p >= 1) { fxContainer.removeChild(g); g.destroy(); return false; }
        return true;
      },
    });
  }
  // the shiver: the tree's own sprite rocks side to side, dying away
  const sprite = (getResourceSprites() || []).find((sp) => sp.__res && sp.__res.x === x && sp.__res.y === y && !sp.destroyed);
  if (!sprite) return;
  if (!shaking.has(sprite)) shaking.set(sprite, sprite.x);
  const baseX = shaking.get(sprite);
  const start = Date.now(); const ms = 320; const amp = TILE * 0.045;
  run({
    update(now) {
      if (sprite.destroyed) return false;
      const p = Math.min(1, (now - start) / ms);
      sprite.x = baseX + side * -1 * amp * (1 - p) * Math.sin(p * Math.PI * 5);
      if (p >= 1) { sprite.x = baseX; shaking.delete(sprite); return false; }
      return true;
    },
  });
}

const StoryFX = { attach, detach, doveFlight, fadeResource, clearFade, gemFall, woodChip, treeHit };
export default StoryFX;
