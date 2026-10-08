/**
 * NPCVFX - headline effects: a small looping effect that floats above an NPC's head for as
 * long as a state lasts (Zzz while resting, an emoji while waiting, talking, and so on).
 * Ported from SimGame's NPCVFX for docs/citizens.md (Track 4). DOM particles in the
 * camera-mirrored overlay (BASE px, current grid at the origin), like VFX.js.
 *
 *   startHeadlineEffect(npcId, 'Zzz', position)
 *   startHeadlineEffect(npcId, 'emoji', position, { emoji: '💬' })
 *   updateHeadlineEffectPosition(npcId, position)   // when the NPC moves
 *   stopHeadlineEffect(npcId)
 */
import PixiCamera from '../Render/PixiRenderer/PixiCamera';

const HEADLINE_VERTICAL_OFFSET = 0.75; // tiles above the sprite's centre (NPCs are one tile tall here)

const VFX_CONFIG = {
  Zzz: { duration: 2000, stagger: 600, count: 3, loopEvery: 2600 },
  emoji: { duration: 1800, stagger: 500, count: 3, loopEvery: 2400 },
};

const activeHeadlineEffects = new Map(); // npcId -> { type, container, elements, timeoutIds, intervalId }

function anchor(position) {
  const t = PixiCamera.getTileSize();
  return { x: (position.x + 0.5) * t, y: (position.y + 0.5 - HEADLINE_VERTICAL_OFFSET) * t, t };
}

/** Spawn one rising glyph inside an effect's container. */
function spawnGlyph(effect, char, { size, color = 'white', index = 0, duration }) {
  const z = document.createElement('div');
  z.innerText = char;
  z.style.cssText = `
    position: absolute; left: 0; top: 0; transform: translate(-50%, 0);
    font-size: ${size}px; font-weight: bold; color: ${color};
    text-shadow: 2px 2px 3px rgba(0, 0, 0, 0.7), 1px 1px 2px rgba(0, 0, 0, 0.5);
    opacity: 0; pointer-events: none; will-change: transform, opacity;
  `;
  effect.container.appendChild(z);
  effect.elements.push(z);
  const xOffset = (index - 1) * (effect.t * 0.2);
  requestAnimationFrame(() => {
    z.style.transition = `transform ${duration}ms ease-out, opacity ${duration * 0.3}ms ease-in`;
    z.style.opacity = '1';
    z.style.transform = `translate(calc(-50% + ${xOffset}px), ${-effect.t * 0.3}px)`;
    effect.timeoutIds.push(setTimeout(() => {
      z.style.transition = `transform ${duration * 0.5}ms ease-out, opacity ${duration * 0.5}ms ease-out`;
      z.style.transform = `translate(calc(-50% + ${xOffset}px), ${-effect.t * 1.1}px)`;
      z.style.opacity = '0';
    }, duration * 0.5));
    effect.timeoutIds.push(setTimeout(() => {
      if (z.parentNode) z.parentNode.removeChild(z);
      const i = effect.elements.indexOf(z); if (i > -1) effect.elements.splice(i, 1);
    }, duration));
  });
}

function runWave(effect, type, options) {
  const cfg = VFX_CONFIG[type] || VFX_CONFIG.emoji;
  for (let i = 0; i < cfg.count; i++) {
    effect.timeoutIds.push(setTimeout(() => {
      if (type === 'Zzz') {
        const chars = ['Z', 'z', 'z']; const sizes = [1.0, 0.8, 0.6];
        spawnGlyph(effect, chars[i % 3], { size: effect.t * 0.5 * sizes[i % 3], index: i, duration: cfg.duration });
      } else {
        spawnGlyph(effect, options.emoji || '❓', { size: effect.t * 0.45, index: i, duration: cfg.duration });
      }
    }, i * cfg.stagger));
  }
}

/**
 * Start (or replace) the headline effect above an NPC. Loops until stopped.
 * @param {string} npcId
 * @param {'Zzz'|'emoji'} effectType
 * @param {{x:number,y:number}} position  tile position
 * @param {{emoji?: string}|string} [options]
 */
export function startHeadlineEffect(npcId, effectType, position, options = {}) {
  if (typeof options === 'string') options = { emoji: options };
  const worldContainer = document.querySelector('.pixi-world-container');
  if (!worldContainer || !position) return;
  const existing = activeHeadlineEffects.get(npcId);
  if (existing && existing.type === effectType && existing.emoji === options.emoji) { updateHeadlineEffectPosition(npcId, position); return; }
  stopHeadlineEffect(npcId);

  const { x, y, t } = anchor(position);
  const container = document.createElement('div');
  container.style.cssText = `position: absolute; left: ${x}px; top: ${y}px; pointer-events: none; z-index: 1100;`;
  worldContainer.appendChild(container);
  const effect = { type: effectType, emoji: options.emoji, container, elements: [], timeoutIds: [], intervalId: null, t };
  const cfg = VFX_CONFIG[effectType] || VFX_CONFIG.emoji;
  runWave(effect, effectType, options);
  effect.intervalId = setInterval(() => runWave(effect, effectType, options), cfg.loopEvery);
  activeHeadlineEffects.set(npcId, effect);
}

export function stopHeadlineEffect(npcId) {
  const effect = activeHeadlineEffects.get(npcId);
  if (!effect) return;
  if (effect.intervalId) clearInterval(effect.intervalId);
  effect.timeoutIds.forEach((id) => clearTimeout(id));
  effect.elements.forEach((el) => { if (el.parentNode) el.parentNode.removeChild(el); });
  if (effect.container.parentNode) effect.container.parentNode.removeChild(effect.container);
  activeHeadlineEffects.delete(npcId);
}

export function updateHeadlineEffectPosition(npcId, position) {
  const effect = activeHeadlineEffects.get(npcId);
  if (!effect || !position) return;
  const { x, y } = anchor(position);
  effect.container.style.left = `${x}px`;
  effect.container.style.top = `${y}px`;
}

export function hasHeadlineEffect(npcId) { return activeHeadlineEffects.has(npcId); }

/** Everything off (grid change, unmount). */
export function stopAllHeadlineEffects() {
  for (const id of [...activeHeadlineEffects.keys()]) stopHeadlineEffect(id);
}
