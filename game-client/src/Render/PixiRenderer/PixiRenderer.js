import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { Application, Container, Graphics, Text, Sprite, Texture } from 'pixi.js-legacy';
import { getResourceOverlayStatus, getNPCOverlayStatus, OVERLAY_SVG_MAPPING, OVERLAY_EMOJI_MAPPING } from '../../Utils/ResourceOverlayUtils';
import { handleNPCClickShared } from '../../GameFeatures/NPCs/NPCInteractionUtils';
import { generateResourceTooltip, generateNPCTooltip } from '../RenderDynamicElements';
import { calculateTooltipPosition } from '../../Utils/TooltipUtils';
import { getDerivedRange } from '../../Utils/worldHelpers';
import PixiRendererVFX from './PixiRendererVFX';
import PixiRendererPCs from './PixiRendererPCs';
import PixiRendererCursor from './PixiRendererCursor';
import PixiRendererSpeech from './PixiRendererSpeech';
import PixiRendererNPCOverlays from './PixiRendererNPCOverlays';
import PixiRendererSettlementGrids, { clearGridSnapshotCache } from './PixiRendererSettlementGrids';
import PixiRendererFrontierSettlements from './PixiRendererFrontierSettlements';
import PixiRendererDoinker from './PixiRendererDoinker';
import PixiCamera from './PixiCamera';
import { generateTileTexture, clearTileTextureCache } from './PixiRendererTileTextures';
import { loadAtlas, getAtlasTexture, resetAtlas } from './AtlasTextures';
import { emojiKey } from '../../Utils/emojiKey';
import {
  TILES_PER_GRID,
  TILES_PER_SETTLEMENT,
  WORLD_PADDING_SETTLEMENTS,
  SETTLEMENTS_PER_FRONTIER,
} from './UnifiedCamera';
import { isResourceAnimating, getAnimationVersion, registerForceRender } from '../../VFX/VFX';
import ambientVFXManager from '../../VFX/AmbientVFXManager';
// Note: pixi-viewport v6 requires PixiJS v8. For v7, we'd need pixi-viewport v5.
// For Phase 1, we'll skip the viewport and render directly to stage.
// Smooth zooming can be added in a later phase.

/**
 * SVG Texture Cache for PixiJS
 * Loads SVG files, renders them to canvas, and creates PixiJS textures
 * Note: Cache is cleared when PixiRenderer unmounts to avoid stale texture references
 */
const svgTextureCache = new Map();
const svgLoadingPromises = new Map();

// Global reference to the current PixiJS renderer for texture creation validation
// This ensures textures are only created when a valid WebGL context exists
let activePixiRenderer = null;

// Global FPS cap state and toggle function for debug panel
// Note: PixiJS has a bug where exact values like 30 or 60 don't work reliably
// on high refresh rate displays. Using slightly lower values (29.97, 59.97) works around this.
// See: https://github.com/pixijs/pixijs/issues/5741
let currentMaxFPS = 30;

const getActualMaxFPS = (targetFPS) => {
  // Use slightly lower value to work around PixiJS maxFPS bug
  return targetFPS - 0.03;
};

export const toggleFPSCap = () => {
  currentMaxFPS = currentMaxFPS === 30 ? 60 : 30;
  if (activePixiRenderer?.ticker) {
    activePixiRenderer.ticker.maxFPS = getActualMaxFPS(currentMaxFPS);
  }
  return currentMaxFPS;
};

export const getCurrentFPSCap = () => currentMaxFPS;

// FPS sampling for smooth average (ticker.FPS is instantaneous and fluctuates)
const fpsSamples = [];
const FPS_SAMPLE_COUNT = 10;

// Get smoothed average FPS from PixiJS ticker (for debug panel)
export const getPixiActualFPS = () => {
  if (activePixiRenderer?.ticker) {
    // Add current sample
    fpsSamples.push(activePixiRenderer.ticker.FPS);
    // Keep only recent samples
    if (fpsSamples.length > FPS_SAMPLE_COUNT) {
      fpsSamples.shift();
    }
    // Return average
    const avg = fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length;
    return Math.round(avg);
  }
  return 0;
};

/**
 * Clear all cached textures (called on unmount or WebGL context loss)
 * Properly destroys PixiJS textures before clearing the cache
 */
const clearTextureCache = () => {
  // Destroy each cached texture to release GPU resources
  for (const texture of svgTextureCache.values()) {
    if (texture && texture.destroy) {
      try {
        texture.destroy(true); // true = destroy base texture too
      } catch (e) {
        // Texture may already be destroyed or invalid
      }
    }
  }
  svgTextureCache.clear();
  svgLoadingPromises.clear();
};

// Base texture size for all SVGs - textures are rendered at this fixed size
// and then scaled via sprite.width/height. This ensures zoom changes don't
// invalidate the texture cache.
const BASE_TEXTURE_SIZE = 128;
const OVERLAY_TEXTURE_SIZE = 64;  // Overlays can be smaller since they're always small on screen

/**
 * Texture for a resource / NPC / overlay SVG.
 *
 * Atlas first (scripts/build-atlas.js pre-rasterises every SVG into a few sheets,
 * loaded once by AtlasTextures.js), then the legacy path: fetch the SVG, rasterise it
 * on a canvas, upload one texture per file. The legacy path only runs for art that has
 * not been through `npm run build:atlas` yet.
 * @param {string} filename - SVG filename (e.g., "tree.svg")
 * @param {boolean} isOverlay - Whether this is an overlay SVG
 * @returns {Promise<Texture|null>} PixiJS texture or null if failed
 */
const loadSVGTexture = async (filename, isOverlay = false) => {
  const atlasTexture = await getAtlasTexture(isOverlay ? 'overlays' : 'resources', filename);
  if (atlasTexture) return atlasTexture;
  return loadSVGTextureLegacy(filename, isOverlay);
};

const loadSVGTextureLegacy = async (filename, isOverlay = false) => {
  // Cache key is now just the filename - size is always fixed
  const cacheKey = `${isOverlay ? 'overlay-' : ''}${filename}`;

  // Return cached texture if available AND still valid
  if (svgTextureCache.has(cacheKey)) {
    const cachedTexture = svgTextureCache.get(cacheKey);
    // Check if texture is still valid (not destroyed by WebGL context loss)
    if (cachedTexture && cachedTexture.valid !== false && cachedTexture.baseTexture?.valid !== false) {
      return cachedTexture;
    }
    // Texture is invalid (WebGL context lost), remove from cache and reload
    svgTextureCache.delete(cacheKey);
  }

  // Prevent duplicate loading
  if (svgLoadingPromises.has(cacheKey)) {
    return svgLoadingPromises.get(cacheKey);
  }

  const loadPromise = (async () => {
    try {
      const directory = isOverlay ? '/assets/overlays/' : '/assets/resources/';
      const response = await fetch(`${directory}${filename}`);

      if (!response.ok) {
        console.warn(`SVG not found: ${filename}`);
        return null;
      }

      let svgText = await response.text();

      // Create canvas and render SVG at fixed base size
      const baseSize = isOverlay ? OVERLAY_TEXTURE_SIZE : BASE_TEXTURE_SIZE;
      const canvas = document.createElement('canvas');
      const devicePixelRatio = window.devicePixelRatio || 1;
      const renderSize = Math.ceil(baseSize * devicePixelRatio);
      canvas.width = renderSize;
      canvas.height = renderSize;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('Failed to get 2d context for SVG rendering');
        return null;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Modify SVG to render at target resolution (prevents blurry upscaling)
      // This ensures the browser rasterizes the SVG at the desired size, not its intrinsic size
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
      const svgElement = svgDoc.documentElement;
      if (svgElement && svgElement.tagName === 'svg') {
        svgElement.setAttribute('width', renderSize);
        svgElement.setAttribute('height', renderSize);
        svgText = new XMLSerializer().serializeToString(svgDoc);
      }

      // Convert SVG to image
      const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      const texture = await new Promise((resolve) => {
        const img = new Image();

        const loadTimeout = setTimeout(() => {
          console.warn(`SVG load timed out: ${filename}`);
          URL.revokeObjectURL(url);
          resolve(null);
        }, 5000);

        img.onload = () => {
          clearTimeout(loadTimeout);
          try {
            // Validate that WebGL context is still valid before creating texture
            if (!activePixiRenderer || !activePixiRenderer.renderer) {
              console.warn(`⚠️ [SVG] Skipping texture creation - no valid renderer: ${filename}`);
              URL.revokeObjectURL(url);
              resolve(null);
              return;
            }

            ctx.drawImage(img, 0, 0, renderSize, renderSize);
            // Create PixiJS texture from canvas
            // v7: Use Texture.from() with canvas
            // Set resolution on baseTexture so PixiJS knows the texture is rendered at high DPI
            // This prevents blurry sprites when scaling down on high-DPI displays
            const pixiTexture = Texture.from(canvas);
            if (pixiTexture.baseTexture) {
              pixiTexture.baseTexture.resolution = devicePixelRatio;
              pixiTexture.baseTexture.update();
            }
            resolve(pixiTexture);
          } catch (error) {
            console.error('Error creating texture from SVG:', error);
            resolve(null);
          } finally {
            URL.revokeObjectURL(url);
          }
        };

        img.onerror = () => {
          clearTimeout(loadTimeout);
          console.warn(`Failed to load SVG image: ${filename}`);
          URL.revokeObjectURL(url);
          resolve(null);
        };

        img.src = url;
      });

      if (texture) {
        svgTextureCache.set(cacheKey, texture);
      }

      return texture;
    } catch (error) {
      console.error(`Error loading SVG ${filename}:`, error);
      return null;
    } finally {
      svgLoadingPromises.delete(cacheKey);
    }
  })();

  svgLoadingPromises.set(cacheKey, loadPromise);
  return loadPromise;
};

