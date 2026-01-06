import React, { useRef, useEffect } from 'react';

/**
 * CursorTileHighlight - Renders a highlight overlay on the tile under the cursor
 * when in placement cursor mode (plant, terraform, build, etc.)
 *
 * The highlight "snaps" from tile to tile as the cursor moves across the grid,
 * showing the player exactly which tile will be affected by their click.
 *
 * Props:
 * - hoveredTile: { row, col } or null - the tile position currently being hovered
 * - cursorMode: { type, emoji, ... } or null - the current cursor mode
 * - TILE_SIZE: number - size of each tile in pixels
 * - gridWidth: number - width of the grid in tiles
 * - gridHeight: number - height of the grid in tiles
 */
const CursorTileHighlight = ({
  hoveredTile,
  cursorMode,
  TILE_SIZE,
  gridWidth,
  gridHeight,
}) => {
  const canvasRef = useRef(null);

  // Render the highlight
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Set canvas size to match grid
    canvas.width = gridWidth * TILE_SIZE;
    canvas.height = gridHeight * TILE_SIZE;

    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Only draw highlight if we have a hovered tile and cursor mode
    if (!hoveredTile || !cursorMode) return;

    const { row, col } = hoveredTile;

    // Validate tile position
    if (row < 0 || row >= gridHeight || col < 0 || col >= gridWidth) return;

    const x = col * TILE_SIZE;
    const y = row * TILE_SIZE;

    // Draw highlight fill - white semi-transparent
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

    // Draw highlight border - bright white
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);

    // Draw inner glow effect
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 3, y + 3, TILE_SIZE - 6, TILE_SIZE - 6);

  }, [hoveredTile, cursorMode, TILE_SIZE, gridWidth, gridHeight]);

  // Don't render anything if no cursor mode
  if (!cursorMode) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        zIndex: 5, // Above tiles (1) but below resources (10+)
        pointerEvents: 'none', // Allow clicks to pass through
        imageRendering: 'pixelated',
      }}
    />
  );
};

export default CursorTileHighlight;
