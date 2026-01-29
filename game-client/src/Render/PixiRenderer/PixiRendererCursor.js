import { useEffect, useRef } from 'react';
import { Graphics, Container } from 'pixi.js-legacy';
import { TILES_PER_GRID } from './UnifiedCamera';

/**
 * PixiRendererCursor - Cursor tile highlight for placement modes
 *
 * Renders a highlight overlay on the tile under the cursor when in
 * placement cursor mode (plant, terraform, build, etc.)
 *
 * The highlight "snaps" from tile to tile as the cursor moves across the grid,
 * showing the player exactly which tile(s) will be affected by their click.
 *
 * IMPORTANT: Uses object pooling to prevent GPU memory exhaustion.
 */
const PixiRendererCursor = ({
  app,              // PixiJS Application instance
  hoveredTile,      // { row, col } or null - the tile position currently being hovered
  cursorMode,       // { type, size, emoji, ... } or null - the current cursor mode
  TILE_SIZE,        // Tile size in pixels
  gridOffset = { x: 0, y: 0 },  // Offset for settlement zoom (current grid position in world)
}) => {
  const cursorContainerRef = useRef(null);
  const highlightGraphicRef = useRef(null);

  // Initialize cursor container and graphics
  useEffect(() => {
    if (!app?.stage) return;

    // Find the world container (parent of all game layers)
    const worldContainer = app.stage.children.find(c => c.name === 'world');
    if (!worldContainer) return;

    // Check if container already exists
    let cursorContainer = worldContainer.children.find(c => c.name === 'cursor-highlight');

    if (!cursorContainer) {
      cursorContainer = new Container();
      cursorContainer.name = 'cursor-highlight';

      // Insert after tiles but before resources (z-index ~5)
      // Find the resources container and insert before it
      const resourceContainerIndex = worldContainer.children.findIndex(c => c.name === 'resources');
      if (resourceContainerIndex >= 0) {
        worldContainer.addChildAt(cursorContainer, resourceContainerIndex);
      } else {
        // Fallback: add at index 1 (after tiles)
        worldContainer.addChildAt(cursorContainer, Math.min(1, worldContainer.children.length));
      }
    }

    cursorContainerRef.current = cursorContainer;

    // Create persistent highlight graphic (reused across renders)
    if (!highlightGraphicRef.current) {
      highlightGraphicRef.current = new Graphics();
      cursorContainer.addChild(highlightGraphicRef.current);
    }

    return () => {
      // Cleanup on unmount
      // NOTE: Don't call .destroy() - parent PixiRenderer handles that
      highlightGraphicRef.current = null;
      cursorContainerRef.current = null;
    };
  }, [app]);

  // Render the highlight
  useEffect(() => {
    const highlightGraphic = highlightGraphicRef.current;
    if (!highlightGraphic) return;

    // Clear previous highlight
    highlightGraphic.clear();

    // Only draw if we have a hovered tile and cursor mode
    if (!hoveredTile || !cursorMode) {
      highlightGraphic.visible = false;
      return;
    }

    const { row, col } = hoveredTile;

    // Validate tile position (grid is TILES_PER_GRID×TILES_PER_GRID)
    if (row < 0 || row >= TILES_PER_GRID || col < 0 || col >= TILES_PER_GRID) {
      highlightGraphic.visible = false;
      return;
    }

    highlightGraphic.visible = true;

    // Get size from cursorMode (multi-tile resources have size > 1)
    const tileSpan = cursorMode.size || 1;

    // Draw highlight for all tiles that will be occupied
    // Multi-tile resources expand right (+col) and up (-row) from the anchor
    for (let dx = 0; dx < tileSpan; dx++) {
      for (let dy = 0; dy < tileSpan; dy++) {
        const tileCol = col + dx;
        const tileRow = row - dy;

        // Skip tiles that are out of bounds
        if (tileCol < 0 || tileCol >= TILES_PER_GRID || tileRow < 0 || tileRow >= TILES_PER_GRID) continue;

        const x = gridOffset.x + tileCol * TILE_SIZE;
        const y = gridOffset.y + tileRow * TILE_SIZE;

        // Draw highlight fill - white semi-transparent
        highlightGraphic.beginFill(0xFFFFFF, 0.25);
        highlightGraphic.drawRect(x, y, TILE_SIZE, TILE_SIZE);
        highlightGraphic.endFill();

        // Draw highlight border - bright white
        highlightGraphic.lineStyle(2, 0xFFFFFF, 0.8);
        highlightGraphic.drawRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);

        // Draw inner glow effect
        highlightGraphic.lineStyle(1, 0xFFFFFF, 0.4);
        highlightGraphic.drawRect(x + 3, y + 3, TILE_SIZE - 6, TILE_SIZE - 6);
      }
    }

  }, [hoveredTile, cursorMode, TILE_SIZE, gridOffset]);

  // This component doesn't render any DOM elements
  return null;
};

export default PixiRendererCursor;
