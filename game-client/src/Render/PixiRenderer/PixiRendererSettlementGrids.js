/**
 * PixiRendererSettlementGrids - Renders the 63 neighboring grid previews at settlement zoom
 *
 * At settlement zoom level, this component renders simplified representations of all grids
 * in the settlement except the current one (which is rendered live by the main PixiRenderer).
 *
 * POSITIONING: Grids are positioned using absolute CSS positioning within the scroll container.
 * Each grid is placed at (col * gridSize, row * gridSize) in the 8×8 settlement layout.
 *
 * Rendering strategy by grid type:
 * - Valley/Town (visited): Tile color snapshot (64×64 canvas, 1 pixel per tile)
 * - Valley/Town (unvisited): Solid grass green
 * - Homestead (occupied): Player text info (username, role, net worth)
 * - Homestead (unoccupied): Solid grass green
 */

import React, { useMemo } from 'react';
import { getTileColor, BITS_TO_TILE_TYPE } from '../../UI/Styles/tileColors';

// Grid constants
const GRID_TILES = 64;  // Each grid is 64×64 tiles

// Grass green color for empty/unvisited grids
const GRASS_GREEN = '#82bb4d';
const GRASS_BORDER = '#5a8f3a';
// Occupied homestead uses primary green from theme
const HOMESTEAD_BG = '#82bb4d';          // --color-primary-green
const HOMESTEAD_BORDER = '#5a8f3a';
// Unoccupied homestead uses dirt brown from theme
const HOMESTEAD_UNOCCUPIED_BG = '#c0834a';  // --color-bg-dirt
const HOMESTEAD_UNOCCUPIED_BORDER = '#8b5a2b';

// Current grid (player location) glow color
const CURRENT_GRID_GLOW = '#ffd700';  // Gold/yellow

// Cache for grid snapshot data URLs
const gridSnapshotCache = new Map();

/**
 * Decode base64-encoded tile data into a 2D array
 */
function decodeTiles(encodedTiles) {
  if (!encodedTiles) return null;

  try {
    const binaryString = atob(encodedTiles);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const tiles = [];
    let byteIndex = 0;

    for (let row = 0; row < GRID_TILES; row++) {
      const rowTiles = [];
      for (let col = 0; col < GRID_TILES; col += 2) {
        if (byteIndex >= bytes.length) break;
        const byte = bytes[byteIndex++];
        const tile1 = (byte >> 4) & 0x0F;
        const tile2 = byte & 0x0F;
        rowTiles.push(tileIndexToType(tile1));
        if (col + 1 < GRID_TILES) {
          rowTiles.push(tileIndexToType(tile2));
        }
      }
      tiles.push(rowTiles);
    }

    return tiles;
  } catch (error) {
    console.error('Error decoding tiles:', error);
    return null;
  }
}

/**
 * Convert tile index to tile type character
 * Uses BITS_TO_TILE_TYPE from tileColors.js for correct mapping
 */
function tileIndexToType(index) {
  return BITS_TO_TILE_TYPE[index] || 'g';
}

/**
 * Generate a snapshot data URL for a visited valley/town grid
 */
function generateGridSnapshotDataUrl(encodedTiles, gridId) {
  if (gridSnapshotCache.has(gridId)) {
    return gridSnapshotCache.get(gridId);
  }

  const tiles = decodeTiles(encodedTiles);
  if (!tiles) return null;

  const canvas = document.createElement('canvas');
  canvas.width = GRID_TILES;
  canvas.height = GRID_TILES;
  const ctx = canvas.getContext('2d');

  for (let y = 0; y < GRID_TILES; y++) {
    for (let x = 0; x < GRID_TILES; x++) {
      const tileType = tiles[y]?.[x] || 'g';
      ctx.fillStyle = getTileColor(tileType);
      ctx.fillRect(x, y, 1, 1);
    }
  }

  const dataUrl = canvas.toDataURL();
  gridSnapshotCache.set(gridId, dataUrl);
  return dataUrl;
}

/**
 * Clear the grid snapshot cache
 */
export function clearGridSnapshotCache() {
  gridSnapshotCache.clear();
}

/**
 * Get border style based on zoom level
 * At frontier zoom: no border (cells are too small for visible borders)
 * At settlement zoom: thin border (0.5px)
 */
const getGridBorder = (borderColor, isFrontierZoom, screenScale = 1) => {
  if (isFrontierZoom) return 'none';
  return `${0.5 / screenScale}px solid ${borderColor}`;
};

