import React from 'react';

// Configuration for which tile types should have rounded corners
const TILE_ROUNDING_CONFIG = {
  g: true,  // grass - rounded
  s: true,  // stone - rounded  
  w: true,  // water - rounded
  l: true,  // lava - rounded
  n: true,  // natural - rounded
  o: true,  // other - rounded
  d: false, // dirt - no rounding (base layer)
  p: true, // pavement - no rounding
};

// Calculate which corners should be rounded based on adjacent tiles
function calculateRoundedCorners(tileType, rowIndex, colIndex, tileTypes) {
  // If this tile type doesn't support rounding, return null
  if (!TILE_ROUNDING_CONFIG[tileType]) {
    return null;
  }

  const roundedCorners = {
    topLeft: false,
    topRight: false,
    bottomRight: false,
    bottomLeft: false
  };
  
  // Check each corner: top-left, top-right, bottom-right, bottom-left
  const adjacentChecks = [
    { 
      neighbors: [
        { row: rowIndex - 1, col: colIndex },     // top
        { row: rowIndex, col: colIndex - 1 },     // left
      ],
      corner: 'topLeft'
    },
    { 
      neighbors: [
        { row: rowIndex - 1, col: colIndex },     // top
        { row: rowIndex, col: colIndex + 1 },     // right
      ],
      corner: 'topRight'
    },
    { 
      neighbors: [
        { row: rowIndex + 1, col: colIndex },     // bottom
        { row: rowIndex, col: colIndex + 1 },     // right
      ],
      corner: 'bottomRight'
    },
    { 
      neighbors: [
        { row: rowIndex + 1, col: colIndex },     // bottom
        { row: rowIndex, col: colIndex - 1 },     // left
      ],
      corner: 'bottomLeft'
    }
  ];

  for (const check of adjacentChecks) {
    // For a corner to be rounded, BOTH adjacent sides must have different tiles
    // Example: for top-left corner, both TOP and LEFT neighbors must be different
    const allNeighborsDifferent = check.neighbors.every(neighbor => {
      const neighborType = tileTypes[neighbor.row]?.[neighbor.col] || 'd'; // default to dirt if out of bounds
      return neighborType !== tileType;
    });
    
    roundedCorners[check.corner] = allNeighborsDifferent;
  }
  
  return roundedCorners;
}

// Get CSS color for a tile type
function getTileColor(tileType) {
  const tileColors = {
    g: '#67c257', // grass
    s: '#8b989c', // stone
    d: '#c0834a', // dirt
    w: '#58cad8', // water
    l: '#c4583d', // lava
    p: '#c5a85d', // pavement
    n: '#fbde00', // natural
    o: '#ffffff', // other
    unknown: '#ff0000', // debug red
  };
  return tileColors[tileType] || tileColors.unknown;
}

// Calculate corner background color based on adjacent tiles
function calculateCornerColor(tileType, corner, rowIndex, colIndex, tileTypes) {
  let adjacentTiles = [];
  
  switch (corner) {
    case 'topLeft':
      adjacentTiles = [
        tileTypes[rowIndex - 1]?.[colIndex] || 'd',     // top
        tileTypes[rowIndex]?.[colIndex - 1] || 'd',     // left
        tileTypes[rowIndex - 1]?.[colIndex - 1] || 'd', // diagonal
      ];
      break;
    case 'topRight':
      adjacentTiles = [
        tileTypes[rowIndex - 1]?.[colIndex] || 'd',     // top
        tileTypes[rowIndex]?.[colIndex + 1] || 'd',     // right
        tileTypes[rowIndex - 1]?.[colIndex + 1] || 'd', // diagonal
      ];
      break;
    case 'bottomRight':
      adjacentTiles = [
        tileTypes[rowIndex + 1]?.[colIndex] || 'd',     // bottom
        tileTypes[rowIndex]?.[colIndex + 1] || 'd',     // right
        tileTypes[rowIndex + 1]?.[colIndex + 1] || 'd', // diagonal
      ];
      break;
    case 'bottomLeft':
      adjacentTiles = [
        tileTypes[rowIndex + 1]?.[colIndex] || 'd',     // bottom
        tileTypes[rowIndex]?.[colIndex - 1] || 'd',     // left
        tileTypes[rowIndex + 1]?.[colIndex - 1] || 'd', // diagonal
      ];
      break;
  }
  
  // Remove the current tile type from consideration
  adjacentTiles = adjacentTiles.filter(type => type !== tileType);
  
  // If all adjacent tiles are the same type, use that color
  if (adjacentTiles.length > 0 && adjacentTiles.every(type => type === adjacentTiles[0])) {
    return getTileColor(adjacentTiles[0]);
  }
  
  // If there are different adjacent tiles (mixed colors), default to the tile's own color
  // This effectively creates no corner rounding by matching the main tile color
  if (adjacentTiles.length > 1) {
    const uniqueTypes = [...new Set(adjacentTiles)];
    if (uniqueTypes.length > 1) {
      return getTileColor(tileType);
    }
  }
  
  // If only one adjacent tile type, use priority system
  const priorityOrder = ['w', 'l', 's', 'd', 'g', 'p', 'n', 'o'];
  
  for (const priorityType of priorityOrder) {
    if (adjacentTiles.includes(priorityType)) {
      return getTileColor(priorityType);
    }
  }
  
  // Fallback to dirt if no adjacent tiles found
  return getTileColor('d');
}

