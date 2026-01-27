import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { Application, Container, Graphics, Text, Sprite, Texture } from 'pixi.js-legacy';
import { tileColors, defaultTileColor } from '../../UI/Styles/tileColors';
import { getResourceOverlayStatus, getNPCOverlayStatus, OVERLAY_SVG_MAPPING, OVERLAY_EMOJI_MAPPING } from '../../Utils/ResourceOverlayUtils';
import { handleNPCClickShared } from '../../GameFeatures/NPCs/NPCInteractionUtils';
import { generateResourceTooltip, generateNPCTooltip, generatePCTooltip } from '../RenderDynamicElements';
import { calculateTooltipPosition } from '../../Utils/TooltipUtils';
import PixiRendererVFX from './PixiRendererVFX';
import PixiRendererPCs from './PixiRendererPCs';
import PixiRendererCursor from './PixiRendererCursor';
import PixiRendererSpeech from './PixiRendererSpeech';
import PixiRendererNPCOverlays from './PixiRendererNPCOverlays';
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
 * Clear all cached textures (called on unmount to prevent stale references)
 */
const clearTextureCache = () => {
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

  // Return cached texture if available
  if (svgTextureCache.has(cacheKey)) {
    return svgTextureCache.get(cacheKey);
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
 * Convert CSS hex color string to PixiJS hex number
 * Handles both #RRGGBB and #RRGGBBAA formats
 */
const hexStringToPixiHex = (hexString) => {
  if (!hexString) return 0x228B22; // default green
  // Remove # and take only RGB portion (ignore alpha if present)
  const hex = hexString.replace('#', '').substring(0, 6);
  return parseInt(hex, 16);
};

/**
 * Get PixiJS-compatible tile color from tile type
 */
const getPixiTileColor = (tileType) => {
  const colorString = tileColors[tileType] || defaultTileColor;
  return hexStringToPixiHex(colorString);
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
}) => {
  const containerRef = useRef(null);
  const appRef = useRef(null);
  const worldContainerRef = useRef(null);  // Parent container for all game layers - zoom applied here
  const tileContainerRef = useRef(null);
  const resourceContainerRef = useRef(null);
  const npcContainerRef = useRef(null);
  // pcContainerRef removed - now managed by PixiRendererPCs component
  const overlayContainerRef = useRef(null);

  // Hovered tile for cursor highlight (tracked from mouse move)
  const [hoveredTile, setHoveredTile] = useState(null);

  // Render version tracking to prevent stale async renders
  // When TILE_SIZE changes, we increment these versions to invalidate in-flight renders
  const resourceRenderVersionRef = useRef(0);
  const overlayRenderVersionRef = useRef(0);

  // Animation system for smooth NPC/PC movement
  // NOTE: Animation is DISABLED to prevent GPU memory exhaustion crash
  // The animationTick state trigger was causing 60fps re-renders which created
  // new PixiJS objects every frame without releasing old ones, causing IOSurface exhaustion.
  // To properly implement smooth animation, we need to keep refs to display objects
  // and update their positions directly instead of recreating them.
  // const npcAnimations = useRef({});
  // const pcAnimations = useRef({});
  // const animationFrameId = useRef(null);
  // const [animationTick, setAnimationTick] = useState(0);

  // Calculate crafting and trading status for dynamic overlays (same as RenderDynamicElements)
  const currentTime = Date.now();

  const computedCraftingStatus = useMemo(() => {
    if (!resources) return { ready: [], searching: [], hungry: [], inProgress: [] };

    return resources.reduce((acc, res) => {
      if ((res.category === 'crafting' || res.category === 'farmhouse') && res.craftEnd) {
        const key = `${res.x}-${res.y}`;
        if (res.craftEnd < currentTime) {
          acc.ready.push(key);
        } else {
          acc.inProgress.push(key);
        }
      } else if (res.category === 'farmplot' && res.isSearching) {
        const key = `${res.x}-${res.y}`;
        acc.searching.push(key);
      } else if (res.category === 'farmplot' && res.growEnd) {
        const key = `${res.x}-${res.y}`;
        if (res.growEnd < currentTime) {
          acc.ready.push(key);
        }
      } else if (res.category === 'pet') {
        const key = `${res.x}-${res.y}`;
        if (res.craftEnd && res.craftedItem) {
          if (res.craftEnd < currentTime) {
            acc.ready.push(key); // Pet has a reward ready
          } else {
            acc.inProgress.push(key); // Pet is feeding
          }
        }
      }
      return acc;
    }, { ready: [], searching: [], hungry: [], inProgress: [] });
  }, [resources, currentTime]);

  // Check for completed trades at Trading Post
  const computedTradingStatus = useMemo(() => {
    if (!resources || !currentPlayer?.tradeStall) return { completed: [] };

    return resources.reduce((acc, res) => {
      if (res.type === 'Trading Post' && currentPlayer.tradeStall) {
        const hasCompletedTrades = currentPlayer.tradeStall.some(trade =>
          trade && (
            (trade.sellTime && new Date(trade.sellTime) < currentTime) ||
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
  }, [resources, currentPlayer?.tradeStall, currentTime]);

  // Animation system DISABLED - see note above about GPU memory exhaustion
  // These functions would need to directly update display object positions
  // rather than triggering React re-renders

  // Get current render position for NPC (no animation - direct position)
  const getNPCRenderPosition = useCallback((npc) => {
    return npc.position || { x: npc.x, y: npc.y };
  }, []);

  // Note: PC render position is now handled by PixiRendererPCs component

  // Initialize PixiJS Application
  useEffect(() => {
    if (!containerRef.current || appRef.current) return;

    const initPixi = () => {
      // Calculate canvas size
      const gridSize = 64;
      const worldWidth = gridSize * TILE_SIZE;
      const worldHeight = gridSize * TILE_SIZE;

      // Create PixiJS Application with legacy support (WebGL with Canvas fallback)
      // pixi.js-legacy v7 uses constructor pattern, not async init()
      const app = new Application({
        width: worldWidth,
        height: worldHeight,
        backgroundColor: 0x1a1a2e, // Dark background
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        antialias: true,
        // Legacy mode automatically falls back to Canvas 2D if WebGL unavailable
      });

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

      // Log renderer type for debugging
      // v7: RENDERER_TYPE.WEBGL = 1, RENDERER_TYPE.CANVAS = 2
      console.log(`🎮 PixiJS initialized with ${app.renderer.type === 1 ? 'WebGL' : 'Canvas'} renderer`);
    };

    initPixi();

    // Cleanup on unmount
    return () => {
      if (appRef.current) {
        appRef.current.destroy(true, { children: true, texture: true });
        appRef.current = null;
      }
      // Clear texture cache to prevent stale texture references on remount
      clearTextureCache();
    };
  }, []); // Only run once on mount

  // Apply zoom using CSS transform ONLY (no PixiJS world container scaling)
  // This keeps the PixiJS coordinate system 1:1 with the base TILE_SIZE,
  // while CSS handles the visual scaling. Click coordinates are automatically
  // handled because getBoundingClientRect returns the transformed size.
  useEffect(() => {
    if (!appRef.current || !worldContainerRef.current) return;

    const gridSize = 64;
    const baseWorldSize = gridSize * TILE_SIZE;

    // Keep renderer at BASE size
    appRef.current.renderer.resize(baseWorldSize, baseWorldSize);

    // NO world container scaling - keep at 1.0
    // The zoom effect comes purely from CSS transform
    worldContainerRef.current.scale.set(1.0);

    // Use CSS transform to scale the canvas visually
    // This makes the canvas APPEAR larger without changing PixiJS coordinates
    const canvas = appRef.current.view;
    canvas.style.width = `${baseWorldSize}px`;
    canvas.style.height = `${baseWorldSize}px`;
    canvas.style.transformOrigin = 'top left';
    canvas.style.transform = `scale(${zoomScale})`;

    // Debug: Log the actual canvas dimensions to verify setup
    console.log(`🔍 [ZOOM DEBUG] ======================================`);
    console.log(`🔍 [ZOOM DEBUG] zoomScale=${zoomScale}, TILE_SIZE=${TILE_SIZE}`);
    console.log(`🔍 [ZOOM DEBUG] Base size: ${baseWorldSize}px`);
    console.log(`🔍 [ZOOM DEBUG] Canvas CSS transform: scale(${zoomScale})`);
    console.log(`🔍 [ZOOM DEBUG] World container scale: ${worldContainerRef.current.scale.x} (should be 1.0)`);
    console.log(`🔍 [ZOOM DEBUG] ======================================`);
  }, [TILE_SIZE, zoomScale]);

  // Render tiles (Phase 1 - Basic colored rectangles)
  useEffect(() => {
    if (!tileContainerRef.current || !grid || !tileTypes) return;

    const tileContainer = tileContainerRef.current;

    // Clear existing tiles
    tileContainer.removeChildren();

    // Draw tiles - uses centralized tileColors from tileColors.js
    // v7 Graphics API: beginFill(), drawRect(), endFill(), lineStyle()
    const rows = grid.length;
    const cols = grid[0]?.length || 0;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const tileType = tileTypes[row]?.[col] || 'g';
        const color = getPixiTileColor(tileType);

        const tile = new Graphics();
        // Fill the tile
        tile.beginFill(color);
        tile.drawRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        tile.endFill();

        // Add subtle border
        tile.lineStyle(0.5, 0x000000, 0.1);
        tile.drawRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);

        tileContainer.addChild(tile);
      }
    }

    console.log(`🗺️ PixiJS rendered ${rows * cols} tiles`);
  }, [grid, tileTypes]); // TILE_SIZE removed - it's constant now, zoom handled by container transform

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

      // Check if render is still valid after parallel load
      if (thisRenderVersion !== resourceRenderVersionRef.current) {
        console.log(`🚫 Resource render v${thisRenderVersion} cancelled after parallel load (now v${resourceRenderVersionRef.current})`);
        return;
      }
      if (!resourceContainerRef.current) return;

      // Phase 3: Render all resources synchronously (no more awaits)
      let svgCount = 0;
      let emojiCount = 0;

      for (const { resource, texture } of loadedResources) {
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

      console.log(`🌲 PixiJS rendered ${svgCount} SVG + ${emojiCount} emoji resources (${resources.length} total, parallel load)`);
    };

    renderResources();
  }, [resources, masterResources]); // TILE_SIZE removed - it's constant now, zoom handled by container transform

  // Render NPCs (Phase 1 - Emoji symbols)
  // Note: Range indicators are now handled by PixiRendererVFX component
  useEffect(() => {
    if (!npcContainerRef.current || !npcs) return;

    const npcContainer = npcContainerRef.current;

    // Clear existing NPCs
    npcContainer.removeChildren();

    // Render each NPC as emoji text
    for (const npc of npcs) {
      // Get render position
      const renderPos = getNPCRenderPosition(npc);
      const posX = renderPos?.x;
      const posY = renderPos?.y;

      if (posX === undefined || posY === undefined) continue;

      // Render NPC emoji
      if (!npc.symbol) continue;

      const fontSize = TILE_SIZE * 0.8;

      const text = new Text(npc.symbol, {
        fontSize: fontSize,
        fontFamily: 'sans-serif',
      });
      text.resolution = 2;

      // Position at center of tile (using animated position)
      text.anchor.set(0.5, 0.5);
      text.x = posX * TILE_SIZE + TILE_SIZE / 2;
      text.y = posY * TILE_SIZE + TILE_SIZE / 2;

      npcContainer.addChild(text);
    }

    console.log(`👤 PixiJS rendered ${npcs.length} NPCs`);
  }, [npcs, getNPCRenderPosition]); // TILE_SIZE removed - it's constant now, zoom handled by container transform

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
        // CRITICAL: Check if this render is still current (TILE_SIZE may have changed)
        if (thisRenderVersion !== overlayRenderVersionRef.current) {
          console.log(`🚫 Overlay render v${thisRenderVersion} cancelled (now v${overlayRenderVersionRef.current})`);
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
        const overlaySize = TILE_SIZE * 0.4;
        const x = resource.x * TILE_SIZE + 2;
        const y = resource.y * TILE_SIZE + TILE_SIZE - overlaySize - 2;

        if (svgFilename) {
          // Try to load SVG overlay (loads at fixed base size, scaled via sprite)
          const texture = await loadSVGTexture(svgFilename, true);

          // CRITICAL: Check again after await - render may have been invalidated
          if (thisRenderVersion !== overlayRenderVersionRef.current) {
            console.log(`🚫 Overlay render v${thisRenderVersion} cancelled after SVG load (now v${overlayRenderVersionRef.current})`);
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

          const npcX = Math.floor(npc.position?.x || 0) * TILE_SIZE;
          const npcY = Math.floor(npc.position?.y || 0) * TILE_SIZE;

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
        console.log(`✨ PixiJS rendered ${overlayCount} overlays`);
      }
    };

    renderOverlays();
  }, [resources, npcs, computedCraftingStatus, computedTradingStatus, badgeState, electionPhase, currentPlayer]); // TILE_SIZE removed - it's constant now

  // Handle click events - check NPCs and PCs before falling through to tile click
  const handleClick = useCallback((event) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;

    // Convert screen coordinates to world coordinates
    // The canvas is CSS-scaled by zoomScale, so screen coords are in scaled space
    // Divide by zoomScale to get canvas/world coordinates (world container scale is 1.0)
    const worldX = screenX / zoomScale;
    const worldY = screenY / zoomScale;

    const col = Math.floor(worldX / TILE_SIZE);
    const row = Math.floor(worldY / TILE_SIZE);

    // Debug click coordinates
    console.log(`🖱️ [CLICK DEBUG] screen=(${screenX.toFixed(1)}, ${screenY.toFixed(1)})`);
    console.log(`🖱️ [CLICK DEBUG] zoomScale=${zoomScale}, TILE_SIZE=${TILE_SIZE}`);
    console.log(`🖱️ [CLICK DEBUG] world=(${worldX.toFixed(1)}, ${worldY.toFixed(1)})`);
    console.log(`🖱️ [CLICK DEBUG] tile=(${col}, ${row})`);

    if (row < 0 || row >= 64 || col < 0 || col >= 64) return;

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
  const handleMouseMove = useCallback((event) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;

    // Convert screen coordinates to world coordinates (account for zoom scale)
    const worldX = screenX / zoomScale;
    const worldY = screenY / zoomScale;

    const col = Math.floor(worldX / TILE_SIZE);
    const row = Math.floor(worldY / TILE_SIZE);

    if (row < 0 || row >= 64 || col < 0 || col >= 64) {
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

  // Calculate the actual grid size for scroll boundaries
  const gridPixelSize = 64 * TILE_SIZE * zoomScale;

  return (
    // Outer wrapper establishes scroll boundaries - this div's size determines
    // how far the user can scroll in the .homestead container
    <div
      style={{
        position: 'relative',
        width: `${gridPixelSize}px`,
        height: `${gridPixelSize}px`,
        // Prevent any overflow that could extend scroll area
        overflow: 'hidden',
      }}
    >
      <div
        ref={containerRef}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: `${gridPixelSize}px`,
          height: `${gridPixelSize}px`,
          zIndex: 1,
          cursor: 'pointer',
        }}
      />
      {/* Cursor highlight for placement modes */}
      <PixiRendererCursor
        app={appRef.current}
        hoveredTile={hoveredTile}
        cursorMode={cursorMode}
        TILE_SIZE={TILE_SIZE}
      />
      {/* VFX layer for range indicators and other effects */}
      <PixiRendererVFX
        app={appRef.current}
        npcs={npcs}
        pcs={pcs}
        currentPlayer={currentPlayer}
        TILE_SIZE={TILE_SIZE}
        masterResources={masterResources}
      />
      {/* PC layer with state-based icons */}
      <PixiRendererPCs
        app={appRef.current}
        pcs={pcs}
        currentPlayer={currentPlayer}
        TILE_SIZE={TILE_SIZE}
        connectedPlayers={connectedPlayers}
      />
      {/* Speech bubbles and relationship outcomes */}
      <PixiRendererSpeech
        app={appRef.current}
        npcs={npcs}
        pcs={pcs}
        currentPlayer={currentPlayer}
        TILE_SIZE={TILE_SIZE}
      />
      {/* NPC status overlays (quest checkmarks, trade indicators) */}
      <PixiRendererNPCOverlays
        app={appRef.current}
        npcs={npcs}
        currentPlayer={currentPlayer}
        masterResources={masterResources}
        TILE_SIZE={TILE_SIZE}
      />
    </div>
  );
};

export default PixiRenderer;