/**
 * LAYOUT MODEL: this component now lives inside the `.pixi-world-container` overlay, which
 * PixiCamera CSS-transforms to match the Pixi world. Positions and sizes are BASE px
 * (`zoomScale` is passed as 1); `screenScale` is the real on-screen zoom, used only to keep
 * text, borders and glows the same on-screen size they had before (base px = screen px / scale).
 */

/**
 * Empty grid cell component
 * For unoccupied homesteads, uses dirt background and bold "Unoccupied" text
 */
const EmptyGridCell = ({ x, y, size, label, zoomScale, screenScale = zoomScale, isUnoccupiedHomestead = false, strings, isFrontierZoom = false, onClick, isClickable = false }) => {
  const bgColor = isUnoccupiedHomestead ? HOMESTEAD_UNOCCUPIED_BG : GRASS_GREEN;
  const borderColor = isUnoccupiedHomestead ? HOMESTEAD_UNOCCUPIED_BORDER : GRASS_BORDER;
  const textColor = isUnoccupiedHomestead ? '#ffffff' : '#3d5c1f';
  // Hide text labels at frontier zoom - they're too small to read and clutter the view
  const displayLabel = isFrontierZoom ? null : (isUnoccupiedHomestead ? (strings?.['10190'] || 'Unoccupied') : label);

  return (
    <div
      onClick={isClickable ? onClick : undefined}
      style={{
        position: 'absolute',
        left: x * zoomScale,
        top: y * zoomScale,
        width: size * zoomScale,
        height: size * zoomScale,
        backgroundColor: bgColor,
        border: getGridBorder(borderColor, isFrontierZoom, screenScale),
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: isClickable ? 'pointer' : 'default',
        pointerEvents: isClickable ? 'auto' : 'none',
      }}
    >
      {displayLabel && (
        <span style={{
          color: textColor,
          fontSize: Math.max(8, size * screenScale * 0.08) / screenScale,
          fontFamily: 'sans-serif',
          fontWeight: isUnoccupiedHomestead ? 'bold' : 'normal',
          textShadow: isUnoccupiedHomestead ? `${1 / screenScale}px ${1 / screenScale}px ${2 / screenScale}px rgba(0, 0, 0, 0.7)` : 'none',
        }}>
          {displayLabel}
        </span>
      )}
    </div>
  );
};

/**
 * Glowing outline for the current grid (where the player is located)
 */
const CurrentGridGlow = ({ x, y, size, zoomScale, screenScale = zoomScale }) => (
  <div
    style={{
      position: 'absolute',
      left: x * zoomScale,
      top: y * zoomScale,
      width: size * zoomScale,
      height: size * zoomScale,
      border: `${4 / screenScale}px solid ${CURRENT_GRID_GLOW}`,
      boxSizing: 'border-box',
      boxShadow: `0 0 ${20 / screenScale}px ${CURRENT_GRID_GLOW}, 0 0 ${40 / screenScale}px ${CURRENT_GRID_GLOW}, inset 0 0 ${20 / screenScale}px rgba(255, 215, 0, 0.3)`,
      pointerEvents: 'none',
      zIndex: 10,
    }}
  />
);

/**
 * Grid cell with tile snapshot
 */
const SnapshotGridCell = ({ x, y, size, dataUrl, zoomScale, screenScale = zoomScale, isFrontierZoom = false, onClick, isClickable = false }) => (
  <div
    onClick={isClickable ? onClick : undefined}
    style={{
      position: 'absolute',
      left: x * zoomScale,
      top: y * zoomScale,
      width: size * zoomScale,
      height: size * zoomScale,
      border: getGridBorder(GRASS_BORDER, isFrontierZoom, screenScale),
      boxSizing: 'border-box',
      backgroundImage: `url(${dataUrl})`,
      backgroundSize: 'cover',
      imageRendering: 'pixelated',
      cursor: isClickable ? 'pointer' : 'default',
      pointerEvents: isClickable ? 'auto' : 'none',
    }}
  />
);

/**
 * Homestead info cell component
 * Matches the layout from SettlementView.js / SettlementTile.json:
 * - "Homestead owned by:" header
 * - 👤 username (white, bold)
 * - 🏛️ role (yellow if Mayor, otherwise normal)
 * - 💰 netWorth "(net worth)"
 * - 📥 Trade: [trade stall items]
 */
