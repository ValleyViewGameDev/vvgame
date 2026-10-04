/**
 * PixiCamera: the one camera for the game board.
 *
 * Before this module the camera was the browser: a 368,640 px DOM scroll container held a
 * 2,880 px canvas of the whole grid, and "moving the camera" meant writing scrollLeft /
 * scrollTop (docs/audits/client-review-2026-10-03.md §2.1, §2.4). Now the canvas is the size
 * of the visible board and this module positions and scales Pixi's `worldContainer` so the
 * local player sits at a fixed point on screen (the centre of the board).
 *
 * World coordinates are BASE pixels (tile x TILE_SIZE, no zoom) with the CURRENT GRID at
 * the origin. Zoom is `worldContainer.scale`. Everything that lives in the world is a child
 * of `worldContainer`, so it follows for free. DOM overlays that must line up with the world
 * (floating text, DOM VFX, the settlement/frontier previews, the FTUE doinker) sit inside one
 * absolutely positioned div (`.pixi-world-container`) whose CSS transform this module keeps
 * identical to the Pixi container's. Children of that div are laid out in the same base px.
 *
 * Who calls what:
 *   PixiRenderer         attach() / detach(), on mount and unmount
 *   PixiRendererPCs      follow(x, y) on every PC render and animation frame
 *   App.js               animateZoom(target, onDone) when the zoom level changes
 *   PixiRenderer         screenToWorld() for click and hover hit-testing
 *   VFX.js, FloatingText getTileSize() so DOM overlays use base px
 */

let app = null;
let worldContainer = null;
let hostEl = null;        // the div the canvas lives in; its size is the viewport
let overlayEl = null;     // the mirrored DOM overlay
let tileSize = 45;
let zoom = 1;
let targetZoom = 1;
let playerTile = { x: 0, y: 0 };
let viewport = { width: 0, height: 0 };
// Pan: a screen-px offset the player can add with the trackpad / wheel / a finger drag to look
// around. It clamps so the viewport centre stays inside panBounds (world base px; the current
// grid by default, the settlement or frontier extent when zoomed out) and resets to zero as
// soon as the player moves or the zoom changes, which is what the old scroll container did.
let pan = { x: 0, y: 0 };
let panBounds = null;
let panReturnFrame = null;      // rAF handle while the pan eases back to the player
const PAN_RETURN_MS = 350;
let resizeObserver = null;
let zoomFrame = null;
let zoomDone = null;
let readyResolvers = [];

const ZOOM_DURATION_MS = 220; // ease-out over real time, so a slow frame rate still lands on time
const ZOOM_EPSILON = 0.001;

function defaultBounds() {
  return { minX: 0, minY: 0, maxX: 64 * tileSize, maxY: 64 * tileSize };
}

/** Keep the world point under the viewport centre inside panBounds. */
function clampPan() {
  const b = panBounds || defaultBounds();
  const centreX = playerTile.x * tileSize - pan.x / zoom;
  const centreY = playerTile.y * tileSize - pan.y / zoom;
  const cx = Math.min(b.maxX, Math.max(b.minX, centreX));
  const cy = Math.min(b.maxY, Math.max(b.minY, centreY));
  pan.x = (playerTile.x * tileSize - cx) * zoom;
  pan.y = (playerTile.y * tileSize - cy) * zoom;
}

function apply() {
  if (!worldContainer) return;
  const cx = viewport.width / 2;
  const cy = viewport.height / 2;
  // Snap to whole device pixels at the current zoom so tile edges stay crisp
  const x = Math.round(cx - playerTile.x * tileSize * zoom + pan.x);
  const y = Math.round(cy - playerTile.y * tileSize * zoom + pan.y);
  worldContainer.scale.set(zoom);
  worldContainer.position.set(x, y);
  if (overlayEl) {
    overlayEl.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
  }
}

function resizeToHost() {
  if (!app || !hostEl) return;
  const width = Math.max(1, Math.floor(hostEl.clientWidth));
  const height = Math.max(1, Math.floor(hostEl.clientHeight));
  if (width === viewport.width && height === viewport.height) return;
  viewport = { width, height };
  app.renderer.resize(width, height);
  apply();
}

/** Wire the camera to a Pixi Application. Called once per Application by PixiRenderer. */
export function attach({ app: pixiApp, worldContainer: container, hostElement, overlayElement, baseTileSize }) {
  app = pixiApp;
  worldContainer = container;
  hostEl = hostElement;
  overlayEl = overlayElement || null;
  tileSize = baseTileSize || tileSize;
  if (overlayEl) {
    overlayEl.style.transformOrigin = '0 0';
    overlayEl.style.willChange = 'transform';
  }
  viewport = { width: 0, height: 0 };
  resizeToHost();
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(resizeToHost);
    resizeObserver.observe(hostEl);
  } else {
    window.addEventListener('resize', resizeToHost);
  }
  readyResolvers.forEach((resolve) => resolve(true));
  readyResolvers = [];
}

export function detach() {
  if (zoomFrame) cancelAnimationFrame(zoomFrame);
  zoomFrame = null;
  cancelPanReturn();
  pan = { x: 0, y: 0 };
  zoomDone = null;
  if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
  window.removeEventListener('resize', resizeToHost);
  app = null;
  worldContainer = null;
  hostEl = null;
  overlayEl = null;
}

/** Resolves once attach() has run (init waits on this before fading up). */
export function whenReady() {
  if (worldContainer) return Promise.resolve(true);
  return new Promise((resolve) => { readyResolvers.push(resolve); });
}

