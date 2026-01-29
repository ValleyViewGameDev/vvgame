import { useEffect, useRef, useCallback } from 'react';
import { Graphics, Container, Text } from 'pixi.js-legacy';
import { renderPositions } from '../../PlayerMovement';

// FTUE Cave dungeon grid ID - players in this grid should only see themselves
const FTUE_CAVE_GRID_ID = '695bd5b76545a9be8a36ee22';

/**
 * PixiRendererPCs - Player Character rendering for PixiJS renderer
 *
 * Handles rendering of:
 * - PC icons (emoji-based, with state modifications)
 * - Current player highlight (yellow circle)
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
  const textPoolRef = useRef([]);           // Pool of Text objects for PC icons
  const highlightGraphicRef = useRef(null); // Single Graphics for current player highlight

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
   * Hide unused text objects in the pool
   */
  const hideUnusedPoolTexts = useCallback((usedCount) => {
    const pool = textPoolRef.current;
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

    // Create persistent highlight graphic (only one current player)
    if (!highlightGraphicRef.current) {
      highlightGraphicRef.current = new Graphics();
      // Add highlight first so it renders behind text
      pcContainer.addChildAt(highlightGraphicRef.current, 0);
    }

    // Add any existing pool texts to the container
    textPoolRef.current.forEach(t => {
      if (!t.parent) {
        pcContainer.addChild(t);
      }
    });

    return () => {
      // Cleanup on unmount
      // NOTE: Don't call .destroy() - parent PixiRenderer handles that
      highlightGraphicRef.current = null;
      textPoolRef.current = [];
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
    const highlightGraphic = highlightGraphicRef.current;

    if (!container || !highlightGraphic) return;

    // Clear highlight (will redraw if needed)
    highlightGraphic.clear();
    highlightGraphic.visible = false;

    let textsUsed = 0;

    if (!pcs || pcs.length === 0) {
      hideUnusedPoolTexts(0);
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

      // Get a text object from the pool
      const text = getTextFromPool(textsUsed);

      // Update text properties
      // Apply grid offset for settlement zoom
      text.text = displayIcon;
      text.style.fontSize = fontSize;
      text.x = gridOffset.x + posX * TILE_SIZE + TILE_SIZE / 2;
      text.y = gridOffset.y + posY * TILE_SIZE + TILE_SIZE / 2;
      text.alpha = isConnected ? 1.0 : 0.4;

      // Draw highlight for current player
      if (isCurrentPlayer) {
        highlightGraphic.beginFill(0xFFFF00, 0.3); // Yellow with 30% opacity
        highlightGraphic.drawCircle(text.x, text.y, TILE_SIZE * 0.45);
        highlightGraphic.endFill();
        highlightGraphic.visible = true;
      }

      textsUsed++;
    }

    // Hide unused pool texts
    hideUnusedPoolTexts(textsUsed);
  }, [pcs, currentPlayer, connectedPlayers, TILE_SIZE, gridOffset, gridId, getDisplayIcon, getTextFromPool, hideUnusedPoolTexts, getPCRenderPosition]);

  // Initial render and re-render on state changes
  useEffect(() => {
    renderPCs();
  }, [renderPCs]);

  // Start animation ticker on-demand when animations are detected
  // This prevents continuous 60fps polling when PCs are idle
  const startAnimationTicker = useCallback(() => {
    if (animationTickerRef.current) return; // Already running
    if (!app?.ticker) return;

    const ticker = app.ticker;

    const onTick = () => {
      // Check if any PC has an active animation position
      const hasActiveAnimations = pcs?.some(pc =>
        pc.playerId && renderPositions[pc.playerId]
      );

      if (hasActiveAnimations) {
        noAnimationFramesRef.current = 0;
        renderPCs();
      } else {
        // No animations - increment counter and remove ticker after a few idle frames
        noAnimationFramesRef.current++;
        if (noAnimationFramesRef.current > 5) {
          // Remove ticker when idle to save CPU
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
  }, [app, pcs, renderPCs]);

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

export default PixiRendererPCs;