const HomesteadGridCell = ({ x, y, size, owner, zoomScale, screenScale = zoomScale, masterResources, isFrontierZoom = false, onClick, isClickable = false }) => {
  const scaledSize = size * zoomScale;
  const screenSize = size * screenScale;          // on-screen px, for choosing text sizes
  const px = (screenPx) => screenPx / screenScale; // on-screen px -> base px

  // At frontier zoom, show house emoji instead of text (text is too small to read)
  if (isFrontierZoom) {
    const fontSize = px(Math.max(7, screenSize * 0.5 + 1));
    return (
      <div
        onClick={isClickable ? onClick : undefined}
        style={{
          position: 'absolute',
          left: x * zoomScale,
          top: y * zoomScale,
          width: scaledSize,
          height: scaledSize,
          backgroundColor: HOMESTEAD_BG,
          border: getGridBorder(HOMESTEAD_BORDER, isFrontierZoom, screenScale),
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: fontSize,
          cursor: isClickable ? 'pointer' : 'default',
          pointerEvents: isClickable ? 'auto' : 'none',
        }}
      >
        <span style={{ lineHeight: 1 }}>🏠</span>
      </div>
    );
  }

  const fontSize = px(Math.max(9, screenSize * 0.055 + 4));
  const smallFontSize = px(Math.max(8, screenSize * 0.045 + 4));
  const emojiSize = px(Math.max(10, screenSize * 0.065 + 4));

  // Get role and check if Mayor
  const role = owner.role || owner.settlement?.role || 'Citizen';
  const isMayor = role === 'Mayor';

  // Get net worth (check both netWorth and networth variations)
  const netWorth = owner.netWorth ?? owner.networth ?? owner.settlement?.netWorth ?? owner.settlement?.networth ?? 0;

  // Get trade stall items that haven't been bought
  const tradeStallItems = [];
  if (Array.isArray(owner.tradeStall) && masterResources) {
    for (const stall of owner.tradeStall) {
      if (stall?.resource && !stall?.boughtBy) {
        const template = masterResources.find(r => r.type === stall.resource);
        if (template?.symbol) {
          tradeStallItems.push(template.symbol);
        }
      }
    }
  }

  // Common text shadow for readability
  const textShadow = `${px(1)}px ${px(1)}px ${px(1)}px rgba(0, 0, 0, 0.7)`;

  // Row style with slightly more line spacing
  const rowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: px(2),
    lineHeight: 1.3,
    whiteSpace: 'nowrap',
    marginBottom: px(2),
  };

  return (
    <div
      onClick={isClickable ? onClick : undefined}
      style={{
        position: 'absolute',
        left: x * zoomScale,
        top: y * zoomScale,
        width: scaledSize,
        height: scaledSize,
        backgroundColor: HOMESTEAD_BG,
        border: getGridBorder(HOMESTEAD_BORDER, isFrontierZoom, screenScale),
        boxSizing: 'border-box',
        padding: px(3),
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        overflow: 'hidden',
        cursor: isClickable ? 'pointer' : 'default',
        pointerEvents: isClickable ? 'auto' : 'none',
      }}
    >
      {/* Header */}
      <div style={{
        fontSize: smallFontSize,
        fontFamily: 'sans-serif',
        color: '#333',
        fontWeight: 'bold',
        lineHeight: 1.3,
        marginBottom: px(2),
      }}>
        Homestead owned by:
      </div>

      {/* Username row */}
      <div style={{
        ...rowStyle,
        fontSize,
        fontFamily: 'sans-serif',
        color: 'white',
        fontWeight: 'bold',
        textShadow,
      }}>
        <span style={{ fontSize: emojiSize }}>👤</span>
        <span>&nbsp;{owner.username || 'Unknown'}</span>
      </div>

      {/* Role row */}
      <div style={{
        ...rowStyle,
        fontSize,
        fontFamily: 'sans-serif',
        color: isMayor ? 'rgb(215, 215, 4)' : 'white',
        fontWeight: isMayor ? 'bold' : 'normal',
        textShadow,
      }}>
        <span style={{ fontSize: emojiSize }}>🏛️</span>
        <span>&nbsp;{role}</span>
      </div>

      {/* Net worth label */}
      <div style={{
        ...rowStyle,
        fontSize: smallFontSize,
        fontFamily: 'sans-serif',
        color: '#333',
      }}>
        <span style={{ fontSize: emojiSize }}>💰</span>
        <span>&nbsp;Net Worth:</span>
      </div>

      {/* Net worth value */}
      <div style={{
        fontSize,
        fontFamily: 'sans-serif',
        color: '#333',
        fontWeight: 'bold',
        lineHeight: 1.3,
        marginBottom: px(2),
      }}>
        {netWorth.toLocaleString()}
      </div>

      {/* Trade section */}
      <div style={{
        ...rowStyle,
        fontSize: smallFontSize,
        fontFamily: 'sans-serif',
        color: '#333',
        marginTop: px(2),
      }}>
        <span style={{ fontSize: emojiSize }}>📥</span>
        <span>&nbsp;Trade:</span>
      </div>

      {/* Trade stall items */}
      {tradeStallItems.length > 0 && (
        <div style={{
          fontSize: emojiSize,
          display: 'flex',
          gap: px(2),
          flexWrap: 'wrap',
        }}>
          {tradeStallItems.map((symbol, idx) => (
            <span key={idx}>{symbol}</span>
          ))}
        </div>
      )}
    </div>
  );
};

