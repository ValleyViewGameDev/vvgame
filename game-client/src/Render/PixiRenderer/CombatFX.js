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
import { Container, Graphics, Text } from 'pixi.js-legacy';

const FX = {
  DAMAGE_RISE_MS: 900,       // damage number lifetime
  DAMAGE_RISE_TILES: 0.9,
  HIT_FLASH_MS: 140,
  KNOCKBACK_TILES: 0.22,
  KNOCKBACK_MS: 110,         // out; back takes KNOCKBACK_MS * 1.4
  POP_SCALE: 1.18,
  DEATH_MS: 900,             // death beat: flash, hold, then shrink and fade
  DEATH_XP_DELAY_MS: 650,    // when the "+XP" text follows the skull
  DEATH_LOOT_DELAY_MS: 700,  // when the drop appears on the tile
  PROJECTILE_MS_PER_TILE: 70,
  PROJECTILE_MIN_MS: 140,
  LUNGE_TILES: 0.3,
  LUNGE_MS: 90,              // out; back takes LUNGE_MS * 1.3
  PC_HIT_FLASH_MS: 160,
  RING_RADIUS_TILES: 0.62,
  HP_BAR_LINGER_MS: 2500,
  HP_BAR_FADE_MS: 400,
  WINDUP_MS: 300,
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

/** A short text that rises from tile (x, y) and fades. Colors: 'damage' | 'player' | 'miss' | 'gain'. */
export function text(x, y, label, kind = 'damage') {
  if (!ready()) return;
  const styles = {
    damage: { fill: '#ffffff', stroke: '#5a1010', strokeThickness: 4, fontSize: TILE * 0.5 },
    player: { fill: '#ff5a5a', stroke: '#300000', strokeThickness: 4, fontSize: TILE * 0.5 },
    miss:   { fill: '#dddddd', stroke: '#333333', strokeThickness: 3, fontSize: TILE * 0.36 },
    gain:   { fill: '#ffe66d', stroke: '#4a3a00', strokeThickness: 4, fontSize: TILE * 0.42 },
    kill:   { fill: '#ffffff', stroke: '#000000', strokeThickness: 4, fontSize: TILE * 0.44 },
  };
  const s = styles[kind] || styles.damage;
  const t = new Text(String(label), { fontFamily: 'Lora, serif', fontWeight: 'bold', align: 'center', ...s });
  t.resolution = 2;
  t.anchor.set(0.5, 1);
  const x0 = (x + 0.5) * TILE + (Math.random() - 0.5) * TILE * 0.3;
  const y0 = (y + 0.15) * TILE;
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

/** Flash, pop and knock the enemy's sprite back a little, away from (fromX, fromY). */
export function hitEnemy(npcId, fromX, fromY, toX, toY) {
  const obj = getNpcDisplay(npcId);
  if (!ready() || !obj || obj.destroyed) return;
  const len = Math.hypot(toX - fromX, toY - fromY) || 1;
  const dx = ((toX - fromX) / len) * FX.KNOCKBACK_TILES * TILE;
  const dy = ((toY - fromY) / len) * FX.KNOCKBACK_TILES * TILE;
  const start = Date.now();
  const baseTint = obj.tint ?? 0xffffff;
  const baseScaleX = obj.scale.x;
  const baseScaleY = obj.scale.y;
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
      obj.scale.set(baseScaleX * pop, baseScaleY * pop);
      setPivotOffset(obj, dx * k, dy * k, baseScaleX, baseScaleY);
      if (e >= total) {
        setPivotOffset(obj, 0, 0, baseScaleX, baseScaleY);
        obj.tint = baseTint;
        obj.scale.set(baseScaleX, baseScaleY);
        return false;
      }
      return true;
    },
  });
}

