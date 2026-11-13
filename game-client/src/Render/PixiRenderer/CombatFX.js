/**
 * CombatFX - the board-side feedback of a fight (docs/audits/combat-and-npc-review-2026-10-07.md,
 * Track 1). Everything here is client-only and runs on the Pixi ticker:
 *
 *   - damage numbers / hit, miss and kill texts (Pixi Text rising from the target)
 *   - enemy hit reaction: flash + a few px of knockback (pivot offset, so the NPC layer's own
 *     x/y updates do not fight it) + a scale pop
 *   - enemy death: the sprite is taken over from the NPC layer and faded/shrunk out
 *   - player lunge toward the target on a swing, red flash when hit
 *   - a cooldown ring around the player while the next swing is not yet available
 *   - an hp bar over an enemy only while it is engaged (fades after a couple of seconds)
 *
 * PixiRenderer attaches the world container and two accessors; PixiRendererPCs registers a
 * getter for the player's display object. Callers (Combat.js, NPCEnemyBehavior.js) talk to
 * the singleton; every call is a no-op until attached, so the logic never depends on it.
 * Casual by design: nothing here is a permanent UI element.
 */
import { BLEND_MODES, Container, Graphics, Sprite, Text } from 'pixi.js-legacy';
import { getAtlasTexture } from './AtlasTextures';
import { emojiKey } from '../../Utils/emojiKey';
import { holdResourceRender } from '../../VFX/VFX';
import { npcCells } from '../../Utils/npcFootprint';

const FX = {
  DAMAGE_RISE_MS: 900,       // damage number lifetime
  DAMAGE_RISE_TILES: 0.9,
  HIT_FLASH_MS: 140,
  KNOCKBACK_TILES: 0.22,
  KNOCKBACK_MS: 110,         // out; back takes KNOCKBACK_MS * 1.4
  POP_SCALE: 1.18,
  DEATH_MS: 220,             // the body: a flash, then it shrinks out of its centre (the chunk burst covers it)
  DEATH_BURST_DELAY_MS: 60,  // when the chunk burst (VFX.js) starts
  DEATH_LOOT_DELAY_MS: 420,  // the drop falls in once the burst has bloomed
  DEATH_XP_DELAY_MS: 1050,   // "+XP" rises from the tile once the drop has landed (drop bounce ~650 ms)
  PROJECTILE_MS_PER_TILE: 70,
  PROJECTILE_MIN_MS: 140,
  LUNGE_TILES: 0.3,
  LUNGE_MS: 90,              // out; back takes LUNGE_MS * 1.3
  PC_HIT_FLASH_MS: 160,
  RING_RADIUS_TILES: 0.62,
  HP_BAR_LINGER_MS: 2500,
  HP_BAR_FADE_MS: 400,
  WINDUP_MS: 300,
  TEXT_HEAD_GAP: -2,         // px from the top of a head to the bottom of a combat text's BOX (the box carries
                             // ~5 px of descent and stroke under the letters, so the letters still clear the head)
  LIGHTNING_MS: 260,         // the Ghost's bolt: there at once, flickers, fades; the hit lands on the strike
  FIREBALL_MS_PER_TILE: 95,  // fireballs fly a little slower than arrows, so they read
  EMBER_EVERY_MS: 28,        // a fireball sheds an ember this often
  EMBER_MS: 320,
  IMPACT_MS: 420,            // a fireball's strike (fireImpact)
  FLAME_MS_PER_TILE: 45,     // the Dragon's stream: how fast its head (then its tail) runs out
  FLAME_POUR_MS: 260,        // how long the mouth keeps pouring once the stream has reached the target
  FLAME_SPARK_EVERY_MS: 22,  // while it pours onto the target: sparks this often (two at a time)
  LEAP_SHAKE_PX: 2.5,        // an enemy's leap wind-up: how hard it vibrates
  LEAP_ARC_TILES: 0.7,       // how high the leap rises at its middle
};

let app = null;
let worldContainer = null;
let fxContainer = null;
let TILE = 45;
let getNpcDisplay = () => null;
let detachNpcDisplay = () => null;
let getPcDisplay = () => null;

const effects = [];           // { update(now) -> false when done }
let tickerFn = null;
let cooldown = null;          // { until, duration, ring }
const hpBars = new Map();     // npcId -> { bar, lastEngaged, hp, maxhp }

const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeIn = (t) => t * t;

// The sprite's resting scale: recorded by the renderer when it sizes the sprite
// (`__restScale`), so overlapping effects never capture each other's mid-animation squash
// as the size to restore to. The sign of scale.x (the facing flip) is read live.
const rest = (obj) => obj.__restScale || { x: Math.abs(obj.scale.x) || 1, y: Math.abs(obj.scale.y) || 1 };
const applyScale = (obj, mx, my) => {
  const r = rest(obj);
  const sign = (obj.scale.x < 0) ? -1 : 1;
  obj.scale.set(sign * r.x * mx, r.y * my);
};

// ---------------------------------------------------------------- lifecycle

export function attach(opts) {
  app = opts.app;
  worldContainer = opts.worldContainer;
  TILE = opts.TILE_SIZE || TILE;
  getNpcDisplay = opts.getNpcDisplay || getNpcDisplay;
  detachNpcDisplay = opts.detachNpcDisplay || detachNpcDisplay;
  if (!worldContainer.children.find((c) => c.name === 'combat-fx')) {
    fxContainer = new Container();
    fxContainer.name = 'combat-fx';
    worldContainer.addChild(fxContainer); // above every layer, including the PC
  } else {
    fxContainer = worldContainer.children.find((c) => c.name === 'combat-fx');
  }
}

export function detach() {
  stopTicker();
  effects.length = 0;
  hpBars.clear();
  cooldown = null;
  fxContainer = null;
  worldContainer = null;
  app = null;
}

export function registerPC(getter) { getPcDisplay = getter || (() => null); }

