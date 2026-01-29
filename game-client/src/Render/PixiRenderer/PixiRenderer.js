import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { Application, Container, Graphics, Text, Sprite, Texture } from 'pixi.js-legacy';
import { getResourceOverlayStatus, getNPCOverlayStatus, OVERLAY_SVG_MAPPING, OVERLAY_EMOJI_MAPPING } from '../../Utils/ResourceOverlayUtils';
import { handleNPCClickShared } from '../../GameFeatures/NPCs/NPCInteractionUtils';
import { generateResourceTooltip, generateNPCTooltip, generatePCTooltip } from '../RenderDynamicElements';
import { calculateTooltipPosition } from '../../Utils/TooltipUtils';
import PixiRendererVFX from './PixiRendererVFX';
import PixiRendererPCs from './PixiRendererPCs';
import PixiRendererCursor from './PixiRendererCursor';
import PixiRendererSpeech from './PixiRendererSpeech';
import PixiRendererNPCOverlays from './PixiRendererNPCOverlays';
import PixiRendererSettlementGrids, { clearGridSnapshotCache } from './PixiRendererSettlementGrids';
import PixiRendererFrontierSettlements from './PixiRendererFrontierSettlements';
import PixiRendererPadding from './PixiRendererPadding';
import { generateTileTexture, clearTileTextureCache } from './PixiRendererTileTextures';
import {
  TILES_PER_GRID,
  TILES_PER_SETTLEMENT,
  WORLD_PADDING_SETTLEMENTS,
  getWorldPixelSize,
  getGridWorldPixelPosition,
} from './UnifiedCamera';
import { isResourceAnimating, getAnimationVersion, registerForceRender } from '../../VFX/VFX';
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
 * Load an SVG file and create a PixiJS texture
 * @param {string} filename - SVG filename (e.g., "tree.svg")
 * @param {boolean} isOverlay - Whether this is an overlay SVG
 * @returns {Promise<Texture|null>} PixiJS texture or null if failed
 */
