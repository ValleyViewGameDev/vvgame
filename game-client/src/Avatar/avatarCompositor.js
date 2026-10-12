/**
 * avatarCompositor - draws a bust (docs/avatar-plan.md §2.4). Browser only, dependency-free
 * (no Pixi, no React) so the game, the editor's Avatar Lab and any picker preview share it.
 *
 *   const look = lookFor(spec, { catalogue, palettes }, equip);   // avatarLook.js
 *   const canvas = await renderLook(look.layers, { size: 256 });  // HTMLCanvasElement
 *   const blink  = look.blinkLayers && await renderLook(look.blinkLayers);
 *
 * Each layer is an image (`/assets/avatar/<src>`, or a frame the caller supplies through
 * `loadImage`) drawn in order; a tinted layer is multiplied by its colour through an
 * offscreen canvas (`multiply` keeps black line work black, turns white into the colour).
 * Results are cached by the layer list, so the same look costs one draw.
 */

export const AVATAR_SIZE = 256;
const ASSET_BASE = '/assets/avatar/';

const imageCache = new Map();   // src -> Promise<HTMLImageElement>
const canvasCache = new Map();  // cacheKey -> HTMLCanvasElement
const MAX_CACHED = 24;

let assetBase = ASSET_BASE;
/** Where part files are fetched from (the editor serves them from another path). */
export function setAvatarAssetBase(base) { assetBase = base.endsWith('/') ? base : base + '/'; }

/** Load (and cache) one part image by `<folder>/<file>`. */
export function loadPartImage(src) {
  if (imageCache.has(src)) return imageCache.get(src);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => { imageCache.delete(src); reject(new Error(`avatar part not found: ${src}`)); };
    img.src = assetBase + src;
  });
  imageCache.set(src, p);
  return p;
}

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  return c;
}

/** One layer, tinted: draw the image, multiply the colour in, keep the image's alpha. */
function drawTinted(ctx, img, tint, size) {
  const off = makeCanvas(size);
  const o = off.getContext('2d');
  o.drawImage(img, 0, 0, size, size);
  o.globalCompositeOperation = 'multiply';
  o.fillStyle = tint;
  o.fillRect(0, 0, size, size);
  o.globalCompositeOperation = 'destination-in';
  o.drawImage(img, 0, 0, size, size);
  ctx.drawImage(off, 0, 0);
}

const keyOf = (layers, size) => `${size}:` + layers.map((l) => `${l.src}${l.tint ? '@' + l.tint : ''}`).join('|');

/**
 * Compose layers into a canvas. Missing part files are skipped (and reported through
 * `onMissing`) so a half-drawn catalogue still shows the rest of the bust.
 */
export async function renderLook(layers, { size = AVATAR_SIZE, onMissing = null } = {}) {
  const key = keyOf(layers, size);
  const cached = canvasCache.get(key);
  if (cached) return cached;
  const images = await Promise.all(layers.map((l) => loadPartImage(l.src).catch((e) => { if (onMissing) onMissing(l.src, e); return null; })));
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  layers.forEach((layer, i) => {
    const img = images[i];
    if (!img) return;
    if (layer.tint) drawTinted(ctx, img, layer.tint, size);
    else ctx.drawImage(img, 0, 0, size, size);
  });
  if (canvasCache.size >= MAX_CACHED) canvasCache.delete(canvasCache.keys().next().value);
  canvasCache.set(key, canvas);
  return canvas;
}

/** A data URL for DOM `<img>` use (cached with the canvas). */
export async function renderLookDataUrl(layers, opts) {
  const canvas = await renderLook(layers, opts);
  if (!canvas.__dataUrl) canvas.__dataUrl = canvas.toDataURL('image/png');
  return canvas.__dataUrl;
}

/** Drop every cached canvas (a catalogue or art change in the Lab). Images stay cached. */
export function clearLookCache() { canvasCache.clear(); }
/** Drop cached images too (the Lab after a file was redrawn). */
export function clearAvatarCaches() { canvasCache.clear(); imageCache.clear(); }
