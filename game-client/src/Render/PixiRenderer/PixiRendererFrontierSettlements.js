/**
 * PixiRendererFrontierSettlements - Renders the 63 neighboring settlement previews at frontier zoom
 *
 * At frontier zoom level, this component renders simplified representations of all settlements
 * in the frontier except the current one (which is rendered by PixiRendererSettlementGrids).
 *
 * POSITIONING: Settlements are positioned using absolute CSS positioning within the scroll container.
 * Each settlement is placed at (col * settlementSize, row * settlementSize) in the 8×8 frontier layout.
 *
 * SPILLOVER: To support the fixed player position camera model (player always at 200, 200),
 * we render 2 rows/columns of padding around the 8×8 frontier. This ensures players at edge
 * settlements have visible content at their fixed screen position. Padding uses gray color.
 *
 * Rendering strategy by settlement type:
 * - homesteadSet: 8×8 mini-grid showing 🏠 for owned homesteads, dirt bg for unowned
 * - valley0Set-3Set: 8×8 mini-grid of tree emojis (🌳 or 🌲)
 * - Current settlement: Skipped - rendered by PixiRendererSettlementGrids
 * - Padding settlements (row/col < 0 or >= 8): Solid gray (not playable)
 */

import React, { useMemo } from 'react';
import { WORLD_PADDING_SETTLEMENTS, SETTLEMENTS_PER_FRONTIER } from './UnifiedCamera';
import { isGridVisited } from '../../Utils/gridsVisitedUtils';

// Background colors by settlement type
const SETTLEMENT_COLORS = {
  homesteadSet: '#c0834a',    // Dirt brown for homestead settlements
  valley0Set: '#82bb4d',      // Grass green for oak valleys
  valley1Set: '#82bb4d',      // Grass green for oak valleys
  valley2Set: '#5a8f3a',      // Darker green for pine valleys
  valley3Set: '#5a8f3a',      // Darker green for pine valleys
};

const GRASS_BORDER = '#5a8f3a';
const SPILLOVER_COLOR = '#6b6b6b';  // Gray for padding/spillover areas (not playable)

// Current settlement glow color
const CURRENT_SETTLEMENT_GLOW = '#ffd700';  // Gold/yellow

/**
 * Get background color for a settlement based on its type
 */
function getSettlementBackgroundColor(settlementType) {
  if (!settlementType) return '#82bb4d';

  // Check for exact matches first
  if (SETTLEMENT_COLORS[settlementType]) {
    return SETTLEMENT_COLORS[settlementType];
  }

  // Check for partial matches (e.g., "homesteadSet1" matches "homesteadSet")
  for (const [key, color] of Object.entries(SETTLEMENT_COLORS)) {
    if (settlementType.startsWith(key.replace(/Set$/, ''))) {
      return color;
    }
  }

  return '#82bb4d'; // Default grass green
}

/**
 * Get tree emoji for valley type
 */
function getValleyTreeEmoji(settlementType) {
  if (settlementType?.includes('2') || settlementType?.includes('3')) {
    return '🌲'; // Pine for valley2 and valley3
  }
  return '🌳'; // Oak for valley0 and valley1
}

/**
 * Render an 8×8 mini-grid for a settlement
 * @param {Object} settlement - Settlement metadata
 * @param {Object} settlementGridData - Grid data for this settlement
 * @param {Object} currentPlayer - Current player data
 * @param {number} settlementRow - Settlement row position (0-7)
 * @param {number} settlementCol - Settlement col position (0-7)
 * @param {Function} onGridClick - Callback when a grid cell is clicked (gridData, gridRow, gridCol, settlementRow, settlementCol)
 * @param {boolean} isRelocating - Whether in relocation mode (enables grid-level clicks)
 */