// read-only views for shotPoints.js (where a projectile leaves and lands)
export const npcDisplay = (npcId) => getNpcDisplay(npcId);
export const pcDisplay = () => getPcDisplay();
export const tileSize = () => TILE;

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
    tickCooldown(now);
    tickHpBars(now);
    if (!effects.length && !cooldown && !hpBars.size) stopTicker();
  };
  app.ticker.add(tickerFn);
}

function stopTicker() {
  if (tickerFn && app?.ticker) { try { app.ticker.remove(tickerFn); } catch (_) { /* destroyed */ } }
  tickerFn = null;
}

function run(effect) { effects.push(effect); startTicker(); }

// Pivot offsets move a display object without touching x/y (which the NPC/PC layers own).
// Pivot is in local (texture) px, so divide the world offset by the object's scale.
// `sx`/`sy` are the object's RESTING scale: pass them explicitly during a scale pop, otherwise
// the offset is recomputed from the popped scale every frame and the sprite appears to grow
// from a corner instead of its centre.
function setPivotOffset(obj, dxWorld, dyWorld, sx, sy) {
  if (!obj || obj.destroyed) return;
  const bsx = sx || obj.scale?.x || 1;
  const bsy = sy || obj.scale?.y || 1;
  const baseX = obj.__fxBasePivotX ?? (obj.__fxBasePivotX = obj.pivot.x);
  const baseY = obj.__fxBasePivotY ?? (obj.__fxBasePivotY = obj.pivot.y);
  obj.pivot.set(baseX - dxWorld / bsx, baseY - dyWorld / bsy);
}

// ---------------------------------------------------------------- texts

/**
 * A short text that rises from tile (x, y) and fades. Colors: 'damage' | 'player' | 'miss' | 'gain'.
 * With `head` (a point from shotPoints.npcHead / pcHead: the top of the drawn head), it starts
 * TEXT_HEAD_GAP px above that head instead of near the tile's top, so it clears tall art.
 */
export function text(x, y, label, kind = 'damage', head = null) {
  if (!ready()) return;
  const styles = {
    damage: { fill: '#ffffff', stroke: '#5a1010', strokeThickness: 4, fontSize: TILE * 0.5 },
    player: { fill: '#ff5a5a', stroke: '#300000', strokeThickness: 4, fontSize: TILE * 0.5 },
    miss:   { fill: '#dddddd', stroke: '#333333', strokeThickness: 3, fontSize: TILE * 0.36 },
    gain:   { fill: '#ffe66d', stroke: '#4a3a00', strokeThickness: 4, fontSize: TILE * 0.42 },
    kill:   { fill: '#ffffff', stroke: '#000000', strokeThickness: 4, fontSize: TILE * 0.44 },
  };
  const s = styles[kind] || styles.damage;
  // the body font (theme.css --font-body), bold; Pixi takes a real family name, not a CSS var.
  // index.js loads Philosopher at boot so the first hit already draws in it.
  const t = new Text(String(label), { fontFamily: 'Philosopher, Arial, sans-serif', fontWeight: 'bold', align: 'center', ...s });
  t.resolution = 2;
  t.anchor.set(0.5, 1);
  const x0 = (x + 0.5) * TILE + (Math.random() - 0.5) * TILE * 0.3;
  const y0 = head && !head.fallback ? (head.y + 0.5) * TILE - FX.TEXT_HEAD_GAP : (y + 0.15) * TILE;
  t.x = x0; t.y = y0;
  fxContainer.addChild(t);
  const start = Date.now();
  run({
    update(now) {
      const p = Math.min(1, (now - start) / FX.DAMAGE_RISE_MS);
      t.y = y0 - easeOut(p) * FX.DAMAGE_RISE_TILES * TILE;
      t.alpha = p < 0.45 ? 1 : 1 - (p - 0.45) / 0.55;
      const pop = p < 0.12 ? 1 + (1 - p / 0.12) * 0.35 : 1;
      t.scale.set(pop);
      if (p >= 1) { fxContainer.removeChild(t); t.destroy(); return false; }
      return true;
    },
  });
}

// ---------------------------------------------------------------- enemy reactions

// A sprite's resting tint, recorded the first time a flash touches it. Reading obj.tint at the
// start of each flash is wrong when flashes overlap: the second hit would record the first
// one's red as "resting" and leave the sprite red for good (seen on the player in coyote packs).
const restTints = new WeakMap();
function restTint(obj) {
  if (!restTints.has(obj)) restTints.set(obj, obj.tint ?? 0xffffff);
  return restTints.get(obj);
}

/** Flash, pop and knock the enemy's sprite back a little, away from (fromX, fromY). */
export function hitEnemy(npcId, fromX, fromY, toX, toY) {
  const obj = getNpcDisplay(npcId);
  if (!ready() || !obj || obj.destroyed) return;
  const len = Math.hypot(toX - fromX, toY - fromY) || 1;
  const dx = ((toX - fromX) / len) * FX.KNOCKBACK_TILES * TILE;
  const dy = ((toY - fromY) / len) * FX.KNOCKBACK_TILES * TILE;
  const start = Date.now();
  const baseTint = restTint(obj);
  const total = FX.KNOCKBACK_MS * 2.4;
  run({
    update(now) {
      if (obj.destroyed) return false;
      const e = now - start;
      // knockback: out fast, back slower
      let k;
      if (e < FX.KNOCKBACK_MS) k = easeOut(e / FX.KNOCKBACK_MS);
      else k = 1 - easeOut(Math.min(1, (e - FX.KNOCKBACK_MS) / (FX.KNOCKBACK_MS * 1.4)));
      // flash
      obj.tint = e < FX.HIT_FLASH_MS ? 0xff7a7a : baseTint;
      // pop, around the centre: the knockback pivot is computed from the resting scale
      const pp = Math.min(1, e / (FX.HIT_FLASH_MS * 1.5));
      const pop = 1 + (FX.POP_SCALE - 1) * Math.sin(pp * Math.PI);
      const r = rest(obj);
      applyScale(obj, pop, pop);
      setPivotOffset(obj, dx * k, dy * k, r.x, r.y);
      if (e >= total) {
        setPivotOffset(obj, 0, 0, r.x, r.y);
        obj.tint = baseTint;
        applyScale(obj, 1, 1);
        return false;
      }
      return true;
    },
  });
}

