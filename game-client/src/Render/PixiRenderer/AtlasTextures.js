/**
 * AtlasTextures: runtime side of scripts/build-atlas.js.
 *
 * The build script pre-rasterises every SVG the world renderer draws (resources, NPCs,
 * player icons, status overlays) into sheets under public/assets/atlas/. This module hands
 * out frame textures by `<namespace>/<filename>`, e.g. `getAtlasTexture('resources', 'oak-tree.svg')`.
 *
 * Callers keep their old SVG rasterisation as a fallback: a `null` from here means
 * "no frame in the atlas" (new art that has not been through `npm run build:atlas`
 * yet), not "failed". docs/audits/client-review-2026-10-03.md §2.5 A.
 *
 * Sheets by use (BL-24, 2026-11-14). The manifest marks each sheet CORE or PAGE:
 *   - `loadAtlas()` loads the core sheets (ground tiles, edges, walls, overlays, glyphs, avatar parts,
 *     every small frame): what can appear on any grid. `isAtlasLoaded()` / `peekAtlasTexture` mean core.
 *   - a PAGE (buildings, trees, NPC figures, deco, big emoji) loads when something needs it:
 *     `prepareAtlasForGrid` awaits the pages a grid's resources and NPCs are on, behind the grid
 *     transition's fade (GridManagement.changePlayerLocation, the login scene, the first boot), and
 *     `getAtlasTexture` awaits the page of any frame asked for before its page is in, so nothing ever
 *     falls back to a glyph just because its page is still on its way.
 *   - entering a grid releases the GPU copies of the pages it does not use (`BaseTexture.dispose`: the
 *     image stays, Pixi uploads it again if a sprite draws from it), so GPU memory follows the grid
 *     you are on instead of growing to every sheet. Pixi's texture GC would do the same after a minute.
 *
 * The login scene (2026-11-16): a new visitor's first screen draws one fixed grid, so the build packs
 * that grid's frames onto their own `scene` sheets (scripts/build-atlas.js, manifest `scene`).
 * `enterSceneAtlas()` (LoginScene.prefetchLoginScene, before anything loads) makes `loadAtlas()` load
 * those instead of the core sheets: ~0.? of the bytes. Any frame not on them is still served from its
 * own sheet by getAtlasTexture. The game board never runs in scene mode: Begin and sign-in reload the
 * page, and a game PixiRenderer calls `leaveSceneAtlas()` at mount in case one ever does not.
 *
 * Lifecycle: PixiRenderer calls `resetAtlas()` when it destroys its Application
 * (`app.destroy(true, { texture: true })` takes the sheet BaseTextures with it), and the
 * next `getAtlasTexture` reloads. Textures are also validated on every lookup so a
 * WebGL context loss cannot hand out a dead texture.
 */
import { BaseTexture, Spritesheet, SCALE_MODES } from 'pixi.js-legacy';
import { emojiKey, looksLikeEmoji } from '../../Utils/emojiKey';

const ATLAS_DIR = '/assets/atlas';
const MANIFEST_URL = `${ATLAS_DIR}/world.json`;

let manifestPromise = null;  // Promise<manifest> for the current generation
let manifest = null;
let corePromise = null;      // Promise<Map> once every core sheet is in
let frames = null;           // Map<frameKey, Texture>: every frame of every sheet loaded so far (set once core is in)
const allFrames = new Map(); // filled as sheets arrive; `frames` points at it once core is in
const sheetLoads = new Map(); // sheet index -> Promise<void>
const sheetBases = new Map(); // sheet index -> BaseTexture
let generation = 0;          // bumped by resetAtlas() so stale loads are ignored
let webpSupport = null;      // Promise<boolean>
let keepPages = new Set();   // the pages the grid last prepared draws from
let releaseTimer = null;
let sceneMode = false;       // enterSceneAtlas(): loadAtlas() means the scene sheets, not core
const sceneKeys = new Set(); // frames that came from a scene sheet (no page needed for them)
const RELEASE_DELAY_MS = 2500;

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

function loadManifest() {
  if (!manifestPromise) {
    const thisGeneration = generation;
    manifestPromise = fetch(MANIFEST_URL, { cache: 'no-cache' }).then((response) => {
      if (!response.ok) throw new Error(`Atlas manifest not found (${response.status})`);
      return response.json();
    }).then((m) => {
      if (thisGeneration === generation) manifest = m;
      return m;
    });
  }
  return manifestPromise;
}

/** Load one sheet (once per generation) and add its frames to the map. Never rejects.
 *  `index`: a manifest.sheets index, or `scene-<j>` for manifest.scene[j]. */