/** A small anticipation before an enemy swings: squash down, then spring up. */
export function enemyWindup(npcId) {
  const obj = getNpcDisplay(npcId);
  if (!ready() || !obj || obj.destroyed) return;
  const start = Date.now();
  const bx = obj.scale.x; const by = obj.scale.y;
  run({
    update(now) {
      if (obj.destroyed) return false;
      const p = Math.min(1, (now - start) / FX.WINDUP_MS);
      const s = Math.sin(p * Math.PI);
      obj.scale.set(bx * (1 + 0.12 * s), by * (1 - 0.14 * s));
      if (p >= 1) { obj.scale.set(bx, by); return false; }
      return true;
    },
  });
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
  const bx = obj.scale.x; const by = obj.scale.y; const y0 = obj.y;
  setPivotOffset(obj, 0, 0, bx, by);
  const start = Date.now();
  obj.tint = 0xffffff;
  // Three beats so the kill can be read: a flash + pop (0-15%), a hold while it tips over
  // (15-45%), then it shrinks, rises and fades (45-100%).
  run({
    update(now) {
      if (obj.destroyed) return false;
      const p = Math.min(1, (now - start) / FX.DEATH_MS);
      let pop = 1; let alpha = 1; let rise = 0;
      if (p < 0.15) {
        pop = 1 + (p / 0.15) * 0.22;
        obj.tint = 0xffd0d0;
      } else if (p < 0.45) {
        pop = 1.22 - ((p - 0.15) / 0.3) * 0.12;
        obj.tint = 0xffffff;
      } else {
        const q = easeIn((p - 0.45) / 0.55);
        pop = 1.1 - q * 0.9; alpha = 1 - q; rise = q * 0.4;
      }
      obj.scale.set(bx * pop, by * pop);
      obj.alpha = alpha;
      obj.y = y0 - rise * TILE;
      obj.rotation = Math.min(1, p / 0.45) * 0.35;
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
  const bx = obj.scale.x; const by = obj.scale.y;
  run({
    update(now) {
      if (obj.destroyed) return false;
      const e = now - start;
      let k;
      if (e < FX.LUNGE_MS) k = easeOut(e / FX.LUNGE_MS);
      else k = 1 - easeOut(Math.min(1, (e - FX.LUNGE_MS) / (FX.LUNGE_MS * 1.3)));
      setPivotOffset(obj, dx * k, dy * k, bx, by);
      if (e >= total) { setPivotOffset(obj, 0, 0, bx, by); return false; }
      return true;
    },
  });
}

// ---------------------------------------------------------------- projectiles

/**
 * A ranged shot: a small arrow flies from tile (fromX, fromY) to (toX, toY), then `onArrive`
 * runs (the hit or miss feedback). Without the renderer, onArrive runs at once.
 */
export function projectile(fromX, fromY, toX, toY, onArrive) {
  if (!ready()) { if (onArrive) onArrive(); return; }
  const x0 = (fromX + 0.5) * TILE; const y0 = (fromY + 0.5) * TILE;
  const x1 = (toX + 0.5) * TILE; const y1 = (toY + 0.5) * TILE;
  const dist = Math.hypot(x1 - x0, y1 - y0) / TILE;
  const duration = Math.max(FX.PROJECTILE_MIN_MS, dist * FX.PROJECTILE_MS_PER_TILE);
  const g = new Graphics();
  const len = TILE * 0.45;
  // an arrow drawn along +x: shaft, head, fletching
  g.lineStyle(2, 0x3a2a14, 1); g.moveTo(-len / 2, 0); g.lineTo(len / 2 - 4, 0);
  g.beginFill(0x8a8a8a, 1); g.moveTo(len / 2, 0); g.lineTo(len / 2 - 7, -3.5); g.lineTo(len / 2 - 7, 3.5); g.closePath(); g.endFill();
  g.lineStyle(2, 0xd9c48b, 1); g.moveTo(-len / 2, 0); g.lineTo(-len / 2 + 5, -3); g.moveTo(-len / 2, 0); g.lineTo(-len / 2 + 5, 3);
  g.rotation = Math.atan2(y1 - y0, x1 - x0);
  g.x = x0; g.y = y0;
  fxContainer.addChild(g);
  const start = Date.now();
  let done = false;
  run({
    update(now) {
      const p = Math.min(1, (now - start) / duration);
      g.x = x0 + (x1 - x0) * p; g.y = y0 + (y1 - y0) * p;
      if (p >= 1 && !done) {
        done = true;
        fxContainer.removeChild(g); g.destroy();
        if (onArrive) { try { onArrive(); } catch (e) { console.error('projectile onArrive failed', e); } }
        return false;
      }
      return true;
    },
  });
}

/** Red flash on the player's sprite. */
export function playerHit() {
  const obj = getPcDisplay();
  if (!ready() || !obj || obj.destroyed) return;
  const start = Date.now();
  const baseTint = obj.tint ?? 0xffffff;
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
  g.lineStyle(2, 0x000000, 0.25);
  g.drawCircle(obj.x, obj.y, r);
  g.lineStyle(2.5, 0xffffff, 0.75);
  g.arc(obj.x, obj.y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
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
    const w = TILE * 0.9; const h = 4;
    const x = obj.x - w / 2; const y = obj.y - TILE * 0.62;
    const frac = Math.max(0, Math.min(1, entry.hp / entry.maxhp));
    const g = entry.bar;
    g.clear();
    g.alpha = alpha;
    g.beginFill(0x000000, 0.55); g.drawRoundedRect(x - 1, y - 1, w + 2, h + 2, 2); g.endFill();
    g.beginFill(frac > 0.5 ? 0x6ad36a : frac > 0.25 ? 0xe8c547 : 0xe05a4a, 1);
    g.drawRoundedRect(x, y, w * frac, h, 2); g.endFill();
  }
}

const CombatFX = { attach, detach, registerPC, text, hitEnemy, enemyWindup, killEnemy, playerLunge, playerHit, showCooldown, engageEnemy, projectile, FX };
export default CombatFX;