/**
 * A small anticipation before an enemy swings: squash down, then spring up. A rigged enemy (an
 * ArmRig with an attack clip, the Zombie's claw) plays its clip instead, led by the arm on the
 * target's side. Returns when the blow should land (ms from now).
 */
export function enemyWindup(npcId, target = null, npc = null) {
  const obj = getNpcDisplay(npcId);
  if (!ready() || !obj || obj.destroyed) return FX.WINDUP_MS;
  if (obj.armRig) {
    const dx = target ? (target.x + 0.5) * TILE - obj.x : 1;
    // the body leans into the blow only when the player stands in another column (owner 2026-11-12)
    const sameColumn = !target || !npc || npcCells(npc).some((c) => c.x === target.x);
    const dy = target && npc?.position ? target.y - npc.position.y : 0; // tiles: + = the target is below (south)
    const hit = obj.armRig.playAttack(dx, !sameColumn, dy);
    if (hit != null) return hit;
  }
  const start = Date.now();
  run({
    update(now) {
      if (obj.destroyed) return false;
      const p = Math.min(1, (now - start) / FX.WINDUP_MS);
      const s = Math.sin(p * Math.PI);
      applyScale(obj, 1 + 0.12 * s, 1 - 0.14 * s);
      if (p >= 1) { applyScale(obj, 1, 1); return false; }
      return true;
    },
  });
  return FX.WINDUP_MS;
}

/**
 * Take the enemy's sprite away from the NPC layer and play its death: a quick pop, then it
 * shrinks, rises and fades. The NPC itself is already gone from the store.
 */
export function killEnemy(npcId) {
  dropHpBar(npcId);
  const obj = detachNpcDisplay(npcId);
  if (!ready() || !obj || obj.destroyed) return;
  if (obj.parent) obj.parent.removeChild(obj);
  fxContainer.addChild(obj);
  const r0 = rest(obj); const y0 = obj.y;
  setPivotOffset(obj, 0, 0, r0.x, r0.y);
  const start = Date.now();
  obj.tint = 0xffffff;
  // A flash and a tiny pop (0-25%), then the body shrinks out of its centre; the chunk burst
  // from VFX.js is what the eye follows, so the sprite itself is gone almost at once.
  run({
    update(now) {
      if (obj.destroyed) return false;
      const p = Math.min(1, (now - start) / FX.DEATH_MS);
      let pop; let alpha = 1;
      if (p < 0.25) {
        pop = 1 + (p / 0.25) * 0.15;
        obj.tint = 0xffd0d0;
      } else {
        const q = easeIn((p - 0.25) / 0.75);
        pop = 1.15 * (1 - q); alpha = 1 - q * 0.6;
        obj.tint = 0xffffff;
      }
      applyScale(obj, pop, pop);
      obj.alpha = alpha;
      obj.y = y0;
      if (p >= 1) { fxContainer.removeChild(obj); try { obj.destroy(); } catch (_) { /* shared texture */ } return false; }
      return true;
    },
  });
}

function dropHpBar(npcId) {
  const entry = hpBars.get(npcId);
  if (!entry) return;
  if (fxContainer && !fxContainer.destroyed) fxContainer.removeChild(entry.bar);
  try { entry.bar.destroy(); } catch (_) { /* already gone */ }
  hpBars.delete(npcId);
}

// ---------------------------------------------------------------- player reactions

/** Lunge the player's sprite toward (toX, toY) and back. */
export function playerLunge(fromX, fromY, toX, toY) {
  const obj = getPcDisplay();
  if (!ready() || !obj || obj.destroyed) return;
  const len = Math.hypot(toX - fromX, toY - fromY) || 1;
  const dx = ((toX - fromX) / len) * FX.LUNGE_TILES * TILE;
  const dy = ((toY - fromY) / len) * FX.LUNGE_TILES * TILE;
  const start = Date.now();
  const total = FX.LUNGE_MS * 2.3;
  run({
    update(now) {
      if (obj.destroyed) return false;
      const e = now - start;
      let k;
      if (e < FX.LUNGE_MS) k = easeOut(e / FX.LUNGE_MS);
      else k = 1 - easeOut(Math.min(1, (e - FX.LUNGE_MS) / (FX.LUNGE_MS * 1.3)));
      const r = rest(obj);
      setPivotOffset(obj, dx * k, dy * k, r.x, r.y);
      if (e >= total) { setPivotOffset(obj, 0, 0, r.x, r.y); return false; }
      return true;
    },
  });
}

// ---------------------------------------------------------------- the drop

/**
 * A kill's drop falling in and bouncing to rest with some weight, drawn with the SAME atlas
 * frame the board will show (an SVG resource fills the tile; an emoji is the 0.7-tile Twemoji
 * frame), so nothing changes when the real sprite takes over. The board's sprite is held
 * hidden (VFX.holdResourceRender) from the call until the bounce ends. ~650 ms.
 */