function renderMiniGrid(settlement, settlementGridData, currentPlayer, settlementRow, settlementCol, onGridClick, isRelocating) {
  const cells = [];
  const grids = settlementGridData?.grid?.flat() || [];
  const isValley = settlement?.settlementType?.startsWith('valley');
  const treeEmoji = isValley ? getValleyTreeEmoji(settlement?.settlementType) : '';
  const gridsVisited = currentPlayer?.gridsVisited;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const gridIndex = row * 8 + col;
      const grid = grids[gridIndex];
      let content = '';
      let cellBg = 'transparent';

      // Calculate gridCoord (SSGG portion) from position for visited check
      // This allows visited check to work even without API data
      const calculatedSSGG = settlementRow * 1000 + settlementCol * 100 + row * 10 + col;
      const hasBeenVisited = isGridVisited(gridsVisited, calculatedSSGG);

      // Determine content based on grid type
      if (grid?.gridId === currentPlayer?.location?.g) {
        content = currentPlayer.icon || '👤'; // Player is here
        cellBg = '#82bb4d'; // Green background for player location
      } else if (grid?.gridType === 'homestead' && !grid.available) {
        content = '🏠'; // Owned homestead
        cellBg = '#82bb4d'; // Green background behind house emoji
      } else if (grid?.gridType === 'town') {
        content = '🏛️'; // Town (classical building)
        cellBg = '#4a4a4a'; // Dark gray background for town
      } else if (isValley && !hasBeenVisited) {
        // Only show tree emoji for unvisited valley grids
        content = treeEmoji;
      }
      // Visited valley grids show empty (no tree) - the trees have been cleared

      // For homestead settlements without grid data, show dirt color
      if (!isValley && !grid && settlement?.settlementType?.startsWith('homestead')) {
        cellBg = '#c0834a';
      }

      // During relocation, make grid cells clickable
      const isClickable = isRelocating && onGridClick && grid;
      const handleClick = isClickable
        ? (e) => {
            e.stopPropagation(); // Prevent settlement-level click
            onGridClick(grid, row, col, settlementRow, settlementCol);
          }
        : undefined;

      cells.push(
        <div
          key={`${row}-${col}`}
          onClick={handleClick}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: cellBg,
            overflow: 'hidden',
            cursor: isClickable ? 'pointer' : 'default',
            pointerEvents: isClickable ? 'auto' : 'none',
          }}
        >
          <span style={{ fontSize: 'inherit', lineHeight: 1 }}>{content}</span>
        </div>
      );
    }
  }
  return cells;
}

/**
 * Settlement cell component - renders one settlement as an 8×8 mini-grid
 */
const FrontierSettlementCell = ({ x, y, size, settlement, settlementGridData, currentPlayer, zoomScale, settlementRow, settlementCol, onGridClick, isRelocating = false }) => {
  const scaledSize = size * zoomScale;
  const bgColor = getSettlementBackgroundColor(settlement?.settlementType);
  // Font size for emojis in the 8x8 mini-grid (each cell is scaledSize/8)
  const cellSize = scaledSize / 8;
  const fontSize = Math.max(6, cellSize * 0.7);

  return (
    <div
      style={{
        position: 'absolute',
        left: x * zoomScale,
        top: y * zoomScale,
        width: scaledSize,
        height: scaledSize,
        backgroundColor: bgColor,
        border: `0.5px solid ${GRASS_BORDER}`,
        boxSizing: 'border-box',
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 1fr)',
        gridTemplateRows: 'repeat(8, 1fr)',
        fontSize: fontSize,
        // Enable pointer events when relocating so grid cells can be clicked
        pointerEvents: isRelocating ? 'auto' : 'none',
      }}
    >
      {renderMiniGrid(settlement, settlementGridData, currentPlayer, settlementRow, settlementCol, onGridClick, isRelocating)}
    </div>
  );
};

/**
 * Glowing outline for the current settlement (where the player is located)
 */
const CurrentSettlementGlow = ({ x, y, size, zoomScale }) => (
  <div
    style={{
      position: 'absolute',
      left: x * zoomScale,
      top: y * zoomScale,
      width: size * zoomScale,
      height: size * zoomScale,
      border: `4px solid ${CURRENT_SETTLEMENT_GLOW}`,
      boxSizing: 'border-box',
      boxShadow: `0 0 20px ${CURRENT_SETTLEMENT_GLOW}, 0 0 40px ${CURRENT_SETTLEMENT_GLOW}, inset 0 0 20px rgba(255, 215, 0, 0.3)`,
      pointerEvents: 'none',
      zIndex: 10,
    }}
  />
);

