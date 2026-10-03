/**
 * AtlasTextures: runtime side of scripts/build-atlas.js.
 *
 * The build script pre-rasterises every SVG the world renderer draws (resources, NPCs,
 * player icons, status overlays) into a few 2048 px sheets under public/assets/atlas/.
 * This module loads those sheets once per PixiJS Application and hands out frame
 * textures by `<namespace>/<filename>`, e.g. `getAtlasTexture('resources', 'oak-tree.svg')`.
 *
 * Callers keep their old SVG rasterisation as a fallback: a `null` from here means
 * "no frame in the atlas" (new art that has not been through `npm run build:atlas`
 * yet), not "failed". docs/audits/client-review-2026-10-03.md §2.5 A.
 *
 * Lifecycle: PixiRenderer calls `resetAtlas()` when it destroys its Application
 * (`app.destroy(true, { texture: true })` takes the sheet BaseTextures with it), and the
 * next `getAtlasTexture` reloads. Textures are also validated on every lookup so a
 * WebGL context loss cannot hand out a dead texture.
 */
import { BaseTexture, Spritesheet, SCALE_MODES } from 'pixi.js-legacy';

const ATLAS_DIR = '/assets/atlas';
const MANIFEST_URL = `${ATLAS_DIR}/world.json`;

let loadPromise = null;      // Promise<Map<frameKey, Texture>> for the current generation
let frames = null;           // Map once loaded
let generation = 0;          // bumped by resetAtlas() so stale loads are ignored
let webpSupport = null;      // Promise<boolean>

function supportsWebP() {
  if (webpSupport) return webpSupport;
  webpSupport = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.width === 1);
    img.onerror = () => resolve(false);
    // 1x1 lossy WebP
    img.src = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';
  });
  return webpSupport;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load atlas sheet ${url}`));
    img.src = url;
  });
}

async function loadSheets(thisGeneration) {
  const response = await fetch(MANIFEST_URL, { cache: 'default' });
  if (!response.ok) throw new Error(`Atlas manifest not found (${response.status})`);
  const manifest = await response.json();
  const useWebP = await supportsWebP();

  const map = new Map();
  await Promise.all(manifest.sheets.map(async (sheet) => {
    const [json, img] = await Promise.all([
      fetch(`${ATLAS_DIR}/${sheet.json}`).then((r) => r.json()),
      loadImage(`${ATLAS_DIR}/${useWebP && sheet.webp ? sheet.webp : sheet.png}`),
    ]);
    if (thisGeneration !== generation) return; // reset happened mid-load
    const base = BaseTexture.from(img, { scaleMode: SCALE_MODES.LINEAR });
    const spritesheet = new Spritesheet(base, json);
    await spritesheet.parse();
    if (thisGeneration !== generation) { spritesheet.destroy(true); return; }
    for (const [key, texture] of Object.entries(spritesheet.textures)) map.set(key, texture);
  }));
  return map;
}

/** Load (once) and return the frame map. Rejects if the atlas is missing; callers fall back to SVG. */
export function loadAtlas() {
  if (!loadPromise) {
    const thisGeneration = generation;
    loadPromise = loadSheets(thisGeneration).then((map) => {
      if (thisGeneration === generation) frames = map;
      return map;
    }).catch((err) => {
      console.warn('⚠️ [ATLAS] not available, falling back to live SVG rasterisation:', err.message);
      if (thisGeneration === generation) frames = new Map();
      return frames || new Map();
    });
  }
  return loadPromise;
}

/**
 * Texture for `<namespace>/<filename>`, or null when the atlas has no such frame.
 * Async only on the first call; afterwards it resolves on the next microtask.
 */
export async function getAtlasTexture(namespace, filename) {
  if (!filename) return null;
  const map = frames || await loadAtlas();
  const texture = map.get(`${namespace}/${filename}`) || null;
  if (!texture) return null;
  if (texture.valid === false || texture.baseTexture?.valid === false || texture.baseTexture?.destroyed) {
    return null;
  }
  return texture;
}

/** Synchronous lookup for code that has already awaited loadAtlas() (or null). */
export function peekAtlasTexture(namespace, filename) {
  if (!frames || !filename) return null;
  const texture = frames.get(`${namespace}/${filename}`) || null;
  if (!texture || texture.valid === false || texture.baseTexture?.destroyed) return null;
  return texture;
}

/** Forget the loaded sheets (their BaseTextures die with the Application); the next lookup reloads. */
export function resetAtlas() {
  generation += 1;
  loadPromise = null;
  frames = null;
}

export function isAtlasLoaded() {
  return frames !== null;
}