export async function dropBounce(x, y, { symbol, filename } = {}) {
  const release = holdResourceRender(x, y);
  try {
    let texture = filename ? await getAtlasTexture('resources', filename) : null;
    let emoji = false;
    if (!texture && symbol) { const k = emojiKey(symbol); texture = k ? await getAtlasTexture('emoji', k) : null; emoji = !!texture; }
    if (!texture || !ready()) { release(); return; }
    const size = emoji ? TILE * 0.7 : TILE;
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5, 1); // the squash happens from the feet
    sprite.width = size; sprite.height = size;
    const cx = (x + 0.5) * TILE;
    const ground = emoji ? (y + 0.5) * TILE + size / 2 : (y + 1) * TILE;
    sprite.x = cx; sprite.y = ground;
    fxContainer.addChild(sprite);
    const bw = sprite.scale.x; const bh = sprite.scale.y;
    const up = TILE * 0.9;
    // keyframes: [t, dy (px, up is negative), sx, sy, alpha]
    const K = [
      [0.00, -up, 0.55, 0.55, 0.6],
      [0.30, 0, 1, 1, 1],            // lands
      [0.38, 0, 1.25, 0.7, 1],       // squash
      [0.58, -up * 0.32, 0.95, 1.08, 1], // first bounce, stretched
      [0.72, 0, 1.12, 0.86, 1],      // lands again
      [0.86, -up * 0.1, 1, 1, 1],    // a small hop
      [0.95, 0, 1.04, 0.96, 1],
      [1.00, 0, 1, 1, 1],
    ];
    const DUR = 650;
    const start = Date.now();
    run({
      update(now) {
        if (sprite.destroyed) { release(); return false; }
        const p = Math.min(1, (now - start) / DUR);
        let i = 1; while (i < K.length - 1 && K[i][0] < p) i++;
        const a = K[i - 1]; const b = K[i];
        let t = (p - a[0]) / (b[0] - a[0] || 1);
        // falling segments accelerate (weight), rising ones decelerate
        t = b[1] < a[1] ? easeOut(t) : easeIn(t);
        const dy = a[1] + (b[1] - a[1]) * t;
        const sx = a[2] + (b[2] - a[2]) * t; const sy = a[3] + (b[3] - a[3]) * t;
        sprite.y = ground + dy;
        sprite.scale.set(bw * sx, bh * sy);
        sprite.alpha = a[4] + (b[4] - a[4]) * t;
        if (p >= 1) { fxContainer.removeChild(sprite); sprite.destroy(); release(); return false; }
        return true;
      },
    });
  } catch (e) {
    release();
  }
}

// ---------------------------------------------------------------- projectiles

// One shot's look (resources.json `projectile` on the enemy; the player's bows are arrows):
// 'arrow', 'fireball-small' (the Demon: a fireball, no trail), 'fireburst' (the Phoenix: one burst
// with a short ember trail), 'fireball' (large, ember trail; no enemy uses it now), 'blob' (the
// Spider's spit), 'lightning' (the Ghost: no flight, see lightning()), 'flamethrower' (the Dragon:
// a stream, see flamethrower()). Each is drawn along +x and rotated to the flight direction.
function drawShot(g, style) {
  const len = TILE * 0.45;
  if (style === 'fireball' || style === 'fireball-small') {
    const r = TILE * (style === 'fireball' ? 0.3 : 0.24); // the Demon's: 40% up on 0.17 (owner 2026-11-12)
    g.beginFill(0xff4500, 0.35); g.drawEllipse(-r * 0.35, 0, r * 1.55, r * 1.15); g.endFill(); // glow, trailing
    g.beginFill(0xff7a00, 0.9); g.drawEllipse(-r * 0.15, 0, r * 1.15, r * 0.9); g.endFill();
    g.beginFill(0xffc23a, 1); g.drawCircle(r * 0.1, 0, r * 0.62); g.endFill();
    g.beginFill(0xfff4b8, 1); g.drawCircle(r * 0.22, 0, r * 0.3); g.endFill();    // white-hot core
    // the Demon's ball leaves no trail (owner 2026-11-12); the big one keeps its embers
    return { ember: style === 'fireball' ? r * 0.45 : 0, flicker: true, impact: style === 'fireball-small' ? 0.85 : 0, msPerTile: FX.FIREBALL_MS_PER_TILE };
  }
  if (style === 'fireburst') {
    // the Phoenix (owner 2026-11-12): one bright burst, a flare of tongues round a hot core, with
    // a stretched-out tail of flame and embers behind it
    const r = TILE * 0.22;
    g.beginFill(0xff3a00, 0.22); g.drawEllipse(-r * 1.9, 0, r * 2.6, r * 0.75); g.endFill();  // the drawn-out tail
    g.beginFill(0xff7a00, 0.35); g.drawEllipse(-r * 1.2, 0, r * 1.8, r * 0.5); g.endFill();
    g.beginFill(0xff5a1a, 0.3); g.drawCircle(0, 0, r * 1.5); g.endFill();          // the bloom
    for (let i = 0; i < 7; i++) {                                                  // flame tongues, swept back
      const a = Math.PI + (i - 3) * 0.26; const l = r * (1.6 + (i % 2) * 0.6 + (i === 3 ? 1.2 : 0)); // the middle one longest
      g.beginFill(i % 2 ? 0xff8a1a : 0xffb02e, 0.85);
      g.moveTo(Math.cos(a + 1.1) * r * 0.55, Math.sin(a + 1.1) * r * 0.55);
      g.lineTo(Math.cos(a) * l, Math.sin(a) * l);
      g.lineTo(Math.cos(a - 1.1) * r * 0.55, Math.sin(a - 1.1) * r * 0.55);
      g.closePath(); g.endFill();
    }
    g.beginFill(0xffc23a, 1); g.drawCircle(0, 0, r * 0.7); g.endFill();
    g.beginFill(0xfff4b8, 1); g.drawCircle(r * 0.12, 0, r * 0.36); g.endFill();     // white-hot core
    return { ember: r * 0.4, emberMs: FX.EMBER_MS * 0.9, flicker: true, impact: 1.25, msPerTile: FX.FIREBALL_MS_PER_TILE };
  }
  if (style === 'blob') {
    const r = TILE * 0.13;
    g.beginFill(0x111111, 0.95); g.drawEllipse(0, 0, r * 2.1, r); g.endFill();          // elongated, no point
    g.beginFill(0x3a3a3a, 0.9); g.drawEllipse(r * 0.5, -r * 0.35, r * 0.6, r * 0.25); g.endFill(); // a wet sheen
    return { ember: 0, msPerTile: FX.PROJECTILE_MS_PER_TILE };
  }
  // the arrow: shaft, head, fletching
  g.lineStyle(2, 0x3a2a14, 1); g.moveTo(-len / 2, 0); g.lineTo(len / 2 - 4, 0);
  g.beginFill(0x8a8a8a, 1); g.moveTo(len / 2, 0); g.lineTo(len / 2 - 7, -3.5); g.lineTo(len / 2 - 7, 3.5); g.closePath(); g.endFill();
  g.lineStyle(2, 0xd9c48b, 1); g.moveTo(-len / 2, 0); g.lineTo(-len / 2 + 5, -3); g.moveTo(-len / 2, 0); g.lineTo(-len / 2 + 5, 3);
  return { ember: 0, msPerTile: FX.PROJECTILE_MS_PER_TILE };
}

