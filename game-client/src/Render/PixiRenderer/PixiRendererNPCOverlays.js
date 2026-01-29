import { useEffect, useRef, useCallback } from 'react';
import { Container, Sprite, Text, Texture } from 'pixi.js-legacy';
import { checkQuestNPCStatus, checkTradeNPCStatus, checkKentNPCStatus } from '../RenderDynamicElements';
import { OVERLAY_SVG_MAPPING, OVERLAY_EMOJI_MAPPING } from '../../Utils/ResourceOverlayUtils';

/**
 * PixiRendererNPCOverlays - Status overlay indicators for NPCs
 *
 * Renders overlays for:
 * - Quest NPCs: checkmark (completed quest reward ready) or hand (quest available)
 * - Trade NPCs: hand indicator
 * - Kent NPC: checkmark when player can afford an offer
 *
 * IMPORTANT: Uses object pooling to prevent GPU memory exhaustion.
 */

// SVG texture cache (shared with main PixiRenderer)
const overlayTextureCache = new Map();
const overlayLoadingPromises = new Map();

/**
 * Load an overlay SVG and create a PixiJS texture
 */
const loadOverlayTexture = async (filename, size) => {
  const cacheKey = `overlay-${filename}-${size}`;

  if (overlayTextureCache.has(cacheKey)) {
    const cachedTexture = overlayTextureCache.get(cacheKey);
    // Check if texture is still valid (not destroyed by WebGL context loss)
    if (cachedTexture && cachedTexture.valid !== false && cachedTexture.baseTexture?.valid !== false) {
      return cachedTexture;
    }
    // Texture is invalid, remove from cache and reload
    overlayTextureCache.delete(cacheKey);
  }

  if (overlayLoadingPromises.has(cacheKey)) {
    return overlayLoadingPromises.get(cacheKey);
  }

  const loadPromise = (async () => {
    try {
      const response = await fetch(`/assets/overlays/${filename}`);
      if (!response.ok) {
        console.warn(`Overlay SVG not found: ${filename}`);
        return null;
      }

      const svgText = await response.text();

      const canvas = document.createElement('canvas');
      const devicePixelRatio = window.devicePixelRatio || 1;
      const renderSize = Math.ceil(size * devicePixelRatio);
      canvas.width = renderSize;
      canvas.height = renderSize;

      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      const texture = await new Promise((resolve) => {
        const img = new Image();

        const loadTimeout = setTimeout(() => {
          URL.revokeObjectURL(url);
          resolve(null);
        }, 5000);

        img.onload = () => {
          clearTimeout(loadTimeout);
          try {
            ctx.drawImage(img, 0, 0, renderSize, renderSize);
            const pixiTexture = Texture.from(canvas);
            resolve(pixiTexture);
          } catch (error) {
            resolve(null);
          } finally {
            URL.revokeObjectURL(url);
          }
        };

        img.onerror = () => {
          clearTimeout(loadTimeout);
          URL.revokeObjectURL(url);
          resolve(null);
        };

        img.src = url;
      });

      if (texture) {
        overlayTextureCache.set(cacheKey, texture);
      }

      return texture;
    } catch (error) {
      console.error(`Error loading overlay SVG ${filename}:`, error);
      return null;
    } finally {
      overlayLoadingPromises.delete(cacheKey);
    }
  })();

  overlayLoadingPromises.set(cacheKey, loadPromise);
  return loadPromise;
};