function loadSheet(index) {
  if (sheetLoads.has(index)) return sheetLoads.get(index);
  const thisGeneration = generation;
  const scene = typeof index === 'string' && index.startsWith('scene-');
  const p = (async () => {
    const m = await loadManifest();
    const sheet = scene ? m.scene?.[Number(index.slice(6))] : m.sheets[index];
    if (!sheet) return;
    const useWebP = await supportsWebP();
    const [json, img] = await Promise.all([
      fetch(`${ATLAS_DIR}/${sheet.json}`).then((r) => r.json()),
      loadImage(`${ATLAS_DIR}/${useWebP && sheet.webp ? sheet.webp : sheet.png}`),
    ]);
    if (thisGeneration !== generation) return; // reset happened mid-load
    const base = BaseTexture.from(img, { scaleMode: SCALE_MODES.LINEAR });
    const spritesheet = new Spritesheet(base, json);
    await spritesheet.parse();
    if (thisGeneration !== generation) { spritesheet.destroy(true); return; }
    if (scene) {
      // a scene frame never replaces one already in from its real sheet (the same art either way)
      for (const [key, texture] of Object.entries(spritesheet.textures)) if (!allFrames.has(key)) { allFrames.set(key, texture); sceneKeys.add(key); }
      return;
    }
    sheetBases.set(index, base);
    for (const [key, texture] of Object.entries(spritesheet.textures)) allFrames.set(key, texture);
  })().catch((err) => {
    console.warn(`⚠️ [ATLAS] sheet ${index} failed to load:`, err.message);
    if (thisGeneration === generation) sheetLoads.delete(index); // a later ask may try again
  });
  sheetLoads.set(index, p);
  return p;
}

/** The login scene's atlas: from now on `loadAtlas()` loads the scene sheets instead of core. Call it
 *  before anything has loaded the atlas (once core is asked for, this does nothing). */
export function enterSceneAtlas() {
  if (!corePromise) sceneMode = true;
}

/** Back to the game's atlas (core on the next `loadAtlas()`); frames already in stay. A no-op outside scene mode. */
export function leaveSceneAtlas() {
  if (!sceneMode) return;
  sceneMode = false;
  corePromise = null;
  frames = null;
  sceneKeys.clear();
}

/** Put the core sheets in the browser cache without decoding them (Begin: the reload that follows draws from them). */
export function prefetchCoreSheets() {
  loadManifest().then(async (m) => {
    const useWebP = await supportsWebP();
    for (const s of m.sheets) if (s.core !== false) {
      fetch(`${ATLAS_DIR}/${s.json}`).catch(() => {});
      fetch(`${ATLAS_DIR}/${useWebP && s.webp ? s.webp : s.png}`).catch(() => {});
    }
  }).catch(() => {});
}

/** Load (once) the manifest and the CORE sheets (in scene mode: the scene sheets); resolves the frame map.
 *  Never rejects: callers fall back to SVG. */
export function loadAtlas() {
  if (!corePromise) {
    const thisGeneration = generation;
    const scene = sceneMode;
    corePromise = loadManifest().then(async (m) => {
      // a manifest without core flags (built before BL-24) is all core; one without scene sheets: core for the scene too
      const core = scene && m.scene?.length
        ? m.scene.map((s, j) => `scene-${j}`)
        : m.sheets.map((s, i) => (s.core === false ? -1 : i)).filter((i) => i >= 0);
      await Promise.all(core.map(loadSheet));
      if (thisGeneration === generation) frames = allFrames;
      return allFrames;
    }).catch((err) => {
      console.warn('⚠️ [ATLAS] not available, falling back to live SVG rasterisation:', err.message);
      if (thisGeneration === generation) frames = allFrames;
      return allFrames;
    });
  }
  return corePromise;
}

const usable = (texture) => !!texture && texture.valid !== false && texture.baseTexture?.valid !== false && !texture.baseTexture?.destroyed;

/**
 * Texture for `<namespace>/<filename>`, or null when the atlas has no such frame.
 * Waits for the core sheets on the first call, and for the frame's page when it is not in yet.
 */
export async function getAtlasTexture(namespace, filename) {
  if (!filename) return null;
  const key = `${namespace}/${filename}`;
  const map = frames || await loadAtlas();
  let texture = map.get(key);
  if (!texture && manifest && manifest.frames[key] !== undefined) {
    await loadSheet(manifest.frames[key]);
    texture = allFrames.get(key);
  }
  return usable(texture) ? texture : null;
}

/** Synchronous lookup for code that has already awaited loadAtlas() (or null). Core frames, or a page already in. */
export function peekAtlasTexture(namespace, filename) {
  if (!frames || !filename) return null;
  const texture = frames.get(`${namespace}/${filename}`) || null;
  return usable(texture) ? texture : null;
}

/** The atlas frame keys a resource row can draw: its file, blink frame and variants, its NPC head crop, or its emoji. */
export function frameKeysForRow(row) {
  if (!row) return [];
  const keys = [row.filename, row.blinkFile, ...String(row.artVariants || '').split(';').map((p) => p.split('=')[0].trim())]
    .filter(Boolean).map((f) => `resources/${f}`);
  if (row.category === 'npc' && row.iconFile) keys.push(`resources/${row.iconFile}`);
  if (!row.filename && looksLikeEmoji(row.symbol)) { const k = emojiKey(row.symbol); if (k) keys.push(`emoji/${k}`); }
  return keys;
}