const PixiRendererSettlementGrids = ({
  app,                         // Not used for HTML rendering, but kept for API compatibility
  isActive,                    // true when zoomLevel === 'settlement' or 'frontier'
  currentGridPosition,         // { row, col } of current grid in 8×8 settlement
  settlementData,              // 2D array [row][col] of grid metadata
  visitedGridTiles,            // Map of gridCoord → base64 encoded tiles
  players,                     // Map of playerId → player data
  TILE_SIZE,                   // Tile size in pixels
  zoomScale = 1,               // Layout scale (1 inside the camera-mirrored overlay)
  screenScale = zoomScale,     // Real on-screen zoom (for text/border sizing)
  masterResources,             // Master resources list (for trade stall symbols)
  onGridClick,                 // Callback when a grid is clicked (gridData, row, col) => void
  strings,                     // Localized strings (for "Unoccupied" label)
  settlementOffset = { x: 0, y: 0 }, // Offset for positioning within frontier (in pixels before zoomScale)
  isFrontierZoom = false,      // true when at frontier zoom level (hide borders)
  isDeveloper = false,         // true to enable clicking on grids to travel (developer mode)
  isRelocating = false,        // true when in relocation mode (enables clicking on grids)
  onRelocationGridClick,       // Callback when a grid is clicked during relocation (gridData, row, col, settlementRow, settlementCol)
  currentSettlementPosition,   // { row, col } of current settlement in frontier (for relocation callback)
}) => {
  const currentRow = currentGridPosition?.row ?? 3;
  const currentCol = currentGridPosition?.col ?? 3;

  // Grid size in pixels (before zoom scale)
  const gridPixelSize = GRID_TILES * TILE_SIZE;

  // Generate grid cells (memoized)
  // Only render when settlementData is available - don't show inaccurate placeholders
  const gridCells = useMemo(() => {
    // Don't render anything until settlement data is loaded
    // This prevents showing inaccurate placeholder content during data fetch
    if (!settlementData || !Array.isArray(settlementData) || settlementData.length === 0) {
      return [];
    }

    const cells = [];

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        // Skip current grid - it's rendered live by the main PixiRenderer
        if (row === currentRow && col === currentCol) {
          continue;
        }

        // Calculate position using ABSOLUTE coordinates within the 8×8 settlement
        // Each grid is at (col * gridSize, row * gridSize) in the settlement layout
        // This allows all grids to have positive coordinates for proper scrolling
        const pixelX = col * gridPixelSize;
        const pixelY = row * gridPixelSize;

        // Get grid data
        const gridData = settlementData?.[row]?.[col];
        const key = `grid-${row}-${col}`;

        // Create click handler for developer mode OR relocation mode
        // Developer mode: uses onGridClick for grid travel
        // Relocation mode: uses onRelocationGridClick to select new homestead location
        const canClickDeveloper = isDeveloper && onGridClick && gridData;
        const canClickRelocation = isRelocating && isFrontierZoom && onRelocationGridClick && gridData;
        const canClick = canClickDeveloper || canClickRelocation;
        const handleGridClick = canClick
          ? () => {
              if (canClickRelocation) {
                // During relocation, pass settlement position for consistency with frontier click handler
                const settlementRow = currentSettlementPosition?.row ?? 0;
                const settlementCol = currentSettlementPosition?.col ?? 0;
                onRelocationGridClick(gridData, row, col, settlementRow, settlementCol);
              } else if (canClickDeveloper) {
                onGridClick(gridData, row, col);
              }
            }
          : undefined;
        const isClickable = canClick;

        if (!gridData) {
          cells.push(
            <EmptyGridCell
              key={key}
              x={pixelX}
              y={pixelY}
              size={gridPixelSize}
              label={`(${col},${row})`}
              zoomScale={zoomScale}
              screenScale={screenScale}
              isFrontierZoom={isFrontierZoom}
            />
          );
          continue;
        }

        const gridType = gridData.gridType || gridData.type || 'homestead';
        const isValleyOrTown = gridType.startsWith('valley') || gridType === 'town';
        const isHomestead = gridType === 'homestead';

        if (isValleyOrTown) {
          const gridCoord = gridData.gridCoord;
          const encodedTiles = visitedGridTiles?.get?.(gridCoord) || visitedGridTiles?.[gridCoord];

          if (encodedTiles) {
            const dataUrl = generateGridSnapshotDataUrl(encodedTiles, gridData.gridId);
            if (dataUrl) {
              cells.push(
                <SnapshotGridCell
                  key={key}
                  x={pixelX}
                  y={pixelY}
                  size={gridPixelSize}
                  dataUrl={dataUrl}
                  zoomScale={zoomScale}
                  screenScale={screenScale}
                  isFrontierZoom={isFrontierZoom}
                  onClick={handleGridClick}
                  isClickable={isClickable}
                />
              );
              continue;
            }
          }
          // Unvisited or no snapshot
          cells.push(
            <EmptyGridCell
              key={key}
              x={pixelX}
              y={pixelY}
              size={gridPixelSize}
              label={gridType}
              zoomScale={zoomScale}
              screenScale={screenScale}
              isFrontierZoom={isFrontierZoom}
              onClick={handleGridClick}
              isClickable={isClickable}
            />
          );
        } else if (isHomestead) {
          const ownerId = gridData.ownerId;
          const owner = ownerId && players ? (players.get?.(ownerId) || players[ownerId]) : null;

          if (owner) {
            cells.push(
              <HomesteadGridCell
                key={key}
                x={pixelX}
                y={pixelY}
                size={gridPixelSize}
                owner={owner}
                zoomScale={zoomScale}
                screenScale={screenScale}
                masterResources={masterResources}
                isFrontierZoom={isFrontierZoom}
                onClick={handleGridClick}
                isClickable={isClickable}
              />
            );
          } else {
            cells.push(
              <EmptyGridCell
                key={key}
                x={pixelX}
                y={pixelY}
                size={gridPixelSize}
                zoomScale={zoomScale}
                screenScale={screenScale}
                isUnoccupiedHomestead={true}
                strings={strings}
                isFrontierZoom={isFrontierZoom}
                onClick={handleGridClick}
                isClickable={isClickable}
              />
            );
          }
        } else {
          cells.push(
            <EmptyGridCell
              key={key}
              x={pixelX}
              y={pixelY}
              size={gridPixelSize}
              label={gridType}
              zoomScale={zoomScale}
              screenScale={screenScale}
              isFrontierZoom={isFrontierZoom}
              onClick={handleGridClick}
              isClickable={isClickable}
            />
          );
        }
      }
    }

    return cells;
  }, [currentRow, currentCol, gridPixelSize, settlementData, visitedGridTiles, players, zoomScale, screenScale, masterResources, strings, isFrontierZoom, isActive, isDeveloper, onGridClick, isRelocating, onRelocationGridClick, currentSettlementPosition]);

  // Only render content when data is available
  // Content will smoothly appear when data loads rather than showing placeholders

  // Render as HTML overlay
  // Container covers the full 8×8 settlement area
  // At frontier zoom, the container is positioned within the larger frontier via settlementOffset
  // Grids use absolute positioning within this container
  const fullSettlementSize = gridPixelSize * 8 * zoomScale;

  // Current grid position for the glow effect
  const currentGridPixelX = currentCol * gridPixelSize;
  const currentGridPixelY = currentRow * gridPixelSize;

  // Apply settlement offset for frontier zoom positioning
  const containerTop = settlementOffset.y * zoomScale;
  const containerLeft = settlementOffset.x * zoomScale;

  // Enable pointer events when in relocation mode at frontier zoom, or developer mode
  const enablePointerEvents = (isRelocating && isFrontierZoom) || isDeveloper;

  return (
    <div
      style={{
        position: 'absolute',
        top: containerTop,
        left: containerLeft,
        width: fullSettlementSize,
        height: fullSettlementSize,
        zIndex: 0,
        pointerEvents: enablePointerEvents ? 'auto' : 'none',
        // Use CSS visibility instead of conditional rendering
        // This keeps DOM elements pre-created to avoid layout thrash on first zoom
        visibility: isActive ? 'visible' : 'hidden',
      }}
    >
      {gridCells}
      {/* Glowing outline around the current grid (player location) */}
      <CurrentGridGlow
        x={currentGridPixelX}
        y={currentGridPixelY}
        size={gridPixelSize}
        zoomScale={zoomScale}
        screenScale={screenScale}
      />
    </div>
  );
};

export default PixiRendererSettlementGrids;