const loadSVGTexture = async (filename, isOverlay = false) => {
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

      const svgText = await response.text();

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
            ctx.drawImage(img, 0, 0, renderSize, renderSize);
            // Create PixiJS texture from canvas
            // v7: Use Texture.from() with canvas
            const pixiTexture = Texture.from(canvas);
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
 * Get the SVG filename for a resource type from masterResources
 */
const getResourceFilename = (resourceType, masterResources) => {
  if (!masterResources) return null;
  const masterResource = masterResources.find(r => r.type === resourceType);
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
  onPCClick,
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
  connectedPlayers,       // Set of online player IDs (for PC opacity)
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
  isZoomAnimating = false, // True during zoom animation - skip CSS transform updates to avoid conflicts
}) => {
  const containerRef = useRef(null);
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

  // NPC Animation system for smooth movement
  // Uses direct display object position updates instead of React state
  // Animation data: { startPos, currentPos, targetPos, startTime, duration }
  const npcAnimations = useRef({});
  // Map of NPC id -> Text display object for position updates
  const npcDisplayObjects = useRef({});
  // Ref to track if NPC animation ticker is currently running (for on-demand ticker pattern)
  const npcAnimationTickerRef = useRef(null);

  // Calculate crafting and trading status for dynamic overlays (same as RenderDynamicElements)
  // NOTE: Date.now() is calculated INSIDE useMemo to avoid dependency on every render.
  // Status recalculates only when resources change, not continuously.
  const computedCraftingStatus = useMemo(() => {
    if (!resources) return { ready: [], searching: [], hungry: [], inProgress: [] };

    const now = Date.now(); // Calculate inside useMemo, not as external dependency

    return resources.reduce((acc, res) => {
      if ((res.category === 'crafting' || res.category === 'farmhouse') && res.craftEnd) {
        const key = `${res.x}-${res.y}`;
        if (res.craftEnd < now) {
          acc.ready.push(key);
        } else {
          acc.inProgress.push(key);
        }
      } else if (res.category === 'farmplot' && res.isSearching) {
        const key = `${res.x}-${res.y}`;
        acc.searching.push(key);
      } else if (res.category === 'farmplot' && res.growEnd) {
        const key = `${res.x}-${res.y}`;
        if (res.growEnd < now) {
          acc.ready.push(key);
        }
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

      // Calculate canvas size - ALWAYS TILES_PER_GRID×TILES_PER_GRID tiles (single grid)
      // Settlement zoom renders neighboring grids via PixiRendererSettlementGrids
      // but the main PixiJS canvas stays the same size
      const gridSize = TILES_PER_GRID;
      const worldWidth = gridSize * TILE_SIZE;
      const worldHeight = gridSize * TILE_SIZE;

      // Create PixiJS Application with legacy support (WebGL with Canvas fallback)
      // pixi.js-legacy v7 uses constructor pattern, not async init()
      // Using preferWebGLVersion: 1 for better stability (WebGL 1 is more widely supported)
      let app;
      try {
        app = new Application({
          width: worldWidth,
          height: worldHeight,
          backgroundColor: 0x1a1a2e, // Dark background
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
      // Clear texture caches to prevent stale texture references on remount
      clearTextureCache();
      clearTileTextureCache();
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
        console.log('⏸️ PixiJS ticker paused (tab hidden)');
      } else {
        // Tab is visible - resume the ticker
        appRef.current.ticker.start();
        console.log('▶️ PixiJS ticker resumed (tab visible)');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Apply zoom using CSS transform ONLY
  // The PixiJS canvas stays at a constant size (64×64 tiles).
  // CSS transform handles visual scaling for ALL zoom levels including settlement.
  // At settlement zoom, the scroll container expands to show neighboring grids.
  useEffect(() => {
    if (!appRef.current || !worldContainerRef.current) return;

    // SKIP during zoom animation - App.js directly manipulates DOM during animation
    // to avoid React re-render overhead. This useEffect only runs at animation END.
    if (isZoomAnimating) {
      return;
    }

    // Canvas is ALWAYS 64×64 tiles - never changes
    const baseWorldSize = GRID_TILES * TILE_SIZE;

    // Keep renderer at constant size
    appRef.current.renderer.resize(baseWorldSize, baseWorldSize);

    // World container always at origin - current grid renders at (0,0)
    worldContainerRef.current.x = 0;
    worldContainerRef.current.y = 0;
    worldContainerRef.current.scale.set(1.0);

    // CSS transform scales the canvas visually
    // At settlement zoom (zoomScale ~0.05), the 1920px canvas becomes ~96px visually
    const canvas = appRef.current.view;
    canvas.style.width = `${baseWorldSize}px`;
    canvas.style.height = `${baseWorldSize}px`;
    canvas.style.transformOrigin = 'top left';
    canvas.style.transform = `scale(${zoomScale})`;
  }, [TILE_SIZE, zoomScale, zoomLevel, isZoomAnimating]);

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
        return { resource, texture };
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

      for (const { resource, texture } of loadedResources) {
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

  // Render NPCs with animation support (Phase 1 - Emoji symbols)
  // Uses object pooling and direct position updates for smooth animation
  // Note: Range indicators are now handled by PixiRendererVFX component
  useEffect(() => {
    if (!npcContainerRef.current || !npcs) return;

    const npcContainer = npcContainerRef.current;
    const fontSize = TILE_SIZE * 0.8;

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
        delete npcAnimations.current[npcId];
      }
    }

    // Update or create display objects for each NPC
    for (const npc of npcs) {
      if (!npc.symbol) continue;

      const targetPos = npc.position || { x: npc.x, y: npc.y };
      if (targetPos?.x === undefined || targetPos?.y === undefined) continue;

      // Check if we already have a display object for this NPC
      let text = npcDisplayObjects.current[npc.id];
      const currentAnimation = npcAnimations.current[npc.id];

      if (!text) {
        // Create new display object
        text = new Text(npc.symbol, {
          fontSize: fontSize,
          fontFamily: 'sans-serif',
        });
        text.resolution = 2;
        text.anchor.set(0.5, 0.5);
        npcContainer.addChild(text);
        npcDisplayObjects.current[npc.id] = text;

        // Initialize animation state at current position (no animation needed for first time)
        npcAnimations.current[npc.id] = {
          startPos: { ...targetPos },
          currentPos: { ...targetPos },
          targetPos: { ...targetPos },
          startTime: Date.now(),
          duration: 0
        };

        // Set initial position
        text.x = targetPos.x * TILE_SIZE + TILE_SIZE / 2;
        text.y = targetPos.y * TILE_SIZE + TILE_SIZE / 2;
      } else {
        // Update existing display object
        text.text = npc.symbol;
        text.style.fontSize = fontSize;

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
        text.x = renderPos.x * TILE_SIZE + TILE_SIZE / 2;
        text.y = renderPos.y * TILE_SIZE + TILE_SIZE / 2;
      }
    }
  }, [npcs, getNPCRenderPosition, NPC_ANIMATION_DURATION, startNPCAnimationTicker]);

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
  useEffect(() => {
    if (!overlayContainerRef.current || !resources) return;

    const overlayContainer = overlayContainerRef.current;

    // Increment render version to invalidate any in-flight async renders
    overlayRenderVersionRef.current += 1;
    const thisRenderVersion = overlayRenderVersionRef.current;

    // Clear existing overlays immediately
    overlayContainer.removeChildren();

    // Async function to render overlays
    const renderOverlays = async () => {
      let overlayCount = 0;

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

        if (svgFilename) {
          // Try to load SVG overlay (loads at fixed base size, scaled via sprite)
          const texture = await loadSVGTexture(svgFilename, true);

          // Check again after await - render may have been invalidated
          if (thisRenderVersion !== overlayRenderVersionRef.current) {
            return;
          }

          // Verify texture is valid before creating sprite
          if (texture && texture.valid !== false) {
            // Double-check container is still valid after await
            if (!overlayContainerRef.current) return;

            const sprite = new Sprite(texture);
            // Scale sprite to desired size (texture is fixed at OVERLAY_TEXTURE_SIZE)
            sprite.width = overlaySize;
            sprite.height = overlaySize;
            sprite.x = x;
            sprite.y = y;
            overlayContainer.addChild(sprite);
            overlayCount++;
            continue;
          }
        }

        // Emoji fallback for overlays
        if (emojiMapping) {
          const text = new Text(emojiMapping.emoji, {
            fontSize: overlaySize * 0.8,
            fontFamily: 'sans-serif',
          });
          text.resolution = 2;
          text.x = x;
          text.y = y;
          overlayContainer.addChild(text);
          overlayCount++;
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

          const svgFilename = OVERLAY_SVG_MAPPING[overlayType];
          if (svgFilename) {
            // Load at fixed base size, scale via sprite
            const texture = await loadSVGTexture(svgFilename, true);

            if (thisRenderVersion !== overlayRenderVersionRef.current) return;
            if (texture && texture.valid !== false && overlayContainerRef.current) {
              const sprite = new Sprite(texture);
              // Scale sprite to desired size
              sprite.width = overlaySize;
              sprite.height = overlaySize;
              sprite.x = overlayX;
              sprite.y = overlayY;
              overlayContainer.addChild(sprite);
              overlayCount++;
              continue;
            }
          }

          // Emoji fallback for NPC overlays
          const emojiMapping = OVERLAY_EMOJI_MAPPING[overlayType];
          if (emojiMapping) {
            const text = new Text(emojiMapping.emoji, {
              fontSize: overlaySize * 0.8,
              fontFamily: 'sans-serif',
            });
            text.resolution = 2;
            text.x = overlayX;
            text.y = overlayY;
            overlayContainer.addChild(text);
            overlayCount++;
          }
        }
      }

      if (overlayCount > 0) {
        // console.log(`✨ PixiJS rendered ${overlayCount} overlays`);
      }
    };

    renderOverlays();
  }, [resources, npcs, computedCraftingStatus, computedTradingStatus, badgeState, electionPhase, currentPlayer, gridOffsetX, gridOffsetY]); // TILE_SIZE removed - it's constant now

  // Handle click events - check NPCs and PCs before falling through to tile click
  const handleClick = useCallback((event) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;

    // Convert screen coordinates to world coordinates
    // The canvas is CSS-scaled by zoomScale, so divide to get world coords
    const worldX = screenX / zoomScale;
    const worldY = screenY / zoomScale;

    const col = Math.floor(worldX / TILE_SIZE);
    const row = Math.floor(worldY / TILE_SIZE);

    // Bounds check - grid is TILES_PER_GRID×TILES_PER_GRID tiles
    if (row < 0 || row >= TILES_PER_GRID || col < 0 || col >= TILES_PER_GRID) return;

    // Check for NPC at this position first
    const npc = npcs?.find(n =>
      n && n.position &&
      Math.floor(n.position.x) === col &&
      Math.floor(n.position.y) === row
    );

    if (npc) {
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

    // Check for PC at this position
    const pc = pcs?.find(p =>
      p && p.position &&
      Math.floor(p.position.x) === col &&
      Math.floor(p.position.y) === row
    );

    if (pc && onPCClick) {
      onPCClick(pc);
      return;
    }

    // No NPC or PC found, forward to tile/resource handler
    if (handleTileClick) {
      handleTileClick(row, col);
    }
  }, [handleTileClick, TILE_SIZE, zoomScale, npcs, pcs, currentPlayer, playersInGrid, gridId,
      masterResources, masterSkills, masterTrophies, globalTuning, strings,
      onNPCClick, onPCClick, setHoverTooltip, setInventory, setBackpack, setResources,
      setCurrentPlayer, setModalContent, setIsModalOpen, updateStatus, openPanel,
      setActiveStation, isDeveloper]);

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
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;

    // Convert screen coordinates to world coordinates (account for zoom scale)
    const worldX = screenX / zoomScale;
    const worldY = screenY / zoomScale;

    const col = Math.floor(worldX / TILE_SIZE);
    const row = Math.floor(worldY / TILE_SIZE);

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

    // Check for PC at this position (excluding current player)
    const pc = pcs?.find(p =>
      p && p.position &&
      Math.floor(p.position.x) === col &&
      Math.floor(p.position.y) === row &&
      String(p.playerId) !== String(currentPlayer?._id)
    );

    if (pc) {
      const tooltipPosition = calculateTooltipPosition(event.clientX, event.clientY);
      setHoverTooltip({
        x: tooltipPosition.x,
        y: tooltipPosition.y,
        content: generatePCTooltip(pc, strings),
      });
      return;
    }

    // Nothing to show tooltip for
    setHoverTooltip(null);
  }, [TILE_SIZE, zoomScale, npcs, pcs, resources, currentPlayer, strings, timers, setHoverTooltip]);

  // Handle mouse leave to clear tooltip and hovered tile
  const handleMouseLeave = useCallback(() => {
    setHoveredTile(null);
    if (setHoverTooltip) {
      setHoverTooltip(null);
    }
  }, [setHoverTooltip]);

  // ============================================================================
  // UNIFIED WORLD MODEL
  // ============================================================================
  // The world is ALWAYS 6144×6144 tiles (4096 frontier + 2×1024 padding).
  // Container size scales proportionally with zoomScale - no jumps, no coordinate
  // system changes at different zoom levels. This eliminates camera jitter.
  //
  // All content is positioned at ABSOLUTE world coordinates, not relative to
  // the current zoom level. The same position formula works at ALL zoom levels.
  // ============================================================================

  // World size in pixels at current zoom scale
  // This is the ONLY size calculation - it's the same at ALL zoom levels
  const worldPixelSize = getWorldPixelSize(zoomScale, TILE_SIZE);

  // Single grid/settlement sizes for child component positioning
  const singleGridPixelSizeBase = TILES_PER_GRID * TILE_SIZE; // Base size, no zoom
  const singleSettlementPixelSizeBase = TILES_PER_SETTLEMENT * TILE_SIZE; // Base size, no zoom
  const singleGridPixelSize = singleGridPixelSizeBase * zoomScale;
  const singleSettlementPixelSize = singleSettlementPixelSizeBase * zoomScale;

  // Current grid position within the 8×8 settlement (for positioning)
  const hasGridPosition = currentGridPosition !== null && currentGridPosition !== undefined;
  const currentGridRow = hasGridPosition ? currentGridPosition.row : 0;
  const currentGridCol = hasGridPosition ? currentGridPosition.col : 0;

  // Current settlement position within the 8×8 frontier (for positioning)
  const hasSettlementPosition = currentSettlementPosition !== null && currentSettlementPosition !== undefined;
  const currentSettlementRow = hasSettlementPosition ? currentSettlementPosition.row : 0;
  const currentSettlementCol = hasSettlementPosition ? currentSettlementPosition.col : 0;

  // Calculate the PixiJS canvas position using unified world coordinates
  // This is the SAME formula at ALL zoom levels - just uses absolute world position
  const currentGridWorldPos = getGridWorldPixelPosition(
    { row: currentGridRow, col: currentGridCol },
    { row: currentSettlementRow, col: currentSettlementCol },
    zoomScale,
    TILE_SIZE
  );

  // For backward compatibility with PixiRendererPadding (will be simplified in Phase 5)
  // These are calculated from the unified world but maintain the interface child components expect
  const paddingSizeBase = singleSettlementPixelSizeBase * WORLD_PADDING_SETTLEMENTS;
  const paddingSize = paddingSizeBase * zoomScale;

  // Settlement offset for PixiRendererSettlementGrids positioning
  // Uses absolute world coordinates - same formula regardless of zoom level
  const settlementOffset = {
    x: paddingSizeBase + currentSettlementCol * singleSettlementPixelSizeBase,
    y: paddingSizeBase + currentSettlementRow * singleSettlementPixelSizeBase
  };

  return (
    // Outer wrapper establishes scroll boundaries - this div's size determines
    // how far the user can scroll in the .homestead container
    // UNIFIED WORLD MODEL: Size is ALWAYS the full world size (6144 tiles) × zoomScale
    // This eliminates coordinate system changes and scroll jumps during zoom
    <div
      className="pixi-world-container"
      style={{
        position: 'relative',
        width: `${worldPixelSize}px`,
        height: `${worldPixelSize}px`,
      }}
    >
      {/* Padding/spillover areas - rendered FIRST so they appear behind all content */}
      {/* In unified world model, padding is the 2-settlement border around the 8×8 frontier */}
      <PixiRendererPadding
        isActive={true}
        baseUnitSize={singleSettlementPixelSizeBase}
        paddingUnits={WORLD_PADDING_SETTLEMENTS}
        zoomScale={zoomScale}
      />
      {/* PixiJS canvas container - positioned at ABSOLUTE world coordinates */}
      {/* UNIFIED WORLD MODEL: Same position formula at ALL zoom levels */}
      {/* overflow:hidden is CRITICAL - the canvas is 2560px with CSS scale transform, */}
      {/* but transforms don't affect layout. Without overflow:hidden, canvas overflows */}
      {/* and creates incorrect scroll bounds */}
      <div
        ref={containerRef}
        className="pixi-container"
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          position: 'absolute',
          top: currentGridWorldPos.y,
          left: currentGridWorldPos.x,
          width: `${singleGridPixelSize}px`,
          height: `${singleGridPixelSize}px`,
          overflow: 'hidden',
          zIndex: 1,
          cursor: 'pointer',
        }}
      />
      {/* Frontier settlement previews (rendered as HTML behind current settlement) */}
      {/* MUST be rendered BEFORE PixiRendererSettlementGrids so current settlement appears on top */}
      {/* Use BASE size (without zoomScale) - component applies zoomScale itself */}
      {/* paddingOffset tells the component where to position relative to scroll container */}
      {/* Hide during zoom animation to prevent flash at wrong scale */}
      <PixiRendererFrontierSettlements
        isActive={isFrontierZoom && !isZoomAnimating}
        currentSettlementPosition={currentSettlementPosition}
        frontierData={frontierData}
        frontierSettlementGrids={frontierSettlementGrids}
        currentPlayer={currentPlayer}
        settlementPixelSize={singleSettlementPixelSizeBase}
        zoomScale={zoomScale}
        onSettlementClick={onFrontierSettlementClick}
        paddingOffset={paddingSize}
      />
      {/* Settlement grid previews (rendered as HTML behind current grid content) */}
      {/* At frontier zoom, settlement grids are positioned within the larger frontier */}
      {/* Hide during zoom animation to prevent flash at wrong scale */}
      <PixiRendererSettlementGrids
        isActive={(isSettlementZoom || isFrontierZoom) && !isZoomAnimating}
        currentGridPosition={currentGridPosition}
        settlementData={settlementData}
        visitedGridTiles={visitedGridTiles}
        players={settlementPlayers}
        TILE_SIZE={TILE_SIZE}
        zoomScale={zoomScale}
        masterResources={masterResources}
        onGridClick={onSettlementGridClick}
        strings={strings}
        settlementOffset={settlementOffset}
        isFrontierZoom={isFrontierZoom}
      />
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
      />
      {/* PC layer with state-based icons */}
      <PixiRendererPCs
        app={appRef.current}
        pcs={pcs}
        currentPlayer={currentPlayer}
        TILE_SIZE={TILE_SIZE}
        connectedPlayers={connectedPlayers}
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
    </div>
  );
};

export default PixiRenderer;