export function setOverlayElement(el) {
  overlayEl = el || null;
  if (overlayEl) {
    overlayEl.style.transformOrigin = '0 0';
    overlayEl.style.willChange = 'transform';
  }
  apply();
}

/** Keep the player at the fixed screen point. x/y are tile coordinates (fractions during animation). */
function cancelPanReturn() {
  if (panReturnFrame) cancelAnimationFrame(panReturnFrame);
  panReturnFrame = null;
}

/**
 * Ease a look-around pan back to zero over PAN_RETURN_MS (time-based, so a slow frame rate
 * still lands on time). Used when the player starts moving while the view is panned away,
 * instead of cutting straight back to them; the movement itself is not delayed.
 */
function startPanReturn() {
  cancelPanReturn();
  const from = { ...pan };
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / PAN_RETURN_MS);
    const eased = 1 - Math.pow(1 - t, 3);
    pan = { x: from.x * (1 - eased), y: from.y * (1 - eased) };
    apply();
    if (t >= 1) { pan = { x: 0, y: 0 }; apply(); panReturnFrame = null; return; }
    panReturnFrame = requestAnimationFrame(step);
  };
  panReturnFrame = requestAnimationFrame(step);
}

export function follow(x, y) {
  if (typeof x !== 'number' || typeof y !== 'number' || Number.isNaN(x) || Number.isNaN(y)) return;
  // Sprites are centred on the tile (anchor 0.5), so follow the tile centre
  const nx = x + 0.5, ny = y + 0.5;
  const moved = nx !== playerTile.x || ny !== playerTile.y;
  playerTile = { x: nx, y: ny };
  if (moved && !panReturnFrame && (pan.x !== 0 || pan.y !== 0)) {
    // The player set off while the view was panned away: glide back to them
    startPanReturn();
    return; // startPanReturn's first frame applies
  }
  apply();
}

/** Move the view by screen px (trackpad, wheel, finger drag). Clamped to panBounds. */
export function panBy(dx, dy) {
  if (!worldContainer) return;
  cancelPanReturn();
  pan = { x: pan.x + dx, y: pan.y + dy };
  clampPan();
  apply();
}

export function resetPan() {
  cancelPanReturn();
  pan = { x: 0, y: 0 };
  apply();
}

/** World extent (base px, current grid at the origin) the view may wander over; null = the grid. */
export function setPanBounds(bounds) {
  panBounds = bounds || null;
  clampPan();
  apply();
}

export function setZoom(scale) {
  if (zoomFrame) { cancelAnimationFrame(zoomFrame); zoomFrame = null; }
  cancelPanReturn();
  zoom = scale;
  targetZoom = scale;
  pan = { x: 0, y: 0 };
  apply();
}

/**
 * Lerp the zoom to `target`, then call onDone. A new call replaces the previous animation
 * (its onDone is dropped, matching the old effect cleanup).
 */
export function animateZoom(target, onDone) {
  if (zoomFrame) { cancelAnimationFrame(zoomFrame); zoomFrame = null; }
  targetZoom = target;
  zoomDone = onDone || null;
  cancelPanReturn();
  pan = { x: 0, y: 0 }; // a zoom re-centres on the player
  if (Math.abs(zoom - target) < ZOOM_EPSILON) {
    zoom = target;
    apply();
    const done = zoomDone; zoomDone = null;
    if (done) done();
    return;
  }
  const from = zoom;
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / ZOOM_DURATION_MS);
    const eased = 1 - Math.pow(1 - t, 3); // cubic ease-out
    zoom = from + (targetZoom - from) * eased;
    apply();
    if (t >= 1) {
      zoom = targetZoom;
      apply();
      zoomFrame = null;
      const done = zoomDone; zoomDone = null;
      if (done) done();
      return;
    }
    zoomFrame = requestAnimationFrame(step);
  };
  zoomFrame = requestAnimationFrame(step);
}

export function getZoom() { return zoom; }
export function getTileSize() { return tileSize; }
export function getViewport() { return { ...viewport }; }
export function isAttached() { return !!worldContainer; }

/** Screen px (relative to the host element) -> world base px (current grid at origin). */
export function screenToWorld(screenX, screenY) {
  if (!worldContainer) return { x: screenX, y: screenY };
  return {
    x: (screenX - worldContainer.position.x) / zoom,
    y: (screenY - worldContainer.position.y) / zoom,
  };
}

/** World base px -> screen px (relative to the host element). */
export function worldToScreen(worldX, worldY) {
  if (!worldContainer) return { x: worldX, y: worldY };
  return {
    x: worldX * zoom + worldContainer.position.x,
    y: worldY * zoom + worldContainer.position.y,
  };
}

/** Screen px -> tile { row, col } in the current grid (may be outside 0-63). */
export function screenToTile(screenX, screenY) {
  const world = screenToWorld(screenX, screenY);
  return { col: Math.floor(world.x / tileSize), row: Math.floor(world.y / tileSize) };
}

const PixiCamera = {
  attach, detach, whenReady, setOverlayElement, follow, panBy, resetPan, setPanBounds, setZoom, animateZoom,
  getZoom, getTileSize, getViewport, isAttached, screenToWorld, worldToScreen, screenToTile,
  // read-only debug view of the internals (dev console: __pixiCamera.debug())
  debug: () => ({ zoom, targetZoom, playerTile: { ...playerTile }, pan: { ...pan }, viewport: { ...viewport }, attached: !!worldContainer, animating: !!zoomFrame, panReturning: !!panReturnFrame }),
};
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  window.__pixiCamera = PixiCamera;
}
export default PixiCamera;