/**
 * Atlas texture for an emoji symbol (scripts/build-atlas.js renders every world symbol
 * from Twemoji), or null when the atlas has no frame for it (then the caller draws Text).
 */
const loadEmojiTexture = async (symbol) => {
  const key = emojiKey(symbol);
  return key ? getAtlasTexture('emoji', key) : null;
};

// An emoji glyph at font-size f is roughly f wide; the Twemoji frame fills its box, so
// scale the sprite to match what the Text fallback would have drawn.
const EMOJI_SPRITE_SCALE = 1.0;

/**
 * Get the SVG filename for a resource type from masterResources
 */
const getResourceFilename = (resourceType, masterResources) => {
  if (!masterResources) return null;
  const masterResource = masterResources.find(r => r.type === resourceType);
  return masterResource?.filename || null;
};

/**
 * Get the SVG filename for an NPC type from masterResources
 * NPCs are stored in masterResources with category: 'npc'
 */
const getNPCFilename = (npcType, masterResources) => {
  if (!masterResources || !npcType) return null;
  const masterResource = masterResources.find(r => r.type === npcType && r.category === 'npc');
  return masterResource?.filename || null;
};

/**
 * PixiJS-based renderer for the game world.
 * Provides WebGL-accelerated rendering with Canvas 2D fallback.
 *
 * This is Phase 1 - Foundation only. It renders a basic grid to verify
 * the PixiJS setup is working. Full tile/resource/NPC rendering will
 * be added in subsequent phases.
 */