/** A fading ember left behind a fireball; `life` ms (a short trail dies sooner). */
function ember(x, y, r, life = FX.EMBER_MS) {
  const e = new Graphics();
  e.beginFill(Math.random() < 0.5 ? 0xff8a1a : 0xffc23a, 1); e.drawCircle(0, 0, r * (0.6 + Math.random() * 0.6)); e.endFill();
  e.x = x + (Math.random() - 0.5) * r; e.y = y + (Math.random() - 0.5) * r;
  fxContainer.addChild(e);
  const start = Date.now();
  run({
    update(now) {
      const p = Math.min(1, (now - start) / life);
      e.alpha = 1 - p; e.scale.set(1 - 0.6 * p); e.y -= 0.25;
      if (p >= 1) { fxContainer.removeChild(e); e.destroy(); return false; }
      return true;
    },
  });
}

/**
 * A ranged shot flies from tile (fromX, fromY) to (toX, toY), then `onArrive` runs (the hit or
 * miss feedback). `style` picks the look (drawShot). `hit` false (a miss): the shot just vanishes on
 * arrival, with no strike effect on the target (owner 2026-11-12). Without the renderer, onArrive runs at once.
 */
export function projectile(fromX, fromY, toX, toY, onArrive, style = 'arrow', hit = true) {
  if (!ready()) { if (onArrive) onArrive(); return; }
  const x0 = (fromX + 0.5) * TILE; const y0 = (fromY + 0.5) * TILE;
  const x1 = (toX + 0.5) * TILE; const y1 = (toY + 0.5) * TILE;
  if (style === 'lightning') { lightning(x0, y0, x1, y1, onArrive, hit); return; }
  if (style === 'flamethrower') { flamethrower(x0, y0, x1, y1, onArrive, hit); return; }
  const dist = Math.hypot(x1 - x0, y1 - y0) / TILE;
  const g = new Graphics();
  const look = drawShot(g, style);
  const duration = Math.max(FX.PROJECTILE_MIN_MS, dist * look.msPerTile);
  g.rotation = Math.atan2(y1 - y0, x1 - x0);
  g.x = x0; g.y = y0;
  fxContainer.addChild(g);
  const start = Date.now();
  let lastEmber = start;
  let done = false;
  run({
    update(now) {
      const p = Math.min(1, (now - start) / duration);
      g.x = x0 + (x1 - x0) * p; g.y = y0 + (y1 - y0) * p;
      if (look.ember && now - lastEmber >= FX.EMBER_EVERY_MS) { lastEmber = now; ember(g.x, g.y, look.ember, look.emberMs); }
      if (look.flicker) g.scale.set(1 + 0.08 * Math.sin(now / 40)); // a flicker
      if (p >= 1 && !done) {
        done = true;
        fxContainer.removeChild(g); g.destroy();
        if (look.impact && hit) fireImpact(x1, y1, look.impact);
        if (onArrive) { try { onArrive(); } catch (e) { console.error('projectile onArrive failed', e); } }
        return false;
      }
      return true;
    },
  });
}

// A fireball striking (owner 2026-11-12): a white-hot flash, a fire bloom that swells and fades, a
// shock ring running outward and a spray of sparks, all on the target. `size` scales it (the
// Demon 0.85, the Phoenix 1.25).
function fireImpact(x, y, size) {
  const g = new Graphics();
  g.blendMode = BLEND_MODES.ADD;
  g.x = x; g.y = y;
  fxContainer.addChild(g);
  const R0 = TILE * 0.45 * size;
  const sparks = Array.from({ length: Math.round(9 * size) }, () => ({
    a: Math.random() * Math.PI * 2, v: 0.7 + Math.random() * 0.8, r: 1.5 + Math.random() * 2,
    c: Math.random() < 0.5 ? 0xffc23a : 0xff7a1a,
  }));
  const start = Date.now();
  run({
    update(now) {
      const p = Math.min(1, (now - start) / FX.IMPACT_MS);
      const out = easeOut(p);
      g.clear();
      const fade = 1 - p;
      g.beginFill(0xff3a00, 0.3 * fade); g.drawCircle(0, 0, R0 * (0.6 + 0.7 * out)); g.endFill();   // the bloom
      g.beginFill(0xff7a00, 0.55 * fade); g.drawCircle(0, 0, R0 * (0.45 + 0.4 * out)); g.endFill();
      g.beginFill(0xffd04a, 0.8 * fade); g.drawCircle(0, 0, R0 * (0.3 + 0.15 * out)); g.endFill();
      if (p < 0.3) { g.beginFill(0xffffff, 0.9 * (1 - p / 0.3)); g.drawCircle(0, 0, R0 * 0.35); g.endFill(); } // the flash
      g.lineStyle(Math.max(1, 3 * size * fade), 0xffb02e, 0.7 * fade);                         // the shock ring
      g.drawCircle(0, 0, R0 * (0.5 + 1.1 * out));
      g.lineStyle(0);
      for (const sp of sparks) {
        const d = R0 * (0.3 + 1.5 * sp.v * out);
        g.beginFill(sp.c, fade); g.drawCircle(Math.cos(sp.a) * d, Math.sin(sp.a) * d + TILE * 0.25 * p * p, sp.r * (1 - 0.5 * p)); g.endFill(); // they fall a little
      }
      if (p >= 1) { fxContainer.removeChild(g); g.destroy(); return false; }
      return true;
    },
  });
}