// Generate CSS border-radius for rounded corners
function generateBorderRadius(roundedCorners) {
  if (!roundedCorners) {
    return '0';
  }
  
  const baseRadius = '8px'; // Base radius for corners
  const extendedRadius = '12px'; // Extended radius for natural variations
  
  // Determine if corners should have extended dirt penetration
  const topLeftExtended = roundedCorners.topLeft && roundedCorners.topRight;
  const topRightExtended = roundedCorners.topRight && roundedCorners.bottomRight;
  const bottomRightExtended = roundedCorners.bottomRight && roundedCorners.bottomLeft;
  const bottomLeftExtended = roundedCorners.bottomLeft && roundedCorners.topLeft;
  
  // Build border-radius string: top-left top-right bottom-right bottom-left
  const corners = [
    roundedCorners.topLeft ? (topLeftExtended ? extendedRadius : baseRadius) : '0',
    roundedCorners.topRight ? (topRightExtended ? extendedRadius : baseRadius) : '0', 
    roundedCorners.bottomRight ? (bottomRightExtended ? extendedRadius : baseRadius) : '0',
    roundedCorners.bottomLeft ? (bottomLeftExtended ? extendedRadius : baseRadius) : '0'
  ];
  
  return corners.join(' ');
}

// Render individual tile with proper layering
export const RenderTile = ({ tileType, rowIndex, colIndex, tileTypes, TILE_SIZE, handleTileClick }) => {
  const tileClass = `tile-${tileType}`;
  const key = `${colIndex}-${rowIndex}`;
  
  // Calculate rounded corners for this tile
  const roundedCorners = calculateRoundedCorners(tileType, rowIndex, colIndex, tileTypes);
  const borderRadius = generateBorderRadius(roundedCorners);

  return (
    <div
      key={key}
      onClick={() => handleTileClick(rowIndex, colIndex)}
      style={{
        position: 'absolute',
        top: rowIndex * TILE_SIZE,
        left: colIndex * TILE_SIZE,
        width: TILE_SIZE,
        height: TILE_SIZE,
        cursor: 'pointer',
        zIndex: 1, // Tiles are lowest layer
        overflow: 'hidden',
      }}
    >
      {/* Corner background layers - individual colors based on adjacent tiles */}
      {roundedCorners && (
        <>
          {/* Top-left corner */}
          {roundedCorners.topLeft && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '50%',
                height: '50%',
                backgroundColor: calculateCornerColor(tileType, 'topLeft', rowIndex, colIndex, tileTypes),
                zIndex: 1,
              }}
            />
          )}
          
          {/* Top-right corner */}
          {roundedCorners.topRight && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: '50%',
                height: '50%',
                backgroundColor: calculateCornerColor(tileType, 'topRight', rowIndex, colIndex, tileTypes),
                zIndex: 1,
              }}
            />
          )}
          
          {/* Bottom-right corner */}
          {roundedCorners.bottomRight && (
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: '50%',
                height: '50%',
                backgroundColor: calculateCornerColor(tileType, 'bottomRight', rowIndex, colIndex, tileTypes),
                zIndex: 1,
              }}
            />
          )}
          
          {/* Bottom-left corner */}
          {roundedCorners.bottomLeft && (
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                width: '50%',
                height: '50%',
                backgroundColor: calculateCornerColor(tileType, 'bottomLeft', rowIndex, colIndex, tileTypes),
                zIndex: 1,
              }}
            />
          )}
        </>
      )}
      
      {/* Actual tile with proper color and rounded corners */}
      <div
        className={tileClass}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          borderRadius: borderRadius,
          zIndex: 2,
        }}
      />
      
      {/* Organic grass tufts overlay for grass tiles */}
      {tileType === 'g' && (() => {
        // Create per-tile randomness using coordinates as seed
        const seed = (rowIndex * 73 + colIndex * 37) % 1000;
        const tufts = [];
        
        // Generate 3-5 grass tufts per tile with organic distribution
        const numTufts = 3 + (seed % 3); // 3-5 tufts
        
        for (let i = 0; i < numTufts; i++) {
          const tuftSeed = (seed + i * 127) % 1000;
          const x = 10 + (tuftSeed * 0.73) % 80; // 10-90% across tile
          const y = 20 + (tuftSeed * 1.19) % 60; // 20-80% down tile
          const size = Math.max(1, TILE_SIZE * 0.08 + (tuftSeed * 0.01) % (TILE_SIZE * 0.04)); // Scale with tile size
          const opacity = 0.15 + (tuftSeed * 0.01) % 0.1; // 0.15-0.25 opacity
          
          // Use darker green for most tufts
          let color = `rgba(0, 50, 0, ${opacity})`;
          
          tufts.push(
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${x}%`,
                top: `${y}%`,
                width: `${size}px`,
                height: `${size}px`, // Square base for irregular shape
                backgroundColor: color,
                clipPath: 'polygon(30% 100%, 0% 80%, 10% 60%, 0% 40%, 15% 20%, 40% 30%, 60% 10%, 80% 30%, 100% 50%, 85% 80%, 70% 100%)', // Irregular grass clump
                transform: `rotate(${(tuftSeed * 0.5) % 60 - 30}deg)`, // More rotation variation
                pointerEvents: 'none',
              }}
            />
          );
        }
        
        // Add occasional lighter green clump (every ~4-6 tiles)
        if (seed % 5 === 0) {
          const lightSeed = (seed * 1.41) % 1000;
          const lightX = 15 + (lightSeed * 0.83) % 70;
          const lightY = 25 + (lightSeed * 1.37) % 50;
          const lightSize = Math.max(2, TILE_SIZE * 0.12 + (lightSeed * 0.01) % (TILE_SIZE * 0.04));
          
          tufts.push(
            <div
              key="light"
              style={{
                position: 'absolute',
                left: `${lightX}%`,
                top: `${lightY}%`,
                width: `${lightSize}px`,
                height: `${lightSize}px`,
                backgroundColor: `rgba(220, 220, 40, 0.6)`, // Brighter yellow, more opaque
                clipPath: 'polygon(30% 100%, 0% 80%, 10% 60%, 0% 40%, 15% 20%, 40% 30%, 60% 10%, 80% 30%, 100% 50%, 85% 80%, 70% 100%)',
                transform: `rotate(${(lightSeed * 0.7) % 60 - 30}deg)`,
                pointerEvents: 'none',
              }}
            />
          );
        }
        
        return (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              borderRadius: borderRadius,
              zIndex: 3,
              pointerEvents: 'none',
              overflow: 'hidden',
            }}
          >
            {tufts}
          </div>
        );
      })()}
      
      {/* Organic dirt texture effect for dirt tiles */}
      {tileType === 'd' && (() => {
        // Create per-tile randomness using coordinates as seed
        const seed = (rowIndex * 89 + colIndex * 43) % 1000;
        const patches = [];
        
        // Generate 4-7 dirt patches per tile with organic distribution
        const numPatches = 4 + (seed % 4); // 4-7 patches
        
        for (let i = 0; i < numPatches; i++) {
          const patchSeed = (seed + i * 139) % 1000;
          const x = 5 + (patchSeed * 0.91) % 90; // 5-95% across tile
          const y = 5 + (patchSeed * 1.23) % 90; // 5-95% down tile
          const size = Math.max(1, TILE_SIZE * 0.06 + (patchSeed * 0.01) % (TILE_SIZE * 0.03)); // Smaller than grass tufts
          const opacity = 0.12 + (patchSeed * 0.01) % 0.08; // 0.12-0.20 opacity
          
          patches.push(
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${x}%`,
                top: `${y}%`,
                width: `${size * 2}px`, // Wider for crack-like shape
                height: `${size * 0.5}px`, // Thinner for crack-like shape
                backgroundColor: `rgba(80, 50, 30, ${opacity})`, // Darker brown cracks
                borderRadius: '2px', // Slightly rounded for natural look
                transform: `rotate(${(patchSeed * 0.7) % 180}deg) scale(${0.8 + (patchSeed * 0.001) % 0.4})`, // Random rotation for crack direction
                pointerEvents: 'none',
              }}
            />
          );
        }
        
        // Add occasional lighter dirt patch (every ~6 tiles)
        if (seed % 6 === 0) {
          const lightSeed = (seed * 1.61) % 1000;
          const lightX = 10 + (lightSeed * 0.79) % 80;
          const lightY = 10 + (lightSeed * 1.47) % 80;
          const lightSize = Math.max(1, TILE_SIZE * 0.08 + (lightSeed * 0.01) % (TILE_SIZE * 0.02));
          
          patches.push(
            <div
              key="light"
              style={{
                position: 'absolute',
                left: `${lightX}%`,
                top: `${lightY}%`,
                width: `${lightSize}px`,
                height: `${lightSize}px`,
                backgroundColor: `rgba(160, 130, 90, 0.25)`, // Lighter sandy spot
                borderRadius: '50%',
                pointerEvents: 'none',
              }}
            />
          );
        }
        
        return (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              borderRadius: borderRadius,
              zIndex: 3,
              pointerEvents: 'none',
              overflow: 'hidden',
            }}
          >
            {patches}
          </div>
        );
      })()}
    </div>
  );
};

// Render all tiles in the grid
export const RenderTiles = ({ grid, tileTypes, TILE_SIZE, handleTileClick }) => {
  return grid.map((row, rowIndex) =>
    row.map((tile, colIndex) => {
      const tileType = tileTypes[rowIndex]?.[colIndex] || 'unknown';
      
      return (
        <RenderTile
          key={`tile-${rowIndex}-${colIndex}`}
          tileType={tileType}
          rowIndex={rowIndex}
          colIndex={colIndex}
          tileTypes={tileTypes}
          TILE_SIZE={TILE_SIZE}
          handleTileClick={handleTileClick}
        />
      );
    })
  );
};