/** The PAGE indexes the given resource / NPC types draw from (a spawner brings the NPC it spawns). Needs the manifest. */
function pagesForTypes(types, masterResources) {
  if (!manifest) return [];
  const byType = new Map((masterResources || []).map((r) => [r.type, r]));
  const want = new Set();
  const seen = new Set();
  const addType = (t) => {
    if (seen.has(t)) return;
    seen.add(t);
    const row = byType.get(t);
    if (!row) return;
    for (const k of frameKeysForRow(row)) {
      if (sceneKeys.has(k)) continue; // on a scene sheet already
      const i = manifest.frames[k]; if (i !== undefined) want.add(i);
    }
    if (row.action === 'spawn' && row.requires) addType(row.requires);
  };
  for (const t of types || []) addType(t);
  return [...want].filter((i) => manifest.sheets[i]?.core === false);
}

// what a player can place on a homestead (the build script's PLACEABLE): on their own homestead these
// pages are loaded in the background after arrival, so a thing just crafted or bought appears at once
const PLACEABLE = new Set(['crafting', 'station', 'deco', 'farmplot', 'pet', 'training', 'shop', 'trainingAndShop', 'farmhouse', 'source']);

/**
 * Make sure the pages a grid draws from are in before it is shown, and free the GPU copies of the
 * pages it does not use. `types`: resource / NPC type names on the grid. Waits at most `timeoutMs`
 * (a slow network must not hold the transition forever: anything still missing is awaited by
 * getAtlasTexture as it is drawn). `homestead: true` also loads, in the background and kept, the
 * pages of everything placeable. Never rejects.
 */
export async function prepareAtlasForGrid(types, masterResources, { timeoutMs = 4000, homestead = false } = {}) {
  try {
    await loadAtlas();
    if (!manifest) return;
    const need = pagesForTypes(types, masterResources);
    const loads = Promise.all(need.map(loadSheet));
    await Promise.race([loads, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
    const keep = new Set(need);
    if (homestead) {
      const placeable = (masterResources || []).filter((r) => PLACEABLE.has(r.category)).map((r) => r.type);
      const extra = pagesForTypes(placeable, masterResources);
      for (const i of extra) keep.add(i);
      loads.then(() => extra.reduce((p, i) => p.then(() => loadSheet(i)), Promise.resolve())); // one at a time, after the grid's own
    }
    // the grid being left may still be on screen (fading out): release a moment later, keeping
    // whatever the LATEST grid asked for
    keepPages = keep;
    clearTimeout(releaseTimer);
    releaseTimer = setTimeout(() => releasePagesExcept(keepPages), RELEASE_DELAY_MS);
  } catch (err) {
    console.warn('⚠️ [ATLAS] prepareAtlasForGrid:', err.message);
  }
}

/** Load (never release) the pages a grid about to be entered draws from: the edge prefetch (GridPrefetch). */
export async function warmAtlasForGrid(types, masterResources) {
  try {
    await loadAtlas();
    for (const i of pagesForTypes(types, masterResources)) await loadSheet(i); // one at a time: the current grid comes first
  } catch (err) { /* a warm-up only */ }
}

/** The type names on a grid: its resources and its NPCs (arrays or a { id: npc } map). */
export function gridTypes(resources, npcs) {
  const types = new Set();
  for (const r of resources || []) if (r?.type) types.add(r.type);
  const list = Array.isArray(npcs) ? npcs : Object.values(npcs || {});
  for (const n of list) if (n?.type) types.add(n.type);
  return types;
}

/** Free the GPU copy of every loaded page not in `keep` (the image stays; Pixi re-uploads on the next draw). */
function releasePagesExcept(keep) {
  if (!manifest) return;
  for (const [i, base] of sheetBases) {
    if (manifest.sheets[i]?.core !== false || keep.has(i) || base.destroyed) continue;
    base.dispose();
  }
}

/** Forget the loaded sheets (their BaseTextures die with the Application); the next lookup reloads. */
export function resetAtlas() {
  generation += 1;
  clearTimeout(releaseTimer);
  keepPages = new Set();
  manifestPromise = null;
  manifest = null;
  corePromise = null;
  frames = null;
  allFrames.clear();
  sheetLoads.clear();
  sheetBases.clear();
  sceneKeys.clear();
}

export function isAtlasLoaded() {
  return frames !== null;
}

// dev hook: which sheets are loaded and how much GPU memory they would take (4 bytes a pixel)
if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
  window.__atlasStats = () => {
    if (!manifest) return null;
    const loaded = [...sheetBases.keys()].sort((a, b) => a - b);
    const mb = (i) => ((manifest.sheets[i].w || manifest.sheetSize) * (manifest.sheets[i].h || manifest.sheetSize) * 4) / 1e6;
    const onGpu = loaded.filter((i) => sheetBases.get(i)?._glTextures && Object.keys(sheetBases.get(i)._glTextures).length);
    return {
      loaded: loaded.map((i) => (manifest.sheets[i].core === false ? `page ${i}` : `core ${i}`)),
      loadedMB: Math.round(loaded.reduce((t, i) => t + mb(i), 0)),
      onGpuMB: Math.round(onGpu.reduce((t, i) => t + mb(i), 0)),
      allMB: Math.round(manifest.sheets.reduce((t, s, i) => t + mb(i), 0)),
    };
  };
}