const PixiRendererFrontierSettlements = ({
  isActive,                    // true when zoomLevel === 'frontier'
  currentSettlementPosition,   // { row, col } in 8×8 frontier
  frontierData,                // 8×8 array of settlement metadata
  frontierSettlementGrids,     // Map of settlementId → grid data
  currentPlayer,               // For determining player location (includes gridsVisited for visited check)
  settlementPixelSize,         // Size of one settlement in pixels (before zoomScale)
  zoomScale = 1,               // CSS zoom scale for frontier view
  onGridClick,                 // Callback when a grid cell is clicked during relocation (gridData, gridRow, gridCol, settlementRow, settlementCol)
  paddingOffset = 0,           // Offset from parent's padding (in pixels, already scaled)
  isRelocating = false,        // true when in relocation mode (enables clicking on grid cells)
}) => {
  const currentRow = currentSettlementPosition?.row ?? 3;
  const currentCol = currentSettlementPosition?.col ?? 3;

  // UNIFIED WORLD MODEL: Use padding from UnifiedCamera to match scroll container
  const paddingSettlements = WORLD_PADDING_SETTLEMENTS;

  // Generate settlement cells including spillover padding (memoized)
  // Render from -PADDING to 8+PADDING to create spillover for edge positions
  // Only render when frontierData is available - don't show inaccurate placeholders
  const settlementCells = useMemo(() => {
    // Don't render anything until frontier data is loaded
    // This prevents showing inaccurate placeholder content during data fetch
    if (!frontierData || !Array.isArray(frontierData) || frontierData.length === 0) {
      return [];
    }

    const cells = [];

    // Render extended grid: from -PADDING to (8 + PADDING)
    // This creates spillover content for players at edge settlements
    const startIndex = -paddingSettlements;
    const endIndex = 8 + paddingSettlements;

    for (let row = startIndex; row < endIndex; row++) {
      for (let col = startIndex; col < endIndex; col++) {
        // Skip current settlement - it's rendered by PixiRendererSettlementGrids
        if (row === currentRow && col === currentCol) {
          continue;
        }

        // Calculate pixel position (with offset for padding)
        // Padding settlements render at negative positions or beyond 8
        const pixelX = (col + paddingSettlements) * settlementPixelSize;
        const pixelY = (row + paddingSettlements) * settlementPixelSize;
        const key = `settlement-${row}-${col}`;

        // Check if this is a padding cell (outside the 0-7 range)
        const isPadding = row < 0 || row >= 8 || col < 0 || col >= 8;

        if (isPadding) {
          // Render spillover as solid grass green
          cells.push(
            <div
              key={key}
              style={{
                position: 'absolute',
                left: pixelX * zoomScale,
                top: pixelY * zoomScale,
                width: settlementPixelSize * zoomScale,
                height: settlementPixelSize * zoomScale,
                backgroundColor: SPILLOVER_COLOR,
                border: `0.5px solid ${GRASS_BORDER}`,
                boxSizing: 'border-box',
              }}
            />
          );
          continue;
        }

        // Normal frontier settlement (0-7 range)
        const settlement = frontierData?.[row]?.[col];

        if (!settlement) {
          // Empty slot - render as grass
          cells.push(
            <div
              key={key}
              style={{
                position: 'absolute',
                left: pixelX * zoomScale,
                top: pixelY * zoomScale,
                width: settlementPixelSize * zoomScale,
                height: settlementPixelSize * zoomScale,
                backgroundColor: SPILLOVER_COLOR,
                border: `0.5px solid ${GRASS_BORDER}`,
                boxSizing: 'border-box',
              }}
            />
          );
          continue;
        }

        // Get settlement grid data if available
        const settlementGridData = frontierSettlementGrids?.[settlement.settlementId];

        cells.push(
          <FrontierSettlementCell
            key={key}
            x={pixelX}
            y={pixelY}
            size={settlementPixelSize}
            settlement={settlement}
            settlementGridData={settlementGridData}
            currentPlayer={currentPlayer}
            zoomScale={zoomScale}
            settlementRow={row}
            settlementCol={col}
            onGridClick={onGridClick}
            isRelocating={isRelocating}
          />
        );
      }
    }

    // Renders 8×8 settlements plus spillover padding for fixed player position camera
    return cells;
  }, [frontierData, currentRow, currentCol, settlementPixelSize, frontierSettlementGrids, currentPlayer, zoomScale, isRelocating, onGridClick]);

  // Only render content when data is available
  // Content will smoothly appear when data loads rather than showing placeholders

  // Render as HTML overlay - size includes padding for spillover
  // Total size = (8 + 2*PADDING) settlements
  const totalSettlements = 8 + paddingSettlements * 2;
  const fullFrontierSize = settlementPixelSize * totalSettlements * zoomScale;

  // Adjust current settlement position to account for padding offset
  const currentSettlementPixelX = (currentCol + paddingSettlements) * settlementPixelSize;
  const currentSettlementPixelY = (currentRow + paddingSettlements) * settlementPixelSize;

  // Position at (0, 0) - the parent scroll container already includes padding
  // No negative positioning needed since content is offset by paddingSize in PixiRenderer
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: fullFrontierSize,
        height: fullFrontierSize,
        zIndex: 0,
        pointerEvents: 'none',
        // Use CSS visibility instead of conditional rendering
        // This keeps DOM elements pre-created to avoid layout thrash on first zoom
        visibility: isActive ? 'visible' : 'hidden',
      }}
    >
      {settlementCells}
      {/* Glowing outline around the current settlement (player location) */}
      <CurrentSettlementGlow
        x={currentSettlementPixelX}
        y={currentSettlementPixelY}
        size={settlementPixelSize}
        zoomScale={zoomScale}
      />
    </div>
  );
};

export default PixiRendererFrontierSettlements;
