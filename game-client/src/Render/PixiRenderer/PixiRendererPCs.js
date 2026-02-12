import { useEffect, useRef, useCallback } from 'react';
import { Container, Text, Sprite, Texture } from 'pixi.js-legacy';
import { renderPositions } from '../../PlayerMovement';
import playerIconsData from '../../Authentication/PlayerIcons.json';

// FTUE Cave dungeon grid ID - players in this grid should only see themselves
const FTUE_CAVE_GRID_ID = '695bd5b76545a9be8a36ee22';

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

// Cache for loaded SVG textures
const svgTextureCache = new Map();
const svgLoadingPromises = new Map();

/**
 * PixiRendererPCs - Player Character rendering for PixiJS renderer
 *
 * Handles rendering of:
 * - PC icons (emoji-based, with state modifications)
 * - Offline player transparency
 * - State-based icon changes (dead, low health, camping, in boat)
 * - FTUE isolation (hides other PCs in tutorial dungeon)
 *
 * IMPORTANT: This component uses object pooling to prevent IOSurface/GPU
 * memory exhaustion. Never create Graphics/Text objects in render loops
 * without proper reuse.
 */
const PixiRendererPCs = ({
  app,                    // PixiJS Application instance
  pcs,                    // Array of PC objects
  currentPlayer,          // Current player (for highlight + ID matching)
  TILE_SIZE,              // Tile size in pixels
  connectedPlayers,       // Set of online player IDs (for opacity)
  gridOffset = { x: 0, y: 0 },  // Offset for settlement zoom (current grid position in world)
  gridId,                 // Current grid ID (for FTUE filtering)
}) => {
  const pcContainerRef = useRef(null);

  // Object pools for reuse - prevents memory leaks
  const textPoolRef = useRef([]);           // Pool of Text objects for PC icons (emoji fallback)
  const spritePoolRef = useRef([]);         // Pool of Sprite objects for SVG icons

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
   * Load an SVG texture (async, cached)
   * Fetches SVG, modifies dimensions, then rasterizes at target resolution for crisp display
   */
  const loadSvgTexture = useCallback(async (filename) => {
    if (svgTextureCache.has(filename)) {
      return svgTextureCache.get(filename);
    }
    if (svgLoadingPromises.has(filename)) {
      return svgLoadingPromises.get(filename);
    }

    const promise = (async () => {
      try {
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

        if (texture) {
          svgTextureCache.set(filename, texture);
        }
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
   * Get or create a Text object from the pool
   */
  const getTextFromPool = useCallback((index) => {
    const pool = textPoolRef.current;

    if (index < pool.length) {
      // Reuse existing text
      const text = pool[index];
      text.visible = true;
      return text;
    }

    // Create new text and add to pool
    const newText = new Text('', {
      fontSize: 32, // Will be updated per render
      fontFamily: 'sans-serif',
    });
    newText.resolution = 2;
    newText.anchor.set(0.5, 0.5);
    pool.push(newText);

    // Add to container if it exists
    if (pcContainerRef.current) {
      pcContainerRef.current.addChild(newText);
    }

    return newText;
  }, []);

  /**
   * Get or create a Sprite object from the pool
   */
  const getSpriteFromPool = useCallback((index) => {
    const pool = spritePoolRef.current;

    if (index < pool.length) {
      const sprite = pool[index];
      sprite.visible = true;
      return sprite;
    }

    // Create new sprite and add to pool
    const newSprite = new Sprite();
    newSprite.anchor.set(0.5, 0.5);
    pool.push(newSprite);

    // Add to container if it exists
    if (pcContainerRef.current) {
      pcContainerRef.current.addChild(newSprite);
    }

    return newSprite;
  }, []);

  /**
   * Hide unused text objects in the pool
   */
  const hideUnusedPoolTexts = useCallback((usedCount) => {
    const pool = textPoolRef.current;
    for (let i = usedCount; i < pool.length; i++) {
      pool[i].visible = false;
    }
  }, []);

  /**
   * Hide unused sprite objects in the pool
   */
  const hideUnusedPoolSprites = useCallback((usedCount) => {
    const pool = spritePoolRef.current;
    for (let i = usedCount; i < pool.length; i++) {
      pool[i].visible = false;
    }
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

    // Add any existing pool texts to the container
    textPoolRef.current.forEach(t => {
      if (!t.parent) {
        pcContainer.addChild(t);
      }
    });

    // Add any existing pool sprites to the container
    spritePoolRef.current.forEach(s => {
      if (!s.parent) {
        pcContainer.addChild(s);
      }
    });

    return () => {
      // Cleanup on unmount
      // NOTE: Don't call .destroy() - parent PixiRenderer handles that
      textPoolRef.current = [];
      spritePoolRef.current = [];
      pcContainerRef.current = null;
    };
  }, [app]);

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
   * Render function that updates PC positions
   * Called both on state changes and during animations via ticker
   */
  const renderPCs = useCallback(() => {
    const container = pcContainerRef.current;

    if (!container) return;

    let textsUsed = 0;
    let spritesUsed = 0;

    if (!pcs || pcs.length === 0) {
      hideUnusedPoolTexts(0);
      hideUnusedPoolSprites(0);
      return;
    }

    const fontSize = TILE_SIZE * 0.8;

    for (const pc of pcs) {
      // Get render position (may be animated)
      const renderPos = getPCRenderPosition(pc);
      const posX = renderPos?.x;
      const posY = renderPos?.y;

      if (posX === undefined || posY === undefined) continue;

      // Calculate if this is the current player
      const isCurrentPlayer = currentPlayer && String(pc.playerId) === String(currentPlayer._id);

      // FTUE: In the opening dungeon, only render the current player (hide all other PCs)
      if (gridId === FTUE_CAVE_GRID_ID && !isCurrentPlayer) {
        continue;
      }

      // Check if player is connected (online)
      const isConnected = isCurrentPlayer || connectedPlayers?.has(pc.playerId);

      // Get display icon based on state
      const displayIcon = getDisplayIcon(pc);

      // Check if we have an SVG for this icon
      const svgFilename = getSvgFilename(displayIcon);

      // Calculate position
      const xPos = gridOffset.x + posX * TILE_SIZE + TILE_SIZE / 2;
      const yPos = gridOffset.y + posY * TILE_SIZE + TILE_SIZE / 2;
      const alpha = isConnected ? 1.0 : 0.4;

      if (svgFilename && svgTextureCache.has(svgFilename)) {
        // Use SVG sprite
        const sprite = getSpriteFromPool(spritesUsed);
        const texture = svgTextureCache.get(svgFilename);

        if (texture) {
          sprite.texture = texture;
          sprite.width = TILE_SIZE * 0.9;
          sprite.height = TILE_SIZE * 0.9;
          sprite.x = xPos;
          sprite.y = yPos;
          sprite.alpha = alpha;
          spritesUsed++;
        }
      } else {
        // Use emoji text fallback
        const text = getTextFromPool(textsUsed);
        text.text = displayIcon;
        text.style.fontSize = fontSize;
        text.x = xPos;
        text.y = yPos;
        text.alpha = alpha;
        textsUsed++;

        // If SVG exists but not loaded, trigger load
        if (svgFilename && !svgTextureCache.has(svgFilename)) {
          loadSvgTexture(svgFilename).then(() => {
            // Re-render after texture loads
            renderPCs();
          });
        }
      }
    }

    // Hide unused pool objects
    hideUnusedPoolTexts(textsUsed);
    hideUnusedPoolSprites(spritesUsed);
  }, [pcs, currentPlayer, connectedPlayers, TILE_SIZE, gridOffset, gridId, getDisplayIcon, getSvgFilename, getTextFromPool, getSpriteFromPool, hideUnusedPoolTexts, hideUnusedPoolSprites, getPCRenderPosition, loadSvgTexture]);

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
      // Check if any PC has an active animation position
      const hasActiveAnimations = pcs?.some(pc =>
        pc.playerId && renderPositions[pc.playerId]
      );

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
  }, [pcs, renderPCs]);

  // Check for animations on each render and start ticker if needed
  // This is triggered by parent re-renders when player moves
  useEffect(() => {
    const hasActiveAnimations = pcs?.some(pc =>
      pc.playerId && renderPositions[pc.playerId]
    );
    if (hasActiveAnimations) {
      startAnimationTicker();
    }
  }, [pcs, startAnimationTicker]);

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
