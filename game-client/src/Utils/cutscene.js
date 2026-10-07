import PixiCamera from '../Render/PixiRenderer/PixiCamera';
import { stopMovement } from '../PlayerMovement';
import { lockInput, unlockInput } from './inputLock';
import { findBoardTarget } from '../GameFeatures/FTUE/findBoardTarget';

const BASE_TILE = 45; // base px per tile in world space (TILE_SIZE = closeZoom)
let running = null;

/**
 * A cutscene: lock every player input, take the camera somewhere, hold, bring it back, and
 * hand control back. Call it from any trigger: playCutscene({ tile: { x, y } }) or
 * playCutscene({ target: 'Agriculture Center', gridId }) for a named thing on the board.
 * Options: holdMs (2000), panMs (600). Resolves when the player is back in control. A second
 * call while one runs is ignored (returns the running promise).
 */
export function playCutscene({ tile, target, gridId, holdMs = 2000, panMs = 600 } = {}) {
  if (running) return running;
  const spot = tile || (target ? findBoardTarget(target, gridId) : null);
  if (!spot || !PixiCamera.isAttached()) return Promise.resolve(false);

  running = (async () => {
    lockInput('cutscene');
    stopMovement();
    const blocker = document.createElement('div');
    blocker.className = 'cutscene-blocker';
    blocker.style.cssText = 'position:fixed;inset:0;z-index:2000;background:transparent;cursor:default';
    blocker.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); }, true);
    document.body.appendChild(blocker);
    try {
      const size = spot.size || 1;
      const centre = { x: (spot.x + size / 2) * BASE_TILE, y: (spot.y + size / 2) * BASE_TILE };
      const s = PixiCamera.worldToScreen(centre.x, centre.y);
      const v = PixiCamera.getViewport();
      const pan = PixiCamera.getPan();
      // The tile sits at s with the current pan; moving the pan by (centre - s) puts it at the centre.
      const targetPan = { x: pan.x + v.width / 2 - s.x, y: pan.y + v.height / 2 - s.y };
      PixiCamera.animatePanTo(targetPan, panMs);
      await wait(panMs + holdMs);
      PixiCamera.animatePanTo({ x: 0, y: 0 }, panMs);
      await wait(panMs + 50);
      PixiCamera.resetPan();
      return true;
    } finally {
      blocker.remove();
      unlockInput('cutscene');
      running = null;
    }
  })();
  return running;
}
export function isCutsceneRunning() { return !!running; }
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') window.__playCutscene = playCutscene; // dev hook, like __pixiCamera
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