// The Ghost's shot (owner 2026-11-12): a bright flash of white lightning. It does not fly: a
// jagged bolt is there at once from the ghost to the target, with a wide soft glow, a flash at
// both ends and a fork or two; it flickers (re-jagged a few times) and fades over LIGHTNING_MS.
// The hit lands on the strike.
function boltPath(x0, y0, x1, y1, jag) {
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const nx = -(y1 - y0) / len; const ny = (x1 - x0) / len; // the normal: jag sideways
  const n = Math.max(4, Math.round(len / (TILE * 0.35)));
  const pts = [[x0, y0]];
  for (let i = 1; i < n; i++) {
    const t = i / n; const off = (Math.random() - 0.5) * 2 * jag;
    pts.push([x0 + (x1 - x0) * t + nx * off, y0 + (y1 - y0) * t + ny * off]);
  }
  pts.push([x1, y1]);
  return pts;
}

function drawBolt(g, x0, y0, x1, y1, hit = true) {
  g.clear();
  const main = boltPath(x0, y0, x1, y1, TILE * 0.22);
  const stroke = (pts, w, color, a) => {
    g.lineStyle(w, color, a);
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  };
  stroke(main, TILE * 0.32, 0xbfd8ff, 0.25);  // the soft glow
  stroke(main, TILE * 0.13, 0xe6f0ff, 0.6);
  stroke(main, 2.5, 0xffffff, 1);              // the white-hot core
  // a fork or two off the main bolt
  const forks = 1 + Math.floor(Math.random() * 2);
  for (let f = 0; f < forks; f++) {
    const k = 1 + Math.floor(Math.random() * (main.length - 2));
    const [sx, sy] = main[k];
    const ang = Math.atan2(y1 - y0, x1 - x0) + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5);
    const fl = TILE * (0.5 + Math.random() * 0.6);
    const fork = boltPath(sx, sy, sx + Math.cos(ang) * fl, sy + Math.sin(ang) * fl, TILE * 0.12);
    stroke(fork, TILE * 0.1, 0xe6f0ff, 0.45);
    stroke(fork, 1.5, 0xffffff, 0.95);
  }
  g.lineStyle(0);
  const flashes = hit ? [[x0, y0, 0.28], [x1, y1, 0.42]] : [[x0, y0, 0.28]]; // a miss: no strike flash on the target
  for (const [x, y, r] of flashes) { // a flash where it leaves and where it strikes
    g.beginFill(0xdfeaff, 0.35); g.drawCircle(x, y, TILE * r); g.endFill();
    g.beginFill(0xffffff, 0.9); g.drawCircle(x, y, TILE * r * 0.4); g.endFill();
  }
}

function lightning(x0, y0, x1, y1, onArrive, hit = true) {
  const g = new Graphics();
  g.blendMode = BLEND_MODES.ADD;
  fxContainer.addChild(g);
  drawBolt(g, x0, y0, x1, y1, hit);
  if (onArrive) { try { onArrive(); } catch (e) { console.error('projectile onArrive failed', e); } }
  const start = Date.now();
  let lastJag = start;
  run({
    update(now) {
      const p = Math.min(1, (now - start) / FX.LIGHTNING_MS);
      if (now - lastJag >= 55 && p < 0.7) { lastJag = now; drawBolt(g, x0, y0, x1, y1, hit); } // the flicker
      g.alpha = p < 0.35 ? (Math.random() < 0.25 ? 0.55 : 1) : 1 - (p - 0.35) / 0.65;
      if (p >= 1) { fxContainer.removeChild(g); g.destroy(); return false; }
      return true;
    },
  });
}