const PixiRendererNPCOverlays = ({
  app,                    // PixiJS Application instance
  npcs,                   // Array of NPCs
  currentPlayer,          // Current player object (for quest/Kent status)
  masterResources,        // Master resources (for trade NPCs)
  TILE_SIZE,              // Tile size in pixels
  gridOffset = { x: 0, y: 0 },  // Offset for settlement zoom (current grid position in world)
  getNPCRenderPosition,   // Function to get animated NPC position
  npcAnimations,          // Ref to NPC animation state (for ticker updates)
}) => {
  const overlayContainerRef = useRef(null);

  // Object pool for overlay sprites/text
  const overlayPoolRef = useRef([]);      // Pool of { sprite, text, active, npcId }
  const renderVersionRef = useRef(0);      // For cancelling stale async renders

  // Cache for NPC overlay status to avoid redundant async calls
  const statusCacheRef = useRef(new Map());

  // Track overlay assignments to NPCs for animation updates
  const overlayAssignmentsRef = useRef(new Map()); // npcId -> { overlay, overlaySize }

  // Ref to track if animation ticker is running (on-demand pattern)
  const animationTickerRef = useRef(null);
  // Counter for consecutive frames with no animations
  const noAnimationFramesRef = useRef(0);

  /**
   * Get or create an overlay display object from the pool
   */
  const getOverlayFromPool = useCallback((index) => {
    const pool = overlayPoolRef.current;
    const container = overlayContainerRef.current;

    if (index < pool.length) {
      const overlay = pool[index];
      overlay.active = true;
      if (overlay.sprite) overlay.sprite.visible = false;
      if (overlay.text) overlay.text.visible = false;
      return overlay;
    }

    // Create new overlay object
    const sprite = new Sprite();
    sprite.visible = false;

    const text = new Text('', {
      fontSize: 12,
      fontFamily: 'sans-serif',
    });
    text.resolution = 2;
    text.visible = false;

    const overlay = { sprite, text, active: true };
    pool.push(overlay);

    if (container) {
      container.addChild(sprite);
      container.addChild(text);
    }

    return overlay;
  }, []);

  /**
   * Hide unused overlays in the pool
   */
  const hideUnusedOverlays = useCallback((usedCount) => {
    const pool = overlayPoolRef.current;
    for (let i = usedCount; i < pool.length; i++) {
      pool[i].active = false;
      if (pool[i].sprite) pool[i].sprite.visible = false;
      if (pool[i].text) pool[i].text.visible = false;
    }
  }, []);

  /**
   * Calculate overlay size based on zoom level
   */
  const getOverlaySize = useCallback(() => {
    if (TILE_SIZE <= 16) {
      return Math.max(6, TILE_SIZE * 0.35);
    } else if (TILE_SIZE <= 30) {
      return Math.max(10, TILE_SIZE * 0.35);
    } else {
      return Math.max(14, TILE_SIZE * 0.35);
    }
  }, [TILE_SIZE]);

  // Initialize overlay container
  useEffect(() => {
    if (!app?.stage) return;

    // Find the world container (parent of all game layers)
    const worldContainer = app.stage.children.find(c => c.name === 'world');
    if (!worldContainer) return;

    // Check if container already exists
    let overlayContainer = worldContainer.children.find(c => c.name === 'npc-overlays');

    if (!overlayContainer) {
      overlayContainer = new Container();
      overlayContainer.name = 'npc-overlays';

      // Add after npcs container but before overlays (higher z-order than NPCs)
      const overlaysIndex = worldContainer.children.findIndex(c => c.name === 'overlays');
      if (overlaysIndex >= 0) {
        worldContainer.addChildAt(overlayContainer, overlaysIndex);
      } else {
        worldContainer.addChild(overlayContainer);
      }
    }

    overlayContainerRef.current = overlayContainer;

    // Add existing pool items to container
    overlayPoolRef.current.forEach(o => {
      if (o.sprite && !o.sprite.parent) overlayContainer.addChild(o.sprite);
      if (o.text && !o.text.parent) overlayContainer.addChild(o.text);
    });

    return () => {
      // Cleanup on unmount - destroy textures properly to release GPU resources
      overlayPoolRef.current = [];
      statusCacheRef.current.clear();
      // Destroy each cached texture before clearing
      for (const texture of overlayTextureCache.values()) {
        if (texture && texture.destroy) {
          try {
            texture.destroy(true);
          } catch (e) {
            // Texture may already be destroyed
          }
        }
      }
      overlayTextureCache.clear();
      overlayLoadingPromises.clear();
      overlayContainerRef.current = null;
    };
  }, [app]);

  // Render NPC overlays
  useEffect(() => {
    const container = overlayContainerRef.current;
    if (!container || !npcs) return;

    // Increment render version to cancel stale async renders
    renderVersionRef.current += 1;
    const thisRenderVersion = renderVersionRef.current;

    const renderOverlays = async () => {
      let overlaysUsed = 0;
      const overlaySize = getOverlaySize();

      for (const npc of npcs) {
        // Check if render is still current
        if (thisRenderVersion !== renderVersionRef.current) return;
        if (!overlayContainerRef.current) return;

        // Skip NPCs without valid position
        if (!npc.position) continue;

        // Determine overlay type based on NPC action
        let overlayType = null;

        // Check quest NPCs (including Kent)
        if (npc.action === 'quest') {
          // Use cached status if available (async call optimization)
          const cacheKey = `${npc.type}-${currentPlayer?._id}-${currentPlayer?.activeQuests?.length || 0}`;

          if (statusCacheRef.current.has(cacheKey)) {
            overlayType = statusCacheRef.current.get(cacheKey);
          } else {
            overlayType = await checkQuestNPCStatus(npc, currentPlayer);
            statusCacheRef.current.set(cacheKey, overlayType);
          }

          // For Kent, also check affordable offers if no quest overlay
          if (!overlayType && npc.type === 'Kent') {
            overlayType = checkKentNPCStatus(npc, currentPlayer);
          }
        }
        // Check trade NPCs
        else if (npc.action === 'trade') {
          const tradeStatus = checkTradeNPCStatus(npc, masterResources);
          // Trade NPCs show 'available' (hand) overlay if they have trade items
          if (tradeStatus) {
            overlayType = 'available';
          }
        }

        // Check if render is still current after async call
        if (thisRenderVersion !== renderVersionRef.current) return;

        // Skip if no overlay needed
        if (!overlayType) continue;

        // Get SVG filename and emoji fallback
        let svgFilename = OVERLAY_SVG_MAPPING[overlayType];

        // For trade item symbols (short strings), use hand as fallback
        if (!svgFilename && overlayType && overlayType.length <= 3) {
          svgFilename = OVERLAY_SVG_MAPPING['available']; // hand.svg
        }

        // Calculate position (lower-left corner of NPC tile)
        // Use animated position if available, otherwise use npc.position
        const renderPos = getNPCRenderPosition ? getNPCRenderPosition(npc) : npc.position;
        // Apply grid offset for settlement zoom
        const npcX = gridOffset.x + renderPos.x * TILE_SIZE;
        const npcY = gridOffset.y + renderPos.y * TILE_SIZE;
        const overlayX = npcX + 2;
        const overlayY = npcY + TILE_SIZE - overlaySize - 2;

        // Get overlay from pool
        const overlay = getOverlayFromPool(overlaysUsed);

        // Track this overlay's assignment to the NPC for animation updates
        overlayAssignmentsRef.current.set(npc.id, { overlay, overlaySize, npc });

        // Try to load SVG texture
        if (svgFilename) {
          const texture = await loadOverlayTexture(svgFilename, overlaySize);

          // Check again after async load
          if (thisRenderVersion !== renderVersionRef.current) return;

          if (texture && texture.valid !== false) {
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

        // Emoji fallback
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

      // Hide unused overlays
      hideUnusedOverlays(overlaysUsed);

      // Clean up assignments for NPCs that no longer have overlays
      const currentNpcIds = new Set(npcs.filter(n => n.position).map(n => n.id));
      for (const npcId of overlayAssignmentsRef.current.keys()) {
        if (!currentNpcIds.has(npcId)) {
          overlayAssignmentsRef.current.delete(npcId);
        }
      }

      if (overlaysUsed > 0) {
        // console.log(`📌 PixiJS rendered ${overlaysUsed} NPC overlays`);
      }
    };

    renderOverlays();

    // Clear status cache when dependencies change significantly
    return () => {
      statusCacheRef.current.clear();
    };
  }, [npcs, currentPlayer, masterResources, TILE_SIZE, gridOffset,
      getOverlayFromPool, hideUnusedOverlays, getOverlaySize, getNPCRenderPosition]);

  // Start animation ticker on-demand when NPC animations are detected
  // This prevents continuous 60fps polling when NPCs are idle
  const startAnimationTicker = useCallback(() => {
    if (animationTickerRef.current) return; // Already running
    if (!app?.ticker || !npcAnimations) return;

    const ticker = app.ticker;

    const onTick = () => {
      // Check if any NPC has an active animation
      const hasActiveAnimations = Object.values(npcAnimations.current || {}).some(
        anim => anim && anim.duration > 0
      );

      if (hasActiveAnimations) {
        noAnimationFramesRef.current = 0;

        // Update positions for all tracked overlays
        for (const assignment of overlayAssignmentsRef.current.values()) {
          const { overlay, overlaySize, npc } = assignment;
          if (!overlay || !npc) continue;

          // Get the current animated position
          const renderPos = getNPCRenderPosition ? getNPCRenderPosition(npc) : npc.position;
          if (!renderPos) continue;

          // Calculate new position
          const npcX = gridOffset.x + renderPos.x * TILE_SIZE;
          const npcY = gridOffset.y + renderPos.y * TILE_SIZE;
          const overlayX = npcX + 2;
          const overlayY = npcY + TILE_SIZE - overlaySize - 2;

          // Update sprite position if visible
          if (overlay.sprite?.visible) {
            overlay.sprite.x = overlayX;
            overlay.sprite.y = overlayY;
          }

          // Update text position if visible
          if (overlay.text?.visible) {
            overlay.text.x = overlayX;
            overlay.text.y = overlayY;
          }
        }
      } else {
        // No animations - increment counter and remove ticker after a few idle frames
        noAnimationFramesRef.current++;
        if (noAnimationFramesRef.current > 5) {
          try {
            ticker.remove(onTick);
          } catch (e) {
            // Ticker may be destroyed
          }
          animationTickerRef.current = null;
          noAnimationFramesRef.current = 0;
        }
      }
    };

    animationTickerRef.current = onTick;
    ticker.add(onTick);
  }, [app, npcAnimations, getNPCRenderPosition, TILE_SIZE, gridOffset]);

  // Check for animations when npcAnimations changes and start ticker if needed
  useEffect(() => {
    if (!npcAnimations?.current) return;

    const hasActiveAnimations = Object.values(npcAnimations.current).some(
      anim => anim && anim.duration > 0
    );
    if (hasActiveAnimations) {
      startAnimationTicker();
    }
  }, [npcAnimations, startAnimationTicker]);

  // Cleanup animation ticker on unmount
  useEffect(() => {
    return () => {
      if (animationTickerRef.current && app?.ticker) {
        try {
          app.ticker.remove(animationTickerRef.current);
        } catch (e) {
          // Ticker may be destroyed
        }
        animationTickerRef.current = null;
      }
    };
  }, [app]);

  // This component doesn't render any DOM elements
  return null;
};

export default PixiRendererNPCOverlays;
