import { useEffect, useRef, useCallback, useMemo } from 'react';
import { Container, Text, Sprite, Texture } from 'pixi.js-legacy';
import { renderPositions } from '../../PlayerMovement';
import playerIconsData from '../../Authentication/PlayerIcons.json';
import { getAtlasTexture } from './AtlasTextures';
import { emojiKey } from '../../Utils/emojiKey';

// Normalize emoji by removing variation selectors (U+FE0F) for consistent matching
const normalizeEmoji = (emoji) => {
  if (!emoji) return emoji;
  return emoji.replace(/\uFE0F/g, '');
};

// Build a static lookup map from emoji value to SVG filename (created once at module load)
const iconToSvgMap = new Map();
['free', 'paid', 'platinum'].forEach(tier => {
  (playerIconsData[tier] || []).forEach(icon => {
    if (icon.filename) {
      iconToSvgMap.set(normalizeEmoji(icon.value), icon.filename);
    }
  });
});

/**
 * PixiRendererPCs - Player Character rendering for PixiJS renderer
 *
 * Single-player: renders ONLY the local player's PC. Other players are never
 * drawn (the game is single-player with asynchronous multiplayer; see
 * docs/refactor-plan.md Phase 1).
 *
 * Handles rendering of:
 * - The local PC icon (emoji-based, with state modifications)
 * - State-based icon changes (dead, low health, camping, in boat)
 *
 * IMPORTANT: This component reuses one pooled Text and one pooled Sprite to
 * prevent IOSurface/GPU memory exhaustion. Never create Graphics/Text objects
 * in render loops without proper reuse.
 */
