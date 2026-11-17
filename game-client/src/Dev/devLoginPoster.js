/**
 * Dev only: remake the login scene's still picture (public/assets/login-scene-poster.webp), shown
 * at once on a new visitor's first load and behind the live scene until it fades in
 * (public/index.html #scene-poster, App.css .keyart-wrapper; owner 2026-11-16).
 *
 * When the scene's layout (layouts/gridLayouts/homestead/start-screen.json) or its art changes:
 *   1. open the local client signed out, in a window at least 2200 x 1480 (the Browser pane's
 *      custom viewport works), and RELOAD at that size so every tile in the 48 x 32 frame is drawn;
 *   2. wait for the scene to fade in, then run __captureLoginPoster() in the console;
 *   3. move the downloaded login-scene-poster.webp into game-client/public/assets/.
 * It draws the ground, the step-stones and every placed resource; the animals, the Lumberjack and
 * the ambient effects are left out (they move, so a still copy would jump at the fade).
 * Half resolution on purpose: ~150 KB, and it is only on screen for a moment.
 */
const COLS = 48;
const ROWS = 32;
const TILE = 45;
const SCALE = 0.5;
const QUALITY = 0.7;

if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  window.__captureLoginPoster = () => {
    const app = window.__pixiApp;
    const world = app?.stage?.children?.[0];
    if (!world || !document.querySelector('.login-scene--visible')) return 'Open the login scene first (signed out) and wait for it to fade in.';
    const layer = (name) => world.children.find((c) => c.name === name)?.children || [];
    const hidden = [];
    for (const c of world.children) {
      if ((['story-fx', 'overlays', 'combat-fx'].includes(c.name) || !c.name) && c.visible) { c.visible = false; hidden.push(c); }
    }
    // actors sort at row + 0.5 (depthSort.actorZ), resources at whole rows
    for (const c of layer('objects')) if (c.zIndex % 1 !== 0 && c.visible) { c.visible = false; hidden.push(c); }
    const all = [...layer('tiles'), ...layer('step-stones'), ...layer('objects')];
    const was = all.map((c) => c.renderable);
    all.forEach((c) => { c.renderable = true; });   // past the view culling (viewCulling.js)
    const W = COLS * TILE;
    const H = ROWS * TILE;
    const Rect = world.getBounds().constructor;
    const src = app.renderer.extract.canvas(world, new Rect(0, 0, W, H));
    all.forEach((c, i) => { c.renderable = was[i]; });
    hidden.forEach((c) => { c.visible = true; });
    const out = document.createElement('canvas');
    out.width = Math.round(W * SCALE);
    out.height = Math.round(H * SCALE);
    const g = out.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, 0, 0, out.width, out.height);
    const a = document.createElement('a');
    a.href = out.toDataURL('image/webp', QUALITY);
    a.download = 'login-scene-poster.webp';
    a.click();
    return `downloaded (${Math.round((a.href.length * 0.75) / 1024)} KB)`;
  };
}
