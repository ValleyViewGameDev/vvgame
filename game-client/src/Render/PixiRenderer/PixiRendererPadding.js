/**
 * PixiRendererPadding - Renders grass-green background for the entire world
 *
 * UNIFIED WORLD MODEL:
 * The world is always 6144×6144 tiles (12×12 settlements = 8×8 frontier + 2 padding on each side).
 * This component renders grass-green divs for the ENTIRE world including the 8×8 frontier area.
 *
 * This serves two purposes:
 * 1. Padding: Ensures players at edge positions (settlement 0,0 or 7,7) can still
 *    be at the fixed screen position (450, 350).
 * 2. Background: Provides a solid grass background during zoom animations before
 *    frontier/settlement data has loaded. Without this, the 8×8 frontier area would
 *    be empty/transparent during zoom, causing disorienting visual artifacts.
 *
 * ANIMATION SUPPORT:
 * To avoid flash during zoom animation, this component renders at BASE size (no zoom)
 * and uses CSS transform to scale. The animation can update the transform via DOM
 * without causing React re-renders.
 */

import React, { useMemo } from 'react';
import { WORLD_PADDING_SETTLEMENTS, SETTLEMENTS_PER_FRONTIER } from './UnifiedCamera';

// Grass green color for padding areas
const PADDING_COLOR = '#82bb4d';
const PADDING_BORDER = '#5a8f3a';

/**
 * PixiRendererPadding component
 *
 * @param {boolean} isActive - Whether to render padding
 * @param {number} baseUnitSize - Size of one settlement in pixels at BASE scale (no zoom applied)
 * @param {number} paddingUnits - Number of settlements of padding on each side (WORLD_PADDING_SETTLEMENTS = 2)
 * @param {number} zoomScale - Current zoom scale (used for CSS transform)
 */
const PixiRendererPadding = ({
  isActive,
  baseUnitSize,
  paddingUnits,
  zoomScale = 1,
}) => {
  // Generate background cells for the ENTIRE world at BASE size (memoized, doesn't change with zoom)
  // This includes both padding AND the 8×8 frontier area to provide a solid background
  // during zoom animations before frontier/settlement data has loaded
  const paddingCells = useMemo(() => {
    if (!isActive) return [];
    const cells = [];

    // UNIFIED WORLD MODEL: Render the ENTIRE world as grass background
    // Total = 8 settlements + 2*paddingUnits settlements = 12×12 settlements
    const contentUnits = SETTLEMENTS_PER_FRONTIER; // 8
    const totalUnits = contentUnits + paddingUnits * 2; // 12

    for (let row = 0; row < totalUnits; row++) {
      for (let col = 0; col < totalUnits; col++) {
        // NO LONGER SKIPPING content area - we render the entire world
        // This ensures there's a solid grass background during zoom animations
        // before frontier/settlement content has loaded

        // Position at BASE size - CSS transform handles scaling
        const pixelX = col * baseUnitSize;
        const pixelY = row * baseUnitSize;

        cells.push(
          <div
            key={`padding-${row}-${col}`}
            style={{
              position: 'absolute',
              left: pixelX,
              top: pixelY,
              width: baseUnitSize,
              height: baseUnitSize,
              backgroundColor: PADDING_COLOR,
              border: `0.5px solid ${PADDING_BORDER}`,
              boxSizing: 'border-box',
            }}
          />
        );
      }
    }

    return cells;
  }, [isActive, baseUnitSize, paddingUnits]);

  if (!isActive || paddingCells.length === 0) return null;

  // Total size at BASE scale
  const contentUnits = SETTLEMENTS_PER_FRONTIER;
  const totalUnits = contentUnits + paddingUnits * 2;
  const baseTotalSize = baseUnitSize * totalUnits;

  // Scaled size for the container (determines layout space)
  const scaledTotalSize = baseTotalSize * zoomScale;

  return (
    <div
      className="pixi-padding-container"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        // Container takes up scaled space in layout
        width: scaledTotalSize,
        height: scaledTotalSize,
        zIndex: 0,
        pointerEvents: 'none',
      }}
    >
      {/* Inner div renders at BASE size and uses transform to scale */}
      {/* This allows animation to update transform without re-rendering cells */}
      <div
        className="pixi-padding-inner"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: baseTotalSize,
          height: baseTotalSize,
          transformOrigin: 'top left',
          transform: `scale(${zoomScale})`,
        }}
      >
        {paddingCells}
      </div>
    </div>
  );
};

export default PixiRendererPadding;