const PixiRenderer = ({
  grid,
  tileTypes,
  resources,
  npcs,
  pcs,
  currentPlayer,
  TILE_SIZE,              // Now constant (30) - base rendering size
  zoomScale = 1,          // GPU transform scale (activeTileSize / TILE_SIZE)
  zoomLevel,
  handleTileClick,
  masterResources,
  strings,
  // Additional props for future phases
  craftingStatus,
  tradingStatus,
  badgeState,
  electionPhase,
  globalTuning,
  hoverTooltip,
  setHoverTooltip,
  onNPCClick,
  // Props for NPC interactions (passed from App.js via RenderDynamicElements pattern)
  setInventory,
  setBackpack,
  setResources,
  setCurrentPlayer,
  masterSkills,
  masterTrophies,
  setModalContent,
  setIsModalOpen,
  updateStatus,
  openPanel,
  setActiveStation,
  gridId,
  timers,
  playersInGrid,
  isDeveloper = false,
  cursorMode,             // Cursor placement mode { type, size, emoji, ... } or null
  // Settlement zoom props
  settlementData,         // Array of grid metadata for the 8×8 settlement
  visitedGridTiles,       // Map of gridCoord → base64 encoded tile data
  settlementPlayers,      // Map of playerId → player data for homesteads
  currentGridPosition,    // { row, col } of current grid within settlement (0-7, 0-7)
  isVisuallyInSettlement = false, // True when visually showing settlement (persists through zoom-out animation)
  onSettlementGridClick,  // Callback when clicking a different grid at settlement zoom
  // Frontier zoom props
  frontierData,           // 8×8 array of settlement metadata for the frontier
  frontierSettlementGrids, // Map of settlementId → grid data
  currentSettlementPosition, // { row, col } of current settlement within frontier (0-7, 0-7)
  isVisuallyInFrontier = false, // True when visually showing frontier
  onFrontierSettlementClick, // Callback when clicking a different settlement at frontier zoom
  onFrontierGridClick,       // Callback when clicking a grid in a different settlement at frontier zoom during relocation
  isZoomAnimating = false, // True during zoom animation - skip CSS transform updates to avoid conflicts
  isRelocating = false, // True when player is in homestead relocation mode
  // FTUE Doinker props
  doinkerTargets,         // Resource/NPC type(s) to point doinker at
  doinkerType,            // 'resource' or 'button'
  doinkerVisible = false, // Whether doinker should be visible
  // Touch / tap-to-walk
  onWalkTo,               // (row, col) => void: walk to a tile (empty tile, or next to an out-of-range target)
  onPinchZoom,            // ('in' | 'out') => void: a pinch gesture crossed a zoom step
}) => {
  const containerRef = useRef(null);   // the canvas host: fills the board, viewport-sized
  const overlayRef = useRef(null);     // DOM overlay mirrored to the Pixi world by PixiCamera
  const appRef = useRef(null);
  const worldContainerRef = useRef(null);  // Parent container for all game layers - zoom applied here
  const tileContainerRef = useRef(null);
  const resourceContainerRef = useRef(null);
  const npcContainerRef = useRef(null);
  // pcContainerRef removed - now managed by PixiRendererPCs component
  const overlayContainerRef = useRef(null);

  // Use isVisuallyInSettlement/isVisuallyInFrontier for rendering (keeps grids visible during zoom-out animation)
  // This ensures smooth transitions when exiting settlement/frontier zoom
  const isSettlementZoom = isVisuallyInSettlement;
  const isFrontierZoom = isVisuallyInFrontier;

  // Note: isVisuallyInFrontier/isVisuallyInSettlement track visual state during zoom animations
  // They remain true during zoom-out to keep content visible until animation completes

  // Note: isZoomAnimating controls when settlement/frontier grids render
  // When true, grids are hidden to prevent flash at wrong scale during animation
  // Grid constants - single grid is ALWAYS TILES_PER_GRID×TILES_PER_GRID tiles (64×64)
  // Settlement zoom renders 8×8 grids, Frontier zoom renders 8×8 settlements
  // Uses TILES_PER_GRID from UnifiedCamera.js for consistency
  const GRID_TILES = TILES_PER_GRID;

  // Hovered tile for cursor highlight (tracked from mouse move)
  const [hoveredTile, setHoveredTile] = useState(null);

  // Throttle tracking for mouse move handler (performance optimization)
  const lastMouseMoveTimeRef = useRef(0);
  const MOUSE_MOVE_THROTTLE_MS = 50; // Limit to ~20 updates per second

  // Touch gestures: long-press (tooltip) and pinch (zoom step). Pointer events feed these;
  // the browser's synthesized click after a tap still goes through handleClick, which the
  // gesture code suppresses when the touch was a long-press or a pinch.
  const touchPointersRef = useRef(new Map());   // pointerId -> { x, y }
  const longPressTimerRef = useRef(null);
  const longPressFiredRef = useRef(false);
  const suppressClickRef = useRef(false);
  const pinchBaselineRef = useRef(null);         // finger distance at the last zoom step
  const pinchedRef = useRef(false);
  const dragPannedRef = useRef(false);           // a one-finger drag panned the camera (not a tap)
  const tooltipClearTimerRef = useRef(null);
  const LONG_PRESS_MS = 450;
  const LONG_PRESS_MOVE_TOLERANCE_PX = 12;
  const PINCH_STEP_RATIO = 1.25;

  // Animation version tracking - triggers re-render when grow animations complete
  // This works with VFX.js to hide resources during their grow animation
  const [animationVersion, setAnimationVersion] = useState(() => getAnimationVersion());

  // Register callback for VFX to trigger re-renders when animations complete
  useEffect(() => {
    const forceRender = () => {
      setAnimationVersion(getAnimationVersion());
    };
    registerForceRender(forceRender);
    return () => registerForceRender(null);
  }, []);

  // Render version tracking to prevent stale async renders
  // When TILE_SIZE changes, we increment these versions to invalidate in-flight renders
  const resourceRenderVersionRef = useRef(0);
  const overlayRenderVersionRef = useRef(0);

  // Object pool for overlay sprites to prevent GPU memory exhaustion
  // Each pool item: { sprite: Sprite, text: Text, active: boolean }
  const overlayPoolRef = useRef([]);

  // NPC Animation system for smooth movement
  // Uses direct display object position updates instead of React state
  // Animation data: { startPos, currentPos, targetPos, startTime, duration }
  const npcAnimations = useRef({});
  // Map of NPC id -> display object (Sprite for SVG, Text for emoji) for position updates
  const npcDisplayObjects = useRef({});
  // Map of NPC id -> display type ('sprite' or 'text') to track what type of display object is used
  const npcDisplayTypes = useRef({});
  // Ref to track if NPC animation ticker is currently running (for on-demand ticker pattern)
  const npcAnimationTickerRef = useRef(null);
  // Render version tracking for NPC async renders
  const npcRenderVersionRef = useRef(0);

  // Calculate crafting and trading status for dynamic overlays (same as RenderDynamicElements)
  // NOTE: Date.now() is calculated INSIDE useMemo to avoid dependency on every render.
  // Status recalculates only when resources change, not continuously.
  const computedCraftingStatus = useMemo(() => {
    if (!resources) return { ready: [], searching: [], hungry: [], inProgress: [] };

    const now = Date.now(); // Calculate inside useMemo, not as external dependency

    return resources.reduce((acc, res) => {
      if (res.category === 'crafting' || res.category === 'farmhouse') {
        const key = `${res.x}-${res.y}`;
        // Check slots array for multi-slot crafting stations
        if (res.slots && res.slots.length > 0) {
          const hasReady = res.slots.some(slot => slot?.craftedItem && slot?.craftEnd && slot.craftEnd < now);
          const hasInProgress = res.slots.some(slot => slot?.craftEnd && slot.craftEnd >= now);
          if (hasReady) {
            acc.ready.push(key);
          } else if (hasInProgress) {
            acc.inProgress.push(key);
          }
        } else if (res.craftEnd) {
          // Legacy single-slot fallback
          if (res.craftEnd < now) {
            acc.ready.push(key);
          } else {
            acc.inProgress.push(key);
          }
        }
      } else if (res.category === 'farmplot' && res.isSearching) {
        const key = `${res.x}-${res.y}`;
        acc.searching.push(key);
        // Note: farmplots do NOT get added to ready array - they transition directly to doobers
        // when growEnd is reached, so they don't need the checkmark overlay
      } else if (res.category === 'pet') {
        const key = `${res.x}-${res.y}`;
        if (res.craftEnd && res.craftedItem) {
          if (res.craftEnd < now) {
            acc.ready.push(key); // Pet has a reward ready
          } else {
            acc.inProgress.push(key); // Pet is feeding
          }
        }
      }
      return acc;
    }, { ready: [], searching: [], hungry: [], inProgress: [] });
  }, [resources]); // Removed currentTime - now calculated inside

  // Check for completed trades at Trading Post
  const computedTradingStatus = useMemo(() => {
    if (!resources || !currentPlayer?.tradeStall) return { completed: [] };

    const now = Date.now(); // Calculate inside useMemo

    return resources.reduce((acc, res) => {
      if (res.type === 'Trading Post' && currentPlayer.tradeStall) {
        const hasCompletedTrades = currentPlayer.tradeStall.some(trade =>
          trade && (
            (trade.sellTime && new Date(trade.sellTime) < now) ||
            (trade.boughtBy !== null && trade.boughtBy !== undefined)
          )
        );
        if (hasCompletedTrades) {
          const key = `${res.x}-${res.y}`;
          acc.completed.push(key);
        }
      }
      return acc;
    }, { completed: [] });
  }, [resources, currentPlayer?.tradeStall]); // Removed currentTime

  // NPC animation duration in milliseconds
  // 2500ms allows smooth continuous movement between tiles
  // (animation completes just as the next movement tick begins)
  const NPC_ANIMATION_DURATION = 2500;

  // Get current render position for NPC (with animation interpolation)
  const getNPCRenderPosition = useCallback((npc) => {
    const animation = npcAnimations.current[npc.id];
    if (animation) {
      return animation.currentPos;
    }
    return npc.position || { x: npc.x, y: npc.y };
  }, []);

  // Note: PC render position is now handled by PixiRendererPCs component

  // Initialize PixiJS Application
  useEffect(() => {
    if (!containerRef.current || appRef.current) return;

    const initPixi = () => {
      // Clear any stale texture caches from previous instances
      // This is critical for recovering from WebGL context loss
      clearTextureCache();
      clearTileTextureCache();
      clearGridSnapshotCache();

      // The canvas is the size of the visible board (PixiCamera keeps it in sync on resize).
      // It used to be the whole 64x64 grid at full resolution: 2,880 CSS px square, which is a
      // 285 MB drawing buffer on a 3x phone (docs/audits/client-review-2026-10-03.md §2.4).
      const worldWidth = Math.max(1, containerRef.current.clientWidth);
      const worldHeight = Math.max(1, containerRef.current.clientHeight);

      // Create PixiJS Application with legacy support (WebGL with Canvas fallback)
      // pixi.js-legacy v7 uses constructor pattern, not async init()
      // Using preferWebGLVersion: 1 for better stability (WebGL 1 is more widely supported)
      let app;
      try {
        app = new Application({
          width: worldWidth,
          height: worldHeight,
          backgroundAlpha: 0, // beyond the grid edge the board's grass (.homestead background) shows through
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
          antialias: true,
          preferWebGLVersion: 1, // Use WebGL 1 for better stability
          powerPreference: 'default', // Let browser choose GPU
          // Legacy mode automatically falls back to Canvas 2D if WebGL unavailable
        });
      } catch (error) {
        console.error('❌ Failed to create PixiJS Application:', error);
        return;
      }

      // Store app reference
      appRef.current = app;

      // Set global reference for texture creation validation
      // This ensures loadSVGTexture can check if the renderer is still valid
      activePixiRenderer = app;

      // Set default FPS cap to 30 for power efficiency
      // This reduces GPU/CPU usage significantly without noticeable impact for casual games
      app.ticker.maxFPS = getActualMaxFPS(currentMaxFPS);

      // Add canvas to DOM (v7 uses app.view, not app.canvas)
      containerRef.current.appendChild(app.view);

      // Create world container - all game layers are children of this
      // Zoom is applied via world container scale transform (GPU-accelerated)
      // This prevents full re-renders when zoom changes
      const worldContainer = new Container();
      worldContainer.name = 'world';
      app.stage.addChild(worldContainer);
      worldContainerRef.current = worldContainer;

      // Create layer containers (z-order from bottom to top)
      // All layers are children of worldContainer, not app.stage directly
      // v7 uses 'name' property, not 'label'
      const tileContainer = new Container();
      tileContainer.name = 'tiles';
      worldContainer.addChild(tileContainer);
      tileContainerRef.current = tileContainer;

      const resourceContainer = new Container();
      resourceContainer.name = 'resources';
      worldContainer.addChild(resourceContainer);
      resourceContainerRef.current = resourceContainer;

      // Note: VFX container (for range indicators, etc.) is created by PixiRendererVFX component

      const npcContainer = new Container();
      npcContainer.name = 'npcs';
      worldContainer.addChild(npcContainer);
      npcContainerRef.current = npcContainer;

      // Note: PC container is created by PixiRendererPCs component

      const overlayContainer = new Container();
      overlayContainer.name = 'overlays';
      worldContainer.addChild(overlayContainer);
      overlayContainerRef.current = overlayContainer;

      // The camera owns worldContainer's position/scale from here on (PixiCamera.js)
      PixiCamera.attach({
        app,
        worldContainer,
        hostElement: containerRef.current,
        overlayElement: overlayRef.current,
        baseTileSize: TILE_SIZE,
      });

      // Start the sprite-sheet download now so it overlaps the grid bundle fetch
      loadAtlas();

      // Wire up AmbientVFXManager with PixiJS app and world container
      // Pass TILE_SIZE as the base tile size - this is the constant rendering size (e.g., 40)
      // that doesn't change with zoom, ensuring ambient effects render at correct world coordinates
      ambientVFXManager.setPixiApp(app);
      ambientVFXManager.setWorldContainer(worldContainer, TILE_SIZE);

      // v7: RENDERER_TYPE.WEBGL = 1, RENDERER_TYPE.CANVAS = 2
      // PixiJS initialized with WebGL or Canvas fallback renderer

      // Handle WebGL context loss - force app refresh for reliable recovery
      const canvas = app.view;
      const handleContextLost = (event) => {
        console.warn('⚠️ WebGL context lost! Forcing app refresh for reliable recovery...');
        event.preventDefault(); // Prevent default handling

        // Stop the render loop immediately to prevent crashes
        if (app.ticker) {
          app.ticker.stop();
        }

        // Force a full page reload after a brief delay
        // This is more reliable than trying to restore WebGL context
        setTimeout(() => {
          console.log('🔄 Reloading page to recover from WebGL context loss...');
          window.location.reload();
        }, 500);
      };

      const handleContextRestored = () => {
        // This handler is kept for completeness but the page will typically
        // reload before context restoration can complete
        console.log('✅ WebGL context restored (page reload may still occur)');
      };

      canvas.addEventListener('webglcontextlost', handleContextLost);
      canvas.addEventListener('webglcontextrestored', handleContextRestored);

      // Store handlers for cleanup
      app._contextLostHandler = handleContextLost;
      app._contextRestoredHandler = handleContextRestored;
    };

    initPixi();

    // Cleanup on unmount
    return () => {
      // Clear global renderer reference FIRST to prevent texture creation during cleanup
      activePixiRenderer = null;
      PixiCamera.detach();

      if (appRef.current) {
        // Remove context loss handlers
        const canvas = appRef.current.view;
        if (appRef.current._contextLostHandler) {
          canvas.removeEventListener('webglcontextlost', appRef.current._contextLostHandler);
        }
        if (appRef.current._contextRestoredHandler) {
          canvas.removeEventListener('webglcontextrestored', appRef.current._contextRestoredHandler);
        }
        appRef.current.destroy(true, { children: true, texture: true });
        appRef.current = null;
      }
      // Clear overlay pool to release GPU resources
      overlayPoolRef.current = [];
      // Clear texture caches to prevent stale texture references on remount
      clearTextureCache();
      clearTileTextureCache();
      resetAtlas(); // the sheets' BaseTextures died with the Application; next lookup reloads them
    };
  }, []); // Only run once on mount

  // PERFORMANCE: Pause PixiJS ticker when tab is hidden
  // This provides 100% CPU reduction when the tab is not visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!appRef.current?.ticker) return;

      if (document.hidden) {
        // Tab is hidden - stop the ticker to save CPU
        appRef.current.ticker.stop();
      } else {
        // Tab is visible - resume the ticker
        appRef.current.ticker.start();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Zoom is worldContainer.scale, animated by PixiCamera.animateZoom (App.js drives it).
  // The overlay DOM (previews, floating text, VFX) gets the same transform from the camera.

  // Trackpad / mouse wheel pans the view (the old scroll container did this for free).
  // Native listener because React registers wheel as passive and preventDefault would be ignored.
  useEffect(() => {
    const host = containerRef.current;
    if (!host) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? host.clientHeight : 1;
      PixiCamera.panBy(-event.deltaX * unit, -event.deltaY * unit);
    };
    host.addEventListener('wheel', onWheel, { passive: false });
    return () => host.removeEventListener('wheel', onWheel);
  }, []);

  // Grid offset is always 0 - the current grid renders at origin (0,0)
  // Settlement zoom renders NEIGHBORING grids around it via PixiRendererSettlementGrids
  // Those neighboring grids are positioned relative to the current grid
  const gridOffsetX = 0;
  const gridOffsetY = 0;

  // Render tiles with textured sprites (includes procedural details and corner rounding)
  useEffect(() => {
    if (!tileContainerRef.current || !grid || !tileTypes) return;

    const tileContainer = tileContainerRef.current;

    // Clear existing tiles
    tileContainer.removeChildren();

    const rows = grid.length;
    const cols = grid[0]?.length || 0;

    // Render each tile as a sprite with pre-rendered texture
    // At settlement zoom, tiles are offset to their position within the 8×8 settlement world
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const tileType = tileTypes[row]?.[col] || 'g';

        // Generate texture with details and corner rounding
        const texture = generateTileTexture(tileType, row, col, tileTypes);

        // Skip if texture creation failed (e.g., WebGL context issue)
        if (!texture) continue;

        // Create sprite and position it
        const sprite = new Sprite(texture);
        sprite.x = col * TILE_SIZE;
        sprite.y = row * TILE_SIZE;
        sprite.width = TILE_SIZE;
        sprite.height = TILE_SIZE;

        tileContainer.addChild(sprite);
      }
    }
  }, [grid, tileTypes, TILE_SIZE]); // Re-render when grid, tileTypes, or TILE_SIZE changes

  // Render resources (Phase 2 - SVG with emoji fallback)
  useEffect(() => {
    if (!resourceContainerRef.current || !resources) return;

    const resourceContainer = resourceContainerRef.current;

    // Increment render version to invalidate any in-flight async renders
    resourceRenderVersionRef.current += 1;
    const thisRenderVersion = resourceRenderVersionRef.current;

    // Clear existing resources immediately
    resourceContainer.removeChildren();

    // Parallel texture loading - load all SVG textures simultaneously
    const renderResources = async () => {
      // Phase 1: Kick off all texture loads in parallel
      const loadPromises = resources.map(async (resource) => {
        const filename = getResourceFilename(resource.type, masterResources);
        const texture = filename ? await loadSVGTexture(filename) : null;
        if (texture) return { resource, texture, emojiTexture: null };
        const emojiTexture = resource.symbol ? await loadEmojiTexture(resource.symbol) : null;
        return { resource, texture: null, emojiTexture };
      });

      // Phase 2: Wait for all textures to load
      const loadedResources = await Promise.all(loadPromises);

      // Check if render is still valid after parallel load (cancelled if new render started)
      if (thisRenderVersion !== resourceRenderVersionRef.current) {
        return;
      }
      if (!resourceContainerRef.current) return;

      // Phase 3: Render all resources synchronously (no more awaits)
      let svgCount = 0;
      let emojiCount = 0;
      let skippedAnimating = 0;

      for (const { resource, texture, emojiTexture } of loadedResources) {
        // Skip resources that are currently animating (VFX grow effect handles their visual)
        const isAnimating = isResourceAnimating(resource.x, resource.y);
        if (isAnimating) {
          skippedAnimating++;
          continue;
        }

        const tileSpan = resource.size || 1;
        const size = TILE_SIZE * tileSpan;

        // Position calculation (multi-tile resources grow UPWARD from anchor)
        const x = resource.x * TILE_SIZE;
        const visualY = (tileSpan > 1) ? (resource.y - tileSpan + 1) * TILE_SIZE : resource.y * TILE_SIZE;

        // Use SVG texture if available
        if (texture && texture.valid !== false) {
          const sprite = new Sprite(texture);
          // Scale sprite to desired size (texture is fixed at BASE_TEXTURE_SIZE)
          sprite.width = size;
          sprite.height = size;
          sprite.x = x;
          sprite.y = visualY;
          resourceContainer.addChild(sprite);
          svgCount++;
          continue;
        }

        // Emoji fallback
        if (!resource.symbol) continue;

        // Calculate font size based on resource size (matching RenderResourcesCanvas logic)
        let fontSize;
        if (tileSpan > 1) {
          if (resource.action === 'wall') {
            fontSize = TILE_SIZE * 1.2 * tileSpan;  // Multi-tile walls
          } else {
            // Scale emoji font size more aggressively for larger multi-tile resources
            const baseScale = tileSpan <= 2 ? 0.8 : (tileSpan === 3 ? 1.0 : 1.2);
            fontSize = TILE_SIZE * baseScale * tileSpan;
          }
        } else {
          fontSize = resource.action === 'wall'
            ? TILE_SIZE * 1.1  // Single-tile walls
            : TILE_SIZE * 0.7; // Other single-tile resources
        }

        if (emojiTexture && emojiTexture.valid !== false) {
          // Atlas emoji (same art on every platform, batches with the other sprites)
          const sprite = new Sprite(emojiTexture);
          sprite.anchor.set(0.5, 0.5);
          sprite.width = fontSize * EMOJI_SPRITE_SCALE;
          sprite.height = fontSize * EMOJI_SPRITE_SCALE;
          sprite.x = x + size / 2;
          sprite.y = visualY + size / 2;
          resourceContainer.addChild(sprite);
          svgCount++;
          continue;
        }

        const text = new Text(resource.symbol, {
          fontSize: fontSize,
          fontFamily: 'sans-serif',
        });
        text.resolution = 2; // High resolution for crisp rendering

        text.anchor.set(0.5, 0.5);
        text.x = x + size / 2;
        text.y = visualY + size / 2;

        resourceContainer.addChild(text);
        emojiCount++;
      }

      // Resources rendered: svgCount SVG sprites + emojiCount emoji fallbacks
      // skippedAnimating resources are hidden while VFX grow animation plays
    };

    renderResources();
  }, [resources, masterResources, animationVersion]); // animationVersion triggers re-render when grow animations complete

  // NPC animation ticker - ON-DEMAND pattern for performance
  // The ticker only runs when there are active animations, then removes itself
  // This prevents continuous 60fps polling when NPCs are idle
  // IMPORTANT: Defined before the NPC rendering useEffect that uses it
  const startNPCAnimationTicker = useCallback(() => {
    // Already running? Don't add another callback
    if (npcAnimationTickerRef.current) return;
    if (!appRef.current?.ticker) return;

    const ticker = appRef.current.ticker;

    const onTick = () => {
      const now = Date.now();
      let hasActiveAnimations = false;

      // Update all animation positions
      for (const npcId of Object.keys(npcAnimations.current)) {
        const animation = npcAnimations.current[npcId];
        if (!animation || animation.duration === 0) continue;

        const elapsed = now - animation.startTime;

        if (elapsed >= animation.duration) {
          // Animation complete - snap to target
          animation.currentPos = { ...animation.targetPos };
          animation.duration = 0;
        } else {
          // Interpolate position (ease-out for smooth deceleration)
          const progress = elapsed / animation.duration;
          const easeOut = 1 - Math.pow(1 - progress, 3); // Cubic ease-out

          animation.currentPos = {
            x: animation.startPos.x + (animation.targetPos.x - animation.startPos.x) * easeOut,
            y: animation.startPos.y + (animation.targetPos.y - animation.startPos.y) * easeOut
          };
          hasActiveAnimations = true;
        }

        // Update display object position directly
        const displayObj = npcDisplayObjects.current[npcId];
        if (displayObj) {
          displayObj.x = animation.currentPos.x * TILE_SIZE + TILE_SIZE / 2;
          displayObj.y = animation.currentPos.y * TILE_SIZE + TILE_SIZE / 2;
        }
      }

      // PERFORMANCE: Remove ticker when no active animations
      if (!hasActiveAnimations) {
        try {
          ticker.remove(onTick);
        } catch (e) {
          // Ticker may be destroyed
        }
        npcAnimationTickerRef.current = null;
      }
    };

    npcAnimationTickerRef.current = onTick;
    ticker.add(onTick);
  }, [TILE_SIZE]);

  // Render NPCs with animation support (SVG with emoji fallback)
  // Uses object pooling and direct position updates for smooth animation
  // Note: Range indicators are now handled by PixiRendererVFX component
  useEffect(() => {
    if (!npcContainerRef.current || !npcs) return;

    const npcContainer = npcContainerRef.current;
    const fontSize = TILE_SIZE * 0.8;

    // Increment render version to invalidate any in-flight async renders
    npcRenderVersionRef.current += 1;
    const thisRenderVersion = npcRenderVersionRef.current;

    // Track which NPC IDs are currently in the grid
    const currentNpcIds = new Set(npcs.map(npc => npc.id));

    // Remove display objects for NPCs that are no longer in the grid
    for (const npcId of Object.keys(npcDisplayObjects.current)) {
      if (!currentNpcIds.has(npcId)) {
        const displayObj = npcDisplayObjects.current[npcId];
        if (displayObj && displayObj.parent) {
          displayObj.parent.removeChild(displayObj);
        }
        delete npcDisplayObjects.current[npcId];
        delete npcDisplayTypes.current[npcId];
        delete npcAnimations.current[npcId];
      }
    }

    // Async function to render NPCs with SVG texture support
    const renderNPCs = async () => {
      // Phase 1: Load all SVG textures in parallel for NPCs that have filenames
      const npcTexturePromises = npcs.map(async (npc) => {
        const filename = getNPCFilename(npc.type, masterResources);
        let texture = filename ? await loadSVGTexture(filename) : null;
        let emojiSized = false;
        if (!texture && npc.symbol) {
          texture = await loadEmojiTexture(npc.symbol);
          emojiSized = !!texture;
        }
        return { npc, texture, filename, emojiSized };
      });

      const loadedNPCs = await Promise.all(npcTexturePromises);

      // Check if render is still valid after async load
      if (thisRenderVersion !== npcRenderVersionRef.current) return;
      if (!npcContainerRef.current) return;

      // Phase 2: Update or create display objects for each NPC
      for (const { npc, texture, filename, emojiSized } of loadedNPCs) {
        // SVG portraits fill the tile; emoji frames match the old Text size (0.8 tile)
        const spriteSize = emojiSized ? fontSize * EMOJI_SPRITE_SCALE : TILE_SIZE;
        if (!npc.symbol && !texture) continue;

        const targetPos = npc.position || { x: npc.x, y: npc.y };
        if (targetPos?.x === undefined || targetPos?.y === undefined) continue;

        // Check if we already have a display object for this NPC
        let displayObj = npcDisplayObjects.current[npc.id];
        const currentDisplayType = npcDisplayTypes.current[npc.id];
        const currentAnimation = npcAnimations.current[npc.id];

        // Determine what type of display object we need
        const needsSprite = texture && texture.valid !== false;
        const newDisplayType = needsSprite ? 'sprite' : 'text';

        // If display type changed, remove old display object
        if (displayObj && currentDisplayType !== newDisplayType) {
          if (displayObj.parent) {
            displayObj.parent.removeChild(displayObj);
          }
          displayObj = null;
        }

        if (!displayObj) {
          // Create new display object
          if (needsSprite) {
            displayObj = new Sprite(texture);
            displayObj.width = spriteSize;
            displayObj.height = spriteSize;
            displayObj.anchor.set(0.5, 0.5);
          } else {
            displayObj = new Text(npc.symbol, {
              fontSize: fontSize,
              fontFamily: 'sans-serif',
            });
            displayObj.resolution = 2;
            displayObj.anchor.set(0.5, 0.5);
          }

          npcContainer.addChild(displayObj);
          npcDisplayObjects.current[npc.id] = displayObj;
          npcDisplayTypes.current[npc.id] = newDisplayType;

          // Initialize animation state at current position (no animation needed for first time)
          npcAnimations.current[npc.id] = {
            startPos: { ...targetPos },
            currentPos: { ...targetPos },
            targetPos: { ...targetPos },
            startTime: Date.now(),
            duration: 0
          };

          // Set initial position
          displayObj.x = targetPos.x * TILE_SIZE + TILE_SIZE / 2;
          displayObj.y = targetPos.y * TILE_SIZE + TILE_SIZE / 2;
        } else {
          // Update existing display object
          if (newDisplayType === 'sprite') {
            // Update sprite texture and size
            displayObj.texture = texture;
            displayObj.width = spriteSize;
            displayObj.height = spriteSize;
          } else {
            // Update text content and style
            displayObj.text = npc.symbol;
            displayObj.style.fontSize = fontSize;
          }

          // Check if position changed - start new animation
          if (currentAnimation &&
              (currentAnimation.targetPos.x !== targetPos.x ||
               currentAnimation.targetPos.y !== targetPos.y)) {
            // Position changed - start new animation from current interpolated position
            npcAnimations.current[npc.id] = {
              startPos: { ...currentAnimation.currentPos },
              currentPos: { ...currentAnimation.currentPos },
              targetPos: { ...targetPos },
              startTime: Date.now(),
              duration: NPC_ANIMATION_DURATION
            };
            // Start the animation ticker (on-demand pattern - only runs when needed)
            startNPCAnimationTicker();
          }

          // Get render position (may be mid-animation)
          const renderPos = getNPCRenderPosition(npc);
          displayObj.x = renderPos.x * TILE_SIZE + TILE_SIZE / 2;
          displayObj.y = renderPos.y * TILE_SIZE + TILE_SIZE / 2;
        }
      }
    };

    renderNPCs();
  }, [npcs, masterResources, getNPCRenderPosition, NPC_ANIMATION_DURATION, startNPCAnimationTicker]);

  // Cleanup NPC animation ticker on unmount
  useEffect(() => {
    return () => {
      if (npcAnimationTickerRef.current && appRef.current?.ticker) {
        try {
          appRef.current.ticker.remove(npcAnimationTickerRef.current);
        } catch (e) {
          // Ticker may be destroyed
        }
        npcAnimationTickerRef.current = null;
      }
    };
  }, []);

  // Note: PC rendering is now handled by PixiRendererPCs component

  // Render resource overlays (checkmarks, clocks, etc.)
  // Uses object pooling to prevent GPU memory exhaustion from creating/destroying sprites
  useEffect(() => {
    if (!overlayContainerRef.current || !resources) return;

    const overlayContainer = overlayContainerRef.current;
    const pool = overlayPoolRef.current;

    // Increment render version to invalidate any in-flight async renders
    overlayRenderVersionRef.current += 1;
    const thisRenderVersion = overlayRenderVersionRef.current;

    // Helper: Get or create a pooled overlay object
    const getOverlayFromPool = (index) => {
      if (index < pool.length) {
        const overlay = pool[index];
        // Reset visibility - will be set when used
        if (overlay.sprite) overlay.sprite.visible = false;
        if (overlay.text) overlay.text.visible = false;
        return overlay;
      }

      // Create new overlay object and add to pool
      const sprite = new Sprite();
      sprite.visible = false;

      const text = new Text('', {
        fontSize: 12,
        fontFamily: 'sans-serif',
      });
      text.resolution = 2;
      text.visible = false;

      const overlay = { sprite, text };
      pool.push(overlay);

      // Add to container
      overlayContainer.addChild(sprite);
      overlayContainer.addChild(text);

      return overlay;
    };

    // Helper: Hide all unused overlays in the pool
    const hideUnusedOverlays = (usedCount) => {
      for (let i = usedCount; i < pool.length; i++) {
        if (pool[i].sprite) pool[i].sprite.visible = false;
        if (pool[i].text) pool[i].text.visible = false;
      }
    };

    // Async function to render overlays
    const renderOverlays = async () => {
      let overlaysUsed = 0;

      for (const resource of resources) {
        // Check if this render is still current (cancelled if new render started)
        if (thisRenderVersion !== overlayRenderVersionRef.current) {
          return;
        }

        // Check if container is still valid (component may have unmounted during async)
        if (!overlayContainerRef.current) return;

        // Skip doobers and sources for overlays
        if (resource.category === 'doober' || resource.category === 'source') continue;

        // Check if resource needs an overlay (use computed status values)
        const overlayInfo = getResourceOverlayStatus(
          resource,
          computedCraftingStatus,
          computedTradingStatus,
          badgeState,
          electionPhase,
          currentPlayer
        );

        if (!overlayInfo) continue;

        const overlayType = overlayInfo.type;
        const svgFilename = OVERLAY_SVG_MAPPING[overlayType];
        const emojiMapping = OVERLAY_EMOJI_MAPPING[overlayType];

        // Position overlay at bottom-left corner of resource
        // At settlement zoom, apply grid offset
        const overlaySize = TILE_SIZE * 0.4;
        const x = gridOffsetX + resource.x * TILE_SIZE + 2;
        const y = gridOffsetY + resource.y * TILE_SIZE + TILE_SIZE - overlaySize - 2;

        // Get overlay from pool
        const overlay = getOverlayFromPool(overlaysUsed);

        if (svgFilename) {
          // Try to load SVG overlay (loads at fixed base size, scaled via sprite)
          const texture = await loadSVGTexture(svgFilename, true);

          // Check again after await - render may have been invalidated
          if (thisRenderVersion !== overlayRenderVersionRef.current) {
            return;
          }

          // Verify texture is valid before using sprite
          if (texture && texture.valid !== false) {
            // Double-check container is still valid after await
            if (!overlayContainerRef.current) return;

            // Reuse sprite from pool
            overlay.sprite.texture = texture;
            overlay.sprite.width = overlaySize;
            overlay.sprite.height = overlaySize;
            overlay.sprite.x = x;
            overlay.sprite.y = y;
            overlay.sprite.visible = true;
            overlay.text.visible = false;
            overlaysUsed++;
            continue;
          }
        }

        // Emoji fallback for overlays
        if (emojiMapping) {
          overlay.text.text = emojiMapping.emoji;
          overlay.text.style.fontSize = overlaySize * 0.8;
          overlay.text.x = x;
          overlay.text.y = y;
          overlay.text.visible = true;
          overlay.sprite.visible = false;
          overlaysUsed++;
        }
      }

      // Render NPC overlays (e.g., farm animals ready for collection)
      if (npcs) {
        for (const npc of npcs) {
          // CRITICAL: Check if this render is still current
          if (thisRenderVersion !== overlayRenderVersionRef.current) return;
          if (!overlayContainerRef.current) return;

          const overlayInfo = getNPCOverlayStatus(npc);
          if (!overlayInfo) continue;

          const overlayType = overlayInfo.type;
          if (!overlayType || !OVERLAY_SVG_MAPPING[overlayType]) continue;

          // At settlement zoom, apply grid offset to NPC overlay position
          const npcX = gridOffsetX + Math.floor(npc.position?.x || 0) * TILE_SIZE;
          const npcY = gridOffsetY + Math.floor(npc.position?.y || 0) * TILE_SIZE;

          // Position overlay in lower-left corner of the NPC tile
          const overlaySize = TILE_SIZE * 0.4;
          const overlayX = npcX + 2;
          const overlayY = npcY + TILE_SIZE - overlaySize - 2;

          // Get overlay from pool
          const overlay = getOverlayFromPool(overlaysUsed);

          const svgFilename = OVERLAY_SVG_MAPPING[overlayType];
          if (svgFilename) {
            // Load at fixed base size, scale via sprite
            const texture = await loadSVGTexture(svgFilename, true);

            if (thisRenderVersion !== overlayRenderVersionRef.current) return;
            if (texture && texture.valid !== false && overlayContainerRef.current) {
              // Reuse sprite from pool
              overlay.sprite.texture = texture;
              overlay.sprite.width = overlaySize;
              overlay.sprite.height = overlaySize;
              overlay.sprite.x = overlayX;
              overlay.sprite.y = overlayY;
              overlay.sprite.visible = true;
              overlay.text.visible = false;
              overlaysUsed++;
              continue;
            }
          }

          // Emoji fallback for NPC overlays
          const emojiMapping = OVERLAY_EMOJI_MAPPING[overlayType];
          if (emojiMapping) {
            overlay.text.text = emojiMapping.emoji;
            overlay.text.style.fontSize = overlaySize * 0.8;
            overlay.text.x = overlayX;
            overlay.text.y = overlayY;
            overlay.text.visible = true;
            overlay.sprite.visible = false;
            overlaysUsed++;
          }
        }
      }

      // Hide any unused overlays from the pool
      hideUnusedOverlays(overlaysUsed);

      if (overlaysUsed > 0) {
        // console.log(`✨ PixiJS rendered ${overlaysUsed} overlays (pool size: ${pool.length})`);
      }
    };

    renderOverlays();
  }, [resources, npcs, computedCraftingStatus, computedTradingStatus, badgeState, electionPhase, currentPlayer, gridOffsetX, gridOffsetY]); // TILE_SIZE removed - it's constant now

  // Handle click events - check NPCs and PCs before falling through to tile click
  const handleClick = useCallback((event) => {
    if (!containerRef.current) return;
    if (suppressClickRef.current) { suppressClickRef.current = false; return; } // long-press or pinch

    const rect = containerRef.current.getBoundingClientRect();
    const { row, col } = PixiCamera.screenToTile(event.clientX - rect.left, event.clientY - rect.top);

    // Range as the interaction code sees it (ResourceClicking.js / NPCInteractionUtils.js):
    // Euclidean distance against the derived range, no limit on the player's own homestead.
    const onOwnHomestead = currentPlayer?.gridId && currentPlayer.gridId === currentPlayer?.location?.g;
    const playerPos = playersInGrid?.[gridId]?.pcs?.[String(currentPlayer?._id)]?.position;
    const outOfRange = (tx, ty) => {
      if (onOwnHomestead || !playerPos) return false;
      const d = Math.hypot(playerPos.x - tx, playerPos.y - ty);
      return d > getDerivedRange(currentPlayer, masterResources);
    };
    const walk = () => { if (onWalkTo) onWalkTo(row, col); };

    // At frontier zoom during relocation, clicking on the current settlement should
    // trigger a grid-level click (same as other settlements)
    // Convert tile position (0-63) to grid position (0-7) within the settlement
    if (isFrontierZoom && isRelocating && onFrontierGridClick) {
      const TILES_PER_GRID_SIDE = 64; // Each grid is 64x64 tiles
      const GRIDS_PER_SETTLEMENT = 8;  // Each settlement is 8x8 grids
      const tilesPerGrid = TILES_PER_GRID_SIDE / GRIDS_PER_SETTLEMENT; // 8 tiles per grid cell
      const gridRow = Math.floor(row / tilesPerGrid);
      const gridCol = Math.floor(col / tilesPerGrid);

      // Get grid data from settlementData
      const gridData = settlementData?.[gridRow]?.[gridCol];
      if (gridData) {
        onFrontierGridClick(gridData, gridRow, gridCol, currentSettlementPosition?.row, currentSettlementPosition?.col);
        return;
      }
    }

    // Bounds check - grid is TILES_PER_GRID×TILES_PER_GRID tiles
    if (row < 0 || row >= TILES_PER_GRID || col < 0 || col >= TILES_PER_GRID) return;

    // Check for NPC at this position first
    const npc = npcs?.find(n =>
      n && n.position &&
      Math.floor(n.position.x) === col &&
      Math.floor(n.position.y) === row
    );

    if (npc) {
      // A helper NPC beyond reach: walk up to it instead of just saying "out of range".
      // Enemies and spawners keep the plain click (walking into them is not a tap's intent).
      const isHostile = npc.action === 'attack' || npc.action === 'spawn';
      if (!isHostile && !cursorMode && outOfRange(col, row)) { walk(); return; }

      // Use the shared click handler that includes cooldown logic for attack NPCs
      handleNPCClickShared(npc, {
        currentPlayer,
        playersInGrid,
        gridId,
        TILE_SIZE,
        masterResources,
        masterSkills,
        masterTrophies,
        globalTuning,
        strings,
        // Event handlers
        onNPCClick,
        setHoverTooltip,
        setInventory,
        setBackpack,
        setResources,
        setCurrentPlayer,
        setModalContent,
        setIsModalOpen,
        updateStatus,
        openPanel,
        setActiveStation,
        isDeveloper
      });
      return;
    }

    // Cursor placement modes own the click entirely (they have their own range feedback)
    if (!cursorMode) {
      // Anything placed on the tile is clickable (trees and rocks are 'source' and get chopped
      // or mined through handleTileClick); only shadows are decoration
      const resource = resources?.find(r => {
        if (!r || r.type === 'shadow') return false;
        const span = r.size || 1;
        return col >= r.x && col < r.x + span && row <= r.y && row > r.y - span;
      });
      if (resource) {
        // Something to interact with, but too far: walk next to it (tap again once there)
        if (outOfRange(resource.x, resource.y)) { walk(); return; }
      } else {
        // Empty tile: walk there, unless the tile has its own click meaning
        const tileType = tileTypes?.[row]?.[col];
        const dirtOpensFarming = tileType === 'd' && onOwnHomestead;
        const teleportOn = !!currentPlayer?.settings?.isTeleportEnabled;
        if (!dirtOpensFarming && !teleportOn) { walk(); return; }
      }
    }

    // Forward to tile/resource handler
    if (handleTileClick) {
      handleTileClick(row, col);
    }
  }, [handleTileClick, TILE_SIZE, zoomScale, npcs, resources, tileTypes, cursorMode, onWalkTo, currentPlayer, playersInGrid, gridId,
      masterResources, masterSkills, masterTrophies, globalTuning, strings,
      onNPCClick, setHoverTooltip, setInventory, setBackpack, setResources,
      setCurrentPlayer, setModalContent, setIsModalOpen, updateStatus, openPanel,
      setActiveStation, isDeveloper, isFrontierZoom, isRelocating, onFrontierGridClick,
      settlementData, currentSettlementPosition]);

  // Handle mouse move for tooltips and cursor highlight
  // Throttled to ~20 updates/sec for performance
  const handleMouseMove = useCallback((event) => {
    // Throttle: skip if called too recently
    const now = Date.now();
    if (now - lastMouseMoveTimeRef.current < MOUSE_MOVE_THROTTLE_MS) {
      return;
    }
    lastMouseMoveTimeRef.current = now;

    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const { row, col } = PixiCamera.screenToTile(event.clientX - rect.left, event.clientY - rect.top);

    if (row < 0 || row >= TILES_PER_GRID || col < 0 || col >= TILES_PER_GRID) {
      setHoveredTile(null);
      if (setHoverTooltip) setHoverTooltip(null);
      return;
    }

    // Update hovered tile for cursor highlight
    setHoveredTile({ row, col });

    // Skip tooltip handling if no setHoverTooltip provided
    if (!setHoverTooltip) return;

    // Check for NPC at this position first (they render on top)
    const npc = npcs?.find(n =>
      n && n.position &&
      Math.floor(n.position.x) === col &&
      Math.floor(n.position.y) === row
    );

    if (npc) {
      const tooltipPosition = calculateTooltipPosition(event.clientX, event.clientY);
      setHoverTooltip({
        x: tooltipPosition.x,
        y: tooltipPosition.y,
        content: generateNPCTooltip(npc, strings),
      });
      return;
    }

    // Check for tooltip-eligible resource (excluding doobers and sources)
    const resource = resources?.find(r => {
      if (r.type === 'shadow' || r.category === 'doober' || r.category === 'source' || r.category === 'deco') return false;
      const tileSpan = r.size || 1;
      // Multi-tile resources grow upward from anchor
      return col >= r.x && col < r.x + tileSpan &&
             row <= r.y && row > r.y - tileSpan;
    });

    if (resource) {
      const tooltipPosition = calculateTooltipPosition(event.clientX, event.clientY);
      setHoverTooltip({
        x: tooltipPosition.x,
        y: tooltipPosition.y,
        content: generateResourceTooltip(resource, strings, timers),
      });
      return;
    }

    // Nothing to show tooltip for
    setHoverTooltip(null);
  }, [TILE_SIZE, zoomScale, npcs, resources, strings, timers, setHoverTooltip]);

  // Tooltip for whatever is under a screen point (long-press on touch uses this too)
  const showTooltipAt = useCallback((clientX, clientY) => {
    if (!containerRef.current || !setHoverTooltip) return false;
    const rect = containerRef.current.getBoundingClientRect();
    const { row, col } = PixiCamera.screenToTile(clientX - rect.left, clientY - rect.top);
    if (row < 0 || row >= TILES_PER_GRID || col < 0 || col >= TILES_PER_GRID) return false;
    const npc = npcs?.find(n => n && n.position && Math.floor(n.position.x) === col && Math.floor(n.position.y) === row);
    const tooltipPosition = calculateTooltipPosition(clientX, clientY);
    if (npc) {
      setHoverTooltip({ x: tooltipPosition.x, y: tooltipPosition.y, content: generateNPCTooltip(npc, strings) });
      return true;
    }
    const resource = resources?.find(r => {
      if (r.type === 'shadow' || r.category === 'doober' || r.category === 'source' || r.category === 'deco') return false;
      const tileSpan = r.size || 1;
      return col >= r.x && col < r.x + tileSpan && row <= r.y && row > r.y - tileSpan;
    });
    if (resource) {
      setHoverTooltip({ x: tooltipPosition.x, y: tooltipPosition.y, content: generateResourceTooltip(resource, strings, timers) });
      return true;
    }
    return false;
  }, [npcs, resources, strings, timers, setHoverTooltip]);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
  }, []);

  const pointerDistance = useCallback(() => {
    const pts = [...touchPointersRef.current.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }, []);

  const handlePointerDown = useCallback((event) => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY });
    if (touchPointersRef.current.size === 2) {
      // Second finger: this is a pinch, not a tap, a long-press or a drag
      cancelLongPress();
      dragPannedRef.current = false;
      pinchBaselineRef.current = pointerDistance();
      pinchedRef.current = false;
      return;
    }
    longPressFiredRef.current = false;
    cancelLongPress();
    const { clientX, clientY } = event;
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      if (showTooltipAt(clientX, clientY)) longPressFiredRef.current = true;
    }, LONG_PRESS_MS);
  }, [cancelLongPress, pointerDistance, showTooltipAt]);

  const handlePointerMove = useCallback((event) => {
    const p = touchPointersRef.current.get(event.pointerId);
    if (!p) return;
    p.x = event.clientX; p.y = event.clientY;
    if (touchPointersRef.current.size >= 2 && pinchBaselineRef.current) {
      const d = pointerDistance();
      const ratio = d / pinchBaselineRef.current;
      if (ratio >= PINCH_STEP_RATIO || ratio <= 1 / PINCH_STEP_RATIO) {
        pinchBaselineRef.current = d;
        pinchedRef.current = true;
        if (onPinchZoom) onPinchZoom(ratio > 1 ? 'in' : 'out');
      }
      return;
    }
    if (touchPointersRef.current.size !== 1) return;
    const moved = Math.hypot(p.x - p.startX, p.y - p.startY);
    if (moved > LONG_PRESS_MOVE_TOLERANCE_PX) {
      cancelLongPress();
      // One finger dragging the board pans the view; the tap-click that follows is not a tap
      if (!dragPannedRef.current) {
        dragPannedRef.current = true;
        p.lastX = p.x; p.lastY = p.y;
      } else {
        PixiCamera.panBy(p.x - (p.lastX ?? p.x), p.y - (p.lastY ?? p.y));
        p.lastX = p.x; p.lastY = p.y;
      }
    }
  }, [cancelLongPress, pointerDistance, onPinchZoom]);

  const handlePointerUp = useCallback((event) => {
    if (!touchPointersRef.current.has(event.pointerId)) return;
    touchPointersRef.current.delete(event.pointerId);
    cancelLongPress();
    if (touchPointersRef.current.size === 0) {
      if (dragPannedRef.current) {
        dragPannedRef.current = false;
        suppressClickRef.current = true;
      } else if (pinchedRef.current || pinchBaselineRef.current) {
        suppressClickRef.current = true; // the tap-click after a pinch is not a tap
        pinchBaselineRef.current = null;
        pinchedRef.current = false;
      } else if (longPressFiredRef.current) {
        suppressClickRef.current = true;
        longPressFiredRef.current = false;
        if (tooltipClearTimerRef.current) clearTimeout(tooltipClearTimerRef.current);
        tooltipClearTimerRef.current = setTimeout(() => {
          tooltipClearTimerRef.current = null;
          if (setHoverTooltip) setHoverTooltip(null);
        }, 1800);
      }
      // Clear the suppression if no click follows (e.g. the browser sent none)
      setTimeout(() => { suppressClickRef.current = false; }, 400);
    }
  }, [cancelLongPress, setHoverTooltip]);

  // Handle mouse leave to clear tooltip and hovered tile
  const handleMouseLeave = useCallback(() => {
    setHoveredTile(null);
    if (setHoverTooltip) {
      setHoverTooltip(null);
    }
  }, [setHoverTooltip]);

  // ============================================================================
  // LAYOUT
  // ============================================================================
  // The canvas fills the board. PixiCamera scales/positions worldContainer so the player
  // sits at the board's centre; the current grid is at the world origin. The DOM overlay
  // (`.pixi-world-container`) receives the same transform, so settlement/frontier previews,
  // floating text, DOM VFX and the FTUE doinker are laid out in BASE px with the current
  // grid at (0,0) and simply follow the camera.
  // ============================================================================

  const singleGridPixelSizeBase = TILES_PER_GRID * TILE_SIZE;
  const singleSettlementPixelSizeBase = TILES_PER_SETTLEMENT * TILE_SIZE;

  const currentGridRow = currentGridPosition?.row ?? 0;
  const currentGridCol = currentGridPosition?.col ?? 0;
  const currentSettlementRow = currentSettlementPosition?.row ?? 0;
  const currentSettlementCol = currentSettlementPosition?.col ?? 0;

  // Settlement previews lay grids out at (col * grid, row * grid) within the settlement;
  // shift so the current grid lands on the origin
  const settlementOffset = {
    x: -currentGridCol * singleGridPixelSizeBase,
    y: -currentGridRow * singleGridPixelSizeBase,
  };
  // Frontier previews lay settlements out at ((col + padding) * settlement, ...)
  const frontierOffset = {
    x: -((WORLD_PADDING_SETTLEMENTS + currentSettlementCol) * singleSettlementPixelSizeBase + currentGridCol * singleGridPixelSizeBase),
    y: -((WORLD_PADDING_SETTLEMENTS + currentSettlementRow) * singleSettlementPixelSizeBase + currentGridRow * singleGridPixelSizeBase),
  };

  // How far the view may be panned: the grid, or the settlement / padded frontier when zoomed out
  useEffect(() => {
    if (isFrontierZoom) {
      const size = singleSettlementPixelSizeBase * (SETTLEMENTS_PER_FRONTIER + 2 * WORLD_PADDING_SETTLEMENTS);
      PixiCamera.setPanBounds({ minX: frontierOffset.x, minY: frontierOffset.y, maxX: frontierOffset.x + size, maxY: frontierOffset.y + size });
    } else if (isSettlementZoom) {
      const size = singleGridPixelSizeBase * 8;
      PixiCamera.setPanBounds({ minX: settlementOffset.x, minY: settlementOffset.y, maxX: settlementOffset.x + size, maxY: settlementOffset.y + size });
    } else {
      PixiCamera.setPanBounds(null);
    }
  }, [isFrontierZoom, isSettlementZoom, frontierOffset.x, frontierOffset.y, settlementOffset.x, settlementOffset.y, singleGridPixelSizeBase, singleSettlementPixelSizeBase]);

  return (
    <>
      {/* Canvas host: fills the board; receives clicks and hover for the world */}
      <div
        ref={containerRef}
        className="pixi-container"
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          overflow: 'hidden',
          zIndex: 1,
          cursor: 'pointer',
          touchAction: 'none', // taps, long-presses and pinches are ours, not the page's
        }}
      />
      {/* DOM overlay mirrored to the Pixi world (transform set by PixiCamera). pointer-events
          none so the canvas gets clicks; preview cells that are clickable opt back in. */}
      <div
        ref={overlayRef}
        className="pixi-world-container"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 0,
          height: 0,
          overflow: 'visible',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      >
        {/* Frontier settlement previews; hidden during zoom animation to avoid a flash */}
        <PixiRendererFrontierSettlements
          isActive={isFrontierZoom && !isZoomAnimating}
          currentSettlementPosition={currentSettlementPosition}
          frontierData={frontierData}
          frontierSettlementGrids={frontierSettlementGrids}
          currentPlayer={currentPlayer}
          settlementPixelSize={singleSettlementPixelSizeBase}
          zoomScale={1}
          screenScale={zoomScale}
          onGridClick={onFrontierGridClick}
          containerOffset={frontierOffset}
          isRelocating={isRelocating}
        />
        {/* Settlement grid previews (the current grid itself is the live canvas) */}
        <PixiRendererSettlementGrids
          isActive={(isSettlementZoom || isFrontierZoom) && !isZoomAnimating}
          currentGridPosition={currentGridPosition}
          settlementData={settlementData}
          visitedGridTiles={visitedGridTiles}
          players={settlementPlayers}
          TILE_SIZE={TILE_SIZE}
          zoomScale={1}
          screenScale={zoomScale}
          masterResources={masterResources}
          onGridClick={onSettlementGridClick}
          strings={strings}
          settlementOffset={settlementOffset}
          isFrontierZoom={isFrontierZoom}
          isDeveloper={isDeveloper}
          isRelocating={isRelocating}
          onRelocationGridClick={onFrontierGridClick}
          currentSettlementPosition={currentSettlementPosition}
        />
        {/* FTUE Doinker - bouncing arrow pointing at target resources/NPCs */}
        {doinkerType !== 'button' && (
          <PixiRendererDoinker
            doinkerTargets={doinkerTargets}
            doinkerType={doinkerType}
            TILE_SIZE={TILE_SIZE}
            zoomScale={1}
            visible={doinkerVisible}
            gridId={gridId}
            gridWorldPosition={{ x: 0, y: 0 }}
          />
        )}
      </div>
      {/* Cursor highlight for placement modes */}
      <PixiRendererCursor
        app={appRef.current}
        hoveredTile={hoveredTile}
        cursorMode={cursorMode}
        TILE_SIZE={TILE_SIZE}
        gridOffset={{ x: gridOffsetX, y: gridOffsetY }}
      />
      {/* VFX layer for range indicators and other effects */}
      <PixiRendererVFX
        app={appRef.current}
        npcs={npcs}
        pcs={pcs}
        currentPlayer={currentPlayer}
        TILE_SIZE={TILE_SIZE}
        masterResources={masterResources}
        gridOffset={{ x: gridOffsetX, y: gridOffsetY }}
        getNPCRenderPosition={getNPCRenderPosition}
      />
      {/* PC layer with state-based icons */}
      <PixiRendererPCs
        app={appRef.current}
        pcs={pcs}
        currentPlayer={currentPlayer}
        TILE_SIZE={TILE_SIZE}
        gridOffset={{ x: gridOffsetX, y: gridOffsetY }}
      />
      {/* Speech bubbles and relationship outcomes */}
      <PixiRendererSpeech
        app={appRef.current}
        npcs={npcs}
        pcs={pcs}
        currentPlayer={currentPlayer}
        TILE_SIZE={TILE_SIZE}
        gridOffset={{ x: gridOffsetX, y: gridOffsetY }}
      />
      {/* NPC status overlays (quest checkmarks, trade indicators) */}
      <PixiRendererNPCOverlays
        app={appRef.current}
        npcs={npcs}
        currentPlayer={currentPlayer}
        masterResources={masterResources}
        TILE_SIZE={TILE_SIZE}
        gridOffset={{ x: gridOffsetX, y: gridOffsetY }}
        getNPCRenderPosition={getNPCRenderPosition}
        npcAnimations={npcAnimations}
      />
    </>
  );
};

export default PixiRenderer;