const PixiRendererPCs = ({
  app,                    // PixiJS Application instance
  pcs,                    // Array of PC objects (single-player: at most the local PC)
  currentPlayer,          // Current player (for ID matching)
  TILE_SIZE,              // Tile size in pixels
  gridOffset = { x: 0, y: 0 },  // Offset for settlement zoom (current grid position in world)
}) => {
  const pcContainerRef = useRef(null);

  // Pooled display objects (one of each; only the local PC is ever drawn)
  const textRef = useRef(null);             // Text object for PC icon (emoji fallback)
  const spriteRef = useRef(null);           // Sprite object for SVG icon

  // Per-instance SVG texture cache (destroyed on unmount). Atlas frames are kept apart
  // in atlasTextureCacheRef because they belong to the shared sheets and must not be destroyed here.
  const svgTextureCacheRef = useRef(new Map());
  const atlasTextureCacheRef = useRef(new Map());
  const svgLoadingPromisesRef = useRef(new Map());
  const isMountedRef = useRef(true);

  // Ref to track if animation ticker is running (on-demand pattern)
  const animationTickerRef = useRef(null);
  // Counter for consecutive frames with no animations (for ticker removal)
  const noAnimationFramesRef = useRef(0);

  /**
   * Get the display icon for a PC based on state
   * Priority: Dead > Low Health > Camping > In Boat > Normal
   */
  const getDisplayIcon = useCallback((pc) => {
    if (pc.hp === 0) return '💀';
    if (pc.hp < 100) return '🤢';
    if (pc.iscamping) return '🏕️';
    if (pc.isinboat) return '🛶';
    return pc.icon || '🧑';
  }, []);

  /**
   * Get SVG filename for an emoji icon (if available)
   */
  const getSvgFilename = useCallback((emoji) => {
    if (!emoji) return null;
    return iconToSvgMap.get(normalizeEmoji(emoji));
  }, []);

  /**
   * Cache key + loader for icons that have no SVG of their own (💀 🤢 🏕️ 🛶, or an emoji
   * icon the art set lacks): the atlas's Twemoji frame, keyed `emoji:<codepoints>`.
   */
  const getEmojiCacheKey = useCallback((emoji) => {
    const key = emojiKey(emoji);
    return key ? `emoji:${key}` : null;
  }, []);

  /**
   * Load an SVG texture (async, cached)
   * Fetches SVG, modifies dimensions, then rasterizes at target resolution for crisp display
   */
  const loadSvgTexture = useCallback(async (filename) => {
    const svgTextureCache = svgTextureCacheRef.current;
    const svgLoadingPromises = svgLoadingPromisesRef.current;
    const atlasTextureCache = atlasTextureCacheRef.current;
    if (atlasTextureCache.has(filename)) {
      return atlasTextureCache.get(filename);
    }
    if (svgTextureCache.has(filename)) {
      return svgTextureCache.get(filename);
    }
    if (svgLoadingPromises.has(filename)) {
      return svgLoadingPromises.get(filename);
    }

    const promise = (async () => {
      try {
        // Atlas first (scripts/build-atlas.js); the SVG rasterisation below is the fallback.
        // `emoji:<key>` names are Twemoji frames and have no SVG to fall back to.
        const isEmojiKey = filename.startsWith('emoji:');
        const atlasTexture = isEmojiKey
          ? await getAtlasTexture('emoji', filename.slice('emoji:'.length))
          : await getAtlasTexture('playerIcons', filename);
        if (atlasTexture) {
          if (isMountedRef.current) atlasTextureCache.set(filename, atlasTexture);
          return atlasTexture;
        }
        if (isEmojiKey) return null;

        // Fetch SVG text so we can modify its dimensions
        const response = await fetch(`/assets/playerIcons/${filename}`);
        if (!response.ok) {
          console.warn(`Failed to load player icon SVG: ${filename}`);
          return null;
        }
        let svgText = await response.text();

        // Render at high resolution for crisp display when zoomed
        const renderSize = 512;

        // Modify SVG dimensions so browser rasterizes at target resolution
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
        const svgElement = svgDoc.documentElement;
        if (svgElement && svgElement.tagName === 'svg') {
          svgElement.setAttribute('width', renderSize);
          svgElement.setAttribute('height', renderSize);
          svgText = new XMLSerializer().serializeToString(svgDoc);
        }

        // Convert modified SVG to blob URL
        const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        // Load into Image and render to canvas
        const texture = await new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = renderSize;
            canvas.height = renderSize;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, renderSize, renderSize);
            URL.revokeObjectURL(url);

            const tex = Texture.from(canvas);
            resolve(tex);
          };
          img.onerror = () => {
            console.warn(`Failed to load player icon SVG image: ${filename}`);
            URL.revokeObjectURL(url);
            resolve(null);
          };
          img.src = url;
        });

        if (!texture) return null;
        if (!isMountedRef.current) {
          // Component went away while the SVG was rasterizing; don't leak the texture
          texture.destroy(true);
          return null;
        }
        svgTextureCache.set(filename, texture);
        return texture;
      } catch (error) {
        console.error(`Error loading player icon SVG ${filename}:`, error);
        return null;
      } finally {
        svgLoadingPromises.delete(filename);
      }
    })();

    svgLoadingPromises.set(filename, promise);
    return promise;
  }, []);

  /**
   * Get (or lazily create) the single pooled Text object
   */
  const getText = useCallback(() => {
    if (textRef.current) {
      textRef.current.visible = true;
      return textRef.current;
    }
    const newText = new Text('', {
      fontSize: 32, // Will be updated per render
      fontFamily: 'sans-serif',
    });
    newText.resolution = 2;
    newText.anchor.set(0.5, 0.5);
    textRef.current = newText;
    if (pcContainerRef.current) {
      pcContainerRef.current.addChild(newText);
    }
    return newText;
  }, []);

  /**
   * Get (or lazily create) the single pooled Sprite object
   */
  const getSprite = useCallback(() => {
    if (spriteRef.current) {
      spriteRef.current.visible = true;
      return spriteRef.current;
    }
    const newSprite = new Sprite();
    newSprite.anchor.set(0.5, 0.5);
    spriteRef.current = newSprite;
    if (pcContainerRef.current) {
      pcContainerRef.current.addChild(newSprite);
    }
    return newSprite;
  }, []);

  const hideText = useCallback(() => {
    if (textRef.current) textRef.current.visible = false;
  }, []);

  const hideSprite = useCallback(() => {
    if (spriteRef.current) spriteRef.current.visible = false;
  }, []);

  // Initialize PC container and persistent graphics
  useEffect(() => {
    if (!app?.stage) return;

    // Find the world container (parent of all game layers)
    const worldContainer = app.stage.children.find(c => c.name === 'world');
    if (!worldContainer) return;

    // Check if container already exists
    let pcContainer = worldContainer.children.find(c => c.name === 'pcs');

    if (!pcContainer) {
      pcContainer = new Container();
      pcContainer.name = 'pcs';

      // Insert after overlays (or at end if not found)
      const overlayContainerIndex = worldContainer.children.findIndex(c => c.name === 'overlays');
      if (overlayContainerIndex >= 0) {
        worldContainer.addChildAt(pcContainer, overlayContainerIndex);
      } else {
        worldContainer.addChild(pcContainer);
      }
    }

    pcContainerRef.current = pcContainer;

    // Re-attach pooled objects if they already exist (app instance changed)
    if (textRef.current && !textRef.current.parent) {
      pcContainer.addChild(textRef.current);
    }
    if (spriteRef.current && !spriteRef.current.parent) {
      pcContainer.addChild(spriteRef.current);
    }

    return () => {
      // Cleanup on unmount
      // NOTE: Don't destroy the Text/Sprite - parent PixiRenderer destroys the stage tree
      if (spriteRef.current) {
        spriteRef.current.texture = Texture.EMPTY;
      }
      textRef.current = null;
      spriteRef.current = null;
      pcContainerRef.current = null;
    };
  }, [app]);

  // Destroy this instance's SVG textures on unmount
  useEffect(() => {
    isMountedRef.current = true;
    const cache = svgTextureCacheRef.current;
    const atlasCache = atlasTextureCacheRef.current;
    const loading = svgLoadingPromisesRef.current;
    return () => {
      isMountedRef.current = false;
      cache.forEach(tex => {
        try { tex.destroy(true); } catch (e) { /* already destroyed */ }
      });
      cache.clear();
      atlasCache.clear(); // not destroyed: the sheets belong to AtlasTextures
      loading.clear();
    };
  }, []);

  /**
   * Get the render position for a PC, checking for animation overrides
   * Animation positions are stored in renderPositions by playerId during smooth movement
   */
  const getPCRenderPosition = useCallback((pc) => {
    const playerId = pc.playerId;
    // Check if there's an animated position for this player
    if (playerId && renderPositions[playerId]) {
      return renderPositions[playerId];
    }
    // Fall back to the actual position
    return pc.position;
  }, []);

  /**
   * The local player's PC record (the only one ever rendered)
   */
  const currentPC = useMemo(() => {
    if (!currentPlayer?._id || !pcs) return null;
    const list = Array.isArray(pcs) ? pcs : Object.values(pcs);
    return list.find(pc => pc && String(pc.playerId) === String(currentPlayer._id)) || null;
  }, [pcs, currentPlayer]);

  /**
   * Render function that updates the local PC's position/icon
   * Called both on state changes and during animations via ticker
   */
  const renderPCs = useCallback(() => {
    const container = pcContainerRef.current;
    if (!container) return;

    const pc = currentPC;
    const renderPos = pc ? getPCRenderPosition(pc) : null;
    const posX = renderPos?.x;
    const posY = renderPos?.y;

    if (!pc || posX === undefined || posY === undefined) {
      hideText();
      hideSprite();
      return;
    }

    // Get display icon based on state
    const displayIcon = getDisplayIcon(pc);

    // Check if we have an SVG for this icon; otherwise use its Twemoji atlas frame
    const svgFilename = getSvgFilename(displayIcon) || getEmojiCacheKey(displayIcon);
    const svgTextureCache = svgTextureCacheRef.current;
    const atlasTextureCache = atlasTextureCacheRef.current;

    // Calculate position
    const xPos = gridOffset.x + posX * TILE_SIZE + TILE_SIZE / 2;
    const yPos = gridOffset.y + posY * TILE_SIZE + TILE_SIZE / 2;

    const cached = svgFilename ? (atlasTextureCache.get(svgFilename) || svgTextureCache.get(svgFilename)) : null;
    const texture = cached && cached.valid !== false && !cached.baseTexture?.destroyed ? cached : null;

    if (texture) {
      // Use SVG sprite
      const sprite = getSprite();
      sprite.texture = texture;
      sprite.width = TILE_SIZE * 0.9;
      sprite.height = TILE_SIZE * 0.9;
      sprite.x = xPos;
      sprite.y = yPos;
      sprite.alpha = 1.0;
      hideText();
    } else {
      // Use emoji text fallback
      const text = getText();
      text.text = displayIcon;
      text.style.fontSize = TILE_SIZE * 0.8;
      text.x = xPos;
      text.y = yPos;
      text.alpha = 1.0;
      hideSprite();

      // If SVG exists but not loaded, trigger load
      if (svgFilename && !svgTextureCache.has(svgFilename) && !atlasTextureCache.has(svgFilename)) {
        loadSvgTexture(svgFilename).then((tex) => {
          // Re-render after texture loads
          if (tex) renderPCs();
        });
      }
    }
  }, [currentPC, TILE_SIZE, gridOffset, getDisplayIcon, getSvgFilename, getEmojiCacheKey, getText, getSprite, hideText, hideSprite, getPCRenderPosition, loadSvgTexture]);

  // Initial render and re-render on state changes
  useEffect(() => {
    renderPCs();
  }, [renderPCs]);

  // Start animation loop on-demand when animations are detected
  // IMPORTANT: Uses requestAnimationFrame instead of PixiJS ticker to ensure smooth
  // PC movement even when the main render is capped at 30fps. This decouples
  // PC position updates from the scene render rate.
  const startAnimationTicker = useCallback(() => {
    if (animationTickerRef.current) return; // Already running

    const onFrame = () => {
      // Check if the local PC has an active animation position
      const hasActiveAnimations = !!(currentPC?.playerId && renderPositions[currentPC.playerId]);

      if (hasActiveAnimations) {
        noAnimationFramesRef.current = 0;
        renderPCs();
        // Continue the animation loop
        animationTickerRef.current = requestAnimationFrame(onFrame);
      } else {
        // No animations - increment counter and stop after a few idle frames
        noAnimationFramesRef.current++;
        if (noAnimationFramesRef.current > 5) {
          // Stop the animation loop when idle to save CPU
          animationTickerRef.current = null;
          noAnimationFramesRef.current = 0;
        } else {
          // Keep checking for a few more frames
          animationTickerRef.current = requestAnimationFrame(onFrame);
        }
      }
    };

    animationTickerRef.current = requestAnimationFrame(onFrame);
  }, [currentPC, renderPCs]);

  // Check for animations on each render and start ticker if needed
  // This is triggered by parent re-renders when player moves
  useEffect(() => {
    if (currentPC?.playerId && renderPositions[currentPC.playerId]) {
      startAnimationTicker();
    }
  }, [currentPC, startAnimationTicker]);

  // Cleanup animation loop on unmount
  useEffect(() => {
    return () => {
      if (animationTickerRef.current) {
        cancelAnimationFrame(animationTickerRef.current);
        animationTickerRef.current = null;
      }
    };
  }, []);

  // This component doesn't render any DOM elements
  return null;
};

export default PixiRendererPCs;
