/**
 * The board's frame rate: 60 fps while the player is doing something, 30 fps once the board has
 * sat untouched for IDLE_AFTER_MS (2026-11-04). Movement, camera easing, pinch zoom and combat
 * all follow input, so they always get 60; an idle board (NPCs strolling, water shimmering)
 * drops to 30 to spare the battery. Any touch, pointer, wheel or key input wakes it.
 *
 * The debug panel can pin the rate (`cycleFrameRateMode`: auto -> 60 -> 30 -> auto).
 *
 * PixiJS skips frames unreliably at an exact 30 or 60 on high-refresh displays
 * (https://github.com/pixijs/pixijs/issues/5741), so the caps sit just below.
 */
const ACTIVE_FPS = 60;
const IDLE_FPS = 30;
const IDLE_AFTER_MS = 8000;
const capFor = (fps) => fps - 0.03;

let ticker = null;
let mode = 'auto'; // 'auto' | 60 | 30
let idleTimer = null;
let listening = false;

function apply(fps) {
  if (ticker) ticker.maxFPS = capFor(fps);
}

function scheduleIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (mode === 'auto') apply(IDLE_FPS); }, IDLE_AFTER_MS);
}

/** Back to 60 fps for the next IDLE_AFTER_MS. Cheap: call it from anything that animates. */
export function wakeFrameRate() {
  if (mode !== 'auto') return;
  if (ticker && ticker.maxFPS !== capFor(ACTIVE_FPS)) apply(ACTIVE_FPS);
  scheduleIdle();
}

const INPUT_EVENTS = ['pointerdown', 'pointermove', 'touchstart', 'touchmove', 'wheel', 'keydown'];

/** Hand the board's ticker over (PixiRenderer, once per Application). */
export function attachFrameRate(appTicker) {
  ticker = appTicker;
  if (!listening) {
    listening = true;
    for (const ev of INPUT_EVENTS) window.addEventListener(ev, wakeFrameRate, { passive: true, capture: true });
  }
  if (mode === 'auto') wakeFrameRate();
  else apply(mode);
}

export function detachFrameRate(appTicker) {
  if (ticker === appTicker) ticker = null;
}

/** Debug panel: auto -> 60 -> 30 -> auto. Returns the new mode. */
export function cycleFrameRateMode() {
  mode = mode === 'auto' ? ACTIVE_FPS : mode === ACTIVE_FPS ? IDLE_FPS : 'auto';
  clearTimeout(idleTimer);
  if (mode === 'auto') wakeFrameRate();
  else apply(mode);
  return mode;
}

export const getFrameRateMode = () => mode;