// The Dragon's breath (owner 2026-11-12): a stream of fire. Its head runs out of the mouth to the
// target while the mouth keeps pouring; the hit lands when the head arrives (a splash there; a miss has none); the mouth then stops
// and the stream's tail runs on to the target too, so the last of the fire finishes its travel.
// Drawn each frame as overlapping flame puffs along tail..head that swell, wobble and flicker.
function flamethrower(x0, y0, x1, y1, onArrive, hit = true) {
  const g = new Graphics();
  g.blendMode = BLEND_MODES.ADD;
  fxContainer.addChild(g);
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const ux = (x1 - x0) / len; const uy = (y1 - y0) / len;
  const nx = -uy; const ny = ux;
  const travel = Math.max(FX.PROJECTILE_MIN_MS, (len / TILE) * FX.FLAME_MS_PER_TILE);
  const total = travel + FX.FLAME_POUR_MS + travel; // head out, pour, tail out
  const start = Date.now();
  let arrived = false;
  let lastSpark = 0;
  const puffs = Math.max(6, Math.round(len / (TILE * 0.16)));
  const seeds = Array.from({ length: puffs + 1 }, () => Math.random() * Math.PI * 2);
  run({
    update(now) {
      const e = now - start;
      const head = Math.min(1, e / travel);                                      // 0..1 along the line
      const tail = Math.max(0, Math.min(1, (e - travel - FX.FLAME_POUR_MS) / travel));
      if (head >= 1 && !arrived) {
        arrived = true;
        if (hit) fireImpact(x1, y1, 1.9); // the strike: a big burst (owner 2026-11-12: much more dramatic)
        if (onArrive) { try { onArrive(); } catch (err) { console.error('projectile onArrive failed', err); } }
      }
      // while the fire pours onto the target, sparks of fire fly off it, back and up out of the stream
      if (arrived && hit && tail < 0.7 && now - lastSpark >= FX.FLAME_SPARK_EVERY_MS) {
        lastSpark = now;
        for (let k = 0; k < 2; k++) {
          const back = Math.atan2(-uy, -ux);                          // splashing back the way the fire came
          const a = Math.random() < 0.7 ? back + (Math.random() - 0.5) * 2.4 : Math.random() * Math.PI * 2;
          fireSpark(x1, y1, a);
        }
      }
      g.clear();
      if (tail >= 1) { fxContainer.removeChild(g); g.destroy(); return false; }
      for (let i = 0; i <= puffs; i++) {
        const t = i / puffs;
        if (t < tail || t > head) continue;
        const d = t * len;
        const wob = Math.sin(now / 45 + seeds[i]) * TILE * 0.05 * (0.4 + t);    // it ripples, more far out
        const x = x0 + ux * d + nx * wob; const y = y0 + uy * d + ny * wob;
        const grow = 0.35 + 0.65 * Math.min(1, t * 2.2);                         // narrow at the mouth, then a plume
        const flick = 0.85 + 0.3 * Math.sin(now / 30 + seeds[i] * 3);
        const r = TILE * 0.2 * grow * flick;
        const near = Math.min(1, (head - t) * len / (TILE * 0.4));               // the leading edge thins out
        g.beginFill(0xff3a00, 0.22 * near); g.drawCircle(x, y, r * 1.6); g.endFill();
        g.beginFill(0xff7a00, 0.45 * near); g.drawCircle(x, y, r); g.endFill();
        g.beginFill(0xffd04a, 0.55 * near); g.drawCircle(x, y, r * 0.5); g.endFill();
      }
      if (tail === 0) { // the mouth still pours: a hot flare there
        g.beginFill(0xfff4b8, 0.8); g.drawCircle(x0, y0, TILE * (0.08 + 0.02 * Math.sin(now / 25))); g.endFill();
      }
      if (head >= 1 && hit) { // the target burns while the fire pours on, fading out with the tail (none on a miss)
        const a = 1 - tail;
        const pulse = 0.9 + 0.18 * Math.sin(now / 35);
        g.beginFill(0xff3a00, 0.3 * a); g.drawCircle(x1, y1, TILE * 0.7 * pulse); g.endFill();
        g.beginFill(0xff7a00, 0.45 * a); g.drawCircle(x1, y1, TILE * 0.45 * pulse); g.endFill();
        for (let k = 0; k < 5; k++) {                                // flames licking up off the target
          const ph = now / 90 + k * 1.3;
          const fx = x1 + (k - 2) * TILE * 0.13 + Math.sin(ph) * TILE * 0.04;
          const fh = TILE * (0.35 + 0.25 * (0.5 + 0.5 * Math.sin(ph * 1.7))) * a;
          g.beginFill(k % 2 ? 0xff8a1a : 0xffb02e, 0.6 * a);
          g.moveTo(fx - TILE * 0.08, y1); g.lineTo(fx, y1 - fh); g.lineTo(fx + TILE * 0.08, y1); g.closePath(); g.endFill();
        }
        g.beginFill(0xffd04a, 0.65 * a); g.drawCircle(x1, y1, TILE * 0.24 * pulse); g.endFill();
        g.beginFill(0xfff4b8, 0.7 * a); g.drawCircle(x1, y1, TILE * 0.1); g.endFill();
      }
      return e < total + 50;
    },
  });
}

/** One spark of fire flung from (x, y) at angle `a`: a short bright streak that flies, falls and fades. */
function fireSpark(x, y, a) {
  const g = new Graphics();
  g.blendMode = BLEND_MODES.ADD;
  fxContainer.addChild(g);
  const speed = TILE * (2.2 + Math.random() * 2.8) / 1000;           // px per ms
  let vx = Math.cos(a) * speed; let vy = Math.sin(a) * speed - TILE * 0.0012; // a kick upward
  let px = x; let py = y;
  const life = 380 + Math.random() * 380;
  const w = 1.5 + Math.random() * 1.8;
  const color = Math.random() < 0.5 ? 0xffd04a : (Math.random() < 0.5 ? 0xff8a1a : 0xfff4b8);
  const start = Date.now(); let last = start;
  run({
    update(now) {
      const dt = Math.min(40, now - last); last = now;
      const p = Math.min(1, (now - start) / life);
      vy += TILE * 0.000012 * dt;                                       // it falls
      px += vx * dt; py += vy * dt;
      g.clear();
      g.lineStyle(w * (1 - 0.5 * p), color, 1 - p);
      g.moveTo(px - vx * 22, py - vy * 22); g.lineTo(px, py);              // a streak along its flight
      if (p >= 1) { fxContainer.removeChild(g); g.destroy(); return false; }
      return true;
    },
  });
}

// ---------------------------------------------------------------- enemy leap (the Ogre)

/** The leap's wind-up: the enemy vibrates in place for `ms`. */
export function enemyLeapCharge(npcId, ms) {
  const obj = getNpcDisplay(npcId);
  if (!ready() || !obj || obj.destroyed) return;
  const start = Date.now();
  run({
    update(now) {
      if (obj.destroyed) return false;
      const e = now - start;
      const r = rest(obj);
      const bends = 'breath' in obj; // a BreathSprite bends its legs (BreathSprite.crouch)
      if (e >= ms) { setPivotOffset(obj, 0, 0, r.x, r.y); if (bends) obj.crouch = 0; else applyScale(obj, 1, 1); return false; }
      const crouch = easeOut(Math.min(1, e / ms));
      // gathering itself (owner 2026-11-12): the feet stay planted and it sinks into its legs from the
      // waist down, the upper body unbent; the shake only sideways, so the feet never leave the ground
      const k = FX.LEAP_SHAKE_PX * (0.5 + 0.5 * (e / ms));          // it builds
      setPivotOffset(obj, (Math.random() - 0.5) * 2 * k, 0, r.x, r.y);
      if (bends) obj.crouch = crouch;
      else applyScale(obj, 1 + 0.08 * crouch, 1 - 0.12 * crouch);
      return true;
    },
  });
}

/** The leap itself: an arc above the tween the NPC layer runs over the same `ms`. */
export function enemyLeapArc(npcId, ms) {
  const obj = getNpcDisplay(npcId);
  if (!ready() || !obj || obj.destroyed) return;
  const start = Date.now();
  run({
    update(now) {
      if (obj.destroyed) return false;
      const p = Math.min(1, (now - start) / ms);
      const r = rest(obj);
      if ('breath' in obj && obj.crouch) obj.crouch = 0; // the legs spring straight at take-off
      setPivotOffset(obj, 0, -Math.sin(p * Math.PI) * FX.LEAP_ARC_TILES * TILE, r.x, r.y);
      applyScale(obj, 1 - 0.1 * Math.sin(p * Math.PI), 1 + 0.12 * Math.sin(p * Math.PI)); // stretched in the air
      if (p >= 1) { setPivotOffset(obj, 0, 0, r.x, r.y); applyScale(obj, 1, 1); return false; }
      return true;
    },
  });
}

/** Red flash on the player's sprite. */
export function playerHit() {
  const obj = getPcDisplay();
  if (!ready() || !obj || obj.destroyed) return;
  const start = Date.now();
  const baseTint = restTint(obj);
  run({
    update(now) {
      if (obj.destroyed) return false;
      const e = now - start;
      obj.tint = e < FX.PC_HIT_FLASH_MS ? 0xff5050 : baseTint;
      return e < FX.PC_HIT_FLASH_MS;
    },
  });
}

// ---------------------------------------------------------------- cooldown ring

/** Show the swing cooldown as a thin ring that empties around the player. */
export function showCooldown(untilMs, durationMs) {
  if (!ready()) return;
  if (!cooldown) {
    const ring = new Graphics();
    fxContainer.addChild(ring);
    cooldown = { until: untilMs, duration: durationMs, ring };
  } else {
    cooldown.until = untilMs; cooldown.duration = durationMs;
  }
  startTicker();
}

function tickCooldown(now) {
  if (!cooldown) return;
  const obj = getPcDisplay();
  const remaining = cooldown.until - now;
  if (remaining <= 0 || !obj || obj.destroyed) {
    fxContainer.removeChild(cooldown.ring); cooldown.ring.destroy(); cooldown = null;
    return;
  }
  const frac = Math.max(0, Math.min(1, remaining / cooldown.duration));
  const g = cooldown.ring;
  g.clear();
  const r = TILE * FX.RING_RADIUS_TILES;
  // a figure (the avatar) is anchored at its feet and stands taller than its tile: centre the ring
  // halfway between its feet and its head (the art's opaque top), not on the feet
  const cy = obj.anchor?.y === 1
    ? obj.y - Math.abs(obj.height) * (1 - (obj.__artTop || 0)) / 2
    : obj.y;
  g.lineStyle(2, 0x000000, 0.25);
  g.drawCircle(obj.x, cy, r);
  g.lineStyle(2.5, 0xffffff, 0.75);
  g.arc(obj.x, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
}

// ---------------------------------------------------------------- enemy hp bars

/** Mark an enemy as engaged: its hp bar shows (or refreshes) and lingers briefly. */
export function engageEnemy(npcId, hp, maxhp) {
  if (!ready()) return;
  let entry = hpBars.get(npcId);
  if (!entry) {
    const bar = new Graphics();
    fxContainer.addChild(bar);
    entry = { bar, lastEngaged: 0, hp, maxhp };
    hpBars.set(npcId, entry);
  }
  entry.hp = hp; entry.maxhp = maxhp || hp || 1; entry.lastEngaged = Date.now();
  startTicker();
}

function tickHpBars(now) {
  for (const [npcId, entry] of hpBars) {
    const obj = getNpcDisplay(npcId);
    const age = now - entry.lastEngaged;
    if (!obj || obj.destroyed || age > FX.HP_BAR_LINGER_MS + FX.HP_BAR_FADE_MS || entry.hp <= 0) {
      fxContainer.removeChild(entry.bar); entry.bar.destroy(); hpBars.delete(npcId);
      continue;
    }
    const alpha = age < FX.HP_BAR_LINGER_MS ? 1 : 1 - (age - FX.HP_BAR_LINGER_MS) / FX.HP_BAR_FADE_MS;
    // over the enemy's head, as wide as its body: a figure or a multi-tile enemy stands taller than the old
    // fixed 0.62 of a tile (the renderer records `__topAbove`, the px from its position to its head, and `__bodyW`)
    const w = TILE * 0.9 * Math.max(1, obj.__bodyW || 1); const h = 4;
    const x = obj.x - w / 2; const y = obj.y - Math.max(TILE * 0.62, (obj.__topAbove || 0) + TILE * 0.12);
    const frac = Math.max(0, Math.min(1, entry.hp / entry.maxhp));
    const g = entry.bar;
    g.clear();
    g.alpha = alpha;
    g.beginFill(0x000000, 0.55); g.drawRoundedRect(x - 1, y - 1, w + 2, h + 2, 2); g.endFill();
    g.beginFill(frac > 0.5 ? 0x6ad36a : frac > 0.25 ? 0xe8c547 : 0xe05a4a, 1);
    g.drawRoundedRect(x, y, w * frac, h, 2); g.endFill();
  }
}

const CombatFX = { attach, detach, registerPC, text, hitEnemy, enemyWindup, enemyLeapCharge, enemyLeapArc, killEnemy, playerLunge, playerHit, showCooldown, engageEnemy, projectile, dropBounce, FX };
export default CombatFX;
